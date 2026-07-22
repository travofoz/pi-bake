# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Edit /home/droid/pi-bake/index.ts with these changes:

## Change 1: Replace the "Status-line KITT spinner" block with a static KITT scanner single-frame working indicator

Remove this entire block (lines with `SPINNER_FRAMES`, `spinnerIdx`, `spinnerTimer`, `startSpinner`, `stopSpinner`):

```typescript
		// ── Status-line KITT spinner (no full TUI re-render, no scroll reset) ──
		// pi's setWorkingIndicator with animated frames triggers a full TUI
		// repaint on every tick — that's what breaks scrollback in tmux.
		// Instead, we cycle braille chars through setStatus (footer-only update,
		// same as pi's built-in thinking indicator). The widget's KITT scanner
		// provides the full visual on interaction (no timer).
		ctx.ui.setWorkingMessage("");
		const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let spinnerIdx = 0;
		let spinnerTimer: ReturnType<typeof setInterval> | null = null;
		const startSpinner = () => {
			if (spinnerTimer) return;
			spinnerIdx = 0;
			spinnerTimer = setInterval(() => {
				if (bakeCtx.widgetHidden) return; // overlay open — don't touch status
				spinnerIdx = (spinnerIdx + 1) % SPINNER_FRAMES.length;
				ctx.ui.setStatus(
					"bake",
					t.fg("accent", `${SPINNER_FRAMES[spinnerIdx]} bake active`),
				);
			}, 500);
		};
		const stopSpinner = () => {
			if (spinnerTimer) {
				clearInterval(spinnerTimer);
				spinnerTimer = null;
			}
		};
```

Replace with:

```typescript
		// ── Static working indicator: single-frame KITT scanner (no timer, no scroll) ──
		// One frame with the KITT head parked at center. No interval = no animation
		// timer = zero requestRender() calls = zero tmux scrollback resets.
		// The widget's scanner provides the animated sweep on user interaction.
		ctx.ui.setWorkingMessage("");
		const RED_B = "\x1b[38;5;196m";
		const RED_M = "\x1b[38;5;160m";
		const RED_D = "\x1b[38;5;88m";
		const GRN_D = "\x1b[38;5;65m";
		const RST = "\x1b[0m";
		const makeKittLine = (cols: number, spot: number): string => {
			const W = Math.max(8, cols - 3);
			const B = ["⠀", "⡀", "⡠", "⡦", "⡶", "⣶", "⣿"];
			const cells: string[] = [];
			for (let i = 0; i < W; i++) {
				const dist = Math.abs(i - Math.round(spot * (W - 1)));
				const b = dist <= 1 ? 6 : dist <= 3 ? 4 : dist <= 6 ? 2 : 0;
				if (dist <= 2) cells.push((dist <= 1 ? RED_B : RED_M) + B[b] + RST);
				else if (dist <= 5) cells.push(RED_D + B[b] + RST);
				else cells.push(GRN_D + B[b] + RST);
			}
			return cells.join("");
		};
		const staticKitt = makeKittLine(process.stdout.columns || 80, 0.5);
```

## Change 2: Update the onStateChange handler

Replace:
```typescript
		bakeCtx.bake.onStateChange((s) => {
			if (s.status === "running") {
				startSpinner();
			} else if (
				s.status === "done" ||
				s.status === "failed" ||
				s.status === "idle"
			) {
				stopSpinner();
				ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
			}
			// Reset widget scanner timer on clean/idle transition (bake-reset)
			if (s.status === "idle") {
				bakeCtx.widgetRef?.reset();
			}
		});
```

With:
```typescript
		bakeCtx.bake.onStateChange((s) => {
			if (s.status === "running") {
				ctx.ui.setWorkingIndicator({ frames: [staticKitt] });
				ctx.ui.setStatus("bake", t.fg("accent", "bake active"));
			} else if (
				s.status === "done" ||
				s.status === "failed" ||
				s.status === "idle"
			) {
				ctx.ui.setWorkingIndicator(); // clear it
				ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
			}
			// Reset widget scanner timestamp on clean/idle transition (bake-reset)
			if (s.status === "idle") {
				bakeCtx.widgetRef?.reset();
			}
		});
```

## Change 3: Fix the widget scanner to not use Date.now() on every render

In the BakeWidget class, replace:
```typescript
	constructor(theme: AnimTheme) {
		this.theme = theme;
		this.startTime = Date.now();
	}
```
With:
```typescript
	private renderCount = 0;
	constructor(theme: AnimTheme) {
		this.theme = theme;
		this.startTime = Date.now();
	}
```

Also in the render method, replace:
```typescript
		const elapsed = (Date.now() - this.startTime) / 1000;
		const scanPos = Math.abs(Math.sin(elapsed * 1.2));
```
With:
```typescript
		this.renderCount++;
		const scanPos = Math.abs(Math.sin(this.renderCount * 0.06));
```

This way the scanner advances on each render call instead of wall clock time. If no render happens (idle, no keystrokes), the scanner stays frozen. Diff-based rendering will see the same lines and write nothing to the terminal.

## Important:
- Remove the `stopSpinner()` call entirely — it was only for the timer-based code we're removing
- Keep the `ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"))` initial status line (outside the state change handler)  
- All other code (BakeWidget class, widget registration, onStatus, onLoader callbacks) stays unchanged

Read the file first, then apply these three changes.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```