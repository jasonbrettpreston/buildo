// 🔗 SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3 (scrape-outcome persistence)
//   + docs/specs/00-architecture/114_rls_policy_catalog.md §4/§11 (Class B default deny)
//
// Live-DB proof of migration 236 (WF2 2026-07-31, .cursor/wf2_scrape_outcome_persistence_v2.md):
//   (a) chk_permit_scrape_outcomes_outcome rejects a value outside the 8-outcome vocabulary;
//   (b) chk_permit_scrape_outcomes_transport rejects anything but http/browser;
//   (c) the num_nonnulls CHECK rejects a row with neither permit_num nor year_seq
//       (the year_seq zero-resolution fallback depends on year_seq-only rows being legal);
//   (d) RLS is ENABLED with ZERO policies on BOTH tables (Spec 114 Class B);
//   (e) the live CHECK's vocabulary equals docs/specs/_contracts.json schema.scrape_outcomes
//       (triple agreement: contract <-> migration CHECK <-> python frozenset — the python
//       side is pinned by scripts/tests/test_scrape_outcome_persistence.py).
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const YS = '99 236001';
const PN = '99 236001 BLD';

describe.skipIf(!dbAvailable())('migration 236 — permit_scrape_outcomes (live DB)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM permit_scrape_outcomes WHERE year_seq = $1`, [YS]);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('accepts a full row and defaults observed_at', async () => {
    const res = await pool.query(
      `INSERT INTO permit_scrape_outcomes (permit_num, year_seq, outcome, detail, transport, run_id)
       VALUES ($1, $2, 'waf_blocked', 'unparseable', 'http', 'run-1')
       RETURNING observed_at`,
      [PN, YS],
    );
    expect(res.rows[0].observed_at).toBeInstanceOf(Date);
  });

  it('accepts a year_seq-only row (the zero-resolution fallback)', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_scrape_outcomes (year_seq, outcome, transport)
         VALUES ($1, 'address_not_found', 'browser')`,
        [YS],
      ),
    ).resolves.toBeDefined();
  });

  it('the outcome CHECK rejects a value outside the vocabulary', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_scrape_outcomes (permit_num, year_seq, outcome, transport)
         VALUES ($1, $2, 'hollow_stages', 'http')`,
        [PN, YS],
      ),
    ).rejects.toThrow(/chk_permit_scrape_outcomes_outcome/);
  });

  it('the transport CHECK rejects an unknown transport', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_scrape_outcomes (permit_num, year_seq, outcome, transport)
         VALUES ($1, $2, 'scraped', 'carrier_pigeon')`,
        [PN, YS],
      ),
    ).rejects.toThrow(/chk_permit_scrape_outcomes_transport/);
  });

  it('transport is NOT NULL', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_scrape_outcomes (permit_num, year_seq, outcome)
         VALUES ($1, $2, 'scraped')`,
        [PN, YS],
      ),
    ).rejects.toThrow(/transport/);
  });

  it('a row with neither permit_num nor year_seq is rejected (num_nonnulls CHECK)', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_scrape_outcomes (outcome, transport) VALUES ('scraped', 'http')`,
      ),
    ).rejects.toThrow(/chk_permit_scrape_outcomes_subject/);
  });

  it('detail is capped at VARCHAR(500)', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_scrape_outcomes (year_seq, outcome, detail, transport)
         VALUES ($1, 'waf_blocked', repeat('x', 501), 'http')`,
        [YS],
      ),
    ).rejects.toThrow(/varying/);
  });

  it('RLS is enabled with zero policies on both tables (Spec 114 Class B)', async () => {
    const rls = await pool.query(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('permit_scrape_outcomes', 'permit_scrape_outcome_rollup')`,
    );
    expect(rls.rows).toHaveLength(2);
    for (const row of rls.rows) expect(row.relrowsecurity).toBe(true);
    const policies = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pg_policies
       WHERE tablename IN ('permit_scrape_outcomes', 'permit_scrape_outcome_rollup')`,
    );
    expect(policies.rows[0].n).toBe(0);
  });

  it('the live CHECK vocabulary equals _contracts.json schema.scrape_outcomes', async () => {
    const contracts = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'docs/specs/_contracts.json'), 'utf8'),
    );
    const expected: string[] = contracts.schema.scrape_outcomes;
    expect(expected).toHaveLength(8);
    const def = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname = 'chk_permit_scrape_outcomes_outcome'`,
    );
    expect(def.rows).toHaveLength(1);
    const inDb = [...(def.rows[0].def as string).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(inDb)).toEqual(new Set(expected));
  });

  it('the rollup PK carries transport (a transport regression must survive the horizon)', async () => {
    const pk = await pool.query(
      `SELECT array_agg(a.attname::text ORDER BY a.attnum) AS cols
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'permit_scrape_outcome_rollup'::regclass AND i.indisprimary`,
    );
    expect(pk.rows[0].cols.sort()).toEqual(['outcome', 'permit_num', 'transport']);
  });
});
