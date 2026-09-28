# Review-Queue Triage — 2026-09-28

_Automated weekly triage run against `docs/reports/review_followups.md` (4,155 lines, no prior triage to delta against — first run)._

---

## 1. Stale Items (grep-confirmed resolved, not yet struck from followups.md)

### S1 — Spec 126 §A: 11 admin routes missing `verifyAdminAuth` (**HIGH** → RESOLVED)
**Evidence:** Direct grep of all 11 named routes confirms `verifyAdminAuth` is present and called as first statement:
`admin/stats`, `admin/rules`, `admin/sync`, `admin/builders`, `admin/market-metrics`,
`admin/pipelines/runs`, `admin/pipelines/status`, `admin/pipelines/history`,
`admin/pipelines/schedules`, `admin/control-panel/configs`, `admin/control-panel/resync`.
The stats route carries an inline datestamp comment: *"Until 2026-09-15 this route had none"*
(matching WF3 SEC-1 from Spec 126 research). No further action; mark CLOSED in followups.md.

### S2 — Spec 126 §A: `/api/permits/[id]` serves whole `parcels` row (**HIGH** → RESOLVED)
**Evidence:** `src/app/api/permits/[id]/route.ts:111` carries `// §4.3 explicit allow-list, never SELECT *`
with a named-column query. The `pa.*` spread that caused unauthenticated column disclosure is gone.

### S3 — Spec 126 §A: `/api/builders/[id]` serves all `entity_contacts` rows (**HIGH** → RESOLVED)
**Evidence:** Route imports `selectList(ENTITY_CONTACT_PUBLIC_COLS)` from `@/lib/api/public-projections`
and uses it in the query. The unbounded `SELECT *` is gone.

### S4 — Spec 126 §A: stats GET calls `reapStaleRunningRows()` as a write side-effect (**MED** → RESOLVED)
**Evidence:** `src/app/api/admin/stats/route.ts:15–26` contains a multi-line comment confirming the
reaper was removed 2026-09-15 per WF3 SEC-1 (Spec 128 ASK-12). Route is now read-only by contract.
`src/lib/admin/reap-stale-runs.ts` is retained for the future ASK-12 JOB.

### S5 — link_massing LM-D6/LM-D11: WARN conversion never delivered (**HIGH** → RESOLVED)
**Evidence:** The followups.md section itself was already updated with `RULED/CLOSED (WF3, 2026-08-30)`
text pointing to commit `9019c3d3`. Violations test `src/tests/steps/link_massing/violations.test.ts`
confirms `STANDING_WARN_BY_DESIGN`. This section's header still reads as open; the body contains
the resolution. Safe to archive to the historical index.

**Net: 3 confirmed HIGH + 1 MED + 1 HIGH eliminated from the active queue.**

---

## 2. Top 5 Actionable Items This Week

### #1 — parcels P-D6: geometry_repair arm undeclared (HIGH, Backend WF3)
**Source:** `docs/reports/review_followups.md` §"2026-09-24 — engine + golden residue"
**File:** `scripts/load-parcels.descriptor.json` — `execution.geometry_repair` field absent
**Why this week:** The item's own prerequisite ("fix after 0t lands") is satisfied — commit `5ece69b`
(2026-09-xx) explicitly names "0t follow-on" landing. 16 invalid geometries are live in `parcels`
because the converted step uses the library's default repair arm instead of the legacy loader's raw
`ST_SetSRID(ST_GeomFromGeoJSON(...))` write. Until declared, the behaviour divergence is invisible
to anyone reading the descriptor. Either add `"geometry_repair": "none"` to restore legacy semantics
or take an operator ruling and document it; either way the decision must be recorded.
**Rationale:** (a) HIGH severity, (b) `parcels` is the widest fanout table in the estate,
(c) prerequisite now unblocked.

