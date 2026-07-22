# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix /home/droid/pi-bake/auditor.ts — make the semantic audit prompt stack-agnostic.

Read the file, find `buildSemanticAuditPrompt` function around line 90.

Currently checks 1-4 are Svelte-specific:
```
1. All async $effect calls guard state mutations with a destroyed flag (set in onDestroy, checked after each await)
2. Files using $effect with async work import onDestroy from 'svelte'
3. Upload success message is stored before clearUpload() call (not after)
4. Blob URL for download uses deferred revocation (setTimeout, not synchronous after a.click())
```

Replace them with generic:
```
1. Async operations check for component/object lifecycle state before mutating after await
2. Event listeners and subscriptions are cleaned up in destructor/dispose/onDestroy patterns
3. Error messages in catch blocks include context (not just re-thrown or swallowed without info)
4. Temporary URLs, file handles, or resources are properly released/revoked after use (deferred cleanup, not synchronous)
```

Keep checks 5-8 as-is.

Also update "Output exactly one PASS or FAIL per line (8 lines)" to "Output exactly one PASS or FAIL per line (8 lines)" — still 8 lines.

Read the file, edit the template string. Verify syntax with npx tsx.

Edge: the template uses backtick string interpolation with ${workspacePath} — be careful not to break the template literal.

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