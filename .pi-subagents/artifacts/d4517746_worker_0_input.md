# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Apply two fixes in /home/droid/pi-bake.

**Fix A — commands/detail.ts (Task 13: stop rebuilding Overlay on keypress)**

The problem: In commands/detail.ts, the `rebuild()` function calls `makeOv()` which creates a brand new `Overlay()` on every keypress. This resets `animStart = Date.now()`, so the scanner taper animation resets to center on every scroll/navigate.

The fix: Create the Overlay once at the start, and instead of rebuilding on input, just update the body content. Replace `rebuild()` to not recreate the Overlay.

Changes in detail.ts:
1. In the ui.custom callback, move the `const ov = new Overlay(theme, ...)` creation BEFORE the `makeOv` function definition. Store it as `let ov = new Overlay(...)`.
2. The `rebuild()` function should call `ov.dispose()` then set `ov = new Overlay(...)` - NO, that's the same problem.
3. Better approach: Create a single mutable component that holds state and invalidates.

Simplest correct fix: Replace rebuild() so it doesn't recreate the Overlay. Instead:
- Create ONE overlay before makeOv
- Create ONE body container component that accepts (selectedIdx, mode, scrollOffset) as mutable state
- On input, just update the state and call ov.invalidate() + tui.requestRender()
- Don't create a new Overlay

The body container should be a Component that re-renders based on current state. Define it as a class or object with render/invalidate methods that read from the current state variables (selectedIdx, mode, scrollOffset, eventScroll).

---

**Fix B — index.ts (Task 9: /reload leak mitigation)**

The problem: pi.on("session_start", ...) listeners accumulate on /reload. Each one creates a new Bake instance with a new RPC agent, new widget, new spinner timer. Old instances leak.

The fix: Track whether we've already initialized. At the top of the default export function, BEFORE `registerAll(pi)`, add a module-level flag that prevents double-init.

Add at the top of `export default function (pi)`:
```ts
// Guard: session_start listeners accumulate on /reload, so skip re-init
let initialized = false;
```

Then wrap the entire session_start listener body in:
```ts
if (initialized) return; // already set up — skip to avoid leaks
initialized = true;
```

And at the very end of session_start, add a pi.on("session_stop") listener that resets the flag... or not, since session_start fires once per session.

This is a minimal guard — it prevents the leaks without restructuring the architecture. Extensions that need /reload support can be beefed up later.

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