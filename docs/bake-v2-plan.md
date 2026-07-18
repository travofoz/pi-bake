# Bake V2 — Architecture & Implementation Plan

## The Problem

The old bake.cjs (now archived at `travofoz/emmy`) converged too slowly because its BASELINE_REVIEW was an open-ended code review prompt that could always find something new in any real codebase. Combined with a dissent-only failure model, the pipeline was guaranteed to hit the circuit breaker.

Three root causes:
1. **Open-ended audit** — always finds new issues, never converges
2. **No remediation verification** — executor can skip tasks without detection
3. **No state tracking** — each cycle is blind to what was previously fixed

## The Fix (validated by testing)

### 1. ast-grep for structural checks (deterministic, ~50ms)
Replace the open-ended BASELINE_REVIEW with a hybrid:

- **ast-grep rules** catch structural issues deterministically
  - 6 base rules shipped in `rules/base/`
  - Per-project rules loaded from `rules/project/`
  - Language-specific add-ons (TS, Go, Rust, Python) detected from project files

- **Structured LLM audit** catches semantic issues the model can't
  - 8-item finite checklist (currently Svelte-specific, needs stack-agnostic generalization)
  - Machine-parseable output: `PASS/FAIL` lines + `RESULT: PASS/ISSUES` + JSON failures block
  - Tested across 3 independent samples — format holds consistently

### 2. Remediation verification (deterministic)
After executor runs, before re-auditing:
1. Parse previous audit's failures JSON
2. Check each against git diff (structural: was the file modified?) or re-run ast-grep rule
3. If any task was skipped → re-run executor, don't waste tokens on a fresh audit

### 3. JSON-lines event log (zero dependencies)
`.bake/events.jsonl` — append-only, grep-able, jq-parseable:
```json
{"ts":"...","type":"phase_start","data":{"phase":"1_spec"}}
{"ts":"...","type":"audit_structural_fail","data":{"phase":"...","findings":3}}
{"ts":"...","type":"remediation_start","data":{"phase":"...","attempt":1}}
{"ts":"...","type":"circuit_breaker","data":{"phase":"...","attempts":3}}
```

## Repo Layout (Self-Contained, No Global Symlinks)

```
/home/droid/pi-bake/   ← pwd, run `pi` from here
├── index.ts                   # Extension entry point
├── bake.ts                    # Core loop logic
├── auditor.ts                 # ast-grep + LLM audit
├── event-log.ts               # JSON-lines event log
├── spawn-async.ts             # Async spawn utility (child_process.spawn + Promise)
├── rules/
│   ├── base/                  # 6 stack-agnostic ast-grep rules
│   └── project/               # Per-project rules (user-extensible, empty)
├── phases/                    # Phase spec files (decompose writes here, pipeline reads)
│   └── kanban-agent-spec.md   # Test spec for decompose (verbose, narrative-heavy)
├── .bake/                     # Runtime data (gitignored)
│   ├── workspace/             # Target project working area
│   ├── completed/             # Archived passed phases
│   ├── state.json             # Pipeline state (crash recovery)
│   └── events.jsonl           # Event log
└── .pi/                       # Project-local extension loading (gitignored)
    └── extensions/
        └── pi-bake/           # Symlinks to all 5 .ts files + rules/
            ├── index.ts → ../../../index.ts
            ├── bake.ts → ../../../bake.ts
            ├── auditor.ts → ../../../auditor.ts
            ├── event-log.ts → ../../../event-log.ts
            ├── spawn-async.ts → ../../../spawn-async.ts
            └── rules → ../../../rules
```

Pi auto-discovers extensions in `.pi/extensions/` when launched from the repo directory. No global `~/.pi/agent/extensions/` symlinks needed.

## The Architecture

### Component: pi Extension

The bake extension runs as a pi extension with:

**Widget** (always visible above editor):
```
○ no active phase [0/N] — idle
● 01_kanban attempt 2/3 [1/4] — running
✗ 00_scaffold attempt 4/3 [0/4] — FAILED
```

