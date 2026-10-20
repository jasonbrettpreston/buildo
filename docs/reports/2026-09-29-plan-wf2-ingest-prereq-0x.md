# Active Task: INGESTOR library prerequisite 0x — multi-primary INGESTOR (`externals[].target` + `externals[].on_failure`, for load_heritage row 3.4)
**Status:** Authorized 2026-09-29 (batch2_load_heritage authorization + operator "y" on the D1(a) deferral; lean panel amendments 1–7 and cross-read X1–X8 folded)
**Workflow:** WF2 (library enhance; Spec 121 §4.3: every single-primary descriptor byte-identical; the new arm is reachable only by a descriptor that declares `target`).
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek (SUB-ENG-1, Spec 08 §C) for code and tests via the briefs in §6. **claude** for the plan seats, `registry_reserved` edits (`template-freeze.json`, `schema-baseline.json`, `00_system_map.md` [READ `scripts/lib/exec-policy.json` registry_reserved]), generators, the fleet recapture and the landing commit. Downgrade reason: verification seats, registries, captures. Plan skeleton: engine run `20260929T104051Z-ef17da62` (19 iterations, aborted `PROVIDER_ERROR` on iteration 19 after its last `write_file`; no commits). Every claim below was re-grounded by this seat. Draft errors corrected: it proposed a `staleness.scope` field, but that name is taken (fact 6); it proposed a loop hoisted inside `runIngestPhase` (rejected, ruling b); it left the recapture set and 5 anchors as TODO.
**Parent:** `.cursor/batch2_load_heritage_active_task.md` §4, D1 (a), §2 rows 1–3, 12, 14–15, 24. **Base:** main @ `43056856` + **0fs (RE-FREEZE #28)**, uncommitted in `C:\Users\User\Buildo-wt-0fs` (branch `wf2/0fs`) at planning time. Every `index.js`/schema line cite below is against the POST-0fs worktree [READ `git -C Buildo-wt-0fs diff`]. Re-count the anchors after 0fs lands. One committer. No capture while another seat holds the DB.

## Context
* **Goal:** an INGESTOR can declare N url-bearing primaries (path/filesystem/xlsx primaries refused in multi-primary descriptors by B9), each bound to its own `outputs.writes[]` table. Each primary runs today's per-external body with its own prior sub-block, gates and write txn. Each primary declares a failure posture. This is what heritage needs (DEC-K: two CKAN datasets → two tables, independent skip and failure) [READ load-heritage.js:697-698].
* **Target Spec:** `122_pipeline_step_optimization.md` §5.1 and §8 (RE-FREEZE log); `122a` new §A18; `124` Rule 1 (rung ladder, `x-ruling`), Rule 10, R-AJ; `121` §4.3; `61_source_heritage_properties.md` (consumer).
* **Key Files:** `scripts/lib/step/index.js` (new `multiPrimaryBinding` + `ingestPrimaries` + `primaryFailureRows`; 2 lines in `runIngestPhase`; 2 caller lines in `runWithPool`); `scripts/steps/_schema/step.schema.json` (`inputs.reads.externals.items`); new `src/tests/ingest-prereq-0x-{schema,runner,fullrun}.logic.test.ts`.
* **Database Impact:** NO.

## 1. Measured facts [tagged]
1. **Two refusals block multi-primary today.**
   * `writes.length !== 1` throws "drives exactly ONE write target" before the HEAD [READ index.js:668-673].
   * After the 0fs refusal loop, `primaries.length !== 1` throws "acquires exactly ONE". Its text and comment already name this rung: "3.4 load_heritage lifts this throw by binding each primary to its own write target" [READ :687-694, :723-731].
   * **CF-3 check (asked by the orchestrator):** 0x IS the per-primary target binding the 0w note foresaw, with one difference. The throw is not deleted. It stays as the fence for an UNtargeted descriptor, and a targeted descriptor is dispatched above it (ruling b).
2. **Locks that pin those refusals and must stay unedited:**
   * `ingest-prereq-0w-runner` T2 matches `/exactly ONE/` [READ :236-245];
   * `step-library` "Fold D" matches `/exactly ONE write target[\s\S]*declares 2 \(ravines, ravines_shadow\)/`, calling `stepLib.runIngestPhase` directly [READ :2467-2484];
   * `steps/address_points/violations.test.ts:512` expects `writes.length === 1`.
3. **Single-pair binding.** `writeSpec = writes[0]` [:674], `skeleton = { ...emit.skeleton }` [:677], `external = primaries[0]` [:732] and `plan = buildWritePlan(writeSpec, …)` [:872]. The prior is read ONCE as the whole `emits[0].key` block: `readPriorEmitWithPosture(pool, ledgerPipelineName(...), emitKey, posture)` [:936-938]. `readPriorEmit` returns `meta[emitKey]` with no sub-key [READ staleness.js:192-198]. Both gates read that block's top level: tier-1 `skipCheckDecision({…prior})` [staleness.js:262-291] and tier-2 `prior[measured.key]` [:479].
4. **The DS4 skip block is built per call.** `skipEmit = buildSkipReEmitMeta({skeleton: emitSkeleton, prior, pins:{spec_version, skipped_reason}})` [READ acquire.js:834-838]. So a narrowed call that is given a sub-skeleton plus a sub-prior yields a per-primary sub-block, with no acquire.js byte changed.
5. **Caller.** `runWithPool` calls `runIngestPhase` once [READ index.js:5343-5348] and consumes the result:
   * `acquired`, `written`, `prior`, `overrides`, `skipped`/`reason` [:5349-5365];
   * counters are null on a skip [:5687-5689];
   * a skip selects a `skip_gated` terminal by `ingest.signal` [:5700-5702];
   * `records_meta[emitKey] = emitBlock` on a skip [:5765];
   * `preWriteAbortRows`, `preWriteSkipRows` and `headErrorRows` each take `[ingest]` and use `.find`, so each yields at most one row [:5644-5649, :4944-4984, :5010-5020].
6. **`staleness.scope` is TAKEN.** It is a REQUIRED field meaning "WHICH ROWS are eligible" (`all`/`none`/SQL) [MEASURED node: `staleness.required` includes `scope`]. The draft's and the heritage plan's `staleness.scope` for skip aggregation would collide. Zoning's plan names it `skip_scope` [READ batch2_load_zoning:78].
7. **Externals item schema.**
   * Post-0fs properties: `id, kind, format, role, csv_options, url, path, license, on_head_error, key_property, cache, cache_why, cache_ttl`, with `additionalProperties:false` [MEASURED node]. So `target`/`on_failure` are schema bytes ⇒ RE-FREEZE.
   * `on_head_error` enum `fail_step|warn_row` is step-scoped per external HEAD only [READ schema :2055-2070].
   * The item allOf has 5 entries; the last is 0fs rule (2) [MEASURED].
8. **Heritage failure semantics (legacy).**
   * `loadDataset` returns `{outcome:'failed'}` on HEAD error [READ load-heritage.js:476-480], and also on L14/L7/L8 aborts [parent §2 rows 11-14].
   * `main` runs register then districts unconditionally [:697-698].
   * So a failed or aborted dataset never stops the other one (DEC-K).
9. **Zoning failure semantics (legacy):** base fetch/load error ⇒ FAIL + throw [READ load-zoning.js:641-643, :659, :669]; overlay ⇒ WARN + continue [:645, :648]. Zoning's skip is all-or-nothing, decided from ONE `package_show` before any fetch [:597-601]. Its acquisition is CKAN DataStore pagination, rung **0y**, which is not http_file [READ batch2_load_zoning:80, :116].
10. **Freeze.** `LIBRARY_CALL_RE = /\b(staleness|write|verdict|ledger|acquire|pipeline)\.(\w+)\(|\b(preWriteGate)\(/g` is scanned over each runner's line range. `RUNNER_TO_SHAPE` names `runIngestPhase` → `ingest` [READ generate-template-freeze.mjs:290-312]. A range ends at the next column-0 function declaration [:26-55]. `runWithPool` is not a runner [MEASURED awk: line 5092 encloses 5343].
11. **Other single-target assumptions:** none. `grep "writes.length|writes\[0\]|externals\[0\]|externals.find"` over step-validate.mjs, validate.js, capture-step-golden.js and lib/step/*.js returns only capture-step-golden.js:399 (`writes.length > 0`, table list) [MEASURED].
12. **Gate G.**
    * `lib_fingerprint` = sha256 over `scripts/lib/step/**/*.js` [READ gates/captures.mjs:23-31, :208-219].
    * Freshness scans POST captures ONLY: `loadPostCaptures` reads `golden/<slug>/post` [READ :317-319].
    * A `mismatch` is RED under `--all` [:235-262].
    * Multi-target steps need `golden/<slug>/cohort.json` for the forced-nonzero half [READ :14-20]. That is heritage's concern, not 0x's.
13. **RE-FREEZE #29 is free.** Highest is #28 (0fs worktree); main has #27 [MEASURED grep of 122 in both trees; no `RE-FREEZE #29` anywhere]. `122a §A18` is free (0fs added §A17 at :643) [MEASURED].

## 2. Target file review (FILES / DATA / CONSUMERS / TESTS)
**FILES**
| File | READ | Touched | Behaviour impact | Registration |
|---|---|---|---|---|
| `scripts/lib/step/index.js` | :594-680, :659-1304, :4935-5020, :5343-5365, :5630-5770 | + 3 functions inserted before the `runIngestPhase` JSDoc (outside every runner range); `runIngestPhase` signature + prior line; `runWithPool` dispatch + one extraRows line; exports; the stale CF-3 sentence in the :730 throw | single-primary: same call, same args, `subKey` undefined ⇒ same prior | Spec 122 Target |
| `scripts/steps/_schema/step.schema.json` | :1943-2230, :4446 | `target`, `on_failure` + 2 item allOf rules + 1 top-level rule | schema byte ⇒ RE-FREEZE #29 | engine-editable (not reserved) |
| `scripts/lib/step/{acquire,staleness,write,conservation}.js` | acquire :825-845; staleness :192-291, :479; write — | **no** | per-call behaviour reused as-is | — |
| `template-freeze.json`, `schema-baseline.json` (reserved) | generators | `--refresh` / `--check` | `schema_sha256` + `frozen_at` only (fact 10: no label added inside the `runIngestPhase` range) | orchestrator |
| `docs/reports/generated/122-vocabulary.md` (not reserved) + `00_system_map.md` (reserved) | 0fs landing steps 4–5 | regenerate | — | orchestrator |
| Spec 122 §8 (one line ≤180 B) + 122a §A18 | 0fs §8 line [READ 0fs diff] | text | — | same commit |

**DATA:** none written. Reads `pipeline_runs` (the prior block) once per primary. Before, it was read once per run. Each read is the same SELECT (N=2 for heritage).

**CONSUMERS**
| Reader | Impact |
|---|---|
| `runWithPool` (sole production caller of `runIngestPhase`) [MEASURED grep: :5343] | dispatch line; it consumes the aggregate shape of ruling (e) unchanged |
| 6 converted INGESTORs (ravines, address_points, parcels, centreline, massing, neighbourhoods) + load_wsib ② (future) | declare no `target` [MEASURED: key absent from the schema today] ⇒ `isMultiPrimary` false ⇒ the untouched path |
| `load_heritage` ② | first consumer: 2 primaries, `target` each, `on_failure:"fail_row_continue"` each; the compute assembles `heritage_load` from `acquired.primaries` |
| `load_zoning` (after 0y) | `on_failure` base `abort_step` / overlays `warn_row_continue`; **all-or-nothing skip is NOT in 0x** (ruling d) |
| gate G / step-validate #39 / `capture-step-golden.js:377` | fingerprint moves ⇒ recapture (§5) |
| `generate-template-freeze.mjs` phase_order | unchanged (new functions sit outside the runner range; the two edited lines keep their labels) |
| `step-validate.mjs:3444` forced-regex over `runIngestPhase` | `const forced = …` line untouched |

**TESTS**
| Test | Disposition |
|---|---|
| `ingest-prereq-0x-{schema,runner,fullrun}.logic.test.ts` (new; SPEC LINK 122a §A18) | red suite (§4) |
| 0w-runner T2; step-library Fold D :2467-2484; address_points violations :512; all four `ingest-prereq-0fs-*` (untracked in the 0fs worktree [MEASURED]) | MUST stay unedited and green |
| `step-library`, `step-row-conservation`, `template-freeze.infra`, `step-schema`, `step-conformance.infra`, `system-map.infra`, `gate-captures.infra` | run at landing |

## 3. Rulings
### (a) schema: two optional fields on `inputs.reads.externals.items`
* **`target`** `{type:string, minLength:1, x-ruling}`: the `outputs.writes[].table` this primary writes.
  * Rungs tried:
    * (a) positional (primary i → write i) is implicit, which Rule 10 bans;
    * (a′) `writes[].external` puts the binding on the target side, but the external is what gets acquired;
    * (e) inference from `shapeRecord` is compute-hidden.
* **`on_failure`** enum `["abort_step","fail_row_continue","warn_row_continue"]` (`x-frozen`, `x-ruling`). It governs a primary that THROWS, or whose pre_write gate aborts:
  * `abort_step` (absent default) rethrows, which is today's behaviour;
  * `fail_row_continue` is heritage DEC-K;
  * `warn_row_continue` is zoning's overlay.
  * It stays separate from `on_head_error`, which keeps its HEAD-only meaning (0r): a declared warn_row HEAD still proceeds inside the primary.
* **Item rule M1:** `on_failure` requires `target`, and `target` forbids `role:"lookup"`. Without the first half, a posture on a single-primary step would be inert (R-AJ).
* **Top-level rule M2:** if any external `required:[target]`, then `execution.shape const "ingest"`. This is the 0fs G6 pattern: it keeps the `isIngestStep` url fallback [READ index.js:299-306] from rerouting.
* **Runtime checks:** "every primary targeted, targets distinct, each target is a declared table, every write targeted, no lookups" are cross-array facts. JSON Schema cannot express them, so they are runtime refusals (ruling b). That follows the 0fs precedent for refusals v–ix.
* **No skip-scope field (ruling d).**

### (b) runner: a dispatcher, not a hoisted loop
* **`isMultiPrimary(d)`** = some external has a string `target`. `runWithPool` calls `(isMultiPrimary(descriptor) ? ingestPrimaries : runIngestPhase)({…same args})`. It is one line.
* **Why not hoist `runIngestPhase`'s 640-line body into a loop:**
  * it would reshape the frozen phase_order range;
  * it would move the `forced` line that step-validate parses;
  * it would touch every single-primary byte.
  * The dispatcher leaves the body alone.
* **`multiPrimaryBinding(descriptor, tag)`** is pure and runs before any I/O. Each refusal is a named throw carrying the offending id:
  * (B1) a primary with no `target`;
  * (B2) a `target` that is not a declared `outputs.writes[].table`;
  * (B3) two primaries on one target;
  * (B4) a write no primary targets;
  * (B5) any `role:"lookup"` external (0w lookups have no multi-primary consumer; R-AJ);
  * (B6) no `emits[0]`, or `emits[0].skeleton[<id>]` is not an object for some primary. The sub-block needs a declared home (gate C).
  * It returns `[{external, writeSpec, onFailure}]` in DECLARED external order.
* **`ingestPrimaries(args)`:** per pair, in order, it calls `runIngestPhase({...args, subKey: id, descriptor: narrowed, preWriteGate: gate && ((s) => gate({...s, primary: id}))})`.
  * `narrowed` = shallow clone with `inputs.reads.externals:[external]`, `outputs.writes:[writeSpec]`, `emits:[{...emits[0], skeleton: emits[0].skeleton[id]}]`, and (X2) `staleness.trigger` narrowed to the entries whose `external === id` or that are unscoped. `"none"` is kept as is.
    * Why X2: `triggersAt` filters by position only [READ staleness.js:87-90], and acquire.js takes `triggersAt(…,'post_acquisition')[0].hash` [READ acquire.js:839]. Without narrowing, primary b would be gated by, and hash with, a's trigger.
  * `runIngestPhase` therefore sees an ordinary single-primary descriptor. Both refusals (fact 1) stay reachable only by an untargeted descriptor.
  * Each call keeps its own `detectInterruptedRetraction`, `assertWritePrivileges`, acquire, shape, validate, gate, write txn and `rowConservation` [READ :866, :945, :947, :1122-1134, :1199, :1283-1290]. That gives one txn per target, which matches legacy "ONE txn per dataset" (parent §2 row 15).
  * **Correction (I-1):** `assertWritePrivileges` iterates `guards.requires` (`rls_bypass_or_policy` subjects), not `outputs.writes` [READ write.js:1250-1252]. Narrowing does not scope it, so each call re-probes every subject. It is duplicated but harmless.
  * `ingestPrimaries` ALSO runs it once, uncaught, before the loop (amendment 2). A privilege failure therefore throws before any acquisition, whatever the posture.
  * **Order (X8):**
    1. `multiPrimaryBinding` (pure, 0 queries);
    2. the X1 export pre-checks (pure);
    3. the privilege preflight (first `pool.query`);
    4. the loop.
  * This order is what lets T4 assert `pool.query` 0×.
* **Pre-loop export checks (X1), inside `ingestPrimaries` and uncaught:**
  * any targeted primary with `format:"csv"` ⇒ `compute.shapeRecord` must be a function (mirrors :777);
  * any targeted write with `write_discipline.set_source:"compute"` ⇒ `compute.buildWriteSql` must be a function (mirrors :900-907).
  * Why pre-loop: the narrowed call would otherwise raise these for primary #2 only AFTER #1 committed, and under `*_continue` they would be swallowed into `primary_failed`.
* **Refusals added to `multiPrimaryBinding` (amendment 3):**
  * **(B7)** `target` declared while fewer than 2 primaries exist. Without it, a single targeted primary would route to `ingestPrimaries` and lose the gated skip and its terminal. This was Guardian's UNDEFENDED finding.
  * **(B8)** duplicate `externals[].id`. The schema has no `uniqueItems` on externals [MEASURED node: `externals.uniqueItems === undefined`], and validate.js has no id-uniqueness check [MEASURED grep]. A duplicate id would collide in `acquired.primaries` and in the skeleton sub-key.
  * **(B9, widened by X1)** every targeted primary must be url-bearing (non-empty `url`), carry NO `path` key, and not be `format:"xlsx"`.
    * Why: the narrowed clone carries only `[external]`, so the 0fs construction refusals (index.js:708-720) and acquire.js's xlsx⇔lookup pairing would only see the current primary. For primary #2 they would fire after #1 committed.
    * There is no filesystem consumer: heritage and zoning are both http (R-AJ).
    * B9 also makes the 0fs A3 (`noSourceFile && interrupted`, :976) and G3 (no `no_source_file` terminal, :734) refusals unreachable on this path.
    * **Comment/message requirement:** lifting B9 must return A3 and G3 to the never-caught set.
  * Heritage (2× http shapefile) is unaffected [READ load-heritage.js:690-698].
* **`runIngestPhase` edits (exactly two):**
  1. The signature gains `subKey`.
  2. The prior line becomes `const { prior: priorBlock, error: priorError } = …;` followed by `const prior = subKey === undefined ? priorBlock : (priorBlock && typeof priorBlock[subKey] === 'object' ? priorBlock[subKey] : null);`.
  * When `subKey` is undefined, `prior` is the same object ⇒ byte-identical behaviour.
* **The 0w throw's trailing CF-3 sentence** (:730, "3.4 load_heritage lifts this throw…") is re-worded to "a multi-primary step declares `externals[].target` and is dispatched to `ingestPrimaries` (0x) before this line". `exactly ONE` stays in the message.
* **Brief 12 also rewords the CF-3 comment block** [READ index.js:687-694] (amendment 4). Its text "lifted by deleting these four lines and adding a per-primary target binding" would be stale: 0x keeps the lines and dispatches above them.
* **New brief 12b** adds an `ingestPrimaries` pointer to the `writes.length` header comment [READ :660-667]. That comment asks "one txn or several? whose keys does the departure DELETE scope by?", and 0x answers it: several txns, each call's plan scopes its own departure DELETE.

### (c) failure posture
* **`abort_step`:**
  * a throw propagates, so the remaining primaries are never acquired (today's semantics);
  * a pre_write abort (`writeSkipped` with `failedPreWrite`) stops the loop, and the remaining primaries record `outcome:"not_reached"`. This is zoning's "base ok:false aborts" [load-zoning.js:669].
* **`fail_row_continue` / `warn_row_continue`:**
  * a throw is caught around that ONE call, logged via `log.error(tag, …)` (scripts/lib/step uses `log.*`, 0fs precedent), and recorded as `acquired.primaries[id] = {outcome:"failed", error: message}`. The loop continues;
  * a pre_write abort continues too (heritage L7/L8 per dataset, fact 8). It is recorded as `outcome:"write_skipped"` + `failed_pre_write:[…]`.
* **Pre_write abort routing (amendment 1, I-2):**
  * under `*_continue`, the abort is rendered ONLY by `primaryFailureRows`: FAIL + errored for `fail_row_continue`, WARN for `warn_row_continue`;
  * the aggregate `failedPreWrite` is built ONLY from `abort_step` primaries. So `preWriteAbortRows` (:4944-4955, `errored:true` FAIL) never fires for a continue-posture primary, and there is no double report.
* **Never caught, whatever the posture (amendment 2, I-3).** The catch spans post-COMMIT work: `rowConservation` throws after `executeWrite` commits [READ index.js:1283-1290]. So:
  * **`RowConservationError`** is rethrown, detected by `err instanceof require('./conservation').RowConservationError` [READ conservation.js:69, :171];
  * **privilege** failures cannot occur inside the loop, because of the up-front uncaught preflight (§3b). write.js throws a plain `Error` there [READ write.js:1266], so there is no class to test;
  * **the 0fs A3 and G3 refusals** are unreachable, by widened B9;
  * **binding refusals B1–B9 and the X1 export checks** run before the loop.
* **Disagreement, recorded:** the panel asked for a class whitelist covering privilege and A3. Neither throws a distinct class (plain `Error` [READ write.js:1266, index.js:977]). Adding one means two more byte edits in `write.js`/`runIngestPhase`, so the same guarantee is reached structurally (preflight + B9) instead.
* **`primaryFailureRows([ingest])`:** one row per failed primary. It uses the `headErrorRows` idiom [READ :4989-5020]:
  * `metric: "primary_failed:<id>"`, `source: "gate"`;
  * status `FAIL` + `errored: true` for fail_row_continue. A refused acquisition is not a priced anomaly (the `preWriteAbortRows` reasoning, :4935-4940);
  * `WARN` with `errored` absent for warn_row_continue;
  * absent on every healthy run.
* **Status is the existing row-derived cascade** (Rule 10): an unaccepted FAIL ⇒ `FAILED` [READ :5737-5742].
* **HR-D8 status (panel's narrower finding, re-grounded):**
  * in a chain, the step does not own its ledger row (`ownsLedgerRow(chainId)` = `!chainId` [READ ledger.js:48-50]);
  * run-chain stamps `status='completed'` on exit 0 [READ run-chain.js:964-967];
  * a verdict FAIL makes the chain `completed_with_errors` [READ :1068-1072].
  * So chain behaviour matches legacy row 24, and **only the standalone status differs** (`failed` vs `completed`).
  * 0x adds no status override. Heritage ① declares the standalone deviation, and ④b fixes the compute-owned skeleton re-emit.

### (d) skip: per primary only
* Each primary skips independently inside its own call: tier-1/tier-2 against its own sub-prior (heritage DEC-K).
* The aggregate is **never** a runner-level gated skip (`skipped:false` always).
  * Legacy heritage never short-circuits either. A both-skipped run still emits `heritage_load`, all named audit rows, and `records_total` = combined prior feature counts [READ load-heritage.js:700-763].
  * The caller's skip branch would null the counters [:5687] and narrow checks to `pre` [:5354-5364], which would break that parity.
* Zoning's all-or-nothing skip (fact 9) depends on 0y's `package_show` validator source. This plan proposes deferring it to 0y as `skip_scope` (O-1, operator-approved 2026-09-29). 0x ships no field it does not execute (R-AJ).

### (e) aggregate result (the one shape `runWithPool` already reads)
* **`acquired`** = `{ primaries: { [id]: {...perCall.acquired, outcome, reason, signal?, emitBlock?, error?, target} }, head_error }`.
  * `outcome` ∈ `loaded | skipped | write_skipped | failed | not_reached`.
  * `head_error` = the `; `-joined `"<id>: <msg>"` of per-primary head errors, or null. It feeds `headErrorRows` unchanged.
  * `primaries` is ABSENT on every single-primary run, because that run never enters `ingestPrimaries` (0w `lookups` posture).
* **`written`** = numeric fields (`inserted, updated, deleted, rows_scanned, rows_changed`) summed over the loaded primaries, plus `by_target: {table: perCall.written}`.
  * The sums are **0, not null**, when no primary loaded (X8).
  * `written.privilege` exists ONLY under `by_target[table].privilege`, never at the top level (X8). Its readers are the load-ravines and link-* computes [MEASURED grep `privilege` in lib/compute], and none of them is multi-primary.
* **`failedPreWrite`** = the union of the `failedPreWrite` entries of **`abort_step` primaries only**, prefixed `<id>:` (amendment 1). A `*_continue` abort is rendered by `primaryFailureRows`.
* **`writeSkippedPreWriteWarn`/`failedPreWriteWarn`** are aggregated from **ALL** primaries (X3), `<id>:`-prefixed.
  * A skip_write WARN is not a failure, so `primaryFailureRows` never renders it. It is rendered by `preWriteSkipRows` [READ index.js:4976-4984].
  * The primary's outcome is `write_skipped` with NO `failed_pre_write` key.
  * The existing `.find` row helpers render these unchanged.
* **`prior`** = `{ [id]: perCall.prior }`; **`priorError`** = the first non-null.
* **`overrides`** = the first call's (they are step-scoped). **`emitKey`** = `emits[0].key`; **`emitBlock`** = null; **`skipped`** = false; **`reason`** = `"multi_primary"`.
* **The compute assembles the emit** (`heritage_load.{heritage_register,heritage_districts}`) from `acquired.primaries[id]`. The skip sub-block is `primaries[id].emitBlock`, built by acquire.js (fact 4).
* **Counters (amendment 5, I-4):** `deriveCounters` resolves `counters.*` against this aggregate [READ index.js:5686-5689]. On a multi-primary step, any `acquired.<field>` source (e.g. `acquired.feature_count`) resolves to **null**, because the fields live under `acquired.primaries[id]`. `written.inserted/updated/…` sources resolve to the sums. Heritage ② must design its `counters` block knowingly: legacy total = combined `feature_count`, with a skipped dataset carrying its prior count, so the source is compute-derived.
* **The pre_write probe sees `ctx.primary = <id>`** plus that primary's own `acquired`/`prior`. So one check id measures the current primary at the gate, and the final pass sees all primaries (heritage worst-of rows, parent §2 row 19). No per-check scoping field is added.

## 4. Red tests first: three NEW files, each with `// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A18 (0x; RE-FREEZE #29, logged in 122 §8)`
The harness copies the 0w-runner pattern (`fakePool`, `stubsFor`) [READ 0w-runner :25-82, :131-189]. **PIN** = green before the implementation. **RED** = fails before it, with the reason. Fixture `H2` is a heritage-shaped clone of `load-ravines.descriptor.json`: two url'd shapefile primaries `a`/`b`, two writes `ta`/`tb`, `emits[0] = {key:"k", skeleton:{a:{}, b:{}}}`, and **`execution.shape:"ingest"`** (X5).
* The ravines descriptor declares none [MEASURED node: `execution.shape === undefined`]. Without it, rule M2 rejects targeted H2, so T1 and T11 could never go green.
* Fixture `H1x2` (X7) = H2 with ONE write (`ta`) and two url'd primaries, no `target`.

**`ingest-prereq-0x-schema.logic.test.ts`** (brief 0x-0a; AJV as in 0w-acquire :265-290)
* **T1 RED** (unknown property `target`): H2 with `target` on both primaries and `on_failure:"fail_row_continue"` is valid.
* **T2 RED** (X6): each row asserts its SPECIFIC AJV error. Before 0x every row is already rejected via `additionalProperties`, so a bare "rejected" is not RED.
  * `on_failure` without `target` (M1) → `required` / `missingProperty:"target"` at the item path;
  * `target` on `role:"lookup"` (M1) → the `not` keyword at the item path;
  * `on_failure:"skip"` → the `enum` keyword at `/on_failure`;
  * targeted H2 with `execution.shape` DELETED (M2) → `/execution` must have required property `shape`.
  * No row may match only `additionalProperties`.
* **T3 PIN:** the 6 converted INGESTOR descriptors are valid and none declares `target`/`on_failure`.

**`ingest-prereq-0x-runner.logic.test.ts`** (brief 0x-0b)
* **T4 RED** (`ingestPrimaries`/`multiPrimaryBinding` not exported): B1–B9 each throw naming the id, with `acquireExternal` called 0× and `pool.query` called 0×.
  * B7 row: a single primary declaring `target`.
  * B8 row: two externals sharing `id:"a"`.
  * B9 rows (widened, X1): a filesystem+path primary; an http primary that carries a `path` key; an `xlsx` primary. Each sits beside an http primary.
  * X1 export rows: a csv targeted primary with no `compute.shapeRecord`, and a `set_source:"compute"` targeted write with no `compute.buildWriteSql`. Each throws before any `acquireExternal`.
  * Order row (X8): B-refusals and the export checks make 0 `pool.query` calls. A valid H2 makes its first `pool.query` the privilege probe.
* **T4b RED** trigger narrowing (X2):
  * H2 declares a `post_acquisition` trigger scoped `external:"a"` with `hash:"sha256"`, plus an unscoped `pre_acquisition` one;
  * the narrowed descriptor passed for `b` carries only the unscoped trigger;
  * for `a`, it carries both.
* **T5 RED** two targets:
  * `acquireExternal` is called 2× in declared order;
  * `executeWrite` is called 2×, with `plan.table` `ta` then `tb`;
  * `written.inserted` = sum, and `written.by_target` has both keys;
  * `acquired.primaries.{a,b}.outcome === "loaded"`;
  * `skipped === false`.
* **T6 RED** per-primary prior: the stubbed prior read returns `{a:{content_hash:"x"}, b:{content_hash:"y"}}`, and `acquireExternal` receives `prior` `{content_hash:"x"}` then `{content_hash:"y"}`.
* **T7 RED** per-primary skip:
  * `a` skips at tier-2 and `b` loads;
  * `primaries.a = {outcome:"skipped", signal:"content_hash", emitBlock:<acquire's sub-block>}`;
  * `executeWrite` is called 1×;
  * the aggregate has `skipped:false` (ruling d).
* **T7b RED** both primaries skip (amendment 6, legacy parity [READ load-heritage.js:700-763]):
  * the aggregate has `skipped:false`;
  * `executeWrite` is called 0×;
  * `acquired.primaries.a.emitBlock` and `.b.emitBlock` are both present;
  * `written.inserted === 0` and `written.updated === 0` (0, not null — X8);
  * through `runWithPool`, the compute's final ctx sees both emitBlocks and the ledger `records_new === 0` (not null). The caller's skip branch (:5687) is not taken.
  * This assertion was chosen over "counters not nulled" because ravines' `records_total` source is `acquired.feature_count`, which is null on the multi path anyway (ruling e).
* **T8 RED** postures:
  * `fail_row_continue`: `a`'s acquire throws, `b` writes, `primaries.a.outcome === "failed"`, and `primaryFailureRows` gives one `{metric:"primary_failed:a", status:"FAIL", errored:true}`;
  * `warn_row_continue`: a WARN row with no `errored`;
  * absent (`abort_step`): rejects, and `b`'s acquire is called 0×.
  * **never-caught row (amendment 2 + X8):** under `fail_row_continue`, `a`'s `executeWrite` stub returns counts INCONSISTENT with the acquired rows (e.g. `inserted` + `updated` + unchanged < `feature_count`). The real `rowConservation` then throws `RowConservationError` → the call rejects with that class, `b` is not acquired, and there is no `primary_failed` row.
    * `rowConservation` cannot be spied on: index.js:76 destructures it [READ].
  * A privilege-probe rejection under `warn_row_continue` also rejects, before any `acquireExternal`.
* **T8b RED** skip_write under a continue posture (X3):
  * `a`'s pre_write gate returns `skipWrite` under `warn_row_continue`;
  * `primaries.a.outcome === "write_skipped"` with no `failed_pre_write`;
  * the aggregate has `writeSkippedPreWriteWarn === true` and `failedPreWriteWarn` contains `a:<check>`;
  * there is no `primary_failed:a` row.
* **T9 RED** pre_write:
  * the gate is called with `primary:"a"` then `primary:"b"`;
  * an abort on `a` under `abort_step` gives `b` `not_reached`;
  * under `fail_row_continue`, `b` loads;
  * `failedPreWrite` carries the `a:` prefix only under `abort_step`.
  * **Status assertions (amendment 1), through `runWithPool`:**
    * `warn_row_continue` + abort on `a` → there is no `pre_write_gate` row, there is one WARN `primary_failed:a` row, and the status is `completed_with_warnings`;
    * `fail_row_continue` → there is no `pre_write_gate` row, there is one FAIL errored `primary_failed:a` row, and the status is `failed` (standalone);
    * `abort_step` → one `pre_write_gate` errored FAIL row and no `primary_failed` row.
* **T10 PIN** single-primary path:
  * ravines through `runIngestPhase` gets `subKey` undefined and the prior object passed through by identity;
  * `isMultiPrimary(LOAD_RAVINES) === false`;
  * there is no `primaries` key.
  * The untargeted fence (X7): `runIngestPhase` called directly with **H1x2** rejects `/acquires exactly ONE/`. That is the primaries refusal, not the writes one: H2's 2 writes would trip :669 first, and `/exactly ONE/` alone also matches "exactly ONE write target".
  * Fold D's 2-write refusal is covered by its own unedited lock.

**`ingest-prereq-0x-fullrun.logic.test.ts`** (brief 0x-0c)
* **T11 RED** (`runWithPool` never dispatches) `stepLib.step(H2, compute).run({pool, chainId:null, fetch})` (standalone, so the step owns its ledger row):
  * status is `completed`;
  * `pool.sql` shows an `INSERT INTO ta` and an `INSERT INTO tb` in two separate txns (`BEGIN`/`COMMIT` pairs), and one `UPDATE pipeline_runs`;
  * `records_meta.k` comes from the compute.
  * **The compute stub reports EVERY check H2 declares** (X8, the ravines checks inherited by the clone) with a passing observation. Otherwise not-reported rows at their declared severity would fail `completed` for the wrong reason.

## 5. Byte-identical guarantee + recapture (orchestrator, DB free)
* **Same-state differential** (0v/0w/0fs recipe, tree BEFORE vs AFTER, `--compare`): `RAVINE_FORCE_RELOAD=1` load_ravines, address_points, parcels, load_centreline, massing, neighbourhoods. Table hashes and counters must be identical.
* **Recapture OWED** (gate G `lib_fingerprint`, not `fingerprint_inputs`): every POST capture that carries `lib_fingerprint`, each in its own mode, `--compare`d to its predecessor with zero data diff. The whole recapture is ONE folded commit (the `4ea7621e` shape). Forced recipes are the 0fs §5 A9 brackets (ravines env; massing and neighbourhoods R-AS cohorts), run by the orchestrator only.
  * **Set = 24 captures across 9 slugs** [MEASURED: `post/*.json` with `lib_fingerprint`, main + 0fs worktree; the 0fs recapture is mid-flight, 10/24 already at `d5ea5f58…`]:
    * address_points 2;
    * assert_schema 4;
    * link_massing 3 (`permits`, `sources-full`, `standalone`);
    * link_wsib 2 (`permits`, `standalone`);
    * load_centreline 2;
    * load_ravines 3 (`sources`, `sources.forced`, `standalone`);
    * massing 3;
    * neighbourhoods 3;
    * parcels 2.
  * **+ load_wsib POST (2: `sources`, `standalone`) = 26 if wsib ② lands before 0x.** See the sequencing note.
  * Legacy POST captures with no field (e.g. `load_ravines/post/standalone.forced.json`, `link_massing/post/sources-full-forced-1.json`) are `missing`, not `mismatch`, and are not recaptured.
* **Freeze:** `--refresh` then `--check`. The expected diff is `schema_sha256` + `frozen_at` (fact 10). `generate-schema-baseline.mjs --check`: 0fs found `inputs.reads` item additions `--check`-clean with no `--write` (0fs fact 11). Re-verify at landing.

## 6. Engine briefs (`.cursor/engine-briefs/0x-*.md`; not yet written)
Rules for every brief:
* each <4.5 KB;
* `write_scope` = the one file it edits;
* a `## Gate answers` section;
* STOP BEFORE COMMIT;
* one `edit_file` anchored edit per brief (both targets are >200 lines);
* every anchor counted 1 in the POST-0fs tree [MEASURED `node -e split` 2026-09-29]. Re-count after 0fs lands.

| # | Brief | File | Anchor (verbatim) / scope |
|---|---|---|---|
| 1 | `0x-0a-red-schema.md` | NEW `src/tests/ingest-prereq-0x-schema.logic.test.ts` | T1–T3 |
| 2 | `0x-0b-red-runner.md` | NEW `…-0x-runner.logic.test.ts` | T4–T10 |
| 3 | `0x-0c-red-fullrun.md` | NEW `…-0x-fullrun.logic.test.ts` | T11 |
| 4 | `0x-1a-schema-fields.md` | step.schema.json | `                  "key_property": {` → insert `target` + `on_failure` before it |
| 5 | `0x-1b-schema-item-rule.md` | step.schema.json | the allOf entry containing `"x-rule": "0fs converse (G2): a filesystem external is always path-bearing` → append rule M1 after it |
| 6 | `0x-1c-schema-toplevel.md` | step.schema.json | `      "x-profile": "INGESTOR — write_discipline + retract + replay` → insert rule M2 before its enclosing `{` |
| 7 | `0x-2a-binding.md` | index.js | `/**\n * The ACQUIRE → VALIDATE → WRITE phase (ruling A-1(b)).` → insert `isMultiPrimary` + `multiPrimaryBinding` before it |
| 8 | `0x-2b-ingest-primaries.md` | index.js | same anchor → insert `ingestPrimaries`: X1 export pre-checks, privilege preflight, X2-narrowed loop, posture catch + never-caught rules (rulings b, c) before it (lands after 2a) |
| 8′ | `0x-2b2-aggregate.md` | index.js | same anchor → insert the pure `aggregatePrimaries(results)` helper (ruling e, incl. X3/X8) before it. `ingestPrimaries` returns `aggregatePrimaries(…)`. Pre-split from brief 8 so each stays <4.5 KB |
| 9 | `0x-2c-failure-rows.md` | index.js | same anchor → insert `primaryFailureRows` before it |
| 10 | `0x-2d-subkey.md` | index.js | `async function runIngestPhase({ descriptor, pool, compute, config, fetchImpl, chainId, log, tag, clockNow, preWriteGate, ownRunId }) {` |
| 11 | `0x-2e-prior.md` | index.js | `  const { prior, error: priorError } = await staleness.readPriorEmitWithPosture(\n    pool, ledgerPipelineName(descriptor, chainId), emitKey, posture,\n  );` |
| 12 | `0x-2f-cf3-text.md` | index.js | `Multiple primaries are a runtime refusal, not a schema cap (Fold CF-3): 3.4 load_heritage lifts this throw by binding each primary to its own write target.` |
| 12a | `0x-2f1-cf3-comment.md` | index.js | `  // plus an enum churn. As a named runtime refusal it is lifted by deleting these four` → reword the CF-3 block :687-694 (amendment 4) |
| 12b | `0x-2f2-writes-header.md` | index.js | `  // empty, with a green verdict over it. The multi-target loop is real work (one txn or` → append the `ingestPrimaries` pointer to that comment block (amendment 4) |
| 13 | `0x-2g-dispatch.md` | index.js | `        ingest = await runIngestPhase({` |
| 14 | `0x-2h-rows.md` | index.js | `        ...headErrorRows([ingest]),` → add `...primaryFailureRows([ingest]),` after it |
| 15 | `0x-2i-exports.md` | index.js | `  headErrorRows,\n` → add `isMultiPrimary, multiPrimaryBinding, ingestPrimaries, aggregatePrimaries, primaryFailureRows,` |

Brief 12 now carries TWO anchors: the :730 message sentence and the CF-3 comment block at :687-694 (`  // plus an enum churn. As a named runtime refusal it is lifted by deleting these four`). It is split into `0x-2f-cf3-text.md` (message) and `0x-2f1-cf3-comment.md` (comment), keeping one edit per brief. **Total: 18 briefs** (brief 8 pre-split into 8 + 8′, X8).
**Windowed reads:** index.js is 354,833 B [MEASURED wc -c], above the engine's 256 KB read cap. Every index.js brief must direct `read_file` with a line window around its anchor (the 0fs precedent).
**Brief rule (amendment 7):** no new function in index.js may be named `run…`. `runnerRanges` matches `^async function (run\w+)\(` [READ generate-template-freeze.mjs:344; the panel cited :343], so a `run`-prefixed helper would open a phantom runner range. The new names are `isMultiPrimary`, `multiPrimaryBinding`, `ingestPrimaries`, `aggregatePrimaries`, `primaryFailureRows`.
Gate answers (all briefs):
* no logic variable, check, `emits[]` key, counters source or `write_discipline` is set, so gates A/B/C/D are N/A;
* gate E: no compute file is touched;
* the only new declared fields are schema `externals[].target` and `externals[].on_failure` (both `x-ruling`, `on_failure` `x-frozen`).

## 7. Execution Plan
- [ ] 0fs lands (RE-FREEZE #28). Re-count all 18 brief anchors and re-cite the §1 lines on the landed tree.
- [x] Lean PLAN panel (Integration + Regression Guardian + DeepSeek lens, as actually run) → amendments 1–7 folded (Fold log). Cross-read Adversary X1–X8 folded (Fold log 2).
- [ ] Briefs 1 → 15 (incl. 8′, 12a, 12b; 18 total) on one uncommitted tree (`--max-iterations 40`). Red evidence = the 0a–0c vitest JSON before brief 4.
- [ ] Landing, in order:
  1. Diff + x-ruling review.
  2. Freeze `--refresh`/`--check`.
  3. Baseline `--check`.
  4. `schema-to-vocab.mjs` + `--check`.
  5. `npm run system-map`.
  6. Spec 122 §8 `**RE-FREEZE #29 — externals[].target + on_failure (multi-primary INGESTOR, 0x):** … detail 122a §A18.` + §A18.
  7. `spec-split-check --check`.
  8. §5 differential.
  9. §5 recapture.
  10. `step-validate --all --write`.
  11. Focused vitest (the §2 TESTS rows).
  12. `step-validate --all --fast` (#39 fresh), typecheck, lint. Pre-push runs the full `npm run test` (1 fork).
- [ ] Commit (orchestrator): `feat(122_pipeline_step_optimization): multi-primary INGESTOR — externals[].target + on_failure (INGESTOR prerequisite 0x, RE-FREEZE #29)` + trailer.
- [ ] OUTPUT: Regression Guardian; Code Reviewer grounded; Observability (the `primary_failed` rows, the aggregate `acquired` contract); **Idempotency Lens** (X4, moved here from the plan roster, where it never ran). It covers per-target txns, a two-run replay of H2 (run 2 = zero writes on both targets), and a crash between target 1's COMMIT and target 2 (next run forced via step-scoped `recovery.interrupted`).

## Standards Compliance
* **Try-Catch Boundary:** one declared-posture catch per primary call (only under `*_continue`), logged with `log.error` and rendered as a row. Every binding error is a named throw before I/O.
* **Unhappy Path Tests:** B1–B9, never-caught RowConservationError, a throw under each posture, a pre_write abort under each posture, a HEAD error inside one primary, a per-primary skip.
* **logError Mandate:** N/A (`scripts/lib/step` uses `log.*`). **UI Layout:** N/A.
* **§11:** no API/UI/migration; no new tunable; row-derived verdict (Rule 10); `x-ruling` on both fields.

## Open items / surprises vs parent §4
* **O-1 (scope cut) — panel: ACCEPT — operator APPROVED 2026-09-29 ("y").** Parent D1 (a) named three axes. 0x ships two: `target` and `on_failure`.
  * The skip-scope axis collides by name with the required `staleness.scope` (fact 6).
  * It also cannot be designed before 0y: zoning decides from `package_show`, before any HEAD (fact 9).
  * **Correction (X4):** zoning's plan puts `skip_scope:"all_primaries"` under **0x**, not 0y. See row 3 [READ batch2_load_zoning:78], row 4 "library skipEmit … generalised in 0x" [:79], and the §4 0x bullet [:115].
  * Accepting the cut therefore moves the field to 0y, and the zoning plan must re-point: rows 3, 4, 6, 8 and the §4 0x bullet :115. The zoning plan is NOT edited here.
  * Recommendation: accept the cut.
* **O-2 (HR-D8) — panel: ACCEPT, re-scoped (the panel's narrower finding, re-grounded in §3c).**
  * In the `sources` chain, run-chain stamps `completed` on exit 0 and rolls the chain up to `completed_with_errors`, which is parity with legacy row 24.
  * Only the standalone status differs (`failed` vs `completed`).
  * There is no status override in 0x (Rule 10). Heritage ① declares the standalone deviation, and ④b fixes the compute-owned skeleton re-emit.
* **O-3 (vocabulary) — panel: ACCEPT `on_failure`.** Zoning's plan says per-target `required:true|false` [READ batch2_load_zoning:81]. A boolean cannot express heritage's FAIL-continue.
  * **Zoning plan rows 6 AND 8 need re-pointing** (plus rows 3, 4 and §4 :115 for `skip_scope`, O-1): row 6 base=`abort_step`, overlays=`warn_row_continue`; row 8 "0x routes the throw by `required`" [READ :83] → by `on_failure`.
  * The zoning plan is NOT edited here.
* **O-4 (drift):**
  * parent cites `index.js:641-645` and `:650`; post-0fs these are :668-673 and :720;
  * the parent names the plan file `wf2_ingest_prereq_0x_multi_primary_active_task.md`; this is `wf2_ingest_prereq_0x_active_task.md`;
  * the parent says "RE-FREEZE next free after 0w", which is now **#29** (0fs took #28).
* **O-5 (re-grounded, X4 — no longer a seat dependency):** per-primary prior reads mean N `pipeline_runs` reads per run, where there used to be 1. They cannot race the other primary's write:
  * the read selects `status = 'completed' ORDER BY started_at DESC LIMIT 1` [READ source-version.js:140-141];
  * this run's own ledger row is still `running` until the `finally` finalize (panel: open :5173 / finalize :5874);
  * a primary's commit writes only its target table, never `pipeline_runs`.
  * Both primaries therefore read the same prior row.
* **Sequencing (for the orchestrator):** 0x can land BEFORE load_wsib ② POST, so wsib captures once:
  * wsib uses no 0x field (single primary, 0fs `path`);
  * 0x's two `runIngestPhase` edits are identity-preserving when `subKey` is undefined (T10);
  * gate G reads POST captures only (fact 12). PRE captures do carry `lib_fingerprint` (`neighbourhoods/pre` 7aa5f2c5, `load_centreline/pre` e011cea9, while its post is 7aa5f2c5) [MEASURED], but no gate reads them, and centreline already landed with PRE≠POST fingerprints. So wsib ① (PRE + red suite) is independent of 0x;
  * no `docs/reports/golden/load_wsib/` exists yet [MEASURED ls].
  * Cost if 0x slips behind wsib ②: +2 captures (26) plus a second `is_gta` restore bracket (wsib plan §7 step 3).

## Fold log (2026-09-29, lean panel: Integration + Regression Guardian + DeepSeek lens — READY-WITH-AMENDMENTS)
| Id | Disposition | Evidence (re-executed by this seat) |
|---|---|---|
| 1 (I-2) | folded: continue-posture pre_write aborts → `primaryFailureRows` only; `failedPreWrite` from `abort_step` primaries only; T9 status asserts | `preWriteAbortRows` errored FAIL [READ index.js:4944-4955]; WARN→`completed_with_warnings` cascade [READ :5743-5744] |
| 2 (I-3) | folded **with disagreement**: `RowConservationError` rethrown by `instanceof`; privilege by an uncaught up-front preflight; A3 made unreachable by the new B9; B-refusals are pre-loop. There is no class whitelist for privilege/A3, because both throw a plain `Error` and a class would add 2 more byte edits. T8 row added | post-COMMIT `rowConservation` [READ :1283-1290]; `RowConservationError` exported [READ conservation.js:69, :171]; privilege `throw new Error` [READ write.js:1266]; A3 throw [READ index.js:976-979] |
| 3 | folded: B7 (≥2 primaries), B8 (unique ids), + B9; T4 rows | `externals.uniqueItems` undefined [MEASURED node]; no id-uniqueness grep hit in validate.js [MEASURED] |
| 4 | folded: brief 12 split into 12 (message) + 12a `0x-2f1` (CF-3 comment :687-694); new brief 12b (writes header :660-667) | both anchors count 1 [MEASURED node split, post-0fs tree] |
| 5 (I-1, I-4) | folded: privilege text corrected; counters note in (e) | `guards.requires` loop [READ write.js:1250-1252]; `deriveCounters` over the aggregate [READ index.js:5686-5689] |
| 6 | folded: T7b | legacy both-skip still emits + carries counts [READ load-heritage.js:700-763] |
| 7 | folded: brief rule, no `run…` names | [READ generate-template-freeze.mjs:344] |
| D1(a) | panel ACCEPT — **operator APPROVED 2026-09-29** | §O-1 |
| HR-D8 | panel ACCEPT, re-scoped (standalone-only divergence) | ledger.js:48-50; run-chain.js:964-967, :1068-1072 [READ] |
| on_failure | panel ACCEPT; zoning rows 6 + 8 to re-point (not edited) | batch2_load_zoning:81, :83 [READ] |
| DeepSeek refutations (8) | accepted as refuted by the panel; not re-litigated | panel report |

## Fold log 2 (2026-09-29, Cross-read Adversary + grounder: READY-WITH-AMENDMENTS X1–X8)
| Id | Disposition | Evidence (re-executed by this seat) |
|---|---|---|
| X1 | folded: B9 widened (url-bearing, no `path` key, not xlsx) + a lift-returns-A3/G3 sentence; pre-loop csv⇒`shapeRecord` and set_source compute⇒`buildWriteSql` checks; T4 rows. Guardian's "whole-descriptor refusals fire on the first call" is corrected: the narrowed clone carries `[external]` only | index.js:708-720 loop over `descriptor.inputs.reads.externals` (narrowed); :777 csv check; :900-907 buildWriteSql [READ] |
| X2 | folded: `staleness.trigger` narrowed per primary (own id or unscoped); T4b | `triggersAt` position-only filter [READ staleness.js:87-90]; `hash` from `[0]` [READ acquire.js:839] |
| X3 | folded: skip_write aggregated from ALL primaries; outcome `write_skipped` without `failed_pre_write`; T8b | `preWriteSkipRows` [READ index.js:4976-4984] |
| X4 | folded: O-1 corrected (zoning puts `skip_scope` under 0x; re-point rows 3, 4, 6, 8 + §4 :115); the never-run Idempotency Lens is removed from the plan roster and added to OUTPUT; O-5 re-grounded, no seat dependency | batch2_load_zoning:78, :79, :115 [READ]; source-version.js:140-141 `status='completed'` [READ] |
| X5 | folded: H2 declares `execution.shape:"ingest"`; the T2 M2 row deletes it | `load-ravines.descriptor.json` `execution.shape` undefined [MEASURED node] |
| X6 | folded: every T2 row asserts its specific AJV keyword; none may match only `additionalProperties` | item `additionalProperties:false` (fact 7) |
| X7 | folded: T10 fence uses 1-write/2-primary `H1x2` and matches `/acquires exactly ONE/` | writes refusal :669 precedes primaries :723 [READ]; "exactly ONE write target" text :670 |
| X8 | folded: order binding → export checks → privilege preflight → loop; T7b `records_new === 0` + zero sums; T8 via an inconsistent `executeWrite` stub; T11 stub reports every check; (e) `written.privilege` only under `by_target`; brief 8 pre-split (8′); windowed-read note | index.js:76 destructures `rowConservation` [READ]; `privilege` readers = load-ravines + 4 link computes [MEASURED grep]; index.js 354,833 B [MEASURED wc] |
| D1(a) | operator APPROVED 2026-09-29 | §O-1 |
| T11 chain | folded (coordinator ruling): T11 runs `chainId:null` (standalone owns the ledger row, so the `UPDATE pipeline_runs` assertion holds); same finding and fix as 0fs T7c | `ownsLedgerRow = !chainId` [READ ledger.js:48-50] |
