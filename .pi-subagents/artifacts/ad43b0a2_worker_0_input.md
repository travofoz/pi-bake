# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Three tasks in /home/droid/pi-bake, all orthogonal files.

## Task A: Fix index.ts — restore default working indicator + fix widget scanner

Read current /home/droid/pi-bake/index.ts. Make these edits:

1. **Remove the entire working indicator override block.** Delete from `const t = ctx.ui.theme;` down to `// ── Widget as a Component...`, inclusive of the spinner/indicator code block between them. Keep `const t = ctx.ui.theme;` and `// ── Widget as a Component...`.

2. **Clean the state change handler.** Replace the current handler that calls `startSpinner()`/`stopSpinner()` with one that just sets status on done/failed/idle and resets widget on idle:
```
bakeCtx.bake.onStateChange((s) => {
    if (s.status === "done" || s.status === "failed" || s.status === "idle") {
        ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
    }
    // Reset widget scanner on clean/idle transition (bake-reset)
    if (s.status === "idle") {
        bakeCtx.widgetRef?.reset();
    }
});
```
NO calls to setWorkingIndicator or startSpinner/stopSpinner anywhere.

3. **Fix widget scanner Date.now() → render counter.** In BakeWidget class:
   - Change `private startTime: number;` to `private renderCount = 0;`
   - Remove `this.startTime = Date.now();` from constructor
   - Change reset() to `this.renderCount = 0;`
   - In render() Full mode section, replace:
     ```
     const elapsed = (Date.now() - this.startTime) / 1000;
     const scanPos = Math.abs(Math.sin(elapsed * 1.2));
     ```
     with:
     ```
     this.renderCount++;
     const scanPos = Math.abs(Math.sin(this.renderCount * 0.06));
     ```

4. Remove the `ctx.ui.setWorkingMessage("");` call if present (it's part of the block from step 1, but verify).

## Task B: Delete dead animation files

1. Verify nothing imports these (grep for each):
   - `components/loader.ts` — grep for `from.*loader`
   - `components/anim.ts` — grep for `from.*anim`
   - `lib/overlay.ts` — grep for `from.*lib/overlay`
   (Do NOT delete `components/overlay.ts` — the widget uses scannerTaper from it)

2. If no imports: `rm components/loader.ts components/anim.ts lib/overlay.ts`

## Task C: Fix detail.ts overlay rebuild on keypress

Read /home/droid/pi-bake/commands/detail.ts. The overlay is created fresh inside the `await cmdCtx.ui.custom<void>((tui, theme, _kb, done) => { ... })` callback via `new Overlay(...)` and `new Container()` + `new Text()` on EVERY keypress. The `buildBody()` function creates new Container/Text objects each call.

Fix: The overlay (ov) is already created once at the top of the callback. The issue is `buildBody()` creates new Container/Text on every render. Change it to use string arrays with the `render` method instead — return `string[]` from buildBody and pass to ov.addBody as a component with a render function.

Actually simpler: make `bodyComponent.render()` the ONLY thing that constructs the content (it already is), and ensure buildBody returns `string[]` from a plain function (no Container/Text objects) rather than constructing Component instances every frame.

Change `buildBody` to return `string[]` instead of Container, and update bodyComponent.render() to use those strings directly.

## Verification

Run `npx tsc --noEmit` to check for errors. Fix any that come up.

## Report back
- What files changed
- What was deleted
- What verification showed
- Any residual risks

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