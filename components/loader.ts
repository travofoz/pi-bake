/**
 * Animated loader — KITT scanner in clean NFO-style chrome.
 *
 *   ──═[ ▉ Scanning... ]═───────────────────────────
 *   ─────────────────────────────────────────────────
 *
 * Scanner char sweeps through ▏▎▍▌▋▊▉█.
 * Background: charcoal dark grey, 2-col terminal margin.
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

		const margin = 2;
		const innerW = Math.max(28, w - margin * 2);

		// ── Top rule with scanner + message ──
		const content = `${t("accent", scanner)} ${t("text", msg)}`;
		const titleStr = `═[ ${content} ]`;
		const titleVis = visibleWidth(titleStr);
		const dashes = Math.max(0, innerW - titleVis);
		const topRule = a("──" + titleStr + "═".repeat(dashes));

		// ── Bottom rule ──
		const botRule = a("──═".repeat(Math.ceil(innerW / 3)).slice(0, innerW));

		const left = " ".repeat(margin);
		const right = (line: string) => " ".repeat(Math.max(0, w - margin - visibleWidth(line) - margin));

		return [
			wrapBg(left + topRule + right(topRule)),
			wrapBg(left + botRule + right(botRule)),
		];
	}

	dispose(): void {
		if (this.scannerTimer) clearInterval(this.scannerTimer);
	}
}
