/**
 * bake-machine — XState v5 orchestration for the bake pipeline.
 *
 * Two typed machines using setup() + createMachine:
 *
 *   PhaseMachine — per-phase: executor → parallel audit → remediate → loop
 *     input:  { spec: PhaseSpec }
 *     output: PhaseResult  { passed, attempts, findings }
 *
 *   BakeMachine  — parent DAG: idle → running → done | failed
 *     spawns PhaseMachine children per ready batch
 *
 * ─── Integration ──────────────────────────────────────────────────
 *
 *   Bake.runPipeline() calls runBakePipeline() which:
 *     1. Creates the BakeMachine
 *     2. createActor → start → send START
 *     3. waitFor(done|failed) → returns { passed, results }
 *     4. Bake maps results → BakeState for UI
 *
 * ─── Hierarchy ────────────────────────────────────────────────────
 *
 *   IDLE ──START──▶ RUNNING
 *                    │  batch loop:
 *                    │    computeReady() → spawnChild(PhaseMachine)
 *                    │    waitFor() each → aggregate
 *                    │    any fail → return false, parent→failed
 *                    │  all pass → return true, parent→done
 *                    │
 *                    │  PhaseMachine states:
 *                    │    EXECUTING
 *                    │    AUDITING (parallel)
 *                    │      ├─ structural (ast-grep)
 *                    │      └─ semantic (LLM)
 *                    │    REMEDIATING ──▶ loop
 *                    │    COMPLETED / FAILED (final, output: PhaseResult)
 */

import {
	setup,
	createMachine,
	createActor,
	fromPromise,
	waitFor,
	type ActorRefFrom,
} from "xstate";
import type { PhaseSpec, AuditFinding } from "./bake.ts";
import { EventLog } from "./event-log.ts";
import { runExecutor, type ExecutorDeps, type ExecutorResult } from "./bake-executor.ts";
import { runStructuralAudit } from "./auditor.ts";
import { runSemanticAudit, runRemediation } from "./bake-audit.ts";

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Internal types (not exported; BakePhaseResult wraps these) ──────

export interface PhaseResult {
	phase: string;
	passed: boolean | "paused";
	attempts: number;
	findings: AuditFinding[];
}

export interface BakeEnv {
	workspaceDir: string;
	rulesDir: string;
	completedDir: string;
	rpcAgent: { newSession: () => Promise<void> };
	getEnabledRules: () => Set<string> | undefined;
	onStatus: (msg: string) => void;
	onLoader: (show: boolean, msg: string) => void;
	log: EventLog;
	pendingSteer: () => string | null;
	maxAttempts: number;
	/**
	 * Called after each batch completes with the current progress.
	 * Bake uses this to update BakeState for the UI widget.
	 */
	onProgress?: (completed: number, total: number, active: string[]) => void;
}

// ─── Phase Machine ───────────────────────────────────────────────────

/**
 * Build a typed, ready-to-run PhaseMachine with all actors wired via closure.
 * input: { spec: PhaseSpec }
 * output: PhaseResult
 */
