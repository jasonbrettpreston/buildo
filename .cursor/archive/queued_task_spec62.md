# Active Task: WF1 -- Spec 62 Toronto Centreline (streets) (load + link, spec-only) -- **v1.3 FINAL**

**Status:** Implementation — v1.3 Gate 2 authorized 2026-05-26; Phase 1 spec authoring in progress
**Domain Mode:** Backend/Pipeline (spec authoring only)
**WF type:** WF1 Genesis -- Phase-0-first. **3-pass adversarial PLAN review cadence COMPLETE** (R1 + R2 + R3 all done). After Gate 2, plan locks for Phase 1 spec authoring.

---

## v1.2 -> v1.3 fold log (R3 PLAN: 7 CRIT + 8 HIGH + ~5 MED across Gemini + DeepSeek + Independent)

### CRITICAL folds (7)

- **C-v1.3.1 (Gemini HIGH + DeepSeek CRIT — convergent):** Side-detection formula `ST_Azimuth(seg_start, seg_end) - ST_Azimuth(seg_start, parcel_centroid) > 0` is direction-dependent (digitization reversal flips sign) and has 0/2π wrap issues. v1.3 §11 SQL uses **2D cross-product** (no trig, no wrap):
  ```sql
  CASE WHEN
    (ST_X(ST_EndPoint(seg.geom)) - ST_X(ST_StartPoint(seg.geom))) * (ST_Y(parcel_centroid) - ST_Y(ST_StartPoint(seg.geom)))
    - (ST_Y(ST_EndPoint(seg.geom)) - ST_Y(ST_StartPoint(seg.geom))) * (ST_X(parcel_centroid) - ST_X(ST_StartPoint(seg.geom)))
    > 0
    THEN 'L' ELSE 'R'
  END AS parcel_side
  ```
- **C-v1.3.2 (Gemini HIGH + DeepSeek MED + Independent CRIT-R3-1 — 3-way convergent):** ST_LineInterpolatePoint takes a fraction (0..1), not metres. v1.1 said "locate + 10m_offset" which is meaningless. v1.3 uses **relative offset** with short-segment guard:
  ```sql
  -- Compute fraction offset = 10m / segment_length, capped at 0.5 (mid-segment)
  ST_Azimuth(
    ST_ClosestPoint(seg.geom, parcel_centroid),
    ST_LineInterpolatePoint(
      seg.geom,
      LEAST(
        ST_LineLocatePoint(seg.geom, ST_ClosestPoint(seg.geom, parcel_centroid)) + (10.0 / GREATEST(ST_Length(seg.geom::geography), 1.0)),
        1.0
      )
    )
  )
  ```
  Short-segment fallback (geom length < 1m): use endpoint-to-endpoint azimuth `ST_Azimuth(ST_StartPoint(seg.geom), ST_EndPoint(seg.geom))`.
- **C-v1.3.3 (Independent CRIT-R3-3):** §11 complete pseudo-SQL was absent — v1.2 had 19 amendment bullets but no assembled block. Phase 1 spec authoring would re-litigate every CTE. v1.3 §11 includes the **complete authoritative pseudo-SQL** (see §11 block below). All sibling CTEs anchor to `parcel_ids_intersecting` base.
- **C-v1.3.4 (Independent CRIT-R3-2):** Base-CTE coverage to ALL sibling CTEs. v1.2 only mentioned `parcel_topology` joining to `parcel_ids_intersecting`. v1.3 §11 explicitly anchors `parcel_topology`, `parcel_frontage`, and `parcel_enrichment` to the base CTE so single-segment parcels reach the UPDATE.
- **C-v1.3.5 (DeepSeek HIGH):** F-C1 JS-side guard's `emitSummary` + throw causes double-call (pipeline runner emits FAIL audit row from error handler too). v1.3 L15 changes pattern: use `pipeline.recordAuditRow({metric: 'f_c1_empty_temp_guard_fired', value: true, status: 'FAIL'})` (NOT emitSummary), then throw. Pipeline runner's error handler is the SINGLE emitSummary caller for failed runs.
- **C-v1.3.6 (DeepSeek HIGH):** NULL-NULL intersection-ID false positive. `from_intersection_id IS NOT DISTINCT FROM NULL` returns true; two segments with all-NULL intersection IDs would falsely match as sharing a node. v1.3 §11 corner-lot CTE adds the at-least-one-non-NULL predicate:
  ```sql
  AND (
    ps1.from_intersection_id IS NOT NULL
    OR ps1.to_intersection_id IS NOT NULL
    OR ps2.from_intersection_id IS NOT NULL
    OR ps2.to_intersection_id IS NOT NULL
  )
  ```
