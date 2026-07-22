# Task for worker

[Read from: /home/droid/pi-bake/context.md, /home/droid/pi-bake/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix P1 and P2 issues in /home/droid/pi-bake/commands/detail.ts.

P1: getWorkspaceInfo() uses execSync('git ...') and execSync('npm view ...', {timeout:3000}) — these block the TUI. Replace with spawnAsync from '../spawn-async.ts'. Make getWorkspaceInfo async and load workspace info asynchronously after overlay creation.

P2: rebuild() creates new Overlay() on every keypress, resetting anim timer. Instead, restructure to use a single Overlay with a custom body Component that accepts (selectedIdx, scrollOffset, mode, eventScroll) and calls invalidate() on input changes. Do NOT import or use execSync anymore.

---
Update progress at: /home/droid/pi-bake/.pi-subagents/artifacts/progress/d7934008/progress.md

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