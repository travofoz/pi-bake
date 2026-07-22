import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { spawnAsync } from "../spawn-async.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Overlay } from "../components/overlay.ts";
import { bakeCtx, BAKE_BASE, PHASES_DIR, getPhaseList } from "./shared.ts";

/** Gather workspace info: git status, package.json, npm latest version. */
function getWorkspaceInfo(): string[] {
	const lines: string[] = [];

	// ── Git ──
	try {
		const branch = execSync("git branch --show-current 2>/dev/null", {
			encoding: "utf8",
			cwd: BAKE_BASE,
		}).trim();
		const lastCommit = execSync("git log --oneline -3 2>/dev/null", {
			encoding: "utf8",
			cwd: BAKE_BASE,
		})
			.trim()
			.split("\n")
			.filter(Boolean);
		const dirty = execSync("git status --porcelain 2>/dev/null", {
			encoding: "utf8",
			cwd: BAKE_BASE,
		}).trim();
		const dirtyCount = dirty ? dirty.split("\n").length : 0;
		lines.push(`branch: ${branch}`);
		if (dirtyCount > 0)
			lines.push(
				`dirty: ${dirtyCount} file${dirtyCount > 1 ? "s" : ""} uncommitted`,
			);
		else lines.push(`clean`);
		lines.push("");
		lines.push("recent commits:");
		for (const c of lastCommit) lines.push(`  ${c}`);
	} catch {
		lines.push("git: unavailable");
	}

	// ── package.json ──
	try {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(BAKE_BASE, "package.json"), "utf-8"),
		);
		lines.push("");
		lines.push(`package: ${pkg.name || "(no name)"}`);
		if (pkg.version) lines.push(`version: ${pkg.version}`);
		if (pkg.description) lines.push(`desc: ${pkg.description}`);
	} catch {
		lines.push("");
		lines.push("package.json: not found");
	}

	// ── npm latest version (async, non-blocking) ──
	try {
		const pkgName = JSON.parse(
			fs.readFileSync(path.join(BAKE_BASE, "package.json"), "utf-8"),
		).name;
		if (pkgName) {
			spawnAsync("npm", ["view", pkgName, "version"], {
				cwd: BAKE_BASE,
				timeout: 3000,
			}).then((result) => {
				const latest = (result.stdout || "").trim();
				if (latest) lines.push(`npm latest: ${latest}`);
			}).catch(() => {
				/* npm view failed — non-blocking, silently handled */
			});
		}
	} catch {
		/* package.json not found */
	}

	return lines;
}

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-detail", {
		description:
			"Browse all phases — v cycle view, j/k scroll, n/p phase, q close",
		handler: async (_args, cmdCtx) => {
			const bake = bakeCtx.bake;
			if (!bake) return;
			const t = cmdCtx.ui.theme;

			// Gather phases from both active dir and completed archive
			const allPhases = [
				...new Set([
					...getPhaseList(),
					...(bake.stateSnapshot.completedPhases || []),
					...(bake.stateSnapshot.skippedPhases || []),
				]),
			];
			if (allPhases.length === 0) {
				cmdCtx.ui.notify(t.fg("dim", "No phase files found"), "info");
				return;
			}

			// Determine starting index
			const state = bake.stateSnapshot;
			const startIdx = state.currentPhase
				? Math.max(0, allPhases.indexOf(state.currentPhase))
				: 0;

			let selectedIdx = startIdx;

			/** Read spec content for a phase from disk (or completed archive). */
			const readPhaseSpec = (name: string): string => {
				const paths = [
					path.join(PHASES_DIR, `${name}.md`),
					path.join(BAKE_BASE, ".bake", "completed", `${name}_PASS.md`),
				];
				for (const p of paths) {
					if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
				}
				return "(file not found)";
			};

			/** Get status icon/text/color for a phase. */
			const phaseStatus = (name: string, st: typeof state) => {
				if (st.completedPhases.includes(name))
					return { icon: "✓", color: "success" as const };
				if (st.skippedPhases.includes(name))
					return { icon: "⏸", color: "warning" as const };
				if (st.currentPhase === name)
					return { icon: "●", color: "accent" as const };
				return { icon: "○", color: "dim" as const };
			};

			/** Build the content body — all sections, as string array. No Component objects. */
			const buildBody = (
				theme: any,
				idx: number,
				st: typeof state,
				scrollOff = 0,
				maxLines = 20,
				contentW = 50,
				mode: "phases" | "events" | "spec" | "workspace" = "spec",
				eventOff = 0,
			): string[] => {
				const lines: string[] = [];
				const name = allPhases[idx];

				// ── Workspace info (cached) ──
				if (mode === "workspace") {
					lines.push(" " + theme.fg("accent", theme.bold("Workspace")));
					const info = workspaceInfo;
					const avail = Math.max(1, maxLines - 1);
					for (const line of info.slice(scrollOff, scrollOff + avail)) {
						const wrapped = wrapTextWithAnsi(line, contentW - 2);
						for (const w of wrapped)
							lines.push(theme.fg("muted", `  ${w}`));
					}
					if (info.length > avail) {
						const pct = Math.round(
							(scrollOff / Math.max(1, info.length - avail)) * 100,
						);
						const barW = Math.min(8, Math.max(3, contentW - 8));
						const thumb = Math.round((pct / 100) * (barW - 2));
						const bar =
							"▓".repeat(Math.max(0, thumb)) +
							"░" +
							"▓".repeat(Math.max(0, barW - 2 - thumb));
						lines.push(theme.fg("dim", ` ▐${bar}▌`));
					}
					return lines;
				}

				// ── Phase list (always shown, capped to available lines) ──
				const inPhases = mode === "phases";
				const maxPhases = Math.min(allPhases.length, Math.max(2, maxLines - 4));
				for (let i = 0; i < maxPhases; i++) {
					const p = allPhases[i];
					const s = phaseStatus(p, st);
					const isSelected = i === idx;
					const marker = isSelected
						? inPhases
							? theme.fg("accent", "▸")
							: theme.fg("dim", "▸")
						: " ";
					const icon =
						isSelected && inPhases
							? theme.fg("accent", s.icon)
							: theme.fg(s.color, s.icon);
					const label = isSelected
						? inPhases
							? theme.fg("accent", theme.bold(p))
							: theme.fg(s.color, theme.bold(p))
						: theme.fg(s.color, p);
					lines.push(" " + `${marker} ${icon} ${label}`);
				}
				if (allPhases.length > maxPhases)
					lines.push(
						" " + theme.fg("dim", `  ··· ${allPhases.length - maxPhases} more`),
					);

				// ── Event log ──
				const allEvents = bake!.eventLog.tail(500);
				const phaseEvents = allEvents
					.filter((e) => e.data?.phase === name || e.type === `phase_${name}`)
					.reverse();

				const inEvents = mode === "events";
				lines.push(
					" " + (inEvents
						? theme.fg("accent", theme.bold("Event Log"))
						: theme.fg("toolTitle", "Event Log")),
				);
				if (phaseEvents.length > 0) {
					const maxEv = Math.min(phaseEvents.length, Math.max(1, maxLines - 6));
					const evSlice = phaseEvents
						.slice(-12)
						.slice(eventOff, eventOff + maxEv);
					for (const e of evSlice) {
						const time = new Date(e.ts).toLocaleTimeString("en-US", {
							hour: "2-digit",
							minute: "2-digit",
						});
						const icon =
							e.type.includes("pass") || e.type.includes("complete")
								? theme.fg("success", "✓")
								: e.type.includes("fail") ||
										e.type.includes("crash") ||
										e.type.includes("error")
									? theme.fg("error", "✗")
									: e.type.includes("start")
										? theme.fg("accent", "●")
										: e.type === "skip_phase"
											? theme.fg("warning", "⏸")
											: theme.fg("dim", "·");
						const evShort = e.type
							.replace("phase_", "")
							.replace("pipeline_", "")
							.slice(0, 18);
						lines.push(
							`  ${icon} ${theme.fg("dim", time)} ${theme.fg("muted", evShort)}`,
						);
					}
				} else {
					lines.push(" " + theme.fg("dim", "  no events"));
				}

				// ── Spec content ──
				const spec = readPhaseSpec(name);
				const contentLines: string[] = [];
				let inSection = false;
				for (const line of spec.split("\n").filter(Boolean)) {
					if (line.startsWith("## ")) {
						inSection = true;
						const h = line.replace("## ", "");
						for (const w of wrapTextWithAnsi(h, contentW - 2))
							contentLines.push(`  ${w}`);
					} else if (inSection && line.trim()) {
						for (const w of wrapTextWithAnsi(line, contentW - 4))
							contentLines.push("    " + w);
					}
				}

				lines.push("");
				lines.push(
					" " + (mode === "spec"
						? theme.fg("accent", theme.bold("Spec"))
						: theme.fg("toolTitle", "Spec")),
				);
				const specAvail = Math.max(1, maxLines - 6);
				const visible = contentLines.slice(scrollOff, scrollOff + specAvail);
				for (const v of visible)
					lines.push(theme.fg("muted", v));

				if (contentLines.length > specAvail) {
					const pct = Math.round(
						(scrollOff / Math.max(1, contentLines.length - specAvail)) * 100,
					);
					const barW = Math.min(8, Math.max(3, contentW - 8));
					const thumb = Math.round((pct / 100) * (barW - 2));
					const bar =
						"▓".repeat(Math.max(0, thumb)) +
						"░" +
						"▓".repeat(Math.max(0, barW - 2 - thumb));
					lines.push(
						theme.fg(
							"dim",
							` ▐${bar}▌ ${scrollOff + 1}–${Math.min(scrollOff + specAvail, contentLines.length)}/${contentLines.length}`,
						),
					);
				}

				return lines;
			};

			// ── State ──
			let scrollOffset = 0;
			const specLineCount = (idx: number): number => {
				const spec = readPhaseSpec(allPhases[idx]);
				let count = 0,
					inS = false;
				for (const l of spec.split("\n").filter(Boolean)) {
					if (l.startsWith("## ")) {
						inS = true;
						count++;
					} else if (inS && l.trim()) {
						count++;
					}
				}
				return count;
			};
			const workspaceInfo = getWorkspaceInfo();
			let eventScroll = 0;
			let mode: "phases" | "events" | "spec" | "workspace" = "spec";

			bakeCtx.widgetHidden = true;
			try {
				await cmdCtx.ui.custom<void>(
					(tui, theme, _kb, done) => {
						if (selectedIdx >= allPhases.length) selectedIdx = 0;

						const rows = tui.terminal.rows || 24;
						const cols = tui.terminal.columns || 80;
						const maxSpec = Math.max(3, rows - 6);
						const specW = Math.max(12, cols - 6);

						// Single overlay — never recreated, so animStart doesn't reset
						const ov = new Overlay(theme, {
							title: "Phase Detail",
							maxHeight: Math.max(4, rows - 1),
						});

						// Body component reads mutable state on each render
						const bodyComponent = {
							render: (_w: number): string[] => {
								return buildBody(
									theme, selectedIdx, bake!.stateSnapshot,
									scrollOffset, maxSpec, specW, mode, eventScroll,
								);
							},
							invalidate: () => {},
						};
						ov.addBody(bodyComponent);

						const modeTag = () =>
							mode === "phases"
								? theme.fg("accent", "PHS")
								: mode === "events"
									? theme.fg("accent", "EVT")
									: mode === "workspace"
										? theme.fg("accent", "WRK")
										: "spc";
						const legend =
							cols >= 48
								? `v:cyc j:dn k:up n/p:ph r:rt s:sk q:q`
								: `v j k n p r s q`;
						ov.addFooter(`${modeTag()} ${legend}`);

						const rebuild = () => {
							tui.requestRender();
						};

						return {
							render: (w: number) => ov!.render(w),
							invalidate: () => ov!.invalidate(),
							handleInput: (data: string) => {
								// v / c: cycle view
								if (data === "v" || data === "c") {
									const cycle: ("phases" | "events" | "spec" | "workspace")[] =
										["phases", "events", "spec", "workspace"];
									const ci = cycle.indexOf(mode);
									mode = cycle[(ci + 1) % cycle.length];
									rebuild();
								} else if (data === "k") {
									if (mode === "phases" && selectedIdx > 0) {
										selectedIdx--;
										scrollOffset = 0;
										eventScroll = 0;
										rebuild();
									} else if (mode === "events" && eventScroll > 0) {
										eventScroll--;
										rebuild();
									} else if (scrollOffset > 0) {
										scrollOffset--;
										rebuild();
									}
								} else if (data === "j") {
									if (mode === "phases" && selectedIdx < allPhases.length - 1) {
										selectedIdx++;
										scrollOffset = 0;
										eventScroll = 0;
										rebuild();
									} else if (mode === "events" && eventScroll < 6) {
										eventScroll++;
										rebuild();
									} else {
										const total =
											mode === "workspace"
												? workspaceInfo.length
												: specLineCount(selectedIdx);
										if (scrollOffset < Math.max(0, total - 4)) {
											scrollOffset++;
											rebuild();
										}
									}
								} else if (data === "n" && selectedIdx < allPhases.length - 1) {
									selectedIdx++;
									scrollOffset = 0;
									eventScroll = 0;
									rebuild();
								} else if (data === "p" && selectedIdx > 0) {
									selectedIdx--;
									scrollOffset = 0;
									eventScroll = 0;
									rebuild();
								} else if (data === "r") {
									bake?.retryAttempt();
									done(undefined);
								} else if (data === "s") {
									bake?.skipPhase(allPhases[selectedIdx]);
									done(undefined);
								} else if (data === "q" || data === "\x1b") {
									done(undefined);
								}
							},
							dispose: () => ov!.dispose(),
						};
					},
					{ overlay: true },
				);
			} finally {
				bakeCtx.widgetHidden = false;
				bakeCtx.requestWidgetRender?.();
			}
		},
	});
}
