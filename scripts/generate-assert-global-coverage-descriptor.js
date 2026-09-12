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

/**
 * Pure: builds the descriptor object from CHECK_DEFS/LOGIC_VAR_DEFS with no I/O
 * and no shared mutable state across calls (TABLE_COLUMNS is local to this call,
 * unlike the pre-peel-8c module-level version — safe to call twice in one process,
 * e.g. once with the real fields module and once with a mutated test fixture).
 */
function buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS) {
  // -------------------------------------------------------------------------
  // inputs.reads.tables — the 23 tables (assessment report §1.1 claim 6), columns
  // derived from every CHECK_DEFS `field`/vocabTriple reference.
  // -------------------------------------------------------------------------
  const TABLE_COLUMNS = new Map();
  function addCol(table, col) {
    if (!table || !col) return;
    if (!TABLE_COLUMNS.has(table)) TABLE_COLUMNS.set(table, new Set());
    TABLE_COLUMNS.get(table).add(col);
  }
  for (const def of CHECK_DEFS) {
    if (def.vocabTriple) {
      const t = def.vocabTriple;
      addCol(t.dataTable, t.dataColumn);
      addCol(t.vocabTable, t.vocabColumn);
      continue;
    }
    const m = /^([a-z0-9_.]+)\.([a-z0-9_*]+)/.exec(def.field || '');
    // 'entity_tracing.last_verdict' is a DISPLAY LABEL (p_step26), not a real table — the
    // underlying read is `pipeline_runs` (added explicitly below).
    if (m && m[1] !== 'entity_tracing') addCol(m[1], m[2]);
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
  addCol('data_quality_snapshots', 'snapshot_date');
  addCol('engine_health_snapshots', 'captured_at');
  addCol('tracked_projects', 'status');
  addCol('lead_analytics', 'lead_id');
  addCol('trade_forecasts', 'permit_num');
  addCol('parcel_buildings', 'parcel_id');
  addCol('building_footprints', 'id');

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
      reads: { steps: [], tables: READ_TABLES, externals: [] },
      expect_nonempty: false,
      on_missing: 'halt',
    },

    outputs: 'none',

    staleness: {
      scope: 'none',
      trigger: [{ signal: 'always', position: 'pre_compute' }],
      mode_select: 'none',
      checkpoint: 'none',
      interval: 'none',
      fingerprint: 'derived',
      fingerprint_inputs: ['scripts/lib/assert-global-coverage-fields.js'],
      logic_version: 'none',
      on_fingerprint_change: 'queue',
    },

    guards: { requires: [], srid: 'none', empty_source: 'none', schema_drift: 'pause' },

    execution: {
      budget: '10m',
      txn_scope: 'none',
      txn_budget: 'none',
      chunked: false,
      statement_timeout: 'none',
      step_timeout: '15m',
      batch: 'none',
      needs_disk_mb: 'none',
      partial_fill: 'none',
      on_row_error: 'fail_fast',
      on_batch_error: 'fail_step',
      on_check_error: 'fail_step',
      on_check_error_why: why(
        'Mirrors assert_schema: the dispatch loop is the per-check error boundary — a throwing check reports {error} under its own id and every other check still runs; fail_step is the step-wide POLICY for a check the library could not evaluate at all (never PASS-by-default, Spec 122 §7.1).',
        { kind: 'file', ref: 'scripts/lib/step/verdict.js' },
      ),
      on_degrade: 'none',
      criticality: 'required',
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
        phase: { permits: 32, coa: 16, sources: 24 },
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
    const committed = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (committed === rendered) {
      console.log(`[generate-assert-global-coverage-descriptor] clean — no drift (${descriptor.checks.length} checks, ${descriptor.config.logic_variables.length} logic_variables, ${descriptor.inputs.reads.tables.length} read tables)`);
    } else {
      console.error(`[generate-assert-global-coverage-descriptor] DRIFT — ${OUT} is stale relative to the live tree (scripts/lib/assert-global-coverage-fields.js). Run \`node scripts/generate-assert-global-coverage-descriptor.js\` to regenerate.`);
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(OUT, rendered, 'utf8');
    console.log(`Wrote ${OUT} (${descriptor.checks.length} checks, ${descriptor.config.logic_variables.length} logic_variables, ${descriptor.inputs.reads.tables.length} read tables)`);
  }
}