- **C-v1.3.7 (Gemini HIGH — elevated from R2 D3):** Divided-road false-positive. `linear_name_full IS DISTINCT FROM` treats "Main St N" vs "Main St S" as different streets → false-positive corner-lot for parcels between divided-road carriageways. v1.3 §11 uses **base-name comparison** via the `linear_name` column (the un-suffixed root, present in v1.2 L2 schema):
  ```sql
  -- Two segments are "different streets" only if their base names differ.
  -- "Main St N" + "Main St S" both have linear_name = 'Main' → SAME street → NOT corner.
  -- "Main St" + "King St" have linear_name = 'Main' vs 'King' → DIFFERENT → corner candidate.
  ps1.linear_name IS DISTINCT FROM ps2.linear_name
  ```

### HIGH folds (10)

- **H-v1.3.1 (Gemini MED):** Parallelism formula `LEAST(abs(az1-az2), pi() - abs(az1-az2))` non-standard. v1.3 §11 uses `abs(cos(az1 - az2)) > cos(radians(15))` -- equivalent in cosine space; robust to all angle wraps.
- **H-v1.3.2 (DeepSeek MED):** F-C1 always-throw too aggressive for transient CKAN outages. v1.3 L15 dual-mode behavior:
  - **First run (no successful prior `source-centreline` pipeline_runs row):** zero-temp → FAIL (current behavior, blocks production deploy on empty source).
  - **Subsequent runs (prior successful run exists):** zero-temp → emit WARN audit row `delete_skipped_empty_guard=true`, skip DELETE+INSERT entirely (preserve existing target table), return verdict='WARN'. Matches Spec 59 L15 "preserve previous state on transient source-empty" semantic.
- **H-v1.3.3 (DeepSeek LOW + Independent HIGH-R3-1):** `address_match_status` NULL parity policy explicit. v1.3 L27 adds: "When `parity IS NULL` (unknown side), parity check is SKIPPED — range match alone is sufficient for TRUE. This intentionally accepts both sides of a street with undeclared parity."
- **H-v1.3.4 (Independent HIGH-R3-2):** `parcel_counts` uses `COUNT(DISTINCT centreline_id)` (not `COUNT(*)`) to defend against spatial-join duplicates. v1.3 §11 SQL: explicit.
- **H-v1.3.5 (Independent HIGH-R3-3):** L24 column list. v1.3 L24 names: `parcels.is_corner_lot`, `parcels.is_through_lot`, `parcels.primary_frontage_street_name`.
- **H-v1.3.6 (Gemini LOW + Independent HIGH-R3-4):** Gemini said remove `centreline_address_levenshtein_threshold` as dead code; Independent said it's a sentinel for future expansion + needs special Zod schema. **v1.3 resolution: REMOVE the key.** Future expansion can add it when actually needed (YAGNI). v1.3 §12.3a logic_variables list drops the key.
- **H-v1.3.7 (Independent HIGH-R3-5):** Phase 0 report content outline. v1.3 mandates the deliverable `docs/reports/wf1-spec62-architecture-discovery.md` contain:
  - Q0.1: CKAN package + resource IDs + direct download URLs
  - Q0.2: Geometry type confirmed (LineString uniform)
  - Q0.3: Projection (EPSG:4326)
  - Q0.4: Stable upsert key (CENTRELINE_ID vs OBJECTID rationale)
  - Q0.5: Feature count (64K raw → 47K post-filter)
  - Q0.6: 40-column attribute schema with bundled `fields.csv` mapping
  - Q0.7: Feature type distribution
  - Q0.8: Refresh cadence (daily)
  - Q0.9: Lock-ID gap-analysis (62/63 occupied by Spec 61; 65/66/67 available)
  - Q0.10: Address-range encoding (parity_l/r + LO_NUM/HI_NUM_l/r)
  - Q0.11: Intersection-ID cross-reference (FROM/TO_INTERSECTION_ID)
  - Q0.12: Sample row + first-deploy expectations
  - **Cross-reference format mirrors Spec 59 §7 + Spec 61 §7.**
