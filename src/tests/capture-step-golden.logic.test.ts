// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3 (golden-master differential)
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §14.2 (the 4-tuple)
//
// Pure-logic locks for the golden-master harness `scripts/analysis/capture-step-golden.js`:
// marker parsing (run-chain's LAST-summary rule), the normaliser (every stripped key / masked
// pattern lands in the `nondeterminism` inventory — §5.3 "declared before the first diff"), and
// `--compare` (identical after normalisation ⇒ zero diffs; a real change ⇒ a pathed diff).
// No DB, no network, no child process.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const harness = require('../../scripts/analysis/capture-step-golden.js');
const { parseMarkers, normalise, diffNormalised, buildCapture, parseArgs, VOLATILE_KEYS, assertCaptureIsValid } = harness;

const SUMMARY = {
  records_total: 0,
  records_new: null,
  records_updated: null,
  records_meta: {
    audit_table: {
      phase: 1,
      name: 'Schema Validation',
      verdict: 'PASS',
      rows: [
        { metric: 'permit_columns', value: 0, threshold: 0, status: 'PASS' },
        { metric: 'sys_velocity_rows_sec', value: 123.4, threshold: null, status: 'INFO' },
        { metric: 'sys_duration_ms', value: 4321, threshold: null, status: 'INFO' },
      ],
    },
  },
};
const META = { reads: { 'CKAN API': ['metadata'] }, writes: { pipeline_runs: ['checks_passed'] }, external: ['CKAN API'] };

function rawCapture(overrides: Record<string, unknown> = {}, opts: { runId?: number; durationMs?: number; ts?: string } = {}) {
  const runId = opts.runId ?? 1649;
  const durationMs = opts.durationMs ?? 4321;
  const ts = opts.ts ?? '2026-08-25T14:03:11.123Z';
  const summary = JSON.parse(JSON.stringify(SUMMARY));
  summary.records_meta.audit_table.rows[2].value = durationMs;
  const stdout = [
    '=== CQA Tier 1: Schema Validation ===',
    JSON.stringify({ level: 'INFO', tag: '[assert-schema]', msg: `run id=${runId} started ${ts}` }),
    '  OK: permits — URL accessible (200)',
    `[assert-schema] completed in ${(durationMs / 1000).toFixed(1)}s`,
    'PIPELINE_SUMMARY:' + JSON.stringify({ records_total: 99 }), // a worker summary — must be ignored
    'PIPELINE_SUMMARY:' + JSON.stringify(summary),
    'PIPELINE_META:' + JSON.stringify(META),
    '',
  ].join('\n');
  const markers = parseMarkers(stdout);
  return {
    step: 'scripts/quality/assert-schema.js',
    chain: 'permits',
    args: [],
    runtime: 'node',
    db_target: '127.0.0.1:54322/postgres',
    pipeline_runs_max_id_before: runId - 1,
    exit_code: 0,
    signal: null,
    stdout,
    stderr: '',
    ...markers,
    pipeline_runs: [
      {
        id: runId,
        pipeline: 'assert-schema',
        status: 'completed',
        started_at: ts,
        completed_at: ts,
        duration_ms: durationMs,
        records_total: 0,
        records_new: null,
        records_updated: null,
        records_meta: summary.records_meta,
        error_message: null,
      },
    ],
    ...overrides,
  };
}

describe('parseMarkers — run-chain parity', () => {
  it('takes the LAST PIPELINE_SUMMARY and every PIPELINE_META, reporting the count', () => {
    const m = parseMarkers(rawCapture().stdout);
    expect(m.summary_count).toBe(2);
    expect(m.summary?.records_meta.audit_table.verdict).toBe('PASS');
    expect(m.meta).toEqual([META]);
    expect(m.parse_errors).toEqual([]);
  });
  it('records a malformed marker line as a parse error instead of throwing', () => {
    const m = parseMarkers('PIPELINE_SUMMARY:{not json\n');
    expect(m.summary).toBeNull();
    expect(m.parse_errors).toHaveLength(1);
  });
  it('yields null summary + empty meta when the child emitted nothing (e.g. crashed before emit)', () => {
    expect(parseMarkers('boom\n')).toEqual({ summary: null, summary_count: 0, meta: [], parse_errors: [] });
  });
});

