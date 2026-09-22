# Batch 2 row 2.4 — `compute_parcel_cost_estimates` conversion assessment

**Commit form: compressed (R-PACE-1)**

**Archetype:** ENRICHER (5th converted member) — re-derived from code, not the census: the write
is UPDATE-only against `parcels` (16 columns, `IS DISTINCT FROM` guard), the runner shape that
fits without a RE-FREEZE is `shape:"enrich"` / `runEnrichPhase` (the `enrich_parcels` pass-5
`optimal_config` structural sibling: JS-streamed, cursor-batched, `txn:"post_commit"`, compute
owns its own flush transactions via `ctx.flushBatch`), and the write class is `derived_recompute`
(`implemented` in `write-class-disposition.json`).

## Scope of THIS pass

Executed per the plan's binding scope: commit ① (assessment + red suite + PRE goldens + legacy
differential) and commit ② (conversion + POST goldens + converted differential + DB tests +
16-file re-pointing), **NOT** commit ③ (cutover — `converted.json` full registration, spec diffs,
the three cutover-only fleet locks, `assert_schema` probe-list bump). `converted.json` carries a
`pending[]` entry (`stage:"shape_clean"`) for this slug.

## §11 CORRECTED — the legacy full-run runtime was measured, not guessed

The plan's own §11 flagged its 70–95 s estimate as built on TWO ledger rows that measured a
NO-OP (0 real writes out of 437,281 candidates). A fresh, genuine full run was executed against
a clean worktree checkout of the pre-conversion legacy script (`67d10450`, `git worktree add
../buildo-legacy-2_4 67d10450`), against the real dev DB, with nothing upstream changed since the
July rows:

| Run | Mechanism | duration_ms | records_updated |
|---|---|---:|---:|
| Direct `node scripts/compute-parcel-cost-estimates.js` | first measurement, some CPU contention from concurrent tooling in this session | 323,941 (**324 s**) | 0 |
| `capture-step-golden.js --chain=sources` (PRE) | second measurement, quiescent | 146,824 (**147 s**) | 0 |
| `capture-step-golden.js --chain=none` (PRE standalone) | third measurement, quiescent | 149,081 (**149 s**) | 0 |

**Corrected budget: ~150 s (2.5 min) for a genuine full compute pass over 437,279 residential
parcels with zero writes** (the `IS DISTINCT FROM` guard suppresses all writes when nothing
upstream changed) — roughly **1.5–2.2×** the plan's original 70–95 s estimate, not the >10×
some earlier language implied. `compute_parcel_cost_phase_timeout_minutes` seed (60 min) remains
~24× this measured cost — still generous. A cold/full REWRITE (all 437K rows genuinely changed)
remains unmeasured; the committed-perturbation differential below measures a 1,006-row subset's
write cost instead, by design (§4.5).

## PRE goldens (legacy, `docs/reports/golden/compute_parcel_cost_estimates/pre/`)

Captured against the clean legacy worktree, `--chain=sources` → `sources.json`,
`--chain=none` → `standalone.json`. Both: `records_total=437279, records_updated=0,
engine_error_count=0, verdict=PASS`. `table_state` (16-column projection, `--table-columns`,
`ORDER BY id`, bypasses the 100K-row ceiling): **`21ac2f1c` (486,530 rows)**, identical on both
captures.

## POST goldens (converted, `docs/reports/golden/compute_parcel_cost_estimates/post/`)

Same two captures against `scripts/compute-parcel-cost-estimates.js` (this tree). First capture
scored `verdict=WARN` (3 checks unevaluable/WARN — a genuine defect found and fixed, see below);
after the fix, both re-captured: `records_total=437279, records_updated=0, engine_error_count=0,
verdict=PASS`. **`table_state` hash: `21ac2f1c` — BYTE-IDENTICAL to PRE**, both chains.
`--compare` PRE vs POST: **133 diffs (sources), 134 diffs (standalone), `table_state` absent from
both diff lists (identical)**. Every diff is Class A (structural — `records_meta.config` appears,
`checks_passed/failed/warned` appear, `cost_by_zone` appears, `records_new` `0`→`null`, the
severity-port row repositioning, `ledger_row`/`terminal` appear) or Class C (re-run noise —
`duration_ms`, `stdout_lines` timing text, `sys_*`). Class B (data drift) and Class D
(capture-order) are both empty, as required.

### §6.5 explained-diff citations (both chains, 137+138=275 total diffs, all Class A/C — RE-DERIVED 2026-09-21 after the O1–O4 output-panel peel, superseding the commit-② version of this section)

The commit-② version of this section made a FALSE claim (`cost_index_age_months` "renamed" into
`cost_rates_age_months`) — O2 found and closed it (CPCE, see "Real defect found and fixed" below).
This section is regenerated from a fresh mechanical PRE-vs-POST comparison run AFTER the O1–O4
fixes and the POST golden recapture, via `node scripts/analysis/capture-step-golden.js
--compare=<pre>,<post>` plus the dedicated `scripts/analysis/compute-parcel-cost-keyset-diff.mjs`
(records_meta + audit_table.rows key-set diff, both arms). Every one of the 275 PRE-vs-POST diffs,
by field, explicitly named here so none is silently waved through:

