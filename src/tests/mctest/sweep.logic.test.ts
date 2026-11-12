// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40, FE-06; McTest PLAN §2 layer 3 (L3a), DECISIONS D-11 (a);
//            walk-through rulings W-0 (a) and W-1 (a) (2026-11-12).
//
// MF-80 · the lot-sweep canaries, both ways: a planted mismatch (GFA above the zone FSI times the lot; a footprint above the lot) is caught,
// a clean lot passes, a lot with no limit value is not_evaluated (never a pass); the shown fields come from the generated inventory, and
// the W-0 hide moved max_build_fsi to payload-only (a bound on it is a data finding, not a screen failure).
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
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "docs/reference/maxbld-report-field-inventory.json"),
    "utf8",
  ),
);
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

describe("shown fields (the generated inventory)", () => {
  const shown: Set<string> = shownFields(inventory);
  it("reads the screen fields from the inventory, with W-0 and EI-D1 applied", () => {
    expect(shown.has("parcel.areas.lot_size_sqm")).toBe(true);
    // EI-D1 (FE-38, 2026-11-12): the legacy size headlines are withheld, so a bound on them is a payload-only data finding (or not_evaluated).
    expect(shown.has("parcel.areas.opt_aor_gfa_sqm")).toBe(false);
    expect(shown.has("parcel.areas.max_build_fsi")).toBe(false);
  });
  it("flags an empty shown field and passes a full one", () => {
    const full = {
      parcel: {
        areas: Object.fromEntries(
          [...shown]
            .filter((f) => f.startsWith("parcel.areas."))
            .map((f) => [f.split(".")[2], 1]),
        ),
      },
    };
    const areasOnly = new Set(
      [...shown].filter((f) => f.startsWith("parcel.areas.")),
    );
    expect(emptyShown(full, areasOnly)).toEqual([]);
    (full.parcel.areas as Record<string, unknown>).lot_size_sqm = null;
    expect(emptyShown(full, areasOnly)).toEqual(["parcel.areas.lot_size_sqm"]);
  });
});