describe('normalise — non-determinism inventory', () => {
  it('strips volatile keys, sys_* rows and masks timestamps/durations, and LISTS each one', () => {
    const { normalised, nondeterminism } = normalise(rawCapture());
    // ledger row: id/started_at/completed_at/duration_ms gone, substantive columns kept
    const row = normalised.pipeline_runs[0];
    expect(Object.keys(row)).toEqual(['error_message', 'pipeline', 'records_meta', 'records_new', 'records_total', 'records_updated', 'status']);
    // sys_* rows removed from BOTH the summary and the ledger's records_meta copy
    expect(normalised.summary.records_meta.audit_table.rows.map((r: { metric: string }) => r.metric)).toEqual(['permit_columns']);
    expect(row.records_meta.audit_table.rows).toHaveLength(1);
    // stdout: marker lines dropped; timing + ids masked
    expect(normalised.stdout_lines).toEqual([
      '=== CQA Tier 1: Schema Validation ===',
      JSON.stringify({ level: 'INFO', msg: 'run id=<RUN_ID> started <TS>', tag: '[assert-schema]' }),
      '  OK: permits — URL accessible (200)',
      '[assert-schema] completed in <DUR>',
    ]);
    // every strip/mask is declared
    expect(nondeterminism).toEqual([
      'key:pipeline_runs[0].completed_at',
      'key:pipeline_runs[0].duration_ms',
      'key:pipeline_runs[0].id',
      'key:pipeline_runs[0].started_at',
      'pattern:duration_literal',
      'pattern:iso_timestamp',
      'pattern:run_id_literal',
      'row:sys_duration_ms',
      'row:sys_velocity_rows_sec',
    ]);
  });

  it('is byte-identical across two runs that differ ONLY in run id, duration and timestamps', () => {
    const a = normalise(rawCapture({}, { runId: 1649, durationMs: 4321, ts: '2026-08-25T14:03:11.123Z' }));
    const b = normalise(rawCapture({}, { runId: 1702, durationMs: 987, ts: '2026-08-26T09:00:00.000Z' }));
    expect(JSON.stringify(a.normalised)).toBe(JSON.stringify(b.normalised));
    expect(a.nondeterminism).toEqual(b.nondeterminism);
  });

  it('keeps `id` inside VOLATILE_KEYS (pipeline_runs.id is a serial) and never touches the input', () => {
    expect(VOLATILE_KEYS).toContain('id');
    const raw = rawCapture();
    const frozen = JSON.stringify(raw);
    normalise(raw);
    expect(JSON.stringify(raw)).toBe(frozen);
  });
});

describe('diffNormalised — --compare', () => {
  it('reports zero diffs for two captures identical after normalisation', () => {
    const a = normalise(rawCapture({}, { runId: 1 })).normalised;
    const b = normalise(rawCapture({}, { runId: 2, durationMs: 1 })).normalised;
    expect(diffNormalised(a, b)).toEqual([]);
  });

  it('reports a pathed diff when the declared PIPELINE_META.reads contract changes (Declared-diffs row 1)', () => {
    const before = normalise(rawCapture()).normalised;
    const afterRaw = rawCapture();
    afterRaw.meta = [{ reads: {}, writes: {}, external: ['ckan_datastore_api'] }];
    const after = normalise(afterRaw).normalised;
    const diffs = diffNormalised(before, after);
    const paths = diffs.map((d: { path: string }) => d.path);
    expect(paths).toContain('meta[0].reads.CKAN API');
    expect(paths).toContain('meta[0].writes.pipeline_runs');
    expect(paths).toContain('meta[0].external[0]');
  });

  it('reports exit-code, verdict and ledger-status changes', () => {
    const before = normalise(rawCapture()).normalised;
    const afterRaw = rawCapture({ exit_code: 1 });
    afterRaw.summary.records_meta.audit_table.verdict = 'FAIL';
    afterRaw.pipeline_runs[0].status = 'failed';
    afterRaw.pipeline_runs[0].error_message = 'Schema validation failed';
    const diffs = diffNormalised(before, afterRaw && normalise(afterRaw).normalised);
    expect(diffs.map((d: { path: string }) => d.path).sort()).toEqual([
      'exit_code',
      'pipeline_runs[0].error_message',
      'pipeline_runs[0].status',
      'summary.records_meta.audit_table.verdict',
    ]);
  });

  it('reports a missing ledger row (in-chain run writes none; standalone writes one)', () => {
    const inChain = normalise(rawCapture({ pipeline_runs: [] })).normalised;
    const standalone = normalise(rawCapture()).normalised;
    const diffs = diffNormalised(inChain, standalone);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe('pipeline_runs[0]');
  });
});

describe('buildCapture + parseArgs', () => {
  it('derives verdict + ledger_status from the parsed summary / rows and embeds the inventory', () => {
    const doc = buildCapture(rawCapture());
    expect(doc.verdict).toBe('PASS');
    expect(doc.ledger_status).toEqual(['completed']);
    expect(doc.exit_code).toBe(0);
    expect(doc.nondeterminism.length).toBeGreaterThan(0);
    expect(doc.normalised.stdout_lines.some((l: string) => l.includes('PIPELINE_SUMMARY'))).toBe(false);
  });
  it('verdict is null when no summary was emitted', () => {
    expect(buildCapture(rawCapture({ summary: null, summary_count: 0 })).verdict).toBeNull();
  });
  it('parses --k=v and bare --flag', () => {
    expect(parseArgs(['--step=a.js', '--chain=none', '--compare=x,y', '--v'])).toEqual({ step: 'a.js', chain: 'none', compare: 'x,y', v: true });
  });
});