- **H-v1.3.8 (Independent HIGH-R3-6):** §A.5 infra test safety check. v1.3 adds to L20 deliverable: "Before adding footnote to §A.5, verify `src/tests/pipeline-advisory-lock.infra.test.ts` parses §A.5 in a way tolerant to non-table-row lines (likely via regex/grep — should be safe). If the test parses markdown table structure, update both files atomically."
- **H-v1.3.9 (Independent HIGH-R3-7):** L4/L4b vs L20 canonical-home for §5.2 exception. v1.3 designates **§A.5 footnote as canonical**; L4/L4b retain only `(§5.2 exception; see §A.5 footnote)` cross-reference, not full rationale. Prevents drift.
- **H-v1.3.10 (Independent HIGH-R3-8):** `enrich-permits.js` file ownership promoted from R2 D4 (deferred) to locked. v1.3 **L28 NEW:** `enrich-permits.js` file ownership = Spec 61 implementing WF. Spec 62 implementing WF appends `applyCentrelineEnrichment(client, RUN_AT)` to the existing file. If Spec 61 hasn't shipped when Spec 62 implementation begins, the Spec 62 WF creates `enrich-permits.js` with BOTH `applyHeritageEnrichment` (stub) AND `applyCentrelineEnrichment` -- documented in §12 implementation guide.

### MEDIUM folds (5 routed to `review_followups.md` rows 410+ at WF6)

D1. Pre-deploy estimate ST_DWithin(50m) vs ST_Intersects bias (carried from R2 D9) — replace with ST_Intersects once first prod run available
D2. Test fixture coverage for graph-topology (R2 D8 + Independent MED-R3-2) — Phase 1 spec §4 must list 6+ fixtures: (a) single-segment interior, (b) corner two-segments-shared-intersection, (c) through-lot two-parallel-different-streets, (d) divided-road carriageway (NOT corner), (e) NULL-NULL intersection (NOT corner), (f) short-segment azimuth fallback, (g) address with suffix
D3. L12 multi-parcel frontage tie-break (smallest par.id) — Gemini MED suggests applying L13 logic to all parcels; deferred as future improvement, current behavior documented
D4. `normalize_address_number` incomplete for "10-12", "Rear 10", "10A-12 Main St" range patterns — Phase 1 may need to extend
D5. L9 7-day vs Spec 61 2-year threshold rationale — document trade-off in spec §3 narrative

---

## §11 Linking Contract -- COMPLETE pseudo-SQL (v1.3 authoritative skeleton)

Per Independent CRIT-R3-3: the complete CTE chain assembled from all R1+R2+R3 folds. Phase 1 spec authoring uses this verbatim with formatting refinements only.

