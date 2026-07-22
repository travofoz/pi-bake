# Task for reviewer

Answer this question with evidence from the pi source code only.

**Question:** What is pi's vanilla behavior for the working indicator (the "⠋ Working..." text that shows above the widget, below the pending messages area)? When does it show, when does it hide, and what frames/interval does it use?

Specifically:

1. **When does the vanilla working indicator show?** During streaming? On commands? Does it stay visible after a command handler returns that does `bake.runPipeline().catch(...)` in the background?

2. **When does it clear?** On stream_end? On session idle?

3. **What frames and interval does it use by default?** (find DEFAULT_FRAMES and DEFAULT_INTERVAL_MS in pi-tui's loader.js)

4. **Why does the vanilla working indicator NOT cause tmux scrollback issues** while the KITT scanner with 51 frames at 60ms DOES? Both use the same pi-tui `Loader` mechanism that calls `requestRender()` on every frame tick. If vanilla fires at 80ms with 10 frames and the KITT fires at 60ms with 51 frames, the difference is 12.5 vs 16.7 renders/second — not big enough to explain "works fine" vs "unusable scroll hell."

5. **Critically:** Is there any mechanism by which the vanilla working indicator avoids calling `requestRender()` on every tick? Or does the vanilla one also call it and the reason it "works" is that it only shows briefly during command processing (streaming = ~1-2 seconds)?

Read these files for evidence:
- /home/droid/.nvm/versions/node/v26.4.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js (search for WorkingStatusIndicator, isStreaming, stream_end, working_visible_change, clearStatusIndicator, showStatusIndicator, workingIndicatorOptions)
- /home/droid/.nvm/versions/node/v26.4.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/status-indicator.js
- /home/droid/.nvm/versions/node/v26.4.0/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/components/loader.js
- /home/droid/.nvm/versions/node/v26.4.0/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js

Return a clear, evidence-backed answer. Start with the concise answer, then support it with source code references.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

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