# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix TUI scroll hell in /home/droid/pi-bake/index.ts.

The working indicator runs 51 frames at 60ms interval — constant re-rendering causes scroll position to reset on every frame. On a phone screen this is unusable.

Problems to fix:
1. `buildWorkingFrames()` at ~line 100 creates 51 frames at 60ms = 51*60ms = ~3s sweep. Each frame causes tui.requestRender() which resets scroll.
2. The working indicator never stops during overlays (widgetHidden doesn't pause it).

Fix 1: Slow the interval from 60ms to 250ms, and reduce frames from 25-steps to 12-steps (total 23 → 23*250ms = ~5.75s sweep — much gentler).

Fix 2: The working indicator should be cleared when an overlay is opened. Add logic to stop/resume it. You can detect overlay state via bakeCtx.widgetHidden — when true, clear the working indicator. Restore it when widgetHidden goes back to false.

But bakeCtx is a plain object, not reactive. Simplest approach: in the widget render function, it already checks `if (bakeCtx.widgetHidden) return []` — add the same guard to the state change handler. Actually, the state change handler only fires on state changes, not overlay opens/closes.

Better approach: just slow it down a lot. 60ms is too aggressive. Make it 250ms. And reduce the frame steps from 25 to 12 so the total frame array is ~23 frames instead of 51.

Also: move the working indicator frames building out of session_start to avoid rebuilding on each /reload. And use a simpler frame pattern that doesn't have as many moving characters. The current braille-based scanner with 7 brightness levels per cell is over-engineered for a status indicator. A simpler KITT bar with 3-4 positions would be more readable on a small screen.

Key changes:
1. `intervalMs: 60` → `intervalMs: 250`  
2. `const steps = 25` → `const steps = 12` in buildWorkingFrames
3. Reduce the brightness bands (currently 4 bands: dist<=1, dist<=3, dist<=6, else → simplify to 3 bands)

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