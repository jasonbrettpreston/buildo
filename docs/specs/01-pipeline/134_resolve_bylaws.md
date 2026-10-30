# SPEC 134 — resolve_bylaws — Layer 2 by-law resolution

> **Role: standard.** The behavioural contract of the net-new step `resolve_bylaws` (Layer 2, by-law resolution): its v1 scope, inputs, outputs and row shape, status sets, checks, stages and the round-0 measurement plan; on policy the registers govern: Spec 124 for the step, Spec 69/69a for by-law readings, Spec 131 for lot configuration (Spec 124 R-GV, R-GY).

**Status:** PROPOSED 2026-10-20 (docs only; nothing is built)

**Archetype:** MATERIALIZER (Spec 124 R-HB) · **Chain:** `sources`, after `enrich_parcels`, before `link_parcel_abutments` and `compute_maxbld_scenarios` (Spec 124 R-HD) · **Standard:** born V3 (Spec 124 R-DF, R-EY) · **Net-new:** census `legacy: "none"` (Spec 124 R-DK, R-HC) · **Advisory lock, migration number, chain phase:** assigned at commit ①.

**Sources.** The operator's rulings of 2026-10-20 are committed verbatim as decision logs: `docs/reports/decisions/2026-10-20-scenario-build-rulings.json` (review page https://claude.ai/artifact/MSZP9MjjXhBCnJmPsgVykw, R-1…R-14) and `docs/reports/decisions/2026-10-20-spec-roles-rulings.json`. Each approved decision is a register row that cites it (Spec 124 R-HK; `node scripts/analysis/decision-log.mjs --check`). The design source is the Layer 2 plan v2 DRAFT, kept verbatim as history at `docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md` (cited **P2:line**). P2 is not locked (P2:2) and names an owner "Spec 72" that was never created (P2:4); this spec is that owner (`2026-10-20-scenario-build-rulings#R-2`). Where this spec and P2 differ, this spec governs; P2 is read only for design detail this spec cites.

---

## 1. Goal and the v1 scope

Spec 68 §11 (68:469) defines Layer 2 as *"a converted pipeline step that runs `effective()` per parcel × target × structure and records candidates, winner, why the others lost (the §7.5 rule), status … and the inputs used"*. Layer 3 reads **only** this layer (68:470; Spec 78 §Phase-5 D-1: *"Commit ① waits for Layer 2 rows for the P5.3 targets, per class. There is no in-process `effective()` shortcut."*). `resolve_bylaws` is that step.

**v1 is narrowed to what the scenario step needs** (Spec 69a M-234; `2026-10-20-scenario-build-rulings#R-1`):

| In v1 | Not in v1 (off the critical path) |
|---|---|
| **Targets:** the Spec 78 P5.3 targets: the 18 principal targets, the suite-structure targets, and the O-7 targets once keyed | P2-5 / P2-7 exception authoring waves (they raise coverage; unauthored lots are already a closed reason, 68:472) |
| **Classes:** the Phase-5 classes: `detached_house`, `detached_houseplex`, `semi_detached_houseplex`, `semi_detached_house` (renovation class), house + secondary suite, `garden_suite`, `laneway_suite` (Spec 78 P5.1; P2 addendum P2:615-656) | P2-12 CoA harness (SC-5) and P2-13 NF/EF re-key |
| **Layers:** base zones plus **authored** exceptions; an unauthored exception gives `not_evaluated:exception_not_authored` on every target of the lot (§5) | incremental re-resolution and the L2-CHANGE report (P2:201, D4): v1 is a full rescan |
| **Structures:** principal, garden suite, laneway suite (§6) | the ancillary (non-suite) structure and the townhouse / K-axis classes (they join later by a catalogue pin change) |
| **Readers:** `compute_maxbld_scenarios` and the admin view | any consumer-facing read before the Spec 100 amendment (§10) |

**Nothing live changes** (Spec 69a M-25): the step writes only its own tables, never `parcels`, and no existing column changes value.

## 2. Inputs — through `effective()` only

