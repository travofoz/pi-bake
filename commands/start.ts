import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { LoaderComponent } from "../components/loader.ts";
import { bakeCtx } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-start", {
		description: "Start or resume the bake pipeline",
		handler: async (_args, cmdCtx) => {
			const bake = bakeCtx.bake;
			if (!bake) return;
			const t = cmdCtx.ui.theme;

			cmdCtx.ui.setStatus("bake", t.fg("accent", "○ Starting pipeline..."));

			// ── Show BorderedLoader overlay ──
			let loaderDone: (() => void) | null = null;
			bakeCtx.loaderMsg = "Starting pipeline...";

			const loaderP = cmdCtx.ui.custom(
				(tui, theme, _kb, done) => {
					loaderDone = () => {
						try {
							done(undefined);
						} catch {
							/* already closed */
						}
					};
					const comp = new LoaderComponent(tui, theme.fg.bind(theme), theme.bg.bind(theme), () => bakeCtx.loaderMsg);

					return {
						render: (w: number) => comp.render(w),
						invalidate: () => {},
						handleInput: (data: string) => {
							if (data === "escape" || data === "q") {
								bake?.abort();
							}
						},
						dispose: () => {
							comp.dispose();
						},
					};
				},
				{
					overlay: true,
					overlayOptions: {
						anchor: "bottom-center",
						margin: 1,
					},
					onHandle: (_handle) => {
						bakeCtx.closeLoader = () => {
							if (loaderDone) loaderDone();
							loaderDone = null;
						};
					},
				},
			);

			cmdCtx.ui.notify(t.fg("success", "Pipeline started — TUI stays responsive"), "info");

			try {
				await bake.runPipeline();
			} finally {
				if (loaderDone) {
					loaderDone();
					loaderDone = null;
					bakeCtx.closeLoader = null;
				}
				// Ensure loaderP doesn't leak unhandled rejection if already resolved
				loaderP.catch(() => {});
			}
		},
	});
}
