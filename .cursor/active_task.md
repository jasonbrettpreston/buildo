# Active Task: WF3 — refine `shouldAppendRealtor` gating (sub-axes: permit_type + scope_tags) and purge ~125K wrong realtor rows
**Status:** Implementation
**Workflow:** WF3 (Fix — same root cause across the realtor classifier surface; bundling the dual-path mirror + 4 call sites is one finding, not four)
**Domain Mode:** Cross-Domain (Backend/Pipeline + Web Admin) — `scripts/classify-permits.js` + `scripts/lib/permit-type-classifier.js` (JS dual-path) + `src/lib/classification/classifier.ts` + `src/lib/classification/permit-type-class.ts` (TS dual-path) + parity test + live-DB regression-lock
**Rollback Anchor:** `09e8828` (current HEAD on `main` — neighbourhoods FK-join repair)
**Multi-Agent Review:** REQUIRED per user request — Gemini + DeepSeek + worktree code-reviewer in parallel.

## Context

* **Bug:** WF2 #2 (`9fdd31e`) gated realtor on `permit_type_class === 'construction'` per Spec 80 §5 — but the `construction` class (mig 120, WF2 #1) bundles too much. Live audit against the dev DB (2026-05-09):

  | permit_type | class | realtor rows | Realtor-relevant? |
  |---|---|---|---|
  | Plumbing(PS) | construction | 50,763 | NO — trade-only fix permit |
  | Small Residential Projects | construction | 50,662 | YES |
  | Mechanical(MS) | construction | 41,877 | NO — HVAC trade-only |
  | Building Additions/Alterations | construction | 36,326 | YES |
  | Drain and Site Service | construction | 16,241 | NO — sewer/drain trade |
  | New Houses | construction | 13,785 | YES |
  | Residential Building Permit | construction | 3,386 | YES |
  | New Building | construction | 2,761 | YES (when residential) |
  | Demolition Folder (DM) | construction | 2,573 | NO — pre-construction; the new build gets realtor |
  | Non-Residential Building Permit | construction | 875 | NO — commercial |

  PLUS **75,795 realtor rows** sit on permits with `'commercial' = ANY(scope_tags)`. The current contract emits realtor for every construction-class permit; the right contract emits realtor only when the permit is plausibly a "home will be sold" signal.

* **Goal:** Refine `shouldAppendRealtor` from a 1-axis check (`permitClass === 'construction'`) to a 3-axis check:
  1. `permitClass === 'construction'` (existing — keeps the safe-skip default for unclassified/non-construction)
  2. `permit_type ∈ REALTOR_RELEVANT_TYPES` — NEW. The 5 residential building permit types: `New Building`, `Building Additions/Alterations`, `New Houses`, `Small Residential Projects`, `Residential Building Permit`. Excludes trade-only permits (PLB, MS, DSS), demolition (DM), and commercial (Non-Residential Building Permit).
  3. `'commercial' ∉ scope_tags` — NEW. Filters mixed-use permits where the residential building type carries a commercial scope tag (e.g., a `Building Additions/Alterations` to a commercial unit). Catches the 75,795 row class regardless of permit_type.

* **Behavioral expectation post-merge:** the contract emits realtor only for residential structural permits without commercial scope. The pipeline re-run (`classify-permits.js`) DELETE+INSERTs `permit_trades`, so ~125K wrong realtor rows disappear naturally and ~75K right realtor rows on residential additions/new builds are preserved.

* **Target Spec:** `docs/specs/01-pipeline/80_taxonomies.md` §5 (Cost-model + Trade-matrix sub-tables already document the existing class gating; this WF amends to introduce sub-axes within the construction class for the realtor signal specifically). Spec 91 §3.5 (mobile lead feed realtor wire-up) is a downstream consumer that needs only a cross-reference, not a contract change.

## Technical Implementation

### Design choice: code constant vs DB-driven taxonomy

