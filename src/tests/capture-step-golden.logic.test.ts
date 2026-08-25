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
const { parseMarkers, normalise, diffNormalised, buildCapture, parseArgs, VOLATILE_KEYS } = harness;

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
