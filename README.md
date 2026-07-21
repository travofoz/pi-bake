# 🔥 pi-bake

**Autonomous phase execution for [pi](https://pi.dev).** Bake runs a spec-driven pipeline: executor → structural audit (ast-grep) → semantic audit (LLM) → remediation → repeat/circuit-breaker. Each phase is a focused, verifiable unit. The meta-point: proving open-weight models are production-ready for agentic coding loops right now.

```
bake-start → executor → ast-grep audit → LLM audit → (remediate → loop) → ✅ / ❌
```

## How It Works

You write phase specs (markdown files in `phases/`), each with a clear objective and done-when criteria. Bake runs them through a multi-stage pipeline (sequentially per phase, with DAG support for parallel phases via dag.json):

1. **Executor** — fires up a fresh `pi --mode rpc` subprocess with the phase spec, lets it code
2. **Structural audit** — runs ast-grep rules against the workspace (deterministic, ~50ms)
3. **Semantic audit** — LLM checks the phase's done-when criteria
4. **Remediation** — if audits fail, feeds findings back to the executor for another pass (up to N attempts)
5. **Circuit breaker** — if remediation maxes out, the phase is marked failed and the pipeline halts

Phases with no cross-dependencies run concurrently. A `dag.json` manifest in `phases/` declares the dependency graph — independent phases execute in parallel batches.

State is tracked in `.bake/state.json` — you can pause, resume, skip, steer, and retry phases at any time.

### Commands

| Command | What it does |
| --- | --- |
| `/bake-start` | Run the pipeline (or resume from where it left off) |
| `/bake-pause` | Pause after the current phase finishes |
| `/bake-resume` | Resume a paused pipeline |
| `/bake-skip` | Mark the current phase as skipped, move to next |
| `/bake-retry` | Retry the current phase (re-run executor from scratch) |
| `/bake-steer <msg>` | Inject steering guidance for the next executor run |
| `/bake-status` | Show current state, recent events |
| `/bake-log` | View the full event log |
| `/bake-detail` | Deep dive on the current phase |
| `/bake-rules` | Toggle ast-grep audit rules on/off |
| `/bake-reset` | Reset bake state (prevents re-execution of completed phases unless you delete phase files) |
| `/bake-spec-decompose <path>` | Decompose a raw spec file into clean phase files |
| `/bake-config` | Widget mode, preferences |
| `/bake-widget` | Manually refresh the status widget |

## Quick Start

```
# 1. Install
pi install npm:@travofoz/pi-bake
# (or pi install -l npm:@travofoz/pi-bake for project-local)

# 2. Reload
/reload

# 3. Create a phase file
mkdir -p phases
cat > phases/01_hello.md << 'EOF'
# 01_hello

## Objective

Create a hello.txt file with "Hello from bake!" in it.

## Done When

- [ ] hello.txt exists with the expected content
EOF

# 4. Bake it
/bake-start
```

The widget will show each phase as it runs through executor → audit → remediation.

## Install

Extensions in pi can be **global** (available in all projects) or **project-local** (only in the current project). The same package works for both — scope is determined by the `-l` flag at install time.

You'll need to be logged into npm (`npm login`) if installing from a private scope.

```bash
# Global install — available everywhere
pi install npm:@travofoz/pi-bake

# Project-local install — only in this project
pi install -l npm:@travofoz/pi-bake

# Or try it without installing (one-shot)
pi -e npm:@travofoz/pi-bake
```

After installing, `/reload` in pi (or restart) and you'll see the bake widget. Run `/bake-start` with some phase files in `phases/` to kick off.

### Requirements

- [pi](https://pi.dev)
- [ast-grep](https://ast-grep.github.io/) (`sg`) on `$PATH` for structural audits — `npm install -g @ast-grep/cli` or your package manager
- An LLM provider configured in pi (any model works; open-weight models are the point)

## Anatomy of a Phase File

Phase files live in `phases/` and look like this:

```markdown
# 01_setup_project

## Objective

Initialize the project with package.json, TypeScript config, and directory structure.

## Done When

- [ ] `package.json` exists with dependencies
- [ ] `tsconfig.json` exists with proper settings
- [ ] `src/` directory exists
- [ ] `npm install` succeeds
```

Files are sorted by name and executed in order. Each phase is a focused, verifiable unit — decompose big problems into small phases.

## ast-grep Rules

Bake ships with a set of structural audit rules in `rules/base/` that run after each executor pass. These catch common issues deterministically (~50ms) before the semantic LLM audit even fires.

| Rule | Catches |
| --- | --- |
| `no-console-log` | `console.log(...)` in production code |
| `no-debugger` | Stray `debugger` statements |
| `no-empty-catch` | Bare `catch {}` swallowing errors |
| `no-dead-ternary` | Ternary branches that always evaluate the same way |
| `no-hardcoded-branch` | Hardcoded conditionals that should be config |
| `no-sync-revoke` | Sync calls in async contexts |

Use `/bake-rules` to toggle rules on/off per project.

## Architecture

```
index.ts              — entry point, registers commands + lifecycle hooks
bake.ts               — phase execution loop, state machine, orchestration
bake-executor.ts      — runs a phase via pi RPC subprocess
bake-audit.ts         — semantic audit + remediation via LLM
auditor.ts            — ast-grep structural checks + LLM audit prompt builder
rpc-agent.ts          — long-lived pi --mode rpc subprocess wrapper
event-log.ts          — append-only JSONL event log
commands/             — 14 commands (start, pause, resume, skip, steer, etc.)
components/           — TUI components (loader, border)
rules/base/           — ast-grep rule files (structural checks)
```

### Philosophy

Bake is "waterfall with the human problems removed." Sequential execution, deterministic gates, fast feedback — no meetings, no blame, no stakeholder churn. See [`docs/bake-philosophy.md`](docs/bake-philosophy.md) for the full rationale.

## Try It

Drop a few `.md` phase files into `phases/` (or use `/bake-spec-decompose` on a raw spec to generate them), then `/bake-start`. The widget will show progress as each phase runs through executor → audit → remediation.

This repo ships with the [PocketADB](PocketADB.md) project as an example — 7 phases that build an ESP32-C3 ADB/Shizuku hardware companion. Try:

```
/bake-start
```

## License

MIT — go build something.
