# Task for worker

[Read from: /home/droid/pi-bake/context.md, /home/droid/pi-bake/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix P2 in /home/droid/pi-bake/auditor.ts: add infrastructure warning when sg (ast-grep) command fails silently.

In runStructuralAudit(), the catch block silently swallows sg spawn failures. Change it to track failures: add a counter of how many rules caught. If ALL rules failed (catchCount === rules.length), push a synthetic finding:

```ts
source: 'ast-grep' as const,
check: 0,
detail: 'All structural audit rules failed to execute — ast-grep (sg) may not be installed or is not working. Install: npm install -g @ast-grep/cli',
rule: 'INFRASTRUCTURE',
```

Add this after the for loop, before returning findings.

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