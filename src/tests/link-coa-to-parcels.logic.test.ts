// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9 (link_parcels twin — HISTORICAL)
//             docs/specs/01-pipeline/42_chain_coa.md §6.11.1 (Phase D execution refs)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//             docs/reports/2026-08-30-pilot7-link-parcels-assessment.md §A-1 (JS-fallback retirement)
//
// Pure-helper pin tests for scripts/link-coa-to-parcels.js geometry helpers.
//
// HISTORICAL NOTE (Pilot 7 / Spec 122 commit 7, 2026-08-30): the CoA script's
// pointInPolygon/pointInGeoJSON/haversineDistance were ORIGINALLY a verbatim copy
// of the twin helpers in scripts/link-parcels.js (per R5.2's twin-vs-CoA gap
// audit). link-parcels.js has since been converted to the Spec 122 frozen shape
// and its whole JS/non-PostGIS geometry fallback was RETIRED (A-1 RULED) — Tier 3
// spatial matching there is now PostGIS ST_Contains/KNN, so pointInPolygon et al.
// no longer exist ANYWHERE in link-parcels.js or scripts/lib/compute/link-parcels.js.
// They were retired, not relocated: there is no live twin left to diff against.
//
// scripts/link-coa-to-parcels.js is NOT part of pilot 7's scope and keeps its own
// independent copy (CoA linking still needs pure-JS point-in-polygon containment).
// This test now pins that copy's behavior directly (self-contained golden) rather
// than diffing it against a twin that no longer carries this code.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('link-coa-to-parcels.js — geometry helpers (pinned; twin retired at pilot 7 commit 7)', () => {
  const coaSrc = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/link-coa-to-parcels.js'),
    'utf-8',
  );

  it('pins the pointInPolygon helper shape (verbatim; twin in link-parcels.js retired, not relocated)', () => {
    const match = coaSrc.match(/function pointInPolygon\(pt, ring\)[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    expect(coaSrc).toContain('function pointInPolygon');
  });

  it('preserves the pointInGeoJSON helper (with hole exclusion semantics)', () => {
    expect(coaSrc).toContain('function pointInGeoJSON');
    // Hole-exclusion is a critical correctness invariant — assert the loop pattern survives
    expect(coaSrc).toMatch(/for\s*\(\s*let\s+i\s*=\s*1[\s\S]*?holes?/i);
  });

  it('preserves the haversineDistance helper (R=6371000 metres)', () => {
    expect(coaSrc).toContain('function haversineDistance');
    expect(coaSrc).toMatch(/R\s*=\s*6371000/);
  });

  it('drops Tier 2 spatial-match logic (CoAs have no pre-link lat/lng — R2.v5 fix #14)', () => {
    // The CoA twin must NOT include spatial-match Tier 2 logic. The helpers are kept
    // because the bundled neighbourhood pass uses pointInGeoJSON.
    expect(coaSrc).not.toMatch(/spatial_match_max_distance_m/);
    expect(coaSrc).not.toMatch(/spatial_match_confidence/);
  });
});
