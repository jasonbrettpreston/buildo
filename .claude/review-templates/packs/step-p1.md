# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Step standard handbook (Spec 132 sections 2, 3, 4 and 6)
Source: docs/specs/01-pipeline/132_step_standard_handbook.md:122-463; docs/specs/01-pipeline/132_step_standard_handbook.md:503-591
Generator: scripts/generate-step-handbook.mjs --write, from scripts/steps/_schema/rule-map.json (444 mapped rule ids) and Spec 124/124a/122
Rules in the whole list: 65 (counted by pattern /^- \*\*[a-z0-9.\-]+\*\* /) · this is part 1 of 2

<<< Spec 132 sections 2 (every step), 3 (by archetype), 4 (cross-cutting) (docs/specs/01-pipeline/132_step_standard_handbook.md:122-463) >>>
## 2. Every step

What every step declares and does, whatever its archetype.

- **core.1** A step is three files: a descriptor (data only), a compute module and a thin shell that exports `pipeline.step(descriptor, compute)`. File names are hyphenated and need not match the slug; §1 table 1b lists every step's real paths. `scripts/steps/_schema/step.schema.json` is the vocabulary; prose never adds a field. Behaviour lives in descriptor data, a declared check, a shape rule or (last resort) a new schema field, never only in code (Rule 1).
  *Why:* One place says what a step is, and the schema, not a reviewer, decides what is valid.
  Rules: `Rule-1` `A1` `R2` · history: `P1` `GAP-G-1`

- **core.2** All 20 categories are present and every field is answered; write `"none"` (with a why where the schema asks) instead of leaving a field out. Declare at least one check.
  *Why:* An omitted field cannot be told apart from a forgotten one; "none" is a decision someone made.
  Rules: `Rule-5` `Rule-6` · history: `R-Y` `K1`

- **core.3** Use the closed vocabulary: full-word archetypes; a lock id unique across manifest, one-time and backfill scripts; `guards.schema_drift` none/propagate/pause (rule id V3, alias SPEC122A-V3, which is not the V3 standard); staleness as scope × trigger; typed `empty_source`; and the cross-step majority forms (`batch`, `spec_version`, terminal ids, flat emits with every declared emit present on every run and an empty cursor reading 0 (CHAT-90), notes keys). The old `outputs.writes[].replay` / `append_unsafe` field is deleted (V4, now history).
  *Why:* Shared names let one library, one gate and one admin page read every step the same way.
  Rules: `R-DE` `V1` (SPEC122A-V1) `V2` (SPEC122A-V2) `V3` (SPEC122A-V3) `V5` (SPEC122A-V5) `V6` (SPEC122A-V6) · history: `V4` (SPEC122A-V4)

