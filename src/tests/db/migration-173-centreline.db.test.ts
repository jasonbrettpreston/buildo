// 🔗 SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §2 + §12.3 (M-1)
//
// Real-DB integration tests for migration 173: the toronto_centreline table
// (18 data cols + GIST), the UNIQUE(source_id) constraint, and the two IMMUTABLE
// PL/pgSQL helpers (normalize_address_number F-S2 leading-space; address_match_status
// NULL-parity skip + parity/range logic). Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 173 — toronto_centreline + address helpers', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.end();
  });

  it('creates toronto_centreline with the §2 column contract', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns WHERE table_name = 'toronto_centreline'`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(by.source_id.data_type).toBe('bigint');
    expect(by.source_id.is_nullable).toBe('NO');
    expect(by.geom.is_nullable).toBe('NO');
    // classification fields NOT NULL.
    expect(by.feature_code_desc.is_nullable).toBe('NO');
    expect(by.jurisdiction.is_nullable).toBe('NO');
    // address-range columns are TEXT (handle "10A" / "12 1/2").
    expect(by.lo_num_l.data_type).toBe('text');
    expect(by.parity_l.data_type).toBe('text');
    // graph-topology node ids are nullable bigint.
    expect(by.from_intersection_id.data_type).toBe('bigint');
    expect(by.from_intersection_id.is_nullable).toBe('YES');
    // base name present (divided-road compare, C-v1.3.7).
    expect(by.linear_name.data_type).toBe('text');
  });

  it('enforces UNIQUE(source_id) and has the GIST geom index', async () => {
    if (!pool) return;
    const uniq = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'toronto_centreline' AND indexdef ILIKE '%UNIQUE%(source_id)%'`,
    );
    expect(uniq.rows.length).toBeGreaterThanOrEqual(1);
    const gist = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_toronto_centreline_geom_gist'`,
    );
    expect(gist.rows.length).toBe(1);
  });

  it('normalize_address_number: strips numeric part; F-S2 preserves the leading-space suffix', async () => {
    if (!pool) return;
    const plain = await pool.query(`SELECT * FROM normalize_address_number('29')`);
    expect(plain.rows[0].numeric_part).toBe(29);
    expect(plain.rows[0].suffix).toBeNull();

    const suffixed = await pool.query(`SELECT * FROM normalize_address_number('12 1/2')`);
    expect(suffixed.rows[0].numeric_part).toBe(12);
    expect(suffixed.rows[0].suffix).toBe(' 1/2'); // leading space preserved (NOT trimmed)

    const alpha = await pool.query(`SELECT * FROM normalize_address_number('10A')`);
    expect(alpha.rows[0].numeric_part).toBe(10);
    expect(alpha.rows[0].suffix).toBe('A');

    const empty = await pool.query(`SELECT * FROM normalize_address_number(NULL)`);
    expect(empty.rows[0].numeric_part).toBeNull();
  });

  it('address_match_status: parity + range logic, with NULL-parity skip (H-v1.3.3)', async () => {
    if (!pool) return;
    const q = async (addr: string, parity: string | null, lo: string, hi: string) => {
      const { rows } = await pool.query(`SELECT address_match_status($1, $2, $3, $4) AS m`, [addr, parity, lo, hi]);
      return rows[0].m;
    };
    expect(await q('30', 'E', '20', '40')).toBe(true);   // even, in range
    expect(await q('31', 'E', '20', '40')).toBe(false);  // odd vs E parity
    expect(await q('30', null, '20', '40')).toBe(true);  // NULL parity → range-only match
    expect(await q('50', 'E', '20', '40')).toBe(false);  // out of range
    expect(await q('xyz', null, '20', '40')).toBe(false); // unparseable → false (no fabricated match)
  });
});
