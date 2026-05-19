# Active Task: WF1 Phase G — PRE-permit retirement (v2.1 PLAN LOCKED)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline
**Workflow:** WF1 (new behavior) — per Spec 42 §6.11 row "Phase G"

---

## Plan revision history
* **v1** — initial plan; ran 4-reviewer round (Gemini bash + DeepSeek bash + Independent worktree + Observability worktree). 5 CRIT + 7 HIGH + 5 MED.
* **v2** — folded v1 findings + 4 user design decisions (Q1=all-5-children, Q2=both-audits, Q3=partial-cost-map, Q4=defer-hidden-consumers).
* **v2.1 (this revision)** — folded the v2 4-reviewer round findings (12 substantive fold-ins). Net delta from v2 mostly clarifications + 1 added child table (`permit_phase_transitions`) + 1 added emitMeta column fix (`tracked_projects: ['lead_id']`) + 1 verdict refinement (no-op runs emit `SKIP`).

---

## Context
* **Goal:** Retire the speculative PRE-permit lead mechanism per Spec 42 §6.11 row "Phase G". Convert `scripts/create-pre-permits.js` to a one-shot idempotent DELETE shim covering all 5 affected child tables; retire its paired `scripts/quality/assert-pre-permit-aging.js`; add `permit_type='Pre-Permit' count = 0` gates to BOTH the CoA-chain and permits-chain audit tables in `assert-data-bounds.js`; switch the mobile lead-detail query to read CoA leads directly via `lead_id LIKE 'coa:%'` (replacing the 404 currently returned per Spec 91 §4.3.1 line 170); amend Spec 49 + `assert-global-coverage.js` to drop vestigial coverage rows.

* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.11 row "Phase G" + §6.11.1 Per-Phase Execution References.

* **User design choices (v1 + v2 triage, settled):**
  - **v1-Q1 = Bundle** — `assert-pre-permit-aging.js` retired in this WF (paired mechanism).
  - **v1-Q2 = Amend** — Spec 49 §4 + `assert-global-coverage.js` rows for Permits Step 17 / CoA Step 5 / CoA Step 6 removed.
  - **v1-Q3 = Two-commit cutover** — Commit 1 = shims + audits + lead-detail CoA branch + spec amendments (shims STAY in manifest); chain run wipes Pre-Permits; Commit 2 = manifest removal + `git rm` shim files. Both within Phase G WF1.
  - **v2-Q1 = Explicit DELETEs for ALL 5 child tables** — `lead_trades` + `lead_parcels` (Phase C trigger dual-write artifacts) AND `tracked_projects` + `permit_history` + `permit_products` (CASCADE FK children) — explicit deletes inside the shim transaction. No reliance on CASCADE semantics.
  - **v2-Q2 = Both audits** — count=0 gate added to BOTH `permitsAuditTable` AND `coaAuditTable` in `assert-data-bounds.js`.
  - **v2-Q3 = Partial CoA cost map** — `cost: { estimated: coa.estimated_cost, tier: null, range_low: null, range_high: null, modeled_gfa_sqm: coa.modeled_gfa_sqm }`. Mobile UI handles per-field nullability.
  - **v2-Q4 = Defer hidden consumers to Phase G.1** — 7 `src/` consumers (FilterPanel, FreshnessTimeline, /api/permits/route.ts `?source=pre_permits`, /api/permits/[id]/route.ts CoA branch, dashboard stat card, /api/admin/pipelines registry, /api/admin/control-panel/resync allowlist) documented in Operating Boundaries; not modified by Phase G.

## Key files

