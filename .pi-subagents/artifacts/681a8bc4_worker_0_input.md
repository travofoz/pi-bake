# Task for worker

[Read from: /home/droid/pi-bake/context.md, /home/droid/pi-bake/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
SURGICALLY edit /home/droid/pi-bake/index.ts to restore default pi working indicator and fix widget scanner.

There are three changes needed in this ONE file:

## Change 1: Remove the custom working indicator block
Locate the block between `const t = ctx.ui.theme;` and `// ── Widget as a Component...`.
This block currently contains either:
- The 'Status-line KITT spinner' code (SPINNER_FRAMES, spinnerIdx, spinnerTimer, startSpinner, stopSpinner)
- OR the 'Static working indicator' code (RED_B, RED_M, etc., makeKittLine, staticKitt)
- OR could be just the original `setWorkingMessage` + `setWorkingIndicator` calls

REMOVE ALL OF IT. Delete everything between `const t = ctx.ui.theme;` and `// ── Widget as a Component...` inclusive of the empty/comment lines between them. Keep `const t = ctx.ui.theme;` and `// ── Widget as a Component...`.

## Change 2: Clean the state change handler
Find this code:
```
bakeCtx.bake.onStateChange((s) => {
    if (s.status === "running") {
        ...
    } else if (
        s.status === "done" ||
        s.status === "failed" ||
        s.status === "idle"
    ) {
        ...
        ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
    }
    // Reset widget scanner ...
    if (s.status === "idle") {
        bakeCtx.widgetRef?.reset();
    }
});
```

Replace with:
```
bakeCtx.bake.onStateChange((s) => {
    if (s.status === "done" || s.status === "failed" || s.status === "idle") {
        ctx.ui.setStatus("bake", t.fg("dim", "⏎ bake ready"));
    }
    // Reset widget scanner timestamp on clean/idle transition (bake-reset)
    if (s.status === "idle") {
        bakeCtx.widgetRef?.reset();
    }
});
```

IMPORTANT: Remove ANY call to `ctx.ui.setWorkingIndicator()` in this handler. We are NOT touching the working indicator at all — pi manages it entirely.

## Change 3: Fix widget scanner to not use Date.now()
In the BakeWidget class:

1. Replace:
```
class BakeWidget implements Component {
    private theme: AnimTheme;
    private startTime: number;

    constructor(theme: AnimTheme) {
        this.theme = theme;
        this.startTime = Date.now();
    }

    /** Reset scanner animation timer — called after bake-reset. */
    reset(): void {
        this.startTime = Date.now();
    }
```
With:
```
class BakeWidget implements Component {
    private theme: AnimTheme;
    private renderCount = 0;

    constructor(theme: AnimTheme) {
        this.theme = theme;
    }

    /** Reset scanner position — called after bake-reset. */
    reset(): void {
        this.renderCount = 0;
    }
```

2. Inside the render() method, in the 'Full mode' section, replace:
```
        // Full mode — time-based scanner header (position from Date.now(), cached phase list)
        const elapsed = (Date.now() - this.startTime) / 1000;
        const scanPos = Math.abs(Math.sin(elapsed * 1.2));
```
With:
```
        // Full mode — render-count-based scanner header (advances only on TUI render)
        this.renderCount++;
        const scanPos = Math.abs(Math.sin(this.renderCount * 0.06));
```

## Verification
- The file should have NO calls to setWorkingIndicator, setWorkingMessage, or any custom working indicator logic.
- The widget scanner should use renderCount not Date.now().
- The state change handler should not call setWorkingIndicator anywhere.
- Run diagnostics: `npx tsc --noEmit` to verify no type errors.

---
Update progress at: /home/droid/pi-bake/.pi-subagents/artifacts/progress/681a8bc4/progress.md

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