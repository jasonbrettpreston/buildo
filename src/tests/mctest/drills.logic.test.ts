// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 5; plan MF81-4..7 (a), operator "MF81 all a".
//
// MF-81 · the failure-drill canaries, both ways: each drill verdict passes its expected answer and fails each broken one (a hang, an
// unsanitised body, a meter on a failed lookup, a served lookup with the DB down, a live signed-out token, a cap without its reset
// date, a 429 without Retry-After); the relay forwards, delays and refuses on loopback; the drill runner refuses the dev stack before
// any connection; every drill row names its own seeded persona.
import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  capVerdict,
  downVerdict,
  rateVerdict,
  readCatalogue,
  relayUrl,
  ROOT,
  sanitisedError,
  sessionVerdict,
  slowVerdict,
} from "../../../scripts/mctest/lib.cjs";
import { startRelay } from "../../../tests/load/relay.mjs";

const ERR = JSON.stringify({
  data: null,
  error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  meta: null,
});
const LEAKY = JSON.stringify({
  data: null,
  error: {
    code: "INTERNAL_ERROR",
    message: 'relation "parcels" does not exist: SELECT * FROM parcels',
  },
  meta: null,
});

describe("sanitised error bodies", () => {
  it("accepts the API envelope", () => {
    expect(sanitisedError(ERR)).toBe(true);
  });
  it.each([
    ["SQL", LEAKY],
    ["a stack", `${ERR.slice(0, -1)},"stack":"at run (/app/route.js:10:5)"}`],
    [
      "a connection string",
      ERR.replace("An unexpected", "postgres://u:p@h/db"),
    ],
    ["not JSON", "<html>500</html>"],
    ["a payload with the error", ERR.replace('"data":null', '"data":{}')],
  ])("refuses %s", (_n, text) => {
    expect(sanitisedError(text)).toBe(false);
  });
});

describe("DB slow (MF81-5 a)", () => {
  it("passes a late 200 and a sanitised, unmetered failure", () => {
    expect(
      slowVerdict({ status: 200, elapsedMs: 9000, text: "{}", metered: true })
        .status,
    ).toBe("PASS");
    expect(
      slowVerdict({ status: 500, elapsedMs: 9000, text: ERR, metered: false })
        .status,
    ).toBe("PASS");
  });
  it.each([
    [
      "a hang",
      { status: 0, elapsedMs: 60000, text: "", metered: false },
      /hang/,
    ],
    [
      "an unsanitised body",
      { status: 500, elapsedMs: 10, text: LEAKY, metered: false },
      /unsanitised/,
    ],
    [
      "a meter on a failure",
      { status: 500, elapsedMs: 10, text: ERR, metered: true },
      /meter/,
    ],
  ])("fails %s", (_n, a, re) => {
    const v = slowVerdict(a);
    expect(v.status).toBe("FAIL");
    expect(v.detail).toMatch(re);
  });
});

describe("DB down", () => {
  const ok = {
    status: 401,
    elapsedMs: 30,
    text: ERR,
    metered: false,
    recovered: true,
  };
  it("passes a fail-closed answer that recovers, naming a 401 as the outage shown as signed out", () => {
    const v = downVerdict(ok);
    expect(v.status).toBe("PASS");
    expect(v.detail).toMatch(/shows as signed out/);
  });
  it("after sign-in, wants a server error: a 401 there never reached the lookup", () => {
    expect(
      downVerdict({ ...ok, status: 500 }, { afterSignIn: true }).status,
    ).toBe("PASS");
    const v = downVerdict(ok, { afterSignIn: true });
    expect(v.status).toBe("FAIL");
    expect(v.detail).toMatch(/lookup path was not reached/);
  });
  it.each([
    ["a served lookup", { ...ok, status: 200 }, /served/],
    ["a meter", { ...ok, metered: true }, /meter/],
    ["no recovery", { ...ok, recovered: false }, /did not answer again/],
    ["a hang", { ...ok, status: 0 }, /hang/],
  ])("fails %s", (_n, a, re) => {
    const v = downVerdict(a);
    expect(v.status).toBe("FAIL");
    expect(v.detail).toMatch(re);
  });
});

