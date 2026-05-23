// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// Pure-function tests for the CKAN Address Points CSV column-drift detector
// folded into scripts/load-address-points.js per WF1 #parcel-address-bridge
// Phase 2b. Analogous to load-parcels.csv-drift.logic.test.ts.
//
// Why this exists: defense-in-depth against the 2026-05-20 CKAN strip pattern.
// If Toronto silently removes one of the 10 required Address Points columns,
// the loader's `(record.X || '').trim()` fallback would null-fill ~525K rows
// without surfacing a signal. assert-schema.js is the FAIL gate; the in-loader
// audit row is the WARN cascade for operators monitoring the FreshnessTimeline.

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_CSV_COLUMNS,
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressNumberAuditRow,
} from '../../scripts/lib/address-points-csv-drift';

describe('REQUIRED_CSV_COLUMNS', () => {
  it('enumerates the 14 columns the loader consumes', () => {
    expect([...REQUIRED_CSV_COLUMNS].sort()).toEqual(
      [
        'ADDRESS_POINT_ID',
        'ADDRESS_NUMBER',
        'LINEAR_NAME_FULL',
        'ADDRESS_FULL',
        'LO_NUM',
        'HI_NUM',
        'MAINT_STAGE',
        'ADDRESS_STATUS',
        'ADDRESS_CLASS_DESC',
        'CLASS_FAMILY_DESC',
        'PLACE_NAME',
        'LATITUDE',
        'LONGITUDE',
        'geometry',
      ].sort(),
    );
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(REQUIRED_CSV_COLUMNS)).toBe(true);
  });
});

describe('detectMissingColumns', () => {
  it('returns [] when every required column is present', () => {
    const present = [...REQUIRED_CSV_COLUMNS, 'EXTRA_COL'];
    expect(detectMissingColumns(present)).toEqual([]);
  });

  it('flags a stripped data-bearing column (CKAN drift)', () => {
    const present = REQUIRED_CSV_COLUMNS.filter((c) => c !== 'ADDRESS_NUMBER');
    expect(detectMissingColumns([...present])).toEqual(['ADDRESS_NUMBER']);
  });

  it('flags multiple stripped columns in canonical order', () => {
    const stripped = REQUIRED_CSV_COLUMNS.filter(
      (c) => c !== 'LINEAR_NAME_FULL' && c !== 'PLACE_NAME',
    );
    expect(detectMissingColumns([...stripped])).toEqual(['LINEAR_NAME_FULL', 'PLACE_NAME']);
  });

  it('flags coordinate-source columns (LATITUDE/LONGITUDE/geometry) — Phase 1 IMPL I1 fold', () => {
    // If Toronto strips LATITUDE/LONGITUDE, the loader cannot compute geom
    // and Phase 2c link-parcel-addresses produces 0 rows silently.
    // assert-schema's EXPECTED_ADDRESS_POINT_COLUMNS catches this at FAIL
    // gate; this drift detector catches it at the loader for WARN cascade.
    const present = REQUIRED_CSV_COLUMNS.filter(
      (c) => c !== 'LATITUDE' && c !== 'LONGITUDE',
    );
    expect(detectMissingColumns([...present])).toEqual(['LATITUDE', 'LONGITUDE']);
  });

  it('treats column names as case-sensitive', () => {
    const wrongCase = ['address_point_id', 'latitude'];
    const missing = detectMissingColumns(wrongCase);
    expect(missing).toContain('ADDRESS_POINT_ID');
    expect(missing).toContain('LATITUDE');
  });
});

describe('buildDriftAuditRow', () => {
  it('returns PASS with value="none" when no columns are missing', () => {
    expect(buildDriftAuditRow([])).toEqual({
      metric: 'address_points_csv_schema_drift',
      value: 'none',
      threshold: 'no missing required columns',
      status: 'PASS',
    });
  });

  it('returns WARN listing missing columns when drift is present', () => {
    expect(buildDriftAuditRow(['ADDRESS_NUMBER', 'LINEAR_NAME_FULL'])).toEqual({
      metric: 'address_points_csv_schema_drift',
      value: 'ADDRESS_NUMBER,LINEAR_NAME_FULL',
      threshold: 'no missing required columns',
      status: 'WARN',
    });
  });

  it('uses WARN not FAIL — drift loses data but does not corrupt the table', () => {
    const row = buildDriftAuditRow(['ADDRESS_NUMBER']);
    expect(row.status).not.toBe('FAIL');
    expect(row.status).toBe('WARN');
  });
});

describe('buildNullAddressNumberAuditRow', () => {
  it('returns INFO with "0.0%" when no rows were attempted', () => {
    expect(buildNullAddressNumberAuditRow(0, 0)).toEqual({
      metric: 'address_points_null_address_number_pct',
      value: '0.0%',
      threshold: '< 10%',
      status: 'INFO',
    });
  });

  it('returns PASS row when null fraction is below 10%', () => {
    expect(buildNullAddressNumberAuditRow(50, 1000)).toEqual({
      metric: 'address_points_null_address_number_pct',
      value: '5.0%',
      threshold: '< 10%',
      status: 'PASS',
    });
  });

  it('returns WARN at exactly 10% (boundary inclusive)', () => {
    expect(buildNullAddressNumberAuditRow(100, 1000).status).toBe('WARN');
    expect(buildNullAddressNumberAuditRow(100, 1000).value).toBe('10.0%');
  });

  it('returns WARN at 100% (CKAN-strip catastrophic null-fill scenario)', () => {
    const row = buildNullAddressNumberAuditRow(1000, 1000);
    expect(row.value).toBe('100.0%');
    expect(row.status).toBe('WARN');
  });

  it('rounds to one decimal place', () => {
    expect(buildNullAddressNumberAuditRow(123, 1000).value).toBe('12.3%');
    expect(buildNullAddressNumberAuditRow(1, 3).value).toBe('33.3%');
  });
});