### Scripts (modified — Commit 1)
* `scripts/create-pre-permits.js` — convert INSERT + UPDATE-expiry + DELETE-ghosts (~212 lines, 3 ops) → idempotent DELETE-only shim:
  ```js
  // single withTransaction block, child tables first:
  DELETE FROM lead_trades              WHERE lead_id LIKE 'permit:PRE-%';   -- Phase C trigger dual-write
  DELETE FROM lead_parcels             WHERE lead_id LIKE 'permit:PRE-%';   -- Phase C trigger dual-write
  DELETE FROM tracked_projects         WHERE lead_id LIKE 'permit:PRE-%';   -- v2.1: rekeyed by Phase C — use lead_id, not (permit_num, revision_num)
  DELETE FROM permit_history           WHERE permit_num LIKE 'PRE-%';       -- CASCADE; explicit for observability
  DELETE FROM permit_products          WHERE permit_num LIKE 'PRE-%';       -- CASCADE; explicit for observability
  DELETE FROM permit_phase_transitions WHERE permit_num LIKE 'PRE-%';       -- v2.1 (Indep v2 H1): CASCADE; added for v2-Q1 consistency
  DELETE FROM lifecycle_transitions    WHERE lead_id LIKE 'permit:PRE-%';   -- v2.1 (Indep v2 H3): no FK; Phase E may have written rows
  DELETE FROM permit_trades            WHERE permit_num LIKE 'PRE-%';       -- RESTRICT FK; must precede parent
  DELETE FROM permit_parcels           WHERE permit_num LIKE 'PRE-%';       -- RESTRICT FK; must precede parent
  DELETE FROM permits                  WHERE permit_type='Pre-Permit';      -- parent; commit gate
  ```
  - **DELETE criterion (canonical, per Gemini HIGH-3 / DeepSeek HIGH-2):** parent uses `permit_type='Pre-Permit'` (literal). Child tables filter on either `permit_num LIKE 'PRE-%'` (permit_*-keyed) or `lead_id LIKE 'permit:PRE-%'` (lead_*-keyed, Phase C dual-write).
  - Advisory lock id preserved (100).
  - **emitSummary** (per purge-lead-views.js precedent + Observability C1 + v2.1 Obs Issue 7):
    - `records_total = preDeleteCount` (Pre-Permit COUNT before DELETE; subject of step per Spec 47 §11.1)
    - `records_new = 0`, `records_updated = 0`
    - Per-table deleted counts via `result.rowCount` (NOT separate SELECTs — v2.1 Gemini M1 clarification; keeps emitMeta reads minimal)
    - **`verdict` is conditional (v2.1 Obs Issue 7):** `verdict = preDeleteCount === 0 ? 'SKIP' : 'PASS'` — first run with N>0 deletions = PASS; subsequent no-op runs = SKIP. Distinguishes "cleanup ran successfully" from "cleanup already complete; no-op."
    - `audit_table.rows` (10 entries — 2.1 added permit_phase_transitions + lifecycle_transitions):
    ```js
    [
      { metric: 'pre_permits_deleted',                value: permitsDeleted,             threshold: null, status: 'PASS' },
      { metric: 'pre_permit_trades_deleted',          value: tradesDeleted,              threshold: null, status: 'PASS' },
      { metric: 'pre_permit_parcels_deleted',         value: parcelsDeleted,             threshold: null, status: 'PASS' },
      { metric: 'pre_lead_trades_deleted',            value: leadTradesDeleted,          threshold: null, status: 'PASS' },
      { metric: 'pre_lead_parcels_deleted',           value: leadParcelsDeleted,         threshold: null, status: 'PASS' },
      { metric: 'pre_tracked_projects_deleted',       value: trackedProjectsDeleted,     threshold: null, status: 'PASS' },
      { metric: 'pre_permit_history_deleted',         value: permitHistoryDeleted,       threshold: null, status: 'PASS' },
      { metric: 'pre_permit_products_deleted',        value: permitProductsDeleted,      threshold: null, status: 'PASS' },
      { metric: 'pre_permit_phase_transitions_deleted', value: permitPhaseTransitionsDeleted, threshold: null, status: 'PASS' },
      { metric: 'pre_lifecycle_transitions_deleted',  value: lifecycleTransitionsDeleted, threshold: null, status: 'PASS' },
    ]
    ```
  - **emitMeta** (Spec 47 §R11, per Observability H2 + v2.1 Obs Fold 4 fix):
    ```js
    pipeline.emitMeta(
      { permits: ['permit_num', 'permit_type'] },  // pre-count read; other tables use DELETE...result.rowCount (no read)
      { permits:                  ['permit_num','permit_type'],
        permit_trades:            ['permit_num','revision_num'],
        permit_parcels:           ['permit_num','revision_num'],
        lead_trades:              ['lead_id'],
        lead_parcels:             ['lead_id'],
        tracked_projects:         ['lead_id'],            // v2.1: rekeyed by Phase C (not permit_num/revision_num)
        permit_history:           ['permit_num','revision_num'],
        permit_products:          ['permit_num','revision_num'],
        permit_phase_transitions: ['permit_num','revision_num'],  // v2.1: added (Indep H1)
        lifecycle_transitions:    ['lead_id'],                    // v2.1: added (Indep H3)
      },
    );
    ```
  - **audit_table.verdict:** `'PASS'` (destructive op succeeded). The `name` field changes from "PRE-Permit Pipeline" → "PRE-Permit Retirement Shim (Phase G)".