- **The evaluator.** `scripts/analysis/bylaw/evaluate.mjs` is imported, never forked: `effective()` and `permitted()` per cell × target × structure × class, and `exceptionClosure(lot, candidates)` for the lot's exception closure (Spec 69a M-296). The evaluator stays pure (68 §7.6). No Layer 2 code reads provision rows except through these three functions; a Layer 2 reading of a unit is a defect (the same rule Spec 78 D-1 applies one layer up).
- **Layer 1 version.** `table_version` = the Layer 1 input hash recorded in the generated `docs/reference/bylaw-layer2-input.json`, the one file the compute `require()`s (Spec 124 R-IL; recipe R-IW); `evaluator_version` = content hash of `evaluate.mjs` + `dsl.mjs` (P2:184). Both are stamped on every row and are outside the write guard (§3).
- **The lot vector** (one narrow scan of `parcels`, never an UPDATE of it): zone string, exception number, label letters (the R-LABEL parser, P2:204: an unparsed label gives the lot gate `label_unparsed`), `zoning_is_ambiguous`, lot metrics, the Spec 78 P5.3 lot columns, and `bylaw_map_areas` membership. `cell_id` keys one stored result: the values of that target's own read inputs, with `zone` and `exception` always included, scoped to its structure and target (Spec 124 R-IN, operator CHAT-41 option B `2026-10-21-chat-batch-l-layer2`: 0.30 M rows (a lower bound: derived lot flags are not modelled) instead of 5.8 M per lot; there is no `inputs_hash` column, operator Q-L2-1 `2026-10-21-chat-batch-k-layer2`). **A missing input is never defaulted** (`inputs_defaulted = 0`, I10).
- **Not an input at v1: `parcel_abutments`.** The step runs before `link_parcel_abutments` (§7, Spec 124 R-HD), so reading that table would read the previous run's rows (a cross-step order defect). Neighbour-dependent readings (front-yard averaging, 10.5.40.70(1)) are applied downstream by `compute_maxbld_scenarios`, which runs after both. This replaces the scenario plan's owed item "wiring `front-averaging.mjs` into the Layer 2 lot flags": the operator ruled that averaging stays in the scenario step (Spec 124 R-HL; `2026-10-20-chat-batch-a#CHAT-2`).
- **The class catalogue.** Each class is a fixed input vector (`building_type`, `has_secondary_suite`, `has_garden_suite`, `has_laneway_suite`, `house_units`, `ancillary_units`), declared in `scripts/seeds/bylaw/vocab.json` `scenario_class_units` (M-160) and pinned by sha in the skip predicate. A class whose vector changes no candidate's applicability for a target is recorded `collapsed_into:<class>` (P2 §S.1).
- **Population.** In-scope residential parcels, declared as a query over the logic variable `resolve_bylaws_population_zone_classes` (a JSON list of evaluator zone codes, operator Q-L2-4 `2026-10-21-chat-batch-k-layer2`; pending migration 280, plan §8 PIN L2-PREREQ) with a reset arm (Spec 124 R-AY, R-BT; Spec 132 §core.17 (R-AY)); never a literal or an id list.

## 3. Outputs and the row shape

The step writes only its own tables. Storage follows Spec 78 §6.8's **lean** form (68:480: *"one shared trace per rule signature, plus per-structure deltas only"*); the physical split below is fixed at ① from the P2-0 measurement (§9), and the logical row shape is the contract the scenario step builds against (its pure modules are built on fixtures of this shape, node N6a in §9):

| Table (planned) | Key | Holds |
|---|---|---|
| `bylaw_resolution_cells` — the **signature row** | `(cell_id, target)` | the trace once per law signature: `candidates[]`, `winner_unit_id`, `winner_layer`, `losers[]` (`dropped_by`, P2:192), `status`, `reason`, `value`, `value_kind` (number · unlimited · unregulated), `evidence_kind` (clause · absence · provincial), `evidence_ref`, `inputs_used`, `by_class` (only the classes that differ; the rest `collapsed_into`) |
| `bylaw_resolution_structures` — the **structure row** | `(cell_id, target, structure)` | the signature pointer, `structure` (principal · garden_suite · laneway_suite), and only the fields where this structure differs from the shared trace: `status`, `reason`, `value`, its own winner or condition values |
| `bylaw_resolution_lots` — the **lot link row** | `parcel_id` | its pointer to its per-target result rows (option B, CHAT-41; the form is settled at ①), `lot_gate` (§4), `applied_values` (per-lot application of formula winners that read measured inputs), `inputs_defaulted` |

