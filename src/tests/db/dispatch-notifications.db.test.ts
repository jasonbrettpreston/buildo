// 🔗 SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2/§3/§4
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10
//
// P25 25E — the mock-transport HEADLESS battery for the notification dispatcher.
//
// This is the "activate Spec 82's queue, exactly once, honestly" lock. It runs
// the REAL scripts/dispatch-notifications.js in-process against a real Postgres
// (testcontainers), injecting a MOCK Expo transport via the same
// `global.__BUILDO_PUSH_TRANSPORT__` hook the engine reads (dispatch-notifications.js:107)
// so ZERO network I/O occurs, and asserts every behaviour against the
// notification_dispatches ledger + device_tokens + the notifications queue:
//
//   T1  inert gate        — notifications_dispatch_enabled=0 → SKIP, no sends, no ledger
//   T2  dispatch          — eligible row → sent, ledger 'sent' + expo_ticket_id + Toronto-date,
//                           notifications.is_sent flipped, payload contract (type/route/entity_id/urgency)
//   T3  dedup re-run      — a second run the same day re-sends NOTHING (the double-chain-run kill)
//   T4  ledger dedup      — a tuple already in today's ledger is excluded even when is_sent=false
//                           (proves the dedup is LEDGER-keyed, not just is_sent-keyed)
//   T5  pref-gate         — a false pref column silences ITS type only (per-type gating)
//   T6  disabled-types    — the operator JSONB kill-list suppresses a type
//   T7  throttle          — max_per_user_per_day caps sends; the excess is DEFERRED, not dropped
//   T8  ticket-time prune — DeviceNotRegistered prunes the EXACT dead token, never the user's other device
//   T9  receipt-time prune— the next-run receipt pass prunes a token whose prior ticket resolved dead
//   T10 evening-in-morning— a schedule-gated row is delivered in the once-daily run, never looped as 'deferred' (25E #3)
//   T11 in-run dedup      — duplicate queue rows → ONE push, both rows retired (fresher wins) (25E #1)
//   T12 chunk-build cap   — many rows for one user in a sub-100 chunk still respect the per-day cap (25E #5)
//   T13 URGENT freshness  — stale URGENT dropped; equally-old PHASE/STALL kept (scoped sweep) (25E #4)
//   T14 fenced types      — a STALL_WARNING row is never selected or sent (25E #9)
//   T15 no device token   — a tokenless saver row is retired + counted, never an invisible backlog (25E output)
//
// Why in-process (not execSync): the transport is injected via a JS global, which
// cannot cross a child-process boundary. pipeline.run is import-safe (no
// process.exit — pipeline.js:378), so we monkeypatch pipeline.run to capture the
// promise the dispatcher fires at module scope, then await it.
//
// Hermeticity: every assertion is SCOPED to this file's user_ids / tokens
// (uuid prefix '25e00000-', see mkUid) so a concurrent db-test file's queue rows
// cannot perturb it.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/dispatch-notifications.db.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// ── uuid identity namespace (mig 229 converted user_id varchar→uuid) ────────────
// Every fixture user_id is a real uuid sharing the hex prefix '25e00000-' so the
// hermetic prefix-scoped cleanup (WHERE user_id::text LIKE '25e00000-%') stays
// scoped to THIS file's rows — exactly the hermeticity the old 'p25e-' string
// sentinel gave before the type conversion. mkUid(N) maps test N → its uuid.
// NB: only user_id COLUMN values become uuids; lead_id / permit_num / entity_id /
// push_token stay plain-text 'P25E-*' strings (they are text columns, not identity).
const UID_NS = '25e00000-0000-4000-8000-';
const mkUid = (n: number): string => UID_NS + String(n).padStart(12, '0');

// ── Toronto calendar helpers (mirror dispatch-notifications.js:64-76) ──────────
const _torontoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
});
const _torontoHourFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23', // lockstep with dispatch-notifications.js (25E #8)
});
function torontoDate(d: Date): string { return _torontoDateFmt.format(d); }
function torontoHour(d: Date): number { return parseInt(_torontoHourFmt.format(d), 10); }

