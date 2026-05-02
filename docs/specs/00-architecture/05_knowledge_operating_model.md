# Spec 05 — Knowledge Operating Model

**Status:** PROPOSED — future-state doctrine; not all wiring exists yet.
**Cross-references:** Spec 00 (Claude Code Operating Model), Spec 00 (Engineering Standards), `.claude/workflows.md` (WF5, WF6), `CLAUDE.md` §8 (Lessons).

<requirements>
## 1. Goal & User Story

**Goal:** Define how Buildo's project knowledge — specs, lessons, decisions, deferred work, audit findings, commit history — compounds into durable institutional memory rather than rotting into stale documents and zombie queues. Make every failure produce a destination-bound lesson; make every deferred item have a closure path.

**User Story:** As a Lead Software Engineer six months from now (human or LLM), I should be able to start a session, read the current state of the world, understand *why* the code looks the way it does (not just *what* it does), and act on accurate, current context — without spelunking through 200 commits or asking "do we still believe X?"

The mental model: **codebase + specs + lessons = the project's "weights."** Every PR, audit finding, incident, and deferred item is a training example. The loss function is *"did the same class of failure recur?"* If yes, the loop is broken — find which destination should have caught it and didn't.
</requirements>

---

<architecture>
## 2. The Five Durable Destinations

Where lessons live, ranked by enforcement strength. When a finding lands, choose the strongest destination that fits — never weaker.

| Destination | Catches it… | Use when |
|---|---|---|
| **Test** (regression / unhappy-path) | Automatically, forever | Bug has a deterministic reproducer |
| **Lint rule / type / pre-commit hook** | Before commit | Class of mistake is structural (e.g., `process.exit()` ban, no-empty catch) |
| **Spec / `CLAUDE.md` / engineering standards** | Next time agent reads it | Behavioral contract, convention, or "Known failure modes" |
| **`tasks/lessons.md`** | Session start | Gotcha that doesn't fit a spec but is project-specific |
| **`MEMORY.md`** (Claude auto-memory) | In future Claude sessions only | Working-style preferences, user-specific feedback |

**Anti-destination:** *"only in the commit log"* is allowed for one-off fixes with no recurrence risk, but must be justified explicitly. Audit reports (`docs/reports/`) are NOT a destination — they are write-once artifacts; lessons must migrate out of them or they cease to exist.

## 3. Artifact Ownership Map

| Artifact | Source of truth | Hand-written or derived | Read by |
|---|---|---|---|
| `docs/specs/` | hand-written | hand-written | every workflow |
| `CLAUDE.md` | hand-written | hand-written | session start |
| `tasks/lessons.md` | hand-written | hand-written | session start |
| `docs/reports/review_followups.md` | hand-written | seeded by commit `Deferred:` footers | weekly triage |
| `docs/reports/` (audits, code reviews) | hand-written | hand-written | reviewed once, then harvested |
| `docs/decisions/<NNNN>-<slug>.md` | hand-written | hand-written when choice is made | ADR lookup |
| `docs/decisions/INDEX.md` | derived | lists hand-written ADRs + harvests commit-embedded decisions | ADR navigation |
| `docs/incidents/<date>-<slug>.md` | hand-written | hand-written postmortem after the incident | incident review |
| `docs/incidents/INDEX.md` | derived | `scripts/harvest-commits.mjs` | postmortem navigation |
| `docs/deferred.md` | derived | reconciles commit footers ↔ `review_followups.md` | weekly triage |
| `MEMORY.md` (auto-memory) | Claude-managed | from conversation | every Claude session |
| Git commit log | hand-written | structured per §5 footer schema | harvest scripts |

The principle: **the commit log is already the institutional memory layer.** Every fix produces a forever-record of what was wrong, why, what changed, what was deferred. The gap is **retrieval**, not capture — derived indexes (decisions, incidents, deferred reconciliation) are *views* over the log, not duplicate sources of truth.
</architecture>

---

<behavior>
## 4. The "Where Does the Lesson Go?" Protocol

Triggered at the close of every WF6 (Review & Commit) and at the close of every WF5 (Audit) before findings are committed.

**For each CRITICAL or HIGH finding fixed in this commit:**
1. Declare a destination from §2's table.
2. Make the change to that destination *in the same commit* (or link the follow-up commit if it must be separate).
3. If destination is "only in commit log," write a one-line justification in the commit body under `Lesson-routing:`.

