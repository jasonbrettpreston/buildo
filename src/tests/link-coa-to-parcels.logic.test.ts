// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9 (link_parcels twin)
//             docs/specs/01-pipeline/42_chain_coa.md §6.11.1 (Phase D execution refs)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//
// Pure-helper parity tests for scripts/link-coa-to-parcels.js geometry helpers.
// The CoA twin reuses haversineDistance + pointInPolygon + pointInGeoJSON from
// link-parcels.js (verbatim per R5.2 plan's twin-vs-CoA gap audit). This test
// pins those helpers' behavior so any future drift surfaces here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('link-coa-to-parcels.js — geometry helpers parity with link-parcels.js twin', () => {
  const twinSrc = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/link-parcels.js'),
    'utf-8',
  );
  const coaSrc = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/link-coa-to-parcels.js'),
    'utf-8',
  );

  it('preserves the pointInPolygon helper from the twin (verbatim)', () => {
    // Extract the function from the twin, assert it appears identically in the CoA twin.
    const twinMatch = twinSrc.match(/function pointInPolygon\(pt, ring\)[\s\S]*?\n\}/);
    expect(twinMatch).not.toBeNull();
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
