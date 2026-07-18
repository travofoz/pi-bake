/**
 * Animated loader — KITT scanner in ACiD/Remorse-style chrome.
 *
 *   ╔══════════════════════════════════════════════════╗
 *   ║▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░║
 *   ╤───────────────────═[ ▉ Loading... ]═──────────────╤
 *   ║▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░║
 *   ╠──────────────────────────────────────────────────╣
 *   ╚══════════════════════════════════════════════════╝
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";

const CHARCOAL_BG = "\x1b[48;2;24;24;32m";
function wrapBg(text: string): string {
	return CHARCOAL_BG + text;
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
		const d = (s: string) => t("dim", s);

		const margin = 2;
		const innerW = Math.max(28, w - margin * 2);

		// Content: scanner char + message
		const content = `${t("accent", scanner)} ${t("text", msg)}`;
		const contentVis = visibleWidth(content);

		// Header dither
		const ditherRow = () => {
			let row = "";
			for (let i = 0; i < innerW - 2; i++) {
				row += (["▓","░","▓","░","▓","░"])[i % 6];
			}
			return a("║") + d(row) + a("║");
		};

		// Title row: ╤───═[ ▉ Loading... ]═─────────╤
		const titleStr = `─═[ ${content} ]═`;
		const titleVis = visibleWidth(titleStr);
		const dashes = Math.max(0, innerW - 2 - titleVis);
		const leftD = Math.floor(dashes / 2);
		const rightD = dashes - leftD;
		const titleRow = a("╤") + d("─".repeat(leftD)) + titleStr + d("─".repeat(rightD)) + a("╤");

		// Shade row
		const shadeRow = () => {
			let row = "";
			for (let i = 0; i < innerW - 2; i++) {
				const dist = Math.abs(i - Math.floor((innerW - 2) / 2));
				const chars = ["▒","░","▒","▓","▒"];
				row += chars[Math.min(dist, chars.length - 1) % chars.length];
			}
			return a("║") + d(row) + a("║");
		};

		const left = " ".repeat(margin);
		const right = (line: string) => " ".repeat(Math.max(0, w - margin - visibleWidth(line) - margin));

		return [
			wrapBg(left + a("╔" + "═".repeat(innerW - 2) + "╗") + right("╔" + "═".repeat(innerW - 2) + "╗")),
			wrapBg(left + ditherRow() + right(ditherRow())),
			wrapBg(left + titleRow + right(titleRow)),
			wrapBg(left + shadeRow() + right(shadeRow())),
			wrapBg(left + a("╠" + "─".repeat(innerW - 2) + "╣") + right("╠" + "─".repeat(innerW - 2) + "╣")),
			wrapBg(left + a("╚" + "═".repeat(innerW - 2) + "╝") + right("╚" + "═".repeat(innerW - 2) + "╝")),
		];
	}

	dispose(): void {
		if (this.scannerTimer) clearInterval(this.scannerTimer);
	}
}
