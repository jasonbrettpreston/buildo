# Review-Queue Triage — 2026-11-23

_Read horizon: lines 1–700 of 4,346 in `review_followups.md` (sections 2026-05-09 → 2026-09-27).
The most-recent sections are fully read; older history (pre-2026-05-09) was not re-read this cycle —
those sections are largely WF6 output deferrals for completed work and rarely surface new HIGH items.
Prior triage file: none (first run)._

---

## 1. Stale Items (resolved since filing)

| Severity | Item | Filed | Resolution evidence |
|---|---|---|---|
| HIGH×3 | Spec 126 §A: `verifyAdminAuth` missing on 11 admin routes | 2026-09-15 | `grep verifyAdminAuth` hits in all 11 files: `stats`, `rules`, `sync`, `builders`, `market-metrics`, `pipelines/runs`, `pipelines/status`, `pipelines/history`, `pipelines/schedules`, `control-panel/configs`, `control-panel/resync`. Counts: 2–4 hits each. |
| HIGH | Spec 126 §A: `permits/[id]/route.ts` serving full `parcels` row | 2026-09-15 | `route.ts:111` comment "§4.3 explicit allow-list, never `SELECT *`"; imports `ENTITY_PUBLIC_COLS` from `src/lib/api/public-projections`. |
| HIGH | Spec 126 §A: `builders/[id]/route.ts` serving all `entity_contacts` rows | 2026-09-15 | `route.ts:9` imports `ENTITY_CONTACT_PUBLIC_COLS`; lines 29/61 use explicit projections. |
| MED | Spec 126 §A: stats-route GET-that-writes (`reapStaleRunningRows()`) | 2026-09-15 | `stats/route.ts:15` comment reads "reapStaleRunningRows() call that **used to** sit between" — reaper moved out of the GET handler. |
| MED | WF1 cross-step: false ordering lock `enrich_ravines == link_parcels + 1` | 2026-09-03 | `chain.logic.test.ts:186-189` — assertion RETIRED with LDG-10 class 5 citation; derived ordering edges now replace the incidental pin. |
| HIGH | Spec 122 P1: `*_dataset_version_when_enriched` stamps with no trigger invalidator | 2026-08-23 | Migration 249 (`parcels_stamp_geom_invalidation`, 2026-10-04) adds the fifth trigger arm; migration header names this exact `review_followups.md` row as its `WHY THIS EXISTS`. `git log --all -S 'dataset_version_when_enriched' -- migrations/` → `b87f62d`, `e820e4d`. |

**6 stale items confirmed resolved. No follow-up action needed.**

---

## 2. Top 5 This Week

### #1 — HIGH: 7 admin mutations with no `admin_audit_log` row
_Source: Spec 126 surface-research §A item 4 (2026-09-15)_

**Routes unaudited:** `control-panel/configs` PUT · `control-panel/resync` POST ·
`pipelines/[slug]` POST/DELETE · `pipelines/schedules` PUT/PATCH · `rules` POST/PATCH ·
`leads/watchlist` POST/DELETE · `notifications/test-send` POST

