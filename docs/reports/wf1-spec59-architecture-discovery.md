# WF1 Spec 59 — Phase 0 Architecture Discovery Report

**Phase:** 0 (read-only research; no code/migration changes)
**Date:** 2026-05-25
**WF:** WF1 Genesis — Spec 59 Toronto Ravine + Natural Feature Protection (load + link, spec-only)
**Authorization:** v1.1 Gate 1 authorized 2026-05-25
**Next gate:** v2 PLAN authorization (Gate 2 — before Multi-Agent Review R1)

---

## TL;DR — v2 plan inputs

Phase 0 dissolved or simplified **6 of the 12 v1.1 folds** (C4, C5, H2, H3, H5, H6, H7). The dataset is structurally simpler than v1.1 anticipated:

- **One package, one Shapefile resource, 854 features, single attribute `OBJECTID`, WGS84 native, Polygon + MultiPolygon mix.**
- **Dataset IS the regulated "Protection Area" boundary** (per CKAN description: "Ravine & Natural Feature Protection **area and limit** as regulated by Chapter 658"). There is **no separate ravine + buffer geometry** — the City has already merged them into a single regulatory boundary polygon.
- **No historical archives** in CKAN; refresh cadence is "10–20 years" (essentially static — currency May 2018).
- **Zero existing `permit_type` values** matching `%ravine%` / `%RNFP%` / `%natural feature%` — L5 source-of-truth conflict is currently moot.
- **`parcels.geom` is SRID 4326** ✓ — direct join with ravine geometry, no reprojection.
- **`enrich-parcels.js` does NOT exist** in the repo — only `link-parcels.js` (which does *permit→parcel* linking, not parcel enrichment). H4 fork recommends ravine enrichment becomes a STEP in a future shared `enrich-parcels.js` spec.

### Folds dissolved by Phase 0
- **C4** (3-branch Linking Contract predicate table) → collapses to Branch 1 only: `ST_Intersects(parcels.geom, ravines.geom)`. No `::geography` cast needed since the buffer is pre-baked in the polygon.
- **C5** (full-table-replace fallback for no stable key) → dissolved; `OBJECTID` is a stable integer key analogous to Spec 58's `_id`.
- **H2** (conditional staging-CTE for >2000 features) → 854 features is well under threshold; direct INSERT pattern.
- **H3** (sub-layer topological relationship) → N/A; single-layer dataset.
- **H6** (`ravine_regulated_area_buffer_m` constant seed in `logic_variables.json`) → dissolved; buffer is pre-baked, no constant needed.
- **H7** (multi-layer architecture fork) → dissolved; mirror Spec 58 only for the patterns that apply (advisory lock, empty-set DELETE guard, HEAD skip-check, ST_MakeValid validator); skip the per-layer transactions + per-layer Producer/Consumer keys.

