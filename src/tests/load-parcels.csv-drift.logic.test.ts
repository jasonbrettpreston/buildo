// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// Pure-function tests for the CKAN Parcels CSV column-drift detector
// folded into scripts/load-parcels.js per Spec 79 SUMMARY CRIT-3b.
//
// Why this exists: Spec 79 permits chain Step 1 (2026-05-19) found that
// when CKAN drops a required column from the Parcels CSV, load-parcels.js
// silently null-fills every loaded row via its `(record.X || '').trim()`
// fallback. The audit_table never surfaces the loss — operators see a
// clean PASS while ~600 K parcel rows lose address data.
//
// Fix: extract drift detection + audit-row builders to a pure module
// (scripts/lib/parcels-csv-drift.js) so they can be unit-tested without
// spinning up a real CSV stream or a DB connection. load-parcels.js wires
// them in inline; this test locks the compute contract.

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_CSV_COLUMNS,
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressAuditRow,
} from '../../scripts/lib/parcels-csv-drift';

describe('REQUIRED_CSV_COLUMNS', () => {
  it('enumerates the 4 surviving columns (3 deprecated post WF1 #parcel-address-bridge 2026-05-23)', () => {
    // WF1 #parcel-address-bridge — Toronto Open Data stripped ADDRESS_NUMBER,
    // LINEAR_NAME_FULL, DATE_EFFECTIVE from the Property Boundaries CSV on
    // 2026-05-20. The address bridge (mig 162 + scripts/link-parcel-addresses.js)
    // sources these from the Address Points CSV via spatial intersect.
    // The 3 removed columns remain as LEGACY columns on the parcels table
    // (preserved via COALESCE UPSERT in load-parcels.js per plan v4 fold C2).
    expect([...REQUIRED_CSV_COLUMNS].sort()).toEqual(
      [
        'FEATURE_TYPE',
        'PARCELID',
        'STATEDAREA',
        'geometry',
      ].sort(),
    );
    // Defensive: deprecated columns explicitly NOT in REQUIRED_CSV_COLUMNS
    expect([...REQUIRED_CSV_COLUMNS]).not.toContain('ADDRESS_NUMBER');
    expect([...REQUIRED_CSV_COLUMNS]).not.toContain('LINEAR_NAME_FULL');
    expect([...REQUIRED_CSV_COLUMNS]).not.toContain('DATE_EFFECTIVE');
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(REQUIRED_CSV_COLUMNS)).toBe(true);
  });
});

describe('detectMissingColumns', () => {
  it('returns [] when every required column is present (post WF1 #parcel-address-bridge)', () => {
    const present = [...REQUIRED_CSV_COLUMNS, 'DATE_EXPIRY', 'EXTRA_COL'];
    expect(detectMissingColumns(present)).toEqual([]);
  });

  it('the 2026-05-20 CKAN strip (3 cols removed) no longer triggers drift — those columns are no longer required', () => {
    // WF1 #parcel-address-bridge — post-fix, the stripped CSV (PARCELID,
    // FEATURE_TYPE, STATEDAREA, OBJECTID, geometry) is accepted; the 3
    // dropped columns are sourced from address_points via the bridge.
    const stripped = ['PARCELID', 'FEATURE_TYPE', 'STATEDAREA', 'OBJECTID', 'geometry'];
    expect(detectMissingColumns(stripped)).toEqual([]);
  });

  it('still flags drift when one of the surviving 4 required columns goes missing', () => {
    const drifted = ['PARCELID', 'STATEDAREA', 'geometry']; // missing FEATURE_TYPE
    expect(detectMissingColumns(drifted)).toEqual(['FEATURE_TYPE']);
  });

  it('preserves the canonical column order in the returned array', () => {
    // Deterministic ordering so the audit_table value string is stable
    // across runs (operators grepping logs / dashboards expect a stable shape).
    const drifted = ['PARCELID']; // missing FEATURE_TYPE, STATEDAREA, geometry
    expect(detectMissingColumns(drifted)).toEqual([
      'FEATURE_TYPE',
      'STATEDAREA',
      'geometry',
    ]);
  });

  it('treats column names as case-sensitive (CKAN headers are case-sensitive)', () => {
    // Lowercase / mixed-case must not be silently accepted — that would
    // mask drift by collapsing 'geometry' and 'GEOMETRY' as the same column.
    const wrongCase = ['parcelid', 'feature_type', 'statedarea', 'GEOMETRY'];
    const missing = detectMissingColumns(wrongCase);
    expect(missing).toContain('PARCELID');
    expect(missing).toContain('geometry');
  });
});