// ── assertCaptureIsValid — WF3 enrich_parcels stall incident (2026-09-07), the "VRD-SKIP
// conflation" memory gotcha closed structurally: a SELF-SKIPPED or CRASHED invocation must never
// be written as a golden capture (measured live: a run that raced an orphaned lock-holding
// backend wrote records_meta.skipped:true, reason:"advisory_lock_held_elsewhere" to
// docs/reports/golden/enrich_parcels/post/sources_run1.json as if it were real work). ────────────
describe('assertCaptureIsValid — refuses a SKIPPED or CRASHED capture (RED-first: the exact live-incident shape must throw)', () => {
  it('a genuine completed run (exit 0, no skip) passes — the baseline GREEN', () => {
    expect(() => assertCaptureIsValid(buildCapture(rawCapture()))).not.toThrow();
  });

  it('REFUSES a self-skipped capture (records_meta.skipped:true) — the exact live incident shape', () => {
    const skippedSummary = {
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere', ledger_row: 'owned' },
    };
    const doc = buildCapture(rawCapture({
      exit_code: 0,
      summary: skippedSummary,
      summary_count: 1,
      pipeline_runs: [{
        id: 1843, pipeline: 'enrich_parcels', status: 'self_skipped',
        started_at: '2026-09-07T21:13:30.678Z', completed_at: '2026-09-07T21:13:30.718Z',
        duration_ms: 83, records_total: null, records_new: null, records_updated: null,
        records_meta: skippedSummary.records_meta, error_message: null,
      }],
    }));
    expect(() => assertCaptureIsValid(doc)).toThrow(/REFUSING to write a golden capture/);
    expect(() => assertCaptureIsValid(doc)).toThrow(/advisory_lock_held_elsewhere/);
  });

  it('REFUSES a crashed capture (non-zero exit_code) even with no summary at all — the OTHER live incident shape (pool "error" event crash, summaries=0)', () => {
    const doc = buildCapture(rawCapture({ exit_code: 1, summary: null, summary_count: 0 }));
    expect(() => assertCaptureIsValid(doc)).toThrow(/REFUSING to write a golden capture/);
    expect(() => assertCaptureIsValid(doc)).toThrow(/exited 1/);
  });
});

// ── (e) table state + (f) invariants — pilot-2 D-14 harness growth (no DB) ─────────────────
const {
  resolveTables, tableStateDecision, parseRowCeiling, orderByClause, descriptorPathFor,
  validateInvariantSpec, invariantResult, DEFAULT_TABLE_ROW_CEILING,
  deriveInvariantSpecFromDescriptor,
} = harness;

const RAVINES_STATE = { table: 'ravines', row_count: 854, content_hash: 'd136a7e999ca4f76d8e1b03e7c14beae', order_by: 'pk' };
const INVARIANTS = [
  { name: 'ravines_count', value: '854' },
  { name: 'ravines_area_km2', value: '110.995' },
];

describe('resolveTables — descriptor-driven, --tables fallback', () => {
  it('reads outputs.writes[].table from the descriptor and ignores --tables when it does', () => {
    const descriptor = { outputs: { writes: [{ table: 'parcels', key: 'id', columns: [] }, { table: 'ravines' }] } };
    expect(resolveTables({ descriptor, tablesArg: 'ignored' })).toEqual({ tables: ['parcels', 'ravines'], source: 'descriptor' });
  });
  it('falls back to --tables (deduped, sorted) when there is no descriptor or outputs is "none"', () => {
    expect(resolveTables({ descriptor: null, tablesArg: 'ravines, ravines,parcels' })).toEqual({ tables: ['parcels', 'ravines'], source: 'arg' });
    expect(resolveTables({ descriptor: { outputs: 'none' }, tablesArg: 'ravines' })).toEqual({ tables: ['ravines'], source: 'arg' });
  });
  it('yields no tables (READ-class step) when neither is given, and rejects unsafe identifiers', () => {
    expect(resolveTables({ descriptor: null, tablesArg: undefined })).toEqual({ tables: [], source: 'none' });
    expect(() => resolveTables({ descriptor: null, tablesArg: 'ravines; drop table x' })).toThrow(/invalid table name/);
    expect(() => resolveTables({ descriptor: null, tablesArg: 'Ravines' })).toThrow(/invalid table name/);
  });
  it('derives the descriptor path beside the step script', () => {
    expect(descriptorPathFor('scripts/load-ravines.js')).toBe('scripts/load-ravines.descriptor.json');
    expect(descriptorPathFor('scripts/x/y.py')).toBe('scripts/x/y.descriptor.json');
  });
});

