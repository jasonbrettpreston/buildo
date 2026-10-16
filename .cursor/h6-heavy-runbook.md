# H6 heavy-lane runbook — McBylaw P2 inputs (migs 253–255, load_bylaw_map_areas, link_parcel_abutments, CoA zoning_designation, enrich_parcels sixplex pass)

Prepared 2026-10-14 by lane H6-REBASE. Read-only prep: nothing below has been run.
Tags: **[MEASURED]** run today · **[READ]** file and line · **[DECLARED]** from a plan/QUEUE/notes, not re-measured · **[PREDICTED]** not yet run.
Specs: 58, 65, 130, 51; 122 / 124 (R-BA capture last, R-K/R-AO cutover, R-BZ purity). 68/69: inputs only (D7 rows PROPOSED).

Tree: `H=C:/Users/User/Buildo-wt-h6b`, branch `wf1/h6-p2-inputs-b`, base `bd332ec8`, H6 diff staged (uncommitted).
Every command runs from `$H` in Git Bash, ONE AT A TIME. Never two H jobs at once. DB = the local dev DB (`supabase_db_Buildo`); never cloud.
`PSQL='docker exec supabase_db_Buildo psql -U postgres -d postgres -Atc'` (read-only checks).

---

## 0. Pre-flight (every item must pass; else STOP)

