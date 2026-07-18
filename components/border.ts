/**
 * Cyberpunk neon-rail horizontal rules.
 *
 * Static:  dither tabs + ═╪═╪ rail
 * Animated: pulsing nodes along the rail
 *
 * Usage:
 *   new Border((s) => theme.fg("accent", s))                    // static
 *   new AnimatedBorder((s) => theme.fg("accent", s), getFrame)  // pulsing
 */

import { pulseRail, scannerBar } from "./anim.ts";
import type { Component } from "@earendil-works/pi-tui";

const RAIL_PATTERN = "═╪═╪";
const DITHER_TABS = ["░▒▓▓", "▓▓▒░"];

export class Border implements Component {
	private color: (s: string) => string;

	constructor(color: (s: string) => string) {
		this.color = color;
	}

	invalidate() {}

	render(width: number): string[] {
		if (width <= 0) return [""];

		const leftTab = DITHER_TABS[0];
		const rightTab = DITHER_TABS[1];
		const tabLen = leftTab.length + rightTab.length;
		const railLen = Math.max(0, width - tabLen);

		const repeats = Math.max(1, Math.ceil(railLen / RAIL_PATTERN.length));
		const rail = RAIL_PATTERN.repeat(repeats).slice(0, railLen);

		return [this.color(leftTab + rail + rightTab)];
	}
}

/**
 * Animated variant — takes a frame getter and pulses nodes along the rail.
 *
 *   ░▒▓▓═[▓]═[▓]═[▓]═[▓]▓▓▒░    frame 0
 *   ░▒▓▓═[░]═[░]═[░]═[░]▓▓▒░    frame 5
 *   ░▒▓▓═[▒]═[▒]═[▒]═[▒]▓▓▒░    frame 10
 */
export class AnimatedBorder implements Component {
	private color: (s: string) => string;
	private getFrame: () => number;

	constructor(color: (s: string) => string, getFrame: () => number) {
		this.color = color;
		this.getFrame = getFrame;
	}

	invalidate() {}

	render(width: number): string[] {
		if (width <= 0) return [""];

		const frame = this.getFrame();
		const leftTab = DITHER_TABS[0];
		const rightTab = DITHER_TABS[1];
		const tabLen = leftTab.length + rightTab.length;
		const railLen = Math.max(0, width - tabLen);

		// Pulse nodes every 6 chars along the rail
		const rail = pulseRail(railLen, frame, "═", 6);

		return [this.color(leftTab + rail + rightTab)];
	}
}
