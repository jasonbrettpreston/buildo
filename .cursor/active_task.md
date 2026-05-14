# Active Task: WF1 #coa-pipeline-parity-phase-c — `lead_id` Backfill + Permit-Side Rekey

**Status:** COMPLETE 2026-05-13 — Phase C delivered in 4 commits (`fdf505d` R5.1 + `27b3c3f` R5.2 + `872ec73` R5.3 + post-R8 spec amendments). Gate satisfied per Spec 42 §6.11 — zero NULL lead_id; R6 verifier 64/64; full suite 5,604/5,609 (60/60 db.test.ts). R5.4-R5.6 deferred to Phase H prep WF. R8 final review returned 0 BUGs, 2 documentation DEFERs (both fixed inline in this commit).
**Workflow:** WF1 (Genesis — third phase of the larger WF2 #coa-pipeline-parity work)
**Domain Mode:** Cross-Domain (backend pipeline scripts + shared lib + admin UI read queries)
**Rollback Anchor:** `8d5ce16` (current HEAD on main — Phase B + 3 CI hotfixes complete)
**Parent WF:** WF2 #coa-pipeline-parity (multi-phase; Phase A delivered design contract; Phase B shipped schema; this Phase C populates + rekeys permit-side consumers; Phases D-H deliver CoA scripts, lifecycle engine, forecast extensions, retirement, drops)
**Predecessor:** WF1 #coa-pipeline-parity-phase-b (COMPLETE 2026-05-13; 10 commits + 3 CI hotfixes)

---

## Context

* **Goal:** Migrate every permit-side writer + reader from the legacy `(permit_num, revision_num)` composite key to the canonical `lead_id` (`'permit:<num>:<rev>'`) shipped by Phase B. The Phase B substrate (new tables `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`; nullable `lead_id` on the 4 consumer tables; triggers populating `lead_id` on `permits` + `coa_applications` automatically) is in place but no live writer/reader uses it yet. Phase C lights it up — backfill the 4 consumer tables, promote their `lead_id` to NOT NULL + UNIQUE, rekey 6 pipeline scripts + 2 admin read queries. Phase C is the **functional handover from old key to new key for permit-side leads**. CoA-side population happens in Phase D.
* **Why now:** Spec 42 §6.11 Phase C gates Phase D (CoA classifiers need `lead_trades`/`lead_parcels` populated for the permit side first to validate the schema works end-to-end). Phase B has been stable for 24 hours of CI; the schema is solid enough to wire onto.
* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.6 (canonical schema), §6.9 (modified scripts list), §6.11 Phase C (gate criteria), §6.11.1 Phase C (Per-Phase Execution References — definitive file list).
* **Key Files (per Spec 42 §6.11.1 Phase C):**
  - **NEW lib:** `scripts/lib/leads/lead-id.js` (shared `deriveLeadId` pure function; JS side of Spec 84 §7 dual-path)
  - **NEW lib:** `src/lib/leads/lead-id.ts` (TS mirror of `deriveLeadId`; coexists with the existing `src/lib/leads/parse-lead-id.ts` which handles a *different* URL-encoded mobile format)
  - **NEW one-shot script:** `scripts/migrate-to-lead-id.js` (advisory lock 4205; backfills `lead_id` on `cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics`; emits audit_table on coverage)
  - **NEW migrations (4):** post-backfill NOT NULL + UNIQUE promotion on the 4 consumer tables (one migration per table to keep Phase C atomic if any one fails)
  - **DUAL-WRITE:** `scripts/classify-permits.js` — write to BOTH `lead_trades` AND `permit_trades`. The plan originally described this as a write-target swap, but R2 worktree review caught 10+ `src/` readers of `permit_trades` that would silently see stale data. Per Spec 42 §6.11 Phase B explicit note ("Old tables remain as live tables throughout Phase B and Phase C"), the implicit design is dual-write. Phase C extends the write surface; the existing `permit_trades` write stays in place. A separate WF (post-Phase H planning) migrates the 10+ `src/` readers; Phase H then drops `permit_trades`.
  - **DUAL-WRITE:** `scripts/link-parcels.js` — write to BOTH `lead_parcels` AND `permit_parcels`. Same rationale as classify-permits.
  - **REKEY:** `scripts/compute-cost-estimates.js` — read `lead_trades`; write `cost_estimates` on `lead_id`
  - **REKEY:** `scripts/compute-trade-forecasts.js` — write `trade_forecasts` on `lead_id` (CoA UNION source extension is Phase F, NOT Phase C)
  - **REKEY:** `scripts/compute-opportunity-scores.js` — write `lead_id`-keyed output
  - **REKEY:** `scripts/update-tracked-projects.js` — write `tracked_projects` on `lead_id`
  - **REKEY:** `src/lib/leads/lead-detail-query.ts` — JOIN `cost_estimates`/`trade_forecasts` on `lead_id` (currently joins on composite key); read `lead_trades` instead of `permit_trades`
  - **REKEY:** `src/lib/leads/lead-inspect-query.ts` — same pattern; admin inspector reads
  - **AUDIT-AND-DECIDE (5 ancillary writers — see R0.6 recon step):** `scripts/backfill-realtor-permit-trades.js`, `scripts/reclassify-all.js`, `scripts/seed-parcels.js`, `scripts/create-pre-permits.js`, **and `scripts/classify-lifecycle-phase.js`** (writes `permit_phase_transitions` lines 740 + 1008 — R2 worktree review found this missing from the original list). These also write to `permit_trades` / `permit_parcels` / `permit_phase_transitions`. Decision per writer (dual-write now / defer to Phase E/G / no-op) is the first deliverable of R0.6. Default decision under the dual-write semantics: dual-write — these continue writing legacy tables AND start writing the new ones.
  - **NOT-IN-SCOPE (10+ `src/` readers of `permit_trades` / `permit_parcels`):** documented for future-WF tracking. Phase C does NOT rekey these — dual-write keeps them functional through Phase G. Specifically: `src/features/leads/lib/timing.ts`, `src/features/leads/lib/get-lead-feed.ts`, `src/lib/sync/process.ts`, `src/lib/quality/metrics.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/permits/route.ts`, `src/app/api/permits/geo/route.ts`, `src/app/api/permits/[id]/route.ts`, `src/lib/analytics/queries.ts`, `src/lib/market-metrics/queries.ts`. A separate WF post-Phase G migrates these to read `lead_trades` / `lead_parcels`.

---

## R0 Audit Results (executed 2026-05-13 — used to ground the plan)

Per R2 DeepSeek findings, baseline data audited against local Postgres dev DB before plan finalization:

| Audit | Query | Result | Implication |
|---|---|---|---|
| R0.7 `lead_analytics` format | `SELECT lead_key FROM lead_analytics WHERE lead_key !~ '^(permit\|coa):.+'` | **0 rows total** (table empty) | No format mismatch to handle — Phase D establishes the canonical format when classifiers first populate the table |
| R0.8 row counts | `SELECT COUNT(*) FROM <table>` | `cost_estimates=247,030`; `trade_forecasts=654,179`; `tracked_projects=0`; `lead_analytics=0`; `permits=247,030`; `coa_applications=33,052` | trade_forecasts is **3.3× my estimate** — migration 139 runtime updated to 2-5 min; tracked_projects + lead_analytics are empty so backfill is trivial |
| R0.9 NULL permit cols | `SELECT COUNT(*) FROM permits WHERE permit_num IS NULL` + same for revision_num | 0 + 0 | No NULL edge cases in `deriveLeadId` source data |
| R0.10 over-width revision | `SELECT MAX(LENGTH(revision_num)) FROM permits` | 2 | All revisions fit `LPAD(_,2,'0')` exactly — no over-width pass-through cases |

**Implications baked into the plan:**
- C.2 backfill is meaningful only for `cost_estimates` (247K) + `trade_forecasts` (654K); the other 2 tables are empty no-ops.
- C.3 NOT NULL promotion on `tracked_projects` + `lead_analytics` is trivially safe (zero rows).
- C.3 the "dual-key consideration for tracked_projects" (NOT NULL deferral) is irrelevant in Phase C — when tracked_projects is populated by Phase D/F, CoA-side rows will get coa: lead_ids, and NOT NULL becomes promotable at that point.
- C.1 `deriveLeadId` fixture matrix focuses on standard 2-digit revisions; over-width is a not-currently-applicable edge case but still tested for forward safety.

---

## Phase B Predecessor State (anchors)

Phase B left this substrate in place — Phase C builds on it:
- `permits.lead_id` is **populated** via trigger on 247K rows; format `'permit:<num>:<rev>'`; CHECK enforces format.
- `coa_applications.lead_id` is **populated** via trigger on 33K rows; format `'coa:<application_number>'`; CHECK enforces.
- `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history` exist as **empty** tables with CHECK on `lead_id`. No writer touches them yet.
- `cost_estimates.lead_id`, `trade_forecasts.lead_id`, `tracked_projects.lead_id`, `lead_analytics.lead_id` exist as **nullable** columns with CHECK but no backfill. Partial indexes on `WHERE lead_id IS NOT NULL`.
- `phase_stay_calibration` has the 4 new cohort-dim columns + UNIQUE (default NULLS DISTINCT). Phase E populates the cohort dims.
- `universal_stream_catalog` has 110 rows; `universal_stream_trade_signals` has 1,422 rows. Phase E classifier reads these.
- `lead_id_orphan_audit` view exists on the 4 Phase B tables. Phase C extends it to cover the 4 consumer tables once they're backfilled.
- `lead_analytics.lead_key` still exists alongside the new nullable `lead_id`; lead_key continues to be the canonical user-facing key through Phase G; Phase C backfills lead_id from lead_key.

---

## Phase C Scope — Detailed

For each touched file: source-of-change, key transformation, test contract, risk tier.

### C.1 — `scripts/lib/leads/lead-id.js` (NEW shared lib, JS side)

Pure function `deriveLeadId({ permit_num, revision_num })` or `deriveLeadId({ application_number })` → canonical `lead_id` string. Mirror at `src/lib/leads/lead-id.ts`. Both files are tested by `lead-id.logic.test.ts` (Spec 84 §7 dual-path parity — the two implementations must produce identical output for identical input across a fixed set of fixtures).

**Risk:** MED — pure function, but TS↔JS parity is critical because every downstream script depends on it. A drift here corrupts every consumer.

**Key code-shape:**
```js
function deriveLeadId(input) {
  if (input.application_number != null) return `coa:${input.application_number}`;
  if (input.permit_num != null && input.revision_num != null) {
    return `permit:${input.permit_num}:${String(input.revision_num).padStart(2, '0')}`;
  }
  throw new Error('deriveLeadId: requires application_number OR (permit_num + revision_num)');
}
```

### C.2 — One-shot backfill: `scripts/migrate-to-lead-id.js`

Advisory lock 4205 per Spec 42 §6.8. **Atomicity:** ALL 4 table UPDATEs land inside a single `withTransaction` envelope (the advisory lock already serializes; the single transaction ensures partial failure doesn't leave the DB in a mixed state where some tables are backfilled and others aren't — per R2 DeepSeek finding).

Per-table UPDATE (post R0.7/R0.8 audit — tracked_projects + lead_analytics are CURRENTLY EMPTY so those branches are zero-row no-ops in Phase C; included for completeness so re-runs after future inserts are safe):
- `cost_estimates` (247K rows): `SET lead_id = 'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0') WHERE lead_id IS NULL`
- `trade_forecasts` (654K rows): same shape
- `tracked_projects` (currently 0 rows): same shape; `lead_type` column disambiguates permit vs CoA rows for the future-populated case (Phase D/F populates rows)
- `lead_analytics` (currently 0 rows): backfill from `lead_key` directly (`SET lead_id = lead_key WHERE lead_id IS NULL`). R0.7 audit confirmed 0 rows present; no format mismatch to handle in Phase C. When Phase D classifiers populate lead_analytics, the new canonical format applies from the start.

**Idempotency:** every UPDATE guarded by `WHERE lead_id IS NULL`. Re-run is a no-op.

**audit_table emits:**
- `rows_backfilled_cost_estimates`, `rows_backfilled_trade_forecasts`, `rows_backfilled_tracked_projects`, `rows_backfilled_lead_analytics`
- `lead_id_null_count_<table>` — must be 0 post-backfill for the migration to PASS
- `lead_id_format_violations_<table>` — CHECK regex confirms format; this counts CHECK rejections (should be 0)

**Risk:** **HIGH** — touches 4 hot consumer tables. If the backfill misses any rows, the subsequent NOT NULL promotion fails. If the lead_analytics format is subtly different from the new canonical (e.g., space vs colon — was noted in R5.1 review followups item #25), the CHECK rejects the row and the migration aborts.

### C.3 — NOT NULL + UNIQUE promotion migrations (NEW migrations 138–142)

One migration per table — atomicity. Each migration includes a **two-stage pre-check**: first verify no NULL lead_id rows exist (post-backfill invariant), then verify no duplicates exist (UNIQUE INDEX would fail loudly otherwise). Both checks RAISE EXCEPTION on violation per R2 DeepSeek finding.

```sql
-- Pre-check 1: confirm no NULLs before promoting NOT NULL
DO $$
DECLARE null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM <table> WHERE lead_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Phase C promotion aborted on %: % rows have NULL lead_id', '<table>', null_count;
    END IF;
END $$;

-- Pre-check 2: confirm no duplicates before creating UNIQUE INDEX
DO $$
DECLARE dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id FROM <table>
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Phase C UNIQUE INDEX aborted on %: % duplicate lead_id values', '<table>', dup_count;
    END IF;
END $$;

ALTER TABLE <table> ALTER COLUMN lead_id SET NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_<table>_lead_id ON <table> (lead_id);
-- The partial index from Phase B (idx_<table>_lead_id WHERE lead_id IS NOT NULL) is now redundant — drop it.
DROP INDEX CONCURRENTLY IF EXISTS idx_<table>_lead_id;
```

**Migration numbering:** 138 (cost_estimates 247K rows), 139 (trade_forecasts 654K rows), 140 (tracked_projects empty), 141 (lead_analytics empty), 142 (extend orphan-audit view).

**Risk:** HIGH for 138 + 139 — `ALTER COLUMN SET NOT NULL` requires a full-table scan; on `trade_forecasts` (654K rows per R0.8 audit) estimate 1-3 min. `CREATE UNIQUE INDEX CONCURRENTLY` will fail on duplicates — the pre-check 2 makes failure loud. LOW for 140 + 141 (empty tables; both operations are metadata-only).

**Migration 140 specifically (tracked_projects):** since the table is empty per R0.8, we COULD promote NOT NULL now without issue. However per Spec 42 §6.6 the CoA-side rows will be populated by Phase D/F — at which point lead_type='coa' rows will have coa: lead_ids. To future-proof, migration 140 creates the UNIQUE INDEX `WHERE lead_id IS NOT NULL` (partial, per R2 Gemini finding) AND promotes NOT NULL (safe because empty). The partial UNIQUE survives future CoA-row inserts that arrive with non-NULL lead_id via the Phase D classifiers.

**Per-migration statement_timeout** (per R2 DeepSeek DEFER): each migration sets `SET LOCAL statement_timeout = '5min'` in its prologue so CONCURRENTLY UNIQUE INDEX on trade_forecasts doesn't trip the default timeout.

### C.4 — Permit-side writer dual-write extensions

**Critical design clarification (R2 worktree review):** Phase C does NOT swap write targets. It EXTENDS writes — adds new writes to `lead_trades` / `lead_parcels` while keeping the existing `permit_trades` / `permit_parcels` writes in place. This preserves the 10+ `src/` readers that read legacy tables until a separate post-Phase-G WF migrates them. Per Spec 42 §6.11 Phase B note: "Old tables remain as live tables throughout Phase B and Phase C."

#### C.4.a `scripts/classify-permits.js` (905 lines)
Writes `permit_trades` (INSERT, DELETE on lines 746, 796, 819 per R5.1 worktree). Phase C **adds** parallel writes to `lead_trades` — same row content, lead_id derived via `deriveLeadId({ permit_num, revision_num })` from the shared lib (C.1). Each write pair (permit_trades + lead_trades) lands in the same `withTransaction` envelope per Spec 47 §R9 — atomicity is provided by the transaction, NOT by which table we read from (R2 Gemini wording fix). Tier 1/2/3 cascade logic unchanged.

**Risk:** HIGH — biggest writer in the codebase touching permit-classification state. Existing infra tests (`classify-permits.infra.test.ts`) are extensive — Phase C extends them to assert dual writes (both permit_trades AND lead_trades populated after a classification run).

#### C.4.b `scripts/link-parcels.js` (577 lines)
Writes `permit_parcels` (INSERT lines 434, DELETE lines 471/488). Phase C adds parallel writes to `lead_parcels`. Match-tier cascade logic unchanged. Same atomicity: paired writes inside one `withTransaction`.

**Risk:** HIGH — spatial linking; production writer.

### C.5 — Compute-pipeline rekeys

These consumers SWAP their read source from `permit_trades`/`permit_parcels` to the new `lead_trades`/`lead_parcels` tables. After Phase C, the legacy tables remain populated (via the dual-write extensions in C.4) but the compute consumers no longer touch them.

#### C.5.a `scripts/compute-cost-estimates.js` (491 lines)
- Reads: `permits` (source set, unchanged), `permit_trades` (trade allocations) → swap to `lead_trades`; `permit_parcels` → swap to `lead_parcels`
- Writes: `cost_estimates` keyed on `lead_id` (Phase B added the column; backfilled in C.2)
- JSONB `trade_contract_values` writer logic unchanged
- Lead_id derivation: read directly from `permits.lead_id` (populated by Phase B trigger) for performance/consistency (avoids re-deriving the same canonical string per row — R2 Gemini wording fix). The shared `deriveLeadId` is used only when no joined permits row is available.

#### C.5.b `scripts/compute-trade-forecasts.js` (779 lines)
- Reads: `permits`, `permit_trades` → `lead_trades`; `permit_phase_transitions` continues to be read (Phase E rewrites to read `lifecycle_transitions`)
- Writes: `trade_forecasts` keyed on `lead_id`
- **Out of scope for Phase C:** UNION source SQL to include CoA leads (that's Phase F per Spec 42 §6.11.1 Phase F Key Files)

#### C.5.c `scripts/compute-opportunity-scores.js` (370 lines)
- Reads: `trade_forecasts` (now keyed on `lead_id`)
- Writes: `trade_forecasts.opportunity_score` keyed on `lead_id`

**Test scaffolding for C.5** (Gemini R2 NIT fix — match the explicit detail level of R5.2/R5.3/R5.6): for each of the 3 scripts, three test layers per Spec 47 §R12:
1. `<script>.logic.test.ts` — pure-function logic updated for lead_id derivation
2. `<script>.infra.test.ts` — SQL-string regression-locks on the new write/read shape
3. `<script>.db.test.ts` — testcontainer-based end-to-end: seed permits + lead_trades fixtures, run the script, assert cost_estimates/trade_forecasts rows arrive keyed on lead_id

**Risk:** HIGH for C.5.a + C.5.b (downstream of every classification), MED for C.5.c (consumer of forecast output).

### C.6 — `scripts/update-tracked-projects.js` (735 lines)

Reads: `trade_forecasts`, `permits`, `cost_estimates`. Writes: `tracked_projects` keyed on `lead_id`. CoA-branch logic stays UNCHANGED (it's Phase F territory — Phase C only does permit-side rekey).

**Risk:** MED — CRM consumer; less critical than upstream classifiers but user-facing.

### C.7 — Admin read-side rekeys

#### C.7.a `src/lib/leads/lead-detail-query.ts`
Currently JOINs `cost_estimates` and `trade_forecasts` on `(permit_num, revision_num)` (lines 98-104). Phase C swaps these to JOIN on `p.lead_id = ce.lead_id`. The `lead_key` lookup for `lead_views` (lines 109, 117) is unchanged — same canonical format.

#### C.7.b `src/lib/leads/lead-inspect-query.ts`
Same pattern — multiple JOINs on `(permit_num, revision_num)` (lines 170-176, 218, 225, 234, 322, 335-336, 356-358) all swap to `lead_id`. Function signatures stay `{ permit_num, revision_num }` so the route handler doesn't need to change (the function internally derives lead_id for the SQL).

**Risk:** MED-HIGH — UI breakage on any missed JOIN would cause admin-side inspector failures.

### C.8 — Ancillary writers (audited during R0.6, R2 review extension)

R5.1 Phase B worktree review identified 4 additional writers; R2 (this round) worktree review found a 5th (`classify-lifecycle-phase.js`). Under the **dual-write semantics** locked in by R2, the default decision is "dual-write" (add a write to the new table while keeping the legacy write). Per-writer table:

| Writer | Legacy write | New write target | Decision |
|---|---|---|---|
| `scripts/backfill-realtor-permit-trades.js` line 200 | `permit_trades` | `lead_trades` | DUAL-WRITE (Phase C R5.3 scope — bundled with classify-permits.js because both write realtor rows) |
| `scripts/reclassify-all.js` lines 141/155 | `permit_trades` | `lead_trades` | DUAL-WRITE (Phase C R5.3 scope) |
| `scripts/seed-parcels.js` line 119 | `permit_parcels` | `lead_parcels` | DUAL-WRITE (Phase C R5.3 scope — bundled with link-parcels.js) |
| `scripts/create-pre-permits.js` lines 132/136 | DELETE `permit_trades` + `permit_parcels` | (will also delete `lead_trades` + `lead_parcels`) | DUAL-DELETE (Phase C R5.3 scope — the PRE-permit reconciliation needs to clean both old and new tables; otherwise Phase G's "Pre-Permit count = 0" check trips) |
| `scripts/classify-lifecycle-phase.js` lines 740/1008 | `permit_phase_transitions` | `lifecycle_transitions` | **DEFER to Phase E** — lifecycle engine rekey is explicitly Phase E scope per Spec 42 §6.11.1; Phase C does not touch this writer. Phase G retires `permit_phase_transitions` after Phase E migrates the writer. |

R0.6 verification step: re-grep `scripts/` for any other `INSERT INTO permit_trades` / `INSERT INTO permit_parcels` / `INSERT INTO permit_phase_transitions` / `DELETE FROM permit_trades` / `DELETE FROM permit_parcels` / `DELETE FROM permit_phase_transitions` patterns to confirm this list is exhaustive. Any additions get added to this table before R1 with a stated decision.

### C.9 — Test scaffolding

For every script in C.1–C.7, three test layers per Spec 47 §R12:

1. **Logic tests** (`*.logic.test.ts`) — pure functions, fixture-driven:
   - `lead-id.logic.test.ts` — `deriveLeadId` outputs (TS↔JS dual-path parity assertion)
   - Updated assertions in existing logic tests for classification / cost / forecast logic
2. **Infra tests** (`*.infra.test.ts`) — SQL-string regression-locks on the new shape of each script's output schema, write target table assertion
3. **DB integration tests** (`src/tests/db/*.db.test.ts`) — **MANDATORY per Phase B lesson**. Each rekey gets a `.db.test.ts` that boots a testcontainer, applies all migrations, INSERTs fixture rows on the new key shape, runs the rekeyed script, asserts the new tables get populated correctly. Per saved memory `feedback_db_integration_tests.md`, this is the only layer that catches IMMUTABLE / NOT NULL / FK / length / constraint-collision bugs that Phase B's 3 CI hotfixes surfaced.

### C.10 — `lead_id_orphan_audit` view extension

Phase B's view (migration 137) covers only the 4 Phase B tables. Phase C extends it to add `cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics` as UNION ALL branches. Lives in a new migration (142) so the view extension and the NOT NULL promotion stay in their own atomic units.

---

## Technical Implementation

* **New Components:** `scripts/lib/leads/lead-id.js`, `src/lib/leads/lead-id.ts`, `scripts/migrate-to-lead-id.js`, 5 new migrations (138–142).
* **Modified Components:** 6 pipeline scripts, 2 admin query lib files, plus 0–4 ancillary writers (per R0.6 audit).
* **Data Hooks/Libs:** Spec 84 §7 dual-path means the TS + JS `deriveLeadId` implementations are both tested by a single logic-test that asserts byte-equal output across a fixture matrix.
* **Database Impact:** YES — 5 new migrations:
  - 138 `promote_cost_estimates_lead_id_not_null` — verify count + ALTER NOT NULL + UNIQUE INDEX CONCURRENTLY + drop partial index
  - 139 `promote_trade_forecasts_lead_id_not_null` — same pattern
  - 140 `add_tracked_projects_lead_id_unique` — UNIQUE INDEX only (NOT NULL deferred to Phase F per dual-key consideration above)
  - 141 `promote_lead_analytics_lead_id_not_null` — same pattern as 138/139
  - 142 `extend_lead_id_orphan_audit_view` — extend the view with 4 new UNION ALL branches
* **Migration UPDATE strategy:** the one-shot `migrate-to-lead-id.js` runs FIRST (advisory-locked). After it emits a clean audit_table (zero NULL `lead_id`, zero format violations), migrations 138-142 apply. If the backfill is incomplete, the DO/EXCEPTION precheck in each migration aborts loudly.
* **Estimated runtime per migration:**
  - 138: cost_estimates ~50K rows — ALTER NOT NULL ~5-10s + CONCURRENTLY UNIQUE INDEX ~10-30s
  - 139: trade_forecasts ~200K rows — ALTER NOT NULL ~30-60s + CONCURRENTLY UNIQUE INDEX ~60-120s (HIGHEST runtime in Phase C)
  - 140: tracked_projects ~5K rows — UNIQUE INDEX ~1s
  - 141: lead_analytics ~10K rows — ~5s
  - 142: view DDL — instant
  - migrate-to-lead-id.js backfill: streamed UPDATE on 4 tables — estimate 1-3 min total
* **External API:** N/A.

## Standards Compliance

* **WF1 sequence per group (R5.X):** Test Scaffolding → Red Light (tests MUST fail) → Implementation → Group Green Light (tests + typecheck + lint + relevant `.db.test.ts` against fresh staging) → Self-Checklist → Multi-Agent Review → Triage → Commit.
* **Try-Catch Boundary:** Every pipeline script uses Spec 47 §R9 `withTransaction` envelope (no change in pattern; just write-target swap). Read-side queries use existing try-catch in route handlers.
* **Unhappy Path Tests:** YES — each rekey adds at least one `.db.test.ts` that exercises the failure modes (e.g., classify-permits with a permit row whose lead_id is NULL — should fail loudly; cost_estimates write with a lead_id that doesn't match the CHECK regex — should be rejected by Phase B's CHECK).
* **logError Mandate:** Per `00_engineering_standards.md` §6, every new catch block uses `logError(tag, err, context)`. The shared `lead-id.js` `deriveLeadId` THROWS on bad input — callers catch + log.
* **UI Layout:** N/A for the pipeline + lib changes. The 2 admin query rekeys are data-layer only; no UI markup touched. (`/admin/leads/inspect/[id]` consumes the rekeyed query unchanged.)
* **Multi-Agent Review:** R2 (this plan) + per-group R5.X.f reviews + final R8 cross-cutting on cumulative diff. Risk-tiered per saved memory `feedback_review_protocol.md`:
  - C.1 (lead-id deriver) — MED → 3-reviewer
  - C.2 (one-shot backfill) — HIGH → 3-reviewer
  - C.3 (NOT NULL + UNIQUE migrations 138-142) — HIGH → 3-reviewer
  - C.4 (classify-permits + link-parcels rekey) — HIGH → 3-reviewer
  - C.5 (cost + forecast + opportunity rekey) — HIGH → 3-reviewer
  - C.6 (update-tracked-projects rekey) — MED → 3-reviewer
  - C.7 (admin read query rekeys) — MED-HIGH → 3-reviewer
* **Spec 47 §R1–R12 compliance:** EVERY new + modified script must adhere. The migrate-to-lead-id.js script (NEW) gets the full skeleton. The 6 modified scripts retain their existing skeleton; only the write-target swap and `lead_id` derivation are new.
* **Spec 84 §7 dual-path:** lead-id.js (JS) ↔ lead-id.ts (TS) parity test mandatory. Existing `parse-lead-id.ts` handles a *separate* concern (URL-encoded mobile lead_id `permit_num--revision_num`) and is NOT modified by Phase C. The new `deriveLeadId` is a different function in a different file.
* **DB integration tests:** Per saved memory `feedback_db_integration_tests.md` — every group's Green Light step runs `BUILDO_TEST_DB=1 npx vitest run src/tests/db` against fresh local Postgres OR (after Phase B's CI hotfixes) trusts the CI db-tests workflow on PR-style push. Phase C learns from Phase B's pattern: live-DB application is the ground truth.

---

## Execution Plan

- [ ] **R0 — Read prerequisite specs.** Spec 47 §R1–§R12 (full skeleton — every new + modified script); Spec 41 §13 / §9 / §15 / §25 / §26 / §27 (the 6 scripts being rekeyed); Spec 80 §5 (classifier gating still in force); Spec 81 (opportunity score schema); Spec 83 (cost estimate schema); Spec 85 (trade forecast schema); Spec 84 §7 (TS↔JS dual-path); Spec 00 engineering standards §Multi-Agent Review.
- [ ] **R0.5 — Confirm migration number = 138.** Last applied: 137 (lead_id_orphan_audit view). Phase C claims 138–142.
- [ ] **R0.6 — Ancillary writer audit (4 scripts).** Read each of `backfill-realtor-permit-trades.js`, `reclassify-all.js`, `seed-parcels.js`, `create-pre-permits.js`. For each: identify the write statements + decide REKEY-NOW / DEFER-TO-PHASE-G / NO-OP. Document the 4-row decision table in this active task before R1.
- [ ] **R0.7 — Lead_analytics format gap audit.** Per R5.1 followup #25, `lead_analytics.lead_key` may use a slightly different format than the new canonical (`'permit:24 101234:01'` with a SPACE before permit number, per migration 091). Query staging: `SELECT lead_key FROM lead_analytics WHERE lead_key !~ '^(permit|coa):[^ ]+' LIMIT 10`. If any rows fail the regex, the migrate-to-lead-id.js backfill must NORMALIZE the value (strip the space) before storing in `lead_id`. Outcome: either confirm format already matches (simple copy) or add a normalization step.
- [ ] **R1 — Write this active task.** *In progress (this file)*.
- [ ] **R2 — Multi-Agent Review of this plan.** Spawn in ONE message: Gemini + DeepSeek (plan-review templates) + worktree feature-dev:code-reviewer (with full plan + spec context). Reviewers should especially scrutinize:
  - R0.6 ancillary writer scope decisions
  - R0.7 lead_analytics format mismatch handling
  - Whether the NOT NULL deferral on `tracked_projects` (C.3 dual-key consideration) is the right call vs an alternative
  - Whether the migrate-to-lead-id.js backfill should use streamQuery vs single UPDATE
  - Whether the 6 script rekeys + 2 query rekeys can land in independent commits or must be bundled for consistency
  - The Spec 84 §7 dual-path parity test design — specifically how to fixture-drive TS↔JS comparison
- [ ] **R3 — Triage R2 findings.** BUG → fix in plan before authorization. DEFER → `docs/reports/review_followups.md`.
- [ ] **R4 — Authorization gate. PLAN LOCKED ask.** Halt for user authorization.
- [ ] **R5 — Per-group TDD cycle.** Each R5.X group: Test Scaffolding → Red Light → Implementation → Group Green Light → Self-Checklist → Multi-Agent Review → Triage → Commit. BUG findings in any group block the next group from starting.

  **R5.1 — Shared `deriveLeadId` lib + dual-path test (MED risk)**
  - Scaffold `lead-id.logic.test.ts` (TS) + `lead-id.test.js` (JS) + a parity test asserting both produce byte-equal output across 50+ fixtures
  - Red Light: tests fail (libs don't exist)
  - Implement `scripts/lib/leads/lead-id.js` + `src/lib/leads/lead-id.ts`
  - Green Light: tests pass; `npm run typecheck && npm run lint` clean
  - Self-Checklist: 5–10 items (input shape coverage, padding edge cases, throw-on-invalid, TS type narrowing, JS CommonJS export shape)
  - Multi-Agent Review: full 3-reviewer (Worktree + Gemini + DeepSeek)
  - Triage + Commit

  **R5.2 — One-shot backfill + NOT NULL/UNIQUE promotion migrations (HIGH risk)**
  - Scaffold `migrate-to-lead-id.infra.test.ts` (Spec 47 §R-compliance regression-lock on the script) + 5 migration tests (138-142) + 1 `.db.test.ts` exercising the end-to-end backfill on a testcontainer
  - Red Light: tests fail (script + migrations don't exist)
  - Implement `scripts/migrate-to-lead-id.js` + migrations 138-142
  - Green Light: tests pass; **MANDATORY** local `BUILDO_TEST_DB=1 npx vitest run src/tests/db` — must be 100% green before commit (per Phase B lesson)
  - Self-Checklist: 10+ items (advisory-lock pattern, audit_table emit, format normalization from R0.7, NOT NULL precheck DO block, CONCURRENTLY UNIQUE INDEX, partial-index cleanup, lead_analytics space-handling, tracked_projects NOT NULL deferral documented in migration header)
  - Multi-Agent Review: full 3-reviewer (HIGH-risk)
  - Triage + Commit

  **R5.3 — Permit-side dual-write via trigger mirroring (HIGH risk) — DESIGN PIVOT 2026-05-13**
  - **Pivot rationale:** the locked plan called for app-layer dual-write across 6 scripts (~180 lines of code change spread across `classify-permits.js`, `link-parcels.js`, `backfill-realtor-permit-trades.js`, `reclassify-all.js`, `seed-parcels.js`, `create-pre-permits.js`). The R2 worktree review flagged "missed writer" as the #1 risk. After R5.2 ships, trigger-based mirroring became the simpler design: 2 new migrations create AFTER INSERT/UPDATE/DELETE triggers on `permit_trades` + `permit_parcels` that auto-mirror every write to `lead_trades` + `lead_parcels`. **Net change: 0 script files modified, 2 migrations added.** Zero risk of missed writer; eliminates the C.8 ancillary audit entirely.
  - **Schema mapping:**
    - `permit_trades` → `lead_trades`: `(permit_num, revision_num)` → `lead_id` via `'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0')`. All other columns map 1:1.
    - `permit_parcels` → `lead_parcels`: same prefix derivation. Column `linked_at` → `matched_at` (renamed). `match_type` types differ (VARCHAR(30) → VARCHAR(20)) — R0.6.1 audit confirmed all production values fit (max length 15).
  - Scaffold 2 migration tests (143 + 144) asserting trigger function + AFTER trigger DDL + INSERT/UPDATE/DELETE handling
  - Red Light: tests fail (migrations don't exist)
  - Implement migrations 143 + 144 — `CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER ... AFTER INSERT OR UPDATE OR DELETE ON <legacy> FOR EACH ROW`
  - Green Light: tests + typecheck + full db.test.ts suite green; live-DB end-to-end: INSERT into permit_trades, observe parallel row appears in lead_trades; DELETE source, observe lead_trades row disappears
  - Self-Checklist: 12+ items (INSERT/UPDATE/DELETE branches all present, ON CONFLICT (lead_id, trade_id) DO UPDATE for re-runs, lead_id derivation matches Phase B trigger byte-for-byte, AFTER trigger semantics preserve source-write atomicity)
  - Multi-Agent Review: full 3-reviewer
  - Triage + Commit

  **R5.4 — Compute-pipeline rekeys (HIGH risk): compute-cost-estimates.js + compute-trade-forecasts.js + compute-opportunity-scores.js**
  - Scaffold updated tests for all three scripts
  - Red Light: tests fail (scripts still key on permit_num/revision_num)
  - Implement the rekey — read from `lead_trades`/`lead_parcels`; write `cost_estimates.lead_id` / `trade_forecasts.lead_id` / opportunity_score keyed on lead_id
  - Green Light: full test suite + db-tests green
  - Self-Checklist: 10+ items (Surgical Triangle math unchanged, JSONB writer unchanged, anchor-priority logic unchanged for permit-side, CoA-stage UNION explicitly NOT added)
  - Multi-Agent Review: full 3-reviewer (HIGH-risk; downstream of every classification)
  - Triage + Commit

  **R5.5 — Tracked-projects rekey (MED risk): update-tracked-projects.js**
  - Scaffold updated tests
  - Red Light: tests fail
  - Implement the rekey — write `tracked_projects.lead_id` (CoA branch logic UNCHANGED; that's Phase F)
  - Green Light: full test suite + db-tests green
  - Self-Checklist: 5–10 items (CoA branch preserved verbatim, alert thresholds unchanged, lead_type column already disambiguates rows)
  - Multi-Agent Review: full 3-reviewer (MED but user-facing CRM)
  - Triage + Commit

  **R5.6 — Admin read-side query rekeys (MED-HIGH risk): lead-detail-query.ts + lead-inspect-query.ts**
  - Scaffold updated `.logic.test.ts` (mocked pool) + `.db.test.ts` (live DB)
  - Red Light: tests fail
  - Implement the rekey — swap JOIN columns from `(permit_num, revision_num)` to `lead_id`; function signatures unchanged
  - Green Light: full test suite + db-tests green; manual `/admin/leads/inspect/[id]` page check in browser (golden + edge paths per CLAUDE.md UI testing rule)
  - Self-Checklist: 10+ items (every JOIN audited, function signatures preserved, lead_key path unchanged for lead_views, sorting + filter logic unchanged)
  - Multi-Agent Review: full 3-reviewer (MED-HIGH — user-facing)
  - Triage + Commit

- [ ] **R6 — Cross-cutting integration test on fresh staging.** Drop staging DB; re-apply migrations 001–142; run migrate-to-lead-id.js once; verify lead_id_orphan_audit returns 0; run the full pipeline chain end-to-end on staging snapshot; assert `cost_estimates.lead_id IS NOT NULL` count = row count, same for trade_forecasts + lead_analytics; assert lead_inspect_query returns sensible output for a sample of 10 permits.
- [ ] **R7 — Full test pass.** `npm run test` (5,400+ tests now) + `BUILDO_TEST_DB=1 npx vitest run src/tests/db` (live DB).
- [ ] **R8 — Final cross-cutting Multi-Agent Review.** Per Phase B lesson — DO NOT SKIP. Review cumulative diff (all 5 R5.X commits + the 1 backfill run + 5 migrations + 2 query rekeys) against Spec 42 §6.6 + §6.9 + Spec 47.
- [ ] **R9 — Triage R8 findings + apply BUG fixes.**
- [ ] **Final Green Light.** `npm run test && npm run lint -- --fix && npm run typecheck` — zero failures.
- [ ] **R10 — Push gate.** User confirmation before push.

---

## Plan Compliance Notes

* §Multi-Agent Review present: R2 (plan, this round) + per-group reviews at R5.1.f through R5.6.f (full 3-reviewer for HIGH, MED, MED-HIGH groups per saved memory) + final R8 cross-cutting.
* Spec 47 §R1–R12 compliance: every new + modified script. The migrate-to-lead-id.js (NEW) gets full skeleton; the 6 modified scripts retain their existing skeleton.
* Spec 84 §7 dual-path: lead-id.js + lead-id.ts parity asserted by `lead-id.logic.test.ts`. Existing `parse-lead-id.ts` handles a different concern and is NOT touched by Phase C.
* CONCURRENTLY usage: new migrations 138-142 use CREATE UNIQUE INDEX CONCURRENTLY on populated consumer tables (per Phase B pattern). Re-runnability via IF NOT EXISTS. NOT NULL ALTER COLUMN is fast (metadata + scan, no rewrite).
* DB integration tests: every R5.X.d Group Green Light step runs `BUILDO_TEST_DB=1 npx vitest run src/tests/db` against fresh local Postgres (or trusts CI db-tests if available). Per saved memory `feedback_db_integration_tests.md` — Phase B taught that SQL-string tests don't catch live-DB application bugs.
* Domain mode: Cross-Domain. Backend pipeline scripts + shared lib + admin UI read queries all touched.
* Phase C is **functional handover, not data destruction.** Old tables (permit_trades, permit_parcels, permit_phase_transitions) remain populated throughout — Phase H drops them. Phase C just stops writing to them (classify-permits, link-parcels, lifecycle classifier) and stops reading from them (compute-cost-estimates, compute-trade-forecasts, compute-opportunity-scores, update-tracked-projects, lead-detail-query, lead-inspect-query).

---

## Out of Scope (Explicitly Deferred to Phases D–H)

- **CoA-side lead_id backfill** — Phase D's classifiers (link-coa-to-parcels, classify-coa-trades, etc.) populate `lead_trades` / `lead_parcels` / cost_estimates / trade_forecasts / tracked_projects for CoA leads with `'coa:'` lead_ids.
- **`tracked_projects.lead_id` NOT NULL promotion** — deferred to Phase F (after CoA rows have lead_id).
- **CoA UNION source extension** to compute-trade-forecasts.js, compute-opportunity-scores.js, update-tracked-projects.js — Phase F.
- **Lifecycle engine bug 84-W12 fix + granular Universal Stream emission** — Phase E.
- **PRE-permit retirement** — Phase G.
- **Legacy column drop + alias drop** — Phase H.
- **`docs/reports/review_followups.md` deferred items #16-#34** (Phase B review deferrals) — addressed only if a Phase C reviewer surfaces them as in-scope; otherwise deferred to Phase H or later.

---

## R2 Triage Log (R2 review complete 2026-05-13 — 3 reviewers, 14 findings)

| # | Severity | Source | Finding | Decision |
|---|---|---|---|---|
| R2-1 | **CRIT** (FIXED) | Worktree (conf 97) | `lead_analytics.lead_key` format contradiction — plan claimed audit-done while flagging R0.7 as TBD | **R0.7 executed live**: lead_analytics is currently EMPTY (0 rows); no format mismatch to handle in Phase C. R0.7 results table added to plan. |
| R2-2 | **CRIT** (FIXED) | Worktree (conf 92) | 10+ `src/` readers of `permit_trades`/`permit_parcels` would see stale data after Phase C if writes swap; `get-lead-feed.ts` would silently drop new permits | **Design clarified to DUAL-WRITE**: C.4 + C.5 + C.8 rewritten — Phase C extends writes (doesn't swap). Per Spec 42 §6.11 Phase B note ("Old tables remain as live tables throughout Phase B and Phase C"). 10+ readers documented as NOT-IN-SCOPE. |
| R2-3 | HIGH (FIXED) | Worktree (conf 88) | `classify-lifecycle-phase.js` writes `permit_phase_transitions` (lines 740, 1008) but absent from ancillary writer audit | C.8 table now includes it with explicit "DEFER to Phase E" decision (lifecycle engine rekey is Phase E scope) |
| R2-4 | HIGH (FIXED) | Gemini | Migration 140 — UNIQUE on `tracked_projects` should be partial `WHERE lead_id IS NOT NULL` since CoA rows have NULL through Phase D | C.3 updated — migration 140 partial UNIQUE INDEX (also future-proof for Phase D CoA-side inserts) |
| R2-5 | HIGH (FIXED) | Gemini + DeepSeek | C.2 atomicity — backfill UPDATEs must run inside single `withTransaction` | C.2 explicitly states single withTransaction wraps all 4 table updates |
| R2-6 | HIGH (FIXED) | DeepSeek | Migration DO blocks only check NULLs, not duplicates — `CREATE UNIQUE INDEX` would fail downstream | C.3 now specifies two-stage DO-block pre-check (NULLs + duplicates) for migrations 138/139/141 |
| R2-7 | MED (FIXED) | Gemini | C.4.a wording "preferred for atomicity" is wrong — atomicity comes from transaction, not read source | C.4.a + C.5.a wording corrected — atomicity from `withTransaction`; reading `permits.lead_id` is preferred for *consistency/performance* |
| R2-8 | MED (DEFER) | DeepSeek | Deploy compatibility — old code + new schema race during merge | Single-commit-per-group cadence + dual-write semantics mitigate; explicit deploy-order note added to R5.3 (writers must land BEFORE consumers in C.5) |
| R2-9 | LOW (FIXED) | DeepSeek | `statement_timeout` may trip CONCURRENTLY UNIQUE INDEX on trade_forecasts | Migrations 138-141 set `SET LOCAL statement_timeout = '5min'` in prologue |
| R2-10 | NIT (FIXED) | Gemini | R5.4 test scaffolding less specific than other R5.X | C.5 test scaffolding section now explicitly names the 3 layers (logic + infra + db.test.ts) |
| R2-11 | UNVERIFIED→VERIFIED | DeepSeek | Row count assumptions (50K/200K/5K/10K) not queried | **R0.8 executed live**: actual counts 247K/654K/0/0. Plan updated — trade_forecasts is 3.3× my estimate; tracked_projects + lead_analytics are EMPTY |
| R2-12 | UNVERIFIED→VERIFIED | DeepSeek | Phase B substrate state (NULL counts, empty tables) not verified | **R0.9 executed live**: 0 NULL permit_num + 0 NULL revision_num + max len 2; substrate is clean |
| R2-13 | DEFER | Worktree | `deriveLeadId` over-width revision_num edge cases (e.g., '100') not explicitly in fixture matrix | Per R0.10 audit MAX(LENGTH(revision_num)) = 2 — over-width is not-currently-applicable; still tested in R5.1 fixture matrix for forward safety. DEFER. |
| R2-14 | DEFER | Worktree | `assert-global-coverage.js` + `assert-entity-tracing.js` will false-FAIL post-Phase-C if writes swap | **Resolved by R2-2 dual-write fix** — assert scripts continue to see populated legacy tables. Logged to followups regardless for future Phase G/H cleanup. |

**Verdict after triage:** All CRIT + HIGH BUGs resolved inline. MED/LOW/NIT findings either fixed or documented as DEFER with rationale.

---

> **PLAN LOCKED. Do you authorize this WF1 Phase C plan (R2.v2 revision, post-review)? (y/n)**
>
> **Scope:**
> - 5 NEW files (`lead-id.js` + `lead-id.ts` + `migrate-to-lead-id.js` + 5 migrations 138-142)
> - 6 script DUAL-WRITE extensions (4 in C.4 + 2 in C.5 read-side swaps + C.5.b/c writes); ~3,857 lines of pipeline code touched
> - 2 admin query rekeys (`lead-detail-query.ts` + `lead-inspect-query.ts`)
> - 4 ancillary writer extensions (`backfill-realtor-permit-trades`, `reclassify-all`, `seed-parcels`, `create-pre-permits`) bundled into R5.3
> - 1 ancillary writer EXPLICITLY DEFERRED to Phase E (`classify-lifecycle-phase.js`)
> - 10+ `src/` readers EXPLICITLY OUT-OF-SCOPE (preserved by dual-write semantics; migrated by post-Phase-G WF)
>
> **Execution sequence (6 commit groups):**
> 1. R5.1 — Shared `deriveLeadId` lib (TS↔JS dual-path parity)
> 2. R5.2 — One-shot backfill + 5 migrations 138-142 (single `withTransaction` + 2-stage pre-check)
> 3. R5.3 — Permit-side dual-write extensions (classify-permits + link-parcels + 4 ancillary)
> 4. R5.4 — Compute-pipeline rekeys (cost + forecast + opportunity → read `lead_trades`)
> 5. R5.5 — Tracked-projects rekey
> 6. R5.6 — Admin read-side query rekeys
>
> **Review cadence:** all 6 groups use full 3-reviewer per saved memory; final R8 cross-cutting on cumulative diff. BUG findings block next group.
>
> **DB integration test gating:** every Green Light runs `BUILDO_TEST_DB=1 npx vitest run src/tests/db` against fresh local Postgres. Per Phase B lesson, this catches the bug class CI surfaces.
>
> **R2 review summary:** 14 findings across Worktree + Gemini + DeepSeek; 11 fixed inline (2 CRIT + 4 HIGH + 1 MED + 1 NIT + 1 LOW + 2 UNVERIFIED→VERIFIED); 3 deferred (1 MED deploy compatibility + 1 DEFER over-width edge + 1 DEFER assert-script false-FAIL — resolved by dual-write).
>
> Phase B substrate stable. Phase C delivers the dual-write functional handover from `(permit_num, revision_num)` to `lead_id`. DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE awaiting authorization.