**For each finding deferred:**
1. Append to `docs/reports/review_followups.md` with severity, spec, source commit SHA, and `triage_after` date (default: 4 weeks).
2. Append to commit body under `Deferred:` footer (already current practice — formalized in §5).

**For each NEW class of failure** (i.e., not seen before):
1. Update the relevant spec's "Known failure modes" section (add this section if missing).
2. If it generalizes beyond one spec, add to `tasks/lessons.md`.
3. If it changes how Claude should approach work in this project, save to `MEMORY.md` as a feedback-type memory.

The rule: a CRITICAL/HIGH finding without a §2 destination cannot ship. "Fixed" without a durable guard is incomplete work.

## 5. Commit Footer Schema

Formalizes the convention already present in commits like `7dfe1a1` and `2452bad`. Required for any commit that fixes a CRITICAL or HIGH finding; optional but encouraged otherwise.

```
<conventional-commit subject line>

<paragraph(s) describing the change and reasoning>

Spec: <spec_id_or_NA>
Severity: <CRITICAL×N, HIGH×N, MED×N, LOW×N, or N/A>
Reviewers: <gemini, deepseek, code-reviewer, human, or N/A>
Tests: <file +N, file +N>
Deferred: <count> → review_followups.md#<anchor>
Lesson-routing: <test | lint | spec:<id> | lessons | memory | commit-only:<reason>>

Co-Authored-By: <model> <noreply@anthropic.com>
```

Machine-parseable. Enables `scripts/harvest-commits.mjs` to produce derived indexes without duplicating the source.

## 6. Cadences

| Cadence | What runs | Output |
|---|---|---|
| **Per-commit (WF6)** | "Where does the lesson go?" gate (§4) | Updated test / lint / spec / lessons / memory in same commit |
| **Per-WF5 audit** | Findings routed before report is filed | Each finding has destination declared inline |
| **Weekly triage** (Friday, 30 min) | Walk `docs/deferred.md` | Each item: promote / defer-with-reason / kill / convert-to-lesson; `last_reviewed` updated |
| **Per-spec-edit** | Regenerate system map | `docs/specs/00-architecture/00_system_map.md` current |
| **Monthly harvest** | Run `scripts/harvest-commits.mjs` | Refreshed `docs/decisions/INDEX.md`, `docs/incidents/INDEX.md`, `docs/deferred.md` |
| **Quarterly retrospective** | Read last 90 days of `tasks/lessons.md` and `docs/incidents/` | Promote recurring patterns to engineering standards or lint rules |

Items in `docs/deferred.md` past their `triage_after` date without a status update auto-flag for kill at the next weekly triage. Zombie items (4+ weeks unreviewed) are the primary failure mode this cadence prevents.

## 7. Anti-Patterns

Documented here so future-us recognizes them in the wild.

- **Lesson dies in audit report.** Finding logged in `docs/reports/audit_*.md`, marked "addressed," no test or spec change. The audit file is read once and never again — the lesson is effectively gone.
- **Spec unchanged after CRITICAL fix.** Bug fixed, commit body explains the reasoning, spec still describes the old (broken) behavior or omits the failure mode entirely. Next time someone refactors that area, the spec misleads them.
- **Deferred zombie.** Item added to `review_followups.md`, never triaged, sits for months. Eventually nobody remembers what it meant or whether it's still relevant.
- **Advisory rule.** New convention announced in CLAUDE.md or a spec but not enforced by lint, type, or test. Within 4 weeks the rule decays into "a thing we used to care about." Worked example of the destination upgrade: the "migration runner UP/DOWN convention" started in `tasks/lessons.md` after commit `68643b3` fixed three migrations. WF5 audit `634fd1f` then surfaced 15 more — past the §4 3-finding threshold — triggering the upgrade to a pre-commit lint rule (`scripts/hooks/check-migration-down-comments.sh`, chained into `.husky/pre-commit`). The lesson now physically blocks the failure mode at commit time instead of relying on developers reading `tasks/lessons.md` at session start.
- **Knowledge silo'd in chat.** Decision discussed in conversation, never lands in a commit body or spec. Disappears when the chat session ends.
- **Duplicate source of truth.** Same fact written into both a spec and a derived index by hand. They drift; nobody knows which is authoritative.
- **Doctrine without enforcement.** The most insidious — a process spec is written, agreed to, and then forgotten in 3 weeks because no hook physically blocks the failure mode it describes. Fix: every cadence in §6 must have a corresponding enforcement mechanism (pre-commit hook, scheduled agent, or Stop hook). Adopted 2026-05-01 with `.husky/commit-msg` + `check-lesson-routing.sh` (per-commit) and routine `trig_0136ErEdsPryYk2rD9vBkXhW` (weekly). Discovered while writing this spec: the question "how do we not forget to do this?" is itself an instance of the §4 protocol applied to the spec.
</behavior>

