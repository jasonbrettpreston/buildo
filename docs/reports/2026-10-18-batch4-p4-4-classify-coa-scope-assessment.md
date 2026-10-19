# Phase 4 wave 4 — `classify_coa_scope` (scripts/classify-coa-scope.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF), the whole six-part package (R-DT): zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, step-owned variable names (R-DE (v)), the RLS precondition on the write target (R-CT), and admin visibility (R-DL).
**Archetype:** ENRICHER. A per-row JS classifier over its own input table's pending cursor, writing six derived columns back onto `coa_applications`.
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes, frozen shell, the seeds migration, the admin map entry and the manifest fix. Commit ③ is the cutover. ENRICHER has six converted members (enrich_parcels, enrich_ravines, enrich_heritage, enrich_centreline, geocode_permits, compute_parcel_cost_estimates), so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/classify_coa_scope/fixtures/legacy-classify-coa-scope.js.txt`, byte-identical to `scripts/classify-coa-scope.js` (sha256 `e4eefad797e5191f…`), last changed by `c53f60a8`. The classifier module `scripts/lib/coa-scope-classifier.js` (sha256 `361a03431c4627a1…`) is NOT frozen: it is the shipped domain logic the harness loads for real, and ② keeps it unchanged (it moves into the compute's require closure).
**Owner spec:** 42 (`42_chain_coa.md` §6.5 step 5, §6.6.D, §6.8). The header also cites 47 (the script protocol, not an owner) and the classifier cites Spec 84 §7 (the JS/TS dual path, `src/lib/classification/coa-scope-classifier.ts`).
**Target spec:** Spec 42 (`identity.spec` "42"). **Governing specs:** 122 (step library and conversion process), 124 (policy register: R-BA, R-BZ, R-CT, R-CU, R-DE, R-DF, R-DL, R-DT, R-DU, R-DV). **Governing plan:** `.cursor/v3-wave4-coa-and-dispatch-2026-10-18.md` §B.2.4 (all 15 recommendations operator-approved 2026-10-18).
**Chain:** `coa`, position 6 of 16 (index 5, after enrich_coa_zoning; before classify_coa_trades, which reads `scope_tags`).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Source:** `streamQuery` over `SELECT id, description, status, decision FROM coa_applications WHERE description IS NOT NULL AND description <> '' AND (scope_classified_at IS NULL OR scope_classified_at < last_seen_at) ORDER BY id ASC`, no params (`:165-174`).
- **Write:** one explicit-VALUES `UPDATE coa_applications ca SET coa_type_class, project_type, scope_tags, structure_type, scope_classified_at = RUN_AT, scope_source = 'description' FROM (VALUES …) WHERE ca.id = v.id` per batch, each in its own `pipeline.withTransaction` (`:121-146`). 5 params per row plus RUN_AT.
- **Batch:** `Math.min(1000, Math.floor(65535 / 5))` = 1000 rows (`:49-50`); pinned L7.
- **No change guard, by design** (`:123-131`): an IS DISTINCT FROM guard left all-NULL outputs forever pending (the cursor never advanced). So `scope_classified_at` is a run-clock column outside any guard, and `records_updated` = rows touched (pinned L8).
- **Retraction:** none. A row whose description becomes empty leaves the cursor with its old classification.
- **Run clock:** `pipeline.getDbTimestamp` (RUN_AT) and the config are read BEFORE the advisory lock (`:55-63`; pinned L1).

### 1.2 Columns written
`coa_type_class`, `project_type`, `scope_tags` (text[], NULL when no keyword fires), `structure_type` (Spec 83 §3.A vocabulary or NULL), `scope_classified_at`, `scope_source` ('description') — `emitMeta` `:267-270`.

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 42, "CoA Scope Classification", ten rows in this order (`:223-237`): coa_processed, scope_classified (INFO); unmapped_scope_count (`<= t%`, PASS else WARN); scope_classified_pct (`>= (100 − t)%`, the SAME decision, CCS-D6); no_class, coa_type_class_null_pct, no_project_type, structure_type_classified_pct, project_type_distribution, coa_type_class_distribution (INFO).
- **Verdict:** the row cascade (`:241-242`).
- **Summary:** `records_total = processed, records_new 0, records_updated = Σ rowCount`; `records_meta` keys pinned L12.
- **Lock not acquired:** nothing streams, writes or emits (`:283`), but RUN_AT and the config were already read.

### 1.4 Live facts (A.F-DB, read-only, 2026-10-18)
- `coa_applications`: 33,949 rows; 33,288 with a non-empty description; `scope_classified_at` NULL on 1,227; **33,280 pending** (the H6 `--full` coa runs on 2026-10-16 touched `last_seen_at` on every row, and the last classify run was 2026-07-17); `scope_tags` NULL on 2,494; `structure_type` set on 17,718; `scope_source` = 'description' on 32,722, NULL on 1,227.
- RLS: `relrowsecurity = true`, 0 policies (Spec 114 Class B) — trap 2 applies (R-CT).
- Trigger `trg_coa_lead_id` fires only on INSERT or UPDATE OF application_number; this step updates neither.
- `logic_variables.coa_scope_unmapped_threshold_pct` = 10 (seed default 10).
- Latest runs (`coa:classify_coa_scope`): 2026-07-17 (2,527 / 2,527 updated, PASS), 07-10 (2,524), 07-07 (2,511) — the incremental Active feed size, consistent with the every-fed-key touch.

### 1.5 Consumers (effective ledger)
- `scope_tags`: classify_coa_trades (its cursor `trade_classified_at < scope_classified_at`, `classify-coa-trades.js:273`).
- `structure_type`: assert_global_coverage (coverage pass/warn variables), compute_coa_cost_estimates.
- `coa_type_class`, `project_type`: lead feed / admin (`src`).
- Converting this step adds a converted producer edge on `coa_applications`; every converted reader's skip gate can only run more (plan §B.4).

### 1.6 Admin visibility (R-DL)
- Registered: `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:59`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:685`), manifest `telemetry_tables: ["coa_applications"]` + `telemetry_null_cols`.
- **Gap:** `PIPELINE_TABLE_MAP` has no entry (CCS-D5). R-DV carves it out only while the descriptor is absent; ② adds `classify_coa_scope: 'coa_applications'`.

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L13 (§10). Each executes the frozen text with the real classifier.

