All five fixes are already present in the file on disk. Verifying each one:

**Fix 1 — syncState saveState:** ✅ Present at end of method (~line 510):
```
    // Persist state.json so crash recovery has latest state
    this.saveState();
    this._onStateChange?.(this.state);
```

**Fix 2 — runPrompt close:** ✅ Present via `finally` block wrapping the prompt call (~line 517):
```
    } finally {
        this.rpcAgent.close();
    }
```

**Fix 3 — cached phases:** ✅ Present — private field `cachedPhases: PhaseSpec[] = []` (line 55), assigned at pipeline start (~line 390), used in syncState (~line 475).

**Fix 4 — pause stops actor:** ✅ Present (~line 310):
```
    this.bakeActor?.stop();
    this.bakeActor = null;
```

**Fix 5 — runPipeline catch:** ✅ Present (~line 430):
```
    } catch (err) {
        this.state.status = "failed";
        this.log.append("pipeline_crash", { error: String(err) });
    } finally {
```

These were all applied to disk prior to the crash — the todo list in the conversation wasn't updated. No edits needed.