describe('row ceiling — parcels (486,530) must NOT be hashed by default', () => {
  it('defaults to 100000 and parses only bare non-negative integers', () => {
    expect(DEFAULT_TABLE_ROW_CEILING).toBe(100000);
    expect(parseRowCeiling(undefined)).toBe(100000);
    expect(parseRowCeiling('854')).toBe(854);
    expect(() => parseRowCeiling('12abc')).toThrow(/non-negative integer/);
    expect(() => parseRowCeiling('-1')).toThrow(/non-negative integer/);
    expect(() => parseRowCeiling(true)).toThrow(/non-negative integer/); // bare `--table-row-ceiling`
  });
  it('skips the hash with skipped_reason=over_ceiling above the ceiling, hashes at/below it', () => {
    expect(tableStateDecision({ table: 'parcels', row_count: 486530, ceiling: 100000 })).toEqual({
      hash: false,
      record: { table: 'parcels', row_count: 486530, skipped_reason: 'over_ceiling', ceiling: 100000 },
    });
    expect(tableStateDecision({ table: 'ravines', row_count: 854, ceiling: 100000 })).toEqual({ hash: true, record: { table: 'ravines', row_count: 854 } });
    expect(tableStateDecision({ table: 't', row_count: 100000, ceiling: 100000 }).hash).toBe(true);
    expect(tableStateDecision({ table: 't', row_count: 100001, ceiling: 100000 }).hash).toBe(false);
  });
  it('ORDER BY is explicit: pk columns first choice, all columns otherwise, identifiers quoted (claim #173)', () => {
    expect(orderByClause({ pkColumns: ['id'], allColumns: ['id', 'geom'] })).toBe('"id"');
    expect(orderByClause({ pkColumns: ['a', 'b'], allColumns: ['a', 'b', 'c'] })).toBe('"a", "b"');
    expect(orderByClause({ pkColumns: [], allColumns: ['x', 'y'] })).toBe('"x", "y"');
    expect(() => orderByClause({ pkColumns: [], allColumns: [] })).toThrow(/no columns/);
  });
});

