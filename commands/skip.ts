import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Text, SelectList } from "@earendil-works/pi-tui";
import { Border } from "../components/border.ts";
import { bakeCtx, getPhaseList } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-skip", {
		description: "Skip a phase. With no args, opens a picker.",
		usage: "[phase-name]",
		handler: async (args, cmdCtx) => {
			const bake = bakeCtx.bake;
			if (!bake) return;
			const t = cmdCtx.ui.theme;
			const state = bake.stateSnapshot;

			// If a phase name is given directly, skip it
			if (args) {
				// Handle both string args and parsed-object args
				// (pi may parse `[phase-name]` into an object)
				const phaseName = typeof args === "string" ? args : String(args._?.[0] || args[0] || "");
				if (phaseName) {
					bake.skipPhase(phaseName);
					cmdCtx.ui.notify(t.fg("warning", `Skipped: ${phaseName}`), "info");
				} else {
					cmdCtx.ui.notify(t.fg("error", "Usage: /bake-skip <phase-name>"), "info");
				}
				return;
			}

			// Otherwise show a picker of uncompleted phases
			const allPhases = getPhaseList();
			const pending = allPhases.filter(
				(p) => !state.completedPhases.includes(p) && !state.skippedPhases.includes(p),
			);
			if (pending.length === 0) {
				cmdCtx.ui.notify(t.fg("dim", "No phases to skip"), "info");
				return;
			}

			const items = pending.map((p) => ({
				value: p,
				label: p === state.currentPhase ? `${p} (current)` : p,
				description: p === state.currentPhase ? "Currently running phase" : undefined,
			}));

			const selected = await cmdCtx.ui.custom<string | null>(
				(_tui, theme, _kb, done) => {
					const container = new Container();
					container.addChild(new Border((s: string) => theme.fg("warning", s)));
					container.addChild(new Text(theme.fg("warning", theme.bold("Skip Phase")), 1, 0));

					const list = new SelectList(items, Math.min(items.length, 10), {
						selectedPrefix: (s) => theme.fg("warning", s),
						selectedText: (s) => theme.fg("text", s),
						description: (s) => theme.fg("muted", s),
						scrollInfo: (s) => theme.fg("dim", s),
						noMatch: (s) => theme.fg("error", s),
					});
					list.onSelect = (v) => done(v);
					list.onCancel = () => done(null);
					container.addChild(list);

					container.addChild(
						new Text(theme.fg("dim", "↑↓ navigate  ·  enter skip  ·  esc cancel"), 1, 0),
					);
					container.addChild(new Border((s: string) => theme.fg("warning", s)));

					return {
						render: (w) => container.render(w),
						invalidate: () => container.invalidate(),
						handleInput: (data) => list.handleInput(data),
					};
				},
				{ overlay: true },
			);

			if (selected) {
				bake.skipPhase(selected);
				cmdCtx.ui.notify(t.fg("warning", `Skipped: ${selected}`), "info");
			}
		},
	});
}
