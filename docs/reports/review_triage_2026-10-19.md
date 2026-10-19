# Review Queue Triage — 2026-10-19

_First triage run. No prior `review_triage_*.md` file exists for delta comparison._

---

## 1. Stale Items (resolved since filing)

### 1a. CONFIRMED STALE

| Filed | Severity | Item | Evidence |
|-------|----------|------|----------|
| 2026-09-15 (Spec 126 §A) | HIGH | **11 `/api/admin/**` routes with no per-route `verifyAdminAuth`** | `grep -c verifyAdminAuth` shows 2–4 hits in every named route: `stats` (2), `rules` (3×GET+POST+PATCH), `sync` (2), `builders` (3), `market-metrics` (2), `pipelines/runs` (2), `pipelines/status` (2), `pipelines/history` (2), `pipelines/schedules` (4), `control-panel/configs` (4), `control-panel/resync` (3). All 11 are guarded. Likely landed incrementally with no single landing commit. |
| 2026-09-15 (Spec 126 §A) | MED | **`stats/route.ts` GET that writes (`reapStaleRunningRows`)** | `stats/route.ts:15` comment now reads "the `reapStaleRunningRows()` call that _used to sit_ between the count queries" — past tense confirms removal. The reaper is no longer called on GET. |
| 2026-10-07 (FLEET-2 follow-ups) | MED | **`link_massing` 4th write target has no write count** | Marked CLOSED in the file itself (2026-10-07 WF2 link_massing nonzero-close). |
| 2026-10-07–08 (sql-witness WFs) | HIGH+MED | **DML CTE write is lost; `UPDATE…FROM` records no bare read** | Both marked CLOSED in the file (2026-10-08 WF3 commits). |

### 1b. PARTIALLY STALE (tracking cleared, substance remains)

| Filed | Severity | Item | Evidence |
|-------|----------|------|----------|
| 2026-09-15 (WF3 EP §HIGH) | HIGH | **10 converted steps in `execution-budget-disposition.json` `pending[]` with no wired `step_timeout_minutes`** | `pending: []` in the JSON (the test-backed list is now empty), but `scripts/manifest.json` confirms only `enrich_parcels` and `refresh_snapshot` carry `step_timeout_minutes`. The outer tracking gate was cleared; the underlying wiring gap for the other 10 steps (`assert_data_bounds`, `assert_engine_health`, `assert_global_coverage`, `assert_schema`, `compute_centroids`, `link_massing`, `link_parcel_addresses`, `link_parcels`, `link_wsib`, `load_ravines`) has not been addressed. Re-file as an open ACT in the WF2 step-timeout sweep. |

---

## 2. Top 5 This Week

### #1 — Security WF3: public route projections + admin audit gaps
**Severity:** HIGH | **Source:** Spec 126 §A (2026-09-15)

**Items:**
- `src/app/api/permits/[id]/route.ts` spreads the entire `parcels` row into an unauthenticated response (Tier-3 diagnostic columns exposed to public)
- `src/app/api/builders/[id]/route.ts` serves every `entity_contacts` row with no projection and no gate
- 7 admin mutations declared missing `admin_audit_log` rows (control-panel/configs PUT, control-panel/resync POST, pipelines/[slug] POST/DELETE, pipelines/schedules PUT/PATCH, rules POST/PATCH, leads/watchlist POST/DELETE, notifications/test-send POST) — verify current state against `src/lib/admin/admin-audit.ts` before coding, since `control-panel/resync` now shows an audit write

**Rationale:** Highest severity in queue; directly exploitable today. No code changes have landed on the projection items (grep of both routes confirms no pick-by-name projection). Security seat mandatory on panel (Spec 08 §10.2 — auth/PII surface). Proposed disposition was ONE Cross-Domain WF3 in the original filing — that grouping still holds.

---

### #2 — metrics.ts advisory lock + column parity (Pilot 8 Finding 7)
**Severity:** HIGH | **Source:** Pilot 8 assessment 2026-08-31

