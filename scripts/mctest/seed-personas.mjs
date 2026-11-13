// SPEC LINK: docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3.1 (dated note 2026-11-12: seeded users on the separate test stack);
//            McTest DECISIONS D-1 (a), D-3 (a), D-12 (a); FE-40.
//
// MF-79 · usage: node scripts/mctest/seed-personas.mjs --go   (only on the operator's go)
// Seeds the catalogue's personas on the TEST STACK ONLY: refuses unless testStack() passes (never 54321/54322, never a remote host)
// and unless --go is given. Per persona email (and each pool user from email_pattern x count):
//   - the account through the test stack's own sign-in service (sign-up; an existing account signs in), so sign-in itself is exercised;
//   - a profiles row with is_admin (true for the admin persona only; created when missing), a user_profiles row (the lookup route reads it);
//   - its entitlement rows replaced by the catalogue's one row (no lead_gen row unless the persona is lead_gen_only: the transitional
//     unmetered path would hide the meter), and its parcel_tool usage reset then re-written inside the current period (D-12 a:
//     reports_used n, "=limit" or "=limit+3" read from the limit setting, never typed).
// Idempotent: a second run gives the same state. Writes only rows keyed by the seeded users. No email or name is printed.
import pg from "pg";
import { readCatalogue, testStack } from "./lib.cjs";

const TRADE = "plumbing"; // the user_profiles row needs one trade; the dev-user fixture uses the same (get-user-context.ts)
const LIMIT_KEY = {
  trial: "parcel_tool_report_limit_trial",
  plan: "parcel_tool_report_limit_plan",
}; // REPORT_LIMIT_KEYS

/** The seeded users of one persona row: its email, or email_pattern expanded over count. */
export function personaEmails(p) {
  if (p.email) return [p.email];
  if (p.email_pattern && p.count)
    return Array.from({ length: p.count }, (_, i) =>
      p.email_pattern.replace("{n}", String(i + 1)),
    );
  return [];
}

/** How many usage rows a persona starts with: a number, "=limit" or "=limit+N" against the persona's limit. */
export function usedCount(reportsUsed, limit) {
  if (reportsUsed === undefined || reportsUsed === null) return 0;
  if (typeof reportsUsed === "number") return reportsUsed;
  const m = /^=limit(?:\+(\d+))?$/.exec(String(reportsUsed));
  if (!m)
    throw new Error(
      `reports_used ${JSON.stringify(reportsUsed)} is not a number, "=limit" or "=limit+N"`,
    );
  return limit + Number(m[1] ?? 0);
}

/**
 * The user's profiles row with its admin flag. The row is created when missing, as the on_auth_user_created trigger of migration 226
 * does on dev and production (the test stack's copy has no such rows). No row written fails the user's transaction (the caller rolls
 * it back), never a silent non-admin.
 */
export async function setProfile(db, uid, isAdmin) {
  const r = await db.query(
    "INSERT INTO profiles (id, is_admin) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin",
    [uid, isAdmin],
  );
  if (r.rowCount !== 1) throw new Error("profiles row not written");
}

/**
 * Marks the seeded user's email confirmed so password sign-in works (the test stack's auth config has confirmation on, which returned
 * 400 email_not_confirmed to every stress and drill sign-in). Test stack only (main() refuses otherwise) and only an @mctest.test
 * address. No row updated fails the user's transaction.
 */
export async function confirmEmail(db, uid) {
  const r = await db.query(
    "UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = $1 AND email LIKE '%@mctest.test'",
    [uid],
  );
  if (r.rowCount !== 1) throw new Error("email not confirmed");
}

async function account(email) {
  const base = process.env.MCTEST_SUPABASE_URL;
  const headers = {
    apikey: String(process.env.MCTEST_SUPABASE_ANON_KEY),
    "content-type": "application/json",
  };
  const body = JSON.stringify({ email, password: process.env.MCTEST_PASSWORD });
  let res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok)
    res = await fetch(`${base}/auth/v1/signup`, {
      method: "POST",
      headers,
      body,
    });
  if (!res.ok)
    throw new Error(
      `account: sign-in and sign-up both refused (${res.status})`,
    );
  const j = await res.json();
  const id = j.user?.id ?? j.id;
  if (!id)
    throw new Error(
      "account: no user id (is email confirmation on in the test stack's auth config?)",
    );
  return id;
}

async function main() {
  const stack = testStack(process.env);
  if (!stack.ok) throw new Error(`refused: ${stack.reason}`);
  if (!process.argv.includes("--go"))
    throw new Error(
      "refused: pass --go (the seed runs only on the operator's go)",
    );
  const personas = readCatalogue().personas.filter(
    (p) => p.status === "active" && personaEmails(p).length,
  );
  const db = new pg.Client({
    connectionString: process.env.MCTEST_DATABASE_URL,
  });
  await db.connect();
  let users = 0;
  try {
    const limits = Object.fromEntries(
      (
        await db.query(
          "SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1)",
          [Object.values(LIMIT_KEY)],
        )
      ).rows.map((r) => [r.variable_key, Number(r.variable_value)]),
    );
    for (const p of personas) {
      const e = p.entitlement ?? null;
      const limit =
        limits[e?.status === "trial" ? LIMIT_KEY.trial : LIMIT_KEY.plan];
      for (const email of personaEmails(p)) {
        const uid = await account(email);
        await db.query("BEGIN");
        await setProfile(db, uid, p.role === "admin");
        await confirmEmail(db, uid);
        await db.query(
          "INSERT INTO user_profiles (user_id, trade_slug) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING",
          [uid, TRADE],
        );
        await db.query("DELETE FROM entitlements WHERE user_id = $1", [uid]);
        if (e) {
          await db.query(
            "INSERT INTO entitlements (user_id, product, status, trial_started_at) VALUES ($1, $2, $3, CASE WHEN $3 = 'trial' THEN now() END)",
            [uid, e.product, e.status],
          );
        }
        await db.query(
          "DELETE FROM usage_events WHERE user_id = $1 AND product = 'parcel_tool'",
          [uid],
        );
        const n = usedCount(e?.reports_used, limit);
        if (n > 0) {
          await db.query(
            `INSERT INTO usage_events (user_id, product, event, subject_kind, subject_key, occurred_at, meta)
             SELECT $1, 'parcel_tool', 'property_view', 'parcel_ref', 'mctest-seed-' || g, now(), '{}'::jsonb FROM generate_series(1, $2) g`,
            [uid, n],
          );
        }
        const leadGen = (
          await db.query(
            "SELECT 1 FROM entitlements WHERE user_id = $1 AND product = 'lead_gen'",
            [uid],
          )
        ).rowCount;
        if (leadGen && e?.product !== "lead_gen")
          throw new Error(
            `persona ${p.id}: a lead_gen row appeared (the unmetered path would hide the meter)`,
          );
        await db.query("COMMIT");
        users += 1;
      }
    }
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    await db.end();
  }
  console.log(
    `[mctest seed] ${users} users across ${personas.length} personas on the test stack`,
  );
}

if (process.argv[1]?.endsWith("seed-personas.mjs")) await main();
