#!/usr/bin/env node
'use strict';
/**
 * One-time generator: scripts/quality/assert-parcel-sanity.descriptor.json FROM
 * scripts/lib/assert-parcel-sanity-fields.js CHECK_DEFS + LOGIC_VAR_DEFS + DIST_DEFS.
 *
 * Not itself a step — a build tool, kept under scripts/, not scripts/quality/.
 * Re-run whenever the fields module changes:
 *   node scripts/generate-assert-parcel-sanity-descriptor.js
 *   node scripts/generate-assert-parcel-sanity-descriptor.js --check   (drift lock)
 *
 * `buildDescriptor(...)` is PURE (no I/O) except for the `distMeasured` argument,
 * which carries the real `last_measured` values captured once against the live DB
 * (assert-data-bounds/assert-global-coverage precedent: descriptor generation
 * itself never opens a connection).
 *
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §2
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10, §5.3
 */

const fs = require('fs');
const path = require('path');
const { RES, ZC } = require('./lib/assert-parcel-sanity-fields');

const OUT = path.join(__dirname, 'quality', 'assert-parcel-sanity.descriptor.json');
const DIST_MEASURED_PATH = path.join(__dirname, 'quality', 'generated', 'assert-parcel-sanity.dist-measured.json');

/**
 * The reduced, COUNT-only form of scripts/lib/step/plausibility.js's
 * buildDistributionQuery — one column (`viol`), so
 * capture-step-golden.js's invariantResult() (which requires exactly 1 row / 1
 * column) can execute it. Literal defaults for the 3 distribution logic
 * variables (percentile 0.99, median multiplier 3, median floor 0.0001) —
 * every other checks[]/plausibility[] `sql`/`bad` text in this fleet is
 * likewise a static string baked at descriptor-generation time; `sql` is never
 * re-rendered from a live config value.
 */
function buildDistCountSql(expr) {
  return `WITH base AS (SELECT id, (${ZC}) AS zc, (${expr})::float8 AS f FROM parcels WHERE ${RES} AND (${expr}) IS NOT NULL),
    stats AS (SELECT zc, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med,
                     percentile_cont(0.99) WITHIN GROUP (ORDER BY f) AS p99 FROM base GROUP BY zc)
    SELECT count(*)::int AS viol FROM base b JOIN stats s ON s.zc = b.zc
    WHERE b.f > s.p99 AND b.f > 3 * GREATEST(s.med, 0.0001)`;
}

function why(text, liveness) {
  return { text, liveness: liveness || 'none' };
}

function checkWhy(def) {
  return why(
    `${def.why} Ported verbatim from scripts/analysis/parcel-sanity-audit.js CHECKS[] — ` +
      `.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md §1/§2/§6.`,
    { kind: 'file', ref: 'scripts/analysis/parcel-sanity-audit.js' },
  );
}

// 24 declared columns (assert-parcel-sanity.js emitMeta) + 9 APS-D1 additions the
// compute's SQL actually touches (finding APS-D1, closed here — Nothing Hidden).
const PARCELS_COLUMNS = [
  'bylaw_max_coverage_pct', 'bylaw_max_fsi', 'bylaw_max_height_m', 'bylaw_max_stories',
  'coa_fsi', 'comp_fsi_p50', 'cost_addition_total', 'cost_coa_total', 'cost_fb_total',
  'cost_solar_total', 'cur_floor_gfa_sqm', 'depth_m', 'envelope_constraint_reason',
  'existing_greenspace_sqm', 'feature_type', 'frontage_m', 'id', 'lot_size_sqm',
  'max_build_fsi', 'max_build_height_m', 'max_build_length_m', 'max_build_stories',
  'max_build_stories_basis', 'max_build_width_m', 'max_buildable_footprint_sqm',
  'max_buildable_gfa_basis', 'max_buildable_gfa_sqm', 'opt_aor_gfa_sqm', 'opt_aor_storeys',
  'opt_coa_gfa_sqm', 'opt_coa_storeys', 'realized_fsi_p90', 'zoning_class',
].sort();

function buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS, DIST_DEFS, distMeasured) {
  const checks = CHECK_DEFS.map((def) => ({
    id: def.id,
    kind: 'bound',
    expect: { metric: def.id, loader: 'parcel_sanity', family: def.fam, field: 'viol', gate: !!def.gate },
    limit: 'viol == 0',
    severity: def.gate ? 'FAIL' : (def.sev === 'INFO' ? 'INFO' : 'WARN'),
    blocking: false,
    when: 'post',
    chains: ['sources'],
    accept_until: 'none',
    why: checkWhy(def),
  }));

  const configLogicVariables = [
    ...LOGIC_VAR_DEFS.map((v) => ({ name: v.name, min: v.min, max: v.max, on_invalid: 'fail' })),
    // Ask A6(a) — REUSED (one copy of the policy; parity-locked by
    // src/tests/logic-var-parity.logic.test.ts). Bounds mirror the canonical
    // scripts/seeds/logic_variables.json entries for these two names.
    { name: 'max_build_min_dimension_m', min: 0, max: 10, on_invalid: 'fail' },
    { name: 'mislink_footprint_lot_tol', min: 0, max: 1, on_invalid: 'fail' },
  ];

  const plausibility = DIST_DEFS.map((d) => ({
    id: `dist_${d.id}`,
    // `sql` is a REAL, standalone, single-row/single-column query (the reduced
    // COUNT-only form of runDistributionScan's own CTE, literal defaults for the 3
    // parcel_sanity_distribution_* constants) — required so
    // scripts/analysis/capture-step-golden.js's deriveInvariantSpecFromDescriptor()
    // (which executes EVERY invariants[]/plausibility[] entry's `sql` verbatim for
    // its own golden invariants.json snapshot, kind-blind) can run it. The LIVE run
    // does NOT execute this text: scripts/lib/step/plausibility.js's
    // runDistributionEntries() (kind:"distribution") gets the field EXPRESSION from
    // the compute module's own DISTRIBUTION_SCOPE.fieldExprById, not from here —
    // one declarative artifact serving two independent consumers without forcing
    // either to parse the other's format.
    sql: buildDistCountSql(d.expr),
    // The `ratio <= 3 x median` outlier rule (the median multiplier is a
    // parcel_sanity_distribution_* logic variable) is already fully applied
    // INSIDE runDistributionScan's own SQL by the time `viol` is measured — the
    // bound here is declared as "viol == 0" (evaluable, matching every other
    // row in this step) purely so checkRow renders the real outlier count
    // instead of "unevaluable" text. severity:"INFO" (F4) means neither
    // outcome of that comparison ever changes this row's status.
    bound: 'viol == 0',
    severity: 'INFO',
    blocking: false,
    when: 'post',
    source: 'plausibility',
    frequency: 'every_run',
    statement_timeout: 'none',
    zone_by: 'zoning_class',
    kind: 'distribution',
    last_measured: distMeasured[d.id],
    why: why(
      `Per-zone outlier visibility; INFO-only and never verdict-driving (F4) — outliers fluctuate on a 437,279-parcel set (legacy docblock, carried verbatim). Percentile/multiplier/floor are parcel_sanity_distribution_* logic variables consumed by the compute's SQL, not by this bound string (a name used by all 8 entries cannot be a 1:1 limit_from_config binding).`,
      { kind: 'file', ref: 'scripts/lib/step/plausibility.js' },
    ),
  }));

  return {
    identity: {
      name: 'assert_parcel_sanity',
      display_name: 'Parcel Sanity Profile',
      owner: 'data',
      description: 'Value-CORRECTNESS gate: zone-aware BOUNDS + cross-field INVARIANTS + per-zone DISTRIBUTION over all residential parcels. Complements assert_global_coverage (existence) — this answers "are the values correct?" 42 declared checks (21 HIGH/15 MED/6 INFO pre-conversion severities; 12 carry a FAIL-gate), 8 distribution visibility rows, 37 logic_variables (35 new + 2 reused from enrich-parcels.js).',
      lock: 107,
      why_lock: why(
        'Spec 47 §A.5 — assert family slot 107 (102-111), category "6 - Quality", writes-DB = NO (read-only Observer). Kept via identity.lock + the §5.4 source-text convention.',
        { kind: 'file', ref: 'docs/specs/01-pipeline/47_pipeline_script_protocol.md' },
      ),
      spec: '43',
      spec_version: '1.0',
      archetype: 'ASSERT',
      contract_version: 1,
      gate_exempt: true,
    },

    inputs: {
      reads: {
        // LDG-4 (batch2 P1.1, 2026-09-18): the folded scan reads many parcels columns
        // enrich_parcels writes (opt_aor_gfa_sqm, max_buildable_gfa_sqm, etc.), not
        // only compute_parcel_cost_estimates' own cost columns — both declared.
        steps: [
          { step: 'enrich_parcels', version_pin: 'none' },
          { step: 'compute_parcel_cost_estimates', version_pin: 'none' },
        ],
        tables: [{ table: 'parcels', columns: PARCELS_COLUMNS }],
        externals: [],
      },
      expect_nonempty: false,
      on_missing: 'halt',
    },

    outputs: 'none',
    recovery: 'none',
    counters: 'none',
    override: 'none',
    interpretation: 'none',

    staleness: {
      scope: 'none',
      trigger: [{ signal: 'always', position: 'pre_compute' }],
      mode_select: 'none',
      checkpoint: 'none',
      interval: 'none',
      fingerprint: 'derived',
      fingerprint_inputs: ['scripts/lib/assert-parcel-sanity-fields.js'],
      logic_version: 'none',
      on_fingerprint_change: 'queue',
    },

    guards: { requires: [], srid: 'none', empty_source: 'none', schema_drift: 'pause' },

    database: { class: 'primary', min_migration: 244, assert_current_database: 'postgres' },

    execution: {
      budget: '30m',
      txn_scope: 'none',
      txn_budget: 'none',
      chunked: false,
      statement_timeout: '25m',
      step_timeout: '45m',
      batch: 'none',
      needs_disk_mb: 'none',
      partial_fill: 'none',
      on_row_error: 'fail_fast',
      on_batch_error: 'fail_step',
      on_check_error: 'fail_step',
      on_degrade: 'none',
      criticality: 'required',
      network: 'none',
      maintenance: 'none',
      invocation: { sources: { argv: [], env: { PIPELINE_CHAIN: 'sources' } } },
    },

    checks,
    invariants: 'none',
    plausibility,

    emits: [
      { key: 'checks_passed', type: 'string', consumers: [] },
      { key: 'checks_failed', type: 'int', consumers: [] },
      { key: 'checks_warned', type: 'int', consumers: [] },
      { key: 'errors', type: 'array', consumers: [] },
      { key: 'warnings', type: 'array', consumers: [] },
      { key: 'config', type: 'object', consumers: [] },
      {
        key: 'audit_table',
        type: 'object',
        consumers: [
          'src/components/FreshnessTimeline.tsx',
          'src/components/DataQualityDashboard.tsx',
          'src/lib/admin/funnel.ts',
          'src/lib/quality/types.ts',
        ],
      },
    ],

    deviations: [
      {
        from: 'checks[].limit_from_config for the 35 new parcel_sanity_* magnitudes',
        why: why(
          'Rule 3\'s own 1:1 rule ("a name bound to more than one check is a validator-side finding") forbids limit_from_config here: several magnitudes are consumed by MULTIPLE checks (mislink_footprint_lot_tol by 4 invariants, parcel_sanity_gfa_coherence_tolerance_sqm by 2). Every checks[].limit is the structural constant "viol == 0" (the legacy step has no per-check numeric ceiling of its own — thresholds are magnitudes INSIDE the SQL predicate); the resolved config value is consumed directly by scripts/lib/compute/assert-parcel-sanity.js when it builds the one folded scan, and re-stamped into records_meta.config on every run (Nothing Hidden) exactly like a limit_from_config substitution would be — only the substitution SITE moves from the threshold string to the predicate text.',
          { kind: 'file', ref: 'scripts/lib/assert-parcel-sanity-fields.js' },
        ),
        adjudicated_by: '.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md §2 (Scoping decision)',
        date: '2026-09-18',
      },
      {
        from: 'plausibility[].kind:"distribution" was declared but not executed before this conversion',
        why: why(
          'step.schema.json already carried the kind:"distribution" enum value and its docblock named parcel-sanity-audit.js\'s DIST_FIELDS scan as the reuse target — no consumer existed. scripts/lib/step/plausibility.js gains runDistributionEntries() (Fold B-7 wiring) at commit 2b; the actual zone-BUCKET CASE expression (RD/RS/RT/RM/RA/R) is domain knowledge, not derivable from the descriptor\'s zone_by column name, so it is supplied by the compute module\'s own DISTRIBUTION_SCOPE export, read generically by scripts/lib/step/index.js for any future kind:"distribution" consumer.',
          { kind: 'file', ref: 'scripts/lib/step/plausibility.js' },
        ),
        adjudicated_by: '.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md §3 (Schema-trap gap 1)',
        date: '2026-09-18',
      },
      {
        from: 'the pop===0 -> INFO "inert" rule (D-E 4, F5) was scripts/analysis/parcel-sanity-audit.js statusFor()\'s, not verdict.js\'s',
        why: why(
          'scripts/lib/step/verdict.js checkRow() gained an opt-in observation.inert flag: when the compute reports {violations:0, inert:true} for a check whose applicable population is 0, the row renders INFO regardless of declared severity (closing the exact "green because it never looked" class Spec 121 12b.6 names). Every existing converted step never sets this flag, so the change is behaviour-neutral for the rest of the fleet — regression-locked by src/tests/steps/assert_parcel_sanity/violations.test.ts and the existing verdict.logic suite.',
          { kind: 'file', ref: 'scripts/lib/step/verdict.js' },
        ),
        adjudicated_by: '.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md §3 (Schema-trap gap 2)',
        date: '2026-09-18',
      },
      {
        from: 'the "residential_parcels_scanned" INFO population-context row was not a declared checks[]/plausibility[] entry',
        why: why(
          'scripts/lib/step/index.js gains a generic stepCtx.contextRow(row) seam (a compute-supplied literal audit row, bypassing checkRow\'s limit evaluation) so a population/context row can be preserved without inflating checks.length past the locked 42. Every existing converted step never calls it, so the addition is behaviour-neutral for the rest of the fleet.',
          { kind: 'file', ref: 'scripts/lib/step/index.js' },
        ),
        adjudicated_by: '.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md §1 (audit-row shape)',
        date: '2026-09-18',
      },
      {
        from: "checks[].limit_from_config on-invalid posture — Rule 3 default is 'fail' for a verdict-affecting var with no safe fallback",
        why: why(
          'All 37 logic_variables here carry a safe seed default (the exact pre-conversion literal). Recorded here only because the config object forbids a per-variable why field, mirroring assert_data_bounds/assert_schema/assert_global_coverage\'s own precedent deviation entry.',
          { kind: 'file', ref: 'scripts/seeds/logic_variables.json' },
        ),
        adjudicated_by: 'Spec 124 §2 Rule 3',
        date: '2026-09-18',
      },
    ],

    limitations: [
      {
        what: 'The distribution scan (8 entries) does not (yet) route through the EP-D17 statement_timeout ceiling mechanism executeEntry() gives ordinary invariants[]/plausibility[] bound entries — runDistributionEntries() calls runDistributionScan() directly with no SET LOCAL statement_timeout wrapper, preserving the legacy bare pool.query() behaviour byte-for-byte (Ask A3(a): byte-identical cost). Filed as a named follow-up (F-I3 sibling) rather than silently adding a new ceiling mid-conversion, which would be a behaviour change.',
        measured: 'scripts/lib/step/plausibility.js runDistributionEntries().',
        check_id: 'none',
      },
      {
        what: 'A standalone (no PIPELINE_CHAIN) run selects all 42 checks (chains:["sources"] is this step\'s only chain, so standalone and sources are equivalent — no per-chain divergence risk, unlike assert_data_bounds).',
        measured: 'scripts/manifest.json — assert_parcel_sanity appears only in chains.sources.',
        check_id: 'none',
      },
    ],

    config: {
      logic_variables: configLogicVariables,
      validation: 'strict',
      hoisted_above_gate: true,
      retired: [],
    },

    sharing: {
      chains: 'derived',
      shared: 'derived',
      slug_forms: 'derived',
      varies_by_chain: { checks: 'none', phase: { sources: 25 }, audit_table: 'one', scope: 'none' },
      on_contention: 'self_skip',
    },

    terminals: [
      {
        id: 'lock_held_elsewhere',
        kind: 'skip_lock_contention',
        status: 'self_skipped',
        records_meta: { skipped: 'bool', reason: 'string' },
        why: why(
          'The generic runner emits the declared lock_held_elsewhere terminal on advisory-lock contention, replacing the pre-conversion step\'s own hand-written skip emit (byte-identical records_meta shape: {skipped:true, reason:"lock_held", advisory_lock_id:107}).',
          { kind: 'file', ref: 'scripts/lib/step/index.js' },
        ),
      },
      {
        id: 'all_checks_passed',
        kind: 'success',
        status: 'completed',
        records_meta: { checks_passed: 'string', checks_failed: 'int', checks_warned: 'int', errors: 'array', warnings: 'array', audit_table: 'object', config: 'object' },
      },
      {
        id: 'parcel_sanity_gate_failed',
        kind: 'fail_check',
        status: 'completed',
        records_meta: { checks_failed: 'int', checks_warned: 'int', errors: 'array', warnings: 'array', audit_table: 'object', config: 'object' },
        why: why(
          'Non-halting by design (Spec 30 §5.4.1) — the legacy step never throws on a gate FAIL; a gate FAIL reddens the chain through the row-derived verdict, never an exception. Identical to assert_data_bounds\' data_bounds_check_failed terminal.',
          { kind: 'spec', ref: 'docs/specs/01-pipeline/30_pipeline_architecture.md' },
        ),
      },
    ],
  };
}