describe('invariants file — validation + one-scalar result shaping', () => {
  it('accepts unique {name, sql} entries and rejects malformed / duplicate / empty documents', () => {
    const ok = [{ name: 'a', sql: 'SELECT 1' }, { name: 'b', sql: 'SELECT 2' }];
    expect(validateInvariantSpec(ok)).toBe(ok);
    expect(() => validateInvariantSpec([])).toThrow(/non-empty/);
    expect(() => validateInvariantSpec({})).toThrow(/non-empty/);
    expect(() => validateInvariantSpec([{ name: 'a' }])).toThrow(/invariants\[0\]/);
    expect(() => validateInvariantSpec([{ name: 'a', sql: 'SELECT 1' }, { name: 'a', sql: 'SELECT 2' }])).toThrow(/duplicate/);
  });
  it('stringifies the single scalar (pg numerics arrive as strings anyway) and keeps null', () => {
    expect(invariantResult('n', [{ count: 854 }])).toEqual({ name: 'n', value: '854' });
    expect(invariantResult('km2', [{ round: '110.995' }])).toEqual({ name: 'km2', value: '110.995' });
    expect(invariantResult('z', [{ max: null }])).toEqual({ name: 'z', value: null });
    expect(() => invariantResult('n', [])).toThrow(/expected 1 row/);
    expect(() => invariantResult('n', [{ a: 1, b: 2 }])).toThrow(/expected 1 column/);
  });
  it('R-T addendum (Fold A-4c, commit 4) — load_ravines\', compute_centroids\', link_wsib\'s, and link_parcel_addresses\' golden invariants.json files are RETIRED (one source of truth: the descriptor)', () => {
    for (const slug of ['load_ravines', 'compute_centroids', 'link_wsib', 'link_parcel_addresses']) {
      expect(() => require(`../../docs/reports/golden/${slug}/invariants.json`),
        `${slug}: the retired file must actually be deleted, not merely unread`).toThrow(/Cannot find module/);
    }
    // The R-C round-trip lock (Fold B-10) was run standalone this session for all 4 steps
    // (28 entries, all matched a raw direct query for the same sql) BEFORE this deletion —
    // this test only proves the deletion itself, not the round-trip (a live-DB concern).
  });

  it('R-T addendum (Fold A-4c, commit 3) — deriveInvariantSpecFromDescriptor reads BOTH invariants[] and plausibility[], null for neither', () => {
    expect(deriveInvariantSpecFromDescriptor(null)).toBeNull();
    expect(deriveInvariantSpecFromDescriptor({})).toBeNull();
    expect(deriveInvariantSpecFromDescriptor({ invariants: 'none', plausibility: 'none' })).toBeNull();
    const derived = deriveInvariantSpecFromDescriptor({
      invariants: [{ id: 'a', sql: 'SELECT 1' }, { id: 'b', sql: 'SELECT 2' }],
      plausibility: [{ id: 'c', sql: 'SELECT 3' }],
    });
    expect(derived).toEqual([{ name: 'a', sql: 'SELECT 1' }, { name: 'b', sql: 'SELECT 2' }, { name: 'c', sql: 'SELECT 3' }]);
  });

  it('the migrated link_massing descriptor\'s invariants[]/plausibility[] derive to exactly the 6 R-T-addendum entries, each a real SELECT', () => {
    const descriptor = require('../../scripts/link-massing.descriptor.json');
    const derived = deriveInvariantSpecFromDescriptor(descriptor);
    expect(derived?.map((i: { name: string }) => i.name)).toEqual([
      'pb_unique_pairs_violations', 'pb_rows', 'pb_distinct_parcels', 'parcels_with_centroid',
      'nearest_share_pct', 'linked_parcel_null_centroid_count',
    ]);
    for (const inv of derived ?? []) expect(inv.sql).toMatch(/^SELECT /);
  });

  it('R-T addendum, commit 4 — the migrated compute_centroids/link_wsib/link_parcel_addresses/load_ravines descriptors derive their own declared invariant/plausibility names, each a real SELECT', () => {
    const expected: Record<string, string[]> = {
      'compute-centroids': [
        'parcels_total', 'centroid_null_count', 'geom_not_null_geometry_null_count', 'outside_polygon_count',
        'pointonsurface_gt_1m_count', 'centroid_in_neighbour_parcel_count', 'centroid_algorithm_drift_gt_1m_count',
      ],
      'link-wsib': [
        'wsib_tier3_current_predicate_pass_rate_pct', 'wsib_entity_fanin_p99', 'wsib_magnet_entities_fanin_ge_10',
        'wsib_orphan_linked_entity_id', 'wsib_registry_total_rows', 'entities_wsib_registered_count',
        'wsib_registered_entities_without_exact_tier_link', 'wsib_tier_confidence_split', 'wsib_cumulative_link_rate_pct',
      ],
      'link-parcel-addresses': [
        'rows', 'multi_parcel_address_count', 'dup_count', 'fanout_max_noncondo', 'land_entrance_count', 'missed_link_count',
      ],
      'load-ravines': [
        'ravines_distinct_source_dataset_version', 'ravines_area_km2',
        'parcels_sign_law_violations', 'permits_sign_law_violations', 'coa_sign_law_violations', 'parcels_lineage_mismatch',
      ],
    };
    for (const [file, names] of Object.entries(expected)) {
      const descriptor = require(`../../scripts/${file}.descriptor.json`);
      const derived = deriveInvariantSpecFromDescriptor(descriptor);
      expect(derived?.map((i: { name: string }) => i.name), file).toEqual(names);
      // compute_centroids' centroid_in_neighbour_parcel_count is a WITH-CTE query
      // (WITH drifted AS MATERIALIZED (...) SELECT ...), not a bare SELECT — a real
      // SELECT statement either way, so the SELECT-anchored form permits both.
      for (const inv of derived ?? []) expect(inv.sql, `${file}:${inv.name}`).toMatch(/^(SELECT|WITH)\b/);
    }
  });
});

