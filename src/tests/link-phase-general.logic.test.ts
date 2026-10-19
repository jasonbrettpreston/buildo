// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EG (runLinkPhase generalised for a second
//            LINK family; wave-4 lane B request 9, operator y 2026-10-18); Spec 122 §8 RE-FREEZE #37
//
// runLinkPhase was written for parcel-keyed links (link_massing). link_coa_to_parcels (coa:-keyed leads) needs four
// things, each opt-in so every existing LINK descriptor runs byte-identical:
//   L1 the four LINK counters named by the compute's match plan (`match.counters`), the way primary_counter /
//      fallback_counter already are (Gate 0 / claim #149: the runner names nothing the step did not declare);
//   L2 compute-built bind arrays for the primary match (`compute.primaryMatchBinds`, a pure export), else `[ids]`;
//   L3 the keyed arm without an E1 clear target (the clear stays required only when the step declares one);
//   L4 the link-change statement (`lost_link_flag_sql`) bound by a closed, ordered list of runner values
//      (`match.lost_link_flag_binds` ⊆ lost_keys, batch_keys, run_at; default [lost_keys]) — the back-fill of
//      changed links; an unknown name is refused before any write.
//   L5 the vanished-lead sweep: the existing `retract: "departed"` vocabulary (class B's departure DELETE) on a LINK
//      upsert target = ONE statement after the loop, `DELETE … WHERE (<declared scope>) AND <key0> <> ALL(<every
//      leading key derived this run>)`, before-imaged; so it can never touch a row this run re-derived, which is why
//      it is legal under full_rescan where `retract: "all"` stays refused. Unscoped is refused; an empty derived set,
//      a dry run, or a non-full mode issues nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };
const RUN_AT = new Date('2026-10-18T00:00:00Z');
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function fakePool(answer: (text: string, n: number) => { rows: unknown[]; rowCount?: number } | undefined) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const counts = new Map<string, number>();
  const query = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    const n = (counts.get(text) || 0) + 1;
    counts.set(text, n);
    const custom = answer(text, n);
    if (custom !== undefined) return custom;
    if (/pg_extension|information_schema\.columns|pg_indexes|pg_constraint|pg_proc/i.test(text)) return { rows: [{ x: 1 }] };
    if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
    if (/^\s*INSERT INTO/i.test(text)) return { rows: [{ inserted: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { sql, params, query, connect: async () => ({ query, release: () => {} }) };
}

/** link_massing's real descriptor, with probes neutralised; `keyed` keeps its O4 row 5 keyed targets. */
function linkDescriptor() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
  const d = clone(require(join(process.cwd(), 'scripts/link-massing.descriptor.json')));
  d.guards.requires = [];
  d.staleness.trigger = 'none';
  return d;
}

function plan(extra: Record<string, unknown> = {}) {
  return {
    eligible_count_sql: 'STUB_COUNT',
    eligible_batch_sql: 'STUB_BATCH',
    primary_match_sql: 'STUB_PRIMARY',
    fallback_match_sql: null,
    cumulative_sql: 'STUB_CUMULATIVE',
    cumulative_params: [],
    primary_counter: 'tier_primary',
    fallback_counter: 'tier_fallback',
    stale_link_select_sql: 'STUB_STALE_SELECT',
    stale_link_delete_sql: 'DELETE FROM parcel_buildings WHERE STUB_STALE_DELETE',
    lost_link_flag_sql: 'UPDATE parcels SET massing_enriched_at = NULL WHERE STUB_FLAG',
    ...extra,
  };
}

const answers = (text: string, n: number) => {
  if (text === 'STUB_COUNT') return { rows: [{ total: '2' }] };
  if (text === 'STUB_BATCH') return n === 1 ? { rows: [{ id: 7, street_type: 'AVE' }, { id: 8, street_type: 'ST' }] } : { rows: [] };
  if (text === 'STUB_PRIMARY') return { rows: [{ id: 7 }] };
  if (text === 'STUB_STALE_SELECT') return { rows: [{ parcel_id: 8, building_id: 3 }] };
  if (text === 'STUB_CUMULATIVE') return { rows: [{ linked: 1, total: 2 }] };
  return undefined;
};

function compute(match: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    buildMatchSql: () => match,
    classifyMatches: (rows: unknown[]) => ({
      rows: rows.length ? [{ parcel_id: 7, building_id: 1, is_primary: true, structure_type: 'house', match_type: 'centroid', confidence: 1 }] : [],
      parcels: rows.length ? 1 : 0,
      matches: rows.length,
    }),
    classifyFallback: () => ({ rows: [], parcels: 0 }),
    ...extra,
  };
}

const run = (descriptor: Record<string, unknown>, c: Record<string, unknown>, pool: ReturnType<typeof fakePool>) => stepLib.runLinkPhase({
  descriptor, pool, compute: c, config: {}, chainId: null, log: NOOP_LOG, tag: '[r-ef]', clockNow: RUN_AT,
});

