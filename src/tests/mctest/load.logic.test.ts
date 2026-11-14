// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 4; DECISIONS D-1 (a), D-2 (a),
//            D-6 (load a), D-12 (a).
//
// MF-81 · the stress canaries, both ways: 429 and 403 REPORT_LIMIT_REACHED are their own classes and never errors; the runner only
// targets a loopback app (never production or Vercel); the app it starts gets only the test stack (inherited DB, Upstash and secret
// variables blanked); a user never passes its allowance of lots; the runner refuses the dev stack before any connection.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHistogram } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  appEnv,
  errorRate,
  loadTarget,
  pickKind,
  readCatalogue,
  ROOT,
  statusClass,
  stressVerdict,
  summarize,
  userLots,
} from "../../../scripts/mctest/lib.cjs";

const TEST = {
  MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:55322/postgres",
  MCTEST_SUPABASE_URL: "http://127.0.0.1:55321",
  MCTEST_SUPABASE_ANON_KEY: "test-stack-key",
  MCTEST_PASSWORD: "p",
};

describe("status classes (PLAN Layer 4)", () => {
  it("keeps 429 and 403 REPORT_LIMIT_REACHED apart from errors", () => {
    expect(statusClass(200)).toBe("2xx");
    expect(statusClass(429)).toBe("429");
    expect(statusClass(403, "REPORT_LIMIT_REACHED")).toBe(
      "403_REPORT_LIMIT_REACHED",
    );
    expect(statusClass(403, "SUBSCRIPTION_REQUIRED")).toBe("403_other");
    expect(statusClass(401)).toBe("401");
    expect(statusClass(400)).toBe("4xx_other");
    expect(statusClass(503)).toBe("5xx");
    expect(statusClass(0)).toBe("network");
  });
  it("counts neither 429 nor 403 REPORT_LIMIT_REACHED as an error", () => {
    expect(
      errorRate({ "2xx": 6, "429": 2, "403_REPORT_LIMIT_REACHED": 2 }),
    ).toBe(0);
    expect(errorRate({ "2xx": 6, "5xx": 2, network: 1, "401": 1 })).toBe(0.4);
    expect(errorRate({})).toBe(0);
  });
});

describe("the load target (D-2 a: never production or Vercel)", () => {
  it("accepts the local app", () => {
    expect(loadTarget("http://127.0.0.1:3110")).toEqual({ ok: true });
  });
  it.each([
    ["production", "https://maxbld.ca"],
    ["a Vercel host", "https://buildo.vercel.app"],
    ["a remote address", "http://10.0.0.5:3000"],
    ["not a URL", "nope"],
  ])("refuses %s", (_n, url) => {
    expect(loadTarget(url).ok).toBe(false);
  });
});

describe("the app's environment (D-1 a)", () => {
  it("points the app at the test stack and blanks inherited DB, Upstash and secret variables", () => {
    const env = appEnv({
      ...TEST,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      POSTGRES_URL: "postgres://elsewhere.example:6543/db",
      SUPABASE_DATABASE_URL: "postgres://elsewhere.example:5432/db",
      SUPABASE_SECRET_KEY: "s",
      UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "t",
      KV_REST_API_URL: "https://kv.example",
      SENTRY_DSN: "https://sentry.example",
      PATH: "/bin",
    });
    expect(env.DATABASE_URL).toBe(TEST.MCTEST_DATABASE_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(TEST.MCTEST_SUPABASE_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      TEST.MCTEST_SUPABASE_ANON_KEY,
    );
    for (const k of [
      "POSTGRES_URL",
      "SUPABASE_DATABASE_URL",
      "SUPABASE_SECRET_KEY",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "KV_REST_API_URL",
      "SENTRY_DSN",
    ])
      expect(env[k]).toBe("");
    expect(env.DEV_MODE).toBe("false");
    expect(env.PATH).toBe("/bin");
    expect(JSON.stringify(env)).not.toMatch(/5432[12]\b/);
  });
  it("refuses without the test stack", () => {
    expect(() => appEnv({})).toThrow(/refused: /);
    expect(() =>
      appEnv({
        ...TEST,
        MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:54322/postgres",
      }),
    ).toThrow(/refused: .*dev stack/);
  });
});

describe("pacing and lots (D-12 a)", () => {
  it("gives each user its own fixed lots and never more than the allowance", () => {
    const lots = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const mine = userLots(lots, 2, 20);
    expect(mine.map((l) => l.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => 40 + i),
    );
    const seen = new Set(
      Array.from({ length: 1000 }, (_, k) => mine[k % mine.length]),
    );
    expect(seen.size).toBe(20);
    expect(userLots(lots.slice(0, 30), 2, 20).length).toBe(20); // wraps when the sample is short
  });
  it("picks a request kind by the catalogue mix", () => {
    const mix = { search_q: 0.6, open_lot: 0.3, entitlement: 0.1 };
    expect(pickKind(0, mix)).toBe("search_q");
    expect(pickKind(0.59, mix)).toBe("search_q");
    expect(pickKind(0.6, mix)).toBe("open_lot");
    expect(pickKind(0.95, mix)).toBe("entitlement");
  });
  it("reads p50, p95 and p99 from the Node histogram in ms", () => {
    const h = createHistogram();
    for (let ms = 1; ms <= 100; ms += 1) h.record(ms * 1000);
    const s = summarize(h);
    expect(s.count).toBe(100);
    expect(Math.round(Number(s.p50_ms))).toBe(50);
    expect(Math.round(Number(s.p95_ms))).toBe(95);
    expect(Math.round(Number(s.p99_ms))).toBe(99);
  });
});

describe("the stress runner refuses before any connection (D-1 a, D-2 a)", () => {
  const run = (env: Record<string, string>, args: string[] = []) =>
    spawnSync(
      "node",
      [path.join(ROOT, "tests/load/stress.mjs"), "--plan", ...args],
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
    ["a production target", TEST, ["--target=https://maxbld.ca"]],
  ])("refuses %s", (_n, env, args) => {
    const r = run(env as Record<string, string>, args as string[]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/refused: /);
  });
  it("plans a test-stack run, labelled LOCAL", () => {
    const r = run(TEST);
    expect(r.status).toBe(0);
    const plan = JSON.parse(r.stdout);
    expect(plan.label).toMatch(/^LOCAL/);
    expect(plan.profiles.map((p: { id: string }) => p.id)).toEqual([
      "S-50",
      "S-200",
      "S-500",
    ]);
    expect(plan.users).toBe(500);
  });
});

