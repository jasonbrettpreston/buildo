// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-1 (permit occupancy ingest)
//
// Logic locks for the load-permits.js occupancy-column ingest (Spec 78 Phase 1):
//  - cleanArea(): junk-sentinel / 0 / negative → null; valid → number (the build-norm percentile guard)
//  - mapRecord(): the 7 CKAN occupancy cols mapped to *_sqm; RESIDENTIAL → residential_sqm
//  - CRITICAL_FIELDS now includes RESIDENTIAL (schema-drift abort if Toronto drops the GFA column)
//  - the no-ping-pong CKAN-pagination dedup fence (deduplicateRecords, _ckan_id tiebreaker) is preserved

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lp = require('../../scripts/load-permits.js');

describe('load-permits cleanArea() — occupancy floor-area cleaning', () => {
  it('parses a valid positive area', () => {
    expect(lp.cleanArea('123.5')).toBe(123.5);
    expect(lp.cleanArea(200)).toBe(200);
  });

  it('drops the CKAN junk sentinels (shared with cleanCost)', () => {
    expect(lp.cleanArea('DO NOT UPDATE')).toBeNull();
    expect(lp.cleanArea('DO NOT DELETE THIS RECORD')).toBeNull();
  });

  it('drops zero and negative areas → null (a negative/zero GFA would poison the percentile)', () => {
    expect(lp.cleanArea('0')).toBeNull();
    expect(lp.cleanArea(0)).toBeNull();
    expect(lp.cleanArea('-50')).toBeNull();
  });

  it('drops empty / missing → null', () => {
    expect(lp.cleanArea('')).toBeNull();
    expect(lp.cleanArea(null)).toBeNull();
    expect(lp.cleanArea(undefined)).toBeNull();
  });
});

describe('load-permits mapRecord() — occupancy columns', () => {
  const base = {
    PERMIT_NUM: '20-100', REVISION_NUM: '00', STATUS: 'Issued', PERMIT_TYPE: 'NB',
    STREET_NUM: '41', STREET_NAME: 'DERWYN',
  };

  it('maps all seven CKAN occupancy columns to *_sqm', () => {
    const m = lp.mapRecord({
      ...base,
      RESIDENTIAL: '250', INTERIOR_ALTERATIONS: '40', ASSEMBLY: '10',
      INSTITUTIONAL: '11', MERCANTILE: '12', INDUSTRIAL: '13', BUSINESS_AND_PERSONAL_SERVICES: '14',
    });
    expect(m.residential_sqm).toBe(250);
    expect(m.interior_alterations_sqm).toBe(40);
    expect(m.assembly_sqm).toBe(10);
    expect(m.institutional_sqm).toBe(11);
    expect(m.mercantile_sqm).toBe(12);
    expect(m.industrial_sqm).toBe(13);
    expect(m.business_personal_services_sqm).toBe(14);
  });

  it('absent / junk occupancy values map to null (not 0)', () => {
    const m = lp.mapRecord({ ...base, RESIDENTIAL: '0', INTERIOR_ALTERATIONS: 'DO NOT UPDATE' });
    expect(m.residential_sqm).toBeNull();
    expect(m.interior_alterations_sqm).toBeNull();
    expect(m.assembly_sqm).toBeNull();
  });
});

describe('load-permits schema-drift guard', () => {
  it('RESIDENTIAL is a CRITICAL_FIELD (abort if Toronto drops the GFA column)', () => {
    expect(lp.CRITICAL_FIELDS).toContain('RESIDENTIAL');
    // the long-standing address/key criticals are still present (no regression)
    expect(lp.CRITICAL_FIELDS).toContain('PERMIT_NUM');
    expect(lp.CRITICAL_FIELDS).toContain('STREET_NAME');
  });
});

describe('load-permits no-ping-pong dedup fence (preserved)', () => {
  it('keeps the highest _ckan_id for a duplicate permit_num+revision_num pair', () => {
    const out = lp.deduplicateRecords([
      { permit_num: 'A', revision_num: '00', _ckan_id: 5 },
      { permit_num: 'A', revision_num: '00', _ckan_id: 9 },
      { permit_num: 'B', revision_num: '00', _ckan_id: 1 },
    ]);
    expect(out).toHaveLength(2);
    const a = out.find((r: { permit_num: string }) => r.permit_num === 'A');
    expect(a?._ckan_id).toBe(9);
  });
});

describe('load-permits §3.6 cascade + upsert wiring (source-pinned)', () => {
  const src = readFileSync(resolve(__dirname, '../../scripts/load-permits.js'), 'utf8');

  it('the occupancy columns are in the INSERT column list AND the ON CONFLICT DO UPDATE SET', () => {
    for (const col of [
      'residential_sqm', 'interior_alterations_sqm', 'assembly_sqm', 'institutional_sqm',
      'mercantile_sqm', 'industrial_sqm', 'business_personal_services_sqm',
    ]) {
      expect(src).toContain(`'${col}'`); // cols array
      expect(src).toContain(`${col} = EXCLUDED.${col}`); // DO UPDATE SET
    }
  });

  it('the data_hash IS DISTINCT FROM guard is preserved (the §3.6 change-detection fence)', () => {
    expect(src).toContain('WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash');
  });
});
