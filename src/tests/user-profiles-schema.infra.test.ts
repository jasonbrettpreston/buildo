// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
//              docs/specs/03-mobile/95_mobile_user_profiles.md §2, §9 Step 1
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

describe('Migration 114 — user_profiles mobile columns', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/114_user_profiles_mobile_columns.sql'),
      'utf-8',
    );
  });

  it('adds notification_prefs JSONB column WITH a default value (§2.4 — existing rows always valid)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS notification_prefs JSONB/);
    expect(sql).toMatch(/DEFAULT\s+'[\s\S]*new_lead_min_cost_tier[\s\S]*'::jsonb/);
  });

  it('adds all identity columns (full_name, phone_number, company_name, email, backup_email)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS full_name/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS phone_number/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS company_name/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS email/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS backup_email/);
  });

  it('adds subscription columns (subscription_status, trial_started_at, stripe_customer_id)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS subscription_status/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS trial_started_at/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS stripe_customer_id/);
  });

  it('adds location coherence CHECK constraint (chk_location_mode_coords)', () => {
    expect(sql).toMatch(/ADD CONSTRAINT chk_location_mode_coords/);
    expect(sql).toMatch(/location_mode = 'gps_live' AND home_base_lat IS NULL/);
    expect(sql).toMatch(/location_mode = 'home_base_fixed' AND home_base_lat IS NOT NULL/);
  });

  it('adds chk_subscription_status CHECK covering all 6 enum values', () => {
    expect(sql).toMatch(/ADD CONSTRAINT chk_subscription_status/);
    expect(sql).toMatch(/trial/);
    expect(sql).toMatch(/admin_managed/);
    expect(sql).toMatch(/cancelled_pending_deletion/);
  });

  it('makes trade_slug nullable (manufacturer accounts have no single trade)', () => {
    expect(sql).toMatch(/ALTER COLUMN trade_slug DROP NOT NULL/);
  });

  it('creates lead_view_events with composite PK and FK CASCADE to user_profiles', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS lead_view_events/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, permit_num, revision_num\)/);
    expect(sql).toMatch(/FOREIGN KEY \(user_id\) REFERENCES user_profiles\(user_id\) ON DELETE CASCADE/);
  });

  it('creates subscribe_nonces with FK CASCADE and 15-minute expiry default', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS subscribe_nonces/);
    expect(sql).toMatch(/INTERVAL '15 minutes'/);
    expect(sql).toMatch(/REFERENCES user_profiles\(user_id\) ON DELETE CASCADE/);
  });

  it('creates stripe_webhook_events idempotency table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS stripe_webhook_events/);
    expect(sql).toMatch(/event_id\s+TEXT PRIMARY KEY/);
  });

  it('DOWN block comments out all new columns in reverse order', () => {
    expect(sql).toMatch(/-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs/);
    expect(sql).toMatch(/-- DROP TABLE stripe_webhook_events/);
    expect(sql).toMatch(/-- DROP TABLE subscribe_nonces/);
    expect(sql).toMatch(/-- DROP TABLE lead_view_events/);
  });
});