**Items:**
- `src/lib/quality/metrics.ts` `captureDataQualitySnapshot()` holds no `pg_advisory_xact_lock` — confirmed by `grep advisory src/lib/quality/metrics.ts` → 0 hits. A concurrent pipeline `refresh_snapshot` run and admin "Refresh Now" can race to the same `ON CONFLICT (snapshot_date)` row
- INSERT column list is 61 vs pipeline script's 68 — `cost_estimates_*` and `timing_calibration_*` columns silently not populated on manual refresh
- Still uses the parallel-dispatch pattern `8cc99c78` fixed in the pipeline script (73% index-fetch pathology)

**Rationale:** Live race condition with no mitigation. Bounded Cross-Domain WF3; advisory lock pattern is established (Spec 47 §A.5 registry). No prerequisites. Scope: 2 files (`metrics.ts`, `quality/refresh/route.ts`).

---

### #3 — `*_dataset_version_when_enriched` stamps have no trigger invalidators
**Severity:** HIGH | **Source:** P0 §HIGH (2026-08-23)

**Items:**
- `ravine_dataset_version_when_enriched`, `heritage_dataset_version_when_enriched`, `centreline_dataset_version_when_enriched` — each stamped only by one app-code UPSERT path in `load-parcels.js:353-361`
- Any other write path (direct edit, migration, future enrichment step) leaves the stamp asserting an enrichment that no longer matches the underlying data
- Fix shape is proven: candidate trigger arms on `trg_parcels_invalidate_on_geom_change()` (same class closed by migrations 249/251 for geometry)

**Rationale:** HIGH data integrity risk; the fix pattern is established and well-understood from recent migration work. Run `git log --oneline -- migrations/249*.sql` to confirm the arm-addition pattern before coding.

---

### #4 — manifest.json telemetry_tables omissions: massing + enrich_parcels
**Severity:** MED | **Source:** WF1 cross-step ledger (2026-09-03)

**Items:**
- `manifest.json` `massing` declares `telemetry_tables: ["building_footprints"]` but `scripts/load-massing.js:208,222` genuinely `DELETE FROM parcel_buildings`
- `manifest.json` `enrich_parcels` declares `telemetry_tables: ["parcels"]` but `scripts/enrich-parcels.js:1851` genuinely `INSERT INTO enrich_parcels_pass3_scope`
- Both tables silently invisible to any telemetry/observability consumer reading `telemetry_tables` as ground truth

**Rationale:** 2-line fix; no migration; no descriptor changes; quick win that restores honest observability on two high-traffic steps. Unblocks correct cross-step ledger conformance (`step-conformance.infra.test.ts` can then narrow `KNOWN_GAPS`).

---

### #5 — chain_sources WARN calibration: parcels_null_address_pct + massing_zero_link_ghost
**Severity:** 2× MED | **Source:** chain_sources WARN sweep 2026-08-25

**Items:**
- `parcels_null_address_pct`: gate threshold is `< 10%`; column `ADDRESS_NUMBER` was deliberately dropped from the source CSV; every ingested row increments `nullAddressCount` → cloud value is **100.0%** on every run. Permanently unsatisfiable. The gate measures a structural fact the pipeline itself created.
- `massing_zero_link_ghost`: comment asserts "Measured day-one value 0 (backfill ruling)" but both cloud rows for the metric read **1,395** (earliest available cloud row predates any 0). The day-one claim was never true in cloud.

**Rationale:** Every `chain_sources` run reports as degraded because of these two checks, not data quality. Together they mask genuine WARNs. Small pipeline-domain WF3; fix for each is 1–2 lines + a re-captured golden.

---

## 3. Proposed Sweep WFs