```sql
-- enrich-centreline.js UPDATE (parcels-level).
-- All CTEs anchor to parcel_ids_intersecting base so every parcel that
-- intersects ANY centreline segment appears in the final UPDATE
-- (C-v1.2.2 + C-v1.3.4 fold).

WITH

-- Step 1: All parcel × centreline intersections (uses ravines_geom_gist per C-v1.1.1).
parcel_segments AS (
  SELECT
    p.id                                 AS parcel_id,
    p.geom                               AS parcel_geom,
    ST_Centroid(p.geom)                  AS parcel_centroid,
    p.address_number                     AS parcel_addr_text,
    c.id                                 AS centreline_id,
    c.geom                               AS seg_geom,
    c.linear_name                        AS seg_name_base,        -- C-v1.3.7: base name, not full
    c.linear_name_full                   AS seg_name_full,
    c.from_intersection_id               AS from_node,
    c.to_intersection_id                 AS to_node,
    c.lo_num_l, c.hi_num_l, c.parity_l,
    c.lo_num_r, c.hi_num_r, c.parity_r
  FROM parcels p
  JOIN toronto_centreline c
    ON ST_Intersects(p.geom, c.geom)
),

-- Step 2: Base CTE — every parcel that intersects at least one centreline segment.
parcel_ids_intersecting AS (
  SELECT DISTINCT parcel_id FROM parcel_segments
),

-- Step 3: Per-parcel count of intersected segments (BEFORE self-join; C-v1.2.3 + H-v1.3.4).
parcel_counts AS (
  SELECT parcel_id,
         COUNT(DISTINCT centreline_id) AS intersected_segment_count
  FROM parcel_segments
  GROUP BY parcel_id
),

-- Step 4: Per-parcel segment pairs (canonical ordering; INNER JOIN per H-v1.2.7).
parcel_pairs AS (
  SELECT
    ps1.parcel_id,
    ps1.centreline_id AS c1_id,    ps2.centreline_id AS c2_id,
    ps1.seg_geom      AS c1_geom,  ps2.seg_geom      AS c2_geom,
    ps1.seg_name_base AS c1_name,  ps2.seg_name_base AS c2_name,
    ps1.from_node     AS c1_from,  ps1.to_node       AS c1_to,
    ps2.from_node     AS c2_from,  ps2.to_node       AS c2_to,
    ps1.parcel_centroid             AS centroid
  FROM parcel_segments ps1
  INNER JOIN parcel_segments ps2 ON ps1.parcel_id = ps2.parcel_id
  WHERE ps1.centreline_id < ps2.centreline_id
),

-- Step 5: Corner-lot detection (different streets + shared intersection node, NULL-safe).
parcel_corner_pairs AS (
  SELECT parcel_id,
         bool_or(
           c1_name IS DISTINCT FROM c2_name                          -- C-v1.3.7: base name
           AND (
             c1_from IS NOT DISTINCT FROM c2_from
             OR c1_from IS NOT DISTINCT FROM c2_to
             OR c1_to   IS NOT DISTINCT FROM c2_from
             OR c1_to   IS NOT DISTINCT FROM c2_to
           )
           AND (                                                       -- C-v1.3.6: at least one non-NULL
             c1_from IS NOT NULL OR c1_to IS NOT NULL
             OR c2_from IS NOT NULL OR c2_to IS NOT NULL
           )
         ) AS has_corner_pair
  FROM parcel_pairs
  GROUP BY parcel_id
),

-- Step 6: Through-lot detection (different streets + parallel azimuth; via cosine equivalence).
parcel_parallel_pairs AS (
  SELECT parcel_id,
         bool_or(
           c1_name IS DISTINCT FROM c2_name                          -- C-v1.3.7 + C-v1.2.5
           AND abs(cos(                                                -- H-v1.3.1 cosine formula
             COALESCE(
               -- C-v1.3.2: closest-point azimuth with 10m offset, short-segment fallback
               ST_Azimuth(
                 ST_ClosestPoint(c1_geom, centroid),
                 ST_LineInterpolatePoint(c1_geom, LEAST(
                   ST_LineLocatePoint(c1_geom, ST_ClosestPoint(c1_geom, centroid))
                   + 10.0 / GREATEST(ST_Length(c1_geom::geography), 1.0),
                   1.0))
               ),
               ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom))
             )
             -
             COALESCE(
               ST_Azimuth(
                 ST_ClosestPoint(c2_geom, centroid),
                 ST_LineInterpolatePoint(c2_geom, LEAST(
                   ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                   + 10.0 / GREATEST(ST_Length(c2_geom::geography), 1.0),
                   1.0))
               ),
               ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom))
             )
           )) > cos(radians(15))
         ) AS has_parallel_different_street_pair
  FROM parcel_pairs
  GROUP BY parcel_id
),

-- Step 7: Frontage detection — address-side match THEN longest-intersection fallback.
parcel_frontage AS (
  SELECT DISTINCT ON (parcel_id)
    parcel_id,
    seg_name_full AS primary_frontage_street_name
  FROM (
    SELECT
      ps.parcel_id,
      ps.centreline_id,
      ps.seg_name_full,
      ST_Length(ST_Intersection(ps.parcel_geom, ps.seg_geom)) AS intersect_len_m,
      -- C-v1.3.1: 2D cross-product side detection
      CASE WHEN
        (ST_X(ST_EndPoint(ps.seg_geom)) - ST_X(ST_StartPoint(ps.seg_geom)))
        * (ST_Y(ps.parcel_centroid)      - ST_Y(ST_StartPoint(ps.seg_geom)))
        - (ST_Y(ST_EndPoint(ps.seg_geom)) - ST_Y(ST_StartPoint(ps.seg_geom)))
        * (ST_X(ps.parcel_centroid)      - ST_X(ST_StartPoint(ps.seg_geom)))
        > 0
        THEN 'L' ELSE 'R'
      END AS parcel_side,
      ps.lo_num_l, ps.hi_num_l, ps.parity_l,
      ps.lo_num_r, ps.hi_num_r, ps.parity_r,
      ps.parcel_addr_text
    FROM parcel_segments ps
  ) sided
  -- Priority 1: address+side+parity match
  WHERE (
    (parcel_side = 'L' AND address_match_status(parcel_addr_text, parity_l, lo_num_l, hi_num_l))
    OR
    (parcel_side = 'R' AND address_match_status(parcel_addr_text, parity_r, lo_num_r, hi_num_r))
  )
  -- Priority 2 fallback: longest intersection — handled via DISTINCT ON ordering below
  ORDER BY parcel_id,
           CASE WHEN
             (parcel_side = 'L' AND address_match_status(parcel_addr_text, parity_l, lo_num_l, hi_num_l))
             OR (parcel_side = 'R' AND address_match_status(parcel_addr_text, parity_r, lo_num_r, hi_num_r))
             THEN 0 ELSE 1
           END,
           intersect_len_m DESC,
           centreline_id ASC
),

-- Step 8: Combine + materialize all three derived columns.
-- COALESCE wraps (C-v1.2.1) ensure NOT NULL semantics; LEFT JOIN against base CTE
-- ensures every intersecting parcel reaches UPDATE (C-v1.3.4).
parcel_enrichment AS (
  SELECT
    pii.parcel_id,
    COALESCE(pc.intersected_segment_count, 0)            AS seg_count,
    COALESCE(pcp.has_corner_pair, false)                 AS new_is_corner_lot,
    (
      COALESCE(pc.intersected_segment_count, 0) >= 2
      AND NOT COALESCE(pcp.has_corner_pair, false)
      AND COALESCE(ppp.has_parallel_different_street_pair, false)
    )                                                     AS new_is_through_lot,
    pf.primary_frontage_street_name                       AS new_primary_frontage_street_name
  FROM parcel_ids_intersecting pii
  LEFT JOIN parcel_counts pc           USING (parcel_id)
  LEFT JOIN parcel_corner_pairs pcp    USING (parcel_id)
  LEFT JOIN parcel_parallel_pairs ppp  USING (parcel_id)
  LEFT JOIN parcel_frontage pf         USING (parcel_id)
)

UPDATE parcels p
   SET is_corner_lot                 = pe.new_is_corner_lot,
       is_through_lot                = pe.new_is_through_lot,
       primary_frontage_street_name  = pe.new_primary_frontage_street_name
  FROM parcel_enrichment pe
 WHERE p.id = pe.parcel_id
   AND (p.is_corner_lot                IS DISTINCT FROM pe.new_is_corner_lot
        OR p.is_through_lot            IS DISTINCT FROM pe.new_is_through_lot
        OR p.primary_frontage_street_name IS DISTINCT FROM pe.new_primary_frontage_street_name);
```

