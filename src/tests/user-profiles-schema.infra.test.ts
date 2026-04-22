// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Migration 075 — user_profiles', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/075_user_profiles.sql'),
      'utf-8',
    );
  });

  it('has UP and DOWN blocks', () => {
    expect(sql).toMatch(/--\s*UP/);
    expect(sql).toMatch(/--\s*DOWN/);
  });

  it('creates user_profiles table with VARCHAR(128) PRIMARY KEY user_id (Firebase max)', () => {
    expect(sql).toMatch(/CREATE TABLE user_profiles/);
    expect(sql).toMatch(/user_id\s+VARCHAR\(128\)\s+PRIMARY KEY/);
  });

  it('declares trade_slug as VARCHAR(50) NOT NULL', () => {
    expect(sql).toMatch(/trade_slug\s+VARCHAR\(50\)\s+NOT NULL/);
  });

  it('declares display_name as VARCHAR(200) nullable', () => {
    expect(sql).toMatch(/display_name\s+VARCHAR\(200\)/);
  });

  it('has TIMESTAMPTZ NOT NULL DEFAULT NOW() on created_at and updated_at', () => {
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/);
    expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/);
  });

  it('enforces non-empty / non-whitespace trade_slug via CHECK constraint', () => {
    expect(sql).toMatch(/CHECK\s*\(\s*trim\(trade_slug\)\s*<>\s*''\s*\)/);
  });

  it('does NOT create a secondary trade_slug index (PK lookup is the hot path)', () => {
    // Earlier draft had CREATE INDEX idx_user_profiles_trade_slug; removed
    // because no Phase 2 query uses it. Adversarial review (Gemini + DeepSeek)
    // flagged it as premature.
    expect(sql).not.toMatch(/CREATE INDEX idx_user_profiles_trade_slug/);
  });

  it('DOWN block has ALLOW-DESTRUCTIVE marker for the commented DROP TABLE', () => {
    expect(sql).toMatch(/ALLOW-DESTRUCTIVE/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS user_profiles/);
  });
});
