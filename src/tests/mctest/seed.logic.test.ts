// SPEC LINK: docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3.1 (dated note 2026-11-12); McTest DECISIONS D-1 (a), D-3 (a), D-12 (a).
//
// MF-79 · the persona seed canaries, both ways: the seed refuses the dev stack (54322, 54321) and any run without --go before it opens a
// connection; a separate local stack passes the guard; reports_used reads the limit ("=limit", "=limit+3"), never a typed count.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../scripts/mctest/lib.cjs";
import {
  personaEmails,
  usedCount,
} from "../../../scripts/mctest/seed-personas.mjs";

const TEST = {
  MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:55322/postgres",
  MCTEST_SUPABASE_URL: "http://127.0.0.1:55321",
  MCTEST_SUPABASE_ANON_KEY: "k",
  MCTEST_PASSWORD: "p",
};
const run = (env: Record<string, string>, args: string[] = ["--go"]) =>
  spawnSync(
    "node",
    [path.join(ROOT, "scripts/mctest/seed-personas.mjs"), ...args],
    {
      env: {
        PATH: String(process.env.PATH),
        ...env,
      } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 20_000,
    },
  );

describe("persona seed guard (D-1 a)", () => {
  it.each([
    [
      "the dev DB 54322",
      {
        ...TEST,
        MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:54322/postgres",
      },
    ],
    [
      "the dev sign-in 54321",
      { ...TEST, MCTEST_SUPABASE_URL: "http://127.0.0.1:54321" },
    ],
    ["no stack at all", {}],
  ])("refuses %s before any connection", (_n, env) => {
    const r = run(env as Record<string, string>);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/refused: /);
  });
  it("refuses a test-stack run without --go", () => {
    const r = run(TEST, []);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/refused: pass --go/);
  });
});

describe("persona rows to seeded users (D-12 a)", () => {
  it("expands a pool and keeps a single email", () => {
    expect(
      personaEmails({
        email_pattern: "mctest-sweep-{n}@mctest.test",
        count: 3,
      }),
    ).toEqual([
      "mctest-sweep-1@mctest.test",
      "mctest-sweep-2@mctest.test",
      "mctest-sweep-3@mctest.test",
    ]);
    expect(personaEmails({ email: "mctest-paid@mctest.test" })).toEqual([
      "mctest-paid@mctest.test",
    ]);
    expect(personaEmails({ id: "anonymous" })).toEqual([]);
  });
  it("reads reports_used against the limit", () => {
    expect(usedCount(undefined, 20)).toBe(0);
    expect(usedCount(1, 20)).toBe(1);
    expect(usedCount("=limit", 20)).toBe(20);
    expect(usedCount("=limit+3", 20)).toBe(23);
    expect(() => usedCount("lots", 20)).toThrow(/not a number/);
  });
});
