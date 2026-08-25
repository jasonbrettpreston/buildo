# QUEUED: Optimal Lot Configuration — Phase 2 (Optimal-Config Engine + By-law Constants)
**Status:** Queued (after Phase 1) · **Workflow:** WF1 · **Domain:** Backend/Pipeline · **Spec 78**
**Open items RESOLVED** — by-law constants pinned from the City's authoritative *Garden Suites – Summary of Rules* (569-2013, Feb 2022) + O.Reg 462/24.

## Goal
`scripts/lib/optimal-config.js` (NEW, pure) — the budget-allocation engine that produces the as-of-right + CoA-upside configs. Pure functions + logic tests; consumed by the Phase-3 enrich pass.

## By-law constants (569-2013, AUTHORITATIVE — route to `_contracts.json`)
**Garden suite:**
- footprint = **min(0.40 × rear_yard_area, 60 m²)**; GFA = footprint × storeys, **< main-house GFA**.
- all-ancillary lot coverage (garden + existing garage/shed) **≤ 20% of lot**.
- height **4.0 m** (separation ≥ 5.0 m) / **6.0 m** (separation ≥ 7.5 m).
- angular planes **45° from 4.0 m** (front/rear/side; NONE where a lot line abuts a street).
- side setback = max(0.6 m, 0.10 × frontage), cap 3.0 m (1.5 m if window/door openings); corner lot = max(1.5 m, main-building side setback).
- rear setback 1.5 m (lots > 45 m deep → max(½ height, 1.5 m)); **through lot → rear = adjacent front-yard setback facing the rear street**.
- **soft landscaping ≥ 50% of rear yard** (frontage > 6.0 m) / **≥ 25%** (≤ 6.0 m), incl. the suite footprint.
- no car parking required; 2 bike spaces.

**Laneway suite:** footprint ≤ **60 m² (8.0 × 10.0 m)**; GFA ≤ main-house above-grade; `abuts_laneway ≥ 3.5 m`; height/separation as above; lane setback 1.5 m, side 1.0 m.

**Garage:** car footprint **18.5 m²** (capacity floor — never 0-car as-of-right, Phase-0 fix); max **60 m²**; counts toward the 20% all-ancillary cap.

⚠️ **Verify current consolidation:** a 2025 garden-suite amendment may relax the 60 m² footprint cap + remove the angular plane (per O.Reg 462/24 simplification). Implement the Feb-2022 rules as the baseline + a `bylaw_version` flag; confirm against `toronto.ca/zoning/.../Chapter800.htm` before ship. Constants are operator-tunable `logic_variables` where the by-law may shift (footprint cap, soft-landscape %, separation), structural otherwise.

## Engine (`optimal-config.js`)
Budget-allocation over the lot's reliable inputs: **coverage** (lot × bylaw_coverage), **FSI/GFA** (lot × bylaw_fsi, NULL-guarded → footprint×stories), **rear-yard depth**, **soft-landscaping floor**, **height**. Per parcel emit:
- **as-of-right config:** main build (footprint = coverage cap, stories = nbhd `permit_nbhd` p50, GFA capped by FSI) + suite-if-fits (garden/laneway by the constants above, evaluated against the **current building** envelope — conservative, §P) + deck/solar/garage.
- **CoA-upside config:** stories = nbhd p90; footprint = coverage cap (CoA = up not out, validated); + suite.
- `opt_binding_constraint` (coverage / fsi / depth / soft_landscaping / **holding** / heritage / ravine / through_lot), `opt_config_confidence`.
- Trade-off resolver: if a max-length main house leaves no suite room, test shorter-main + suite (more total GFA/units?) — pick the value-maximizing combo (§8.2 of impl plan).

## Tests
`src/tests/optimal-config.logic.test.ts` — garden footprint = min(40%×rear, 60); soft-landscape 50/25 by frontage; height by separation; suite-fit vs current building; CoA = stories-not-footprint; binding-constraint selection; NULL-FSI guard; through-lot → no suite; holding → gated.

## DB Impact: NO (Phase 2 is a pure lib + tests; columns land in Phase 3).
