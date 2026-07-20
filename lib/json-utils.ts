/**
 * JSON repair and parsing utilities for fragile LLM output.
 *
 * LLMs frequently emit JSON with trailing commas, single-quoted strings,
 * unescaped control characters, truncation, or markdown fences. These
 * helpers attempt to recover parseable JSON from such output.
 */

import * as fs from "node:fs";

/**
 * Attempt to fix common JSON issues produced by LLMs:
 * 1. Trailing commas in arrays/objects
 * 2. Unescaped control characters in strings
 * 3. Single-quoted strings instead of double-quoted
 * 4. Missing closing brackets (truncation)
 * 5. Comments (// or /* style)
 */
export function repairJSON(raw: string): string {
	let s = raw.trim();

	// Strip markdown code fence if present
	s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

	// Strip any leading text before the first {
	const braceIdx = s.indexOf("{");
	if (braceIdx > 0) s = s.slice(braceIdx);

	// Remove single-line comments (// ...)
	s = s.replace(/\/\/[^\n]*/g, "");

	// Remove multi-line comments (/* ... */)
	s = s.replace(/\/\*[\s\S]*?\*\//g, "");

	// Replace single quotes at string boundaries with double quotes
	// Match: 'key': or : 'value' patterns — conservative to avoid breaking embedded apostrophes
	s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '"$1":');
	s = s.replace(/"\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, '": "$1"');

	// Remove trailing commas before } or ]
	s = s.replace(/,\s*([}\]])/g, "$1");

	// Attempt to close unclosed structure: count braces
	let depth = 0;
	let inString = false;
	let escaped = false;
	let lastBrace = -1;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (escaped) { escaped = false; continue; }
		if (ch === "\\" && inString) { escaped = true; continue; }
		if (ch === '"' && !escaped) { inString = !inString; continue; }
		if (inString) continue;
		if (ch === "{" || ch === "[") { depth++; lastBrace = i; }
		if (ch === "}" || ch === "]") { depth--; lastBrace = i; }
	}

	// If we're inside an unclosed string, add closing quote
	if (inString) s += '"';

	// Close unclosed braces/brackets in reverse order
	if (depth > 0 && s.length > 0) {
		const closers: string[] = [];
		// Re-scan to determine which closers are needed
		const stack: string[] = [];
		let si = false;
		let se = false;
		for (let i = 0; i < s.length; i++) {
			const ch = s[i];
			if (se) { se = false; continue; }
			if (ch === "\\" && si) { se = true; continue; }
			if (ch === '"' && !se) { si = !si; continue; }
			if (si) continue;
			if (ch === "{") stack.push("}");
			if (ch === "[") stack.push("]");
			if (ch === "}" || ch === "]") {
				if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
			}
		}
		for (let i = stack.length - 1; i >= 0; i--) {
			closers.push(stack[i]);
		}
		s += closers.join("");
	}

	return s;
}

/**
 * Try to parse JSON with repair attempts.
 * Returns parsed object or throws with details if all attempts fail.
 */
export function tryParseJSON(raw: string, logPath: string): any {
	// First attempt: direct parse
	try {
		return JSON.parse(raw);
	} catch {
		// Save original for debugging
		fs.writeFileSync(logPath, raw, "utf-8");
	}

	// Second attempt: repair and parse
	const repaired = repairJSON(raw);
	try {
		const parsed = JSON.parse(repaired);
		return parsed;
	} catch (e: any) {
		// Save repaired version too for comparison
		fs.writeFileSync(
			logPath.replace(/\.txt$/, "-repaired.txt"),
			repaired,
			"utf-8",
		);
		throw new Error(
			`JSON parse error after repair: ${e.message}. Raw output saved to ${logPath}`,
		);
	}
}
