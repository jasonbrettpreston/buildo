# Active Task: WF3 — parcels loader wipes lot_size_sqm (bare-number STATEDAREA + non-durable geom backfill)
**Status:** Implementation (operator "proceed" 2026-10-01) — PLAN panel folded 2026-10-01 (Integration C1–C7, Reality-Check RC1–RC6, Regression Guardian F1–F2/D1). See `## Panel Fold (2026-10-01)` — it SUPERSEDES conflicting lines below.
**Workflow:** WF3 (Fix) · **Domain Mode:** Backend/Pipeline · **Severity:** HIGH (data — value-changing, cost FAIL invariant)

## Context
* **Goal:** Stop the `parcels` loader (converted step `scripts/load-parcels.descriptor.json` + `scripts/lib/compute/load-parcels.js`) from (1) dropping ~10.1K bare-number STATEDAREA values to NULL and (2) overwriting the P12-A1 `geom_backfill` lot values with NULL on every load; restore the data and the cost invariant `no_priced_null_lot_parcel` to 0.
* **Target Spec:** `docs/specs/01-pipeline/55_source_parcels.md` (:56 lot_size = "CSV `STATEDAREA` via `parseStatedArea` … the SOURCE-stated lot area, **not** derived from geometry … NULL = source-absent"; :57 `lot_size_source` = `'stated'|'geom_backfill'`, "Consumers reading mixed semantics must split on this column"). Cross: Spec 65 (`65_enrich_parcels.md:197` MB-2 lot gate, `:220` "run `--full` after a lot/massing reload"), Spec 88 (cost), Spec 122 §5.5 / Spec 124 (converted-step recapture), mig 214 header (P12-A1 intent).
* **Key Files:** `scripts/lib/compute/load-parcels.js` (`parseStatedArea` :104-110, `shapeRecord`), `scripts/load-parcels.descriptor.json` (columns :59-61, `write_discipline.guard_columns` :74-84), `scripts/load-parcels.notes.json` (constants: add SQFT_TO_SQM), `src/tests/steps/parcels/violations.test.ts`, `src/tests/step-library.logic.test.ts` (T5/T7 legacy-text locks), `docs/specs/01-pipeline/55_source_parcels.md`.
* **Execution Provider:** deepseek — compute + test edits via `node scripts/deepseek-exec.js --brief <file> --provider=deepseek` (write_scope: the compute + red tests). Descriptor/notes/spec/registry/golden recapture are orchestrator (claude) — registry_reserved / verification seats. No migration.

## Premise (MEASURED 2026-10-01, read-only, local DB 127.0.0.1:54322, mig 245)
1. **Pre-existing, not a conversion regression.** Legacy `scripts/load-parcels.js@9b414ef7` has the identical regex `^([\d.]+)\s*sq\.m` (:50-56), `lot_size_sqm = EXCLUDED.lot_size_sqm` and the `lot_size_sqm IS DISTINCT FROM` guard (READ). Converted step reproduces it byte-for-byte (T5/T7). Filed as review_followups #76 (DEFER, "Separate WF3 if non-trivial") — READ.
2. **Writer = the legacy loader during the parcels ① PRE-golden capture** (`capture-step-golden.js`, git_head f122bca7), 2026-09-24 11:37–11:45Z: golden `docs/reports/golden/parcels/pre/sources.json@9b414ef7` records 9,970 inserted + **485,525 updated**; parcels.created_at minute histogram shows exactly 9,970 rows created 11:37–11:45Z; no `pipeline_runs` row in that window (harness run). No loader ran between the 07-08 backfill and 09-24 (last `sources:parcels` = run 1468, 07-08 13:54Z, before the backfill). Cost invariant 0 through run 1969 (09-23 13:07) → 3,369 FAIL at run 2191 (09-30). Every converted run since reports ≤1,054 updates (cannot have wiped 8,446) — MEASURED.
3. **Bare numbers are sq.m.** 10,121 positive bare values vs `ST_Area(geom::geography)`: 98.5% within 5%, p50 rel-err 0.0005, p90 0.006; 0.0% would agree if read as sq.ft. 26 are `0`. 15 `sq.ft` rows: 93.3% agree after ×0.092903. `unknown` 1,632, `None` 49 have no stated value.
4. **Damage:** 10,147 bare-number rows with NULL lot (7,347 still `geom_backfill`, 2,800 source NULL); 8,446 `geom_backfill` rows now NULL overall; 1,647 unknown/None/sq.ft NULL; all 10,147 lot_size_sqft NULL. Downstream (after enrich_parcels run 2190, incremental): 7,410 lot_confidence 'medium' via the geom/fxd pair with **no coverage_cap / fsi_cap** (Spec 65 MB-3), 2,737 'low' (envelope withheld); 5,974 NULL-lot parcels carry a GFA; 3,369 priced (RD 1,703 / R 640 / RM 445 / RS 297 / RT 237 / RA 43 / RAC 4; 2,519 geom_backfill-old + 850 new-NULL-source); 33 of them GFA > 3× geom area; max cost_fb_total $65.6M.
5. Loader never writes `lot_size_source` → 6,631 new parcels with stated lot but NULL source (followup already filed 09-28b).

