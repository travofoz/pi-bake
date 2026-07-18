import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Text, Spacer } from "@earendil-works/pi-tui";
import { Border } from "../components/border.ts";
import { bakeCtx, WIDGET_ID } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-reset", {
		description: "Reset bake state — wipes workspace, completed phases, and event log",
		handler: async (_args, cmdCtx) => {
			const bake = bakeCtx.bake;
			if (!bake) return;
			const t = cmdCtx.ui.theme;

			const confirmed = await cmdCtx.ui.custom<boolean>(
				(_tui, theme, _kb, done) => {
					const container = new Container();
					container.addChild(new Border((s: string) => theme.fg("error", s)));
					container.addChild(new Text(theme.fg("error", theme.bold("Reset Bake Pipeline")), 1, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("warning", "This will destroy:"), 1, 0));
					container.addChild(new Text(theme.fg("text", "  • Workspace (build artifacts, node_modules)"), 2, 0));
					container.addChild(new Text(theme.fg("text", "  • Completed phase archives"), 2, 0));
					container.addChild(new Text(theme.fg("text", "  • Event log"), 2, 0));
					container.addChild(new Text(theme.fg("text", "  • Pipeline state"), 2, 0));
					container.addChild(new Text(theme.fg("text", "  • Decomposed spec archive"), 2, 0));
					container.addChild(new Text(theme.fg("text", "  • Spec context"), 2, 0));
					container.addChild(new Spacer(1));
					container.addChild(
						new Text(
							theme.fg("muted", "Phase specs and archived specs are kept. Git history is untouched."),
							1,
							0,
						),
					);
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", "enter  confirm  ·  any other key  cancel"), 1, 0));
					container.addChild(new Border((s: string) => theme.fg("error", s)));

					return {
						render: (w) => container.render(w),
						invalidate: () => container.invalidate(),
						handleInput: (data: string) => {
							if (data === "enter" || data === "\r") {
								done(true);
							} else {
								done(false);
							}
						},
					};
				},
				{ overlay: true },
			);

			if (!confirmed) {
				cmdCtx.ui.notify(t.fg("dim", "Reset cancelled"), "info");
				return;
			}

			bake.clean();
			cmdCtx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
			bakeCtx.requestWidgetRender?.();
			cmdCtx.ui.setWidget(WIDGET_ID, [t.fg("dim", "Bake idle. Use /bake-start to begin.")]);
			cmdCtx.ui.notify(t.fg("success", "Bake pipeline reset"), "info");
		},
	});
}
