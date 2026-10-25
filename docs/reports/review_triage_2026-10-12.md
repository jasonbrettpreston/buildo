# Review Queue Triage — 2026-10-12

**Generated:** 2026-10-12 (automated routine)
**Queue source:** `docs/reports/review_followups.md` (4331 lines, ~41 sections, 2026-05-08 → 2026-09-27)
**Prior triage:** none (first run)

---

## 1. Stale Items

Items named a specific file/function/migration that has since been addressed.

| # | Original Severity | Section | Item | Resolution Evidence |
|---|---|---|---|---|
| S1 | MED | WF1 cross-step ledger (2026-09-03) | **False ordering lock in `src/tests/chain.logic.test.ts:173-174`** — `enrich_ravines == link_parcels + 1` pinned incidental manifest ordering, not a real data dependency. Filed: "ACT — WF3: delete or correct." | RETIRED in commit `fd43747` (L-A, LDG-10 class 5, plan Fold 14). Lines 185–200 of the file now carry `// RETIRED` comments. No further action. |
| S2 | HIGH | Spec 122 §P0 (2026-08-23) | **`*_dataset_version_when_enriched` stamps have no trigger invalidator** — any write path other than `load-parcels.js` leaves them stale. Filed: "ACT — own WF3, measure each stamp first." | Closed by commit `aff99da` — migration 249 (`migrations/249_parcels_stamp_geom_invalidation.sql`) arms the three stamps as guard terms on geom change. DB test at `src/tests/db/migration-249-stamp-invalidation.db.test.ts`. No further action. |
| S3 | MED | `chain_sources` WARN classification (2026-08-25) | **`parcels_null_address_pct` gate permanently unsatisfiable** — ADDRESS_NUMBER stripped from CSV; gate reads WARN 100% forever. Filed: "ACT — WF3: retire the check or rebase it." | Converted to limit_from_config in the load_parcels ③ cutover; descriptor `load-parcels.descriptor.json:352` now marks it `PIN, DO NOT FIX — declared structurally unsatisfiable in limitations[]`. Retiring would hide the column strip from future readers. Original "ACT" disposition superseded. |
| S4 | MED | WF1 cross-step ledger (2026-09-03) | **`manifest.json` telemetry_tables: `massing` step omits `parcel_buildings`**. Filed: "ACT — WF3: add `parcel_buildings` to massing's `telemetry_tables`." | Already present: `scripts/manifest.json:30` shows `"massing": {..., "telemetry_tables": ["parcel_buildings"]}`. Only the `enrich_parcels` half of this item remains open (see §3 item T4 below). |
| S5 | HIGH | Spec 126 surface research (2026-09-15) | **11 `/api/admin/**` routes with no per-route `verifyAdminAuth` call.** Filed as part of the security WF3 proposal. | Confirmed resolved for all 11 named routes (stats, rules, sync, builders, market-metrics, pipelines/runs, pipelines/status, pipelines/schedules, control-panel/configs, control-panel/resync): each now imports and calls `verifyAdminAuth` (grep: non-zero hits on all). The *audit log* gap (7 mutations) is still open — see §3 item T1 below. |

---

## 2. Top 5 Actionable Items This Week

Ranked by (a) severity, (b) unblocking potential, (c) hot-file proximity.

### #1 — Security: admin mutations missing `admin_audit_log` rows (HIGH)
**Section:** Spec 126 surface research §A (2026-09-15)
**Files:** `src/app/api/admin/control-panel/configs/route.ts`, `src/app/api/admin/pipelines/[slug]/route.ts`, `src/app/api/admin/pipelines/schedules/route.ts`, `src/app/api/admin/notifications/test-send/route.ts` (4 confirmed; watchlist and resync already patched)
**Why now:** `src/lib/admin/admin-audit.ts`'s own header calls an unaudited admin mutation "a compliance hole." `control-panel/configs` PUT rewrites `logic_variables` and three more tunable tables — the highest-impact unaudited write in the estate. Per-route auth (S5 above) is now in place; audit trail is the remaining gap.
**Proposed WF:** WF3, Cross-Domain, Security seat on panel. Single sweep: add `admin_audit_log` INSERT in each of the 4 unpatched routes + a lock asserting every mutating `/api/admin/**` export both guards and audits.