| # | Check | Command | Pass |
|---|---|---|---|
| P1 | ≥ 4 GB free RAM | `powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,1)"` | ≥ 4.0 |
| P2 | Disk | `df -h /c \| tail -1` | ≥ 20 GB free |
| P3 | No other H job / vitest / npm ci | `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" \| Select ProcessId,CommandLine \| Out-String -Width 300"` | no `vitest`, `capture-step-golden`, `run-chain`, `npm ci`, step script |
| P4 | DB quiet | `$PSQL "select count(*) from pg_stat_activity where datname='postgres' and state<>'idle' and pid<>pg_backend_pid() and backend_type='client backend'"` and `$PSQL "select count(*) from pipeline_runs where status='running'"` | `0` and `0` (stale `running` rows: reap first, never run over them) |
| P5 | Tree | `git -C $H log --oneline -1` ; `git -C $H status --short \| grep -v '^[AM] '` | HEAD = `bd332ec8` (or the orchestrator's H6 code commit, see R0); second command prints nothing |
| P6 | Migrations state | `$PSQL "select filename from schema_migrations where filename ~ '^25[3-5]_'"` | 0 rows (253–255 unapplied; 256–261 applied — [MEASURED] today) |

### R0 — orchestrator edits owed BEFORE step 3 (registry_reserved; this lane did NOT make them)

`npm run cutover -- --step=<slug>` refuses a slug that is not in `scripts/manifest.json`, and a file that is neither `pending[]` nor `converted[]` [READ `scripts/analysis/cutover.mjs:198-207`]. Neither new step is registered today [MEASURED: grep 0 hits in manifest.json / converted.json / step-archetype-census.json]. Precedent: `load_coa_notices` (manifest line 38, converted.json `pending[]`, census row 66).
1. `scripts/manifest.json` `scripts{}`:
   - `"load_bylaw_map_areas": { "file": "scripts/load-bylaw-map-areas.js", "supports_full": false, "supports_dry_run": false, "telemetry_tables": ["bylaw_map_areas"] }`
   - `"link_parcel_abutments": { "file": "scripts/link-parcel-abutments.js", "supports_full": false, "supports_dry_run": false, "telemetry_tables": ["parcel_abutments"] }`
2. `chains.sources` (plan A3/B2): `load_bylaw_map_areas` between `load_zoning` and `enrich_parcels`; `link_parcel_abutments` after `link_massing` (already after `enrich_centreline`).
3. `converted.json` `pending[]`: one entry per file, `registers_at: "cutover (H6 runbook step 3 / step 5)"`, reason citing the WF1 P2-inputs plan.
4. `step-archetype-census.json`: rows `load_bylaw_map_areas` INGESTOR, `link_parcel_abutments` LINK, `batch: "pending"`, owner_specs 58 / 130.
5. Recommended: commit the H6 code + adopted seed (commit A) right AFTER step 1 and BEFORE any capture, so every capture's `git_head` names the code that ran; captures + cutovers land in commit B. Not before step 1: `bylaw-maps.infra.test.ts` is red (3 tests, seed missing) until the seed is adopted [MEASURED today], and pre-commit runs `vitest related`.

Note: the rebase's `generate-target-files` run removed the two hand-added `(PROPOSED)` lines from Spec 43's GENERATED chain-members block (the generator reads the manifest; the steps are not in it yet). After items 1–2 the cutover's `target-files` entry re-adds them [MEASURED: diff of 43_chain_sources.md today].
Success: `node scripts/analysis/step-validate.mjs --step=load_bylaw_map_areas --fast` and `--step=link_parcel_abutments --fast` both print a verdict (not "unknown step"). Stop: either is unresolvable.

---

## 1. Seed adopt fetch (network: gis.toronto.ca layer 80 + CKAN `city-wards`) — ~1–2 min [PREDICTED]

```
node scripts/analysis/bylaw/map-seed.mjs --refresh
node scripts/analysis/bylaw/map-seed.mjs --adopt
git add scripts/seeds/bylaw/maps/600_60.geojson scripts/seeds/bylaw/maps/manifest.json
VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/steps/load_bylaw_map_areas/bylaw-maps.infra.test.ts
```
Expected: `staged 27 areas, seed sha256 …` then `adopted scripts/seeds/bylaw/maps/600_60.geojson (… B, sha256 …) + scripts/seeds/bylaw/maps/manifest.json` [READ `map-seed.mjs:490-496`; 27 = 18 GIS + 9 wards, DECLARED notes.json 2026-10-08]. The infra test flips green (its only red today is the un-adopted seed — DECLARED lane A).
Stop: `--refresh` exits 2 (any `map-seed:` error) or the GIS count ≠ 18 → STOP; the City republished layer 80, Q-A2 must be re-measured before anything loads. Do NOT `--adopt` a failed staging.

## 2. Migrations 253–255 + db:generate — ~2–4 min [PREDICTED]

```
npm run migrate
$PSQL "select filename from schema_migrations where filename ~ '^25[3-5]_' order by 1"
npm run db:generate
npm run typecheck
```
Expected: `Done: 3 applied, … skipped`; 3 rows. All three are nullable ADD COLUMN / new empty tables (no rewrite, no backfill) [READ 253:28, 254:59-92, 255:33-81]. 254 re-creates `trg_parcels_invalidate_on_geom_change()` (CREATE OR REPLACE) and 255 adds the AFTER trigger `trg_parcels_abutments_invalidation` on `parcels`.
Checks: `$PSQL "select count(*) from information_schema.columns where (table_name='parcels' and column_name in ('in_sixplex_area','sixplex_area_type','sixplex_membership_basis')) or (table_name='coa_applications' and column_name='zoning_designation')"` = `4`; `$PSQL "select to_regclass('bylaw_map_areas'), to_regclass('parcel_abutments')"` both non-null. `db:generate` diff touches only the new tables/columns; typecheck exit 0.
Stop: any migration error (migrate.js runs each file in one txn — nothing partial) → STOP, report; never hand-apply. Typecheck red → STOP.

## 3. load_bylaw_map_areas: captures → cutover — ~3 min + cutover ~2 min [PREDICTED]

```
node scripts/analysis/step-validate.mjs --step=load_bylaw_map_areas --fast
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-bylaw-map-areas.js --chain=sources --out=docs/reports/golden/load_bylaw_map_areas/post/sources.json
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-bylaw-map-areas.js --chain=none --out=docs/reports/golden/load_bylaw_map_areas/post/standalone.json
npm run cutover -- --step=load_bylaw_map_areas --skip=scorecards
```
Expected: step-validate five-word PASS, or a FAIL naming only capture-derived gates C/D/G (the guard allows those) [READ `capture-guard.js` header]. Run 1 writes 27 rows; the harness's POST run 2 writes 0 (rerun proof); the standalone run SKIPs on `skipped_content_hash` (normal) [DECLARED notes.json expected_shape]. `$PSQL "select area_type, count(*) from bylaw_map_areas group by 1 order by 1"` → `3|2`, `4|25`. Cutover prints `pending -> converted`, registers in converted.json, flips the census row, and says `scorecards: SKIPPED (--skip)` (run once at step 7).
Stop: exit ≠ 0, row count ≠ 27, `seed_hash_matches_manifest` or `source_counts_match_manifest` violations > 0, or the rerun proof writes > 0 → STOP (do not cutover).

## 4. enrich_parcels recapture (fingerprint moved: compute + descriptor) — FULL ~45–90 min + incremental ~5 min

```
node scripts/analysis/step-validate.mjs --step=enrich_parcels --fast
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/enrich-parcels.js --chain=sources --args=--full --out=docs/reports/golden/enrich_parcels/post/sources_run1.json --overwrite
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/enrich-parcels.js --chain=none --out=docs/reports/golden/enrich_parcels/post/none_incremental.json --overwrite
```
Timing: 87.0 min FULL / 4.5 min incremental at 0.10b [READ `phase010b-post-phase-seam-recapture.md`]; 43.9 / 53.7 min for today's two `captured` rows [MEASURED pipeline_runs 2026-10-14]. Take the incremental IMMEDIATELY after the FULL (its precondition; 0.10's Class D lesson). Never re-take `pre/*`.
Expected (DECLARED, lane A): `$PSQL "select sixplex_membership_basis, count(*) from parcels group by 1 order by 2 desc"` → `gis_in` 151,881; `gis_hole_ward_in` + `gis_edge_ward_in` ≈ 1,122 (in_sixplex_area NULL for them, never guessed); `straddle` 0 (Q-A3 reserved). The incremental re-derives every parcel behind IS DISTINCT FROM → writes ≈ 0 on the sixplex columns.
Write the G8 explanation `docs/reports/golden/enrich_parcels/h6-sixplex-recapture.md` (precedent `phase010b-…md`: OLD/NEW fingerprint, per-phase timings, every diff classed).
Stop: FULL > 120 min, exit ≠ 0, RESIDENTIAL `gis_in` (the pass's own `sixplex_basis_counts.residential`, zoning_class R/RD/RS/RT/RM — Spec 65:302; corrected 2026-10-16: the all-parcel count is ~169 K and was never the bound) outside 150,000–154,000, any `no_geom`/`straddle` count ≫ expectations (> 5,000), or any non-sixplex column diff in the G8 compare that the H6 diff does not explain → STOP, park, report.

## 5. link_parcel_abutments: captures → cutover — budget ≤ 30 min per run

```
$PSQL "select count(*) from parcel_abutments"          # 0 before run 1
node scripts/analysis/step-validate.mjs --step=link_parcel_abutments --fast
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/link-parcel-abutments.js --chain=sources --out=docs/reports/golden/link_parcel_abutments/post/sources.json
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/link-parcel-abutments.js --chain=none --out=docs/reports/golden/link_parcel_abutments/post/standalone.json
npm run cutover -- --step=link_parcel_abutments --skip=scorecards
```
Budget: plan B2 ≤ 30 min for a full local run (the per-lot form at ~6 h is refused); descriptor `step_timeout` 45m is the backstop [READ descriptor :373]. Every run is a full rescan (Q-B3 PROVISIONAL, Spec 130 §3), so run 1 + POST run 2 + standalone ≈ 3 full passes ≈ up to 90 min.
Expected: ≈ 1.0 M ordered pair rows (INFERRED 2.3/lot, Spec 130:43 — the first capture measures it); `asymmetric_pairs` = 0; `est_status` only the closed set; POST run 2 and standalone write 0 (guarded upsert) → `linked`/`linked_with_warnings`.
Checks: `$PSQL "select count(*) from parcel_abutments a where not exists (select 1 from parcel_abutments b where b.parcel_id=a.neighbour_id and b.neighbour_id=a.parcel_id)"` = 0; `$PSQL "select est_status, count(*) from parcel_abutments group by 1"`.
Stop: run 1 wall > 30 min → STOP after it finishes (do not take the standalone; record the measured time; Q-B3 budget ruling owed). Row count < 500 K or > 2 M, asymmetric > 0, rerun writes > 0, or step_timeout hit → STOP, no cutover.

## 6. load_coa --full two-run proof (network: CKAN) — ~2–4 min per run [PREDICTED; chain_coa 2.5 min on 2026-07-17, MEASURED]

```
$PSQL "select count(*), count(zoning_designation) from coa_applications"         # 33400 | 0 [MEASURED count 33,400]
$PSQL "select count(*) from lifecycle_status_history"                            # note N
node -r dotenv/config scripts/load-coa.js --full                                 # run 1
node -r dotenv/config scripts/load-coa.js --full                                 # run 2
$PSQL "select count(*), count(zoning_designation) from coa_applications"
$PSQL "select count(*) from lifecycle_status_history"
```
Expected (plan C3): run 1 re-upserts ≈ 33,400 (the designation enters `data_hash`); run 2 `PIPELINE_SUMMARY` records_updated 0; `zoning_designation` non-null on most rows; `lifecycle_status_history` +0 across both runs.
Stop: run 2 updates > 0 (hash instability) or history grows → STOP, report; do not re-run. (Corrected 2026-10-16: the history bound is RUN 2 = +0. Run 1 legitimately adds first-entry rows for new applications and real transitions accumulated since the last load; measured on the Mac: last load 2026-07-17, run 1 +549 first entries (= records_new) +1,595 real transitions (0 from=to), run 2 +0.)

## 7. Scorecards — minutes (the long run)

```
node scripts/analysis/step-validate.mjs --all --write
```
Expected: exit 0; the two new steps and enrich_parcels scorecards PASS. Stop: a hard stop on any H6 step → STOP; a red on a non-H6 step → record it, do not fix here.

## 8. System map

```
npm run system-map
git diff --stat docs/specs/00-architecture/00_system_map.md
```
Expected: 0–few lines (already regenerated at rebase for Spec 130 / 51 / 43 [MEASURED]).

## 9. test:db (live DB)

```
npm run test:db
```
Expected: green. Stop: red → STOP, report the file(s).

## 10. Full suite (pre-push composition)

```
VITEST_MIN_FORKS=2 VITEST_MAX_FORKS=2 npm run test
```
Re-check P1 (≥ 4 GB) first; never above 2 forks. Expected: green — the lane-A "by-design reds" (seed not adopted, cutover owed, enrich_parcels G8) are closed by steps 1, 3–5. Stop: red → STOP, report.

Then hand to the orchestrator: stage by path (seed files, goldens, `h6-sixplex-recapture.md`, cutover outputs, scorecards, `src/lib/db` generated types), commit B, push owed.