### Folds carried forward
- **C1 (data model enum)** — **needs v2 plan re-decision.** With a single-polygon source, the 4-value enum `'in_ravine' | 'in_regulated_area' | 'adjacent' | 'none'` collapses to 2 observable values (`'in_regulated_area' | 'none'`). See §L1 reconsideration below.
- **C2 (point-in-time semantics)** — confirmed by Q0.13 (no historical data exposed); L3 lock matches data reality.
- **C3 (3 user-authorization gates)** — procedural, untouched.
- **H1 (lock 59 unassigned)** — confirmed via repo grep; lock 59 is FREE (no script claims it).
- **H4 (enrich-parcels ownership)** — Phase 0 recommendation: shared `enrich-parcels.js` future spec (script doesn't exist yet — single migration adds both zoning + ravine columns; one chain step).
- **H5 (RNFP source-of-truth precedence)** — currently moot (zero RNFP permit_type values) but rule preserved in §11 for future-proofing.

---

## Q0.1 — Canonical CKAN package + resource

**Authoritative dataset:** `ravine-natural-feature-protection-area`

- **Title:** "Ravine & Natural Feature Protection area"
- **Owner:** Parks, Forestry & Recreation (City of Toronto)
- **Description:** "Ravine & Natural Feature Protection **area and limit** as regulated by City of Toronto Municipal Code Chapter 658."
- **Tags:** environment, natural feature, ravine, trees
- **Refresh rate per CKAN metadata:** "as available; this dataset will only be refreshed every 10–20 years. Currency: May 2018"

**Single resource:**
| Field | Value |
|---|---|
| Resource ID | `bb81bb0f-f88a-4f3e-bca7-a328154ba31b` |
| Name | `ravine-natural-feature-protection-area-wgs84` |
| Format | SHP (Shapefile, zipped) |
| File size | 4.49 MB |
| Datastore active | **false** (must download + parse Shapefile; no CKAN datastore API access) |
| Direct download URL | `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/ravine-natural-feature-protection-area/resource/bb81bb0f-f88a-4f3e-bca7-a328154ba31b/download/ravine-natural-feature-protection-area-wgs84.zip` |

**Verified by fetching the package_show API + the package_search API for `q=ravine` (Phase 0 step 1, 2026-05-25).**

---

## Q0.2 — Geometry type

**Mixed:** `Polygon` + `MultiPolygon`.

→ **Implication:** `ravines.geom` column must be declared `GEOMETRY(MultiPolygon, 4326) NOT NULL` and the load script must apply `ST_Multi(ST_GeomFromGeoJSON($1))` to coerce singletons (Spec 58 §3 step 5 pattern).

→ No `GeometryCollection` observed (D7 fold dissolves).

Verified by parsing the .shp via the `shapefile` npm library: iterated all 854 features; geometry types = `{Polygon, MultiPolygon}`.

---

## Q0.3 — Source projection

**EPSG:4326 (WGS84) native.** No `ST_Transform` required at load time.

Confirmed by:
- `.prj` file metadata in the shapefile bundle (212 bytes, WGS84 declaration).
- Filename suffix `-wgs84` in the resource name.
- Direct match to Spec 58's zoning dataset projection (same native CRS).

---

## Q0.4 — Stable upsert key

**`OBJECTID`** (integer) is the only attribute on every feature. Sample values from the first 10 rows: 9916273, 9916289, 9916305, 9916321, 9916337, 9916353, 9916369, 9916385, 9916401, 9916417.

→ **Spec 59 §3 upsert pattern:** D1-style upsert keyed on `source_id INTEGER UNIQUE NOT NULL` (mapped from `OBJECTID`). Same contract as Spec 58 with `_id`.

→ **C5 fold dissolves:** no need for the full-table-replace fallback. The empty-set DELETE guard (F-C1 lesson) is still required.

⚠ **Caveat:** `OBJECTID` values appear to be Esri-style auto-generated row IDs (the +16 stride between consecutive values is an Esri internal artefact). They are *stable across CKAN refreshes for now* (per Spec 58 precedent with `_id`), but a future Esri-side reload could rotate them. Spec 59 §3 should add the same "OBJECTID stability assumption" note that Spec 58 has for `_id`.

---

## Q0.5 — Feature count

**854 polygons** total.

→ **Implication for H2 fold:** 854 < 2000 threshold → **direct INSERT pattern**, not staging-CTE. The Spec 58 staging-CTE complexity is unnecessary here. The PostgreSQL parameter limit (65,535 per query) is comfortably accommodated by 854 features × ~3 params per feature = ~2,562 params — well below limit even without batching.

→ Spec 59 §3 step 6 simplifies to a single `INSERT INTO ravines (source_id, geom) VALUES ($1, $2), ($3, $4), ... ON CONFLICT (source_id) DO UPDATE SET geom = EXCLUDED.geom` followed by a single `DELETE FROM ravines WHERE source_id NOT IN ($1, $2, ...)` with the F-C1 empty-set guard.

---

## Q0.6 — Attribute columns

**Single attribute: `OBJECTID`** (Number).

→ The dataset is **purely geometric**. No ravine name, no protection class, no jurisdiction tag, no metadata column. This is unusual compared to Spec 58 (which had `EXCPTN_NO`, `ZN_STRING`, `COVERAGE`, `FSI_TOTAL`, etc.).

→ **Spec 59 schema:** `ravines (id BIGSERIAL PRIMARY KEY, source_id INTEGER UNIQUE NOT NULL, geom GEOMETRY(MultiPolygon, 4326) NOT NULL, source_dataset_version TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`. That's it — 5 columns.

→ **D6 fold (free-text description backfill) is informationally weak:** there's no source-side classification to map to. The 31 ravine-mentioning permits found in Q0.15 are essentially unstructured operator notes, not regulatory metadata.

---

## Q0.7 — Multi-layer dataset?

**Single layer.** One Shapefile resource. No sibling resources, no overlays.

→ **H7 fork resolved:** mirror Spec 58 only for the patterns that apply (advisory lock, ST_MakeValid validator, empty-set guard, HEAD skip-check). **Skip** Spec 58's per-layer transaction architecture, per-layer Producer/Consumer keys, per-layer audit_table rows.

→ Spec 59's §3 Behavioral Contract is substantially shorter than Spec 58's.

---

## Q0.7a (NEW v1.1) — Topological relationship between sub-layers

**N/A.** Single-layer dataset; no sub-layers exist.

→ The CKAN description states the dataset depicts the "Protection **area and limit** as regulated by Chapter 658" — i.e., the dataset is **already** the merged regulated area boundary. The City has done the buffer/protection-zone computation upstream and published a single authoritative polygon set.

→ **H3 fold dissolves.** No need to ask "is the Regulated Area a buffer of the ravine polygon?" — it's neither, because there's no separate ravine polygon at all. The Protection Area *is* what we link against.

---

## Q0.8 — Publish cadence

**"As available; refreshed every 10–20 years. Currency May 2018."**

→ **Operational implication:** the dataset is essentially static. The HEAD `Last-Modified` skip-check from Spec 58 §3 step 0a is still appropriate (defends against the rare future refresh), but its operational meaning is "skip the load 99.9% of the time."

→ **Spec 59 §3 step 0a:** HEAD skip-check with a generous staleness threshold (e.g., 5 years; emit WARN if `Last-Modified` is missing OR older than 20 years to catch a deprecated dataset).

→ **Refresh-cadence WF:** out of MVP scope. Operator triggers refresh manually if/when the City publishes an update.

---

## Q0.9 — Spatial trigger for RNFP permit (per Chapter 658)

**Inferred from CKAN dataset description (authoritative since the dataset IS the regulatory limit):**

The trigger is **parcel polygon intersects the published Protection Area boundary**. Specifically:

> *"Ravine & Natural Feature Protection area and limit as regulated by City of Toronto Municipal Code Chapter 658."*

Since the dataset IS the regulated area boundary (not a derived/computed buffer), a parcel is subject to Chapter 658 if and only if its geometry intersects this published polygon set.

→ **Direct quote from Chapter 658 itself was not accessible via web fetch** in Phase 0 (the PDF at toronto.ca returns binary; multiple direct toronto.ca URLs returned HTTP 404). Spec 59 §6 License section should cite Chapter 658 by reference; the dataset description is the operative authority for the spatial check.

→ **Activities triggering RNFP permit per by-law (general knowledge confirmed by dataset existence):** construction, excavation, tree injury/removal, fill placement, alterations to topography within the boundary. Per-activity gating is out of pipeline scope (lives in admin UI / city workflow).

---

## Q0.10 — Buffer source

**Buffer is pre-baked in the published polygon.** Not a computed buffer; not per-feature variable; not a fixed by-law distance applied at runtime.

→ **C4 3-branch table collapses to Branch 1 only.** `ST_Intersects(parcels.geom, ravines.geom)`.

→ **H6 fold dissolves:** no `ravine_regulated_area_buffer_m` constant needed in `logic_variables.json`. Spec 59 §8 deliverable list omits this item.

→ The `::geography` cast (F-C2 lesson) is **not required** for the primary `is_in_ravine_protection_area` check because we're using `ST_Intersects`, not `ST_DWithin`. The cast would only be needed if v2 adds an "adjacent" detection step (see §L1 reconsideration below).

---

## Q0.11 — Existing RNFP column or permit_type value

**Zero rows** with `permit_type ILIKE '%ravine%' OR '%RNFP%' OR '%natural feature%'` in either `permits` (n=248,571) or `coa_applications` (n=33,119).

**Top 25 distinct `permit_type` values** (none ravine-related):
Small Residential Projects (55K), Plumbing(PS) (55K), Mechanical(MS) (45K), Building Additions/Alterations (38K), Drain and Site Service (18K), New Houses (15K), Fire/Security Upgrade (7K), Residential Building Permit (3.5K), Demolition Folder (DM) (3K), New Building (3K), etc.

**Existing ravine/RNFP/protection-prefixed columns** in `information_schema.columns` (public schema):
```
[]
```
None. Greenfield.

→ **L5 source-of-truth precedence rule is currently moot** but should still be documented in Spec 59 §11 for future-proofing (if the City introduces an RNFP permit_type, the geometry-derived flag remains authoritative; declared = corroborating; disagreement → operator triage WARN audit row).

---

## Q0.12 — `parcels.geom` SRID

**4326** ✓ (verified via `SELECT Find_SRID('public','parcels','geom')`).

→ Direct spatial join with ravine polygons; no reprojection.

**Parcels schema (relevant columns):**
```
geom (geometry, SRID 4326), geometry (legacy column?), centroid_lat, centroid_lng,
lot_size_sqm, frontage_m, depth_m, parcel_id, feature_type,
addr_num_normalized, linear_name_full, street_name_normalized, ...
```
Row count: **486,530 parcels**.

## Q0.12.b — `parcels.geom` vs `parcels.geometry` canonical resolution (post v4.1 R1.5 H-v4.1.2)

**Resolved: `parcels.geom` is canonical.** Empirical verification 2026-05-25:

| Column | `data_type` / `udt_name` | SRID | NULL count | Geometry types | GiST index |
|---|---|---|---|---|---|
| `parcels.geom` | `USER-DEFINED` / `geometry` (PostGIS) | 4326 | 0 / 486,530 | `MULTIPOLYGON` (100%) | `idx_parcels_geom_gist USING gist (geom)` ✓ |
| `parcels.geometry` | `jsonb` (NOT PostGIS) | N/A (`Find_SRID` errors) | 0 / 486,530 | N/A (`GeometryType(jsonb)` errors) | none |

**Conclusion:** `parcels.geometry` is a JSONB column (misleading name — likely a cached GeoJSON representation for API consumers), NOT a PostGIS geometry. Spatial joins MUST target `parcels.geom`. Spec 59 §11 uses `parcels.geom` verbatim (no placeholder).

**H-v4.1.2 contingency does NOT fire** (canonical column is `geom` as initial v4 plan assumed). Phase 1 spec authoring proceeds without v4.2 re-plan.

⚠ **Note for future-proofing:** the `geometry` JSONB column's purpose should be documented in Spec 47 or a parcels-canonical-spec to prevent future contributors from confusing it with a PostGIS column. Filed as DEFER row in `review_followups.md` at WF6.

---

## Q0.13 (NEW v1.1) — Historical/versioned snapshots

**None exposed by CKAN.** The package metadata lists no archive resources; no revision API; no `valid_from`/`valid_to` semantics in the published data.

→ **L3 point-in-time MVP semantics match data reality.** There is no temporal data to defer; the dataset itself is a single point-in-time snapshot (May 2018 currency).

→ Spec 59 §3 explicit declaration: "Data represents a point-in-time snapshot per CKAN currency date. Historical permits are evaluated against the current geometry. Bitemporal extension would require an external archival source (out of pipeline scope)."

---

## Q0.14 (NEW v1.1) — `enrich-parcels.js` existence

**Does NOT exist.** Repo grep across `scripts/` returned only documentation references in `docs/specs/01-pipeline/58_source_zoning_bylaw.md` and the cost-model reports — no executable script.

**Related scripts that DO exist:**
- `scripts/link-parcels.js` — links *permits* to *parcels* via address+spatial (Spec 41 §parcel-address-bridge). NOT a parcels enricher; this is the permit-side linkage.
- `scripts/link-coa-to-parcels.js` — links CoA applications to parcels (Spec 42 reference).
- `scripts/link-parcel-addresses.js` — bridges parcels to address_points (Spec 41 mig 162).

→ **H4 fork — recommendation for v2 plan:**

> Ravine enrichment should become a **STEP** in a future shared `enrich-parcels.js` spec, sibling to (or extending) Spec 58's planned zoning enrichment step. Rationale:
> - Single new chain step, single migration adds both zoning + ravine columns to `parcels`.
> - Tighter coupling — both join `parcels` to a polygon dataset; same transactional unit.
> - Avoids two scripts writing to `parcels` with no defined serialization (cross-WF dependency hazard Independent HIGH-1 flagged).
>
> Out-of-scope alternative: separate `enrich-ravines.js` script if the future enrich-parcels.js spec opts for a single-responsibility decomposition. Decision is locked in v2 plan, not here.

---

## Q0.15 (NEW v1.1) — Free-text 'ravine' prevalence

**Permits:** 31 / 248,571 = **0.012%** (essentially zero).
**CoA applications:** 2 / 33,119 = **0.006%**.

**Sample matched descriptions:**
- "Proposed demolition existing concrete building, cap all plumbing & power. clearing of trees and ground cover for pole construction at ravine."
- "Plumbing - 4 Storey Building with basement-**ravine level** consisting of 30 residential units with two levels of underground parking" (contextual — basement floor naming)
- "Drain - Proposed 2nd storey addition... See PPR. **Subject to Ravine By-Law** - SPA Pen" (the one genuinely RNFP-relevant mention)
- "Plumbing - Revision - New front porch with coldroom below. Underpin foundation and lower basement floor. **See ravine line on site plan.**"

**Strategy recommendation per D6 fold:** `'ignore'`. The mentions are too sparse and too unstructured to warrant a backfill script. The geometry-derived `is_in_ravine_protection_area` flag (from §11 ST_Intersects) will cover these and many more cases the description text doesn't surface. Spec 59 §11 should document this as "free-text mentions are not authoritative; geometry is."

---

## L1 reconsideration — data model enum vs boolean (v2 plan decision)

The user locked L1 = enum `'in_ravine' | 'in_regulated_area' | 'adjacent' | 'none'` in v1.1. Phase 0 shows the dataset only supports observation of "in vs out of the merged Protection Area polygon." The 4-value enum collapses:

| Locked value | Phase 0 observability |
|---|---|
| `'in_ravine'` | **Unobservable** — no separate ravine-centerline dataset published |
| `'in_regulated_area'` | **Observable** — `ST_Intersects(parcels.geom, ravines.geom) = true` |
| `'adjacent'` | **Computable** if v2 adds an `ST_DWithin(::geography, $N)` buffer check (would need an MVP-scope decision on N) |
| `'none'` | **Observable** — neither intersects nor within buffer |

**v2 plan options to surface to user:**
- **Option A (enum schema, partial population):** Keep the 4-value CHECK constraint; populate only `'in_regulated_area'` and `'none'` in v1; reserve `'in_ravine'` + `'adjacent'` for a future Spec 59.1 once we have either (a) a separate ravine-geometry dataset or (b) an operator-decided buffer distance.
- **Option B (boolean):** Simplify to `is_in_ravine_protection_area BOOLEAN NOT NULL`. Future expansion requires a schema migration.
- **Option C (3-value enum):** `'in_regulated_area' | 'adjacent' | 'none'` with `'adjacent'` populated via `ST_DWithin(parcels.geom::geography, ravines.geom::geography, $ravine_adjacency_buffer_m)` — buffer constant in `logic_variables.json` (re-introduces H6).

**Phase 0 recommendation:** Option B (boolean) for MVP. Reasons:
1. The dataset doesn't support the 4-value distinction. Populating an enum with only 2 of 4 values is misleading.
2. "Adjacent" has no by-law meaning when the regulated area is already pre-baked — by definition, anything outside the polygon is NOT subject to Chapter 658.
3. A future spec can expand to enum if (a) a ravine-centerline dataset becomes available OR (b) operators want a "near-boundary, advisory" flag.
4. Boolean matches Spec 58 precedent (Spec 58 also keeps things simple in v1 and defers complexity to v2).

User decision required in v2 plan.

---

## Phase 0 → v2 plan checklist

Items the v2 plan must lock based on these findings:

- [ ] L1 re-decision (Option A / B / C above) — **user input required**
- [ ] §11 Linking Contract — collapse to Branch 1 only: `ST_Intersects(parcels.geom, ravines.geom)`; no buffer constant.
- [ ] §3 Behavioral Contract — direct INSERT pattern (no staging-CTE); empty-set DELETE guard preserved.
- [ ] §3 schema — 5-column `ravines` table; single attribute `source_id` from `OBJECTID`.
- [ ] §8 deliverables — drop H6 buffer-constant seed; H4 chooses shared `enrich-parcels.js` step (recommended) vs sibling script.
- [ ] §9 Producer/Consumer Contract — simpler records_meta (no per-layer sub-keys; single `ravine_load` block).
- [ ] §10 Cross-WF Tracing — single-step chain (load → enrich-parcels → enrich-permits/coa → admin display).
- [ ] §11 — preserve L5 source-of-truth precedence rule for future-proofing (even though no current RNFP rows exist).

## Sources & artefacts

- CKAN package metadata: `package_show?id=ravine-natural-feature-protection-area` (fetched 2026-05-25)
- CKAN package search: `package_search?q=ravine` (fetched 2026-05-25)
- Shapefile bundle: downloaded 4.49 MB zip → `RAVINE_BYLAW_WGS84.shp/.dbf/.prj/.shx` (854 features parsed via npm `shapefile` lib)
- DB queries: live local Postgres (host `localhost:5432` per `.env`); read-only single-statement queries (`Find_SRID`, `COUNT(*) WHERE permit_type ILIKE …`, `COUNT(*) WHERE description ILIKE '%ravine%'`)
- Repo greps: advisory lock enumeration across `scripts/*.js`, `enrich-parcels` search across all paths, `ravine|RNFP|natural feature` search across all paths
- Chapter 658 by-law direct text: **NOT** retrievable via WebFetch (PDF binary; toronto.ca URLs returned HTTP 404). CKAN dataset description is the operative authority for §11 spatial predicate; Spec 59 §6 cites Chapter 658 by reference only.