---

<testing>
## 8. Verification Cadences

This is a process spec, not a code spec — there are no `*.test.ts` files. Verification is procedural:

- **Quarterly self-audit:** Pick 5 random commits from the last 90 days that fixed CRITICAL/HIGH findings. For each, verify the lesson reached its declared destination and is still present (not silently reverted, not orphaned).
- **Recurrence check:** When a CRITICAL or HIGH finding lands, search the last 12 months of lessons / specs / commit messages for the same class of bug. If found, the loop failed for that class — escalate the destination (test → lint → standards) and document in §7.
- **Deferred-queue health metric:** Count items in `docs/deferred.md` with `last_reviewed > 4 weeks ago`. Target: zero. If non-zero for two consecutive triages, the cadence has broken — investigate why.
</testing>

---

<constraints>
## 9. Implementation — Wiring This Spec Into Workflows

Listed in dependency order. None are large; the value is in their composition.

1. **`CLAUDE.md` §8** — add: *"Read `docs/specs/00-architecture/05_knowledge_operating_model.md` when fixing CRITICAL/HIGH bugs or running WF5/WF6."* One line.
2. **`.claude/workflows.md` WF6** — add explicit "where does the lesson go?" step citing §4. Replace the existing implicit practice with the formal protocol.
3. **`.claude/workflows.md` WF5** — add the routing requirement before findings are filed: each finding declares destination inline, not in a follow-up.
4. **`docs/specs/00-architecture/_spec_template.md`** — add a `## Known Failure Modes` section to the template (after Behavioral Contract). Optional per spec; required after first CRITICAL/HIGH fix touches the spec's surface.
5. **`scripts/harvest-commits.mjs`** — new ~80-line script that parses commit footer schema (§5) and emits `docs/decisions/INDEX.md`, `docs/incidents/INDEX.md`, `docs/deferred.md`. Run monthly via npm script.
6. **`docs/deferred.md`** — initial seed by harvesting current `review_followups.md` entries; thereafter maintained by the script.
7. **Weekly triage ritual** — calendar reminder; output is updated `last_reviewed` dates and triage decisions.

**Order of adoption:** 1 → 2 → 3 first (zero-cost wiring). Run the cadences for 4 weeks against the current artifact set. Then build #5 once the schema is proven by use. Premature automation of an unstable schema would just lock in the wrong shape.

## 10. Operating Boundaries

### Target Files
- This spec
- `CLAUDE.md` (one-line reference)
- `.claude/workflows.md` (WF5, WF6 amendments)
- `docs/specs/00-architecture/_spec_template.md` (add "Known Failure Modes" section)
- `scripts/harvest-commits.mjs` (new, deferred until cadence proven)
- `docs/deferred.md` (new, derived)
- `docs/decisions/`, `docs/incidents/` (new directories, derived content)

### Out-of-Scope Files
- Feature specs in `docs/specs/01-pipeline/`, `02-web-admin/`, `03-mobile/` — they describe WHAT the system does, not HOW we learn from it. They consume this spec's protocol but are not modified by it (except for the optional "Known Failure Modes" section per #4 above).
- `docs/specs/00_claude_code_operating_model.md` — describes Claude tooling and context loading, not knowledge flow. The two specs are siblings; do not merge.
- Tool-config files (`.claude/settings.json`, `.husky/`) — they implement enforcement but are not the doctrine.

### Cross-Spec Dependencies
- **Relies on:** Spec 00 Engineering Standards (defines the §10 Plan Compliance gate that WF6 calls); Spec 00 Claude Code Operating Model (defines what loads at session start, including this spec).
- **Consumed by:** every workflow in `.claude/workflows.md` that produces findings or fixes (WF2, WF3, WF5, WF6 primarily).
- **Future spec:** an eventual *"Postmortem Template"* spec under `docs/incidents/` once the first real production incident occurs. Do not create empty.
</constraints>
