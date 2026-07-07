# Shared Pipeline Steps

<requirements>
## 1. Goal & User Story
These 8 transformation steps run in multiple chains — they can't live inside a single chain spec. Each links, enriches, or validates permit data using shared reference tables.
</requirements>

---

<architecture>
## 2. Step Registry

| Slug | Script | Chains | Reads | Writes |
|------|--------|--------|-------|--------|
| `geocode_permits` | `geocode-permits.js` | permits, sources | permits, address_points | permits (lat/lng) |
| `link_parcels` | `link-parcels.js` | permits, sources | permits, parcels | permit_parcels |
| `link_neighbourhoods` | `link-neighbourhoods.js` | permits, sources | permits, neighbourhoods | permits (neighbourhood_id) |
| `link_massing` | `link-massing.js` | permits, sources | parcels, building_footprints | parcel_buildings |
| `link_wsib` | `link-wsib.js` | permits, sources | entities, wsib_registry | entities |
| `link_coa` | `link-coa.js` | permits, coa | coa_applications, permits | coa_applications, permits (back-ref + last_seen_at) |
| `create_pre_permits` | `create-pre-permits.js` | permits, coa | coa_applications | permits (synthesized `PRE-` rows) |
| `refresh_snapshot` | `refresh-snapshot.js` | all chains | 9 tables (parallel counts) | data_quality_snapshots |
</architecture>

---

<behavior>
## 3. Step Details

### Geocode Permits (`geocode-permits.js`)
**Modes:** Incremental (default: only NULL coords) / Full (`--full`: all permits)

1. Query permits where `latitude IS NULL`
2. Match against `address_points` table by street number + name
3. If no match: fall back to Google Maps Geocoding API
4. Update `permits.latitude`, `permits.longitude`

**Edge Cases:** Google API quota exhausted → permits left with NULL coords, skipped by downstream spatial linking. No address_points loaded → all falls to Google (expensive).

**Testing:** `geocoding.logic.test.ts`

---

### Link Parcels (`link-parcels.js`)
**Modes:** Incremental / Full (`--full` in sources chain)
**Method:** Nearest-neighbour bbox (0.001°) + polygon containment upgrade

1. For each geocoded permit: find nearest parcels within bounding box
2. Check `booleanPointInPolygon` for precision upgrade
3. Record match type: `spatial_polygon` or `spatial_centroid`
4. Batch upsert to `permit_parcels`

**Edge Cases:** Permit outside all polygons → centroid-only match. No parcels in bbox → no link.

**Testing:** `parcels.logic.test.ts`

---

### Link Neighbourhoods (`link-neighbourhoods.js`)
**Method:** Turf.js `booleanPointInPolygon` for 158 neighbourhood boundaries

1. Load all 158 neighbourhood polygons as Turf features
2. For each permit with coordinates: test against each polygon
3. Update `permits.neighbourhood_id` (sentinel `-1` for unmatched)

**Edge Cases:** No coordinates → skipped. N+1 query pattern (individual UPDATE per permit — known perf issue).

**Testing:** `neighbourhood.logic.test.ts`

---

### Link Massing (`link-massing.js`)
**Modes:** Incremental / Full (`--full` in sources chain)
**Method:** Nearest-neighbour spatial match within bbox
**Safeguard:** Parameter flush at 30,000 params (§9.2)

1. Process parcels in batches of 500 (keyset pagination)
2. For each parcel: find building footprints within spatial bbox
3. Associate via `parcel_buildings` junction table
4. Flush INSERT when approaching 30K parameter limit

**Edge Cases:** Dense urban areas → parameter flush prevents PG limit breach.

**Testing:** `massing.logic.test.ts`

---

### Link WSIB (`link-wsib.js`)
**Method:** Fuzzy string matching (Levenshtein distance)

1. Query entities without WSIB match (or stale)
2. Compare `normalized_name` against `wsib_registry.legal_name_normalized`
3. Exact match → high confidence. Fuzzy within threshold → lower confidence.
4. Update entity with WSIB status + match timestamp

**Edge Cases:** Generic names → may match wrong WSIB entry. WSIB refresh → re-run linking.

**Testing:** `wsib.logic.test.ts`

---

### Link CoA (`link-coa.js`)
> **Status (verified 2026-07-07 against `scripts/link-coa.js`):** current contract below supersedes the
> pre-2026-07 "3-tier / 0.95-0.60-0.30" summary. The authoritative source for the enrichment/back-ref
> passes is `42_chain_coa.md` §6.6.D / §6.6.X / §6.11 Phase D R5.1+R5.6; this section is the shared-step
> summary. `link_coa` runs in BOTH chains: **permits chain step 20/32** (`link_coa` at index 19) and
> **coa chain step 9/16** (index 8) — verified in `scripts/manifest.json`.

