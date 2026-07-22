/**
 * Hybrid auditor: ast-grep for structural checks + LLM for semantic checks.
 *
 * Structural checks run first (deterministic, ~50ms).
 * Semantic checks (structured checklist) run only if structural passes.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnAsync } from "./spawn-async.ts";

export interface AuditFinding {
	check: number;
	detail: string;
	rule?: string;
	source: "ast-grep" | "llm";
}

export interface AuditResult {
	passed: boolean;
	findings: AuditFinding[];
}

/**
 * Run ast-grep structural checks against the workspace.
 * @param workspacePath - path to the project being audited
 * @param rulesDir - path to the rules directory (base/ subdir will be checked)
 * @param enabledRules - optional set of rule filenames to run; all run if omitted
 * Returns findings for any violations.
 */
/**
 * @param onInfraWarning - optional callback for infrastructure warnings (sg missing, etc.)
 */
export async function runStructuralAudit(
	workspacePath: string,
	rulesDir: string,
	enabledRules?: Set<string>,
	onInfraWarning?: (msg: string) => void,
): Promise<AuditFinding[]> {
	const baseDir = path.join(rulesDir, "base");
	if (!fs.existsSync(baseDir)) return [];

	const findings: AuditFinding[] = [];
	const allRules = fs.readdirSync(baseDir).filter((f) => f.endsWith(".yml"));
	// If enabledRules provided, only run those; otherwise run all
	const rules = enabledRules
		? allRules.filter((f) => enabledRules.has(f))
		: allRules;

	for (const ruleFile of rules) {
		const rulePath = path.join(baseDir, ruleFile);
		try {
			const result = await spawnAsync(
				"sg",
				["scan", "-r", rulePath, workspacePath],
				{
					timeout: 30000,
				},
			);
			// sg exits 0 when no violations, exits non-zero when it finds issues
			// Either way, stdout contains the match output
			const output = result.stdout || result.stderr || "";
			const lines = output
				.trim()
				.split("\n")
				.filter((l) => l.startsWith("  "));
			if (lines.length > 0) {
				findings.push({
					check: 0,
					detail: `${ruleFile.replace(".yml", "")}:\n${lines.join("\n")}`,
					rule: ruleFile,
					source: "ast-grep",
				});
			}
		} catch {
			// Spawn failed (command not found, permission denied, timeout).
			// This is an infrastructure issue, not a code finding — skip the rule
			// and continue. The rule produces no findings when sg can't run.
			onInfraWarning?.(
				`sg scan failed for ${ruleFile} — is ast-grep installed?`,
			);
		}
	}

	return findings;
}

/**
 * Structured LLM audit prompt. Returns the prompt to send to the auditor sub-agent.
 * Model fills in PASS/FAIL per check and returns JSON.
 */
export function buildSemanticAuditPrompt(workspacePath: string): string {
	return `Audit the codebase at ${workspacePath} against these checks using your tools.

Output exactly one PASS or FAIL per line (8 lines), then RESULT: PASS or RESULT: ISSUES, then a JSON block with a "failures" array.

CHECKS:
1. Async operations check for component/object lifecycle state before mutating after await
2. Event listeners and subscriptions are cleaned up in destructor/dispose/onDestroy patterns
3. Error messages in catch blocks include context (not just re-thrown or swallowed without info)
4. Temporary URLs, file handles, or resources are properly released/revoked after use (deferred cleanup, not synchronous)
5. No placeholder/stub implementations (TODO, FIXME, pass, return null)
6. Error paths in async functions show meaningful error messages (not just re-thrown or swallowed)
7. No hardcoded secrets, tokens, or API keys in source
8. Exported functions have JSDoc or equivalent type annotations

For each FAIL, include the file path and what's wrong.`;
}

/**
 * Parse the LLM audit output into a structured result.
 */
export function parseSemanticAuditOutput(output: string): AuditResult {
	const findings: AuditFinding[] = [];

	// Extract the JSON failures block
	const jsonMatch = output.match(/\{[\s\S]*"failures"[\s\S]*\}/);
	if (jsonMatch) {
		try {
			const parsed = JSON.parse(jsonMatch[0]);
			if (parsed.failures && Array.isArray(parsed.failures)) {
				for (const f of parsed.failures) {
					findings.push({
						check: f.check || 0,
						detail: f.detail || "",
						source: "llm",
					});
				}
			}
		} catch {
			// JSON parse failed — fall back to line-by-line
		}
	}

	// If no JSON found, check for RESULT: ISSUES via line parsing
	if (findings.length === 0) {
		const lines = output.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("FAIL")) {
				// Extract check number and detail
				const checkMatch = trimmed.match(
					/^FAIL\s*(?:\*\*Check\s*(\d+)\*\*)?\s*[—\-–]?\s*(.*)/,
				);
				findings.push({
					check: checkMatch ? Number(checkMatch[1]) || 0 : 0,
					detail: checkMatch?.[2] || trimmed,
					source: "llm",
				});
			}
		}
	}

	const hasIssues =
		output.includes("RESULT: ISSUES") || output.includes("RESULT: FAIL");
	return {
		passed: !hasIssues && findings.length === 0,
		findings,
	};
}