### Sweep 1 — Security Route Hardening (Cross-Domain WF3 + Security seat)
**Scope:** `src/app/api/permits/[id]/route.ts` · `src/app/api/builders/[id]/route.ts` · remaining audit-log-missing admin mutation routes (verify set against current code before coding)
**Items covered:** Spec 126 §A items 1, 2, 4 (projections ×2, audit rows for open mutations)
**Estimate:** 3–5 items depending on audit gap verification
**Deliverables:** Explicit pick-by-name projections on both public routes; `admin_audit_log` write on each unaudited mutation; an infra test asserting every mutating `/api/admin/**` export both guards and audits; the reaper in its own JOB (Spec 126 §A item 5, low effort addendum)

### Sweep 2 — Pipeline WARN Calibration + Manifest Truthfulness (Backend/Pipeline WF3)
**Scope:** `scripts/manifest.json` · `scripts/load-massing.js` · `scripts/enrich-parcels.js` · `scripts/lib/parcels-csv-drift.js`
**Items covered:** `parcels_null_address_pct` retire/rebase (#5 above) · `massing_zero_link_ghost` comment fix · `telemetry_tables` additions ×2 (#4 above)
**Estimate:** 4 items
**Deliverables:** Two WARN checks that tell the truth; two `telemetry_tables` arrays that match what steps actually write; golden re-captures for affected steps

### Sweep 3 — metrics.ts Race + Column Parity (Cross-Domain WF3)
**Scope:** `src/lib/quality/metrics.ts` · `src/app/api/quality/refresh/route.ts`
**Items covered:** Pilot 8 Finding 7 (all sub-items: advisory lock, column parity, parallel dispatch fix)
**Estimate:** 1 anchor item, 3 sub-deliverables
**Deliverables:** Advisory lock (Spec 47 §A.5 ID); INSERT column list aligned to pipeline script's 68; serial dispatch replacing the parallel pathology pattern; tests covering the lock and both conflict paths

---

## 4. Queue Health

| Dimension | Value |
|-----------|-------|
| Total sections | 40+ (file: 4,346 lines) |
| Earliest open section | 2026-05-08 (WF2 neighbourhood FK repair deferrals) |
| Most recent section | 2026-10-12 (H3 compute purity) |
| Prior triage file | None (first run) |
| Stale items confirmed | 4 fully stale, 1 partially stale (tracking cleared / substance open) |

**Open HIGH+ items still requiring action (estimated — not exhaustive):**
- Spec 126 §A: public projections ×2, entity_contacts, remaining audit gaps, lead search rate-limit (~5)
- Pilot 8: metrics.ts race condition (1)
- P0: `dataset_version_when_enriched` stamps ×3 (1 grouped item)
- Spec 126 §B: dead meter `useLeadView` / `usage_events` retirement (1)
- FLEET-2 follow-ups 2026-10-06: overlay slivers E1 sibling (HIGH), `assert_global_coverage` >100% plausibility (MED)
- WF3 EP-PHASE-DEADLINE: `enrich_parcels` pass5 60-min timeout never validated against real completed pass-5 duration (HIGH-risk; deployed but unverified)

**Open MED items in the 30-60 day range (actionable but not urgent):**
- WF1 cross-step ledger: snapshot freshness standing gate (MED); false ordering lock in `chain.logic.test.ts` (MED)
- WF3 EP: `enrich_parcels_pass3_scope.run_id` not ledger id (MED); `existing_structure` 4.5× regression root cause uninvestigated (MED, now unblocked)
- Spec 122 §S2-min: non-blocking FAIL invisible to `/api/quality` (MED)
- sql-witness resolver: qualified-star silent on unknown qualifier; advisory-lock detection swallows subquery reads; PG18 RETURNING old/new aliases (3× MED)

**Long-tail (>4 months, DEFER-accepted):**
Spec 65 Phase 2/3 enrich-parcels defers (incremental staleness on overlay/massing changes, prim/allb perf scoping, `existing_greenspace` overlap subtraction) — all accepted limitations, no urgency without an active consumer building on those fields.

---

_Triage report generated 2026-10-19 by automated scheduled routine. Do NOT mutate `review_followups.md` — this is a read-only snapshot._