- **core.4** Take the archetype from the code: PH-0 derives it, and the census (`step-archetype-census.json`) must agree with the descriptor (#25). The archetype selects the required and forbidden categories. A step whose only write is a snapshot it exists to record is a RECORDER, not an ASSERT with a hidden write.
  *Why:* The archetype drives which fields are required, so a wrong label silently drops checks.
  Rules: `R-AE` `R-AO` `Rule-7`

- **core.5** Where a machine can derive a descriptor value, it is gated rather than trusted: `mode_select` per archetype and emit types that match the captures (#47).
  *Why:* A value the machine can check should never be the author's word alone.
  Rules: `R-BH`

- **core.6** The verdict comes only from check rows. Each row is PASS, WARN (through `warn_limit` / `warn_limit_from_config`) or its declared severity. `checks_failed` counts FAIL rows and `checks_warned` counts WARN rows. A metric that is never zero is WARN with a stated retighten condition; INFO is only for a purely descriptive counter. A uniqueness invariant is a check row, not a throw. A legacy exclusive ceiling becomes an inclusive `ceiling_max` with a declared deviation.
  *Why:* A parallel boolean or a severity chosen to dodge red hides failures from the run row and the admin page.
  Rules: `R-H` `R-Q` `R-AD` `R-CL` `Rule-10` `Rule-10-addendum-R-H` `GAP-G-5` `R-FD` `R-JV` `R-KD` · history: `W4A-R2`

- **core.7** A rule kept inside compute is still written down: as a check's `why`, or as an Intent Ledger row naming where it lives, never only as a code comment (`checkPreservedInComputeHasWhy`).
  *Why:* Nothing about a step's behaviour may live only in code.
  Rules: `Rule-4` · history: `P5` `GAP-G-2`

- **core.8** EXTERNALIZED. Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero. Step variables are named `<slug>_<name>`; a name shared by two or more steps comes only from the closed `SHARED_LOGIC_VARIABLES` map, and legacy shared names are renamed by migration with values carried. Unit constants and definitional windows are pinned (min = max). Runner and gate numbers are pinned `step_*` / `gate_*` / `tooling_*` variables. A missing `logic_variables` row fails the run; `on_invalid` is `fail` for any verdict- or write-affecting variable. A variable is retired by a `config.retired[]` declaration, never deleted. A model constant ratified elsewhere becomes a variable with its existing value as default.
  *Why:* The operator tunes the system from the admin page; a literal in code is a setting nobody can see or change.
  Rules: `R-A` `R-G` `R-AW` `R-CV` `R-DR` `R-EB` `Rule-3` `R-FC` `R-FE` `R-JW` `R-KN` `R-KR` `R-LA` · history: `R-AU` `Rule-3-addendum-R-AU` `P4` `GAP-G-4` `W4A-R1` `W4A-R3` `Q-C3`

- **core.9** Compute is pure. It receives `ctx` (config with `$meta`, clock, catalog, descriptor, `withinLimit`), reports every check value through `ctx.report(id, value)` and returns rows, a `write_plan` or `records_meta`. The runner owns every read set-up, write, transaction, session GUC (`execution.read_gucs`), catalog probe (`guards.requires` / `ctx.catalog`), calendar date (`ctx.clock` in `pipeline_timezone`) and the verdict. An ASSERT may read `ctx.pool` read-only over declared relations (R-CA (i)). Compute never branches on PostGIS; it never reads `logic_variables` SQL; a config value aliased inside a check body still counts as compute deciding (PURITY-G7). Gate E purity codes PURITY-G0…PURITY-G13 must read zero for a new conversion; the escape-hatch ban is an ast-grep rule.
  *Why:* Pure compute can be tested with plain inputs, replayed from captures and reviewed without a database.
  Rules: `R-W` `R-BZ` `R-CA` `R-CE` `R-CF` `R-CM` `R-CX` `R-CY` `R-DC` `Rule-2` `Rule-2-addendum-R-W` `A2` `K3` `R-KF` `R-KJ` `R-KT` · history: `P2`

- **core.10** Compute reads the `ctx` shape the runner's dispatch for its descriptor actually builds (a multi-primary INGESTOR gets `acquired.primaries[id]` and `written.by_target.<table>`, not the flat shape), and its compute lock builds that ctx through the real dispatch, stubbing only DB and network answers.
  *Why:* A hand-built ctx in a test can pass while the real run reads zeros.
  Rules: `R-EW` `R-FG`

- **core.11** Output is observable. `emits[]` equals what the captures emit and stays flat; dynamic-keyed telemetry rides a check row's `detail`, capped by a variable. A step that can skip declares a `when:"pre"` check; one that can scope-defer also declares a `deferred_to_full` terminal. Every run row carries the propagated `chain_run_id`.
  *Why:* A skipped or deferred run must say why in its own audit table, and runs correlate by id, not by time window.
  Rules: `R-P` `R-U` `R-BU` `R-EP` `R-KS` · history: `Q-W4G-3`

- **core.12** Declare write discipline per write target, never per step: mechanic ⊥ guard ⊥ scope ⊥ retract. A banned write shape ships only with a dated, SHA-anchored `grandfathered.json` entry naming its why; guard `none` needs a why. A target on an RLS-enabled table declares `guards.requires: rls_bypass_or_policy`. One upsert binds at most 65,535 parameters, so the batch keeps the measured worst case under it.
  *Why:* Write safety differs per table; a per-step answer is wrong for at least one target.
  Rules: `R-CT` `R-CU` `Rule-8` `Rule-9` `V7` (SPEC122A-V7) `R-KB`

- **core.13** A destructive retraction declares a truthful crash posture (`recovery.interrupted`) and a `recovery.before_image`; the library writes the before-image before retracting, and the runner forces FULL after an interrupted run.
  *Why:* A run killed half-way must never leave a half-retracted table that the next run calls unchanged.
  Rules: `R-B` `R-M` `Rule-12`

- **core.14** Declared equals witnessed. Acquisition reads go in `inputs.reads`; measurement reads (check SQL, emits) in `checks[].reads`; per-mode statement counts in `outputs.write_inventory.by_mode`; version pins in `staleness.pins`; invalidators in `outputs.invalidates[]` with a closed `by`. Fast invariant #44 traces what the step really runs and fails any gap; an unresolved invalidator fails (#44 (i)); a pin on a producer still awaiting captures prints OWED. Prior-run baselines accept only completed/completed_with_warnings runs.
  *Why:* The cross-step ledger is only true if it is measured, never re-typed.
  Rules: `R-BF` `R-BG` `R-BJ` `R-BK` `R-BL` `R-BM` `R-BW` `R-CB` `R-CW` `R-DB` `R-DG` `R-DI` `R-DO` `R-EA` `R-ER` `R-ES` `R-FF` `R-GP` `R-HA` `R-JF` · history: `W4A-R4`

- **core.15** Every frozen enum value and every `execution.*` declaration has a disposition in its registry: executed (with a named executor or check), descriptive, or retired.
  *Why:* A field that looks enforced but has no executor is a promise nobody keeps.
  Rules: `R-X` `R-AJ` `R-AX` · history: `M4` (SPEC121-M4)

- **core.16** The step is admin-verifiable: its registry, description, table-map and telemetry entries are derived from the descriptor (#51); range badges come from declared check bounds; each logic variable shows whether it is in effect (#53).
  *Why:* The operator checks a step's output on the admin page, so the page must be derived, not hand-kept.
  Rules: `R-DL` `R-DV` `R-DW` `R-EO`

- **core.17** A priced or modelled output declares the population it is for, as a query bound on the producing step.
  *Why:* A number without its population cannot be checked or compared.
  Rules: `R-AY` `R-BT`

- **core.18** Overrides are honest: `override.dry_run` is `"none"` unless the step honours it, and per-invocation row caps (`--limit=N`) are retired by deviation.
  *Why:* A dry run that writes, or a cap that hides rows, makes the run report false.
  Rules: `R-AV` `R-AZ` `R-GS` `R-GT`

## 3. By archetype

The archetype comes from `identity.archetype` (see `step-archetype-census.json`); it selects the required fields, and `execution.shape` selects the phase (§1). Every line in section 2 applies too.

### INGESTOR

Acquires an outside source and writes it into its own tables.

- **ingestor.1** Phases run acquire → validate → write → score. Every "before X" guarantee in the owner spec becomes a `pre_write` check carrying an `order_guarantee` whose anchor is a literal sentence of that spec.
  *Why:* A FAIL reported after rows are already written is a guarantee broken.
  Rules: `Rule-11` `GAP-G-3`

- **ingestor.2** A source-version skip is taken only when the target is non-empty.
  *Why:* Skipping on an unchanged hash over an empty table leaves it empty for good.
  Rules: `R-DD`

- **ingestor.3** Primaries: a `ckan_datastore` primary is first-class (null geometry, targetless, union groups, per-member truth); a PDF document set is an acquisition format.
  *Why:* Each source form gets one library path instead of a per-step reader.
  Rules: `R-BY` `R-DX`

- **ingestor.4** Derived secondary targets are written from a runner-owned prior-state read inside the primary transaction; one may be non-fatal (`on_error: warn_row`) with a declared zero-bound WARN check.
  *Why:* The derived write stays atomic with its source and a failure still shows up as a row.
  Rules: `R-DM` `R-DY`

- **ingestor.5** A `written:"seen"` column is a runner-clock column touched for every fed key and excluded from the guard; its target declares `idempotent_rerun: "declared_drift"`, and the rerun proof passes only when rewritten == touched exactly.
  *Why:* The touch rewrites rows on every run by design, so `zero_writes` would be a false claim.
  Rules: `R-DZ` `R-EX`

- **ingestor.6** Worked examples (one step each): load_parcels replaces geometry only on a material change beyond a variable tolerance; close_stale_permits folds into load_permits' declared retraction; coa made its change-detection hash timezone-independent at the cost of one measured re-upsert.
  *Why:* Shows how the general rules were applied where they were first needed.
  Rules: `R-BS` `R-BX` `R-EN` `R-EV` `R-JB`

### LINK

Joins two populations and writes the link rows or columns.

- **link.1** `mode_select` is `tri_state`, or `none` with a `full_rescan` invalidator (the mode gate itself is R-BH (i), on core.5). Crash posture is `force_full_on_next_run`, and an autonomous FULL run happens only on a chain whose `chain_args` declare `--full`.
  *Why:* A destructive rescan must be chosen on purpose, never by accident after a crash.
  Rules: `R-L`

- **link.2** `runLinkPhase` (shape `link`) serves more than one LINK family through opt-in arms; counter names come from the match plan. Other LINK steps run their own phase: shape `link_keyed` (`runLinkKeyedPhase`), `link_column` (`runLinkColumnPhase`); a MATCHER runs `runCascadePhase` (shape `cascade`), which hosts any declared cascade target, link_coa among them (R-JY, from the bundled runner night). §1 table 1a lists which step uses which. A match plan may also declare a closed `extra_counters` set, summed per batch (R-IG, from the bundled RE-FREEZE night).
  *Why:* One library path, not a copy per link step.
  Rules: `R-EG` `R-IG` `R-JY`

- **link.3** Worked examples: a link-rate floor's denominator is the entity population, not the source-row count (link_wsib); a full-rescan LINK may keep its junction current with a declared material-geometry trigger (`guards.requires`, link_parcel_abutments).
  *Why:* Shows the rules applied where they were first needed.
  Rules: `R-N` `R-CR`

- **link.4** Open operator question Q-B1: a better neighbour front-setback estimator (`front_setback_est_m`; owed to the Spec 130 lane). Since 2026-10-19 (operator ruling; Spec 130:93, Spec 131 LC-58, Spec 69a M-205(1) dated note) averaging is evaluated: max(neighbour estimate + `fya_porch_allowance_m`, the zone default), always "needs survey"; Q-B1 stays open only for a better estimator. A reader must not read a parcel with no abutment pairs (deleted until the next run by R-CR's trigger) as "no neighbours". Separately, R-CR's trigger form is replaced by the fleet keyed-delete arm when that lands; that does not close Q-B1. (124a R-CR's own cell still says averaging stays `not_evaluated` until Q-B1; that cell is stale, owed to a ruling lane.)
  *Why:* An unanswered question stays visible on its own line, next to the rule that raised it.
  Rules: `Q-B1`

### MATCHER

A LINK whose join is a fuzzy, tiered match. Everything under LINK applies except the phase: a MATCHER declares shape `cascade` and runs `runCascadePhase`, not `runLinkPhase`.

- **matcher.1** Accuracy is a sampled precision/recall against a before-image, recorded at each repair, never a self-consistent predicate.
  *Why:* A matcher graded against itself always passes.
  Rules: `R-O`

### ENRICHER

Adds derived columns to rows another step owns, in scoped passes.

- **enricher.1** No Layer-1 skip: a legacy skip gate moves into the write scope as a declared deviation, or, if it has no runner home and no lineage column, is knowingly retired.
  *Why:* An ENRICHER that skips whole runs hides rows that changed upstream.
  Rules: `R-AR` `R-AR.1`

- **enricher.2** `runEnrichPhase` is generic: hooks are optional `enrich_hooks` declarations and intervals come from config. Pass DML goes through `ctx.exec(writesRef, sql, params)`; scope-ledger hygiene DELETEs are library-owned, and a guard-suppressed hygiene action emits one WARN row. Updated counters belong to whichever mechanism wrote the rows this run. One per-batch transaction may carry a step's statements (`ctx.flushBatch([...])`, a SAVEPOINT per warn_row statement), and an ENRICHER may write derived rows (R-JZ, from the bundled runner night). (Dated note 2026-10-26, `2026-10-26-batch-m#CHAT-174.ENRICHER2-HELD-NOTE`: the ENRICHER derive arm is held by CHAT-167 until designed with CLP ②; validate refuses `derive` on an ENRICHER by name.) (Dated note 2026-10-26, `2026-10-26-batch-r#CHAT-189.CLPD-Q4`, `2026-10-26-batch-r#CHAT-189.CLPD-Q5`: the ENRICHER derive arm is ruled for CLP ②; the list form's SAVEPOINT per warn_row statement is retired (a named refusal; the savepoint is the runner's derived-history write), and in an ENRICHER that declares derived rows `ctx.exec`, `joinUpdate` and `retract` refuse its root and history tables.)
  *Why:* Writes stay behind the runner seam, and counters are not double-counted.
  Rules: `R-AK` `R-AT` `R-CI` `R-CJ` `R-CK` `R-JZ`

- **enricher.3** `execution.maintenance` may declare a dead-tuple-ratio dynamic-target arm, measured once and shared.
  *Why:* Vacuum decisions follow the table's real state, from one measurement.
  Rules: `R-CG`

### MATERIALIZER

Rebuilds a derived table from tables other steps own.

- **materializer.1** `recovery.reset` is not none. `materialize_form` is `insert_select` or `rows` (rows computed in JS; the runner owns reads, writes and transactions), or `replace` (the whole table replaced through the existing staging executor in one transaction; zero rows leave it untouched; R-JX, from the bundled runner night); batch size comes from config.
  *Why:* Rebuilds must be resumable, and JS rows must not bring their own I/O.
  Rules: `R-EH` `R-JG` `R-JX` · history: `Q-MZ`

### BACKFILL

Fills historical rows in batches.

- **backfill.1** Batch size comes from config. A one-time backfill leaves its chain once a measured run inserts 0 rows (backfill_realtor_permit_trades).
  *Why:* A finished backfill should stop costing a chain slot.
  Rules: `R-EM`

### ASSERT

Measures data quality and writes nothing but its own run row.

- **assert.1** `outputs`, `recovery` and `counters` are none. Compute may read `ctx.pool` read-only over declared relations (R-CA (i), on core.9, corrects older text that says no pool is reachable); vocabulary-coverage reads use a runner-owned READ ONLY snapshot.
  *Why:* An ASSERT measures; it must not change what it measures.
  Rules: `R-CH`

- **assert.2** Worked example: assert_schema checks at chain start that every declared logic variable has a DB row.
  *Why:* A missing variable is caught before any step reads it.
  Rules: `R-D`

### RECORDER

Records a snapshot it exists to publish.

- **recorder.1** A RECORDER's `outputs` is an object (never `none`) and its snapshot write is declared in `outputs.writes[]`. Either `runRecorderPhase` executes it (shape `recorder`), or the step declares no shape and compute returns a `write_plan` that the runner executes after compute (`runWritePlan`, R-CD). (`outputs.publish` was deleted at a RE-FREEZE; Spec 124 §3's Rule 7 table still names it.)
  *Why:* The snapshot is the step's purpose, so it is declared, not hidden.
  Rules: `R-CD`

### EFFECTOR

Acts on the outside world (sends, calls, notifies). Census only until its first RE-FREEZE; not yet in the step.schema.json enum.

- **effector.1** Four gates: a kill switch or injected transport, an exactly-once ledger, captured intended effects, and a dry run. Outside calls are replayed from recorded responses.
  *Why:* An effect on the outside world cannot be rolled back, so it must be switchable, counted once and rehearsable.
  Rules: `R-EI`

### RUNNER (a home, not an archetype)

Concerns the runner owns for every step.

- **runner.1** Reconcile runs as a step at the head of the sources chain. A slug whose concern the runner owns (`reconcile`, `observe_chain`) is a declared `runner_owned` exemption, not a conversion; a step is retired, not converted, only under a closed predicate.
  *Why:* Every chained slug has exactly one honest status.
  Rules: `R-AP` `R-EJ` `R-EK` `A3`

- **runner.2** Seam validation and chain-end synthesis derive from declared step edges; a chain step row's status is derived from its verdict (PASS → completed, WARN → completed_with_warnings, a covered FAIL → completed_with_errors); a hard-coded `'completed'` is retired.
  *Why:* A chain that says completed after a FAIL is lying.
  Rules: `R-V` `R-CC` `Q-S1-a`

## 4. Cross-cutting

### Lifecycle stages

How a step moves from legacy script to converted.

- **x-stages.1** A step's stage is declared data in `converted.json` `pending[]`: `red_suite` → `descriptor_only` → `compute_ported` → `runner_wired` → `shape_clean` (or `shape_clean_pending_recapture`) → converted. Red tests are declared there, never a code skip. The declared stage alone decides which gates cannot yet be answered (`stageAwaitsCaptures`); a pending row with no descriptor file does not block whole-registry selection.
  *Why:* Progress is visible and a half-built step is graded for what it is.
  Rules: `R-K` `R-K.1` `R-DU` `R-EF` `R-K.2` · history: `M5` (SPEC121-M5)

- **x-stages.2** The commits are ① red suite + descriptor, ② compute + runner (the shell swap), ③ cutover into `converted[]`. A pending step lands ② at `compute_ported` with its legacy shell live, and may swap its shell before ③ only once every declared upstream (`inputs.reads.steps`) is converted, or pending past ② and not awaiting captures (`stageAwaitsCaptures`); fast invariant #54 checks this, and an unregistered or unknown upstream fails.
  *Why:* A downstream step never runs on a converted shell before its producer.
  Rules: `R-EQ` `Q-R-EQ-1` `R-FH` `R-JQ` · history: `W4A-R6`

- **x-stages.3** A net-new step (no legacy predecessor) has no PRE capture; its G8 reference is its committed POST. It is accepted as net-new only with the full R-DK evidence set: census `legacy: "none"`, no git history of the script before its descriptor, no `legacy_citation`, a `recapture.json` entry with `via` bracket or env, a red-evidence artifact (gate K) and a rerun-zero proof on every POST. Otherwise fast invariant #22 refuses it by name, and any PRE file on an accepted slug is RED.
  *Why:* There is nothing older to compare against.
  Rules: `R-DK` · history: `R-CS`

- **x-stages.4** A cutover stages every owner spec named in the system map, or declares `Spec-diff: N-A` (#43). Target Files are generated into the owner spec; every spec that names a chained step classifies it; fleet counts are derived from registries, never retyped.
  *Why:* Specs and registries stay in step with the code without anyone remembering to update them.
  Rules: `R-AF` `R-AN` `R-BB` `R-BE`

### Captures, goldens and proof

How a conversion proves it changed nothing it did not mean to.

- **x-captures.1** Captures are reproducible from committed data alone: every capture has a `recapture.json` entry, and `node scripts/analysis/capture-step-golden.js --replay-all` prints the retake commands from those entries (plain and env captures first, then brackets; a ledger-gated step whose bracket recipe passes no force env has that bracket retaken before its standalone capture, CHAT-89); capture pairs follow the declared chain variance. Every harness run is ledgered as captured, never a baseline. PRE captures are committed before re-runs. A post witness trace with no golden capture and no `recapture.json` entry is an orphan: it is deleted by literal path only when a recipe-backed trace of the same slug witnesses a superset of its statement fingerprints, otherwise it gets a recipe and is retaken (R-IJ).
  *Why:* A capture nobody can retake proves nothing.
  Rules: `R-AC` `R-AI` `R-BQ` `R-CZ` `R-DQ` `R-IJ` `R-JP` `R-KC`

- **x-captures.2** A forced-write table is proven by a bracket: a perturbation cohort (when a guard includes the step's own stamp), delete-and-reinsert (INSERT-only), or derived-status (derived targets), counted through gate G's `count_path`. A PRE taken with a retired input argv stands in only under a closed predicate.
  *Why:* A rerun that writes nothing proves nothing about a guarded write path.
  Rules: `R-AS` `R-BD` `R-BR` `R-DN` `R-DP` `R-ET` `R-GZ` `R-JH` `R-KA`

- **x-captures.3** The golden differential is a mechanical fingerprint gate (G8, #38/#40). Every diff is explained only in `docs/reports/golden/<slug>/explained-diffs.json`, citing a Defect Ledger id; an unexplainable differential stops the work.
  *Why:* A commit message saying "diff is fine" is not evidence.
  Rules: `R-C` `R-DA` `K4` `G8` (SCORECARD-G8) `R-GR`

- **x-captures.4** A step that calls a paid or outside API is captured and replayed from committed recorded responses.
  *Why:* Tests and captures must not spend money or depend on someone else's uptime.
  Rules: `R-EL`

- **x-captures.5** A class-A behaviour (Spec 123 risk class A) is proven by a both-directions lock, shown red then green (scorecard G7; mutation testing is not a gate). Tests write before-images into a per-file sandbox, never the real golden tree. A live test proves its child process completed before asserting on its output.
  *Why:* A test that cannot fail, or that reads output that never arrived, proves nothing.
  Rules: `R-E` `R-CO` `R-CP` `G7` (SCORECARD-G7) · history: `M7` (SPEC121-M7)

### Cross-step order

How steps that share tables are ordered and checked.

- **x-crossstep.1** A same-statement write guard is not a chain-order edge. ORDER rows with neither endpoint converted and unproduced reads whose inserter is unconverted are counted against a shrink-only ceiling, not hard. Gate D reads one converted-set view.
  *Why:* The ledger stays strict for converted steps without blocking on legacy ones.
  Rules: `R-BN` `R-BO` `R-BP` `R-EE`

### step-validate and the scorecard

The one command that grades a step.

- **x-validate.1** One command grades a step: `node scripts/analysis/step-validate.mjs --step=<slug>` (or `--all`, `--staged`, `--fast`). It validates the DATA (descriptor, fast invariants) and the scorecard grades the PROCESS; it runs in the hooks, never as a separate track.
  *Why:* One integrated answer, the same at the desk and in the hook.
  Rules: `R-R` `Rule-13` `Rule-13-addendum-R-T`

- **x-validate.2** The scorecard gates G0–G9 (Spec 123 §6; aliases SCORECARD-G0…SCORECARD-G9, not the Gate E purity codes): G0 boundary freeze, G1 archaeology, G2 churn × complexity, G3 Intent Ledger (only tables with a Disposition column are scored), G4 risk class, G5 seam map, G6 classification with Defect Ledger ids, G7 test adequacy, G8 differential, G9 §R Reflection. Ship bar: ≥14/17 with G6–G8 full; with E3 on it is 17/17. Markdown header and separator rows are never counted as data.
  *Why:* The assessment is graded by machine, the same for every step.
  Rules: `R-F` `R-FA` `G0` (SCORECARD-G0) `G1` (SCORECARD-G1) `G2` (SCORECARD-G2) `G3` (SCORECARD-G3) `G4` (SCORECARD-G4) `G5` (SCORECARD-G5) `G6` (SCORECARD-G6) `G9` (SCORECARD-G9) `SHIP-BAR` `R-FB` `R-JD` `R-KM` `R-LC`

### The V3 label

What `standard=V3` means and how it is enforced.

- **x-v3.1** `standard=V3` prints only when all nine R-EY conditions hold, fail closed: (1) compute purity clean, (2) no gate-ledger allowance, (3) #44 PASS with nothing attributed, (4) no blocking registry failure, (5) no stage-gated red, (6) G0–G8 at max with no other hard stop, (7) the five words all PASS with nothing deferred, (8) no unmet `cutover_prereq`, (9) every exception naming the step cites a register id. Otherwise it prints `standard=V2 (fails: …)`. E1 (ratchet: a step that read V3 never drops) and E2 (cutover gate) are on; E3 (every converted step V3) is built off behind `gate_v3_hard_gate_enabled`. R-IH stage 1: `step-validate` prints an advisory `R-EY (9) why-only` line for each step with a deviation whose only register id is in `why`, plus a run total; no verdict changes until stage 3 reads `adjudicated_by` only.
  *Why:* One list replaces the older "five words", "six parts" and "four conditions"; the label means the same thing everywhere.
  Rules: `R-IH` `R-IK` `R-JC` `R-BA` `R-CN` `R-DT` `R-EY` `STD-VERSIONS`

- **x-v3.2** An operator decision found only in a plan or assessment (a pilot plan's rulings, an accepted deviation) is recorded as a register row before a step can cite it: the V3 condition-9 backfill recorded 33 such decisions as rows R-FI…R-GO (124a §B21/§B22), and each exception entry they govern cites its row. A citation on a converted descriptor's `deviations[]` entry is appended on the bundled RE-FREEZE night, because the edit moves the capture fingerprint. That night is split (R-II): night 1 carries the citations, and the refresh_snapshot producer-read waits for its own RE-FREEZE at permits ③.
  *Why:* Condition (9) needs a resolvable id on every exception, and a decision that lives only in a plan file is invisible to the gate.
  Rules: `R-FI` `R-FJ` `R-FK` `R-FL` `R-FM` `R-FN` `R-FO` `R-FP` `R-FQ` `R-FR` `R-FS` `R-FT` `R-FU` `R-FV` `R-FW` `R-FX` `R-FY` `R-FZ` `R-GA` `R-GB` `R-GC` `R-GD` `R-GE` `R-GG` `R-GH` `R-GI` `R-GJ` `R-GK` `R-GL` `R-GM` `R-GN` `R-GO` `R-II` `R-KG` `R-KH` `R-KV` `R-KX` `R-LE` `R-LS` `R-LT` `R-LU` `R-LV` `R-LW` `R-LX` `R-LY` `R-LZ` `R-MA` `R-MB` `R-MC` · history: `R-GF`

- **x-v3.3** An exception entry with no operator decision found (the condition-9 census class c) goes to the operator as a family ruling, recorded by decision log and register row like any other: the 2026-10-20 rulings are R-HN…R-HZ (V3 Exception Rulings page and chat CHAT-22) and the CoA cutover rulings R-IA…R-IF (R-IB and R-IC also cover enrich_permits' twin deviations, operator CHAT-24). A conversion retires a legacy audit row, `records_meta` key, constant row or log-only query only when the entry cites a consumer grep with zero readers or shows the counted mechanism is gone (R-HR, a named exception to Spec 123 §3.1); a legacy defect corrected inline is ratified per entry, never as a general rule (R-HQ). Citations on a fingerprint-locked descriptor ride the bundled RE-FREEZE night.
  *Why:* Condition (9) needs every exception to cite a ruling, and a family ruling with its evidence condition stated once is cheaper to check than one ruling per entry.
  Rules: `R-HN` `R-HO` `R-HP` `R-HQ` `R-HR` `R-HS` `R-HT` `R-HU` `R-HV` `R-HW` `R-HX` `R-HY` `R-HZ` `R-IA` `R-IB` `R-IC` `R-ID` `R-IE` `R-IF` `R-JE` `R-JK` `R-JL` `R-JM` `R-JU` `R-KE`