**Option A (code constant) — chosen.** `REALTOR_RELEVANT_TYPES` is a frozen Set in both TS and JS dual-path mirrors. Surgical fix; ships fast. Trade-off: adding a residential type requires a code deploy.

**Option B (DB-driven `permit_type_classifications.realtor_eligible BOOLEAN`).** Operator-tunable per Spec 86 §1. Bigger scope: migration + admin UI + lookup-map change in both surfaces. Filed as deferred follow-up in `review_followups.md`. Future WF when the residential type list churns or operator-side experimentation is needed.

### The new contract

```ts
// TS — src/lib/classification/permit-type-class.ts
export const REALTOR_RELEVANT_TYPES = new Set([
  'New Building',
  'Building Additions/Alterations',
  'New Houses',
  'Small Residential Projects',
  'Residential Building Permit',
] as const);

export function shouldAppendRealtor(
  permitClass: PermitTypeClass,
  permitType: string | null | undefined,
  scopeTags: readonly string[] | null | undefined,
): boolean {
  if (permitClass !== CONSTRUCTION) return false;
  if (permitType == null || !REALTOR_RELEVANT_TYPES.has(permitType)) return false;
  if (scopeTags?.includes('commercial')) return false;
  return true;
}
```

```js
// JS mirror — scripts/lib/permit-type-classifier.js
const REALTOR_RELEVANT_TYPES = Object.freeze(new Set([
  'New Building',
  'Building Additions/Alterations',
  'New Houses',
  'Small Residential Projects',
  'Residential Building Permit',
]));

function shouldAppendRealtor(permitClass, permitType, scopeTags) {
  if (permitClass !== CONSTRUCTION) return false;
  if (permitType == null || !REALTOR_RELEVANT_TYPES.has(permitType)) return false;
  if (Array.isArray(scopeTags) && scopeTags.includes('commercial')) return false;
  return true;
}
```

