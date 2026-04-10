# Active Task: Lead Feed Health 3 bugs — test feed error, timing semantics, expanded readiness
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `c669f46c` (c669f46c88dfe864ba53f803aa62188902d52ee8)

## Context
Three user-reported bugs on `/admin/lead-feed`:

1. **Test Feed tool fails** with `[object Object]` error when the Run Test button is pressed.
2. **Timing Calibration card confusing:** "4 permit types calibrated" — user asks what this means and how many actual permits/leads get accurate timing from it.
3. **Lead feed readiness is incomplete** — not all scoring pillar inputs are surfaced. User wants a comprehensive review of all inputs into the feed and all of them displayed in the admin.

* **Target Specs:**
  - `docs/specs/product/admin/76_lead_feed_health_dashboard.md` (dashboard contract)
  - `docs/specs/product/future/70_lead_feed.md` §Implementation (feed SQL + score pillars)
  - `docs/specs/product/future/71_lead_timing_engine.md` (timing 3-tier engine)
  - `docs/specs/product/future/72_lead_cost_model.md` (cost model inputs)

* **Key Files:**
  - `src/components/LeadFeedHealthDashboard.tsx` — error display bug + readiness UI
  - `src/app/api/admin/leads/test-feed/route.ts` — returns structured `{error:{code,message}}` object
  - `src/lib/admin/lead-feed-health.ts` — `getLeadFeedReadiness`, `getCostCoverage`, etc.
  - `src/app/api/admin/leads/health/route.ts` — aggregation endpoint
  - `src/features/leads/lib/get-lead-feed.ts` — the actual feed SQL (reference only, not modified)

## Root Cause Analysis (completed during investigation)

### Bug 1 — Test Feed `[object Object]` Error (TWO distinct causes)

**1A — Server-side crash:** Migration `067_permits_location_geom.sql` has NEVER been applied to the local DB. The permits table has no `location` (PostGIS geography) column. The feed SQL in `get-lead-feed.ts:135,234,301,304-311,408` queries `p.location::geography` everywhere, so `getLeadFeed()` throws `column "p.location" does not exist`. The endpoint catches it and returns:
```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Feed query failed" } }
```

**1B — Client can't render structured errors:** `LeadFeedHealthDashboard.tsx:135-136`:
```ts
const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
throw new Error(body.error || `HTTP ${res.status}`);
```
When `body.error` is an object `{code, message, details?}`, passing it to `new Error()` stringifies it as `"[object Object]"`. Same issue would happen for a 400 validation error. The health endpoint uses a different envelope (`{error: "string"}`) so it works by accident.

**Additional migrations NOT applied** (discovered during investigation):
- `067_permits_location_geom.sql` — PostGIS Point column + trigger (CRITICAL — blocks feed)
- `072_inspection_stage_map.sql` — seed data table for Tier 1 timing engine
- `075_user_profiles.sql` — for user auth/profile

Migrations 068, 070, 071, 073, 074, 076, 077, 078, 079, 080, 081 ARE applied (confirmed via `\d` inspections). This is a partial-apply state — not all migrations ran on this DB. The migration runner has no tracking table.

### Bug 2 — "4 permit types calibrated" is uninformative

The `timing_calibration` table stores per-permit_type percentile statistics (one row per permit_type). "4 permit types calibrated" means 4 distinct `permit_type` values have rows in the table. What the user actually needs to know:

1. **How many active permits does this calibration cover?** i.e., `COUNT(*) FROM permits WHERE permit_type IN (SELECT permit_type FROM timing_calibration)` scoped to active/feed-eligible permits.
2. **What fraction of feed-eligible permits get accurate timing from the calibration?**

**BUT IMPORTANT ARCHITECTURAL CLARIFICATION:** The timing_calibration table is NOT used by the feed SQL. The feed uses a SQL proxy based on `permit_trades.phase` (see `get-lead-feed.ts:147-153` comment). The 3-tier timing engine (`src/features/leads/lib/timing.ts`) that consumes `timing_calibration` runs on the per-permit DETAIL PAGE, not in the feed.

So the current "Timing Calibration" card is **misleading** as a "feed readiness" indicator — it doesn't affect feed results at all. The card should be relabeled to "Detail Page Timing Engine" or similar, and a NEW card added for the actual feed timing input (`permit_trades.phase`).

### Bug 3 — Incomplete readiness view (comprehensive audit)

**Enumerated inputs to the lead feed** (per `get-lead-feed.ts` and spec 70 §Implementation):

**A. Permit Feed Path — 4 score pillars + hard filters**

