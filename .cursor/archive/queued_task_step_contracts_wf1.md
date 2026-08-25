# Queued Task (WF1): Step Contracts — make cross-step contracts tier-2

**Status:** Planning (queued behind the B3 output-fold remediation A–F)
**Domain Mode:** Backend/Pipeline — read `scripts/CLAUDE.md` + `docs/specs/00_engineering_standards.md`
**Doctrine:** Spec 119 §4.6 (the generated-beats-documented ladder this task exists to climb)

## Context
* **Goal:** stop cross-step contracts from being re-derived by hand. Today they are **tier 0** — written in Spec 47, drawn in the lineage map, enforced by nothing — so every new gate hand-writes its own constants and every session re-establishes the same facts by reading code.
* **Provenance:** the Phase B B3 output panel produced ~20 findings on one commit; the two most consequential were contracts **already written down and unenforced** — Spec 47 §11.1 (`records_updated` must aggregate; `enrich-parcels.js` has violated it since day one) and `data-lineage-map.md:856` (`lot_size_sqm` producer, omitted from a hand-written `UPSTREAM_SLUGS`).
* **The proven mechanism, already in this repo:** `generate-lineage-docs.mjs` → `data-lineage-map.md` → `data-lineage-map.infra.test.ts` drift guard. **Nobody hand-maintains column lineage, because they can't.** This task applies that same mechanism to the three contracts that remain hand-maintained.
* **NOT a review-process change.** No new agents, no new panel seats. Every review layer added this year was a response to a defect that a drift guard would have caught mechanically.

## The one shape, repeated (this is the standardization)
**Every phase below does exactly three things, in this order.** If a phase cannot do all three, it is not done.
1. **GENERATE** — derive the contract from the system itself (DB, `emitMeta`, migrations). Never hand-authored.
2. **GUARD** — commit the artifact; a CI test fails when code and artifact disagree.
3. **CONSUME** — the dependent code reads the generated artifact. A hand-maintained constant sitting beside a generated one is the defect, not a convenience.

Reviewability rule: a phase is judged on whether a wrong hand-edit *fails a test*, not on whether the artifact looks right.

---

## Phase 0 — The weakness map (measure before building)
**Builds nothing. Produces the inventory** — the "where exactly are the weaknesses" answer, mechanically rather than by opinion.
For all 66 in-chain steps, generate a per-step tier table:

| contract | tier today | known damage |
|---|---|---|
| column lineage (produces/consumes) | **2** — generated + drift-guarded | none; the control case that proves the mechanism |
| **upstream dependency sets** | **0** — hand-written slug arrays | ≥3 hand-written (B3); ≥1 provably wrong (`sources:parcels` omitted) |
| **counter semantics** | **0** — Spec 47 §11.1 prose | ≥1 violation shipped and then depended on by a gate (`enrich_parcels`, 4 of 5 passes uncounted) |
| **status / skip vocabulary** | **0** — hardcoded per consumer | 4 skip classes found ad hoc by 4 different reviewers in one session |

Deliverable: a committed report naming, per step, which contracts are declared vs inferred, plus the count of hand-maintained constants that duplicate generated data. **This number is the task's success metric** — it must go to zero and stay there.
*Exit:* the inventory exists and is drift-guarded like any other generated artifact.

## Phase 1 — Upstream sets, derived (highest value / lowest cost — do first)
**No new declaration is needed.** The lineage map already knows every column a step consumes and every step that produces it; the upstream set is a join over data we already generate.
1. **GENERATE** `stepUpstreams(slug)` → producer slugs for everything the step consumes, from the lineage source.
2. **GUARD** a test asserting every hand-written `UPSTREAM_SLUGS` equals its derived set — which fails TODAY on the cost step (`sources:parcels`), so it lands red-first by construction.
3. **CONSUME** the B3 run-ledger gate takes a slug and derives its own set. Delete the three hand-written arrays.
*Kills:* the D#6 class permanently. *Red:* the cost step's known-missing producer; a synthetic column added to a step's consume-set appears in its upstream set without a human edit.

## Phase 2 — Counter semantics, declared and asserted
Spec 47 §11.1 and `:685` already define the rule. This phase makes it executable.
1. **GENERATE** each step declares (alongside `emitMeta`) its counters' **primary entity** and which write operations contribute; harvest into `docs/reference/step-counter-contracts.md`.
2. **GUARD** a runtime assertion + CI test: a step's reported `records_updated` must equal the summed `rowCount` of its declared UPDATEs against the declared entity. **`enrich-parcels.js` fails this today** — red-first by construction, and the A–F remediation's fix is what makes it green.
3. **CONSUME** any gate reading a counter first reads its declared semantics; a counter with no declaration is a hard error, never a silent default.
*Kills:* the D#5 class — a blind counter can no longer ship, let alone be depended upon for months.

## Phase 3 — Status / skip vocabulary, enumerated
1. **GENERATE** one declared enum of terminal statuses and which steps may emit which (`completed`, `failed`, `skipped`, `deferred_to_full`, in-script gate skip, …).
2. **GUARD** a test that every literal status in `scripts/`/`src/` is in the enum; adding a status without registering it fails CI.
3. **CONSUME** `OK_STATUSES`, `RAN_STATUSES`, `classifyStepCompleteness`, the admin renderers and the freshness logic read the enum instead of hardcoding lists.
*Kills:* the four-skip-classes problem, and the `duration_ms = 0` convention mismatch that produced a false-anomaly bug nobody owned.

## Phase 4 — Gates consume contracts end-to-end
No slug arrays, no counter assumptions, no status literals anywhere in gate code. A new gate is then a **declaration**, not an implementation — which is the actual goal.

## Phase 5 — The step-contract template + standardization sweep
One `docs/specs/_step_template.md` section every step fills in, and a sweep bringing existing steps onto it. **Similar steps end up looking similar because the template is generated-and-guarded, not because reviewers remember to ask.**

---

## Sequencing + honest sizing
* **Phase 0 → 1 delivers most of the value** and is small: no new declaration surface, one join, one test, three deletions. If this task gets cut short, cut after Phase 1.
* Phase 2 is the largest (a new declaration surface across 66 steps) and should be **incremental** — declare-or-error only for steps a gate actually reads, then widen.
* Phases 3–5 are mechanical once 1–2 land.
* **Do not start before A–F is committed.** Phase 2's red case is `enrich-parcels.js`'s counter, whose fix lives in A–F; starting early entangles the two exactly as the fold-simplicity rule warns.

## Standards Compliance
* **Database Impact:** NO — this reads `pipeline_runs.records_meta` and existing lineage; no schema change.
* **Try-Catch Boundary / logError:** N/A (generators + tests); `scripts/` domain uses `pipeline.log.error`.
* **Unhappy Path Tests:** an undeclared counter is a hard error; an unregistered status fails CI; a hand-edited artifact fails drift.
* **Lint caveat:** `npm run lint` is `next lint` and does NOT cover `scripts/` — run eslint directly on generators.

## Explicitly out of scope
Fixing every violation the guards surface. **The guards are the deliverable; the violations they find get filed and triaged normally.** Widening this into "and fix everything it catches" is how a structural task becomes another twenty-finding remediation.

---
> **PLAN LOCKED. Authorize after A–F closes? (y/n)**
