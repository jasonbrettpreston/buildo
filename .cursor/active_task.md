# Active Task: Fix WF5 Audit Findings (5 Items)
**Status:** Planning → Authorized

## Context
* **Goal:** Fix five findings from `docs/reports/data_quality_wf5_audit.md`.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:** `src/components/FreshnessTimeline.tsx`, `src/lib/admin/funnel.ts`, `scripts/quality/assert-schema.js`, `scripts/quality/assert-data-bounds.js`, `src/tests/admin.ui.test.tsx`, `src/tests/quality.logic.test.ts`

## Workflow Classification
| # | Finding | Workflow | Reason |
|---|---------|----------|--------|
| 1 | Stale false positive | WF3 | Incorrect red status on healthy steps |
| 2 | Timer flicker | WF3 | UI glitch from insufficient timeout |
| 3 | Missing null rates | WF2 | Empty arrays are placeholders — wiring new data |
| 4 | CQA drill-down depth | WF2 | Adding records_meta output + new UI rendering |
| 5 | Contextual labels | WF2 | Changing generic labels to descriptive ones |

## Technical Implementation

### Bug 1 (WF3): Stale False Positive
* **Root Cause:** `getStatusDot()` marks ANY completed step with `records_new === 0 && records_updated === 0` as "Stale" (red). For link, classify, quality, and snapshot groups, 0 is valid.
* **Fix:** Add optional `staleExempt` param to `getStatusDot()`. At call site, derive from `PIPELINE_REGISTRY[slug].group` — groups `link`, `classify`, `quality`, `snapshot` are exempt. When exempt, skip zero-records Stale check, fall through to time-based freshness.

### Bug 2 (WF3): Optimistic Timer Flicker
* **Root Cause:** `optimisticTimerRef` uses `3000ms`. Cold-start PATCH >3s causes toggle flicker.
* **Fix:** Increase to `8000ms` (covers two poll cycles).

### Enhancement 3 (WF2): Missing Null Rates
* **Current State:** `funnel.ts` returns empty `[]` for `yieldNullRates` on parcels, neighbourhoods, massing, trades, scope_class, scope_tags.
* **Fix:** Plumb yieldNullRates using existing snapshot fields:
  - **parcels:** unlinked % = `(ap - permits_with_parcel) / ap`
  - **neighbourhoods:** unlinked % = `(ap - permits_with_neighbourhood) / ap`
  - **massing:** unlinked % = `(ap - permits_with_massing) / ap`
  - **trades_residential:** unclassified % = `(total - classified) / total`
  - **trades_commercial:** unclassified % = `(total - classified) / total`
  - **scope_class:** unclassified % = `(ap - permits_with_scope) / ap`
  - **scope_tags:** untagged % = `(ap - permits_with_detailed_tags) / ap`

### Enhancement 4 (WF2): CQA Drill-Down Depth
* **Current State:** CQA scripts write `error_message` but no `records_meta`. Non-funnel drill-down shows status/duration/records only.
* **Fix:** (a) Both CQA scripts write `records_meta` JSON with checks_passed/checks_warned/checks_failed counts + detail arrays. (b) Non-funnel Last Run panel renders `info.records_meta` key/value pairs when present.

### Enhancement 5 (WF2): Run Intersection Disconnect
* **Current State:** `FunnelLastRunPanel` shows generic "Processed / Matched" labels for all non-web-scrape steps.
* **Fix:** Map source IDs to contextual label pairs in FunnelLastRunPanel: geocode → "To Geocode / Geocoded", link_parcels → "Unlinked / Linked", classify → "To Classify / Classified". Default remains "Processed / Matched".

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified.
* **Unhappy Path Tests:** N/A — no API routes modified.
* **logError Mandate:** N/A — no API routes modified.
* **Mobile-First:** N/A — no layout changes.

## Database Impact
NO

## Execution Plan
- [x] **Rollback Anchor:** `d4ffe0a`
- [x] **State Verification:** Confirmed all current states.
- [x] **Spec Review:** Spec 28 confirmed.
- [ ] **Viewport Mocking:** Backend Only, N/A.
- [ ] **Reproduction + Red Light:** Write failing tests for all 5 items.
- [ ] **Fix Bug 1:** Add `staleExempt` param to `getStatusDot()`, derive from group at call site.
- [ ] **Fix Bug 2:** Change `3000` → `8000` in optimisticTimerRef.
- [ ] **Atomic Commit (WF3):** `fix(28_data_quality_dashboard): stale false positive + timer flicker`
- [ ] **Fix Enhancement 3:** Plumb yieldNullRates in funnel.ts.
- [ ] **Fix Enhancement 4:** (a) CQA scripts write records_meta. (b) Non-funnel panel renders it.
- [ ] **Fix Enhancement 5:** Contextual intersection labels in FunnelLastRunPanel.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`.
- [ ] **Collateral Check:** `npx vitest related src/components/FreshnessTimeline.tsx --run`.
- [ ] **Atomic Commit (WF2):** `feat(28_data_quality_dashboard): null rates + CQA depth + contextual labels`
- [ ] **Spec Audit:** Update audit report to mark all 5 findings resolved.