- **Write guard:** `IS DISTINCT FROM` over the result columns only. **Excluded from the guard:** `chain_run_id` (nullable, Spec 124 R-U), `table_version`, `evaluator_version`, timestamps (P2:200). An unchanged re-run writes 0 rows.
- **Lineage:** every row carries `table_version`, `evaluator_version` and `row_sha` (sha256 over the canonical result columns, recomputed by SQL every run: I14).
- **The migration** creates the tables empty with their indexes and closed-column CHECKs generated from `layer2-map.json`, and the orchestrator adds them to `LARGE_TABLES` at landing (P2:61). DOWN drops them. Supabase disk cannot shrink (P2:63): the budget (§6) is declared before cutover.

> 2026-10-30: design options, see 69a M-400.

## 4. Status sets and `layer2-map.json`

**Two sets, one declared total map** (Spec 69a M-232; `2026-10-20-scenario-build-rulings#R-5`):

- **Layer 2 status** = Spec 68 §5a part 3 (68:119): `applies` (a value) · `not_applicable:<clause>` · `undecided` · `not_evaluated:<code>`. `conflict` is a defect, never an answer: it is recorded as `not_evaluated:conflict` with its candidates, and the check `resolve_bylaws_conflict_max` (default 0) FAILs above its bound (I3).
- **Layer 3 field status** = Spec 68 §11.1 (68:479; `vocab.json` `layer3.field_status`): `computed` · `unregulated:<clause>` · `unlimited:<clause>` · `not_applicable:<clause>` · `not_buildable:<clauses>` · `not_evaluated:<reason>`.
- **`scripts/seeds/bylaw/layer2-map.json`** declares, for every member: evaluator result (`value`, `not_applicable`, `not_evaluated`, `conflict`, `prohibited`, and `undecided` once M-60 lands it) → Layer 2 status; every Layer 2 lot gate (`no_569_2013_zone`, `ambiguous_zone`, `lot_metric_missing`, `label_exception_mismatch`, `label_unparsed`, `exception_not_authored`) → its `not_evaluated` reason; every `NOT_EVALUATED_CODES` member and `not_modelled:<reason>` → its Layer 2 reason; and every Layer 2 status → its Layer 3 field-status image.
- **The lock is total in both directions:** a status, code or gate that the evaluator **emits** (R-EMIT: the returned strings, extracted statically and asserted at runtime, P2:193) and the map omits is RED; a map member that nothing emits is RED; a Layer 2 status with no Layer 3 image is RED. It is a logic test at ①, file-only.
- If the operator later wants literally one set, the recommendation's fallback is §5a part 3 plus `not_buildable` (`2026-10-20-scenario-build-rulings#R-5`); that is a new ruling, not an edit of this map.

## 5. The unauthored-exception gate — lot-wide, written per target

**Rule** (Spec 69a M-231; `2026-10-20-scenario-build-rulings#R-4`): a lot whose exception, or any exception in its INCLUDE closure, is not fully authored takes **no winner on any target**. The gate fires **before** `effective()` (P2:211, I4) and is written **per target**: every target row of the lot carries `not_evaluated:exception_not_authored:<exception id>`. A base value is never returned on such a lot, even where the evaluator could resolve one from base (P2:68, the A14 side-setback case). This satisfies both P2 I4 (*"No winner on any target"*) and Spec 78's per-target propagation (78:737), and never base-resolves silently (68:472).

- It answers P2 Q21(b) for Layer 2: the gate stops a base value whether or not the evaluator does. The evaluator change itself stays with the M-60 ruling.
- **Impact, measured by the scenario-plan lane 2026-10-20:** at least 91,744 residential lots (20.8 %) until authoring continues; the INCLUDE closure was not checked, so this is a lower bound. Round 0 re-measures it live (§9 (f)); I6 counts it in the same transaction, never from `census.json`.
- Disclosure: the scenario step shows the closed reason (Spec 78 §6.6 rule 5); the `not_evaluated_share` WARN (Spec 78 P5.9) sees it.

## 6. Structures and the storage budget

