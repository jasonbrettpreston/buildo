# Review Queue Triage — 2026-10-05

_Automated triage of `docs/reports/review_followups.md`. Source file: 4,206 lines, ~600 table rows._
_Prior triage: none found (first run of this routine)._

---

## 1 — Stale Items (resolved in code, not yet marked in review_followups.md)

Five items filed as open have been silently addressed in code. Evidence below; `review_followups.md` can be annotated on the next WF6 pass that touches these areas.

| Filed severity | Section | Item | Resolution evidence |
|---|---|---|---|
| **HIGH** | 2026-09-15 Spec 126 Group A | `src/app/api/permits/[id]/route.ts` served the whole `parcels` row unauthenticated (`SELECT *`) | Fixed: now `SELECT ${qualify(PARCEL_PUBLIC_COLS, 'pa')}`. Code comment: "§4.3 explicit allow-list — THE disclosure fix of this WF3. `SELECT pa.*` served all 158 `parcels` columns." |
| **HIGH** | 2026-09-15 Spec 126 Group A | `src/app/api/builders/[id]/route.ts` served all `entity_contacts` rows with no projection | Fixed: now `SELECT ${selectList(ENTITY_CONTACT_PUBLIC_COLS)} FROM entity_contacts`. Grep: `builders/[id]/route.ts:61`. |
| **HIGH** | 2026-09-15 Spec 126 Group A | 11 `/api/admin/**` routes had no per-route `verifyAdminAuth` | Fixed: all 23 admin routes now import and call `verifyAdminAuth`. Verified via `grep -l 'verifyAdminAuth' src/app/api/admin/*/route.ts` — every listed route present. |
| **HIGH** | 2026-09-15 Spec 126 Group A | 7 admin mutations wrote no `admin_audit_log` row (configs, resync, pipelines/[slug], schedules, rules, watchlist, test-send) | Fixed: all 7 now call `writeAdminAudit`. Verified per-route: `configs/route.ts:106`, `[slug]/route.ts:122+182`, `schedules/route.ts:81+147`, `rules/route.ts:87+184`, `watchlist/route.ts:381+457`, `test-send/route.ts:82`, `resync/route.ts:60+`. |
| **MED** | 2026-09-03 cross-step ledger | `chain.logic.test.ts:173-174` false ordering lock (`enrich_ravines == link_parcels + 1`) | Retired in-place: lines 173–176 now read `// RETIRED (L-A, LDG-10 class 5, plan Fold 14): "enrich_ravines == link_parcels + 1". Fence: the pin / existed to keep enrich_ravines after its inputs…`. Item marked ACT with "do not fix here" is now done. |

**Net:** 4 HIGH + 1 MED security/compliance items are fully resolved without being marked. The 2026-09-15 Spec 126 security WF3 clearly shipped — the review_followups.md entry pre-dates it and was never updated.

---

## 2 — Top 5 This Week

Ranked by: (a) severity, (b) items unblocked, (c) recency of related commits.

### #1 — `captureDataQualitySnapshot` has no advisory lock — live race condition (HIGH)

**File:** `src/app/api/quality/metrics.ts:23`
**Filed:** 2026-09-03 (Pilot 8, Finding 7)
**Rationale:** The admin "Refresh Now" route calls this function, which performs the same queries as `scripts/refresh-snapshot.js` but acquires no advisory lock (`grep -n "advisory" src/lib/quality/metrics.ts` → zero hits). Two concurrent executions targeting `ON CONFLICT (snapshot_date)` with no coordination can race and corrupt the `data_quality_snapshots` row. The function also carries 61 columns vs the pipeline script's 68 (missing `cost_estimates_*` and `timing_calibration_*`). This is a _live_ race, not latent — every admin page load on a day when `refresh_snapshot` runs is an opportunity. Fix: add `ADVISORY_LOCK_ID` per Spec 47 §A.5 registry. Small, bounded change.

