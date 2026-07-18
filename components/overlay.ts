/**
 * Overlay wrapper — reusable chrome for all bake dialogs.
 *
 * Provides:
 *   - Cool block-element border (▛▀▀▀▜ / ▙▄▄▄▟ with ▐ ▌ sides)
 *   - 2-column gap from terminal edges in all directions
 *   - Charcoal dark grey background (distinct from main terminal bg)
 *   - Optional title line
 *   - Optional footer hint line
 *
 * Usage:
 *   const ov = new Overlay(theme, { title: "Bake Config" });
 *   ov.addBody(new Text(...));
 *   ov.addFooter("↑↓ navigate  ·  esc close");
 *   // in render: return ov.render(w);
 */

import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";

export type ThemeProxy = {
	fg: (variant: string, text: string) => string;
	bg: (variant: string, text: string) => string;
};

// ─── Block-element border characters ────────────────────────────────
//  ▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
//  ▌  content here                                     ▐
//  ▌  more content                                     ▐
//  ▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟

const CORNER_TL = "▛";
const CORNER_TR = "▜";
const CORNER_BL = "▙";
const CORNER_BR = "▟";
const HORIZ_TOP = "▀";
const HORIZ_BOT = "▄";
const VERT = "▐";
const VERT_REV = "▌";

// ─── Overlay background color ───────────────────────────────────────
// Charcoal dark grey — distinct from the main terminal background
const OVERLAY_BG = "toolPendingBg";
const OVERLAY_BORDER_COLOR = "accent";
const OVERLAY_TEXT_COLOR = "text";

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

	/** Render the full overlay, auto-margined with 2-col gap */
	render(fullW: number): string[] {
		const margin = 2;
		const innerW = Math.max(10, fullW - margin * 2);
		const t = this.theme;

		// ── Render body content at inner width ──
		const bodyLines = this.body.render(innerW - 2); // -2 for side borders

		// ── Assemble lines ──
		const topBorder = this.title
			? this.makeTopBorder(innerW, t)
			: this.makeRule(innerW, HORIZ_TOP, CORNER_TL, CORNER_TR, t);
		const bottomBorder = this.makeRule(innerW, HORIZ_BOT, CORNER_BL, CORNER_BR, t);

		const result: string[] = [];

		// ── Top border ──
		result.push(...topBorder);

		// ── Title line (if any, between double top borders) ──
		if (this.title) {
			const titleLine = this.padCenter(this.title, innerW - 2);
			result.push(this.borderLine(titleLine, innerW, t));
			result.push(...this.makeRule(innerW, HORIZ_TOP, CORNER_TL, CORNER_TR, t));
		}

		// ── Body ──
		for (const line of bodyLines) {
			const padded = line + " ".repeat(Math.max(0, innerW - 2 - visibleWidth(line)));
			result.push(this.borderLine(padded, innerW, t));
		}

		// ── Footer hints ──
		for (const f of this.footerLines) {
			const padded = t.fg("dim", f) + " ".repeat(Math.max(0, innerW - 2 - visibleWidth(f)));
			result.push(this.borderLine(padded, innerW, t));
		}

		// ── Bottom border ──
		result.push(...bottomBorder);

		// ── Pad to full width with charcoal bg, preserving 2-col margin ──
		const bg = (s: string) => t.bg(OVERLAY_BG, s);
		const leftPad = " ".repeat(margin);
		return result.map((line) => bg(leftPad + line + " ".repeat(Math.max(0, fullW - margin - visibleWidth(line) - margin))));
	}

	/** No-op by default — override if you have animated children */
	invalidate(): void {
		this.body.invalidate();
	}

	// ─── Private helpers ──────────────────────────────────────────

	private makeTopBorder(w: number, t: ThemeProxy): string[] {
		const title = ` ${this.title} `;
		const leftW = Math.floor((w - 2 - title.length) / 2);
		const rightW = w - 2 - title.length - leftW;

		const left = HORIZ_TOP.repeat(leftW);
		const right = HORIZ_TOP.repeat(rightW);
		const top = t.fg(OVERLAY_BORDER_COLOR, `${CORNER_TL}${left}${t.fg("accent", title)}${right}${CORNER_TR}`);

		const bg = (s: string) => t.bg(OVERLAY_BG, s);
		const margin = 2;
		return [bg(" ".repeat(margin) + top + " ".repeat(Math.max(0, w - margin - visibleWidth(top) - margin)))];
	}

	private makeRule(w: number, h: string, tl: string, tr: string, t: ThemeProxy): string[] {
		const rule = t.fg(OVERLAY_BORDER_COLOR, `${tl}${h.repeat(w - 2)}${tr}`);
		const bg = (s: string) => t.bg(OVERLAY_BG, s);
		const margin = 2;
		return [bg(" ".repeat(margin) + rule + " ".repeat(Math.max(0, w - margin - visibleWidth(rule) - margin)))];
	}

	private borderLine(content: string, w: number, t: ThemeProxy): string {
		const left = t.fg(OVERLAY_BORDER_COLOR, VERT_REV);
		const right = t.fg(OVERLAY_BORDER_COLOR, VERT);
		return left + content + right;
	}

	private padCenter(s: string, target: number): string {
		const vis = visibleWidth(s);
		if (vis >= target) return s;
		const left = Math.floor((target - vis) / 2);
		const right = target - vis - left;
		return " ".repeat(left) + s + " ".repeat(right);
	}
}