describe("signed-out session (MF81-6 a)", () => {
  it("passes a served or refused signed-out token, fails a 5xx, a live tampered token or a metered refusal (Spec 13 3.2, 2026-11-13)", () => {
    const base = {
      lookupStatus: 401,
      entitlementStatus: 401,
      tamperedStatus: 401,
      metered: false,
    };
    expect(sessionVerdict(base).status).toBe("PASS");
    expect(sessionVerdict({ ...base, lookupStatus: 200 }).status).toBe("PASS");
    expect(sessionVerdict({ ...base, tamperedStatus: 200 }).status).toBe(
      "FAIL",
    );
    expect(sessionVerdict({ ...base, metered: true }).status).toBe("FAIL");
    expect(sessionVerdict({ ...base, lookupStatus: 503 }).status).toBe("FAIL");
  });
});

describe("cap reached", () => {
  const ok = {
    limit: 20,
    usedAtCap: 20,
    refusal: {
      status: 403,
      code: "REPORT_LIMIT_REACHED",
      details: { reportsLimit: 20, resetsOn: "2026-12-01T00:00:00.000Z" },
      hasData: false,
    },
    reopen: { status: 200, hasData: true },
    metered: false,
  };
  it("passes the refusal with its reset date and a reopened counted lot", () => {
    expect(capVerdict(ok).status).toBe("PASS");
  });
  it.each([
    ["the limit not reached", { ...ok, usedAtCap: 19 }],
    [
      "no reset date",
      { ...ok, refusal: { ...ok.refusal, details: { reportsLimit: 20 } } },
    ],
    [
      "a payload with the refusal",
      { ...ok, refusal: { ...ok.refusal, hasData: true } },
    ],
    [
      "another 403",
      { ...ok, refusal: { ...ok.refusal, code: "SUBSCRIPTION_REQUIRED" } },
    ],
    [
      "a counted lot refused",
      { ...ok, reopen: { status: 403, hasData: false } },
    ],
    ["a meter past the limit", { ...ok, metered: true }],
  ])("fails %s", (_n, a) => {
    expect(capVerdict(a).status).toBe("FAIL");
  });
});

describe("rate limited", () => {
  const ok = {
    statuses: [...Array(30).fill(200), 429],
    retryAfter: "60",
    metered: false,
  };
  it("passes a 429 with Retry-After after the allowed calls", () => {
    expect(rateVerdict(ok)).toEqual({
      status: "PASS",
      detail: "429 after 30 allowed calls, Retry-After 60",
    });
  });
  it.each([
    ["no 429", { ...ok, statuses: Array(61).fill(200) }],
    ["a 5xx", { ...ok, statuses: [200, 500, 429] }],
    ["no Retry-After", { ...ok, retryAfter: null }],
    ["a metered reopen", { ...ok, metered: true }],
  ])("fails %s", (_n, a) => {
    expect(rateVerdict(a).status).toBe("FAIL");
  });
});

