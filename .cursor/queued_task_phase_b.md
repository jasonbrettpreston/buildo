# Active Task: WF1 #coa-pipeline-parity-phase-b — Schema Migrations

**Status:** Planning (awaiting authorization)
**Workflow:** WF1 (Genesis — second phase of the larger WF2 #coa-pipeline-parity work)
**Domain Mode:** Backend/Pipeline (migrations + seed data + schema parity tests)
**Rollback Anchor:** `33d9b0a` (current HEAD on main — WF1 Phase A R8 fixes)
**Parent WF:** WF2 #coa-pipeline-parity (multi-phase; Phase A delivered design contract; this Phase B delivers schema)
**Predecessor:** WF1 #coa-pipeline-parity-phase-a (COMPLETE 2026-05-13)

---

## Context

* **Goal:** Land all schema migrations required by the Phase A design contract — 6 new tables, ~25 new columns on existing tables, lead_id triggers/generated columns, and the Universal Stream catalog seed — before any classification, lifecycle-engine, or consumer-rekey scripts ship in Phases C–F. Every migration includes a tested DOWN counterpart per Spec 47 §10. Zero behavioral change to existing pipelines (the new schema is additive; population happens in later phases).
* **Why now:** Spec 42 §6.11 Phase B is the only sequencing constraint. Phase C scripts (lead_id backfill + permit-side rekey) cannot start until the columns they write exist. Phase D CoA classifiers cannot start until `lead_trades`/`lead_parcels`/CoA classification columns exist. Phase E lifecycle engine cannot start until `universal_stream_catalog` is seeded.
* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.6 is the canonical schema source-of-truth; `docs/specs/00-architecture/01_database_schema.md` §3.A is the global index. Both are stable after Phase A R8 fixes.
* **Key Files:** ~12 migration `.sql` files under `migrations/` (next free numbers — check `ls migrations/ | sort -t_ -k1n | tail -5`). One seed JSON file at `scripts/seeds/universal_stream_catalog.json` derived from `docs/reports/spec_84_universal_stream_v10.csv`. No `src/` changes. Test files: `migration-NNN.infra.test.ts` per migration + a schema-parity test (`lead-id-schema-parity.logic.test.ts`).

---

## Spec 84 Investigation References (anchors)

Phase B is informed by:
- **§8.1 — Current Lifecycle Code Outputs.** Lists every existing DB column the classifier writes. Phase B preserves these (no DROPs in this phase); column additions only.
- **§8.6 — Database Schemas: 11 Adjacent Specs.** Inventories table ownership; Phase B migrations don't violate ownership boundaries (each new table has clear ownership per Spec 42 §6.6.B).
- **§8.7 — Shared Fields Across Specs.** Fields shared across multiple specs (e.g., `lifecycle_phase`, `permit_num`, `revision_num`) are NOT touched in Phase B — that's Phase C/H.

---

## Phase B Scope — Exhaustive Migration List

For each migration: filename pattern, UP statements, DOWN statements, test contract, dependency order.

### B.1 — Migration: NEW `lead_trades` table

**Migration:** `migrations/NNN_create_lead_trades.sql` (NNN = next free, likely 124)

**UP:**
```sql
CREATE TABLE lead_trades (
    id              SERIAL          PRIMARY KEY,
    lead_id         TEXT            NOT NULL,
    trade_id        INTEGER         NOT NULL REFERENCES trades(id),
    tier            INTEGER,
    confidence      DECIMAL(3,2),
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    phase           VARCHAR(20),
    lead_score      INTEGER         NOT NULL DEFAULT 0,
    classified_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, trade_id)
);
CREATE INDEX CONCURRENTLY idx_lead_trades_trade ON lead_trades (trade_id);
CREATE INDEX CONCURRENTLY idx_lead_trades_active ON lead_trades (is_active);
CREATE INDEX CONCURRENTLY idx_lead_trades_lead ON lead_trades (lead_id);
```

**DOWN:**
```sql
DROP TABLE IF EXISTS lead_trades;
```

**Test (`migration-NNN-lead-trades.infra.test.ts`):** assert table exists with exact column set, types, indexes, FK to `trades(id)`. Assert empty by default. Assert `lead_id` column accepts both `'permit:NN:RR'` and `'coa:NN'` patterns.

**Dependency:** none (standalone table create). Run first or in parallel with B.2.

### B.2 — Migration: NEW `lead_parcels` table

Mirror of B.1 structure, schema per Spec 42 §6.6.B. Same test pattern.

### B.3 — Migration: NEW `lifecycle_transitions` table

**UP:** per Spec 42 §6.6.B DDL exactly (12 columns + 3 indexes). The `id SERIAL PRIMARY KEY` matches the existing `permit_phase_transitions` pattern.

**Backward-compat shim:** create a VIEW `permit_phase_transitions_view AS SELECT … FROM lifecycle_transitions WHERE lead_id LIKE 'permit:%'` so external queries against the old table name during Phase C–G transition window don't break. Drop the view in Phase H.

**Test:** schema parity + view returns permit-side subset correctly.

**Dependency:** none.

### B.4 — Migration: NEW `lifecycle_status_history` table

**UP:** per Spec 42 §6.6.B DDL (16 columns + 4 indexes + the **idempotency UNIQUE INDEX** added in R8 fix: `(lead_id, to_status, date_trunc('second', transitioned_at))`).

**Test:** schema parity + idempotency assertion. Insert the same `(lead_id, to_status, transitioned_at)` row twice; assert second insert hits `ON CONFLICT DO NOTHING` (no error, no duplicate row).

**Dependency:** none.

### B.5 — Migration: NEW `universal_stream_catalog` table + seed

**UP:** per Spec 42 §6.6.B DDL (20 columns including the 6 color/icon columns + 2 indexes).

**Seed:** `scripts/seeds/universal_stream_catalog.json` (NEW). Derive from `docs/reports/spec_84_universal_stream_v10.csv` via a one-shot conversion. The seed migration `INSERT`s 110 rows. ON CONFLICT DO NOTHING for re-runnability.

**Test:** post-seed assert row count = 110, seq 1–110 contiguous, every row has non-null lifecycle_group + lifecycle_block + lifecycle_stage + stage_label + color/icon fields. Assert seq 14 `bid_value = 0.8`. Assert B9.C row exists. Assert no B9.D rows.

**Dependency:** seed migration runs AFTER table creation in the same migration file (single transaction).

### B.6 — Migration: NEW `universal_stream_trade_signals` table + seed

**UP:** per Spec 42 §6.6.B DDL (4 columns + 2 indexes). Seeded from the v10 CSV's 152 trade signal columns — convert the column-wide matrix into ~1,500 normalized rows.

**Seed script:** `scripts/seeds/universal_stream_trade_signals.json` (NEW). Generator: a one-shot Node utility that reads `spec_84_universal_stream_v10.csv`, iterates the 38 trades × 4 signals, emits one row per `(seq, trade_slug, signal_type)` where the cell is `✓`.

**Test:** post-seed assert ~1,500 rows (sum of all ✓ marks across 152 trade columns); FK to `trades(slug)` and `universal_stream_catalog(seq)` enforced; assert specific known signal rows (e.g., excavation Work fires at seq 53 (#100 Site Grading)).

**Dependency:** must run after B.5 (`universal_stream_catalog` FK reference).

### B.7 — Migration: ALTER `permits` — add 7 columns

```sql
ALTER TABLE permits
  ADD COLUMN IF NOT EXISTS lead_id TEXT GENERATED ALWAYS AS ('permit:' || permit_num || ':' || LPAD(revision_num::text, 2, '0')) STORED,
  ADD COLUMN IF NOT EXISTS linked_coa_application_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lifecycle_seq INTEGER,
  ADD COLUMN IF NOT EXISTS lifecycle_group VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_block VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(5),
  ADD COLUMN IF NOT EXISTS bid_value DECIMAL(3,2);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lead_id ON permits (lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_linked_coa ON permits (linked_coa_application_number) WHERE linked_coa_application_number IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_seq ON permits (lifecycle_seq) WHERE lifecycle_seq IS NOT NULL;
```

**Note on `lead_id` as a GENERATED column:** auto-populated from `permit_num` + `revision_num` — no backfill needed in Phase C for permits (only for the OTHER tables that reference lead_id, which is a Phase C task). DOWN migration must remove the GENERATED column with `ALTER TABLE permits DROP COLUMN lead_id`.

**Test:** assert all 7 columns added with correct types, indexes exist, `lead_id` populated automatically for existing 247K rows with the canonical format.

### B.8 — Migration: ALTER `coa_applications` — add 13 columns

```sql
ALTER TABLE coa_applications
  ADD COLUMN IF NOT EXISTS lead_id TEXT GENERATED ALWAYS AS ('coa:' || application_number) STORED,
  ADD COLUMN IF NOT EXISTS coa_type_class VARCHAR(30),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS scope_tags TEXT[],
  ADD COLUMN IF NOT EXISTS scope_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scope_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS structure_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS neighbourhood_id BIGINT,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS modeled_gfa_sqm NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cost_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_seq INTEGER,
  ADD COLUMN IF NOT EXISTS lifecycle_group VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_block VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(5),
  ADD COLUMN IF NOT EXISTS bid_value DECIMAL(3,2);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_lead_id ON coa_applications (lead_id);
-- Plus indexes on neighbourhood_id, scope_tags (GIN), coa_type_class
```

**Test:** all columns added, `lead_id` auto-populated for existing 33K rows.

### B.9 — Migration: ALTER `cost_estimates`, `trade_forecasts`, `tracked_projects` — add `lead_id`

For each:
```sql
ALTER TABLE <table> ADD COLUMN IF NOT EXISTS lead_id TEXT;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_lead_id ON <table> (lead_id) WHERE lead_id IS NOT NULL;
```

**Note:** NOT generated columns — populated by `migrate-to-lead-id.js` in Phase C from the existing `permit_num`/`revision_num` pair. Stays nullable in Phase B; promoted to `NOT NULL` after Phase C backfill via a Phase H follow-up.

**Test:** columns added nullable; index created.

### B.10 — Migration: ALTER `phase_stay_calibration` — add 4 cohort-key columns

```sql
ALTER TABLE phase_stay_calibration
  ADD COLUMN IF NOT EXISTS from_seq INTEGER,
  ADD COLUMN IF NOT EXISTS to_seq INTEGER,
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS coa_type_class VARCHAR(30);
```

**Test:** columns added; existing PK constraint adjusted if needed (TBD per the existing schema's compound key — likely needs to be re-created).

### B.11 — Migration: seed new `logic_variables` rows

```sql
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  -- seq-level distribution bands (×110 — null until Phase E recalibration)
  ('lifecycle_band_seq_1_min', NULL, 'WF1 Phase A — populated in Phase E'),
  ('lifecycle_band_seq_1_max', NULL, 'WF1 Phase A — populated in Phase E'),
  -- ... 220 total band rows
  -- sample_size_threshold tier selector (×110)
  ('lifecycle_band_seq_1_sample_size_threshold', NULL, '"tight"|"moderate"|"loose"|"info_only" — auto-derived in Phase E recalibration'),
  -- ...
  -- retention + CoA CRM tuning
  ('lifecycle_status_history_retention_days', 1825, 'Default 5 years per Spec 86'),
  ('coa_stall_threshold_p2_days', 90, 'CoA Hearing Scheduled stall threshold'),
  ('coa_imminent_window_days', 7, 'CoA hearing-date imminent alert window')
ON CONFLICT (variable_key) DO NOTHING;
```

**Test:** assert ~330 new logic_variable rows; values match spec defaults.

### B.12 — Migration: backward-compat VIEWs

For external consumers that may still query the old table names during the Phase C–G transition window:

```sql
CREATE OR REPLACE VIEW permit_trades_view AS
  SELECT (split_part(lead_id, ':', 2))::VARCHAR(30) AS permit_num,
         (split_part(lead_id, ':', 3))::SMALLINT AS revision_num,
         trade_id, tier, confidence, is_active, phase, lead_score, classified_at
  FROM lead_trades WHERE lead_id LIKE 'permit:%';

-- Same pattern for permit_parcels_view, permit_phase_transitions_view
```

**Test:** views return the permit-side subset correctly; row counts match pre-migration `permit_trades` row count after Phase C backfill (`lead_trades` is empty in Phase B).

**DOWN:** drop views.

**Note:** these views are TEMPORARY scaffolding. Phase H drops them when all consumers have migrated.

### B.13 — Migration: NEW Foreign Key constraints

After all tables exist (B.1–B.6) and columns are added (B.7–B.10):

```sql
ALTER TABLE lead_trades
  ADD CONSTRAINT fk_lead_trades_lead_permits
    FOREIGN KEY (lead_id) REFERENCES permits(lead_id)
    DEFERRABLE INITIALLY DEFERRED NOT VALID;  -- NOT VALID = skip backfill check
ALTER TABLE lead_trades VALIDATE CONSTRAINT fk_lead_trades_lead_permits;
-- Plus same pattern for other lead_id FKs
```

**Open issue:** `lead_id` lives on both `permits` and `coa_applications`. We can't FK to two tables simultaneously. Options: (a) no FK on `lead_id` (rely on application-layer integrity); (b) check-constraint that lead_id matches a regex `'^(permit|coa):.*$'`; (c) split lead_id into separate FKs per discriminator. **Recommended: (b)** — application-layer write guarantees via the `deriveLeadId()` shared lib (Spec 84 §7 dual-path) plus a regex CHECK constraint at the DB level.

**Test:** insert an invalid lead_id; assert CHECK fails.

---

## Technical Implementation

* **New/Modified Components:** N/A (migrations only; no src/).
* **Data Hooks/Libs:** N/A.
* **Database Impact:** YES — 6 new tables, ~25 new columns, ~330 new `logic_variables` rows, 3 backward-compat views, 1 universal stream catalog seed (110 rows) + signals seed (~1,500 rows). All additive. No DROPs in Phase B.
* **Migration UPDATE strategy:** No backfill in Phase B — the `lead_id` columns on existing tables (cost_estimates, trade_forecasts, tracked_projects, phase_stay_calibration) stay nullable. Phase C's `migrate-to-lead-id.js` backfills via batched UPDATE. Phase B is column-addition only.
* **Estimated migration runtime:** GENERATED columns on `permits` (247K rows) and `coa_applications` (33K rows) populate inline — should complete in < 5 minutes total. Index creation with `CREATE INDEX CONCURRENTLY` doesn't lock the table.
* **External API:** N/A.

## Standards Compliance

* **Try-Catch Boundary:** N/A (migrations are SQL; `scripts/migrate.js` handles errors at the runner level).
* **Unhappy Path Tests:** YES — each migration has a re-runnability test (`IF NOT EXISTS` guards; running twice should be a no-op).
* **logError Mandate:** N/A.
* **UI Layout:** N/A.
* **Multi-Agent Review:** REQUIRED at R2 (this plan) and R8 (post-implementation diff review per `00_engineering_standards.md`).
* **Spec 47 §10 compliance:** every UP has a tested DOWN. Every migration is re-runnable. Every `CREATE INDEX` uses `CONCURRENTLY` to avoid table locks on hot-path tables (permits, coa_applications).

## Execution Plan

- [ ] **R0 — Read prerequisite specs.** Re-read Spec 47 §10 (migration UP/DOWN parity); Spec 42 §6.6 (canonical schema); Spec 01 §3.A (global index); active task §A.1.7 (seq-level band keys); `migrations/006_permit_trades.sql` + `migrations/086_predictive_timing_schema.sql` as existing templates.
- [ ] **R0.5 — Check next free migration number.** `ls migrations/ | sort -t_ -k1n | tail -3` — likely 124 onwards.
- [ ] **R0.6 — Generate seed files** (one-shot scripts at repo root, NOT in `scripts/`):
  - `_tmp_phase_b_seed_catalog.mjs` — read v10 CSV → write `scripts/seeds/universal_stream_catalog.json` (110 rows)
  - `_tmp_phase_b_seed_signals.mjs` — read v10 CSV → write `scripts/seeds/universal_stream_trade_signals.json` (~1,500 rows)
  - Validate both seeds (row counts, FK reachability) before committing
- [ ] **R1 — Write this active task.** _Complete (this file)._
- [ ] **R2 — Multi-Agent Review of this active task.** Same cadence as Phase A — Gemini + DeepSeek (plan-review templates) + worktree feature-dev:code-reviewer. Reviewers get the 14 amended Phase A specs as context.
- [ ] **R3 — Triage findings.** BUG → fix in spec text before commit. DEFER → `docs/reports/review_followups.md`.
- [ ] **R4 — Authorization gate. PLAN LOCKED ask.** Halt for user authorization.
- [ ] **R5 — Write migrations in dependency order:**
  - [ ] R5.1 — B.1 (lead_trades), B.2 (lead_parcels), B.3 (lifecycle_transitions), B.4 (lifecycle_status_history) — independent table creates, can run in parallel
  - [ ] R5.2 — B.5 (universal_stream_catalog + seed), B.6 (universal_stream_trade_signals + seed) — B.6 depends on B.5 FK
  - [ ] R5.3 — B.7 (ALTER permits), B.8 (ALTER coa_applications), B.9 (ALTER cost_estimates / trade_forecasts / tracked_projects), B.10 (ALTER phase_stay_calibration) — independent ALTERs
  - [ ] R5.4 — B.11 (logic_variables seed)
  - [ ] R5.5 — B.12 (backward-compat views), B.13 (FK constraints + CHECK constraint on lead_id format)
- [ ] **R6 — Run migrations on staging DB.** `node scripts/migrate.js` against a staging copy. Verify all tables/columns/indexes per `pg_class` + `pg_indexes`. Re-run migrations (idempotent — should be a no-op).
- [ ] **R7 — Write per-migration tests** (`migration-NNN-*.infra.test.ts`) — one per migration. Plus the `lead-id-schema-parity.logic.test.ts` cross-cutting test.
- [ ] **R8 — Multi-Agent Review of executed migrations.** Per Phase A lesson — DO NOT SKIP. Review the actual `.sql` files + tests against Spec 42 §6.6 and Spec 01 §3.A.
- [ ] **R9 — Triage R8 findings + apply BUG fixes.**
- [ ] **R10 — Commit cadence:** one commit per migration group (R5.1, R5.2, R5.3, R5.4, R5.5). Final commit ties everything together.
- [ ] **R11 — User confirmation before push.** Same as Phase A.

## Plan Compliance Notes

* §Multi-Agent Review present: R2 (plan) + R8 (post-migration).
* Spec 47 §10 (migration UP/DOWN parity): every UP has a tested DOWN.
* CONCURRENTLY for indexes on hot-path tables (permits 247K rows, coa_applications 33K rows).
* GENERATED columns for `lead_id` on `permits` + `coa_applications` (no backfill needed for these).
* Domain mode: Backend/Pipeline declared at top.

## Out of Scope (Explicitly Deferred to Phases C–H)

- `lead_id` backfill on `cost_estimates`/`trade_forecasts`/`tracked_projects`/`lifecycle_transitions` (Phase C `migrate-to-lead-id.js`)
- CoA classification script bodies (Phase D)
- Lifecycle engine modifications (Phase E)
- Forecast/opportunity/CRM CoA extensions (Phase F)
- PRE-permit retirement (Phase G)
- Legacy column drop + view drop (Phase H)
- Per-trade `logic_variable` recalibration (Phase E)

---

> **PLAN LOCKED. Do you authorize this WF1 Phase B plan? (y/n)**
> 13 migrations (~12 .sql files), ~330 new logic_variable rows seeded, 2 reference-data seed JSON files, ~330 lines of new SQL total. All additive — zero behavioral change to existing pipelines. Phase A's design contract drives every choice here.
> DO NOT generate migration files. DO NOT run commands. TERMINATE RESPONSE awaiting authorization.