**Rule** (Spec 69a M-233; `2026-10-20-scenario-build-rulings#R-6`): v1 resolves **principal + garden suite + laneway suite** (Phase 5 needs the suites); the ancillary (non-suite) structure is out. Storage is **measured, not assumed**: at P2-0 (round 0) and again at the first POST capture. **Spec 78 §6.8's kill line stays:** Layer 2 + Layer 3-a ≤ 10 % of the DB (≈ 1.2 GB on the 12 GB local DB). Baselines to beat: 380 MB at one structure, 1.03 GB projected at three (1.84 GB risk), 2.52 GB for the trial's full trace per structure (Spec 78 §6.8), plus ≈ 2.6 M scenario rows (Spec 78 O-6).

- **Design default (proposed here, not ruled):** the budget is a logic variable, `resolve_bylaws_storage_budget_mb`, seeded from the P2-0 measurement (`on_invalid: fail`), and a POST check compares the tables' measured size with it. Over budget at the first capture ⇒ the lean split (§3) is re-cut before ③, never a silent growth.
- The step's `execution.budget` (runtime) is seeded from P2-0 too (Spec 124 R-AJ).

## 7. Step shape

- **Archetype MATERIALIZER** (Spec 124 R-HB; `2026-10-20-scenario-build-rulings#R-3`), not P2's provisional ENRICHER (P2:45): it writes only its own derived tables. **Design defaults (not ruled by R-HB):** `execution.materialize_form: "rows"` (rows computed in JS; the runner owns reads, writes and transactions; Spec 124 R-EH; Spec 132 §materializer.1 (R-EH)); `recovery.reset` truncates its tables; batch size from config. The census archetype is provisional until PH-0 re-derives it from the code (R-AO, fast invariant #25).
- **Chain placement** (Spec 124 R-HD; `2026-10-20-scenario-build-rulings#R-8`): `sources`, after `enrich_parcels` (phase 22) and before `link_parcel_abutments` (phase 24) and `compute_maxbld_scenarios` (Spec 78 §Phase-5: *"after the Layer 2 resolution step (D-1)"*). Its phase number is assigned at ③.
- **Run mode, v1:** full rescan (`mode_select: "none"` with a `full_rescan` invalidator, the Spec 130 posture). The skip predicate (`when: "pre"`) is the conjunction of the upstream `staleness.pins` stamps, `table_version`, `vocab.version`, `evaluator_version`, the population-variable hash and the class-catalogue sha (P2:227); a skip is a run row with `records_meta.skipped = true`. Incremental re-resolution is later work (§1).
- **Guards:** `bylaw-provisions.json` present at a `table_version` the run records; every logic variable present (`declared_logic_variables_present`).
- **Checks** (each bound is `limit_from_config` or an exact zero; SQL invariants are `invariants[]`, JS ones are compute-dispatched `checks[]` with their own budget variable, P2:207):
  - **I1** status sums equal cells × targets × structures, exactly; link rows equal the live population count.
  - **I2** `applies` ⇒ a winner unit with `evidence_kind ∈ {clause, provincial}`, or `unregulated` by an absence ruling in `absence-rulings.json` (M-54).
  - **I3** every `not_*` row has a closed reason and no winner; `not_evaluated:conflict` count ≤ `resolve_bylaws_conflict_max` (default 0).
  - **I4** no winner on a lot with a lot gate, including §5's gate.
  - **I5** a sentinel (−1) exception lot never takes an exception-layer winner; `label_exception_mismatch` when exactly one side is present.
  - **I6** the §5 gated-lot count is a live count in the same transaction.
  - **I9** lineage: every link row's `cell_id` exists; every candidate and winner id exists at the current `table_version`.
  - **I10** `inputs_defaulted = 0` (M-406). **I11** rows only for the population; the reset arm's deletions are counted.
  - **I12** equivalence: a rotating sample of lots, full per-lot `effective()` == cell result + per-lot apply, plus the pinned P2-0 ids; budget `resolve_bylaws_equivalence_budget_ms`; over budget ⇒ `not_run`, never PASS.
  - **I13** every `by_class` key is a declared class; no `needs_user_input:<scenario axis>` survives.
  - **I14** `row_sha` stored = recomputed. **I15** the result hash is invariant to candidate order (a seeded shuffle of the pinned subset).
  - WARN with a retighten condition (Spec 124 R-H): the `not_evaluated` share per target vs the last run; the winner-layer histogram.
