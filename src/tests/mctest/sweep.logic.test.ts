// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40, FE-06; McTest PLAN §2 layer 3 (L3a), DECISIONS D-11 (a);
//            walk-through rulings W-0 (a) and W-1 (a) (2026-11-12).
//
// MF-80 · the lot-sweep canaries, both ways: a planted mismatch (GFA above the zone FSI times the lot; a footprint above the lot) is caught,
// a clean lot passes, a lot with no limit value is not_evaluated (never a pass); the shown fields come from the served report page (dated
// 2026-11-12, MF-48 Stage B, operator "S1 a": the value parts of the lookup's `page`; page null is not_evaluated:no_page; prior text: "from the
// generated inventory", whose S-001 rows are retired), and a bound on the lookup payload is a data finding, not a screen failure.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyShown,
  evalBound,
  readCatalogue,
  ROOT,
  shownFields,
} from "../../../scripts/mctest/lib.cjs";

type Bound = {
  id: string;
  lhs: string;
  rhs: string[];
  tol: number;
  status: string;
};
const bounds: Bound[] = readCatalogue().bounds;
const bound = (id: string): Bound => {
  const b = bounds.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
};
// MF-48 Stage B: the committed v21 mobile page view (MF-57 core output, the props golden of MF-48 Stage A) as a served `page`.
const VIEW = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "src/tests/fixtures/report-page/props/page_v21.mobile.json"),
    "utf8",
  ),
).view;
// A lot shaped like golden A0175 (R d0.6, 255.42 m2): the engine's answer is GFA = 0.6 x lot.
const clean = {
  parcel: {
    areas: {
      lot_size_sqm: 255.42,
      opt_aor_gfa_sqm: 153.25,
      max_buildable_footprint_sqm: 98.77,
      opt_aor_storeys: 2,
      max_build_fsi: 0.6,
    },
  },
  db: { zone_d: 0.6, coverage_frac: null },
};

describe("bounds (W-0 a, W-1 a)", () => {
  it("a clean lot passes every bound it can evaluate", () => {
    for (const id of [
      "B-W0-FSI-ZONE",
      "B-W1-GFA-FSI",
      "B-W1-GFA-STOREYS",
      "B-FOOTPRINT-LOT",
    ])
      expect(evalBound(bound(id), clean).result, id).toBe("pass");
  });
  it("the mock shape (FSI 0.87 under d0.6) fails GFA <= FSI x lot", () => {
    const lot = structuredClone(clean);
    lot.parcel.areas.opt_aor_gfa_sqm = 248;
    lot.parcel.areas.lot_size_sqm = 284;
    expect(evalBound(bound("B-W1-GFA-FSI"), lot).result).toBe("fail");
  });
  it("the live W-0 class (0.99 in the payload on a d0.6 zone) fails the FSI bound", () => {
    const lot = structuredClone(clean);
    lot.parcel.areas.max_build_fsi = 0.99;
    expect(evalBound(bound("B-W0-FSI-ZONE"), lot).result).toBe("fail");
  });
  it("a footprint above the lot fails", () => {
    const lot = structuredClone(clean);
    lot.parcel.areas.max_buildable_footprint_sqm = 300;
    expect(evalBound(bound("B-FOOTPRINT-LOT"), lot).result).toBe("fail");
  });
  it("no zone value or no coverage is not_evaluated, never a pass", () => {
    const lot = structuredClone(clean);
    lot.db.zone_d = null as unknown as number;
    expect(evalBound(bound("B-W1-GFA-FSI"), lot).result).toBe("not_evaluated");
    expect(evalBound(bound("B-FOOTPRINT-COVERAGE"), clean).result).toBe(
      "not_evaluated",
    );
  });
});

// Dated 2026-11-12 (MF-48 Stage B, operator "S1 a"): the two "shown fields (the generated inventory)" tests are replaced. Prior text: the inventory's
// S-001 rows held parcel.areas.lot_size_sqm and not opt_aor_gfa_sqm / max_build_fsi; a null lot_size_sqm was flagged among the areas fields.
describe("shown fields (the served report page)", () => {
  it("reads the value parts of the served page: their declared fields, never a typed list; page null is no shown field (not_evaluated:no_page)", () => {
    const shown = shownFields({ page: VIEW }) as Set<string>;
    expect(shown.has("lot_size_sqm")).toBe(true);
    expect(shown.has("gfa_max_m2")).toBe(true);
    expect([...shown].some((f) => f.startsWith("parcel."))).toBe(false); // the lookup payload is not shown on the screen
    expect(shownFields({ page: null })).toBeNull();
    expect(shownFields({ parcel: {} })).toBeNull();
  });
  it("flags a blank or dead-wire value part and passes the served page (the null dash is honest, not empty)", () => {
    expect(emptyShown({ page: VIEW })).toEqual([]);
    const v = JSON.parse(JSON.stringify(VIEW));
    const parts = v.sections.flatMap((s: { id: string; parts: { kind: string; field?: string; text: string }[] }) => s.parts.filter((p) => p.kind === "value").map((p) => ({ id: s.id, p })));
    parts[0].p.text = "";
    parts[1].p.text = "NaN sq ft";
    parts[2].p.text = "—";
    expect(emptyShown({ page: v })).toEqual([`${parts[0].id}.${parts[0].p.field}`, `${parts[1].id}.${parts[1].p.field}`]);
    expect(emptyShown({ page: null })).toEqual([]);
    // OUTPUT panel folds (code reviewer F1, F2): prose that contains "null" is not a dead wire; a page with no value part shows no field (the
    // sweep records not_evaluated:no_value_parts, never a pass); a part without a string field is not a shown field.
    const prose = JSON.parse(JSON.stringify(VIEW));
    const p0 = prose.sections.flatMap((s: { parts: { kind: string; text: string }[] }) => s.parts).find((p: { kind: string }) => p.kind === "value");
    p0.text = "Not null on this lot";
    expect(emptyShown({ page: prose })).toEqual([]);
    expect([...(shownFields({ page: { sections: [] } }) as Set<string>)]).toEqual([]);
    expect(emptyShown({ page: { sections: [{ id: "a", parts: [{ kind: "value", field: 7, text: "" }] }] } })).toEqual([]);
  });
});
