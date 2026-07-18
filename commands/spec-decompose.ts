import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { LoaderComponent } from "../components/loader.ts";
import { bakeCtx, BAKE_BASE, BAKE_DB_DIR, PHASES_DIR } from "./ctx.ts";

export function register(pi: ExtensionAPI): void {
	pi.registerCommand("bake-spec-decompose", {
		description: "Decompose a raw spec file into clean phase files",
		usage: "<path-to-raw-spec>",
		handler: async (args, cmdCtx) => {
			const bake = bakeCtx.bake;
			if (!bake) {
				cmdCtx.ui.notify(cmdCtx.ui.theme.fg("error", "Bake not initialized"), "info");
				return;
			}
			const t = cmdCtx.ui.theme;
			if (!args) {
				cmdCtx.ui.notify(t.fg("error", "Usage: /bake-spec-decompose <path>"), "info");
				return;
			}
			const specPath = path.resolve(args);
			if (!fs.existsSync(specPath)) {
				cmdCtx.ui.notify(t.fg("error", `File not found: ${specPath}`), "info");
				return;
			}

			const specContent = fs.readFileSync(specPath, "utf-8");
			const decomposePrompt = `Read this specification and decompose it into separate phase files. Output ONLY JSON, no other text.

{
  "phases": [
    {
      "name": "01_phase_name",
      "summary": "brief objective",
      "done_when": "acceptance criteria"
    }
  ],
  "context": "Narrative, philosophy, out-of-scope, and operational notes stripped from phases."
}

Raw spec:\n${specContent}`;

			cmdCtx.ui.setStatus("bake", t.fg("accent", "○ Decomposing spec..."));

			// ── Show LoaderComponent overlay ──
			let loaderDone: (() => void) | null = null;
			let aborted = false;
			bakeCtx.loaderMsg = "Decomposing spec...";

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
								aborted = true;
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
				},
			);

			try {
				const output = await bake.runPrompt(decomposePrompt, "Decompose");

				const jsonMatch = output.match(/\{[\s\S]*"phases"[\s\S]*\}/);
				if (!jsonMatch) {
					cmdCtx.ui.notify(
						t.fg("error", "Decompose: no JSON in output — saved to .bake/decompose-raw-output.txt"),
						"info",
					);
					fs.writeFileSync(
						path.join(BAKE_BASE, ".bake", "decompose-raw-output.txt"),
						output,
						"utf-8",
					);
					return;
				}

				const decomposition = JSON.parse(jsonMatch[0]);
				if (!fs.existsSync(PHASES_DIR)) fs.mkdirSync(PHASES_DIR, { recursive: true });
				for (const phase of decomposition.phases) {
					const fileName = phase.name.replace(/[^a-zA-Z0-9_-]/g, "_") + ".md";
					const content = `# ${phase.name}\n\n## Objective\n${phase.summary}\n\n## Done When\n${phase.done_when}\n`;
					fs.writeFileSync(path.join(PHASES_DIR, fileName), content, "utf-8");
				}
				if (decomposition.context) {
					fs.writeFileSync(
						path.join(BAKE_DB_DIR, "spec-context.md"),
						decomposition.context,
						"utf-8",
					);
				}
				// If the source spec was inside PHASES_DIR, archive it so the pipeline won't try to execute it
				const resolvedPhases = path.resolve(PHASES_DIR);
				if (specPath.startsWith(resolvedPhases)) {
					const archiveDir = path.join(BAKE_DB_DIR, "archive");
					if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
					const dest = path.join(archiveDir, `${path.basename(specPath)}.decomposed`);
					fs.renameSync(specPath, dest);
					cmdCtx.ui.notify(t.fg("dim", `Raw spec archived to .bake/archive/`), "info");
				}

				cmdCtx.ui.notify(t.fg("success", `${decomposition.phases.length} phases written to phases/`), "info");

				// ── Generate a README from the spec context (non-blocking) ──
				if (decomposition.context) {
					bakeCtx.loaderMsg = "Generating README...";
					bake.onLoader?.(true, "Generating README...");

					const readmePrompt = `You are a technical writer for an open-source project.
Write a README.md for the project described below.

Context:
${decomposition.context}

Phases:
${decomposition.phases.map((p: any) => `- ${p.name}: ${p.summary}`).join("\n")}

Output ONLY markdown, no extra commentary. The README should include:
- Project name and purpose (one-liner)
- What it does (2-3 sentences)
- Quick start / usage
- Architecture overview (bullets)
- License (MIT)

Write it clean, direct, no fluff.`;

					// Fire and forget — don't block the compose flow
					bake
						.runPrompt(readmePrompt, "README")
						.then((readmeContent: string) => {
							const cleaned = readmeContent.replace(/^```[a-z]*\n?|```$/gm, "").trim();
							fs.writeFileSync(path.join(BAKE_BASE, "README.md"), cleaned + "\n", "utf-8");
							cmdCtx.ui.notify(t.fg("success", "README.md generated"), "info");
						})
						.catch((err: any) => {
							cmdCtx.ui.notify(t.fg("warning", `README generation skipped: ${err.message}`), "info");
						})
						.finally(() => {
							bake.onLoader?.(false, "");
						});
				}
			} catch (err: any) {
				if (aborted) {
					cmdCtx.ui.notify(t.fg("warning", "Decompose aborted"), "info");
				} else {
					cmdCtx.ui.notify(t.fg("error", `Decompose failed: ${err.message}`), "info");
				}
			} finally {
				if (loaderDone) {
					loaderDone();
					loaderDone = null;
				}
				loaderP.catch(() => {});
				cmdCtx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
			}
		},
	});
}
