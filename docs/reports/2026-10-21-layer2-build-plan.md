# Layer 2 build plan: `resolve_bylaws` (Spec 134)

Lane `layer2-build-1`, branch `wf2/layer2-build-1` from `ee5ed572`, 2026-10-21. Operator instruction 2026-10-21: "y proceed" (start building Layer 2).

**What this document is.** A build plan for the step Spec 134 specifies, and the drafted rulings for every question Spec 134 leaves open. It decides nothing. Where this plan and Spec 134 differ, Spec 134 governs (its own source rule, 134:9). The registers stay the authority: Spec 124 / 124a for the step, Spec 69 / 69a for the by-law readings (Spec 124 R-GV).

**Standards.** The step is a new pipeline step, so it complies with Spec 132 (the step handbook) and is born V3 (Spec 124 R-DF, R-EY; Spec 134 §8). The by-law side complies with Spec 68 and 69 / 69a.

**Rulings this plan builds on** (all operator-approved 2026-10-20 on the review page, decision log `docs/reports/decisions/2026-10-20-scenario-build-rulings.json`, routed by `decision-log.mjs`):

| Decision | Register row | What it fixes |
|---|---|---|
| R-1 | Spec 69a M-234 (69a:380) | v1 scope: the P5.3 targets × the Phase-5 classes (incl. house + secondary suite, garden suite, laneway suite); base zones + authored exceptions; full rescan; no incremental L2-CHANGE |
| R-2 | Spec 124 R-GY (124:254) | Spec 134 owns the step |
| R-3 | Spec 124 R-HB (124:257) | archetype MATERIALIZER (the rows form and reset posture are design defaults, not ruled) |
| R-4 | Spec 69a M-231 (69a:377) | an unauthored exception gates the whole lot, written per target, before `effective()` |
| R-5 | Spec 69a M-232 (69a:378) | two closed status sets joined by one declared total map, `layer2-map.json`, locked both ways |
| R-6 | Spec 69a M-233 (69a:379) | structures: principal + garden suite + laneway suite; storage measured against Spec 78 §6.8's kill line |
| R-7 | Spec 124 R-HC (124:258) | net-new under R-DK; no R-AS |
| R-8 | Spec 124 R-HD (124:259) | chain `sources`, after `enrich_parcels`, before `link_parcel_abutments` and `compute_maxbld_scenarios` |
| CHAT-2 | Spec 124 R-HL (124:267) | front-yard averaging stays in the scenario step; Layer 2 does not read `parcel_abutments` |

---

## 1. What Layer 2 produces

From Spec 134 §3 (134:40-50), not invented here. The **logical** row shape is the contract (134:40: *"the logical row shape is the contract the scenario step builds against"*); the **physical** split into three tables is fixed at ① from the P2-0 measurement (134:159, open).

| Table (planned, 134:44-46) | Key | Columns Spec 134 names |
|---|---|---|
| `bylaw_resolution_cells` (signature row) | `(cell_id, target)` | `candidates[]`, `winner_unit_id`, `winner_layer`, `losers[]` (`dropped_by`), `status`, `reason`, `value`, `value_kind` (number · unlimited · unregulated), `evidence_kind` (clause · absence · provincial), `evidence_ref`, `inputs_used`, `by_class` (only the classes that differ; the rest `collapsed_into`) |
| `bylaw_resolution_structures` (structure row) | `(cell_id, target, structure)` | the signature pointer, `structure` (principal · garden_suite · laneway_suite), and only the fields where this structure differs: `status`, `reason`, `value`, its own winner or condition values |
| `bylaw_resolution_lots` (lot link row) | `parcel_id` | `cell_id`, `inputs_hash`, `lot_gate`, `applied_values`, `inputs_defaulted` |

On every row (134:48-49): `table_version`, `evaluator_version`, `row_sha` (sha256 over the canonical result columns, recomputed by SQL every run, I14), and the nullable `chain_run_id` (Spec 124 R-U). Write guard: `IS DISTINCT FROM` over the result columns only; `chain_run_id`, `table_version`, `evaluator_version` and timestamps are outside it (134:48). The step writes nothing else, never `parcels` (134:24, Spec 69a M-25).

Two things Layer 3 reads are **not** in this row shape; they are drafted as OQ-9 (§6).

## 2. Inputs and declared reads

