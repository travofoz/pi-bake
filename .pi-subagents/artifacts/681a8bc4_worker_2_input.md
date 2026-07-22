# Task for worker

[Read from: /home/droid/pi-bake/context.md, /home/droid/pi-bake/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix /home/droid/pi-bake/commands/detail.ts — stop rebuilding Overlay on every keypress.

## Problem:
The detail command rebuilds the Overlay component on every keystroke input handler, causing unnecessary allocations and full re-renders.

## Instructions:
1. Read /home/droid/pi-bake/commands/detail.ts fully
2. Find where the Overlay or its body/content is recreated in a keypress/input handler
3. Fix it to reuse the existing Overlay and update only the relevant state (text, selection, etc.) rather than creating a new instance
4. The fix should:
   - Create the Overlay ONCE before the input handler
   - In the input handler, only update the mutable state (cursor position, filter text, etc.)
   - Call ctx.ui.setOverlay() only if the overlay needs to be shown/hidden, not on every keystroke
5. Run npx tsc --noEmit to verify no type errors

## Keep:
- All existing functionality
- Existing imports (you may add if needed)
- The overall UX

## Report the specific lines changed and why.

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