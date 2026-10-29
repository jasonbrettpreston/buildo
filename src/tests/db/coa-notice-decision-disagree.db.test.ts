// 🔗 SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §Plausibility P2 (decision_disagree)
//
// Live-DB proof of the corrected P2 check (operator CHAT-144.P2-DISAGREE, 2026-10-25-batch-c): the descriptor's
// own SQL runs over nine synthetic applications inserted inside one transaction, which is then rolled back. The
// test asserts the exact SET of counted synthetic applications (not a delta, which an inverted predicate can also
// satisfy — B10-FIX panel, Compliance F4). Shapes:
//   (a) hearing notice (pending) + CKAN NULL        → not counted
//   (b) partial refusal + CKAN 'Approved'            → not counted
//   (c) every item refused + CKAN 'Approved'         → counted
//   (d) approved items + CKAN 'Refused'              → counted
//   (e) every item refused + CKAN 'Refused'          → not counted
//   (f) decided items + CKAN NULL                    → not counted
//   (g) refused + 'unknown' items + CKAN 'Approved'  → counted ('unknown' is not decided; every DECIDED item refused)
//   (h) only 'unknown' items + CKAN 'Approved'       → not counted (no decided item)
//   (i) decision notice with a deferred ('pending') item + refused items + CKAN 'Approved' → not counted: CHAT-144
//       defines a decision notice as one with no 'pending' item, so a deferred item skips the application (pinned
//       here; the doc_type alternative is an operator card)
// Counted set = {c, d, g}. RED BASELINE: the pre-CHAT-144 item-level SQL counts {a, b, c, d, f, g, i}; the first
// CHAT-144 SQL (bool_and over every item, 'unknown' read as not refused) counts {c, d} — it misses g.
// Skipped unless BUILDO_TEST_DB=1 (npm run test:db).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { makeCoaNoticeVariance, type CoaNoticeVarianceRow } from '../factories';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const descriptor = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/load-coa-notices.descriptor.json'), 'utf8'));
function findSql(node: unknown): string | undefined {
  if (Array.isArray(node)) {
    for (const x of node) {
      const hit = findSql(x);
      if (hit) return hit;
    }
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (o.id === 'decision_disagree' && typeof o.sql === 'string') return o.sql;
    for (const v of Object.values(o)) {
      const hit = findSql(v);
      if (hit) return hit;
    }
  }
  return undefined;
}
const SQL = findSql(descriptor)!;

const CASES: Array<{ app: string; ckan: string | null; decisions: string[]; docType?: string }> = [
  { app: 'A0991/26ZZ', ckan: null, decisions: ['pending', 'pending'] },
  { app: 'A0992/26ZZ', ckan: 'Approved', decisions: ['approved_with_conditions', 'refused'] },
  { app: 'A0993/26ZZ', ckan: 'Approved', decisions: ['refused', 'refused'] },
  { app: 'A0994/26ZZ', ckan: 'Refused', decisions: ['approved_with_conditions'] },
  { app: 'A0995/26ZZ', ckan: 'Refused', decisions: ['refused'] },
  { app: 'A0996/26ZZ', ckan: null, decisions: ['approved'] },
  { app: 'A0997/26ZZ', ckan: 'Approved', decisions: ['refused', 'unknown'] },
  { app: 'A0998/26ZZ', ckan: 'Approved', decisions: ['unknown', 'unknown'] },
  { app: 'A0999/26ZZ', ckan: 'Approved', decisions: ['refused', 'pending'], docType: 'decision_notice' },
];
// The counted applications, from the descriptor's own SQL (its count projection swapped for the key).
const SET_SQL = `SELECT * FROM (${SQL.replace('SELECT count(DISTINCT n.application_number)::int FROM', 'SELECT DISTINCT n.application_number FROM')}) q WHERE application_number LIKE '%/26ZZ' ORDER BY 1`;

async function insertVariance(c: PoolClient, row: CoaNoticeVarianceRow): Promise<void> {
  const cols = Object.keys(row);
  await c.query(
    `INSERT INTO coa_notice_variances (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map((k) => (row as unknown as Record<string, unknown>)[k]),
  );
}

describe.skipIf(!dbAvailable())('load_coa_notices P2 decision_disagree (live DB, CHAT-144)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterAll(async () => {
    await pool.end();
  });

  it('T-P2-DB counts exactly the decided applications whose whole-application outcome disagrees (c, d, g)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const k of CASES) {
        await c.query(`INSERT INTO coa_applications (application_number, decision) VALUES ($1, $2)`, [k.app, k.ckan]);
        let n = 0;
        for (const d of k.decisions) {
          n += 1;
          const pending = d === 'pending';
          await insertVariance(c, makeCoaNoticeVariance({
            application_number: k.app,
            item_ordinal: n,
            variance_key: `aic_values_batch|${k.app}|${n}`,
            source_family: 'aic_values_batch',
            source_page: null,
            decision: d,
            decision_source: 'unknown',
            doc_type: k.docType ?? (pending ? 'hearing_notice' : 'decision_notice'),
            source_batch: 'coa-2026-a',
          }));
        }
      }
      if (!SET_SQL.includes('SELECT DISTINCT n.application_number FROM')) throw new Error('the count projection changed; update SET_SQL');
      const counted = (await c.query(SET_SQL)).rows.map((r: { application_number: string }) => r.application_number);
      expect(counted).toEqual(['A0993/26ZZ', 'A0994/26ZZ', 'A0997/26ZZ']);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
