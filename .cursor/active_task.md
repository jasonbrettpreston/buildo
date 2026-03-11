# Active Task: Live DB Data Flow + Chain Completion Report + WF6 Hardening
**Status:** Implementation

## Context
* **Goal:** Three changes: (A) Make DataFlowTile render exclusively from live `pipeline_meta` stored in DB — no static reads/writes/sources. (B) Add Chain Completion Report tile summarizing net DB impact after chain finishes. (C) Fix 5 WF6 hardening gaps from Streams A/B/C.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/lib/admin/funnel.ts` — `StepDescription` interface, `STEP_DESCRIPTIONS`
  - `src/components/funnel/FunnelPanels.tsx` — `DataFlowTile` component
  - `src/components/FreshnessTimeline.tsx` — chain rendering, sparkline slug
  - `scripts/run-chain.js` — empty catch blocks, chain completion summary
  - `scripts/refresh-snapshot.js` — division by zero guard
  - `src/tests/quality.logic.test.ts` — tests referencing static writes
  - `src/tests/admin.ui.test.tsx` — tests asserting static writes pattern

## Technical Implementation

### Feature A: Live DB Data Flow (DataFlowTile rewrite)

**Current state:** `DataFlowTile` uses static `desc.sources` for source table cards, static `desc.reads` for read columns, static `desc.writes` for write columns. Falls back to `dbSchemaMap` (full `information_schema.columns`) when no static entry.

**New state:** `DataFlowTile` renders exclusively from `pipelineMeta` (live `pipeline_runs.records_meta.pipeline_meta`):
- **Source tables:** `Object.keys(pipelineMeta.reads)` — each key is a table name (or external API like `CKAN API`)
- **Read columns:** `pipelineMeta.reads[table]` — exact columns per source table
- **Write table:** `Object.keys(pipelineMeta.writes)` — may have multiple target tables (e.g. `link_wsib` writes to both `entities` and `wsib_registry`)
- **Write columns:** `pipelineMeta.writes[table]` — exact columns per target table
- **Never-run fallback:** Show full table schema from `dbSchemaMap` with "Run pipeline to see exact data flow" note
- **External APIs:** Keys not in `dbSchemaMap` render as blue badges (existing pattern)

**Changes to `STEP_DESCRIPTIONS`:**
- Remove `sources`, `reads`, `writes` fields from all entries
- Keep `summary` (human label) and `table` (for `PIPELINE_TABLE_MAP` + T3 linkage)
- Update `StepDescription` interface to remove those fields
- `DataFlowTile` prop changes: remove `desc` dependency on sources/reads/writes — only needs `desc.summary` and `desc.table`

**Changes to `DataFlowTile`:**
- Primary rendering: `pipelineMeta.reads` keys → source cards with column lists, `pipelineMeta.writes` keys → target cards with column lists
- Remove `desc.sources` / `desc.reads` / `desc.writes` usage entirely
- Keep `dbSchemaMap` for fallback (never-run steps show full table schema)
- Keep `desc.table` for self-referential detection and fallback target

### Feature B: Chain Completion Report

After a chain finishes, show an alert-style summary tile at the top of the chain's step list:
- `[✅ PERMITS CHAIN COMPLETED]`
- `Duration: 4m 12s | 340 New Rows | 1,202 Updated | 100% Schema Compliance`
- Aggregate T2 `pg_stats` across all chain steps from their `records_meta.telemetry`
- Only visible when chain has completed (not running, not never-run)
- Shows at chain header level in `FreshnessTimeline.tsx`

### Feature C: WF6 Hardening Fixes
- C2: `scripts/run-chain.js` — 3 empty catches → `pipeline.log.warn()`
- M1: `FreshnessTimeline.tsx` — sparkline slug extraction fix for `deep_scrapes` chain
- M2: `FreshnessTimeline.tsx` — sparkline `.catch(() => {})` → `.catch((e) => console.warn(...))`
- M5: `scripts/refresh-snapshot.js` — guard `c.total == 0` before division

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes created.
* **Unhappy Path Tests:** N/A — no new API routes.
* **logError Mandate:** N/A — no API routes modified.
* **Mobile-First:** DataFlowTile already uses `flex flex-col md:flex-row`. Chain completion report will use same pattern. No new layout concerns.

## Execution Plan
- [ ] **State Verification:** Confirm `pipeline_meta` data exists in DB for all chain steps (verified via live query above — all 15 permits chain steps have reads/writes).
- [ ] **Contract Definition:** N/A — no API routes modified.
- [ ] **Spec Update:** Update `docs/specs/28_data_quality_dashboard.md` to document live-only DataFlowTile and chain completion report.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Guardrail Test:** Update tests:
  - `quality.logic.test.ts`: Remove test asserting "static STEP_DESCRIPTIONS for writes" (line 1595). Remove test asserting `assert_schema.writes` / `assert_data_bounds.writes` (line 1605). Update STEP_DESCRIPTIONS shape test (line 713) to no longer require `sources`. Add test asserting DataFlowTile uses `pipelineMeta` as primary source.
  - `admin.ui.test.tsx`: Remove assertions on `const writeCols = desc.writes ?? null` and `const sources = desc.sources` (line 1084-1086). Add assertion that DataFlowTile renders from `pipelineMeta.reads`/`pipelineMeta.writes`.
- [ ] **Red Light:** Verify updated tests fail against current code.
- [ ] **Implementation:**
  - Strip `sources`, `reads`, `writes` from `StepDescription` interface and all entries in `STEP_DESCRIPTIONS`
  - Rewrite `DataFlowTile` to render from `pipelineMeta` with `dbSchemaMap` fallback
  - Add chain completion report tile in `FreshnessTimeline.tsx`
  - Apply WF6 hardening fixes (C2, M1, M2, M5)
- [ ] **UI Regression Check:** `npx vitest run src/tests/*.ui.test.tsx`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
