/**
 * Overlay wrapper — Remorse/ACiD-style ANSI chrome for bake dialogs.
 *
 * Multi-layered border architecture:
 *   ╔══╤══╤══╤══╤══╤══╤══╤══╤══╤══╤══╤══╤══╤══╗
 *   ║▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓║
 *   ╟──┼──┼──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┼──┼──╢
 *   ║▓░ ▄▄▄▄▄▄▄▄▄ ──═[ Bake Config ]═── ▄▄▄▄▄▄▄▄▄ ░▓║
 *   ║▓░ █████████ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ █████████ ░▓║
 *   ║▓░ ▀▀▀▀▀▀▀▀▀ ████████████████████ ▀▀▀▀▀▀▀▀▀ ░▓║
 *   ║▓░ ░░░░░░░░░ ████████████████████ ░░░░░░░░░ ░▓║
 *   ╟──┼──┼──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┼──┼──╢
 *   ║▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓█▓║
 *   ╠══╧══╧══╧══╧══╧══╧══╧══╧══╧══╧══╧══╧══╧══╧══╧══╣
 *   ║    Widget mode: [full]                              ║
 *   ║    ↑↓ navigate  ·  ← → change                      ║
 *   ╚══════════════════════════════════════════════════════╝
 *
 * Background: charcoal dark grey, 2-col terminal margin.
 */

import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";

export type ThemeProxy = {
	fg: (variant: string, text: string) => string;
	bg: (variant: string, text: string) => string;
};

const CHARCOAL_BG = "\x1b[48;2;24;24;32m";
function wrapBg(text: string): string {
	return CHARCOAL_BG + text;
}

// ─── Generators ─────────────────────────────────────────────────────

/** Alternating pattern */
function alt(len: number, a = "█", b = "▓"): string {
	let s = "";
	for (let i = 0; i < len; i++) s += (i % 2 ? a : b);
	return s;
}

/** Repeating column pattern */
function columns(len: number, p: string[]): string {
	let s = "";
	for (let i = 0; i < len; i++) s += p[i % p.length];
	return s;
}

/** Gaussian brightness falloff */
function gauss(len: number, chars: string[] = [" ","░","▒","▓","█"]): string {
	let s = "";
	for (let i = 0; i < len; i++) {
		const dist = Math.abs(i - (len - 1) / 2) / ((len - 1) / 2);
		const idx = Math.max(0, Math.min(chars.length - 1, Math.round((1 - dist) * (chars.length - 1))));
		s += chars[idx];
	}
	return s;
}

/** Dither noise line */
function noise(len: number, density = 0.4, a = "▓", b = "░"): string {
	let s = "";
	for (let i = 0; i < len; i++) {
		const h = (i * 7 + 13) & 7;
		s += h < density * 8 ? a : b;
	}
	return s;
}

/** Block gradient: solid edges fade to empty center */
function edgeGrad(len: number): string {
	const g = ["█","▓","▒","░"," ","░","▒","▓","█"];
	let s = "";
	for (let i = 0; i < len; i++) {
		s += g[i % g.length];
	}
	return s;
}

/** Zigzag */
function zigzag(len: number): string {
	const z = ["╱","╲","╱","╲","╱","╲","╱","╲"];
	let s = "";
	for (let i = 0; i < len; i++) s += z[i % z.length];
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
		const innerW = Math.max(24, fullW - margin * 2);
		const bw = innerW - 2;
		const t = this.theme;
		const a = (s: string) => t.fg("accent", s);
		const d = (s: string) => t.fg("dim", s);
		const result: string[] = [];

		// ══════════════════════════════════════════════════════════════
		//  HEADER — thick ornate layered border
		// ══════════════════════════════════════════════════════════════

		// Row 1: Double top frame with corner accent
		result.push(a("╔" + columns(bw, ["═","╤"])) + a("╗"));

		// Row 2: Dither pillar
		result.push(a("║") + d(alt(bw, "█", "▓")) + a("║"));

		// Row 3: Zigzag transition
		result.push(a("╟") + d(zigzag(bw)) + a("╢"));

		// Row 4: Noise band
		result.push(a("║") + d(noise(bw, 0.3, "▓", "░")) + a("║"));

		// Row 5: Gaussian gradient band
		result.push(a("║") + d(gauss(bw)) + a("║"));

		// Row 6: Tee join + wave + title embedded
		{
			const waveW = Math.min(10, Math.floor(bw * 0.12));
			if (this.title) {
				const titleStr = `──═[ ${a(this.title)}${d(" ]═──")}`;
				const titleVis = visibleWidth(titleStr);
				const sideEach = Math.floor((bw - titleVis) / 2);
				const wL = gauss(Math.min(waveW, sideEach));
				const wR = gauss(Math.min(waveW, sideEach));
				const dashL = Math.max(0, sideEach - visibleWidth(wL));
				const dashR = Math.max(0, sideEach - visibleWidth(wR));
				result.push(
					a("╟") +
					d(gauss(sideEach)) +
					titleStr +
					d(gauss(sideEach)) +
					a("╢")
				);
			} else {
				result.push(a("╟") + d(gauss(bw)) + a("╢"));
			}
		}

		// Row 7: Second noise band
		result.push(a("║") + d(noise(bw, 0.4, "▒", " ")) + a("║"));

		// Row 8: Edge gradient (solid→empty→solid)
		result.push(a("║") + d(edgeGrad(bw)) + a("║"));

		// Row 9: Reverse dither pillar
		result.push(a("╟") + d(alt(bw, "▓", "█")) + a("╢"));

		// Row 10: Divider
		result.push(a("╠" + columns(bw, ["═","╧"])) + a("╣"));

		// ══════════════════════════════════════════════════════════════
		//  BODY
		// ══════════════════════════════════════════════════════════════
		const bodyIndent = 4;
		const bodyLines = this.body.render(bw - bodyIndent);
		for (const line of bodyLines) {
			const vis = visibleWidth(line);
			const pad = Math.max(0, bw - bodyIndent - vis);
			result.push(a("║") + " ".repeat(bodyIndent) + line + " ".repeat(pad) + a("║"));
		}

		// ══════════════════════════════════════════════════════════════
		//  FOOTER
		// ══════════════════════════════════════════════════════════════
		result.push(a("╠" + columns(bw, ["─","┴"])) + a("╣"));

		// Pulse footer band
		result.push(a("║") + d(gauss(bw, [" ","░","▒","▓","█","▓","▒","░"," "])) + a("║"));

		for (const f of this.footerLines) {
			const vis = visibleWidth(f);
			const pad = Math.max(0, bw - bodyIndent - vis);
			result.push(a("║") + " ".repeat(bodyIndent) + t.fg("dim", f) + " ".repeat(pad) + a("║"));
		}

		// ══════════════════════════════════════════════════════════════
		//  BOTTOM
		// ══════════════════════════════════════════════════════════════
		result.push(a("╚" + columns(bw, ["═","╧"])) + a("╝"));

		// ══════════════════════════════════════════════════════════════
		//  MARGIN + BG
		// ══════════════════════════════════════════════════════════════
		const leftPad = " ".repeat(margin);
		return result.map((line) => {
			const vis = visibleWidth(line);
			const rightPad = " ".repeat(Math.max(0, fullW - margin - vis - margin));
			return wrapBg(leftPad + line + rightPad);
		});
	}

	invalidate(): void {
		this.body.invalidate();
	}
}
