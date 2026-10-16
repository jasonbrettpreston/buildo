# Compliance proof: CP-S1 run-status pin (`op: "not_failed"`)

**Date:** 2026-10-14
**Worktree:** `Buildo-wt-purity-closeout` (branch `wf2/purity-closeout`)
**Operator ruling:** Q1 option (a), 2026-10-14.
**Domain:** Backend/Pipeline.
**68/69:** N/A (no by-law content).

## The change in one line
The closed pin-op set gains `not_failed`, valid only on stamp `pipeline_runs.status`. It replaces the last CP-S1 finding: the compute throw `enrich-parcels.js` `readZoningContract` #12c, "latest sources:load_zoning run FAILED — halting". After the change, a declared `staleness.pins[]` row is evaluated by the runner before any phase.

## Spec lines (quoted, file:line)

| # | Source | Quote | Verdict |
|---|---|---|---|
| 1 | Spec 124 Rule 10, `124_step_standard_policy.md:129` | "**10. The verdict is always derived from the declared checks' rows — never a parallel boolean, never a hardcoded literal.**" | REQUIRES it. The compute throw is a verdict outside the rows. The pin produces one row through `deriveVerdict`. |
| 2 | Spec 124 R-BZ, `124_step_standard_policy.md:246` | "Purity rows close on their seam's `programme-items.json` id (CP-S1…S5, CP-PLANA, CP-PERMITS) and are RED once that item is BUILT, SUPERSEDED or missing (C3)." | REQUIRES the last CP-S1 row to reach 0 before CP-S1 goes BUILT. This change does that. |
| 3 | Spec 122a §A26 G8, `122a_step_optimization_appendix.md:773` | "G8 \| `compute-halt` \| R-BZ \| A `throw` reachable from a declared `enrich_hooks.contract_read`/`defer_scope` export" | The #12c throw is exactly a G8 site. Removing it is the fix the code names. |
| 4 | Spec 122a §A26 C3, `122a_step_optimization_appendix.md:788` | "Such a row is RED when that item's `status` is `BUILT` or `SUPERSEDED` … green while `NOT_STARTED`/`PARTIAL`." | Delete the row in the same change that flips the item. |
| 5 | Spec 124 R-CB (S1-P), `124_step_standard_policy.md:248` | "S1-P (2026-10-13): `ctx.producer` / `readRunHistory` take an explicit closed `statuses` list per read, default the R-BG(iv) baseline; an activity or verdict read declares its wider terminal set in the descriptor pin (`staleness.pins[].statuses`), never the baseline." | PERMITS and SHAPES it. #12c is a verdict read, so the new pin declares the full terminal `statuses` set in the descriptor (the schema makes it required for this op). |
| 6 | Spec 122 §8 RE-FREEZE #34, `122_pipeline_step_optimization.md:1175` | "**Producer pins (S1-P, R-CB):** a closed `op`, plus `statuses`, `meta_object` and `bound`/`of`/`limit_from_config`, with if/then exclusions." | The op set is CLOSED and schema-frozen. Growing it needs a numbered RE-FREEZE entry. Precedent: RE-FREEZE #9 (`:1120`, "`execution.shape`'s `x-frozen` enum gains a TENTH value") and #18 (`:1138`, "one additive enum value on the FROZEN `columns[].written`"). This change follows that process. Owed at landing: a RE-FREEZE #35 entry and `template-freeze --refresh`. |
| 7 | `scripts/lib/step/producer.js:8-10` (S1-P library header) | "It NEVER throws: Rule 10 (124:129) says a producer-contract violation is a DECLARED check row through `deriveVerdict` — never a compute throw" | A failed latest producer run is a producer-contract violation, so it belongs in a pin row. |

**Silence:** no spec line names a run-STATUS predicate. Every existing op reads a `records_meta` stamp. So a new row is proposed below; nothing contradicts it.