---

### #2 — Duplicate `captureDataQualitySnapshot` with no advisory lock (HIGH)
**Section:** Pilot 8 Finding 7 (2026-09-03)
**Files:** `src/lib/quality/metrics.ts`, `src/app/api/quality/refresh/route.ts`
**Why now:** The admin "Refresh Now" trigger races a concurrent pipeline `refresh_snapshot` run — both target the same `ON CONFLICT (snapshot_date)` row with no coordination. Also: the TypeScript re-implementation is missing 7 columns vs. the pipeline script. No recent commits touched these files. This is the only reaper/refresh race that can silently corrupt the quality snapshot the whole admin UI reads.
**Proposed WF:** WF3, Cross-Domain. Either retire `metrics.ts`'s duplicate implementation (call the pipeline script's query builders directly) or add `ADVISORY_LOCK_ID` per Spec 47 §A.5. Deliverable includes adding the 7 missing columns.

---

### #3 — Dead lead-view meter: retire `useLeadView` + paywall branch (HIGH)
**Section:** Spec 126 surface research §B (2026-09-15)
**Files:** `src/features/leads/api/useLeadView.ts`, `src/app/api/leads/view/route.ts`, `mobile/src/components/paywall/PaywallScreen.tsx`
**Why now:** Spec 128 R-08 already ruled retirement in favor of `usage_events`. The atomic CTE in the view route never runs (`useLeadView` has no UI caller); `user_profiles.lead_views_count` is structurally 0; the paywall's `leadViewsCount > 0` branch is permanently unreachable. 44 passing tests cover dead code. The retirement ruling is done; only the execution WF3 is missing.
**Proposed WF:** WF3, Admin/Mobile (Cross-Domain due to paywall). Retire the view route + hook, point paywall to `usage_events`, delete the 44 dead tests.

---

### #4 — Non-blocking FAIL invisible to `/api/quality` (MED, BLOCKER)
**Section:** Spec 122 §S2-min (2026-08-24)
**Files:** `src/lib/step/index.js` (step library), `src/app/api/quality/route.ts` (or equivalent quality reader)
**Why now:** This is explicitly declared as MUST BE RESOLVED "before any pilot declares a non-blocking FAIL check." The `assert_schema` C1 conversion — which promotes `permit_cost_type_sample` (`severity: FAIL, blocking: false`) — is blocked on this. Two candidate closes exist in the item: (a) `/api/quality` also reads `records_meta.audit_table.verdict`, or (b) `run-chain.js` derives the status literal from the emitted verdict. Neither has been implemented.
**Proposed WF:** WF3, Backend/Pipeline. Implement candidate (a) — narrowest blast radius — as a standalone gate blocker fix before the next step conversion that needs a non-blocking FAIL.

---

### #5 — `existing_structure` 4.5× regression root-cause still undiagnosed (MED)
**Section:** WF3 EP-PHASE-DEADLINE / EP-PASS3-BACKLOG (2026-09-15)
**Files:** `scripts/enrich-parcels.js` (pass 3), `scripts/enrich-parcels.descriptor.json`
**Why now:** Marked "ACT — own WF3, now unblocked" in the original filing. EP-PHASE-DEADLINE (the prerequisite) is now armed. The offered cause (backlog contention) was refuted; the surviving candidate is chain-neighbour contention (`chain_coa` overlap), but this is correlation not proof. The next `--full` run is the measurement opportunity; the WF3 is to instrument bloat/contention state during the run (not after) so the diagnosis is causal.
**Proposed WF:** WF3, Backend/Pipeline. Add per-phase duration capture + a `pg_stat_activity`/`pg_locks` probe at pass-3 start so the next `--full` run produces a root-cause, not another correlation guess.