| Pillar | Required Input | Where | Currently Surfaced? |
|---|---|---|---|
| Hard filter | `permits.location IS NOT NULL` | `get-lead-feed.ts:233` | ✅ as `permits_geocoded` (but via latitude/longitude, not the actual `location` column the feed uses) |
| Hard filter | `p.status NOT IN ('Cancelled','Revoked','Closed')` | `get-lead-feed.ts:235` | ❌ — current admin uses an inclusion list that doesn't match |
| Hard filter | `permit_trades.is_active = true` | `get-lead-feed.ts:231` | ❌ — `permits_classified` counts ANY trade row, including inactive |
| Hard filter | `permit_trades.confidence >= 0.5` | `get-lead-feed.ts:232` | ❌ — not counted |
| Proximity | PostGIS distance from user | `get-lead-feed.ts:135-145` | ✅ implicit (needs location) |
| Timing | `permit_trades.phase` ∈ (structural, finishing, early_construction, landscaping) | `get-lead-feed.ts:147-153` | ❌ — not surfaced at all |
| Value | `cost_estimates.cost_tier IS NOT NULL` | `get-lead-feed.ts:156-163` | ✅ as `permits_with_cost` |
| Opportunity | `permits.status ∈ (Permit Issued, Inspection, Application)` | `get-lead-feed.ts:166-171` | ❌ — not broken out |
| Display | `neighbourhoods.name` (LEFT JOIN, optional) | `get-lead-feed.ts:201` | ❌ — no neighbourhood coverage stat |

**B. Builder Feed Path — WSIB eligibility filter (AND clause)**

From `get-lead-feed.ts:80-89` (`wsib_per_entity` CTE):
- `is_gta = true`
- `last_enriched_at IS NOT NULL`
- `business_size ∈ (Small Business, Medium Business)`
- `(website IS NOT NULL OR primary_phone IS NOT NULL)`
- Plus hard filter: permit row `status IN (Permit Issued, Inspection)` (line 407)

Measured: **618 feed-eligible builders** (intersection of all filters). Current dashboard shows `builders_total: 3741`, `builders_with_contact: 517`, `builders_wsib_verified: 903` — NONE of these is the intersection that matters for the feed.

**C. Detail Page Timing Engine** (separate from feed, but user asked about it):
- `timing_calibration` rows (current count: 4)
- `permit_inspections` (not yet on this DB — but used by Tier 1 stage engine)
- `inspection_stage_map` (migration 072 not applied)

## Technical Implementation

### Files to Modify

1. **`src/components/LeadFeedHealthDashboard.tsx`**
   - Fix client error extraction to handle `{error: string}` AND `{error: {code, message, details?}}` shapes
   - Reshape readiness section UI to present pillar-by-pillar coverage
   - Relabel "Timing Calibration" card to distinguish feed-path timing (phase) from detail-page timing (calibration)
   - Add new cards: classification breakdown (active+high-conf), opportunity-status breakdown, feed-eligible builder count

2. **`src/lib/admin/lead-feed-health.ts`**
   - Extend `LeadFeedReadiness` interface with new fields:
     - `permits_with_phase` — permits with at least one `permit_trades.phase` populated
     - `permits_feed_eligible` — full intersection (location + active trade + high-conf + non-terminal status)
     - `permits_with_timing_calibration_match` — active permits whose permit_type has a row in timing_calibration (the "what does 4 mean" answer)
     - `permits_by_opportunity_status` — counts by (Permit Issued, Inspection, Application, other)
     - `builders_feed_eligible` — full WSIB intersection (GTA + enriched + size + contact)
     - `neighbourhoods_total`, `permits_with_neighbourhood` (display coverage)
   - Update `getLeadFeedReadiness` to query these
   - Keep backward compatibility — existing fields unchanged

3. **`src/tests/lead-feed-health.logic.test.ts`** + **`src/tests/lead-feed-health.infra.test.ts`**
   - Add tests for new fields
   - Add tests for test-feed error extraction (structured object error rendering)

4. **`src/tests/LeadFeedHealthDashboard.ui.test.tsx`**
   - Add test reproducing `[object Object]` bug: mock fetch returning `{error: {code, message}}` and assert the UI displays `message` (not `[object Object]`)
   - Add tests for new readiness cards (phase coverage, opportunity breakdown, feed-eligible builders)

### Database Reconciliation (NOT a code change)

Apply the 3 missing migrations to local DB during investigation / before tests:
- `migrations/067_permits_location_geom.sql` — CRITICAL (unblocks test feed)
- `migrations/072_inspection_stage_map.sql` — seed data (feeds Tier 1 engine)
- `migrations/075_user_profiles.sql` — user profiles table

These are existing migration files — no new migration file needed. Same pattern as the prior WF3 (applied 070/076/079). **The real root cause is the migration runner has no tracking table; a dedicated WF to add `schema_migrations` should land separately** (already deferred to `review_followups.md` from the last WF3).

## Standards Compliance

* **Try-Catch Boundary:** Existing handlers unchanged. Error envelope shape is already correct per spec 76.
* **Unhappy Path Tests:** Structured error object rendering, empty engagement, missing migration graceful degradation
* **logError Mandate:** Existing `logError(TAG, err, ...)` unchanged
* **Mobile-First:** New cards follow existing `grid-cols-1 md:grid-cols-2` pattern; touch targets ≥ 44px

