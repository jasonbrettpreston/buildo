// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 4; DECISIONS D-1 (a), D-2 (a),
//            D-3 (a), D-6 (load a), D-12 (a).
//
// MF-81 · usage: npm run mctest:load [-- --profiles=S-50,S-200] [--target=http://127.0.0.1:3110] [--plan]
// Stress on a production build against the TEST STACK only, every number labelled LOCAL. Plain Node: built-in fetch and the Node
// timing histogram (D-6 load a, no new package). Refuses before any connection unless the test-stack guard passes and the target is a
// loopback app (never production, Vercel or a remote host). --plan prints the plan after the guard and stops (no connection).
//   1. next build + next start on 127.0.0.1:3110 with the test stack only (appEnv; refused if the port already answers), unless
//      --target names a running local app (the runner cannot prove such an app uses the test stack: the operator's word only);
//   2. 20 lots per load user from the catalogue's L-RANDOM SQL (read-only session, logged seed): user n always gets the same 20,
//      so it never passes its allowance (D-12 a) and a repeat is an uncounted reopen;
//   3. the stress-pool users sign in through the test stack's own sign-in service, paced under its per-address limit (D-3 a);
//   4. per catalogue profile: each user sends one request every interval_s (arrival rate, never waiting on the last answer) by
//      the mix; only the hold window is measured; DB connections from pg_stat_activity every second on a separate read-only
//      connection;
//   5. one JSON per profile and one result line in ~/Buildo-scratch/mctest/runs/<stamp>/ (outside the repo).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHistogram } from "node:perf_hooks";
import pg from "pg";
import {
  appEnv,
  errorRate,
  loadTarget,
  pickKind,
  readCatalogue,
  result,
  ROOT,
  statusClass,
  summarize,
  testStack,
  userLots,
} from "../../scripts/mctest/lib.cjs";
import { personaEmails } from "../../scripts/mctest/seed-personas.mjs";

const PORT = 3110;
const LOTS_PER_USER = 20; // the plan and trial allowance (D-12 a); never more lots than this per user
const SIGNIN_PER_5MIN = 110; // under the test stack's 150 token requests per 5 minutes per address (plan MF81-2 a)
const POOL_MAX = 20; // the app's default pool (src/lib/db/client.ts PG_POOL_MAX)
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_LIFE_MS = 3_600_000; // the test stack's jwt_expiry (3600 s, ~/Buildo-teststack/supabase/config.toml)
const LABEL =
  "LOCAL: production build on this Mac against the test stack; the load generator shares the Mac with Postgres; " +
  "in-memory rate limiter (not production's Upstash); auth-roundtrip (the test stack's tokens are checked by its sign-in service " +
  "on every request, production checks locally, Spec 13 §3.2)";
const BUDGET = {
  open_lot_p95_ms: 1000,
  source: "S-DETAIL-LATENCY (operator 2026-11-12), reference only, no verdict",
};

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const refuse = (reason) => {
  console.error(`[mctest load] refused: ${reason}`);
  process.exitCode = 2;
};

