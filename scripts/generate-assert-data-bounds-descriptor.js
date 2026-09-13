#!/usr/bin/env node
'use strict';
/**
 * One-time generator: scripts/quality/assert-data-bounds.descriptor.json FROM
 * scripts/lib/assert-data-bounds-fields.js CHECK_DEFS + LOGIC_VAR_DEFS.
 *
 * Not itself a step — a build tool (scripts/CLAUDE.md conventions), kept under
 * scripts/, not scripts/quality/. Re-run whenever CHECK_DEFS/LOGIC_VAR_DEFS change:
 *   node scripts/generate-assert-data-bounds-descriptor.js
 *   node scripts/generate-assert-data-bounds-descriptor.js --check   (drift lock)
 *
 * `buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS)` is a PURE function (no I/O), so
 * the drift lock (src/tests/steps/assert_data_bounds/violations.test.ts) can
 * regenerate the descriptor in memory against the real fields module and against
 * a mutated fixture, without touching the committed file except via the explicit
 * CLI paths below (Ask A1 / I1 precedent, `scripts/generate-assert-global-
 * coverage-descriptor.js`).
 *
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10, §5.3
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'quality', 'assert-data-bounds.descriptor.json');

function why(text, liveness) {
  return { text, liveness: liveness || 'none' };
}

function checkWhy(def) {
  const fenceNote = def.fence ? `Preserves fence ${def.fence}. ` : '';
  return why(
    `${fenceNote}${def.whyText} Ported verbatim from scripts/quality/assert-data-bounds.js (pre-conversion) — ` +
      `report: docs/reports/2026-09-12-batch1-i2-assert-data-bounds-assessment.md §2.3/§2.4.`,
    { kind: 'spec', ref: 'docs/specs/01-pipeline/44_chain_deep_scrapes.md' },
  );
}

function defaultFor(LOGIC_VAR_DEFS, name) {
  const v = LOGIC_VAR_DEFS.find((d) => d.name === name);
  if (!v) throw new Error(`generate-assert-data-bounds-descriptor: no LOGIC_VAR_DEFS entry for "${name}"`);
  return v.default;
}

function boundFor(def, LOGIC_VAR_DEFS) {
  switch (def.kind) {
    case 'raw0':
    case 'boolcfg_ge':
    case 'boolcfg_gt':
      return { limit: 'viol == 0' };
    case 'floor_min':
      return { limit: `value_min ${defaultFor(LOGIC_VAR_DEFS, def.cfgVar)}`, limit_from_config: def.cfgVar };
    case 'ceiling_max':
      return { limit: `value_max ${defaultFor(LOGIC_VAR_DEFS, def.cfgVar)}`, limit_from_config: def.cfgVar };
    case 'pctmax_cfg':
      return { limit: `pct <= ${defaultFor(LOGIC_VAR_DEFS, def.cfgVar)}`, limit_from_config: def.cfgVar };
    default:
      throw new Error(`boundFor: unhandled kind ${def.kind}`);
  }
}

// -----------------------------------------------------------------------------
// inputs.reads.tables — the 16 tables (report §1.0 claim 5/8), columns hand-
// curated from the pre-conversion source's own SQL bodies (§1.2 statement table).
// -----------------------------------------------------------------------------
const TABLE_COLUMNS = {
  address_points: ['address_point_id'],
  building_footprints: ['max_height_m'],
  coa_applications: ['linked_permit_num', 'linked_confidence', 'address', 'application_number', 'hearing_date', 'estimated_cost', 'coa_fsi', 'lot_size_sqm', 'max_buildable_gfa_sqm'],
  cost_estimates: ['estimated_cost', 'cost_tier', 'modeled_gfa_sqm', 'permit_num'],
  entities: ['id'],
  heritage_districts: [],
  heritage_properties: [],
  neighbourhoods: ['neighbourhood_id'],
  parcels: ['lot_size_sqm'],
  permit_inspections: ['permit_num', 'stage_name', 'status', 'scraped_at', 'inspection_date'],
  permit_parcels: ['permit_num', 'revision_num'],
  permit_trades: ['permit_num', 'revision_num'],
  permits: ['permit_num', 'revision_num', 'est_const_cost', 'last_seen_at', 'description', 'builder_name', 'status', 'permit_type', 'lifecycle_phase'],
  ravines: [],
  toronto_centreline: [],
  wsib_registry: ['legal_name', 'predominant_class', 'subclass', 'naics_code', 'linked_entity_id'],
};

function buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS) {
  const checks = CHECK_DEFS.map((def) => {
    const bound = boundFor(def, LOGIC_VAR_DEFS);
    const check = {
      id: def.id,
      kind: 'bound',
      expect: { metric: def.id, loader: def.loader, field: def.field },
      limit: bound.limit,
      severity: def.severity,
      blocking: false,
      when: 'post',
      chains: def.chains,
      accept_until: 'none',
      why: checkWhy(def),
    };
    if (bound.limit_from_config) check.limit_from_config = bound.limit_from_config;
    return check;
  });

  const configLogicVariables = LOGIC_VAR_DEFS.map((v) => ({ name: v.name, min: v.min, max: v.max, on_invalid: 'fail' }));

  const READ_TABLES = Object.keys(TABLE_COLUMNS)
    .sort()
    .map((table) => ({ table, columns: [...TABLE_COLUMNS[table]].sort() }));

  return {
    identity: {
      name: 'assert_data_bounds',
      display_name: 'Data Quality Checks',
      owner: 'data',
      description: 'Tier-2 CQA: post-ingestion data-bounds validation over 16 tables across 4 chains (permits/coa/sources/deep_scrapes) — 52 declared checks (49 pre-conversion metrics + 2 promoted warnings-only rows + 1 split id), 26 logic_variables (8 pre-existing + 18 newly-adjudicated) gate WARN/FAIL boundaries; 4 WSIB checks shared permits+sources (IL-4); the Phase-G Pre-Permit gate stays 2 independent checks (IL-3).',
      lock: 103,
      why_lock: why(
        'Registered in Spec 47 §A.5 (row: docs/specs/01-pipeline/47_pipeline_script_protocol.md:1947), category "6 — Quality", writes-DB = NO (read-only probe). Kept via identity.lock + the §5.4 source-text convention (ADVISORY_LOCK_ID = 103 declared, never read, in the frozen shell).',
        { kind: 'file', ref: 'docs/specs/01-pipeline/47_pipeline_script_protocol.md' },
      ),
      spec: '44',
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
      fingerprint_inputs: ['scripts/lib/assert-data-bounds-fields.js'],
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
        'Governs the ORDINARY (non-fatal) checks — the dispatch loop is the per-check error boundary for every check except the WSIB/inspection groups. The WSIB and inspection loaders deliberately let a non-"does not exist" query error escape UNCAUGHT (Spec 30 §5.4.1: exactly 3 exception classes are fatal — WSIB, inspection, and the outer boundary) — see scripts/lib/compute/assert-data-bounds.js header for the mechanism this preserves, regression-locked by src/tests/db/assert-data-bounds-halt.db.test.ts Case B.',
        { kind: 'file', ref: 'scripts/lib/compute/assert-data-bounds.js' },
      ),
      on_degrade: 'none',
      criticality: 'required',
      network: 'none',
      invocation: {
        permits: { argv: [], env: { PIPELINE_CHAIN: 'permits' } },
        coa: { argv: [], env: { PIPELINE_CHAIN: 'coa' } },
        sources: { argv: [], env: { PIPELINE_CHAIN: 'sources' } },
        deep_scrapes: { argv: [], env: { PIPELINE_CHAIN: 'deep_scrapes' } },
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
      {
        key: 'audit_table',
        type: 'object',
        consumers: [
          'src/components/FreshnessTimeline.tsx',
          'src/components/DataQualityDashboard.tsx',
          'src/lib/admin/funnel.ts',
          'src/lib/quality/types.ts',
          'src/app/api/admin/control-panel/resync/route.ts',
        ],
      },
    ],

    deviations: [
      {
        from: 'Spec 122 §8.2 pilot table default write class for a bounds-validation ASSERT (implied verdict_only)',
        why: why(
          'WD-1 ruled verdict_only RETIRED and structurally undeclarable under the ASSERT x-profile — outputs/recovery/counters forced "none". Matches assert_schema/assert_global_coverage precedent.',
          { kind: 'file', ref: '.cursor/wf5_wd1_write_class_audit_active_task.md' },
        ),
        adjudicated_by: 'WD-1 / Spec 122 §1.10 required-field profile',
        date: '2026-09-12',
      },
      {
        from: 'Pre-conversion per-chain audit_table.name (4 distinct strings: permits "Data Quality Checks", coa "CoA Data Quality", sources "Sources Data Quality", deep_scrapes "Data Quality")',
        why: why(
          'scripts/lib/step/verdict.js buildAuditTable() renders audit_table.name from the single identity.display_name (step.schema.json: "the human-readable name emitted in records_meta.audit_table.name") — no per-chain name map exists in the ASSERT profile or sharing.varies_by_chain (audit_table is a bare enum ["one","per_chain"], not name data). No scripts/lib/step/**/step.schema.json edit is authorized this commit. Resolved: one shared display_name, "Data Quality Checks" (matches the permits chain, unchanged, and src/lib/quality/types.ts:634\'s own label). The coa/sources/deep_scrapes chains\' audit_table.name text changes — cosmetic only, no consumer branches on the retired literal strings (FreshnessTimeline.tsx renders at.name verbatim).',
          { kind: 'file', ref: 'scripts/lib/step/verdict.js' },
        ),
        adjudicated_by: 'commit 7 scope constraint (no step.schema.json/scripts/lib/step edit authorized)',
        date: '2026-09-12',
      },
      {
        from: 'inspection_ancient_dates_count_warn_max (report §2.4 item 18) declared as a Rule-3 registered logic variable',
        why: why(
          'Re-reading the pre-conversion checkInsp() helper this session found its displayed threshold parameter (\'<= 5\' for ancient_dates) is NEVER itself compared — every checkInsp() call site evaluates purely value > 0. Wiring the new var into a real >5-tolerant bound would be an undeclared behaviour change mid-conversion (forbidden, Spec 123 §1.1/KFM3). The var is declared (satisfies Rule 3 registration + the test suite\'s 26-name list) but not bound via limit_from_config — filed ADB-D7, defect-ledger.md, OPEN · PIN, fix-after.',
          { kind: 'file', ref: 'docs/reports/defect-ledger.md' },
        ),
        adjudicated_by: 'commit 7 (ADB-D7, Spec 123 §3.1 — no silent behaviour fix during conversion)',
        date: '2026-09-12',
      },
      {
        from: 'checks[].limit_from_config on-invalid posture — Rule 3 default is "fail" for a verdict-affecting var with no safe fallback',
        why: why(
          'All 26 logic_variables here carry a safe seed default (the exact pre-conversion literal, or — for inspection_ancient_dates_count_warn_max — a declared-not-yet-wired placeholder), so "fail" is the correct posture per Rule 3. Recorded here only because the config object forbids a per-variable why field (additionalProperties:false), mirroring assert_schema/assert_global_coverage\'s own precedent deviation entry.',
          { kind: 'file', ref: 'scripts/seeds/logic_variables.json' },
        ),
        adjudicated_by: 'Spec 124 §2 Rule 3',
        date: '2026-09-12',
      },
    ],

    limitations: [
      {
        what: 'A standalone (no PIPELINE_CHAIN) run selects ALL 52 checks across all 4 chains into ONE combined audit_table (scripts/lib/step/verdict.js selectChecks: per_chain filtering is bypassed entirely when chainId is null) — a structural IMPROVEMENT over the pre-conversion standalone behaviour (ADB-D4: picked exactly one domain\'s table by a fixed preference order, permits > sources > coa > inspection, hiding the other domains\' rows even though checks_failed/checks_warned already reflected them). Nothing Hidden: standalone now shows every domain\'s rows; audit_table.phase resolves to 0 in standalone (resolvePhase: the 4 chain phase values disagree, so no single number is unambiguous) rather than the pre-conversion\'s single preferred-chain phase number.',
        measured: 'scripts/lib/step/verdict.js selectChecks()/resolvePhase(); pre-conversion scripts/quality/assert-data-bounds.js:986-996 (ADB-D4).',
        check_id: 'none',
      },
      {
        what: 'permits_pre_permit_count / coa_permits_pre_permit_count are declared as two independent checks[] ids (IL-3, IL-3 ACCEPT, consequence 2) rather than sharing one metric name the way the pre-conversion audit rows did — the coa-chain row now reads metric "coa_permits_pre_permit_count", not "permits_pre_permit_count". Cosmetic only: identical SQL, threshold, and severity.',
        measured: 'scripts/lib/assert-data-bounds-fields.js CHECK_DEFS.',
        check_id: 'coa_permits_pre_permit_count',
      },
    ],

    interpretation: 'none',

    recovery: 'none',
    database: { class: 'primary', min_migration: 244, assert_current_database: 'postgres' },
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
        phase: { permits: 22, coa: 11, sources: 27, deep_scrapes: 5 },
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
          'The generic runner (scripts/lib/step/index.js) emits the declared lock_held_elsewhere terminal on advisory-lock contention — the pre-conversion step returned bare with ZERO step-level emit at all (ADB-D2, worse than AS-D9/LR-D6/AGC-D7). Library adoption closes this structurally.',
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
        id: 'data_bounds_check_failed',
        kind: 'fail_check',
        status: 'completed',
        records_meta: { checks_failed: 'int', checks_warned: 'int', errors: 'array', warnings: 'array', audit_table: 'object', config: 'object' },
        why: why(
          'Non-halting by design (Spec 30 §5.4.1): a threshold-derived FAIL/WARN row reddens the audit_table\'s row-derived verdict but the run still completes — this step never gates the chain on a data-bounds FAIL. Distinguishes from data_bounds_check_error below.',
          { kind: 'spec', ref: 'docs/specs/01-pipeline/30_pipeline_architecture.md' },
        ),
      },
      {
        id: 'data_bounds_check_error',
        kind: 'fail_error',
        status: 'failed',
        records_meta: { checks_failed: 'int', checks_warned: 'int', errors: 'array', warnings: 'array', audit_table: 'object', config: 'object' },
        why: why(
          'Spec 30 §5.4.1: only EXCEPTION-derived failures halt ("I could not check") — the WSIB and inspection loaders let a non-"does not exist" query error escape uncaught (scripts/lib/compute/assert-data-bounds.js), propagating out of compute() and causing the step to exit non-zero. Regression-locked by src/tests/db/assert-data-bounds-halt.db.test.ts Case B (the load-bearing exception-must-still-halt proof).',
          { kind: 'spec', ref: 'docs/specs/01-pipeline/30_pipeline_architecture.md' },
        ),
      },
    ],
  };
}

module.exports = { buildDescriptor, TABLE_COLUMNS };

// -----------------------------------------------------------------------------
// CLI — regenerate (default) or drift-check (--check).
// -----------------------------------------------------------------------------
if (require.main === module) {
  const { CHECK_DEFS, LOGIC_VAR_DEFS } = require('./lib/assert-data-bounds-fields');
  const descriptor = buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS);
  const rendered = `${JSON.stringify(descriptor, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const committed = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (committed === rendered) {
      console.log(`[generate-assert-data-bounds-descriptor] clean — no drift (${descriptor.checks.length} checks, ${descriptor.config.logic_variables.length} logic_variables, ${descriptor.inputs.reads.tables.length} read tables)`);
    } else {
      console.error(`[generate-assert-data-bounds-descriptor] DRIFT — ${OUT} is stale relative to the live tree (scripts/lib/assert-data-bounds-fields.js). Run \`node scripts/generate-assert-data-bounds-descriptor.js\` to regenerate.`);
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(OUT, rendered, 'utf8');
    console.log(`Wrote ${OUT} (${descriptor.checks.length} checks, ${descriptor.config.logic_variables.length} logic_variables, ${descriptor.inputs.reads.tables.length} read tables)`);
  }
}
