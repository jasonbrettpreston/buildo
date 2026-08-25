# Active Task: WF3 #3 — Spec 79 §7a Pass-2.5, Finding K (CoA UNION arm in lead feed)
**Status:** Implementation (authorized 2026-05-20 — "proceed after task plan locked")
**Workflow:** WF3 (Fix)
**Domain Mode:** Cross-Domain — API route + types shared with Expo mobile app. Per CLAUDE.md, this requires reading `.claude/domain-crossdomain.md` (LOW-1 fold).
**Origin:** Spec 79 §7a per-lead Inspector spot-check, Finding K, CRIT, 2026-05-20.

## v2 Change-log (folds from Independent + DeepSeek plan-review)

| # | Reviewer | Severity | Fix in v2 |
|---|---|---|---|
| 1 | Indep CRIT-1 + DeepSeek #2 | CRIT | Add `mobile/src/lib/schemas.ts:94` (`LeadFeedCursorSchema`) to Step 7 scope — its `lead_type` enum also needs `'coa'` or CoA-page-boundary cursors crash the feed via Zod ErrorBoundary |
| 2 | Indep HIGH-1 + DeepSeek #1 | CRIT | Drop the invented `is_saveable` field. Replace with an env-var killswitch `LEAD_FEED_DISABLE_COA=1` defaulting to **DISABLED**. Mobile-card-readiness becomes the gate — flip the env var when mobile ships CoA cards |
| 3 | DeepSeek #3 | HIGH | Killswitch design above also closes the "rollback absent" finding. Document the rollback in the Plan |
| 4 | Indep HIGH-2 + DeepSeek #5 | HIGH | Scope `bid_value` to **CoA branch only** (per Spec 91 §3.5 5-bar UI). Permit-branch `bid_value` is a follow-up. §10 note added |
| 5 | Indep HIGH-3 | HIGH | Document `?sort=lifecycle_seq` deferral in Operating Boundaries (acceptable because mobile chip ships in a follow-up WF; relevance_score order is fine in the interim) |
| 6 | DeepSeek #6 | MED | Strike the wrong "Postgres short-circuit" claim. Correct fact: PG 12+ inlines simple CTEs; killswitch keeps the CTE entirely out of the SQL when disabled. Add `EXPLAIN ANALYZE` check to Step 10 |
| 7 | DeepSeek #7 | MED | Add 6 more logic tests: NULL `application_number`, NULL `neighbourhood_id`, multiple `trade_forecasts` per lead_id, wrong-`lead_type` lead_views ignored, CoA→builder boundary cursor, score-tie 3-way (permit+coa+builder) |
| 8 | Indep MED-2 | MED | Update `LeadFeedInput` in `types.ts` to add `lead_type` field |
| 9 | Indep MED-3 + DeepSeek #7 partial | MED | Add unhappy-path test: `POST /api/leads/view` with CoA lead_type returns 400 (documents the known gap until CoA write WF lands) |
| 10 | DeepSeek #8 | LOW | Add param-binding comment block at the top of `LEAD_FEED_SQL` listing all 10 `$N` params |
| 11 | DeepSeek #9 | LOW | Add test: `?lead_type=permit` still returns builder items (documents the Spec 71/91 axis distinction) |
| 12 | Indep LOW-2 | LOW | Three §10 notes (default-`all` choice, `bid_value` scope, killswitch default-disabled) |

## Context

