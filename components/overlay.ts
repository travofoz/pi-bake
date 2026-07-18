/**
 * Overlay wrapper — clean NFO-style chrome for bake dialogs.
 *
 *   ──═[ Bake Config ]═─────────────────────────────
 *
 *       Content lines indented 4 spaces
 *
 *       ↑↓ navigate  ·  ← → change
 *
 *   ─────────────────────────────────────────────────
 *
 * Background: charcoal dark grey (#181820), 2-col gap
 * from terminal edges. No side borders — just clean
 * horizontal rules top and bottom with inline title.
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

		// ── Top rule with title ──
		if (this.title) {
			const titleStr = `═[ ${t.fg("text", this.title)} ]`;
			const titleVis = visibleWidth(titleStr);
			const dashes = Math.max(0, innerW - titleVis);
			result.push(a("──" + titleStr + "═".repeat(dashes)));
		} else {
			result.push(a("──═".repeat(Math.ceil(innerW / 3)).slice(0, innerW)));
		}

		// Blank line after top rule
		result.push("");

		// ── Body content ──
		const indent = 4;
		const bodyLines = this.body.render(innerW - indent);
		for (const line of bodyLines) {
			result.push(" ".repeat(indent) + line);
		}

		// ── Separator before footer ──
		if (this.footerLines.length > 0) {
			result.push("");
		}

		// ── Footer hints ──
		for (const f of this.footerLines) {
			result.push(" ".repeat(indent) + dim(f));
		}

		// ── Bottom rule ──
		if (this.footerLines.length > 0) {
			result.push("");
		}
		result.push(a("──═".repeat(Math.ceil(innerW / 3)).slice(0, innerW)));

		// ── Pad with charcoal bg + margin ──
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
