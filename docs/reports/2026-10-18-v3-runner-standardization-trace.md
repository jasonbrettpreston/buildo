# Runner lane — standardization trace (McDonald's Airtight V3), 2026-10-18

**Operator item 3 (20:30):** "ensure we are following the standardized approach for the runner — show following a ruling or add."
**Renumbered 2026-10-19 at the #37 re-apply (N1):** the integration branch took R-EF (W4A-R6 amended), so the LINK generalisation is **R-EG** and the MATERIALIZER ROWS arm is **R-EH**; next free R-EI.
**Method:** each runner decision built into RE-FREEZE #37 (D1–D5, Forks 1–4, EXT-2 counting) is traced to the rule it applies, with a file:line cite. Where a decision went beyond its rule, the code was brought back to the rule rather than a new rule being written (SIMPLE). New rows were written only where no rule covers the form. Worktree `~/Buildo-wt-runner` (wf2/p4-runner at 59570f46 + uncommitted #37).

## 1. Trace table

| Decision | Governing rule (cite) | Follows? | New row | Evidence |
|---|---|---|---|---|
| **D1** — Y-I1's `target` clause deleted with Y4 | R-DX (ii) (`124:256`, operator y ruling 2) names "0y Y4 and Y-I1's `target` clause (its schema twin)". RE-FREEZE #30 0y (`122a:657`) defines Y-I1 (schema) and Y4 (runtime) as the two halves of ONE refusal. Spec 122 §8: any schema change rides a RE-FREEZE (#37 entry, `122:1170`). | **Yes.** Keeping the schema half after deleting the runtime half would make the validator refuse what the runner accepts. The design note "(ii) adds no schema byte" was wrong. The row was already corrected. | — | `ingest-ckan-primary.logic` T3; `ingest-prereq-0y-schema` re-pinned |
| **D2a** — a union group skips only when every member skips; otherwise skipped members are re-acquired forced | RE-FREEZE #30 0y "the one skip" (`122a:657`): `skip ⇔ !forced AND every decision skips`, otherwise every primary is acquired. RE-FREEZE #29 0x (`122a:651`): each primary is gated against its own prior sub-block (`subKey`, B6), and an interrupted retraction forces every narrowed acquisition (T13). | **Yes.** It is the 0y one-skip applied to a group, with 0x per-member sub-blocks. | — | `index.js` union block; T4 |
| **D2b** — the union-level dataset version is the newest member's | 0x aggregate form (`122a:651`): per-primary truth lives in `acquired.primaries[id]`; the aggregate carries no per-dataset value (`emitBlock: null`). | **No.** "Newest" was invented with no rule behind it, and `Date.parse` silently picked the first member for non-date versions. **Fixed:** the union carries `source_dataset_version: null` (like `content_hash`). Each member's own version is under `primaries[id]` and on every row it wrote. | amends R-DX (iii) text | red T7 "expected 'v-active' to be 'v-closed'" → green |
| **D2c** — schema drift checked on the first member only | P3-C1 #33 (`index.js:6513`): `records_meta.acquired.record_fields[<external id>]`, checked per external id. | **No.** Member 2's header was never checked, and its baseline was overwritten with member 1's header. **Fixed:** each member is checked against its own baseline, and a paused drift on any member refuses the write. `recordFieldsMeta` now records each member's own header. | amends R-DX (iii) text | T7 drift rows `active:INFO, closed:WARN` |
| **D3** — `sqlLiteral`'s escaped-string arm is opt-in | R-EA (`124:259`, operator y ruling 6) names the opt-in arm. LG-22 (`write.js:928-937`) rejected widening `sqlLiteral` to a raw fragment because it would open every set_based target. The opt-in arm is an escaped constant, never a fragment, and `set_value` keeps its closed refusal. | **Yes** | — | `write-set-null-unless.logic` |
| **D4** — key types come from the catalog; USER-DEFINED / ARRAY refused | R-CX (ii) (`124:231`): column facts come from `ctx.catalog`, loud refusal before SQL. R-DY (a) (operator y ruling 3) says "key types from the catalog, R-CX (ii)". | **Yes.** Recorded gap: the older declared `key_sql_type` (single key, departure DELETE) is a second typing source on the same target. Not ruled here, so as not to widen scope. | R-DY (a) text + **PIN KEY-TYPE** (owner: runner lane) | `index.js:1599` refusal |
| **D5** — a single targetless primary that declares `modes` stamps `run_mode` or refuses U2 | R-DX (iv) (`124:256`): `modes` on any primary; zero selected members ⇒ U2; `run_mode` stamped. | **Yes.** A single primary is a group of one. The row now says so. | R-DX (iv) text | T5b |
| **Fork 1** — `failed_config_out_of_bounds` uses the existing config-throw path | R-DE (iii) (`124:238`): the runner-owned exits are `lock_held_elsewhere`, `failed_config_out_of_bounds`, `failed_missing_precondition`, `failed_acquisition`. | **Yes.** Existing terminal, no new one. | — | `config.js:137` |
| **Fork 2** — enrich_parcels' own declaration of `step_post_check_concurrency` removed | R-EB (a) (`124:260`): a runner-owned variable is resolved for every step, never step-declared. Rule 1 (one home). R-DE (v): step-owned names are `<slug>_<name>`, so a `step_*` name is runner-owned. | **Yes.** **Fixed the record:** R-DR still listed the two post-check ceilings as opt-in. It now carries the standard *(Amended by R-EB …)* note. | R-DR amended-by note | `step-conformance.infra` R-DR lock |
| **Fork 3** — `step_post_check_statement_timeout_minutes` stays opt-in | EP-D17 (`index.js:7100-7112`, WF3 2026-09-10): it externalises only for the declaring step; the fallback is the step's own declared `execution.statement_timeout`, not a literal. R-DR's opt-in posture. | **Yes** | — | `step-library.logic` EP-D17 |
| **Fork 4** — the audit-value cap applies where audit values are persisted | R-EB (F) (`124:260`): "a persisted cap is a const and stays a finding". LM-D16 persisted-cap origin (`verdict.js:359`). | **Yes** | — | `verdict.js:405` refusal |
| **EXT-2** — the ratchet counts classified findings, not raw literals | R-EB defines a finding as a literal outside categories A–F. The high-water-mark precedent (`admin-unclassified-high-water-mark.json`) counts classified items. | **Yes.** A raw count would ratchet on allowed categories (a radix 10, an exit code 2). | — | `estate-literal-high-water-mark.json` (128 findings / 312 raw) |

