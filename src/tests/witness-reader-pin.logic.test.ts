// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-ER
//
// R-ER (McDonald's Airtight V3, operator y 2026-10-19): #44 check (i) gains a second arm for a `by:"pin"`
// invalidator. Arm (i), R-DO: a reader pins the declaring step (the link_massing → enrich_parcels form).
// Arm (ii): the row is the declaring step's OWN column (it writes it, same table) and its own
// `staleness.pins[]` names another step whose `stamp` is a column of that same table — the §6.3 watermark
// read from the reader's side (classify_coa_scope: scope_classified_at re-armed by the coa root's
// last_seen_at). Everything else stays `i:unresolved:pin`. Exact zero-tolerance; no allowlist.

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

type Fleet = { invalidated: Set<string>; pinReaders: Record<string, string[]> };
type WitnessMod = { invalidationItems: (slug: string, d: unknown, fleet?: Fleet) => string[] };

const ROOT = process.cwd();
const load = async (): Promise<WitnessMod> =>
  (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/gates/witness.mjs')).href)) as unknown as WitnessMod;

const EMPTY: Fleet = { invalidated: new Set(), pinReaders: {} };

// The classify_coa_scope ② shape (W4A-R4 (a)): its own watermark, re-armed by the coa root's touch stamp.
function readerSide(over: { pins?: Array<{ step: string; stamp: string }>; writes?: unknown[]; column?: string } = {}) {
  return {
    identity: { name: 'classify_coa_scope' },
    staleness: { pins: over.pins ?? [{ step: 'coa', stamp: 'coa_applications.last_seen_at' }] },
    outputs: {
      writes: over.writes ?? [
        { table: 'coa_applications', key: ['id'], columns: [{ name: 'scope_tags', source: 'compute' }, { name: 'scope_classified_at', source: 'run_at' }] },
      ],
      invalidates: [{ table: 'coa_applications', column: over.column ?? 'scope_classified_at', by: 'pin' }],
    },
  };
}

describe('R-ER — #44 (i) arm (ii): a reader-side pin resolves its own by:"pin" row', () => {
  it('GREEN: own column + own pin on another step whose stamp is on the same table → resolved', async () => {
    const { invalidationItems } = await load();
    expect(invalidationItems('classify_coa_scope', readerSide(), EMPTY)).toEqual([]);
  });

  it('RED: no staleness.pins at all → unresolved (arm (i) has no reader either)', async () => {
    const { invalidationItems } = await load();
    expect(invalidationItems('classify_coa_scope', readerSide({ pins: [] }), EMPTY)).toEqual(['i:unresolved:pin:coa_applications.scope_classified_at']);
  });

  it('RED: the pin stamp is on another table → unresolved', async () => {
    const { invalidationItems } = await load();
    const d = readerSide({ pins: [{ step: 'coa', stamp: 'records_meta.coa_load' }] });
    expect(invalidationItems('classify_coa_scope', d, EMPTY)).toEqual(['i:unresolved:pin:coa_applications.scope_classified_at']);
  });

  it('RED: the row names a column the step does not write → unresolved (the producer-side form needs a reader, arm (i))', async () => {
    const { invalidationItems } = await load();
    expect(invalidationItems('classify_coa_scope', readerSide({ column: 'last_seen_at' }), EMPTY)).toEqual(['i:unresolved:pin:coa_applications.last_seen_at']);
  });

  it('RED: a pin on itself is not a producer → unresolved', async () => {
    const { invalidationItems } = await load();
    const d = readerSide({ pins: [{ step: 'classify_coa_scope', stamp: 'coa_applications.scope_classified_at' }] });
    expect(invalidationItems('classify_coa_scope', d, EMPTY)).toEqual(['i:unresolved:pin:coa_applications.scope_classified_at']);
  });

  it('arm (i) is unchanged: a producer-side row with a reader pinning it resolves; without one it does not', async () => {
    const { invalidationItems } = await load();
    const producer = {
      identity: { name: 'link_massing' },
      outputs: { writes: [], invalidates: [{ table: 'parcels', column: 'massing_enriched_at', by: 'pin' }] },
    };
    expect(invalidationItems('link_massing', producer, { invalidated: new Set(), pinReaders: { link_massing: ['enrich_parcels'] } })).toEqual([]);
    expect(invalidationItems('link_massing', producer, EMPTY)).toEqual(['i:unresolved:pin:parcels.massing_enriched_at']);
  });
});
