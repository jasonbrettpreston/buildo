// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 5; DECISIONS D-1 (a), D-3 (a), D-12 (a);
//            plan MF81-4..7 (a), operator "MF81 all a" (~/Buildo-scratch/mcfrontend/MF-81/DECISIONS.md).
//
// MF-81 · usage: npm run mctest:drills [-- --only=F-DB-SLOW,F-CAP-REACHED] [--plan]
// The failure drills on the TEST STACK only, labelled LOCAL. Refuses before any connection unless the test-stack guard passes;
// --plan prints the drills after the guard and stops. One production app on 127.0.0.1:3111 whose DB goes through the drill relay
// (127.0.0.1:55328 → the test-stack Postgres), so DB slow and DB down need no DB write and no container change; sign-in keeps working.
// Each drill uses its own catalogue persona and lots from the L-RANDOM sample; the verdicts are the pure functions in lib.cjs.
//   F-DB-SLOW          drill_session: a new lot with every DB reply delayed 3 s (FAIL only on a hang, an unsanitised body, a meter on a failure)
//   F-DB-DOWN          drill_session: a new lot with the DB refused; fails closed, not metered, answers again once the DB is back
//   F-SESSION-EXPIRED  drill_session: signed out, the old token gets 401 and nothing is metered (web part WAITS on MF-46)
//   F-CAP-REACHED      drill_cap: real lots up to the limit, then 403 REPORT_LIMIT_REACHED with the reset date; a counted lot reopens
//   F-RATE-LIMITED     drill_rate: one lot reopened until a 429 with Retry-After; never a 5xx; reopens never metered
import {
  appEnv,
  capVerdict,
  downVerdict,
  HANG_MS,
  rateVerdict,
  readCatalogue,
  relayUrl,
  sessionVerdict,
  slowVerdict,
  testStack,
} from "../../scripts/mctest/lib.cjs";
import { startRelay } from "./relay.mjs";
import { runFiles, sampleLots, signIn, startApp } from "./stack.mjs";

const PORT = 3111;
const RELAY_PORT = 55328; // inside the test stack's port range 55320-55329, free in its config
const SLOW_DELAY_MS = 3000;
const PACE_MS = 2100; // one lot open (and one usage read) per 2.1 s: under 30 a minute per bucket
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function call(path, token) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(HANG_MS),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null; // a body that is not JSON: the verdicts read the text
    }
    return {
      status: res.status,
      text,
      body,
      elapsedMs: Date.now() - t0,
      retryAfter: res.headers.get("retry-after"),
    };
  } catch {
    return { status: 0, text: "", body: null, elapsedMs: Date.now() - t0 };
  }
}
const lookup = (lot, token) =>
  call(
    `/api/parcels/lookup?parcelId=${encodeURIComponent(lot.parcelId)}`,
    token,
  );
const usage = async (token) =>
  (await call("/api/parcels/entitlement", token)).body?.data ?? null;
const hasData = (r) => r.body?.data != null;

async function tokenOf(cat, id) {
  const p = cat.personas.find((x) => x.id === id);
  if (!p?.email) throw new Error(`persona ${id} not in the catalogue`);
  const r = await signIn(p.email);
  if (!r.token) throw new Error(`sign_in_${r.status} for ${id}`);
  return r.token;
}