### #2 — step_timeout_minutes pending list has grown to 20+ converted steps (HIGH)

**Files:** `scripts/manifest.json`, `scripts/steps/_schema/execution-budget-disposition.json:pending[]`
**Filed:** 2026-09-15 EP-PHASE-DEADLINE (originally 10 steps; grew with every batch-2 cutover commit)
**Current state:** `scripts/manifest.json` has `step_timeout_minutes` only for `enrich_parcels` (180m) and `refresh_snapshot` (15m). The pending list in execution-budget-disposition.json now lists: `compute_centroids`, `link_massing`, `link_parcel_addresses`, `link_parcels`, `link_wsib`, `load_ravines`, `assert_data_bounds`, `assert_engine_health`, `assert_global_coverage`, `assert_schema`, `geocode_permits`, `assert_parcel_sanity`, `enrich_ravines`, `enrich_heritage`, `compute_parcel_cost_estimates`, `address_points`, `parcels`, `load_centreline`, `massing`, `neighbourhoods`, `load_wsib`, `load_heritage`, `enrich_centreline` (added 2026-10-04 per recent commit `2770d7d0`).
**Rationale:** Every one of these steps is declared with a ceiling that is inert in production — `run-chain.js` reads `manifest.scripts[slug].step_timeout_minutes || 0` and `0` is INERT per its own docblock. A stuck step in any of the 20+ runs forever until the CI ceiling (or an operator) kills it.
**Sequencing note:** Per Spec 124 R-AQ, each ceiling must be set from a real _cloud_ measurement. The prerequisite is the batch-2 CLOUD PARTIAL RUN (branch `wf2/deep-scrapes-restore-l0`). This item is not actionable until that run completes and per-step durations are captured; surfacing it now so it is the first WF2 scheduled after the cloud run merges.

### #3 — manifest.json telemetry_tables two confirmed omissions (MED)

**File:** `scripts/manifest.json:16,18`
**Filed:** 2026-09-03 cross-step ledger
**Current state (verified):**
- `massing` entry (line 16): `"telemetry_tables": ["building_footprints"]` only. `scripts/load-massing.js:208,222` genuinely `DELETE FROM parcel_buildings`. `parcel_buildings` is missing.
- `enrich_parcels` entry (line 18): `"telemetry_tables": ["parcels"]` only. `scripts/enrich-parcels.js:1851` does `INSERT INTO enrich_parcels_pass3_scope`. That table is missing.
**Rationale:** Whatever consumes `telemetry_tables` as ground truth (observability, the step inspector, future auditing) is blind to these two tables. Small, high-confidence fix: add both entries + a lock. Marked ACT since 2026-09-03; no commits have addressed it.

### #4 — massing_zero_link_ghost comment asserts "day-one value 0" but no observation has ever recorded that (MED)

**File:** `scripts/enrich-parcels.js` (~:1896–1901)
**Filed:** 2026-08-25
**Current state:** `git log --all -S 'massing_zero_link_ghost' --oneline` returns no fix commits since filing. The comment claims "Measured day-one value 0 (backfill ruling) — WARN, forward-looking" but both cloud rows ever recorded for this metric (runs 3456, 3485, both 2026-08-24) show 1395 — the oldest available baseline. This is not a post-fix regression: either 1395 orphaned massing links are a real data defect (which would upgrade to HIGH) or the "day-one" claim was measured against a different DB and was never true on cloud.
**Rationale:** Sat unresolved for 6 weeks. Either the comment is wrong (trivial fix: correct it + document what 1395 means) or 1395 is wrong (WF3: fix the orphaned links, which is a data correctness issue). The investigation required is small.

### #5 — lineage-meta-snapshot freshness has no standing gate (MED)

