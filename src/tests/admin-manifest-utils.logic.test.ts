// 🔗 SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md (manifest telemetry_tables)
//   + docs/specs/00_engineering_standards.md §4.2 (identifier quoting)
//
// Locks the Step-Output Inspector's manifest-derived allow-list + the quoteIdent fence.

import { describe, expect, it } from 'vitest';
import {
  STEP_TELEMETRY_TABLES,
  getStepTelemetryTable,
  quoteIdent,
  isFilterable,
} from '@/lib/admin/manifest-utils';

describe('manifest-utils — quoteIdent (identifier fence)', () => {
  it('quotes valid identifiers', () => {
    expect(quoteIdent('permit_trades')).toBe('"permit_trades"');
    expect(quoteIdent('trade_id')).toBe('"trade_id"');
    expect(quoteIdent('_x9')).toBe('"_x9"');
  });

  it('throws on anything outside [A-Za-z0-9_] (injection attempts)', () => {
    for (const bad of ['permits; DROP TABLE x', 'a-b', 'a b', '"x"', "x';--", '1abc', '']) {
      expect(() => quoteIdent(bad)).toThrow(/Invalid identifier/);
    }
  });
});

describe('manifest-utils — STEP_TELEMETRY_TABLES allow-list', () => {
  it('maps classify steps to their child output tables', () => {
    expect(STEP_TELEMETRY_TABLES.classify_permits).toBe('permit_trades');
    expect(STEP_TELEMETRY_TABLES.classify_coa_trades).toBe('lead_trades');
  });

  it('OMITS tableless steps (asserts/observers)', () => {
    expect(getStepTelemetryTable('assert_schema')).toBeNull();
    expect(getStepTelemetryTable('assert_global_coverage')).toBeNull();
    expect(getStepTelemetryTable('not_a_real_slug')).toBeNull();
  });

  it('EXCLUDES user-behavioral PII tables (Firebase user_id)', () => {
    const tables = new Set(Object.values(STEP_TELEMETRY_TABLES));
    expect(tables.has('lead_views')).toBe(false);
    expect(tables.has('tracked_projects')).toBe(false);
    expect(tables.has('lead_analytics')).toBe(false);
  });

  // CI TRIPWIRE: the inspectable-table set is frozen. A new step whose telemetry_tables[0]
  // introduces a table not in this list FAILS here — forcing a deliberate PII/scope review
  // before any new table becomes admin-browsable (the compensating control for the denylist).
  it('exposes EXACTLY the reviewed set of inspectable tables', () => {
    const FROZEN_INSPECTABLE_TABLES = [
      'address_points', 'building_footprints', 'coa_applications', 'cost_estimates',
      'data_quality_snapshots', 'engine_health_snapshots', 'entities', 'heritage_properties',
      'lead_parcels', 'lead_trades', 'neighbourhoods', 'parcel_address_points',
      'parcel_buildings', 'parcels', 'permit_inspections', 'permit_parcels', 'permit_trades',
      'permits', 'phase_calibration', 'phase_stay_calibration', 'pipeline_runs', 'ravines',
      'toronto_centreline', 'trade_forecasts', 'wsib_registry', 'zoning_bylaw_areas',
    ];
    const actual = [...new Set(Object.values(STEP_TELEMETRY_TABLES))].sort();
    expect(actual).toEqual(FROZEN_INSPECTABLE_TABLES);
  });
});

describe('manifest-utils — isFilterable', () => {
  it('allows scalar/text-castable columns', () => {
    expect(isFilterable({ name: 'trade_id', dataType: 'integer' })).toBe(true);
    expect(isFilterable({ name: 'description', dataType: 'text' })).toBe(true);
    expect(isFilterable({ name: 'issued_date', dataType: 'timestamp with time zone' })).toBe(true);
  });

  it('rejects geometry / json / array / bytea (unreadable ::text)', () => {
    expect(isFilterable({ name: 'location', dataType: 'USER-DEFINED' })).toBe(false); // PostGIS geometry
    expect(isFilterable({ name: 'overlays', dataType: 'jsonb' })).toBe(false);
    expect(isFilterable({ name: 'scope_tags', dataType: 'ARRAY' })).toBe(false);
  });
});