describe('normalise + --compare — table state and invariants are must-match-exactly', () => {
  it('carries row_count, content_hash and invariant values into the normalised form UNMASKED and un-stripped', () => {
    // a hash ending in "5ms" would be mangled by the duration mask if it went through scrub()
    const state = [{ ...RAVINES_STATE, content_hash: '0123456789abcdef0123456789abc5ms' }];
    const { normalised, nondeterminism } = normalise(rawCapture({ table_state: state, invariants: INVARIANTS }));
    expect(normalised.table_state).toEqual([{ content_hash: '0123456789abcdef0123456789abc5ms', order_by: 'pk', row_count: 854, table: 'ravines' }]);
    expect(normalised.invariants).toEqual([{ name: 'ravines_count', value: '854' }, { name: 'ravines_area_km2', value: '110.995' }]);
    expect(nondeterminism.some((h: string) => h.includes('table_state') || h.includes('invariants'))).toBe(false);
  });
  it('an over-ceiling record survives normalisation with its skipped_reason and no hash', () => {
    const skipped = { table: 'parcels', row_count: 486530, skipped_reason: 'over_ceiling', ceiling: 100000 };
    const { normalised } = normalise(rawCapture({ table_state: [skipped] }));
    expect(normalised.table_state).toEqual([{ ceiling: 100000, row_count: 486530, skipped_reason: 'over_ceiling', table: 'parcels' }]);
    expect('content_hash' in normalised.table_state[0]).toBe(false);
  });
  it('defaults to empty arrays for a READ-class capture (older captures without the fields still normalise)', () => {
    const { normalised } = normalise(rawCapture());
    expect(normalised.table_state).toEqual([]);
    expect(normalised.invariants).toEqual([]);
  });
  it('--compare: identical table state + invariants across two runs ⇒ zero diffs', () => {
    const a = normalise(rawCapture({ table_state: [RAVINES_STATE], invariants: INVARIANTS }, { runId: 1 })).normalised;
    const b = normalise(rawCapture({ table_state: [RAVINES_STATE], invariants: INVARIANTS }, { runId: 2, durationMs: 9 })).normalised;
    expect(diffNormalised(a, b)).toEqual([]);
  });
  it('--compare: a changed hash / row count / invariant value is a pathed diff', () => {
    const a = normalise(rawCapture({ table_state: [RAVINES_STATE], invariants: INVARIANTS })).normalised;
    const b = normalise(rawCapture({
      table_state: [{ ...RAVINES_STATE, row_count: 853, content_hash: 'ffffffffffffffffffffffffffffffff' }],
      invariants: [INVARIANTS[0], { name: 'ravines_area_km2', value: '110.994' }],
    })).normalised;
    expect(diffNormalised(a, b).map((d: { path: string }) => d.path).sort()).toEqual([
      'invariants[1].value',
      'table_state[0].content_hash',
      'table_state[0].row_count',
    ]);
  });
  it('--compare: a table falling over the ceiling between runs is a diff, not a silent pass', () => {
    const a = normalise(rawCapture({ table_state: [RAVINES_STATE] })).normalised;
    const b = normalise(rawCapture({ table_state: [{ table: 'ravines', row_count: 854, skipped_reason: 'over_ceiling', ceiling: 10 }] })).normalised;
    expect(diffNormalised(a, b).map((d: { path: string }) => d.path).sort()).toEqual([
      'table_state[0].ceiling', 'table_state[0].content_hash', 'table_state[0].order_by', 'table_state[0].skipped_reason',
    ]);
  });
  it('buildCapture surfaces table_state / invariants at the top level with their provenance', () => {
    const doc = buildCapture(rawCapture({
      table_state: [RAVINES_STATE], tables_source: 'arg', table_row_ceiling: 100000,
      invariants: INVARIANTS, invariants_file: 'docs/reports/golden/load_ravines/invariants.json',
    }));
    expect(doc.table_state).toEqual([RAVINES_STATE]);
    expect(doc.tables_source).toBe('arg');
    expect(doc.table_row_ceiling).toBe(100000);
    expect(doc.invariants_file).toBe('docs/reports/golden/load_ravines/invariants.json');
    expect(doc.normalised.table_state[0].content_hash).toBe(RAVINES_STATE.content_hash);
  });
});

// ── (e) column projection + explicit order — pilot-3 A-4 / Fold B item 5 / D-18 (no DB) ────────
const { parseTableColumnSpec, deriveTableSpecs, resolveTableSpec, rowTextExpr, isWideTable, WIDE_TABLE_CELL_THRESHOLD } = harness;

const PB_COLUMNS = ['parcel_id', 'building_id', 'is_primary', 'structure_type', 'match_type', 'confidence'];
const PB_STATE = {
  table: 'parcel_buildings', row_count: 520492, ceiling_bypassed: 'projected',
  content_hash: '4b15b352e3bcbb0f1cd04f61a95d1a21', order_by: 'explicit',
  order_columns: ['parcel_id', 'building_id'], columns: PB_COLUMNS,
};
// the commit-7 shape of the link-massing descriptor: two same-table entries, composite key, a db_default id
const LINK_MASSING_DESCRIPTOR = {
  outputs: {
    writes: [
      { table: 'parcel_buildings', key: ['parcel_id', 'building_id'], columns: [{ name: 'is_primary', vocabulary: 'x' }] },
      {
        table: 'parcel_buildings', key: ['parcel_id', 'building_id'],
        columns: [
          { name: 'id', vocabulary: 'x', written: 'db_default' },
          { name: 'is_primary', vocabulary: 'x' }, { name: 'structure_type', vocabulary: 'x' },
          { name: 'match_type', vocabulary: 'x' }, { name: 'confidence', vocabulary: 'x' },
          { name: 'linked_at', vocabulary: 'x', written: 'step' },
        ],
      },
    ],
  },
};