**SQL safety lessons preserved across CTEs:**
- COALESCE wraps on `bool_or(...)` (C-v1.2.1)
- Base CTE feeds every downstream CTE so single-segment parcels reach UPDATE (C-v1.3.4)
- `intersected_segment_count` computed BEFORE self-join (C-v1.2.3 + H-v1.3.4)
- NULL-safe `IS NOT DISTINCT FROM` on intersection IDs (C-v1.1.2) + at-least-one-non-NULL guard (C-v1.3.6)
- INNER JOIN with canonical-pair WHERE (H-v1.2.7)
- Cosine-based parallel formula (H-v1.3.1)
- Cross-product side detection (C-v1.3.1)
- Closest-point + relative-fraction-offset azimuth with short-segment fallback (C-v1.3.2)
- Base-name comparison `linear_name` not `linear_name_full` (C-v1.3.7)

---

## Locked design decisions (v1.3 FINAL)

| ID | Decision |
|---|---|
| **L1** | 3 derived columns on parcels: `is_corner_lot BOOLEAN NOT NULL DEFAULT false`; `is_through_lot BOOLEAN NOT NULL DEFAULT false`; `primary_frontage_street_name TEXT` (nullable, "address-side only" per H-v1.1.5). Permits + CoA propagate via L12 |
| **L2** | `toronto_centreline` schema (18 cols incl. `linear_name TEXT` for base-name compare per C-v1.3.7). MANDATORY: `CREATE INDEX toronto_centreline_geom_gist ON toronto_centreline USING GIST (geom)`. NO `linear_name_full_idx` (removed in v1.2 H-v1.2.8). |
| **L3** | Point-in-time MVP |
| **L4** | `load-centreline.js` lock = 65 (§5.2 exception; see §A.5 footnote for rationale) |
| **L4b** | `enrich-centreline.js` lock = 66 (§5.2 exception; see §A.5 footnote) |
| **L4c** | `enrich-permits.js` centreline step inherits parent lock 64 |
| **L5** | Geometry-derived authoritative |
| **L6** | Sibling script `enrich-centreline.js`; 4th parcels-writer |
| **L7/L7b/L7c** | Three drift signals per Spec 59 + override flags |
| **L8** | 5% invalid-geometry threshold; abort-before-DELETE |
| **L9** | HEAD `Last-Modified` + ETag + content-hash skip-check; 7-day threshold |
| **L10** | `spec_version: 1.0` lock |
| **L11** | Chain ordering: `link_parcels` → `enrich_zoning` → `enrich_ravines` → `enrich_heritage` → `enrich_centreline` → `enrich_permits` |
| **L12** | Multi-parcel propagation per Spec 61 L12 pattern + smallest-par.id tie-break (D3 known limitation, future improvement queued) |
| **L13** | **§11 SQL block above is authoritative.** Corner/through-lot via cross-product + cosine + base-name + NULL-safe intersection guards |
| **L14** | Empty-source guard on `enrich-centreline.js` (3-tier) |
| **L15** | **F-C1 JS-side guard** with dual-mode (per H-v1.3.2): first-run-empty = FAIL; subsequent-run-empty = WARN+preserve. Audit row via `pipeline.recordAuditRow` NOT `emitSummary` (per C-v1.3.5 -- pipeline runner is sole emitSummary caller) |
| **L16** | Batched VALUES+UNNEST geometry validation per Spec 47 §B1; 5,000-row chunks |
| **L17** | `pipeline.emitMeta` two-arg signature per Spec 47 §8.3 |
| **L18** | Cross-run `records_meta` read pattern per Spec 61 L18 |
| **L19** | `enrich-permits.js` centreline step = self-contained `applyCentrelineEnrichment(client, RUN_AT)` |
| **L20** | §A.5 registry update deliverable + footnote-based §5.2 exception docs + H-v1.3.8 infra-test safety check |
| **L21** | Unlinked-parcels audit; thresholds in `logic_variables.json` (NOT §3.7 ledger-writer spike per H-v1.2.10) |
| **L22** | Chain ordering: `chain_sources` inserts `load_centreline` AFTER `load_parcels`; `enrich_centreline` AFTER `enrich_heritage` |
| **L23** | Enrich-side guard: (a) prior run; (b) `features_inserted > 0`; (c) `COUNT(*) FROM toronto_centreline > 0` |
| **L24** | `enrich-permits.js` centreline step `information_schema` startup check verifies: **`parcels.is_corner_lot`, `parcels.is_through_lot`, `parcels.primary_frontage_street_name`** (H-v1.3.5) |
| **L25** | Feature-type filter: INCLUDE 12 street-class values; UNKNOWN → sentinel `'unknown_operator_review'` + WARN audit |
| **L26** | Staging-table CTE (full-replace); F-C1 JS-side dual-mode guard per L15 |
| **L27** | `normalize_address_number` + `address_match_status` PL/pgSQL helpers (H-v1.2.4 body); NULL parity → skip parity check (H-v1.3.3) |
| **L28 (NEW v1.3)** | **`enrich-permits.js` file ownership: Spec 61 implementing WF.** Spec 62 implementing WF appends `applyCentrelineEnrichment` to existing file. If Spec 61 hasn't shipped, Spec 62 WF creates the file with both stubs. (H-v1.3.10) |

