// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3, §3
//
// Infra tests for notification API routes: source-level regression locks
// verify auth gating, Zod schema enforcement, and payload contract.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────
// Source regression locks — ensure routes stay correctly wired
// ─────────────────────────────────────────────────────────────────

const registerSource = fs.readFileSync(
  path.join(__dirname, '../app/api/notifications/register/route.ts'),
  'utf-8',
);

const prefsSource = fs.readFileSync(
  path.join(__dirname, '../app/api/notifications/preferences/route.ts'),
  'utf-8',
);

describe('notifications/register route — source regression locks', () => {
  it('gates on getUserIdFromSession (401 path exists)', () => {
    expect(registerSource).toContain('getUserIdFromSession');
    expect(registerSource).toContain('status: 401');
  });

  it('uses ON CONFLICT upsert — not INSERT-only (no 409 path)', () => {
    expect(registerSource).toContain('ON CONFLICT');
    expect(registerSource).toContain('DO UPDATE SET');
    expect(registerSource).not.toContain('status: 409');
  });

  it('validates Expo push token format', () => {
    expect(registerSource).toContain('ExponentPushToken');
  });

  it('validates platform enum ios | android', () => {
    expect(registerSource).toContain("z.enum(['ios', 'android'])");
  });

  it('uses logError in catch block', () => {
    expect(registerSource).toContain('logError');
  });

  it('returns 400 on invalid payload', () => {
    expect(registerSource).toContain('status: 400');
  });
});