/** F-DB-SLOW, F-DB-DOWN, F-SESSION-EXPIRED on drill_session (lots[0..3]). */
async function sessionDrills(cat, lots, relay, only, out) {
  let token = await tokenOf(cat, "drill_session");
  const u0 = await usage(token);
  if (!u0 || u0.reportsUsed + 4 > u0.reportsLimit)
    return out.skip(
      ["F-DB-SLOW", "F-DB-DOWN", "F-SESSION-EXPIRED"],
      "drill_session",
      "drill_session is near its limit; re-run the seed (D-12 a)",
    );
  if (only("F-DB-SLOW")) {
    const before = (await usage(token)).reportsUsed;
    relay.setMode("slow");
    const r = await lookup(lots[0], token);
    relay.setMode("pass");
    const after = (await usage(token))?.reportsUsed;
    const ok = r.status >= 200 && r.status < 300;
    out.drill(
      "F-DB-SLOW",
      "drill_session",
      slowVerdict({ ...r, metered: !ok && after !== before }),
    );
  }
  if (only("F-DB-DOWN")) {
    const before = (await usage(token)).reportsUsed;
    relay.setMode("down");
    const r = await lookup(lots[1], token);
    relay.setMode("pass");
    let recovered = false;
    for (let i = 0; i < 15 && !recovered; i += 1) {
      recovered =
        (await call("/api/parcels/entitlement", token)).status === 200;
      if (!recovered) await sleep(2000);
    }
    const after = (await usage(token))?.reportsUsed;
    out.drill(
      "F-DB-DOWN",
      "drill_session",
      downVerdict({ ...r, recovered, metered: after !== before }),
    );
  }
  if (only("F-SESSION-EXPIRED")) {
    await lookup(lots[2], token);
    const before = (await usage(token)).reportsUsed;
    const logout = await fetch(
      `${process.env.MCTEST_SUPABASE_URL}/auth/v1/logout?scope=global`,
      {
        method: "POST",
        headers: {
          apikey: String(process.env.MCTEST_SUPABASE_ANON_KEY),
          authorization: `Bearer ${token}`,
        },
      },
    );
    if (!logout.ok) throw new Error(`sign_out_${logout.status}`);
    const l = await lookup(lots[3], token);
    const e = await call("/api/parcels/entitlement", token);
    token = await tokenOf(cat, "drill_session");
    const after = (await usage(token))?.reportsUsed;
    out.drill(
      "F-SESSION-EXPIRED",
      "drill_session",
      sessionVerdict({
        lookupStatus: l.status,
        entitlementStatus: e.status,
        metered: after !== before,
      }),
      "LOCAL auth-roundtrip: the test stack checks the session on every call; production read paths serve a signed-out token until it expires (Spec 13 §3.2)",
    );
    out.waits(
      "F-SESSION-EXPIRED",
      "web",
      "MF-46: the report page is behind its off switch (J-PIN expects 404)",
    );
  }
}

/** F-CAP-REACHED on drill_cap (lots[10..]): open real lots up to the limit, then a new lot, then reopen the first counted one. */
async function capDrill(cat, lots, out) {
  const token = await tokenOf(cat, "drill_cap");
  const u0 = await usage(token);
  if (!u0 || u0.reportsUsed !== 0)
    return out.skip(
      ["F-CAP-REACHED"],
      "drill_cap",
      "drill_cap has used reports; re-run the seed (D-12 a)",
    );
  const limit = u0.reportsLimit;
  let used = 0;
  let firstCounted = null;
  let i = 10;
  for (; used < limit && i < lots.length; i += 1) {
    await lookup(lots[i], token);
    await sleep(PACE_MS);
    const now = (await usage(token)).reportsUsed;
    if (now > used && !firstCounted) firstCounted = lots[i];
    used = now;
  }
  let refusal = { status: 0, body: null };
  let metered = false;
  for (let k = 0; k < 10 && i < lots.length; k += 1, i += 1) {
    const r = await lookup(lots[i], token);
    await sleep(PACE_MS);
    if (r.status === 403) {
      refusal = r;
      break;
    }
    if ((await usage(token)).reportsUsed > limit) metered = true; // a served lot past the cap must not count
  }
  const reopen = firstCounted
    ? await lookup(firstCounted, token)
    : { status: 0, body: null };
  if ((await usage(token)).reportsUsed > limit) metered = true;
  out.drill(
    "F-CAP-REACHED",
    "drill_cap",
    capVerdict({
      limit,
      usedAtCap: used,
      refusal: {
        status: refusal.status,
        code: refusal.body?.error?.code,
        details: refusal.body?.error?.details,
        hasData: hasData(refusal),
      },
      reopen: { status: reopen.status, hasData: hasData(reopen) },
      metered,
    }),
  );
}

