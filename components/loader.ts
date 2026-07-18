/**
 * Animated loader overlay — clean KITT scanner + Overlay chrome.
 *
 * Renders inside the shared Overlay box: block-element border,
 * charcoal dark grey bg, 2-column margin from terminal edge.
 *
 * Scanner: ▏▎▍▌▋▊▉█ sweep bouncing LTR.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";

const SCANNER_FRAMES = [
	"▏", "▎", "▍", "▌", "▋", "▊", "▉", "█",
	"▉", "▊", "▋", "▌", "▍", "▎", "▏",
];

export class LoaderComponent implements Component {
	private scannerIdx = 0;
	private scannerTimer: ReturnType<typeof setInterval> | null = null;
	private tuiRef: TUI;
	private fg: (variant: string, text: string) => string;
	private bg: (variant: string, text: string) => string;
	private getMsg: () => string;

	constructor(
		tui: TUI,
		fg: (variant: string, text: string) => string,
		bg: (variant: string, text: string) => string,
		getMsg: () => string,
	) {
		this.tuiRef = tui;
		this.fg = fg;
		this.bg = bg;
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
		const content = `${scanner} ${msg}`;

		// Overlay chrome: 2-col margin, charcoal bg, block border
		const margin = 2;
		const innerW = Math.max(28, w - margin * 2);
		const bodyW = innerW - 2; // -2 for side borders

		const padded = content + " ".repeat(Math.max(0, bodyW - visibleWidth(content)));

		const t = this.fg;
		const bg = this.bg;

		// Block-element border chars
		const CORNER_TL = "▛";
		const CORNER_TR = "▜";
		const CORNER_BL = "▙";
		const CORNER_BR = "▟";
		const VERT = "▐";
		const VERT_REV = "▌";

		const topRule = CORNER_TL + "▀".repeat(innerW - 2) + CORNER_TR;
		const botRule = CORNER_BL + "▄".repeat(innerW - 2) + CORNER_BR;
		const midLine = VERT_REV + t("text", padded) + VERT;

		const bgFn = (s: string) => bg("toolPendingBg", s);
		const left = " ".repeat(margin);
		const right = (line: string) => " ".repeat(Math.max(0, w - margin - visibleWidth(line) - margin));

		return [
			bgFn(left + t("toolTitle", topRule) + right(topRule)),
			bgFn(left + midLine + right(midLine)),
			bgFn(left + t("toolTitle", botRule) + right(botRule)),
		];
	}

	dispose(): void {
		if (this.scannerTimer) clearInterval(this.scannerTimer);
	}
}