### #2 — `metrics.ts` duplicate snapshot with no advisory lock (HIGH, Cross-Domain WF3)
**Source:** §"Pilot 8 (`refresh_snapshot`) Finding 7 — admin dual-path re-implementation (2026-09-03)"
**Files:** `src/lib/quality/metrics.ts`, `src/app/api/quality/refresh/route.ts`
**Why this week:** No advisory lock confirmed by direct grep (`grep -n "advisory" src/lib/quality/metrics.ts` → zero hits). A concurrent pipeline-triggered `refresh_snapshot` and an admin "Refresh Now" click both target the same `ON CONFLICT (snapshot_date)` row with no coordination — silent partial overwrites. Additionally `metrics.ts` is missing 7 columns vs the pipeline script (4 `cost_estimates_*` + 3 `timing_calibration_*`). Filed 2026-09-03, no progress. Fix: add `ADVISORY_LOCK_ID` per Spec 47 §A.5 registry or retire the duplicate in favour of calling the pipeline's own query builders.
**Rationale:** (a) HIGH severity, (b) unblocked — no prerequisite, (c) the admin "Refresh Now" trigger is an active user-facing path.

### #3 — step_timeout wiring gap: 20 steps declare ceiling with no runtime enforcement (HIGH, Backend WF2)
**Source:** §"WF3 EP-PHASE-DEADLINE / EP-PASS3-BACKLOG" — `execution.step_timeout` gap
**File:** `scripts/steps/_schema/execution-budget-disposition.json` → `declarations.step_timeout.pending[]`
**Why this week:** The pending list has grown from the originally-cited 10 steps to **20 steps** (confirmed
by reading `execution-budget-disposition.json`): `address_points`, `assert_data_bounds`,
`assert_engine_health`, `assert_global_coverage`, `assert_parcel_sanity`, `assert_schema`,
`compute_centroids`, `compute_parcel_cost_estimates`, `enrich_heritage`, `enrich_ravines`,
`geocode_permits`, `link_massing`, `link_neighbourhoods`, `link_parcel_addresses`, `link_parcels`,
`link_wsib`, `load_centreline`, `load_ravines`, `massing`, `parcels`. Each new step conversion adds
to the gap. `run-chain.js` reads `manifest.scripts[slug].step_timeout_minutes || 0` → INERT if absent;
the declared ceiling is not enforced. Fix: for each step measure real runtime, then set `step_timeout_minutes`
in manifest plus lock both ways in `src/tests/execution-budget-disposition.infra.test.ts` assertion (3).
**Rationale:** (a) HIGH, (b) gap grows with each batch-2 step addition, (c) enrich_parcels incident showed the exact failure mode this closes.

### #4 — manifest.json telemetry_tables omissions for massing + enrich_parcels (MED, Backend WF3)
**Source:** §"WF1 cross-step ledger (Spec 122 §6, LDG-4)" — MED ACT item
**File:** `scripts/manifest.json`
**Why this week:** Verified open by direct parse. `massing` declares `telemetry_tables: ["building_footprints"]`
only — missing `parcel_buildings` which `scripts/load-massing.js:208,222` genuinely `DELETE FROM`.
`enrich_parcels` declares `telemetry_tables: ["parcels"]` only — missing `enrich_parcels_pass3_scope`
which `scripts/enrich-parcels.js:1851` genuinely `INSERT INTO`. Massing just received three major commits
in the last two weeks (batch2 row 3.6), making this the natural post-sweep clean-up moment. Fix: two
one-line additions plus a rationale comment; lock with a conformance test.
**Rationale:** (a) MED but self-contained 30-min WF3, (b) telemetry consumers reading `telemetry_tables`
as ground truth are silently misled for both steps, (c) massing recently active.

### #5 — `parcels_null_address_pct` check permanently unsatisfiable by design (MED, Backend WF3)
**Source:** §"chain_sources WARN classification — two check-calibration defects (2026-08-25)"
**File:** `scripts/load-parcels.descriptor.json` (confirmed: check still present per `load-parcels.descriptor.json:267` note `PR-D2 (PIN, DO NOT FIX — … structurally unsatisfiable as PASS since 2026-05-20 strip`)
**Why this week:** The check WARNs at ~100% on every `chain_sources` run since ADDRESS_NUMBER was
stripped from the source CSV. The note in the descriptor confirms this: McDonald's Airtight L1
(2026-09-26) wired `limit_from_config: parcels_null_address_pct_max` so the bound is now a logic variable,
but the check is **still structurally unsatisfiable** — the comment is explicit that the row exists to
preserve audit visibility of the strip, not to pass. Retire or rebase onto `address_points` bridge
coverage (the documented replacement) so the WARN reflects real architecture, not a stripped column.
**Rationale:** (a) MED, (b) persistent WARN noise degrades the signal quality of `chain_sources` runs
for every team member reading pipeline status.