describe('parseTableColumnSpec — --table-columns / --table-order', () => {
  it('parses <table>:<cols>[;<table>:<cols>], deduping columns and validating identifiers', () => {
    expect(parseTableColumnSpec('parcel_buildings:parcel_id,building_id', '--table-order')).toEqual({ parcel_buildings: ['parcel_id', 'building_id'] });
    expect(parseTableColumnSpec('a:x,y ; b: z,z', '--table-columns')).toEqual({ a: ['x', 'y'], b: ['z'] });
    expect(parseTableColumnSpec(undefined, '--table-columns')).toEqual({});
  });
  it('rejects a bare flag, a missing colon, an empty column list, a duplicate table and unsafe identifiers', () => {
    expect(() => parseTableColumnSpec(true, '--table-columns')).toThrow(/needs <table>/);
    expect(() => parseTableColumnSpec('parcel_buildings', '--table-columns')).toThrow(/not <table>:<col,col>/);
    expect(() => parseTableColumnSpec('parcel_buildings:', '--table-columns')).toThrow(/lists no columns/);
    expect(() => parseTableColumnSpec('t:a;t:b', '--table-columns')).toThrow(/given twice/);
    expect(() => parseTableColumnSpec('t:a; drop', '--table-columns')).toThrow(/not <table>:<col,col>/);
    expect(() => parseTableColumnSpec('t:"id"', '--table-columns')).toThrow(/invalid column name/);
    expect(() => parseTableColumnSpec('Tbl:a', '--table-columns')).toThrow(/invalid table name/);
  });
});

describe('deriveTableSpecs — outputs.writes[].key + columns[] (Fold B item 5)', () => {
  it('order = the declared unique key; projection = key + step-written columns, db_default dropped, unioned across same-table entries', () => {
    const d = deriveTableSpecs(LINK_MASSING_DESCRIPTOR);
    expect(d.order).toEqual({ parcel_buildings: ['parcel_id', 'building_id'] });
    expect(d.columns.parcel_buildings).toEqual(['parcel_id', 'building_id', 'is_primary', 'structure_type', 'match_type', 'confidence', 'linked_at']);
    expect(d.columns.parcel_buildings).not.toContain('id');
  });
  it('accepts a string key (load-ravines shape) and yields nothing for a READ-class / missing descriptor', () => {
    const d = deriveTableSpecs({ outputs: { writes: [{ table: 'ravines', key: 'source_id', columns: [{ name: 'geom', vocabulary: 'x' }] }] } });
    expect(d).toEqual({ order: { ravines: ['source_id'] }, columns: { ravines: ['source_id', 'geom'] } });
    expect(deriveTableSpecs(null)).toEqual({ columns: {}, order: {} });
    expect(deriveTableSpecs({ outputs: 'none' })).toEqual({ columns: {}, order: {} });
  });
  it('an explicit CLI value overrides the derivation per table (the RUN_AT column is excluded by hand until the descriptor can mark it)', () => {
    const derived = deriveTableSpecs(LINK_MASSING_DESCRIPTOR);
    const spec = resolveTableSpec({ table: 'parcel_buildings', argColumns: { parcel_buildings: PB_COLUMNS }, argOrder: {}, derived });
    expect(spec).toEqual({ columns: PB_COLUMNS, columns_source: 'arg', order: ['parcel_id', 'building_id'], order_source: 'descriptor' });
    expect(resolveTableSpec({ table: 'other', argColumns: {}, argOrder: {}, derived })).toEqual({ columns: null, columns_source: 'none', order: null, order_source: 'none' });
  });
});

describe('isWideTable — pilot9 commit5 finding: string_agg(ROW(...)::text) OOM on wide tables', () => {
  // RED evidence (reproduced live, 2026-09-04, local DB, node scripts/analysis/capture-step-golden.js
  // --step=scripts/enrich-parcels.js --chain=sources --args=--full --tables=parcels,enrich_parcels_pass3_scope
  // --table-columns=parcels:<100 golden cols>;enrich_parcels_pass3_scope:parcel_id):
  //   [capture-step-golden] hashed enrich_parcels_pass3_scope: 884488 rows in 1060 ms (columns parcel_id; ...)
  //   [capture-step-golden] error: out of memory
  //       at C:\Users\User\Buildo\node_modules\pg-pool\index.js:45:11
  //       at async captureTableState (C:\Users\User\Buildo\scripts\analysis\capture-step-golden.js:367:13)
  // — the single-pass `string_agg(ROW(...)::text)` over `parcels` (486,530 rows x 100 projected
  // cols incl. jsonb: comparable_builds/optimal_config/zoning_overlays/…) exceeded available
  // memory materialising ONE giant concatenated string. Captured (with the fix below already
  // routing it to the row-hash path) at docs/reports/golden/enrich_parcels/pre/sources_run1.json.
  it('the OOM-reproducing scenario is WIDE; every existing golden table stays NARROW (unchanged path, byte-identical hashes)', () => {
    // The actual OOM case: parcels, 486,530 rows x 100 projected golden columns.
    expect(isWideTable({ row_count: 486530, width: 100 })).toBe(true);
    // The widest table any of the 8 already-converted pilots ever captured (parcel_buildings,
    // link_massing/post/permits.json): 520,492 rows x 6 projected cols = 3,122,952 cells —
    // well under the threshold, so it takes the ORIGINAL, unmodified concat query and its
    // committed content_hash is reproduced byte-for-byte (no algorithm change below threshold).
    expect(isWideTable({ row_count: 520492, width: 6 })).toBe(false);
    // enrich_parcels_pass3_scope (this pilot's own second table): 1,326,732 rows x 1 projected
    // column (parcel_id) — narrow despite the large row_count, because width is 1.
    expect(isWideTable({ row_count: 1326732, width: 1 })).toBe(false);
    // Boundary: exactly at the threshold is NOT wide (strict >); one cell over IS.
    expect(isWideTable({ row_count: WIDE_TABLE_CELL_THRESHOLD, width: 1 })).toBe(false);
    expect(isWideTable({ row_count: WIDE_TABLE_CELL_THRESHOLD + 1, width: 1 })).toBe(true);
  });
});

