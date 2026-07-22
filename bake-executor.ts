/**
 * Executor — runs a phase specification through the RPC agent.
 *
 * Extracted from Bake.runExecutor() for module separation.
 * Takes all dependencies explicitly — no hidden state.
 *
 * Returns structured status codes from the agent's output:
 *   DONE               — completed successfully
 *   DONE_WITH_CONCERNS — completed, but surface concerns before audit
 *   NEEDS_CONTEXT      — blocked waiting for info from operator
 *   BLOCKED            — cannot proceed, unrecoverable
 */

import type { RpcAgent } from "./rpc-agent.ts";
import type { EventLog } from "./event-log.ts";
import type { PhaseSpec } from "./bake.ts";

export interface ExecutorDeps {
	workspaceDir: string;
	rpcAgent: RpcAgent;
	log: EventLog;
	onStatus: (msg: string) => void;
	onLoader: (show: boolean, msg: string) => void;
}

export interface ExecutorResult {
	status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";
	output: string;
	concerns?: string[];
	blockReason?: string;
}

/**
 * Parse the last 500 chars of executor output for STATUS: <code>.
 * Returns BLOCKED if no explicit status found — fails loud so LLM
 * format drift is visible, never silently passes.
 */
function parseStatus(output: string): ExecutorResult {
	const tail = output.slice(-500);
	const m = tail.match(/STATUS:\s*(DONE(?:_WITH_CONCERNS)?|NEEDS_CONTEXT|BLOCKED)/);

	if (m) {
		const status = m[1] as ExecutorResult["status"];

		// Parse concerns for DONE_WITH_CONCERNS
		let concerns: string[] | undefined;
		if (status === "DONE_WITH_CONCERNS") {
			const cm = tail.match(/## Concerns\s*\n([\s\S]*?)(?=\n##|$)/);
			if (cm) {
				concerns = cm[1]
					.split("\n")
					.map((l) => l.replace(/^[-*\s]+/, "").trim())
					.filter(Boolean);
			}
		}

		// Parse block reason for BLOCKED
		let blockReason: string | undefined;
		if (status === "BLOCKED" || status === "NEEDS_CONTEXT") {
			const rm = tail.match(/## (?:Reason|Needs)\s*\n([\s\S]*?)(?=\n##|$)/);
			if (rm) blockReason = rm[1].trim();
		}

		return { status, output, concerns, blockReason };
	}

	// No explicit status — fail loud so LLM format drift is visible
	if (output.length >= 50) {
		return { status: "BLOCKED", output, blockReason: "No STATUS: line found in executor output (≥50 chars with no explicit status code)" };
	}
	return { status: "BLOCKED", output, blockReason: "No status reported and output too short" };
}

/**
 * Run a single executor pass: invoke pi via RPC with the phase spec +
 * remediation history + optional steering guidance.
 *
 * The prompt instructs the model to output STATUS: <code> on its own line.
 */
export async function runExecutor(
	phase: PhaseSpec,
	currentAttempt: number,
	pendingSteer: string | null,
	deps: ExecutorDeps,
): Promise<ExecutorResult> {
	const steerNote = pendingSteer
		? `\n\n## Steering Guidance (from operator)\n\n${pendingSteer}`
		: "";

	const attemptNote =
		currentAttempt > 0
			? `\n\n## Remediation Attempt ${currentAttempt}\n\nThis is a remediation cycle. Fix the issues identified in previous audits. Read the audit findings and address each one specifically.`
			: "";

	const planBlock = phase.planSteps.length > 0
		? `\n\n## Implementation Plan\n\nFollow these ordered steps:\n${phase.planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nWork through each step in order. After each step, commit with git (git add . && git commit -m 'step N: ...').`
		: "";

	const statusBlock = `\n\n## Status Report\n\nAfter completing all steps, report STATUS on its own line:\n\nSTATUS: DONE — if all tasks complete and verified\nSTATUS: DONE_WITH_CONCERNS — if done but something is worth surfacing\nSTATUS: NEEDS_CONTEXT — if you need clarification or additional information\nSTATUS: BLOCKED — if you cannot proceed\n\nFor DONE_WITH_CONCERNS, add a ## Concerns section listing each concern.\nFor NEEDS_CONTEXT or BLOCKED, add ## Reason explaining what's needed.`;

	const prompt = `Execute the implementation plan for the project at ${deps.workspaceDir}. Work through each step in order. After each step, commit with git. When complete, verify with the project's build/lint/test commands.\n\nYou have ast-grep (sg) available for structural code search and verification. Use it to find code patterns, verify your changes, and catch issues before committing.\n\n## Specification\n${phase.content}${planBlock}${attemptNote}${steerNote}${statusBlock}`;

	deps.onStatus?.(`Executor: ${phase.name} (attempt ${currentAttempt + 1})`);
	deps.onLoader?.(true, `Executor: ${phase.name} (attempt ${currentAttempt + 1})`);

	try {
		// Fresh context for this executor run
		await deps.rpcAgent.newSession();

		let previewBuf = "";
		let lastStatusUpdate = 0;
		const output = await deps.rpcAgent.prompt(prompt, (delta) => {
			previewBuf += delta;
			const now = Date.now();
			if (now - lastStatusUpdate > 300) {
				lastStatusUpdate = now;
				const preview = previewBuf.trimEnd().slice(-80).replace(/\n/g, " ");
				deps.onStatus?.(`Executor: ${phase.name}  ➜ ${preview}`);
			}
		});

		const result = parseStatus(output);

		deps.log.append("executor_complete", {
			status: result.status,
			outputLength: output.length,
			concerns: result.concerns?.length ?? 0,
		});

		return result;
	} catch (err: any) {
		deps.log.append("executor_crash", { error: err.message });
		return { status: "BLOCKED", output: "", blockReason: err.message };
	}
}
