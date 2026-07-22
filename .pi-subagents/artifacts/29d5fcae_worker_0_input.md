# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix remaining issues in /home/droid/pi-bake.

## Problem 1: TUI scroll hell from working indicator

The root cause: `setWorkingIndicator` with 51 frames at 60ms interval triggers `Loader.updateDisplay()` → `this.ui.requestRender()` on every frame tick (16 times/sec). Each `requestRender()` repaints the entire TUI, which resets tmux scrollback position.

pi-tui's Loader (at `node_modules/@earendil-works/pi-tui/dist/components/loader.js`) renders in the `statusContainer`, which sits ABOVE the widget in the TUI layout. The spinner renders as a 2-line component.

The user wants the original braille spinner above the widget working.

**What to do in /home/droid/pi-bake/index.ts:**

1. Restore a `setWorkingIndicator` call, but with SANE parameters:
   - Use a simple braille spinner array (6-8 frames, not 51)
   - Set intervalMs to 250-300 (not 60)
   - Remove the custom buildWorkingFrames function entirely (was 51 frames of heavy braille gradients)

2. The spinner should show when pipeline is active and clear when done.
   - The existing onStateChange handler already clears with `ctx.ui.setWorkingIndicator()` (no args)
   - Keep that behavior — it clears the indicator

3. Remove the `setStatus`-based spinner I added earlier (the SPINNER_FRAMES/startSpinner/stopSpinner code) — that was a workaround that doesn't solve the real problem.

4. The widget's KITT scanner should be preserved (it has no timer, only renders on interaction).

## Problem 2: Remove the startSpinner/stopSpinner cruft I added

In index.ts, I added a SPINNER_FRAMES array and startSpinner/stopSpinner functions that cycle braille chars through setStatus. This was based on wrong assumptions. Remove it entirely. The proper fix is the setWorkingIndicator with sane parameters.

## What to keep:
- The widget BakeWidget and its scanner (Date.now-based, no timer) — NO CHANGE
- The onStateChange handler that clears working indicator on done/failed/idle — keep it
- The onStatus/onLoader callbacks — keep them
- The "⏎ bake ready" status line — keep it

## What to change in index.ts:
- Replace the spinner timer + status-line cruft with a proper setWorkingIndicator call
- Use simple braille frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]  
- intervalMs: 250
- Don't build 51-frame KITT scanner for the working indicator — keep that in the widget

Read the file first, understand the current state, then make targeted edits. Test with the available tooling.

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