describe("the drill relay (MF81-4 a)", () => {
  it("swaps only host and port in the DB URL", () => {
    expect(
      relayUrl("postgres://postgres:x@127.0.0.1:55322/postgres", 55328),
    ).toBe("postgres://postgres:x@127.0.0.1:55328/postgres");
  });
  const echo = () =>
    new Promise<net.Server>((r) => {
      const s = net.createServer((c) => c.pipe(c));
      s.listen(0, "127.0.0.1", () => r(s));
    });
  const roundTrip = (port: number) =>
    new Promise<{ ms: number; reply: string; closed: boolean }>((r) => {
      const t0 = Date.now();
      const c = net.connect(port, "127.0.0.1", () => c.write("ping"));
      let reply = "";
      c.on("data", (d) => {
        reply += d.toString();
        c.end();
      });
      c.on("error", () => undefined);
      c.on("close", () => r({ ms: Date.now() - t0, reply, closed: true }));
    });
  it("forwards in pass, delays in slow, refuses in down", async () => {
    const s = await echo();
    const relay = await startRelay({
      listenPort: 0,
      target: {
        host: "127.0.0.1",
        port: (s.address() as net.AddressInfo).port,
      },
      delayMs: 300,
    });
    try {
      expect((await roundTrip(relay.port)).reply).toBe("ping");
      relay.setMode("slow");
      const slow = await roundTrip(relay.port);
      expect(slow.reply).toBe("ping");
      expect(slow.ms).toBeGreaterThanOrEqual(290);
      relay.setMode("down");
      expect((await roundTrip(relay.port)).reply).toBe("");
      relay.setMode("pass");
      expect((await roundTrip(relay.port)).reply).toBe("ping");
    } finally {
      await relay.close();
      s.close();
    }
  });
  it("cuts every connection at the first matching query, then refuses until pass", async () => {
    const s = await echo();
    const relay = await startRelay({
      listenPort: 0,
      target: {
        host: "127.0.0.1",
        port: (s.address() as net.AddressInfo).port,
      },
    });
    try {
      relay.cutOn(/FROM\s+parcels\b/);
      expect((await roundTrip(relay.port)).reply).toBe("ping");
      const hit = await new Promise<string>((r) => {
        const c = net.connect(relay.port, "127.0.0.1", () =>
          c.write("SELECT 1 FROM parcels"),
        );
        let reply = "";
        c.on("data", (d) => (reply += d.toString()));
        c.on("error", () => undefined);
        c.on("close", () => r(reply));
      });
      expect(hit).toBe("");
      expect((await roundTrip(relay.port)).reply).toBe("");
      relay.setMode("pass");
      expect((await roundTrip(relay.port)).reply).toBe("ping");
    } finally {
      await relay.close();
      s.close();
    }
  });
  it("keeps the reply order on one connection across a switch from slow to pass, even when the slow reply is overdue", async () => {
    // Driven by the relay's own events, not wall-clock gaps: reply "a" arrives in slow mode (delayed 100 ms); from that event the mode
    // switches to pass and "b" is sent. When reply "b" arrives, the handler blocks the event loop past a's due time, so a's timer has
    // not run yet: the worst case under load (a's delay over, its write still pending). "b" must still be written after "a".
    const s = await echo();
    let client: net.Socket | null = null;
    const block = (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        // a busy wait: the event loop cannot run a's timer meanwhile
      }
    };
    const relay = await startRelay({
      listenPort: 0,
      target: {
        host: "127.0.0.1",
        port: (s.address() as net.AddressInfo).port,
      },
      delayMs: 100,
      onReply: (chunk) => {
        if (chunk.toString() === "a")
          setImmediate(() => {
            relay.setMode("pass");
            client?.write("b");
          });
        else block(300);
      },
    });
    try {
      relay.setMode("slow");
      const got = await new Promise<string>((r) => {
        const c = net.connect(relay.port, "127.0.0.1", () => c.write("a"));
        client = c;
        let reply = "";
        c.on("data", (d) => {
          reply += d.toString();
          if (reply.length >= 2) c.end();
        });
        c.on("error", () => undefined);
        c.on("close", () => r(reply));
      });
      expect(got).toBe("ab");
    } finally {
      await relay.close();
      s.close();
    }
  });
});

describe("the drill runner (D-1 a)", () => {
  const TEST = {
    MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:55322/postgres",
    MCTEST_SUPABASE_URL: "http://127.0.0.1:55321",
    MCTEST_SUPABASE_ANON_KEY: "test-stack-key",
    MCTEST_PASSWORD: "p",
  };
  const run = (env: Record<string, string>, args: string[] = []) =>
    spawnSync(
      "node",
      [path.join(ROOT, "tests/load/drills.mjs"), "--plan", ...args],
      {
        env: {
          PATH: String(process.env.PATH),
          ...env,
        } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 20_000,
      },
    );
  it.each([
    [
      "the dev DB 54322",
      {
        ...TEST,
        MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:54322/postgres",
      },
      [],
    ],
    [
      "the dev sign-in 54321",
      { ...TEST, MCTEST_SUPABASE_URL: "http://127.0.0.1:54321" },
      [],
    ],
    ["no stack at all", {}, []],
    ["an unknown drill", TEST, ["--only=F-NOPE"]],
  ])("refuses %s", (_n, env, args) => {
    const r = run(env as Record<string, string>, args as string[]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/refused: /);
  });
  it("plans the five active drills, labelled LOCAL", () => {
    const r = run(TEST);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      label: "LOCAL",
      drills: [
        "F-DB-SLOW",
        "F-DB-DOWN",
        "F-SESSION-EXPIRED",
        "F-CAP-REACHED",
        "F-RATE-LIMITED",
      ],
    });
  });
  it("gives every active drill row its own seeded persona", () => {
    const cat = readCatalogue();
    for (const d of cat.failure_drills.filter(
      (x: { runner?: string; status: string }) =>
        x.runner === "tests/load/drills.mjs" && x.status === "active",
    )) {
      const p = cat.personas.find((x: { id: string }) => x.id === d.persona);
      expect(p?.status, d.id).toBe("active");
      expect(String(p?.email), d.id).toMatch(
        /^mctest-drill-[a-z]+@mctest\.test$/,
      );
    }
  });
});
