/**
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (§8c, §9, §12)
 * Source-structure (infra) locks for scripts/load-heritage.js + its wiring —
 * pins the Spec 61 §8c decisions (DEC-A/C/D/I/K/M) against silent regressions.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const src = () => readFileSync(join(root, 'scripts', 'load-heritage.js'), 'utf8');

describe('load-heritage.js — advisory lock + slug + version (DEC-A/C/D)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('uses ADVISORY_LOCK_ID = 61 (spec-number convention, NOT spec L4=62)', () => {
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*61\b/);
    expect(content).not.toMatch(/ADVISORY_LOCK_ID\s*=\s*62\b/);
  });
  it('pipeline.run slug + cross-run name are load_heritage / sources:load_heritage (DEC-C, pre-empts #409)', () => {
    expect(content).toMatch(/pipeline\.run\('load-heritage'/);
    expect(content).toMatch(/PIPELINE_NAME\s*=\s*'sources:load_heritage'/);
    // The spec's stale 'source-heritage' must NOT be used as the pipeline slug / cross-run name
    // (it legitimately remains the loadMarketplaceConfigs namespace key, as load-ravines uses 'source-ravines').
    expect(content).not.toMatch(/pipeline\.run\('source-heritage'/);
    expect(content).not.toMatch(/PIPELINE_NAME\s*=\s*'source-heritage'/);
  });
  it('SPEC_VERSION = 1.1 (consumer §8d L23 pins on it; NOT the §3.1 stale 1.0)', () => {
    expect(content).toMatch(/SPEC_VERSION\s*=\s*'1\.1'/);
  });
  it('audit_table phase = ADVISORY_LOCK_ID (61), not a hardcoded 60', () => {
    expect(content).toMatch(/phase:\s*ADVISORY_LOCK_ID/);
    expect(content).not.toMatch(/phase:\s*60\b/);
  });
});

describe('load-heritage.js — frozen records_meta + counters (DEC-D)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('uses features_* counter names (H-v1.1.3), never polygons_*', () => {
    expect(content).toMatch(/features_inserted/);
    expect(content).toMatch(/features_updated/);
    expect(content).toMatch(/features_deleted/);
    expect(content).not.toMatch(/polygons_(inserted|updated|deleted)/);
  });
  it('records_total/new/updated sourced from combined feature/inserted/updated counts', () => {
    expect(content).toMatch(/records_total:\s*featureCountCombined/);
    expect(content).toMatch(/records_new:\s*insertedCombined/);
    expect(content).toMatch(/records_updated:\s*updatedCombined/);
  });
  it('heritage_load has per-dataset sub-blocks with the §9 frozen field names (specSub rename)', () => {
    expect(content).toMatch(/heritage_register:\s*specSub\(reg\.sub,\s*'filtered_out_listed',\s*'unknown_status_count'\)/);
    expect(content).toMatch(/heritage_districts:\s*specSub\(hcd\.sub,\s*'filtered_out_appeal_study',\s*'unknown_hcd_type_count'\)/);
  });
});

describe('load-heritage.js — audit rows (DEC-I: 10 load-side, no enrich-side; unknown_* WARN)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('emits the named LOAD-side rows', () => {
    for (const m of [
      'heritage_register_feature_count', 'heritage_districts_feature_count', 'heritage_filtered_listed_pct',
      'heritage_geometry_skipped_pct', 'heritage_count_drift_pct', 'heritage_mass_delete_pct',
      'heritage_geometry_update_pct', 'heritage_dataset_age_years',
    ]) {
      expect(content).toContain(`'${m}'`);
    }
  });
  it('does NOT emit the enrich-side rows (heritage_points_no_parcel_match / permit_type_heritage_disagreement)', () => {
    expect(content).not.toMatch(/heritage_points_no_parcel_match/);
    expect(content).not.toMatch(/permit_type_heritage_disagreement/);
  });
  it('unknown_status_count + unknown_hcd_type_count are pushed to audit rows as WARN>0 (reach the cascade)', () => {
    expect(content).toMatch(/push\('heritage_unknown_status_count',[\s\S]*?'WARN'\s*:\s*'INFO'\)/);
    expect(content).toMatch(/push\('heritage_unknown_hcd_type_count',[\s\S]*?'WARN'\s*:\s*'INFO'\)/);
  });
  it('heritage_address_coerced_empty_count emitted WARN>0 (DEC-M)', () => {
    expect(content).toMatch(/push\('heritage_address_coerced_empty_count',[\s\S]*?'WARN'\s*:\s*'INFO'\)/);
  });
  it('duplicate-source-id WARN rows emitted per dataset (review fold)', () => {
    expect(content).toMatch(/push\('heritage_register_duplicate_source_id_count',\s*reg\.duplicateCount,\s*'WARN'\)/);
    expect(content).toMatch(/push\('heritage_districts_duplicate_source_id_count',\s*hcd\.duplicateCount,\s*'WARN'\)/);
  });
  it('L14 first-run zero-feature guard returns failed (review fold)', () => {
    expect(content).toMatch(/!priorSub && featureCount === 0/);
    expect(content).toMatch(/zero_features_first_run/);
  });
  it('skip branch re-pins spec_version: SPEC_VERSION after the prior spread (DEC-K / load-ravines BUG-2)', () => {
    expect(content).toMatch(/\.\.\.\(priorSub \|\| \{\}\),\s*spec_version:\s*SPEC_VERSION/);
  });
  it('count-drift + mass-delete FAIL status is threshold-derived (override never suppresses)', () => {
    expect(content).toMatch(/heritage_count_drift_pct',[\s\S]*?heritageAcceptFeatureCountDriftPct[\s\S]*?'FAIL'\s*:\s*'INFO'/);
    expect(content).toMatch(/heritage_mass_delete_pct',[\s\S]*?heritageMassDeletePct[\s\S]*?'FAIL'\s*:\s*'INFO'/);
  });
});

describe('load-heritage.js — geometry + null-safety (DEC-E/M)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('inlines §3.5 validation SQL (not geometry-validator.js)', () => {
    expect(content).toMatch(/POINT_VALIDATION_SQL/);
    expect(content).toMatch(/POLYGON_VALIDATION_SQL/);
    expect(content).not.toMatch(/require\([^)]*geometry-validator/);
  });
  it('HCD polygons cast via ST_Multi + collection-extract', () => {
    expect(content).toMatch(/ST_Multi\(COALESCE\(ST_CollectionExtract/);
  });
  it('emitMeta passes the CKAN external 3rd arg', () => {
    expect(content).toMatch(/emitMeta\([\s\S]*\['CKAN'\]\s*,?\s*\)/);
  });
  it('uses global fetch (Node built-in), not node-fetch', () => {
    expect(content).not.toMatch(/require\(['"]node-fetch['"]\)/);
    expect(content).toMatch(/await fetch\(/);
  });
  it('#426: register source_id keyed on Folder_Row, NOT the dropped OBJECTID', () => {
    expect(content).toMatch(/coerceSourceId\(p\.Folder_Row\)/);
    expect(content).not.toMatch(/coerceSourceId\(p\.OBJECTID\)/);
  });
});

describe('migration 170 + manifest wiring', () => {
  it('migration 170 creates both tables, the function + extension; bylaw_no/designated_date nullable', () => {
    const mig = readFileSync(join(root, 'migrations', '170_create_heritage_tables.sql'), 'utf8');
    expect(mig).toMatch(/CREATE EXTENSION IF NOT EXISTS fuzzystrmatch/);
    expect(mig).toMatch(/CREATE OR REPLACE FUNCTION normalize_address/);
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS heritage_properties/);
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS heritage_districts/);
    // designated_date on heritage_districts is NULLABLE (no NOT NULL) — sentinel maps to NULL
    expect(mig).not.toMatch(/designated_date\s+DATE NOT NULL/);
    // DOWN never drops the shared extension
    expect(mig).not.toMatch(/DROP EXTENSION/);
  });
  it('manifest registers load_heritage in the sources chain after load_ravines', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('../../scripts/manifest.json');
    expect(manifest.scripts.load_heritage.file).toBe('scripts/load-heritage.js');
    const sources = manifest.chains.sources;
    expect(sources).toContain('load_heritage');
    expect(sources.indexOf('load_heritage')).toBe(sources.indexOf('load_ravines') + 1);
  });
});
