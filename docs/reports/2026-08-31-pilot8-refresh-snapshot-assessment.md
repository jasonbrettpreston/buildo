# Pilot 8 Assessment — `refresh_snapshot` (RECORDER, forced single-member)

**Status:** Commit 1 (PH-0 boundary freeze, G0) landed. §0's seed re-confirmed against the same repo
this commit (same day, later session); no drift in any DATA/file number re-executed. One genuine new
finding this commit: the system-map generator itself was silently truncating multi-file Target Files
bullet lines to their FIRST reference, which is the actual root cause of Finding 3 ("no owner row for
`refresh-snapshot.js`") — the file was already declared in Spec 60's own Target Files section the whole
time; the generator just never reached past the first `scripts/...` match per line.

**Governing plan:** `.cursor/active_task.md` (Pilot 8 — refresh_snapshot, RECORDER, forced single member;
the authorized, Implementation-status copy — `.cursor/pilot8_refresh_snapshot_active_task.md` is a
superseded Planning-status duplicate, not re-read for content this commit, mirroring pilot 7's own
precedent for the identical duplicate-file shape).
**Governing specs (owner row first, per Spec 123 §6 G0):** `docs/specs/01-pipeline/60_shared_steps.md`
(owning spec, §Step Registry row 8 + §3 "Refresh Snapshot" prose, `:22`, `:194-219`) ·
`docs/specs/01-pipeline/122_pipeline_step_optimization.md` (architecture/write-class taxonomy, GAP-2) ·
`docs/specs/01-pipeline/123_step_opt_assessment_validation.md` (procedure/gates) ·
`docs/specs/01-pipeline/124_step_standard_policy.md` (13 rules + register — governs on conflict with
older Spec 122 prose).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-08-31 (same day as §0's own Fold-A-validated planning seed, later session): `wc -l`
> = 687 (unchanged), `.query(` sites = 20 (unchanged), `ADVISORY_LOCK_ID = 40` unique repo-wide
> (unchanged), `grep -c "IS DISTINCT FROM"` = 0 (unchanged), `converted.json.converted.length` = 7
> (unchanged). No drift found in any DATA number this commit re-touched.

### G0 deliverable 1 — system-map row (Finding 3), root cause corrected, not merely patched

Direct inspection of `docs/specs/01-pipeline/60_shared_steps.md`'s own `### Target Files` section
(§4, Operating Boundaries) shows `scripts/refresh-snapshot.js` was **already listed** — it has been
since before this pilot. Finding 3's own framing ("no owner row exists, add one") was therefore wrong
about the mechanism, though right about the symptom (the generated table's row 60 really did omit the
file). Root-caused instead of patched: `scripts/generate-system-map.mjs`'s per-line file-reference
scan used `line.match(/pattern/)` with no `/g` flag — `String.prototype.match` without the global flag
returns only the FIRST match in the string, so a Target Files bullet listing several
`scripts/x.js`/`src/y.ts` references on one comma-separated line (Spec 60's own 3-per-line convention)
silently dropped every reference after the first. Row 60 showed exactly 3 files
(`geocode-permits.js`, `link-massing.js`, `create-pre-permits.js` — the first file named on each of
the section's 3 bullet lines) with no `+N more` suffix, which is the exact signature of this bug, not
of a missing declaration. Fixed (`scripts/generate-system-map.mjs`, `matchAll`/`/g` + de-duped
`implFiles`/`testFiles`) and regenerated (`npm run system-map` → `node scripts/generate-system-map.mjs`,
96 specs across 6 sections). Row 60 now reads `scripts/geocode-permits.js, scripts/link-parcels.js,
scripts/link-neighbourhoods.js, +5 more` — `refresh-snapshot.js` is among the 8 Target Files, confirmed
present in the raw regenerated output. Blast radius: 20 rows across the whole map changed (all
Implementation/Tests columns gaining previously-truncated-away references), zero rows lost content —
the generator is explicitly "auto-generated... do not edit manually" (`00_system_map.md:3`), so a
full, correct regeneration is the intended behaviour, not a diff requiring line-by-line review.

### G0 deliverable 2 — Spec 60 doc-rot corrected (Finding 2, folded into commit 1 per pilot 7's own
precedent for the identical finding-shape — no dedicated ledger row for a docs-only correction)

Re-executed this commit, not carried from §0: `grep -in "score\|weighted" scripts/refresh-snapshot.js`
returns 7 hits, all of them the CoA servable-funnel's own `score`/`opportunity_score` fields (`s4_score`,
`coaFunnel.score`, the `servable_coa_funnel_score` audit row) — none is a weighted-average "Data
Effectiveness Score." `grep -c` on the 5 real dedicated test files: `refresh-snapshot.infra.test.ts`=3,
`refresh-snapshot-query-consolidation.logic.test.ts`=6, `db/refresh-snapshot-consolidation.db.test.ts`=4,
`quality.logic.test.ts`=3, `coa-cost-model.regression.test.ts`=3, `quality.infra.test.ts`=**0** — the
zero-hit file matches Finding 2's claim exactly. All 4 corrections landed directly in
`docs/specs/01-pipeline/60_shared_steps.md`: (1) the "9+ parallel counting queries" line and its
Step-Registry-table echo ("9 tables (parallel counts)") both corrected to the real sequential
single-connection shape (WF3 F1, `8cc99c78`); (2) the non-existent "Data Effectiveness Score (0-100)
weighted average" line replaced with the real per-table coverage-rate description; (3) "Massing query
fails → defaults to 0" corrected to the real two-tier carry-forward-via-`getPrevSnapshot()` behaviour;
(4) the Testing line's 2 named files (one of which, `quality.infra.test.ts`, has zero hits on this
script) replaced with the real 5-file, 19-assertion list.

### G4 — risk class

**Chance** = 34 commits (small-mid corpus, re-confirmed) + 44% fix density (15/34, re-confirmed) — lower
fix density than pilot 7 (56.25%) — + 0 measured load-bearing fences this session (no `git log -p -S`
fence excavation was needed: this pilot's write is additive/no-op-by-declaration, not a repair of a
past incident) → **CLASS B**, one notch lighter than pilot 7's B/C. **Impact** = **HIGH** — widest
chain-membership of any pilot to date (4 of 4 chains: permits/coa/sources/deep_scrapes, Spec 122 `:512`)
and the sole write target for the admin `data_quality_snapshots` dashboard (Spec 26, `GET /api/quality`
`SELECT *` full-column read, confirmed §0 Cross-spec consumer contracts).

### G0 verdict

**CLOSED this commit.** Every §0 DATA/file number reconfirmed with zero drift. One genuine new finding
(the system-map generator's single-match bug) root-caused and fixed rather than worked around — Finding
3's own "add a row" framing is corrected here: no new declaration was needed, the generator was silently
dropping an existing one. Spec 60's 4 doc-rot items (Finding 2) corrected in place. No new DEFECT opened
against `refresh-snapshot.js` itself this commit; Findings 4/5 (phase ternary, carry-forward
inconsistency) proceed to PH-3/PH-6 classification as already scoped.

---

## §0. Grounding (executed 2026-08-31)

### §0.1 Pilot order + archetype confirmation

Spec 122 §8.2 (`docs/specs/01-pipeline/122_pipeline_step_optimization.md:1119-1134`, operator ruling 2026-08-30) states plainly: pilot 7 = `link_parcels` (LINK, 2nd member) **superseded** the previously-tentative placement of `refresh_snapshot` at pilot 7; `refresh_snapshot` (RECORDER) and `enrich_parcels` (ENRICHER) **shift to pilots 8/9 respectively**. So pilot 8 = `refresh_snapshot` is the correct, currently-ruled order — no contradiction found with memory or the spec.

RECORDER has exactly **1 member** — `refresh_snapshot` (Spec 122 §1.10 table, `:668`) — so this pilot is, like pilots 2/4/5/6, **forced**: there is no "representative" choice to make, and no sibling exists yet to generalize against.

### §0.2 Script grounding — `scripts/refresh-snapshot.js`

| Measure | Value | Command |
|---|---|---|
| Lines | 687 | `wc -l scripts/refresh-snapshot.js` |
| Revisions (`git log --follow`) | 34 | back to `040d421c` (initial commit) |
| `fix(` commits | 15 of 34 | `git log --follow --oneline \| grep -ic "fix("` |
| `try {` blocks | 9 | 2 are `try/finally` (client release, `enable_indexscan` reset); 7 are `try/catch` |
| `catch` blocks | 7 | none empty; all log via `pipeline.log.warn` and either carry forward the previous snapshot or default (see Finding 5) |
| `.query(` call sites | 20 | 6 sequential on the pinned `snapChild` (REPEATABLE READ READ ONLY txn) + 6 standalone `pool.query` "optional" reads + 1 `pool.query` prev-snapshot fallback + 1 final `withTransaction` UPSERT + 6 misc (SET/RESET/BEGIN/COMMIT) |
| `process.env` reads | 1 | `PIPELINE_CHAIN` (`:642`) — drives the phase ternary, Finding 4 |
| `new Date()` / `Date.now()` | 2, both `Date.now()` | `:188` (`t0`), `:638` (`duration_ms`) — elapsed-time only, **never written to DB**, so no `getDbTimestamp` violation |
| `emitSummary`/`emitMeta` | 1 each | single pair at the end of `runRefreshSnapshot`, standard shape |
| Advisory lock id | **40** | `scripts/refresh-snapshot.js:19`. Checked against all other `ADVISORY_LOCK_ID` declarations repo-wide (`grep -rn "ADVISORY_LOCK_ID ="`) — 40 is unique, no collision |
| `supports_full` / `supports_dry_run` | `false` / `false` | `scripts/manifest.json:56` |
| `telemetry_tables` | `["data_quality_snapshots"]` | `scripts/manifest.json:56` |
| `step_timeout_minutes` | 15 (900,000 ms) | `scripts/manifest.json:56`; measured durations (§0.3) top out at 61.3 s — 6.8% of budget |

**PostGIS check (R-W):** zero hits for `hasPostGIS`/`postgis_version`/`pg_extension`/a try/catch around a PostGIS call anywhere in the file — the script does no geometry work at all. R-W is not engaged.

### §0.3 Chain membership + live run history

`scripts/manifest.json:76-119` — `refresh_snapshot` is a member of **all four** chains: `permits` (position 21/28), `coa` (position 9/14), `sources` (position 20/23), `deep_scrapes` (position 4/8). Per Spec 122 `:512`: *"A shared step's differential must be green in EVERY chain it appears in — up to 4."* This is the widest chain-membership of any pilot to date (pilots 1–7 topped out at 2, `link_massing`/`link_wsib`).

```
docker exec supabase_db_Buildo psql ... pipeline_runs WHERE pipeline LIKE '%refresh_snapshot%'
```

| Chain (`pipeline` column = `<chain>:refresh_snapshot`) | Runs | Status | Last run | First run |
|---|---:|---|---|---|
| `coa:refresh_snapshot` | 28 | 100% `completed` | 2026-07-17 | 2026-03-07 |
| `permits:refresh_snapshot` | 36 | 100% `completed` | 2026-07-17 | 2026-03-05 |
| `sources:refresh_snapshot` | 13 | 100% `completed` | 2026-07-08 | 2026-03-12 |
| `deep_scrapes:refresh_snapshot` | 5 | 100% `completed` | 2026-08-01 | 2026-03-15 |

**Zero failures ever recorded** across 82 total runs (matches Spec 122 `:1112`'s "verdict is PASS-only, all rows INFO" — there is structurally no FAIL path in this script; every optional-query failure is caught and degrades to a carried-forward or defaulted value, never a thrown `step_error`). Duration range measured on the 12 most recent rows: 14,501 ms–61,346 ms, i.e. 1.6%–6.8% of the 15-minute budget — no timeout risk.

⚠️ Local dev DB is stale relative to today (2026-08-31) — last write 2026-08-01. This reflects local/cron cadence, not a defect in the step; not pursued further (out of scope for a pipeline-script conversion pilot).

`data_quality_snapshots` row count: **29** (`SELECT count(*)`), most recent `snapshot_date = 2026-08-01`. `UNIQUE (snapshot_date)` constraint confirmed live (`pg_constraint` query) — the one-row-per-day invariant is DB-enforced, independent of the script.

### §0.4 Write-class re-derivation (§1.4)

Spec 122 itself already flags this step's class as measured-wrong at the source (`:394`, `:107-110` GAP-2) — **this is ported, not discovered fresh this session**, and I verified it against the live file rather than trusting the spec's citation:

> `refresh-snapshot.js:535` `ON CONFLICT (snapshot_date) DO UPDATE SET ... created_at=NOW()` — confirmed live at `:533-535` (line numbers shifted slightly by intervening comment edits; the INSERT statement itself is unchanged in shape). **No `IS DISTINCT FROM` guard anywhere in the 68-column SET clause** (`grep -c "IS DISTINCT FROM" scripts/refresh-snapshot.js` → 0). A same-day re-run overwrites every column of that day's row unconditionally.

The schema's own `gaps[GAP-2]` entry (`scripts/steps/_schema/step.schema.json:104-111`) already prescribes the correct declaration: **class `guarded_upsert` (mechanic: keyed upsert) + `guard: "none"` (+ `guard_why`) + `scope: "snapshot_date = CURRENT_DATE"`** — not class `M snapshot_append`, which implies pure INSERT with no in-place overwrite.

**A `grandfathered.json` fixture already anticipates this exact declaration**, filed 2026-08-25 as `fixture_grandfathered_snapshot` (`scripts/steps/_schema/grandfathered.json`, commit `9e2da7b1`, Spec 122 V7): *"The schema's own exemplar for the V7 grandfathered-unguarded shape (refresh-snapshot.js:535 — ON CONFLICT (snapshot_date) DO UPDATE with no change guard...)"* — it exists only to prove the schema's GREEN direction; it is **not** the step's own grandfathering entry. Pilot 8 commit 8 (peel: thresholds/guard) must add a **real** `refresh_snapshot` key to `grandfathered.json` mirroring this fixture's reasoning verbatim (same shape as `link_massing`'s E1 precedent — "the unguarded write is the correct mechanic, and its cost is bounded": one row, once a day, cost is fixed regardless of guard).

Why unguarded is correct here (not merely tolerated): an `IS DISTINCT FROM` guard on a 68-column dashboard-snapshot row would compare fresh live-DB counts against yesterday's — or this morning's own earlier chain-run's — counts, which are *expected* to differ on almost every column, almost every run (permit counts change constantly). A change guard on a metrics-recording row is close to vacuous by construction: the "change" IS the row's entire purpose.

### §0.5 `outputs.publish` (RECORDER's one required field)

Schema (`step.schema.json:1686-1694`): RECORDER's `x-profile` requires `outputs.publish` and forbids `"none"` — legal values `direct` | `pointer` (`step.schema.json:965`). The write is a direct `INSERT ... ON CONFLICT ... DO UPDATE` straight into `data_quality_snapshots` — no staging table, no atomic pointer-swap/rename mechanism anywhere in the file. **`publish: "direct"`** is the only fit.

### §0.6 Findings (numbered, each grounded this session)

**Finding 1 — Write class M is wrong at the source; the correction is already prescribed (schema GAP-2).** See §0.4. Disposition: **PIN + declare** — the schema already names the fix; commit 7/8 execute it, no behavior changes (the write already IS a daily-keyed unconditional upsert; only the *label* was wrong).

**Finding 2 — Three doc-rot items in Spec 60 (owning spec), all verified against the live file:**
- Spec 60 `:198-199` claims the step computes *"Data Effectiveness Score (0-100) as weighted average: trades 25%, builders 20%, parcels 15%, neighbourhoods 15%, geocoding 15%, CoA 10%."* **Zero occurrences of any weighted-average/score computation anywhere in `refresh-snapshot.js`** (`grep -in "score\|weighted" scripts/refresh-snapshot.js` → no hits touching this). This describes a feature that does not exist in the current file — either removed silently at some point in the 34-revision history, or never actually implemented; either way the spec line is currently false and must be corrected (removed or re-scoped) in the pilot's docs commit, not carried into the descriptor.
- Spec 60 `:197` claims *"Run 9+ parallel counting queries against live DB."* The live script (per its own extensive `WF3 F1` block comment, `:21-64`, and commit `8cc99c78` `fix(01-pipeline/118_deep_scrapes): WF3 F1 - refresh_snapshot query battery pathology`) runs the 6 primary queries **sequentially on one pinned REPEATABLE READ READ ONLY connection**, specifically *to defeat* the parallel-query I/O pathology Spec 118 §1 measured (73% of permits index-fetched, 3 min → 64 min). "9+ parallel" describes the pre-fix (2026-08-15) shape and is now false.
- Spec 60 `:216` claims *"Massing query fails → caught, defaults to 0."* Live code (`:334-346`) does **not** default to 0 on catch — it calls `getPrevSnapshot()` and carries forward the previous day's `building_footprints_total`/`parcels_with_buildings`, falling back to 0 only if no previous snapshot row exists at all. The doc line collapses a two-tier fallback into a one-tier one.
- Spec 60 `:218` ("Testing: `quality.logic.test.ts`, `quality.infra.test.ts`") names 2 files; **5 test files actually reference this script's behavior** — `refresh-snapshot.infra.test.ts` (3 assertions), `refresh-snapshot-query-consolidation.logic.test.ts` (9), `db/refresh-snapshot-consolidation.db.test.ts` (3), `quality.logic.test.ts` (3 hits, its own `describe('refresh-snapshot.js cost/timing observability'` block), **and `coa-cost-model.regression.test.ts` (1 hit, line 204: `it('refresh-snapshot.js still counts geometric in the from_model bucket')`)** ~~plus `quality.logic.test.ts` (3 hits)~~ — Fold A correction, 2026-08-31: the original citation named only 4 files while claiming 5; re-grepped this session and found the true 5th file above, distinct from 4 OTHER files (`chain.logic.test.ts`, `pipeline-sdk.logic.test.ts`, `pipeline-advisory-lock.infra.test.ts`, `pipeline-logic-vars-coercion.infra.test.ts`) that also match `refresh-snapshot` textually but only as one row inside a generic all-scripts shape/registry loop, not a dedicated behavioral test — correctly excluded from the count. `quality.infra.test.ts` itself has **zero** hits on `refresh-snapshot`/`refreshSnapshot`/`runRefreshSnapshot` (`grep -c`), so one of the two files the spec names doesn't actually test this script at all, and 4 files that do aren't named (not 3).

All four are corrections owed to Spec 60 in the pilot's docs commit (PIN, not a behavior change — the code is right, the prose is stale).

**Finding 3 — `docs/specs/00-architecture/00_system_map.md` has no owner row for `refresh-snapshot.js` at all.** Confirmed by contrast: `link-wsib.js` has a row under Spec 46 (`:46`), `load-ravines.js` under Spec 59 (`:59`) — every other converted pilot's step file is present. `refresh-snapshot.js` returns zero matches (`grep -in "refresh.snapshot" 00_system_map.md`). Per G0's own procedure (Spec 123 `:300`, *"the plan's Target Spec line is filled from the system map's owner row for the step file FIRST"*), this pilot's PH-0 has no row to read — the fallback is Spec 60 (`60_shared_steps.md:194-219`), which does own the prose (however stale, per Finding 2). **A new system-map row pointing to Spec 60 is a small owed G0 deliverable**, not previously flagged by any prior pilot because no prior pilot's step file was missing from this table.

**Finding 4 — Phase-ternary: `deep_scrapes` and `permits` silently share the same audit `phase` number.** Live code (`:642-643`):
```js
const chainId = process.env.PIPELINE_CHAIN || null;
const snapshotPhase = chainId === 'sources' ? 13 : chainId === 'coa' ? 7 : 18;
```
`git log -p -S "chainId === 'sources'"` dates this exact ternary shape to commit `5baaed5a` (2026-03-26, `fix(28_data_quality): audit_table gaps, UX rendering, and phase numbering`), which already used the same `... : chainId === 'coa' ? 7 : 14` else-default (later bumped to 18 as the permits chain grew). The `deep_scrapes` chain was added to `manifest.json` earlier — commit `5c953a61`, 2026-03-11 (`git log -p -S "deep_scrapes" -- scripts/manifest.json`) — so `deep_scrapes` **existed before this ternary was ever written**, and no branch was ever added for it; it has always fallen into the `permits`-chain default. Consumer-impact check: `audit_table.phase` is referenced only in `src/tests/pipeline-sdk.logic.test.ts` and `src/tests/step-library.logic.test.ts` (structural/shape assertions, not value checks) and nowhere in `src/lib/admin/funnel.ts` or any admin route — so this is a real but **low-blast-radius** defect (no dashboard currently distinguishes phase 18 by chain). Disposition: **PIN**, ledger entry `RS-D1`, commit 7 declares a proper per-chain phase map (`{permits:18, coa:7, sources:13, deep_scrapes:<own number>}`) instead of a ternary — this is the "phase ternary" class the programme has flagged before (e.g. `assert_engine_health`'s name-prefix dispatch, Spec 122 `:671`) and Rule 1's "nothing hidden" argues for a declared map over a magic literal regardless of blast radius.

**Finding 5 — Inconsistent optional-query failure handling within the same file (the carry-forward policy is stated once and followed only 4 of 6 times).** The file's own comment (`:320-322`) states the design intent explicitly: *"Optional queries: on failure, carry forward previous snapshot values instead of defaulting to 0 (which would destroy dashboard trend lines)."* Four optional blocks (massing `:334-346`, schema-column-counts `:348-363`, SLA `:365-376`, inspections `:378-409`) follow this via `getPrevSnapshot()`. **Two do not** — `costEst` (`:421-443`) and `coaFunnel` (`:450-494`) both catch, log a warning, and leave the pre-declared zero/null default in place, with **no** `getPrevSnapshot()` call. On any live query failure on either of these two blocks, the day's INSERT (a new row, not just an UPDATE) writes `cost_estimates_total = 0` etc. into a brand-new `data_quality_snapshots` row — exactly the trend-line-destroying behavior the file's own comment says the pattern exists to prevent. This is a genuine, live-measurable inconsistency (not hypothetical — the two exempted blocks are the two most recently added, `c42ff97f`/`4442fb75`, added after the carry-forward comment was already written for the original four). Disposition: **candidate for FIX at pilot 8** (Spec 124 §7 ladder rung (e), same class as `link_parcels` LP-D9 in pilot 7 — a real, low-risk, same-mechanism correction, not new machinery) OR **PIN with a ledger ID** if the operator prefers a strict PH-6-classify-don't-fix posture for a forced single-member pilot; carried to the plan's Asks table (Ask 1).

**Finding 6 — Cross-step write into `data_quality_snapshots` from a step this pilot does not own, order-dependent.** `scripts/compute-cost-estimates.js:609-633` performs a **best-effort** (swallowed-failure) `UPDATE data_quality_snapshots SET cost_estimates_liar_gate_overrides=$1, cost_estimates_zero_total_bypass=$2 WHERE snapshot_date=...`, and its own comment (`:610-612`) states: *"the snapshot row is created by refresh-snapshot.js which runs later in the chain; if absent, this UPDATE is a no-op."* `compute_cost_estimates` runs at manifest position 18 in the `permits` chain, `refresh_snapshot` at position 21 — **`compute_cost_estimates` always runs before `refresh_snapshot` creates that day's row**, so its UPDATE is a no-op on the first chain run of any given day. Measured live (10 most recent `data_quality_snapshots` rows): `cost_estimates_liar_gate_overrides`/`cost_estimates_zero_total_bypass` are **NULL on 4 of 10 rows** (2026-08-01, 2026-07-08, 2026-06-28, 2026-06-21/06-20), populated on 6 — consistent with the theory: populated only on days where a second chain's `compute_cost_estimates` run lands *after* `refresh_snapshot` has already created that day's row (e.g. `coa` chain runs `compute_coa_cost_estimates`, not this script — needs a same-day `permits` OR a re-run after row-creation to succeed). `refresh-snapshot.js`'s own 68-column INSERT/UPDATE list (verified `:504-533`) **does not include either column** — it is not this step's write target, and its own `emitMeta` (`:667`) correctly does not claim them. **This is not a defect in `refresh_snapshot` and out of this pilot's write-declaration scope** (the foreign write belongs to `compute_cost_estimates`'s own future conversion, where — per Spec 122 `:391`'s rule *"a target this step does not own is a cascade, never a write"* — it should be declared as a `cascade`, not silently left inside a try/catch). Documented here so the descriptor's `inputs`/`outputs` sections don't accidentally claim ownership, and filed as an Ask (Ask 2) for whether the pilot's docs commit should note this coupling in Spec 60/76.

**Finding 7 — Dual-path defect, OUT OF Backend/Pipeline scope (Cross-Domain), flagged not fixed.** `src/lib/quality/metrics.ts:23-` (`captureDataQualitySnapshot()`) is a **second, independent implementation** of this exact snapshot-capture logic, written in TypeScript, called from a live admin endpoint `src/app/api/quality/refresh/route.ts` (`POST /api/quality/refresh`, a manual "Refresh Now" trigger — confirmed via `grep` both files exist and are wired). Measured:
- It runs its queries via `Promise.all`-style parallel dispatch (`// Run all independent queries in parallel`, `:24`) — the **exact pre-WF3-F1 pattern** `8cc99c78` fixed in the pipeline script (73% index-fetch pathology, 3 min → 64 min under a stale correlation stat).
- It acquires **no advisory lock** (`grep -n "advisory" src/lib/quality/metrics.ts src/app/api/quality/refresh/route.ts` → zero hits) — nothing prevents it from racing a concurrent pipeline-triggered `refresh_snapshot` run (both target the same `ON CONFLICT (snapshot_date)` row with no coordination).
- Its own INSERT column list (`:130-166`) carries **61 columns**; the pipeline script's carries **68** — the 7 missing are the 4 `cost_estimates_*` and 3 `timing_calibration_*` columns (verified by diff of the two column lists). A manual refresh click cannot regress those 7 to zero (unlisted columns keep their prior value under `ON CONFLICT DO UPDATE`), but it also can never populate them from a fresh state.

This is a genuine, live, currently-shippable defect — but it lives entirely in `src/lib/` and `src/app/api/`, which is **Admin/Cross-Domain territory** per root `CLAUDE.md`'s Domain Rules table, not `scripts/` (Backend/Pipeline, this pilot's Operating Boundary per Spec 123's own "the 27 step scripts... out-of-scope" line, `:385`). **Not actioned by this plan.** Filed as Ask 3 — recommend a `review_followups.md` HIGH entry and a separate Cross-Domain WF3 to either retire `metrics.ts`'s duplicate implementation in favor of calling the pipeline's own query builders, or at minimum add the advisory lock.

### §0.7 Seam map (PH-5, G5) — three NEW live seams, not one

R-V (Spec 124 register) defines a "live" seam as a declared `inputs.reads.steps[]` producer→consumer edge where **both** endpoints are converted descriptors; measured against the 7 pilots landed before this one, **exactly one pair currently qualifies** (`compute_centroids` → `link_massing`, R-V's own citation). Grounding this step's actual reads against the converted set (`scripts/steps/_schema/converted.json`: `assert_schema`, `load_ravines`, `link_massing`, `link_wsib`, `link_parcel_addresses`, `compute_centroids`, `link_parcels`) surfaces **three genuinely new candidates**, each verified by reading both the read-site and the producer's own header/write:

| # | Producer (converted) | Table.column read by `refresh_snapshot` | Read site | Producer's own confirmation |
|---|---|---|---|---|
| 1 | `link_parcels` | `permit_parcels.match_type`, `.confidence` | `parcelsRes` query, `:252-259` | `link_parcels` is `permit_parcels`'s writer (pilot 7, keyed upsert) |
| 2 | `link_massing` | `parcel_buildings` (`COUNT(DISTINCT parcel_id)`) | massing try-block, `:334-346` | `scripts/link-massing.js:8` header: *"write the parcel_buildings junction"* |
| 3 | `link_wsib` | `entities.is_wsib_registered` | `buildersRes` query, `:236-245` | `scripts/link-wsib.js:10` header: *"entities.is_wsib_registered"* named as its write |

None of these were live before this pilot (their producers weren't converted yet when read against `refresh_snapshot`'s own — still-unconverted — file). Declaring `inputs.reads.steps: [{step:"link_parcels",...},{step:"link_massing",...},{step:"link_wsib",...}]` in this pilot's PH-0/commit-3 seam map is therefore not decorative — it **triples** the count of R-V's live seam-validation surface area (1 → 4 pairs), which is a meaningful test of whether the mechanism generalizes past its single founding example, worth stating explicitly as part of what this pilot proves about the library (mirrors the RECORDER archetype's own stated pilot purpose, §1.10).

(`building_footprints` is also read, but its producer `massing`/INGESTOR step 14 is not yet converted — no live seam there. `parcels.centroid_lat/lng` and `parcel_address_points` are NOT read anywhere in this file — `compute_centroids` and `link_parcel_addresses` do not create seams here, contrary to what a naive "reads parcels" guess might assume.)

### §0.8 Logic variables

Two declared, both validated via a hard-coded Zod schema + `validateLogicVars` throw-on-invalid (`:14-17`, `:192-193`) — this already matches R-G's `on_invalid: "fail"` requirement in behavior; the descriptor must simply *declare* it:

| Variable | Seed default/bounds (`scripts/seeds/logic_variables.json:632-638`) | Consumed at | Verdict/write-affecting? |
|---|---|---|---|
| `snapshot_coa_conf_high` | 0.8, min 0.01, max 1 | `coaRes` query param `$1` — gates `coa_high_confidence` count written to the row | Write-affecting (not verdict — verdict is hardcoded `PASS`) → `on_invalid: "fail"` per R-G |
| `coa_match_conf_medium` | 0.5, min 0.01, max 1 | `coaRes` query param `$2` — gates `coa_low_confidence` count | Write-affecting → `on_invalid: "fail"` |

No tunables are retired by this pilot (R-A not engaged) and no new logic-variable rows are being added (unlike LM-D15 — no cloud-side `apply-logic-variables.js` prerequisite for this pilot).

---

## §R Reflection (owed per R-F, carried into this same report since this pilot's own plan is what's being authorized)

**Low confidence:** Finding 5's disposition (FIX vs PIN) is a judgment call left to the operator via Ask 1 — the evidence is solid but the "is this in scope for a forced single-member RECORDER pilot" question is a policy call, not a factual one. Finding 6's characterization as "not a defect in refresh_snapshot" rests on `compute_cost_estimates.js` never yet having been through its own PH-0 — a future pilot on that step should re-derive this cascade rather than trust this citation.

**Recurring/standard-shaping:** Finding 7 (dual JS-path re-implementing a just-fixed pipeline query pattern, outside `scripts/`) is a **new class** not seen in pilots 1–7 — all prior dual-path findings (R-W's four precedents) were PostGIS-availability branches *inside* a single pipeline script's own compute. This is a whole **second application layer** re-implementing a pipeline step's logic independently. Worth a standing check in future pilots: `grep -rn "<producer-table>" src/lib src/app/api` for any admin-side duplicate writer, not just a duplicate reader.

---

## Fold A (2026-08-31, fold-validation)

This report's every executed claim was independently re-executed (not re-read) by the fold-validation pass and found accurate, with one correction: Finding 2's file-count citation named 4 files while claiming 5 — corrected in place above to include the true 5th (`coa-cost-model.regression.test.ts:204`). The write-discipline JSON sample in the companion plan (`.cursor/pilot8_refresh_snapshot_active_task.md`) had two fields that violated `step.schema.json`'s own shape (`cascades: []` instead of the literal `"none"`; `write_inventory` as the 68-column array instead of the required `{statements, why}` object with `statements: 1`) — both corrected in the plan, not in this report (this report doesn't carry that JSON sample). Per operator-directed scope addition, the plan also gained a new "Cross-spec consumer contracts" section covering Specs 26/76/89/102/86/84 — full grounding lives there; summary: Spec 26 has genuine direct dashboard-read contact (`DataQualityDashboard.tsx` → `GET /api/quality` → `SELECT * FROM data_quality_snapshots`, a full-column read not previously cited in this report's §0), Spec 76 contact was already covered by Finding 6/Ask 2, Specs 89/102/86/84 have no contact with this table (86 has only the pre-existing standing `logic_variables` relationship every pilot's tunables already carry). See the plan's own Fold A section for the complete grounding and verdict: **READY for PLAN-LOCKED presentation**, no surviving BLOCKING finding.
