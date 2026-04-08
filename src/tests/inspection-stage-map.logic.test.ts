// Logic Layer Tests — Migration 072 (inspection_stage_map schema + seed)
// 🔗 SPEC LINK: docs/specs/product/future/71_lead_timing_engine.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '072_inspection_stage_map.sql',
);

describe('Migration 072 — inspection_stage_map', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('has UP and DOWN blocks', () => {
    expect(sql).toMatch(/^--\s*UP\b/m);
    expect(sql).toMatch(/^--\s*DOWN\b/m);
  });

  it('creates the inspection_stage_map table', () => {
    expect(sql).toMatch(/CREATE TABLE inspection_stage_map/);
  });

  it('enforces relationship CHECK for follows/concurrent', () => {
    expect(sql).toMatch(/CHECK \(relationship IN \('follows', 'concurrent'\)\)/);
  });

  it('has UNIQUE index on (stage_name, trade_slug, precedence)', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX idx_inspection_stage_map_stage_trade_prec[\s\S]*\(stage_name, trade_slug, precedence\)/,
    );
  });

  it('has trade_slug index', () => {
    expect(sql).toMatch(/CREATE INDEX idx_inspection_stage_map_trade ON inspection_stage_map \(trade_slug\)/);
  });

  it('contains exactly 21 seed INSERT rows', () => {
    const insertBlockMatch = /INSERT INTO inspection_stage_map[\s\S]*?;/.exec(sql);
    expect(insertBlockMatch).not.toBeNull();
    const block = insertBlockMatch?.[0] ?? '';
    // Each seed row starts with `('`
    const rows = block.match(/\(\s*'/g) ?? [];
    expect(rows).toHaveLength(21);
  });

  it('includes painting twice: Fire Separations precedence 10 and Occupancy precedence 20', () => {
    expect(sql).toMatch(/\('Fire Separations',\s*50,\s*'painting',\s*'follows',\s*7,\s*21,\s*10\)/);
    expect(sql).toMatch(/\('Occupancy',\s*70,\s*'painting',\s*'follows',\s*0,\s*7,\s*20\)/);
  });

  it('includes plumbing under Structural Framing with precedence 100', () => {
    expect(sql).toMatch(/\('Structural Framing',\s*30,\s*'plumbing',\s*'follows',\s*5,\s*14,\s*100\)/);
  });

  it('includes drain-plumbing as concurrent with Excavation/Shoring', () => {
    expect(sql).toMatch(/\('Excavation\/Shoring',\s*10,\s*'drain-plumbing',\s*'concurrent',\s*0,\s*7,\s*100\)/);
  });

  it('constrains stage_sequence to known vocabulary (10..70)', () => {
    expect(sql).toMatch(/stage_sequence[\s\S]*CHECK \(stage_sequence IN \(10, 20, 30, 40, 50, 60, 70\)\)/);
  });

  it('enforces precedence > 0', () => {
    expect(sql).toMatch(/precedence[\s\S]*CHECK \(precedence > 0\)/);
  });

  it('enforces min_lag_days <= max_lag_days lag-window invariant', () => {
    expect(sql).toMatch(/CHECK \(min_lag_days >= 0 AND max_lag_days >= min_lag_days\)/);
  });
});