| Input | Kind | Source (Spec 134) | Declared as |
|---|---|---|---|
| `parcels` | table, the paged source | 134:33, one narrow scan, never an UPDATE: zone string, exception number, label letters (R-LABEL), `zoning_is_ambiguous`, lot metrics, the Spec 78 P5.3 lot columns | `inputs.reads.tables[]` with explicit `columns`; `execution.materialize_source` (R-EH) |
| `bylaw_map_areas` | table, read once | 134:33 (membership) | `inputs.reads.tables[]`, `role: "lookup"` (RE-FREEZE #37) |
| `docs/reference/bylaw-provisions.json` | file | 134:32 (`table_version` = its content hash); guard 134:82 | see OQ-1: the rows arm has no file input today |
| `scripts/analysis/bylaw/evaluate.mjs` + `dsl.mjs` | code, imported | 134:31 (`effective()`, `permitted()` only), 134:32 (`evaluator_version`) | compute closure (gate E); R-DET extension (prerequisite, 134:105) |
| `scripts/seeds/bylaw/vocab.json` | file | 134:35 (`scenario_class_units`, M-160); `vocab.version` in the skip predicate (134:81) | OQ-1, OQ-7 |
| `scripts/seeds/bylaw/layer2-map.json` | file (planned) | 134:58 | OQ-4 |
| `scripts/seeds/bylaw/absence-rulings.json` | file | I2 (134:85) | OQ-1 |
| logic variables `resolve_bylaws_*` | `logic_variables` rows | 134:96: population, conflict max, equivalence budget and rotation, storage budget, class cap | `config`, seeded by migration (Spec 132 core.8) |

**Not read:** `parcel_abutments` (134:34, R-HD, R-HL). A read of it is a cross-step order defect.

## 3. Archetype and descriptor shape

- **Archetype:** MATERIALIZER (Spec 124 R-HB, 124:257). Spec 132 materializer.1: *"`recovery.reset` is not none. `materialize_form` is `insert_select` or `rows`"* (132:274).
- **Descriptor (design defaults from 134:79-97, not ruled by R-HB):**
  - `identity`: `name: "resolve_bylaws"`, `archetype: "MATERIALIZER"`, advisory lock assigned at ① (Spec 47, 134:7), owner spec 134 in the census row (`legacy: "none"`, `owner_specs: [134]`).
  - `execution`: `shape: "materialize"`, `materialize_form: "rows"`, `materialize_source: { table: "parcels", key: <the keyset column> }`, `batch_size_from_config`. The rows arm needs the pure exports `buildSourceSql` and `materializeRows` and refuses `buildMaterializeSql` (`scripts/lib/step/index.js:3353-3358`); it pages the source by keyset and hands each batch plus the `role: "lookup"` reads to `materializeRows(batch, { config, run_at, descriptor, lookups })` (index.js:3433).
  - `outputs.writes[]`: the three tables, each a rows-arm target. The arm accepts only three kinds: a `guarded_upsert`, a `link_full_retraction` with `retract: "replace_keys"`, or a `set_based_scoped` with `rows: "compute"` (index.js:3366-3378). Signature rows shared by lots in different batches are idempotent `guarded_upsert` rows.
  - `recovery.reset`: truncates the three tables (134:79, design default).
  - `staleness`: `mode_select: "none"` with a `full_rescan` invalidator; a `when: "pre"` skip predicate over the upstream pins, `table_version`, `vocab.version`, `evaluator_version`, the population-variable hash and the class-catalogue sha (134:81).
  - `guards.requires`: `bylaw-provisions.json` present at a recorded `table_version`; `declared_logic_variables_present` (134:82).
  - `checks[]` / `invariants[]`: I1–I15 and the two WARNs (134:83-95); SQL ones as `invariants[]`, JS ones compute-dispatched with their own budget variable.
  - `terminals` and `records_meta`: as listed at 134:97.
- **When the descriptor exists.** At ① the step is `pending` at `red_suite` with **no descriptor file** (Spec 124 R-K.1, R-DV; 134:122). The descriptor file lands with slice (b), moving the stage to `descriptor_only` (Spec 132 x-stages.1).

## 4. Build slices, in order, each red-first

Every slice commits its failing tests (with a gate-K red-evidence artifact under `docs/reports/red-evidence/resolve_bylaws/`, which R-DK item 4 also needs) before the code that turns them green. Pre-commit runs `vitest related`, so a red test is committed as `it.fails` with its JSON artifact, and the implementation commit flips it to `it` (the bylaw-fix-3 precedent, 69a M-242).

| Slice | Contents | Red-first test | Waits for |
|---|---|---|---|
| **(a) pure resolution functions** | The pure, I/O-free functions of the compute module (`scripts/lib/compute/resolve-bylaws.js`, Spec 134 Target Files): built ahead on fixtures, as Spec 134 node N6a does for the scenario step. **Built in this lane:** the M-231 lot-wide exception gate, the per-target gated rows, the gate-before-evaluator order, `value_kind`. **Waiting on rulings:** the lot-vector builder (OQ-6, OQ-11), status mapping through `layer2-map.json` (OQ-4), evidence mapping (OQ-5), class collapse (OQ-7), `cell_id` and `inputs_hash` (OQ-3), the scope catalogue (OQ-8) | `src/tests/steps/resolve_bylaws/resolution.logic.test.ts` | nothing for the built part |
| **(b) descriptor + notes** | the census row, `converted.json` pending at `red_suite`, admin entries (R-DL, R-DV); then the descriptor file and its notes (`descriptor_only`); the logic-variable names | `violations.test.ts` (the step suite), `admin-step-registration.logic`, `step-validate-net-new.logic` | OQ-1, OQ-8, OQ-10 (the descriptor must name the file inputs, the scope pin and the reset arm) |
| **(c) migration** | one migration creating the three tables empty with indexes and closed-column CHECKs generated from `layer2-map.json`; the `resolve_bylaws_*` seed rows; DOWN drops the tables; `LARGE_TABLES` at landing (134:50) | a `*.db.test.ts` arm per CHECK; `validate-migration`; schema-baseline | OQ-3, OQ-4, OQ-9, and the physical split (134:159, fixed from P2-0) |
| **(d) runner wiring** | the shell `scripts/resolve-bylaws.js` → `pipeline.step(descriptor, compute)`; `buildSourceSql`, `materializeRows`, `finalizeMatched`; the checks; the manifest slot at ③ (R-HD) | `violations.test.ts` arms I1–I15, R-SKIP, the reset arm, G-EXC-LIT, the structure set (134:126) | (b), (c), OQ-10; the Spec 134 prerequisites (`losers[]`, R-EMIT, R-DET, R-LABEL, P2-0; 134:121) |
| **(e) golden captures** | the POST capture with the `delete_reinsert` bracket keyed `parcel_id` (R-DP); rerun-zero; `recapture.json`; the storage check against `resolve_bylaws_storage_budget_mb` (134:74); a local full run timed against `execution.budget` | gate K, #38, G8 against its own POST (R-DK) | (d); a DB window (the dblock); P2-0 |
| **(f) V3 admission table** | the R-DF six-part table of 134:103-110 filled with each lock's file and its green run; `standard=V3` printed by `step-validate` (R-EY, nine conditions, fail closed) | `step-validate --step=resolve_bylaws --fast` reads V3 | (a)–(e) |

## 5. What Layer 3 needs from Layer 2

`compute_maxbld_scenarios` reads only Layer 2 rows (Spec 78 D-1, 78:693; Spec 134 §10). From the lineage registry (`docs/reference/maxbld-field-lineage.json`) and the report schema (`scripts/surfaces/_schema/report-v2.decl.json`):

1. **Per parcel × class × target × structure, a Layer 2 status and value.** 20 lineage fields carry the owed entry *"Layer 2 resolution rows for the P5.3 targets, per class (D-1)"*; their `keyed.layer2_targets` name 32 distinct targets (e.g. `height_m`, `fsi`, `lot_coverage_pct`, `front_setback_m`, `building_depth_m`, `separation_m`, `roof_slope_max`, the share tiers and the attic test).
2. **The status in the §5a part 3 form.** The `*_status` fields are *"`applies:<value>` / `not_applicable:<clause>` / `undecided` / `not_evaluated:<reason>`"* (Spec 78:1086-1088), and Layer 3 maps them to its §11.1 field status through `layer2-map.json` (M-232).
3. **`value_kind`** (`unregulated` / `unlimited` reach the field status `unregulated:<clause>` / `unlimited:<clause>`; Spec 78 `main_depth_cap_m` null when unregulated).
4. **The winner unit ids**, for `cited_clauses` (*"Layer 1 unit ids applied, sorted"*, lineage).
5. **Carried Layer 2 disclosures**, for `disclosures` (*"P5.12 codes + carried Layer 2 disclosures, sorted"*, lineage). Not in the §3 row shape: OQ-9.
6. **`permitted()` per class**, for `scenario_status` (`permitted` / `not_permitted:<clause>`; Spec 134 §2 runs `permitted()` per class). Not in the §3 row shape: OQ-9.
7. **The lot gate reason**, propagated per target (Spec 78 P5.1 gate 3: *"Layer 2's per-target `not_evaluated:exception_not_authored` propagates"*).
8. **`by_class` with `collapsed_into`**, so the scenario step can read a collapsed class's values from its representative.
9. **`table_version` and `evaluator_version`**, which become the scenario row's `layer2_table_version` and `evaluator_version` (lineage; admin-only in the report schema).
10. **A frozen row shape at ①** (134:153), so node N6a's pure modules can be built on fixtures now.

## 6. Open questions Spec 134 leaves unsettled (drafted for the operator; not decided)

Each question gives a recommendation, a conflict check and the seven-question V3 table (Spec 124 R-DF; the seven questions, EXTERNALIZED included). None is applied in this lane. The two §11 questions already open in Spec 134 (the physical split, 134:159; `undecided` before M-60, 134:160) are not repeated; OQ-4 only adds the mapping rows they leave.

### OQ-1. How Layer 1 reaches the pure compute module

**Question.** Spec 134 says the evaluator's inputs are `bylaw-provisions.json` (hashed as `table_version`, 134:32) and the evaluator code. But `effective()` needs the agreed units with their DSL statements, the displacement links, the evaluator vocab, the enactment dates, the absence rulings and the per-exception authoring state. The real-lot assembly builds them from the authored shards, `adjudications.json`, `vocab.json`, `external.json` and the page snapshot (`scripts/analysis/bylaw-validation/assembly.mjs:9-33`). `bylaw-provisions.json` rows carry only `unit_id` and `sha256` per unit, no statements. The compute module must be pure (no fs, gate E), and the rows arm hands compute only the source batches and the `role: "lookup"` table reads (`scripts/lib/step/index.js:3385-3433`). So where does the compute get its units and context, and what does `table_version` hash?

**Recommendation.** (1) The shell builds the Layer 1 assembly once per run with the existing `loadRealLotAssembly` (one shared function, so Layer 2 and the golden-lot tests cannot drift) and hands it to compute through a declared, hashed descriptor input. That needs one runner addition: a `kind: "filesystem"` external read under the rows arm, handed to `materializeRows` as a lookup. It is a runner change, so it is its own Spec 124 row. (2) `table_version` hashes the assembly's input files (shards, adjudications, vocab, external, absence rulings), or the generated `bylaw-provisions.json` only if its generator is proven to change whenever any of them does. A `--check` lock decides which.

**Conflict check.** Spec 134 §2 (134:31) *"No Layer 2 code reads provision rows except through these two functions"*: no conflict, because the assembly hands the evaluator its candidate set, which the evaluator itself loads (`loadCandidates`, EV:632). Spec 134 134:32 *"`table_version` = content hash of `docs/reference/bylaw-provisions.json`"*: conflicts if that file does not cover the shards and adjudications. This would amend 134:32 by a register row. Spec 132 core purity (132:§1, *"Compute … never … reads the environment"*): kept; the shell reads, compute receives.

| Question | Answer |
|---|---|
| STANDARDIZED | one assembly function, shared with the golden-lot helper |
| OBSERVABLE | the run row records `table_version`; a lock asserts that the hashed inputs equal the assembly's reads |
| RECORDED | a Spec 124 row for the runner input; a Spec 134 amendment row |
| SCALABLE | one load per run, not per batch |
| ACCURATE | a unit change always changes `table_version`, so the skip never serves stale law |
| SIMPLE | reuses `loadRealLotAssembly` unchanged |
| EXTERNALIZED | Layer 1 stays data in the tree; no unit or list in code |

### OQ-2. Where the M-231 gate gets the INCLUDE closure and "fully authored"

**Question.** M-231 gates a lot whose exception, *"or any exception in its INCLUDE closure"*, is not fully authored, *"before `effective()`"*. Computing the closure means reading the exception units' INCLUDE links. But Spec 134 §2 (134:31) forbids Layer 2 from reading units except through `effective()` / `permitted()`. M-231's EXTERNALIZED answer says authorship *"is read from `bylaw-provisions.json`"*, while the evaluator's own gate reads `ctx.authored`, built by the assembly from the G-AGREE outcome (assembly.mjs:21-31; EV:125-127). The evaluator's gate is **per target**: a `partial` exception passes for its listed targets (EV:929-944; `bylaw-rulings.logic.test.ts` "partial authorship resolves exactly the listed targets"). M-231's gate is **lot-wide**.

**Recommendation.** Ask the by-law fix lane, the single writer of `evaluate.mjs`, for one additive pure export `exceptionClosure(lot, candidates)`. It returns the ordered closure the evaluator already walks (EV:936-944), red-first. Spec 134 §2 then names it as the third permitted reader. "Fully authored" is the assembly's `authored[id] === 'authored'` (or `{status: 'authored'}`), the same outcome the evaluator reads, so there is one source. Slice (a) already takes the closure and the authored map as inputs (§7), so either answer plugs in without changing it.

**Conflict check.** 134:31 (the two-function rule): this answer amends it by one function, through a row. M-231 EXTERNALIZED (69a:377, *"authorship is read from `bylaw-provisions.json`"*): conflicts unless OQ-1's hash covers the authoring state. Spec 68 §7.6 (the evaluator stays pure): kept, because the export is pure. Out-of-Scope Files (134: `evaluate.mjs`): kept, because the change lands in the by-law lane, not here.

| Question | Answer |
|---|---|
| STANDARDIZED | one closure walk, the evaluator's own |
| OBSERVABLE | I4 / I6 count gated lots live; a lock compares the export with `loadCandidates`' INCLUDE log |
| RECORDED | a 69a dated note under M-231; a Spec 134 §2 amendment row |
| SCALABLE | per exception id; no list |
| ACCURATE | Layer 2 and the evaluator can never disagree on the closure |
| SIMPLE | one function |
| EXTERNALIZED | the closure and authorship come from Layer 1 data |

### OQ-3. What `cell_id` and `inputs_hash` are

**Question.** Spec 134 keys the signature row on `cell_id` (134:44) and says `inputs_hash` *"covers exactly the dependency closure of the candidate units"* (134:33, P2 L14). It does not define `cell_id`. P2's L14 key (zone string, exception, HT/ST/LC values, lot flags, bands) is a PLANNED `cell-key.json` (P2 §A L14). `scripts/analysis/bylaw/cell-cache.mjs` already keys an evaluation by (candidate set, target, the values of the lot inputs the result read), transparency-locked by `bylaw-cell-cache.logic.test.ts`.

**Recommendation.** `cell_id` = sha256 over the candidate-set signature (sorted `unit_id` + unit sha) and the canonical tokens (`cell-cache.mjs` `inputValue`) of every lot input in the union of `inputs[]` that the targets' results read. `inputs_hash` = sha256 over the same tokens for the lot. This reuses the cache's proven keying and its mutation test. I12 (equivalence) is the runtime witness. P2-0 (a) measures the distinct-cell count before ①.

**Conflict check.** P2 L14 (a static closure key): replaced by the result-read key. That is stricter, because it includes condition reads (M-60(d)). Spec 134 I12 (134:92): supports it. Spec 68 §10 (determinism): kept.

| Question | Answer |
|---|---|
| STANDARDIZED | one key function, the cell cache's |
| OBSERVABLE | I12 rotating equivalence; I9 lineage |
| RECORDED | a Spec 134 row; the P2-0 record |
| SCALABLE | rows = distinct signatures, measured |
| ACCURATE | the key covers every input the result read, so two lots in one cell get the same law |
| SIMPLE | reuses `inputValue` |
| EXTERNALIZED | no literal key list in code; the key is what the evaluator reports it read |

### OQ-4. The form of `layer2-map.json`, the status columns, and the rows Spec 134 leaves unmapped

**Question.** (i) The map's file format is not specified. (ii) Spec 134 lists `status` and `reason` as two columns (134:44) but writes the status as one string, `not_evaluated:<code>` (134:55). Which is stored where? (iii) `prohibited` (a `permitted()` result, EV:1244) has no stated Layer 2 image. (iv) `applies` must map to `computed`, `unregulated:<clause>` or `unlimited:<clause>` depending on `value_kind`, so its Layer 3 image is not a function of the status alone. (v) The evaluator's `not_applicable` reason already carries its prefix (`not_applicable:<clause>`, EV:1019), while `not_evaluated` reasons are bare codes (EV:1-60).

**Recommendation.** (i) One JSON file with four declared tables: `evaluator_status`, `lot_gate`, `reason_code`, `layer3_image`. `layer3_image` is keyed by status, plus `value_kind` for `applies`. (ii) Store `status` as the closed bare member (`applies`, `not_applicable`, `undecided`, `not_evaluated`) and `reason` as the parameter (`<clause>` or `<code>[:<detail>]`). The §5a string form is a generated column or a view, so the CHECK constraints stay closed sets. (iii) `prohibited` → `not_applicable:<winning PROHIBIT clause>` at Layer 2, and `not_permitted:<clause>` at the scenario level (Spec 68 §11.1). (iv) As in (i). (v) The map strips the prefix, which the lock proves.

**Conflict check.** M-232 (69a:378): kept; this is its form. Spec 134 §4 (134:58-59): kept. Spec 78:1086 (`applies:<value>`): the form is generated, not stored. Spec 68:479 (*"a Layer 2 `not_evaluated` reason propagates unchanged"*): kept.

| Question | Answer |
|---|---|
| STANDARDIZED | one file, four tables |
| OBSERVABLE | the both-direction lock (R-EMIT) |
| RECORDED | a 69a dated note under M-232 |
| SCALABLE | a new code fails the lock until mapped |
| ACCURATE | `applies` images depend on `value_kind`, as Layer 3 needs |
| SIMPLE | closed bare status + parameter |
| EXTERNALIZED | the whole mapping is data |

### OQ-5. `evidence_kind` for the evaluator's actual evidence kinds

**Question.** Spec 134 closes `evidence_kind` to `clause · absence · provincial` (134:44). The evaluator emits `evidence.kind` values `disapply` (EV:1020), `label_absent` (EV:1028), `absence` (EV:1041, 1046) and `clause` (EV:1155, only for an `unregulated` winner). A numeric rule-path winner carries no `evidence` object at all (EV:1154; P2 I2 notes the `clause: null` case). How is each one recorded, and where does `evidence_ref` come from for a numeric winner?

**Recommendation.** Extend the closed set to `clause · absence · provincial · disapply · label_absent` through `layer2-map.json`, never by renaming the evaluator's kinds. For a numeric winner, `evidence_kind` is `clause` (or `provincial` when the winner's layer is provincial) and `evidence_ref` is the winner's `regulation_id`, derived by Layer 2 as P2 I2 says. I2 is amended to accept the two extra kinds with their own ref rules (the `vocab.label_absence_unregulated` ruling and the disapplying unit ids).

