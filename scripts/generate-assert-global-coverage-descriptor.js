#!/usr/bin/env node
'use strict';
/**
 * One-time generator: scripts/quality/assert-global-coverage.descriptor.json FROM
 * scripts/lib/assert-global-coverage-fields.js CHECK_DEFS + LOGIC_VAR_DEFS.
 *
 * Not itself a step — a build tool, per scripts/CLAUDE.md conventions (kept under
 * scripts/, not scripts/quality/, so it is never mistaken for a pipeline step; it
 * makes no manifest.json entry). Re-run whenever CHECK_DEFS/LOGIC_VAR_DEFS change:
 *   node scripts/generate-assert-global-coverage-descriptor.js
 *
 * `buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS)` is exported as a pure function
 * (no I/O) so the drift lock (below, and src/tests/steps/assert_global_coverage/
 * violations.test.ts) can regenerate the descriptor IN MEMORY — against the real
 * fields module for the "no drift" direction, and against a mutated fixture for
 * the "the lock is not vacuous" direction — without ever touching the committed
 * file except in the explicit `--check`/write CLI paths below (peel 8c,
 * commit-7 panel finding b).
 *
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10, §5.3
 */

const fs = require('fs');
const path = require('path');
const { phaseMapFor } = require('./generate-sharing-phase'); // #73: phase = manifest position, generated (MQ-B4 (a), fold 19)

const OUT = path.join(__dirname, 'quality', 'assert-global-coverage.descriptor.json');

function why(text, liveness) {
  return { text, liveness: liveness || 'none' };
}

// ---------------------------------------------------------------------------
// checks[] — pure per-def helpers (no shared state, safe at module scope)
// ---------------------------------------------------------------------------
function boundFor(def) {
  switch (def.builder) {
    case 'coverage':
      return { limit: 'pct >= 90', limit_from_config: 'profiling_coverage_pass_pct', warn_limit: 'pct >= 70', warn_limit_from_config: 'profiling_coverage_warn_pct' };
    case 'calibrated': {
      const out = { limit: 'pct >= 80', limit_from_config: def.passVar };
      if (def.warnLimitLiteral) out.warn_limit = def.warnLimitLiteral;
      else { out.warn_limit = 'pct >= 75'; out.warn_limit_from_config = def.warnVar; }
      return out;
    }
    case 'external':
      return { limit: 'pct >= 10', limit_from_config: def.passVar, warn_limit: 'pct >= 5', warn_limit_from_config: def.warnVar };
    case 'vocab':
      return { limit: 'pct >= 90', limit_from_config: 'vocab_coverage_pass_pct', warn_limit: 'pct >= 70', warn_limit_from_config: 'vocab_coverage_warn_pct' };
    case 'info':
    case 'distribution':
      return { limit: 'viol == 0' };
    case 'invariant':
      return { limit: 'viol == 0' };
    case 'scope_drift_warn':
      return { limit: 'viol == 0' };
    case 'scope_drift_retighten':
      return { limit: 'viol == 0' };
    default:
      throw new Error(`boundFor: unhandled builder ${def.builder}`);
  }
}

function severityFor(def) {
  if (def.severityOverride) return def.severityOverride;
  switch (def.builder) {
    case 'coverage': case 'calibrated': case 'external': case 'vocab': return 'FAIL';
    case 'invariant': return 'FAIL';
    case 'scope_drift_warn': return 'WARN';
    default: return 'INFO';
  }
}

function kindFor(def) {
  switch (def.builder) {
    case 'coverage': case 'calibrated': case 'external': return 'field_coverage';
    case 'vocab': return 'vocab_coverage';
    case 'invariant': return 'invariant';
    case 'distribution': return 'distribution';
    default: return 'field_coverage';
  }
}

function chainsFor(def) {
  if (Array.isArray(def.chain)) return def.chain;
  return [def.chain];
}

