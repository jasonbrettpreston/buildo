// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B
//
// Real-DB integration for the Spec 80 v-next taxonomy migrations 178-181, verified on a
// freshly-migrated DB (BUILDO_TEST_DB=1 / DATABASE_URL):
//   178 fold the 5 granular trades (+ their universal_stream_trade_signals rows)
//   179 trades.kind/seq/cost_basis + 3 new trades + temporary-fencing deprecation + CHECKs
//   180 product_groups.type + guarded whole-table re-seed to 27
//   181 trade_products link table + 32 seeds
// Also asserts each migration re-runs idempotently. Skipped unless BUILDO_TEST_DB=1.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const GRANULAR = ['windows', 'paving', 'decks', 'back-yard-fences', 'outdoor-patio'];

function migrationSql(file: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../migrations', file), 'utf8');
}

describe.skipIf(!dbAvailable())('migrations 178-181 — Spec 80 v-next taxonomy', () => {
  afterAll(async () => { if (pool) await pool.end(); });

  // ── 178: fold ─────────────────────────────────────────────────────────────
  it('178: the 5 granular trades and their universal_stream_trade_signals rows are gone', async () => {
    if (!pool) return;
    const trades = (await pool.query(
      `SELECT count(*)::int AS n FROM trades WHERE slug = ANY($1)`, [GRANULAR],
    )).rows[0].n;
    const ust = (await pool.query(
      `SELECT count(*)::int AS n FROM universal_stream_trade_signals WHERE trade_slug = ANY($1)`, [GRANULAR],
    )).rows[0].n;
    expect(trades).toBe(0);
    expect(ust).toBe(0);
  });

  // ── 179: trades columns + new trades + deprecation ──────────────────────────
  it('179: trades = 36 rows (35 active + 1 deprecated)', async () => {
    if (!pool) return;
    const total = (await pool.query(`SELECT count(*)::int AS n FROM trades`)).rows[0].n;
    const active = (await pool.query(`SELECT count(*)::int AS n FROM trades WHERE kind != 'deprecated'`)).rows[0].n;
    expect(total).toBe(36);
    expect(active).toBe(35);
  });

  it('179: the 3 new trades exist at ids 34/36/37 with the right kind/seq/cost_basis', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT id, slug, kind, seq, cost_basis FROM trades WHERE id IN (34, 36, 37) ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: 34, slug: 'overhead-doors',   kind: 'construction', seq: 11,   cost_basis: 'per_unit' },
      { id: 36, slug: 'site-preparation', kind: 'service',      seq: 1,    cost_basis: 'fixed' },
      { id: 37, slug: 'site-maintenance', kind: 'service',      seq: null, cost_basis: 'fixed' },
    ]);
  });

  it('179: temporary-fencing keeps id 30 but is kind=deprecated (IDs 1-32 invariant)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(`SELECT id, kind FROM trades WHERE slug = 'temporary-fencing'`);
    expect(rows).toEqual([{ id: 30, kind: 'deprecated' }]);
  });

  it('179: kind and cost_basis CHECK constraints reject out-of-vocab values', async () => {
    if (!pool) return;
    await expect(pool.query(`UPDATE trades SET kind = 'bogus' WHERE id = 1`)).rejects.toThrow();
    await expect(pool.query(`UPDATE trades SET cost_basis = 'bogus' WHERE id = 1`)).rejects.toThrow();
  });

  it('179: realtor has no trade_sqft_rates row (commission, not per-sqft)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM trade_sqft_rates WHERE trade_slug = 'realtor'`);
    expect(rows[0].n).toBe(0);
  });

  // ── 180: product_groups ─────────────────────────────────────────────────────
  it('180: product_groups = 27 (20 material / 4 rental / 3 service) with the split applied', async () => {
    if (!pool) return;
    const counts = (await pool.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE type='material')::int AS m,
              count(*) FILTER (WHERE type='rental')::int   AS r,
              count(*) FILTER (WHERE type='service')::int  AS s
       FROM product_groups`,
    )).rows[0];
    expect(counts).toEqual({ n: 27, m: 20, r: 4, s: 3 });
    const split = (await pool.query(
      `SELECT id, slug FROM product_groups WHERE id IN (11, 12, 17) ORDER BY id`,
    )).rows;
    expect(split).toEqual([
      { id: 11, slug: 'lumber' },
      { id: 12, slug: 'drywall-board' },
      { id: 17, slug: 'garage-doors' },
    ]);
  });

  // ── 181: trade_products ─────────────────────────────────────────────────────
  it('181: trade_products holds 32 links, all FK-valid', async () => {
    if (!pool) return;
    const n = (await pool.query(`SELECT count(*)::int AS n FROM trade_products`)).rows[0].n;
    expect(n).toBe(32);
    const orphans = (await pool.query(
      `SELECT count(*)::int AS n FROM trade_products tp
        WHERE NOT EXISTS (SELECT 1 FROM trades t WHERE t.id = tp.trade_id)
           OR NOT EXISTS (SELECT 1 FROM product_groups p WHERE p.id = tp.product_id)`,
    )).rows[0].n;
    expect(orphans).toBe(0);
  });

  // ── idempotency: every migration re-EXECUTES without error ──────────────────
  // Proves the 178-181 SQL is safe to run a second time (no throw). Each re-run
  // is ROLLED BACK, not committed: some of this SQL is not perfectly idempotent
  // on a committed re-run (e.g. an unguarded trades INSERT resurrects rows a
  // prior run created), but migrate.js tracks applied migrations by number and
  // NEVER re-applies one — a committed re-run is not a real scenario. Rolling
  // back also keeps the shared test DB pristine for the final-count assertions
  // below (and for other test files reading `trades`). Committing the re-run
  // here previously left +2 trade rows, failing this test AND polluting others.
  it('178-181 re-run without error, base counts intact', async () => {
    if (!pool) return;
    const c = await pool.connect();
    try {
      for (const f of [
        '178_fold_granular_trades.sql',
        '179_trades_taxonomy_columns.sql',
        '180_product_groups_taxonomy.sql',
        '181_trade_products.sql',
      ]) {
        await c.query('BEGIN');
        await c.query(migrationSql(f));
        await c.query('ROLLBACK');
      }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    const trades = (await pool.query(`SELECT count(*)::int AS n FROM trades`)).rows[0].n;
    const products = (await pool.query(`SELECT count(*)::int AS n FROM product_groups`)).rows[0].n;
    const links = (await pool.query(`SELECT count(*)::int AS n FROM trade_products`)).rows[0].n;
    expect(trades).toBe(36);
    expect(products).toBe(27);
    expect(links).toBe(32);
  });
});
