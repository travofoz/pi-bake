import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type SettingsListTheme, SettingsList, Container, Text } from "@earendil-works/pi-tui";
import { Border } from "../components/border.ts";
import { RULES_DIR, RULES_STATE_FILE, loadRulesState, saveRulesState, getRuleFiles } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-rules", {
		description: "View and toggle ast-grep audit rules",
		handler: async (_args, cmdCtx) => {
			const t = cmdCtx.ui.theme;
			const ruleFiles = getRuleFiles();
			if (ruleFiles.length === 0) {
				cmdCtx.ui.notify(t.fg("dim", "No rules found in rules/base/"), "info");
				return;
			}

			const rulesState = loadRulesState();
			// All rules enabled by default
			for (const f of ruleFiles) {
				if (rulesState[f] === undefined) rulesState[f] = true;
			}

			// Parse severity from rule file content (heuristic: look for "severity:")
			const getSeverity = (file: string): string => {
				const p = path.join(RULES_DIR, "base", file);
				try {
					const content = fs.readFileSync(p, "utf-8");
					const m = content.match(/severity[:\s]+(\S+)/);
					return m ? m[1] : "error";
				} catch {
					return "error";
				}
			};

			interface SettingItem {
				id: string;
				label: string;
				currentValue: string;
				values: string[];
			}

			const items: SettingItem[] = ruleFiles.map((f) => ({
				id: f,
				label: `${f.replace(/\.yml$/, "")} (${getSeverity(f)})`,
				currentValue: rulesState[f] ? "on" : "off",
				values: ["on", "off"],
			}));

			await cmdCtx.ui.custom<void>(
				(_tui, theme, _kb, done) => {
					const container = new Container();
					container.addChild(new Border((s: string) => theme.fg("accent", s)));
					container.addChild(new Text(theme.fg("accent", theme.bold("ast-grep Rules")), 1, 0));

					const settingsTheme: SettingsListTheme = {
						label: (s, _sel) => theme.fg("text", s),
						value: (s, sel) => (sel ? theme.fg("accent", theme.bold(s)) : theme.fg("muted", s)),
						description: (s) => theme.fg("dim", s),
						cursor: theme.fg("accent", "▸"),
						hint: (s) => theme.fg("dim", s),
					};
					const settingsList = new SettingsList(
						items,
						Math.min(items.length + 2, 15),
						settingsTheme,
						(id, newValue) => {
							rulesState[id] = newValue === "on";
							saveRulesState(rulesState);
						},
						() => done(undefined),
						{ enableSearch: true },
					);
					container.addChild(settingsList);

					container.addChild(
						new Text(theme.fg("dim", "↑↓ navigate  ·  space toggle  ·  esc close"), 1, 0),
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