## 3. Registry target review
- **(a) Files:** `scripts/classify-coa-scope.js` becomes the frozen shell. Added at ②: `scripts/classify-coa-scope.descriptor.json`, `scripts/classify-coa-scope.notes.json`, `scripts/lib/compute/classify-coa-scope.js`, `migrations/271_classify_coa_scope_logic_variables.sql`. Unchanged: `scripts/lib/coa-scope-classifier.js` and its TS twin.
- **(b) Tables:** reads `coa_applications(id, description, status, decision, last_seen_at, scope_classified_at)`; writes the six columns of §1.2.
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/classify_coa_scope/violations.test.ts` (this commit). For the ② sweep: `src/tests/classify-coa-scope.infra.test.ts` (it pins the legacy shell text and the old variable name), `src/tests/coa-scope-classifier*.test.ts` (unchanged module), `src/tests/control-panel.logic.test.ts`.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -- scripts/classify-coa-scope.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Description-keyword classification (Spec 42 §6.6.D) | `:34, :177-181` (`147e699c`, WF1 R5.3) | preserved-in-compute (`classifyCoaScope` called per row, module unchanged; why in notes.json) |
| JS/TS dual path (Spec 84 §7) | `:13-14` (`147e699c`) | preserved-in-compute: the same module; the TS twin is untouched (why in notes.json) |
| Re-classify after a description change via `scope_classified_at < last_seen_at` | `:157-173` (`147e699c`; R8 spec-drift note) | preserved-in-compute (the source SQL predicate; why in notes.json, corrected: the touch is every fed key, R-DW — CCS-D1) |
| No IS DISTINCT FROM guard (the infinite re-processing fix) | `:123-131` (`b3373342`, WF3 r5-3 BUG) | encoded-as-descriptor-field: `write_discipline.guard: "none"` with its why (all-NULL outputs must still advance the cursor) |
| records_updated = Σ rowCount | `:122-145, :247` (`b3373342`, BUG-1) | preserved-in-runner (`ctx.flushBatch` rowCount, the compute_parcel_cost_estimates form) |
| Batch-size formula vs the 65535 bind limit | `:44-50` (`b3373342`, BUG-4) | encoded-as-descriptor-field: `classify_coa_scope_batch_size` (1000); the bind ceiling is runner R-CU |
| structure_type archetype (Spec 83 §3.A) | `:85, :200` (`b02e2366`) | preserved-in-compute (same module; why in notes.json) |
| coa_type_class coverage row (P12-C3) | `:218-221, :229` (`c53f60a8`) | encoded-as-descriptor-field: an INFO context row |
| Day-1 WARN threshold, not FAIL | `:20-21, :226-227` (`147e699c`) | encoded-as-descriptor-field: `checks[] unmapped_scope_pct` severity WARN, `limit_from_config classify_coa_scope_unmapped_max_pct` |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| clock seam | `getDbTimestamp` RUN_AT; `Date.now()` duration | `:55-56, :214` | runner `run_at` binds `scope_classified_at`; duration is runner telemetry |
| db seam | advisory lock 4202 | `:37, :65` | `identity.lock` 4202 |
| db seam | `loadMarketplaceConfigs` + Zod, hoisted above the lock | `:58-63` | `config.logic_variables[]`, `hoisted_above_gate: true` |
| db seam | `streamQuery` source cursor | `:165-174` | `ctx.stream(buildSourceSql())` |
| db seam | per-batch `withTransaction` UPDATE | `:121-146` | `ctx.flushBatch(sql, params)`, one `post_commit` phase (precedent compute_parcel_cost_estimates) |
| network seam | none | — | — |
| argv/env seam | none (`supports_full: true` is dead, CCS-D4) | manifest | `supports_full: false` |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| The first converted run re-classifies 33,280 rows | certain | low — the classifier is deterministic; same values, new `scope_classified_at` | the P4 POST bracket measures it; parity with legacy (the next legacy run would do the same) |
| Variable rename breaks a run (CCS-D2) | low | medium — config refused | migration 271 copies the value; PRE at P3 on the ① tree BEFORE 271 is applied |
| RLS silent zero-write (trap 2) | low | high — counters read 0, PASS | `guards.requires rls_bypass_or_policy coa_applications` (R-CT) |
| R-DW changes the touch semantics | low | high — the cursor would stop re-classifying | runner lane keeps `last_seen_at` for every fed key (parity); notes name it as the invalidator |

## 6. PH-6 — Classification and defect ledger (rows CCS-D1…CCS-D7 in `docs/reports/defect-ledger.md`; prefix CCS, unique — `defectPrefixFor` measured, no override)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain and `classify_coa_scope` is outside its scope; no hand-plotted quadrant is substituted.

- **CCS-D1** (`:157-164`): the stale "ONLY when data_hash changes" claim — ② notes (pinned D6).
- **CCS-D2** (`:40-42`): `coa_scope_unmapped_threshold_pct` is outside R-DE (v) — ② migration 271 (pinned D3).
- **CCS-D3** (`:49-50, :204`): batch cap, bind formula and log cadence literals — ② variable / runner (pinned L7, D5).
- **CCS-D4** (manifest): `supports_full: true` is dead — ② (pinned D7).
- **CCS-D5** (`funnel.ts`): no PIPELINE_TABLE_MAP entry — ② (pinned D7).
- **CCS-D6** (`:226-227`): two rows, one decision, a derived copy of the bound — ② one declared check, the second row INFO (pinned L11, D4; declared deviation).
- **CCS-D7** (`:55-56, :214`): the step reads its own clocks — ② runner clock (pinned L1).

**Kept at parity (not defects, plan §B.2.4 notes 1–2):** the cursor re-classifies every fed key per run (the coa root touches `last_seen_at` for every fed key; R-DW keeps it), and the UPDATE is unguarded, so `records_updated` counts every touched row. Both are declared in notes.json at ②.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| 10 (unmapped %) | seed `coa_scope_unmapped_threshold_pct` | `classify_coa_scope_unmapped_max_pct` 10 (migration 271, value copied) |
| 1000 (batch cap) | `:50` | `classify_coa_scope_batch_size` 1000 (migration 271) |
| 65535 / 5 (bind formula) | `:49-50` | runner `maxRowsPerInsert` (R-CU); 1000 × 5 + 1 = 5,001 binds |
| 5000 (log cadence) | `:204` | runner `onProgress` |
| 4202 | `:37` | `identity.lock` |
| 'description' (scope_source) | `:140` | a declared constant column value (the provenance tag, not a tunable) |
| phase 42, "CoA Scope Classification" | `:259-260` | `sharing.varies_by_chain.phase` / `identity.display_name` |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | config via `loadMarketplaceConfigs` `:58` | runner config |
| G4 txn/lock | `withTransaction` `:121`, advisory lock `:65` | runner (`ctx.flushBatch`, `identity.lock`) |
| G5 direct write | the UPDATE `:133-144` | built in compute, executed by `ctx.flushBatch` (the compute_parcel_cost_estimates form) |
| G6 clock | `getDbTimestamp` `:55`, `Date.now()` `:56, :214` | runner `run_at` |
| G7 compute decides | `unmappedPct <= t` `:226-227` | declared check (the library compares) |
| G9 literal | `:49-50, :204` | §7 |
- `scanPurity` over `scripts/lib/coa-scope-classifier.js` (explicit-file mode, 2026-10-18): 0 sites. Its unit-count cut-offs (`>= 5`, `>= 3`, `=== 2`) name the Spec 83 vocabulary ("Multiple Unit Building", "3+ Unit") and are measured again by the ast-grep half at ②.

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE** on the legacy code at the ① tree, before any compute change (trap 7): `coa` chain plus standalone, at night P3, BEFORE migration 271 is applied.
- **POST** at night P4: the pending set is 33,280 today; after one legacy PRE run it is ~0, so the POST needs a forced bracket: NULL `scope_classified_at` on a deterministic `coa:` cohort (plan §B.4), restored by the run itself. Cascade order: after enrich_coa_zoning, before classify_coa_trades.

## 10. Red suite (PH-7) — `src/tests/steps/classify_coa_scope/violations.test.ts`
- **Size:** 22 tests. L1–L13 GREEN today (the legacy oracle). D1–D9 are `it.fails`, RED as named missing artifacts.
- **Red evidence:** `docs/reports/red-evidence/classify_coa_scope/pre2-artifacts-missing.json` (vitest JSON reporter output, D1–D9 run as plain it calls): 13 pass / 9 fail. D1–D5 fail as ENOENT on the named descriptor/compute; D6 fails on the stale "ONLY when" text still in the shell; D7 fails on the missing PIPELINE_TABLE_MAP entry; D8 because the report has no generated scorecard; D9 because converted[] does not hold the file. No TS or import error.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `./lib/pipeline`, `./lib/config-loader` and `Date.now`; `./lib/coa-scope-classifier` and `zod` are real.

| Pins | Behaviour |
|---|---|
| L1–L4 | clock + config hoisted above the lock, the cursor SQL, config refusal, advisory lock 4202 |
| L5–L9 | the unguarded VALUES UPDATE, real classifier values, the 1000-row batch, Σ rowCount, the empty pending set |
| L10–L13 | audit rows and order, the shared decision (CCS-D6), records_meta and emitMeta, counters |
| D1–D9 | descriptor and shell, write target + RLS guard, renamed variables, declared check, compute purity, notes, admin map + manifest, scorecard, registry (③) |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:** `converted.json` `pending[]` at stage `red_suite`; census row ENRICHER / pending with owner spec 42 (plus the two census fixtures); CCS-D1…D7; ADOPTION `legacy_oracle_excluded`; roadmap regenerated. Under R-DU the pending row does not block (no descriptor file).
- **Owed at ②:** descriptor, compute, notes, shell, migration 271, seeds, logic-variable groups, PIPELINE_TABLE_MAP, manifest `supports_full`, scorecard (D8).
- **Owed at ③:** registration (blocked by EP-PIN-D17 under R-EA).

## 12. Operator decisions
- RULED 2026-10-18 (plan recommendations 7, 8, 12, 13, 15): wave 4 = the six coa steps; census ENRICHER; legacy defects kept as declared deviations; PREs ride P3, POSTs P4; the stale `last_seen_at` comment corrected in this step's own conversion.
- **Draft rulings (id at integration):** W4A-R1 (rename into `<slug>_*` by migration, values carried, old names retired).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ENRICHER descriptor + frozen shell (D1) | Spec 122 §5.1; R-BA | compute_parcel_cost_estimates form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| RLS guard (D2) | R-CT | trap 2 | guards | R-CT | all RLS write targets | measured relrowsecurity | one guard | — |
| Renamed + new variables (D3) | R-DE (v); Rule 3 | `<slug>_*`, migration 263 form | `r-de-vocabulary.logic`, gate A | W4A-R1 | every new step | measured | one migration | **yes** |
| One declared check (D4) | R-BZ G7 | limit_from_config | verdict.js | CCS-D6 | all checks | L11 pinned | one check | bound from config |
| Compute purity (D5) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | batch variable |
| Notes correction (D6) | Rule 1 | — | D6 lock | rec 15 | — | measured touch | text | — |
| Admin map + manifest (D7) | R-DL | derived | `admin-step-registration.logic` | R-DL | every step | measured gap | data entries | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- Whether the ENRICHER runner's `ctx.flushBatch` path accepts a guard-less UPDATE under `write_discipline.guard: "none"` without an `x-banned-for-new` refusal; checked at ② against `grandfathered.json` and `write-class-disposition.json` before any descriptor is written.
### RECURRING / STANDARD-SHAPING
- Two wave-4 steps (this one and assert_coa_freshness) carry pre-R-DE variable names. Every remaining unconverted step will too; a single ruling on rename-by-migration (W4A-R1) saves each lane re-deciding it.

## A. Measurement log (2026-10-18)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` transaction): pending/NULL counts, scope_source distribution, column nullability, RLS flags and policies, triggers, `logic_variables`, `pipeline_runs` latest three.
- **A.F-CODE:** `scripts/classify-coa-scope.js` @ `c53f60a8`, 284 lines; `scripts/lib/coa-scope-classifier.js` 379 lines.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/classify_coa_scope/`: 22 / 22.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=classify_coa_scope --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 13/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: YES (G8, Rule 1 (unpinned enforced-red), Rule 5 (unpinned enforced-red), Rule 6 (unpinned enforced-red), Rule 7 (unpinned enforced-red), Rule 8 (unpinned enforced-red), Rule 9 (unpinned enforced-red), Rule 13 (unpinned enforced-red))**

### Five-word verdict (Spec 124 §5 R-BA — "McDonald's Airtight")

| Word | Status | Detail |
|---|---|---|
| STANDARDIZED | PASS | PASS |
| OBSERVABLE | PASS | PASS |
| SCALABLE | PASS | PASS |
| UNDERSTANDABLE | PASS | PASS |
| ACCURATE | PASS | PASS |

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=9 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 1 | 2 | table rows=10 vocab-hit rows=9 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 7 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=24 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=24 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 4 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 4 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 29 converted slug(s) — 29 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 74 declared counter source(s) across 25 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 11 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 0 bound(s) checked, all closed (0 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 0 on_invalid(s) checked, all closed (0 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 42 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 42 (report-only until the table's inserter and its last unconverted writer convert, R-EE) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; LDG-10 step readers: 0 hard, 25 UNPRODUCED-UNWITNESSED (unconverted inserter) [UNPRODUCED-UNWITNESSED:step:assert_lifecycle_phase_distribution:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:classify_coa_scope:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.permit_type; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.id; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:compute_cost_estimates:permit_trades.trade_slug; UNPRODUCED-UNWITNESSED:step:compute_opportunity_scores:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:lifecycle_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:permit_phase_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_trade_forecasts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_named_builders:entities.id; UNPRODUCED-UNWITNESSED:step:enrich_wsib_builders:entities.id; UNPRODUCED-UNWITNESSED:step:link_coa:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:permits.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:tracked_projects.id]; 6 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/analysis/gates/captures.mjs:value; unconverted_producer:scripts/analysis/gates/witness.mjs:x; unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 0 path(s) checked, all LF (0 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 35 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 494 definition row(s) checked, 101 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 24.65 s <= 25.3 s; registry-input 24.41 s <= 27.5 s; measured 2026-10-18T18:40:16.223Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 531 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 168 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (10 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |

### Captures (item iv)
- missing invocations (POST): coa::, none::
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 4 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 4/14** · not-run: 1 · vacuous: 1

