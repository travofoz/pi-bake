# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Apply 5 fixes to /home/droid/pi-bake/bake.ts. These are all in one file.

Fix 1 (Task 3 — P0): In syncState(), add `this.saveState()` before the final `this._onStateChange?.(this.state)` call. Currently the method updates `this.state` in memory and fires the callback but never writes to disk. Find the method (~line 380) that ends with `this._onStateChange?.(this.state);` — add `this.saveState();` on the line before it.

Fix 2 (Task 5 — P1): In runPrompt(), at the end (after the last `return output` but within the method body), add a `this.rpcAgent.close()` to prevent RPC agent leaks when called outside pipeline. runPrompt is only called from spec-decompose, not during pipeline runs. Add `this.rpcAgent.close();` right before `return output;`.

Fix 3 (Task 6 — P1): Cache phase list to avoid re-reading all .md files on every syncState call. 
- Add a private field: `private cachedPhases: PhaseSpec[] | null = null;`
- In runPipeline(), after loading phases: `const phases = this.getPendingPhases();` then add `this.cachedPhases = phases;` right after it
- In syncState(), change `const phases = this.getPendingPhases();` to `const phases = this.cachedPhases ?? this.getPendingPhases();`

Fix 4 (Task 7 — P1): In the pause() method, after `this.bakeActor?.send({ type: "ABORT" });` add `this.bakeActor?.stop(); this.bakeActor = null;` so the old actor is properly stopped before resume() creates a new one.

Fix 5 (Task 8 — P1): In runPipeline(), wrap the `await done` and the output-mapping block in a try-catch. The `try` currently wraps the whole pipeline setup (actor creation, subscribe, await done, mapping). The `finally` block runs regardless. Add logic so that if `await done` rejects, set `this.state.status = 'failed'` and log the error, instead of leaving status stuck at 'running'. Do NOT nest the try — just add a catch to the existing try block.

Here's the runPipeline method structure:
```ts
async runPipeline(): Promise<void> {
  this.state.status = "running";
  this.emitState();
  this.rpcAgent.start();
  this.log.open();
  this.log.append("pipeline_start", {});
  const phases = this.getPendingPhases();
  if (phases.length === 0) { ... return; }
  
  const env: BakeEnv = { ... };
  
  try {
    const { actor, done } = startBakePipeline(phases, env, this.state.maxAttempts);
    this.bakeActor = actor;
    actor.subscribe({ next: ... });
    
    const output = await done;
    
    // Map results to BakeState
    this.state.completedPhases = [];
    this.state.activePhases = [];
    for (const phase of phases) { ... }
    this.state.status = ...;
    this.log.append(...);
  } catch (err) {
    // NEW: handle pipeline crash — don't leave state stuck at "running"
    this.state.status = "failed";
    this.log.append("pipeline_crash", { error: String(err) });
  } finally {
    this.bakeActor = null;
    this.emitState();
    this.log.close();
    this.rpcAgent.close();
  }
}
```

Add the `catch (err)` block between the try and the finally.

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