describe('buildDriftAuditRow', () => {
  it('returns PASS row with value="none" when no columns are missing', () => {
    expect(buildDriftAuditRow([])).toEqual({
      metric: 'parcels_csv_schema_drift',
      value: 'none',
      threshold: 'no missing required columns',
      status: 'PASS',
    });
  });

  it('returns WARN row listing missing columns when drift is present', () => {
    const row = buildDriftAuditRow(['ADDRESS_NUMBER', 'LINEAR_NAME_FULL', 'DATE_EFFECTIVE']);
    expect(row).toEqual({
      metric: 'parcels_csv_schema_drift',
      value: 'ADDRESS_NUMBER,LINEAR_NAME_FULL,DATE_EFFECTIVE',
      threshold: 'no missing required columns',
      status: 'WARN',
    });
  });

  it('uses WARN not FAIL — drift loses address data but does not corrupt parcels', () => {
    // Spec 79 SUMMARY: assert-schema.js is the FAIL gate; load-parcels.js
    // surfaces the loss without breaking the chain. WARN cascades to the
    // audit_table verdict via the existing rows.some(r => r.status === 'WARN')
    // computation in emitFinal().
    const row = buildDriftAuditRow(['ADDRESS_NUMBER']);
    expect(row.status).not.toBe('FAIL');
    expect(row.status).toBe('WARN');
  });
});

describe('buildNullAddressAuditRow', () => {
  it('returns INFO row with "0.0%" when no rows were attempted', () => {
    expect(buildNullAddressAuditRow(0, 0)).toEqual({
      metric: 'parcels_null_address_pct',
      value: '0.0%',
      threshold: '< 10%',
      status: 'INFO',
    });
  });

  it('returns PASS row when null fraction is below 10%', () => {
    // 50 nulls / 1000 attempted = 5.0% → PASS
    expect(buildNullAddressAuditRow(50, 1000)).toEqual({
      metric: 'parcels_null_address_pct',
      value: '5.0%',
      threshold: '< 10%',
      status: 'PASS',
    });
  });

  it('returns WARN row when null fraction is at or above 10%', () => {
    // 100 nulls / 1000 attempted = 10.0% → WARN (boundary inclusive)
    expect(buildNullAddressAuditRow(100, 1000).status).toBe('WARN');
    expect(buildNullAddressAuditRow(100, 1000).value).toBe('10.0%');
  });

  it('returns WARN row at extreme null rate (matches the CKAN-drop CRIT-3b scenario)', () => {
    // 100 % null is the exact case Spec 79 surfaced — CKAN dropped the column
    // so every loaded row has address_number = NULL.
    const row = buildNullAddressAuditRow(1000, 1000);
    expect(row.value).toBe('100.0%');
    expect(row.status).toBe('WARN');
  });

  it('rounds to one decimal place (stable string shape for dashboards)', () => {
    // 123 / 1000 = 12.3% — exactly one decimal
    expect(buildNullAddressAuditRow(123, 1000).value).toBe('12.3%');
    // 1 / 3 = 33.333...% — rounded to one decimal
    expect(buildNullAddressAuditRow(1, 3).value).toBe('33.3%');
  });
});