function phaseMachine(env: BakeEnv) {
	return setup({
		types: {} as {
			input: { spec: PhaseSpec };
			context: {
				spec: PhaseSpec;
				attempt: number;
				maxAttempts: number;
				findings: AuditFinding[];
				concerns: string[];
				blockReason: string | null;
			};
			events:
				| { type: "ABORT" }
				| { type: "PROVIDE_CONTEXT"; info: string };
			output: PhaseResult;
			actors: {
				execute: ReturnType<typeof fromPromise<ExecutorResult, { spec: PhaseSpec; attempt: number; steer: string | null }>>;
				structural: ReturnType<typeof fromPromise<AuditFinding[], {}>>;
				semantic: ReturnType<typeof fromPromise<AuditFinding[], {}>>;
				remediate: ReturnType<typeof fromPromise<boolean, { spec: PhaseSpec; findings: AuditFinding[]; attempt: number }>>;
			};
		},
	}).createMachine({
		id: "phase",
		initial: "executing",
		context: ({ input }) => ({
			spec: input.spec,
			attempt: 0,
			maxAttempts: env.maxAttempts,
			findings: [],
			concerns: [],
			blockReason: null,
		}),
		states: {
			executing: {
				invoke: {
					src: "execute",
					input: ({ context }) => ({
						spec: context.spec,
						attempt: context.attempt,
						steer: env.pendingSteer(),
					}),
					onDone: [
						{
							guard: ({ event }) => event.output.status === "BLOCKED",
							target: "failed",
							actions: ({ context, event }) => {
								context.blockReason = event.output.blockReason ?? "No reason given";
								env.log.append("executor_blocked", {
									phase: context.spec.phaseId,
									reason: context.blockReason,
								});
							},
						},
						{
							guard: ({ event }) => event.output.status === "NEEDS_CONTEXT",
							target: "contextWait",
							actions: ({ context, event }) => {
								context.blockReason = event.output.blockReason ?? "No details given";
								env.log.append("executor_needs_context", {
									phase: context.spec.phaseId,
									reason: context.blockReason,
								});
							},
						},
						{
							// DONE or DONE_WITH_CONCERNS → auditing
							target: "auditing",
							actions: ({ context, event }) => {
								if (event.output.status === "DONE_WITH_CONCERNS" && event.output.concerns) {
									context.concerns = event.output.concerns;
									env.log.append("executor_concerns", {
										phase: context.spec.phaseId,
										concerns: event.output.concerns,
									});
								}
							},
						},
					],
					onError: {
						target: "remediating",
						actions: ({ context }) => { context.attempt++; },
					},
				},
			},

			/** Operator needs to provide info to unblock this phase. */
			contextWait: {
				on: {
					PROVIDE_CONTEXT: {
						target: "executing",
						actions: ({ context, event }) => {
							context.blockReason = null;
							env.pendingSteer = () => event.info;
						},
					},
					ABORT: { target: "failed" },
				},
			},

			auditing: {
				type: "parallel",
				states: {
					structural: {
						initial: "running",
						states: {
							running: {
								invoke: {
									src: "structural",
									onDone: [
										{ guard: ({ event }) => event.output.length === 0, target: "pass" },
										{ target: "fail", actions: ({ context, event }) => { context.findings.push(...event.output); } },
									],
									onError: { target: "fail" },
								},
							},
							pass: { type: "final" },
							fail: { type: "final" },
						},
					},
					semantic: {
						initial: "running",
						states: {
							running: {
								invoke: {
									src: "semantic",
									onDone: [
										{ guard: ({ event }) => event.output.length === 0, target: "pass" },
										{ target: "fail", actions: ({ context, event }) => { context.findings.push(...event.output); } },
									],
									onError: { target: "fail" },
								},
							},
							pass: { type: "final" },
							fail: { type: "final" },
						},
					},
				},
				onDone: [
					{ guard: ({ context }) => context.findings.length === 0, target: "completed" },
					{ target: "remediating" },
				],
			},

			remediating: {
				invoke: {
					src: "remediate",
					input: ({ context }) => ({
						spec: context.spec,
						findings: context.findings,
						attempt: context.attempt,
					}),
					onDone: [
						{
							guard: ({ event }) => event.output === true,
							target: "executing",
							actions: ({ context }) => {
								context.attempt++;
								context.findings = [];
							},
						},
						{ target: "failed" },
					],
					onError: { target: "failed" },
				},
			},

			completed: {
				type: "final",
				output: ({ context }) => ({
					phase: context.spec.phaseId,
					passed: true as const,
					attempts: context.attempt + 1,
					findings: context.findings,
				}),
			},
			failed: {
				type: "final",
				output: ({ context }) => ({
					phase: context.spec.phaseId,
					passed: false as const,
					attempts: context.attempt + 1,
					findings: context.findings,
				}),
			},
		},
	});
}

