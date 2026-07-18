/**
 * Overlay wrapper — stacked braille gradient + taper rule.
 *
 *   ⣀⠤⢒⢐⠉⠑⢒⠤⣀──━━══════[ Title ]══════━━──⣀⠤⢒⢐⠉⠑⢒⠤⣀
 *   ⣀⣠⣤⣴⣶⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣴⣤⣠⣀
 *   ──━━━━━━━━━━━━═══[ Bake Config ]═══━━━━━━━━━━━━──
 *
 *       Widget mode: [full]
 *       ↑↓ navigate  ·  ← → change
 *
 *   ──━━━━━━━━━━━━═══════════════════════━━━━━━━━━━━━──
 *   ⣀⣠⣤⣴⣶⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣴⣤⣠⣀
 *   ⣀⠤⢒⢐⠉⠑⢒⠤⣀─────────────────────────⣀⠤⢒⢐⠉⠑⢒⠤⣀
 *
 * Background: charcoal dark grey (#181820), 2-col margin.
 */

import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";

export type ThemeProxy = {
	fg: (variant: string, text: string) => string;
	bg: (variant: string, text: string) => string;
};

// Light grey panel background — gives the overlay a distinct floating surface
const PANEL_BG = "\x1b[48;2;220;220;225m";
// Black text reset for content on light bg
const RESET_BLACK = "\x1b[0m\x1b[38;2;20;20;20m";

function wrapPanel(text: string): string {
	// Wrap in panel bg; ensure text is black-on-light
	return PANEL_BG + text + RESET_BLACK;
}

// ─── Braille gradient (ascending density) ──────────────────────────
const BRAILLE = ["⣀","⣠","⣤","⣴","⣶","⣷","⣿"];

/** Braille Gaussian: sparse at edges, dense at center */
function brailleGauss(width: number): string {
	if (width <= 0) return "";
	let s = "";
	for (let i = 0; i < width; i++) {
		const center = (width - 1) / 2;
		const dist = Math.abs(i - center) / Math.max(1, center);
		// dist=0 (center) → ⣿ (dense), dist=1 (edges) → ⣀ (sparse)
		const idx = Math.round((1 - dist) * (BRAILLE.length - 1));
		s += BRAILLE[Math.max(0, Math.min(idx, BRAILLE.length - 1))];
	}
	return s;
}

// ─── Dither gradient (5 levels) ───
const DITHER = [" ","░","▒","▓","█"];

function ditherGauss(width: number): string {
	if (width <= 0) return "";
	let s = "";
	for (let i = 0; i < width; i++) {
		const center = (width - 1) / 2;
		const dist = Math.abs(i - center) / Math.max(1, center);
		const idx = Math.round((1 - dist) * (DITHER.length - 1));
		s += DITHER[Math.max(0, Math.min(idx, DITHER.length - 1))];
	}
	return s;
}

// ─── Taper rule characters ─────────────────────────────────────────
const TAPER_CHARS = ["─", "━", "═"];

function taper(width: number): string {
	if (width <= 0) return "";
	let s = "";
	for (let i = 0; i < width; i++) {
		const center = (width - 1) / 2;
		const dist = Math.abs(i - center) / Math.max(1, center);
		const idx = Math.round((1 - dist) * (TAPER_CHARS.length - 1));
		s += TAPER_CHARS[Math.max(0, Math.min(idx, TAPER_CHARS.length - 1))];
	}
	return s;
}

export class Overlay {
	private theme: ThemeProxy;
	private title: string;
	private body: Container;
	private footerLines: string[];

	constructor(theme: ThemeProxy, opts: { title?: string } = {}) {
		this.theme = theme;
		this.title = opts.title ?? "";
		this.body = new Container();
		this.footerLines = [];
	}

	addBody(component: { render: (w: number) => string[]; invalidate: () => void }): void {
		this.body.addChild(component);
	}

	addFooter(line: string): void {
		this.footerLines.push(line);
	}

	render(fullW: number): string[] {
		const margin = 2;
		const innerW = Math.max(20, fullW - margin * 2);
		const t = this.theme;
		const a = (s: string) => t.fg("accent", s);
		const dim = (s: string) => t.fg("dim", s);
		const result: string[] = [];

		// ══════════════════════════════════════════════════════════════
		//  HEADER — 3 rows: braille gradient × 2 + taper rule
		// ══════════════════════════════════════════════════════════════

		// Row 1: Dither Gaussian (sparser, sits on top)
		result.push(dim(ditherGauss(innerW)));

		// Row 2: Braille Gaussian (denser, sits underneath)
		result.push(dim(brailleGauss(innerW)));

		// Row 3: Taper rule with title
		if (this.title) {
			const titleStr = `═[ ${t.fg("text", this.title)} ]`;
			const titleVis = visibleWidth(titleStr);
			const leftW = Math.floor((innerW - titleVis) / 2);
			const rightW = innerW - titleVis - leftW;
			result.push(a(taper(leftW) + titleStr + taper(rightW)));
		} else {
			result.push(a(taper(innerW)));
		}

		result.push("");

		// ══════════════════════════════════════════════════════════════
		//  BODY
		// ══════════════════════════════════════════════════════════════
		const indent = 4;
		const bodyLines = this.body.render(innerW - indent);
		for (const line of bodyLines) {
			result.push(" ".repeat(indent) + line);
		}

		if (this.footerLines.length > 0) {
			result.push("");
		}

		// ══════════════════════════════════════════════════════════════
		//  FOOTER
		// ══════════════════════════════════════════════════════════════
		for (const f of this.footerLines) {
			result.push(" ".repeat(indent) + dim(f));
		}

		if (this.footerLines.length > 0) {
			result.push("");
		}

		// ══════════════════════════════════════════════════════════════
		//  FOOTER — 3 rows: taper rule + braille gradient × 2
		// ══════════════════════════════════════════════════════════════

		// Row 1 (bot): Bottom rule
		result.push(a(taper(innerW)));

		// Row 2 (bot): Braille Gaussian
		result.push(dim(brailleGauss(innerW)));

		// Row 3 (bot): Dither Gaussian
		result.push(dim(ditherGauss(innerW)));

		// ── Pad with light panel bg + margin ──
		const leftPad = " ".repeat(margin);
		return result.map((line) => {
			const vis = visibleWidth(line);
			const rightPad = " ".repeat(Math.max(0, fullW - margin - vis - margin));
			return wrapPanel(leftPad + line + rightPad);
		});
	}

	invalidate(): void {
		this.body.invalidate();
	}
}
