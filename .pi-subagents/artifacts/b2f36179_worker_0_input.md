# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Fix /home/droid/pi-bake/components/overlay.ts — replace hardcoded ANSI green codes with theme colors.

Currently, `scannerTaper` uses hardcoded:
```
const GREEN_BRIGHT = "\x1b[38;5;119m";
const GREEN_MID = "\x1b[38;5;108m";
const GREEN_DIM = "\x1b[38;5;65m";
const RESET = "\x1b[0m";
```

And `colorLine` uses these directly:
```
const c = minDist <= 1 ? GREEN_BRIGHT : minDist <= 3 ? GREEN_MID : GREEN_DIM;
return `${c}${ch}${RESET}`;
...
return `${GREEN_DIM}${ch}${RESET}`
```

The `t: ThemeProxy` parameter is already passed but only used for the title text (`t.fg("text", title)`). 

Fix: Replace the hardcoded ANSI codes with `t.fg()` calls. Use a brightness scale through the theme:
- Bright spots (minDist <= 1): `t.fg("accent", ch)` 
- Mid spots (minDist <= 3): `t.fg("text", ch)` with some dimming  
- Dim spots (> 3 or background): `t.fg("muted", ch)`

The `RESET` is still needed for the `wrapPanel` approach — the panel overlay uses hardcoded `\x1b[48;5;232m` background. Keep `wrapPanel` as-is (it uses the dark panel background). The scannerTaper function returns a single line that gets wrapped by the caller.

Changes:
1. Remove the `GREEN_BRIGHT`, `GREEN_MID`, `GREEN_DIM`, `RESET` constants
2. Change `colorLine` to use `t.fg()` instead
3. The rest of the function stays the same

Also check if anyone else imports these constants — if so, update those too:
```
grep -rn "GREEN_BRIGHT\|GREEN_MID\|GREEN_DIM" /home/droid/pi-bake/ --include="*.ts"
```

Run `npx tsx --eval "console.log('check');"` to verify the file parses correctly.

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