## Execution Plan

- [x] **Rollback Anchor:** `c669f46c` (recorded)
- [x] **State Verification:** Done — DB schema inspected, feed SQL traced, current dashboard fields enumerated
- [x] **Spec Review:** Read spec 70 §Implementation, spec 76 §2.1-§3.1
- [ ] **Apply missing migrations:** Run 067, 072, 075 against local DB (reconcile partial-apply state — unblocks Bug 1A and lets tests exercise the real schema)
- [ ] **Reproduction — Bug 1B (client error):**
  - Add test to `LeadFeedHealthDashboard.ui.test.tsx`: mock fetch returning 500 with `{error:{code:'INTERNAL_ERROR',message:'Feed query failed'}}` → assert the UI displays `'Feed query failed'` not `'[object Object]'`
  - Add test: mock 400 with `{error:{code:'VALIDATION_ERROR',message:'Invalid parameters'}}` → assert displays `'Invalid parameters'`
- [ ] **Reproduction — Bug 3 (readiness fields):**
  - Add tests to `lead-feed-health.logic.test.ts` asserting the new fields are computed and returned
- [ ] **Red Light:** Both new test sets MUST fail
- [ ] **Fix 1B — client error extraction:**
  - Helper `extractErrorMessage(body)`: handles `body.error` as string, `body.error.message` when object, fallback `HTTP status`
  - Apply to BOTH `runTestFeed` and `fetchHealth` for consistency
- [ ] **Fix 2 — timing semantics:**
  - Rename "Timing Calibration" card to "Detail Page Timing Engine" with sublabel "(not used by feed ranking)"
  - Add a new "Timing Coverage (Feed Path)" metric showing how many active permits have `permit_trades.phase` populated in the feed-eligible phase values
  - Display `permits_with_timing_calibration_match` under the existing Timing Calibration card as "active permits covered"
- [ ] **Fix 3 — comprehensive readiness:**
  - Extend `getLeadFeedReadiness` to query the 6 new fields (phase coverage, feed-eligible intersection, timing match, opportunity breakdown, feed-eligible builders, neighbourhood coverage)
  - Add new "Feed-Path Coverage" section to dashboard with per-pillar bars:
    - Hard filter: location + non-terminal status
    - Classification: active + high-conf trades
    - Timing (feed): phase populated
    - Value: cost_tier
    - Opportunity: status breakdown
  - Add new "Feed-Eligible Builders" row to the builder readiness block (the 618 intersection number)
- [ ] **Sibling Bug Check (5 items):**
  1. Does the health endpoint have the same `body.error` object problem? No — it returns `{error: 'string'}`. But apply the same helper for consistency.
  2. Are there other scripts/files that read `body.error` the same way? Grep for `body.error` usage.
  3. Does the `feed_ready_pct` calculation in `getLeadFeedReadiness` need updating? YES — it currently does a 3-way intersection (geocoded+trade+cost) but should also include the `is_active = true` and `confidence >= 0.5` filters on `permit_trades` to match the actual feed.
  4. Does the `computeTestFeedDebug` call path have any OTHER crash sites? No — it operates on already-mapped items.
  5. Are any tests asserting the OLD `permits_classified` count logic that might break? Check `lead-feed-health.infra.test.ts`.
- [ ] **Schema Evolution:** N/A — no new migrations. 3 existing migrations applied manually (067, 072, 075)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All 3365+ tests must pass (plus new ones).
- [ ] **Collateral Check:** `npx vitest related src/lib/admin/lead-feed-health.ts src/components/LeadFeedHealthDashboard.tsx src/app/api/admin/leads/test-feed/route.ts --run`
- [ ] **Founder's Audit:** Verify new fields render, click Run Test in real browser (if dev server running) to confirm bug 1 is gone
- [ ] **Adversarial + Independent Review** per user instructions
- [ ] **Atomic Commit:** `git commit -m "fix(76_lead_feed_health_dashboard): test feed error rendering + expanded readiness + timing semantics"`

## Why Bugs 1A (migration 067) is NOT a code change

Same reasoning as last WF3: the code is correct against the authoritative schema (migration 067). The defect is the DB state. Fixing the code to be "defensive against missing columns" would violate §10.3 and hide real schema drift. The code-level fix for this class of bug is the migration runner tracking table (already deferred).

## Scope Discipline / Deferred

- **Migration runner hardening** (schema_migrations table) — deferred, tracked in review_followups.md
- **`permit_inspections` table + scraping pipeline** — Tier 1 stage engine is out of scope; Bug 2 is only about labeling clarity
- **Fixing `permits_classified` dual-counting** in `data_quality_snapshots` — that's a separate pipeline concern; the admin dashboard will compute the correct count directly from the live DB
- **Updating spec 76** to reflect the new fields — do it if the fix introduces a logic change, else skip
