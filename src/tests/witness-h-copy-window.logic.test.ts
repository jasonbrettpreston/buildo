// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-ES
//
// R-ES (McDonald's Airtight V3, operator y 2026-10-19): while a producer is pending at a stage that awaits its
// captures (stageAwaitsCaptures, the R-EF / W4A-R6 predicate: descriptor_only, compute_ported,
// shape_clean_pending_recapture), the legacy shell is still the live writer, so #44 (h) h:undeclared does not
// hold a reader to a pin on that producer's run_at watermark. The edge is OWED, printed as `h:owed:…`, and
// turns into h:undeclared the moment the producer's declared stage stops awaiting captures (the R-EQ swap to
// runner_wired, or ③). One fleet derivation for --all and --staged (buildWitnessFleet). Exact; no allowlist.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

type Fleet = { invalidated: Set<string>; pinReaders: Record<string, string[]>; watermarks: Record<string, string[]>; owedWatermarks: Record<string, string[]> };
type Entry = { descriptor: unknown; stage: string | null; member: boolean };
type WitnessMod = {
  buildWitnessFleet: (entries: Entry[], awaitsCaptures: (stage: string) => boolean) => Fleet;
  undeclaredPinItems: (slug: string, d: unknown, fleet?: Partial<Fleet>) => string[];
  owedPinItems: (slug: string, d: unknown, fleet?: Partial<Fleet>) => string[];
};
type SvMod = { stageAwaitsCaptures: (s?: string) => boolean };

const ROOT = process.cwd();
const loadW = async (): Promise<WitnessMod> =>
  (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/gates/witness.mjs')).href)) as unknown as WitnessMod;
const loadSv = async (): Promise<SvMod> =>
  (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as SvMod;
const enrichParcels = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/enrich-parcels.descriptor.json'), 'utf8')) as unknown;

// The link_coa_to_parcels ② producer shape: coa_applications.parcel_linked_at is its run_at back-fill stamp.
const producer = {
  identity: { name: 'link_coa_to_parcels', archetype: 'LINK' },
  outputs: { writes: [{ table: 'coa_applications', key: ['id'], columns: [{ name: 'parcel_linked_at', source: 'run_at' }] }] },
};
const OWED = 'h:owed:link_coa_to_parcels.coa_applications.parcel_linked_at';
const UNDECLARED = 'h:undeclared:link_coa_to_parcels.coa_applications.parcel_linked_at';

describe('R-ES — #44 (h) copy window: a reader owes, not fails, a pin on a producer still awaiting captures', () => {
  for (const stage of ['descriptor_only', 'compute_ported', 'shape_clean_pending_recapture']) {
    for (const member of [true, false]) {
      it(`producer pending at ${stage} (${member ? 'overlaid, --staged' : 'not overlaid, --all'}): enrich_parcels owes the pin, no h:undeclared`, async () => {
        const w = await loadW();
        const sv = await loadSv();
        const fleet = w.buildWitnessFleet([{ descriptor: producer, stage, member }], sv.stageAwaitsCaptures);
        expect(fleet.watermarks['coa_applications.parcel_linked_at']).toBeUndefined();
        expect(w.undeclaredPinItems('enrich_parcels', enrichParcels, fleet)).toEqual([]);
        expect(w.owedPinItems('enrich_parcels', enrichParcels, fleet)).toEqual([OWED]);
      });
    }
  }

  for (const stage of ['runner_wired', 'shape_clean', null]) {
    for (const member of stage === null ? [true] : [true, false]) {
      it(`RED once the producer leaves the copy window (${stage ?? 'converted'}${member ? '' : ', --all'}): h:undeclared, nothing owed`, async () => {
        const w = await loadW();
        const sv = await loadSv();
        const fleet = w.buildWitnessFleet([{ descriptor: producer, stage, member }], sv.stageAwaitsCaptures);
        expect(w.undeclaredPinItems('enrich_parcels', enrichParcels, fleet)).toEqual([UNDECLARED]);
        expect(w.owedPinItems('enrich_parcels', enrichParcels, fleet)).toEqual([]);
      });
    }
  }

  it('a reader that already pins the producer owes nothing in either window', async () => {
    const w = await loadW();
    const sv = await loadSv();
    const pinned = { ...(enrichParcels as object), staleness: { pins: [{ step: 'link_coa_to_parcels', stamp: 'coa_applications.parcel_linked_at' }] } };
    for (const stage of ['compute_ported', 'runner_wired']) {
      const fleet = w.buildWitnessFleet([{ descriptor: producer, stage, member: true }], sv.stageAwaitsCaptures);
      expect(w.undeclaredPinItems('enrich_parcels', pinned, fleet)).toEqual([]);
      expect(w.owedPinItems('enrich_parcels', pinned, fleet)).toEqual([]);
    }
  });

  it('only members feed #44 (i): invalidated / pinReaders are unchanged by a non-member pending entry', async () => {
    const w = await loadW();
    const sv = await loadSv();
    const reader = { identity: { name: 'r' }, staleness: { pins: [{ step: 'p', stamp: 't.s' }] }, outputs: { writes: [], invalidates: [{ table: 't', column: 'c', by: 'full_rescan' }] } };
    const off = w.buildWitnessFleet([{ descriptor: reader, stage: 'compute_ported', member: false }], sv.stageAwaitsCaptures);
    expect([...off.invalidated]).toEqual([]);
    expect(off.pinReaders).toEqual({});
    const on = w.buildWitnessFleet([{ descriptor: reader, stage: 'compute_ported', member: true }], sv.stageAwaitsCaptures);
    expect([...on.invalidated]).toEqual(['t.c']);
    expect(on.pinReaders).toEqual({ p: ['r'] });
  });
});
