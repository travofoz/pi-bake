/**
 * Async spawn utility — wraps child_process.spawn in a Promise.
 *
 * Never blocks the event loop. Returns { stdout, stderr, status, signal }.
 * Non-zero exit is NOT an error — the promise resolves with the status code.
 * Rejects only on spawn failure (command not found, permission denied, maxBuffer exceeded).
 */

import { spawn } from "node:child_process";

export interface SpawnResult {
	stdout: string;
	stderr: string;
	status: number | null;
	signal: string | null;
}

export interface SpawnOptions {
	cwd?: string;
	timeout?: number; // ms
	maxBuffer?: number; // bytes (default 10MB)
	env?: Record<string, string>;
}

/**
 * Spawn a process and collect stdout/stderr.
 *
 * @param command - executable name or path
 * @param args - command arguments
 * @param options - optional cwd, timeout, maxBuffer, env
 * @returns Promise<SpawnResult>
 */
export function spawnAsync(
	command: string,
	args: string[],
	options?: SpawnOptions,
): Promise<SpawnResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe"],
			cwd: options?.cwd,
			env: options?.env,
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const maxBuf = options?.maxBuffer ?? 10 * 1024 * 1024;

		const timer = options?.timeout
			? setTimeout(() => {
					timedOut = true;
					child.kill("SIGTERM");
				}, options.timeout)
			: undefined;

		child.stdout?.on("data", (d: Buffer) => {
			const chunk = d.toString("utf-8");
			if (Buffer.byteLength(stdout, "utf-8") + Buffer.byteLength(chunk, "utf-8") > maxBuf) {
				timedOut = true;
				child.kill("SIGTERM");
				reject(new Error(`maxBuffer (${maxBuf}) exceeded for ${command} ${args.join(" ")}`));
				return;
			}
			stdout += chunk;
		});

		child.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString("utf-8");
		});

		child.on("error", (err: Error) => {
			clearTimeout(timer);
			reject(err);
		});

		child.on("close", (status, signal) => {
			clearTimeout(timer);
			if (timedOut) {
				reject(new Error(`Timed out after ${options?.timeout ?? "unknown"}ms: ${command} ${args.join(" ")}`));
				return;
			}
			resolve({ stdout, stderr, status, signal });
		});
	});
}
