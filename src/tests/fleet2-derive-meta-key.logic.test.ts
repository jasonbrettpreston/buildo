// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (outputs.writes[].key); registry-truth plan Fold 9 D-A (effectiveLedger = deriveMeta); FLEET-2 seat A (deriveMeta key fix)
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS pipeline lib under scripts/ has no ESM/types entry; required the same way step-runner loads it
const stepLib = require(join(process.cwd(), 'scripts/lib/step/index.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- descriptor is a JSON artifact consumed at runtime by the pipeline, not typed source
const RS: unknown = require(join(process.cwd(), 'scripts/refresh-snapshot.descriptor.json'));

const REGISTRY_URL = pathToFileURL(join(process.cwd(), 'scripts/analysis/gates/consumer-registry.mjs')).href;
const CONSUMER_REGISTRY: { ROW_INSERTING_CLASSES: string[] } = await import(REGISTRY_URL);

function d(writes: unknown[]): unknown {
  return {
    identity: { name: 'fx' },
    inputs: { reads: { tables: [], externals: [] } },
    outputs: { writes },
  };
}

type DeriveResult = { writes: Record<string, string[]> };
const derive = (descriptor: unknown): DeriveResult => stepLib.deriveMeta(descriptor) as DeriveResult;

describe('FLEET-2 seat A — deriveMeta writes include an INSERTING target key', () => {
  it('K1 upsert key is a declared write', () => {
    // RED today because deriveMeta unions columns[].name only and drops w.key.
    const meta = derive(d([{ table: 't', key: 'k', columns: [{ name: 'a' }], write_discipline: { class: 'guarded_upsert' } }]));
    expect(meta.writes.t).toEqual(['a', 'k']);
  });

  it('K2 composite key, snapshot_append', () => {
    // RED today: key columns are ignored, so writes.t is ['a'] — and 'a' must not appear twice.
    const meta = derive(d([
      { table: 't', key: ['k1', 'a', 'k2'], columns: [{ name: 'a' }], write_discipline: { class: 'snapshot_append' } },
    ]));
    expect(meta.writes.t).toEqual(['a', 'k1', 'k2']);
  });

  it('K3 a non-inserting target never declares its key (GREEN control)', () => {
    // GREEN today (and must stay GREEN): an UPDATE matched ON its key does not WRITE the key.
    const meta = derive(d([
      {
        table: 'permits',
        key: ['permit_num', 'revision_num'],
        columns: [{ name: 'neighbourhood_id' }],
        write_discipline: { class: 'set_based_join_update' },
      },
    ]));
    expect(meta.writes.permits).toEqual(['neighbourhood_id']);
  });

  it("K4 key 'none' / absent (GREEN control)", () => {
    // GREEN today and after the fix: no key column, no fabricated write.
    const noneKey = derive(d([{ table: 't', key: 'none', columns: [{ name: 'a' }], write_discipline: { class: 'guarded_upsert' } }]));
    expect(noneKey.writes.t).toEqual(['a']);
    const absentKey = derive(d([{ table: 't', columns: [{ name: 'a' }], write_discipline: { class: 'guarded_upsert' } }]));
    expect(absentKey.writes.t).toEqual(['a']);
  });

  it('K5 union across two targets on one table', () => {
    // RED today: only ['a', 'b'] is declared; the inserting target's key 'k' is dropped.
    const meta = derive(d([
      { table: 't', key: 'k', columns: [{ name: 'a' }], write_discipline: { class: 'set_based_scoped' } },
      { table: 't', key: 'k', columns: [{ name: 'b' }], write_discipline: { class: 'guarded_upsert' } },
    ]));
    expect(meta.writes.t).toEqual(['a', 'b', 'k']);
  });

  it('K6 the real case', () => {
    // RED today because the drift is real: refresh_snapshot INSERTS (ON CONFLICT (snapshot_date)) yet
    // data_quality_snapshots reads as unproduced — its own key is missing from PIPELINE_META.
    expect(derive(RS).writes.data_quality_snapshots).toContain('snapshot_date');
  });

  it('K7 one partition (parity lock)', () => {
    // RED today because the export does not exist yet; the two partitions must stay identical.
    const classes = stepLib.ROW_INSERTING_CLASSES as string[];
    expect(Object.isFrozen(classes)).toBe(true);
    expect([...classes]).toEqual([...CONSUMER_REGISTRY.ROW_INSERTING_CLASSES]);
  });
});