**9 slash commands (module-level, not in session_start):**
| Command | Purpose |
|---------|---------|
| `/bake-status` | Full status + last N events |
| `/bake-start` | Start or resume pipeline |
| `/bake-pause` | Pause after current attempt |
| `/bake-resume` | Continue from pause |
| `/bake-skip` | Skip current phase, move to next |
| `/bake-steer <msg>` | Inject guidance into next executor run |
| `/bake-retry` | Re-run executor for current attempt |
| `/bake-log [n]` | Show last N events as overlay |
| `/bake-spec-decompose <path>` | Decompose raw spec into phase files |

**Planned (not yet implemented):**
| Command | Purpose |
|---------|---------|
| `/bake-metrics` | Token counts, turns, cache hit rate |
| `/bake-approve <finding-id>` | Acknowledge a false positive |
| `/bake-override verdict=pass` | Force-pass a stuck phase |
| `/bake-checklist-add <rule>` | Add project-specific ast-grep rule |

**Footer status:**
```
○ Executor: 01_upload_gallery (attempt 1)
○ Audit (structural): 01_upload_gallery
○ Phase: 01_upload_gallery
```

### Component: Core Loop

```
bake.run():
  1. Load pending phases from phases/*.md (sorted)
  2. For each phase:
     a. Run executor (spawnAsync pi with phase spec + remediation history)
        - Status via onStatus callback → ui.setStatus
        - No TUI blocking (spawnAsync, not spawnSync)
     b. Run structural check:
        - spawnAsync("sg", ["scan", "-r", rulePath, workspacePath])
        - If FAIL → skip semantic check, fast-fail to remediation
     c. Run semantic check (if structural passed):
        - spawnAsync("pi", ["-p", structured_prompt])
        - LLM with 8-item checklist
        - Parse PASS/FAIL + JSON failures
     d. If both PASS → archive phase, advance
     e. If FAIL → remediation via executor:
        - Re-run executor with findings as task list
        - Max 3 attempts → circuit breaker
     f. Log everything to events.jsonl
  3. Save state.json after every state change
```

### Component: ast-grep Rules (Base Set)

See `rules/base/*.yml` for the 6 current rules:
| Rule | Pattern | Severity |
|------|---------|----------|
| Dead ternary | `$X ? $A : $A` | error |
| Console log | `console.log($$$)` | error |
| Hardcoded branch | `"main"` not in `export` context | error |
| Sync blob revoke | `URL.revokeObjectURL()` after `a.click()` | error |
| Debugger statement | `debugger` | error |
| Empty catch | `catch($$$) {}` | error |

## Implementation Phases

See `git log --oneline` for actual progress.

### Phase 1 ✅ — Core Loop + ast-grep (proof the fix works)
- Port bake.cjs logic to extension TypeScript
- ast-grep integration for structural checks
- Structured LLM audit for semantic checks
- JSON-lines event logging
- Widget showing current phase/attempt/status
- 6 base ast-grep rules

### Phase 2 ✅ — Custom Tools
- 9 slash commands at module level (not session_start)
- spec-decompose command (raw spec → clean phase files)
- pause/resume/skip/steer/retry
- log viewer overlay

### Phase 3 ✅ — Async spawn (no TUI blocking)
- `spawn-async.ts` helper wrapping `child_process.spawn` in Promise
- All `spawnSync`/`execSync` calls converted to `await spawnAsync`
- `onStatus` callback wired to `ui.setStatus` for live footer updates
- Pipeline start awaited in command handler

### Phase 3b ✅ — Long-lived RPC subprocess (replaces per-op pi spawn)
- `rpc-agent.ts` — wraps `pi --mode rpc --no-session` subprocess
- `new_session()` for ~35ms context isolation between operations
- `prompt(text)` with text_delta streaming + agent_settled completion
- Auto-restart on crash, abort support
- Replaced all `spawnAsync("pi", ...)` calls in `bake.ts`
- Single subprocess lives for pipeline duration, close on pipeline end
- More memory-efficient on Pixel 6a (AVF/Debian) than per-op spawn

