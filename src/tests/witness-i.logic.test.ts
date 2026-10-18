// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DO
//
// R-DO (operator y 2026-10-17): #44 check (i) — every invalidation resolves (LDG-10 edge class 4;
// Spec 122 §6.4a). Red fixture: the §6.4a centroid gap (compute_centroids fills parcels.centroid_*
// once with no invalidator). Green: the live fleet, where the parcels geometry trigger covers it.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

type Fleet = { invalidated: Set<string>; pinReaders: Record<string, string[]> };
type WitnessMod = { invalidationItems: (slug: string, d: unknown, fleet?: Fleet) => string[] };
type Descriptor = {
  identity: { name: string };
  outputs: { writes?: unknown[]; invalidates?: Array<{ table: string; column: string; by: string }> };
  staleness?: { pins?: Array<{ step: string }> };
};

const ROOT = process.cwd();
const load = async (): Promise<WitnessMod> =>
  (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/gates/witness.mjs')).href)) as unknown as WitnessMod;
const readDescriptor = (rel: string): Descriptor => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Descriptor;

function fleetOf(descriptors: Descriptor[]): Fleet {
  const invalidated = new Set<string>();
  const pinReaders: Record<string, string[]> = {};
  for (const d of descriptors) {
    for (const r of d.outputs.invalidates || []) invalidated.add(`${r.table}.${r.column}`);
    for (const p of d.staleness?.pins || []) (pinReaders[p.step] = pinReaders[p.step] || []).push(d.identity.name);
  }
  return { invalidated, pinReaders };
}

describe('R-DO — #44 check (i): invalidation resolves', () => {
  it('RED: compute_centroids with its trigger invalidators removed is the §6.4a fill-once gap', async () => {
    const { invalidationItems } = await load();
    const d = readDescriptor('scripts/compute-centroids.descriptor.json');
    const gap: Descriptor = { ...d, outputs: { ...d.outputs, invalidates: [] } };
    expect(invalidationItems('compute_centroids', gap, fleetOf([gap]))).toEqual(
      expect.arrayContaining(['i:fill-once:parcels.centroid_lat', 'i:fill-once:parcels.centroid_lng']),
    );
  });

  it('GREEN: the real compute_centroids (trigger arm, guarded) resolves', async () => {
    const { invalidationItems } = await load();
    const d = readDescriptor('scripts/compute-centroids.descriptor.json');
    expect(invalidationItems('compute_centroids', d, fleetOf([d]))).toEqual([]);
  });

  it('a pin invalidator with no reader, and a trigger invalidator with no guard, are unresolved', async () => {
    const { invalidationItems } = await load();
    const d: Descriptor = {
      identity: { name: 'fx' },
      outputs: { writes: [], invalidates: [{ table: 't', column: 'a', by: 'pin' }, { table: 't', column: 'b', by: 'trigger' }] },
    };
    expect(invalidationItems('fx', d, fleetOf([d]))).toEqual(['i:unresolved:pin:t.a', 'i:unresolved:trigger:t.b']);
  });

  it('not evaluated without a fleet (selfTest / legacy callers)', async () => {
    const { invalidationItems } = await load();
    expect(invalidationItems('x', readDescriptor('scripts/compute-centroids.descriptor.json'))).toEqual([]);
  });
});

// R-DI (amended 2026-10-17, operator y): #44 (h) h:undeclared, NARROW — only a non-ASSERT/RECORDER step's
// acquisition read of another step's run_at watermark column with no pin on that writer (R-BJ, R-BL(v)).
describe('R-DI — #44 (h) h:undeclared narrow', () => {
  type HMod = { undeclaredPinItems: (slug: string, d: unknown, fleet?: { watermarks: Record<string, string[]> }) => string[] };
  const loadH = async (): Promise<HMod> =>
    (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/gates/witness.mjs')).href)) as unknown as HMod;
  const fleet = { watermarks: { 'parcels.massing_enriched_at': ['enrich_parcels'], 'parcel_buildings.linked_at': ['link_massing'] } };

  it('RED: enrich_parcels without its link_massing pin reads a cross-step watermark undeclared', async () => {
    const { undeclaredPinItems } = await loadH();
    const d = readDescriptor('scripts/enrich-parcels.descriptor.json') as Descriptor & { staleness?: { pins?: Array<{ step: string }> } };
    const unpinned = { ...d, staleness: { ...(d.staleness || {}), pins: (d.staleness?.pins || []).filter((p) => p.step !== 'link_massing') } };
    expect(undeclaredPinItems('enrich_parcels', unpinned, fleet)).toContain('h:undeclared:link_massing.parcel_buildings.linked_at');
  });

  it('GREEN: the real enrich_parcels (pinned) and link_massing (writes the column itself) are clean', async () => {
    const { undeclaredPinItems } = await loadH();
    expect(undeclaredPinItems('enrich_parcels', readDescriptor('scripts/enrich-parcels.descriptor.json'), fleet)).toEqual([]);
    expect(undeclaredPinItems('link_massing', readDescriptor('scripts/link-massing.descriptor.json'), fleet)).toEqual([]);
  });

  it('an ASSERT coverage read is a measurement read (R-BJ), never h:undeclared', async () => {
    const { undeclaredPinItems } = await loadH();
    const d = { identity: { archetype: 'ASSERT' }, inputs: { reads: { tables: [{ table: 'parcel_buildings', columns: ['linked_at'] }] } }, outputs: { writes: [] } };
    expect(undeclaredPinItems('assert_x', d, fleet)).toEqual([]);
  });
});
