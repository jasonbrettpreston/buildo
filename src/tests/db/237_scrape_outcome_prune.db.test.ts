// 🔗 SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3 (retention/rollup)
//   + docs/specs/00-architecture/115_scheduling.md §5 (permit_scrape_outcomes_prune)
//
// Live-DB proof of migration 237 (D1 ruling: 90-day raw + prune-time rollup):
//   (a) the prune is ATOMIC and moves >90-day rows into the rollup in one statement
//       (Gemini CRITICAL — mid-failure rolls back both halves; re-run cannot double-count);
//   (b) IDEMPOTENT: a second run prunes nothing and leaves occurrences unchanged;
//   (c) LEAST/GREATEST window arithmetic on first_at/last_at is correct across runs;
//   (d) permit_num-NULL raw rows (the zero-resolution fallback) roll up under their
//       year_seq key instead of vanishing at the horizon;
//   (e) the function writes a durable pipeline_runs summary row (235-hardened shape);
//   (f) EXECUTE is revoked from anon/authenticated (service plumbing only).
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const YS = '99 237001';
const PN = '99 237001 BLD';
const YS_ORPHAN = '99 237002';

async function seed(
  pool: Pool,
  daysAgo: number,
  overrides: { permitNum?: string | null; yearSeq?: string; outcome?: string; transport?: string } = {},
) {
  await pool.query(
    `INSERT INTO permit_scrape_outcomes (permit_num, year_seq, outcome, transport, observed_at)
     VALUES ($1, $2, $3, $4, now() - make_interval(days => $5))`,
    [
      overrides.permitNum === undefined ? PN : overrides.permitNum,
      overrides.yearSeq ?? YS,
      overrides.outcome ?? 'waf_blocked',
      overrides.transport ?? 'http',
      daysAgo,
    ],
  );
}

describe.skipIf(!dbAvailable())('migration 237 — scrape-outcome retention prune (live DB)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM permit_scrape_outcomes WHERE year_seq IN ($1, $2)`, [YS, YS_ORPHAN]);
    await pool.query(`DELETE FROM permit_scrape_outcome_rollup WHERE permit_num IN ($1, $2, $3)`, [
      PN,
      YS,
      YS_ORPHAN,
    ]);
    await pool.query(`DELETE FROM pipeline_runs WHERE pipeline = 'scrape_outcome_prune'`);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM permit_scrape_outcomes WHERE year_seq IN ($1, $2)`, [YS, YS_ORPHAN]);
    await pool.query(`DELETE FROM permit_scrape_outcome_rollup WHERE permit_num IN ($1, $2, $3)`, [
      PN,
      YS,
      YS_ORPHAN,
    ]);
    await pool.end();
  });

  it('prunes >90-day rows into the rollup, keeps recent rows, and is idempotent', async () => {
    await seed(pool, 120);
    await seed(pool, 100);
    await seed(pool, 10);

    const first = await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    expect(Number(first.rows[0].pruned_count)).toBe(2);

    const raw = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permit_scrape_outcomes WHERE year_seq = $1`,
      [YS],
    );
    expect(raw.rows[0].n).toBe(1); // the 10-day row survives

    const rollup = await pool.query(
      `SELECT occurrences, first_at, last_at FROM permit_scrape_outcome_rollup
       WHERE permit_num = $1 AND outcome = 'waf_blocked' AND transport = 'http'`,
      [PN],
    );
    expect(rollup.rows).toHaveLength(1);
    expect(Number(rollup.rows[0].occurrences)).toBe(2);
    // LEAST/GREATEST: first_at is the 120-day row, last_at the 100-day row.
    expect(rollup.rows[0].first_at.getTime()).toBeLessThan(rollup.rows[0].last_at.getTime());

    // Idempotent: nothing left to prune, occurrences unchanged.
    const second = await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    expect(Number(second.rows[0].pruned_count)).toBe(0);
    const rollupAfter = await pool.query(
      `SELECT occurrences FROM permit_scrape_outcome_rollup
       WHERE permit_num = $1 AND outcome = 'waf_blocked' AND transport = 'http'`,
      [PN],
    );
    expect(Number(rollupAfter.rows[0].occurrences)).toBe(2);
  });

  it('accumulates across prune runs with LEAST/GREATEST window arithmetic', async () => {
    await seed(pool, 100);
    await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    const before = await pool.query(
      `SELECT occurrences, first_at, last_at FROM permit_scrape_outcome_rollup WHERE permit_num = $1`,
      [PN],
    );

    // An OLDER row arrives late (backfill/clock skew shape): first_at must move
    // back, last_at must not move.
    await seed(pool, 200);
    await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    const after = await pool.query(
      `SELECT occurrences, first_at, last_at FROM permit_scrape_outcome_rollup WHERE permit_num = $1`,
      [PN],
    );
    expect(Number(after.rows[0].occurrences)).toBe(2);
    expect(after.rows[0].first_at.getTime()).toBeLessThan(before.rows[0].first_at.getTime());
    expect(after.rows[0].last_at.getTime()).toBe(before.rows[0].last_at.getTime());
  });

  it('permit_num-NULL rows roll up under their year_seq key (anomalies never vanish)', async () => {
    await seed(pool, 100, { permitNum: null, yearSeq: YS_ORPHAN, outcome: 'address_not_found' });
    await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    const rollup = await pool.query(
      `SELECT occurrences FROM permit_scrape_outcome_rollup
       WHERE permit_num = $1 AND outcome = 'address_not_found'`,
      [YS_ORPHAN],
    );
    expect(rollup.rows).toHaveLength(1);
    expect(Number(rollup.rows[0].occurrences)).toBe(1);
  });

  it('rollup rows are keyed per transport', async () => {
    await seed(pool, 100, { transport: 'http' });
    await seed(pool, 100, { transport: 'browser' });
    await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    const rollup = await pool.query(
      `SELECT transport, occurrences FROM permit_scrape_outcome_rollup
       WHERE permit_num = $1 ORDER BY transport`,
      [PN],
    );
    expect(rollup.rows.map((r) => r.transport)).toEqual(['browser', 'http']);
  });

  it('writes a durable pipeline_runs summary row (235 shape)', async () => {
    await seed(pool, 100);
    await pool.query(`SELECT * FROM prune_permit_scrape_outcomes()`);
    const run = await pool.query(
      `SELECT status, records_meta FROM pipeline_runs WHERE pipeline = 'scrape_outcome_prune'
       ORDER BY started_at DESC LIMIT 1`,
    );
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0].status).toBe('completed');
    expect(Number(run.rows[0].records_meta.pruned_count)).toBe(1);
  });

  it('EXECUTE is revoked from anon and authenticated', async () => {
    const priv = await pool.query(
      `SELECT has_function_privilege('anon', 'public.prune_permit_scrape_outcomes()', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'public.prune_permit_scrape_outcomes()', 'EXECUTE') AS authed`,
    );
    expect(priv.rows[0].anon).toBe(false);
    expect(priv.rows[0].authed).toBe(false);
  });
});