**Result:** 10 decisions. 8 follow an existing rule as built. 2 had drifted from their rule (D2b, D2c), and the code was brought back to the rule with a red-first lock. No new Spec 124 row was needed for Part 1. The changes are in-place amendment text to R-DX (iii)/(iv), R-DR and R-DY (a), plus PIN KEY-TYPE.

## 2. Wave-4 rulings, split library / step-local (operator item 4 = y)

| Ruling | Kind | Disposition |
|---|---|---|
| **Q-MZ** MATERIALIZER ROWS arm | LIBRARY | **Built into #37 as R-EH.** Schema, validate.js `materializeRowsFindings`, write.js generators (`buildReplaceKeysSql`, `buildKeyedUpdateFromRowsSql`, guarded upsert honours `guard:"none"`), `runMaterializePhase` ROWS arm. `materialize-rows.logic` T1–T10, `db/materialize-rows.db` T11 (S5). |
| **Lane B request 9** LINK generalisation | LIBRARY | **Built into #37 as R-EG.** Counter names, compute binds, optional E1 clear, link-change binds. The vanished-lead sweep reuses class B's `departed` vocabulary. `link-phase-general.logic` L1–L5. |
| **W4A-R4** CCS "by:seen" invalidator + written:"seen" | Existing forms; **no library change** | (a) The invalidator is the existing §6.3 watermark pin: load_coa declares `invalidates {coa_applications.scope_classified_at, by:"pin"}` and CCS declares `staleness.pins {step: load_coa, stamp: coa_applications.last_seen_at}`. This is the link_massing → enrich_parcels precedent (`link-massing.descriptor.json` invalidates[0]; `enrich-parcels.descriptor.json` pins[0]); #44 (i) resolves it. A new `by:"seen"` value is rejected because the existing form covers it (SIMPLE). (b) `scope_classified_at` is a `source:"run_at"` stamp column (the geocode_permits `geocoded_at` precedent). CCS is an ENRICHER, so its change-guarded classifier UPDATE is compute SQL through `ctx.exec` (R-CA (ii)). R-DZ `seen` stays INGESTOR-only. **Step-local** to load_coa (w1c) and CCS (w4a) at their ②. |
| **W4A-R5** `contextRow` into `STEP_CTX_KEYS` | LIBRARY (fix to LW-D11) | **Built.** LW-D11 says the list is "exactly the stepCtx literal's key set"; `contextRow` was missing. New lock `step-ctx-keys.logic` derives the literal's keys with the TypeScript AST and requires equality. No new rule. |
| **W4A-R6** stage-gate #30/#31/#40 before captures | Existing rule (R-K / R-DT) + ONE shared predicate | The gating itself already exists: `CAPTURE_DERIVED_REGISTRY_IDS` (`step-validate.mjs:3184`) excludes #30/#31/#38–#40 for a stage that excludes G8, and `--all` honours it. ACF ② was built at `runner_wired`, which enforces G8. It lands at `compute_ported` (the lane B enrich pair precedent), then `runner_wired` at the shell swap before P4. **Built (coordinator ask):** `stageAwaitsCaptures(stage)` (exported, pure), the one "awaiting captures" predicate. It is keyed on the DECLARED stage, never on whether a golden directory exists (an inferred second signal, Rule 1). It has the `(slug) => boolean` shape gate F's `checkScoreFloor(…, isStageGated)` already takes. **Not wired into T6 pending the coordinator's confirmation.** Lock: `step-validate-stage-captures.logic`. |
| **W4A-R3** `pipeline_timezone` exempt from R-DE (v) + **Q-C3** shared-variable list | LIBRARY (gate side) | **Built** as one R-DE (v) amendment: closed `SHARED_LOGIC_VARIABLES` (closed-bounds.mjs) with owner and measured consumers. Lock `r-de-vocabulary.logic` (v) shared arm. **Measured exception for lane C:** `model_range_pct` and `fallback_range_pct` have ONE consumer (compute_coa_cost_estimates), so they are step-owned and renamed `compute_coa_cost_estimates_*` in migration 275 (W4A-R1 form). |
| W4A-R1 rename by migration | STEP-LOCAL | Lanes' ② migrations (270/271/274/275). |
| W4A-R2 inclusive tiers; retire fail>warn | STEP-LOCAL | ACF descriptor: R-DC `value_max` + declared deviation (R-BD). |
| Q-C2 / Q-CE2 keep unguarded | STEP-LOCAL | Uses the existing V7 path: `guard:"none"` + `guard_why` + a `grandfathered.json` entry per target, citing operator y 2026-10-18. R-EH makes the unguarded upsert generatable. |
| Q-C4 PIN EXT-CLOSURE | PIN (no build) | Owner: taxonomy / cost-model module owners. |
| Q-CE1 flags → overrides; kill switch → shared variable | STEP-LOCAL | `archetype_cost_enabled` is on the shared list (consumers compute_cost_estimates, compute_coa_cost_estimates). |
| Q-CE3 inclusive coverage floor | STEP-LOCAL | R-DC form. |
| Lane B 1–4 | STEP-LOCAL | Link re-check every run, set-based fail_fast, Turf retired with a postgis guard, identity split: all in link_coa_to_parcels' descriptor/compute. |
| Lane B 5–7 | STEP-LOCAL | `database.min_migration` 204, contract_read producer reader, always-render `*_count_zero`. |
| Lane B 8 | PIN (gate lane) | G5/G7/G8 over shared `scripts/lib/` modules. |

