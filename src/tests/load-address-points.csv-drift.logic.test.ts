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
  COORDINATE_SOURCE_SENTINEL,
  hasCoordinateSource,
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressNumberAuditRow,
} from '../../scripts/lib/address-points-csv-drift';

describe('REQUIRED_CSV_COLUMNS', () => {
  it('enumerates the 11 non-coordinate columns (coordinates have an OR-contract — see hasCoordinateSource)', () => {
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
      ].sort(),
    );
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(REQUIRED_CSV_COLUMNS)).toBe(true);
  });
});

describe('detectMissingColumns', () => {
  it('returns [] when every required column + a coordinate source is present', () => {
    const present = [...REQUIRED_CSV_COLUMNS, 'geometry', 'EXTRA_COL'];
    expect(detectMissingColumns(present)).toEqual([]);
  });

  it('flags a stripped data-bearing column (CKAN drift)', () => {
    const present = [...REQUIRED_CSV_COLUMNS.filter((c) => c !== 'ADDRESS_NUMBER'), 'geometry'];
    expect(detectMissingColumns(present)).toEqual(['ADDRESS_NUMBER']);
  });

  it('flags multiple stripped columns in canonical order', () => {
    const present = [
      ...REQUIRED_CSV_COLUMNS.filter((c) => c !== 'LINEAR_NAME_FULL' && c !== 'PLACE_NAME'),
      'geometry',
    ];
    expect(detectMissingColumns(present)).toEqual(['LINEAR_NAME_FULL', 'PLACE_NAME']);
  });

  it('coordinate source = geometry OR (LATITUDE AND LONGITUDE); drift fires only when NEITHER (WF3 2026-05-30)', () => {
    // The loader derives geom + lat/lng from the `geometry` GeoJSON column (primary)
    // or from LATITUDE+LONGITUDE (fallback). Stripping LAT/LONG while `geometry` is
    // present is NOT coordinate loss — the live CSV ships exactly that. Only losing
    // BOTH is the real "link-parcel-addresses produces 0 rows" loss mode.
    expect(hasCoordinateSource(new Set([...REQUIRED_CSV_COLUMNS, 'geometry']))).toBe(true);                          // geometry only (live CSV)
    expect(hasCoordinateSource(new Set([...REQUIRED_CSV_COLUMNS, 'LATITUDE', 'LONGITUDE']))).toBe(true);             // lat/long fallback only
    expect(hasCoordinateSource(new Set([...REQUIRED_CSV_COLUMNS, 'geometry', 'LATITUDE', 'LONGITUDE']))).toBe(true); // both
    expect(hasCoordinateSource(new Set(REQUIRED_CSV_COLUMNS))).toBe(false);                                          // neither → loss
    expect(hasCoordinateSource(new Set([...REQUIRED_CSV_COLUMNS, 'LATITUDE']))).toBe(false);                         // partial fallback (LAT only)
    // detectMissingColumns surfaces the loss via the coordinate-source sentinel:
    expect(detectMissingColumns([...REQUIRED_CSV_COLUMNS])).toEqual([COORDINATE_SOURCE_SENTINEL]);
    expect(detectMissingColumns([...REQUIRED_CSV_COLUMNS, 'geometry'])).toEqual([]);
  });

  it('treats column names as case-sensitive', () => {
    const missing = detectMissingColumns(['address_point_id', 'latitude']); // wrong case
    expect(missing).toContain('ADDRESS_POINT_ID');         // 'address_point_id' ≠ required ADDRESS_POINT_ID
    expect(missing).toContain(COORDINATE_SOURCE_SENTINEL); // 'latitude' ≠ LATITUDE → no coordinate source
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