Edge cases:
- `permit_type === null` — fail-closed (no realtor). Production data always has permit_type set (NOT NULL in mig 001's source-data shape, though the column itself allows NULL); fail-closed is the conservative default.
- `scope_tags === null` — pass through. NULL means "no scope classified yet"; we don't assume commercial in absence of evidence. Aligns with Spec 80 §5 default-discipline (default-to-safe-skip applies to enum, not array).
- `scope_tags === ['commercial', 'residential']` — fail-closed (commercial present). Mixed-use is rare; a future WF can add nuance if it surfaces.

### Call-site updates (4 sites — same one-line change pattern)

| Surface | File:line | Current call | New call |
|---|---|---|---|
| TS classifier | `src/lib/classification/classifier.ts` (`appendRealtorMatch` callsite) | `shouldAppendRealtor(permitClass)` | `shouldAppendRealtor(permitClass, permit.permit_type, permit.scope_tags)` |
| JS pipeline | `scripts/classify-permits.js` (`appendRealtorMatch` callsite) | same | same |

The `appendRealtorMatch` helper signatures may also need to thread `permit_type` and `scope_tags`. R5 walks each file to confirm.

### Test layering

| File | New / extended assertions |
|---|---|
| `src/tests/permit-type-class.logic.test.ts` | (extend) `shouldAppendRealtor` signature change — JS↔TS surface parity for every (class × permit_type × scope_tags) cell. Forbidden combinations: trade-only types, commercial scope, non-construction class. Allowed combinations: 5 residential types × construction × scope_tags without 'commercial'. |
| `src/tests/classification.logic.test.ts` (or `realtor-availability-guard.logic.test.ts`) | (extend) `classifyPermit` integration tests for the new gating axes — every existing realtor-related fixture confirms the new contract; new fixtures cover the 4 reject cases (PLB, MS, DM, commercial-scoped). |
| **NEW** `src/tests/db/realtor-gating.db.test.ts` | Live-DB regression-lock — seed 6 permits (one per permit_type × scope_tag combination above), run `classifyPermit` on each, assert the realtor TradeMatch is appended only on the 1 valid row. This is the test that would have caught the 75K commercial-realtor row class at WF2 #2 commit time. |
| `src/tests/parity-battery.test.ts` (if it covers realtor) | (extend) verify the JS/TS Brain dual-path returns identical realtor decisions for the new 3-axis contract. |

### Files (Modified / New)

- **MODIFIED** `src/lib/classification/permit-type-class.ts` — add `REALTOR_RELEVANT_TYPES` + extend `shouldAppendRealtor` signature + JSDoc + cross-reference Spec 80 §5
- **MODIFIED** `scripts/lib/permit-type-classifier.js` — JS mirror (Spec 7 §7.1 dual-path)
- **MODIFIED** `src/lib/classification/classifier.ts` — flow `permit_type` + `scope_tags` into the realtor append callsite
- **MODIFIED** `scripts/classify-permits.js` — same on the JS side; the in-memory fixture-loop already has the row's permit_type + scope_tags
- **MODIFIED** `src/tests/permit-type-class.logic.test.ts` — JS↔TS surface parity for new contract
- **MODIFIED** `src/tests/classification.logic.test.ts` (or `realtor-availability-guard.logic.test.ts`) — integration fixtures
- **NEW** `src/tests/db/realtor-gating.db.test.ts` — live-DB regression-lock (7 fixtures + 1 smoke = 8 assertions)
- **MODIFIED** `docs/specs/01-pipeline/80_taxonomies.md` §5 — append a "Realtor signal sub-gating" sub-table mirroring the existing Cost-model behaviors structure
- **MODIFIED** `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 — cross-reference (one-line note pointing back to Spec 80 §5)
- **MODIFIED** `docs/reports/review_followups.md` — file deferred Option B (DB-driven `realtor_eligible` column) as a future WF candidate

### Database Impact

NONE for schema. The pipeline re-run (post-merge) regenerates `permit_trades` via the existing DELETE+INSERT pattern in `classify-permits.js`. Expected impact: ~125K wrong realtor rows deleted (the trade-only / DM / commercial / non-residential rows), ~95K correct realtor rows preserved (the residential building types without commercial scope). No migration. No DDL.

## Standards Compliance

* **§2 Error handling:** No new throws. The signature extension is a pure-function change.
* **§5.1 Typed factories:** new live-DB test reuses the `getTestPool` + `dbAvailable` pattern proven by `lead-inspect-query.db.test.ts` and `neighbourhoods-fk-join.db.test.ts`.
* **§5.2 Test file pattern:** new `*.db.test.ts` follows the established convention.
* **§7 Dual Code Path:** `REALTOR_RELEVANT_TYPES` mirrored TS↔JS; parity regression-locked by `permit-type-class.logic.test.ts`.
* **§9 Pipeline Safety:** classify-permits.js DELETE+INSERT transaction boundary preserved. The in-memory fixture loop already has `permit_type` and `scope_tags` (no extra DB read needed).
* **Spec 47 §R*:** unchanged contract — no new logic_variables, no Zod schema changes.
* **Spec 80 §5:** amended to introduce sub-axes within the construction class for the realtor signal. The trade-matrix gating (`filterTradesByClass`) and cost-model gating (`shouldApplyCostSlicing`) are unchanged.
* **No backwards-compat hacks:** the extended signature requires updating every call site — same boundary churn that WF2 #2 accepted (existing tests need fixture updates to thread `permit_type` + `scope_tags`).

## State Verification (DONE before plan-lock)

* Live DB query 2026-05-09 confirmed:
  - 219,564 realtor rows on construction-class permits (the universe under the current contract)
  - Top 10 permit_types by realtor count: 50K PLB, 50K Small Residential, 42K MS, 36K Building Add/Alt, 16K DSS, 14K New Houses, 3K Residential Building, 2.7K New Building, 2.5K DM, 875 Non-Residential
  - 75,795 realtor rows have `'commercial' = ANY(scope_tags)`
* WF2 #2 contract (commit `9fdd31e`) confirmed at `src/lib/classification/permit-type-class.ts` `shouldAppendRealtor` and `scripts/lib/permit-type-classifier.js` mirror.
* The 5 residential building types are exactly the permit_types `permit_type_classifications` mig 120 classified as `construction` AND the user identified as residential structural work in this session.
* `permit_type` is read in both classifier surfaces alongside `scope_tags` already; the call-site extension is a parameter-threading change, not a new DB read.

## Execution Plan

- [ ] **R1** — Rollback anchor confirmed: `09e8828`. Branch: `main`.
- [ ] **R2** — Re-grep both classifier surfaces for the existing `shouldAppendRealtor()` callsites; confirm exactly 2 (TS + JS); confirm the call sites have `permit_type` + `scope_tags` in scope.
- [ ] **R3** — Spec Review: re-read Spec 80 §5, Spec 91 §3.5 (mobile realtor wire-up), Spec 7 §7.1 (dual-path).
- [ ] **R4** — Reproduction tests FIRST (Red Light), one file at a time:
  - Extend `permit-type-class.logic.test.ts` with the new 3-axis parity matrix (TS + JS).
  - Extend `classification.logic.test.ts` (or `realtor-availability-guard.logic.test.ts`) with the 4 reject-case fixtures (PLB, MS, DM, commercial-scoped).
  - Author `src/tests/db/realtor-gating.db.test.ts` — seeds 6 permits across the contract matrix; runs `classifyPermit` on each; asserts realtor appended only on the residential-non-commercial row.
  - Run vitest with `DATABASE_URL` set → all new tests MUST fail.
- [ ] **R5** — Implementation (one file at a time):
  - `src/lib/classification/permit-type-class.ts` — add `REALTOR_RELEVANT_TYPES` + extend signature
  - `scripts/lib/permit-type-classifier.js` — mirror
  - `src/lib/classification/classifier.ts` — thread args at the realtor append callsite
  - `scripts/classify-permits.js` — same on the JS side
  - `docs/specs/01-pipeline/80_taxonomies.md` §5 — Realtor signal sub-gating sub-table
  - `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 — cross-reference
  - `docs/reports/review_followups.md` — file Option B deferral
- [ ] **R6** — Green Light: targeted tests pass; `npm run typecheck && npm run lint -- --fix && npm run test`.
- [ ] **R7** — Idempotency: re-run live-DB test 2× consecutively.
- [ ] **R8** — Live verification:
  - Re-run live audit query: confirm the new contract would fire on a sample of seeded fixtures.
  - Ad-hoc: pick one of each rejected permit_type from real dev DB, call `classifyPermit` on it via a debug script, confirm realtor is NOT in the matches.
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. `REALTOR_RELEVANT_TYPES` is mirrored TS↔JS with identical entries (5 strings, exact case)?
  2. The 3-axis check fires in correct order (`permitClass` → `permitType` → `scopeTags`); each axis has unit-level coverage?
  3. Live-DB test seeds at least one fixture for each of the 4 reject classes (trade-only, demolition, non-residential, commercial-scope) + at least one allow class?
  4. The DELETE+INSERT pattern in classify-permits.js is preserved (no transaction boundary disturbed by the parameter-threading change)?
  5. Commit message documents the operator runbook step (re-run `classify-permits.js` post-merge)?
- [ ] **R10** — **Multi-Agent Review (REQUIRED — user request, three parallel tool calls in a single message):**
  - Gemini: review `scripts/classify-permits.js` against `docs/specs/01-pipeline/80_taxonomies.md`
  - DeepSeek: review `src/lib/classification/classifier.ts` against `docs/specs/01-pipeline/80_taxonomies.md` + `docs/specs/03-mobile/91_mobile_lead_feed.md`
  - Worktree code-reviewer (subagent_type `feature-dev:code-reviewer`, `isolation: "worktree"`): full diff vs. Spec 80 §5 amended contract — generate own checklist from the 3-axis contract + the live-data evidence (75K commercial rows, 50K PLB rows, etc.)
  - Triage: BUG → file new WF3 before Green Light; DEFER → append to `docs/reports/review_followups.md`.
- [ ] **R11** — Atomic commit on `main`: `fix(80_taxonomies): WF3 — refine shouldAppendRealtor with 3-axis gating (permit_type + scope_tags + class)`. Spec 05 §5 footer with operator runbook.
- [ ] **R12** — Push `main`.

§10 note: 5 sites bundled (extension of `shouldAppendRealtor` signature touches both dual-path mirrors + 2 call sites + 2 spec docs + 1 review_followups entry). Same root-cause; atomic revert simpler than 5 commits. Multi-agent review required per user; 3 parallel reviewers.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §10 note: 3-axis gating (class + permit_type + scope_tags), dual-path TS↔JS, live-DB test catches the 75K commercial class, multi-agent review required, post-merge runbook re-runs classify-permits.

---

## Next-steps preview (separate WFs after this one ships)

These are **NOT** in scope for this WF3 — captured here so the user has the sequencing decision in front of them when this commit lands.

### Next: WF2 #C — Backfill `building_footprints.footprint_area_sqm` (DATA-QUALITY blocker)
**Severity:** HIGH — corrupts Spec 83 cost model for every permit (Surgical Triangle silently falls back to lot-size every time because all 427,077 building_footprints rows have `footprint_area_sqm = NULL`).
**Approach:** investigate whether `building_footprints.geometry` (JSONB) holds the polygon — if so, a one-shot backfill computes `ST_Area(ST_GeomFromGeoJSON(geometry)::geography)` per row in a single migration. Otherwise re-fetch from the source CKAN dataset (Spec 50-style). Bonus: `max_height_m` and `min_height_m` may have the same gap — diagnose during the WF.
**Then:** **execute the deferred runbook** (`node scripts/compute-cost-estimates.js`) to rewrite ~237K cost_estimates rows with both the corrected neighbourhood join (commit `09e8828`) AND the corrected GFA path (post-backfill). The `IS DISTINCT FROM` UPSERT guard limits WAL writes to changed rows.
**Estimated scope:** small migration + one debug query + one runbook execution. Half a day.

### Then: WF1 #B — Lifecycle inspector enhancements (Spec 84 §5 closure)
**Closes Spec 84 bug 84-W4** — "Dead Transition Write: Ledger is written but not used."
**Three additions to `LeadInspect.lifecycle` panel:**
1. `transitions[]` — list of `{from_phase, to_phase, transitioned_at, duration_days_in_from_phase}` per permit (computed from the ledger; ledger has 356,058 rows across 221,694 permits).
2. `phase_name` — friendly name per Spec 84 §3 (e.g., `P7c → "Issued (Late)"`). Static module-level map mirroring Spec 84 §3 table; 23 entries (P1-P20 × prefixes + O1-O3 + INTAKE_*).
3. `phase_avg_days_by_permit_type` — median + p25 + p75 duration in the current phase, scoped to `permit_type` group. Cached via `phase_calibration` table if it exists (Spec 85 §2 references it) or computed lazily with a CTE.
**Estimated scope:** SQL extension + JSDoc/TS interface extension + map module + Spec 84/76 cross-references + live-DB inspector test extension. One day.

### Last: Option B realtor follow-up (DB-driven `realtor_eligible` column)
**Filed as deferred** in this WF3's `review_followups.md` update. Operator-tunable per Spec 86 §1 if the residential-types list churns. Low priority; raise only when a 6th residential type emerges or the Spec 80 §5 sub-table becomes contentious.