## Technical Implementation
* **Fix (c) = (a) + (b), grounded in Spec 55:56/57:**
  * (a) `parseStatedArea`: accept `^\d+(\.\d+)?$` / `^\.\d+$` bare numbers as sq.m (Premise 3) and `<n> sq.ft` × 0.09290304 (stated-derived, still "the SOURCE-stated lot area"); `unknown`/`None`/`0`/negative → NULL (unchanged). SQFT_TO_SQM declared in notes.json `constants` (unit definition, not a tunable — same posture as SQM_TO_SQFT).
  * (b) Durability via the EXISTING declared codegen axis (no library change): `columns[].on_empty:"preserve_null"` on `lot_size_sqm`, `lot_size_sqft`, and a NEW written column `lot_size_source` (`'stated'` when the parser returns a value, else NULL). Codegen (write.js:1086-1102) renders `COALESCE(EXCLUDED.c, parcels.c)` and guard `(EXCLUDED.c IS NOT NULL AND parcels.c IS DISTINCT FROM EXCLUDED.c)` → a NULL parse never overwrites a backfilled value, and an idempotent re-run stays zero-write. A stated value supersedes a backfill and flips provenance to `'stated'`.
  * **Decision for panel (D1):** preserve_null also retains a prior *stated* value when the publisher later retracts STATEDAREA to `unknown` (same posture as the 5 address columns). Alternative (provenance-scoped preserve only for `geom_backfill`) needs a new codegen axis — rejected as heavier (Standard-but-simple); panel to confirm.
* **Invariant 3 (`no_priced_null_lot_parcel`) stays on lot** — it encodes P12-A1's intent (a NULL lot is un-lot-validatable: no FSI/coverage cap, mislink guard blind — review_followups:251) and it caught this. Gating on max_buildable would hide 5,974 uncapped envelopes. The enrich-side gap (envelope emitted on NULL lot via geom/fxd 'medium') is FILED, not fixed here.
* **Data restore (operator-run, after code lands):** the parser fix restores the 10,121 bare rows on the next load; the remaining ~1.6K (unknown/None) + 26 zero rows need the P12-A1 geom backfill re-applied once (one-off script, backup table `_backup_null_lot_20261001`, `ROUND(ST_Area(geom::geography),2)`, `lot_size_source='geom_backfill'`, IS DISTINCT guard) — now durable under (b).
* **Database Impact:** NO migration (column exists, mig 214). Value-changing UPDATE of ~11.8K rows via load + one-off backfill (backup table first).

## Standards Compliance
* **Try-Catch Boundary:** N/A (pure compute + declared descriptor; library owns I/O).
* **Unhappy Path Tests:** `unknown`, `None`, `0`, `-1.5 sq.m`, `1,000`, empty, `12 sq.ft`, whitespace; preserve_null retains a non-NULL stored lot when the parse is NULL; idempotent re-run zero writes.
* **logError Mandate:** N/A (no catch blocks added).
* **UI Layout:** N/A.
* **Observability:** add an INFO check `stated_area_unparsed` (count of non-empty STATEDAREA the parser returned NULL for, by shape) so an unknown format can never silently NULL again; descriptor `deviations[]` records the two declared deltas vs legacy text (T5/T7).

