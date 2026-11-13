// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layers 4 and 5;
//            docs/specs/00-architecture/13_authentication.md §3.1, §3.2; Spec 100 §3.2 dated note 2026-11-12 (EI-D1 "1 b", the meter).
//
// MF-81 follow-up (2026-11-13), the first real runs: (1) the stress runner writes its result file into the run folder through
// runFiles, no bare variable; (2) the drills and the stress runner draw lots that COUNT (a stored Layer 3 option with an evaluated value),
// by the catalogue's own read-only SQL; (3) a signed-out token is served until it expires (stateless JWT, Spec 13 §3.2), so the
// signed-out drill passes 200 or 401, still fails a tampered token that gets in, a 5xx, or a meter on a refused call.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readCatalogue,
  ROOT,
  sessionVerdict,
} from "../../../scripts/mctest/lib.cjs";
import { lotSql, runFiles } from "../../../tests/load/stack.mjs";

describe("the run folder reaches the stress result writer", () => {
  it("runFiles saves a JSON file inside its own run folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mct-run-"));
    process.env.MCTEST_RUN_DIR = dir;
    try {
      const { saveJson } = runFiles();
      const file = saveJson("stress-x.json", { a: 1 });
      expect(file).toBe(path.join(dir, "stress-x.json"));
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ a: 1 });
    } finally {
      delete process.env.MCTEST_RUN_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("stress.mjs names no bare runDir (the 2026-11-13 ReferenceError)", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "tests/load/stress.mjs"),
      "utf8",
    );
    expect(src).not.toMatch(/\brunDir\b/);
    expect(src).toMatch(/saveJson\(/);
  });
});

describe("counting lots", () => {
  const cat = readCatalogue();
  it("the catalogue declares the counting sample as read-only SQL on stored Layer 3 rows", () => {
    const sql: string = lotSql(cat, true);
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(sql).toMatch(/parcel_maxbld_scenarios/);
    expect(sql).toMatch(/status = 'computed'/);
    expect(sql).toMatch(/\$1/);
    expect(sql).toMatch(/\$2/);
    expect(sql).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i,
    );
    expect(sql).toMatch(/parcel_id/);
    expect(sql).toMatch(/address_full/);
  });
  it("the plain sample is still L-RANDOM's own SQL", () => {
    expect(lotSql(cat, false)).not.toMatch(/parcel_maxbld_scenarios/);
  });
  it("the drills and the stress runner ask for counting lots", () => {
    for (const f of ["tests/load/drills.mjs", "tests/load/stress.mjs"])
      expect(fs.readFileSync(path.join(ROOT, f), "utf8"), f).toMatch(
        /sampleLots\([\s\S]*?true\s*,?\s*\)/,
      );
  });
});

describe("signed-out token (Spec 13 §3.2, dated 2026-11-13)", () => {
  const base = {
    lookupStatus: 200,
    entitlementStatus: 200,
    tamperedStatus: 401,
    metered: false,
  };
  it("passes a token served until it expires, and a refusal", () => {
    expect(sessionVerdict(base).status).toBe("PASS");
    expect(
      sessionVerdict({ ...base, lookupStatus: 401, entitlementStatus: 401 })
        .status,
    ).toBe("PASS");
  });
  it("a call served on a live token may meter; a refused call may not", () => {
    expect(sessionVerdict({ ...base, metered: true }).status).toBe("PASS");
    expect(
      sessionVerdict({
        ...base,
        lookupStatus: 401,
        entitlementStatus: 401,
        metered: true,
      }).status,
    ).toBe("FAIL");
  });
  it("fails a tampered token that gets in, and any 5xx", () => {
    expect(sessionVerdict({ ...base, tamperedStatus: 200 }).status).toBe(
      "FAIL",
    );
    expect(sessionVerdict({ ...base, lookupStatus: 500 }).status).toBe("FAIL");
    expect(sessionVerdict({ ...base, entitlementStatus: 0 }).status).toBe(
      "FAIL",
    );
  });
});