// -----------------------------------------------------------------------------
// Read-column derivation from CHECK_DEFS `field` labels. A label is a DISPLAY name;
// most are `<table>.<column>`, but some name a SQL result alias of the compute
// (scripts/lib/compute/assert-global-coverage.js), not a column. Gate #44 (a)
// compares the declared reads against the columns the SQL really reads, so an alias
// label resolves to the base columns its SQL reads (P1-C8a, 2026-10-03).
// -----------------------------------------------------------------------------
// `<base>_<enum value>` labels: a COUNT(*) FILTER (WHERE <base> = '<value>') alias.
const ENUM_VALUE_LABEL = /^(existing_structure_confidence|max_build_confidence|garage_permission|rear_suite_permission|max_buildable_gfa_basis)_(high|medium|low|as_of_right|coa_required|fsi|coverage_box|coverage_only)$/;
// Every other alias label -> the `table.column` reads of its SQL ([] = the statement
// reads no column of that table: a COUNT(*) or an information_schema count).
const PP_LINKED_GEOCODED = ['permit_parcels.permit_num', 'permit_parcels.revision_num', 'permits.permit_num', 'permits.revision_num', 'permits.latitude'];
const LABEL_READS = {
  'coa_applications.columns_present': [], // information_schema.columns count
  'permits.columns_present': [], // information_schema.columns count
  'coa_applications.days_since_latest': ['coa_applications.last_seen_at'],
  'coa_applications.duplicate_pks': ['coa_applications.application_number'],
  'permits.duplicate_pks': ['permits.permit_num', 'permits.revision_num'],
  'coa_applications.unclassified_count': ['coa_applications.lifecycle_phase'],
  'permits.unclassified_count': ['permits.lifecycle_phase'],
  'lead_trades.coa_rows': ['lead_trades.lead_id'],
  'lead_products.coa_rows': ['lead_products.lead_id'],
  'lead_parcels.coa_rows': ['lead_parcels.lead_id'],
  'cost_estimates.coa_rows': ['cost_estimates.lead_id'],
  'phase_stay_calibration.coa_rows': ['phase_stay_calibration.permit_type'],
  'cost_estimates.permits_covered': ['cost_estimates.permit_num', 'cost_estimates.revision_num'],
  'trade_forecasts.permits_covered': ['trade_forecasts.permit_num', 'trade_forecasts.revision_num'],
  'data_quality_snapshots.today': ['data_quality_snapshots.snapshot_date'],
  'engine_health_snapshots.today': ['engine_health_snapshots.captured_at'],
  'lead_analytics.rows': [], // SELECT COUNT(*) FROM lead_analytics
  'parcel_buildings.linked_parcels': ['parcel_buildings.parcel_id'],
  'parcels.with_centroid': ['parcels.centroid_lat', 'parcels.centroid_lng'],
  'permit_parcels.permits_linked': ['permit_parcels.permit_num', 'permit_parcels.revision_num'],
  // the three "(geocoded)" labels all report pp_linked_geocoded (permit_parcels JOIN permits WHERE p.latitude IS NOT NULL)
  'permit_parcels.match_type': PP_LINKED_GEOCODED,
  'permit_parcels.confidence': PP_LINKED_GEOCODED,
  'permit_parcels.linked_at': PP_LINKED_GEOCODED,
  'permit_trades.permits_with_active_trade': ['permit_trades.permit_num', 'permit_trades.revision_num', 'permit_trades.is_active'],
  'phase_calibration.rows_with_median': ['phase_calibration.median_days'],
  'tracked_projects.active': ['tracked_projects.status'],
};

// MQ-A9 (a) + compliance amendment A2 (fold 21 row 1; Spec 124 R-BJ / fold 9 C7-1): the engine-health
// freshness heartbeat (`engine_health_snapshots.today`: an INFO count of rows captured in the last 25 h, run
// only in the coa/permits branches) is that check's own measurement read → `checks[].reads`, never inputs.reads
// (no ordering edge). Scope = the ruled MQ-A9 row only. `data_quality_snapshots.today` stays in inputs.reads
// (MQ-A8 (a) settled it by the reorder; moving it would orphan the refresh_snapshot step read — amendment A2).
const HEARTBEAT_LABEL = /^engine_health_snapshots\.today$/;
function heartbeatReads(def) {
  const label = def.field || '';
  if (!HEARTBEAT_LABEL.test(label) || !Object.prototype.hasOwnProperty.call(LABEL_READS, label)) return null;
  const byTable = new Map();
  for (const ref of LABEL_READS[label]) {
    const [t, c] = ref.split('.');
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t).push(c);
  }
  return [...byTable.entries()].map(([table, columns]) => ({ table, columns: columns.sort() }));
}

