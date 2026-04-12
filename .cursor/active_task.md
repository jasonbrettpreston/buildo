# Active Task: Phase 3 — Calibration Engine V2
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Compute historically accurate lead times between construction milestones to fuel Phase 4's flight tracker. The V1 calibration engine measures one gap: "issued → first inspection" (useless for downstream trades). V2 measures the gaps between sequential lifecycle phases: "median days from P11 (Framing) → P12 (Rough-in)" — the data the flight tracker needs to predict when a specific trade will be on-site.
* **Why now:** Phase 2 (commit `a329d64`) populated `permit_phase_transitions` with 242K initial rows + the real-time transition logging pipeline. The inspection stage data has 5,265 permits with 2+ sequential passed stages — enough for robust medians. Phase 4 cannot start until these medians exist.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md`
* **Key Files:** `migrations/087_phase_calibration.sql`, `scripts/compute-timing-calibration-v2.js`, `scripts/lib/lifecycle-phase.js`

## Technical Implementation

### 1. Migration 087: `phase_calibration` table

```sql
CREATE TABLE phase_calibration (
  id              SERIAL PRIMARY KEY,
  from_phase      VARCHAR(10) NOT NULL,
  to_phase        VARCHAR(10) NOT NULL,
  permit_type     VARCHAR(100),  -- NULL = all types aggregated
  median_days     INT NOT NULL,
  p25_days        INT NOT NULL,
  p75_days        INT NOT NULL,
  sample_size     INT NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_phase, to_phase, permit_type)
);
```

Also includes a `trade_target_phases` reference table (32 trades → their "active" lifecycle phase) to bridge calibration data → trade predictions in Phase 4. Or: export this as a shared constant from `scripts/lib/lifecycle-phase.js` (cheaper, no migration needed, matches the existing pattern).

### 2. New script: `compute-timing-calibration-v2.js`

**Data source:** `permit_inspections` — mining sequential passed-stage pairs.

**Algorithm:**
1. Query all permits with 2+ distinct passed inspection stages
2. For each permit, build a timeline: stages ordered by `inspection_date ASC`
3. For each consecutive pair (stage_A at date_A, stage_B at date_B), compute `days = date_B - date_A`
4. Map both stages to lifecycle phases via `mapInspectionStageToPhase`
5. Group by `(from_phase, to_phase, permit_type)` and compute `PERCENTILE_CONT(0.5)` median, p25, p75
6. Also compute "issued → phase_X" calibration: for permits where we know `issued_date` and the first inspection stage, compute `days = first_inspection_date - issued_date` as the "P7 → P_X" gap
7. UPSERT into `phase_calibration` (the UNIQUE constraint on `(from_phase, to_phase, permit_type)` makes this idempotent)

**The entire computation is a single SQL query** — Postgres can do this with window functions + percentile aggregation:

```sql
WITH stage_timeline AS (
  SELECT i.permit_num, p.permit_type,
         i.stage_name, i.inspection_date,
         LAG(i.stage_name) OVER w AS prev_stage,
         LAG(i.inspection_date) OVER w AS prev_date
    FROM permit_inspections i
    JOIN permits p USING (permit_num)
   WHERE i.status = 'Passed'
  WINDOW w AS (PARTITION BY i.permit_num ORDER BY i.inspection_date, i.stage_name)
),
phase_pairs AS (
  SELECT permit_type,
         map_stage_to_phase(prev_stage) AS from_phase,
         map_stage_to_phase(stage_name) AS to_phase,
         (inspection_date - prev_date) AS gap_days
    FROM stage_timeline
   WHERE prev_stage IS NOT NULL
     AND map_stage_to_phase(prev_stage) IS NOT NULL
     AND map_stage_to_phase(stage_name) IS NOT NULL
     AND map_stage_to_phase(prev_stage) <> map_stage_to_phase(stage_name)
)
SELECT from_phase, to_phase, permit_type,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days)::int AS median_days,
       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY gap_days)::int AS p25_days,
       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY gap_days)::int AS p75_days,
       COUNT(*) AS sample_size
  FROM phase_pairs
 GROUP BY 1, 2, 3
HAVING COUNT(*) >= 5
```

Since `mapInspectionStageToPhase` is a JS function (not a SQL function), we can either:
(a) Create a temporary SQL function via `DO $$` block that mirrors the JS mapping
(b) Load the raw data into JS, apply the mapping, then compute percentiles in JS
(c) Build the mapping as a SQL CASE expression inline

Option (c) is simplest and avoids function creation:
```sql
CASE
  WHEN lower(stage_name) LIKE '%excavation%' OR ... THEN 'P9'
  WHEN lower(stage_name) LIKE '%footings%' OR ... THEN 'P10'
  ...
