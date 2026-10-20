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
//
// WF3 2026-10-10: LP-D9 port (street-type constraint) pinned below.
// RE-HOMED (Night P4 R-EQ shell swap, 2f0d4446, 2026-10-20): the shipped script is now the frozen pipeline.step()
// shell (Spec 122 §5.1); these legacy pins read the verbatim legacy text kept as the red suite's oracle
// (src/tests/steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt). The converted behaviour is pinned by src/tests/steps/link_coa_to_parcels/violations.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('link-coa-to-parcels.js — geometry helpers (pinned; twin retired at pilot 7 commit 7)', () => {
  const coaSrc = fs.readFileSync(
    path.resolve(__dirname, './steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt'),
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

describe("Spec 54 level 0 — tier 1a judged on the address point's street type (WF2 2026-10-10)", () => {
  const coaSrc = fs.readFileSync(
    path.resolve(__dirname, './steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt'),
    'utf-8',
  );
  // WF2 brief L (2026-10-10): the tier-1a bridge SQL text moved out of the script into
  // scripts/lib/coa-link-sql.js (tier1aBridgeSql). SQL-fragment assertions read THAT
  // module; everything about the call site (the require, the 3-element params) still
  // reads the script. Assertion meanings are unchanged.
  const sqlSrc = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/lib/coa-link-sql.js'),
    'utf-8',
  );

  it('requires parseLinearName from ./lib/address-normalizers', () => {
    expect(coaSrc).toMatch(
      /require\(\s*['"]\.\/lib\/address-normalizers['"]\s*\)/,
    );
  });

  it("requires tier1aBridgeSql from ./lib/coa-link-sql (the extracted bridge SQL module)", () => {
    expect(coaSrc).toMatch(
      /require\(\s*['"]\.\/lib\/coa-link-sql['"]\s*\)/,
    );
  });

  it('applies the address-point-first COALESCE type predicate in all 4 sites (predicate ×2, ORDER BY, SELECT type_confirmed) with the legacy fragment intact', () => {
    const coalesceFragment = 'COALESCE(ap.street_type_normalized, p.street_type_normalized)';
    expect(sqlSrc.split(coalesceFragment).length - 1).toBe(4);
    // The legacy parcels-table query (still in the script) keeps its own fragment exactly once.
    const legacyFragment = 'street_type_normalized IS NULL OR street_type_normalized = $3';
    expect(coaSrc.split(legacyFragment).length - 1).toBe(1);
  });

  it('both emitMeta read lists declare the type sources', () => {
    expect(coaSrc.split("'street_name', ").length - 1).toBe(2);
    expect(coaSrc.split("'linear_name_normalized', 'street_type_normalized'").length - 1).toBe(2);
  });

  it('passes a 3rd SQL parameter ($3 = street type) in both tier-1a client.query calls', () => {
    // Locate each tier-1a query by the matchTier assignment that follows it,
    // then walk back to the nearest client.query( ... ) argument list.
    const tierMarkers = ["matchTier = 'address_points_exact'", "matchTier = 'tier_1a_exact'"];
    for (const marker of tierMarkers) {
      const markerIdx = coaSrc.indexOf(marker);
      expect(markerIdx, `marker not found: ${marker}`).toBeGreaterThan(-1);

      // Nearest preceding tier-1a client.query( call.
      const queryIdx = coaSrc.lastIndexOf('client.query(', markerIdx);
      expect(queryIdx, `no client.query( before ${marker}`).toBeGreaterThan(-1);

      // Extract the argument list of that call (balanced-paren walk).
      const openIdx = coaSrc.indexOf('(', queryIdx);
      let depth = 0;
      let closeIdx = -1;
      for (let i = openIdx; i < coaSrc.length; i++) {
        const ch = coaSrc[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            closeIdx = i;
            break;
          }
        }
      }
      expect(closeIdx, `unterminated client.query( before ${marker}`).toBeGreaterThan(-1);

      const args = coaSrc.slice(openIdx + 1, closeIdx);

      // The params array is the LAST [ ... ] literal in the argument list.
      const paramsOpen = args.lastIndexOf('[');
      const paramsClose = args.lastIndexOf(']');
      expect(paramsOpen).toBeGreaterThan(-1);
      expect(paramsClose).toBeGreaterThan(paramsOpen);

      const paramsSrc = args.slice(paramsOpen + 1, paramsClose);
      // Count top-level comma-separated elements (params are flat trim() calls here).
      const elements = paramsSrc
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      expect(elements, `params for ${marker}: [${elements.join(' | ')}]`).toHaveLength(3);
    }
    // WF2 brief L (2026-10-10): the bridge call's SQL text is now tier1aBridgeSql(hasPostGIS)
    // (the SQL fragments are asserted against scripts/lib/coa-link-sql.js above).
    expect(coaSrc).toContain('tier1aBridgeSql(hasPostGIS)');
  });

  it('pins the parseLinearName contract the fix relies on', () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { parseLinearName } = require('../../scripts/lib/address-normalizers');
    expect(parseLinearName('BIRCH AVE').street_type).toBe('AVE');
    expect(parseLinearName('BIRCH CRES').street_type).toBe('CRES');
    expect(parseLinearName('DUNDAS ST W').street_type).toBe('ST');
    expect(parseLinearName('THE KINGSWAY').street_type).toBe('');
  });

  it('the batch query selects ca.street_name (the type source) — brief B shipped without it', () => {
    const fromIdx = coaSrc.indexOf('FROM coa_applications ca');
    expect(fromIdx).toBeGreaterThan(-1);
    const selectIdx = coaSrc.lastIndexOf('SELECT ca.id', fromIdx);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(fromIdx);
    const querySrc = coaSrc.slice(selectIdx, fromIdx);
    expect(querySrc).toContain('ca.street_name,');
  });

  it('coaStreetType is parsed from coa.street_name, never the normalized name', () => {
    expect(coaSrc).toMatch(/parseLinearName\(\s*coa\.street_name\s*\|\|/);
    expect(coaSrc).not.toMatch(/parseLinearName\(\s*coa\.street_name_normalized/);
  });

  // WF2 brief J (2026-10-10): the old `tier_1a_type_constrained` counter incremented
  // for every typed CoA row BEFORE any lookup, so it measured typed lookups, not what
  // the type did. It is replaced by two per-MATCH counters so a silent relax (type
  // unknown → tolerant) is visible. Each name now appears exactly 3 times: the audit
  // row + the records_meta key + the `Linking complete` log key.
  it('records tier_1a_type_confirmed and tier_1a_type_tolerant (3 occurrences each) and no longer the pre-lookup counter', () => {
    expect(coaSrc.split('tier_1a_type_confirmed').length - 1).toBe(3);
    expect(coaSrc.split('tier_1a_type_tolerant').length - 1).toBe(3);
    expect(coaSrc).not.toContain('tier_1a_type_constrained');
    expect(coaSrc).not.toContain('tier1aTypeConstrained');
  });

  it('the bridge query selects type_confirmed', () => {
    expect(sqlSrc).toContain('AS type_confirmed');
  });

  it('tier1aBridgeSql keeps the active-address-point fence (retired_at IS NULL) on both PostGIS and JS-fallback paths', () => {
    // Regression Guardian 2026-10-12: the SQL moved to coa-link-sql.js;
    // the fold-10 retired_at fence (3965900e) must survive the move.
    /* eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS SQL module */
    const { tier1aBridgeSql } = require('../../scripts/lib/coa-link-sql') as {
      tier1aBridgeSql: (hasPostGIS: boolean) => string;
    };
    const postgis = tier1aBridgeSql(true);
    const jsFallback = tier1aBridgeSql(false);
    // The fence is on the address_points side: `ap.retired_at IS NULL`.
    expect(postgis).toContain('ap.retired_at IS NULL');
    expect(jsFallback).toContain('ap.retired_at IS NULL');
    expect(postgis).toMatch(/AND\s+ap\.retired_at\s+IS\s+NULL/);
    expect(jsFallback).toMatch(/AND\s+ap\.retired_at\s+IS\s+NULL/);
  });
});
