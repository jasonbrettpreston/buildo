// 🔗 SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3 (the nonce exchange)
//
// P26-26E — subscribe_nonces single-use round-trip against a REAL Postgres
// (BUILDO_TEST_DB=1). The mocked infra suites prove the route's control flow;
// this proves the security-critical property the mocks can't: the atomic
// single-use consume the exchange route relies on (a nonce is the credential —
// consuming it twice would let a replayed /subscribe?nonce=… start a second
// checkout).
//
// The consume SQL below MIRRORS src/app/api/subscribe/exchange/route.ts
// (`DELETE FROM subscribe_nonces WHERE nonce=$1 AND expires_at > NOW()
// RETURNING user_id`). If the route's SQL changes, update here.
//
// Run: BUILDO_TEST_DB=1 npm run test:db -- subscribe-nonce-roundtrip

import { describe, it, expect, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const UID = 'p26e-nonce-user';

// The exact consume the exchange route runs (single statement, atomic).
async function consume(nonce: string): Promise<string | null> {
  const res = await pool!.query<{ user_id: string }>(
    `DELETE FROM subscribe_nonces WHERE nonce = $1 AND expires_at > NOW() RETURNING user_id`,
    [nonce],
  );
  return res.rows[0]?.user_id ?? null;
}

describe.skipIf(!dbAvailable())('subscribe_nonces single-use round-trip (P26-26E)', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM subscribe_nonces WHERE user_id = $1`, [UID]);
    await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [UID]);
  });

  it('issue → consume once (returns user_id) → second consume returns null (the 400 path)', async () => {
    await pool!.query(
      `INSERT INTO user_profiles (user_id, trade_slug) VALUES ($1, 'glazing') ON CONFLICT (user_id) DO NOTHING`,
      [UID],
    );
    // Issue (what POST /api/subscribe/session does).
    await pool!.query(`INSERT INTO subscribe_nonces (nonce, user_id) VALUES ($1, $2)`, ['nonce-live-1', UID]);

    // First exchange: consumes, returns the user_id.
    expect(await consume('nonce-live-1')).toBe(UID);
    // Replay: the row is gone → null → the route returns an indistinguishable 400.
    expect(await consume('nonce-live-1')).toBeNull();
    // The row is physically gone (no partial state).
    const { rowCount } = await pool!.query(`SELECT 1 FROM subscribe_nonces WHERE nonce = $1`, ['nonce-live-1']);
    expect(rowCount).toBe(0);
  });

  it('an EXPIRED nonce does not consume (expires_at guard → null → 400)', async () => {
    await pool!.query(
      `INSERT INTO user_profiles (user_id, trade_slug) VALUES ($1, 'glazing') ON CONFLICT (user_id) DO NOTHING`,
      [UID],
    );
    await pool!.query(
      `INSERT INTO subscribe_nonces (nonce, user_id, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 minute')`,
      ['nonce-expired', UID],
    );
    // The `expires_at > NOW()` guard rejects it — no user_id returned.
    expect(await consume('nonce-expired')).toBeNull();
    // …but the expired row is still there (the consume didn't match it), so the
    // WHERE guard, not a DELETE, is what protects — confirm it wasn't deleted.
    const { rowCount } = await pool!.query(`SELECT 1 FROM subscribe_nonces WHERE nonce = $1`, ['nonce-expired']);
    expect(rowCount).toBe(1);
  });

  it('a missing/unknown nonce returns null (indistinguishable from consumed)', async () => {
    expect(await consume('nonce-never-existed')).toBeNull();
  });
});