* **Goal:** `/api/leads/feed` (`get-lead-feed.ts`) currently UNIONs only `permit_candidates` + `builder_candidates`. The DB now has 34,290 `coa:%` rows in `trade_forecasts` (WF3 #2 unblocked) and 380K+ rows in `coa_applications`, but **zero** of them surface in the mobile lead feed because there is no `coa_candidates` CTE. This violates Spec 91 §3 (`lead_type: 'permit' | 'coa' | 'realtor'`) and Spec 91 §3.1 (`?lead_type=coa|permit|all`). All CoA leads are invisible to mobile users.
* **Phased rollout:** This WF lands the **server-side** CoA arm + Zod parity + tests. Mobile **card components** (CoaLeadCard, save-button gating, 5-bar `bid_value` render) are explicitly the next WF. CoA visibility is gated by `LEAD_FEED_DISABLE_COA=1` env var, **defaulting to DISABLED** so production users see no behavior change until both halves are reviewed.
* **Target Spec(s):**
  - `docs/specs/03-mobile/91_mobile_lead_feed.md` §3 (Backend Contract), §3.1 (Lead-type filter), §3.5 (CoA card visual), §4.1 (PermitLeadCard fields)
  - `docs/specs/01-pipeline/42_chain_coa.md` §6.6.A.1 (canonical `coa:<application_number>` lead_id)
  - `docs/specs/01-pipeline/41_chain_permits.md` §F (CoA trade_forecasts UNION arm — already wired post WF3 #2)
  - `docs/specs/01-pipeline/79_pipeline_step_validation.md` §7a (per-lead Inspector spot-check protocol — origin of Finding K)
  - User-requested cross-checks: Spec 33 (admin protocol — N/A, no admin UI change), Spec 35 (N/A), Spec 41 (above), Spec 43 (N/A), Spec 47 (chain observability — already wired via `logRequestComplete`), Spec 48 (pipeline_observability — N/A; feed is request-path), Spec 51 (N/A)
* **Key Files:**
  - `src/features/leads/lib/get-lead-feed.ts` — `LEAD_FEED_SQL` + `LeadFeedRow` interface + `mapRow` + `getLeadFeed`
  - `src/features/leads/types.ts` — `LeadFeedItem` discriminated union + `LeadFeedInput`
  - `src/features/leads/api/schemas.ts` — `leadFeedQuerySchema` (`cursor_lead_type: z.enum(['permit', 'builder'])`)
  - `src/app/api/leads/feed/route.ts` — Zod parsing + `getLeadFeed` call + killswitch env-var read
  - `src/tests/get-lead-feed.logic.test.ts` — existing 75-test source-shape harness; will gain a `coa_candidates` block
  - `src/tests/api-leads-feed.infra.test.ts` (or new file) — infra-level integration tests for filter param + killswitch
  - `mobile/src/lib/schemas.ts` — **BOTH** `LeadFeedCursorSchema` + `LeadFeedItemSchema` (Cross-Domain parity — fold #1)

## Root Cause Diagnosis (DB-verified, 2026-05-20)

| Layer | State | Confirmed by |
|---|---|---|
| `trade_forecasts` CoA rows | **34,290** (post WF3 #2) | `SELECT count(*) FROM trade_forecasts WHERE lead_id LIKE 'coa:%'` |
| `coa_applications` rows | 380K+ | DB + Spec 91 §3.5 |
| `LEAD_FEED_SQL` UNION arms | 2 (`permit_candidates`, `builder_candidates`) | `get-lead-feed.ts:460-464` |
| `mapRow()` branches | 2 (permit, builder) | `get-lead-feed.ts:662-723` |
| Zod schema cursor enum | `['permit', 'builder']` — server + mobile both | `src/features/leads/api/schemas.ts:54` + `mobile/src/lib/schemas.ts:94` |

The fix is a **net-addition** — add a 3rd UNION arm + branch + Zod enum value on BOTH sides. No existing branch behavior changes.

## Technical Implementation

### New/Modified Components

| File | Change | Lines (approx) |
|---|---|---|
| `src/features/leads/lib/get-lead-feed.ts` | Add `coa_candidates` CTE + 3rd UNION ALL + mapRow CoA branch + `coa:` lead_views JOIN. **Conditionally injected** based on `disableCoa` flag — when disabled, the CoA CTE + UNION are omitted from the emitted SQL entirely (no perf cost, no rollback risk). Param-binding comment block at top (DeepSeek #8 fold). | +200 |
| `src/features/leads/types.ts` | Add `CoaLeadFeedItem` interface; expand `LeadFeedItem` union; expand `LeadFeedCursor.lead_type`; **add `LeadFeedInput.lead_type`** (Indep MED-2 fold) | +35 |
| `src/features/leads/api/schemas.ts` | Add `cursor_lead_type: z.enum(['permit', 'builder', 'coa'])`; add new `lead_type: z.enum(['permit', 'coa', 'all']).default('all')` filter | +10 |
| `src/app/api/leads/feed/route.ts` | Read `LEAD_FEED_DISABLE_COA` env-var; thread `lead_type` filter + `disableCoa` flag through to `getLeadFeed` | +8 |
| `src/tests/get-lead-feed.logic.test.ts` | New `describe('coa_candidates CTE — Spec 91 §3.1')` block — **~18 source-shape assertions** (fold #7: NULL app_num, NULL neighbourhood_id, multi-trade_forecasts, wrong-lead_type lead_views, CoA→builder boundary, 3-way tie, killswitch omits CTE, builder still appears under `lead_type=permit`) | +180 |
| `src/tests/api-leads-feed.infra.test.ts` (or new) | 6 unhappy-path: invalid `lead_type=foo`, mixed-type cursor cross, empty CoA partition, CoA cursor round-trip, killswitch on/off, **`POST /api/leads/view` with CoA lead_type returns 400** (Indep MED-3 fold) | +120 |
| `mobile/src/lib/schemas.ts` | `CoaLeadFeedItemSchema` + extend discriminated union + **extend `LeadFeedCursorSchema.lead_type` enum** (fold #1) | +40 |

### CoA payload shape (server emits, mobile parses)

```ts
interface CoaLeadFeedItem extends LeadFeedItemBase {
  lead_type: 'coa';
  lead_id: string;                  // 'coa:<application_number>'
  application_number: string;
  street_num: string | null;
  street_name: string | null;
  work_description: string | null;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  latitude: number | null;
  longitude: number | null;
  neighbourhood_name: string | null;
  estimated_cost: number | null;
  modeled_gfa_sqm: number | null;
  // CoA-specific scoring/signal — sourced from trade_forecasts (Phase F.1)
  bid_value: number | null;         // 0-1 probability — drives Spec 91 §3.5 5-bar render (CoA branch only — see §10)
  target_window: 'bid' | 'work' | null;
  predicted_start: string | null;   // ISO date
  // is_saved + competition_count are read-path (mig 070 CHECK blocks writes;
  // CoA save support is the next WF). Always false / 0 until then.
  // No is_saveable field (dropped in v2 — killswitch is the gate).
}
```

### Killswitch Design (fold #2 + #3)

* **Env var:** `LEAD_FEED_DISABLE_COA=1` → no CoA arm in SQL; `=0` or unset → CoA arm enabled.
* **Default:** `1` (DISABLED). Production sees zero behavior change. Operator/QA enables in dev/staging for testing, then flips in prod once mobile cards ship.
* **Implementation:** route.ts reads the env-var once per request (cheap); when `true`, calls `getLeadFeed` with `disableCoa: true` and the function emits SQL WITHOUT the CoA CTE entirely (string-concatenation gate at SQL build time — not a runtime predicate, so PG has nothing to optimize around).
* **Rollback:** `unset LEAD_FEED_DISABLE_COA` or set it to `1` — instant CoA suppression, no revert needed. Document in PR commit body.

### Cursor Pagination Semantics (Independent CRIT-1 fold details)

* Cursor tuple: `(relevance_score, lead_type, lead_id)`. `lead_type` enum gains `'coa'`. Within a score tie, ORDER BY DESC sorts `'permit' > 'coa' > 'builder'`. Stable.
* **Backward compat — pre-deploy cursors**: a client holding cursor `(50, 'permit', 'X:01')` still works because the tuple compare matches permit and builder rows correctly; new CoA rows fall in their own lex slot. No cursor versioning needed.
* **Forward compat — post-deploy cursors going to old clients**: a response containing `next_cursor: { lead_type: 'coa', ... }` would crash an old mobile client via Zod. Mitigation = killswitch DEFAULT DISABLED until mobile ships CoA support. When mobile ships, both halves go live together.
* **`cursor_lead_id` for CoA**: `coa:<application_number>` — no LPAD wrapping needed.

### `?lead_type=` Filter Param (Spec 91 §3.1)

* `lead_type: z.enum(['permit', 'coa', 'all']).default('all')`. `'builder'` is **not** a value (Spec 91 §3.1 only documents `permit | coa | all`).
* When killswitch is ON and `lead_type=coa` is requested → return empty data + log warning (don't 400 — preserves Spec 91 contract for forward-compat).
* SQL: pass `lead_type` as new param. Each non-CoA CTE's WHERE adds `AND $N::text <> 'coa'` (so `lead_type=permit` still returns builders per Spec 71 design — DeepSeek #9 fold).
* CoA CTE WHERE: `AND $N::text IN ('all', 'coa')`.

### Operating Boundaries

* **Target Files (modify):** `src/features/leads/lib/get-lead-feed.ts`, `src/features/leads/types.ts`, `src/features/leads/api/schemas.ts`, `src/app/api/leads/feed/route.ts`, `src/tests/get-lead-feed.logic.test.ts`, infra tests, `mobile/src/lib/schemas.ts` (BOTH cursor + item schemas).
* **Out-of-Scope (DO NOT TOUCH):** `src/features/leads/lib/record-lead-view.ts`, `src/app/api/leads/view/route.ts`, `src/lib/leads/lead-detail-query.ts`, `migrations/`, pipeline scripts, ALL `mobile/src/components/feed/*` files. CoA save support, mobile card UI, `?sort=lifecycle_seq` mode are separate follow-up WFs.
* **Cross-Spec Dependencies:** Spec 91 §3 + §3.1 contract; Spec 70/71 cursor semantics; Spec 42 §6.6.A.1 lead_id format.
* **Acknowledged spec deviations** (HIGH-3 fold):
  - `?sort=lifecycle_seq` + `?sort=lifecycle_seq_desc` per Spec 91 §3.1 lines 84-86 — **deferred**. Reason: only matters when the mobile CoA-only chip ships (Spec 91 §3.5), which is the next WF anyway. CoA-only mode in the interim uses `relevance_score DESC` ordering. No mobile UX breakage in this WF because the kill switch is default OFF.
  - `lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage` fields per Spec 91 §3 lines 63-64 — **deferred** for ALL branches per the spec's own note: "Nullable until Phase E classifier emission ships."

## Standards Compliance (§1–§9 of `docs/specs/00_engineering_standards.md`)

* **§1.1 Mobile-First UI:** N/A (backend changes; mobile schema parity is type-only).
* **§2.1 Unhappy Path Tests:** 6 unhappy-path infra tests including CoA-save 400 documenting the known mig-070 gap.
* **§2.2 Try-Catch Boundary:** existing route try/catch + `internalError()`. No new routes. `getLeadFeed` already throws on DB error.
* **§2.3 Assumption Documentation:** defensive narrowing in mapRow CoA branch matches the existing permit/builder pattern.
* **§4.2 Parameterization:** all new SQL uses `$N::type` parameter binding; no string concat of user input (the `disableCoa` flag is a SERVER-CONTROLLED env var, not user input — see fold #6 comment in the SQL builder).
* **§5.2 Test File Pattern:** new tests follow `*.logic.test.ts` (source-shape) + `*.infra.test.ts` (route-level).
* **§6.1 logError Mandate:** preserved at existing call site.
* **§7 Dual Code Path Safety:** the feed has no JS-side mirror script; the CoA shape mirrors the canonical `COA_LEAD_DETAIL_SQL` (Spec 42 §6.11 Phase C) — cited inline.

## Execution Plan

- [ ] **Step 1 — Red Light:** Add `describe('coa_candidates CTE — Spec 91 §3.1')` block to `get-lead-feed.logic.test.ts` with 18 assertions (fold #7). Add 6 infra-level assertions including CoA→view 400. Run — expect ALL new tests FAIL.
- [ ] **Step 2 — Types layer:** Add `CoaLeadFeedItem` to `types.ts`; extend `LeadFeedCursor.lead_type`; extend `LeadFeedItem` union; **add `LeadFeedInput.lead_type`** (Indep MED-2 fold). Typecheck.
- [ ] **Step 3 — Zod schemas (server):** Add `lead_type` filter + extend `cursor_lead_type` enum in `src/features/leads/api/schemas.ts`. Typecheck.
- [ ] **Step 4 — SQL builder:** Refactor `LEAD_FEED_SQL` from a const export to a `buildLeadFeedSql({ disableCoa })` function — when disabled, returns the current 2-arm SQL; when enabled, returns the 3-arm SQL with `coa_candidates`. Add param-binding comment block (DeepSeek #8 fold). Update `LeadFeedRow` interface for the widest shape.
- [ ] **Step 5 — mapRow CoA branch:** Add 3rd branch + defensive narrowing + `null + logWarn` return on malformed rows matching existing pattern.
- [ ] **Step 6 — Route:** Read `process.env.LEAD_FEED_DISABLE_COA` (default = '1' / disabled); thread `lead_type` filter + `disableCoa` flag into `getLeadFeed` input.
- [ ] **Step 7 — Mobile schema parity (Cross-Domain):** Add `CoaLeadFeedItemSchema` to `mobile/src/lib/schemas.ts` + extend BOTH the discriminated union AND `LeadFeedCursorSchema.lead_type` enum (Indep CRIT-1 fold).
- [ ] **Step 8 — Green Light:** `npm run typecheck` clean. `npm run test` 6370+ pass with new tests now passing.
- [ ] **Step 9 — Multi-Agent IMPL Review:** Independent + DeepSeek on the implementation diff. Fold CRIT/HIGH findings.
- [ ] **Step 10 — Live verification (with `EXPLAIN ANALYZE` per DeepSeek #6 fold):**
  - With killswitch DISABLED (default): confirm feed returns 0 CoA rows even when `lead_type=coa`; permit + builder behavior unchanged.
  - With killswitch ENABLED + `lead_type=all`: confirm CoA rows appear interleaved.
  - With killswitch ENABLED + `lead_type=permit`: builders still present, CoA absent.
  - Run `EXPLAIN ANALYZE` against a representative `lead_type=all` query; verify `coa_applications` uses index scans (not seq scan).
  - Confirm cursor round-trips across permit→coa and coa→builder boundaries.
- [ ] **Step 11 — Commit + push;** update `wf3-queue.md` row K → ✅ CLOSED; file IMPL-review deferrals to `review_followups.md`.

## §10 Plan Compliance Notes (three non-obvious choices)

1. **`?lead_type` filter default = `'all'`** per Spec 91 §3.1 (rather than phased `'permit'` default). Mitigated by the killswitch — when killswitch is DISABLED-by-default in this WF, `lead_type=all` effectively means "permit + builder" because no CoA rows enter the SQL. So spec-compliance lands without the visibility step-change.
2. **`bid_value` scope = CoA branch only** in this WF. Spec 91 §3 lists it as a universal contract field, but Spec 91 §3.5 only documents the 5-bar UI for CoA cards. Permit-branch `bid_value` is a follow-up WF (covers Finding H — naming clarity).
3. **`LEAD_FEED_DISABLE_COA` defaults to DISABLED**. Reason: mobile card components are explicitly out-of-scope here, so until mobile ships CoA cards, exposing `lead_type='coa'` items would crash the mobile feed via card-renderer fallthrough. Killswitch flips ON when the next WF ships mobile cards.

> **PLAN LOCKED v2 (post 2-reviewer fold). Do you authorize this WF3 plan? (y/n)**
>
> 2 plan-review rounds: Independent PASS-WITH-FOLDS (3 CRIT/HIGH + 4 MED/LOW). DeepSeek APPROVE WITH CHANGES (3 CRIT/HIGH + 6 MED/LOW). All 9 unique critical/high findings folded into v2. Two convergent CRITs (mobile cursor schema + save-tap broken) both addressed.