- **Logic variables** are named `resolve_bylaws_<name>` (Spec 132 §core.8 (R-CV)): population, conflict max, equivalence budget and rotation, storage budget, class cap. Law numbers are never logic variables; they come only from keyed provision data (68 §5a part 4).
- **Terminals:** `computed`, `computed_with_warnings`, a `skip_gated` terminal `skipped_unchanged`, `failed_missing_precondition`, `failed_config_out_of_bounds`, `lock_held_elsewhere`. **`records_meta`:** cells, structure rows, link rows by status; `not_evaluated` by reason; gated lots by gate; collapsed classes; rows written / unchanged.

## 8. Born V3 — the compliance plan

The step is born V3: `standard=V3` prints only when all nine R-EY conditions hold, fail closed (Spec 124 R-EY; Spec 132 §x-v3.1 (R-EY)). It is net-new: no PRE capture, its G8 reference is its own committed POST, with the full R-DK evidence set (Spec 124 R-DK; Spec 132 §x-stages.3 (R-DK)). **R-AS does not apply:** R-DK covers both new steps, `resolve_bylaws` and `compute_maxbld_scenarios`, and P2's proposed R-AS adaptation (P2:104, Q20) is closed as superseded (Spec 124 R-HC; `2026-10-20-scenario-build-rulings#R-7`).

| Part (R-DF) | How | Lock / file |
|---|---|---|
| (1) Standardized gates | gates A–K and the fast invariants hard from ①; no gate-ledger allowance | `scripts/analysis/step-validate.mjs` |
| (2) Registry | descriptor-generated registries; census `legacy: "none"`, owner_specs `[134]`; admin entries (R-DL, R-DV at `red_suite`); Target Files generated at ① | `admin-step-registration.logic`; `step-validate-net-new.logic` |
| (3) Cross-step truth | every read table declared (`parcels`, `bylaw_map_areas`); LDG-10; #44 executed-SQL witness on every capture | `scripts/analysis/gates/ldg10.mjs`; `scripts/analysis/gates/witness.mjs` |
| (4) Compute purity | the compute module is pure; gate E zero; G-EXC-LIT clean (no by-law id, exception number or parcel id in code) | `scripts/analysis/gates/compute-purity.mjs`; `scripts/analysis/bylaw/exc-lit.mjs` |
| (5) Externalized | law numbers only through `effective()`; every other number a `resolve_bylaws_*` logic variable seeded by migration; check bounds from config | `scripts/analysis/gates/closed-bounds.mjs` |
| (6) Reproducible captures | no PRE; POST capture with the bracket `--op=delete_reinsert` keyed `parcel_id` (R-DP); rerun writes 0 rows; red evidence (gate K); replay order R-DQ | `scripts/analysis/gates/net-new.mjs`; `cohort-delete-reinsert.logic` |

- **Admin-visible** (Spec 124 R-DL; Spec 132 §core.16 (R-DL)): the operator verifies the rows in the admin parcel lookup (the P2-11 trace path: candidates, winner, `dropped_by`, inputs, citation or absence ruling) before any consumer reads them.
- **Runner rulings** (Spec 124 R-HG; `2026-10-20-scenario-build-rulings#R-14`): before scheduling the scenario step's ① (node N6, which reads this step's rows), the orchestrator confirms in `programme-items.json` and the R-DV, R-EB and R-EC rows that the 18 runner rulings binding it (Spec 78 P5.11) are built. The ruling does not cover this step's own ①.

## 9. Stages, red-first tests and the round-0 measurement plan

**Stages** (Spec 132 §x-stages.2 (R-EQ)):