---

## §12.3a logic_variables.json (v1.3 final list, per H-v1.3.6 removal)

```json
{
  "centreline_min_feature_count":                40000,
  "centreline_unlinked_parcel_warn_pct":         10,
  "centreline_unlinked_parcel_fail_pct":         40,
  "centreline_parallel_azimuth_threshold_degrees": 15,
  "centreline_skip_check_threshold_days":        7
}
```

(`centreline_address_levenshtein_threshold` REMOVED per H-v1.3.6 — was dead code; Spec 62 doesn't use Levenshtein.)

---

## Execution Plan (all 3 PLAN passes COMPLETE)

- [x] **Phase 0:** DONE
- [x] **v1 + v1.1 + v1.2 + v1.3 PLAN:** DONE
- [x] **R1 + R2 + R3 PLAN reviews:** DONE (3-pass cadence complete)
- [ ] **🚪 Gate 2 — v1.3 PLAN final authorization. After Gate 2, plan LOCKS for Phase 1 spec authoring.**
- [ ] **Phase 0 formal report** (`docs/reports/wf1-spec62-architecture-discovery.md`) authored alongside Phase 1 per H-v1.3.7 content outline.
- [ ] **Phase 1 — Spec authoring:** Write `docs/specs/01-pipeline/62_source_centreline.md` per v1.3 plan (§§1-12). §11 uses the authoritative pseudo-SQL block above verbatim.
- [ ] **R3 SPEC review:** 3 reviewers on the authored spec.
- [ ] **R3.5 SPEC regression check (conditional):** if R3 SPEC introduces material change.
- [ ] **Green Light + WF6 commit.**

---

## Adversarial review checkpoint summary (3-pass PLAN cadence COMPLETE)

| Round | Subject | Reviewers | Findings | Status |
|-------|---------|-----------|----------|--------|
| **R1 PLAN** | v1 | Gemini + DeepSeek + Independent | 6 CRIT + 12 HIGH + 8 MED | DONE -> v1.1 |
| **R2 PLAN** | v1.1 | Gemini + DeepSeek + Independent | 7 CRIT + 12 HIGH + ~10 MED | DONE -> v1.2 |
| **R3 PLAN** | v1.2 | Gemini + DeepSeek + Independent | 7 CRIT + 8 HIGH + ~5 MED | DONE -> v1.3 (this) |
| **R3 SPEC** | Final Spec 62 v1.0 | Gemini + DeepSeek + Independent + 6 mandatory specs context | future (post-Phase-1) |
| **R3.5 SPEC** | Post-R3-SPEC-fold regression | Same 3 | conditional |

**Cumulative across 3 PLAN passes:** 20 CRIT + 32 HIGH + 23 MED = 75 findings folded. v1.3 includes the complete authoritative §11 pseudo-SQL block (per Independent CRIT-R3-3 — preventing the Phase 1 re-litigation risk that earlier folds amplified).

---

**🚪 Gate 2 — v1.3 PLAN final authorization.** 3-pass cadence complete per your direction. Authorize Phase 1 spec authoring to begin? Or want to revisit anything before proceeding?
