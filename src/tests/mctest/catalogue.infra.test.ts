// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40 (the lock),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b item 10 (dated note 2026-11-12, McTest), McTest DECISIONS D-7 (a).
//
// MF-78 · the McTest catalogue lock. The real tests/e2e/scenarios.json is well formed, and each rule fails on a planted fault (both ways).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ROOT,
  catalogueProblems,
  queueIds,
  readCatalogue,
} from "../../../scripts/mctest/lib.cjs";

type Row = Record<string, unknown>;
type Cat = {
  statuses: string[];
  personas: Row[];
  journeys: { id: string; steps: Row[] }[];
  lot_cases: Row[];
  [k: string]: unknown;
};

const ownerIds: Set<string> = queueIds();
const fileExists = (p: string) => fs.existsSync(path.join(ROOT, p));
const check = (cat: Cat): string[] =>
  catalogueProblems(cat, { ownerIds, fileExists });
const fresh = (): Cat => readCatalogue();
const at = <T>(a: T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`no row ${i}`);
  return v;
};

describe("McTest catalogue (FE-40)", () => {
  it("the real catalogue is well formed", () => {
    expect(check(fresh())).toEqual([]);
  });

  it("every journey step names its owning task and a status", () => {
    for (const j of fresh().journeys)
      for (const s of j.steps) {
        expect(ownerIds.has(s.owner as string), `${j.id}/${s.step}`).toBe(true);
        expect(["active", "waits"]).toContain(s.status);
      }
  });

  const plants: [string, (c: Cat) => void, RegExp][] = [
    [
      "an unknown status",
      (c) => {
        at(c.lot_cases, 0).status = "pass";
      },
      /status "pass"/,
    ],
    [
      "an owner that is not a queue task",
      (c) => {
        at(at(c.journeys, 0).steps, 0).owner = "MF-9999";
      },
      /owner "MF-9999"/,
    ],
    [
      "a step with no owner",
      (c) => {
        delete at(at(c.journeys, 1).steps, 0).owner;
      },
      /owner undefined/,
    ],
    [
      "a waits row with no reason",
      (c) => {
        delete at(c.lot_cases, 0).waits_on;
      },
      /waits without waits_on/,
    ],
    [
      "an active row with no runner",
      (c) => {
        at(c.lot_cases, 0).status = "active";
      },
      /active without an existing runner/,
    ],
    [
      "an active row whose runner is missing",
      (c) => {
        Object.assign(at(c.lot_cases, 0), {
          status: "active",
          runner: "tests/e2e/missing.spec.ts",
        });
      },
      /missing\.spec\.ts/,
    ],
    [
      "a duplicate id",
      (c) => {
        at(c.lot_cases, 1).id = at(c.lot_cases, 0).id;
      },
      /duplicate id/,
    ],
    [
      "a real-looking email",
      (c) => {
        at(c.personas, 1).email = "someone@gmail.com";
      },
      /not a \.test address/,
    ],
  ];
  for (const [name, plant, msg] of plants) {
    it(`fails on ${name}`, () => {
      const c = fresh();
      plant(c);
      const problems = check(c);
      expect(
        problems.some((p) => msg.test(p)),
        problems.join("\n"),
      ).toBe(true);
    });
  }
});
