// Infra Layer Tests — Migration 071 (cost_estimates schema)
// 🔗 SPEC LINK: docs/specs/product/future/72_lead_cost_model.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '071_cost_estimates.sql',
);

describe('Migration 071 — cost_estimates', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('has UP and DOWN blocks', () => {
    expect(sql).toMatch(/^--\s*UP\b/m);
    expect(sql).toMatch(/^--\s*DOWN\b/m);
  });

  it('creates the cost_estimates table', () => {
    expect(sql).toMatch(/CREATE TABLE cost_estimates/);
  });

  it('uses composite PK (permit_num, revision_num)', () => {
    expect(sql).toMatch(/PRIMARY KEY \(permit_num, revision_num\)/);
  });

  it('has FK to permits with CASCADE', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \(permit_num, revision_num\)[\s\S]*REFERENCES permits\(permit_num, revision_num\) ON DELETE CASCADE/,
    );
  });

  it('enforces cost_source CHECK for permit/model', () => {
    expect(sql).toMatch(/CHECK \(cost_source IN \('permit', 'model'\)\)/);
  });

  it('enforces cost_tier CHECK enum', () => {
    expect(sql).toMatch(
      /CHECK \(cost_tier IN \('small', 'medium', 'large', 'major', 'mega'\)\)/,
    );
  });

  it('constrains complexity_score to 0-100', () => {
    expect(sql).toMatch(/complexity_score[\s\S]*CHECK \(complexity_score >= 0 AND complexity_score <= 100\)/);
  });

  it('defaults model_version=1 and computed_at=NOW()', () => {
    expect(sql).toMatch(/model_version\s+INTEGER\s+NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/computed_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/);
  });

  it('creates the cost_tier index', () => {
    expect(sql).toMatch(/CREATE INDEX idx_cost_estimates_tier ON cost_estimates \(cost_tier\)/);
  });
});