## 3. R-DF seven answers (new rows)

| Row | STANDARDIZED | OBSERVABLE | RECORDED | SCALABLE | ACCURATE | SIMPLE | EXTERNALIZED |
|---|---|---|---|---|---|---|---|
| R-EG | match-plan-named counters (claim #149 form); class B `departed`; O4 keyed arm | L1–L5; `written.e<i>.retracted`; before-image | row R-EG; 122 §8 #37 | any LINK family | red L1–L5, cite per arm | 4 runner-only arms, 0 schema bytes | no literal (names, binds and scope are declared) |
| R-EH | A/F/G existing class letters; R-CX catalog types; V7 guard path | T1–T11; `written.e<i>`; `matched.lookups_empty` | row R-EH; 122 §8 #37 | 4 members across 2 waves | red T1–T8/T10, T9 green pin | 1 enum + 1 source block + lookup role + 2 generated arms | `batch_size_from_config`; R-CU slice limit |
| R-DE (v) shared arm | one closed map, consumers named | `vocab.config.logic_variables.<name>` items | R-DE (v) amendment | a new consumer adds itself | consumers measured by reader grep 2026-10-18 | one map | — |

## 4. No-conflict check (Specs 122 and 124)

- **R-BZ:** compute stays pure in every new arm. `materializeRows`, `primaryMatchBinds`, `buildSourceSql` and `finalizeMatched` return values or SQL text over declared relations; every query, transaction and clock read is runner-owned.
- **R-CY (iii):** every new seam receives `{config, descriptor}` (+ `run_at`, `lookups`).
- **R-DD / R-DE (i) / R-CU:** unchanged. ROWS batches at `batch_size_from_config`; the G update and A upsert slice by `pipeline.maxRowsPerInsert`.
- **V7 grandfather path:** honouring `guard:"none"` in codegen changes no existing statement. The only existing guarded_upsert with guard none is refresh_snapshot (`set_source:"compute"`, descriptive). A new unguarded target still needs a `grandfathered.json` entry.
- **resolveLinkGate (full_rescan refuses `retract:"all"`):** unchanged. The LINK `departed` sweep is disjoint by construction, so it does not reopen that hazard.
- **#44 witness attribution:** the new statements touch only declared tables, and the catalog reads are `catalog.js` literals already in the runner closure. No `CLOSED_RUNNER_TEMPLATES` entry is needed.
- **Spec 124 line budget:** 369 / 380. **Spec 122 bytes:** 191,351 / 215,733.

## 5. Output panel (Spec 08), on the finished #37 delta

**Round 1** (Reality-Check / Regression Guardian / Cross-read Adversary):
- **MAJOR (Reality-Check):** a G target with `guard: "is_distinct_from"` and `guard_columns: "all_declared"` rendered NO guard. It was silently unguarded. **Fixed:** `all_declared` expands to the non-clock set columns (LG-9). Lock T5b.
- **MEDIUM (Reality-Check):** a `batch_sql` whose last key does not advance would loop forever. **Fixed:** it is refused by name. Lock T5c (on the pre-fix code the case hung; it was killed and recorded).
- **Regression Guardian:** byte-identity holds. The LINK defaults (counter names, `[ids]`, `[lost_keys]`) and the insert-select arm (T9) are unchanged. `guard:"none"` codegen reaches no existing generated statement. The full suite shows only the expected staleness reds plus 5 re-pins: SC8 retract enum, two witness cites (index.js:6334 → :6600), the abort-site count 9 → 10, and the run-chain-defer `--full` check moved into `resolveRunMode`. All are applied; DeepSeek run 20261019T005930Z-0bd71354, each line checked.
- **Cross-read Adversary:** R-EH / R-EG / the 122 §8 text matches the code. Two clauses were added for the round-1 fixes.

**Round 2:** re-read the two fixes and the amended rows. No finding.
