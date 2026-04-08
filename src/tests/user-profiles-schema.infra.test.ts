// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
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

  it('creates user_profiles table with VARCHAR(100) PRIMARY KEY user_id', () => {
    expect(sql).toMatch(/CREATE TABLE user_profiles/);
    expect(sql).toMatch(/user_id\s+VARCHAR\(100\)\s+PRIMARY KEY/);
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

  it('enforces non-empty trade_slug via CHECK constraint', () => {
    expect(sql).toMatch(/CHECK\s*\(\s*length\(trade_slug\)\s*>\s*0\s*\)/);
  });

  it('creates idx_user_profiles_trade_slug index', () => {
    expect(sql).toMatch(/CREATE INDEX idx_user_profiles_trade_slug ON user_profiles \(trade_slug\)/);
  });

  it('DOWN block has ALLOW-DESTRUCTIVE marker for the commented DROP TABLE', () => {
    expect(sql).toMatch(/ALLOW-DESTRUCTIVE/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS user_profiles/);
  });
});