END AS phase
```

### 3. `TRADE_TARGET_PHASE` mapping

New constant exported from `scripts/lib/lifecycle-phase.js` (and TS dual path):

```js
const TRADE_TARGET_PHASE = {
  // Phase 4 uses this to answer "which phase must a permit reach
  // for trade X to become active?"
  excavation: 'P9', shoring: 'P9', demolition: 'P9', 'temporary-fencing': 'P9',
  concrete: 'P10', waterproofing: 'P10',
  framing: 'P11', 'structural-steel': 'P11', masonry: 'P11',
  plumbing: 'P12', hvac: 'P12', electrical: 'P12', 'fire-protection': 'P12',
  'drain-plumbing': 'P12',
  insulation: 'P13',
  drywall: 'P15', painting: 'P15', flooring: 'P15', tiling: 'P15',
  'trim-work': 'P15', 'millwork-cabinetry': 'P15', 'stone-countertops': 'P15',
  roofing: 'P16', glazing: 'P16', 'eavestrough-siding': 'P16',
  elevator: 'P11', // needs structural complete
  landscaping: 'P17', 'decking-fences': 'P17', 'pool-installation': 'P17',
  solar: 'P16', security: 'P15', caulking: 'P16',
};
```

### 4. Fallback hierarchy

The calibration engine also computes "all permit types" aggregates (permit_type = NULL):
1. **(from_phase, to_phase, permit_type)** — exact match (e.g., P11→P12 for "New Houses")
2. **(from_phase, to_phase, NULL)** — all types combined
3. If neither exists, the flight tracker falls back to a hardcoded default (30 days)

### 5. Chain integration

Wire `compute_timing_calibration_v2` into the permits chain after `classify_lifecycle_phase` and before the flight tracker (Phase 4). The calibration only needs to run when inspection data changes, but running daily is cheap (~5s query on 17K stage pairs).

* **Database Impact:** YES — migration 087 adds 1 table + 1 index. Script writes ~50-100 calibration rows.

## Standards Compliance
* **Try-Catch Boundary:** Script uses pipeline.run + pipeline SDK.
* **Unhappy Path Tests:** Infra shape test for migration + script. Logic test for the TRADE_TARGET_PHASE completeness (all 32 trade slugs mapped).
* **logError Mandate:** Uses pipeline.log.
* **Mobile-First:** N/A.

## Execution Plan

- [ ] **Contract Definition:** The `phase_calibration` table shape IS the contract between the calibration engine (writer) and the flight tracker (reader).

- [ ] **Spec & Registry Sync:** Update target spec §3. Add to manifest + FreshnessTimeline.

- [ ] **Schema Evolution:**
  - Write `migrations/087_phase_calibration.sql` (UP: CREATE TABLE + UNIQUE constraint. DOWN: commented DROP)
  - `npm run migrate && npm run db:generate`
  - `npm run typecheck`

- [ ] **Test Scaffolding:**
  - `src/tests/migration-087.infra.test.ts` — table shape
  - `src/tests/compute-timing-calibration-v2.infra.test.ts` — script shape
  - Logic test: TRADE_TARGET_PHASE covers all 32 trade slugs

- [ ] **Red Light:** Tests must FAIL before implementation.

- [ ] **Implementation:**
  1. Write migration 087
  2. Write `TRADE_TARGET_PHASE` in `scripts/lib/lifecycle-phase.js` + TS dual path
  3. Write `compute-timing-calibration-v2.js`
  4. Wire into manifest + FreshnessTimeline
  5. Run against live DB, verify calibration rows

- [ ] **Pre-Review Self-Checklist:**
  1. Does the SQL CASE for stage→phase mapping match `mapInspectionStageToPhase` exactly?
  2. Does the LAG window function correctly pair consecutive stages (not skip stages)?
  3. Does the HAVING COUNT(*) >= 5 filter prevent noisy medians from tiny samples?
  4. Does TRADE_TARGET_PHASE cover all 32 trade slugs from the CLAUDE.md list?
  5. Is the UNIQUE constraint on (from_phase, to_phase, permit_type) correct for UPSERT?
  6. Does the "all types" aggregate (permit_type = NULL) work with the UNIQUE constraint? (Yes — NULL is distinct in UNIQUE constraints in Postgres)

- [ ] **Green Light:** Full test suite + typecheck + live DB verification.

- [ ] **Independent + adversarial review agents** (parallel). Triage, WF3 fixes, defer to review_followups.md.

- [ ] → WF6 + commit.

---

## §10 Compliance

- ✅ **DB:** Migration 087 with UP + commented DOWN. UNIQUE constraint for idempotent UPSERT. No large-table ALTER.
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ✅ **Shared Logic:** TRADE_TARGET_PHASE in both JS + TS dual code path. Stage→phase SQL CASE must match JS `mapInspectionStageToPhase`.
- ✅ **Pipeline:** Pipeline SDK · PIPELINE_SUMMARY + PIPELINE_META · idempotent UPSERT · wired into manifest + chain