async function main() {
  const stack = testStack(process.env);
  if (!stack.ok) return refuse(stack.reason);
  const target = arg("target") ?? `http://127.0.0.1:${PORT}`;
  const t = loadTarget(target);
  if (!t.ok) return refuse(t.reason);
  const cat = readCatalogue();
  const wanted = arg("profiles")?.split(",");
  const profiles = cat.stress_profiles.filter(
    (p) => !wanted || wanted.includes(p.id),
  );
  const unknown = (wanted ?? []).filter(
    (id) => !cat.stress_profiles.some((p) => p.id === id),
  );
  if (unknown.length) return refuse(`unknown profile ${unknown.join(", ")}`);
  if (!profiles.length) return refuse("no stress profile selected");
  const emails = personaEmails(
    cat.personas.find((p) => p.id === "stress_pool"),
  );
  const users = Math.max(...profiles.map((p) => p.concurrent_users));
  if (users > emails.length)
    return refuse(`${users} users wanted, ${emails.length} seeded`);
  const seed = process.env.MCTEST_SEED ?? new Date().toISOString().slice(0, 10);
  const plan = {
    label: LABEL,
    target,
    seed,
    users,
    profiles: profiles.map((p) => ({
      id: p.id,
      users: p.concurrent_users,
      interval_s: p.interval_s,
      warmup_s: p.warmup_s,
      hold_s: p.hold_s,
      mix: p.mix,
    })),
  };
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan, null, 1));
    return;
  }

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

  let app = null;
  const stop = () => {
    try {
      if (app) process.kill(-app.pid, "SIGTERM");
    } catch {
      // the app's process group is already gone
    }
    app = null;
  };
  // The app runs in its own process group: a Ctrl-C or SIGTERM to the runner stops it too.
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () => {
      stop();
      process.kill(process.pid, sig);
    });
  try {
    if (!arg("target")) app = await startApp();
    const lots = await sampleLots(cat, seed, users * LOTS_PER_USER);
    const signedInAt = Date.now();
    const tokens = await signInAll(emails.slice(0, users));
    for (const p of profiles) {
      // A token older than its life would turn the run into 401s, a harness fault, not an app result.
      const ageMs = Date.now() - signedInAt;
      const runMs = (p.warmup_s + p.hold_s + 10) * 1000;
      if (ageMs + runMs > TOKEN_LIFE_MS)
        throw new Error(
          `tokens_too_old_for_${p.id}: signed in ${Math.round(ageMs / 60000)} min ago, the test stack's tokens last ${TOKEN_LIFE_MS / 60000} min`,
        );
      const out = await runProfile(p, { target, lots, tokens, seed });
      const file = path.join(runDir, `stress-${p.id}.json`);
      fs.writeFileSync(
        file,
        `${JSON.stringify({ ...out, sha, label: LABEL, budget: BUDGET }, null, 1)}\n`,
      );
      const answered = out.overall.count;
      line({
        row: `stress_profiles/${p.id}`,
        owner: p.owner,
        kase: `${p.concurrent_users} users`,
        status: answered ? "WAITS" : "FAIL",
        detail: answered
          ? `measured LOCAL, thresholds not ruled: p95 ${Math.round(out.overall.p95_ms)} ms, error rate ${out.error_rate.toFixed(4)}, 429 ${out.classes["429"] ?? 0}, 403 REPORT_LIMIT_REACHED ${out.classes["403_REPORT_LIMIT_REACHED"] ?? 0}`
          : "no request was answered in the hold window",
        label: "LOCAL",
        replay: `MCTEST_SEED=${seed} npm run mctest:load -- --profiles=${p.id}`,
      });
      console.log(`[mctest load] ${p.id}: ${file}`);
    }
  } catch (err) {
    // A throw (build, start, sample, sign-in) is a FAIL line, never silent (OUTPUT panel, MF-79).
    line({
      row: "stress_profiles",
      owner: "MF-81",
      kase: "run",
      status: "FAIL",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
      label: "LOCAL",
    });
    throw err;
  } finally {
    stop();
  }
}