// inputs.reads.steps — the UNCONVERTED producers of the read columns above (gate #44 (e),
// measured 2026-10-03 against the effective ledger). The 10 CONVERTED producers
// (compute_centroids, compute_parcel_cost_estimates, enrich_parcels, geocode_permits,
// link_massing, link_neighbourhoods, link_parcels, link_wsib, massing, parcels) are NOT
// declared: the lineage snapshot gives this step no converted producer, so declaring them
// would widen the LDG-4 KNOWN_GAPS ratchet — deferred to the FLEET-2 ordering-only home.
// The four RETIRED slugs (no manifest.scripts entry: assert_pre_permit_aging, classify_scope_class, classify_scope_tags, create_pre_permits) are not declared: the effective ledger drops them (MQ-C1 (a), FLEET-2), so declaring them is #44 (e) extra.
const READ_STEPS = [
  'backfill_realtor_permit_trades', 'builders', 'classify_coa_scope',
  'classify_coa_trades', 'classify_lifecycle_phase', 'classify_permit_phase', 'classify_permits',
  'classify_scope', 'close_stale_permits', 'coa',
  'compute_coa_cost_estimates', 'compute_cost_estimates', 'compute_opportunity_scores',
  'compute_phase_calibration', 'compute_timing_calibration_v2', 'compute_trade_forecasts',
  'enrich_coa_zoning', 'enrich_permits', 'link_coa', 'link_coa_to_parcels',
  'link_similar', 'permits', 'update_tracked_projects',
];

/** Leading column of a vocab triple's filter constant (applied by vocab-coverage.js in its WHERE). */
function filterColumn(filter) {
  const f = /^([a-z_][a-z0-9_]*)/.exec(filter || '');
  return f ? f[1] : null;
}

/**
 * Pure: builds the descriptor object from CHECK_DEFS/LOGIC_VAR_DEFS with no I/O
 * and no shared mutable state across calls (TABLE_COLUMNS is local to this call,
 * unlike the pre-peel-8c module-level version — safe to call twice in one process,
 * e.g. once with the real fields module and once with a mutated test fixture).
 */
function buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS) {
  // -------------------------------------------------------------------------
  // inputs.reads.tables — the 23 tables (assessment report §1.1 claim 6), columns
  // derived from every CHECK_DEFS `field`/vocabTriple reference (alias labels resolved via LABEL_READS / ENUM_VALUE_LABEL).
  // -------------------------------------------------------------------------
  const TABLE_COLUMNS = new Map();
  function addCol(table, col) {
    if (!table || !col) return;
    if (!TABLE_COLUMNS.has(table)) TABLE_COLUMNS.set(table, new Set());
    TABLE_COLUMNS.get(table).add(col);
  }
  function addTable(table) {
    if (!TABLE_COLUMNS.has(table)) TABLE_COLUMNS.set(table, new Set());
  }
  for (const def of CHECK_DEFS) {
    if (def.vocabTriple) {
      const t = def.vocabTriple;
      addCol(t.dataTable, t.dataColumn);
      addCol(t.vocabTable, t.vocabColumn);
      addCol(t.dataTable, filterColumn(t.dataFilter));
      addCol(t.vocabTable, filterColumn(t.vocabFilter));
      continue;
    }
    const m = /^([a-z0-9_.]+)\.([a-z0-9_*]+)/.exec(def.field || '');
    // 'entity_tracing.last_verdict' is a DISPLAY LABEL (p_step26), not a real table — the
    // underlying read is `pipeline_runs` (added explicitly below).
    if (!m || m[1] === 'entity_tracing') continue;
    if (heartbeatReads(def)) continue; // MQ-A9 (a): a check-home read, not inputs.reads
    const label = `${m[1]}.${m[2]}`;
    if (Object.prototype.hasOwnProperty.call(LABEL_READS, label)) {
      addTable(m[1]);
      for (const ref of LABEL_READS[label]) {
        const [t, c] = ref.split('.');
        addCol(t, c);
      }
      continue;
    }
    const enumValue = ENUM_VALUE_LABEL.exec(m[2]);
    addCol(m[1], enumValue ? enumValue[1] : m[2]);
  }
  // Query-only tables/columns not surfaced as a named field/value (§1.2 of the report).
  addCol('permit_type_classifications', 'permit_type');
  addCol('permit_type_classifications', 'class');
  addCol('pipeline_runs', 'records_meta');
  addCol('pipeline_runs', 'pipeline');
  addCol('pipeline_runs', 'started_at');
  addCol('information_schema.columns', 'table_name');
  addCol('information_schema.columns', 'table_schema');
  addCol('trades', 'id');
  addCol('trades', 'kind');
  addCol('product_groups', 'id');
  addCol('scope_intensity_matrix', 'structure_type');
  addCol('neighbourhoods', 'id');
  addCol('permit_products', 'product_id');
  addCol('permit_parcels', 'permit_num');
  addCol('lead_trades', 'lead_id');
  addCol('lead_products', 'lead_id');
  addCol('lead_parcels', 'lead_id');
  addCol('phase_stay_calibration', 'permit_type');
  addCol('phase_calibration', 'median_days');
  addCol('tracked_projects', 'status');
  addCol('trade_forecasts', 'permit_num');
  addCol('parcel_buildings', 'parcel_id');
  addCol('building_footprints', 'id');
  addCol('parcels', 'id'); // loadSourcesBranch has_bldg: EXISTS (... pb.parcel_id = p.id)
  addCol('parcels', 'zoning_enriched_at'); // loadSourcesBranch `enriched` denominator
  addCol('parcel_buildings', 'building_id'); // LEFT JOIN building_footprints bf ON bf.id = pb.building_id
  addCol('permits', 'lead_id'); // C6 lead_id integrity invariants (administrative drift + duplicate groups)
  addCol('data_quality_snapshots', 'snapshot_date');

  // `information_schema.columns` fails `definitions.tableName`'s `^[a-z_][a-z0-9_]*$`
  // pattern (no dot permitted) — a catalog-schema read, not a domain table; dropped from
  // the declared table list only at the very end, so every `addCol` above (including the
  // two explicit information_schema.columns entries) still runs against a live Set.
  TABLE_COLUMNS.delete('information_schema.columns');

  const READ_TABLES = [...TABLE_COLUMNS.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, cols]) => ({ table, columns: [...cols].sort() }));

  const checks = CHECK_DEFS.map((def) => {
    const bound = boundFor(def);
    const check = {
      id: def.id,
      kind: kindFor(def),
      expect: { step_target: def.stepTarget, field: def.field },
      limit: bound.limit,
      severity: severityFor(def),
      blocking: false,
      when: 'post',
      chains: chainsFor(def),
      accept_until: 'none',
      why: why(
        `Ported verbatim from scripts/quality/assert-global-coverage.js (pre-conversion) — ` +
        `${def.stepTarget} / ${def.field}. Report: docs/reports/2026-09-11-batch1-i1-assert-global-coverage-assessment.md §2.3 (row-builder census).`,
        { kind: 'spec', ref: 'docs/specs/01-pipeline/49_data_completeness_profiling.md' },
      ),
    };
    if (bound.limit_from_config) check.limit_from_config = bound.limit_from_config;
    if (bound.warn_limit) check.warn_limit = bound.warn_limit;
    if (bound.warn_limit_from_config) check.warn_limit_from_config = bound.warn_limit_from_config;
    const hb = heartbeatReads(def);
    if (hb) check.reads = hb;
    return check;
  });

  // -------------------------------------------------------------------------
  // config.logic_variables[] — 20 vars (6 pre-existing + 14 new, report §2.4), all
  // verdict-affecting -> on_invalid: "fail" (Rule 3).
  // -------------------------------------------------------------------------
  const configLogicVariables = LOGIC_VAR_DEFS.map((v) => ({ name: v.name, min: v.min, max: v.max, on_invalid: 'fail' }));

  return {
    identity: {
      name: 'assert_global_coverage',
      display_name: 'Global Data Completeness Profile',
      owner: 'data',
      description: 'Tier-3 CQA: field-level coverage profile across all permits/CoA/parcels-chain steps — 6 pre-existing + 14 newly-declared per-field logic_variables gate PASS/WARN/FAIL per metric, plus the C6 lead_id integrity invariant and the C3/C7 self-retiring enriched_status scope-drift pair.',
      lock: 111,
      why_lock: why(
        'Registered in Spec 47 §A.5 (row: docs/specs/01-pipeline/47_pipeline_script_protocol.md:1955), category "6 — Quality", writes-DB = NO (read-only probe). Kept via identity.lock + the §5.4 source-text convention.',
        { kind: 'file', ref: 'docs/specs/01-pipeline/47_pipeline_script_protocol.md' },
      ),
      spec: '49',
      spec_version: '1.0',
      archetype: 'ASSERT',
      contract_version: 1,
      gate_exempt: true,
    },

    inputs: {
      reads: { steps: READ_STEPS.map((step) => ({ step })), tables: READ_TABLES, externals: [] },
      expect_nonempty: false,
      on_missing: 'halt',
    },

    outputs: 'none',

    staleness: {
      trigger: [{ signal: 'always', position: 'pre_compute' }],
      mode_select: 'none',
      fingerprint: 'derived',
      fingerprint_inputs: ['scripts/lib/assert-global-coverage-fields.js'],
      logic_version: 'none',
      on_fingerprint_change: 'queue',
    },

    guards: { requires: [], srid: 'none', empty_source: 'none', schema_drift: 'none' },

    execution: {
      txn_scope: 'none',
      statement_timeout: 'none',
      step_timeout: '15m',
      batch: 'none',
      on_row_error: 'fail_fast',
      on_batch_error: 'fail_step',
      on_check_error: 'fail_step',
      on_check_error_why: why(
        'Mirrors assert_schema: the dispatch loop is the per-check error boundary — a throwing check reports {error} under its own id and every other check still runs; fail_step is the step-wide POLICY for a check the library could not evaluate at all (never PASS-by-default, Spec 122 §7.1).',
        { kind: 'file', ref: 'scripts/lib/step/verdict.js' },
      ),
      on_degrade: 'none',
      network: 'none',
      invocation: {
        permits: { argv: [], env: { PIPELINE_CHAIN: 'permits' } },
        coa: { argv: [], env: { PIPELINE_CHAIN: 'coa' } },
        sources: { argv: [], env: { PIPELINE_CHAIN: 'sources' } },
      },
      maintenance: 'none',
    },

    checks,

    invariants: 'none',
    plausibility: 'none',
    override: 'none',

    emits: [
      { key: 'checks_passed', type: 'string', consumers: [] },
      { key: 'checks_failed', type: 'int', consumers: [] },
      { key: 'checks_warned', type: 'int', consumers: [] },
      { key: 'errors', type: 'array', consumers: [] },
      { key: 'warnings', type: 'array', consumers: [] },
      { key: 'config', type: 'object', consumers: [] },
      { key: 'audit_table', type: 'object', consumers: ['src/components/FreshnessTimeline.tsx'] },
    ],

    deviations: [
      {
        from: 'Spec 122 §8.2 pilot table default write class for a coverage-profiling ASSERT (implied verdict_only)',
        why: why(
          'WD-1 (this batch\'s own write-class audit) ruled verdict_only RETIRED and structurally undeclarable under the ASSERT x-profile — outputs/recovery/counters forced "none". Matches assert_schema\'s own precedent deviation.',
          { kind: 'file', ref: '.cursor/wf5_wd1_write_class_audit_active_task.md' },
        ),
        adjudicated_by: 'WD-1 / Spec 122 §1.10 required-field profile',
        date: '2026-09-11',
      },
      {
        from: 'checks[].limit_from_config on-invalid posture — Rule 3 default is "fail" for a verdict-affecting var with no safe fallback',
        why: why(
          'All 20 logic_variables here ARE verdict-affecting and DO carry a safe seed default (the exact pre-conversion literal), so "fail" is the correct posture per Rule 3 — recorded here only because the config object forbids a per-variable why field (additionalProperties:false), mirroring assert_schema\'s own precedent deviation entry for the same reason.',
          { kind: 'file', ref: 'scripts/seeds/logic_variables.json' },
        ),
        adjudicated_by: 'Spec 124 §2 Rule 3',
        date: '2026-09-11',
      },
      {
        from: 'the pre-conversion LOGIC_VARS_SCHEMA\'s 3 cross-field .refine() ordering invariants (warn < pass for profiling/vocab, warn <= pass for cost) — a startup THROW on violation',
        why: why(
          'The checks[] config.logic_variables[] shape validates per-variable min/max only, not cross-field ordering. Reproducing the exact startup-halt behaviour needs a runner-level cross-field config validator this WF does not build (out of scope: no step.schema.json edit authorized). Accepted, documented gap: an operator who sets warn >= pass for one of these 3 pairs no longer halts the step at startup; the resulting checks would render nonsensically (a WARN unreachable or reached before PASS) but would NOT silently mis-score — visible as a plausibility anomaly on inspection, not a corrupted verdict.',
          { kind: 'spec', ref: 'docs/specs/01-pipeline/124_step_standard_policy.md' },
        ),
        adjudicated_by: 'commit 7 scope constraint (no step.schema.json edit authorized)',
        date: '2026-09-11',
      },
    ],

    limitations: [
      {
        what: 'A denominator that resolves to 0/null renders the check UNEVALUABLE (declared severity) rather than the pre-conversion INFO-on-null-denominator reading. Extremely unlikely at this DB\'s live scale (every denominator here is a live-population count in the tens of thousands to hundreds of thousands) but not structurally impossible.',
        measured: 'scripts/lib/compute/assert-global-coverage.js evalCoverageLike() — reports {value: null} on a zero/null denominator; scripts/lib/step/verdict.js evaluateLimit() treats a non-finite pct as unevaluable, which renders the check\'s declared severity rather than INFO.',
        check_id: 'none',
      },
      {
        what: 'A vocab-coverage check with vocab_size 0, or an unresolved triple (bad identifier / missing column / type mismatch / timeout / query error), renders the declared severity (FAIL) rather than the pre-conversion\'s forced WARN/INFO reading. resolveAndCountTriple() itself is unchanged and still never throws.',
        measured: 'scripts/lib/vocab-coverage.js resolveAndCountTriple() — {unresolved} marker; scripts/lib/compute/assert-global-coverage.js evalVocab() reports {value: null} on either condition, which verdict.js renders unevaluable at the declared severity.',
        check_id: 'none',
      },
      {
        what: 'The envelope_constraint_reason value distribution (pre-conversion: N dynamic per-value INFO rows) is reported as ONE declared distribution check whose detail carries every {reason, count} pair — a fixed check id is required for a static checks[] declaration.',
        measured: 'scripts/lib/compute/assert-global-coverage.js evalDistribution() — one check id, detail.by_reason array.',
        check_id: 'src_envelope_constraint_reason_distribution',
      },
    ],

    interpretation: 'none',

    recovery: 'none',
    database: { class: 'primary', min_migration: 241, assert_current_database: 'postgres' },
    counters: 'none',

    config: {
      logic_variables: configLogicVariables,
      validation: 'strict',
      hoisted_above_gate: true,
    },

    sharing: {
      chains: 'derived',
      shared: 'derived',
      slug_forms: 'derived',
      varies_by_chain: {
        checks: 'per_chain',
        phase: phaseMapFor('assert_global_coverage'),
        audit_table: 'per_chain',
        scope: 'per_chain',
      },
      on_contention: 'self_skip',
    },

    terminals: [
      {
        id: 'lock_held_elsewhere',
        kind: 'skip_lock_contention',
        status: 'self_skipped',
        records_meta: { skipped: 'bool', reason: 'string' },
        why: why(
          'The generic runner (scripts/lib/step/index.js) emits the declared lock_held_elsewhere terminal on advisory-lock contention — the pre-conversion step hand-rolled its own {skipped, reason, advisory_lock_id} payload with no audit_table at all (AGC-D7); library adoption closes that gap structurally.',
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
        id: 'checks_passed_with_warnings',
        kind: 'success',
        status: 'completed_with_warnings',
        records_meta: { checks_failed: 'int', checks_warned: 'int', errors: 'array', warnings: 'array', audit_table: 'object', config: 'object' },
        why: why(
          'MQ-A4 (a), registry-truth fold 19 (#75): a WARN row stands and nothing FAILED, so selectTerminal picks this success terminal by the real status (COMPLETED_WITH_WARNINGS) instead of all_checks_passed. It declares no checks_passed: the runner keeps the legacy semantics, checks_passed is \'all\' only when errors AND warnings are both empty (scripts/lib/step/index.js), so a WARN run never carries it.',
          { kind: 'file', ref: 'scripts/lib/step/index.js' },
        ),
      },
      {
        id: 'coverage_gate_failed',
        kind: 'fail_check',
        status: 'completed',
        records_meta: { checks_failed: 'int', checks_warned: 'int', errors: 'array', warnings: 'array', audit_table: 'object', config: 'object' },
        why: why(
          'Non-halting by design (file header, pre-conversion: "WARN/FAIL rows in the audit_table do not throw"): a FAIL-severity row reddens the audit_table\'s row-derived verdict but the run still completes — this step never gates the chain on a coverage FAIL.',
          { kind: 'spec', ref: 'docs/specs/01-pipeline/49_data_completeness_profiling.md' },
        ),
      },
    ],
  };
}

