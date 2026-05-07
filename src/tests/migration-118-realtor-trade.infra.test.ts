// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 (Cycle 7 deliverable)
//
// SQL-string assertions on migration 118. Mirrors the test pattern in
// migration-090.infra.test.ts — reads the migration file as text, asserts
// the canonical INSERT statements + idempotency clauses are present.
//
// Migration 118 wires the realtor persona into the data layer:
//   1. INSERT INTO trades (id 33, slug 'realtor', ...)
//   2. INSERT INTO trade_configurations ('realtor', bid_phase, work_phase, ...)
// Both INSERTs are idempotent via ON CONFLICT.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 118 — realtor trade wire-up', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/118_realtor_trade.sql'),
      'utf-8',
    );
  });

  it('inserts the realtor row into the trades table', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+trades/i);
    expect(sql).toMatch(/'realtor'/);
    // id 33 — sort_order 33 — Spec 91 §3.5 item 1 contract.
    expect(sql).toMatch(/\b33\b/);
  });

  it('trades INSERT is idempotent (ON CONFLICT clause)', () => {
    // Without ON CONFLICT, re-running the migration on a partially-applied
    // DB would crash. ON CONFLICT (id) DO NOTHING is the canonical guard.
    expect(sql).toMatch(/ON\s+CONFLICT/i);
  });

  it('inserts the realtor calibration into trade_configurations', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+trade_configurations/i);
    expect(sql).toMatch(/'realtor'/);
  });

  it('trade_configurations INSERT calibrates bid_phase to P1 (earliest visibility)', () => {
    // P1 = intake. Realtor sees permits before issuance per Spec 91 §3.5
    // product call. The string match is loose to allow either column-named
    // INSERT or positional INSERT layouts.
    expect(sql).toMatch(/'P1'/);
  });

  it('trade_configurations INSERT calibrates work_phase to P19 (predicted occupancy)', () => {
    // P19 = winddown / pre-occupancy. Realtor's predicted_start aligns with
    // project completion ("ready to list").
    expect(sql).toMatch(/'P19'/);
  });

  it('trade_configurations INSERT has ON CONFLICT for re-run safety', () => {
    // Re-running migration 118 must not crash on the trade_configurations
    // INSERT. Acceptable forms: ON CONFLICT (trade_slug) DO UPDATE / DO NOTHING.
    const tradeConfigsBlock = sql
      .split(/INSERT\s+INTO\s+trade_configurations/i)[1]
      ?.split(';')[0] ?? '';
    expect(tradeConfigsBlock).toMatch(/ON\s+CONFLICT/i);
  });

  it('does NOT modify permit_trades inside the migration (deferred to backfill script)', () => {
    // Per Spec 91 §3.5 item 4: the row count is too large for an inline
    // transactional migration. Backfill is handled by a separate runtime
    // script (scripts/backfill-realtor-permit-trades.js) — see Cycle 7
    // §10 note. If a future contributor moves the backfill INTO the
    // migration, this test catches it.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+permit_trades/i);
    expect(sql).not.toMatch(/UPDATE\s+permit_trades/i);
  });

  it('has commented manual-rollback procedure (no transactional DOWN)', () => {
    // DOWN-as-DELETE on a million-row backfilled table is risky; the
    // canonical rollback is documented as manual SQL.
    expect(sql).toMatch(/--\s*(DOWN|MANUAL ROLLBACK|ROLLBACK)/i);
  });
});