describe('R-EG — runLinkPhase serves a second LINK family (flips at RE-FREEZE #37)', () => {
  // the before-image file writer is the one side effect outside the pool; never write into docs/ from a unit test
  let persisted: Array<{ rows: unknown[]; table: string }> = [];
  beforeEach(() => {
    persisted = [];
    vi.spyOn(writeLib, 'persistBeforeImageRows').mockImplementation(((rows: unknown[], table: string) => { persisted.push({ rows, table }); return { written: true, path: 'x', rows: rows.length }; }) as (...a: unknown[]) => unknown);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('L1: match.counters names the eligible / processed / linked / no-match counters and the two cumulative scalars; absent keeps the parcels_* names', async () => {
    const counters = { eligible: 'coas_eligible', processed: 'coas_processed', linked: 'coas_linked', no_match: 'coas_no_match', cumulative_linked: 'linked_coas', cumulative_total: 'coas_with_street' };
    const out = await run(linkDescriptor(), compute(plan({ counters })), fakePool(answers));
    expect(out.matched).toMatchObject({ coas_eligible: 2, coas_processed: 2, coas_linked: 1, coas_no_match: 1 });
    expect(out.matched.parcels_eligible).toBeUndefined();
    expect(out.cumulative).toEqual({ linked_coas: 1, coas_with_street: 2 });
    const legacy = await run(linkDescriptor(), compute(plan()), fakePool(answers));
    expect(legacy.matched).toMatchObject({ parcels_eligible: 2, parcels_processed: 2, parcels_linked: 1, no_match: 1 });
    expect(legacy.cumulative).toEqual({ linked_parcels: 1, parcels_with_centroid: 2 });
  });

  it('L2: compute.primaryMatchBinds(batchRows, {config, descriptor}) supplies the primary match binds; absent binds [ids]', async () => {
    const pool = fakePool(answers);
    await run(linkDescriptor(), compute(plan(), { primaryMatchBinds: (rows: Array<{ id: number; street_type: string }>) => [rows.map((r) => r.id), rows.map((r) => r.street_type)] }), pool);
    expect(pool.params[pool.sql.indexOf('STUB_PRIMARY')]).toEqual([[7, 8], ['AVE', 'ST']]);
    const plain = fakePool(answers);
    await run(linkDescriptor(), compute(plan()), plain);
    expect(plain.params[plain.sql.indexOf('STUB_PRIMARY')]).toEqual([[7, 8]]);
  });

  it('L3: the keyed arm runs without an E1 clear target when the step declares none', async () => {
    const d = linkDescriptor();
    d.outputs.writes = d.outputs.writes.filter((w: { write_discipline: { class: string; set_source?: string } }) => !(w.write_discipline.class === 'set_based_scoped' && !w.write_discipline.set_source));
    const pool = fakePool(answers);
    await run(d, compute(plan()), pool);
    expect(pool.sql.some((s) => /^\s*UPDATE parcel_buildings SET is_primary/i.test(s))).toBe(false);
    expect(pool.sql.some((s) => s.includes('STUB_FLAG'))).toBe(true);
    expect(pool.sql.some((s) => s.includes('STUB_STALE_DELETE'))).toBe(true);
  });

  it('L4: lost_link_flag_binds binds the link-change statement from a closed ordered list; default [lost_keys]; an unknown name is refused before any write', async () => {
    const pool = fakePool(answers);
    await run(linkDescriptor(), compute(plan({ lost_link_flag_binds: ['lost_keys', 'batch_keys', 'run_at'] })), pool);
    const flagAt = pool.sql.findIndex((s) => s.includes('STUB_FLAG'));
    expect(pool.params[flagAt]).toEqual([[8], [7, 8], RUN_AT]);
    const plain = fakePool(answers);
    await run(linkDescriptor(), compute(plan()), plain);
    expect(plain.params[plain.sql.findIndex((s) => s.includes('STUB_FLAG'))]).toEqual([[8]]);
    const bad = fakePool(answers);
    await expect(run(linkDescriptor(), compute(plan({ lost_link_flag_binds: ['lost_keys', 'now'] })), bad)).rejects.toThrow(/lost_link_flag_binds/);
    expect(bad.sql.some((s) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s))).toBe(false);
  });

  it('L5: retract "departed" + a declared scope on the LINK upsert target sweeps vanished leads once, after the loop, never touching a key derived this run', async () => {
    const d = linkDescriptor();
    const up = d.outputs.writes.find((w: { write_discipline: { class: string } }) => w.write_discipline.class === 'guarded_upsert');
    up.retract = 'departed';
    up.write_discipline.scope = 'parcel_id NOT IN (SELECT id FROM parcels)';
    const pool = fakePool(answers);
    await run(d, compute(plan()), pool);
    const sweep = 'DELETE FROM parcel_buildings WHERE (parcel_id NOT IN (SELECT id FROM parcels)) AND parcel_id <> ALL($1::BIGINT[]);';
    const at = pool.sql.indexOf(sweep);
    expect(at, 'the sweep is issued').toBeGreaterThan(-1);
    expect(pool.sql.filter((s) => s === sweep)).toHaveLength(1);
    expect(pool.params[at]).toEqual([[7]]);
    expect(at).toBeGreaterThan(pool.sql.lastIndexOf('STUB_BATCH'));
    expect(at).toBeLessThan(pool.sql.indexOf('STUB_CUMULATIVE'));
    expect(persisted.some((x) => x.table === 'parcel_buildings'), 'before-imaged').toBe(true);
    // unscoped is refused before any write
    up.write_discipline.scope = 'none';
    const bad = fakePool(answers);
    await expect(run(d, compute(plan()), bad)).rejects.toThrow(/retract "departed"/);
    expect(bad.sql.some((s) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s))).toBe(false);
  });
});
