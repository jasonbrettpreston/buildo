# Active Task: Phase 1 — Predictive Timing Schema Architecture
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Establish the database infrastructure required to support time-series phase tracking and 1-to-many predictive trade forecasting. Three new structures: (1) `phase_started_at` column on permits — the immutable anchor for countdown math, (2) `permit_phase_transitions` table — the full history of phase changes enabling calibration, (3) `trade_forecasts` table — per-permit, per-trade predictions that the feed will surface.
* **Why now:** The lifecycle classifier (commit `6f45012`) tells users WHAT phase a permit is in. This schema enables the next 3 phases (state machine, calibration engine V2, flight tracker) to tell users WHEN their trade is needed — and whether it's on time, imminent, or delayed.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md` (extends §2 with timing infrastructure)
* **Key Files:** `migrations/086_predictive_timing_schema.sql`, `src/tests/factories.ts`, `src/lib/permits/types.ts`, `src/tests/migration-086.infra.test.ts`

## Technical Implementation

### 1. `permits` table addition
```sql
ALTER TABLE permits ADD COLUMN phase_started_at TIMESTAMPTZ;
```
- Nullable — Phase 2 (classifier upgrade) writes this; migration does NOT backfill
- Only updated by the classifier when `lifecycle_phase` actually changes (the CASE logic described in the user's Phase 2 plan)
- Backfill strategy: Phase 2's classifier upgrade will compute `phase_started_at` from best-available proxies (issued_date for P7*, latest inspection_date for P9-P18, application_date for P3-P6)

### 2. `permit_phase_transitions` table (new)
```sql
CREATE TABLE permit_phase_transitions (
  id               SERIAL PRIMARY KEY,
  permit_num       VARCHAR(30) NOT NULL,
  revision_num     VARCHAR(10) NOT NULL,
  from_phase       VARCHAR(10),           -- NULL on first classification
  to_phase         VARCHAR(10) NOT NULL,
  transitioned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Denormalized context for calibration queries (avoids JOINing
  -- back to permits for the 2 most common GROUP BY dimensions)
  permit_type      VARCHAR(100),
  neighbourhood_id INTEGER
);
```
**Indexes:**
- `(permit_num, revision_num, transitioned_at DESC)` — permit timeline lookup
- `(from_phase, to_phase)` — calibration queries: "median days from P11→P12"
- `(to_phase, transitioned_at DESC)` — "most recent permits entering phase X"

**Why a separate table instead of just `phase_started_at`?**
A single timestamp on permits only tells you when the CURRENT phase started. The calibration engine (Phase 3) needs to measure how long PREVIOUS phases took — "what's the median duration of P11 for BLD permits in Scarborough?" That requires the full transition history. `phase_started_at` is a denormalized shortcut for the most common query (current phase duration).

### 3. `trade_forecasts` table (new)
```sql
CREATE TABLE trade_forecasts (
  permit_num          VARCHAR(30) NOT NULL,
  revision_num        VARCHAR(10) NOT NULL,
  trade_slug          VARCHAR(50) NOT NULL,
  -- The prediction
  predicted_start     DATE,               -- when this trade is expected on-site
  confidence          VARCHAR(10) NOT NULL DEFAULT 'low',
  urgency             VARCHAR(20) NOT NULL DEFAULT 'unknown',
  -- Calibration source metadata (for debugging + operator trust)
  calibration_method  VARCHAR(30),        -- exact / fallback_type / fallback_global
  sample_size         INT,
  median_days         INT,
  p25_days            INT,
  p75_days            INT,
  -- Bookkeeping
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_num, revision_num, trade_slug)
);
```
**Indexes:**
- PK covers per-permit lookups
- `(trade_slug, urgency)` — feed filtering: "show me delayed plumbing leads"
- `(trade_slug, predicted_start)` WHERE predicted_start IS NOT NULL — "imminent leads for HVAC within 30 days"

**Urgency values:** `unknown`, `on_time`, `imminent`, `delayed`, `overdue` (computed by Phase 4 script)
**Confidence values:** `high` (sample ≥ 30), `medium` (sample 10-29), `low` (sample < 10 or fallback method)

* **Database Impact:** YES — migration 086 adds 1 column + 2 tables + 5 indexes. Zero-row write at migration time.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes in this phase.
* **Unhappy Path Tests:** Migration file-shape test verifying exact columns, indexes, and DOWN block. Factory test verifying new fields have correct defaults.
* **logError Mandate:** N/A — no runtime code.
* **Mobile-First:** N/A — backend-only schema work.

## Execution Plan

- [ ] **Contract Definition:** N/A — no API route changes. The trade_forecasts table shape IS the contract for Phase 4's script and the eventual feed JOIN.

- [ ] **Spec & Registry Sync:** Document the 3 new structures in target spec. Run `npm run system-map`.

- [ ] **Schema Evolution:**
  - Write `migrations/086_predictive_timing_schema.sql` (UP: 1 ALTER + 2 CREATE TABLE + 5 CREATE INDEX + DOWN: DROP tables + DROP column)
  - `npm run migrate` to apply locally
  - `npm run db:generate` to regen Drizzle schema
  - Update `src/tests/factories.ts` — add optional `phase_started_at` to permit factory
  - Update `src/lib/permits/types.ts` — add `phase_started_at` field to Permit interface
  - `npm run typecheck` to confirm no downstream break

- [ ] **Test Scaffolding:** Create `src/tests/migration-086.infra.test.ts` with:
  - File-shape assertions: exact column names + types on all 3 structures
  - Index existence assertions
  - DOWN block presence assertion
  - Constraint assertions (PKs, NOT NULL, defaults)

- [ ] **Red Light:** Run migration test — must FAIL before migration is written.

- [ ] **Implementation:** Write the migration SQL + apply.

- [ ] **Auth Boundary & Secrets:** N/A — no endpoints.

- [ ] **Pre-Review Self-Checklist:**
  1. Does the migration ALTER avoid locking the 243K-row permits table? (ADD COLUMN with no DEFAULT is instant in Postgres 11+)
  2. Are all indexes non-blocking? (Standard CREATE INDEX on empty tables is instant)
  3. Does the DOWN block cleanly reverse all changes?
  4. Does the trade_forecasts PK match the expected feed JOIN pattern (permit_num, revision_num, trade_slug)?
  5. Are the denormalized columns (permit_type, neighbourhood_id) on permit_phase_transitions worth the write amplification vs JOIN cost?

- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`. All pass. → WF6.

---

## §10 Compliance

- ✅ **DB:** UP+DOWN migration · ADD COLUMN with no DEFAULT (instant, no table rewrite) · CREATE TABLE on empty tables (instant) · No CONCURRENTLY needed · validate-migration.js will run
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ⬜ **Shared Logic:** N/A — no dual-code-path changes
- ⬜ **Pipeline:** N/A — no script changes (Phase 2 handles the classifier upgrade)
