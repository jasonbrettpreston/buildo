# `enrich_parcels` golden master: recapture for H6 (the `sixplex` phase, Spec 65 §sixplex)

**Ruling:** Spec 124 §5 R-C (the golden capture is a lockfile; a capture whose `source_fingerprint` no longer
matches the tree is stale and must be re-taken, with the CAUSE of every diff named).
**Precedent followed:** `phase010b-post-phase-seam-recapture.md` (same file pair, same A/B/C/D vocabulary).

## Why the gate fired

H6 touches two of `computeSourceFingerprint`'s four inputs. `scripts/lib/compute/enrich-parcels.js` gains the
`sixplex` pass, its three checks and `sixplexIds` in `computeAggregateRecordsUpdated`.
`scripts/enrich-parcels.descriptor.json` gains the `bylaw_map_areas` read, the three `parcels` write
columns, the `sixplex` phase, the three checks, the `load_bylaw_map_areas` producer edge, config
`enrich_parcels_sixplex_subdivide_max_vertices`, and `min_migration` 237 → 254.

**No pass 1-5 SQL moved.** `git diff HEAD -U0 -- scripts/lib/compute/enrich-parcels.js` is 214 insertions and
2 deletions. The 2 deleted lines are the `computeAggregateRecordsUpdated` header comment and its signature,
which gains `sixplexIds`. `scripts/enrich-parcels.js`, the notes file, `scripts/lib/max-build.js` and
`scripts/lib/step/**` are unchanged. The `sixplex` pass runs after `comparable_builds`, inside the shared
transaction. It reads and writes only `in_sixplex_area`, `sixplex_area_type` and `sixplex_membership_basis`.
The witness trace confirms this for the actual run: exactly one statement in
`docs/reports/witness/enrich_parcels/post/sources_run1.trace.json` reads or writes a `sixplex*` column, and
that statement is the sixplex UPDATE (fingerprint `fe870fa96ffe9444`, rowCount 496,536). In the compute
module the pass 5 (`optimal_config`) source range contains **zero** occurrences of `sixplex`.

| | value |
|---|---|
| OLD fingerprint (committed, `2d7b0d84`) | `7a2e18a1c508f9ef8585703415df2373cefc58a863a946aaf244cd9efebdb18e` |
| NEW fingerprint (= current tree, measured) | `a3d58ebb29e9427cfd77a71c52f1eed8b5ea9c951afa2129791a3ef2282908bd` |
| `lib_fingerprint` (both, = current) | `24df6f49515fef1898f60cf596b3ae3185325e8694a045db16fa73e32cc363e2` |

## What was captured, and against what

| capture | run ids | started (UTC) | invocation | duration | exit |
|---|---|---|---|---|---|
| OLD `post/sources_run1.json` | 2729 (+ rerun proof 2730) | 2026-10-14 13:53 | `--chain=sources --args=--full` | 2,632.2 s | 0 |
| OLD `post/none_incremental.json` | 2727 (+ rerun 2728) | 2026-10-14 **13:50**, before the full run | `--chain=none` | deferred | 0 |
| NEW `post/sources_run1.json` | 2740 (+ rerun proof 2741) | 2026-10-16 12:10 | `--chain=sources --args=--full` | **723.0 s** | 0 |
| NEW `post/none_incremental.json` | 2742 (+ rerun 2743) | 2026-10-16 12:35, **after** the full run | `--chain=none` | deferred | 0 |

The DB clock is UTC: 12:10–12:36 UTC is 08:10–08:36 EDT local. The OLD pair ran on the PC
(x86_64, PostgreSQL 17.6). The NEW pair ran on the Mac (aarch64, PostgreSQL 17.11) against
`~/buildo-transfer/buildo-dev.dump`, restored 2026-10-15. Both hosts report PostGIS 3.3.7 / GEOS 3.14.1 / PROJ 9.7.1
(PC: `docs/specs/_contracts.json` `db_target` provenance; Mac: `postgis_full_version()` today). Migrations
253/254/255 were applied 2026-10-16 12:05 UTC (`schema_migrations`: 255 → 258 rows). `load_bylaw_map_areas` ran
2736–2739 (12:07 UTC) right before the capture.

