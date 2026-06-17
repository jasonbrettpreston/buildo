// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §2
//
// Real-DB integration for migration 177_rekey_drain_plumbing_trade.sql — the drain-plumbing
// 34→32 canonical re-key. Verifies the post-state on a freshly-migrated DB (drain-plumbing=32,
// id 34 freed, the 3 by-id FKs + slug-FK present, mirror trigger re-enabled, universal-stream
// slug rows intact) and that re-running the migration is an idempotent no-op.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 177 — re-key drain-plumbing to canonical id 32', () => {
  afterAll(async () => { if (pool) await pool.end(); });

  it('drain-plumbing is at canonical id 32 with sort_order 32', async () => {
    if (!pool) return;
    const { rows } = await pool.query(`SELECT id, sort_order FROM trades WHERE slug = 'drain-plumbing'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(32);
    expect(rows[0].sort_order).toBe(32);
  });

  it('drain-plumbing vacated id 34; Spec 80 v-next (mig 179) reuses 34 for overhead-doors', async () => {
    if (!pool) return;
    // Migration 177 left id 34 a free gap (drain-plumbing's vacated SERIAL slot).
    // Migration 179 KNOWINGLY reuses that out-of-(1-32)-range slot for the new
    // `overhead-doors` trade — permitted, since the never-renumber invariant only
    // covers ids 1-32. What still matters is that drain-plumbing is NOT at 34 (it
    // is canonical id 32, asserted above).
    const { rows } = await pool.query(`SELECT slug FROM trades WHERE id = 34`);
    expect(rows).toEqual([{ slug: 'overhead-doors' }]);
  });

  it('the 3 by-id FKs + the universal_stream slug-FK all exist; mirror trigger is enabled', async () => {
    if (!pool) return;
    const fks = (await pool.query(
      `SELECT conname FROM pg_constraint WHERE confrelid = 'trades'::regclass AND contype = 'f' ORDER BY conname`,
    )).rows.map((r) => r.conname);
    expect(fks).toEqual(expect.arrayContaining([
      'permit_trades_trade_id_fkey',
      'lead_trades_trade_id_fkey',
      'trade_mapping_rules_trade_id_fkey',
      'universal_stream_trade_signals_trade_slug_fkey',
    ]));
    const trg = (await pool.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_mirror_permit_trades_to_lead_trades'`,
    )).rows[0];
    expect(trg.tgenabled).toBe('O'); // 'O' = enabled (drop/recreate + disable/enable fully reversed)
  });

  it('universal_stream_trade_signals drain-plumbing rows still resolve (slug-FK never broke)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM universal_stream_trade_signals WHERE trade_slug = 'drain-plumbing'`,
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('re-running the migration is an idempotent no-op (guard returns early when already at 32)', async () => {
    if (!pool) return;
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../../migrations/177_rekey_drain_plumbing_trade.sql'),
      'utf8',
    );
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql); // UP runs; DOWN section is all comments — guard hits `cur=32 → RETURN`
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    const after = (await pool.query(`SELECT id FROM trades WHERE slug = 'drain-plumbing'`)).rows[0];
    expect(after.id).toBe(32); // unchanged, no error
  });
});