**Verification:** `grep -n "admin_audit_log"` in `control-panel/configs/route.ts` returns one
comment line referencing the `admin_uid` column type only — no audit-write call. The control-panel
routes were confirmed to have `verifyAdminAuth` (stale item #1 above) but no audit emit.

**Why #1:** `src/lib/admin/admin-audit.ts`'s own header calls an unaudited admin mutation
"a compliance hole." `control-panel/configs` PUT rewrites `logic_variables` plus three more tunable
tables — the highest-impact mutation in the admin surface — with no operator accountability trail.
An audit-row lock on the mutating route set also closes the defence-in-depth gap the stale-item #1
fix opened: `verifyAdminAuth` now gates who can call, but no log records what was called.

**Proposed WF:** Cross-Domain WF3 (`wf3-admin-audit-completeness`). Security seat on the panel
(Spec 08 §10.2). Deliverables: audit rows on all 7; a conformance lock asserting every mutating
`/api/admin/**` export both guards and audits.

---

### #2 — HIGH: `captureDataQualitySnapshot()` — duplicate implementation, no advisory lock
_Source: Pilot 8 assessment Finding 7 (2026-08-31), `src/lib/quality/metrics.ts`_

**Verification:** `grep -n "advisory" src/lib/quality/metrics.ts src/app/api/quality/refresh/route.ts`
→ zero hits. Function still present at `:23`.

**Why #2:** Live race condition. The admin "Refresh Now" button calls `captureDataQualitySnapshot()`
directly; the `refresh_snapshot` pipeline step runs the same queries via `scripts/refresh-snapshot.js`.
Both write to the same `ON CONFLICT (snapshot_date)` row with no coordination. Additionally: the TS
path uses the exact `Promise.all` parallel-dispatch pattern that `8cc99c78` fixed in the pipeline
script (the 73% index-fetch pathology: 3 min → 64 min under a stale correlation stat). It also
carries 61 columns vs the pipeline script's 68, so a manual refresh can silently zero the 7
`cost_estimates_*` / `timing_calibration_*` columns it doesn't know about.

**Proposed WF:** Cross-Domain WF3. Option A (minimum): add `ADVISORY_LOCK_ID` per Spec 47 §A.5
registry so the manual trigger can't race the pipeline run. Option B (complete): retire the TS
path and delegate to the pipeline script's own query builders.

---

### #3 — HIGH: Dead meter `useLeadView` retirement (Spec 128 R-08)
_Source: Spec 126 surface-research §B (2026-09-15), re-confirming Spec 128 R-08 ruling_

**Verification:**
- `grep -rn "useLeadView()" src/` (excluding tests) → no production caller; function defined at
  `src/features/leads/api/useLeadView.ts:77`, called nowhere.
- `mobile/src/components/paywall/PaywallScreen.tsx:153` — `leadViewsCount > 0` branch confirmed
  present; `leadViewsCount` comes from `user_profiles.lead_views_count` which is structurally 0
  (the atomic CTE in the route never runs because the hook has no caller).
- 44 test cases pass over a meter nothing invokes.

**Why #3:** Every trial user sees the zero-state paywall copy regardless of actual lead activity.
The R-08 ruling to retire in favour of `usage_events` has been pending with no WF filed against it.
This is the user-facing consequence: a paywall that can never enter its non-zero state.

**Proposed WF:** Cross-Domain WF3 (`wf3-dead-lead-view-meter`). Deliverables: retire `useLeadView`,
its route (`src/app/api/leads/view/route.ts`), and `user_profiles.lead_views_count` meter; fix
`PaywallScreen.tsx` paywall copy to use `usage_events` per R-08 ruling; retire the 44 tests.
Regression Guardian seat required (44 test deletions).

---

### #4 — HIGH: `step_timeout_minutes` unwired for 10 converted steps
_Source: WF3 EP-PHASE-DEADLINE §C2 (2026-09-15), `execution-budget-disposition.json` pending[]_

**Steps still missing `step_timeout_minutes` in `scripts/manifest.json`:**
`compute_centroids` · `link_massing` · `link_parcel_addresses` · `link_parcels` · `link_wsib` ·
`load_ravines` · `assert_data_bounds` · `assert_engine_health` · `assert_global_coverage` ·
`assert_schema`

**Verification:** Python probe of `scripts/manifest.json` — all 10 return `MISSING`.
The registry's `pending[]` lock in `src/tests/execution-budget-disposition.infra.test.ts` assertion
(3) prevents silent graduation into the wired set.

**Why #4:** Each of these steps declares an `execution.step_timeout` in its descriptor that reads as
a ceiling but enforces nothing — `run-chain.js` reads `|| 0` (INERT). A step that stalls silently
consumes the full chain budget with no watchdog. This is the same class of defect that made the
`enrich_parcels` pass-5 stall go undetected for >1,900 s.

**Prerequisite:** Measure each step's real completed-run duration from cloud `pipeline_runs` before
writing any ceiling — a ceiling set below the honest runtime converts a healthy run into a failure.

**Proposed WF:** Backend/Pipeline WF2 (`wf2-manifest-step-timeout`). Measurement phase first;
wiring phase second. Can batch with item #5 (same file).

---

### #5 — MED: `manifest.json` telemetry_tables has two proven omissions
_Source: WF1 cross-step ledger §6, 2026-09-03, ACT item_

| Step | Declared | Missing |
|---|---|---|
| `massing` | `["building_footprints"]` | `parcel_buildings` (`load-massing.js:208,222` genuinely `DELETE FROM parcel_buildings`) |
| `enrich_parcels` | `["parcels"]` | `enrich_parcels_pass3_scope` (`enrich-parcels.js` INSERTs into this table) |

**Verification:** Python probe of `scripts/manifest.json` → confirmed both omissions present today.

**Why #5:** Any observability or telemetry consumer that reads `telemetry_tables` as ground truth of
what a step touches is blind to these two tables. This is the exact class of drift that makes an
audit miss look like a CLEAN verdict.

**Proposed WF:** Batch into `wf2-manifest-step-timeout` above (same file, trivial 2-line edit). Can
land in Sweep B below.

---

## 3. Proposed Sweep WFs

### Sweep A — Admin audit-log hardening (`wf3-admin-audit-completeness`, Cross-Domain)
- **Files:** 7 route files listed in item #1 + `src/lib/admin/admin-audit.ts`
- **Item count:** 7 mutations + 1 conformance lock
- **Panel:** Security seat + Code Reviewer + Integration
- **Covers items:** #1 above

### Sweep B — Manifest correctness + step-timeout (`wf2-manifest-step-timeout`, Backend/Pipeline)
- **Files:** `scripts/manifest.json`, `scripts/_schema/execution-budget-disposition.json`
- **Item count:** 2 telemetry_tables entries + up to 10 `step_timeout_minutes` entries
- **Panel:** Integration + Code Reviewer
- **Covers items:** #4 and #5 above
- **Gate:** Measurement phase (read cloud `pipeline_runs` per step) MUST precede the ceiling writes.

### Sweep C — Dead-meter retirement (`wf3-dead-lead-view-meter`, Cross-Domain)
- **Files:** `src/features/leads/api/useLeadView.ts`, `src/app/api/leads/view/route.ts`,
  `mobile/src/components/paywall/PaywallScreen.tsx`, related paywall copy files,
  `src/tests/` (44 test cases to retire or redirect to `usage_events`)
- **Item count:** 3 source deletions + 1 paywall copy fix + 44 test retirements
- **Panel:** Code Reviewer + Regression Guardian + Integration
- **Covers items:** #3 above

---

## 4. Queue Health

| Metric | Count |
|---|---|
| Read horizon this cycle | Lines 1–700 of 4,346 (most-recent 6 sections, 2026-09-03 → 2026-09-27) |
| Stale items confirmed resolved this cycle | 6 |
| Open HIGH items (read window) | 8 |
| Open MED items (read window) | 9 |
| Open LOW items (read window) | ~12 |
| Prior triage file | None (first run — no delta available) |
| Active commits (last 14 days) | 0 |
| Active commits (last 30 days) | 5 (pipeline/abutment/standards work) |

**Severity breakdown (read window, open items):**

- HIGH: admin-audit-completeness (×7 routes) · captureDataQualitySnapshot race · useLeadView
  dead-meter · step_timeout unwired (×10 steps)
- MED: manifest telemetry_tables (×2) · massing_zero_link_ghost descriptor day-one claim ·
  parcels_null_address_pct gate formally unretired · check-spec99-matrix.mjs wired to nothing ·
  captureDataQualitySnapshot 61 vs 68 column delta · non-blocking FAIL invisible to `/api/quality` ·
  Spec 62 architecture items (various)
- LOW: `edit_file` size cap · committer-lock reclaim race · cost_weighted_tokens missing from
  run_end · engine budget exhaustion on 4-of-6 runs · and further items in older sections

**Queue note:** The file is 4,346 lines; only the most-recent 700 lines were read this cycle.
Sections predating 2026-05-09 are WF6 output deferrals for completed WF1/WF2/WF3 runs (Spec 65
phases, Spec 62 architecture, Phase F.4, Spec 30/48/49, etc.) — lower likelihood of unretired HIGH
items, but should be swept in a future cycle to confirm staleness. Recommended next-cycle read
horizon: lines 700–1,400 (sections 2026-05-09 → 2026-05-14).