Per-phase timings on the FULL (OLD PC → NEW Mac): `zoning` 519,826 → 137,419 ms · `max_build` 1,486,955 →
359,821 ms · `existing_structure` 59,089 → 17,657 ms · `comparable_builds` 418,790 → 124,920 ms ·
**`sixplex` (new) 45,779 ms** · `optimal_config` 117,325 → 31,127 ms. The `parcels` content hash took
41,736 → 15,017 ms.

**The rerun proof is clean on the Mac.** Run 2741, the capture's second `--full`, reports `records_updated 0`,
`parcels_enriched_count 0`, `max_build 0`, `existing_structure 0`, `optimal_config 0` and **`sixplex_enriched_count 0`**.
So the new pass is idempotent behind its IS DISTINCT FROM guard, and the Mac engine reproduces its own
results run to run.

### Correction to the brief's premise: no upstream step ran between the captures on any enrich_parcels input

`pipeline_runs` shows that `link_massing` 2719–2726 (12:00–13:48 UTC) ran **before** the OLD captures
(2727 at 13:50, 2729 at 13:53), so it cannot cause drift between them. After 2730, only these ran:
`load_wsib` 2731/2732 (cohort capture, `wsib_registry`), `load_centreline` 2733 (0 rows), two cron sweeps
(2734/2735), and `load_bylaw_map_areas` 2736–2739, which only the new pass reads. None of the first three
writes a table that `enrich_parcels` declares as an input.

### The decisive evidence: the PC dump is a byte-exact before-image

The dump was archived 2026-10-15 14:24 EDT, after every run above, so it holds exactly what the OLD captures
left behind. These checks are read-only: `pg_restore -a -t <table> -f -` streamed to the scratchpad, against
`COPY (SELECT …) TO STDOUT` on the live DB. They establish four things:

1. **Every declared input is byte-identical between the dump and today's DB.** The sorted-COPY md5 is equal
   for `zoning_bylaw_areas`, the 9 `zoning_*_overlay` tables, `parcel_buildings`, `building_footprints`,
   `permits`, `coa_applications`, `neighbourhoods`, `neighbourhood_build_norms`, `neighbourhood_storey_norms`
   and `parcels.geom` (all 496,536 rows).
2. **The per-column parcels diff (dump → now, 157 columns, geometry excluded) reproduces every audit counter
   exactly.** `zoning_overlays` changed on **1,765** rows (= `parcels_enriched_count`), and every other pass-1
   column change is a subset of those rows. The max-build columns changed on **34** rows, existing-structure
   on **150**, scenario on **8** and optimal-config on **699** (= `optimal_config_enriched_count`). The
   `comp_*` columns changed on 4,481 rows.
3. **The Mac recomputes its own stored values.** Re-running pass 1's base-candidate / area-share SQL
   read-only over the 1,765 rows gives the stored `zoning_overlays->'base'` for **1,765 / 1,765**.
4. Therefore, with identical inputs and identical code (pass 1-5 SQL is untouched), the values differ
   because **the engine computing them changed**: the PC → Mac DB move.

---

# Diff classification: 119 on `sources_run1`, 18 on `none_incremental`

`capture-step-golden.js --compare=<old>,<new>`. In `sources_run1`, 92 of the 119 are
`summary.records_meta.audit_table.rows[i]` paths. Of those, **10 are value diffs at stable indices (rows 5–19)**.
The other 82 sit at rows 20–46 and are **index-shift artifacts**: the three new sixplex rows are inserted at
rows 20–22, so the 24 rows after them move down by 3, and the comparator diffs by index. Those 82 are
re-classified below **by metric name**, not by index.

## Class A: structural, caused by H6 (expected)

