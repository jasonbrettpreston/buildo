// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5 row 28 (guards.empty_source); registry-truth plan Phase 3 WIRE #32 (PLAN :238); FLEET-2 A-1 rulings 2026-10-03
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = { metric: string; value: unknown; threshold: unknown; status: string; source?: string; errored?: boolean };
type GuardResult = { rows: Row[]; halt: boolean };
type Refusal = { table: unknown; rows_read: unknown; rows_acquired: unknown; refused: boolean };
type Runner = {
  measureInputGuards: (pool: unknown, descriptor: unknown) => Promise<GuardResult>;
  emptySourceRefusal: (descriptor: unknown, acquired: unknown) => Refusal | null;
  emptySourceRows: (phaseResults: unknown[]) => Row[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module under test
const runner: Runner = require(join(process.cwd(), 'scripts/lib/step/index.js'));

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function countPool(counts: Record<string, number>) {
  const sql: string[] = [];
  return {
    sql,
    query: async (text: string) => {
      sql.push(text);
      const m = /COUNT\(\*\)::bigint AS n FROM (\w+)/.exec(text);
      if (m) return { rows: [{ n: String(counts[m[1]!] ?? 0) }] };
      return { rows: [] };
    },
  };
}

function c(archetype: string, emptySource: unknown) {
  return clone({
    identity: { name: 'fixture_step', archetype },
    inputs: { reads: { steps: [], tables: [], externals: [] }, expect_nonempty: false, on_missing: 'halt' },
    outputs: { writes: [{ table: 'parcel_buildings' }] },
    guards: { empty_source: emptySource },
  });
}

describe('P3-C1 #32 — guards.empty_source pre-compute guard (consumers) and ingest refusal', () => {
  it('E1 consumer, empty — a zero-row source halts with an errored FAIL gate row', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ building_footprints: 0 });
    const res = await runner.measureInputGuards(pool, c('LINK', 'building_footprints'));
    expect(res.halt).toBe(true);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.metric).toBe('empty_source_guard');
    expect(row.status).toBe('FAIL');
    expect(row.errored).toBe(true);
    expect(row.source).toBe('gate');
    expect(row.value).toBe('empty: building_footprints');
  });

  it('E2 consumer, non-empty — a populated source yields one INFO row carrying the count', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ building_footprints: 427077 });
    const res = await runner.measureInputGuards(pool, c('LINK', 'building_footprints'));
    expect(res.halt).toBe(false);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.status).toBe('INFO');
    expect(row.value).toEqual({ building_footprints: 427077 });
  });

  it('E3 array form — every named table is counted and the empty one halts', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ ravines: 4, parcels: 0 });
    const res = await runner.measureInputGuards(pool, c('ENRICHER', ['ravines', 'parcels']));
    expect(res.halt).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.value).toBe('empty: parcels');
  });

  it('E4 none — guards.empty_source "none" issues zero queries and no row', async () => {
    // GREEN control on the guard's off-switch: no query, no row.
    const pool = countPool({});
    const res = await runner.measureInputGuards(pool, c('LINK', 'none'));
    expect(pool.sql).toHaveLength(0);
    expect(res).toEqual({ rows: [], halt: false });
  });

  it('E5 INGESTOR never counts pre-compute — the ingest phase owns its own target', async () => {
    // GREEN control: an INGESTOR names its own target, so #32 never queries here.
    const pool = countPool({ address_points: 0 });
    const res = await runner.measureInputGuards(pool, c('INGESTOR', 'address_points'));
    expect(pool.sql).toHaveLength(0);
    expect(res).toEqual({ rows: [], halt: false });
  });

  it('E6 emptySourceRefusal — an INGESTOR refuses only a zero-row acquisition', () => {
    // RED today because `emptySourceRefusal` is not exported.
    const refused = runner.emptySourceRefusal(c('INGESTOR', 'address_points'), {
      feature_count: 0,
      rows_read: 0,
    });
    expect(refused).toEqual({ table: 'address_points', rows_read: 0, rows_acquired: 0, refused: true });

    const ok = runner.emptySourceRefusal(c('INGESTOR', 'address_points'), {
      feature_count: 12,
      rows_read: 12,
    });
    expect(ok).not.toBeNull();
    expect(ok!.refused).toBe(false);

    expect(runner.emptySourceRefusal(c('LINK', 'building_footprints'), { feature_count: 0 })).toBeNull();
    expect(runner.emptySourceRefusal(c('INGESTOR', 'none'), { feature_count: 0 })).toBeNull();
  });

  it('E7 emptySourceRows — a refusal becomes an errored FAIL row, a non-refusal an INFO row', () => {
    // RED today because `emptySourceRows` is not exported.
    const refusedRows = runner.emptySourceRows([
      { emptySource: { table: 'address_points', rows_read: 0, rows_acquired: 0, refused: true } },
    ]);
    expect(refusedRows).toHaveLength(1);
    const refusedRow = refusedRows[0]!;
    expect(refusedRow.metric).toBe('empty_source_guard');
    expect(refusedRow.status).toBe('FAIL');
    expect(refusedRow.errored).toBe(true);
    expect(refusedRow.value).toBe('refused: 0 rows to write for address_points');

    const okRows = runner.emptySourceRows([
      { emptySource: { table: 'address_points', rows_read: 12, rows_acquired: 12, refused: false } },
    ]);
    expect(okRows).toHaveLength(1);
    const okRow = okRows[0]!;
    expect(okRow.status).toBe('INFO');
    expect(okRow.value).toEqual({ table: 'address_points', rows_acquired: 12 });

    expect(runner.emptySourceRows([null, {}])).toEqual([]);
  });

  it('E8 ingest wiring — refusal runs before the pre-write gate and surfaces a supervisor row', () => {
    // RED today: the ingest phase does not yet call `emptySourceRefusal` or
    // surface `reason: 'empty_source_refused'`, and runWithPool does not fold
    // `emptySourceRows([ingest])` into its extra rows.
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');

    const ingestAt = src.indexOf('async function runIngestPhase(');
    expect(ingestAt).toBeGreaterThan(-1);
    const ingestBody = src.slice(ingestAt);
    const refusalAt = ingestBody.indexOf('emptySourceRefusal(descriptor, acquired)');
    const gateAt = ingestBody.indexOf('const gateDecision = preWriteGate');
    expect(refusalAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(refusalAt).toBeLessThan(gateAt);
    expect(ingestBody).toContain("reason: 'empty_source_refused'");

    const poolAt = src.indexOf('async function runWithPool(');
    expect(poolAt).toBeGreaterThan(-1);
    expect(src.slice(poolAt)).toContain('...emptySourceRows([ingest])');
  });
});