// ── Mock Expo transport (transport(url, body) → { statusCode, body }) ──────────
type Ticket = { status: string; id?: string; message?: string; details?: { error?: string } };
type SentMsg = { to: string; title: string; body: string; data: Record<string, unknown> };

let pushResponder: (messages: SentMsg[]) => Ticket[];
let receiptResponder: (ids: string[]) => Record<string, { status: string; details?: { error?: string } }>;
let sentMessages: SentMsg[] = [];
let receiptCallCount = 0;

function resetTransport(): void {
  sentMessages = [];
  receiptCallCount = 0;
  pushResponder = (messages) => messages.map((_, i) => ({ status: 'ok', id: `ok-ticket-${i}-${Date.now()}` }));
  receiptResponder = () => ({});
}

function sentTo(token: string): SentMsg[] {
  return sentMessages.filter((m) => m.to === token);
}

// ── In-process runner: capture the promise the dispatcher fires at module scope ─
const PIPELINE_PATH = '../../../scripts/lib/pipeline';
const DISPATCHER_REQUIRE = '../../../scripts/dispatch-notifications.js';

async function runDispatcher(): Promise<void> {
  // Clear only the PER-RUN capture (so T3's second run sees an empty send list).
  // The per-test responders (pushResponder / receiptResponder) are set by the
  // caller BEFORE this and must survive — full reset happens in beforeEach.
  sentMessages = [];
  receiptCallCount = 0;
  const pipelineMod = require(PIPELINE_PATH);
  const realRun = pipelineMod.run;
  let runPromise: Promise<void> | undefined;
  pipelineMod.run = (name: string, fn: (p: unknown) => Promise<void>) => {
    runPromise = realRun.call(pipelineMod, name, fn) as Promise<void>;
    return runPromise;
  };
  try {
    delete require.cache[require.resolve(DISPATCHER_REQUIRE)];
    require(DISPATCHER_REQUIRE);
  } finally {
    pipelineMod.run = realRun;
  }
  if (!runPromise) throw new Error('dispatch-notifications did not invoke pipeline.run');
  await runPromise;
}

// ── logic-variable levers ──────────────────────────────────────────────────────
async function setGate(on: boolean): Promise<void> {
  await pool!.query(
    `INSERT INTO logic_variables (variable_key, variable_value, description)
     VALUES ('notifications_dispatch_enabled', $1, 'test')
     ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value`,
    [on ? 1 : 0],
  );
}
async function setThrottle(n: number): Promise<void> {
  await pool!.query(
    `INSERT INTO logic_variables (variable_key, variable_value, description)
     VALUES ('notifications_max_per_user_per_day', $1, 'test')
     ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value`,
    [n],
  );
}
async function setDisabledTypes(arr: string[]): Promise<void> {
  await pool!.query(
    `INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
     VALUES ('notifications_disabled_types', 0, $1::jsonb, 'test')
     ON CONFLICT (variable_key) DO UPDATE SET variable_value = 0, variable_value_json = EXCLUDED.variable_value_json`,
    [JSON.stringify(arr)],
  );
}

