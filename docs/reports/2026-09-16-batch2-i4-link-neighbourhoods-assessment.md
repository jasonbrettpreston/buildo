# Batch 2 I4 Assessment — `link_neighbourhoods`

**Commit form: compressed (R-PACE-1)**

> Eligibility, measured, not asserted: `template-freeze.json.archetype_profiles[LINK].proven === true`, and `converted.json.converted` already carries **2** LINK members (`scripts/link-massing.js`, `scripts/link-parcels.js`) — at or above the ≥ 2 threshold R-AH makes the compressed form's DEFAULT condition. This step is LINK 3/3, the archetype's last member.

**Governing plan:** `.cursor/i4_link_neighbourhoods_active_task.md` (Status: Implementation, authorized 2026-09-16, all six Asks at their stated defaults).
**Target Spec / governing specs:** `docs/specs/01-pipeline/60_shared_steps.md` §"Link Neighbourhoods" (the step's own contract — Spec 57 says so explicitly), then `docs/specs/01-pipeline/41_chain_permits.md` row 11 and `docs/specs/01-pipeline/43_chain_sources.md` row 18, then 122 / 122a / 123 / 124, then 47 §A.5 (lock 92) and 48 §3.6 (verdict cascade).

**Measurement environment for every number in this report:** local dev DB `postgres` @ `127.0.0.1:54322`, `SELECT count(*) FROM schema_migrations` = **244**, PostGIS **3.3.7**, measured **2026-09-16** at HEAD `e1f4843c`. No cloud writes were made. Every number below carries the query that produced it, and no number is copied from the PH-0 draft — the draft was authored in a worktree with no `.env` and declared all of them PENDING.

---

## 1. §0 / PH-0 — BOUNDARY FREEZE (G0)

### 1.1 Target-file grounding (the batch-2 preamble, re-run this commit)

`scripts/link-neighbourhoods.js` appears verbatim **(a)** inside Spec 60's `### Target Files` block and **(b)** in Spec 60's row of `docs/specs/00-architecture/00_system_map.md`. Owner spec recorded in the Target Spec line above, ahead of 122/123/124.

### 1.2 The file, the quadrant, the archaeology

| Measure | Value | Command |
|---|---|---|
| Lines | **375** | `wc -l scripts/link-neighbourhoods.js` |
| Churn (commits) | **25** | `git log --oneline -- scripts/link-neighbourhoods.js \| wc -l` |
| `fix(` commits | **17** → fix density **68 %** | `git log --oneline -- … \| grep -ci '^[0-9a-f]* fix'` |
| Quadrant | **top-right** (commits 25 · lines_changed 725 · LOC 255 · branches 54) | `grep link_neighbourhoods docs/reports/generated/122-churn-complexity.md` |
| Advisory lock | **92**, "2 — Link", NOT spec-numbered | Spec 47 §A.5 registry |
| Archetype (census) | **LINK**, batch C4, order 4 — LINK 3rd/last member | `scripts/steps/_schema/step-archetype-census.json` |
| Chain positions | `permits` **11 of 33** · `sources` **18 of 28** | `node -e` over `scripts/manifest.json` |
| Fences | **8 declared** (draft said 7 — see §3.2) | `scripts/link-neighbourhoods.notes.json` `fences[]` |

### 1.3 Reads

| Table | Columns | Site |
|---|---|---|
| `pg_extension` | `extname` | `:76` — the PostGIS probe (LN-D2) |
| `neighbourhoods` | `id`, `neighbourhood_id`, `name`, **`geometry`** (GeoJSON) | `:80-82`, `WHERE geometry IS NOT NULL` |
| `neighbourhoods` | **`geom`** (PostGIS) | `:138`, `WHERE n.geom IS NOT NULL` — a DIFFERENT corpus filter (LN-D5) |
| `permits` | `permit_num`, `revision_num`, `latitude`, `longitude`, `neighbourhood_id` | `:88-98`, `:199-215`, `:331-335` |
| `permit_parcels`, `parcels` | `permit_num`/`revision_num`/`parcel_id`; `id`/`geometry` | `:91-92`, `:204-205` — LEFT JOIN, JS branch only |

### 1.4 Writes — ALL of them

| # | Statement | Site | Disposition |
|---|---|---|---|
| W1 | `UPDATE permits p SET neighbourhood_id = n.id FROM neighbourhoods n WHERE n.geom IS NOT NULL AND p.neighbourhood_id IS NULL AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND ST_Contains(…) RETURNING p.permit_num` | `:135-143` | **PORTED** → `outputs.writes[0]`, class **N** `set_based_join_update`. Carries no `IS DISTINCT FROM` and no transaction today. |
| W2 | `UPDATE permits SET neighbourhood_id = -1 WHERE neighbourhood_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL RETURNING permit_num` | `:148-153` | **KNOWINGLY RETIRED — LN-D1.** Cannot succeed (FK). |
| W3 | `UPDATE permits p SET neighbourhood_id = $1 FROM (SELECT unnest($2::text[]) …) v WHERE … AND p.neighbourhood_id IS DISTINCT FROM $1`, inside `pipeline.withTransaction` | `:301-314` | **RETIRED with the JS branch — LN-D2.** Its `IS DISTINCT FROM` guard (fence `7a147377`) is carried onto the surviving target — see §3.3 for why that carry is textual, not functional. |

`write_inventory.statements` = **1** after conversion.

### 1.5 Environment / argv

`PIPELINE_CHAIN` at `:104` and `:362` → `sharing.varies_by_chain.phase` + `execution.invocation`. **`process.argv` is read NOWHERE.** `supports_full: true` in the manifest is inert metadata with zero consumers anywhere in `scripts/`, `src/tests/` or `scripts/lib/step/`. This is what makes any FULL mode net-new rather than a port — see LN-D9.

### 1.6 G0 verdict

Boundary frozen; every read, every write, every env site enumerated above with its anchor. **PASS.**

---

## 2. §0.4 — the measurements the plan blocked commit ① on

Every one was run this commit. The plan named Q1–Q6 plus three precondition probes; all nine ran, and five more were added by the plan panel.

| # | Fills | Result | Cost |
|---|---|---|---|
| **Q1** | `invariants.negative_neighbourhood_ids` | **0** | 30 ms |
| **Q2** | `invariants.neighbourhood_id_orphans` | **0** | 237 ms |
| **Q3** | `plausibility.linked_permit_outside_its_own_neighbourhood` — the Reality-Check row | **5,138** of 231,930 = **2.215 %** | 2,906 ms |
| **Q4** | `plausibility.stamped_permits_with_null_coordinates` — decides Ask 3 | **9,017** | 1,523 ms |
| **Q5** | the two-corpus divergence (LN-D5) | geojson **158** / postgis **158** / total **158** — divergence **0** | 2 ms |
| **Q6** | **LN-D2's A-8-class run evidence** | **`js_branch_runs = 0`** — see §2.2 | 30 ms |
| P1 | RLS on `permits` | `relrowsecurity = true`, `relforcerowsecurity = false` | 16 ms |
| P2 | the GiST index name | **`idx_neighbourhoods_geom_gist`** — NOT the `idx_neighbourhoods_geom` the draft guessed | 7 ms |
| P3 | `fk_permits_neighbourhoods` | present, `convalidated = true` | 4 ms |
| NEW | eligible scope (`neighbourhood_id IS NULL AND lat/lng NOT NULL`) | **0** | 80 ms |
| NEW | cumulative: linked / total / with-coords | **240,947 / 254,082 / 231,930** → 94.83 % all-permits, **100.00 %** coordinate-bearing | 372 ms |
| NEW | LN-D6's stranded population | **1,493** | 122 ms |
| NEW | overlapping neighbourhood polygon PAIRS | **50** (draft assumed 0) | 96 ms |
| NEW | permits contained by MORE THAN ONE polygon | **0** | 6,232 ms |

### 2.1 Two draft PREMISES refuted by measurement

1. **"Toronto's 158 neighbourhoods are nominally non-overlapping, so the ambiguous population is expected empty."** The first half is **FALSE**: 50 pairs genuinely `ST_Overlaps`. The second half is true, but for a reason the draft did not give — every overlap is a topology sliver (min 0.0005 m², max 0.56 m², mean 0.06 m², all 50 under 1 m², ≈ 3 m² total across the whole corpus), and **zero** permit points land in more than one polygon. The undeclared tiebreak is therefore unexercised in fact while genuinely reachable in principle, which is why it stays an open blind spot rather than being closed as impossible.
2. **"A non-zero `no_neighbourhood_match` is expected and permanent."** Measured **0**: every one of the 231,930 coordinate-bearing permits is linked. The note stands as a statement of what the counter MEANS once a genuinely unmatchable permit arrives, not as a description of a population that exists.

### 2.2 Q6 — LN-D2's run evidence, and the honest limit of it

```
SELECT COUNT(*) AS runs,
       COUNT(*) FILTER (WHERE (records_meta->>'polygon_tests_skipped')::bigint > 0) AS js_branch_runs,
       COUNT(*) FILTER (WHERE (records_meta->>'polygon_tests_skipped')::bigint = 0) AS postgis_branch_runs,
       COUNT(*) FILTER (WHERE records_meta->>'polygon_tests_skipped' IS NULL)       AS indeterminate,
       MIN(started_at), MAX(started_at)
FROM pipeline_runs
WHERE pipeline LIKE '%link%neighbourhood%' AND status = 'completed';
→ runs=50 · js_branch_runs=0 · postgis_branch_runs=11 · indeterminate=39
  window 2026-03-03T17:02Z → 2026-07-17T20:50Z
```

⚠️ **The plan's own Q6 SQL names a column that does not exist.** It queries `pipeline_runs.pipeline_name`; the column is `pipeline`. The query as written throws. Corrected above and re-run.

**`js_branch_runs = 0`**, so the plan's stated stop condition (escalate if > 0) is **not triggered** and the LN-D2 retirement ruling stands on run evidence rather than on the shape rule alone.

**STATED LIMIT, recorded rather than glossed.** The 39 indeterminate rows carry a `records_meta` that is entirely NULL, not merely missing the one field. More decisively: the population most plausibly produced by a JS run — the 9,017 permits stamped with NULL coordinates, `first_seen_at` 2026-02-20 to 2026-03-21 — **predates the earliest `pipeline_runs` row (2026-03-03) entirely**. Q6 is therefore **CLEAN for every instrumented run and INDETERMINATE for the causal era**. The circumstantial evidence for that era (a parcel-centroid capability only the JS branch ever had; zero PostGIS runs before `7c75e92e` on 2026-04-02) points toward the branch having run then — which strengthens the case for retiring it, not weakens it. Environments measured for the extension: local dev DB (PostGIS 3.3.7 present). Cloud primary and the `BUILDO_TEST_DB` testcontainer are **not** measured here; `guards.requires[extension postgis, on_missing: fail]` is what makes an unmeasured environment HALT rather than silently answer a different question.

---

## 3. §PH-3 — Intent Ledger

All **25** commits that ever touched `scripts/link-neighbourhoods.js`, each construct disposed. An agent produced this table; the dispositions are the operator's (Spec 123 §7.1 — the discovering pass may not adjudicate its own fence).

| Commit | Date | What it put in the file | Disposition (preserved-in-runner / preserved-in-validator / preserved-in-compute / encoded-as-descriptor-field / encoded-as-deviation / knowingly-retired) |
|---|---|---|---|
| `d398d5e7` | 2026-02-20 | the original linker + Data Quality Dashboard coverage tracking | encoded-as-descriptor-field (`identity`, `outputs.writes[0]`) |
| `8287291e` | 2026-03-06 | status reset on re-run, `PIPELINE_SUMMARY` | preserved-in-runner (the library owns emitSummary) |
| `6d20c449` | 2026-03-07 | `PIPELINE_META` self-documenting data flow | preserved-in-runner (`deriveMeta` builds it from `inputs`/`outputs`) |
| `bd06751d` | 2026-03-07 | `records_total` standardized across linking scripts | encoded-as-descriptor-field (`counters.records_total`) |
| `412927ca` | 2026-03-07 | 14 pipeline audit findings | encoded-as-descriptor-field (`checks[]`) |
| `d2050cfc` | 2026-03-10 | `records_new`/`records_updated` corrected for linkers | encoded-as-descriptor-field (`counters`, with `records_new`'s structural 0 given its own `why`) |
| **`bd9e67ab`** | 2026-03-11 | **FENCE 5** — early-exit path must still emit summary + META | encoded-as-descriptor-field (`terminals[no_eligible_permits]`, whose `why` cites the sha) |
| **`7a147377`** | 2026-03-12 | **FENCE 2** — `IS DISTINCT FROM` guard on the UPDATE | encoded-as-descriptor-field (`write_discipline.guard`), with the vacuity recorded in `guard_why` — see §3.3 |
| **`4699730f`** | 2026-03-15 | infinite-loop fix + BBOX prefilter + the `-1` sentinel | knowingly-retired (LN-D1 / LN-D2) — the loop half is independently defended by `b1102cdb` |
| `fcd6ff68` | 2026-03-21 | `audit_table` added to 10 permits-chain scripts | encoded-as-descriptor-field (`checks[]` + `sharing.varies_by_chain.audit_table`) |
| `5baaed5a` | 2026-03-26 | audit_table gaps, UX rendering, phase numbering | encoded-as-descriptor-field (`sharing.varies_by_chain.phase` = `{permits: 8, sources: 10}`) |
| **`e53cdcf5`** | 2026-03-27 | **FENCE 1** — the link rate becomes CUMULATIVE | encoded-as-descriptor-field (`checks[].link_rate`, `why` cites the sha) |
| **`b1102cdb`** | 2026-04-01 | **FENCE 3** — composite keyset cursor, UNNEST batching, JSON safety, centroid | knowingly-retired as MECHANISM (it lived in the JS branch), preserved as GUARANTEE — see §3.4 |
| `7c75e92e` | 2026-04-02 | **PostGIS spatial offloading** — the dual path is born | encoded-as-deviation (LN-D2: the branch is retired, the extension becomes a `guards.requires` precondition) |
| `0f0d4107` | 2026-04-02 | crash bugs, variable scoping, sentinel logic; deferred the parcel-geometry gap | knowingly-retired (LN-D6 — this commit's own deferred follow-up is the substitute now being retired) |
| `0c6128c6` | 2026-04-02 | lazy-load Turf.js in the dual-path scripts | knowingly-retired (LN-D2) |
| `89df1961` | 2026-04-02 | move `turfPolygons` construction into the JS fallback block | knowingly-retired (LN-D2) |
| `eddd185c` | 2026-04-03 | `turfPolygons` reference crash in the summary | knowingly-retired (LN-D2) |
| `c1ef0b73` | 2026-04-16 | **FENCE 6** — advisory lock 92 | encoded-as-descriptor-field (`identity.lock` + `why_lock`) |
| `76dcca28` | 2026-04-17 | `parseInt` → `safeParsePositiveInt` — kills the sentinel without noticing | knowingly-retired (LN-D1 — this commit is half the evidence that the sentinel is unwriteable) |
| **`e37eaab9`** | 2026-04-18 | **FENCE 8** — `records_updated` = `linked`, never `linked + noMatch` | encoded-as-descriptor-field (`counters.records_updated.why` cites the sha) — **MISSED BY THE PH-0 DRAFT**, see §3.2 |
| `f69b561d` | 2026-04-21 | spec-link standardization across 48 scripts | encoded-as-descriptor-field (`identity.spec`) |
| `da6db77a` | 2026-04-22 | SPEC LINK path repair | encoded-as-descriptor-field (`identity.spec`) |
| `7edb231e` (mig 109) | 2026-04-24 | **FENCE 7** — the FK that makes `-1` unwriteable | encoded-as-descriptor-field (`guards.requires[fk]`, `database.min_migration`) |
| **`bd1f0e61`** | 2026-07-03 | **FENCE 4** — row-derived verdict cascade replaces a parallel boolean | preserved-in-validator (`scripts/lib/step/verdict.js` `deriveVerdict`; the local copy is deleted) |

### 3.1 Disposition summary

**knowingly-retired: 7 constructs** across LN-D1, LN-D2 and LN-D6 — every one carrying an operator ruling in `deviations[]` and a defect-ledger row. **preserved-in-runner: 2** (the two emit paths). **preserved-in-validator: 1** (the verdict cascade). **encoded-as-descriptor-field: 14.** **encoded-as-deviation: 1.** Nothing is disposed "INCIDENTAL" without a home.

### 3.2 The eighth fence the draft missed — `e37eaab9`, and the lock that would have gone vacuously green

The PH-0 draft declared **7** fences. The Regression Guardian found an eighth by `git log -S` rather than by reading the draft: `e37eaab9` (2026-04-18, *"§11 — fix generic counter misuse in 5 permit pipeline scripts"*) flipped `records_updated: linked + noMatch` back to `records_updated: linked` — itself reverting a regression `b1102cdb` had introduced 17 days earlier. The rule it established is that a FAILURE count may never be summed into a generic success counter.

The converted form preserves it **structurally**: with W2 retired there is exactly one write target, so `written.e1.updated` counts rows the containment join actually stamped and cannot absorb the no-match tail, which reports through its own `no_neighbourhood_match` row.

**But its pre-conversion lock would have gone VACUOUSLY GREEN.** `src/tests/chain.logic.test.ts`'s §11 Counter Semantic Contract block asserts `expect(content).not.toMatch(/records_updated\s*:\s*linked\s*\+\s*noMatch/)` against `scripts/link-neighbourhoods.js` **as source text**. Commit ② empties that file, so the string it hunts stops existing whether or not the contract holds — the `not.toMatch` half passes for the wrong reason. (Its sibling `toContain('no_neighbourhood_match')` half would fail loudly, which is the only reason this would have been noticed at all.) The fence is now declared in `notes.json` and locked behaviourally in `src/tests/steps/link_neighbourhoods/violations.test.ts`; re-homing the `chain.logic.test.ts` assertion is a commit-② obligation, recorded in §6.

### 3.3 FENCE 2's carry is TEXTUAL, not functional — and the draft claimed otherwise

The plan's guarantee table says G-10 is *"PRESERVED AND EXTENDED to the PostGIS path"*. Measured at the Idempotency Lens seat: **the guard is vacuous under this step's own declared scope.** The scope admits only rows where `neighbourhood_id IS NULL`; the value written is `neighbourhoods.id`, a non-null SERIAL; and `SELECT (NULL::int IS DISTINCT FROM 5)` returns `t`. So the guard evaluates true for 100 % of in-scope rows and can never exclude one. What actually delivers `idempotent_rerun: "zero_writes"` is **the scope emptying** — run 1 stamps, run 2's `IS NULL` predicate matches nothing.

The fence WAS load-bearing where `7a147377` put it: the JS branch's UPDATE at `:306-312` carried no `IS NULL` scope at all, so the guard was the only change-guard on that path. It is kept as defence-in-depth and becomes load-bearing again the moment anything widens the scope past `IS NULL` (LN-D9's filed widening). `guard_why` now says all of this; the draft's D-5 re-stamp justification, which cannot apply while the scope carries `IS NULL`, is removed.

### 3.4 FENCE 3's carry is a GUARANTEE, not a mechanism

The draft declared `staleness.checkpoint {cursor: "permit_num,revision_num", ordered: true}`, `chunked: true`, `batch: 1000`, `txn_scope: "batch"` and `partial_fill: "batched"` — **every one of which is a property of the branch LN-D2 retires**, not of the branch that survives. The surviving PostGIS write is ONE unbatched `UPDATE … FROM … ST_Contains` issued outside any transaction. Lifting the retired branch's execution shape onto it would have introduced a **net-new partial-commit exposure** into a path that had none, in the commit whose whole claim is that nothing changed.

Corrected: `txn_scope: "statement"`, `chunked: false`, `batch: "none"`, `partial_fill: "atomic"`, `checkpoint: "none"` — the `compute_centroids` precedent for a single-statement write, verbatim. The infinite-loop fence `b1102cdb` defended is then **structurally unreachable** (there is no loop to fail to advance), which is a stronger preservation than a cursor would have been. `recovery.interrupted_why` is rewritten to match: a single statement is its own transaction, so a kill rolls it back whole and leaves `permits` untouched.

---

## 4. §PH-5 — Seam map (G5)

| Seam | Where | Declared as |
|---|---|---|
| **DB seam** | `pool.query` ×5 + `pipeline.withTransaction` ×1 | `ctx.pool`, never reached from compute (Rule 2) |
| **Clock seam** | `Date.now()` at `:73`/`:320` — elapsed only, never written to the DB | `duration_ms` emit; no `columns[].source: "run_at"` target exists, because the step writes no watermark column at all |
| **Network seam** | **none** | `execution.network: "none"` |
| **argv / env seam** | `PIPELINE_CHAIN` only; **no argv at all** | `execution.invocation` + `sharing.varies_by_chain.phase`. `override.force_full` is `"none"` — the draft's env flag was net-new and is not introduced (LN-D9) |
| **Extension seam** | `pg_extension` probe at `:76` | `guards.requires[extension postgis, on_missing: fail]` — the probe itself is retired (LN-D2) |

### 4.1 Non-determinism inventory (declared BEFORE the first differential, per the plan)

1. **Polygon-overlap tiebreak.** Neither branch declares one. MEASURED: 50 sliver overlaps exist but **0** permits are ambiguous, so this cannot move a value today. Declared in `limitations[]` and `notes.json.blind_spots[]`.
2. **`duration_ms`** — stripped by the capture harness's own `VOLATILE_KEYS`.
3. **The `-1` FK throw's error text** — cannot fire on this database: W2's `WHERE` is exactly the empty eligible set, so the statement matches 0 rows and never violates the FK. A PRE capture is safe to take.
4. **Runner-default `records_meta` keys** (`terminal`, `checks_passed`, `config`, `ledger_row`, `gate`) appear only on the POST side, by construction.

---

## 5. §PH-6 — Classification, and §G4 — Risk class

### 5.1 Risk class (G4) — **B**

**Risk class B — chance HIGH × impact MEDIUM.** The factors behind each axis:

| Axis | Factor | Evidence |
|---|---|---|
| **Chance** | **HIGH** | top-right quadrant · 68 % fix density (17/25) · 8 fences · a dual-path branch with 3 crash fixes in 48 h · **zero existing tests** (`src/tests/neighbourhood.logic.test.ts` covers `src/lib/neighbourhoods/summary.ts` only — nothing tested the linker before this commit) |
| **Impact** | **MEDIUM** | one nullable column on one table, additive only, no retraction, no junction; ~20 downstream consumer files read it, the FK already guarantees referential sanity, and the `-1` sentinel every consumer filters on has been dead for 17 months |
| **Total** | **B** | High chance × Medium impact. Not A: the blast radius is one nullable column with an enforced FK and no destructive write anywhere in the step. |

### 5.2 Downstream `-1` consumers — the plan's count was wrong

The plan asserts only two consumers are sentinel-aware. Grepped across `src/` and `scripts/`: there are **eight** non-test sites in six files plus two test files.

`src/app/api/admin/stats/route.ts` (`> 0`) · `src/app/api/permits/[id]/route.ts` (`> 0`) · `scripts/compute-storey-norms.js` ×2 (`<> -1`, **still unconverted**) · `scripts/lib/assert-global-coverage-fields.js` (`dataFilter: 'neighbourhood_id <> -1'`) · `scripts/lib/compute/assert-global-coverage.js` (`!= -1`) · `scripts/lib/compute/refresh-snapshot.js` (`!= -1`) · `scripts/link-neighbourhoods.js` itself · plus `src/tests/db/refresh-snapshot-consolidation.db.test.ts` and `src/tests/db/vocab-coverage.db.test.ts`.

**All eight are functionally inert and unaffected by this conversion** — `-1` has been unwriteable since 2026-04-17/24, so every one of these filters has already been a silent no-op. But three of them are live artifacts of the very sentinel being retired, including two inside ALREADY-CONVERTED steps, and they belong in LN-D1's cross-reference rather than going unmentioned.

`polygon_tests_skipped` (LN-D8) was grepped the same way: **zero** consumers outside `link-neighbourhoods.js` itself.

---

## 6. Panel folds — what the PLAN roster changed, and what commits ② and ③ now owe

Seven seats ran at PLAN altitude (§7). Fourteen findings were folded into the descriptor, notes and seeds **in this commit**. Four are obligations that land later and are recorded here so they cannot be lost:

1. **Commit ② — re-home `src/tests/chain.logic.test.ts`.** Remove `link-neighbourhoods.js` from `SCRIPTS_WITH_COUNTS` and the PIPELINE_META list (with the RE-HOMED comment every converted sibling carries), and convert the §11 Counter Semantic Contract assertion from a source-string check into a descriptor/behavioural one — otherwise it goes vacuously green (§3.2). **This step is the FIRST converted step to appear in that describe block**, so there is no precedent to copy; the shape is new.
2. **Commit ② — the runner fork's own obligations.** `runLinkColumnPhase` must (a) add itself to the `drivesWrites` term or `clockNow` is `null`; (b) thread `ownRunId` into `selectMode` as all five existing runners do; (c) call `readPriorEmitWithPosture` rather than raw `readPriorEmit`, or `staleness.on_prior_run_error: "fail_step"` remains a declaration with no consumer; (d) set `written.e1.scanned` from the **eligible/walked** count, not the updated count, or run 2 of the `zero_writes` proof reads `0/0/0` and is indistinguishable from a skipped run; (e) **not** early-return on zero eligible, or the post checks — including the standing `link_rate` WARN and the whole `failed_link_rate` arm — are suppressed on every run in the current steady state; (f) emit `code_version` from the compute, as `link-massing.js` does, or `prior.code_version` is absent forever and the gate's `changed` signal never closes.
3. **Commit ② / ③ — the re-freeze is SPLIT, not single.** `deriveArchetypeProfiles` in `scripts/steps/_schema/generate-template-freeze.mjs` iterates `converted.json.converted` and **never reads `pending`**. So commit ② can re-freeze `schema_sha256` and the new `phase_runners` row, but `archetype_profiles[LINK].shapes` cannot gain `link_column` until commit ③ registers the file — which means a **second** `--refresh` and the `template-freeze.infra.test.ts` pin flip belong at ③. The plan puts both at ②.
4. **Commit ② — the `x-ruling` node already exists.** `step.schema.json`'s `shape` node carries a single `x-ruling` object (the `enrich` widening). It must be EXTENDED to cover `link_column`, not overwritten with a second key.

### 6.1 "Exactly ONE explained differential diff" is REFUTED

The plan's §② target is *"exactly ONE explained diff — LN-D3's `threshold` string"*. Derived from the pre-conversion `emitSummary` block against the 9 declared checks, the differential will carry **at least seven** classes, each of which needs its own explanation in this report or G8 counts it as unexplained:

| # | Diff | Explained by |
|---|---|---|
| 1 | `audit_table.rows` count **6 → 9** | the four net-new rows (`neighbourhoods_loaded_before_write`, `link_rate_floor`, `sentinel_residue`, `write_privilege`) — plan guarantees G-1/G-2/G-6/G-8 |
| 2 | `polygon_tests_skipped` disappears (row + `records_meta` key) | **LN-D8** |
| 3 | `no_neighbourhood_match` INFO → WARN, gains a threshold | **LN-D1** (the sentinel's retirement makes it the standing cost signal) + Rule 10 R-H |
| 4 | `neighbourhoods_loaded` threshold `'== 158'` → the floor form | **LN-D3** |
| 5 | `link_rate` threshold `'>= 95%'` → `pct >= 95`, rendered value form changes | Rule 3 externalization; the VALUE and the verdict are unchanged (94.83 % → WARN both sides) |
| 6 | `emitMeta` reads change: `neighbourhoods` gains `geom` and loses `geometry`; `parcels` disappears entirely | **LN-D5** (one corpus) + **LN-D2/LN-D6** (the JS branch's parcel join is retired) |
| 7 | standalone capture's `records_meta` gains every runner default | generic, shared by every converted step |

### 6.2 The differential will prove nothing about the write — say so out loud

MEASURED: the eligible scope is **0 rows**. W1 matches nothing; W2 matches nothing. Both PRE and POST write zero rows, and the projected `permits` content hash is identical **by construction**. A green `--compare` on this data validates the observable surface — audit rows, meta, ledger — and is **not** evidence that the ported `ST_Contains` join is correct. A forced-FULL differential cannot close that gap either: pre-conversion a forced FULL is unreachable (no argv handling at all), so the pair would be asymmetric by construction.

---

## 7. Panel roster — who ran, at PLAN altitude

| Seat | Agent | Verdict |
|---|---|---|
| Integration | `general-purpose`, main tree | PASS with 5 findings (all folded) |
| Reality-Check | `pipeline-reality-check`, main tree | PASS with 6 findings; re-executed all 8 baseline numbers, none drifted |
| Regression Guardian | `regression-guardian`, main tree | PASS with 4 findings, incl. the 8th fence and the LN-D6 blind spot |
| Idempotency Lens | `general-purpose`, main tree | 14 findings, 5 HIGH — the deepest set; drove §3.3, §3.4 and LN-D9 |
| DeepSeek — spec lens | CLI | 3 CRITICAL, 8 HIGH; drove LN-D8 and the LN-D3 band correction |
| DeepSeek — security lens | CLI | 4 HIGH, all pre-write/limit-form duplicates of findings already folded |
| DeepSeek — idempotency lens | CLI | 2 CRITICAL, 6 HIGH; independently reached the same guard-vacuity and batch-shape findings |
| DeepSeek — error-paths lens | CLI | 2 CRITICAL, 5 HIGH; drove the `records_new` structural-zero declaration |
| Gemini | CLI | connection verified; **not run at PLAN altitude — seat gap, see §9** |

Every finding acted on was re-executed by a grounder before it was folded. Three were **REFUTED by that re-execution** and deliberately NOT acted on:

- *"`database.min_migration: 109` is correctly set"* (Reality-Check) — refuted by `step.schema.json`'s own description and the LW-D8 lock: it is a COUNT floor, and `109_fk_hardening.sql` is the **106th** of 244 sorted files. Set to 106.
- *"`p.longitude::float` casts from text columns, so one bad row fails the step"* (DeepSeek idempotency) — refuted: `information_schema.columns` reports `latitude` and `longitude` as `numeric`. The cast cannot throw on data.
- *"`blocking: false` and 'NO write was issued' cannot both be true"* (three separate lenses) — refuted by reading `makePreWriteGate`: it returns `abort` off the unaccepted-FAIL partition and **never consults `blocking`**. A `pre_write` FAIL stops the write unconditionally; `blocking` governs only whether the step additionally throws and halts the chain. Both statements are true, and the descriptor now says so explicitly.

---

## 8. Validator surface at commit ①

`node scripts/analysis/step-validate.mjs --step=link_neighbourhoods --fast` — expect G0/G1/G2/G3/G4/G5/G6/G4d green and G7/G8/G9 stage-gated at `descriptor_only`. The generated validation-scorecard block lands at commit ③ per R-R, when `--write` runs against the converted step.

⚠️ **A report may not spell the scorecard's own heading in its prose.** `stripScorecard` locates that block with a bare `text.indexOf(marker)` and returns everything BEFORE it — so an inline mention of the literal heading, anywhere in the body, silently truncates the report at that point for every gate that reads it. This section originally quoted the heading verbatim, and the cost was G7's RED-evidence and all three of G9's markers reading `false` while the file plainly contained them. Caught by running the validator and then testing the gate regexes directly against the file, which disagreed. Filed LOW in `review_followups.md`: the marker match should be line-anchored (`/^## Validation scorecard \(generated\)/m`).

**RED-evidence (G7).** `src/tests/steps/link_neighbourhoods/violations.test.ts` lands **RED-first** this commit: 49 tests, of which **10 are `it.fails(...)`** — genuine assertions that genuinely fail today because the artifacts they describe are commit-② and commit-③ outputs (the compute module, the frozen shell, `link_column` in the runner and the schema enum, the `converted[]` registration, the amended Spec 60/43 text). Vitest reports a failing `it.fails` as a pass and reports it as a FAILURE the moment the claim becomes true, so each flips to a plain `it()` in the commit that earns it and a premature flip reddens the suite. The other 39 are green today and pin the 8 fences (G4d requires lock-count ≥ fence-count), the measured preconditions, the limit forms, the ledger rows and the `pending` registration.

**One claim the plan filed as RED is not a red claim**, and running the suite is what showed it: the Rule 11 `order_guarantee` anchor **resolves today** and must STAY resolving. Written as `it.fails` it would have gone red at commit ① — exactly backwards. It is a plain `it()`: a standing lock that reddens if commit ③ amends Spec 60 without re-pointing the anchor in the same commit.

---

## §R. Reflection

### LOW-CONFIDENCE — what this assessment is least sure of

| Claim | Why confidence is low | What would raise it |
|---|---|---|
| The 5,138 outside-their-polygon permits have a single root cause | **Mechanism UNIDENTIFIED.** Two hypotheses were tested and REFUTED by query (Weston's geom is not corrupt; it is not an id/`neighbourhood_id` column swap, 9 of 5,138). 99.7 % share one `first_seen_at` month and one `geocoded_at` batch, which says *event*, not *which event* | the 2026-02 ingest/geocode run's own logs, or a `permit_history` reconstruction of when those ids were first stamped |
| The JS branch never ran | Q6 is clean for all 50 instrumented runs but **indeterminate for the causal era**, which predates `pipeline_runs` entirely (§2.2) | nothing available — the evidence does not exist. This is why the retirement also rests on the `guards.requires` halt, which makes the question moot going forward |
| The golden differential will validate the ported join | It will **not** — the eligible scope is 0, so both sides write nothing (§6.2). Stated as a known limit, not a hope | a synthetic fixture run against a seeded eligible set, or a post-cutover run after `geocode_permits` produces new arrivals |
| `1,493` is the whole stranded population | It is the population with a linked parcel carrying geometry. Permits with neither coordinates nor a parcel are a larger, separate set (13,135 unlinked in total) | a breakdown by `permit_type` of the 13,135, which §2 does not attempt |

### RECURRING / STANDARD-SHAPING — what this step teaches the standard

| Observation | Why it is standard-shaping |
|---|---|
| **A draft descriptor's `limit` forms can be individually plausible and collectively broken.** Four checks paired `limit: "viol == 0"` with `limit_from_config`; substitution replaces the trailing number, so a floor variable resolved to the nonsense `viol == 158` and a percentage to `viol == 95`. Nothing in `validateDescriptor` catches it — the form is schema-valid | `limit_from_config` needs a conformance rule asserting the substituted form is still *evaluable and directionally sane*, not merely that both fields exist. Filed |
| **A declared shape lifted from a RETIRED branch is a net-new behaviour change wearing a port's clothes.** The draft gave the surviving single-statement write the retired JS branch's batching, cursor and transaction scope — introducing partial-commit exposure into a path that had none, inside a commit claiming to change nothing | Every `execution` field should be traceable to the SURVIVING code path specifically, not to "the step". A conversion checklist item: for each of `chunked`/`batch`/`txn_scope`/`checkpoint`/`partial_fill`, name the surviving line it describes |
| **A net-new capability that silently no-ops is worse than an absent one.** `override.force_full` + `terminals[linked_full_relink]` would have shipped a flag whose name promises a relink and which cannot relink, on an estate carrying 5,138 rows an operator would reasonably expect it to fix | A declared override needs a reachability proof at declaration time — three independent measurements showed this one unreachable, and `linked_full_*` has **zero** ledger stamps across the entire converted fleet, which is itself a fleet-level smell worth a standing check |
| **A source-string lock survives the file it polices.** `e37eaab9`'s §11 contract was pinned by `not.toMatch(...)` against a file the conversion empties — it would have passed for the wrong reason forever | Any `chain.logic.test.ts`-style source-text assertion about a step should be re-homed onto the descriptor at that step's conversion, and the conversion checklist should GREP for the step's filename across `src/tests/` rather than waiting for a red |
| **Three of four "the draft says X" premises were false, and only measurement found them.** The index name, the non-overlapping corpus, the permanent no-match tail, and `min_migration`'s semantics were all wrong in a carefully-written plan | The plan's own §0.4 discipline (every number carries its query) is necessary but not sufficient — it covers numbers the plan THOUGHT to measure. The premises that broke here were the ones stated as background fact |
| **The 5,138 population is the MODE, not an outlier.** 1,027 of the 2,192 permits ever stamped "Weston" (47 %) are not inside Weston | A per-zone/per-group distribution check catches this; a global-outlier check does not. Reinforces the Reality-Check seat's own standing instruction |