// MF-81 / MF81-10 (a): the stress verdict against the ruled LOCAL thresholds (operator 2026-11-13, "thresholds y"; the MF-33 pattern).
// The numbers are catalogue DATA; these tests read them from the catalogue and step either side of each one.
describe("the stress verdict against the catalogue thresholds", () => {
  const cat = readCatalogue();
  const profile = (id: string) =>
    cat.stress_profiles.find((p: { id: string }) => p.id === id);
  const answers = (p95: number, counts: Record<string, number>) => ({
    overall: {
      count: Object.values(counts).reduce((a, b) => a + b, 0),
      p95_ms: p95,
    },
    classes: counts,
    error_rate: errorRate(counts),
  });
  it("carries the ruled thresholds as data, active rows, no waits", () => {
    expect(
      cat.stress_profiles.map(
        (p: { id: string; thresholds: unknown; status: string }) => [
          p.id,
          p.thresholds,
          p.status,
        ],
      ),
    ).toEqual([
      ["S-50", { p95_ms: 250, error_rate: 0.001, max_5xx: 0 }, "active"],
      ["S-200", { p95_ms: 250, error_rate: 0.001, max_5xx: 0 }, "active"],
      ["S-500", { p95_ms: 500, error_rate: 0.001, max_5xx: 0 }, "active"],
    ]);
  });
  it.each(["S-50", "S-200", "S-500"])(
    "%s: p95 below, at and above the threshold",
    (id) => {
      const p = profile(id);
      const t = p.thresholds.p95_ms;
      const ok = { "2xx": 1000 };
      expect(stressVerdict(p, answers(t - 1, ok)).status).toBe("PASS");
      expect(stressVerdict(p, answers(t, ok)).status).toBe("PASS");
      const over = stressVerdict(p, answers(t + 0.5, ok));
      expect(over.status).toBe("FAIL");
      expect(over.detail).toMatch(/p95/);
    },
  );
  it.each(["S-50", "S-200", "S-500"])(
    "%s: error rate below, at and above the threshold",
    (id) => {
      const p = profile(id);
      // 0.1 % of 10 000 answers = 10 errors (a 4xx_other, not a 5xx)
      expect(
        stressVerdict(p, answers(5, { "2xx": 9991, "4xx_other": 9 })).status,
      ).toBe("PASS");
      expect(
        stressVerdict(p, answers(5, { "2xx": 9990, "4xx_other": 10 })).status,
      ).toBe("PASS");
      const over = stressVerdict(
        p,
        answers(5, { "2xx": 9989, "4xx_other": 11 }),
      );
      expect(over.status).toBe("FAIL");
      expect(over.detail).toMatch(/error rate/);
    },
  );
  it("a single 5xx fails even when the error rate is under its threshold", () => {
    const v = stressVerdict(
      profile("S-50"),
      answers(5, { "2xx": 100000, "5xx": 1 }),
    );
    expect(v.status).toBe("FAIL");
    expect(v.detail).toMatch(/5xx/);
  });
  it("429 and 403 REPORT_LIMIT_REACHED are reported as their own classes and never fail the run", () => {
    const v = stressVerdict(
      profile("S-50"),
      answers(5, { "2xx": 100, "429": 50, "403_REPORT_LIMIT_REACHED": 50 }),
    );
    expect(v.status).toBe("PASS");
    expect(v.detail).toMatch(/429 50/);
    expect(v.detail).toMatch(/403 REPORT_LIMIT_REACHED 50/);
  });
  it("no answered request is a FAIL; a profile with no threshold throws (no literal in code)", () => {
    expect(stressVerdict(profile("S-50"), answers(0, {})).status).toBe("FAIL");
    expect(() =>
      stressVerdict(
        { id: "X", thresholds: { p95_ms: null, error_rate: null } },
        answers(1, { "2xx": 1 }),
      ),
    ).toThrow(/threshold/);
  });
  it("S-50 is the only nightly stress profile and the nightly runner runs the nightly ones from the catalogue", () => {
    expect(
      cat.stress_profiles
        .filter((p: { schedule: string }) => p.schedule === "nightly")
        .map((p: { id: string }) => p.id),
    ).toEqual(["S-50"]);
    const src = fs.readFileSync(
      path.join(ROOT, "scripts/mctest/nightly.mjs"),
      "utf8",
    );
    expect(src).toMatch(/tests\/load\/stress\.mjs/);
    expect(src).toMatch(/--schedule=nightly/);
  });
});