**Method:** Multi-tier cascade address matching (exact → street-name → description FTS). Ward is a
confidence *booster*, not a gatekeeper (~80% of permits have NULL ward, so requiring it would blind the
linker). `Pre-Permit` synthetic permits are excluded from every tier.

**Confidence matrix** (with live distribution over `coa_applications.linked_confidence`, 2026-07-07):

| Tier | Match basis | Confidence | Live count |
|------|-------------|-----------:|-----------:|
| 1a | street_num + street_name_normalized + ward match | 0.95 | 14,393 |
| 1b | street_num + street_name_normalized, permit ward NULL | 0.85 | 858 |
| 1c | street_num + street_name_normalized, ward **conflict** (flagged for review) | 0.10 | (in 0.10 bucket) |
| 2a | street_name_normalized + ward match (no street_num) | 0.60 | 3,272 |
| 2b | street_name_normalized, permit ward NULL | 0.50 | 3,946 |
| 3  | description FTS (`plainto_tsquery`, batched via unnest + CROSS JOIN LATERAL) | 0.26–0.50 | ~10,600 (largest bucket 0.35 = 4,610) |
| —  | ward-conflict (1c) + FTS fallback | 0.10 | 1,683 |
| —  | unmatched (no linkable street/description) | NULL | 221 |

Tier order is a waterfall: each tier's UPDATE only touches rows still `linked_permit_num IS NULL`, so a
row settles at its highest-confidence tier. Multiple permits at one address → most recent
(`COALESCE(issued_date, application_date) DESC`, then highest `permit_num`) wins via `DISTINCT ON (ca.id)`.

**Cross-ward unlink pre-pass:** before linking, the script UNLINKs any CoA whose retained ward disagrees
with its linked permit's ward (`LTRIM(ward,'0')` compare, excluding the intentional 0.10 Tier-1c
matches). It also NULLs the corresponding `permits.linked_coa_application_number` back-ref when no other
CoA still references that permit (`stale_back_refs_cleared_count` audit row). This clears drift left by
prior runs before the tiers re-link.

**Back-ref pass — confidence floor (WF2 2026-07, `permits.linked_coa_application_number`):** the back-ref
is now **floored at `>= coa_inherit_from_permit_min_confidence` (default 0.60 = `inheritConfMin`)**, matching
the five geo-inheritance passes below (previously it had NO floor and would write a parent-context signal
off a link as weak as a Tier-3 FTS guess). It runs **clear-then-set** in one transaction:
1. **CLEAR** the back-ref on any permit that no longer has *any* CoA link `>= 0.60`.
2. **SET** the authoritative back-ref from the floored subquery, tie-broken APPROVED-decision-first →
   `decision_date DESC` → `application_number`, with an `IS DISTINCT FROM` guard (no WAL bloat on re-run).

Audit row `permits_back_ref_cleared_below_floor` records the CLEAR count. **WHY it matters (orphan-delta
contract):** `computeIsOrphan` (`scripts/lib/orphan-detection.js`) treats *any* non-null back-ref as CoA
parent context and suppresses orphan status — so sub-floor FTS guesses were silently masking genuinely
standalone permits. Flooring the back-ref lets those permits surface as orphan candidates. **Measured
orphan-delta on the corpus: 339 permits (2026-07-07).** This is the ACCEPTED consequence of the floor,
not a regression.

**Geo-inheritance passes (Phase D R5.6, all share the 0.60 floor):** for CoAs linked `>= inheritConfMin`,
inherit the best permit-revision's authoritative `latitude`/`longitude` (atomic pair — never half a
coordinate) and FILL NULL `ward` (`COALESCE(ca.ward, permit.ward)` — CoA ward stays authoritative when
present). Guarded by `IS DISTINCT FROM` for idempotency. Observability rows: `enrichment_eligible_count`,
`coa_inherited_from_permit_count`, `coa_lat_lng_upgraded_from_permit_count`, `coa_ward_filled_from_permit_count`,
`coa_ward_mismatch_with_permit_count`, `coa_below_confidence_floor_count`, `inherited_confidence_floor`.

Newly-linked permits also get `last_seen_at` bumped (SKIP_PHASES-excluded) so the downstream lifecycle
classifier re-processes them. Verdict is driven by `effective_match_rate_pct` (exact-address links vs
achievable matches; `>= 50%` PASS) — a steady-state residual pool with no achievable matches is PASS, not FAIL.

**Edge Cases:** ward conflict → retained at 0.10 and flagged, not dropped. Concurrent `geocode-permits`
lat/long write between enrichment and the post-check → `lead_identity_lat_lng_mismatch_count` WARN (not
FAIL); repaired on the next chain run via the `IS DISTINCT FROM` guard.

