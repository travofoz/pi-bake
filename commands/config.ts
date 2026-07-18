import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type SettingsListTheme, SettingsList, Container, Text } from "@earendil-works/pi-tui";
import { Border } from "../components/border.ts";
import { bakeCtx, loadConfig, saveConfig } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-config", {
		description: "Open bake settings — widget mode, preferences",
		handler: async (_args, cmdCtx) => {
			const t = cmdCtx.ui.theme;
			const cfg = loadConfig();

			interface SettingItem {
				id: string;
				label: string;
				description?: string;
				currentValue: string;
				values: string[];
			}

			const items: SettingItem[] = [
				{
					id: "widgetMode",
					label: "Widget mode",
					description:
						cfg.widgetMode === "full"
							? "List all phases (tall — needs vertical space)"
							: cfg.widgetMode === "compact"
								? "Single-line summary (phone-friendly)"
								: "Widget hidden entirely",
					currentValue: cfg.widgetMode,
					values: ["full", "compact", "hidden"],
				},
			];

			await cmdCtx.ui.custom<void>(
				(_tui, theme, _kb, done) => {
					const container = new Container();
					container.addChild(new Border((s: string) => theme.fg("accent", s)));
					container.addChild(new Text(theme.fg("accent", theme.bold("Bake Config")), 1, 0));

					const settingsTheme: SettingsListTheme = {
						label: (s, _sel) => theme.fg("text", s),
						value: (s, sel) => (sel ? theme.fg("accent", theme.bold(s)) : theme.fg("muted", s)),
						description: (s) => theme.fg("dim", s),
						cursor: theme.fg("accent", "▸"),
						hint: (s) => theme.fg("dim", s),
					};
					const settingsList = new SettingsList(
						items,
						8,
						settingsTheme,
						(id, newValue) => {
							const updated = loadConfig();
							(updated as any)[id] = newValue;
							saveConfig(updated);
							// Re-render widget
							bakeCtx.requestWidgetRender?.();
							// Update description for this item
							const desc =
								newValue === "full"
									? "List all phases (tall — needs vertical space)"
									: newValue === "compact"
										? "Single-line summary (phone-friendly)"
										: "Widget hidden entirely";
							items[0].description = desc;
							items[0].currentValue = newValue;
						},
						() => done(undefined),
						{ enableSearch: false },
					);
					container.addChild(settingsList);

					container.addChild(
						new Text(
							theme.fg("dim", "↑↓ navigate  ·  ← → / space change  ·  esc close"),
							1,
							0,
						),
					);
					container.addChild(new Border((s: string) => theme.fg("accent", s)));

					return {
						render: (w) => container.render(w),
						invalidate: () => container.invalidate(),
						handleInput: (data) => settingsList.handleInput?.(data),
					};
				},
				{ overlay: true },
			);
		},
	});
}