**Files:** `scripts/generate-lineage-docs.mjs`, `src/tests/step-conformance.infra.test.ts`
**Filed:** 2026-09-03 (confirmed with second concrete instance same session)
**Current state:** `KNOWN_GAPS.link_parcels` in `step-conformance.infra.test.ts` still holds `['compute_centroids']` — per the filing, this gap stays until a freshness check lands and a real `--refresh` clears it. `git log --all -S 'snapshot freshness'` returns no matching fix commits.
**Rationale:** `lineage-meta-snapshot.json` is regenerated only by manual `--refresh` and its `--check` mode diffs doc vs snapshot, never snapshot vs live descriptor truth. Stale snapshot misleads the seam graph and keeps KNOWN_GAPs artificially non-empty. Two confirmed instances; the fix is a conformance assertion, not a code change.

---

## 3 — Proposed Sweep WFs

### Sweep A: Data quality observability — `captureDataQualitySnapshot` + snapshot freshness (WF3, Cross-Domain)

**Scope:** `src/lib/quality/metrics.ts`, `src/app/api/quality/refresh/route.ts`, `scripts/generate-lineage-docs.mjs`, `src/tests/step-conformance.infra.test.ts`
**Items consolidated:** #1 (advisory lock) + #5 (freshness gate) — both address the "a tool claims to represent live state but has no guard against concurrent mutation or stale reads" failure class.
**Estimated items:** 2 active, 1 test lock per fix.
**Panel:** Cross-Domain (admin API + pipeline script), security seat for the advisory lock.

### Sweep B: manifest.json safety WF2 (Backend/Pipeline)

**Scope:** `scripts/manifest.json`, `scripts/steps/_schema/execution-budget-disposition.json`
**Items consolidated:** #3 (telemetry_tables omissions) now; #2 (step_timeout wiring for 20+ steps) once the batch-2 cloud partial run produces real durations.
**Estimated items:** 2 now-actionable (telemetry_tables) + the timeout sweep on the cloud run gate.
**Panel:** Standard Backend/Pipeline 3-reviewer (DeepSeek + Code Reviewer + Integration), Reality-Check if any data field interpretation changes.

### Sweep C: Engine v1.1 WF2 (Backend/Pipeline)

**Scope:** `scripts/deepseek-exec.js`, `scripts/lib/exec-tools.js`
**Items consolidated:** 2026-09-27 engine-fence residue: (1) provider-downgrade stderr not redacted, (2) `edit_file` no size cap, (3) committer-lock reclaim race, (4) hook failure after `git add` leaves paths staged. All 4 items are in the same two files.
**Estimated items:** 4 items (3 MED, 1 LOW).
**Panel:** Standard 3-reviewer + Security seat (touches the engine's own security invariants).

---

## 4 — Queue Health

| | Count |
|---|---|
| File size | 4,206 lines, ~600 table rows |
| Prior triage reports | 0 (first run) |
| Items in first ~440 lines read | ~85 rows |
| Of those: RESOLVED/CLOSED/REFUTED | ~35 (41%) |
| Of those: open HIGH/CRIT | ~18 |
| Of those: stale HIGH (resolved in code) | 5 (this report) |
| Open MED in first 440 lines | ~25 |
| Open LOW in first 440 lines | ~15 |

**Trend (extrapolated):** The file grows by ~50–80 rows per active WF cycle. The last 14 days added ~10 rows (engine + chain_args + deep-scrapes WF residue). The Spec 126 security WF3 resolved a block of 4 HIGH items that remain marked open — the effective HIGH count is lower than the raw file suggests.

**Key blocker class:** 20+ converted steps with inert `step_timeout` declarations — this class will shrink in one batch once the batch-2 cloud partial run lands. Not a queue health concern so much as a planned pending sweep.

**Recommendation for next sweep:** Sweep A (advisory lock + snapshot freshness gate) is the highest-value work that is unblocked today — small scope, concrete fix, addresses a live race. Schedule as a Cross-Domain WF3 this week.

---

_Triage produced by automated routine. Source: `docs/reports/review_followups.md`. Errors or stale-item corrections: amend `review_followups.md` in the next WF6 that touches affected code._
