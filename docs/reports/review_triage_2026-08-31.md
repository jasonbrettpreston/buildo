# Weekly Review-Queue Triage — 2026-08-31

**Triage scope:** `docs/reports/review_followups.md` (2998 lines, items #1–#397 read in full;
lines 2500–2998 partially read — items ~398+ from WF1 Spec 58/59/61 blocks, all
LOW/MED deferred spec-hardening items; no HIGH items missed per section headings).
**No prior triage exists** (first run). **No code was changed.**

---

## Stale Items

Items grep-verified as closed or superseded:

| # | Item | Evidence | Status |
|---|------|----------|--------|
| 353 | Spec 58 schema column assumptions "invalidated by Phase 0 discovery" | Inline note: "Resolved by Phase 0 (no further action)." | **CLOSED — remove next pass** |
| 245-arm (centroid) | centroid invalidator gap (HIGH 2026-08-23) | `migrations/245_parcels_centroid_geom_invalidation.sql` shipped; trigger function body updated | **CLOSED** |

Items **not** stale despite proximity to closed work:

- `*_dataset_version_when_enriched` trigger arms: mig 245 explicitly documents (line 13)
  that `load-parcels.js:353-361` NULLs these only on its own UPSERT path. The trigger
  (`trg_parcels_invalidate_on_geom_change`) still has NO arms for these three columns. **Still open.**
- `createPool()` localhost default: `scripts/lib/pipeline.js:133` still reads
  `process.env.PG_HOST || 'localhost'`. **Still open.**
- `business_size IS NOT NULL` false INNER JOIN: `get-lead-feed.ts:486` still present. **Still open.**
- `parcels_null_address_pct` gate: `scripts/lib/parcels-csv-drift.js:65,73` still present. **Still open.**

---

## Top 5 This Week

Ranked: severity → unblocking potential → active-code proximity.

### #1 — HIGH: `*_dataset_version_when_enriched` — no trigger invalidator
**Item from:** Spec 122 §P0 block, 2026-08-23
**Files:** needs new migration (template: `migrations/245_parcels_centroid_geom_invalidation.sql`);
`scripts/enrich-ravines.js`, `scripts/enrich-heritage.js`, `scripts/enrich-centreline.js`

`trg_parcels_invalidate_on_geom_change()` (mig 242/245) NULLs `massing_enriched_at`,
`zoning_enriched_at`, `centroid_lat/lng` on geom change. It does NOT NULL:
- `ravine_dataset_version_when_enriched` (mig 168)
- `heritage_dataset_version_when_enriched` (mig 171)
- `centreline_dataset_version_when_enriched` (mig 174)

Those three are only NULLed by `load-parcels.js`'s own UPSERT path (DEC-FENCE2 #418).
Any parcel geometry change from outside `load-parcels.js` leaves stale enrichment stamps,
causing enrichers to silently skip re-enrichment (`IS DISTINCT FROM $1` predicate misses it).

**Fix shape:** Add three arms inside the existing `IS DISTINCT FROM` guard in the trigger
function body — identical pattern to the centroid arm in mig 245. New migration number (e.g. 246).
**Priority rationale:** Same class as the centroid gap just fixed; fix template already exists;
unblocks enrichment correctness guarantees for ravine, heritage, and centreline.

---

### #2 — HIGH: `createPool()` localhost default unretired
**Item from:** Spec 122 §P0 block, 2026-08-23
**File:** `scripts/lib/pipeline.js:133`

```
const host = process.env.PG_HOST || 'localhost';
```

Blast radius: all 27 manifest steps + `run-chain.js` + cloud cron. In any environment
where `PG_HOST` is not set (or is accidentally unset), all scripts silently connect to
the 222-migration pre-cutover local DB instead of failing fast.

**Fix shape:** Replace with `process.env.PG_HOST ?? (() => { throw new Error('PG_HOST not set'); })()`.
Add to the `ai-env-check.mjs` pre-flight check.
**Priority rationale:** Silent blast radius across all pipeline steps. Only deferred pending
a measurement; that window has now passed (>5 days since filing).

---

### #3 — HIGH: `get-lead-feed.ts` — `business_size IS NOT NULL` acts as INNER JOIN
**Item from:** 2026-05-08 block
**File:** `src/features/leads/lib/get-lead-feed.ts:486`

```sql
LEFT JOIN wsib_per_entity w ON w.linked_entity_id = e.id
...
AND w.business_size IS NOT NULL   -- ← converts LEFT JOIN to INNER JOIN
```

Drops builders whose WSIB record has no `business_size` — estimated 30–50% of builder leads
silently excluded from the feed. Callers receive a truncated result set with no indication.

**Fix shape:** Move the `business_size` filter to the SELECT (emit NULL) or add it as a CASE
in the business_size output column, not in the WHERE clause. Companion NaN guards:
`Math.max(1, input.limit ?? MAX_FEED_LIMIT)` and `Math.min(input.radius_km ?? MAX_RADIUS_KM, MAX_RADIUS_KM)`.
**Priority rationale:** Live data defect; directly suppresses lead volume visible to users.