describe('notifications/preferences route — source regression locks', () => {
  it('gates GET on getUserIdFromSession', () => {
    expect(prefsSource).toContain('getUserIdFromSession');
  });

  it('exports both GET and PATCH handlers', () => {
    const hasGet = prefsSource.includes('export async function GET') || prefsSource.includes('withApiEnvelope');
    expect(hasGet).toBe(true);
    const hasPatch = prefsSource.includes('export async function PATCH') ||
      (prefsSource.includes('withApiEnvelope') && prefsSource.includes('PATCH'));
    expect(hasPatch).toBe(true);
  });

  it('PATCH builds dynamic SET clauses for the 5 flat columns (Spec 99 §9.14)', () => {
    // Pre-flatten this used `COALESCE(notification_prefs, '{}'::jsonb) || $::jsonb`.
    // Post-flatten each field is a plain column UPDATE built via addField().
    expect(prefsSource).toContain("addField('phase_changed'");
    expect(prefsSource).toContain("addField('lifecycle_stalled_pref'");
    expect(prefsSource).toContain("addField('start_date_urgent'");
    expect(prefsSource).toContain("addField('new_lead_min_cost_tier'");
    expect(prefsSource).toContain("addField('notification_schedule'");
    expect(prefsSource).not.toContain("'{}'::jsonb");
  });

  it('validates notification_schedule as morning | anytime | evening', () => {
    expect(prefsSource).toContain("z.enum(['morning', 'anytime', 'evening'])");
  });

  it('uses canonical cost-tier enum low/medium/high (Spec 99 §9.14 reconciliation)', () => {
    expect(prefsSource).toContain("z.enum(['low', 'medium', 'high'])");
    // The pre-existing divergent 5-value enum is gone — assert the literal
    // enum array (not bare words "small"/"mega" which can appear in
    // explanatory prose comments).
    expect(prefsSource).not.toMatch(/z\.enum\(\[\s*['"]small['"]/);
    expect(prefsSource).not.toMatch(/['"]mega['"]\s*\]/);
  });

  it('uses logError in both catch blocks', () => {
    const errorCount = (prefsSource.match(/logError/g) ?? []).length;
    expect(errorCount).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 on missing auth', () => {
    expect(prefsSource).toContain('status: 401');
  });
});

// ─────────────────────────────────────────────────────────────────
// Zod schema validation — push token and prefs shape
// ─────────────────────────────────────────────────────────────────

const RegisterTokenSchema = z.object({
  push_token: z.string().min(1).regex(/^ExponentPushToken\[.+\]$/),
  platform: z.enum(['ios', 'android']),
});

describe('RegisterTokenSchema validation', () => {
  it('accepts valid iOS token', () => {
    const result = RegisterTokenSchema.safeParse({
      push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]',
      platform: 'ios',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid android token', () => {
    const result = RegisterTokenSchema.safeParse({
      push_token: 'ExponentPushToken[abc123]',
      platform: 'android',
    });
    expect(result.success).toBe(true);
  });

  it('rejects raw FCM token (not Expo format)', () => {
    const result = RegisterTokenSchema.safeParse({
      push_token: 'APA91bXXXXXX',
      platform: 'android',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing platform', () => {
    const result = RegisterTokenSchema.safeParse({
      push_token: 'ExponentPushToken[abc]',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown platform', () => {
    const result = RegisterTokenSchema.safeParse({
      push_token: 'ExponentPushToken[abc]',
      platform: 'web',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty push_token string', () => {
    const result = RegisterTokenSchema.safeParse({
      push_token: '',
      platform: 'ios',
    });
    expect(result.success).toBe(false);
  });
});

const NotificationPrefsSchema = z.object({
  new_lead_min_cost_tier: z.enum(['small', 'medium', 'large', 'major', 'mega']).optional(),
  phase_changed: z.boolean().optional(),
  lifecycle_stalled: z.boolean().optional(),
  start_date_urgent: z.boolean().optional(),
  notification_schedule: z.enum(['morning', 'anytime', 'evening']).optional(),
});

describe('NotificationPrefsSchema validation', () => {
  it('accepts full valid prefs object', () => {
    const result = NotificationPrefsSchema.safeParse({
      new_lead_min_cost_tier: 'medium',
      phase_changed: true,
      lifecycle_stalled: true,
      start_date_urgent: true,
      notification_schedule: 'anytime',
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial update (all optional)', () => {
    const result = NotificationPrefsSchema.safeParse({
      notification_schedule: 'morning',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no-op patch)', () => {
    const result = NotificationPrefsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid notification_schedule', () => {
    const result = NotificationPrefsSchema.safeParse({
      notification_schedule: 'noon',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid cost tier', () => {
    const result = NotificationPrefsSchema.safeParse({
      new_lead_min_cost_tier: 'tiny',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean toggle value', () => {
    const result = NotificationPrefsSchema.safeParse({
      phase_changed: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Migration file checks
// ─────────────────────────────────────────────────────────────────

const migration107 = fs.readFileSync(
  path.join(__dirname, '../../migrations/107_device_tokens.sql'),
  'utf-8',
);

const migration108 = fs.readFileSync(
  path.join(__dirname, '../../migrations/108_notification_prefs.sql'),
  'utf-8',
);

const migration117 = fs.readFileSync(
  path.join(__dirname, '../../migrations/117_notification_prefs_flatten.sql'),
  'utf-8',
);

describe('Migration 107 — device_tokens', () => {
  it('creates device_tokens table', () => {
    expect(migration107).toContain('CREATE TABLE device_tokens');
  });

  it('has UNIQUE constraint on (user_id, push_token)', () => {
    expect(migration107).toContain('UNIQUE (user_id, push_token)');
  });

  it('has platform CHECK constraint for ios|android', () => {
    expect(migration107).toContain("CHECK (platform IN ('ios', 'android'))");
  });

  it('has DOWN block', () => {
    expect(migration107).toContain('DROP TABLE IF EXISTS device_tokens');
  });
});

describe('Migration 108 — notification_prefs (legacy JSONB; superseded by 117)', () => {
  it('adds notification_prefs column to user_profiles', () => {
    expect(migration108).toContain('ALTER TABLE user_profiles');
    expect(migration108).toContain('notification_prefs');
  });

  it('default includes notification_schedule anytime', () => {
    expect(migration108).toContain('anytime');
  });

  it('has DOWN block', () => {
    expect(migration108).toContain('DROP COLUMN IF EXISTS notification_prefs');
  });
});

describe('Migration 117 — notification_prefs flatten (Spec 99 §9.14)', () => {
  it('adds the 5 flat columns to user_profiles', () => {
    expect(migration117).toContain('new_lead_min_cost_tier');
    expect(migration117).toContain('phase_changed');
    expect(migration117).toContain('lifecycle_stalled_pref');
    expect(migration117).toContain('start_date_urgent');
    expect(migration117).toContain('notification_schedule');
  });

  it('drops the legacy JSONB column at end of UP', () => {
    expect(migration117).toMatch(/DROP COLUMN IF EXISTS notification_prefs/);
  });

  it('has the ALLOW-DESTRUCTIVE marker (DROP COLUMN safety)', () => {
    expect(migration117).toContain('-- ALLOW-DESTRUCTIVE');
  });

  it('adds CHECK constraints for the two enum columns', () => {
    expect(migration117).toMatch(/CHECK\s*\(\s*new_lead_min_cost_tier\s+IN\s*\(\s*'low',\s*'medium',\s*'high'\s*\)\s*\)/);
    expect(migration117).toMatch(/CHECK\s*\(\s*notification_schedule\s+IN\s*\(\s*'morning',\s*'anytime',\s*'evening'\s*\)\s*\)/);
  });

  it('backfills from JSONB before dropping the column', () => {
    const updateIdx = migration117.indexOf('UPDATE user_profiles');
    const dropIdx = migration117.indexOf('DROP COLUMN IF EXISTS notification_prefs');
    expect(updateIdx).toBeGreaterThan(0);
    expect(dropIdx).toBeGreaterThan(updateIdx);
  });
});
