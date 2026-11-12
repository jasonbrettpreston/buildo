// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3
//            (dated note 2026-11-12); McTest DECISIONS D-1 (a), D-8 (a); PLAN §4 (one results page), §6 (cards).
//
// MF-79 · the harness canaries, both ways: the test-stack guard refuses the dev stack and accepts a separate local stack; the broken-text
// check catches each broken value and passes clean text; a failure makes one card per fingerprint; WAITS is never a pass or a fail.
import { describe, expect, it } from "vitest";
import {
  brokenText,
  cardName,
  cardText,
  fingerprint,
  readCatalogue,
  result,
  resultsPage,
  testStack,
  waitsResults,
} from "../../../scripts/mctest/lib.cjs";

const TEST = {
  MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:55322/postgres",
  MCTEST_SUPABASE_URL: "http://127.0.0.1:55321",
};

describe("test-stack guard (D-1 a)", () => {
  it("accepts a separate local stack", () => {
    expect(testStack(TEST)).toEqual({ ok: true });
  });
  it.each([
    ["absent", {}, /absent/],
    [
      "the dev DB port 54322",
      {
        ...TEST,
        MCTEST_DATABASE_URL: "postgres://postgres:x@127.0.0.1:54322/postgres",
      },
      /dev stack/,
    ],
    [
      "the dev sign-in port 54321",
      { ...TEST, MCTEST_SUPABASE_URL: "http://localhost:54321" },
      /dev stack/,
    ],
    [
      "a remote host",
      {
        ...TEST,
        MCTEST_DATABASE_URL: "postgres://u:p@db.example.com:5432/postgres",
      },
      /not a local stack/,
    ],
    [
      "an unparsable URL",
      { ...TEST, MCTEST_SUPABASE_URL: "not a url" },
      /not a URL/,
    ],
  ])("refuses %s", (_n, env, why) => {
    const r = testStack(env);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(why);
  });
});

describe("broken text (D-8 a), the catalogue regex", () => {
  const re = readCatalogue().crawler.fail_on.visible_text_regex;
  it.each([
    "Lot size undefined",
    "FSI NaN",
    "Owner: null",
    "[object Object]",
    "Invalid Date",
  ])('catches "%s"', (t) => {
    expect(brokenText(t, re).length).toBe(1);
  });
  it("passes clean text, including words that only contain the broken words", () => {
    expect(
      brokenText("Lot size 255 m² · nullable fields · Nancy St", re),
    ).toEqual([]);
  });
});

describe("results and cards (PLAN §4, §6)", () => {
  const fail = result({
    row: "crawler/C-DEAD-WIRE",
    owner: "MF-32",
    kase: "anonymous /help",
    status: "FAIL",
    detail: "http_500: /help",
  });
  it("one fingerprint per row, case and error class", () => {
    const again = { ...fail, detail: "http_500: /help (second night)" };
    expect(fingerprint(again)).toBe(fingerprint(fail));
    expect(fingerprint({ ...fail, detail: 'broken_text: "NaN"' })).not.toBe(
      fingerprint(fail),
    );
    expect(cardName(again, "2026-11-12")).toBe(cardName(fail, "2026-11-12"));
  });
  it("a card names the owning task, the replay and the dates", () => {
    const t = cardText(fail, {
      sha: "abc1234",
      runDir: "/runs/x",
      firstSeen: "2026-11-12",
      lastSeen: "2026-11-13",
    });
    for (const s of [
      "Owning task: MF-32",
      fingerprint(fail),
      "First seen: 2026-11-12",
      "Last seen: 2026-11-13",
    ])
      expect(t).toContain(s);
  });
  it("refuses a status outside PASS, FAIL, SKIP, WAITS", () => {
    expect(() => result({ ...fail, kase: "x", status: "OK" })).toThrow(
      /bad status/,
    );
  });
  it("every waits row shows as WAITS with its reason, never PASS or FAIL", () => {
    const w = waitsResults(readCatalogue());
    expect(w.length).toBeGreaterThan(0);
    expect(
      w.every(
        (r: { status: string; detail: string }) =>
          r.status === "WAITS" && r.detail.length > 0,
      ),
    ).toBe(true);
  });
  it("the page escapes text and lists failures first", () => {
    const html = resultsPage(
      [result({ ...fail, kase: "a", status: "PASS", detail: "<b>" }), fail],
      { sha: "s", stamp: "t", stackReason: "" },
    );
    expect(html).toContain("&lt;b&gt;");
    expect(html.indexOf('class="FAIL"')).toBeLessThan(
      html.indexOf('class="PASS"'),
    );
  });
});
