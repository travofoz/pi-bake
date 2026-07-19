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
import { visibleWidth } from "@earendil-works/pi-tui";
import { scannerTaper } from "./components/overlay.ts";

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

		// ── Responsive frame builder for working indicator ──
		// Just the braille scanner — no label, no text. Pi's Loader already appends message.
		const buildWorkingFrames = (cols: number) => {
			const W = Math.max(8, Math.floor((cols - 4) / 2)); // braille cells per side, full width
			const B = ["⠀", "⡀", "⡠", "⡦", "⡶", "⣶", "⣿"];
			const frames: string[] = [];
			const makeFrame = (spreadPos: number) => {
				const leftPos = W - 1 - spreadPos;
				const rightPos = spreadPos;
				const buildSide = (pos: number, len: number): string => {
					const cells: string[] = [];
					for (let i = 0; i < len; i++) {
						const dist = Math.abs(i - pos);
						const centerFactor = 1 - Math.abs(pos - (len - 1) / 2) / ((len - 1) / 2);
						const spread = 2 + Math.floor(centerFactor * 4);
						const b = Math.max(0, Math.min(6, spread - dist));
						cells.push(t.fg(
							b >= 5 ? "accent" : b >= 3 ? "muted" : b >= 1 ? "dim" : "muted",
							B[b],
						));
					}
					return cells.join("");
				};
				const leftScan = buildSide(leftPos, W);
				// Mirror of left scan, not re-computed — reuse same cells reversed
				const rightScan = buildSide(rightPos, W);
				const content = leftScan + "  " + rightScan;
				const cw = visibleWidth(content);
				const pad = Math.max(0, Math.floor((cols - cw) / 2));
				return " ".repeat(pad) + content + " ".repeat(cols - pad - cw);
			};
			for (let p = 0; p < W; p++) frames.push(makeFrame(p));
			for (let p = W - 2; p >= 0; p--) frames.push(makeFrame(p));
			return frames;
		};

		// ── Initial working indicator at current terminal width ──
		// Clear the message text — pi's Loader appends it, we just want the animation
		ctx.ui.setWorkingMessage("");
		const initCols = process.stdout.columns || 80;
		ctx.ui.setWorkingIndicator({ frames: buildWorkingFrames(initCols), intervalMs: 60 });

		// ── Widget header scanner animation ──
		let widgetScanPos = 0;
		let widgetScanDir = 1;
		const widgetAnimTimer = setInterval(() => {
			widgetScanPos += widgetScanDir * 0.025;
			if (widgetScanPos >= 1) { widgetScanPos = 1; widgetScanDir = -1; }
			if (widgetScanPos <= 0) { widgetScanPos = 0; widgetScanDir = 1; }
			bakeCtx.requestWidgetRender?.();
		}, 50);

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

			// Full mode — animated pink/green scanner header + phase list
			const cols = process.stdout.columns || 80;
			const headerW = Math.max(30, cols - 4);
			const header = scannerTaper(headerW, widgetScanPos, t, "bake");
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
