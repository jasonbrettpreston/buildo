// SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md §4 N2
// SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §7
//
// Migration 228 creates `entitlements` (per-product subscription state,
// Spec 116 N2 + the two Phase-1 additions — trial_started_at,
// last_stripe_event_at — the plan's writer/reader walk requires). SQL-shape
// regression-lock, no live DB needed — same convention as migration-225's
// test; the real coverage is the interactive local-Supabase replay this
// session already ran (see the task's psql-equivalent verification output).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 228 — entitlements', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/228_entitlements.sql'),
      'utf-8',
    );
  });

  it('SPEC LINK header references Spec 116 N2', () => {
    expect(sql).toMatch(/Spec\s+116|116_multi_product_architecture/i);
  });

  it('creates entitlements with composite PK (user_id, product)', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+entitlements\s*\(/i);
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*user_id\s*,\s*product\s*\)/i);
  });

  it('user_id is UUID NOT NULL FK to auth.users(id) ON DELETE CASCADE', () => {
    expect(sql).toMatch(/user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  });

  it('product CHECK constraint matches exactly {lead_gen, flight_center}', () => {
    const m = sql.match(/CONSTRAINT\s+chk_entitlements_product\s+CHECK\s*\(\s*product\s+IN\s*\(([^)]+)\)\s*\)/i);
    if (!m) throw new Error('chk_entitlements_product constraint not found in migration 228');
    const values = (m[1] ?? '')
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''));
    expect(values).toEqual(['lead_gen', 'flight_center']);
  });

  it('status CHECK constraint matches the legacy chk_subscription_status 6-value set exactly', () => {
    const m = sql.match(/CONSTRAINT\s+chk_entitlements_status\s+CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/i);
    if (!m) throw new Error('chk_entitlements_status constraint not found in migration 228');
    const values = (m[1] ?? '')
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''));
    expect(values).toEqual([
      'trial',
      'active',
      'past_due',
      'expired',
      'cancelled_pending_deletion',
      'admin_managed',
    ]);
  });

  it('carries trial_started_at and last_stripe_event_at (Phase-1 per-product additions beyond N2)', () => {
    expect(sql).toMatch(/trial_started_at\s+TIMESTAMPTZ/i);
    expect(sql).toMatch(/last_stripe_event_at\s+TIMESTAMPTZ/i);
  });

  it('carries stripe_subscription_id and current_period_end', () => {
    expect(sql).toMatch(/stripe_subscription_id\s+TEXT/i);
    expect(sql).toMatch(/current_period_end\s+TIMESTAMPTZ/i);
  });

  it('creates a partial index on stripe_subscription_id (WHERE IS NOT NULL)', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+idx_entitlements_stripe_subscription\s+ON\s+entitlements\s*\(\s*stripe_subscription_id\s*\)\s+WHERE\s+stripe_subscription_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('seeds the stripe_price_product_map logic_variable as an empty JSONB object, ON CONFLICT DO NOTHING', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables/i);
    expect(sql).toMatch(/'stripe_price_product_map'/i);
    expect(sql).toMatch(/'\{\}'::jsonb/);
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(variable_key\)\s+DO\s+NOTHING/i);
  });

  it('has both created_at and updated_at defaulting to NOW()', () => {
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i);
    expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i);
  });

  it('DOWN block is comments-only (Rule 6)', () => {
    const downIdx = sql.search(/^--\s*DOWN\b/im);
    expect(downIdx).toBeGreaterThan(-1);
    const downBlock = sql.slice(downIdx);
    const executableLines = downBlock
      .split('\n')
      .slice(1)
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('--'));
    expect(executableLines).toEqual([]);
  });

  it('UP block is wrapped in an explicit transaction', () => {
    const upIdx = sql.search(/^--\s*UP\b/im);
    const downIdx = sql.search(/^--\s*DOWN\b/im);
    const upBlock = sql.slice(upIdx, downIdx === -1 ? undefined : downIdx);
    expect(upBlock).toMatch(/\bBEGIN;/);
    expect(upBlock).toMatch(/\bCOMMIT;/);
  });
});
