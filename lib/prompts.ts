/**
 * Prompt templates for LLM calls in the bake pipeline.
 *
 * Each function returns a fully-formed prompt string. Keeping these
 * separate keeps command handlers thin and prompts reviewable as data.
 */

const MAX_SPEC_LENGTH = 16000;

/**
 * Build the decompose prompt from a raw spec file content.
 * Truncates ultra-long specs to avoid LLM output truncation.
 */
export function buildDecomposePrompt(specContent: string): string {
	const truncated =
		specContent.length > MAX_SPEC_LENGTH
			? specContent.slice(0, MAX_SPEC_LENGTH) +
				"\n\n[... TRUNCATED: spec too large, keeping first ~16KB for reliable decomposition]"
			: specContent;

	return `You are decomposing a technical specification into discrete, actionable phases for an autonomous coding agent.

Output a valid JSON object with NO markdown wrapping, NO code fences, NO commentary before or after. Just raw JSON.

The JSON must match this TypeScript type exactly:
{
  "phases": Array<{ "id": string, "name": string, "summary": string, "done_when": string, "depends_on": string[], "plan": string[] }>,
  "context": string
}

Guidelines:
- "id" is unique and short (e.g., "02_wifi_state_machine")
- "name" is the human-readable display name (e.g., "WiFi State Machine")
- "summary" is a one-line objective
- "done_when" is the acceptance criteria (1-2 sentences)
- "depends_on" is an array of phase IDs that must complete before this phase starts. Empty array means no dependencies (can run immediately). Use this to express the build order — infrastructure phases have no deps, dependent features reference their prerequisites.
- "plan" is an array of concrete, ordered implementation steps for this phase. Each step should be a single actionable instruction the executor can follow. Example: ["Create src/wifi/wifi_state.h with enum for AP/STA states", "Implement state transition in wifi_state.cpp", "Add unit test for AP→STA transition"]
- "context" captures everything else: narrative, philosophy, out-of-scope items, operational notes, hardware constraints — anything that doesn't belong in a single phase
- Generate 6-15 phases depending on spec complexity. Group independent phases so they can run in parallel.
- If phases 2a and 2b don't depend on each other but both depend on phase 1, set depends_on: ["phase_1"] on both — the system will run them concurrently.
- Do NOT truncate — produce the complete JSON
- IMPORTANT: Escape all double-quotes inside strings with backslash

Raw spec:
${truncated}`;
}

/**
 * Build a README-generation prompt from the decomposition context and phases.
 */
export function buildReadmePrompt(context: string, phases: Array<{ name: string; summary: string }>): string {
	const phaseList = phases.map((p) => `- ${p.name}: ${p.summary}`).join("\n");

	return `You are a technical writer for an open-source project.
Write a README.md for the project described below.

Context:
${context}

Phases:
${phaseList}

Output ONLY markdown, no extra commentary. The README should include:
- Project name and purpose (one-liner)
- What it does (2-3 sentences)
- Quick start / usage
- Architecture overview (bullets)
- License (MIT)

Write it clean, direct, no fluff.`;
}
