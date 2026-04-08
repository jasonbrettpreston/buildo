// Infra Layer Tests — Migration 070 (lead_views corrected schema)
// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '070_lead_views_corrected.sql',
);

describe('Migration 070 — lead_views corrected schema', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('has UP and DOWN blocks', () => {
    expect(sql).toMatch(/^--\s*UP\b/m);
    expect(sql).toMatch(/^--\s*DOWN\b/m);
  });

  it('has ALLOW-DESTRUCTIVE marker above the DROP TABLE', () => {
    expect(sql).toMatch(/--\s*ALLOW-DESTRUCTIVE/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS lead_views CASCADE/);
  });

  it('creates the lead_views table with all required columns', () => {
    expect(sql).toMatch(/CREATE TABLE lead_views/);
    expect(sql).toMatch(/\bid\s+SERIAL\s+PRIMARY KEY/);
    expect(sql).toMatch(/\buser_id\s+VARCHAR\(100\)\s+NOT NULL/);
    expect(sql).toMatch(/\blead_key\s+VARCHAR\(100\)\s+NOT NULL/);
    expect(sql).toMatch(/\blead_type\s+VARCHAR\(20\)\s+NOT NULL/);
    expect(sql).toMatch(/\bpermit_num\s+VARCHAR\(30\)/);
    expect(sql).toMatch(/\brevision_num\s+VARCHAR\(10\)/);
    expect(sql).toMatch(/\bentity_id\s+INTEGER/);
    expect(sql).toMatch(/\btrade_slug\s+VARCHAR\(50\)\s+NOT NULL/);
    expect(sql).toMatch(/\bviewed_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/);
    expect(sql).toMatch(/\bsaved\s+BOOLEAN\s+NOT NULL DEFAULT false/);
  });

  it('enforces lead_type CHECK for permit/builder', () => {
    expect(sql).toMatch(/CHECK \(lead_type IN \('permit', 'builder'\)\)/);
  });

  it('has UNIQUE (user_id, lead_key, trade_slug)', () => {
    expect(sql).toMatch(/UNIQUE \(user_id, lead_key, trade_slug\)/);
  });

  it('has FK to permits with ON DELETE CASCADE', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \(permit_num, revision_num\)[\s\S]*REFERENCES permits\(permit_num, revision_num\) ON DELETE CASCADE/,
    );
  });

  it('has FK to entities with ON DELETE CASCADE', () => {
    expect(sql).toMatch(/FOREIGN KEY \(entity_id\) REFERENCES entities\(id\) ON DELETE CASCADE/);
  });

  it('enforces XOR CHECK between permit and builder lead shapes', () => {
    expect(sql).toMatch(/lead_type = 'permit'[\s\S]*permit_num IS NOT NULL[\s\S]*revision_num IS NOT NULL[\s\S]*entity_id IS NULL/);
    expect(sql).toMatch(/lead_type = 'builder'[\s\S]*entity_id IS NOT NULL[\s\S]*permit_num IS NULL[\s\S]*revision_num IS NULL/);
  });

  it('creates the covering index on (lead_key, trade_slug, viewed_at)', () => {
    expect(sql).toMatch(
      /CREATE INDEX idx_lead_views_lead_trade_viewed ON lead_views \(lead_key, trade_slug, viewed_at\)/,
    );
  });

  it('creates the user history index and BRIN viewed_at index', () => {
    expect(sql).toMatch(/CREATE INDEX idx_lead_views_user_viewed ON lead_views \(user_id, viewed_at DESC\)/);
    expect(sql).toMatch(/CREATE INDEX idx_lead_views_viewed_brin ON lead_views USING BRIN \(viewed_at\)/);
  });
});