* `scripts/quality/assert-pre-permit-aging.js` — convert to no-op shim:
  ```js
  pipeline.emitSummary({
    records_total: 0, records_new: 0, records_updated: 0,
    records_meta: { audit_table: {
      name: 'assert-pre-permit-aging (RETIRED)',
      verdict: 'SKIP',  // per Observability H1 + compute-cost-estimates.js precedent — distinguishes retired no-op from successful assertion
      rows: [{ metric: 'retired', value: 'Phase G', threshold: null, status: 'SKIP' }],
    } },
  });
  pipeline.emitMeta({}, {});  // no reads, no writes
  ```
  Preserves advisory lock + manifest hookup until Commit 2.

* `scripts/quality/assert-data-bounds.js` — add `permit_type='Pre-Permit' count = 0` row to **BOTH** `permitsAuditTable` AND `coaAuditTable` (defense-in-depth per v2-Q2). **v2.1 implementation clarification (Indep H2 + Obs Issue 9):** the file has disjoint `if (runPermitChecks)` (line 93) and `if (runCoaChecks)` (line 216) guards, so the count query is duplicated INSIDE each block (2 sub-ms COUNT queries, no perf cost). Same row shape added to each block's row array:
  ```js
  // INSIDE if (runPermitChecks) block, before permitsAuditTable construction:
  const prePermitCountForPermits = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits WHERE permit_type='Pre-Permit'`,
  );
  permitAuditRows.push({
    metric: 'permits_pre_permit_count',
    value: prePermitCountForPermits.rows[0].n,
    threshold: '== 0',
    status: prePermitCountForPermits.rows[0].n > 0 ? 'FAIL' : 'PASS',
  });
  // ...identical block inside if (runCoaChecks) pushing into coaAuditRows.
  ```

* `scripts/quality/assert-global-coverage.js` — remove three CoverageRow entries:
  - Permits Step 17 `create_pre_permits` (line ~165 — `permits.pre_permit_leads` row)
  - CoA Step 5 `create_pre_permits` (line ~169)
  - CoA Step 6 `assert_pre_permit_aging` (line ~170)

* `scripts/manifest.json` (**Commit 2 only**) — at actual indices (per Independent HIGH-1 substrate verification):
  - `chains.coa` — remove `create_pre_permits` at **index 4** + `assert_pre_permit_aging` at **index 5** (NOT 8/9 as v1 claimed)
  - `chains.permits` — remove `create_pre_permits` at index 17

### Source (modified — Commit 1)
* `src/lib/leads/lead-detail-query.ts` — add CoA branch:
  - When `parseLeadId(id)` returns `{kind:'coa', application_number}`, run a `coa_applications` query (LEFT JOIN `neighbourhoods` on parcel_id) + LATERAL subquery for `is_saved`.
  - Populate `LeadDetail` (interface in `src/app/api/leads/detail/[id]/types.ts` — already supports `permit_num: null, revision_num: null, lead_type: 'coa'`; mobile Zod schema in `mobile/src/lib/schemas.ts:176-194` matches).
  - **Cost mapping (v2-Q3 partial map):**
    ```ts
    cost: coa.estimated_cost == null && coa.modeled_gfa_sqm == null
      ? null
      : { estimated: coa.estimated_cost, tier: null, range_low: null, range_high: null, modeled_gfa_sqm: coa.modeled_gfa_sqm },
    ```
  - **`is_saved` LATERAL subquery (per DeepSeek LOW-8 + v2.1 Indep M2 alias fix to match existing permit-side `AS saved` convention):**
    ```sql
    LEFT JOIN LATERAL (
      SELECT EXISTS(
        SELECT 1 FROM lead_views lv
         WHERE lv.lead_id = 'coa:' || ca.application_number
           AND lv.user_id = $2  -- ctx.uid
           AND lv.saved = true
      ) AS saved          -- v2.1: alias matches existing permit-side convention; mapper reads `row.saved`
    ) saved_self ON TRUE
    ```
  - **CoA row interface** declares `saved: boolean` (NOT `is_saved`); the outer `toLeadDetail()` mapper reads `row.saved` and assigns to `LeadDetail.is_saved` — same convention as the permit-side branch.
  - **`competition_count` LATERAL subquery** mirrors the permit-side pattern keyed on `lead_views.lead_id = 'coa:' || ca.application_number`.
  - **URL→DB lead_id translation (per v2.1 DeepSeek H3):** `parseLeadId` returns `{ kind: 'coa', application_number }` (already implemented). The CoA branch in `lead-detail-query.ts` constructs the DB-canonical `coa:${application_number}` at the SQL-parameter boundary — explicit construction at one site, not assumed.
  - **NULL handling for forecast fields (per v2.1 DeepSeek H2):** `trade_forecasts` may not have CoA rows (Phase F.1 enabled CoA forecasts but pipeline state at Phase G commit is uncertain). The CoA branch uses `LEFT JOIN trade_forecasts ON tf.lead_id = 'coa:' || ca.application_number` so missing rows → NULL fields. `LeadDetail` schema already permits null for `target_window`, `opportunity_score`, `predicted_start`, `p25_days`, `p75_days` — no schema change.
  - Other field mappings: `lead_type='coa'`, `permit_num=null`, `revision_num=null`, `address` composed from `ca.address`, `location` from `coa_applications.latitude/longitude`, `target_window/opportunity_score/predicted_start/p25_days/p75_days` from `trade_forecasts WHERE lead_id = 'coa:' || ca.application_number`, `neighbourhood` from joined row, `lifecycle_phase/lifecycle_stalled` from `coa_applications` (mig 133).

### Specs (amended — Commit 1)
* `docs/specs/01-pipeline/42_chain_coa.md` §6.11 row "Phase G" — DELIVERED marker with `[G-COMMIT-1]` + `[G-COMMIT-2]` placeholders.
* `docs/specs/01-pipeline/41_chain_permits.md` — manifest step list (drop step 18 `create_pre_permits`).
* `docs/specs/01-pipeline/49_data_completeness_profiling.md`:
  - §2 — update step-count descriptions: permits chain now ends at step 26 (was 27); CoA chain at step 10 (was 12). (Per Observability M2.)
  - §4 — strike Permits Step 17 (line 123), CoA Step 5 (line 153), CoA Step 6 (line 154) rows. Update §4 leading sentence (line 87) — change "All permit-based denominators exclude PRE-% synthetic permits: `permit_num NOT LIKE 'PRE-%'`" → "Phase G retired PRE-% synthetic permits; the `permit_num NOT LIKE 'PRE-%'` clauses preserved below are vestigial defense-in-depth." (Per Independent MED-1.) Add "Phase G amendment (commit `[G-COMMIT-1]`)" note.
* `docs/specs/03-mobile/91_mobile_lead_feed.md` §4.3.1 — line 170: replace `"404 NOT_FOUND (no permit row, or CoA — currently unimplemented)"` with `"404 NOT_FOUND (no permit OR CoA row)"`.

### Tests (Commit 1)
* **NEW** `src/tests/create-pre-permits.shim.infra.test.ts`:
  1. First run with seeded Pre-Permit data DELETEs all PRE-% rows from all 10 tables in one transaction; `verdict='PASS'`.
  2. Second run is a clean no-op (all `*_deleted` counts = 0); **`verdict='SKIP'`** per v2.1 Obs Issue 7 fold.
  3. Advisory lock 100 preserved + advisory-lock-held emits skip per Spec 47 §R5 (per DeepSeek MED-3).
  4. emitSummary `records_total = preCount` (NOT deleted_count); `records_new = records_updated = 0`.
  5. emitMeta lists all 10 write tables + the 1 read table; `tracked_projects` writes key is `['lead_id']` (NOT `['permit_num','revision_num']`) per v2.1 Obs Fold 4.
  6. audit_table includes 10 per-table-count rows (v2.1 added `permit_phase_transitions` + `lifecycle_transitions`).
* **NEW** `src/tests/assert-pre-permit-aging.shim.infra.test.ts`:
  1. emitSummary `records_total = 0`; no DB writes; advisory lock preserved.
  2. audit_table.verdict='SKIP' (NOT 'PASS' per Observability H1).
  3. 1 INFO/SKIP row `{ metric: 'retired' }`.
* **NEW** `src/tests/lead-detail-query.coa.infra.test.ts`:
  1. `coa:APP-NUM` returns 200 + valid LeadDetail envelope with `lead_type='coa'`, `permit_num=null`, `revision_num=null`.
  2. Missing application_number returns null (route maps to 404).
  3. `cost` envelope has `tier/range_low/range_high = null`, `estimated/modeled_gfa_sqm` populated from `coa_applications`.
  4. `is_saved` LATERAL scoped to viewer uid (saved=true for viewer; false for other users).
* **DELETE** `src/tests/pre-permit-aging.infra.test.ts` — file no longer applicable; regression-lock assertions on `logicVars.pre_permit_expiry_months` consumption are inapplicable to the no-op shim. (Decision locked at planning per DeepSeek MED-6 — no Red-Light surprise.)
* **UPDATE** `src/tests/quality.infra.test.ts` — explicit split (per v2.1 DeepSeek M2):
  - **Commit 1:** keep file-existence assertion on `scripts/quality/assert-pre-permit-aging.js` (script stays on disk as shim).
  - **Commit 2:** remove the file-existence assertion (script `git rm`'d).
  - **Either commit:** remove any behavior-output assertion that expected the pre-shim verdict/records_total shape — the shim emits `verdict='SKIP'` + `records_total=0` now.
* **UPDATE** `src/tests/chain.logic.test.ts` — step-count assertions for CoA and permits chains need adjustment for Commit 2. Commit 1: no test change (manifest unchanged). Commit 2: update expected step counts. (Per Independent HIGH-4.)
* **UPDATE** `src/tests/assert-global-coverage.infra.test.ts` — remove assertions on the 3 deleted CoverageRow entries (Permits Step 17 / CoA Step 5 / CoA Step 6). (Per Independent MED-4.)

### Operating Boundaries

* **Target files** (above)
* **Out-of-scope (deferred to Phase G.1 follow-up WF2 per v2-Q4):**
  - `src/components/search/FilterPanel.tsx` — "Pre-Permits (Upcoming)" filter button (graceful degradation — returns empty list)
  - `src/components/FreshnessTimeline.tsx` — references `create_pre_permits` + `assert_pre_permit_aging` slugs for pipeline timeline display (will show stale entries post-Commit 2)
  - `src/app/api/permits/route.ts` lines 11-34 — `?source=pre_permits` branch → `getUpcomingLeads()` (returns empty post-retirement)
  - `src/app/api/permits/[id]/route.ts` lines 36/66/92 — `COA-` prefixed permit IDs via `mapCoaToPermitDto()` (separate from mobile contract)
  - `src/app/dashboard/page.tsx` line 72 — "Upcoming Pre-Permits" stat card (shows 0 post-retirement)
  - `src/app/api/admin/pipelines/[slug]/route.ts` lines 44/52 — admin manual-trigger registry (operator could still click "Run" on retired scripts; benign)
  - `src/app/api/admin/control-panel/resync/route.ts` line 31 — resync allowlist
  - `src/lib/coa/pre-permits.ts` — helper module (no DB read; pure logic; consumed by FilterPanel branch)
* **Other out-of-scope (deferred to even later cleanup):**
  - `scripts/link-coa.js` 9 `permit_type != 'Pre-Permit'` exclusion clauses — vestigial filters, harmless
  - `migrations/120_permit_type_classifications.sql` seed row for `'Pre-Permit'` — harmless reference data
  - Spec 49 §4 `permit_num NOT LIKE 'PRE-%'` filters in remaining rows — vestigial defense-in-depth
* **Cross-Spec Dependencies:**
  - **Relies on:** Spec 47 §R protocol (advisory lock, withTransaction, emitSummary/emitMeta), Spec 47 §10 (one-shot migration safety), Spec 48 §3.5 (audit_table verdict conventions, SKIP for retirement), Spec 91 §4.3.1 (LeadDetail envelope)
  - **Consumed by:** Spec 49 (coverage profile — Phase G removes its references)
  - **Touches:** Spec 41 manifest step listing, Spec 42 Phase G amendment row, Spec 91 §4.3.1 caveat removal

## Technical Implementation
* **DB Impact:** YES — destructive DELETEs across 8 tables. Single transaction. Idempotent (re-running on empty table = 0 deletes, no error). No schema/DDL changes; no new migrations.
* **Cutover sequence (single WF, two commits):**
  - **Commit 1:** all 7 modified files + all spec amendments + all new/updated tests. Shims STAY in manifest so the next chain run wipes Pre-Permits. The DELETE shim is itself idempotent so repeated chain runs are safe.
  - **Verification (between commits, during Green Light) — single canonical method (v2.1 Gemini M2 + Indep M2):**
    - **Step 1:** Create `scripts/test-helpers/seed-pre-permits.mjs` (gitignored one-off helper; not in scope for ship-able tests but committed for repeatability). The helper INSERTs 5 Pre-Permit rows across all 10 tables matching the production data shape.
    - **Step 2:** Run the seeder: `node scripts/test-helpers/seed-pre-permits.mjs` (against `BUILDO_TEST_DB`). Verify `SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'` returns 5.
    - **Step 3:** Run the new shim: `BUILDO_TEST_DB=1 node scripts/run-chain.js coa`. Verify all 10 audit-row deleted-counts > 0; verdict=`PASS`.
    - **Step 4:** Re-run the shim. Verify all counts = 0; verdict=`SKIP`.
    - **Step 5:** `EXPLAIN ANALYZE` the lead-detail CoA query (per v2.1 Gemini H3) — confirm `coa_applications` lookup uses the `application_number` UNIQUE index (mig 009); `lead_views` lookup uses an existing index on `lead_id`.
  - **Commit 2:** manifest-only diff (`scripts/manifest.json`) + `git rm scripts/create-pre-permits.js scripts/quality/assert-pre-permit-aging.js` per Gemini MED-6. Update `chain.logic.test.ts` step-count assertions in same commit.