**Conflict check.** Spec 134 I2 (134:85, *"a winner unit with `evidence_kind ∈ {clause, provincial}`, or `unregulated` by an absence ruling"*): a `label_absent` unregulated (M-220 / M-202(3)) and a `disapply` not_applicable fail I2 as written, so I2 needs the amendment. M-54 (absence rulings): kept.

| Question | Answer |
|---|---|
| STANDARDIZED | the evaluator's kinds, mapped once |
| OBSERVABLE | I2 per kind; the map lock |
| RECORDED | a Spec 134 amendment row; a 69a dated note (M-220, M-54) |
| SCALABLE | a new kind fails the lock |
| ACCURATE | no answer is relabelled as a clause it is not |
| SIMPLE | one mapping row per kind |
| EXTERNALIZED | data in `layer2-map.json` |

### OQ-6. Lot-gate order, the sentinel (−1) and the label-mismatch rule

**Question.** Spec 134 names six lot gates (134:58) but no order when several fire. I5 (134:88) says *"a sentinel (−1) exception lot never takes an exception-layer winner; `label_exception_mismatch` when exactly one side is present"*. P2 I5 also fires it when xN ≠ the number (P2 §A.2 I5), which Spec 134 does not repeat. Is −1 "present"? Does a sentinel lot base-resolve, or is it gated?

