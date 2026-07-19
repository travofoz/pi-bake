/**
 * Overlay wrapper — animated pink/green laser scanner taper.
 *
 *   ────━━━━━━━━══════════[ Title ]══════════━━━━━━━━────
 *   Pink spotlight sweeps from center leftward and rightward
 *   in sync — classic KITT scanner on the taper line.
 *
 *   Dark grey bg, white text, 2-col margin.
 */

import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";

export type ThemeProxy = {
	fg: (variant: string, text: string) => string;
	bg: (variant: string, text: string) => string;
};

const PANEL_BG = "\x1b[48;5;234m";
const RESET_WHITE = "\x1b[0m\x1b[38;5;255m";

function wrapPanel(text: string): string {
	return PANEL_BG + text + RESET_WHITE;
}

const TAPER_CHARS = ["─", "━", "═"];

function taperChars(width: number): string[] {
	const chars: string[] = [];
	for (let i = 0; i < width; i++) {
		const ct = (width - 1) / 2;
		const dist = Math.abs(i - ct) / Math.max(1, ct);
		const idx = Math.round((1 - dist) * (TAPER_CHARS.length - 1));
		chars.push(TAPER_CHARS[Math.max(0, Math.min(idx, TAPER_CHARS.length - 1))]);
	}
	return chars;
}

const RED_BRIGHT = "\x1b[38;5;196m";
const RED_MID = "\x1b[38;5;160m";
const RED_DIM = "\x1b[38;5;88m";
const GREEN_BRIGHT = "\x1b[38;5;119m";
const GREEN_MID = "\x1b[38;5;108m";
const GREEN_DIM = "\x1b[38;5;65m";
const RESET = "\x1b[0m";
const WHITE_FG = "\x1b[38;5;255m";

/** Color a character based on distance from scanner center. */
function scannerColor(ch: string, distFromScan: number, _leftSide: boolean): string {
	// Scanner head uses red. Non-scanner zone uses green (both sides).
	if (distFromScan <= 3) {
		const red = distFromScan <= 1 ? RED_BRIGHT : distFromScan <= 2 ? RED_MID : RED_DIM;
		return `${red}${ch}${RESET}`;
	}
	const green = distFromScan <= 5 ? GREEN_MID : GREEN_DIM;
	return `${green}${ch}${RESET}`;
}

/** Build a single animated taper line with red scanner on green track.
 *  One bright spot sweeps from left to right and back (classic KITT). */
export function scannerTaper(width: number, scanPos: number, t: ThemeProxy, title?: string): string {
	if (width <= 0) return "";
	const chars = taperChars(width);
	// scanPos 0..1: position of the single bright spot across the full width
	const spot = Math.round(scanPos * (width - 1));

	const colorLine = (lineChars: string[], offset: number): string => {
		return lineChars.map((ch, i) => {
			const absIdx = offset + i;
			const dist = Math.abs(absIdx - spot);
			if (dist <= 5) {
				return scannerColor(ch, dist, false);
			}
			// Non-scanner zone: green dim for all
			return `${GREEN_DIM}${ch}${RESET}`;
		}).join("");
	};

	if (title) {
		const titleStr = `═[ ${t.fg("text", title)} ]`;
		const tv = visibleWidth(titleStr);
		const lw = Math.floor((width - tv) / 2);
		const rw = width - tv - lw;
		const left = colorLine(chars.slice(0, lw), 0);
		const right = colorLine(chars.slice(lw + tv, lw + tv + rw), lw + tv);
		return left + titleStr + right;
	}

	return colorLine(chars, 0);
}

export function taperTitle(title: string, width: number, fg: (v: string, t: string) => string): string {
	const titleStr = `═[ ${fg("text", title)} ]`;
	const tv = visibleWidth(titleStr);
	const lw = Math.floor((width - tv) / 2);
	const rw = width - tv - lw;
	return fg("accent", taperChars(lw).join("") + titleStr + taperChars(rw).join(""));
}

export class Overlay {
	private theme: ThemeProxy;
	private title: string;
	private body: Container;
	private footerLines: string[];
	private maxHeight: number;
	private tui?: TUI;
	private scanPos = 0;
	private scanDir = 1;
	private animTimer?: ReturnType<typeof setInterval>;

	constructor(theme: ThemeProxy, opts: { title?: string; maxHeight?: number; tui?: TUI } = {}) {
		this.theme = theme;
		this.title = opts.title ?? "";
		this.maxHeight = opts.maxHeight ?? 0;
		this.tui = opts.tui;
		this.body = new Container();
		this.footerLines = [];

		if (this.tui) {
			this.animTimer = setInterval(() => {
				this.scanPos += this.scanDir * 0.02;
				if (this.scanPos >= 1) { this.scanPos = 1; this.scanDir = -1; }
				if (this.scanPos <= 0) { this.scanPos = 0; this.scanDir = 1; }
				this.tui!.requestRender();
			}, 50);
		}
	}

	addBody(component: { render: (w: number) => string[]; invalidate: () => void }): void {
		this.body.addChild(component);
	}

	addFooter(line: string): void {
		this.footerLines.push(line);
	}

	dispose(): void {
		if (this.animTimer) clearInterval(this.animTimer);
	}

	render(fullW: number): string[] {
		const margin = 2;
		const innerW = Math.max(20, fullW - margin * 2);
		const t = this.theme;
		const dim = (s: string) => t.fg("dim", s);
		const result: string[] = [];

		// ── Top rule with animated scanner + title ──
		result.push(scannerTaper(innerW, this.scanPos, t, this.title));

		result.push("");

		// ── Body ──
		const indent = 4;
		const bodyLines = this.body.render(innerW - indent);
		for (const line of bodyLines) {
			result.push(" ".repeat(indent) + line);
		}

		if (this.footerLines.length > 0) result.push("");

		// ── Footer ──
		for (const f of this.footerLines) {
			result.push(" ".repeat(indent) + dim(f));
		}

		if (this.footerLines.length > 0) result.push("");

		// ── Bottom rule (mirrored scan) ──
		result.push(scannerTaper(innerW, this.scanPos, t));

		// ── Cap to maxHeight if set ──
		let capped = result;
		if (this.maxHeight > 0 && capped.length > this.maxHeight) {
			capped = capped.slice(0, this.maxHeight);
			capped[capped.length - 1] = dim("  ▼ truncated");
		}

		// ── Pad with dark grey bg + margin ──
		const leftPad = " ".repeat(margin);
		return capped.map((line) => {
			const vis = visibleWidth(line);
			const rightPad = " ".repeat(Math.max(0, fullW - margin - vis - margin));
			return wrapPanel(leftPad + line + rightPad);
		});
	}

	invalidate(): void {
		this.body.invalidate();
	}
}