**Contradiction search:** I looked for a rule that says no, and none does.
- I grepped Specs 122 / 122a / 124 / 124a for "op set" / "PIN_OPS" / "closed op".
- The only "stays closed" statement is the S1-P-6a header comment (`producer.js:31`, "The `op` set stays CLOSED (`equals|nonzero|true`, unchanged)"). That is a code comment about the `bound` arm. It is not a spec rule. A closed set grows by RE-FREEZE (row 6), and this change updates that comment and the two tests that pin the set.

## Behaviour delta vs the old #12c probe (measured, dev DB, SELECT only, 2026-10-14)

| Aspect | Old probe (compute) | New pin (runner) | Measured / why acceptable |
|---|---|---|---|
| Runs read | every terminal status | the declared `statuses` = all 6 terminal | identical |
| Order | `started_at DESC, id DESC` | the pin read's existing default `completed_at DESC, id DESC` | 0 of 2,342 terminal `pipeline_runs` have NULL `completed_at`. The latest load_zoning terminal run is id 2637 under both orders. No new read field added. |
| warn-skip (`write_skipped_pre_write_warn`) runs | included | excluded (the shared predicate R-CB adopts) | Such a run is never `failed` and wrote nothing, so the tables are still in the prior run's state. Skipping it can only add a halt, never remove one (more conservative). |
| No terminal run | no halt (fell through to #12d) | MISSING → FAIL row, halt | #12d's pin already halts in this case (no baseline run), so the step outcome is unchanged. |
| Read error | throw (fail closed) | ERROR → FAIL row, halt | same outcome, now a row |
| Where | inside the contract_read hook | `measureProducerPins`, before any phase | earlier, declared, row-derived |

## Five-words check (Spec 124 R-BA)
- **STANDARDIZED:** one value added to an existing closed enum, with the same pin shape and the same evaluator. No new field, no new read option.
- **OBSERVABLE:** a declared audit row `producer_pin_load_zoning_pipeline_runs_status_not_failed` carries `producer_run_id` and `producer_status`. Before, it was a thrown message with no row.
- **SCALABLE:** any step can declare it in its descriptor, with no per-step code.
- **ACCURATE:** the same runs are read and the order is equal on live data (measured). The delta is only more conservative.
- **UNDERSTANDABLE:** the halt is declared in the descriptor with a `why`, beside the other load_zoning pins.

## What it replaces
- `scripts/lib/compute/enrich-parcels.js` `readZoningContract`: the #12c `ctx.producer(…{statuses:'terminal', orderBy:'started_at', excludeWarnSkip:false…})` read plus its `throw`. Both are deleted.
- Ledger row `compute-halt@js:throw new Error(\`${TAG} latest ${PRODUCER_NAME} run FAILED …\`)#1` (closing_brief `CP-S1`) is deleted.

## Rows to add (Spec 124 §5; the orchestrator reserves the id)
> | (id) | **A pin may test the producer run's terminal status: op `not_failed` (operator 2026-10-14, CP-S1 #12c).** The closed pin-op set gains one value, `not_failed`, valid only on stamp `pipeline_runs.status`. The schema forbids `equals` and requires `statuses` (a verdict read declares its terminal set, S1-P). It reads the pin's declared run through the existing pin read (declared `statuses`, newest by `completed_at`, warn-skip excluded; no new read field). It is FAIL when that run's status is `failed`, and MISSING/ERROR like every pin. A FAIL row halts before any phase (`measureProducerPins`, Rule 10). Replaces enrich_parcels' #12c compute throw ("latest load_zoning run FAILED"). RE-FREEZE. | Amends: R-CB (S1-P pin vocabulary); R-BZ G8 | `step-producer.logic`, `enrich-parcels-contract-pins.logic` |

Plus a Spec 122 §8 entry: **RE-FREEZE #35**, `staleness.pins[].op` gains `not_failed` (one enum value + one if/then rule).