/** next build, then next start on loopback with the test stack only; ready when the anonymous entitlement call answers 401. */
async function startApp() {
  const env = appEnv(process.env);
  const busy = await fetch(`http://127.0.0.1:${PORT}/`).then(
    () => true,
    () => false,
  );
  if (busy)
    throw new Error(
      `port_${PORT}_in_use: another app answers there; the load would not reach the test-stack build`,
    );
  const build = spawnSync("npx", ["next", "build"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error(`next_build_exit_${build.status}`);
  const app = spawn(
    "npx",
    ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"],
    {
      cwd: ROOT,
      env,
      stdio: "inherit",
      detached: true, // its own process group, so the finally block stops next and its children
    },
  );
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await fetch(
      `http://127.0.0.1:${PORT}/api/parcels/entitlement`,
    ).then(
      (r) => r.status,
      () => 0,
    );
    if (app.exitCode !== null)
      throw new Error(`next_start_exit_${app.exitCode}`);
    if (s === 401) return app;
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.kill(-app.pid, "SIGTERM");
  throw new Error("app_not_ready_in_120s");
}

/** The catalogue's L-RANDOM lots, read in a read-only session on the test stack. */
async function sampleLots(cat, seed, count) {
  const sql = cat.lot_cases.find((l) => l.id === "L-RANDOM").sql;
  const db = new pg.Client({
    connectionString: process.env.MCTEST_DATABASE_URL,
    application_name: "mctest-load-sample",
  });
  await db.connect();
  try {
    await db.query("SET default_transaction_read_only = on");
    const rows = (await db.query(sql, [seed, count])).rows;
    if (!rows.length) throw new Error("sample_empty");
    return rows.map((r) => ({
      parcelId: String(r.parcel_id),
      address: String(r.address_full),
    }));
  } finally {
    await db.end();
  }
}

/** Sign-in through the test stack's own sign-in service, paced; a 429 from it waits a minute and retries (counted). */
async function signInAll(emails) {
  const gap = 300_000 / SIGNIN_PER_5MIN;
  const tokens = [];
  let throttled = 0;
  for (const email of emails) {
    const t0 = Date.now();
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(
        `${process.env.MCTEST_SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: String(process.env.MCTEST_SUPABASE_ANON_KEY),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password: process.env.MCTEST_PASSWORD,
          }),
        },
      );
      if (res.ok) {
        tokens.push((await res.json()).access_token);
        break;
      }
      if (res.status !== 429 || attempt >= 3)
        throw new Error(
          `sign_in_${res.status} after ${tokens.length} users (${throttled} throttled)`,
        );
      throttled += 1;
      await new Promise((r) => setTimeout(r, 60_000));
    }
    await new Promise((r) =>
      setTimeout(r, Math.max(0, gap - (Date.now() - t0))),
    );
  }
  console.log(
    `[mctest load] ${tokens.length} users signed in (${throttled} sign-in 429s)`,
  );
  return tokens;
}

/** The envelope's error code, or undefined for a body that is not JSON (a 403 stays a 403, never a network error). */
function errorCode(text) {
  try {
    return JSON.parse(text)?.error?.code;
  } catch {
    return undefined;
  }
}

/** A small seeded PRNG (mulberry32), so a run's request mix replays from its seed. */
function rng(text) {
  let a = 0;
  for (const ch of text) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

async function runProfile(p, { target, lots, tokens, seed }) {
  const n = p.concurrent_users;
  const interval = p.interval_s * 1000;
  const start = Date.now() + 1000;
  const holdFrom = start + p.warmup_s * 1000;
  const end = holdFrom + p.hold_s * 1000;
  const hist = { overall: createHistogram() };
  const classes = {};
  const byKind = {};
  const inflight = new Set();

  // DB connections every second, from a separate read-only connection (the sampler names itself and is not counted).
  const db = new pg.Client({
    connectionString: process.env.MCTEST_DATABASE_URL,
    application_name: "mctest-load-sampler",
  });
  let dbErrors = 0;
  db.on("error", () => {
    dbErrors += 1;
  });
  await db.connect();
  await db.query("SET default_transaction_read_only = on");
  const dbMax = {};
  let secondsAtPoolMax = 0;
  let dbSamples = 0;
  const sampler = setInterval(async () => {
    const r = await db
      .query(
        "SELECT coalesce(nullif(application_name, ''), '(unnamed: the app pool)') AS app, count(*)::int AS n FROM pg_stat_activity WHERE backend_type = 'client backend' AND application_name <> 'mctest-load-sampler' GROUP BY 1",
      )
      .catch(() => {
        dbErrors += 1;
        return null;
      });
    if (!r || Date.now() < holdFrom) return; // the hold window only, like the latencies
    dbSamples += 1;
    for (const { app, n: c } of r.rows)
      dbMax[app] = Math.max(dbMax[app] ?? 0, c);
    if ((r.rows.find((x) => x.app.startsWith("(unnamed"))?.n ?? 0) >= POOL_MAX)
      secondsAtPoolMax += 1;
  }, 1000);

  const fire = async (u, kind, lot) => {
    const url =
      kind === "search_q"
        ? `${target}/api/parcels/lookup?q=${encodeURIComponent(lot.address)}`
        : kind === "open_lot"
          ? `${target}/api/parcels/lookup?parcelId=${encodeURIComponent(lot.parcelId)}`
          : `${target}/api/parcels/entitlement`;
    const sentAt = Date.now();
    const t0 = process.hrtime.bigint();
    let status = 0;
    let code;
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${tokens[u]}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      status = res.status;
      const text = await res.text();
      if (status === 403) code = errorCode(text);
    } catch {
      status = 0; // a timeout or a dropped connection: the network class
    }
    if (sentAt < holdFrom) return; // warm-up is not measured
    const us = Number((process.hrtime.bigint() - t0) / 1000n);
    const cls = statusClass(status, code);
    classes[cls] = (classes[cls] ?? 0) + 1;
    (byKind[kind] ??= {})[cls] = (byKind[kind][cls] ?? 0) + 1;
    hist.overall.record(Math.max(1, us));
    (hist[kind] ??= createHistogram()).record(Math.max(1, us));
  };

  const userLoop = async (u) => {
    const draw = rng(`${seed}:${p.id}:${u}`);
    const mine = userLots(lots, u, LOTS_PER_USER);
    for (let k = 0; ; k += 1) {
      const at = start + (u / n) * interval + k * interval; // starts spread over one interval
      if (at >= end) return;
      await new Promise((r) => setTimeout(r, Math.max(0, at - Date.now())));
      const req = fire(u, pickKind(draw(), p.mix), mine[k % LOTS_PER_USER]);
      inflight.add(req);
      req.finally(() => inflight.delete(req));
    }
  };
  await Promise.all(Array.from({ length: n }, (_, u) => userLoop(u)));
  await Promise.all([...inflight]);
  clearInterval(sampler);
  await db.end();

  const endpoints = {};
  for (const [kind, h] of Object.entries(hist))
    if (kind !== "overall")
      endpoints[kind] = { ...summarize(h), classes: byKind[kind] };
  return {
    profile: p.id,
    users: n,
    interval_s: p.interval_s,
    warmup_s: p.warmup_s,
    hold_s: p.hold_s,
    seed,
    overall: summarize(hist.overall),
    endpoints,
    classes,
    error_rate: errorRate(classes),
    rps: hist.overall.count / p.hold_s,
    db: {
      sample_errors: dbErrors,
      samples: dbSamples,
      max_by_app: dbMax,
      seconds_app_pool_at_max: secondsAtPoolMax,
      pool_max: POOL_MAX,
    },
    pool_wait_ms:
      "not_measured: the wait for a free DB connection is inside the app, which does not record it (plan MF81-9)",
  };
}

await main();
