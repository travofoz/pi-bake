# Bake Philosophy — Why This Works

## The Short Version

Bake is waterfall for LLM agents. And waterfall is underrated when you don't have people problems.

## The Long Version

### The Agile Thing

Agile was created to solve **human coordination problems**, not software problems:

| Agile fix | Human problem it solved |
|-----------|------------------------|
| Short iterations | Stakeholders lose patience waiting months |
| Standups | 5 devs don't know what each other is doing |
| Retros | Devs get defensive when QA rejects their work |
| Requirements churn | Product changes mind every week |
| MVPs | Big design up front takes too long to ship |

None of these apply to an LLM pipeline:

- **One executor, zero meetings.** There's no miscommunication between team members. The executor reads the spec and does the work.
- **No ego.** The executor doesn't argue with audit findings. It just fixes them.
- **No stakeholder patience problem.** The pipeline runs 24/7. A full 6-phase cycle takes minutes, not months.
- **No blame.** The circuit breaker isn't a performance review. It's data.

So while "waterfall" became a dirty word in software, it was always the human friction that broke it — not the model. Remove the humans, and the model works fine.

### The Sequential Bet

Bake runs phases **one at a time, in order**. Each phase goes through:

```
executor → structural audit → semantic audit → (remediate → loop) → ✅
```

This is deliberately not parallel. Here's why:

#### 1. Phases have dependencies

Our spec decomposition produces cumulative phases. Phase 02 literally edits files that phase 01 created. You cannot build card expansion before you have a board structure. Parallel execution would conflict on the same source files.

This isn't a limitation of the architecture — it's a property of how problems decompose. Most software features build on prior features. True independent workstreams are rarer than they seem.

#### 2. Fast feedback beats parallel throughput

A phase runs, gets audited deterministically in ~50ms (ast-grep), and if it fails, we fix it immediately. The feedback cycle is **90 seconds, not 3 months**. This is faster than any CI pipeline human teams have ever built. Parallelism that delays feedback (because you have to merge before you can verify) is a net loss.

#### 3. Simple state machine

```
idle → running → (paused) → done | failed
```

One current phase. One current attempt. A list of completed and skipped phases. That's it. No merge conflicts, no coordination barriers, no "worktree A is done but worktree B is stuck."

Parallel systems need answers to:
- What if tree A passes audit but tree B fails? Do we ship A's work?
- Who merges the divergent histories?
- How do we handle cross-tree dependencies?
- Does the circuit breaker halt all trees or just the failing one?

These are solvable problems. But they add complexity that, for our use case, outweighs the benefit.

#### 4. LLMs aren't great at parallel coordination

Give an LLM agent two parallel workstreams and it will happily edit the same file in contradictory ways. It has no awareness of the other workstream. This is a fundamental limitation of stateless execution — each agent starts fresh, with no shared context.

We mitigate this by keeping the *entire context* in one sequential session. The executor knows what it built in phase 01 because it just finished phase 01.

### What About Speed?

A 6-phase pipeline with 3 max attempts per phase takes about 15-30 minutes. For that, you get:

- Working software
- Verified against deterministic structural rules
- Checked by a semantic audit
- No regressions from skipped tasks (remediation verification catches what was missed)
- A full event log you can inspect

That's faster than a human team can do standup. If throughput is the bottleneck, the answer isn't parallelism — it's shrinking the phase granularity (more, smaller phases → faster feedback, easier audits).

### The Waterfall We Actually Built

Classic waterfall failed because:

| Failure mode | Our fix |
|---|---|
| Requirements freeze | New spec = new bake run. Phases already completed are skipped. |
| Long feedback cycles | Structural audit in 50ms. Full cycle in minutes. |
| Big bang integration | Each phase builds on the previous one. No integration surprise. |
| Human blame culture | No humans. Just logs. |
| Change is expensive | Cost of change = cost of a new bake run. No change orders, no meetings. |

### When Parallelism Might Make Sense

We're not dogmatic. Parallel execution would help if:

- **Phases are truly independent** — building two completely unrelated subsystems. This would require a different spec decomposition strategy (identifying independent workstreams rather than sequential steps).
- **Remediation tasks are independent** — 5 audit findings that touch different files. You could fix them in parallel within a single phase.
- **The bottleneck shifts** — if a single phase takes hours (not minutes), you might want to split it into parallel sub-phases.

But we'll hit those edges first, then redesign. Not before.

### Summary

> Bake is waterfall with the human problems removed. You kept the structure — phases, gates, verification — and ditched the friction that made Agile necessary in the first place.

The pipeline is sequential because:
1. Phases depend on each other
2. Fast feedback beats parallel throughput
3. Simple state is valuable
4. LLMs can't coordinate

If that's "waterfall," fine. It ships working software, adapts to change in minutes, and runs 24/7. That's more agile than any sprint ever was.
