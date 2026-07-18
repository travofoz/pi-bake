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
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Bake } from "./bake.ts";
import { registerAll } from "./commands/index.ts";
// widget animation removed — driven by state changes only
import {
	bakeCtx,
	BAKE_BASE,
	WORKSPACE_DIR,
	PHASES_DIR,
	RULES_DIR,
	WIDGET_ID,
	getPhaseList,
	loadConfig,
} from "./commands/ctx.ts";

export default function (pi: ExtensionAPI) {
	// Register all 14 bake commands at module level (once per /reload, never duplicated)
	registerAll(pi);

	// ── session_start: initialize bake, widget, footer, status line ──
	pi.on("session_start", async (_event, ctx) => {
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
			// non-fatal
		}

		// Ensure phases dir exists + root symlink
		if (!fs.existsSync(PHASES_DIR)) {
			fs.mkdirSync(PHASES_DIR, { recursive: true });
		}
		const phLink = path.join(BAKE_BASE, "phases");
		try {
			if (!fs.existsSync(phLink)) {
				fs.symlinkSync(PHASES_DIR, phLink, "dir");
			}
		} catch {
			// non-fatal
		}

		// Sanity-check: if state says running/paused but there's no active pipeline, reset to idle
		const initial = bakeCtx.bake.stateSnapshot;
		if (!["idle", "done"].includes(initial.status)) {
			const pendingPhases = getPhaseList().filter(
				(p) => !initial.completedPhases.includes(p) && !initial.skippedPhases.includes(p),
			);
			if (pendingPhases.length === 0) {
				bakeCtx.bake.resetState();
			}
		}

		const t = ctx.ui.theme;

		// ── Widget: multi-line phase progress panel ──
		// No animation timers — updates driven solely by onStateChange

		const renderWidget = () => {
			const cfg = loadConfig();
			if (cfg.widgetMode === "hidden") return [];

			const state = bakeCtx.bake!.stateSnapshot;
			const allPhases = getPhaseList();
			if (allPhases.length === 0) {
				return [t.fg("dim", "Bake idle. Use /bake-start to begin.")];
			}

			if (cfg.widgetMode === "compact") {
				const parts: string[] = [];
				if (state.currentPhase) {
					const a =
						state.currentAttempt >= 0
							? `(${Math.min(state.currentAttempt + 1, state.maxAttempts)}/${state.maxAttempts})`
							: "";
					parts.push(
						`${t.fg("success", "●")} ${t.fg("accent", state.currentPhase)}${a ? ` ${t.fg("warning", a)}` : ""}`,
					);
				}
				const done = state.completedPhases.length + state.skippedPhases.length;
				const pending = allPhases.length - done;
				if (state.completedPhases.length) parts.push(`${t.fg("success", `✓${state.completedPhases.length}`)}`);
				if (state.skippedPhases.length) parts.push(`${t.fg("warning", `⏸${state.skippedPhases.length}`)}`);
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

			// Full mode — plain phase list
			const header = t.fg("borderAccent", `──═[ bake ]═──`);
			const phaseLines = allPhases.map((phase) => {
				if (state.completedPhases.includes(phase)) {
					return ` ${t.fg("success", "✓")} ${t.fg("muted", phase)}`;
				}
				if (state.skippedPhases.includes(phase)) {
					return ` ${t.fg("warning", "⏸")} ${t.fg("muted", phase)}`;
				}
				if (state.currentPhase === phase) {
					const attempt =
						state.currentAttempt >= 0
							? ` (${Math.min(state.currentAttempt + 1, state.maxAttempts)}/${state.maxAttempts})`
							: "";
					return `${t.fg("success", "●")} ${t.fg("accent", phase)}${t.fg("warning", attempt)}`;
				}
				const doneCount = state.completedPhases.length + state.skippedPhases.length;
				const idx = allPhases.indexOf(phase);
				if (idx < doneCount) {
					return ` ${t.fg("dim", "○")} ${t.fg("dim", phase)}`;
				}
				return ` ${t.fg("dim", "○")} ${t.fg("dim", phase)}`;
			});
			return [header, ...phaseLines];
		};

		bakeCtx.requestWidgetRender = () => {
			ctx.ui.setWidget(WIDGET_ID, renderWidget());
		};

		ctx.ui.setWidget(WIDGET_ID, renderWidget());
		bakeCtx.bake.onStateChange((s) => {
			bakeCtx.requestWidgetRender?.();
			if (s.status === "done" || s.status === "failed" || s.status === "idle") {
				ctx.ui.setWorkingIndicator();
				ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
				if (bakeCtx.closeLoader) {
					bakeCtx.closeLoader();
					bakeCtx.closeLoader = null;
				}
			}
		});

		// ── Status line ──
		bakeCtx.bake.onStatus((msg) => ctx.ui.setStatus("bake", t.fg("accent", t.bold(`● ${msg}`))));
		ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));

		// ── Loader: track message updates ──
		bakeCtx.bake.onLoader((show, msg) => {
			bakeCtx.loaderMsg = msg;
			ctx.ui.setStatus("bake", t.fg("accent", t.bold(`● ${msg}`)));
			if (!show && bakeCtx.closeLoader) {
				bakeCtx.closeLoader();
				bakeCtx.closeLoader = null;
			}
		});
	});
}
