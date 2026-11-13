// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layers 4 and 5; DECISIONS D-1 (a), D-3 (a).
//
// MF-81 · what the stress runner and the drill runner share: the run folder and its result lines, the production app on loopback with
// the test stack only (stopped on exit or a signal), the catalogue's lot sample in a read-only session, and sign-in through the test
// stack's own sign-in service.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { result, ROOT } from "../../scripts/mctest/lib.cjs";

/** The run folder (~/Buildo-scratch/mctest/runs/<stamp>/, outside the repo) and a writer of its result lines. */
export function runFiles() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  const runDir =
    process.env.MCTEST_RUN_DIR ??
    path.join(os.homedir(), "Buildo-scratch/mctest/runs", stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const line = (r) =>
    fs.appendFileSync(
      path.join(runDir, "results.jsonl"),
      `${JSON.stringify(result(r))}\n`,
    );
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
  // A JSON result file inside the run folder; returns its path. (2026-11-13: stress.mjs named runDir, which it never had.)
  const saveJson = (name, obj) => {
    const file = path.join(runDir, name);
    fs.writeFileSync(file, `${JSON.stringify(obj, null, 1)}\n`);
    return file;
  };
  return { runDir, line, sha, saveJson };
}

/**
 * next build, then next start on 127.0.0.1:<port> with `env` (the caller passes appEnv, the test stack only). Refused when the port
 * already answers (the load must reach this build). Ready when the anonymous entitlement call answers 401. Returns stop(); a Ctrl-C or
 * SIGTERM to the runner also stops the app's process group.
 */
export async function startApp(port, env) {
  const base = `http://127.0.0.1:${port}`;
  const busy = await fetch(`${base}/`).then(
    () => true,
    () => false,
  );
  if (busy)
    throw new Error(
      `port_${port}_in_use: another app answers there; the run would not reach the test-stack build`,
    );
  const build = spawnSync("npx", ["next", "build"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error(`next_build_exit_${build.status}`);
  let app = spawn(
    "npx",
    ["next", "start", "-p", String(port), "-H", "127.0.0.1"],
    { cwd: ROOT, env, stdio: "inherit", detached: true }, // its own process group, so stop() ends next and its children
  );
  const stop = () => {
    try {
      if (app) process.kill(-app.pid, "SIGTERM");
    } catch {
      // the app's process group is already gone
    }
    app = null;
  };
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () => {
      stop();
      process.kill(process.pid, sig);
    });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await fetch(`${base}/api/parcels/entitlement`).then(
      (r) => r.status,
      () => 0,
    );
    if (app.exitCode !== null) {
      const code = app.exitCode;
      stop();
      throw new Error(`next_start_exit_${code}`);
    }
    if (s === 401) return stop;
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop();
  throw new Error("app_not_ready_in_120s");
}

/**
 * The catalogue's sample SQL (data, not code): L-RANDOM's `sql`, or with counting=true its `sql_counting` (lots with a stored Layer 3
 * option that has an evaluated value, the only lots the meter counts: EI-D1 "1 b").
 */
export function lotSql(cat, counting) {
  const row = cat.lot_cases.find((l) => l.id === "L-RANDOM");
  const sql = counting ? row.sql_counting : row.sql;
  if (!sql)
    throw new Error(`L-RANDOM has no ${counting ? "sql_counting" : "sql"}`);
  return sql;
}

/** The catalogue's lots (counting lots when asked), read in a read-only session on the test stack. */
export async function sampleLots(cat, seed, count, counting = false) {
  const sql = lotSql(cat, counting);
  const db = new pg.Client({
    connectionString: process.env.MCTEST_DATABASE_URL,
    application_name: "mctest-load-sample",
  });
  await db.connect();
  try {
    await db.query("SET default_transaction_read_only = on");
    const rows = (await db.query(sql, [seed, count])).rows;
    if (!rows.length)
      throw new Error(
        counting ? "sample_empty: no counting lots" : "sample_empty",
      );
    return rows.map((r) => ({
      parcelId: String(r.parcel_id),
      address: String(r.address_full),
    }));
  } finally {
    await db.end();
  }
}

/** One sign-in through the test stack's own sign-in service (D-3 a): { status, token }. */
export async function signIn(email) {
  const res = await fetch(
    `${process.env.MCTEST_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: String(process.env.MCTEST_SUPABASE_ANON_KEY),
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password: process.env.MCTEST_PASSWORD }),
    },
  );
  return {
    status: res.status,
    token: res.ok ? (await res.json()).access_token : null,
  };
}

/** Many sign-ins, paced at perFiveMin; a 429 from the sign-in service waits a minute and retries (counted). */
export async function signInAll(emails, perFiveMin) {
  const gap = 300_000 / perFiveMin;
  const tokens = [];
  let throttled = 0;
  for (const email of emails) {
    const t0 = Date.now();
    for (let attempt = 0; ; attempt += 1) {
      const r = await signIn(email);
      if (r.token) {
        tokens.push(r.token);
        break;
      }
      if (r.status !== 429 || attempt >= 3)
        throw new Error(
          `sign_in_${r.status} after ${tokens.length} users (${throttled} throttled)`,
        );
      throttled += 1;
      await new Promise((res) => setTimeout(res, 60_000));
    }
    await new Promise((res) =>
      setTimeout(res, Math.max(0, gap - (Date.now() - t0))),
    );
  }
  console.log(
    `[mctest] ${tokens.length} users signed in (${throttled} sign-in 429s)`,
  );
  return tokens;
}
