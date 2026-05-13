// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h.2
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 130 (universal_stream_trade_signals create).
//
// Migration 130 creates the join table that decomposes the 152 per-trade ×
// per-row signal columns from Spec 84 §2.5.h.2 (38 trades × 4 signal types)
// into a queryable relational form. The forecast engine (Phase F) queries
// this for granular bimodal routing per (current_seq, trade).
//
// Seed data lands in migration 131.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 130 — universal_stream_trade_signals create (WF1 #coa-pipeline-parity-phase-b R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/130_create_universal_stream_trade_signals.sql'),
      'utf-8',
    );
  });

  it('creates the universal_stream_trade_signals table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+universal_stream_trade_signals/i);
  });

  it('declares seq INTEGER NOT NULL REFERENCES universal_stream_catalog(seq)', () => {
    expect(sql).toMatch(/seq\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+universal_stream_catalog\s*\(\s*seq\s*\)/i);
  });

  it('declares trade_slug VARCHAR(50) NOT NULL REFERENCES trades(slug)', () => {
    expect(sql).toMatch(/trade_slug\s+VARCHAR\s*\(\s*50\s*\)\s+NOT\s+NULL\s+REFERENCES\s+trades\s*\(\s*slug\s*\)/i);
  });

  it('declares signal_type VARCHAR(20) NOT NULL with CHECK on 4 enum values', () => {
    expect(sql).toMatch(/signal_type\s+VARCHAR\s*\(\s*20\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*signal_type\s+IN\s*\(\s*'bid'\s*,\s*'work'\s*,\s*'fallback'\s*,\s*'last_minute'\s*\)\s*\)/i);
  });

  it('declares PRIMARY KEY (seq, trade_slug, signal_type)', () => {
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*seq\s*,\s*trade_slug\s*,\s*signal_type\s*\)/i);
  });

  it('creates idx_universal_stream_trade_signals_trade on (trade_slug, signal_type)', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_universal_stream_trade_signals_trade\s+ON\s+universal_stream_trade_signals\s*\(\s*trade_slug\s*,\s*signal_type\s*\)/i);
  });

  it('creates idx_universal_stream_trade_signals_seq_signal on (seq, signal_type)', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_universal_stream_trade_signals_seq_signal\s+ON\s+universal_stream_trade_signals\s*\(\s*seq\s*,\s*signal_type\s*\)/i);
  });

  it('uses bare CREATE INDEX (not CONCURRENTLY) — empty table at creation', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('does NOT contain INSERT statements (seed is split into migration 131)', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+universal_stream_trade_signals/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
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