| path(s) | old → new | cause |
|---|---|---|
| `meta[0].reads.bylaw_map_areas` (both pairs) | ∅ → `[map_code,source,area_type,geom]` | new declared read |
| `meta[0].writes.parcels[103..105]` (both pairs) | ∅ → the 3 sixplex columns | new declared writes |
| `table_state[1].columns[104..106]` (both pairs) | ∅ → the 3 sixplex columns | migration 254 columns enter the projection |
| `summary.records_meta.config.enrich_parcels_sixplex_subdivide_max_vertices` (+ `pipeline_runs[0]…` in incr) | ∅ → 256 | new config key |
| `stdout_lines[0]` (both pairs) | `migrations=255 (floor 237)` → `migrations=258 (floor 254)` | descriptor `min_migration` 254 + migrations 253–255 applied |
| `stdout_lines[9..14]` (sources) | +2 lines | `phase sixplex starting/completed`; later lines shift by 2 (the VACUUM line's own ratio is Class C) |
| audit rows 20–22 (sources): `sixplex_map_missing` PASS, `sixplex_basis_counts`, `sixplex_enriched_count` 496,536 | new | the three new checks. Basis census: gis_in 169,044 · gis_out_ward_out 319,744 · gis_hole_ward_in 5,071 · gis_edge_ward_in 2,676 · no_geom 1. This is identical to `GROUP BY sixplex_membership_basis` on the live table |
| audit rows 20–46 index shift (82 paths) | n/a | consequence of the 3 inserted rows; by metric, every shifted row is either unchanged or classed elsewhere in this doc |
| `inputs_nonempty` (+ `rows[2].value.bylaw_map_areas` in incr) | +`bylaw_map_areas: 27` | new declared input |
| `summary.records_updated`, `records_updated_aggregate` | 0 → 496,536 | `sixplexIds` now feeds the aggregate. First run on the new NULL columns wrote all 496,536 rows, including the 1 no_geom row. Rerun 2741 = 0 |

## Class B: data drift NOT caused by H6. Every item measured against the dump before-image

### B1: engine change on the DB move (PC x86_64 PG 17.6 → Mac aarch64 PG 17.11), inputs byte-identical

| path | old → new | evidence |
|---|---|---|
| `rows[5]` `parcels_enriched_count` (+ `records_meta.parcels_enriched_count`) | 0 → 1,765 | exactly the 1,765 rows whose `zoning_overlays` (base area shares) differ from the dump. **1,762 of the 1,765 have a noise-level sliver candidate:** in 1,005, *every* candidate intersection is < 1 m² in total (e.g. parcel 69975: candidate areas 1.5e-7 and 5.3e-6 m² on a 6,184 m² lot, so its shares are ratios of floating noise; 0.7258 → 0.9722). In 749 more, one candidate is < 0.01 m². The remaining 11 are ±0.0001 rounding flips of a share that sits on the 4th-decimal boundary (e.g. 75173: 0.98675). Only 3 have no sub-1 m² candidate at all, and all 3 are such flips. 48 dominant `zoning_base_source_id` flips and 37 `zoning_class` flips cascade from the same rows |
| `zoning_stamp_only_count` (shifted row) | 496,535 → 494,770 | = 496,535 − 1,765 (stamp-only excludes the value-updated rows) |
| `rows[6]` `parcels_ambiguous_zone_count.ambiguous` | 959 → 958 | `zoning_is_ambiguous` flipped on 43 of the 1,765 rows, net −1 |
| `rows[8]` `max_build_enriched_count` (+ records_meta) | 0 → 34 | 33 of the 34 are in the 1,765 zoning set. The 34th (6328075) is a 0.01 rounding flip (`max_buildable_footprint_sqm` 54.58 → 54.59) |
| `rows[11]` `max_build_box_excluded_count` | 35,881 → 35,879 | same pass-2 cascade. This is a temp-table count, not a stored column, so it is **inferred, not row-verified** |
| `rows[13]` `ravine_constrained_count` | 14,216 → 14,215 | dump 14,216 / now 14,215 rows with `envelope_constraint_reason='ravine_constrained'`. All 19 changed `envelope_constraint_reason` rows are in the zoning set |
| `rows[14]` `existing_structure_enriched_count` (+ records_meta) | 0 → 150 | **0 of 150** are in the zoning set. All are `existing_width_m`/`existing_length_m` changes, and every delta is exactly **0.01** (151 values). That is `ROUND(…, 2)` of `ST_OrientedEnvelope(ST_Transform(geom, 2952))` landing on the other side of a rounding boundary. Inputs (`parcel_buildings`, `building_footprints`) are byte-identical |
| `rows[16]` `scenario_enriched_count` | 0 → 8 | all 8 are in the max-build changed set (scenario reads the envelope) |

### B2: the run clock (comps window) and the comps tie-breaks

Pass 4's window is `pr.issued_date >= asOfDate − 5 years`. The as-of date moved 2026-10-14 → 2026-10-16.

| path | old → new | evidence |
|---|---|---|
| `rows[17]` `comp_candidate_pool` | 9,189 → 9,182 | the candidate CTE run today with `2026-10-14` gives **9,189**, and with `2026-10-16` gives **9,182**. The 7 dropped candidate parcels are 1075, 146686, 154434, 273381, 284732, 358032 and 398451 (latest qualifying permit 2021-10-14/15) |
| `rows[18]`/`rows[19]` `comparable_builds_enriched_count` / `comp_zero_comps_count` (+ records_meta) | 348,946 → 348,967 / 87,964 → 87,944 | dump → now: `comp_count>0` +21, `=0` −20 (exact). The 4,481 comps-changed rows decompose with no residual (next 4 rows) |
| ↳ window slide | 3,435 rows | a dropped candidate was inside the subject's kNN-50 window (`ORDER BY geom <-> geom, id LIMIT 50`, old candidate set) |
| ↳ tied-permit pick | 830 rows | the kNN-50 window holds one of the 23 candidate parcels whose top permit is an **exact tie** in `recent`'s `DISTINCT ON (pid) ORDER BY issued_date DESC, residential_sqm DESC NULLS LAST`. That ORDER BY has no permit-level tiebreak. Examples: 10 vs 12 CUTHBERT (298 subjects), 56 B vs 56 A ORIOLE (259), 2901 BAYVIEW (`addition`/Retail Store vs `new_build`) |
| ↳ equal-distance reorder | 207 rows | same elements, different order. `jsonb_agg(… ORDER BY m.dist)` has no tiebreak, and candidates touching the subject all have `dist = 0` (e.g. 3822: 52 / 56 GOOCH both 0) |
| ↳ subject zoning changed | 9 rows | B1 cascade |
| `invariants[2].value`, `comp_fsi_p50_small_n_sample_count` (shifted row), `warnings[1]` | 3,650 → 3,758 | the dump evaluates the check SQL to **3,650** and today's DB to **3,758**. Net +108 = 109 gained − 1 lost, and **all 108 net gains are subjects that lost a dropped-window candidate** (comp_count fell under 3) |
| `optimal_config_enriched_count` (shifted row, + records_meta) | 667 → 699 | **699 = the rows whose 11 `OPTCFG_WRITE_COLS` differ from the dump.** 690 had a comps change, 8 a zoning change and 1 the max-build flip (6328075). Residual **0**. Pass 5 reads no `sixplex*` column (see above), so **the +32 is not the sixplex membership**. The OLD 667 was the PC run's own churn from comps changes since the previous run; it cannot be decomposed now because no pre-2729 image exists. The NEW 699 is fully decomposed |

**Finding (filed here, not fixed: fixing it would move pass 4 SQL):** EP-D9's fix gave the kNN and top-N
`ORDER BY`s an `id` tiebreak, but two tie sites remain. (i) `buildCompCandidatesSql`'s `recent` CTE
`DISTINCT ON (pr.zoning_dominant_parcel_id) ORDER BY … issued_date DESC, residential_sqm DESC NULLS LAST` has
no `permit_num` tiebreak: 567 candidate parcels tie at the top, and 23 of those ties differ in address,
structure_type or project_type. (ii) `jsonb_agg(… ORDER BY m.dist)` has no tiebreak. Both are stable run to run
on one DB (rerun 2741 = 0 writes), but they re-resolve when the physical order or plan changes, as on this
restore. They account for 1,037 of the 4,481 comps rows.

## Class C: inherent to any re-run

| path | old → new | mechanism |
|---|---|---|
| `enrich_parcels_duration_ms` (shifted row) | 2,610,903 → 719,961 | wall clock; the Mac is ~3.6× faster per phase (timings above) |
| `invariants[5].value` (sources) | 0.7849 → 0.8257 | `parcels_dead_tuple_ratio` after a `--full`. Autovacuum timing, plus more dead tuples: NEW rewrote 1,765 + 496,536 sixplex rows that OLD did not |
| `parcels_dead_tuple_ratio` (shifted row), `warnings[2]` | 0.7902 → 0.826 | the same ratio, as the plausibility row and its warning string |
| `stdout_lines[13]` (sources) | `dead_ratio 0.79` → `0.8219` | the runMaintenance VACUUM trigger line (at its new index after the 2 sixplex lines) |
| `table_state[1].content_hash` (both pairs) | changed | the hash projection gained 3 columns (Class A), and the values moved (B1/B2). Not separable, and not needed: every row-level change is accounted for above |

## Class D: capture order (`none_incremental` only)

The OLD `none_incremental` (2727) ran **before** the OLD full (2729). The NEW one (2742) ran **after** the NEW
full, against the DB it had just left fresh, which is the documented precondition.

| path | old → new | mechanism |
|---|---|---|
| `summary…rows[0].value` and `pipeline_runs[0]…rows[0].value` | `decision 563` → `decision 0` | `buildDecisionScopeWhere` counts parcels with a CoA `parcel_linked_at` > their `massing_enriched_at`. The max `parcel_linked_at` is 2026-10-10 21:38 UTC, and every parcel now carries `massing_enriched_at` 2026-10-16 12:22:52 (rerun 2741), so the count is 0 by construction. In OLD, 2727 preceded the full run's restamp |
| `invariants[2].value` | 3,647 → 3,758 | pre-full state (3,647) vs post-full state (3,758, = B2) |
| `invariants[5].value` | 0.0015 → 0 | dead-tuple ratio measured after the step's own VACUUM; timing |
| `stdout_lines[1]` | `dead_ratio 1` → `0.7923` | the VACUUM trigger ratio at entry: OLD entered after an earlier step's churn, NEW right after the full run |

---

# Gate

**Every diff in both pairs has a named, measured cause. None is UNEXPLAINED.** Class A is exactly the H6
surface. Every non-sixplex value diff is Class B and is reproduced row by row from the PC dump before-image.
B1 is the engine change on the PC → Mac DB move, on byte-identical inputs. B2 is the 2-day comps-window slide
plus the two residual comps tie sites. None of these is caused by H6: pass 1-5 SQL is unchanged, and pass 5
does not read the sixplex columns. One honest limit: OLD's own `optimal_config` 667 is not decomposable,
because no pre-2729 image exists.

## G8 machine-acceptance

G8 (`step-validate.mjs` `checkCaptures`) compares **`pre/sources_run1.json` vs `post/sources_run1.json`**. It
does not compare old-post vs new-post, and it never compares `none_incremental`, which has no `pre/` twin.
`enrich_parcels` has no `explained-diffs.json` and carries the `{gate:'G', item:'explained:report-citation'}`
ledger row, so the legacy channel applies. That channel cites the leaf name in
`docs/reports/2026-09-04-pilot9-enrich-parcels-assessment.md`. A replica of that loop gives:

* committed post: 660 diffs, **0 unexplained**
* new post: 682 diffs, **1 unexplained: `meta[0].reads.bylaw_map_areas`** (leaf `bylaw_map_areas`, absent
  from the assessment report)

Fingerprints are fresh: both new posts carry `a3d58ebb…`, which equals the current tree, so there are 0 stale.

There are two ways to clear the one key. Either is machine-acceptable.

1. **Legacy channel (the minimal fix):** add the literal `bylaw_map_areas` to the assessment report above its
   `## Validation scorecard (generated)` marker, for example a line citing this doc's Class A.
2. **`explained-diffs.json`:** an entry `{"key": "meta[].reads.bylaw_map_areas", "why": "…"}` (why ≥ 20 chars).
   But creating `golden/enrich_parcels/explained-diffs.json` while the `explained:report-citation` ledger row
   exists is an invariant #40 **orphan**. Deleting that row turns off the legacy fallback, so the file must
   then list **all 67** normalised pre/post keys, not just this one.
