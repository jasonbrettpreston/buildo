# Active Task: WF3 — witness resolver: outer-scope column binding + loud refusal of unsupported statement kinds
**Status:** Implementation — operator authorized 2026-10-03
**Domain:** Backend/Pipeline (`scripts/lib/sql-witness/`) · **WF3** · per-finding: 3 filed rows + 1 sibling found during repro (same root cause), one fix commit
**Rollback anchor:** `709066be` (branch `wf2/deep-scrapes-restore-l0`, 2026-10-03; resolve.cjs and its test file are unchanged since the repro tip `9d034179`)
**Labels:** **M** = MEASURED (command named) · **R** = READ (file:line) · **U** = UNVERIFIED

## Context
* **Goal:** the gate #44 witness resolver must never credit a column to the wrong table with no error, and must never pass a statement kind it cannot witness as a silent utility. Fixes the three rows filed 2026-10-03 at the end of `docs/reports/review_followups.md` (:4199 MEDIUM, :4200 LOW, :4201 LOW) and one sibling found while reproducing them (F1b below).
* **Target Spec:** `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §6.6.1 (b) + (e) (R :1024-1032). The resolver "resolves each statement once with the real Postgres grammar (libpg-query) to tables/columns read and written". Gate #44 trusts those reads/writes for checks (a)–(g). Spec 124 R-BF/R-BC (strict zero, closed answers). The registry-truth plan says an unqualified column resolves against the in-scope relations (R `.cursor/wf2_registry_truth_active_task.md:85`) and lists "ambiguous column" as an unhappy path (R :297).
* **Key Files:** `scripts/lib/sql-witness/resolve.cjs` (fix) · `src/tests/sql-witness-resolve.logic.test.ts` (red-first locks) · `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §6.6.1(e) (one sentence) · `docs/reports/review_followups.md` (close 3 rows, add 1 CLOSED row for F1b, 1 DEFER row for S4).
* **Consumers of resolve.cjs (R grep):** `scripts/lib/sql-witness/assemble.cjs` (capture-time traces → gate #44), `scripts/analysis/src-sql-ledger.mjs` (static `src/` ledger), `src/tests/steps/_witness-guard.ts` (the fixture-time guard used by 19 step test files: the 10 `witness-fixture.logic.test.ts` plus 9 `violations`/`runtime`/`missing-table-guard` files, blast item 3), plus capture-witness.js through assemble. step-validate.mjs and `scripts/analysis/gates/*` import no sql-witness module: they read the stored traces only.
* **Execution Provider:** `deepseek` for code + tests. `resolve.cjs` and the test file are in neither `claude_only_globs` nor `registry_reserved` (R `scripts/lib/exec-policy.json`). `resolve.cjs` has 1035 lines, more than `write_file_max_existing_lines` 200, so the engine must use `edit_file`. Claude keeps the spec sentence, the review_followups rows, verification and the landing. Downgrade to `claude` with a logged reason only if the engine is unavailable.

## Reproduction (M — executed on tip `9d034179`)
Command: `node <scratch>/tests.cjs cur`. It calls `resolve.init()` and then `resolveStatement(sql, {a:['id','x'], b:['id','y'], c:['z']})`.

| id | SQL | measured output (current) | correct (Postgres scoping) |
|---|---|---|---|
| F1a (:4199) | `SELECT 1 FROM a, b WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` | `reads {a:[],b:[],c:["id"]}`, `error null` | `id` is ambiguous in the outer scope → `FAIL:INPUT:column:id` |
| F1b (new sibling) | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` | `reads {a:[],c:["id"]}`, `error null` | c has no `id`, so it binds outward → `a:["id"]` |
| F1b | `UPDATE a SET x = 1 WHERE EXISTS (SELECT 1 FROM c WHERE id = 2)` | `reads {c:["id"]}`, `writes {a:["x"]}` | `reads a:["id"]` |
| F1b | `SELECT 1 FROM a JOIN b ON a.id = b.id WHERE x IN (SELECT z FROM c WHERE y = 1)` | `reads … c:["y","z"]`, `b:["id"]` | `y` belongs to b → `b:["id","y"]`, `c:["z"]` |
| control | `SELECT 1 FROM a, b WHERE id = 1` | `error FAIL:INPUT:column:id` | same (innermost ambiguity already errors) |
| F2 (:4200) | `EXPLAIN SELECT id FROM a` / `EXPLAIN ANALYZE UPDATE a SET x = 1` / `DO $$ BEGIN UPDATE a SET x = 1; END $$` / `CALL refresh_all(1)` | each `kind utility`, `reads {}`, `writes {}`, `error null` | refuse loudly |
| F2 | `SELECT id FROM a; CALL refresh_all(1)` | `reads {a:["id"]}`, `error null` (the CALL vanishes) | refuse loudly |
| F2 sibling | `TRUNCATE a` | `utility`, `error null` (a write that goes unwitnessed) | refuse loudly |
| F3 (:4201) | `MERGE INTO a USING b ON a.id = b.id WHEN MATCHED THEN UPDATE SET x = b.y` | `error "FAIL:INPUT:parse:Cannot read properties of undefined (reading 'relname')"` | a named refusal, not a TypeError |

**Root cause (R `resolve.cjs:306-349`).**
* **F1b.** In the innermost scope, `rels.length === 1` returns the lone relation without checking the catalog (:316-317). An outer column referenced unqualified inside a one-table subquery is therefore credited to the subquery's table.
* **F1a.** At an enclosing scope the loop returns the first catalog match (:333-339) and never counts matches, so outer-scope ambiguity cannot error.
* **F2/F3.** `resolveNode` sends `MergeStmt` into `resolveWrite` (:565). The MERGE tail (:867-872) hits the TypeError. Any statement kind outside the handled set falls through to `return result('utility', …, null)` (:570-571), so EXPLAIN, DO, CALL and TRUNCATE are silent.

## Blast radius (M)
1. **Corpus re-resolve, current vs fixed.** Command: `node <scratch>/seatA2/corpus2.mjs` (the corrected-pathspec copy of `<scratch>/corpus.mjs`), run with a scratch copy of resolve.cjs that has the planned fix (the code under "Fix design").
   * The corpus holds 1,418 statements: the 71 committed trace statements that carry `text` (every `docs/reports/witness/**/*.trace.json`, 37 files, 705 statements in total), plus every SQL-keyword string literal and every template literal (each `${}` replaced by `$9`) in the 615 git-tracked `src/**` (non-test) and `scripts/**` `.ts/.js/.cjs/.mjs` files, listed with a `:(glob)` pathspec. A plain `"scripts/**/*.js"` pathspec silently skips the 80 top-level `scripts/*.js` step files; the corrected script is `<scratch>/seatA2/corpus2.mjs`.
   * 1,152 statements parse; 266 do not, almost all of them template fragments.
   * **Statements whose reads, writes or error change: 0.** EXPLAIN, DO, CALL or MERGE statements in the corpus: 0.
   * `git grep` over `scripts/` and `src/` (non-test) finds only prose for those constructs, no SQL.
2. **Trace statements with no text.** 634 of the 705 trace statements carry no `text` (assemble.cjs keeps text only for `pipeline_runs` statements).
   * Proxy for F1b: every read the lone-relation shortcut credits wrongly is a column that is **absent from that table's catalog row**. Checked every textless read against `_catalog.json`: **0 suspect reads.** F1b has not occurred in any committed trace.
   * F1a is not visible to that proxy. Postgres itself raises "ambiguous" on executed SQL, so F1a can only arise where the resolver's scope model differs from Postgres's: a stale catalog, or the INSERT…SELECT write-target pseudo-scope (S4).
   * Distinct trace fingerprints: 115. The static corpus covers 32 of them by fingerprint. **83 distinct statements are unmeasured at text level** and are covered only by item 3.
3. **Library-generated SQL through the fixture guard.** Ran all 28 resolver-consuming test files against the fixed resolver, with the real resolve.cjs swapped in-process by a `NODE_OPTIONS=--require` resolve hook. The files: the 10 `steps/*/witness-fixture.logic.test.ts`; the 9 other `_witness-guard` users `steps/{assert_data_bounds/missing-table-guard, assert_parcel_sanity/violations, compute_centroids/runtime.logic, compute_parcel_cost_estimates/violations, enrich_centreline/violations, enrich_parcels/violations, geocode_permits/violations, load_centreline/violations, load_ravines/violations}`; `sql-witness-{resolve,assemble,gate,harness,trace,fixture,chain}`; `staleness.logic`; `source-version.logic`. Result: **28/28 files, 651/651 tests pass** (M: 264 by the planner, 387 by the Seat A roster). `sql-witness-trace` loads no resolver, so its run logs no swap. Existing locks hold, and the converted steps' generated SQL raises no new error.
4. **Statement kinds reaching the silent default branch** (M `<scratch>/seatA2/kinds2.mjs`, every non-one-time `src/`/`scripts/` literal, `:(glob)` pathspec): two kinds. (a) `IndexStmt`: `scripts/lib/compute/enrich-parcels.js:1101` `CREATE INDEX comp_cand_gix ON comp_cand …; ANALYZE comp_cand;`. It goes on the explicit utility list (G-B1). (b) `TruncateStmt`: `scripts/compute-phase-calibration.js:415,429` (`TRUNCATE phase_stay_calibration`; manifest step `compute_phase_calibration`, unconverted, no descriptor, no trace) and `scripts/wipe-supabase-auth-state.js` (ops script, never captured). TRUNCATE is refused on purpose (R-B6). Its only effect is on compute_phase_calibration's future conversion: the legacy PRE capture records `FAIL:INPUT:unsupported:TruncateStmt` in its trace `errors`, which gate #44 does not gate (`gates/witness.mjs:426-427` reads POST traces only). The converted POST cannot issue TRUNCATE, because the library write path refuses it structurally (`scripts/lib/step/write.js:1777`).
5. **Committed traces and goldens.** Gate #44 reads stored trace reads and does not re-resolve. resolve.cjs is outside `lib_fingerprint` (`scripts/lib/step/**` only, R `capture-step-golden.js:360-386`) and outside the step `source_fingerprint`. So **no recapture, no FAIL:STALE, no golden churn**. The fix applies from the next capture on: load_heritage, enrich_centreline and load_zoning are pending.

**Materiality.** 0 statements change verdict, which is below the <100 threshold. The fix is still owed: a silent mis-credit in gate #44 is a correctness defect in a strict-zero gate (Spec 124 R-BC), whatever the row count.

## Fix design (simple: Postgres's scoping rule, one loop; refuse instead of support)
1. **`resolveUnqualified` — one loop, the same rule at every scope.** Walk the scope chain innermost→outward. At each scope:
   * function-alias columns → derived (unchanged);
   * count distinct catalog tables that contain the column: **1 → bind**, **>1 → error** (this now holds at outer scopes too: F1a), **0 → write-target `writeColumns` check (unchanged), then continue outward**.
   * Two fences are kept, both from P1-C2 `047b2206`:
     * (i) an innermost lone relation **with no catalog row** still binds immediately. There is nothing to check against. The corpus measured this: without the fence, `scripts/backfill/migrate-entities.js` (`INSERT INTO entities … SELECT … FROM builders`, builders uncatalogued) moves 8 columns to `entities` through the write-target pseudo-scope, and `scripts/compute-storey-norms.js` moves columns the same way (2 statements in the corrected corpus).
     * (ii) if no scope places the column and the innermost scope had one relation, that relation is credited, as today. Executed SQL plus a stale catalog must not turn into an error. Measured without this fence: 6 corpus statements newly error. Two are Postgres-valid `GROUP BY bucket` output-alias references, two are catalog gaps, and two are template artefacts.
   * This replaces the separate `s === scope` / `else` branches (:315-340). There are no new helpers.
2. **`resolveNode` — a closed set of statement kinds.**
   * `IndexStmt` joins the explicit utility list at :521.
   * `MergeStmt` leaves the write branch at :565.
   * The silent fall-through at :570-571 becomes `currentErrors.push(\`FAIL:INPUT:unsupported:${key}\`)` and returns utility. ExplainStmt, DoStmt, CallStmt, MergeStmt, TruncateStmt, CopyStmt and any other kind now refuse by name, and multi-statement texts carry the error through `resolveStatement` (:992-994), wherever the unsupported statement sits; the other statements' reads and writes are still recorded (R-B5, R-B7). Live consequence: TRUNCATE in compute_phase_calibration only (blast item 4).
   * **Retired:** the dead MERGE tail of `resolveWrite` (:867-872) and the `'MergeStmt'` mention in its doc comment (:739).
   * **Not added:** EXPLAIN inner-statement resolution and MERGE support. Nothing uses either (measured 0).
3. Gate #44 needs no change. A statement error already reaches it as `FAIL:INPUT:<slug>:<invocation>:<error>` (R `gates/witness.mjs:12,427`). `src-sql-ledger` counts a non-parse error as `resolve_errors` on a parsed statement (R `src-sql-ledger.mjs:405-416`). Measured: 0 src literals change.

## Technical Implementation
* **New/Modified Components:** `resolve.cjs`: `resolveUnqualified` (rewrite of :306-349, about 30 lines), `resolveNode` (3 one-line edits), `resolveWrite` (delete :867-872). Scratch prototype diff: `<scratch>/resolve.fixed.cjs`. The prototype keeps the dead MERGE tail, which the engine brief removes.
* **Data Hooks/Libs:** none.
* **Database Impact:** NO. There is no migration, no DB read and no recapture (blast radius, item 5).

## Standards Compliance
* **Try-Catch Boundary:** unchanged. `resolveStatement` never throws (:986-991). The MERGE TypeError path is removed, not caught.
* **Unhappy Path Tests:** outer-scope ambiguity → `FAIL:INPUT:column`; each unsupported kind → `FAIL:INPUT:unsupported:<Kind>`, also inside a multi-statement text whether it comes first or last; an uncatalogued or stale-catalog lone relation keeps today's credit.
* **logError Mandate:** N/A. This is a pure library with no catch blocks added; errors are returned values.
* **UI Layout:** N/A.

## Red-first test list (`src/tests/sql-witness-resolve.logic.test.ts`, new `describe` "WF3 resolver scope + closed statement kinds", `SPEC LINK` header already present)
Catalog fixture `CAT2 = { a: ['id','x'], b: ['id','y'], c: ['z'] }`. Every RED was measured red on tip and green on the scratch fix (M `<scratch>/tests.cjs cur|fixed`; R-B7 by `<scratch>/seatA2/probe.cjs cur|fixed`).

| id | SQL | assert | tip | fixed |
|---|---|---|---|---|
| R-A1 | `SELECT 1 FROM a, b WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` | `error === 'FAIL:INPUT:column:id'`; `reads.c` lacks `id` | RED | GREEN |
| R-A2 | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` | `reads.a = ['id']`, `reads.c = []`, `error null` | RED | GREEN |
| R-A3 | `UPDATE a SET x = 1 WHERE EXISTS (SELECT 1 FROM c WHERE id = 2)` | `reads.a = ['id']`, `reads.c = []`, `writes.a = ['x']` | RED | GREEN |
| R-A4 | `SELECT 1 FROM a JOIN b ON a.id = b.id WHERE x IN (SELECT z FROM c WHERE y = 1)` | `reads.b = ['id','y']`, `reads.c = ['z']` | RED | GREEN |
| G-A1 | `SELECT 1 FROM a, b WHERE id = 1` | `FAIL:INPUT:column:id` (innermost ambiguity unchanged) | GREEN | GREEN |
| G-A2 | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM b WHERE id = 1)` | `reads.b = ['id']` (the inner table wins when it has the column) | GREEN | GREEN |
| G-A3 | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM d WHERE id = 1)` (d uncatalogued) | `reads.d = ['id']`, `error null` (fence i) | GREEN | GREEN |
| G-A4 | `SELECT q FROM c` | `reads.c = ['q']`, `error null` (fence ii, stale catalog) | GREEN | GREEN |
| R-B1 | `EXPLAIN SELECT id FROM a` | `error === 'FAIL:INPUT:unsupported:ExplainStmt'` | RED | GREEN |
| R-B2 | `EXPLAIN ANALYZE UPDATE a SET x = 1` | same ExplainStmt error | RED | GREEN |
| R-B3 | `DO $$ BEGIN UPDATE a SET x = 1; END $$` | `FAIL:INPUT:unsupported:DoStmt` | RED | GREEN |
| R-B4 | `CALL refresh_all(1)` | `FAIL:INPUT:unsupported:CallStmt` | RED | GREEN |
| R-B5 | `SELECT id FROM a; CALL refresh_all(1)` | `FAIL:INPUT:unsupported:CallStmt`; `reads.a = ['id']` | RED | GREEN |
| R-B6 | `TRUNCATE a` | `FAIL:INPUT:unsupported:TruncateStmt` | RED | GREEN |
| R-B7 | `CALL refresh_all(1); SELECT id FROM a` | `FAIL:INPUT:unsupported:CallStmt`; `reads.a = ['id']` (unsupported statement first) | RED | GREEN |
| R-C1 | `MERGE INTO a USING b ON a.id = b.id WHEN MATCHED THEN UPDATE SET x = b.y` | `FAIL:INPUT:unsupported:MergeStmt`; the error does not match `/TypeError\|relname/` | RED | GREEN |
| G-B1 | `CREATE INDEX comp_cand_gix ON comp_cand USING gist (geom); ANALYZE comp_cand;` (the real enrich-parcels text) | `kind utility`, `error null` | GREEN | GREEN |

The existing controls must stay green unchanged: the 5-utility mixed batch (:261), EXCLUDED/ON CONFLICT (:472), correlated LATERAL/EXISTS (:497, :509), the real parcels upsert (:521), and R14/R21/R22.

## Pre-Review Self-Checklist — sibling bugs (WF3 variant)
1. **S1, F1b:** the lone-relation shortcut credits outer columns. It shares the root cause and is FIXED here (R-A2..A4).
2. **S2:** qualified `t.col` resolution (`resolveQualified` :273-289) already walks outward and returns the first alias binding. That is correct Postgres behaviour: an alias is unique per scope and the inner alias shadows the outer. Doesn't apply.
3. **S3:** `*` with no qualifier expands only the innermost scope's relations (:660-663). That is correct; `*` never reaches outer scopes. Doesn't apply.
4. **S4, DEFER:** the INSERT…SELECT write-target pseudo-scope exposes the target's columns to the SELECT, which Postgres does not do. With fence (i) the measured corpus impact is 0. A catalogued source table that lacks a column would still credit the target. The fix moves this stale-catalog credit from the source table to the write target: `INSERT INTO a (id) SELECT id FROM c` reads `c.id` on tip and `a.id` after the fix. Both are wrong, and Postgres would raise an error (M, Seat A). File a LOW row in review_followups; no fix here.
5. **S5:** other statement kinds that are silently utility (TRUNCATE, COPY, LOCK, ALTER…). The closed set closes this class (R-B6). Two live kinds were measured (blast item 4): IndexStmt is allow-listed (G-B1), and TruncateStmt (compute_phase_calibration) is refused on purpose. That refusal is harmless: PRE trace errors are not gated, and the converted POST cannot TRUNCATE.

## Review rosters (Spec 08 §6.4 — both altitudes)
* **PLAN (lean WF3 premise check, before code):**
  * **Integration** (`general-purpose`, main tree, no worktree). Verify the consumer list, that gate #44 does not re-resolve committed traces, the fingerprint exclusion (no recapture), the engine-permission claim, and that fences (i)/(ii) match real catalog gaps (`_catalog.json` vs step SQL).
  * **One DeepSeek lens:** `npm run review:deepseek -- review scripts/lib/sql-witness/resolve.cjs --context docs/specs/01-pipeline/122_pipeline_step_optimization.md --section "6.6.1" --fast`, error-paths/spec lens over this plan + file. Grounded by the Integration seat (Sonnet+).
  * Reality-Check: skipped, because the resolver is plumbing and adds no derived field.
* **OUTPUT (on the diff):**
  * **Regression Guardian** (`regression-guardian`, main tree). Fences: the lone-relation shortcut (047b2206), the outer first-match rule (047b2206), the utility fall-through (047b2206), the MERGE tail (047b2206), and the C2c funcCols order (65e2917e).
  * **Independent** (`code-reviewer-grounded`, worktree), DeepSeek-first and grounder-adjudicated.
* **Fold validation (§11.2):** after folding any round, one grounder re-executes the claims and one Cross-read Adversary checks them.

## Execution Plan (WF3 template)
- [ ] **Rollback Anchor:** `709066be` (recorded above).
- [ ] **State Verification:**
  * MEASURED: the repro table, blast radius 1–5, and the 28-file swap run.
  * ASSUMED: the 83 textless distinct trace statements behave like the library SQL the fixture guard exercises (item 3).
  * NO DB, NO capture.
- [ ] **Spec Review:** Spec 122 §6.6.1(b)(e) read. The registry-truth plan resolver rule (:85, :297) read.
- [x] **Plan roster:** Integration + one DeepSeek lens (above). Fold findings, then run fold validation. Done 2026-10-03: Seat A (see "Plan roster"), Fold 1 applied in place, cross-read pass clean after brief `wf3-resolver-plan-fold1b.md`.
- [ ] **Reproduction:** engine brief `wf3-resolver-a-red.md`.
  * `write_scope: [src/tests/sql-witness-resolve.logic.test.ts]`, `allow_commit: false`, `edit_file` only; append the new `describe` with the 17 cases above.
  * `node scripts/deepseek-exec.js --brief .cursor/engine-briefs/wf3-resolver-a-red.md --provider=deepseek --max-iterations 40`. Cite the run_id.
- [ ] **Red Light:** `npx vitest run src/tests/sql-witness-resolve.logic.test.ts`. Expect exactly 12 RED (R-A1..A4, R-B1..B7, R-C1) and 5 new GREEN controls (17 new cases); all existing tests green.
- [ ] **Fix:** engine brief `wf3-resolver-b-fix.md`.
  * `write_scope: [scripts/lib/sql-witness/resolve.cjs]`, `edit_file` only.
  * Rewrite `resolveUnqualified` per Fix design 1 and keep the C2c funcCols block first.
  * Apply the three `resolveNode` edits.
  * Delete the MERGE tail and its doc mention.
  * Update the header comments of :291-305: replace both stale docblocks with one that states the per-scope 1/0/>1 rule and fences (i)/(ii).
  * STOP BEFORE COMMIT. Cite the run_id.
- [ ] **Green on target:** `npx vitest run src/tests/sql-witness-resolve.logic.test.ts` passes, all green.
- [ ] **Blast re-check (M, post-fix, real file):** re-run `<scratch>/seatA2/corpus2.mjs` (expect changed 0) and the 28 resolver-consuming test files of blast item 3 (expect 651 existing + 17 new, all pass). Run `node scripts/analysis/src-sql-ledger.mjs --check` (expect fresh: Seat A measured it fresh with the fixed resolver swapped in, because resolve_errors moves only on changed statements).
- [ ] **Idempotency Check:** N/A. This is a pure function with no DB writes; same input gives the same output (fingerprint locks :452-466 unchanged).
- [ ] **Docs (orchestrator):**
  * Spec 122 §6.6.1(e): append one sentence. "Resolver scope rule (WF3 2026-10-03): an unqualified column walks the scopes from innermost outward. It binds at the first scope where exactly one catalog table has it, and two or more matches at any scope is an error. A lone innermost relation keeps its credit when it has no catalog row, or when no scope's catalog places the column (stale catalog, output alias). Statement kinds outside the handled set are `FAIL:INPUT:unsupported:<Kind>`. Locks R-A1–A4, R-B1–B7, R-C1 in `src/tests/sql-witness-resolve.logic.test.ts`."
  * review_followups: mark :4199–:4201 CLOSED (commit), add F1b as a CLOSED row and S4 as a LOW DEFER row.
  * `npm run system-map` only if the generator flags drift (no new test file, so none is expected).
- [ ] **Pre-Review Self-Checklist:** walk S1–S5 above against the actual diff; PASS/FAIL per item.
- [ ] **Independent Review + Regression Guardian:** in ONE message (output roster above). Inputs: spec path, the two modified files, and the summary "resolver binds unqualified columns per Postgres scoping and refuses unhandled statement kinds by name". BUG → fix; DEFER → followups.
- [ ] **Fold Validation (Spec 08 §11.2):** grounder + Cross-read Adversary after the review fold.
- [ ] **Green Light:** `npm run typecheck && npm run lint -- --fix && npm run test` (pre-push `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1`). Paste the evidence with Execution Provider `deepseek` + both run_ids. Then → WF6. The commit is `fix(122_pipeline_step_optimization): …` with Spec 05 §5 footer `Severity: MEDIUM`, made by the orchestrator, one committer.

## §11 Plan Compliance
* DB impact: NO, so the migration/factories items are N/A.
* No API route, no UI, no frontend.
* Shared logic: the dual-path consumers (assemble, src-sql-ledger, the witness guard) are identified and re-run in "Blast re-check".
* Pipeline script: N/A, because the resolver is a library with no `pipeline.run`.
* Cross-layer contracts: no thresholds.
* Pre-Review Self-Checklist: present (WF3 sibling variant).

## Plan roster (2026-10-03)
Seat A = Integration (main tree, HEAD `709066be`) + DeepSeek error-paths lens (`deepseek-chat --fast`, §6.6.1), every claim grounded by execution. Scratch: `<scratch>/seatA2/`. **Verdict: premise CONFIRMED; plan PASSES after folds F1–F6 (two are blast-radius corrections, no design change).**

**Integration claims**
| # | Claim | Result | Evidence (executed) |
|---|---|---|---|
| I1 | Repro table + 16-case tip/fixed matrix | CONFIRMED | `node tests.cjs cur|fixed`: all 11 RED red on tip / green on fix; 5 controls green both |
| I2 | Corpus 1,047 / 844 / 0 changed | CONFIRMED as stated, **but corpus is incomplete** → F1 | rerun `corpus.mjs` → 1047/844/0, FP 31/115. Pathspec `"scripts/**/*.js"` matches 0 of the 80 top-level `scripts/*.js` (git pathspec w/o `:(glob)` needs a `/` after `scripts/X`); same for 2 `src/*.ts`. Corrected (`:(glob)`) `seatA2/corpus2.mjs`: 615 files, **1,418 stmts, 1,152 parse, changed 0**, FP 32/115 |
| I3 | "only IndexStmt reaches the silent default" | **REFUTED** → F1 | corrected `seatA2/kinds2.mjs`: `TruncateStmt` in `scripts/compute-phase-calibration.js:415,429` (manifest step `compute_phase_calibration`, unconverted, no descriptor/trace) + `scripts/wipe-supabase-auth-state.js` (ops); `IndexStmt` enrich-parcels.js |
| I4 | Consumers of resolve.cjs | CONFIRMED (prod), test list incomplete → F2 | `git grep`: prod = `assemble.cjs` (← `capture-witness.js`; `witness-chain.mjs` uses only `tracePathFor`), `src-sql-ledger.mjs:55`, `_witness-guard.ts:77`. `step-validate.mjs` / `scripts/analysis/gates/*` / `scripts/lib/step` import no `sql-witness` (grep 0) |
| I5 | Gate #44 never re-resolves | CONFIRMED | `gates/witness.mjs` is pure (no fs, no resolver import); reads `trace.errors` at :426-427 and fixture `errors` at :475-477 |
| I6 | Outside lib_fingerprint + source_fingerprint | CONFIRMED | `capture-step-golden.js:324-340` hashes {step, descriptor, notes, compute} only (executed for load_heritage → 3 files); `computeLibFingerprint` walks `scripts/lib/step/**/*.js` only (also `gates/captures.mjs:55,178`); 98 distinct `fingerprint_files` entries across committed goldens, 0 under `sql-witness` |
| I7 | New `FAIL:INPUT:unsupported:<Kind>` handled by every prefix consumer | CONFIRMED | assemble.cjs:245-246 pushes any non-null error into `trace.errors`; witness.mjs:427 emits every entry as `FAIL:INPUT` (no prefix switch); `_witness-guard.ts:330` adds any non-null error; `src-sql-ledger.mjs:114,432,439` switches only on `FAIL:INPUT:parse:` — anything else is `resolve_errors` (counted, never PASS). Ledger `--check` with fixed resolver swapped in (swap logged): **fresh, 72 files, closed set holds** |
| I8 | Fence (i) necessary | CONFIRMED | fence removed (`seatA2/nofi.cjs`), corrected corpus: 2 statements move columns to the INSERT target — `scripts/backfill/migrate-entities.js` and `scripts/compute-storey-norms.js` |
| I9 | Fence (ii) necessary | CONFIRMED | fence removed (`seatA2/nofii.cjs`): 6 new false errors — 2× `GROUP BY bucket` output alias (Postgres-valid; `wf1-gfa-accuracy-investigation.js`), 2× catalog gaps (`wf1-cost-matrix-rekey-pis.js`), 2× template artefacts (`link-coa-to-parcels.js`) |
| I10 | Engine permission | CONFIRMED | `exec-policy.json` never mentions `sql-witness` or the test file; resolve.cjs = 1035 lines > `write_file_max_existing_lines` 200 → `edit_file` |
| I11 | 17-file swap run "16 confirmed" | CONFIRMED benign | `sql-witness-trace.logic.test.ts` loads no resolver (0 refs), hence 16 swap lines |
| I12 | Cited lines :306-349, :521, :565, :570-571, :739, :867-872, :992-994 | CONFIRMED | `sed -n` on tip; resolve.cjs + test file unchanged `9d034179..709066be` (`git diff --stat` empty) |

**DeepSeek lens (12 claims → grounded)**
| Claim | Result | Evidence |
|---|---|---|
| CRIT: fence (ii) re-introduces F1b | REFUTED | F1b fires only when an OUTER scope places the column; fence (ii) fires only when NO scope does. Removing it adds 6 false errors (I9), incl. Postgres-valid output-alias refs |
| CRIT: "0 changed" is vacuous for F1a | DROP | the plan already says F1a is invisible to the proxy (item 2) and the Materiality line already rests the fix on correctness, not on the count |
| HIGH: multi-statement abort semantics unspecified | CONFIRMED safe, lock owed → F5 | fixed: `CALL refresh_all(1); SELECT id FROM a` → error CallStmt **and** `reads.a=['id']`; middle position too (`SELECT…; CALL p(); UPDATE b…` keeps every read/write). Tip: error null |
| HIGH: ANALYZE in G-B1 unaccounted | REFUTED | G-B1 measured `utility`/null on fixed; ANALYZE parses to the already-handled kind |
| HIGH: 16/17 swaps | CONFIRMED benign (I11); bigger gap found → F2 |
| HIGH: spec sentence omits fence (ii) | CONFIRMED → F3 | the sentence names only the uncatalogued case |
| MED: S4 inconsistency | CONFIRMED, new fact → F4 | `INSERT INTO a (id) SELECT id FROM c`: tip reads `c.id`, fixed reads `a.id` (both wrong; Postgres errors). Stale-catalog only; corpus 0 |
| MED/LOW/NIT: 264+16 wording, `lint -- --fix`, TRUNCATE multi-table, rollback anchor, simplicity | DROP / measured | `TRUNCATE a, b` + `TRUNCATE TABLE ONLY a` both refuse as TruncateStmt; COPY/LOCK/REFRESH MATVIEW also refuse by name |

**Fold list (APPLIED IN PLACE as Fold 1, 2026-10-03; kept as the record of what changed)**
- **F1** Blast radius item 1: replace the corpus numbers with the corrected run (615 files, 1,418 stmts, 1,152 parse, changed 0, FP coverage 32/115 → **83 unmeasured**). Name the pathspec fix (`:(glob)`) so the post-fix "Blast re-check" uses `seatA2/corpus2.mjs`. Item 4: "only IndexStmt" → "IndexStmt (allow-listed, G-B1) + TruncateStmt in `compute-phase-calibration.js:415,429` (unconverted step, no trace; it gets `FAIL:INPUT:unsupported:TruncateStmt` at its first capture — intended: the library write path refuses TRUNCATE structurally (`scripts/lib/step/write.js:1777`), so conversion removes it) + `wipe-supabase-auth-state.js` (ops, never captured)". Add the same line to S5.
- **F2** Blast item 3 + "Blast re-check": add the 11 omitted resolver-consuming test files — `sql-witness-fixture`, `sql-witness-chain`, and the `_witness-guard` users `steps/{assert_data_bounds/missing-table-guard, assert_parcel_sanity/violations, compute_centroids/runtime.logic, compute_parcel_cost_estimates/violations, enrich_centreline/violations, enrich_parcels/violations, geocode_permits/violations, load_centreline/violations, load_ravines/violations}`. Measured against the fixed resolver: **11/11 files, 387/387 pass**. Total: 28 files, 651 tests, plus the new cases.
- **F3** Spec 122 sentence + resolve.cjs docblock: add fence (ii) — "…a lone innermost relation keeps its credit when it has no catalog row, or when no scope's catalog places the column (stale catalog / output alias)."
- **F4** S4 DEFER row: record that the fix shifts the INSERT…SELECT stale-catalog credit from the source table to the write target (`c.id` → `a.id`).
- **F5** Add **R-B7** `CALL refresh_all(1); SELECT id FROM a` → `FAIL:INPUT:unsupported:CallStmt`, `reads.a=['id']` (tip RED, fixed GREEN). Red Light: **12 RED** + 5 GREEN, 17 new cases.
- **F6** Rollback anchor → `709066be` (current HEAD; resolver files unchanged since `9d034179`).

**Changelog:** Fold 1 applied 2026-10-03: roster folds F1–F6 rewritten into the body (corrected corpus/kinds numbers, 28-file swap set, fence (ii) evidence + spec sentence, S4 shift, R-B7 / 12 RED, anchor `709066be`). Cross-read pass 2026-10-03: corpus command, R-B7 measurement source and the roster checkbox brought current (brief `wf3-resolver-plan-fold1b.md`).
