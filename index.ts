/**
 * ─═══[ bake ]═══─
 *
 *  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 *  █  bake  —  pi extension for autonomous phase execution   █
 *  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
 *
 *  Thin entry point: registers all commands at module level,
 *  then initializes Bake, widget, status line, and loader
 *  callbacks on session_start.
 *
 * ─═══[ CREDITS ]═══─
 *
 *  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 *  █  dehuman@lotek.org  —  #614  —  #2600  #rave  #tracker  █
 *  █  #freebsdhelp #614 #hp #740 #drumandbass  —  EFnet 95-03  █
 *  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
 *
 *  dehuman   Lion-gv    Paradyme   Monad      3Jane
 *  Pr0zac    Palmore    Chexbitz   Caz        Badfish
 *  The Wiz   Roy        Mike J     Seth       Tomo
 *  Ewheat RIP           Keebler RIP
 *
 * ─═══[ EOF ]═══─
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

import { Bake } from "./bake.ts";
import { registerAll } from "./commands/index.ts";
import {
	bakeCtx,
	BAKE_BASE,
	WORKSPACE_DIR,
	PHASES_DIR,
	RULES_DIR,
	WIDGET_ID,
	getPhaseList,
	loadConfig,
} from "./commands/shared.ts";
import { scannerTaper, type ThemeProxy } from "./components/overlay.ts";

// ThemeProxy has {fg, bg} — used by BakeWidget for scannerTaper / phase rendering
type AnimTheme = ThemeProxy;

// ─── Widget component (Component interface — rendered by TUI, no setWidget spam) ───
class BakeWidget implements Component {
	private theme: AnimTheme;
	private renderCount = 0;

	constructor(theme: AnimTheme) {
		this.theme = theme;
	}

	/** Reset scanner animation counter — called after bake-reset. */
	reset(): void {
		this.renderCount = 0;
	}

	invalidate() {}

	render(width: number): string[] {
		const t = this.theme;
		// Bail if overlay is open (widget hidden by overlay commands)
		if (bakeCtx.widgetHidden) return [];
		const cfg = loadConfig();
		if (cfg.widgetMode === "hidden") return [];

		const state = bakeCtx.bake?.stateSnapshot;
		if (!state) return [];
		const allPhases = getPhaseList();
		if (allPhases.length === 0) {
			return [t.fg("dim", "Bake idle. Use /bake-start to begin.")];
		}

		if (cfg.widgetMode === "compact") {
			const parts: string[] = [];
			const active = state.activePhases || [];
			if (active.length > 1) {
				parts.push(
					`${t.fg("success", "●")} ${t.fg("accent", `${active.length} phases`)}`,
				);
			} else if (state.currentPhase) {
				parts.push(
					`${t.fg("success", "●")} ${t.fg("accent", state.currentPhase)}`,
				);
			}
			const done = state.completedPhases.length + state.skippedPhases.length;
			const pending = allPhases.length - done;
			if (state.completedPhases.length)
				parts.push(`${t.fg("success", `✓${state.completedPhases.length}`)}`);
			if (state.skippedPhases.length)
				parts.push(`${t.fg("warning", `⏸${state.skippedPhases.length}`)}`);
			if (pending > 0) parts.push(`${t.fg("dim", `○${pending}`)}`);
			const label =
				state.status === "idle"
					? t.fg("dim", "idle")
					: state.status === "done"
						? t.fg("success", "done")
						: state.status === "failed"
							? t.fg("error", "failed")
							: t.fg("accent", state.status);
			parts.push(label);
			return [parts.join("  ")];
		}

		// Full mode — render-counter-based scanner (advances on each render call only)
		this.renderCount++;
		const scanPos = Math.abs(Math.sin(this.renderCount * 0.06));
		const doneCount = state.completedPhases.length + state.skippedPhases.length;
		const phaseLines = allPhases.map((phase, idx) => {
			if (state.completedPhases.includes(phase)) {
				return ` ${t.fg("success", "✓")} ${t.fg("muted", phase)}`;
			}
			if (state.skippedPhases.includes(phase)) {
				return ` ${t.fg("warning", "⏸")} ${t.fg("muted", phase)}`;
			}
			// Active (concurrently running with others) or current (single)
			if (state.activePhases?.includes(phase) || state.currentPhase === phase) {
				return `${t.fg("success", "●")} ${t.fg("accent", phase)}`;
			}
			if (idx < doneCount) {
				return ` ${t.fg("dim", "○")} ${t.fg("dim", phase)}`;
			}
			return ` ${t.fg("dim", "○")} ${t.fg("dim", phase)}`;
		});

		// Show active phase count in header suffix when parallel
		const activeCount = state.activePhases?.length || 0;
		const headerLabel =
			activeCount > 1 ? `bake (${activeCount} active)` : "bake";
		const header = scannerTaper(width - 2, scanPos, t, headerLabel);
		return [header, ...phaseLines];
	}
}

