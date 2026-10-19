# Phase 4 wave 4 — `compute_coa_cost_estimates` (scripts/compute-coa-cost-estimates.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** MATERIALIZER (ARCH-CENSUS wave-4 row, operator y 2026-10-18, Q8). This is the archetype of its twin compute_cost_estimates (census MATERIALIZER, `step-archetype-census.json:178-182`), so both writers of `cost_estimates` share one archetype.
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes, shell and the seeds migration (275). Commit ③ is the cutover. MATERIALIZER has more than two full-form members in flight, so compressed is the default (#24).
**Commit ② waits on a library form.** The MATERIALIZER runner runs only a compute-authored `INSERT … SELECT` (`scripts/lib/step/index.js:2818-2847`). The runner-built row form is drafted in `.cursor/v3-materializer-form-ruling-2026-10-18.md` (Q-MZ). The wave-3 twin compute_cost_estimates needs the same form.
**Frozen legacy oracle:** `src/tests/steps/compute_coa_cost_estimates/fixtures/legacy-compute-coa-cost-estimates.js.txt`, byte-identical to the script (sha256 `801797aaf8d264a0…`, last changed by `fb593a9e`).
**Owner specs:** 42 (`42_chain_coa.md` §6.5 step 12, §6.6.D, §6.8 row 668) and 83 (`83_lead_cost_model.md` §3-ARCHETYPE, §Geometric-Only Path for CoA), per the SPEC LINK header at `:52-56`. Governing: 47, 48. **Target spec:** 42 (a census owner spec, R-DE (ii)).
**Chain:** `coa`, position 8 of 16 (`manifest.json:98`): after classify_coa_trades (its `lead_trades` and `trade_classified_at`), before link_coa.

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Source:** one `pipeline.streamQuery`, a 6-table LEFT JOIN with three LATERALs (`:446-531`, pinned L5/L6):
  - primary parcel by `confidence DESC NULLS LAST, parcel_id ASC`;
  - primary building by `building_id ASC`;
  - active trade slugs aggregated from `lead_trades`.
- **Cursor:**
  - incremental: `cost_classified_at IS NULL OR cost_classified_at < trade_classified_at`;
  - `--full`: `trade_classified_at IS NOT NULL`;
  - always: `AND (trade_classified_at IS NULL OR trade_classified_at <= RUN_AT)`, then `ORDER BY ca.id ASC`, plus `LIMIT N` under `--limit` (L7).
- **Flush:** one `pipeline.withTransaction` per 1000 CoAs (`INSERT_BATCH_SIZE = Math.min(1000, floor(65534/16))` `:88`; pinned L14). Order inside the transaction (L12):
  1. **`cost_estimates`:** a 16-column VALUES upsert `ON CONFLICT (lead_id) DO UPDATE … WHERE` any of 12 columns `IS DISTINCT FROM` (computed_at excluded from the guard), `RETURNING (xmax = 0)` (`:358-404`, pinned L9/L10). Only non-NULL estimates are written.
  2. **`coa_applications`:** `UPDATE … SET modeled_gfa_sqm, estimated_cost, cost_source, cost_classified_at = RUN_AT FROM (VALUES …) v WHERE ca.id = v.id` for **every** processed CoA (`:410-430`).
- **Retraction:** none. A CoA whose estimate becomes NULL keeps its old cost_estimates row (CCCE-D1, pinned L11).
- **Post-run reads on the pool:** `PERCENTILE_CONT(0.25/0.50/0.75)` over `coa:` rows with `computed_at = RUN_AT` (`:653-669`), and the corpus priced/total counts (`:678-688`), pinned L17. Both are skipped in dry-run (L8).

### 1.2 Columns written
- `cost_estimates`: lead_id, permit_num (NULL), revision_num (NULL), estimated_cost, cost_source, cost_tier, cost_range_low, cost_range_high, premium_factor, complexity_score, model_version (`MODEL_VERSION`), is_geometric_override, modeled_gfa_sqm, effective_area_sqm, trade_contract_values (JSONB), computed_at (RUN_AT).
- `coa_applications`: modeled_gfa_sqm, estimated_cost, cost_source, cost_classified_at (RUN_AT).

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 42, "CoA Cost Estimation", 32 rows in a pinned order (L19, `:748-808`).
- **FAIL:** `cost_estimate_coverage_pct <= coa_cost_coverage_fail_pct` (threshold text `> 5%`).
- **WARN:** coverage below `coa_cost_coverage_threshold_pct` (text `>= 65%`); `archetype_map_nofit_residential_pct > archetype_nofit_residential_warn_pct`.
- **INFO:** 0 processed gives coverage `N/A` and `coa_eligible` INFO (L16).
- **`records_new` / `records_updated`:** cost_estimates RETURNING. `records_skipped` = rows the guard short-circuited (L13).

### 1.4 Config, guards and knobs
- **ConfigSchema:** 15 required/optional variables (`:93-117`), validated before the lock (L1).
- **Startup guards inside the lock:**
  - the migration-145 `pg_constraint` probe (`:160-170`, L3);
  - empty `trade_sqft_rates` and duplicate rate/matrix keys throw (`:191-219`, L4).
- **Knobs:** `--dry-run`, `--full`, `--limit=N` (`:122-132`); the `ARCHETYPE_COST_DISABLED=1` kill switch (`:241`, L18).
- **Lock:** 4204 (L2).

### 1.5 Live table facts (A.F-DB, from the wave-4 plan's read-only SELECTs; no DB query in this lane)
- RLS on for `cost_estimates` and `coa_applications`, so `rls_bypass_or_policy` (R-CT).
- `cost_estimates`: 20,486 `coa:` rows. The PK is `lead_id` (migration 145).

### 1.6 Consumers and co-writers (effective ledger)
- **`cost_estimates`:**
  - readers: assert_data_bounds, assert_global_coverage, refresh_snapshot, assert_entity_tracing, compute_opportunity_scores;
  - writers: this step and compute_cost_estimates (permits; wave 3). The two writers share the table and partition it by key prefix (`coa:` vs `permit:`), so every write here is scoped `lead_id LIKE 'coa:%'`.
- **`coa_applications` cost columns:** readers assert_data_bounds, assert_global_coverage, refresh_snapshot (and this step's self-read).
- **Reads the enrich_parcels max-build family on `coa_applications`** (`opt_aor_gfa_sqm … max_buildable_footprint_sqm`, `:473-482`; emitMeta `:864-866`). That family is written by enrich_coa_zoning from the enrich_parcels columns. **This behaviour is kept exactly** (pinned L6, D3):
  - Spec 78 O-11 keeps the enrich columns unchanged until the shadow classifier (`.cursor/mcbylaws-airtight-summary-2026-10-18.md:84`);
  - QUEUE `.cursor/QUEUE.md:1120` records this step as a consumer that must migrate before any enrich column switch.

### 1.7 Admin visibility (R-DL)
- `PIPELINE_REGISTRY` ✓ (`FreshnessTimeline.tsx:61`).
- `STEP_DESCRIPTIONS` exists (`funnel.ts:687`), but its text "Geometric-only cost estimator" is false (CCCE-D9).
- **`PIPELINE_TABLE_MAP` has no entry.** It is owed at ② (CCCE-D9; carved out at ① by R-DV).
- `telemetry_tables` = cost_estimates, coa_applications ✓.

## 2. Behaviour ledger
The legacy pins L1–L20 in `src/tests/steps/compute_coa_cost_estimates/violations.test.ts` (GREEN at ①) execute the frozen text with the REAL Brain (`src/features/leads/lib/cost-model-shared.js`) and `scripts/lib/coa-cost-model.js`.

## 3. Registry target review
| Field | Target |
|---|---|
| archetype / shape | MATERIALIZER / `materialize`, `materialize_form: "rows"` |
| lock | 4204 |
| writes (declared order) | e1 `cost_estimates` A guarded_upsert (12 guard columns; computed_at `source:"run_at"` outside the guard), `retract:"none"` + why CCCE-D1, `key_prefix {lead_id, "coa:"}`; e2 `coa_applications` G keyed update (modeled_gfa_sqm, estimated_cost, cost_source; cost_classified_at run_at), unguarded (parity: legacy updates every processed row) |
| lookups | trade_sqft_rates (unique_on trade_slug, on_empty fail), scope_intensity_matrix (unique_on permit_type, structure_type), archetype_cost_rates (unique_on archetype) |
| guards.requires | index `cost_estimates_pkey` (CCCE-D4); rls ×2 |
| overrides | force_full (`--full`), dry_run; `--limit` retired (declared deviation) |
| reads | coa_applications incl. the 10 max-build columns (pinned), lead_parcels, parcels, parcel_buildings, building_footprints, neighbourhoods, lead_trades, trades |
| recovery.reset | NULL `cost_classified_at` for the run's scope |

## 4. PH-3 — Intent ledger
1. **Price each CoA.** Archetype ladder first: `tryArchetypeCost` over `buildCoaArchetypeInput`, which is T2 or nothing. If that returns nothing, fall through to the legacy geometric `estimateCostShared`, i.e. T4 (`:543-551`).
2. **Persist.** Write the estimate when it is non-NULL, and always advance the CoA's cost columns and watermark.
3. **Telemetry.** Null-reason priority and additive tallies; archetype tier counts; coverage gates.

## 5. PH-5 — Seam map
| Legacy site | Converted owner |
|---|---|
| `getDbTimestamp`, `Date.now` | runner RUN_AT / duration |
| zod ConfigSchema (`:93-117`) | `config.logic_variables` (R-CV); runner `failed_config_out_of_bounds` |
| argv / env knobs (`:122-132`, `:241`) | `override.force_full`, `overrides.dry_run`, `archetype_cost_enabled` (shared); `--limit` retired (CCCE-D3, Q-CE1) |
| mig-145 probe (`:160-170`) | `guards.requires` index (CCCE-D4) |
| reference reads and guards (`:173-219`) | runner lookups (CCCE-D5) |
| `streamQuery` (`:446-531`) | `buildSourceSql(mode)`; runner keyset over `coa_applications.id` with `$3` = RUN_AT for the future guard |
| per-row Brain call (`:533-645`) | pure `materializeRows` (the Brain closure unchanged) |
| `flushBatch` (`:313-436`) | runner ROWS arm: e1 A, e2 G, one txn per batch |
| percentile / corpus reads (`:653-688`) | `buildPostSql` (CCCE-D6) |
| coverage / nofit statuses (`:723-746`) | declared checks (CCCE-D7) |

**Parity notes:**
- **Keyset vs cursor:** this step is the only writer of `cost_classified_at`, and the future guard holds a later `trade_classified_at` out of both forms.
- **`--limit`:** retired. It is an operator debugging knob with no production caller (the manifest invocation passes none).

### 5.1 Risk class
**MEDIUM-HIGH:**
- a shared table with a sibling writer (prefix-partitioned);
- the 992-line Brain enters a gate-E G0 closure for the first time (wave-4 plan §B.2.6 note 3: waves 3 and 4 must agree on one scan result);
- the library form is pending.

## 6. PH-6 — Classification and defect ledger (rows CCCE-D1…CCCE-D10 in `docs/reports/defect-ledger.md`; prefix CCCE, the initials default, unique across all manifest slugs — fast invariant #42)

The rows are defined once, in `docs/reports/defect-ledger.md`; this list is the assessment-side summary.

- **CCCE-D1**: a stale cost_estimates row survives a NULL cost (legacy parity defect) — **declared deviation** (operator y, Q12); follow-up fix with its own capture
- **CCCE-D2**: batch / progress / percentile literals (EXTERNALIZED) — migration 275
- **CCCE-D3**: argv/env operator knobs (R-BD) — overrides plus a variable; Q-CE1
- **CCCE-D4**: catalog probe in the step (G3) — `guards.requires`
- **CCCE-D5**: reference reads and startup throws in the step (G2) — runner lookups
- **CCCE-D6**: post-run reads in the step; the percentile set excludes guard-skipped rows (parity) — `buildPostSql`
- **CCCE-D7**: the step decides coverage and nofit statuses (G7) — declared checks
- **CCCE-D8**: variable naming; two seeds missing from the JSON (R-DE (v), R-CV) — migration 275; shared family Q-C3
- **CCCE-D9**: false admin description; no table-map entry (R-DL) — ②
- **CCCE-D10**: constant `phase_h_gap_active: true` asserts a stale state (ACCURATE) — retired at ②

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | Site | Converted |
|---|---|---|
| `Math.min(1000, …)` batch | `:88` | `compute_coa_cost_estimates_batch_size` = 1000 (R-DE (i)); 65534/16 is the R-CU protocol limit |
| `PERCENTILE_CONT(0.25/0.50/0.75)` | `:657-659` | `compute_coa_cost_estimates_distribution_p{25,50,75}` pinned min = max (R-CV definitional form: the metric name `cost_distribution_p25_p50_p75` defines them), bound as parameters |
| progress `5000` | `:638` | retired with the shell |
| `'en-CA'` money format, `toFixed(1)` | `:697`, `:707-746` | display formatting, not a tunable (no decision reads it); kept, with a notes `constants` entry |
| `coa_cost_coverage_threshold_pct` (65), `coa_cost_coverage_fail_pct` (5) | seeds | re-seeded as `compute_coa_cost_estimates_coverage_{threshold,fail}_pct` (R-DE (v)); the old names retire at ③ |
| `ARCHETYPE_COST_DISABLED` env | `:241` | `archetype_cost_enabled` 0/1, default 1, a SHARED variable: the runbook flips it for both cost Muscles (`runbooks/83_archetype_cost_rollback.md:21`), so it joins the Q-C3 shared list with compute_cost_estimates (Q-CE1) |
| the shared cost-model family: liar_gate_threshold, model_range_pct, fallback_range_pct, urban/suburban_coverage_ratio, archetype_nofit_residential_warn_pct, archetype_t1_fsi_min/max, archetype_t1_total_cap, archetype_t2_reno_line_cap, archetype_t2_build_line_cap/min, archetype_t3_total_cap, cost_escalation_index | read by both cost steps and the Brain | **Q-C3** (shared-model arm, agreed with wave 3); `model_range_pct` / `fallback_range_pct` gain seeds JSON rows (CCCE-D8) |
| the Brain's module constants (`cost-model-shared.js`, 992 lines, 8 module numeric consts per the wave-4 plan §B.2.6) | closure | **Q-C4** PIN EXT-CLOSURE (outside gate E's compute-file scan, `compute-literals.mjs:152`) |

## 8. Purity estimate (gate E G0–G13, 122a §A26), against the converted compute
- **G1, G3–G6, G8, G10–G13:** 0 expected. The `pg_constraint` probe, the clock, the transactions and the DML all move to the runner. G13: the converted compute has no catch.
- **G2:** the source and post `*_sql` read only declared relations: the 8 source tables plus `cost_estimates` (post) and `coa_applications` (corpus).
- **G7:** 0 once the statuses move to declared checks.
- **G9:** 0 once the literals are config.
- **G0 closure:** `coa-cost-model.js` and `cost-model-shared.js` (no SQL by inspection; to be measured with `compute-purity.mjs --list` at ②).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- PRE: night P3, after classify_coa_trades' PRE (chain order).
- POST and #38: night P4. The bracket NULLs `cost_classified_at` on a priced `coa:` cohort.
- R-DP: the cohort's `cost_estimates` rows are deleted and reinserted (no inbound FK, per the wave-4 plan §B.4).
- Downstream replay: refresh_snapshot, assert_data_bounds, assert_global_coverage, compute_opportunity_scores, link_coa.

## 10. Red suite (PH-7) — `src/tests/steps/compute_coa_cost_estimates/violations.test.ts`
- **29 tests:** L1–L20 GREEN and D1–D9 `it.fails`.
- **Gate-K red evidence:** `docs/reports/red-evidence/compute_coa_cost_estimates/pre2-artifacts-missing.json` (D flipped: 20 pass, 9 fail).
  - D1–D7 fail as ENOENT on the named descriptor and compute.
  - D8 fails on the scorecard.
  - D9 fails on `converted[]`.

## 11. Registry at ① and what is owed later
- **At ①:**
  - `converted.json` pending at `red_suite`;
  - census UNDECLARED/C6 → MATERIALIZER/pending, owner_specs 42 + 83 (plus the two fixtures);
  - roadmap regenerated; `conversion-roadmap.infra.test.ts` re-pinned (pendingBatch 4 → 5, C6 33 → 32);
  - ADOPTION `legacy_oracle_excluded` (19/7/8);
  - CCCE-D1…D10.
- **R-DU:** non-blocking (no descriptor).
- **At ②:** descriptor, compute, shell, notes, migration 275 plus seeds JSON, PIPELINE_TABLE_MAP, STEP_DESCRIPTIONS, and the rollback runbook. All of it waits on Q-MZ (and Q-C3 / Q-CE1).
- **At ③:** blocked by EP-PIN-D17 (R-EA).

## 12. Operator decisions
**RULED 2026-10-18 (wave-4 plan, all 15 y):**
- Q8 MATERIALIZER;
- Q12 CCCE-D1 as a declared deviation;
- Q13 nights P3/P4.

**UNRULED, drafted:**
- **Q-MZ:** the MATERIALIZER ROWS form. **Recommend y.**
- **Q-C3:** the R-DE (v) shared-model arm (the cost-model family keeps its names, listed once with both cost steps and the Brain named). **Recommend y.**
- **Q-C4:** PIN EXT-CLOSURE for Brain constants. **Recommend y.**
- **Q-CE1:** knobs. `--full` = force_full; `--dry-run` = dry_run; `--limit` retired (declared deviation); `ARCHETYPE_COST_DISABLED` becomes the shared logic variable `archetype_cost_enabled` (0/1, default 1; the runbook flips it for both cost Muscles, `:21`, so it is decided with wave 3), with `docs/specs/01-pipeline/runbooks/83_archetype_cost_rollback.md` updated in the ② commit. **Recommend y.**
- **Q-CE2:** keep the coa_applications cost-column update unguarded (parity: every processed row advances its watermark). **Recommend y.**

## 13. Compliance table (seven questions, R-DF)
| Question | Answer at ① |
|---|---|
| STANDARDIZED | MATERIALIZER, the same archetype as its twin; precedents link_parcel_addresses (form) and compute_parcel_cost_estimates (`d79191cf` → `01a07218`, the JS Brain) |
| OBSERVABLE | L1–L20 / D1–D9; `step-validate compute_coa_cost_estimates` (red at red_suite, non-blocking per R-DU) |
| RECORDED | converted.json pending, census, CCCE-D1…D10, this report |
| SCALABLE | the ROWS form serves 4 members |
| ACCURATE | file:line; the real Brain in the oracle; red evidence |
| SIMPLE | the Brain is unchanged; only I/O and status decisions move |
| EXTERNALIZED | §7: batch, percentiles, kill switch, coverage names; shared family Q-C3; closure Q-C4 |

## 14. V3 package (Spec 124 `:275`, six parts) — state at ①
| Part | State | Evidence |
|---|---|---|
| (1) STANDARDIZED GATES | **OWED** (②); gate K MET | `docs/reports/red-evidence/compute_coa_cost_estimates/pre2-artifacts-missing.json`; R-DU non-blocking (`124:266`) |
| (2) REGISTRY | **PARTIAL**: pending ✓, census ✓, slug-keyed R-DL arms ✓ (`FreshnessTimeline.tsx:61`, `funnel.ts:687`, text false = CCCE-D9); PIPELINE_TABLE_MAP **OWED** | `scripts/steps/_schema/converted.json` |
| (3) CROSS-STEP TRUTH | **OWED**: `coa:` partition declared against the sibling writer; #44 after captures | §1.6 |
| (4) COMPUTE PURITY | **OWED** (②): draft compute uncommitted | `scripts/lib/compute/compute-coa-cost-estimates.js` (draft) |
| (5) EXTERNALIZED | **OWED** (②): migration 275 drafted; Q-C3/Q-C4/Q-CE1 open | `migrations/275_compute_coa_cost_estimates_logic_variables.sql` (draft) |
| (6) REPRODUCIBLE CAPTURES | **OWED**: P3/P4 | §9 |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **`--limit` retirement:** no caller was found in the manifest or chain invocation, but an operator runbook may use it. Check `runbooks/` at ②.
- **The percentile semantics (CCCE-D6)** look like an unnoticed legacy quirk. Kept for parity.

### RECURRING / STANDARD-SHAPING
- **Two writers of one table, partitioned by key prefix.** `key_prefix` (ruling §2 (d)) makes the partition a declared, runner-checked fact rather than a comment. compute_cost_estimates should declare `permit:`.

## A. Measurement log (2026-10-18)
- `shasum -a 256 scripts/compute-coa-cost-estimates.js` → `801797aaf8d264a0f55806fafa37223e5ac4c2bdc019b006dd6acf64403e9259`; last change `fb593a9e`.
- `defectPrefixFor`: CCCE → [compute_coa_cost_estimates] only.
- effective ledger: §1.6.
- Brain probe: the `priced()` fixture yields `archetype_parcel` 250000 (T2, `_archetypeTier` "t2"); `unpriced()` yields `cost_source` "none".
- `npx vitest run src/tests/steps/compute_coa_cost_estimates/violations.test.ts` → 29 passed; red evidence 20/9.