### Phase 4 ✅ — UX polish + event-log-driven detail
- UX enhancements (widget, detail overlay, rules panel, select list, status line)
- Real-time status line previews (LLM delta forwarding with throttling)
- Event-log-driven detail overlay (per-phase timeline from events.jsonl)
- Border component (self-contained, no pi-coding-agent dependency)
- Skip command arg parsing fix (pi parses `[phase-name]` into object)
- Stale state sanitization on startup
- Decompose command archives raw spec to `.bake/archive/`
- `/bake-reset` command with confirmation overlay
- `clean()` method wipes workspace, completed, events, archive, spec-context

### Phase 4b ✅ — Kanban test run
- Full pipeline cycle: decompose → 5 phases → structural audit → semantic audit → remediate → pass
- Tested pause/resume/skip/steer/retry interactively
- Kanban spec preserved at `docs/kanban-agent-spec.md`

### Phase 5 🔄 — Module refactoring (next session)
- Split `index.ts` into `commands/` directory + `components/` directory
- Split `bake.ts` into `bake-executor.ts`, `bake-audit.ts`
- Update `.pi/extensions/` symlinks to match new file layout
- Fix RPC agent abort (AbortSignal integration)
- Flatten repo: `src/` for modules, `dist/` for compiled output

### Phase 6 — npm packaging
- Proper `package.json` with `pi` manifest, `pi-package` keyword
- TypeScript build step: compile `src/` → `dist/`
- Include `rules/` directory in the package (resolved at runtime via `__dirname`)
- `peerDependencies` for pi core packages (`@earendil-works/pi-*`, `typebox`)
- `files` field in `package.json` to ship only what's needed
- README for the package gallery
- npm publish setup (`prepublishOnly`, `build` scripts)
- Test: `pi install npm:pi-bake` from a clean environment

### Phase 7 — Metrics & polish
- Token/turn tracking from pi stderr
- Cache hit/miss visibility
- Cumulative project metrics
- ast-grep rule management (checklist-add)

### Phase 8 — Advanced
- Multi-workspace support
- Event replay for debugging past sessions
- Parallel sub-agent audits (8 concurrent, 4 limit)

## Design Decisions Made

1. **Event log: JSON-lines over NATS JetStream.** Zero dependencies, grep-able. Can upgrade to NATS later if distributed agents become necessary.

2. **Extension over standalone TUI.** Pi's existing TUI provides the container. Widget + slash commands + status line. No separate binary, no screen/tmux.

3. **ast-grep + LLM hybrid.** Structural checks deterministic (~50ms/rule). LLM only for semantic checks with finite checklist. Converges because ast-grep rules prevent regression.

4. **Zero blocking.** All subprocess calls are non-blocking (Promise-based). The TUI stays fully responsive during executor, audit, and remediation phases.

5. **Project-local extension loading.** `.pi/extensions/` inside the repo, not global `~/.pi/agent/extensions/`. Symlinks all `.ts` files + `rules/`. No global clutter, portable with the repo.

6. **Workspace as subdirectory.** `.bake/workspace/` contains the target project. Clean filesystem separation.

7. **Single-user architecture.** No multi-tenant concerns. Speed of iteration prioritized over polish.

8. **RPC over per-process spawn.** `pi --mode rpc` with `new_session()` provides context isolation without the cost of spawning a new pi process per operation. `new_session` is ~35ms vs. ~2s for a cold pi spawn. Single long-lived subprocess is memory-efficient on mobile (Pixel 6a, AVF).

9. **Per-operation session granularity, not per-task.** Each executor run, audit, and remediation gets its own `newSession()` for clean isolation. But within one executor run, the entire phase spec is in one session — all tasks share context. This works because phase files are already decomposed into focused, verifiable units during `spec-decompose`. Per-task sessions (iteratr pattern) would make sense for monolithic specs, but our decompose step solves that. One caveat: remediation batches all findings into one session — if fixing finding #1 crashes the LLM, work on #2 and #3 is lost. Revisit this if circuit-breaker rate is high.

## Resolved Questions

1. **Sub-agent model for audits** — One call with all 8 checks. The checklist is small enough that context overhead isn't an issue, and `newSession()` is ~35ms so parallelism savings are negligible. Parallel sub-agent audits parked for Phase 6.