export default function (pi: ExtensionAPI) {
	// Guard: session_start listeners accumulate on /reload.
	// Without this, each reload spawns a new Bake + RPC agent + timer,
	// and old instances orphan with no cleanup.
	let initialized = false;

	registerAll(pi);

	// ── session_start: one-time init ──
	pi.on("session_start", async (_event, ctx) => {
		if (initialized) return; // /reload guard — skip re-init to avoid leaks
		initialized = true;

		bakeCtx.bake = new Bake(BAKE_BASE, WORKSPACE_DIR, RULES_DIR);

		// Ensure workspace dir exists + root symlink
		if (!fs.existsSync(WORKSPACE_DIR)) {
			fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
		}
		const wsLink = path.join(BAKE_BASE, "workspace");
		try {
			if (!fs.existsSync(wsLink)) {
				fs.symlinkSync(WORKSPACE_DIR, wsLink, "dir");
			}
		} catch {
			/* non-fatal: workspace symlink is a convenience, not required */
		}

		if (!fs.existsSync(PHASES_DIR)) {
			fs.mkdirSync(PHASES_DIR, { recursive: true });
		}
		const phLink = path.join(BAKE_BASE, "phases");
		try {
			if (!fs.existsSync(phLink)) {
				fs.symlinkSync(PHASES_DIR, phLink, "dir");
			}
		} catch {
			/* non-fatal: phases symlink is a convenience, not required */
		}

		// Sanity-check state
		const initial = bakeCtx.bake.stateSnapshot;
		if (!["idle", "done"].includes(initial.status)) {
			const pendingPhases = getPhaseList().filter(
				(p) =>
					!initial.completedPhases.includes(p) &&
					!initial.skippedPhases.includes(p),
			);
			if (pendingPhases.length === 0) bakeCtx.bake.resetState();
		}

		const t = ctx.ui.theme;

		// ── Widget as a Component (no animation timer) ──
		// Scanner updates on user interaction and bake state changes only.
		// No timer = zero render contention with overlays/settings.
		ctx.ui.setWidget(WIDGET_ID, (tui: TUI, theme: Theme) => {
			bakeCtx.requestWidgetRender = () => tui.requestRender();
			const widget = new BakeWidget(theme);
			bakeCtx.widgetRef = widget;
			return widget;
		});

		// ── State change handler ──
		bakeCtx.bake.onStateChange((s) => {
			if (s.status === "done" || s.status === "failed" || s.status === "idle") {
				ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
			}
			// Reset widget scanner on clean/idle transition (bake-reset)
			if (s.status === "idle") {
				bakeCtx.widgetRef?.reset();
			}
		});

		// ── Status line ──
		bakeCtx.bake.onStatus((msg) =>
			ctx.ui.setStatus("bake", t.fg("accent", t.bold(`● ${msg}`))),
		);
		ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));

		// ── Status from loader ──
		bakeCtx.bake.onLoader((_show, msg) => {
			ctx.ui.setStatus("bake", t.fg("accent", t.bold(`● ${msg}`)));
		});
	});
}