---

## 3. Proposed Sweep WFs

### Sweep A — Security compliance sweep (WF3, Cross-Domain)
**Name:** `wf3/admin-audit-sweep`
**Scope:** `src/app/api/admin/control-panel/configs/route.ts`, `src/app/api/admin/pipelines/[slug]/route.ts`, `src/app/api/admin/pipelines/schedules/route.ts`, `src/app/api/admin/notifications/test-send/route.ts`
**Items:** #1 (admin audit log, 4 routes) + Spec 126 §A: explicit pick-by-name projection on `src/app/api/permits/[id]/route.ts` + `src/app/api/builders/[id]/route.ts` (HIGH public SELECT * disclosures)
**Estimated item count:** 6 discrete changes + 1 lock assertion
**Panel:** Security seat (Spec 08 §10.2 mandatory on auth/PII surfaces)

### Sweep B — Quality visibility (WF3, Backend/Pipeline + Admin)
**Name:** `wf3/quality-visibility`
**Scope:** `src/lib/quality/metrics.ts`, `src/app/api/quality/refresh/route.ts`, `src/lib/step/index.js` (or quality reader route)
**Items:** #2 (advisory lock + missing columns in metrics.ts) + #4 (non-blocking FAIL visible to /api/quality)
**Estimated item count:** 2 discrete changes
**Note:** Resolve #4 first — it unblocks step conversions. #2 can ride the same WF or follow immediately.

### Sweep C — Telemetry truthfulness (WF3, Backend/Pipeline)
**Name:** `wf3/telemetry-truth`
**Scope:** `scripts/manifest.json` (enrich_parcels entry), `scripts/enrich-parcels.js` / `.descriptor.json`, `scripts/enrich-parcels.descriptor.json` (massing_zero_link_ghost comment)
**Items:** S4 residual — `enrich_parcels` telemetry_tables still missing `enrich_parcels_pass3_scope`; massing_zero_link_ghost day-one comment claims "0" but cloud DB has always read 1395; add `existing_data_quality_flag` visibility INFO row to parcel-sanity-audit
**Estimated item count:** 3 small changes (no migration required)

---

## 4. Queue Health

| Metric | Value |
|---|---|
| Total open sections | ~41 |
| Items reviewed this triage | ~90 (full file read, lines 0–308 + section headers) |
| Confirmed stale (already resolved) | 5 items (S1–S5 above) |
| Proposed for immediate action | 5 (Top 5) |
| Blocked on cloud measurement | 22+ steps in execution-budget-disposition `pending[]` — deliberately deferred per Spec 124 R-AQ; not actionable without cloud run data |
| Prior triage | None — first run; no deltas available |

**Severity breakdown of open, non-stale, non-pending items (estimated from sections read):**
- CRITICAL: 0 open (all resolved or accepted-by-design)
- HIGH: ~8 open (security disclosures, duplicate quality snapshot, dead meter, builders columns, prim CTE index dependency)
- MED: ~20 open (non-blocking FAIL visibility, enrich_parcels regression, orphan sweep disagreement, various pipeline items)
- LOW: ~30+ open (style, perf, minor audit items)

**Oldest unresolved HIGH items:**
- Builders page 5 columns absent from `entities` (Spec 126 §C, 2026-09-15)
- `captureDataQualitySnapshot` race (Pilot 8 Finding 7, 2026-09-03)
- Dead lead-view meter (Spec 126 §B, 2026-09-15 — ruled retired 2026-09-15, execution pending)

**Recommended next sweep after Top 5:** Sweep A (security) is the highest-risk unaddressed cluster given the `configs` PUT rewrites tunable tables with no audit trail. Sweep B unblocks step conversions. Sweep C is low-effort and keeps telemetry honest.
