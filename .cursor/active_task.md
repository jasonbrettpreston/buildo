# Active Task: WF1 #B — Lifecycle inspector enhancements (`lifecycle.timeline[]` data layer + phase calibration)
**Status:** Done (committed 2026-05-09 — WF1 #B Green Light + R10 multi-agent review fixes applied: §R3.5 RUN_AT, ROUND() before ::INTEGER, records_total=source rows, daysBetween clamp ≥0)
**Workflow:** WF1 (Genesis — new feature: phase_calibration table + chain step 21.5 + inspector timeline data; Path A: data-only, UI follows in separate WF)
**Domain Mode:** Cross-Domain (Backend/Pipeline + Web Admin) — new migration + new pipeline script (chain step 21.5) + new shared modules + extended admin inspector query + Spec 84 / 86 / 76 amendments
**Rollback Anchor:** `faca737` (current HEAD on `main` — WF2 #C massing backfill)
**Multi-Agent Review:** REQUIRED per WF1 cadence — Gemini + DeepSeek + worktree code-reviewer in parallel.

## Context

* **Goal:** Surface phase-by-phase progression data on the admin Lead Detail Inspector (`/api/admin/leads/inspect/:id`), unifying past + present + future phases in a single `lifecycle.timeline[]` array. Each entry carries actual or predicted `days_in_phase` plus cohort percentiles (`(permit_type, phase)` median + p25 + p75) so operators can instantly see "is this permit on-pace, slow, or stalled?"
* **Closes Spec 84 bug 84-W4** ("Dead Transition Write: Ledger is written but not used. Fix: Wire Spec 86 Calibration to read this ledger.") — this WF is exactly the wiring 84-W4 demands.
* **The 5 user findings this addresses (from session context):**
  - #3 Show how long the permit stayed at each phase ✓ (`days_in_phase` per timeline entry)
  - #4 Phase NAME instead of "P7c" ✓ (`phase_name` from new `phase-names.ts` map)
  - #5 Average days for this type of project per phase ✓ (`cohort_median_days` / `cohort_p25_days` / `cohort_p75_days` from new `phase_calibration` table)
* **Path A (chosen):** ship the data layer only this WF — `lifecycle.timeline[]` on the inspector response. UI consumers (admin inspector React, future flight-center detail progression visual) follow in separate frontend WFs once the data shape is committed.
* **Future surfaces (out of scope this WF):**
  - Admin inspector React UI rendering the timeline (separate WF1)
  - Admin flight-center detail "delivery-app-style progression bar" (separate WF1; user explicitly requested as next surface after this data layer ships)
  - CoA inspect (Cycle 7 — out of scope; P1/P2 only become relevant when CoA inspector lands)
* **Target Specs:**
  - Spec 84 §3 (friendly-name map made authoritative)
  - Spec 84 §5 (new "Phase Timeline (per-permit)" subsection)
  - Spec 84 §6 (mark bug 84-W4 RESOLVED)
  - Spec 84 §7 (formalize `phase_calibration` table source)
  - Spec 86 §1 (reuse existing `calibration_freshness_warn_hours`; document phase_calibration alongside trade calibration)
  - Spec 86 §4 (add chain step 21.5 `compute-phase-calibration` between step 21 lifecycle-phase classification and step 22 trade forecasts)
  - Spec 76 §3.5 (inspector contract: `lifecycle.timeline[]` panel)

## Technical Implementation

### 1. New table: `phase_calibration`

`migrations/123_phase_calibration_table.sql` — pre-computed cohort stats per `(permit_type, phase)`. Read by the inspector; written once per chain run by step 21.5.

```sql
CREATE TABLE phase_calibration (
  permit_type   VARCHAR(100) NOT NULL,
  phase         VARCHAR(20)  NOT NULL,
  median_days   INTEGER,                    -- nullable: <30 sample → unreliable
  p25_days      INTEGER,
  p75_days      INTEGER,
  sample_size   INTEGER NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_type, phase)
);

CREATE INDEX idx_phase_calibration_lookup
  ON phase_calibration (permit_type, phase);
```

DOWN comment-only per Rule 6.

### 2. New script: `scripts/compute-phase-calibration.js` (chain step 21.5)

Reads `permit_phase_transitions` (356,058 rows currently) joined to `permits.permit_type`; computes percentiles per `(permit_type, phase)` cohort:

```sql
WITH transitions_with_duration AS (
  SELECT
    permit_num, from_phase, to_phase,
    transitioned_at,
    (transitioned_at - LAG(transitioned_at) OVER (
      PARTITION BY permit_num ORDER BY transitioned_at
    ))::interval AS phase_duration
  FROM permit_phase_transitions
  WHERE from_phase IS NOT NULL  -- exclude null→first transitions (no duration)
),
joined AS (
  SELECT
    p.permit_type,
    t.from_phase AS phase,
    EXTRACT(EPOCH FROM t.phase_duration) / 86400.0 AS days_in_phase
  FROM transitions_with_duration t
  JOIN permits p USING (permit_num)
  WHERE t.phase_duration IS NOT NULL
)
SELECT
  permit_type, phase,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY days_in_phase)::INTEGER AS median_days,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days_in_phase)::INTEGER AS p25_days,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_in_phase)::INTEGER AS p75_days,
  COUNT(*)::INTEGER AS sample_size
FROM joined
GROUP BY permit_type, phase;
```

Pipeline conventions per Spec 47 §R1–R12:
- Advisory lock 86 (matches "calibration" mental model — `compute_timing_calibration_v2` uses 86)
- Wait — let me re-check. Existing `compute_timing_calibration_v2` (Spec 85/86) uses lock ID matching its spec number. For phase calibration, lock ID = ??? The spec the script is governed by is 86 (Calibration), but it's a NEW script. Per Spec 47 §R2 + §A.5, `scripts/quality/` uses sequential 100+ block; this isn't quality. **Decision:** lock ID = 93 (next available; document in §A.5 if Spec 47 has a registry). Verify no collision before R5.
- Zod validation: `calibration_freshness_warn_hours` (existing logic_var, reused per user direction)
- DELETE+INSERT atomicity inside `withTransaction` (recompute the entire table per run — small enough table, ~40 rows)
- Audit table: `permit_types_calibrated`, `phases_calibrated`, `total_buckets`, `unreliable_buckets` (sample_size < 30)

### 3. New shared modules

**`src/lib/classification/phase-names.ts`** — single source of truth for the 23-entry phase friendly-name map per Spec 84 §3:
```ts
export const PHASE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  P1: 'CoA Intake',
  P2: 'CoA Review',
  P3: 'CoA Approved',
  // ... 23 total entries
  P7c: 'Issued (Late)',
  // ...
  O3: 'Orphan Stalled',
});

export function phaseName(phase: string | null | undefined): string | null {
  if (phase == null) return null;
  return PHASE_NAMES[phase] ?? null;
}
```

Parity test against Spec 84 §3 table.

**`src/lib/classification/phase-progression.ts`** — canonical happy-path progression per `permit_type`:
```ts
export const STANDARD_PHASE_PATH_BY_PERMIT_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'New Building':                ['INTAKE_P3', 'INTAKE_P4', 'INTAKE_P5', 'P6', 'P7a', 'P7b', 'P7c', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18'],
  'Building Additions/Alterations': [/* same — full structural path */],
  'New Houses':                  [/* same */],
  'Small Residential Projects':  ['INTAKE_P3', 'INTAKE_P4', 'INTAKE_P5', 'P6', 'P7a', 'P7b', 'P7c', 'P8', 'P12', 'P15', 'P18'],  // skips structural P9-P11
  'Plumbing(PS)':                ['INTAKE_P3', 'P6', 'P7a', 'P7b', 'P7c', 'O1', 'O2', 'O3'],  // orphan-track
  // ... 25 entries total mirroring mig 120's permit_type_classifications
} as const);

export function remainingPhases(permitType: string | null, currentPhase: string | null): readonly string[] {
  // Returns the slice of the canonical path AFTER currentPhase, or [] if
  // the type is unknown or the permit is in a terminal state (P18, P19, P20, O3).
}
```

Parity test ensures every permit_type in `permit_type_classifications` has a path; no orphan codes referenced; first phase is always `INTAKE_P3` or `P6` (no P1/P2 — those are CoA-only).

### 4. Inspector query extension — `src/lib/leads/lead-inspect-query.ts`

Three new query stages threaded through the existing `Promise.all`:

**A.** New `transitionsRes` query (parallel with existing trades/forecasts/entity/premium):
```sql
SELECT from_phase, to_phase, transitioned_at::text
  FROM permit_phase_transitions
 WHERE permit_num = $1 AND revision_num = $2
 ORDER BY transitioned_at ASC
```

**B.** New `calibrationRes` query: looks up cohort stats for THIS permit's `permit_type` across ALL phases (inspector needs cohort for past + current + future entries):
```sql
SELECT phase, median_days, p25_days, p75_days, sample_size
  FROM phase_calibration
 WHERE permit_type = $1
```
Returns ~10-20 rows per permit_type — cheap.

**C.** JS-side timeline assembly (in `fetchLeadInspect` body):
```ts
const timeline = buildTimeline({
  permitType: m.permit_type,
  currentPhase: m.lifecycle_phase,
  phaseStartedAt: m.phase_started_at,
  transitions: transitionsRes.rows,
  calibrationByPhase: indexByPhase(calibrationRes.rows),
  now: new Date(),
});
```

`buildTimeline` is a pure function in `src/lib/leads/build-lifecycle-timeline.ts` (new module, fully unit-testable). Returns the `timeline[]` array per the agreed shape:

```ts
type TimelineEntry = {
  phase: string;
  phase_name: string | null;
  status: 'completed' | 'current' | 'upcoming';
  entered_at: string | null;
  exited_at: string | null;
  days_in_phase: number | null;
  cohort_median_days: number | null;
  cohort_p25_days: number | null;
  cohort_p75_days: number | null;
  cohort_sample_size: number;
};
```

Top-level lifecycle additions:
```ts
lifecycle: {
  // existing
  phase: 'P7c',
  stalled: false,
  classified_at: '...',
  phase_started_at: '...',
  // NEW
  phase_name: 'Issued (Late)',
  current_phase_days_in: 159,
  predicted_remaining_days: 245,           // sum of upcoming entries' median_days
  predicted_completion_at: '2027-02-...',  // NOW + predicted_remaining_days
  timeline: [/* TimelineEntry[] */],
}
```

### 5. Schema + tests

**MODIFIED `src/lib/admin/lead-schemas.ts`** — extend `LeadInspectSchema.lifecycle` with `timeline: z.array(TimelineEntrySchema)` + the 4 new top-level fields.

**Test layering:**

| File | Layer | Coverage |
|---|---|---|
| **NEW** `src/tests/migration-123-phase-calibration-table.infra.test.ts` | SQL-shape | CREATE TABLE shape; PK + index; DOWN comment-only |
| **NEW** `src/tests/phase-names.logic.test.ts` | Unit | All 23 PHASE_NAMES entries match Spec 84 §3; parity test against the spec markdown table |
| **NEW** `src/tests/phase-progression.logic.test.ts` | Unit | Every permit_type in mig 120's seeds has a path; no orphan codes; first phase ∈ {INTAKE_P3, P6}; `remainingPhases()` returns correct slice for sample inputs |
| **NEW** `src/tests/build-lifecycle-timeline.logic.test.ts` | Unit | Pure function fixtures: completed-only, completed+current, completed+current+upcoming, terminal (P18 → no upcoming), unknown permit_type fallback (no upcoming) |
| **NEW** `src/tests/compute-phase-calibration.infra.test.ts` | SQL-shape | Script structure (advisory lock, Zod, withTransaction, audit_table) per Spec 47 §R1–R12 |
| **NEW** `src/tests/db/phase-calibration.db.test.ts` | Live-DB | Seed 50 transitions across (permit_type='TEST', phase='P7c') with known durations [10, 20, 30, ..., 500]; run compute-phase-calibration; assert median=255±5%, p25=130±5%, p75=380±5% |
| **MODIFIED** `src/tests/db/lead-inspect-query.db.test.ts` | Live-DB | Extend with timeline assertions: seed permit + ledger transitions + calibration row; call fetchLeadInspect; assert timeline shape (≥1 completed, 1 current, ≥1 upcoming); current entry's `days_in_phase` matches seeded `phase_started_at` delta; cohort fields populated from seeded calibration |

### 6. Spec amendments

- **Spec 84 §3** — PHASE_NAMES module made authoritative; cross-reference `src/lib/classification/phase-names.ts`
- **Spec 84 §5** — new "Phase Timeline (per-permit)" subsection documenting the inspector contract
- **Spec 84 §6** — bug 84-W4 marked RESOLVED with this commit reference
- **Spec 84 §7** — formalize: `phase_calibration` table populated by `compute-phase-calibration.js` reading the ledger
- **Spec 86 §1** — append note that `calibration_freshness_warn_hours` (existing logic_var, default 48h) ALSO governs phase_calibration freshness
- **Spec 86 §4** — chain step sequence amended:
  ```
  ... 21 classify-lifecycle-phase
  → 21.5 compute-phase-calibration  (NEW)
  → 22 compute-trade-forecasts
  ...
  ```
- **Spec 76 §3.5** — Inspector `lifecycle` contract extended: 4 new top-level fields + `timeline[]` array

### 7. Files (Modified / New) — summary

- **NEW** `migrations/123_phase_calibration_table.sql`
- **NEW** `scripts/compute-phase-calibration.js`
- **NEW** `src/lib/classification/phase-names.ts`
- **NEW** `src/lib/classification/phase-progression.ts`
- **NEW** `src/lib/leads/build-lifecycle-timeline.ts`
- **MODIFIED** `src/lib/leads/lead-inspect-query.ts` — 2 new queries + timeline assembly
- **MODIFIED** `src/lib/admin/lead-schemas.ts` — extended `LeadInspectSchema`
- **NEW** 6 test files (1 migration, 3 unit, 1 infra, 1 live-DB) + 1 modified live-DB
- **MODIFIED** `scripts/manifest.json` — chain_permits insertion of step 21.5
- **MODIFIED** Specs 84 (4 sections), 86 (2 sections), 76 (1 section)

### Database Impact

ONE new table (`phase_calibration`, ~40 rows post-population). No data backfill — table is populated by the new chain step on its first run. Existing queries unaffected (no column renames; no constraint changes). Mig 123 is purely additive.

## Standards Compliance

* **§2 Error handling:** new script throws on Zod validation failure (Spec 47 §R5 fail-fast). New JS modules pure-function, no throws.
* **§3.1 Zero-downtime migration:** mig 123 creates a new empty table — no impact on existing rows. Index created concurrently — actually for a new table CONCURRENTLY isn't needed; simple `CREATE INDEX` is fine.
* **§5.1 Typed factories:** test fixtures reuse existing `factories.ts` patterns where applicable; new live-DB fixture follows established `*.db.test.ts` shape.
* **§7 Dual code path:** N/A — TS-only modules (TS classifier, TS shim). The pipeline script is JS but doesn't share logic with TS.
* **§9 Pipeline safety:** `compute-phase-calibration.js` follows the canonical Spec 47 §R1–R12 skeleton (advisory lock, Zod, withTransaction, emitSummary, emitMeta).
* **Spec 47 §R2 lock ID:** lock ID = 93 (next available — verify no collision in §A.5 registry at R2).
* **Spec 47 §R10 audit_table:** rows include `permit_types_calibrated`, `phases_calibrated`, `total_buckets`, `unreliable_buckets`.
* **Spec 47 §R11 emitMeta:** reads `permit_phase_transitions`, `permits`, `phase_calibration` (for delta detection); writes `phase_calibration`.
* **Spec 80 §5:** orthogonal — phase calibration doesn't gate on `permit_type_class`; it cohorts on `permit_type`.

## State Verification (DONE before plan-lock)

* `permit_phase_transitions` has 356,058 rows across 221,694 distinct permits — sufficient cohort sample sizes for the (permit_type, phase) buckets.
* `permits.permit_type` is the right cohort dimension — confirmed by user direction.
* Spec 84 §3 has the authoritative phase-name table for the 23 entries.
* Spec 84 §6 lists bug 84-W4 ("Dead Transition Write: Ledger is written but not used") as Pending Refactor — this WF closes it.
* Spec 86 §4 chain sequence currently has step 21 (lifecycle classification) → step 22 (trade forecasts) — step 21.5 is the natural insertion point per the user direction.
* `calibration_freshness_warn_hours` already exists in `logic_variables` (default 48h, per `scripts/seeds/logic_variables.json`).

## Execution Plan

- [ ] **R1** — Rollback anchor confirmed: `faca737`. Branch: `main`.
- [ ] **R2** — Verify advisory lock 93 is not in use (grep across `scripts/`); confirm `permit_phase_transitions` schema; confirm `permits.permit_type` value distribution.
- [ ] **R3** — Spec Review: Spec 84 §3 + §5 + §6 + §7; Spec 86 §1 + §4; Spec 76 §3.5; Spec 47 §R1–R12 + §A.5 lock registry.
- [ ] **R4** — Reproduction tests FIRST (Red Light), one file at a time:
  - `migration-123-phase-calibration-table.infra.test.ts`
  - `phase-names.logic.test.ts`
  - `phase-progression.logic.test.ts`
  - `build-lifecycle-timeline.logic.test.ts`
  - `compute-phase-calibration.infra.test.ts`
  - `src/tests/db/phase-calibration.db.test.ts`
  - extend `src/tests/db/lead-inspect-query.db.test.ts`
  - Run vitest → ALL must fail.
- [ ] **R5** — Implementation (one file at a time, in dependency order):
  - `migrations/123_phase_calibration_table.sql`
  - `src/lib/classification/phase-names.ts`
  - `src/lib/classification/phase-progression.ts`
  - `src/lib/leads/build-lifecycle-timeline.ts`
  - `scripts/compute-phase-calibration.js`
  - `scripts/manifest.json` (chain step 21.5)
  - `src/lib/leads/lead-inspect-query.ts` extension
  - `src/lib/admin/lead-schemas.ts` extension
  - Spec 84 §3 + §5 + §6 + §7 amendments
  - Spec 86 §1 + §4 amendments
  - Spec 76 §3.5 amendment
- [ ] **R6** — Green Light: targeted tests pass; `npm run typecheck && npm run lint -- --fix && npm run test`.
- [ ] **R7** — Idempotency: re-run live-DB tests 2× consecutively. Apply mig 123 + run `compute-phase-calibration` 2×; second run = no change to row content (timestamps update).
- [ ] **R8** — Live verification:
  - `npm run migrate` applies mig 123
  - `node scripts/compute-phase-calibration.js` populates ~40 rows; verify a sample (e.g., New Houses + P7c) median is reasonable
  - Hit `GET /api/admin/leads/inspect/<some-permit>` (or call `fetchLeadInspect` via debug script) — assert `lifecycle.timeline[]` populated with completed + current + upcoming entries
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. PHASE_NAMES has all 23 entries matching Spec 84 §3 verbatim?
  2. STANDARD_PHASE_PATH_BY_PERMIT_TYPE has every permit_type from mig 120's seeds; no entries reference P1/P2 (CoA-only)?
  3. `buildTimeline` returns the canonical TimelineEntry shape; `status` field correctly identifies completed/current/upcoming; `days_in_phase` is null for upcoming entries (so they show "median X days" instead)?
  4. compute-phase-calibration.js follows Spec 47 §R1–R12 skeleton; advisory lock 93 collision-checked; emitMeta declares both reads + writes?
  5. Commit message documents BOTH operator runbook steps (mig 123 application + compute-phase-calibration first-run)?
- [ ] **R10** — **Multi-Agent Review (REQUIRED — WF1 cadence + 3 parallel reviewers):**
  - Gemini: review `scripts/compute-phase-calibration.js` against Spec 47 §R1–R12 + Spec 84 §7
  - DeepSeek: review `src/lib/leads/build-lifecycle-timeline.ts` + `src/lib/leads/lead-inspect-query.ts` (timeline assembly + query extension) against Spec 76 §3.5 + Spec 84 §5
  - Worktree code-reviewer: full diff against Spec 84 §3 (phase-name parity), Spec 84 §6 (bug 84-W4 closure), Spec 86 §4 (chain ordering)
  - Triage: BUG → file new WF3 before Green Light; DEFER → append to `docs/reports/review_followups.md`.
- [ ] **R11** — Atomic commit on `main`: `feat(84_lifecycle_phase_engine): WF1 — phase_calibration table + compute-phase-calibration step 21.5 + lifecycle.timeline[] inspector data (closes bug 84-W4)`. Spec 05 §5 footer with operator runbook.
- [ ] **R12** — Push `main`.

§10 note: Path A (data only); UI for inspector + flight-center detail follows in separate frontend WFs. Multi-agent review required per WF1. Operator runbook = mig 123 + first-run of compute-phase-calibration; subsequent runs auto via chain step 21.5.

> **PLAN LOCKED. Do you authorize this WF1 plan? (y/n)**
> §10 note: data layer only this WF; phase_calibration table + chain step 21.5; closes bug 84-W4; multi-agent review required.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