## Execution Plan
- [ ] Step 0: `node scripts/ai-env-check.mjs`; read `docs/specs/00_engineering_standards.md` §11; re-run the Premise queries (fresh numbers in the plan header).
- [ ] Step 1 (RED, engine brief): `violations.test.ts` — parseStatedArea bare-number/sq.ft/unknown/zero table; shapeRecord emits `lot_size_source`; codegen guard/SET text for the three preserve_null lot columns; DB-free fixture row with a stored geom_backfill lot + `unknown` source keeps its value. Prove red for the right reason (assert current failures), both directions.
- [ ] Step 2 (GREEN, engine brief): compute changes in `load-parcels.js` (parser + `lot_size_source`), notes.json constant.
- [ ] Step 3 (orchestrator): descriptor columns (`on_empty:"preserve_null"` ×3, new `lot_size_source` column), `stated_area_unparsed` check, `deviations[]` + T5/T7 declared-delta update; Spec 55 :56/:57 amended (bare numbers = sq.m with the measured agreement, sq.ft conversion, durability rule); review_followups #76 → CLOSED, new row for the enrich NULL-lot envelope gap.
- [ ] Step 4: `npm run typecheck && npm run lint && npx vitest run src/tests/steps/parcels src/tests/step-library.logic.test.ts` then full `npm run test` (1 fork); `npm run test:db` parcels suites.
- [ ] Step 5 (OPERATOR-run recapture, converted step fingerprint moves): parcels PRE goldens on pre-fix HEAD are already on file — recapture POST goldens both arms (`scripts/analysis/capture-step-golden.js`, sources + `--chain=none`; ~8 min each per the 465 s legacy load) + a forced-change proof (`records_updated` ≥ ~10.1K on the first post-fix run, 0 on the re-run); explain every G8 diff.
- [ ] Step 6 (OPERATOR data op): one-off geom re-backfill for residual NULL-lot rows with valid geom (backup table first), then `enrich_parcels --full` (~64 min; Spec 65:220 — incremental does NOT re-trigger on a lot-only change; run 2190 was incremental, max_build_enriched_count 57,206) then `compute_parcel_cost_estimates` (~3.5 min), then `assert_parcel_sanity`. Expect `no_priced_null_lot_parcel` = 0.
- [ ] Step 7 (OUTPUT roster): Reality-Check on re-run values (lot vs geom agreement, GFA ≤ 3×lot, cost magnitudes on the 3,369 cohort); Regression Guardian on the descriptor/compute diff (fences: address COALESCE, DEC-FENCE2 arms, PR-D1..D4 pins, T5/T7 legacy text, "lot_size_sqm is EXCLUSIVELY this function's output" doc invariant).
- [ ] Step 8: WF6 exit gate; commit `fix(55_source_parcels): …` with `Severity: HIGH` + `Lesson-routing:` footer (lesson: a one-off data backfill into a loader-owned guarded column is not durable unless the loader declares the preservation).

## Panel Fold (2026-10-01) — supersedes conflicting lines above
**Premise re-executed (RC, MEASURED):** bare numbers 10,582 (10,556 positive, 26 zero); 98.47% within 5% of geom (p50 0.0005, p90 0.0059); 0.00% as sq.ft; sq.ft 14/15 agree after conversion. NULL-lot total 11,796, all with valid geom. 3,369 priced NULL-lot confirmed; the parser fix restores 3,064 of them, the geom backfill the remaining 302.
**Premise correction (Integration C6, READ):** run 2190 was a FULL run (manifest `enrich_parcels.chain_args.sources=["--full"]`, 496,509 scanned) — it recomputed on already-wiped lots. Incremental scope (`compute/enrich-parcels.js:430-432`) has no lot term, so `--full` remains required.