## Standards Compliance
* **Try-Catch Boundary:** `pipeline.run` wraps both shim scripts; pool errors auto-handled. lead-detail-query CoA branch piggy-backs on the route handler's existing catch boundary.
* **Unhappy Path Tests:** zero-row DELETE (idempotency), CoA `application_number` not in DB (404 mapping), CoA cost fields all null (partial-map nullability).
* **logError Mandate:** N/A — scripts use `pipeline.log.warn/info/error`. lead-detail-query CoA branch inherits route handler's error mapping.
* **UI Layout:** N/A — backend-only.
* **Idempotency (Spec 47 §R12):** explicit second-run no-op test; advisory-lock-held emits skip per Spec 47 §R5.
* **No new migrations** — DML-only retirement.

## Execution Plan (WF1 steps verbatim)

- [ ] **Contract Definition:** N/A — no new API route. Existing `LeadDetail` interface + mobile Zod schema both already permit CoA shape (`permit_num`, `revision_num` nullable; `lead_type` enum includes `'coa'`).
- [ ] **Spec & Registry Sync:** Amend Spec 42 §6.11 Phase G + Spec 41 step list + Spec 49 §2/§4 + Spec 91 §4.3.1 line 170. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB schema change.
- [ ] **Test Scaffolding:** 3 NEW + 3 UPDATE + 1 DELETE (per Key Files → Tests).
- [ ] **Red Light:** `npx vitest run` on the 3 new test files — must fail.
- [ ] **Implementation:** edit the 5 script/source files + spec amendments. Single Commit 1.
- [ ] **Auth Boundary & Secrets:** N/A — backend-only. CoA branch inherits existing mobile auth.
- [ ] **Pre-Review Self-Checklist:** generate ~10 items post-implementation (sketch below).
- [ ] **Multi-Agent Review (diff-stage 4-reviewer round):**
  - Gemini bash on `scripts/create-pre-permits.js` + `src/lib/leads/lead-detail-query.ts`
  - DeepSeek bash on `scripts/quality/assert-data-bounds.js` + spec amendments
  - Independent worktree on full diff (vs Spec 42 §6.11 + Spec 47 + Spec 91)
  - Observability worktree on emitSummary/emitMeta/audit_table conventions across both shims