**Testing:** `coa.logic.test.ts`

---

### Create Pre-Permits (`create-pre-permits.js`)
**Mutating step** — INSERTs synthesized `PRE-${application_number}` placeholder rows into the `permits` table for approved-but-unlinked CoAs, then DELETEs aging Pre-Permits past the 18-month threshold. Correction landed 2026-05-11 (WF2 #coa-spec-amendments) — prior spec text incorrectly described this as "read-only reporting."

1. Query approved CoA applications where `linked_permit_num IS NULL`.
2. **Step 1 — INSERT placeholders:** for each eligible CoA, `INSERT INTO permits (permit_num, revision_num, permit_type, status, …)` with `permit_num = 'PRE-' || application_number` and `revision_num = '00'`. Uses `ON CONFLICT (permit_num, revision_num) DO NOTHING` for idempotency — safe to re-run; existing PRE- rows pass through unchanged.
3. **Step 2 — Expire aging Pre-Permits:** DELETEs `permits` rows where `permit_num LIKE 'PRE-%' AND created_at < NOW() - INTERVAL '<pre_permit_expiry_months> months'`. The expiry months are read from `logic_variables` (default 18). Also DELETEs the dependent `permit_trades` and `permit_parcels` rows in the same transaction to preserve FK integrity.
4. Emit `records_meta` with `pre_permits_generated` + `aging_leads_expired` counts.

**Application gets linked to a real permit later** → the synthesized PRE- row remains in the `permits` table until the 18-month expiry; the corresponding CoA's `linked_permit_num` is updated to the REAL permit by `link-coa.js` on the next chain run.

**Idempotency:** confirmed via `ON CONFLICT DO NOTHING` (line 95 of script) — re-running produces 0 new rows after the first invocation has covered all eligible CoAs.

**Test coverage status (snapshot 2026-05-11):** the script's actual INSERT-into-permits mutation is currently **NOT covered** by any test. `coa.logic.test.ts` exercises the TS mapping helper `src/lib/coa/pre-permits.ts mapCoaToPermitDto()` — the pure function that translates a CoA row into a permit-DTO shape — but does not run the script's SQL. `pre-permit-aging.infra.test.ts` covers the script's `logic_variables.pre_permit_expiry_months` wiring and the "no hardcoded INTERVAL" regression but not the INSERT. Pre-existing gap; future WF should add an infra test that runs the script against a seeded fixture DB and asserts the PRE- row count + idempotency on re-run.

**Edge Cases:** Application gets linked later → see paragraph above. >18 months → flagged by `assert_pre_permit_aging` AND removed by Step 2.

**Testing:** `coa.logic.test.ts` (TS mapper only) + `pre-permit-aging.infra.test.ts` (logicVars wiring only); INSERT-mutation test pending.

---

### Refresh Snapshot (`refresh-snapshot.js`)
**Runs in ALL chains** — final infrastructure step.

1. Run 9+ parallel counting queries against live DB
2. Compute coverage rates and Data Effectiveness Score (0-100) as weighted average:
   trades 25%, builders 20%, parcels 15%, neighbourhoods 15%, geocoding 15%, CoA 10%
3. Upsert to `data_quality_snapshots` via `ON CONFLICT (snapshot_date) DO UPDATE`
4. Include inspection coverage metrics

**Edge Cases:** `active_permits = 0` → division by zero guarded. Massing query fails → caught, defaults to 0.

**Testing:** `quality.logic.test.ts`, `quality.infra.test.ts`
</behavior>

---

<constraints>
## 4. Operating Boundaries

### Target Files
- `scripts/geocode-permits.js`, `scripts/link-parcels.js`, `scripts/link-neighbourhoods.js`
- `scripts/link-massing.js`, `scripts/link-wsib.js`, `scripts/link-coa.js`
- `scripts/create-pre-permits.js`, `scripts/refresh-snapshot.js`

### Cross-Spec Dependencies
- **Consumed by:** `chain_permits.md`, `chain_coa.md`, `chain_sources.md`
- **Relies on:** `pipeline_system.md` (SDK), source specs (reference data tables)
- **Operator-facing audit surface (WF2 #4 2026-05-08):** the admin Lead Detail Inspector (Spec 76 §3.5 Cycle 7) renders every output of these shared steps in its Spatial panel — parcel id + `area_sqm` (lot size), parcel_buildings `area_sqm` (footprint) + `height_m` + `stories`, neighbourhood id + name + `avg_household_income` + `period_of_construction`. Operators can audit per-permit which spatial joins succeeded without dropping to psql.
</constraints>