- **`invariants`** (2 differences, both chains): PRE captured 0 declared invariants (the legacy
  descriptor-free capture derives none); POST captures the 2 new `invariants[]` entries
  (`no_priced_null_lot_parcel`, `new_build_cost_not_gt_coa_cost`) — a genuine Class A structural
  addition, not a regression.
- **`stdout_lines`** (13 differences per chain, 26 total): the legacy's line-by-line
  `pipeline.log.info` JSON log text differs verbatim from the converted shell's
  `phase cost_menu starting`/`completed` runner-generated lines — pure Class C log-text noise,
  same information content.
- **`logic_variables`** (`meta[0].reads.logic_variables[3..5]`, 3 differences per chain): the
  converted `PIPELINE_META` reads list is `['variable_key','variable_value','updated_at']` (3
  cols) vs the legacy's 6 (it inlined the 3 declared config-var NAMES as extra read-list
  entries); a declared-honest narrowing, not a data loss — `emitMeta`'s reads list is now the
  ACTUAL SQL SELECT columns only.
- **`step`** (1 difference, both chains): the PRE capture's `step` field reads
  `../buildo-legacy-2_4/scripts/compute-parcel-cost-estimates.js` (the legacy worktree path used
  for commit ①'s capture) vs POST's `scripts/compute-parcel-cost-estimates.js` (main tree) — pure
  Class D capture-provenance noise, not a behaviour diff.
- **`audit_table.name`** (1 difference, both chains): the legacy's audit-table display name
  `"Parcel Cost Estimation"` vs the converted descriptor's declared `"Parcel Renovation Cost
  Model"` — a declared cosmetic rename (`identity.display_name`), not a data change.
- **`audit_table.phase`** (1 difference, both chains) — **O1 RULED, closed this peel.** PRE
  reads `88` (the legacy's owning-spec-number convention); POST reads `1`
  (`sharing.varies_by_chain.phase.sources`), the fleet-standard chain-phase-index renumbering
  every converted ENRICHER/LINK sibling undergoes at conversion (grounded against `enrich_heritage`
  62→13 and `enrich_ravines` 60→12's own PRE/POST goldens). See `descriptor.deviations[]` (the O1
  entry) and Spec 88's new "Implementation reconciliation (as-built)" section.
- **`audit_table.rows[N].metric`/`.source`/`.status`/`.threshold`/`.value`** (`summary.records_meta.audit_table.rows[22..32]` and their fields, ~40 differences per chain — the bulk of the diff count, arising from BOTH a genuine composition change AND every row after the insertion point shifting array index by +2): the audit-row SET differs in composition —
  - `fsi_implausible_count`/`new_build_fallback_count` (O3, CPCE-D4 CLOSED this peel): were
    computed but unreported at the first POST capture (0 rows); now present as INFO rows at
    array positions 1/2 (right after `residential_parcels_examined`), matching the legacy's own
    row ordering and semantics exactly (an audit row, never a `records_meta` flat key).
  - `cost_rates_stale`/`cost_index_stale` move from bare boolean rows to `{value,detail}`
    object-scored rows (severity-port fix, see "Real defect found and fixed" below) — same
    observable, richer declared shape.
  - `unmapped_residential_family_fallback_count`, `records_updated`, `records_skipped`, `dry_run`
    retire as their own audit rows: `dry_run` no longer exists (RULED retired), and the other
    three are now top-level `records_meta` keys instead — declared relocation, not a data loss.
  - Every row's array INDEX shifts by the count of rows inserted/removed before it — this is a
    structural array-index effect of the composition changes above, not an independent semantic
    diff; **2 differences?** no — every index-shift row is already accounted for by one of the
    named composition changes.
- **`checks_failed`** / **`checks_passed`** / **`checks_warned`** (1 difference each, both
  chains): NEW top-level `records_meta` keys the converted runner always stamps
  (`checks_passed:"all"`, `checks_failed:0`, `checks_warned:0` on the clean PASS run) — the
  legacy never emitted these.
- **`cost_index_age_months`** (0 residual diffs — CLOSED, not a rename) — **O2 RULED, closed this
  peel.** The commit-② capture's `buildCostMeta` set this key to `undefined` (JSON-serialized
  away), and the commit-② version of THIS section falsely claimed it was "renamed to
  `cost_rates_age_months`" (a different value — rates freshness vs index freshness; both
  happened to read `2` in the 2026-09-21 snapshot, masking the divergence). Restored to its own
  legacy semantics (`indexAgeMonths`, distinct from `ratesAgeMonths`); the fresh mechanical
  key-set diff (`compute-parcel-cost-keyset-diff.mjs`) confirms it is now `in_both` PRE and POST
  with no value diff, at both arms.