// ── fixture seeders (all user_ids are uuids sharing the '25e00000-' prefix) ─────
async function seedUser(
  userId: string,
  prefs: Partial<{
    phase_changed: boolean; lifecycle_stalled_pref: boolean;
    start_date_urgent: boolean; notification_schedule: string;
  }> = {},
): Promise<void> {
  // user_profiles/device_tokens/notifications/notification_dispatches.user_id all
  // FK auth.users(id) since mig 229 — the identity row must exist first.
  await pool!.query(
    `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
  await pool!.query(
    `INSERT INTO user_profiles
       (user_id, trade_slug, phase_changed, lifecycle_stalled_pref, start_date_urgent, notification_schedule)
     VALUES ($1, 'plumbing', $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       phase_changed = EXCLUDED.phase_changed,
       lifecycle_stalled_pref = EXCLUDED.lifecycle_stalled_pref,
       start_date_urgent = EXCLUDED.start_date_urgent,
       notification_schedule = EXCLUDED.notification_schedule`,
    [
      userId,
      prefs.phase_changed ?? true,
      prefs.lifecycle_stalled_pref ?? true,
      prefs.start_date_urgent ?? true,
      prefs.notification_schedule ?? 'anytime',
    ],
  );
}
async function seedToken(userId: string, token: string, platform = 'ios'): Promise<void> {
  await pool!.query(
    `INSERT INTO device_tokens (user_id, push_token, platform) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, push_token) DO NOTHING`,
    [userId, token, platform],
  );
}
async function enqueue(userId: string, type: string, leadId: string, permitNum: string | null = null): Promise<number> {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO notifications (user_id, type, lead_id, permit_num, title, body)
     VALUES ($1, $2, $3, $4, 'Title', 'Body') RETURNING id`,
    [userId, type, leadId, permitNum],
  );
  return rows[0]!.id;
}
async function ledgerFor(userId: string): Promise<Array<{ lead_id: string; type: string; status: string; toronto_date: string; expo_ticket_id: string | null; detail: string | null }>> {
  const { rows } = await pool!.query(
    `SELECT lead_id, type, status, to_char(toronto_date, 'YYYY-MM-DD') AS toronto_date, expo_ticket_id, detail
       FROM notification_dispatches WHERE user_id = $1 ORDER BY id`,
    [userId],
  );
  return rows as never;
}
async function isSent(notificationId: number): Promise<boolean> {
  const { rows } = await pool!.query<{ is_sent: boolean }>(
    `SELECT is_sent FROM notifications WHERE id = $1`, [notificationId],
  );
  return rows[0]!.is_sent;
}
// sent_at is NULL for a row retired without a push (stale-drop / dedup-suppress),
// a timestamp for a real delivery (25E sent_at convention).
async function sentAt(notificationId: number): Promise<Date | null> {
  const { rows } = await pool!.query<{ sent_at: Date | null }>(
    `SELECT sent_at FROM notifications WHERE id = $1`, [notificationId],
  );
  return rows[0]!.sent_at;
}
// Backdate a queue row so freshness/staleness paths can be exercised deterministically.
async function backdate(notificationId: number, interval: string): Promise<void> {
  await pool!.query(
    `UPDATE notifications SET created_at = NOW() - $2::interval WHERE id = $1`,
    [notificationId, interval],
  );
}
async function tokenExists(userId: string, token: string): Promise<boolean> {
  const { rows } = await pool!.query(
    `SELECT 1 FROM device_tokens WHERE user_id = $1 AND push_token = $2`, [userId, token],
  );
  return rows.length > 0;
}

const NOW = () => new Date();

