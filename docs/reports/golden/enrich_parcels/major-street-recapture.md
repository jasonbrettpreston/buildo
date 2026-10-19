# `enrich_parcels` golden master: recapture for the major-street fix (`on_policy_road`, 2026-10-19)

**Ruling:** operator 2026-10-19, Q-MS-1 / Q-MS-2 / Q-MS-3 (`.cursor/major-street-audit-2026-10-19.md`). Spec 65 §2 step 7 and the Spec 69a dated note under M-214 record it. Spec 124 §5 R-C (a capture whose `source_fingerprint` no longer matches the tree is re-taken, and the cause of every diff is named) and R-DA (each PRE→POST diff is explained in `explained-diffs.json`).
**Precedent followed:** `h6-sixplex-recapture.md` (same file pair, same replay recipe).

## What changed in the step

- **Rule.** `on_policy_road`, the by-law's "lot abutting a major street" (800.50(457)), is now set when either:
  - the lot's `primary_frontage_street_name` (from `enrich_centreline`) equals the `road_name` of a Major Streets line within `enrich_parcels_major_street_frontage_m` (20 m), case-insensitive; or
  - it is a corner or through lot within `enrich_parcels_major_street_flank_m` (13 m) of such a line.
  The 5 m `road_overlay_distance_m` buffer it replaces stays for `on_priority_retail` only.
- **Compute** (`scripts/lib/compute/enrich-parcels.js`):
  - the `policy_road_overlay` layer takes kind `major_street`;
  - the pass-1 `scope` CTE carries the three `enrich_centreline` columns;
  - a `run_params` CTE references every bind, so the bind count stays 3 whichever layers are stale;
  - `runPass1` binds `[road_overlay_distance_m, frontage_m, flank_m]`;
  - `computePostPhase` adds one COUNT, the major-street residential share.
- **Descriptor:**
  - new reads `parcels.primary_frontage_street_name` and `parcels.on_policy_road` (post-phase), and `zoning_policy_road_overlay.road_name`;
  - checks `major_street_residential_pct_fail` (FAIL, pct ≥ 2) and `major_street_residential_pct_warn` (WARN, pct ≤ 15), limits from config;
  - terminal `failed_major_street_residential_pct`;
  - emit `major_street_residential_pct`;
  - 4 config variables;
  - one limitation: a centreline-only change waits for the next zoning change or `--full`.
- **Migration 277** seeds the 4 variables. They are also in `scripts/seeds/logic_variables.json` and pinned in the admin groups (R-DE (v), R-DF, R-DL).

## What was captured

All under the DB lock (`scratchpad/dblock/HELD`, major-street lane, 16:09–16:47 EDT). Recipes are from `capture-step-golden.js --replay`.

| capture | invocation | started (EDT) | wall | exit | verdict |
|---|---|---|---|---|---|
| `post/sources_run1.json` | bracket (`recapture.json`): 200-row `max_buildable_footprint_sqm` cohort +1, then `--chain=sources --args=--full`, restore | 16:09:46 | 34 min (step `duration_ms` 951,971) | 0 | WARN (same 3 WARN rows as the committed POST: `massing_zero_link_ghost` 1,577, `comp_fsi_p50_small_n_sample_count` 3,618, `parcels_dead_tuple_ratio` 0.79) |
| `post/none_incremental.json` | plain, `--chain=none` | 16:44:03 | 2.5 min | 0 | PASS (run 3588, deferred terminal) |
| `assert_schema/post/{coa,permits,sources,standalone}.json` | plain | 16:46:31–16:46:55 | <10 s each | 0 | — |

- **Rerun proof:** PASS on both enrich captures (parcels `drift_declared`, the pre-existing comps drift).
- **Bracket restore:** put back 0 rows, because the full run's max-build pass already healed the 200-row cohort.
- **Migrations applied first** (`scripts/migrate.js`): **270** (wave-4 assert_coa_freshness copy, idempotent) and **277**. The dev DB went from 264 to 266 applied migrations. `stdout_lines[0]` of the net-new steps' next captures will show the count change, which is already explained by key (R-DA, N1).
- **assert_schema POSTs were retaken** because its descriptor's generated probe list gained the 4 names (333 → 337); this is the 42dac2c8 precedent. Its PREs are legacy and untouched.

| | value |
|---|---|
| OLD `source_fingerprint` (committed) | `88ab6d153fc843e5c65b6ff873037dbc7a77b344a5dfd7789fe71e140351ba8f` |
| NEW `source_fingerprint` (= current tree) | `480b21b14ce9c6ddc1069eb89c07f3a12fc88987dcf9beeaa0af0381017fd8c9` |

## The measured change

| zone | residential lots | `on_policy_road` before | after | share |
|---|---|---|---|---|
| R | 104,546 | 12 | 12,444 | 11.9 % |
| RD | 236,070 | 3 | 12,470 | 5.3 % |
| RM | 54,868 | 5 | 3,966 | 7.2 % |
| RS | 29,681 | 1 | 1,860 | 6.3 % |
| RT | 14,928 | 0 | 782 | 5.2 % |
| **all residential** | **440,093** | **21** | **31,522** | **7.2 %** |
| all zones | 496,536 | 136 | 56,046 | — |

- **Matches the audit's estimate.** The audit estimated about 29,000 frontage lots plus corner and through flanks. The `major_street_residential_pct` emit reads 7.2, and both bounds PASS.
- **Positive control:** of residential lots fronting Bathurst St, **588 of 591** are flagged; of those fronting Yonge St, **15 of 15**. Examples: parcel 10561528 (627 Bathurst St, R), 10567827 (4384 Bathurst St, RD), 10504466 (3018 Yonge St, RD).
- **Negative control:** interior side-street lots 16–20 m from a Major Streets line stay **false**. Examples: 5386438 / 5387050 (889 / 890 Palmerston Ave, 17.0 / 19.7 m from Dupont St); 5430955 / 5431428 (505 / 462 Markham St, 17.6 / 16.4 m from Harbord St).
- **Over-match check, 10 % sample.** It covered non-corner, non-through residential lots within 20 m of their nearest Major Streets line whose frontage name differs from that line: 9 of 914 are flagged. Each of the 9 fronts a different Major Streets line within 20 m, which is the rule working as written.
- **Synthetic controls:** `src/tests/db/enrich-parcels-major-street.db.test.ts` MSD-1..7 pass on test:db.

## G8

`node scripts/analysis/step-validate.mjs --step=enrich_parcels --fast` reports **G8 3/3: compare ran, 712 diffs found, 0 unexplained**, score 16/17, hard-stop false. The one new key, `summary.records_meta.major_street_residential_pct`, is explained in `explained-diffs.json` with the measured counts above. Every other diff falls under existing keyed entries:
- the `table_state` parcels hash and columns;
- the audit rows;
- `stdout_lines`;
- the run clock.
