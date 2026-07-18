import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Text, Spacer } from "@earendil-works/pi-tui";
import { Border } from "../components/border.ts";
import { bakeCtx, BAKE_BASE, PHASES_DIR, getPhaseList } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-detail", {
		description: "Browse all phases with spec details. ↑↓ navigate, r retry, s skip",
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
			const startIdx = state.currentPhase ? Math.max(0, allPhases.indexOf(state.currentPhase)) : 0;

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
				if (st.completedPhases.includes(name)) return { icon: "✓", color: "success" as const };
				if (st.skippedPhases.includes(name)) return { icon: "⏸", color: "warning" as const };
				if (st.currentPhase === name) return { icon: "●", color: "accent" as const };
				return { icon: "○", color: "dim" as const };
			};

			/** Build the overlay content for the selected phase — event-log-driven. */
			const buildContent = (theme: any, idx: number, st: typeof state) => {
				const container = new Container();
				const name = allPhases[idx];

				// ── Phase list (compact) ──
				for (let i = 0; i < allPhases.length; i++) {
					const p = allPhases[i];
					const s = phaseStatus(p, st);
					const marker = i === idx ? theme.fg("accent", "▸") : " ";
					const icon = theme.fg(s.color, s.icon);
					const label = i === idx ? theme.fg("accent", theme.bold(p)) : theme.fg(s.color, p);
					container.addChild(new Text(`${marker} ${icon} ${label}`, 1, 0));
				}
				container.addChild(new Border((s: string) => theme.fg("borderMuted", s)));

				// ── Event timeline for this phase ──
				const allEvents = bake!.eventLog.tail(500);
				const phaseEvents = allEvents.filter((e) => e.data?.phase === name || e.type === `phase_${name}`).reverse();

				if (phaseEvents.length > 0) {
					container.addChild(new Text(theme.fg("toolTitle", "Event Log"), 1, 0));
					for (const e of phaseEvents.slice(-20)) {
						const time = new Date(e.ts).toLocaleTimeString("en-US", {
							hour: "2-digit",
							minute: "2-digit",
							second: "2-digit",
						});
						let icon: string;
						if (e.type.includes("pass") || e.type.includes("complete") || e.type === "phase_pass") {
							icon = theme.fg("success", "✓");
						} else if (
							e.type.includes("fail") ||
							e.type.includes("crash") ||
							e.type.includes("error") ||
							e.type.includes("breaker") ||
							e.type === "pipeline_halted"
						) {
							icon = theme.fg("error", "✗");
						} else if (e.type.includes("start")) {
							icon = theme.fg("accent", "●");
						} else if (e.type === "skip_phase") {
							icon = theme.fg("warning", "⏸");
						} else {
							icon = theme.fg("dim", "·");
						}
						let detail = e.type;
						if (e.data?.findings) detail += ` (${e.data.findings})`;
						container.addChild(new Text(`  ${icon} ${theme.fg("dim", time)} ${theme.fg("muted", detail)}`, 0, 0));
					}
				} else {
					container.addChild(new Text(theme.fg("dim", "  No events yet"), 1, 0));
				}

				// ── Spec content (compact) ──
				const spec = readPhaseSpec(name);
				const specLines = spec.split("\n").filter(Boolean);
				let inSection = false;
				let shown = 0;
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("toolTitle", "Spec"), 1, 0));
				for (const line of specLines) {
					if (line.startsWith("## ")) {
						inSection = true;
						container.addChild(new Text(theme.fg("toolTitle", `  ${line.replace("## ", "")}`), 0, 0));
					} else if (inSection && line.trim()) {
						if (shown < 8) {
							container.addChild(new Text(theme.fg("muted", `    ${line}`), 0, 0));
							shown++;
						}
					}
				}

				container.addChild(new Spacer(1));
				container.addChild(
					new Text(theme.fg("dim", "↑↓ browse  ·  r retry  ·  s skip  ·  esc/q close"), 1, 0),
				);
				container.addChild(new Border((s: string) => theme.fg("borderMuted", s)));

				return container;
			};

			await cmdCtx.ui.custom<void>(
				(_tui, theme, _kb, done) => {
					if (selectedIdx >= allPhases.length) selectedIdx = 0;

					let currentContainer = buildContent(theme, selectedIdx, bake!.stateSnapshot);

					const rebuild = () => {
						currentContainer = buildContent(theme, selectedIdx, bake!.stateSnapshot);
					};

					return {
						render: (w: number) => currentContainer.render(w),
						invalidate: () => currentContainer.invalidate(),
						handleInput: (data: string) => {
							if (data === "up" || data === "k") {
								if (selectedIdx > 0) {
									selectedIdx--;
									rebuild();
								}
							} else if (data === "down" || data === "j") {
								if (selectedIdx < allPhases.length - 1) {
									selectedIdx++;
									rebuild();
								}
							} else if (data === "r") {
								bake?.retryAttempt();
								done(undefined);
							} else if (data === "s") {
								const phaseName = allPhases[selectedIdx];
								bake?.skipPhase(phaseName);
								done(undefined);
							} else if (data === "q" || data === "escape") {
								done(undefined);
							}
						},
					};
				},
				{ overlay: true },
			);
		},
	});
}
