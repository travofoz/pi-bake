# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix the KITT scanner working indicator in /home/droid/pi-bake/index.ts.

The KITT scanner is the WORKING INDICATOR — shown via setWorkingIndicator in the statusContainer above the widget. It's meant to REPLACE pi's default braille spinner.

Root cause of scroll hell: 51 frames at 60ms interval = 16 requestRender() calls/sec. Each requestRender() repaints the entire TUI, resetting tmux scrollback.

Fix: Restore buildWorkingFrames + setWorkingIndicator but with SANE parameters.

In /home/droid/pi-bake/index.ts, find the section that currently has:
```
// ── Status-line KITT spinner (no full TUI re-render, no scroll reset) ──
```
and the SPINNER_FRAMES / startSpinner / stopSpinner code below it.

REPLACE that entire block with a restored KITT scanner working indicator:

1. Restore the buildWorkingFrames function but with:
   - `const steps = 6` instead of 25 (was 25 → produces 51 frames, now 6 → produces 11 frames)
   - Same braille chars B = ["⠀", "⡀", "⡠", "⡦", "⡶", "⣶", "⣿"]
   - Same red/green color bands but simplify to 3 bands instead of 4
   - Same KITT scanner visual — bright head fading to dim tail

2. Call setWorkingIndicator with:
   - intervalMs: 200 instead of 60
   - frames from buildWorkingFrames

3. Remove ALL the startSpinner/stopSpinner SPINNER_FRAMES cruft I added earlier

4. In the state change handler, keep `ctx.ui.setWorkingIndicator()` (no args = clear)

The key: the KITT scanner looks the same (bright head + dim tail sweeping across), but with 11 frames at 200ms instead of 51 frames at 60ms. That's 5 requestRender()/sec instead of 16 — a 3× reduction that stops scroll hell while keeping the KITT visual.

Read the current index.ts first, understand the full state, then make targeted edits.

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