- [ ] **Triage:** Fold BUGs; defer items → `docs/reports/review_followups.md`.
- [ ] **Green Light:** `npm run test && npm run typecheck && npm run lint -- --fix`. Paste evidence.
- [ ] **WF6 close-out:** Commit 1 → verification chain run → Commit 2 → docs follow-up filling `[G-COMMIT-1]` + `[G-COMMIT-2]` placeholders.

## Pre-Review Self-Checklist (v2.1 — generate full list post-implementation)
1. DELETE shim FK ordering — all 9 child tables (`lead_trades`, `lead_parcels`, `tracked_projects`, `permit_history`, `permit_products`, `permit_phase_transitions`, `lifecycle_transitions`, `permit_trades`, `permit_parcels`) DELETEd BEFORE parent `permits`?
2. emitSummary `records_total = preDeleteCount` (NOT deleted_count); per purge-lead-views.js §11.1 convention?
3. emitMeta lists 10 write tables + 1 read table; `tracked_projects` key is `['lead_id']` not `['permit_num','revision_num']`?
4. assert-data-bounds.js count=0 gate added inside BOTH `if (runPermitChecks)` AND `if (runCoaChecks)` blocks (two duplicated queries, NOT shared)?
5. create-pre-permits.js shim emits `verdict='PASS'` when `preDeleteCount > 0`, `verdict='SKIP'` when `preDeleteCount === 0`?
6. assert-pre-permit-aging.js shim emits `verdict='SKIP'` (not PASS)?
7. lead-detail-query CoA branch's `cost` envelope returns null when both `estimated_cost` AND `modeled_gfa_sqm` are null; populated object otherwise (asymmetric ok per v2-Q3)?
8. `is_saved` LATERAL uses `AS saved` (not `AS is_saved`); CoA row interface declares `saved: boolean`; outer mapper assigns `is_saved: row.saved` matching permit-side convention?
9. URL→DB lead_id translation: `parseLeadId` returns `{ kind: 'coa', application_number }`; CoA branch constructs `coa:${application_number}` at the SQL parameter site (single conversion point)?
10. Spec 49 §2 step-count descriptions updated (permits 26, CoA 10)?
11. Spec 49 §4 leading sentence updated to mark `NOT LIKE 'PRE-%'` filters as vestigial?
12. assert-global-coverage.infra.test.ts updated to NOT expect the 3 deleted rows?
13. EXPLAIN ANALYZE on CoA lead-detail query verifies index use (mig 009 application_number UNIQUE + lead_views index on lead_id)?

---

> **PLAN LOCKED v2.1. Do you authorize this WF1 plan? (y/n)**
> §10 compliance: All applicable Plan Compliance items addressed. Hidden consumers (7 files including `FreshnessTimeline.tsx` `PIPELINE_CHAINS` array, per v2.1 Obs Issue 12) explicitly deferred to Phase G.1 per v2-Q4 user authorization.
> v2→v2.1 delta summary: 12 fold-ins (1 missed child table `permit_phase_transitions` + 1 added `lifecycle_transitions` defensive delete, 1 emitMeta column fix for `tracked_projects`, 1 verdict refinement for no-op runs, 1 LATERAL alias fix `AS saved`, 4 implementation clarifications [emitMeta-via-rowCount / verification-seed-helper / quality-test-split / URL-to-DB-translation], 3 documentation refinements). No new design decisions; all flow from second-order findings of the v2 reviewer round.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
