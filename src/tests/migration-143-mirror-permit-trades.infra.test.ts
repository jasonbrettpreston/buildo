// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C R5.3
//
// Migration 143 — mirror trigger on permit_trades → lead_trades.
//
// Per R5.3 design pivot (2026-05-13): rather than touching 6 writer
// scripts, an AFTER INSERT/UPDATE/DELETE trigger on permit_trades
// auto-mirrors every write to lead_trades using the canonical lead_id
// derivation. Zero application changes; zero risk of missed writer.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 143 — mirror permit_trades → lead_trades trigger (Phase C R5.3)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/143_mirror_permit_trades_to_lead_trades.sql'),
      'utf-8',
    );
  });

  it('creates the mirror trigger function', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+mirror_permit_trades_to_lead_trades\s*\(\s*\)\s+RETURNS\s+TRIGGER/i);
  });

  it('function language is plpgsql', () => {
    expect(sql).toMatch(/LANGUAGE\s+plpgsql/i);
  });

  it('handles INSERT branch with canonical lead_id derivation', () => {
    expect(sql).toMatch(/IF\s+TG_OP\s*=\s*'INSERT'/i);
    // INSERT branch must derive lead_id and INSERT into lead_trades
    expect(sql).toMatch(/INSERT\s+INTO\s+lead_trades[\s\S]*?'permit:'\s*\|\|\s*NEW\.permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*NEW\.revision_num\s*,\s*2\s*,\s*'0'\s*\)/i);
  });

  it('INSERT branch uses ON CONFLICT (lead_id, trade_id) DO UPDATE (idempotent re-runs)', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*lead_id\s*,\s*trade_id\s*\)\s+DO\s+UPDATE/i);
  });

  it('INSERT mirrors all upserted columns (tier, confidence, is_active, phase, lead_score, classified_at)', () => {
    // ON CONFLICT DO UPDATE SET must update each mutable column
    for (const col of ['tier', 'confidence', 'is_active', 'phase', 'lead_score', 'classified_at']) {
      expect(sql).toMatch(new RegExp(`${col}\\s*=\\s*EXCLUDED\\.${col}`, 'i'));
    }
  });

  it('handles UPDATE branch via INSERT ON CONFLICT DO UPDATE (defensive upsert)', () => {
    expect(sql).toMatch(/ELSIF\s+TG_OP\s*=\s*'UPDATE'/i);
    // R5.3.f fix: UPDATE branch uses INSERT ON CONFLICT DO UPDATE
    // instead of blind UPDATE — handles the case where lead_trades is
    // out of sync (manually deleted, missed install, etc.). Two
    // INSERT...ON CONFLICT statements in the function: one in the
    // INSERT branch, one in the UPDATE branch.
    const inserts = sql.match(/INSERT\s+INTO\s+lead_trades/gi) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });

  it('UPDATE branch raises EXCEPTION on permit_num/revision_num key change (R5.3.f defensive guard)', () => {
    // Theoretical case (writer scripts treat key as immutable) — fail
    // loudly rather than silently orphan the old lead_trades row.
    expect(sql).toMatch(/IF\s+old_lead_id\s+IS\s+DISTINCT\s+FROM\s+new_lead_id\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('handles DELETE branch with OLD.permit_num + OLD.revision_num', () => {
    expect(sql).toMatch(/ELSIF\s+TG_OP\s*=\s*'DELETE'/i);
    // The DELETE branch derives the lead_id from OLD values (either
    // inline OR via a DECLARE'd variable) and then DELETEs from
    // lead_trades by that lead_id + trade_id.
    expect(sql).toMatch(/'permit:'\s*\|\|\s*OLD\.permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*OLD\.revision_num\s*,\s*2\s*,\s*'0'\s*\)/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+lead_trades[\s\S]*?WHERE\s+lead_id\s*=/i);
    expect(sql).toMatch(/AND\s+trade_id\s*=\s*OLD\.trade_id/i);
  });

  it('creates AFTER INSERT OR UPDATE OR DELETE trigger on permit_trades', () => {
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+trg_mirror_permit_trades_to_lead_trades[\s\S]*?AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+permit_trades/i);
  });

  it('trigger is FOR EACH ROW (not statement-level)', () => {
    expect(sql).toMatch(/FOR\s+EACH\s+ROW/i);
  });

  it('uses DROP TRIGGER IF EXISTS before CREATE TRIGGER (idempotent re-runs)', () => {
    expect(sql).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_mirror_permit_trades_to_lead_trades\s+ON\s+permit_trades/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });
});
