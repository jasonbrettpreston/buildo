// 🔗 SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md (v1.0) §2 (DEC-1..5), §3
//
// Pure-logic lock for scripts/enrich-permits.js — the ENRICH_TARGET whitelist guard
// + the per-target SQL builder (JOIN path, deterministic jsonb order, idempotency
// guard). No DB. Live behaviour is covered by db/enrich-permits.db.test.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-permits');

describe('enrich-permits — ENRICH_TARGET whitelist (DEC-2, injection guard)', () => {
  it('accepts only permits|coa, throws on anything else', () => {
    expect(ep.TARGETS).toEqual(['permits', 'coa']);
    expect(() => ep.validateTarget('permits')).not.toThrow();
    expect(() => ep.validateTarget('coa')).not.toThrow();
    expect(() => ep.validateTarget('')).toThrow();
    expect(() => ep.validateTarget(undefined)).toThrow();
    expect(() => ep.validateTarget("permits; DROP TABLE permits")).toThrow();
  });
});

describe('enrich-permits — per-target SQL builder (DEC-1/3/4)', () => {
  it('permits target joins permit_parcels → parcels.id, ranks by lot_size_sqm + pp.confidence', () => {
    const sql = ep.buildEnrichmentSql({ target: 'permits' });
    expect(sql).toMatch(/permit_parcels/);
    expect(sql).toMatch(/par\.id\s*=\s*pp\.parcel_id/);
    expect(sql).toMatch(/lot_size_sqm DESC/);
    expect(sql).toMatch(/pp\.confidence DESC/);
  });

  it('coa target joins lead_parcels on the STORED c.lead_id (DEC-4 — never re-derive)', () => {
    const sql = ep.buildEnrichmentSql({ target: 'coa' });
    expect(sql).toMatch(/lead_parcels/);
    expect(sql).toMatch(/lp\.lead_id\s*=\s*c\.lead_id/);
    expect(sql).toMatch(/lp\.confidence DESC/);
    // MUST NOT re-derive the coa lead_id from application_number.
    expect(sql).not.toMatch(/'coa:'\s*\|\|/);
    expect(sql).not.toMatch(/application_number/);
  });

  it('jsonb aggregation has an explicit ORDER BY (idempotency — WF2 lesson)', () => {
    for (const target of ['permits', 'coa']) {
      const sql = ep.buildEnrichmentSql({ target });
      expect(sql).toMatch(/jsonb_agg\([\s\S]*ORDER BY[\s\S]*area_share DESC/);
    }
  });

  it('UPDATE is idempotency-guarded with IS DISTINCT FROM, excluding zoning_enriched_at', () => {
    for (const target of ['permits', 'coa']) {
      const upd = ep.buildUpdateSql({ target });
      expect(upd).toMatch(/IS DISTINCT FROM/);
      expect(upd).toMatch(/zoning_enriched_at = \$1/);
      // the guard must NOT include zoning_enriched_at (else never idempotent)
      expect(upd).not.toMatch(/zoning_enriched_at IS DISTINCT FROM/);
    }
  });
});

describe('enrich-permits — F-H12 thresholds match _contracts.json (DEC-5)', () => {
  it('coverage FAIL thresholds = the spike-calibrated contract values', () => {
    const contracts = JSON.parse(
      readFileSync(resolve(__dirname, '../../docs/specs/_contracts.json'), 'utf8'),
    );
    expect(ep.PERMITS_COVERAGE_FAIL).toBe(contracts.zoning.permits_zoning_class_coverage_fail);
    expect(ep.COA_COVERAGE_FAIL).toBe(contracts.zoning.coa_zoning_class_coverage_fail);
    expect(ep.PERMITS_COVERAGE_FAIL).toBe(80);
  });
});