describe.skipIf(!dbAvailable())('dispatch-notifications — mock-transport headless battery (P25 25E)', () => {
  if (!pool) return;

  beforeAll(async () => {
    // PG_* env for the dispatcher's createPool (pipeline.js:34-64 reads PG_*, not DATABASE_URL).
    const url = new URL(process.env.DATABASE_URL!);
    const env = process.env as Record<string, string>;
    env.PG_HOST = url.hostname;
    env.PG_PORT = url.port;
    env.PG_USER = url.username;
    env.PG_PASSWORD = url.password;
    env.PG_DATABASE = url.pathname.slice(1);

    // Inject the mock transport (the hook the engine reads at dispatch-notifications.js:107).
    (globalThis as Record<string, unknown>).__BUILDO_PUSH_TRANSPORT__ = async (u: string, body: string) => {
      if (u.includes('getReceipts')) {
        receiptCallCount++;
        const { ids } = JSON.parse(body) as { ids: string[] };
        return { statusCode: 200, body: JSON.stringify({ data: receiptResponder(ids) }) };
      }
      const messages = JSON.parse(body) as SentMsg[];
      sentMessages.push(...messages);
      return { statusCode: 200, body: JSON.stringify({ data: pushResponder(messages) }) };
    };

    // 'plumbing' trade for the user_profiles.trade_slug (mig 002 seed; ensure it).
    await pool.query(`INSERT INTO trades (slug, name) VALUES ('plumbing', 'Plumbing') ON CONFLICT (slug) DO NOTHING`);
  });

  afterAll(async () => {
    delete (globalThis as Record<string, unknown>).__BUILDO_PUSH_TRANSPORT__;
    await pool.query(`DELETE FROM notification_dispatches WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM notifications         WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM device_tokens         WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM user_profiles         WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM auth.users            WHERE id::text      LIKE '25e00000-%'`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM notification_dispatches WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM notifications         WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM device_tokens         WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM user_profiles         WHERE user_id::text LIKE '25e00000-%'`);
    await pool.query(`DELETE FROM auth.users            WHERE id::text      LIKE '25e00000-%'`);
    await setGate(true);
    await setThrottle(10);
    await setDisabledTypes([]);
    resetTransport(); // full reset incl. default responders — before each test sets its own
  });

  it('T1 — inert gate: notifications_dispatch_enabled=0 → SKIP (no sends, no ledger, queue untouched)', async () => {
    await setGate(false);
    const uid = mkUid(1);
    await seedUser(uid);
    await seedToken(uid, 'ExponentPushToken[T1]');
    const nId = await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T1:00', 'P25E-T1');

    await runDispatcher();

    expect(sentTo('ExponentPushToken[T1]')).toHaveLength(0);
    expect(await ledgerFor(uid)).toHaveLength(0);
    expect(await isSent(nId)).toBe(false);
  });

  it('T2 — dispatch: eligible row sent once; ledger sent-row + Toronto-date + is_sent + payload contract', async () => {
    const uid = mkUid(2);
    const token = 'ExponentPushToken[T2]';
    await seedUser(uid);
    await seedToken(uid, token);
    const nId = await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T2:00', 'P25E-T2');

    await runDispatcher();

    const mine = sentTo(token);
    expect(mine).toHaveLength(1);
    // Payload cross-contract: the mobile toast + board-detail parser depend on these.
    expect(mine[0]!.data).toMatchObject({
      notification_type: 'LIFECYCLE_STALLED',
      route_domain: 'flight_board',
      entity_id: 'P25E-T2--00', // NUM--REV (never the colon feed form)
      urgency: 'stalled',
    });

    const ledger = await ledgerFor(uid);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.status).toBe('sent');
    expect(ledger[0]!.type).toBe('LIFECYCLE_STALLED');
    expect(ledger[0]!.lead_id).toBe('permit:P25E-T2:00');
    expect(ledger[0]!.expo_ticket_id).toBeTruthy();
    expect(ledger[0]!.toronto_date).toBe(torontoDate(NOW())); // DST-aware calendar date
    expect(await isSent(nId)).toBe(true);
  });

  it('T3 — dedup re-run: a second same-day run re-sends nothing (kills the double-chain-run send)', async () => {
    const uid = mkUid(3);
    const token = 'ExponentPushToken[T3]';
    await seedUser(uid);
    await seedToken(uid, token);
    const nId = await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T3:00', 'P25E-T3');

    await runDispatcher(); // run 1 — sends
    expect(sentTo(token)).toHaveLength(1);

    await runDispatcher(); // run 2 — resetTransport() cleared sentMessages; must stay empty
    expect(sentTo(token)).toHaveLength(0);

    expect(await ledgerFor(uid)).toHaveLength(1); // still ONE ledger row
    expect(await isSent(nId)).toBe(true);
  });

  it('T4 — ledger dedup is LEDGER-keyed, not is_sent-keyed: a tuple in today\'s ledger is excluded even when is_sent=false', async () => {
    const uid = mkUid(4);
    const token = 'ExponentPushToken[T4]';
    const leadId = 'permit:P25E-T4:00';
    await seedUser(uid);
    await seedToken(uid, token);
    // A pre-existing 'sent' ledger row for today's tuple (as if a prior chain run delivered it)...
    await pool.query(
      `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, expo_ticket_id, status, dispatched_at)
       VALUES ($1, $2, 'LIFECYCLE_STALLED', $3::date, $4, 'prior-ticket', 'sent', NOW())`,
      [uid, leadId, torontoDate(NOW()), token],
    );
    // ...and a FRESH queue row for the same tuple that never got its is_sent flipped.
    const nId = await enqueue(uid, 'LIFECYCLE_STALLED', leadId, 'P25E-T4');

    await runDispatcher();

    expect(sentTo(token)).toHaveLength(0);        // NOT EXISTS excluded it — no re-send
    expect(await isSent(nId)).toBe(false);        // untouched (never scanned)
    expect(await ledgerFor(uid)).toHaveLength(1); // still the single prior row
  });

  it('T5 — pref-gate: a false pref column silences ITS type only', async () => {
    const uid = mkUid(5);
    const token = 'ExponentPushToken[T5]';
    await seedUser(uid, { lifecycle_stalled_pref: false, start_date_urgent: true });
    await seedToken(uid, token);
    const stalledId = await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T5A:00', 'P25E-T5A');
    const urgentId = await enqueue(uid, 'START_DATE_URGENT', 'permit:P25E-T5B:00', 'P25E-T5B');

    await runDispatcher();

    const mine = sentTo(token);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.data.notification_type).toBe('START_DATE_URGENT'); // urgent pref on → sent
    expect(await isSent(stalledId)).toBe(false); // stalled pref off → silenced
    expect(await isSent(urgentId)).toBe(true);

    const ledgerTypes = (await ledgerFor(uid)).map((r) => r.type);
    expect(ledgerTypes).toEqual(['START_DATE_URGENT']);
  });

  it('T6 — disabled-types JSONB kill-list suppresses a type regardless of pref', async () => {
    await setDisabledTypes(['LIFECYCLE_STALLED']);
    const uid = mkUid(6);
    const token = 'ExponentPushToken[T6]';
    await seedUser(uid); // all prefs ON
    await seedToken(uid, token);
    await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T6A:00', 'P25E-T6A');
    await enqueue(uid, 'START_DATE_URGENT', 'permit:P25E-T6B:00', 'P25E-T6B');

    await runDispatcher();

    const types = sentTo(token).map((m) => m.data.notification_type);
    expect(types).toEqual(['START_DATE_URGENT']); // stalled disabled by operator lever
  });

  it('T7 — throttle: max_per_user_per_day caps sends and DEFERS the excess (not dropped)', async () => {
    await setThrottle(1);
    const uid = mkUid(7);
    const token = 'ExponentPushToken[T7]';
    await seedUser(uid);
    await seedToken(uid, token);
    await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T7A:00', 'P25E-T7A');
    await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T7B:00', 'P25E-T7B');

    await runDispatcher();

    expect(sentTo(token)).toHaveLength(1); // cap = 1
    const ledger = await ledgerFor(uid);
    const statuses = ledger.map((r) => r.status).sort();
    expect(statuses).toEqual(['deferred', 'sent']); // excess deferred, not lost
    const deferred = ledger.find((r) => r.status === 'deferred')!;
    expect(deferred.detail).toContain('throttle');
  });

  it('T8 — ticket-time prune: DeviceNotRegistered prunes the EXACT dead token, never the user\'s other device', async () => {
    const uid = mkUid(8);
    const bad = 'ExponentPushToken[T8-BAD]';
    const good = 'ExponentPushToken[T8-GOOD]';
    await seedUser(uid);
    await seedToken(uid, bad);
    await seedToken(uid, good);
    // one queue row → the dt JOIN fans it to BOTH of the user's tokens.
    await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T8:00', 'P25E-T8');

    pushResponder = (messages) => messages.map((m, i) =>
      m.to === bad
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ok-${i}` });

    await runDispatcher();

    expect(await tokenExists(uid, bad)).toBe(false);  // exact dead token pruned
    expect(await tokenExists(uid, good)).toBe(true);  // sibling device preserved
  });

  it('T9 — receipt-time prune: the next-run receipt pass prunes a token whose prior ticket resolved dead', async () => {
    const uid = mkUid(9);
    const token = 'ExponentPushToken[T9]';
    await seedUser(uid);
    await seedToken(uid, token);
    // A prior run's SENT ledger row inside the receipt window [RUN_AT-2d, RUN_AT-1h).
    await pool.query(
      `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, expo_ticket_id, status, dispatched_at)
       VALUES ($1, 'permit:P25E-T9:00', 'LIFECYCLE_STALLED', $2::date, $3, 'ticket-prior-t9', 'sent', NOW() - INTERVAL '3 hours')`,
      [uid, torontoDate(NOW()), token],
    );
    // No live queue rows — this run only does the receipt pass.
    receiptResponder = (ids) => {
      const out: Record<string, { status: string; details?: { error?: string } }> = {};
      for (const id of ids) {
        if (id === 'ticket-prior-t9') out[id] = { status: 'error', details: { error: 'DeviceNotRegistered' } };
      }
      return out;
    };

    await runDispatcher();

    expect(receiptCallCount).toBeGreaterThanOrEqual(1);
    expect(await tokenExists(uid, token)).toBe(false); // receipt-time prune by exact token
  });

  it('T10 — evening-in-morning (25E #3): a schedule-gated row is delivered in the once-daily run, NEVER left in a permanent quiet-hours "deferred" loop', async () => {
    // OLD engine: an out-of-window schedule-gated row got status 'deferred' every
    // run; under the once-daily 6AM cron an 'evening' (17-20) window is never
    // reached → it looped FOREVER, never delivered. NEW rule: an unreachable-but-
    // not-yet-passed window is DELIVERED in this run; only a window that already
    // PASSED today expires. Invariant (wall-clock-independent): the row is NEVER
    // left as a plain 'deferred' for a schedule reason.
    const uid = mkUid(10);
    const token = 'ExponentPushToken[T10]';
    await seedUser(uid, { notification_schedule: 'evening', phase_changed: true });
    await seedToken(uid, token);
    const nId = await enqueue(uid, 'LIFECYCLE_PHASE_CHANGED', 'permit:P25E-T10:00', 'P25E-T10');

    await runDispatcher();

    const ledger = await ledgerFor(uid);
    expect(ledger).toHaveLength(1);
    expect(['sent', 'deferred_expired']).toContain(ledger[0]!.status); // never a plain 'deferred'
    const h = torontoHour(NOW());
    if (h < 20) {
      // Evening window (ends 20:00 ET) not yet passed → delivered in this run.
      expect(ledger[0]!.status).toBe('sent');
      expect(sentTo(token)).toHaveLength(1);
      expect(await isSent(nId)).toBe(true);
    } else {
      // Past 20:00 ET → the window has passed → expired (no stale push).
      expect(ledger[0]!.status).toBe('deferred_expired');
      expect(sentTo(token)).toHaveLength(0);
      expect(await isSent(nId)).toBe(true); // deferred_expired is TERMINAL (spec §4 "dropped") — retired, not re-tried next day
    }
  });

  it('T11 — in-run dedup (25E #1): duplicate queue rows (same user/lead/type/device) → ONE push, both rows retired', async () => {
    const uid = mkUid(11);
    const token = 'ExponentPushToken[T11]';
    await seedUser(uid);
    await seedToken(uid, token);
    // Two identical URGENT rows (the cross-chain re-insert / multi-trade fan-out).
    const a = await enqueue(uid, 'START_DATE_URGENT', 'permit:P25E-T11:00', 'P25E-T11');
    const b = await enqueue(uid, 'START_DATE_URGENT', 'permit:P25E-T11:00', 'P25E-T11');

    await runDispatcher();

    expect(sentTo(token)).toHaveLength(1);        // exactly ONE Expo push, not two
    expect(await isSent(a)).toBe(true);
    expect(await isSent(b)).toBe(true);           // BOTH queue rows retired
    // The fresher row (b) is the one sent (sent_at set); the older (a) is the
    // suppressed duplicate (sent_at NULL — retired without a push).
    expect(await sentAt(b)).not.toBeNull();
    expect(await sentAt(a)).toBeNull();
    const ledger = await ledgerFor(uid);
    expect(ledger.filter((r) => r.status === 'sent')).toHaveLength(1);
  });

  it('T12 — chunk-build cap (25E #5): many rows for one user in a single sub-100 chunk still respect the per-day cap', async () => {
    // The pre-fix bug: N rows for one user in one chunk were all pushed to Expo
    // before any post-success cap check. The cap must gate CHUNK-BUILD.
    await setThrottle(3);
    const uid = mkUid(12);
    const token = 'ExponentPushToken[T12]';
    await seedUser(uid);
    await seedToken(uid, token);
    for (let k = 0; k < 8; k++) {
      await enqueue(uid, 'LIFECYCLE_STALLED', `permit:P25E-T12-${k}:00`, `P25E-T12-${k}`);
    }

    await runDispatcher();

    expect(sentTo(token)).toHaveLength(3); // exactly the cap — not all 8
    const ledger = await ledgerFor(uid);
    expect(ledger.filter((r) => r.status === 'sent')).toHaveLength(3);
    expect(ledger.filter((r) => r.status === 'deferred')).toHaveLength(5); // excess deferred, not lost
  });

  it('T13 — URGENT freshness sweep is SCOPED (25E #4 / Guardian): stale URGENT dropped; equally-old PHASE/STALL kept', async () => {
    const uid = mkUid(13);
    const token = 'ExponentPushToken[T13]';
    await seedUser(uid);
    await seedToken(uid, token);
    // notifications_max_stale_hours = 168 (mig 222 seed). Backdate past it.
    const staleUrgent = await enqueue(uid, 'START_DATE_URGENT', 'permit:P25E-T13U:00', 'P25E-T13U');
    await backdate(staleUrgent, '200 hours');
    const staleStalled = await enqueue(uid, 'LIFECYCLE_STALLED', 'permit:P25E-T13S:00', 'P25E-T13S');
    await backdate(staleStalled, '200 hours');
    await enqueue(uid, 'START_DATE_URGENT', 'permit:P25E-T13F:00', 'P25E-T13F'); // fresh — sent normally

    await runDispatcher();

    // Stale URGENT: retired without a push (freshness bound); ledger 'stale_dropped'.
    expect(await isSent(staleUrgent)).toBe(true);
    expect(await sentAt(staleUrgent)).toBeNull();
    const ledger = await ledgerFor(uid);
    const staleRow = ledger.find((r) => r.lead_id === 'permit:P25E-T13U:00');
    expect(staleRow!.status).toBe('stale_dropped');
    expect(sentTo(token).some((m) => m.data.entity_id === 'P25E-T13U--00')).toBe(false);
    // Equally-old LIFECYCLE_STALLED: NOT dropped (unconditional-retry fence) → sent.
    expect(await isSent(staleStalled)).toBe(true);
    expect(await sentAt(staleStalled)).not.toBeNull();
    expect(ledger.find((r) => r.lead_id === 'permit:P25E-T13S:00')!.status).toBe('sent');
    // Fresh URGENT: sent normally.
    expect(ledger.find((r) => r.lead_id === 'permit:P25E-T13F:00')!.status).toBe('sent');
  });

  it('T14 — fenced types (25E #9): a STALL_WARNING queue row is never selected or sent', async () => {
    const uid = mkUid(14);
    const token = 'ExponentPushToken[T14]';
    await seedUser(uid);
    await seedToken(uid, token);
    const fenced = await enqueue(uid, 'STALL_WARNING', 'permit:P25E-T14:00', 'P25E-T14');

    await runDispatcher();

    expect(sentTo(token)).toHaveLength(0);       // not a DISPATCHABLE type
    expect(await isSent(fenced)).toBe(false);    // left untouched in the queue
    expect(await ledgerFor(uid)).toHaveLength(0);
  });

  it('T15 — no device token (25E output panel / spec §4): a tokenless saver row is retired + counted, never an invisible backlog', async () => {
    const uid = mkUid(15);
    await seedUser(uid); // NB: no seedToken — the user has zero device_tokens rows
    const nId = await enqueue(uid, 'LIFECYCLE_PHASE_CHANGED', 'permit:P25E-T15:00', 'P25E-T15');

    await runDispatcher();

    // Pre-fix: the INNER JOIN never even saw this row → is_sent stayed false forever.
    expect(await isSent(nId)).toBe(true);        // retired (no-op, counted)
    expect(await sentAt(nId)).toBeNull();        // never pushed
    expect(sentMessages).toHaveLength(0);        // nothing sent
    expect(await ledgerFor(uid)).toHaveLength(0); // no ledger row (counted via the audit metric, not the ledger)
  });
});
