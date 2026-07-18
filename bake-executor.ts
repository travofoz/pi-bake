/**
 * Executor — runs a phase specification through the RPC agent.
 *
 * Extracted from Bake.runExecutor() for module separation.
 * Takes all dependencies explicitly — no hidden state.
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

/**
 * Run a single executor pass: invoke pi via RPC with the phase spec +
 * remediation history + optional steering guidance.
 *
 * @returns true if the executor completed (even with issues), false on crash/timeout.
 */
export async function runExecutor(
	phase: PhaseSpec,
	currentAttempt: number,
	pendingSteer: string | null,
	deps: ExecutorDeps,
): Promise<boolean> {
	const steerNote = pendingSteer
		? `\n\n## Steering Guidance (from operator)\n\n${pendingSteer}`
		: "";

	const attemptNote =
		currentAttempt > 0
			? `\n\n## Remediation Attempt ${currentAttempt}\n\nThis is a remediation cycle. Fix the issues identified in previous audits. Read the audit findings and address each one specifically.`
			: "";

	const prompt = `Execute the instructions in this specification file for the project at ${deps.workspaceDir}. Work through the task checklist. After each task, commit with git. When complete, verify with the project's build/lint/test commands.\n\nYou have ast-grep (sg) available for structural code search and verification. Use it to find code patterns, verify your changes, and catch issues before committing. For example: sg -p 'console.log($$$)' . to find debug logging.\n\n${phase.content}${attemptNote}${steerNote}`;

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

		deps.log.append("executor_complete", {
			outputLength: output.length,
		});

		return true;
	} catch (err: any) {
		deps.log.append("executor_crash", { error: err.message });
		return false;
	}
}