**Recommendation.** A declared total order in `layer2-map.json` (`lot_gate_order`): `no_569_2013_zone` → `ambiguous_zone` → `label_unparsed` → `label_exception_mismatch` → `exception_not_authored` → `lot_metric_missing`. Earlier gates make the later ones unreadable: no zone means no label grammar, and no parsed label means no xN to compare. One gate is reported per lot, and the others are counted in `records_meta`. The sentinel −1 is "no exception" for the closure (it base-resolves, never an exception winner) but "present" for the mismatch test, so −1 with an (xN) label is a mismatch. Adopt P2's xN ≠ number arm as part of the mismatch rule.

**Conflict check.** Spec 134 I4 (134:87): kept, since any gate means no winner. P2 I5: adopted. The measured "80 lots, all number set, no (xN)" (P2 I5) is unchanged. EV `pickReason` (EV:713) orders evaluator reasons, not Layer 2 gates: no conflict.

| Question | Answer |
|---|---|
| STANDARDIZED | one declared order |
| OBSERVABLE | gated lots by gate in `records_meta`; I4, I5 |
| RECORDED | a Spec 134 row; the map |
| SCALABLE | a new gate joins the order by data |
| ACCURATE | a lot never shows a downstream gate whose input is unreadable |
| SIMPLE | first gate wins |
| EXTERNALIZED | the order is data |

