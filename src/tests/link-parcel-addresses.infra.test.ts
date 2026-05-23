// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// SQL-string + structural assertions on link-parcel-addresses.js — the
// WF1 #parcel-address-bridge Phase 2c spatial-join populator. The script
// MUST be:
//   - idempotent (ON CONFLICT DO NOTHING on the composite PK)
//   - batch-bounded (PK-ordered LIMIT N over parcels with non-NULL geom)
//   - resumable (each batch commits independently)
//   - NULL-geom safe (both sides filtered to geom IS NOT NULL)
//   - GIST-index aware (ST_Within both args have GIST indexes from mig 162)
//   - audit-emitting (Spec 48 §3.6 row-derived cascade)
//   - advisory-locked (lock 115 — registered + collision-free)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/link-parcel-addresses.js — WF1 Phase 2c', () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/link-parcel-addresses.js'),
      'utf-8',
    );
  });

  it('runs as a Spec 47 pipeline script with advisory lock', () => {
    expect(src).toMatch(/pipeline\.run\(\s*['"]link-parcel-addresses['"]/);
    expect(src).toMatch(/withAdvisoryLock\(/);
  });

  it('uses advisory lock 115 (the registered ID for the spatial bridge populator)', () => {
    expect(src).toMatch(/ADVISORY_LOCK_ID\s*=\s*115\b/);
  });

  it('populates parcel_address_points via INSERT ... SELECT ... ST_Within', () => {
    expect(src).toMatch(/INSERT\s+INTO\s+parcel_address_points/);
    expect(src).toMatch(/ST_Within\s*\(\s*ap\.geom\s*,\s*pb\.geom\s*\)/);
  });

  it('is idempotent — ON CONFLICT (parcel_id, address_point_id) DO NOTHING', () => {
    expect(src).toMatch(/ON\s+CONFLICT\s*\(\s*parcel_id\s*,\s*address_point_id\s*\)\s+DO\s+NOTHING/);
  });

  it('NULL-geom safe on both sides (skips parcels and APs with NULL geom)', () => {
    expect(src).toMatch(/parcels[\s\S]{0,80}geom\s+IS\s+NOT\s+NULL/);
    expect(src).toMatch(/ap\.geom\s+IS\s+NOT\s+NULL/);
  });

  it('batches via PK-ordered LIMIT (id > $1 ORDER BY id LIMIT $2)', () => {
    expect(src).toMatch(/id\s*>\s*\$1/);
    expect(src).toMatch(/ORDER\s+BY\s+id/);
    expect(src).toMatch(/LIMIT\s+\$2/i);
    expect(src).toMatch(/BATCH_SIZE\s*=\s*1000/);
  });

  it('commits each batch in its own withTransaction (resumable)', () => {
    expect(src).toMatch(/pipeline\.withTransaction/);
  });

  it('terminates naturally when a batch returns 0 parcels (forward-progress guarantee)', () => {
    expect(src).toMatch(/parcelsInBatch\s*===\s*0/);
    expect(src).toMatch(/break;/);
  });

  it('checkpoints via lastParcelId (resume-safe in-memory pointer)', () => {
    expect(src).toMatch(/lastParcelId\s*=\s*-1/);
    expect(src).toMatch(/lastParcelId\s*=\s*maxParcelId/);
  });

  it('emits Spec 48 §3.6 row-derived verdict cascade (no parallel-boolean)', () => {
    expect(src).toMatch(/auditRows\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]FAIL['"]\)/);
    expect(src).toMatch(/auditRows\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]WARN['"]\)/);
    expect(src).not.toMatch(/const\s+hasFails\s*=/);
  });

  it('audit_table includes coverage gap metrics + null-geom + errors', () => {
    expect(src).toMatch(/['"]address_points_with_null_geom['"]/);
    expect(src).toMatch(/['"]parcels_with_no_address_pct['"]/);
    expect(src).toMatch(/['"]address_points_with_no_parcel_pct['"]/);
    expect(src).toMatch(/['"]new_links_written['"]/);
    expect(src).toMatch(/['"]final_link_count['"]/);
    expect(src).toMatch(/metric:\s*['"]errors['"]/);
  });

  it('emitMeta declares reads (parcels.geom + address_points.geom) + writes (parcel_address_points)', () => {
    expect(src).toMatch(/emitMeta\(/);
    expect(src).toMatch(/parcels:\s*\[[^\]]*['"]geom['"]/);
    expect(src).toMatch(/address_points:\s*\[[^\]]*['"]geom['"]/);
    expect(src).toMatch(/parcel_address_points:\s*\[[^\]]*['"]parcel_id['"][^\]]*['"]address_point_id['"]/);
  });

  it('captures RUN_AT once at startup + passes as $3 (Spec 47 §14.2 — no NOW() in batch loop)', () => {
    // 4-reviewer IMPL fold: NOW() inside the batch INSERT splits computed_at
    // across midnight on long runs. RUN_AT pattern is mandatory.
    expect(src).toMatch(/const\s+RUN_AT\s*=\s*await\s+pipeline\.getDbTimestamp\(pool\)/);
    expect(src).toMatch(/\$3::timestamptz/);
    expect(src).not.toMatch(/computed_at.*NOW\(\)/);
    expect(src).not.toMatch(/,\s*NOW\(\)\s*FROM\s+parcel_batch/);
  });

  it('final_link_count has > 0 threshold + FAILs on zero (Phase 2d zero-coverage gate)', () => {
    // Observability IMPL F3 fold: bridge zero-coverage MUST hard-fail so
    // Phase 2d link-parcels doesn't silently unlink every permit.
    expect(src).toMatch(/threshold:\s*['"]>\s*0['"]/);
    expect(src).toMatch(/finalLinks\s*===\s*0\s*\?\s*['"]FAIL['"]/);
  });

  it('parcels_with_no_address_pct WARN threshold is 50% (calibrated to PI-2 avg-1.0-ap estimate)', () => {
    // Independent IMPL I1 fold: 10% would fire on every clean run.
    expect(src).toMatch(/threshold:\s*['"]<\s*50%['"]/);
    expect(src).toMatch(/noAddressFraction\s*>=\s*0\.50/);
  });

  it('records_total = parcelsWithGeom (entity evaluated) per Spec 47 §11.1', () => {
    expect(src).toMatch(/records_total:\s*parcelsWithGeom/);
  });

  it('records_new = totalNewLinks (newly written parcel_address_points rows)', () => {
    expect(src).toMatch(/records_new:\s*totalNewLinks/);
  });

  it('logs progress every 25 batches (operator visibility on multi-minute run)', () => {
    expect(src).toMatch(/parcelBatchesProcessed\s*%\s*25/);
  });
});

describe('scripts/manifest.json — Phase 2c wiring', () => {
  let manifest: { scripts: Record<string, unknown>; chains: Record<string, string[] | undefined> };
  beforeAll(() => {
    manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../scripts/manifest.json'), 'utf-8'),
    );
  });

  it('registers link_parcel_addresses with the correct file path', () => {
    const entry = manifest.scripts.link_parcel_addresses as { file: string };
    expect(entry).toBeDefined();
    expect(entry.file).toBe('scripts/link-parcel-addresses.js');
  });

  it('inserts link_parcel_addresses into the sources chain after parcels + before link_parcels', () => {
    const sources = manifest.chains.sources;
    if (!sources) throw new Error('chains.sources missing from manifest.json');
    const parcelsIdx = sources.indexOf('parcels');
    const bridgeIdx = sources.indexOf('link_parcel_addresses');
    const linkParcelsIdx = sources.indexOf('link_parcels');
    expect(parcelsIdx).toBeGreaterThan(-1);
    expect(bridgeIdx).toBeGreaterThan(-1);
    expect(linkParcelsIdx).toBeGreaterThan(-1);
    expect(bridgeIdx).toBeGreaterThan(parcelsIdx);
    expect(bridgeIdx).toBeLessThan(linkParcelsIdx);
  });
});