2. **Spec decomposition format** — Current `summary` + `done_when` markdown format works well (verified: kanban spec decomposed cleanly into 5 phase files). Human-readable, git-friendly. YAML frontmatter can be added later as an overlay if machine parsing is needed.

3. **Multi-workspace monorepo handling** — Deferred to Phase 6. Not relevant yet (single workspace on phone). When needed, bake can support a `workspaces` config with multiple workspace directories.

4. **Stack-agnostic semantic audit** — **Remaining work.** Break `buildSemanticAuditPrompt()` into generic base + per-stack overlays. Detect stack from workspace files (package.json deps, config files). Priority for next session.

## Implementation Lessons

### Extension Loading
- Extensions auto-discovered in `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local)
- `pi.registerCommand()` at module level (inside `export default function (pi)` but OUTSIDE `pi.on("session_start", ...)`) is idempotent on `/reload`
- `pi.on("session_start", ...)` listeners DO accumulate on `/reload`. Keep session_start minimal (widget init, status line only)
- **Multi-file extensions** need every `.ts` file symlinked individually, not just `index.ts`. Otherwise `import ./foo` resolves relative to the symlink directory, not the real path.
- **File-level symlink pattern** (matching subagent example):
  ```bash
  mkdir -p .pi/extensions/pi-bake
  for f in index.ts bake.ts auditor.ts event-log.ts spawn-async.ts; do
    ln -sf "$(pwd)/$f" ".pi/extensions/pi-bake/$f"
  done
  ln -sf "$(pwd)/rules" ".pi/extensions/pi-bake/rules"
  ```
- Directory symlinks (entire repo) may cause pi to scan subdirectory files and produce duplicate registrations.

### Command Handlers
- `cmdCtx.ui.theme` is available in command handlers — use instead of capturing `theme` from `session_start` closure
- `cmdCtx.ui.setStatus()` for persistent footer text (won't disappear like `notify()`)

### Async Architecture
- `spawnAsync()` wraps `child_process.spawn` in a Promise
  - Rejects on spawn failure, process error, timeout, maxBuffer exceeded
  - Resolves on process close (even non-zero exit — caller checks `result.status`)
- All long-running operations use `spawnAsync`:
  - Executor: `await spawnAsync("pi", ["-p", prompt])`
  - Semantic audit: `await spawnAsync("pi", ["-p", prompt])`
  - Remediation: `await spawnAsync("pi", ["-p", prompt])`
  - Structural audit: `await spawnAsync("sg", ["scan", "-r", rule, path])`
- The TUI stays fully responsive because promises just schedule continuations on the microtask queue; the event loop never blocks.

### State & Crash Recovery
- `state.json` written after every state change via `saveState()`
- `events.jsonl` append-only, flushed after each write via `log.append()`
- Pipeline resumes from saved state on restart (current phase, attempt, completed list)

## Module Structure (Refactoring Target)

### Problem
- `index.ts` — **800+ lines**, 11 inline command handlers, 2 component classes, loader state
- `bake.ts` — **580+ lines**, orchestrator + executor + audit + remediation all in one class
- Every new command or component makes the file worse

### Target Layout

```
/home/droid/pi-bake/
├── index.ts                   # Entry: session_start + import & register all commands
├── bake.ts                    # Bake class shell: state, orchestration, public API
├── bake-executor.ts           # runExecutor() extracted
├── bake-audit.ts              # runSemanticAudit(), runRemediation() extracted
├── auditor.ts                 # ast-grep + LLM audit (unchanged)
├── event-log.ts               # (unchanged)
├── spawn-async.ts             # (unchanged)
├── rpc-agent.ts               # (unchanged, minus AbortSignal fix)
├── commands/
│   ├── index.ts               # registerAll(pi, bake) — calls each register fn
│   ├── status.ts              # /bake-status
│   ├── start.ts               # /bake-start + LoaderComponent
│   ├── pause.ts               # /bake-pause
│   ├── resume.ts              # /bake-resume
│   ├── skip.ts                # /bake-skip + SelectList overlay
│   ├── steer.ts               # /bake-steer
│   ├── retry.ts               # /bake-retry
│   ├── log.ts                 # /bake-log
│   ├── detail.ts              # /bake-detail (event-log overlay, ~120 lines)
│   ├── rules.ts               # /bake-rules (SettingsList overlay, ~70 lines)
│   ├── reset.ts               # /bake-reset (confirmation overlay)
│   └── spec-decompose.ts      # /bake-spec-decompose
├── components/
│   ├── border.ts              # Border class (self-contained Component)
│   └── loader.ts              # LoaderComponent, loader state vars
├── rules/                     # (unchanged)
│   ├── base/*.yml
│   └── project/
├── phases/                    # User-managed phase files
├── docs/                      # Documentation
└── .pi/extensions/pi-bake/    # Symlinks (must match new file count)
```

### Principles
- **One file per command.** No inline handler lambdas in `index.ts`. Each file exports a `register` function that takes `(pi, bake)`.
- **Components in `components/`.** Reusable UI pieces (Border, LoaderComponent) that don't depend on command logic.
- **`index.ts` is thin.** Just `session_start` (widget init, status line) + calls to `commands/index.ts`.
- **Bake class is split by concern.** `bake.ts` owns state and orchestration. Execution, audit, and remediation are extracted so they can be tested and modified independently.
- **`rpc-agent.ts` gets an `AbortSignal` integration.** Currently `abort()` sends the message but `prompt()` may hang if the subprocess doesn't respond.

### Migration Path
1. Create new files with exports
2. Update `index.ts` to import from new locations
3. Remove inlined code from `index.ts`
4. Update `.pi/extensions/pi-bake/` symlinks
5. Test each command still works
6. Split `bake.ts` methods into `bake-executor.ts`, `bake-audit.ts`

### npm Packaging Target

After refactoring, the repo needs to become a proper pi npm package:

```json
{
  "name": "pi-bake",
  "version": "0.1.0",
  "type": "module",
  "keywords": ["pi-package"],
  "files": ["dist/", "rules/", "README.md"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "pi": {
    "extensions": ["./dist/index.js"],
    "image": "https://.../screenshot.png"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

Key requirements:
- **`pi` manifest** points to compiled `dist/index.js` — pi loads it when installed
- **`pi-package` keyword** makes it discoverable on the [package gallery](https://pi.dev/packages)
- **`peerDependencies`** for pi core packages (they're bundled with pi, never bundled in the tarball)
- **`rules/`** shipped as-is (`.yml` files resolved at runtime via `__dirname`)
- **Build step** compiles `src/` TypeScript to `dist/` JavaScript (pi loads `.ts` natively via jiti, but npm packages conventionally ship compiled JS)
- **`files` field** restricts the tarball to only `dist/`, `rules/`, and `README.md`

The `rules/` directory path is currently resolved via `__dirname` in `index.ts`:
```ts
const RULES_DIR = path.join(__dirname, "rules");
```
This works in both development (symlinked `.ts` files) and installed package (compiled `dist/index.js` at `node_modules/pi-bake/dist/`) because `__dirname` resolves relative to the actual file location. If the `rules/` dir is at the package root and the compiled JS is in `dist/`, the relative path needs to be `path.join(__dirname, "..", "rules")`.

## Next-Session TODO

1. **Refactor module structure** — split `index.ts` and `bake.ts` into manageable modules (see Module Structure below)
2. **Update `.pi/extensions/` symlinks** — match new file layout
3. **Run a full pipeline** — test that refactored modules load and execute correctly
4. **Test pause/resume/skip/steer/reset** — interactive controls during pipeline
5. **Make semantic audit stack-agnostic** — generalize `buildSemanticAuditPrompt()` in `auditor.ts`
6. **Wire metrics** — parse pi stderr for token counts, turns, cache hits from RPC subprocess

## Session 3 (2026-07-13) Summary — UX Polish & Robustness

### What was built
- **Border component**: Self-contained horizontal rule using only `pi-tui`'s `Component` interface. Same `"─".repeat(width)` as pi's internal `DynamicBorder`, no chained dependency.
- **Event-log-driven detail overlay**: `/bake-detail` now shows per-phase event timeline from `events.jsonl` + ↑↓ navigation through all phases
- **Real-time status line previews**: Throttled (300ms) LLM text delta forwarding during executor/audit/remediation
- **Rules panel**: `/bake-rules` with inline `SettingsListTheme` (no more missing `getSettingsListTheme`)
- **State sanity check**: `resetState()` method + auto-reset on startup if stale state detected
- **Decompose archiving**: Raw spec files moved to `.bake/archive/` after decomposition

### What was fixed
- **Footer overflow crash**: `visibleWidth()` + `truncateToWidth()` prevents line exceeding terminal width (portrait mode crash)
- **DynamicBorder import**: Was importing from wrong package (`pi-tui` instead of `pi-coding-agent`), now replaced with local `Border` class
- **getSettingsListTheme missing**: Function didn't exist in `pi-tui`, replaced with inline theme
- **Skip command [object Object]**: pi parses `[phase-name]` usage hint into object, now handles both string and object args
- **Stale footer data**: Removed custom footer (was redundant with widget), restored default pi footer with token/cache/cost stats
- **Stale status line**: Cleared on pipeline completion
- **Phase detail with no files**: Now reads phases from both `phases/` dir AND completed/skipped state
- **Consistent keyboard hints**: `esc/q close` standardized across overlays

### What was learned
- `setFooter` receives TUI instance as first arg but there's no external invalidation mechanism — default footer is better
- pi's default footer already color-codes context percentage (grey <70%, warning 70-90%, error >90%)
- Extension API (`sessionManager.getContextUsage()`) only exposes current context window, not cumulative token/cache stats
- pi's internal `FooterComponent` computes cumulative stats by iterating session entries — stats aren't exposed to extensions
- `registerCommand` usage hints with brackets (`[arg]`) cause pi to parse args into objects, not strings
- `pi-tui` has `TUI`, `Container`, `Component` etc. — `DynamicBorder` is in `pi-coding-agent` not `pi-tui`

### Key files
| File | Purpose |
|------|---------|
| `/home/droid/pi-bake/index.ts` | Extension entry: +Border class, event-log detail overlay, rules panel, status line deltas, state sanitization |
| `/home/droid/pi-bake/bake.ts` | +resetState(), +delta forwarding in executor/audit/remediation |
| `/home/droid/pi-bake/bake-ux-plan.md` | Updated UX plan with current status |

## Session 2 (2026-07-13) Summary

### What was built
- **Async spawn infrastructure**: `spawn-async.ts` — no more `spawnSync` in the codebase
- **Project-local extension loading**: `.pi/extensions/pi-bake/` with per-file symlinks
- **Kanban board test spec**: `phases/kanban-agent-spec.md` — deliberately verbose for decompose testing

### What was fixed
- `spawnSync` blocking TUI → async `spawn` everywhere
- Extension import failures in child `pi -p` processes (missing symlinked files)
- Attempt display off-by-one in widget (clamped to maxAttempts)
- Global extension symlinks removed in favor of project-local `.pi/extensions/`

### What was learned
- Multi-file extensions need ALL `.ts` files symlinked, not just `index.ts`
- Directory symlinks can cause duplicate registrations
- `spawnAsync` with status callback is the right pattern for non-blocking subprocess management
- `cmdCtx.ui.setStatus()` is more visible than `cmdCtx.ui.notify()`

### Key files
| File | Purpose |
|------|---------|
| `/home/droid/pi-bake/index.ts` | Extension entry: 9 commands, widget, status line |
| `/home/droid/pi-bake/bake.ts` | Core loop: phase loading → executor → audit → remediation |
| `/home/droid/pi-bake/auditor.ts` | Hybrid audit: structural (ast-grep) + semantic (LLM checklist) |
| `/home/droid/pi-bake/event-log.ts` | JSON-lines append-only event log with `tail()`, `filter()` |
| `/home/droid/pi-bake/spawn-async.ts` | Async spawn helper: Promise wrapper for `child_process.spawn` |
| `/home/droid/pi-bake/rules/base/*.yml` | 6 stack-agnostic ast-grep rules |
| `/home/droid/pi-bake/rpc-agent.ts` | Long-lived RPC subprocess wrapper for `pi --mode rpc` |
| `/home/droid/pi-bake/bake-v2-plan.md` | This file |
