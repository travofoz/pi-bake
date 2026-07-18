/**
 * Animated loader — KITT scanner in stacked braille style.
 *
 *   ⣀⣠⣤⣴⣶⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣴⣤⣠⣀
 *   ──━━━━━━━━━━━━═══[ ▉ Scanning... ]═══━━━━━━━━━━━━──
 *   ──━━━━━━━━━━━━═══════════════════════════━━━━━━━━━━━━──
 *   ⣀⣠⣤⣴⣶⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣴⣤⣠⣀
 *
 * Scanner char sweeps through ▏▎▍▌▋▊▉█.
 * Dark charcoal bg, 2-col terminal margin.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";

// Light grey panel background — match overlay style
const PANEL_BG = "\x1b[48;2;220;220;225m";
const RESET_BLACK = "\x1b[0m\x1b[38;2;20;20;20m";

function wrapPanel(text: string): string {
	return PANEL_BG + text + RESET_BLACK;
}

const BRAILLE_STEPS = ["⣀","⣠","⣤","⣴","⣶","⣷","⣿","⣷","⣶","⣴","⣤","⣠","⣀"];

function brailleGauss(width: number): string {
	if (width <= 0) return "";
	let s = "";
	for (let i = 0; i < width; i++) {
		const center = (width - 1) / 2;
		const dist = Math.abs(i - center) / Math.max(1, center);
		const idx = Math.round(dist * (BRAILLE_STEPS.length - 1));
		s += BRAILLE_STEPS[Math.min(idx, BRAILLE_STEPS.length - 1)];
	}
	return s;
}

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

const SCANNER_FRAMES = ["▏","▎","▍","▌","▋","▊","▉","█","▉","▊","▋","▌","▍","▎","▏"];

export class LoaderComponent implements Component {
	private scannerIdx = 0;
	private scannerTimer: ReturnType<typeof setInterval> | null = null;
	private tuiRef: TUI;
	private fg: (variant: string, text: string) => string;
	private getMsg: () => string;

	constructor(
		tui: TUI,
		fg: (variant: string, text: string) => string,
		_bg: (variant: string, text: string) => string,
		getMsg: () => string,
	) {
		this.tuiRef = tui;
		this.fg = fg;
		this.getMsg = getMsg;
		this.scannerTimer = setInterval(() => {
			this.scannerIdx = (this.scannerIdx + 1) % SCANNER_FRAMES.length;
			tui.requestRender();
		}, 80);
	}

	invalidate() {}

	render(w: number): string[] {
		const scanner = SCANNER_FRAMES[this.scannerIdx];
		const msg = this.getMsg();
		const t = this.fg;
		const a = (s: string) => t("accent", s);
		const dim = (s: string) => t("dim", s);

		const margin = 2;
		const innerW = Math.max(28, w - margin * 2);
		const left = " ".repeat(margin);
		const right = (line: string) => " ".repeat(Math.max(0, w - margin - visibleWidth(line) - margin));

		// Braille gradient top
		const braiDim = dim(brailleGauss(innerW));

		// Top taper rule with scanner message
		const content = `${t("accent", scanner)} ${t("text", msg)}`;
		const titleStr = `═[ ${content} ]`;
		const titleVis = visibleWidth(titleStr);
		const leftW = Math.floor((innerW - titleVis) / 2);
		const rightW = innerW - titleVis - leftW;
		const topRule = a(taper(leftW) + titleStr + taper(rightW));

		// Bottom taper rule
		const botRule = a(taper(innerW));

		// Braille gradient bottom
		const braiBot = dim(brailleGauss(innerW));

		return [
			wrapPanel(left + braiDim + right(braiDim)),
			wrapPanel(left + topRule + right(topRule)),
			wrapPanel(left + botRule + right(botRule)),
			wrapPanel(left + braiBot + right(braiBot)),
		];
	}

	dispose(): void {
		if (this.scannerTimer) clearInterval(this.scannerTimer);
	}
}