/** F-RATE-LIMITED on drill_rate (lots[5]): open once, then reopen without pause until a 429 (at most 61 calls). */
async function rateDrill(cat, lots, out) {
  const token = await tokenOf(cat, "drill_rate");
  await lookup(lots[5], token);
  const before = (await usage(token))?.reportsUsed;
  const statuses = [];
  let retryAfter = null;
  for (let k = 0; k < 61; k += 1) {
    const r = await lookup(lots[5], token);
    statuses.push(r.status);
    if (r.status === 429) {
      retryAfter = r.retryAfter;
      break;
    }
  }
  const after = (await usage(token))?.reportsUsed;
  out.drill(
    "F-RATE-LIMITED",
    "drill_rate",
    rateVerdict({ statuses, retryAfter, metered: after !== before }),
  );
}

async function main() {
  const stack = testStack(process.env);
  if (!stack.ok) {
    console.error(`[mctest drills] refused: ${stack.reason}`);
    process.exitCode = 2;
    return;
  }
  const cat = readCatalogue();
  const rows = cat.failure_drills.filter(
    (d) => d.runner === "tests/load/drills.mjs" && d.status === "active",
  );
  const wanted = arg("only")?.split(",");
  const unknown = (wanted ?? []).filter((id) => !rows.some((d) => d.id === id));
  if (unknown.length) {
    console.error(
      `[mctest drills] refused: unknown drill ${unknown.join(", ")}`,
    );
    process.exitCode = 2;
    return;
  }
  const only = (id) => !wanted || wanted.includes(id);
  if (process.argv.includes("--plan")) {
    console.log(
      JSON.stringify(
        {
          label: "LOCAL",
          app: base,
          relay: `127.0.0.1:${RELAY_PORT}`,
          drills: rows.filter((d) => only(d.id)).map((d) => d.id),
        },
        null,
        1,
      ),
    );
    return;
  }

  const { line } = runFiles();
  const owner = (id) => rows.find((d) => d.id === id)?.owner ?? "MF-81";
  const replay = (id) => `npm run mctest:drills -- --only=${id}`;
  const out = {
    drill: (id, persona, v, label = "LOCAL") =>
      line({
        row: `failure_drills/${id}`,
        owner: owner(id),
        kase: persona,
        status: v.status,
        detail: v.detail,
        label,
        replay: replay(id),
      }),
    skip: (ids, persona, why) =>
      ids
        .filter(only)
        .forEach((id) =>
          line({
            row: `failure_drills/${id}`,
            owner: owner(id),
            kase: persona,
            status: "SKIP",
            detail: why,
            label: "LOCAL",
          }),
        ),
    waits: (id, kase, why) =>
      line({
        row: `failure_drills/${id}`,
        owner: "MF-46",
        kase,
        status: "WAITS",
        detail: why,
      }),
  };

  const db = new URL(process.env.MCTEST_DATABASE_URL);
  let relay = null;
  let stop = () => {};
  try {
    relay = await startRelay({
      listenPort: RELAY_PORT,
      target: { host: db.hostname, port: Number(db.port || 5432) },
      delayMs: SLOW_DELAY_MS,
    });
    stop = await startApp(PORT, {
      ...appEnv(process.env),
      DATABASE_URL: relayUrl(process.env.MCTEST_DATABASE_URL, RELAY_PORT),
    });
    const lots = await sampleLots(
      cat,
      `${new Date().toISOString().slice(0, 10)}-drills`,
      120,
    );
    if (["F-DB-SLOW", "F-DB-DOWN", "F-SESSION-EXPIRED"].some(only))
      await sessionDrills(cat, lots, relay, only, out);
    if (only("F-CAP-REACHED")) await capDrill(cat, lots, out);
    if (only("F-RATE-LIMITED")) await rateDrill(cat, lots, out);
  } catch (err) {
    // A throw (relay, build, start, sample, sign-in) is a FAIL line, never silent (OUTPUT panel, MF-79).
    line({
      row: "failure_drills",
      owner: "MF-81",
      kase: "run",
      status: "FAIL",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
      label: "LOCAL",
    });
    throw err;
  } finally {
    stop();
    if (relay) await relay.close();
  }
}

await main();