| Stage | Contents |
|---|---|
| **Prerequisites** (each red-first, after the by-law fix lane's evaluator edits) | structured `losers[]` in `effective()` (additive, one fixture per `dropped_by` member, P2:192); R-EMIT; R-DET extended to the compute module; `layer2-map.json` + its both-direction lock; the R-LABEL parser; P2-0 (below) |
| **① red suite + descriptor** | census row (`legacy: "none"`, owner_specs `[134]`), `converted.json` pending at `red_suite` (no descriptor file, R-K.1, R-DV), admin entries; the migration; the logic-variable seed; the red tests below, each failing for the stated reason |
| **② compute + POST** | the compute module and shell; a local full run timed against `execution.budget`; POST capture; rerun-zero; the storage check against `resolve_bylaws_storage_budget_mb` |
| **③ cutover** | `converted.json`, chain placement (§7), scorecards, owner-spec diff |

**Planned red-first tests** (logic unless marked): the `layer2-map.json` totality lock (both directions, R-EMIT); I4 + §5 (an excepted lot whose exception or an INCLUDE-closed exception is unauthored gets `not_evaluated:exception_not_authored` on every target, including the A14 base-resolvable case); I5 (sentinel lot; one-side mismatch); I10 (a missing input is never defaulted); I3 (`conflict` above its bound FAILs); I9 (orphan cell / unit id); I13 (an undeclared class key; a surviving `needs_user_input:<scenario axis>`); I14 (a direct row edit); I15 (candidate shuffle); R-SKIP (parcels changed, Layer 1 unchanged → not skipped); the reset arm (a parcel leaving the population is deleted and counted); G-EXC-LIT (a by-law id literal in compute); the structure set (exactly principal, garden suite, laneway suite); the full step suite `violations.test.ts`; the DB arms as `*.db.test.ts`.

**P2-0 = validation round 0 — what it measures before ①** (P2 §K.3, narrowed to v1). Read-only on the local DB (`BEGIN TRANSACTION READ ONLY`); prereg-0 committed first; a second seat re-executes every number against the same pinned `table_version`, `evaluator_version`, prereg sha and DB counts (the double check, P2 §K.4):

- (a) signature rows, structure rows and bytes per row for the three v1 structures, with `by_class` inside the row, against §6's kill line;
- (b) ms per lot and per cell with the current evaluator (seeds `execution.budget` and the I12 budget);
- (c) I12 equivalence on the pinned sample (0 disagreements);
- (d) WAL of a no-change run with `table_version` outside the guard;
- (e) the evaluable share per P5.3 target and per class;
- (f) the §5 gated-lot count with the INCLUDE closure checked, item- and lot-weighted (the K7-R split, P2 §K.2);
- (g) every count an invariant cites, regenerated by the script named beside it.

**Order** (the scenario-plan lane's dependency graph and lane table, 2026-10-20):

| Node | Contents | Waits for |
|---|---|---|
| N1 | by-law fix lane: suite keying (M-177 / M-198 / M-199), M-218 / M-219 re-verify, O-7 keying, M-223 vocabulary, the stale owed-entry reconcile (Spec 124 R-HF) | integrate-12 |
| N2 | this spec, the register rows, the narrowed plan lock | integrate-12 |
| N4 | the prerequisites above, P2-0 | N1's evaluator edits (one writer of `evaluate.mjs` at a time) |
| N5 | `resolve_bylaws` ① ② ③, admin-registered | N4, N2 |
| N6a | the scenario step's pure modules on fixtures of the §3 row shape | N2 (row shape); no ① before N5 ② |
| N6–N8 | `compute_maxbld_scenarios` ① ② ③ (Spec 78 §Phase-5) | N5 ② (D-1) |
| N9 | admin view of both steps | N5 ②, N7 |
| N11–N13 | consumer API (Spec 124 R-HE), app, shadow validation | N7 and the shadow gates (Spec 131 LC-61) |

## 10. Consumers

- **`compute_maxbld_scenarios`** reads only these rows (Spec 78 §Phase-5 D-1), per class, through its declared reads; the row shape in §3 is frozen at ①.
- **Admin first:** both steps are verified in the admin view before anything reaches the app (Spec 131 LC-61).
- **The app** gets scenario data only through the Spec 100 consumer contract, amended with an explicit whitelisted block (Spec 124 R-HE; no new endpoint); no app reads a Layer 2 table.

## 11. Open questions

- **The physical table split** (§3): the lean three-table form vs P2's two tables (P2:58-59) is fixed at ① from the P2-0 bytes-per-row measurement; the logical row shape does not change. Measured 2026-10-21 (plan §9): keyed by `cell_id` the signature and structure rows are about 5.8 M (2.4 GB, over the §6 kill line); keyed by each target's own read inputs about 0.3 M (0.13 GB; a lower bound, since the measured lot vector omits the derived flags the real builder adds). The operator ruled 2026-10-21 (CHAT-41): key each target's result by its own read inputs (R-IN); how the lot link row points at its per-target rows is settled at ①.
- **`undecided` before M-60 lands:** the evaluator returns `not_evaluated` for disagreeing worlds today (P2 is silent on the mapping); `layer2-map.json` maps it until the status exists, and the map's lock then moves it.
- **Ruled 2026-10-21** (operator, on the condition "keeping this simple, understandable, accruate, standardized, easy to fix or altar"; `2026-10-21-chat-batch-j`): OQ-1…OQ-12 of `docs/reports/2026-10-21-layer2-build-plan.md` §6 are Spec 124 R-IL…R-IW, which govern where they amend this spec (§2 the input file and the key, §3 two columns, §4 the map, I2, I5, the reset arm). **Ruled 2026-10-21** (operator, `2026-10-21-chat-batch-k-layer2`): Q-L2-1 `inputs_hash` is dropped (R-IN), Q-L2-2 no skip predicate at v1 (R-IS), Q-L2-3 ① keeps the §9 order, measurement first (R-IX), Q-L2-4 the population zone list is a logic variable (R-IU).
- Settled 2026-10-20: front-yard averaging stays in the scenario step (Spec 124 R-HL); the renovation section's render form is Spec 131 LC-62 (`2026-10-20-chat-batch-a#CHAT-1`). Layer 2 serves the renovation class (`semi_detached_house` / `detached_house`) unchanged.

## Operating Boundaries

### Target Files
- **Built ahead of ① (slice (a), plan §7; pure functions only, no hook the runner reads; written without their root until ① registers the step):** the library `lib/bylaw-resolution.js` (required by the compute module at ②) and its test `tests/steps/resolve_bylaws/resolution.logic.test.ts`, red first (gate K artifact `reports/red-evidence/resolve_bylaws/slice-a-red.json`). Batch J (R-IL…R-IW), red first (`rulings-j-red.json`, `layer2-input-red.json`): the seeds `seeds/bylaw/layer2-map.json` and `seeds/bylaw/layer2-scope.json`, the generator `generate-bylaw-layer2-input.mjs` and its output `reference/bylaw-layer2-input.json`, and their locks under `tests/steps/resolve_bylaws/`.
- **PLANNED (not created; paths written without their root so the system map does not list files that do not exist):** the step `resolve-bylaws.js` with its descriptor and notes, the rest of the compute module (the runner hooks), one migration creating the three tables, the logic-variable seed rows, and the tests under `tests/steps/resolve_bylaws/` plus the `layer2-map` lock.

### Out-of-Scope Files
- `scripts/analysis/bylaw/evaluate.mjs` and `dsl.mjs` (Spec 68 §7.6; the `losers[]` prerequisite is an evaluator change under Spec 68, landed red-first before ①).
- `docs/reference/bylaw-provisions.json`, `scripts/seeds/bylaw/vocab.json`, `adjudications.json` and the other by-law data (Spec 68 / 69a; the by-law fix lane is their single writer).
- The `enrich_parcels`, `link_parcel_abutments` and `compute_maxbld_scenarios` steps (Specs 65, 130, 78): read or followed, never edited by this step.

### Cross-Spec Dependencies
- **Relies on:** Spec 68 (§5a McBylaws Airtight, §7.5–§7.6 precedence and the evaluator, §11 Layer 2 / Layer 3), Spec 69 / 69a (M-25, M-53, M-54, M-60, M-160, M-177, M-231…M-234), Specs 122 / 124 (the step standard; R-DF, R-DK, R-DL, R-EH, R-EY, R-GY, R-HB…R-HG, R-HK, R-HL), Spec 47 (advisory lock). Spec 130 (`link_parcel_abutments`) runs after this step and is not read by it.
- **Consumed by:** Spec 78 §Phase-5 (`compute_maxbld_scenarios`, D-1) and Spec 131 (LC-60…LC-62); the admin parcel lookup; Spec 100 through the R-HE whitelist.
