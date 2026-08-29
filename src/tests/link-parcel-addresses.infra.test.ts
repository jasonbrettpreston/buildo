// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
//
// ── RE-HOMED at the Spec 122 §5.1 conversion (C1 pilot 5, commit 7, 2026-08-29) ──────
// This file used to grep scripts/link-parcel-addresses.js's SOURCE TEXT for the
// INSERT...SELECT...ST_Within statement, the batch loop, the audit rows, RUN_AT, and
// the manifest wiring. The frozen shape carries none of that: the SQL/checks moved to
// scripts/lib/compute/link-parcel-addresses.js, the phase order moved to
// scripts/lib/step/index.js's runMaterializePhase, and the declarations moved to
// scripts/link-parcel-addresses.descriptor.json. Every guarantee below is RE-HOMED,
// not dropped — asserted against the NEW artifacts, strictly stronger where the
// declared shape now makes a guarantee checkable that a source-text grep could only
// approximate (e.g. the write class, not merely "an ON CONFLICT exists somewhere").
// Same treatment as link-wsib.infra.test.ts / link-massing.infra.test.ts at their own
// conversions.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/link-parcel-addresses.{descriptor.json,js} — the frozen shape (was: WF1 Phase 2c source-text)', () => {
  let computeSrc: string;
  let stepSrc: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let descriptor: any;

  beforeAll(() => {
    computeSrc = fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/compute/link-parcel-addresses.js'), 'utf-8');
    stepSrc = fs.readFileSync(path.resolve(__dirname, '../../scripts/link-parcel-addresses.js'), 'utf-8');
    descriptor = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/link-parcel-addresses.descriptor.json'), 'utf-8'));
  });

  it('the frozen step file declares lock 115 textually and carries no config/query code (was: ADVISORY_LOCK_ID = 115 + withAdvisoryLock)', () => {
    expect(stepSrc).toMatch(/ADVISORY_LOCK_ID\s*=\s*115\b/);
    expect(descriptor.identity.lock).toBe(115);
    expect(stepSrc).not.toMatch(/withAdvisoryLock|pool\.query|client\.query/);
  });

  it('populates parcel_address_points via INSERT ... SELECT ... ST_Within (was: source-text grep on the step)', () => {
    expect(computeSrc).toMatch(/INSERT\s+INTO\s+parcel_address_points/);
    expect(computeSrc).toMatch(/ST_Within\s*\(\s*ap\.geom\s*,\s*pb\.geom\s*\)/);
  });

  it('is idempotent — ON CONFLICT (parcel_id, address_point_id) DO NOTHING, class insert_only_no_retraction', () => {
    expect(computeSrc).toMatch(/ON\s+CONFLICT\s*\(\s*parcel_id\s*,\s*address_point_id\s*\)\s+DO\s+NOTHING/);
    const write = descriptor.outputs.writes[0];
    expect(write.write_discipline.class).toBe('insert_only_no_retraction');
    expect(write.write_discipline.idempotent_rerun).toBe('zero_writes');
  });

  it('NULL-geom safe on both sides (skips parcels and APs with NULL geom)', () => {
    expect(computeSrc).toMatch(/parcels[\s\S]{0,80}geom\s+IS\s+NOT\s+NULL/);
    expect(computeSrc).toMatch(/ap\.geom\s+IS\s+NOT\s+NULL/);
  });

  it('batches via PK-ordered LIMIT (id > $1 ORDER BY id LIMIT $2), batch size from ctx.config (T1), not a literal', () => {
    expect(computeSrc).toMatch(/id\s*>\s*\$1/);
    expect(computeSrc).toMatch(/ORDER\s+BY\s+id/);
    expect(computeSrc).toMatch(/LIMIT\s+\$2/i);
    expect(computeSrc).not.toMatch(/BATCH_SIZE\s*=\s*1000/);
    const t1 = descriptor.config.logic_variables.find((v: { name: string }) => v.name === 'link_parcel_addresses_batch_size');
    expect(t1, 'batch size not declared in config.logic_variables[]').toBeDefined();
    expect(t1.on_invalid).toBe('clamp');
  });

  it('LPA-D2: the batch loop is idempotent, NOT resumable (was: "checkpoints via lastParcelId" — the pre-conversion claim was FALSE)', () => {
    const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/link-parcel-addresses.notes.json'), 'utf-8')) as Record<string, unknown>;
    const allText = JSON.stringify(notes);
    expect(allText).not.toMatch(/re-run picks up where we left off/i);
    expect(allText).toMatch(/idempotent/i);
    expect(descriptor.recovery.resume).toBe('none');
  });

  it('audit_table includes coverage gap metrics + null-geom + errors (declared checks[], was: source-text grep)', () => {
    const ids = new Set((descriptor.checks as Array<{ id: string }>).map((c) => c.id));
    for (const id of [
      'address_points_with_null_geom', 'parcels_with_no_address_pct', 'address_points_with_no_parcel_pct',
      'new_links_written', 'final_link_count', 'errors',
    ]) {
      expect(ids.has(id), `descriptor declares no check "${id}"`).toBe(true);
    }
  });

  it('runMaterializePhase captures RUN_AT once, library-owned — the compute never reads a clock (Spec 47 §14.2, claim #204)', () => {
    expect(computeSrc).not.toMatch(/new Date\(\)/);
    expect(computeSrc).toMatch(/\$3::timestamptz/);
  });

  it('final_link_count is FAIL-severity with a zero-coverage invariant (Phase 2d zero-coverage gate, was: threshold "> 0" source-text)', () => {
    const check = (descriptor.checks as Array<{ id: string; severity: string; kind: string }>).find((c) => c.id === 'final_link_count');
    expect(check, 'no final_link_count check declared').toBeDefined();
    expect(check?.severity).toBe('FAIL');
    expect(check?.kind).toBe('invariant');
  });

  it('parcels_with_no_address_pct WARN threshold defaults to 50% via T2 (was: a bare literal 0.50 on the step)', () => {
    const check = (descriptor.checks as Array<{ id: string; limit_from_config?: string }>).find((c) => c.id === 'parcels_with_no_address_pct');
    expect(check?.limit_from_config).toBe('link_parcel_addresses_no_address_warn_pct');
    const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')) as Record<string, { default: number }>;
    expect(seed.link_parcel_addresses_no_address_warn_pct?.default).toBe(50);
  });

  it('records_total sourced from parcelsWithGeom-equivalent, records_new from new_links_written (§11 Counter Semantic Contract, was: bare identifiers on the step)', () => {
    expect(descriptor.counters.records_total.source).toMatch(/parcels.?with.?geom/i);
    expect(descriptor.counters.records_new.source).toMatch(/new_links_written/);
  });
});

describe('scripts/manifest.json — Phase 2c wiring (unchanged by the conversion)', () => {
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
