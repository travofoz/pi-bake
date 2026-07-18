/**
 * Animated loader overlay — clean KITT scanner + simple border.
 *
 * ┌─────────────────────────┐
 * │ ▉ Decomposing spec...   │
 * └─────────────────────────┘
 *
 * Single-character Larson scanner (▏▎▍▌▋▊▉█ sweep) + message
 * inside a simple box. No pulsing rails, no glow effects.
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
		const innerW = Math.min(content.length + 4, Math.max(w - 4, 28));
		const border = "─".repeat(innerW - 2);

		const bgFn = (line: string) => {
			const visLen = visibleWidth(line);
			const padNeeded = Math.max(0, w - visLen);
			return this.bg("toolPendingBg", line + " ".repeat(padNeeded));
		};

		return [
			bgFn(this.fg("toolTitle", `┌${border}┐`)),
			bgFn(this.fg("text", `│ ${content}${" ".repeat(Math.max(0, innerW - 4 - content.length))} │`)),
			bgFn(this.fg("toolTitle", `└${border}┘`)),
		];
	}

	dispose(): void {
		if (this.scannerTimer) clearInterval(this.scannerTimer);
	}
}