module.exports = { buildDescriptor };

// -----------------------------------------------------------------------------
// CLI — regenerate (default) or drift-check (peel 8c, commit-7 panel finding b).
// Never wired into .husky/pre-commit by this peel (out of this plan's boundary,
// see the report's followup line) — only the vitest drift-lock test runs it.
// -----------------------------------------------------------------------------
if (require.main === module) {
  const { CHECK_DEFS, LOGIC_VAR_DEFS } = require('./lib/assert-global-coverage-fields');
  const descriptor = buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS);
  const rendered = `${JSON.stringify(descriptor, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    // `--check-against=<path>` (additive, batch1 I2 commit 8x — a drift-lock RED-arm
    // test needs to prove --check FIRES on a corrupted copy without ever writing to
    // the real committed descriptor: this file's own header already states the
    // committed file is touched ONLY by the explicit --check/write CLI paths, so a
    // test that mutated `scripts/quality/assert-global-coverage.descriptor.json` in
    // place (even inside a try/finally) was violating that contract — a process kill
    // between the write and the restore leaves the REAL file corrupted, exactly the
    // failure this override exists to make structurally unreachable. Default (absent)
    // behaviour is completely unchanged: still reads/reports against `OUT`.
    const checkAgainstArg = process.argv.find((a) => a.startsWith('--check-against='));
    const checkPath = checkAgainstArg ? checkAgainstArg.slice('--check-against='.length) : OUT;
    const committed = fs.existsSync(checkPath) ? fs.readFileSync(checkPath, 'utf8') : null;
    if (committed === rendered) {
      console.log(`[generate-assert-global-coverage-descriptor] clean — no drift (${descriptor.checks.length} checks, ${descriptor.config.logic_variables.length} logic_variables, ${descriptor.inputs.reads.tables.length} read tables)`);
    } else {
      console.error(`[generate-assert-global-coverage-descriptor] DRIFT — ${checkPath} is stale relative to the live tree (scripts/lib/assert-global-coverage-fields.js). Run \`node scripts/generate-assert-global-coverage-descriptor.js\` to regenerate.`);
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(OUT, rendered, 'utf8');
    console.log(`Wrote ${OUT} (${descriptor.checks.length} checks, ${descriptor.config.logic_variables.length} logic_variables, ${descriptor.inputs.reads.tables.length} read tables)`);
  }
}