### OQ-7. The class catalogue, classes vs structures, and the collapse rule

**Question.** (i) Spec 134 §2 (134:35) declares each class as a vector (`building_type`, `has_secondary_suite`, `has_garden_suite`, `has_laneway_suite`, `house_units`, `ancillary_units`) in `vocab.json` `scenario_class_units`. Today that entry holds only `house_units` / `ancillary_units`, for six P classes, with no suite or house + suite class (vocab.json; M-223(4), owed to the by-law fix lane). (ii) Spec 134 §1 lists `garden_suite` and `laneway_suite` as classes **and** as structures. P2 §S.3 separates them (*"`structure` says which building … the class says which scenario vector"*). (iii) `effective()` has no structure argument; a structure reaches it only as a building type (`vocab.building_type_structure`, EV makeContext). (iv) Collapse: Spec 134 says a class whose vector *"changes no candidate's applicability"* collapses (134:35). That needs reading applicability per unit (OQ-2's rule) and does not name the representative class.

**Recommendation.** (i) The fix lane adds the vector fields and the three suite classes to `scenario_class_units` (M-223(4)), sha-pinned. (ii) Classes are the P5.1 scenario vectors (`detached_house`, `detached_houseplex`, `semi_detached_houseplex`, `semi_detached_house`, `house_with_secondary_suite`); garden and laneway are **structures** evaluated under each class whose vector has that suite (P2 §S.3). They are classes only where Spec 78 names a scenario for them, and it names none (78:713-724). (iii) A structure is passed as its building type through `building_type_structure`. (iv) Collapse by result equality: two classes whose `effective()` results are byte-equal under the stable JSON form collapse into the first in catalogue order. That needs no unit read and is exact by construction (I12 witnesses it).

**Conflict check.** M-234 (69a:380) lists garden and laneway suite among the classes: (ii) reads them as the suite structures under the classes, which needs the operator's confirmation, so this is a real choice. M-233 (69a:379) structures: kept. 134:35 (applicability-based collapse): replaced by result equality. P2 §S.1 (*"with the §2.2 evidence rule id"*): no rule id under result equality, so the record is the representative alone.

| Question | Answer |
|---|---|
| STANDARDIZED | one catalogue, one collapse rule |
| OBSERVABLE | I13; the collapsed-class counter in `records_meta` |
| RECORDED | a 69a dated note under M-234; the M-223(4) row |
| SCALABLE | a new class joins by a pin change |
| ACCURATE | collapse by equal results never hides a difference |
| SIMPLE | no applicability reads |
| EXTERNALIZED | the catalogue is data, sha-pinned |

### OQ-8. Where the v1 scope (targets × structures) is declared

**Question.** The P5.3 target list lives in Spec 78 prose (78:809-812), and *"the suite setbacks"* is not enumerated. M-234 says more targets *"join by a pin change"* but names no pinned file. The structure set (134:72) has the same gap. A list in code would fail EXTERNALIZED.

**Recommendation.** One seed, `scripts/seeds/bylaw/layer2-scope.json`: `{ structures: [...], targets: { principal: [...], garden_suite: [...], laneway_suite: [...] } }`. Each target must be a `vocab.dsl_target`. A both-direction lock against the lineage registry's `keyed.layer2_targets` (32 targets today) applies, with each lineage target either in scope or listed `deferred` with a reason. Its sha joins the skip predicate. The suite setbacks are enumerated from the lineage's suite fields.

**Conflict check.** M-234 (*"more targets or classes join by a pin change"*): this is that pin. Spec 134 I1 (134:84, exact sums): the scope file is the multiplier. Spec 78 P5.3: unchanged; the seed restates it as data with a lock.

| Question | Answer |
|---|---|
| STANDARDIZED | one scope file |
| OBSERVABLE | the lineage lock; I1 |
| RECORDED | a Spec 134 row |
| SCALABLE | targets join by data |
| ACCURATE | every Layer 3 target is resolved or explicitly deferred |
| SIMPLE | one file |
| EXTERNALIZED | no target list in code |

### OQ-9. Two things Layer 3 reads that the §3 row shape does not hold

**Question.** (i) The lineage `disclosures` field is *"P5.12 codes + carried Layer 2 disclosures"*, and `effective()` returns `disclosures[]` (EV:653 `NE_RESULT`), but no §3 column holds them. (ii) `scenario_status` needs `permitted()` per class (Spec 78 P5.1 "where `permitted()` says permitted"; Spec 134 §2 runs it), but `permitted()` is per lot × class, not per target, and has no column.

**Recommendation.** (i) Add `disclosures` (sorted) to the signature row, inside the write guard. (ii) Add `permitted_by_class` (class → `permitted` / `prohibited` + clause / `not_evaluated` + reason) to the lot link row, or to a per-cell permission row if P2-0 shows it shared. Both are frozen with the row shape at ①.

**Conflict check.** Spec 134 §3 (134:40, *"the logical row shape is the contract"*): extended before ①, which is the only time it can change (134:153, "the row shape in §3 is frozen at ①"). Spec 78 D-1: these fields make D-1 satisfiable without an in-process `effective()` shortcut.

| Question | Answer |
|---|---|
| STANDARDIZED | two declared columns |
| OBSERVABLE | I1 covers the permission row; I14 covers disclosures |
| RECORDED | a Spec 134 row-shape amendment |
| SCALABLE | per cell / per lot, as the rest |
| ACCURATE | Layer 3 never recomputes law |
| SIMPLE | two columns |
| EXTERNALIZED | disclosure codes are vocab |

### OQ-10. The population reset arm under the rows arm

**Question.** Spec 134 I11 and §2 need a reset arm that deletes link rows of parcels that left the population, and counts them (R-AY). The rows arm pages only the population source and supports three write kinds (index.js:3366-3378). A parcel that left the population is never in a batch, so no kind deletes it.

**Recommendation.** A runner extension, recorded as its own Spec 124 row: an optional `outputs.writes[i].population_retract` on a `guarded_upsert` target. After the loop, inside the run's transaction, it deletes keys not in the declared population query and reports the count to a declared check. The same predicate gives I11.

**Conflict check.** Spec 124 R-EH (124a:810, *"the runner owns every read, write and transaction"*): a deletion done by compute would breach it, so the runner must own it. R-AY (124a:209): served. Spec 132 materializer.1: unchanged.

| Question | Answer |
|---|---|
| STANDARDIZED | one runner form for every rows-arm materializer |
| OBSERVABLE | the deletion count reported to a check; I11 |
| RECORDED | a Spec 124 row and RE-FREEZE |
| SCALABLE | one statement per run |
| ACCURATE | no stale link row survives a population change |
| SIMPLE | one declared field |
| EXTERNALIZED | the population is the logic-variable query |

### OQ-11. The lot-vector builder: exception id, label and class building type

**Question.** `parcels.exception_number` is an integer, while the evaluator keys exceptions by regulation id (`900.<chapter>.10(<n>)`). The only builder in the tree maps zone → chapter with a literal `{ R: 2, RD: 3, RS: 4, RT: 5, RM: 6 }` (`scripts/analysis/bylaw-validation/pull-oracle.cjs:9`) and always sets `exception: null`. The label parser is the R-LABEL prerequisite (134:121), not yet built.

**Recommendation.** The zone → Chapter 900 article map becomes vocab data (`vocab.exception_chapter`), with a lock against the authored shard ids, so G-EXC-LIT stays clean. The lot-vector builder is one pure function beside R-LABEL, shared with the golden-lot helper. It never defaults a missing input; it raises the lot gate and counts `inputs_defaulted` (I10).

**Conflict check.** G-EXC-LIT (Spec 134 §8 part 4: *"no by-law id, exception number or parcel id in code"*): a literal chapter map in compute would breach it, so it must be data. I10: kept.

| Question | Answer |
|---|---|
| STANDARDIZED | one builder |
| OBSERVABLE | I10; `label_unparsed` census |
| RECORDED | a Spec 134 row; a vocab entry |
| SCALABLE | every residential zone |
| ACCURATE | the exception id matches the authored shard id, by lock |
| SIMPLE | one function |
| EXTERNALIZED | the chapter map is vocab |

### OQ-12. The version hashes

**Question.** Spec 134 says *"content hash"* of `bylaw-provisions.json`, and of `evaluate.mjs` + `dsl.mjs` (134:32), without the algorithm or how two files are combined. P2 D2 hashed a canonical serialization instead (*"sorted keys, LF, no adoption id"*). The evaluator also behaves according to `vocab.json` and the assembly inputs (OQ-1), which `evaluator_version` does not cover.

**Recommendation.** sha256 over the raw bytes, and for several files sha256 over the sorted `path\0sha256\n` lines (order-free, rename-visible). `table_version` covers the Layer 1 inputs per OQ-1. The skip predicate keeps `vocab.version` separately (134:81), so no hash needs to cover vocab twice.

**Conflict check.** P2 D2 (canonical serialization): not adopted, because a generated JSON file is already canonical by its generator's `--check`. 134:32: specified, not changed.

| Question | Answer |
|---|---|
| STANDARDIZED | one hash recipe |
| OBSERVABLE | stamped on every row and the run row |
| RECORDED | a Spec 134 row |
| SCALABLE | any number of files |
| ACCURATE | any byte change changes the version |
| SIMPLE | sha256 of bytes |
| EXTERNALIZED | the file list is declared in the descriptor |

## 7. Slice (a) as built in this lane

`scripts/lib/compute/resolve-bylaws.js` (pure; no fs, pg, env or clock) and `src/tests/steps/resolve_bylaws/resolution.logic.test.ts`. Only what M-231, M-232's Layer 2 set and Spec 134 §3 / §5 fully settle:

| Function | Settled by | What it does |
|---|---|---|
| `unauthoredException(closure, authored)` | M-231 (69a:377: *"or any exception in its INCLUDE closure, is not fully authored"*); EV:125-127 (the authored-state shape) | The first id in the ordered closure whose state is not fully authored, or `null`. `partial` is not fully authored. A missing state is not authored (EV:126). A missing closure or authored map throws (I10: never defaulted). |
| `exceptionGateStatus(closure, authored)` | M-231 (*"`not_evaluated:exception_not_authored:<exception id>`"*); Spec 134 §4 Layer 2 status `not_evaluated:<code>` (134:56) | That gate's Layer 2 status string, or `null`. |
| `gatedRows(scope, status)` | M-231 (*"on every target row of the lot"*); Spec 134 I3, I4 (134:86-87) | One row per declared (target, structure), each with the gate status and no winner. A duplicate scope entry throws (I1 counts exactly). |
| `resolveLot({ scope, gateStatus, resolveOne })` | M-231 (*"applies the gate before `effective()`"*; *"even where the evaluator could resolve the target from base"*) | A gated lot never calls the resolver. The A14 case is tested with the real evaluator: a `partial` exception that `effective()` resolves for its listed target is still gated on every target. |
| `valueKindOf(value)` | Spec 134 §3 (`value_kind` number · unlimited · unregulated, 134:44); EV:148, 169-170 | `number` for a finite number; `unlimited` / `unregulated` for the evaluator's two terminal strings; anything else throws. |

The closure's source (OQ-2), the scope's source (OQ-8), the gate order (OQ-6) and the status columns (OQ-4) are inputs or callers of these functions, so the functions do not change when those rulings land.

## 8. PINs (out of scope here)

- **PIN-L2-1:** `pull-oracle.cjs:9` hard-codes the zone → Chapter 900 map. It is a read-only analysis script, but Layer 2 must not copy it (OQ-11).
- **PIN-L2-2:** compute modules are CommonJS and `evaluate.mjs` is ESM. Slice (d) needs `require()` of an ES module (Node ≥ 22) or a dynamic import in the shell. Gate E / compute-closure must be confirmed to follow it before ②.
- **PIN-L2-3:** `mobile/node_modules`, a symlink, shows as untracked in a fresh worktree (the ignore rule matches the directory, not the link). It is never staged.