module.exports = { buildDescriptor, PARCELS_COLUMNS };

if (require.main === module) {
  const { CHECK_DEFS, LOGIC_VAR_DEFS, DIST_DEFS } = require('./lib/assert-parcel-sanity-fields');
  if (!fs.existsSync(DIST_MEASURED_PATH)) {
    console.error(`[generate-assert-parcel-sanity-descriptor] missing ${DIST_MEASURED_PATH} — run scripts/one-time/measure-assert-parcel-sanity-distribution.js first to capture real last_measured values.`);
    process.exit(1);
  }
  const distMeasured = JSON.parse(fs.readFileSync(DIST_MEASURED_PATH, 'utf8'));
  const descriptor = buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS, DIST_DEFS, distMeasured);
  const rendered = `${JSON.stringify(descriptor, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const committed = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (committed === rendered) {
      console.log(`[generate-assert-parcel-sanity-descriptor] clean — no drift (${descriptor.checks.length} checks, ${descriptor.plausibility.length} plausibility, ${descriptor.config.logic_variables.length} logic_variables)`);
    } else {
      console.error(`[generate-assert-parcel-sanity-descriptor] DRIFT — ${OUT} is stale relative to the live tree. Run \`node scripts/generate-assert-parcel-sanity-descriptor.js\` to regenerate.`);
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(OUT, rendered, 'utf8');
    console.log(`Wrote ${OUT} (${descriptor.checks.length} checks, ${descriptor.plausibility.length} plausibility, ${descriptor.config.logic_variables.length} logic_variables)`);
  }
}
