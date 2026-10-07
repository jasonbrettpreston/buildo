// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate G, nonzero per target); docs/specs/01-pipeline/56_source_massing.md (link_massing outputs)
//
// WF2 link_massing nonzero-close, D1 (plan .cursor/wf2_link_massing_nonzero_close_active_task.md):
// buildLinkMeta exposes the runner's PER-TARGET write counters, so a capture can attribute a
// write to ONE table of link_massing's two (gate G cohort `count_path`).
//   primary_cleared            <- written.e1.rows_changed (writes[0], set_based_scoped clear)
//   links_inserted             <- written.e2.inserted     (writes[1], guarded_upsert)
//   links_updated              <- written.e2.updated      (writes[1], guarded_upsert)
//   links_deleted              <- written.e3.deleted      (writes[2], link_full_retraction)
//   parcels_flagged_lost_link  <- written.e4.updated      (writes[3], parcels lost-link flag)
// Fold F-8: an absent counter is null (unmeasured), never 0 (a measured zero).
// Fold F-9: eN is POSITIONAL (write.targetKey(i)), so T2 locks the descriptor order.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports */
const compute = require(join(process.cwd(), 'scripts/lib/compute/link-massing.js'));
const REAL = require(join(process.cwd(), 'scripts/link-massing.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const FIVE = ['primary_cleared', 'links_inserted', 'links_updated', 'links_deleted', 'parcels_flagged_lost_link'] as const;
const COHORT_SCRIPT = 'scripts/analysis/link-massing-healing-cohort.js';

type Emit = { key: string; type: string; consumers: string[] };
type Terminal = { id: string; records_meta: Record<string, string> };
type Write = { table: string; write_discipline: { class: string } };

function ctxWith(written: Record<string, unknown> | undefined) {
  return {
    descriptor: REAL,
    elapsed_ms: 5,
    gate: { mode: 'full', reason: 'full_rescan' },
    matched: {
      building_footprints_count: 427077,
      parcels_processed: 3,
      parcels_linked: 2,
      centroid_in_parcel: 2,
      nearest: 0,
      no_match: 1,
    },
    written,
  };
}

describe('link_massing records_meta — per-target write counts (gate G attribution)', () => {
  it('T1: buildLinkMeta maps e1..e4 onto the five keys', () => {
    const meta = compute.buildLinkMeta(ctxWith({
      e1: { rows_changed: 2 },
      e2: { inserted: 3, updated: 4, rows_changed: 7 },
      e3: { deleted: 5 },
      e4: { updated: 6 },
    }));
    expect(meta.primary_cleared).toBe(2);
    expect(meta.links_inserted).toBe(3);
    expect(meta.links_updated).toBe(4);
    expect(meta.links_deleted).toBe(5);
    expect(meta.parcels_flagged_lost_link).toBe(6);
    // the pre-conversion byte-shape key is unchanged
    expect(meta.buildings_upserted).toBe(7);
  });

  it('T1b: an absent target or field is null (unmeasured), never 0 (fold F-8)', () => {
    const meta = compute.buildLinkMeta(ctxWith({ e1: {}, e2: { inserted: 0, updated: 0, rows_changed: 0 } }));
    expect(meta.primary_cleared).toBeNull();
    expect(meta.links_inserted).toBe(0);
    expect(meta.links_updated).toBe(0);
    expect(meta.links_deleted).toBeNull();
    expect(meta.parcels_flagged_lost_link).toBeNull();
    const none = compute.buildLinkMeta(ctxWith(undefined));
    for (const k of FIVE) expect(none[k], k).toBeNull();
  });

  it('T2: the five keys are declared in emits[] (int, consumer = the healing cohort script) and in the two enumerating terminals', () => {
    const emits = REAL.emits as Emit[];
    for (const k of FIVE) {
      const e = emits.find((x) => x.key === k);
      expect(e, `emits[] declares ${k}`).toBeDefined();
      expect(e!.type).toBe('int');
      expect(e!.consumers).toEqual([COHORT_SCRIPT]);
    }
    const terminals = REAL.terminals as Terminal[];
    for (const id of ['linked_incremental', 'linked_full_relink']) {
      const t = terminals.find((x) => x.id === id);
      expect(t, id).toBeDefined();
      for (const k of FIVE) expect(t!.records_meta[k], `${id}.${k}`).toBe('int');
    }
  });

  it('T2b: declared <=> emitted — every int-typed emits[] key is a key buildLinkMeta returns', () => {
    const meta = compute.buildLinkMeta(ctxWith({ e1: { rows_changed: 0 }, e2: { inserted: 0, updated: 0, rows_changed: 0 }, e3: { deleted: 0 }, e4: { updated: 0 } }));
    const ints = (REAL.emits as Emit[]).filter((e) => e.type === 'int').map((e) => e.key);
    for (const k of ints) expect(Object.prototype.hasOwnProperty.call(meta, k), `buildLinkMeta returns ${k}`).toBe(true);
    for (const k of FIVE) expect(ints).toContain(k);
  });

  it('T2c: the positional binding e1..e4 is locked to the descriptor write order (fold F-9)', () => {
    const writes = (REAL.outputs as { writes: Write[] }).writes;
    expect(writes.map((w) => [w.table, w.write_discipline.class])).toEqual([
      ['parcel_buildings', 'set_based_scoped'],
      ['parcel_buildings', 'guarded_upsert'],
      ['parcel_buildings', 'link_full_retraction'],
      ['parcels', 'set_based_scoped'],
    ]);
  });
});