describe('projection bypasses the ceiling on the UNPROJECTED count; ORDER BY prefers the explicit key', () => {
  it('520,492 rows is over the ceiling unprojected, hashed when projected - and says so', () => {
    expect(tableStateDecision({ table: 'parcel_buildings', row_count: 520492, ceiling: 100000 }).hash).toBe(false);
    expect(tableStateDecision({ table: 'parcel_buildings', row_count: 520492, ceiling: 100000, projected: true })).toEqual({
      hash: true, record: { table: 'parcel_buildings', row_count: 520492, ceiling_bypassed: 'projected' },
    });
    expect(tableStateDecision({ table: 'ravines', row_count: 854, ceiling: 100000, projected: true })).toEqual({ hash: true, record: { table: 'ravines', row_count: 854 } });
  });
  it('explicit order columns beat the pk (never `id` for the junction); projection renders ROW(...)::text', () => {
    expect(orderByClause({ orderColumns: ['parcel_id', 'building_id'], pkColumns: ['id'], allColumns: ['id', 'parcel_id', 'building_id'] })).toBe('"parcel_id", "building_id"');
    expect(orderByClause({ orderColumns: null, pkColumns: ['id'], allColumns: ['id'] })).toBe('"id"');
    expect(rowTextExpr(PB_COLUMNS)).toBe('ROW("parcel_id", "building_id", "is_primary", "structure_type", "match_type", "confidence")::text');
    expect(rowTextExpr(null)).toBe('t::text');
    expect(() => rowTextExpr(['a; drop'])).toThrow(/invalid column name/);
  });
  it('the projected record round-trips the normaliser unmasked; hash timing stays OUT of the normalised form', () => {
    const doc = buildCapture(rawCapture({ table_state: [PB_STATE], table_timing: { parcel_buildings: 2684 }, table_specs: { parcel_buildings: { columns: PB_COLUMNS } } }));
    expect(doc.normalised.table_state).toEqual([{
      ceiling_bypassed: 'projected', columns: PB_COLUMNS, content_hash: PB_STATE.content_hash, order_by: 'explicit',
      order_columns: ['parcel_id', 'building_id'], row_count: 520492, table: 'parcel_buildings',
    }]);
    expect(doc.table_timing).toEqual({ parcel_buildings: 2684 });
    expect(JSON.stringify(doc.normalised)).not.toContain('table_timing');
    const other = normalise(rawCapture({ table_state: [{ ...PB_STATE, columns: [...PB_COLUMNS, 'linked_at'] }] })).normalised;
    expect(diffNormalised(doc.normalised, other).map((d: { path: string }) => d.path)).toEqual(['table_state[0].columns[6]']);
  });
  it('R-T addendum (Fold A-4c, commit 3) — link_massing\'s golden invariants.json is RETIRED (one source of truth: the descriptor), not just superseded', () => {
    // require() throwing "Cannot find module" IS the deletion proof — consistent with how
    // every other fixture load in this file already resolves paths (createRequire above),
    // no fs/path import needed.
    expect(() => require('../../docs/reports/golden/link_massing/invariants.json'),
      'the retired file must actually be deleted, not merely unread').toThrow(/Cannot find module/);
    // The R-C round-trip lock (Fold B-10, src/tests/db/link-massing.db.test.ts) already
    // proved the descriptor-driven executor's values match the retired file's own SQL,
    // round-tripped against real data, BEFORE this deletion landed — this test only proves
    // the deletion itself, not the round-trip (a live-DB concern, out of scope here).
    const descriptor = require('../../scripts/link-massing.descriptor.json');
    const derived = deriveInvariantSpecFromDescriptor(descriptor);
    expect(derived?.map((i: { name: string }) => i.name)).toEqual([
      'pb_unique_pairs_violations', 'pb_rows', 'pb_distinct_parcels', 'parcels_with_centroid',
      'nearest_share_pct', 'linked_parcel_null_centroid_count',
    ]);
  });
});
