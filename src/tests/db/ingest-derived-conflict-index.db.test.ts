// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DY (c) (catalog-derived expression conflict
//            target; runner-lane draft R-DV T4/T6); Spec 124 R-DH (a test that needs Postgres is *.db.test.ts)
//
// R-DY T4 — the probed conflict target of `uniq_lifecycle_status_history_natural_key` (an EXPRESSION index:
// date_trunc('second', transitioned_at AT TIME ZONE 'UTC')) renders an ON CONFLICT clause Postgres ACCEPTS
// as an arbiter, and the generated guarded upsert behaves as class A.
// R-DY T6 — dataset equivalence with the frozen legacy statement (load-coa.js / load-permits.js
// `ON CONFLICT (...) DO UPDATE SET event_date = EXCLUDED.event_date WHERE EXCLUDED.event_date IS DISTINCT
// FROM ... AND EXCLUDED.event_date IS NOT NULL`) for an event_date NULL -> value -> NULL replay.
// Every statement runs inside ONE transaction that is rolled back: the test DB is left untouched.
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/ingest-derived-conflict-index.db.test.ts --no-file-parallelism
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const write = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));

const INDEX = 'uniq_lifecycle_status_history_natural_key';
const ledgerSpec = {
  table: 'lifecycle_status_history',
  key: ['lead_id', 'to_status', 'transitioned_at'],
  key_sql_type: 'TEXT',
  columns: [
    { name: 'lead_id', written: 'insert_only' },
    { name: 'from_status', written: 'insert_only' },
    { name: 'to_status', written: 'insert_only' },
    { name: 'transitioned_at', written: 'insert_only' },
    { name: 'detected_by', written: 'insert_only' },
    { name: 'event_date', written: 'step', on_empty: 'preserve_null' },
  ],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['event_date'], scope: 'none', conflict_index: INDEX },
  retract: 'none',
};
const descriptor = { identity: { name: 'r_dy_db', archetype: 'INGESTOR' }, outputs: { writes: [ledgerSpec] }, guards: { srid: 'none' } };

/** The legacy statement's conflict arm, read from the frozen legacy file (never retyped). Since the Night P4 R-EQ shell swap
 *  (42c9d3d5, 2026-10-20) scripts/load-coa.js is the frozen pipeline.step() shell, so the legacy text is the red suite's oracle. */
function legacyTail(): string {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src/tests/steps/coa/fixtures/legacy-load-coa.js.txt'), 'utf8');
  const m = src.match(/ON CONFLICT \(lead_id, to_status, date_trunc\('second', transitioned_at AT TIME ZONE 'UTC'\)\)\s*DO UPDATE SET event_date = EXCLUDED\.event_date\s*WHERE EXCLUDED\.event_date IS DISTINCT FROM lifecycle_status_history\.event_date\s*AND EXCLUDED\.event_date IS NOT NULL/);
  if (!m) throw new Error('the frozen legacy ON CONFLICT arm was not found in the legacy load-coa oracle');
  return m[0];
}

describe.skipIf(!dbAvailable())('R-DY — conflict_index on Postgres (T4 acceptance, T6 legacy equivalence)', () => {
  it('T4: the probed expression index is an accepted arbiter; a replay updates event_date only through the guard', async () => {
    if (!pool) throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const probed = await write.probeConflictIndex(client, 'lifecycle_status_history', INDEX);
      expect(probed.expressions[0]).toBe('lead_id');
      expect(probed.expressions[2]).toMatch(/date_trunc/);
      const plan = write.buildWritePlan(ledgerSpec, descriptor, { conflictTarget: probed.expressions });
      const row = (eventDate: string | null) => ({ lead_id: 'permit:RDY-T4--00', from_status: null, to_status: 'Issued', transitioned_at: '2026-10-18T05:00:00.400Z', detected_by: 'load-permits.js', event_date: eventDate });
      const first = await client.query(plan.upsertSqlFor(1), plan.bindRow(row(null)));
      expect(first.rows).toEqual([{ is_insert: true }]);
      // same second (date_trunc) -> the conflict fires; event_date NULL -> value updates
      const second = await client.query(plan.upsertSqlFor(1), plan.bindRow({ ...row('2026-10-17'), transitioned_at: '2026-10-18T05:00:00.900Z' }));
      expect(second.rows).toEqual([{ is_insert: false }]);
      // an incoming NULL never clears it (preserve_null): the guard skips the row
      const third = await client.query(plan.upsertSqlFor(1), plan.bindRow(row(null)));
      expect(third.rows).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('T6: the codegen statement and the frozen legacy statement leave identical rows for a NULL -> value -> NULL replay', async () => {
    if (!pool) throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const probed = await write.probeConflictIndex(client, 'lifecycle_status_history', INDEX);
      const plan = write.buildWritePlan(ledgerSpec, descriptor, { conflictTarget: probed.expressions });
      const legacy = `INSERT INTO lifecycle_status_history (lead_id, from_status, to_status, transitioned_at, detected_by, event_date)
        VALUES ($1, $2, $3, $4, $5, $6)
        ${legacyTail()}`;
      const replay = ['2026-01-01', null, '2026-01-02', null] as Array<string | null>;
      for (const [lead, run] of [['permit:RDY-T6-NEW--00', (v: string | null) => client.query(plan.upsertSqlFor(1), plan.bindRow({ lead_id: 'permit:RDY-T6-NEW--00', from_status: null, to_status: 'Issued', transitioned_at: '2026-10-18T05:00:00Z', detected_by: 'load-permits.js', event_date: v }))],
        ['permit:RDY-T6-OLD--00', (v: string | null) => client.query(legacy, ['permit:RDY-T6-OLD--00', null, 'Issued', '2026-10-18T05:00:00Z', 'load-permits.js', v])]] as const) {
        void lead;
        await run(null);
        for (const v of replay) await run(v);
      }
      const { rows } = await client.query(
        "SELECT lead_id, from_status, to_status, transitioned_at, event_date FROM lifecycle_status_history WHERE lead_id IN ('permit:RDY-T6-NEW--00', 'permit:RDY-T6-OLD--00') ORDER BY lead_id",
      );
      expect(rows).toHaveLength(2);
      const strip = (r: Record<string, unknown>) => ({ ...r, lead_id: undefined });
      expect(strip(rows[0]!)).toEqual(strip(rows[1]!));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