/** Wire concrete actor implementations into a phase machine. */
function wirePhaseMachine(pm: ReturnType<typeof phaseMachine>, env: BakeEnv) {
	return pm.provide({
		actors: {
			execute: fromPromise<ExecutorResult, { spec: PhaseSpec; attempt: number; steer: string | null }>(
				async ({ input }) => runExecutor(input.spec, input.attempt, input.steer, {
					workspaceDir: env.workspaceDir,
					rpcAgent: env.rpcAgent,
					log: env.log,
					onStatus: env.onStatus,
					onLoader: env.onLoader,
				}),
			),
			structural: fromPromise<AuditFinding[]>(
				async () => runStructuralAudit(env.workspaceDir, env.rulesDir, env.getEnabledRules()),
			),
			semantic: fromPromise<AuditFinding[]>(
				async () => runSemanticAudit({
					workspaceDir: env.workspaceDir,
					rpcAgent: env.rpcAgent,
					onStatus: env.onStatus,
					onLoader: env.onLoader,
					log: env.log,
				}),
			),
			remediate: fromPromise<boolean, { spec: PhaseSpec; findings: AuditFinding[]; attempt: number }>(
				async ({ input }) => runRemediation(
					input.spec,
					input.findings,
					input.attempt,
					env.maxAttempts,
					{
						workspaceDir: env.workspaceDir,
						rpcAgent: env.rpcAgent,
						log: env.log,
						onStatus: env.onStatus,
						onLoader: env.onLoader,
					},
				),
			),
		},
	});
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Run the full DAG pipeline with XState orchestration.
 *
 * Steps:
 *   1. Build PhaseMachine with wired actors
 *   2. Build a fromPromise actor that runs the DAG batch loop
 *   3. Create/spawn parent BakeMachine with the DAG actor
 *   4. waitFor() terminal state, return aggregate results
 */
export async function runBakePipeline(
	phases: PhaseSpec[],
	env: BakeEnv,
): Promise<{ passed: boolean; results: Record<string, PhaseResult> }> {
	const phaseSpecs = new Map(phases.map((p) => [p.phaseId, p]));
	const completedMap: Record<string, PhaseResult> = {};

	// Build and wire the phase machine
	const rawPm = phaseMachine(env);
	const pmWired = wirePhaseMachine(rawPm, env);

	// ── DAG scheduler actor ──
	const dagScheduler = fromPromise<boolean>(async ({ spawnChild }) => {
		const skipped = new Set<string>();

		const isReady = (phaseId: string): boolean => {
			if (completedMap[phaseId] || skipped.has(phaseId)) return false;
			const p = phaseSpecs.get(phaseId)!;
			return p.dependsOn.every((d) => completedMap[d] || skipped.has(d));
		};

		const allDone = (): boolean =>
			phases.every((p) => completedMap[p.phaseId] || skipped.has(p.phaseId));

		while (!allDone()) {
			const ready = phases.filter(isReady);
			if (ready.length === 0) {
				const stuck = phases.filter((p) => !completedMap[p.phaseId] && !skipped.has(p.phaseId));
				env.log.append("dag_deadlock", { phases: stuck.map((p) => p.phaseId) });
				return false;
			}

			env.onStatus?.(`Active: ${ready.map((p) => p.name).join(", ")}`);

			// Spawn child phase machines
			const children: ActorRefFrom<any>[] = ready.map((r) =>
				spawnChild(pmWired, { input: { spec: r } }),
			);

			// Wait for all to reach final state
			const batchResults = await Promise.allSettled(
				children.map((c) =>
					waitFor(c, (s) => s.status === "done").then((s) => s.output as PhaseResult),
				),
			);

			// Aggregate
			let batchFailed = false;
			for (let i = 0; i < batchResults.length; i++) {
				const r = batchResults[i];
				const p = ready[i];
				if (r.status === "rejected") {
					completedMap[p.phaseId] = { phase: p.phaseId, passed: false, attempts: 0, findings: [] };
					batchFailed = true;
					env.log.append("phase_crash", { phase: p.phaseId, error: String(r.reason) });
				} else {
					const result = r.value;
					completedMap[p.phaseId] = result;
					if (result.passed === true) {
						env.log.append("phase_pass", { phase: p.phaseId });
						archivePhaseFile(p, env.completedDir);
					} else {
						batchFailed = true;
						env.log.append("phase_fail", { phase: p.phaseId, attempts: result.attempts });
					}
				}
			}

			// Notify parent of progress
			const doneCount = Object.keys(completedMap).length;
			env.onProgress?.(doneCount, phases.length, ready.map((r) => r.name));

			if (batchFailed) return false;
		}

		return true;
	});

	// ── Parent machine ──
	const parentMachine = createMachine({
		id: "bake",
		initial: "idle",
		context: { phases, completed: completedMap },
		states: {
			idle: { on: { START: "running" } },
			running: {
				invoke: { src: "dagScheduler" },
				onDone: { target: "done" },
				onError: { target: "failed" },
			},
			done: { type: "final" },
			failed: { type: "final" },
		},
	}).provide({
		actors: { dagScheduler },
	});

	// ── Run ──
	const actor = createActor(parentMachine);
	actor.start();
	actor.send({ type: "START" });

	const finalState = await waitFor(
		actor,
		(state) => state.matches("done") || state.matches("failed"),
	);

	const passed = finalState.matches("done");
	actor.stop();

	return { passed, results: completedMap };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function archivePhaseFile(spec: PhaseSpec, completedDir: string): void {
	const dest = path.join(completedDir, `${spec.phaseId}_PASS.md`);
	try {
		fs.copyFileSync(spec.filePath, dest);
		fs.unlinkSync(spec.filePath);
	} catch {
		/* race: already archived by sibling */
	}
}