**Fix amendments:**
- **A1 (C1, RG):** `lot_size_source` AND `lot_size_sqft` join `write_discipline.guard_columns` (preserve_null guard form). Without it the 6,631 stated-but-unsourced rows never get `'stated'`. First post-fix run expectation: ≈16.7K updates (10.1K restore + 6.6K source stamp), then 0 on the re-run.
- **A2 (C2):** no new module literal — sq.ft → m² as `value / SQM_TO_SQFT` (gate E `compute-no-module-numeric-const`; no ledger row; notes.json `unit_constants` stays 2). Relative error ≈3e-7, below the 2dp write.
- **A3 (RC1 placeholder):** parser rejects values > 1e7 m² (largest real stated value 543K) → NULL, tagged. Kills the two `123456789` parcels (10625775, 10548890).
- **A4 (C3/F2 — the real locks, all `src/tests/steps/parcels/violations.test.ts`):** WRITE_COLUMNS :53-60/:333-336; CHECK_IDS :120/:436; on_empty set :351-362 (extend by exactly the 3 lot columns, keep the "no OTHER column" assertion); GUARD_COLUMNS :69-79/:364; fence text :500 → `OR (EXCLUDED.lot_size_sqm IS NOT NULL AND parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm)`; legacy reproduction :523 gets a third declared delta in `applyWf3Deltas`. Address COALESCE / date_effective / DEC-FENCE2 lines byte-identical. **T5/T7 in step-library.logic.test.ts are NOT touched** (own fixture; an edit there is a red flag). Row-2 behavioural pin (:637-646, blank STATEDAREA → null) unchanged; the `:102` doc comment reworded to "shapeRecord's lot_size_sqm is exclusively stated; the stored column may hold a preserved geom_backfill, discriminated by lot_size_source". notes.json lock :889 unchanged (no new constant).
- **A5 (C4/F1 — dead TS twin):** `src/lib/parcels/geometry.ts` `parseStatedArea` has no production importer (only `parcels.logic.test.ts`). DELETE the function and its `describe('parseStatedArea')` block (knowing retirement — one parser, no silent divergence). Other geometry.ts exports untouched.
- **A6 (C5):** the preserve-on-NULL behaviour is proven in `src/tests/db/load-parcels-geom-guard.db.test.ts` (real `upsertSqlFor`/`bindRow`, BEGIN/ROLLBACK): stored geom_backfill + `unknown` keeps value+source; stated value supersedes backfill and flips source; identical re-run = 0 rows. `violations.test.ts` asserts SQL text only.
- **A7 (C7):** capture `--table-columns=parcels:` gains `lot_size_source`; `npm run lineage-docs -- --refresh` after the post-fix run. Recapture lands in the SAME commit as the compute (gate G).
- **A8 (RC3/C2 backfill):** the one-off backfill writes `lot_size_sqm = ROUND(ST_Area(geom::geography),2)`, `lot_size_sqft = ROUND(sqm*10.7639,2)` (keeps the sqft invariant; also fills the 484 old backfill rows' NULL sqft), `lot_size_source='geom_backfill'`, only WHERE lot IS NULL AND ROUND(area,2) > 0 (5166716 = 0.00 m² stays NULL), IS DISTINCT guard, backup table first. Expected residual NULL-lot = 1.

**Observability (RC, RG-D1) — loader tags + post-load invariants:**
- Loader INFO check `stated_area_unparsed` via per-shape seam tags (`stated_area_unparsed:unknown|zero|negative|placeholder|other`; precedent `load-centreline.js` tags, Integration §5).
- **D2 (decision for operator):** the cross-field counts the loader cannot see go in `assert_parcel_sanity` as rows: (i) `lot_source_coupling` (source IS NULL ⇔ lot IS NULL) — FAIL-class, 1 violator today (5166716, fixed by A8 path); (ii) `lot_stated_geom_ratio_outlier` (stated lot/geom outside [0.5, 2]) — INFO, 34 today; (iii) `lot_stated_retracted_preserved` (source='stated' AND raw no longer parses) — INFO, the D1 safety net; (iv) `lot_sliver_lt_20m2` by zone — INFO. **Recommend (a): add them in this WF3** (D1's acceptance depends on (iii)); cost = one more converted step's recapture. (b) = file as follow-up and run the four as one-off queries in Step 7.
- **D1 (panel: ACCEPT, conditional):** preserve a prior stated value on publisher retraction, with Spec 55:57 amended — `'stated'` means last-stated, may be stale vs `stated_area_raw` — plus D2(iii) counting it, plus a descriptor `deviations[]` entry.
- Not fixed here, filed: 34 stated/geom outliers (accepted as source-stated; MB-2 lot gate + mislink guard own them); enrich emitting an envelope on NULL lot; `acquired.geom_parse_failures` never populated (always 0).

**Operator ruling (2026-10-01): materiality — < 100 rows is not an issue, ~1K is.** Applied:
- **D2 RESOLVED — no new checks (Spec 122 §ASSERT / Spec 124 standard-but-simple, READ):** cross-row/DB invariants belong to the ASSERT archetype (`outputs:"none"`, checks ≥ 1); the INGESTOR's own checks read `ctx.acquired` only (`compute/load-parcels.js` `null_address_pct` :498, no DB access). The ASSERT step `assert_parcel_sanity` ALREADY carries the material lot checks (descriptor READ): `lot_size_out_of_range` (WARN, zone bounds via `parcel_sanity_lot_size_min/max_sqm` logic vars — catches the 123456789 placeholders and slivers once restored), `lot_size_out_of_range_common_condo` (INFO), `lot_implausible_correctly_excluded` (INFO), `nulllot_on_gfa_or_cost_bearing` (WARN — it flagged 3,639 in run 2168 alongside the cost FAIL). The D2(i)-(iv) rows are sub-100 today (1 / 34 / 0 / covered) → DROPPED.
- **D1 visibility** = the loader's `stated_area_unparsed:<shape>` INFO tags: a material retraction (≥1K) shows as a ≥1K jump on the `unknown` tag (baseline 1,632). No new check.
- **DROPPED as sub-100:** A3 parser placeholder rule (2 rows; `lot_size_out_of_range` owns them); RC ratio-outlier/coupling/sliver rows; `geom_parse_failures` side finding (filed only).
- **Specs consulted (READ):** Spec 55:56-57 (amended in Step 3), Spec 65 MB-2 :197 (confidence = stored lot vs geom vs frontage×depth → recomputed by `--full`), :216 mislink guard (reads `lot_size_sqm` — restored values re-arm it), :220 (`--full` after lot reload — Step 6), Spec 122 ASSERT profile / §5.5 recapture, Spec 124 Rule 3 (no new tunable: sq.ft via `/ SQM_TO_SQFT`).
- **Execution Provider (operator): deepseek for ALL file edits** — compute, tests, TS twin deletion, descriptor, notes, Spec 55, review_followups (none are `registry_reserved` in `scripts/lib/exec-policy.json`, READ). Claude: briefs, diff review, verification seats, gate runs, landing. Operator: captures + data ops (classifier).

**Revised Execution Plan (replaces Steps 1–6 above):**
1. RED (engine brief): violations.test.ts parser table (bare, `.5`, `1,000`→null, `0`, `-1.5 sq.m`, `unknown`, `None`, `12 sq.ft`), shapeRecord `lot_size_source`, the A4 lock edits, CHECK_IDS; db test A6; prove red for the right reason.
2. GREEN (engine brief): compute parser + `lot_size_source` + tags (A2); A5 deletion.
3. Engine briefs (one anchored edit each), Claude reviews: descriptor (A1, columns, check, deviations[]); Spec 55 :56/:57 (bare = m² with measured agreement, sq.ft conversion, durability + last-stated semantics); review_followups #76 → CLOSED + filed rows.
4. Gates: typecheck, lint, targeted vitest, `npm run test` (1 fork), `npm run test:db` parcels suites, `step-validate --step=parcels` 17/17.
5. OPERATOR capture: parcels POST both arms (A7 commands from Integration §4c), forced-change ≈16.7K → 0; G8 diff explained; same commit as code.
6. OPERATOR data: A8 backfill → `node scripts/run-chain.js sources --from=enrich_parcels` (passes `--full`; runs cost, coverage, sanity, snapshot, bounds, engine-health). Expect `no_priced_null_lot_parcel` = 0, 33 GFA>3× rows cleared, NULL-lot = 1.
7. OUTPUT roster: Reality-Check (zone bounds RC1 as INFO, coupling, ratio, cost max on the 3,369 cohort), Regression Guardian on the diff, DeepSeek lens set (spec/idempotency/error-paths) grounder-adjudicated.
8. WF6; commit `fix(55_source_parcels): …` with `Severity: HIGH` + `Lesson-routing:` footer.

## Review Roster (WF3 lean)
* **PLAN:** Integration (main tree — verify preserve_null codegen on a numeric guard column, capture harness args, enrich `--full` trigger semantics) · Reality-Check (plausibility bound: stated vs geom ≤5% for ≥98%; residual NULL-lot ≤ invalid-geom count; zone-aware lot bounds) · Regression Guardian (fences above).
* **OUTPUT:** same three + DeepSeek lens set (spec / idempotency / error-paths), grounder-adjudicated.

## UNVERIFIED (to close at plan review)
* Whether the converted `enrich_parcels` scope logic re-selects lot-changed parcels without `--full` (Spec 65:220 says no; not executed).
* Whether `run-chain.js --from` can pass `--full` to enrich_parcels, or it must be run standalone.
* Exact parcels in the 435 bare + 49 None `geom_backfill` rows still intact (assumed absent from the current CSV — not queried against the file).

> **PLAN LOCKED. Do you authorize this WF3 (Fix) plan? (y/n)**

## Step-registry READ table (2026-10-01, post-landing)

Basis: main tip c3505327 (contains merge 641d21f7). Diff of the merge vs first parent touched: Spec 55, compute/load-parcels.js, descriptor, geometry.ts, parcels.logic.test.ts, steps/parcels/violations.test.ts, db/load-parcels-geom-guard.db.test.ts, review_followups, lessons, parcels POST goldens. Every row below was opened and the cited line READ; no DB access (row counts are the caller's, not re-queried). Columns: **T** = touched by 641d21f7 · **Behaviour impact** · **Reg** = registration (descriptor/notes/consumer list) · **Spec** = owner spec updated same commit.

### A. Declared FILES (step:registry parcels)
| # | File:line | T | Behaviour impact | Reg | Spec |
|---|---|---|---|---|---|
| A1 | scripts/load-parcels.js:1-40 (frozen shell, no lot_size reference) | N | none | n/a | n/a |
| A2 | scripts/load-parcels.descriptor.json:60-62 (3 lot cols `on_empty:preserve_null`), :76-77 (guard `lot_size_sqm`,`lot_size_source`), :472-480 (deviation entry) | Y | the write: NULL parse keeps stored lot+source; stated supersedes and flips source | Y (columns, guard, deviations[]) | Y (Spec 55:56-57) — **but :92 `why.text` still says "NINE entries" / "ten-term WHERE"; now 10 declared + geom = 11 (stale, F4)** |
| A3 | scripts/load-parcels.notes.json:39 ("TEN-term ... (geom, geometry, lot_size_sqm, feature_type, five address, date_effective)") | N | none (prose) | **stale: omits lot_size_source, now 11 terms (F4)** | n/a |
| A4 | scripts/lib/compute/load-parcels.js:99-115 (`parseStatedArea` bare/sq.ft), :381-384 (`stated_area_unparsed` tag, sqft), :413-415 (`lot_size_source`), :221/:232 (`estimateLotDimensions` scales by stated area when present), :603-606 (check) | Y | ~9.3K bare-number rows now stated → lot restored AND frontage/depth/is_irregular rescaled to stated (not polygon) area; these ride the same UPDATE (lot_size_sqm guard term fires). Single tag, not per-shape (plan's `:<shape>` suffix not implemented — F5) | Y | Y |
| A5 | src/tests/steps/parcels/row-conservation.test.ts (48 lines, 0 lot refs) | N | none | n/a | n/a |
| A6 | src/tests/steps/parcels/violations.test.ts:51-57 (WRITE_COLUMNS +source), :74-96 (guard + PRESERVE_NULL), :379 (10-item guard), :499-542 (fence text), :668-743 (shapeRecord pins) | Y | locks match descriptor | Y | Y |

### B. DATA
| # | File:line | T | Behaviour impact | Reg | Spec |
|---|---|---|---|---|---|
| B1 | migrations/011_parcels.sql:15-16 (`DECIMAL(12,2)` x2, nullable) | N | none; restored values fit | n/a | n/a |
| B2 | migrations/214_parcels_lot_size_source.sql:27 (TEXT, no CHECK), :32-33 (labels 'stated') | N | loader now the writer (was mig/backfill only); no CHECK constraint on the vocabulary — `'stated'|'geom_backfill'` is enforced nowhere in DB | n/a | Spec 55:57 |

### C. COLUMN CONSUMERS (non-test)
NULL = treats NULL lot specially. src/ readers did NOT run in chain 2168 (live-runtime/API; effect is immediate on read).
| # | File:line | T | NULL handling → restored ~11.8K parcels | reads source? | geom_backfill risk | Ran 10-01? |
|---|---|---|---|---|---|---|
| C1 | scripts/lib/parcel-cost.js:372-373 (`plausibleFsi(gfa, lot)`) | N | NULL lot → FSI scalars NULL; now computed | N | FSI = gfa/geom area — fine | Y (cost) |
| C2 | scripts/lib/compute/compute-parcel-cost-estimates.js:137 | N | source SELECT; feeds C1 | N | — | Y |
| C3 | scripts/lib/compute/assert-data-bounds.js:206 (coa table), :242 (`parcel_lot_outliers` (0,1e6]) | N | NULL excluded; restored rows enter the bound | N | none | Y |
| C4 | scripts/lib/assert-parcel-sanity-fields.js:131-141 (lot bounds), :189-190, :236-238 (`nulllot_on_gfa_or_cost_bearing`), :271-291 (mislink/greenspace) | N | NULL excluded from bounds; nulllot WARN should collapse (3,639 → ~0) | N | none (bounds are value-only) | Y |
| C5 | scripts/lib/compute/enrich-parcels.js:432 (incremental scope), :513-519 (`pair_lg`, `best_area = COALESCE(lot, geom, fxd)`), :523-537 (confidence/basis), :542 (emit), :577/:607/:620/:632-650 (coverage/mislink/fsi/suite gates) | N | NULL lot → best_area = geom_area, coverage_cap/fsi_cap NULL; now populated | **N** | **YES — F1: for geom_backfill rows lot = ROUND(ST_Area(geom::geography),2) = geom_area, so `pair_lg` is TRUE by construction → confidence ≥ 'medium' → emit=true for every in-band backfill parcel (~2,143). Circular agreement, not independent evidence. Spec 55:57 says "consumers reading mixed semantics must split on this column"; this one does not.** | Y (--full) — ran, but the tautology is not a check anyone asserts |
| C6 | scripts/lib/assert-data-bounds-fields.js:157, :204, :212 | N | registry text only | N | none | Y |
| C7 | scripts/lib/compute/assert-global-coverage.js:533 (`parcels_with_area`) | N | coverage numerator rises ~11.8K | N | counts backfill as "has area" — by design | Y |
| C8 | scripts/lib/assert-global-coverage-fields.js:287 (`p_step9_lot_size_sqm`, chain `permits`) | N | row is a **permits-chain** row | N | none | **N** (permits chain) |
| C9 | scripts/lib/compute/link-massing.js:240 (`footprint_exceeds_lot` audit count; NULL lot → comparison false) | N | count can rise for restored lots | N | none | **N — link_massing precedes enrich_parcels in `manifest.chains.sources`; observational metric only (F3)** |
| C10 | scripts/lib/max-build.js:24-29 (LOT_TOLERANCE/MIN/MAX), :275-283 (`LOT_MAXBUILD_INPUT_COLS` incl. lot_size_sqm → propagated to permits/coa) | N | constants + propagation list | N | see C5 | n/a (lib) |
| C11 | scripts/lib/coa-cost-model.js:203 (reads `coa_applications.lot_size_sqm`, the propagated copy) | N | stale until coa enrich re-runs | N | — | **N** |
| C12 | src/app/api/permits/[id]/route.ts:239-242 (coverage% = buildings/lot_size_sqft; NULL → coveragePct null) | N | restored parcels now show a coverage % | N | geom area is the right denominator — OK; needs sqft non-NULL (A8 filled the 484 old NULL-sqft) | N (runtime) |
| C13 | src/lib/api/public-projections.ts:81-82 (PARCEL_PUBLIC_COLS sqm/sqft, NOT source) | N | public API serves restored lots | **N — source not exposed** | public consumers cannot distinguish stated vs geom (F2) | N |
| C14 | src/lib/admin/parcel-lookup.ts:42 (lot cols), :60 (`lot_size_source` in T3 lot_address group) | N | display | **Y — the ONLY non-test reader (grep: src+scripts, excl. load-parcels & generated schema.ts:891)** | displays it — OK | N |
| C15 | src/lib/leads/lead-inspect-query.ts:146 (`parcel_area_sqm`), :517 | N | inspector shows lot | N | unlabelled | N |
| C16 | src/lib/parcels/consumer-lookup.ts:34 | N | returns lot | N | unlabelled (F2) | N |
| C17 | src/components/admin/LeadDetailInspector.tsx:454-455 (`?? '—'`) | N | '—' → value | N | unlabelled | N |
| C18 | src/features/leads/lib/cost-model-shared.js:214-220 (fallback GFA = lot × coverage × floors when no footprint), :623-625 (T1 FSI band; NULL lot → `t1_band` rejection) | N | **restored lots switch the fallback GFA from 0 to lot-based, and lift T1 out of `t1_band` rejection** | N | geom area as lot is the documented intent of P12-A1 (Spec 55:57) | **N — used by compute-coa-cost-estimates.js:551 (coa chain), not re-run (F3)** |
| C19 | src/features/leads/lib/cost-model.ts:287-294 (same fallback) | N | as C18 | N | as C18 | **N (permits cost / runtime)** |
| C20 | src/lib/admin/lead-schemas.ts:234 (`z.number().nullable()`) | N | schema accepts both | N | none | n/a |
| C21 | src/lib/parcels/types.ts:11-12 (`number|null`) | N | type only; no `lot_size_source` field | N | — | n/a |
| C22 | src/app/permits/[id]/page.tsx:14-15, :307, :319 (falsy → 'N/A') | N | 'N/A' → value | N | shown as plain "sq m", no provenance (F2) | N (runtime) |
| C23* | scripts/enrich-permits.js:376-389 (`area_share = lot / SUM(lot)`, `ORDER BY lot DESC NULLS LAST` dominant-parcel pick), :800-802 | N | **NULL lot → area_share NULL and parcel ranked last; restored lots can change the dominant parcel + area_share on multi-parcel permits/CoAs** | N | — | **N (permits/coa chains, F3)** |
| C24* | scripts/compute-cost-estimates.js:153, :872 | N | permit cost reads parcel lot (C19 fallback) | N | — | **N** |
| C25* | scripts/compute-coa-cost-estimates.js:484, :869 | N | CoA cost reads parcel lot (C18) | N | — | **N** |
| C26* | scripts/compute-build-norms.js:73, :96-97 (`pa.lot_size_sqm > 0` FSI norm) | N | restored lots join the realized-FSI norm sample | N | geom area denominator OK | **N** |
(*) not in the requested list; found by `grep -rln lot_size_sqm scripts` (non-analysis). scripts/analysis/* (7 files) + seed-parcels.js + generate-*-descriptor.js are one-off/generator readers — not runtime, not tabled.

### D. TESTS outside src/tests/steps/parcels naming lot_size_* (53 files, grep-level READ)
| # | Group | T | Impact |
|---|---|---|---|
| D1 | src/tests/db/load-parcels-geom-guard.db.test.ts:160-405 | Y (new) | the only out-of-dir test that names `lot_size_source`; proves preserve/supersede/legacy-NULL-flip |
| D2 | src/tests/parcels.logic.test.ts:25 (TS twin retired), :224 | Y | parser locks moved to steps/parcels |
| D3 | src/tests/fixtures/parcels-columns.snapshot.json:101 (`lot_size_source` already present) | N | none |
| D4 | src/tests/step-library.logic.test.ts (T5/T7 own fixture) | N | correctly untouched (plan A4) |
| D5 | enrich-parcels*.{logic,db}.test.ts (13), steps/enrich_parcels/violations.test.ts, max-build.logic.test.ts | N | fixture lots; none models a lot equal to geom area with source='geom_backfill' → F1 unlocked |
| D6 | parcel-cost / compute-parcel-cost-estimates* / assert-parcel-sanity.db / assert-global-coverage.infra | N | fixture lots; no source semantics |
| D7 | enrich-permits*.{logic,db}.test.ts (5), compute-build-norms.db, zoning-permits.logic | N | fixture lots |
| D8 | cost-model{,-shared}.logic, archetype-ladder / coa-archetype-ladder.logic, parity-battery, ParcelCostTool.ui | N | NULL-lot fallback pinned with fixtures — behaviour unchanged, inputs changed |
| D9 | api.infra, public-projection-response.infra, consumer-parcel-lookup.{infra,db}, lead-inspect-query.{infra,db}, admin-leads-inspect.infra, admin-detail-inspectors.ui, control-panel.logic, pipeline-sdk.logic, step-conformance.infra, link_parcel_addresses/violations, migration-245, optconfig-staleness.db, factories.ts | N | column-list / fixture refs only |

### Findings
- **F1 (≥1K, not validated as a property):** enrich-parcels.js:513-537 — a `geom_backfill` lot equals `geom_area`, so `pair_lg` is tautologically true and lot_size_confidence/emit rise to ≥'medium' for ~2,143 parcels on circular evidence. Pre-existing design since P12-A1 (the ~8.9K pre-wipe backfill behaved the same), restored — not introduced — by this WF3; the --full run executed it but no check asserts it. Spec 55:57's "consumers must split on lot_size_source" has zero script consumers. Route: follow-up (Spec 65 MB-2 :197), not a blocker for this landing.
- **F2 (presentation):** public-projections.ts:81-82, consumer-lookup.ts:34, page.tsx:319 serve/display geom-derived lots unlabelled as lot size; only admin parcel-lookup.ts:60 shows provenance. Spec 55:57 allows it (P12-A1 intent); file as follow-up if provenance must be public.
- **F3 (≥1K, unvalidated — not run 10-01):** permits/coa chains read the restored lots: enrich-permits.js:376-389 (dominant parcel + area_share), compute-cost-estimates.js:153, compute-coa-cost-estimates.js:484 → cost-model{.ts,-shared.js} fallback GFA + T1 band, compute-build-norms.js:73. `permits.lot_size_sqm`/`coa_applications.lot_size_sqm` (propagated copies) are stale until those chains run; link_massing's `footprint_exceeds_lot` metric (link-massing.js:240) also predates the reload in run 2168. Validate on the next permits + coa runs (watch cost totals / FSI-band rejections / area_share deltas).
- **F4 (doc drift, declared files):** descriptor.json:92 `why.text` ("NINE entries", "ten-term WHERE") and notes.json:39 ("TEN-term", no `lot_size_source`) were not updated; actual = 10 declared guard columns + `geom` = 11 terms (violations.test.ts:379 is correct).
- **F5 (plan ≠ code, minor):** compute :383 emits a single `stated_area_unparsed` tag, not the plan's per-shape `stated_area_unparsed:<shape>`; the D1 visibility rule (≥1K jump on `unknown`) must read the single total instead.
- B2: no DB CHECK on `lot_size_source` vocabulary (sub-material; note only).

## Post-landing dispositions (orchestrator, 2026-10-01)
- F1 (≈2,143 geom_backfill lots self-validate in enrich_parcels MB-2, enrich-parcels.js:513-537): PRE-EXISTING (P12-A1), restored not introduced. ≥1K → own WF3 against Spec 65 MB-2 (split confidence on lot_size_source). QUEUED, not authorized.
- F3 (permits + CoA chains read the restored lots; not re-run): OWED — run chain_permits + chain_coa (or their lot-consuming steps) locally before the cloud final run; link_massing footprint_exceeds_lot count is pre-restore until the next sources run.
- F4 (stale "NINE"/"TEN-term" text, descriptor.json:92, notes.json:39): fix rides the NEXT parcels capture (descriptor bytes are in source_fingerprint → any edit forces recapture); the Phase 1 witness backfill recaptures parcels anyway.
- F5: the loader emits ONE `stated_area_unparsed` tag (total), not per-shape — the plan text above is superseded; a ≥1K retraction watch uses the total (baseline 1,660).
- A7 OWED: `npm run lineage-docs -- --refresh` (DB read) after the full suite finishes.
