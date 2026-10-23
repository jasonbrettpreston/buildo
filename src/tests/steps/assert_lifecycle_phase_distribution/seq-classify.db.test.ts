// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DC (the comparison lives in check SQL), R-DH (*.db.test.ts)
//
// assert_lifecycle_phase_distribution ② — the SEMANTICS of SEQ_CLASSIFY_SQL, the one statement that classifies every
// lifecycle_seq (scripts/lib/compute/assert-lifecycle-phase-distribution.js). compute.logic.test.ts fakes this
// statement's rows; this file runs the REAL statement on Postgres against TEMPORARY tables named permits,
// coa_applications and universal_stream_catalog (pg_temp is searched first, so the statement reads the fixtures and
// never a real row; nothing is written outside the session). Each case is a legacy behaviour (L5-L9 of
// violations.test.ts) or a declared ② change (ALPD-D4, ALPD-D5).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/steps/assert_lifecycle_phase_distribution/seq-classify.db.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from '../../db/setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute under test
const { SEQ_CLASSIFY_SQL } = require(path.join(REPO_ROOT, 'scripts/lib/compute/assert-lifecycle-phase-distribution.js'));

const pool = getTestPool();

type Out = { seq: number; actual: number; kind: string; posture: string | null };

describe.skipIf(!dbAvailable())('assert_lifecycle_phase_distribution — SEQ_CLASSIFY_SQL on Postgres (temp-table fixtures)', () => {
  if (!pool) return;
  let client: PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query('CREATE TEMP TABLE universal_stream_catalog (seq int, rows_count int)');
    await client.query('CREATE TEMP TABLE permits (lifecycle_seq int)');
    await client.query('CREATE TEMP TABLE coa_applications (lifecycle_seq int)');
  });
  afterAll(async () => {
    if (client) {
      await client.query('DROP TABLE IF EXISTS pg_temp.universal_stream_catalog, pg_temp.permits, pg_temp.coa_applications');
      client.release();
    }
  });

  async function fixture(catalog: Array<[number, number | null]>, permitSeqs: number[], coaSeqs: number[]) {
    await client.query('TRUNCATE pg_temp.universal_stream_catalog, pg_temp.permits, pg_temp.coa_applications');
    for (const [seq, rc] of catalog) await client.query('INSERT INTO pg_temp.universal_stream_catalog VALUES ($1, $2)', [seq, rc]);
    for (const s of permitSeqs) await client.query('INSERT INTO pg_temp.permits VALUES ($1)', [s]);
    for (const s of coaSeqs) await client.query('INSERT INTO pg_temp.coa_applications VALUES ($1)', [s]);
  }
  async function classify(bands: Array<[number, number, number | null]>, flags: [number, number, number] = [0, 0, 0]): Promise<Map<number, Out>> {
    const res = await client.query<Out>(SEQ_CLASSIFY_SQL, [bands.map((b) => b[0]), bands.map((b) => b[1]), bands.map((b) => b[2]), ...flags]);
    return new Map(res.rows.map((r: Out) => [Number(r.seq), { seq: Number(r.seq), actual: Number(r.actual), kind: r.kind, posture: r.posture }]));
  }
  const rep = (n: number, seq: number) => Array.from({ length: n }, () => seq);

  it('in band (inclusive at both ends) / band_violation either side / catalog_null at any count (L5, L6)', async () => {
    await fixture([[1, 10], [2, 10], [3, 10], [4, 0], [5, null]], [...rep(3, 1), ...rep(5, 2), ...rep(2, 3)], [...rep(2, 2), ...rep(9, 4)]);
    const out = await classify([[1, 3, 7], [2, 1, 6], [3, 3, 9], [4, 0, null], [5, 0, null]]);
    expect(out.get(1)).toMatchObject({ actual: 3, kind: 'in_band' }); // = min
    expect(out.get(2)).toMatchObject({ actual: 7, kind: 'band_violation', posture: 'warn' }); // permits + coa SUM, > max
    expect(out.get(3)).toMatchObject({ actual: 2, kind: 'band_violation' }); // < min
    expect(out.get(4)).toMatchObject({ actual: 9, kind: 'catalog_null', posture: null }); // rows_count 0
    expect(out.get(5)).toMatchObject({ actual: 0, kind: 'catalog_null' }); // rows_count NULL
  });

  it('a NULL max is no upper bound', async () => {
    await fixture([[1, 10]], rep(500, 1), []);
    expect((await classify([[1, 2, null]])).get(1)).toMatchObject({ kind: 'in_band' });
  });

  it('ALPD-D5: a banded seq with no data and min > 0 is expected_data_missing ONLY; min 0 with no data is in band (L8)', async () => {
    await fixture([[3, 10], [6, 10]], [], []);
    const out = await classify([[3, 1, 1000], [6, 0, 5]]);
    expect(out.get(3)).toMatchObject({ actual: 0, kind: 'expected_data_missing', posture: 'warn' });
    expect(out.get(6)).toMatchObject({ kind: 'in_band' });
  });

  it('data with no band is no_band_configured, in or out of the catalog; a catalog seq with neither is unbanded (L8)', async () => {
    await fixture([[1, 10], [7, 10], [8, 10]], rep(9, 7), rep(4, 99));
    const out = await classify([[1, 0, 100]]);
    expect(out.get(7)).toMatchObject({ actual: 9, kind: 'no_band_configured', posture: 'warn' });
    expect(out.get(99)).toMatchObject({ actual: 4, kind: 'no_band_configured' });
    expect(out.get(8)).toMatchObject({ kind: 'unbanded', posture: null });
  });

  it('a declared band for a seq outside a NON-empty catalog is an orphan; with an EMPTY catalog data reads no_band_configured (L9, L14)', async () => {
    await fixture([[1, 10]], [], []);
    expect((await classify([[1, 0, 100], [120, 0, 5]])).get(120)).toMatchObject({ kind: 'orphan_band' });
    await fixture([], rep(2, 1), []);
    const empty = await classify([[1, 0, 100], [2, 0, 5]]);
    expect(empty.get(1)).toMatchObject({ kind: 'no_band_configured' });
    expect(empty.get(2)).toMatchObject({ kind: 'inert' });
  });

  it('each kind is routed by its own flag (mixed posture) (L7)', async () => {
    await fixture([[1, 10], [3, 10]], [...rep(50, 1), ...rep(2, 7)], []);
    const out = await classify([[1, 1, 10], [3, 1, 10]], [1, 0, 1]);
    expect(out.get(1)).toMatchObject({ kind: 'band_violation', posture: 'fail' });
    expect(out.get(7)).toMatchObject({ kind: 'no_band_configured', posture: 'warn' });
    expect(out.get(3)).toMatchObject({ kind: 'expected_data_missing', posture: 'fail' });
  });

  it('ALPD-D4: a missing universal_stream_catalog throws (the run fails through on_check_error) instead of reading PASS', async () => {
    await client.query('DROP TABLE pg_temp.universal_stream_catalog');
    // With the temp table gone the statement would resolve public.universal_stream_catalog, so for this one
    // transaction only pg_temp (and the implicit pg_catalog) is on the search_path.
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO pg_temp');
    await expect(client.query(SEQ_CLASSIFY_SQL, [[1], [0], [null], 0, 0, 0])).rejects.toThrow(/universal_stream_catalog/);
    await client.query('ROLLBACK');
    await client.query('CREATE TEMP TABLE universal_stream_catalog (seq int, rows_count int)');
  });
});
