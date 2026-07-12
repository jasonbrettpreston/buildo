// SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §3 + §5
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { maskPushToken } from '@/lib/admin/mask-push-token';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('maskPushToken — a full token never reaches the browser', () => {
  it('masks the Expo token shape to the last 6 inner chars', () => {
    expect(maskPushToken('ExponentPushToken[abcdefghijkl]')).toBe('ExponentPushToken[…ghijkl]');
  });
  it('masks unknown shapes and passes null through', () => {
    expect(maskPushToken('raw-token-value')).toBe('…-value');
    expect(maskPushToken(null)).toBeNull();
    expect(maskPushToken(undefined)).toBeNull();
  });
  it('never returns the full input for realistic tokens', () => {
    const token = 'ExponentPushToken[AAAABBBBCCCCDDDD]';
    expect(maskPushToken(token)).not.toContain('AAAABBBB');
  });
});

describe('GET /api/admin/notifications — dispatch log route shape', () => {
  const src = read('../app/api/admin/notifications/route.ts');

  it('verifyAdminAuth is the first guard (Spec 33 §8)', () => {
    expect(src).toContain('verifyAdminAuth');
    const authPos = src.indexOf('verifyAdminAuth(request)');
    const queryPos = src.indexOf('pool.query');
    expect(authPos).toBeGreaterThan(-1);
    expect(authPos).toBeLessThan(queryPos);
  });

  it('reads the ledger joined to the queue and masks every token', () => {
    expect(src).toContain('FROM notification_dispatches');
    expect(src).toContain('maskPushToken');
    // Every push_token surfaced in the response goes through the mask.
    expect(src).toMatch(/push_token:\s*maskPushToken\(/);
  });

  it('surfaces the kill-switch/throttle READ-ONLY (no logic_variables writes)', () => {
    expect(src).toContain("'notifications_dispatch_enabled'");
    expect(src).not.toMatch(/UPDATE\s+logic_variables/i);
    expect(src).not.toMatch(/INSERT\s+INTO\s+logic_variables/i);
  });

  it('Zod-validates params and 400s with VALIDATION_FAILED', () => {
    expect(src).toContain('safeParse');
    expect(src).toContain("'VALIDATION_FAILED'");
  });
});

describe('POST /api/admin/notifications/test-send — route shape', () => {
  const src = read('../app/api/admin/notifications/test-send/route.ts');

  it('verifyAdminAuth first, then session-only 403 (Spec 33 §8.1 — side-effecting send)', () => {
    const authPos = src.indexOf('verifyAdminAuth(request)');
    const sessionPos = src.indexOf("authMethod !== 'session'");
    expect(authPos).toBeGreaterThan(-1);
    expect(sessionPos).toBeGreaterThan(authPos);
    expect(src).toContain('status: 403');
  });

  it('uses the REAL shared transport (push-dispatch.js), not a duplicate sender', () => {
    expect(src).toContain('push-dispatch.js');
    expect(src).toContain('sendPushChunk');
    expect(src).not.toContain('exp.host'); // no second hardcoded transport
  });

  it('returns the Expo ticket in _debug (the TestFeedTool convention)', () => {
    expect(src).toContain('_debug');
    expect(src).toContain('ticket_id');
  });

  it('is OUT-OF-BAND — never writes the ledger or the queue', () => {
    expect(src).not.toContain('INSERT INTO notification_dispatches');
    expect(src).not.toContain('INSERT INTO notifications');
  });

  it('masks the token in the response', () => {
    expect(src).toContain('maskPushToken(targetToken)');
  });

  it('tracks with the HASHED admin uid (Spec 35 §7.3)', () => {
    expect(src).toContain('hashAdminUid(adminCtx.uid)');
    expect(src).not.toMatch(/track\(adminCtx\.uid/);
  });
});

describe('admin surface wiring', () => {
  it('the 9th nav card links /admin/notifications', () => {
    const home = read('../app/admin/page.tsx');
    expect(home).toContain('href="/admin/notifications"');
  });

  it('the user detail page mounts the NotificationsCard (P24 coordination point)', () => {
    const detail = read('../app/admin/users/[uid]/page.tsx');
    expect(detail).toContain('NotificationsCard');
  });

  it('the tool deep-links to the Control Panel instead of writing gates', () => {
    const tool = read('../components/admin/NotificationsTool.tsx');
    expect(tool).toContain('/admin/control-panel');
    expect(tool).not.toContain('PUT');
  });
});
