import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { showLoaderOverlay } from "../lib/overlay.ts";
import { bakeCtx } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-start", {
		description: "Start or resume the bake pipeline",
		handler: async (_args, cmdCtx) => {
			const bake = bakeCtx.bake;
			if (!bake) return;
			const t = cmdCtx.ui.theme;

			cmdCtx.ui.setStatus("bake", t.fg("accent", "○ Starting pipeline..."));

			bakeCtx.loaderMsg = "Starting pipeline...";

			const overlay = showLoaderOverlay(
				cmdCtx.ui,
				() => bakeCtx.loaderMsg,
				() => bake?.abort(),
				() => {
					bakeCtx.closeLoader = overlay.close;
				},
			);

			cmdCtx.ui.notify(t.fg("success", "Pipeline started — TUI stays responsive"), "info");

			try {
				await bake.runPipeline();
			} finally {
				overlay.close();
				bakeCtx.closeLoader = null;
			}
		},
	});
}