---

## 3. Proposed Sweep WFs

### Sweep A — "Pipeline telemetry truthfulness" (Backend WF3)
**Scope:** `scripts/manifest.json` + `scripts/link-massing.notes.json` + `scripts/enrich-parcels.descriptor.json`
**Items:**
1. Add `parcel_buildings` to `massing.telemetry_tables` (Top 5 #4 above)
2. Add `enrich_parcels_pass3_scope` to `enrich_parcels.telemetry_tables` (Top 5 #4 above)
3. Correct `massing_zero_link_ghost` founding comment: "measured day-one value 0" is unsupported —
   both recorded cloud rows read 1,395 (chain_sources WARN item #2, MED ACT)
**Estimated items:** 3 | **Blast radius:** manifest + 2 descriptors | **Panel:** Code Reviewer + Observability

### Sweep B — "Admin audit completeness" (Cross-Domain WF3)
**Scope:** 7 admin mutation routes + `src/app/api/leads/search/route.ts`
**Items:**
1–7. Wire `admin_audit_log` rows on the 7 mutations confirmed by Spec 126 §A re-measurement as
     unaudited: `control-panel/configs` PUT, `control-panel/resync` POST, `pipelines/[slug]` POST/DELETE,
     `pipelines/schedules` PUT/PATCH, `rules` POST/PATCH, `leads/watchlist` POST/DELETE,
     `notifications/test-send` POST
8. Add rate-limit / debounce contract to `src/app/api/leads/search/route.ts` (Spec 126 §A MED)
9. Lock: every mutating `/api/admin/**` export both guards and audits
**Estimated items:** ~9 | **Panel:** Security seat mandatory (Spec 08 §10.2)

### Sweep C — "Parcels data integrity" (Backend WF3 + migration)
**Scope:** `scripts/load-parcels.descriptor.json`, `scripts/enrich-parcels.js` (or a migration), `scripts/analysis/parcel-sanity-audit.js`
**Items:**
1. Resolve P-D6 `geometry_repair` declaration — `"none"` to restore legacy semantics or
   operator ruling to keep repair + re-validate 16 invalid geometry rows (Top 5 #1)
2. Add trigger invalidator arms for 3 `*_dataset_version_when_enriched` stamps to
   `trg_parcels_invalidate_on_geom_change()` — same fix shape as mig 245 centroids (Spec 122 §P0 HIGH)
3. Add `existing_width_gt_30m` / `existing_length_gt_100m` BOUND checks + `existing_dim_exceeds_lot_dim`
   INVARIANT to `parcel-sanity-audit.js` (Spec 122 re-baseline MED)
**Estimated items:** 3 | **Panel:** Reality-Check mandatory (adds derived/checked parcel fields)

---

## 4. Queue Health

| Metric | Count |
|--------|-------|
| Severity-tagged rows in file (total, incl. closed) | ~576 |
| Rows marked CLOSED / RESOLVED / DONE / REJECTED / ~~strikethrough~~ | ~121 |
| Estimated net-open items | ~150–170 |
| Of which HIGH (open) | ~20 |
| Of which MED (open) | ~60 |
| Of which LOW / NIT (open) | ~70–90 |
| Stale items confirmed resolved this triage | **5** (3 HIGH + 1 MED + 1 HIGH) |
| Prior triage to delta against | None (first run) |

**Oldest active sections (>4 months dormant, LOW/NIT majority):**
- Spec 42 §6 WF2 R0 deferrals (2026-05-13): ~20 items, mostly operational/LOW
- mig 139 Phase C (2026-05-14): ~13 items, mostly NIT/LOW
- WF1 #C lifecycle timeline (2026-05-11): ~10 items, mostly LOW
- Spec 65 Phase 2/3 (2026-06-22/23): ~23 items combined, mostly DEFER/accepted

**Hygiene note:** Per §"Hygiene Practices" rule 2, items tagged `DEFER` or `Future hardening`
dormant >2 weeks are candidates for archival. The ≥90 LOW/NIT items from the May 2026 batch
(mig 139, Spec 42 §6, WF1-A/B/C, Phase F.4) are the primary archival candidates on the next
WF6 close-out that touches those domains.

---

_Report generated by automated triage routine. Do NOT mutate `review_followups.md`._
_To act on these items: open a WF following the project's CLAUDE.md protocol._