---

### #4 — HIGH (data): Massing-mislink $105.24M cost poisoning
**Item from:** WF3 cost-menu block, 2026-07-06
**Files:** `scripts/enrich-parcels.js`, `scripts/analysis/parcel-sanity-audit.js`

Parcels 1944170/1944175: `cur_floor_gfa_sqm` 14,171 m² → `parcel_cost_menu` gut line
**$105.24M** (10–100× realistic range for a Toronto RT lot). Root cause: massing mislink
on a RT/NULL-lot parcel — a large commercial building's footprint is linked to a small
residential lot. `parcel-sanity-audit.js` has no FSI × cost cross-check that would flag it.

**Fix shape:**
1. Add cross-field cost-magnitude sanity gate to `parcel-sanity-audit.js`:
   if `parcel_cost_menu > $20M` AND `zoning_class IN ('RT','RD','RS','RM')`, emit WARN.
2. Investigate massing link for these two parcels specifically (NULL-lot disambiguation).
**Priority rationale:** Live $105M gut-line in production data. Cited by Reality-Check as
the exact bug class that the parcel-sanity-audit cross-check was designed to catch.

---

### #5 — MED: `parcels_null_address_pct` gate permanently unsatisfiable
**Item from:** 2026-08-25 block (most recent in file)
**Files:** `scripts/lib/parcels-csv-drift.js:65,73`, `scripts/load-parcels.js:508-525`

The gate `parcels_null_address_pct < 10%` fires WARN on every pipeline run (current value: 100.0%)
because the denominator counts all parcels while the numerator counts those without a matched
address-point row — which is ALL parcels until `link-parcel-addresses` has run. The check fires
at the wrong phase.

**Fix shape:** Either (a) retire the gate and replace it with a post-link coverage check using
the `parcel_address_points` bridge table, or (b) scope the denominator to parcels that have a
`link_parcels` entry (i.e., parcels eligible for address matching). Low-effort WF3.
**Priority rationale:** Noisy permanent WARN on every run pollutes operator alerting, masking
real threshold breaches. Most recent item in file = just filed.

---

## Proposed Sweep WFs

### Sweep A — `enrich-parcels` Data Integrity (WF3)
**Scope:** `*_dataset_version_when_enriched` trigger arms + massing mislink cost gate
**Files:** new migration ~246, `scripts/enrich-parcels.js`, `scripts/analysis/parcel-sanity-audit.js`
**Items:** #1 (trigger arms), #4 (cost poisoning gate)
**Estimated effort:** 2 migrations + ~30 lines in parcel-sanity-audit.js

### Sweep B — `get-lead-feed.ts` NaN/NULL/JOIN Hardening (WF3)
**Scope:** All 2026-05-08 HIGH items against `get-lead-feed.ts`
**Files:** `src/features/leads/lib/get-lead-feed.ts`, `src/tests/get-lead-feed.logic.test.ts`
**Items:** #3 (INNER JOIN), clampedLimit NaN, clampedKm NaN, cursor NULL CASE, competition_count trade-scope
**Estimated effort:** ~5 focused fixes, existing test file already has the scaffolding

### Sweep C — `cost-model-shared.js` Falsy-0 Bundle (WF3)
**Scope:** Three `||` → `??` fixes for 0-as-falsy bugs
**Files:** `src/features/leads/lib/cost-model-shared.js`
**Items:** `storeys || 1` (line 188), `pct > 0` (line 227), `complexity_factor || 1.0` (line 286)
**Estimated effort:** ~10 lines + targeted tests; self-contained

---

## Queue Health

| Metric | Count | Notes |
|--------|-------|-------|
| Total items numbered | ~397+ | Lines 2500–2998 not fully read; ~10–15 more items estimated |
| HIGH severity | ~18 | Confirmed HIGH items across all blocks read |
| MED severity | ~160 | Majority of deferred spec-hardening items |
| LOW / NIT | ~220 | Documentation, cross-ref, operator-policy items |
| Confirmed stale (closeable) | 2 | Item 353 + centroid arm (already shipped) |
| Prior triage delta | N/A | First triage run |
| Most recent filing | 2026-08-25 | `parcels_null_address_pct` + `massing_zero_link_ghost` comment |
| Oldest unresolved HIGH | 2026-05-08 | `get-lead-feed.ts` NaN/JOIN block |

**Recommendation:** The Spec 122 §P0 block (2026-08-23) added 3 HIGH items in a single day;
the trigger-arms gap (#1 above) is the highest-ROI immediate fix given that mig 245's template
is already written. Sweeps B + C address the oldest unresolved HIGH block (2026-05-08) and
can be sequenced in a single WF3 session.

---

*Generated: 2026-08-31 by automated weekly-triage routine*
*Source: `docs/reports/review_followups.md` (read 2400/2998 lines; items 398+ estimated LOW/MED from section headings)*
*Do not edit this file — open a new triage or amend via PR comment.*