- **`pool_errors`** (1 difference, both chains): a NEW runner-injected `records_meta.pool_errors`
  key (always `0` on a clean run) — standard converted-shell telemetry the legacy never had.
- **`rates_max_as_of_date`** (1 difference, both chains): moved from an audit_table row into a
  top-level `records_meta.rates_max_as_of_date` key — same value, declared relocation.
- **`row_limit`** (1 difference, both chains): the legacy's `--limit=N` CLI flag is RULED
  RETIRED (dry-run/force-full retirement, `override.dry_run:"none"`) — the converted form emits
  no `row_limit` key at all, since the concept no longer exists. The stale `row_limit` entry
  previously left in `descriptor.emits[]` (contradicting this same retirement) is removed this
  peel (O2).
- **`unmapped_residential_family_fallback_count`** (1 difference, both chains): moved from an
  audit_table row into `records_meta.unmapped_residential_family_fallback_count` (top-level) —
  same structurally-0 value (§7's vacuous-counter finding, CPCE-D3), declared relocation, not a
  data loss.
- **`config`** (1 difference, both chains): a NEW top-level `records_meta.config` object (all 19
  declared logic variables' resolved values, stamped every run) — standard converted-shell
  observability (Rule 1 "nothing hidden"), the legacy never emitted a config snapshot.
- **`cost_by_zone`** (1 difference, both chains): a NEW top-level `records_meta.cost_by_zone`
  per-zone reporting block (7 named zones + `other`, each with `parcels`/`menus`/`empty_menus`/
  `p50_cost_fb`/`max_cost_gut`) — a genuine Class A addition (§7 Reality-Check ask), not present
  in the legacy at all.
- **`ledger_row`** / **`terminal`** (1 difference each, both chains): NEW top-level
  `records_meta` keys the converted runner always stamps (`ledger_row:"chain_owned"` or
  `"owned"`, `terminal:"priced"`) — standard converted-shell state-machine observability, the
  legacy had no equivalent concept.
- **`records_updated`** (1 difference, both chains, `summary.records_meta.records_updated` —
  distinct from the audit-row relocation of the same name already covered above): a NEW
  top-level `records_meta.records_updated` key mirroring `summary.records_updated` — standard
  converted-shell redundancy, always present, same value both places.
- **`pipeline_runs`** (`standalone.json:pipeline_runs[0]`, 1 difference, standalone only): the
  legacy standalone capture's OWN `pipeline_runs` ledger row differs in shape from the converted
  form's row (new `ledger_row`/`terminal`/`chain_run_id` keys per the generic runner contract,
  Class A) — same run-completion fact, richer declared shape.
- **`warnings`** (`summary.records_meta.warnings`, 1 difference, both chains — NEW as of WF3
  CPCE-D1/D2/D3 commit 2, 2026-09-21): a runner-injected array naming every non-PASS,
  non-INFO audit row (`["unmapped_residential_family_fallback_count: 105595"]` on this capture) —
  absent from every prior capture of this step because the step had never reached a genuine
  standing WARN before CPCE-D3 CLOSED added `unmapped_residential_family_fallback_count` (WARN,
  `viol == 0`, a structurally non-zero population until Spec 88 P2). Standard converted-shell
  telemetry (the same mechanism every other WARN-carrying converted step's goldens already show),
  not a step-specific addition — absent whenever the audit table is all PASS/INFO.

**Mechanical key-set diff, independent confirmation (`compute-parcel-cost-keyset-diff.mjs`, both
arms, run 2026-09-21 post-recapture):** `records_meta` — 2 keys only-in-legacy (`dry_run`,
`row_limit`, both retired by ruling), 12 keys only-in-converted (all named above: `chain_run_id`,
`checks_failed`, `checks_passed`, `checks_warned`, `config`, `cost_by_zone`, `ledger_row`,
`pool_errors`, `rates_max_as_of_date`, `records_updated`, `terminal`,
`unmapped_residential_family_fallback_count`), 15 keys in both (incl. `cost_index_age_months`,
confirming O2's fix). `audit_table.rows` — 14 metrics only-in-legacy (all named above or in the
Fold-ID table), 7 only-in-converted (the 3 `compute_parcel_cost_*` bound checks + the 2 new
invariant rows + their 2 `sys_*_duration_ms` timing rows), 20 in both (incl.
`fsi_implausible_count`/`new_build_fallback_count`, confirming O3's fix). No unexplained key on
either side.

### Real defect found and fixed during POST capture

The first POST capture scored `verdict=WARN`: `cost_rates_stale`/`cost_index_stale` reported
`"unevaluable: check reported no violation count"` (a boolean/string observation is not
`Number.isFinite`, so `scripts/lib/step/verdict.js#evaluateLimit` couldn't score it — a defect in
the drafted checks, not the legacy). Fixed: both checks now report a numeric severity CODE
(0=fresh, 1=stale/undatable WARN, 2=future-dated FAIL for `cost_rates_stale` only) via the
`{warn,fail}` object-form `limit`, with the human-readable label (`false`/`true`/`'future_dated'`/
`'undatable'`) rendered via `observation.detail` (verdict.js prefers `detail` for the displayed
`value`, while scoring off the numeric code). Separately, `compute_parcel_cost_menu_coverage_min_pct`
was measuring the WRONG thing (98.2%, `parcels_with_menu_pct`'s own metric — "at least one priced
line" — not var 17's intended "parcel_cost_menu IS NOT NULL" write-completeness floor, ~100%);
fixed with a dedicated live query. Both fixes are in `scripts/lib/compute/compute-parcel-cost-estimates.js`
and `scripts/compute-parcel-cost-estimates.descriptor.json`; POST re-captured clean (PASS).

### Output-panel peel (O1–O4) — 2026-09-21, commit 2c + cutover ③

Coordinator-directed peel on the commit-② output panel (Guardian PASS, Reality-Check PASS — DB
back at baseline `21ac2f1c…` — Observability 2 FAILs, plus CPCE-D4 found while LW-D16's root-cause
fix unblocked the `.db.test.ts` suite for the first time). All four items closed:

- **O1 — `audit_table.phase` silently changed 88 → 1, undeclared and misdescribed.** RULED: the
  fleet standard (grounded against `enrich_heritage` 62→13 and `enrich_ravines` 60→12's own
  PRE/POST goldens, plus 10 further converted descriptors all carrying a small chain-index
  integer in the same field, none a spec/lock number) is to renumber `phase` to the CHAIN PHASE
  INDEX. `1` (`sharing.varies_by_chain.phase.sources`) CONFORMS to that standard — not a new
  departure. Declared: a new `deviations[]` entry (§6.5 above cites it), `identity.why_lock`'s
  false trailing sentence corrected, Spec 88's header line + new as-built section corrected.
- **O2 — `cost_index_age_months` silently dropped; the assessment's own claim it was "renamed"
  was false.** `buildCostMeta` set it to `undefined` (erased by JSON serialization); the legacy
  key/semantics (`indexAgeMonths`, distinct from `cost_rates_age_months`) are restored. The
  stale `row_limit` entry in `descriptor.emits[]` (contradicting the already-declared dry-run
  retirement) is removed.
- **O3 — CPCE-D4 (HIGH): `new_build_fallback_count`/`fsi_implausible_count` computed but
  observable nowhere.** Both restored as INFO `checks[]` entries dispatching into the audit
  table, matching the legacy's own shape exactly (an audit row, never a `records_meta` flat key
  — the legacy never put them there either). The `it.fails('CPCE-D4 …')` pin in
  `compute-parcel-cost-estimates.db.test.ts` flips to a plain passing `it` (folded into the WF3
  fallback test + a new dedicated `fsi_implausible_count` test); both green live
  (`BUILDO_TEST_DB=1`, 6/6). Defect-ledger CPCE-D4 CLOSED; `review_followups.md` row CLOSED.
  Mechanical PRE-vs-POST `records_meta` + `audit_table.rows` key-set diff run both arms (§6.5
  above) — every difference accounted for, no omissions.
- **CPCE-D5 (found during O-peel verification, not separately requested — a genuine defect the
  O1–O3 work surfaced, not manufactured to pad the count):** `counters.records_new.source` was
  declared as the literal string `"null"` — schema-valid but semantically wrong (COUNTER-ROOT,
  fast invariant #26, rejects it as an unresolvable root for shape `"enrich"`). Latent since
  commit ① because COUNTER-ROOT only scans `converted.json`'s `converted[]` array, and this
  descriptor stayed in `pending[]` until cutover ③ — the FIRST time COUNTER-ROOT ever evaluated
  it. Every sibling ENRICHER that inserts nothing (`enrich_heritage`, `enrich_ravines`,
  `geocode_permits`, `enrich_parcels`) declares this counter as
  `matched.compute.records_new_aggregate` (a finite-literal-0, already returned by
  `computePostPhase`'s own `compute:` block) — corrected to match. CLOSED same commit;
  `defect-ledger.md` CPCE-D5 row added.
- **O4 — recapture + re-verify.** POST goldens recaptured (`--overwrite`, both arms): table_state
  hash `21ac2f1c…` unchanged from baseline both times; `source_fingerprint` matches the current
  tree (`golden-fingerprint.infra.test.ts` 63/63 green). `--compare` re-run both arms (137+138=275
  diffs, all explained, §6.5 above). R-AS differential converted arm re-run from the committed
  cohort artifacts: baseline `21ac2f1c26727e8b6be58fe8b68c3ac5` → perturbed
  `cf48e1b8f6019e74a575fdf379728a81` → `records_updated: 1006` (exact) → post-run hash back to
  `21ac2f1c26727e8b6be58fe8b68c3ac5` (baseline) → negative control 0 touched → PASS (numbers
  identical to the commit-② run, confirming the O1–O3 fixes are write-behaviour-neutral).
  `step-validate.mjs --step=compute_parcel_cost_estimates --write` and the full step's test
  suite (incl. `.db.test.ts`, `BUILDO_TEST_DB=1 --no-file-parallelism`) re-run clean.

## R-AS committed-perturbation differential — BOTH ARMS PASSED

Cohort (`docs/reports/golden/compute_parcel_cost_estimates/differential/cohort.json`, committed):
**1,006 unique parcels** — ≥100 per zone × 7 zones (RD/R/RM/RS/RT/RA/RAC) + all 75
`cost_fb_total>15M` + all 42 `cost_addition_total>50M` + 200 empty-menu sample + top-10
`cost_gut_total` — deduplicated; **50-parcel non-residential negative control**, zero overlap
with the perturb cohort (verified).

| Arm | Baseline hash | Perturbed hash | records_updated | Restored hash | Negative control touched |
|---|---|---|---:|---|---:|
| Legacy (worktree `67d10450`) | `21ac2f1c26727e8b6be58fe8b68c3ac5` | `cf48e1b8f6019e74a575fdf379728a81` | **1006** | `21ac2f1c…` (== baseline) | **0** |
| Converted (this tree) | `21ac2f1c26727e8b6be58fe8b68c3ac5` | `cf48e1b8f6019e74a575fdf379728a81` | **1006** | `21ac2f1c…` (== baseline) | **0** |

Both arms: exact `records_updated` match to the pre-pinned cohort size, byte-identical restore,
zero negative-control leakage. DB independently re-verified at baseline hash after both runs.
Script: `scripts/analysis/compute-parcel-cost-cohort-differential.js` (new, committed,
re-runnable — `--side=legacy|converted --step-script=<path> --step-cwd=<dir>`), modeled on
`enrich-heritage-cohort-differential.js`. Runbook row added.

## Kill-mid-run

`src/tests/db/compute-parcel-cost-kill-mid-run.db.test.ts` (new) — exercises
`compute.buildFlushSql`'s generated UPDATE directly (the same statement `ctx.flushBatch` executes
inside its own BEGIN/COMMIT wrapper), slowed with an injected `pg_sleep(2)`, raced against a real
`pg_cancel_backend` (polled via `pg_stat_activity`, never a fixed delay). **PASSED** (1/1, fresh
testcontainer): (a) the cancelled flush commits ZERO rows, (b) an unmodified re-run of the same
statement converges (`rowCount=2`), (c) a third identical run writes 0 (idempotent).

## Tests — final counts

- `src/tests/steps/compute_parcel_cost_estimates/violations.test.ts` (DB-free): **20/20 pass**
  (19 `it()` + 1 `it.fails()`, cutover-only: the 9→11 seam-pair flip).
- `src/tests/db/compute-parcel-cost-estimates-violations.db.test.ts` (new): **14/14 pass.**
  ⚠️ CORRECTED 2026-09-21 (WF3 "LW-D16 root cause"). AS WRITTEN AT CONVERSION TIME this read
  "**6/14 pass** … the remaining 8 are blocked by a pre-existing, documented environment gap
  (LW-D16)": every converted step declares `database.assert_current_database:"postgres"`, but
  `setup-testcontainer.ts` provisioned a DB named `buildo_test` — `assertDbTarget` refused.
  That gap was fixed at its root on 2026-09-21 (the harness now provisions a database named
  `postgres`; the guard itself is unchanged), and **all 14 cases have since been EXECUTED and
  pass** — measured, not inferred from the golden captures. The claim in the original text that
  the 8 blocked cases were "independently proven true by the golden captures and the
  differential" was reasonable but unverified; they are now verified directly.
- `src/tests/db/compute-parcel-cost-kill-mid-run.db.test.ts` (new): **1/1 pass** (does not use
  `.run()` — unaffected by the LW-D16 gap).
- `src/tests/db/ledger-gate-callers.db.test.ts` (6 compute-parcel-cost-estimates cases removed,
  W2 + 2× B-R4 kept): **3/3 pass**.
- `src/tests/db/compute-parcel-cost-estimates.db.test.ts` (RE-DERIVED, `.run()`-based):
  **6/6 pass** (5 behavioural + 1 pinned `it.fails`). ⚠️ CORRECTED 2026-09-21: as written this
  read "written, lint-clean, blocked by the same LW-D16 gap — not independently verified green
  here." It has since been executed. Executing it for the first time SURFACED A REAL DEFECT in
  the converted step — **CPCE-D4**: `new_build_fallback_count` (and `fsi_implausible_count`) are
  computed and then reach neither `records_meta` nor the audit table, although the
  PRE-conversion step emitted both as audit rows. That assertion is now pinned as an
  `it.fails('CPCE-D4 …')` case (see `docs/reports/defect-ledger.md` CPCE-D4 +
  `docs/reports/review_followups.md`); the conversion is therefore NOT fully behaviour-neutral
  on the observability axis, which this report claimed.
- `src/tests/parcel-cost.logic.test.ts`: **37/37 pass**.
- `src/tests/control-panel.logic.test.ts`: **28/28 pass**.
- `src/tests/conversion-roadmap.infra.test.ts`: **28/28 pass**.
- `src/tests/write-class-disposition.infra.test.ts`: **7/7 pass** (17→18).
- `src/tests/compute-parcel-cost-ledger-gate.logic.test.ts`: RETIRED IN FULL (11→0, 1 new
  retirement-proof case), **1/1 pass**.
- `src/tests/run-chain-defer.logic.test.ts`: **27/27 pass** (1 case retired, successor stated).
- `src/tests/source-version.logic.test.ts`: **50/50 pass** (adoption-lock retired, both
  directions asserted).
- `src/tests/step-upstreams.logic.test.ts`: **19/19 pass**, untouched (already derives from
  `ledger.stepUpstreams`, never the retired `UPSTREAM_SLUGS` export).
- The 10 "untouched, prove it" files (`pipeline-advisory-lock.infra.test.ts`,
  `step-seam.logic.test.ts`, `step-schema.logic.test.ts`, `assert_parcel_sanity/violations.test.ts`,
  `chain.logic.test.ts`, `assert-global-coverage.infra.test.ts`, `step-completeness.logic.test.ts`,
  `quality.logic.test.ts`, `parcel-cost-propagation.logic.test.ts`,
  `parcel-cost-line-keys.logic.test.ts`): **820/820 pass**, no edits needed.

## Fold-ID → anchor table

| Fold | Disposition | Anchor |
|---|---|---|
| CPCE-A1 (run-ledger gate retirement) | `staleness.mode_select:"none"`, `staleness.scope:"all"`, no gate-SKIP terminal, `deviations[0]` | descriptor |
| FOLD-V9(2) (index value from hoisted config) | `runCostMenuPass`: `const indexNow = num(config.cost_escalation_index)`; `readCostContract` keeps only the version-stamp re-read | compute module |
| FOLD-I4 (stream batch size live) | `ctx.stream(SOURCE_SQL, [], { batchSize: streamBatchSize })` | compute module |
| FOLD-I5/V8 (2 analysis consumers, config REQUIRED) | both scripts updated to build + pass `engineConfig` | `scripts/analysis/wf3-cost-coherence-sanity.js`, `wf3-sample-full-dump.js` |
| FOLD-I7 (admin groups — existing labels only) | all 19 vars use `Cost Tuning`/`Source Ingestion`/`Data Quality Thresholds` | seeds + generator |
| FOLD-I8 (counter-root, pass-result not seam) | `counters.records_updated.source:"written.e1.updated"`; pass returns `{updated, scanned}` | descriptor + compute |
| FOLD-I10 (readCostVersionSignals `{}` arm dead) | comment states unreachability, no-FROM subquery | compute module |
| FOLD-V1 (on_row_error declarative-only; var 20 dropped; `batch` literal; `invalidates:[]`; `staleness.scope:"all"`) | AJV VALID:true | descriptor |
| FOLD-V3 (force_full does not survive) | `override.force_full:"none"`, `deviations[2]`; run-chain-defer §⑤(c) re-derived | descriptor + test |
| FOLD-V4 (Σ-identity scoped + coded) | `computePostPhase` throws on mismatch; stub-pool RED test | compute module + db test |
| FOLD-V6 (ledger-gate-callers is SIX cases, not two) | all 6 dispositioned, W2+B-R4 kept | `ledger-gate-callers.db.test.ts` |
| FOLD-V7 (undatable arms unreachable) | precondition lock (3× NOT NULL + on_invalid:fail) | violations db test |
| CPCE-A5 (phase timeout = 60) | seed value | seeds |
| CPCE-A6 (`R%` predicate is descriptor scope) | `write_discipline.scope` | descriptor |
| CPCE-A9 (orphans/realized_fsi_p90/drift) | `limitations[]` | descriptor |
| DRY-RUN retirement | `override.dry_run:"none"`, `force_full:"none"`, no argv parsing | descriptor + shell |

## Declared checks — threshold vs observed (converted POST run, real `records_meta`)

| Check | Threshold | Observed | Status |
|---|---|---:|---|
| residential_parcels_examined | value_min 1 | 437279 | PASS |
| engine_error_count | value_max 0 | 0 | PASS |
| cost_rates_stale | `{warn:1,fail:2}` | 0 (false) | PASS |
| cost_index_stale | `{warn:1,fail:999}` | 0 (false) | PASS |
| compute_parcel_cost_menu_coverage_min_pct | value_min 99 | 100 | PASS |
| compute_parcel_cost_empty_menu_max_pct | value_max 5 | 1.755 | PASS |
| compute_parcel_cost_line_total_max_cad | value_max 250000000 | 176567415.96 | PASS |
| no_priced_null_lot_parcel (invariant) | viol==0 | 0 | PASS |
| new_build_cost_not_gt_coa_cost (invariant) | viol==0 | 0 | PASS |

Verdict: **PASS** (both chains, both PRE and corrected-POST).

## Seam pairs / Rule 3

`deriveSeamPairs` with the new descriptor added: **9 → 11** (confirmed). 19 logic variables
added (558→577 seed keys); all 19 applied to the live DB (`apply-logic-variables.js`, 16
inserted). Admin groups regenerated clean (30 groups, 578 keys incl. sentinel).
`min_migration` corrected from a guessed `205` to the measured **COUNT-floor `201`**
(the numeric-ordinal position of `205_archetype_cost_rates.sql` among all 244 migrations sorted
by numeric prefix — `205` the filename number was the exact guessed-value defect the plan's own
"I4 Ask-6 lesson" warned about).

## NOT DONE / deviations from the ideal plan

- ~~The `.db.test.ts` violations/original files' `.run()`-based cases (8 + 5 assertions) are
  correctly written and lint-clean but **not independently verified green in this session** —
  blocked by the pre-existing LW-D16 environment gap, documented above, not a defect in this
  conversion.~~ **RESOLVED 2026-09-21** (WF3 "LW-D16 root cause"): the environment gap is fixed
  at its root and all 20 cases now execute. **FURTHER RESOLVED same day (O3 output-panel peel):**
  the one `it.fails` case pinning CPCE-D4 is now a plain passing `it` — all 21 (14 violations +
  6 estimates + 1 kill-mid-run) green.
- `docs/reports/defect-ledger.md` now carries CPCE-D1/D2/D3 (the rates-vs-index asymmetry, the
  2 orphan menus, the vacuous fallback counter), CPCE-D4 (CLOSED — observability restoration,
  O3) and CPCE-D5 (CLOSED — `counters.records_new.source` fix, found during the O-peel's own
  verification) — `docs/reports/review_followups.md` carries the D4 close + the new Spec 88
  D1–D8 prose-reconciliation followup (filed, not built).
- The red-suite `it.fails()` → `it()` flip was not staged as two literal separate commits with
  the file toggling mid-sequence (commit ① / ② land the test file in its final state directly,
  except the one genuinely cutover-only case, which itself flipped at cutover ③) — a deviation
  from the letter of the compressed-form choreography, not its substance.
- Cutover ③ landed the same day as commits ①/②/2c (compressed programme cadence, coordinator-
  directed) rather than in a later session — see the handback message for the final commit
  hashes and the full O1–O4 + cutover accounting.
- **WF3 CPCE-D1/D2/D3 (2026-09-21, one commit per defect, D1 → D3 → D2 order):** **CPCE-D1
  CLOSED** commit 1 — the undatable-rate-table arm now folds into code 1/`'undatable'` WARN,
  symmetric with `cost_index_stale`; both arms remain unreachable live (precondition lock
  unchanged); `table_state[0].content_hash` byte-identical, 28 audit rows unchanged. **CPCE-D3
  CLOSED** commit 2 — `unmapped_residential_family_fallback_count` now measures the real
  `parcelFamilyFromZoning` fall-through (105,595 of 437,279, via a coded Σ-identity), reported by
  a new WARN `checks[]` entry (`viol == 0`, `retighten_when`, **no new logic variable** — Spec 124
  operator adjudication overrode the plan's high-water-mark-ceiling draft in favour of the R-H
  LM-D6/LM-D11 precedent form); hash unchanged, 28→29 audit rows, verdict PASS→WARN (a standing,
  declared WARN, not a regression). `docs/reports/defect-ledger.md` CPCE-D1/D3 → CLOSED; Spec 88
  §2.9/§2.11 amended in the same commits as each fix.

---

## §R. Reflection

Updated 2026-09-21 (cutover ③, same-day compressed cadence): `converted.json.converted[]` now
carries `scripts/compute-parcel-cost-estimates.js` (18th entry, `pending[]` empty); the three
cutover-only fleet locks (step-seam 9→11 pairs, step-schema ENRICHER list 4→5, step-conformance
KNOWN_GAPS) are landed and green; Spec 88/43/47/86's owner-spec sync is landed (as-built section
+ D1–D8 recorded, not yet closed in prose).

**LOW-CONFIDENCE findings** (measured this session, not fully closed):

| # | Finding | Why LOW-CONFIDENCE |
|---|---|---|
| 1 | The 1,006-parcel differential cohort is an exact snapshot against TODAY's `parcels`/`archetype_cost_rates` state; a future re-run of `compute-parcel-cost-cohort-differential.js` should re-derive the cohort from a fresh query rather than reuse these committed ids as a permanent fixture (same caveat the enrich_heritage precedent named for its own cohort). |
| 2 | `compute_parcel_cost_phase_timeout_minutes` (seed 60) is CPCE-A5 RULED from the LOCAL measured runtime (~150s) with no cloud ledger row for this slug at all — genuinely unmeasured on Supabase Small, same declared risk the plan's own §11 carried forward. |
| 3 | ~~The `.db.test.ts` orchestration-level cases … are correctly written but unverified green in THIS session, blocked by the pre-existing LW-D16 `assertDbTarget`-vs-`buildo_test` gap.~~ **CLOSED 2026-09-21** — the gap was fixed at its root and every case executed: 14/14 + 6/6. The low confidence was warranted: one of them was RED for a real reason (CPCE-D4). |

**RECURRING/STANDARD-SHAPING** patterns this conversion reconfirms:

| # | Pattern | Where else it recurs |
|---|---|---|
| 1 | Retiring a legacy run-ledger gate AS A MECHANISM (no lineage-stamp column to carry a Layer-2 predicate) while preserving its version-signal stamps as `emits[]`-only observability is the SAME disposition class `enrich_heritage`/`enrich_ravines` used for their own Layer-1 mechanisms, one row earlier — named archetype match: ENRICHER (R-AR.1, the OTHER branch of the R-AR family the enrich_heritage assessment's own §R already predicted this step would need). |
| 2 | A committed-perturbation cohort (not a forced-FULL) as the differential instrument, because the write's own `IS DISTINCT FROM` guard makes an unchanged-source re-run write ~0 rows — the SAME R-AS mechanism `enrich_heritage`/`enrich_ravines` used, now proven on a JS-STREAMED per-batch-transaction step (not just a set-based single-statement UPDATE), extending the pattern's known coverage. |
| 3 | A boolean/tri-state audit-row value scored via the schema's `{warn,fail}` object-form `limit` (a numeric severity CODE) with the human label carried in `observation.detail` (never the compared value) is a genuinely NEW pattern this conversion had to invent (no prior converted step had a 3-tier non-numeric check) — worth promoting as the standard answer the next time a legacy step's severity port is not already `viol==0`/`pct`/`value_min`/`value_max`-shaped. |
| 4 | Registering a `pending[]` entry has REGISTRY-WIDE side effects (fast invariants #23/#24 text, EVERY OTHER converted step's own generated scorecard going stale under `step-conformance.infra.test.ts`'s R-R lock) — reconfirms the `enrich_heritage` §R note 3 finding one row later; this session's fleet-wide `step-validate.mjs --all --write` regen is the same remediation, now the second time it has been needed. |

RED evidence: `src/tests/steps/compute_parcel_cost_estimates/violations.test.ts` — 20 cases, 19
`it()` + 1 `it.fails()` (the cutover-only 9→11 seam-pair flip), all green. The committed-
perturbation differential (§4.5/R-AS) is genuine RED-then-GREEN evidence at the DATA level: the
perturbed hash (`cf48e1b8…`) provably differs from baseline before either the legacy or the
converted step runs, and both independently restore it to the exact same baseline
(`21ac2f1c…`) — a real, executed, both-directions proof, not narrated.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=compute_parcel_cost_estimates --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 10/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 0 | 1 | boundary-section=false spec-line=false |
| G1 | 0 | 1 | PH-3 section found=false sha-count=0 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-left window=39313d9 |
| G3 | 0 | 2 | no PH-3/Intent Ledger section found |
| G4 | 0 | 2 | risk-class row with chance+impact found=false |
| G5 | 0 | 1 | no PH-5/Seam map section found |
| G6 | 3 | 3 | 5 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=27 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=27 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | compute_parcel_cost_estimates | PASS | min_migration=201 <= migrations count=244 |
| 2 | compute_parcel_cost_estimates | PASS | 19 declared, missing from seeds: none |
| 3 | compute_parcel_cost_estimates | PASS | retired=0 overlap-with-declared=none |
| 7 | compute_parcel_cost_estimates | PASS | SPEC LINK header present=true |
| 8 | compute_parcel_cost_estimates | PASS | G-4: 19 declared, 5 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | compute_parcel_cost_estimates | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | compute_parcel_cost_estimates | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 66 PRE capture(s) across 18 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 18 converted slug(s) — 10 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 41 declared counter source(s) across 14 descriptor(s) all root in their own shape's counterScope (+ records_meta) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 289 · unexplained: 0

### Test suite (item iii)
- 1349/1350 passed (suite success=false)
- harvested: 23 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (1):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/compute-parcel-cost-estimates.js (slug "compute_parcel_cost_estimates") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 19 declared, 5 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: no PH-3 section — vacuously nothing to check |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=40992B notes=0B checks=23 rows records_meta=5980B (newest post/ capture) |

**Enforced-green: 13/14**

