// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h.2
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 128 (universal_stream_catalog create).
//
// Migration 128 creates the reference-data table holding the 110-row Universal
// Stream catalog from Spec 84 §2.5.h.2. The classifier (Phase E) JOINs against
// this table to derive granular lifecycle columns (seq, group, block, stage,
// bid_value) on permits and coa_applications. The front-end JOINs through
// lifecycle_seq for rendering group/block/stage labels + colors + icons.
//
// Data lands in migration 129 (seed split per Spec 42 §6.6.B seed migration
// contract — separating table create from INSERT so a seed failure cannot
// roll back the table).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 128 — universal_stream_catalog create (WF1 #coa-pipeline-parity-phase-b R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/128_create_universal_stream_catalog.sql'),
      'utf-8',
    );
  });

  it('creates the universal_stream_catalog table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+universal_stream_catalog/i);
  });

  it('declares seq INTEGER PRIMARY KEY (1-110 from Spec 84 §2.5.h.2)', () => {
    expect(sql).toMatch(/seq\s+INTEGER\s+PRIMARY\s+KEY/i);
  });

  it('declares source_row_num INTEGER NOT NULL (the # column from §2.5.h.2)', () => {
    expect(sql).toMatch(/source_row_num\s+INTEGER\s+NOT\s+NULL/i);
  });

  it('declares lifecycle_group VARCHAR(10) NOT NULL + group_label VARCHAR(60) NOT NULL', () => {
    expect(sql).toMatch(/lifecycle_group\s+VARCHAR\s*\(\s*10\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/group_label\s+VARCHAR\s*\(\s*60\s*\)\s+NOT\s+NULL/i);
  });

  it('declares lifecycle_block VARCHAR(10) NOT NULL + block_label VARCHAR(60) NOT NULL', () => {
    expect(sql).toMatch(/lifecycle_block\s+VARCHAR\s*\(\s*10\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/block_label\s+VARCHAR\s*\(\s*60\s*\)\s+NOT\s+NULL/i);
  });

  it('declares lifecycle_stage VARCHAR(5) NOT NULL + stage_label VARCHAR(120) NOT NULL', () => {
    expect(sql).toMatch(/lifecycle_stage\s+VARCHAR\s*\(\s*5\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/stage_label\s+VARCHAR\s*\(\s*120\s*\)\s+NOT\s+NULL/i);
  });

  it('declares source VARCHAR(30) NOT NULL with CHECK on the 3 source enum values', () => {
    expect(sql).toMatch(/source\s+VARCHAR\s*\(\s*30\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*source\s+IN\s*\(\s*'coa\.status'\s*,\s*'permits\.status'\s*,\s*'insp\.stage'\s*\)\s*\)/i);
  });

  it('declares status VARCHAR(60) NOT NULL', () => {
    expect(sql).toMatch(/status\s+VARCHAR\s*\(\s*60\s*\)\s+NOT\s+NULL/i);
  });

  it('declares phase VARCHAR(40) (legacy P-code, nullable)', () => {
    expect(sql).toMatch(/phase\s+VARCHAR\s*\(\s*40\s*\)/i);
  });

  it('declares bid_value DECIMAL(3,2) with 0-1 range CHECK allowing NULL (inspection/closure rows)', () => {
    expect(sql).toMatch(/bid_value\s+DECIMAL\s*\(\s*3\s*,\s*2\s*\)/i);
    expect(sql).toMatch(/CHECK\s*\(\s*bid_value\s+IS\s+NULL\s+OR\s*\(\s*bid_value\s*>=\s*0\s+AND\s+bid_value\s*<=\s*1\s*\)\s*\)/i);
  });

  it('declares loop_marker VARCHAR(60) (e.g., "↩ #75" or "(terminal)")', () => {
    expect(sql).toMatch(/loop_marker\s+VARCHAR\s*\(\s*60\s*\)/i);
  });

  it('declares 6 color/icon columns: group_color/icon, block_color/icon, stage_color/icon', () => {
    expect(sql).toMatch(/group_color\s+VARCHAR\s*\(\s*7\s*\)/i);
    expect(sql).toMatch(/group_icon\s+VARCHAR\s*\(\s*8\s*\)/i);
    expect(sql).toMatch(/block_color\s+VARCHAR\s*\(\s*7\s*\)/i);
    expect(sql).toMatch(/block_icon\s+VARCHAR\s*\(\s*8\s*\)/i);
    expect(sql).toMatch(/stage_color\s+VARCHAR\s*\(\s*7\s*\)/i);
    expect(sql).toMatch(/stage_icon\s+VARCHAR\s*\(\s*8\s*\)/i);
  });

  it('declares rows_count INTEGER (snapshot count from §2.5.h.2)', () => {
    expect(sql).toMatch(/rows_count\s+INTEGER/i);
  });

  it('creates idx_universal_stream_catalog_group on lifecycle_group', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_universal_stream_catalog_group\s+ON\s+universal_stream_catalog\s*\(\s*lifecycle_group\s*\)/i);
  });

  it('creates idx_universal_stream_catalog_block on lifecycle_block', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_universal_stream_catalog_block\s+ON\s+universal_stream_catalog\s*\(\s*lifecycle_block\s*\)/i);
  });

  it('uses bare CREATE INDEX (not CONCURRENTLY) — empty table at creation', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('does NOT contain INSERT statements (seed is split into migration 129 per Spec 42 §6.6.B contract)', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+universal_stream_catalog/i);
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
