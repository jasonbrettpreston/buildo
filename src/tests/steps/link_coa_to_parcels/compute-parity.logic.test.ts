// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ), R-DF, R-EG
//
// Phase-4 wave 4, link_coa_to_parcels commit ② (compressed form). The pure compute
// `scripts/lib/compute/link-coa-to-parcels.js`, driven by the REAL runner (runLinkPhase, R-EG) over a fake pool:
//   Q1 binds each CoA's cascade with the same inputs the frozen legacy text binds per row (trimmed street number and
//      name, the street type parsed from the raw name only when both are present);
//   Q2 writes each match with the legacy match_type and the legacy tier confidence;
//   Q3 issues, per batch, the guarded upsert, the stale-pair read, the link-change back-fill (bound lost_keys,
//      batch_keys, run_at — ruling 1) and the keyed delete, then ONE vanished-lead sweep; every lead_parcels
//      statement is scoped to coa: leads (LCTP-D9);
//   Q4 grades the declared bounds with the real library verdict (unmatched share inclusive, an empty linked set INFO).
// The cascade SQL itself was measured against the legacy per-row cascade on the dev DB (notes.json read_this_way[0]).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';

import { loadLegacy, type CoaRow, type ParcelRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS library and compute */
const stepLib = require(path.join(REPO_ROOT, 'scripts/lib/step'));
const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));
const verdictLib = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  buildAuditTable(d: unknown, chain: string | null, obs: Record<string, unknown>, extra: unknown[], config: Record<string, number> | null): { audit_table: { rows: { metric: string; value: unknown; status: string }[] } };
};
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-coa-to-parcels.js')) as ((ctx: unknown) => Promise<unknown>) & {
  primaryMatchBinds(rows: unknown[]): [string[], string[], string[], string[]];
  classifyMatches(rows: unknown[], config: Record<string, number>): { rows: Record<string, unknown>[]; parcels: number; matches: number };
};
const DESCRIPTOR = require(path.join(REPO_ROOT, 'scripts/link-coa-to-parcels.descriptor.json')) as { checks: { id: string }[]; guards: { requires: unknown[] } };
/* eslint-enable @typescript-eslint/no-require-imports */

const RUN_AT = new Date('2026-10-19T12:00:00Z');
const CONFIG = {
  link_coa_to_parcels_conf_tier1a: 0.95,
  link_coa_to_parcels_conf_tier1b: 0.8,
  link_coa_to_parcels_unmatched_threshold_pct: 10,
  link_coa_to_parcels_neighbourhood_coverage_min_pct: 95,
  link_coa_to_parcels_centroid_outside_max_pct: 1,
};
const COAS: CoaRow[] = [
  { id: 1, lead_id: 'coa:A1', street_num: ' 12 ', street_name_normalized: 'QUEEN', street_name: 'QUEEN ST E' },
  { id: 2, lead_id: 'coa:A2', street_num: '40', street_name_normalized: 'KING', street_name: 'KING ST W' },
  { id: 3, lead_id: 'coa:A3', street_num: '', street_name_normalized: 'BLOOR', street_name: 'BLOOR ST' },
  { id: 4, lead_id: 'coa:A4', street_num: null, street_name_normalized: 'DUNDAS', street_name: 'DUNDAS' },
];
const P = (id: number): ParcelRow => ({ id, centroid_lat: '43.65', centroid_lng: '-79.38', geom: 'POLY', type_confirmed: true });
const asBatch = (c: CoaRow) => ({ id: c.lead_id, street_num: c.street_num, street_name_normalized: c.street_name_normalized, street_name: c.street_name });

describe('link_coa_to_parcels ② — the converted compute reproduces the legacy cascade inputs and match rows', () => {
  it('Q1 — the cascade binds equal the legacy per-row binds (bridge / exact: number, name, parsed type; name-only: name)', async () => {
    const o = loadLegacy({ runAt: RUN_AT, coas: COAS });
    await o.runMain();
    const [leads, nums, names, types] = compute.primaryMatchBinds(COAS.map(asBatch));
    expect(leads).toEqual(COAS.map((c) => c.lead_id));
    const bridge = o.queries.filter((q) => /FROM address_points ap/.test(q.sql)).map((q) => q.params);
    const withNum = COAS.map((c, i) => ({ i, c })).filter(({ c }) => (c.street_num ?? '').trim() !== '');
    expect(bridge).toEqual(withNum.map(({ i }) => [nums[i], names[i], types[i]]));
    const nameOnly = o.queries.filter((q) => /FROM parcels\s+WHERE street_name_normalized = \$1/.test(q.sql)).map((q) => q.params);
    const noNum = COAS.map((c, i) => ({ i, c })).filter(({ c }) => (c.street_num ?? '').trim() === '');
    expect(nameOnly).toEqual(noNum.map(({ i }) => [names[i]]));
    expect(noNum.every(({ i }) => types[i] === '' && nums[i] === '')).toBe(true);
  });

  it('Q2 — each match is written with the legacy match_type and tier confidence', async () => {
    const o = loadLegacy({
      runAt: RUN_AT,
      coas: COAS,
      bridge: { '12|QUEEN': P(10) },
      exact: { '40|KING': P(20) },
      byName: { BLOOR: P(30) },
    });
    await o.runMain();
    const legacyRows = o.queries.filter((q) => /^\s*INSERT INTO lead_parcels/.test(q.sql)).map((q) => q.params.slice(0, 4));
    const converted = compute.classifyMatches([
      { lead_id: 'coa:A1', parcel_id: 10, match_type: 'address_points_exact' },
      { lead_id: 'coa:A2', parcel_id: '20', match_type: 'tier_1a_exact' },
      { lead_id: 'coa:A3', parcel_id: 30, match_type: 'tier_1b_name_only' },
    ], CONFIG);
    expect(converted.rows.map((r) => [r.lead_id, r.parcel_id, r.match_type, r.confidence])).toEqual(legacyRows);
    expect(converted).toMatchObject({ parcels: 3, matches: 3 });
  });
});

describe('link_coa_to_parcels ② — the real runner (runLinkPhase, R-EG) over a fake pool', () => {
  let persisted: string[] = [];
  beforeEach(() => {
    persisted = [];
    vi.spyOn(writeLib, 'persistBeforeImageRows').mockImplementation(((rows: unknown[], table: string) => { persisted.push(table); return { written: true, path: 'x', rows: rows.length }; }) as (...a: unknown[]) => unknown);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  function fakePool() {
    const sql: string[] = [];
    const params: unknown[][] = [];
    const query = async (text: string, values?: unknown[]) => {
      sql.push(text);
      params.push(values ?? []);
      if (/^SELECT COUNT\(\*\) AS total FROM coa_applications/.test(text)) return { rows: [{ total: '4' }] };
      if (/AS id, ca\.street_num/.test(text)) return values?.[1] === 0 ? { rows: COAS.map(asBatch) } : { rows: [] };
      if (/^WITH i \(lead_id/.test(text)) return { rows: [{ lead_id: 'coa:A1', parcel_id: 10, match_type: 'address_points_exact' }, { lead_id: 'coa:A3', parcel_id: 30, match_type: 'tier_1b_name_only' }] };
      if (/^SELECT lp\.lead_id, lp\.parcel_id/.test(text)) return { rows: [{ lead_id: 'coa:A2', parcel_id: 99 }] };
      if (/^WITH changed AS/.test(text)) return { rows: [{ id: 1 }, { id: 2 }] };
      if (/^DELETE FROM lead_parcels lp/.test(text)) return { rows: [], rowCount: 1 };
      if (/^SELECT\n {2}\(SELECT COUNT\(DISTINCT lp\.lead_id\)/.test(text)) {
        return { rows: [{ linked: '3', total: '5', coa_corpus_missing_normalized_count: '0', no_address_data: '1', tier_1a_via_bridge: '1', tier_1a_parcels_exact: '0', tier_1b_name_only: '1', eligible_linked: '2', eligible_linked_with_neighbourhood: '2', eligible_linked_geocoded: '2', centroid_outside_polygon: '0' }] };
      }
      if (/^\s*INSERT INTO lead_parcels/.test(text)) return { rows: [{ inserted: true }, { inserted: false }], rowCount: 2 };
      if (/^DELETE FROM lead_parcels WHERE/.test(text)) return { rows: [], rowCount: 0 };
      if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
      return { rows: [], rowCount: 0 };
    };
    return { sql, params, query, connect: async () => ({ query, release: () => {} }) };
  }

  async function run() {
    const d = JSON.parse(JSON.stringify(DESCRIPTOR));
    d.guards.requires = [];
    const pool = fakePool();
    const out = await stepLib.runLinkPhase({
      descriptor: d, pool, compute, config: CONFIG, chainId: 'coa', log: { info: () => {}, warn: () => {}, error: () => {} }, tag: '[lctp]', clockNow: RUN_AT,
    });
    return { out, pool };
  }

  it('Q3 — per batch: upsert -> stale read -> back-fill (lost_keys, batch_keys, run_at) -> keyed delete; then ONE coa-scoped vanished-lead sweep', async () => {
    const { out, pool } = await run();
    const at = (re: RegExp) => pool.sql.findIndex((s) => re.test(s));
    const upsert = at(/^\s*INSERT INTO lead_parcels/);
    const stale = at(/^SELECT lp\.lead_id, lp\.parcel_id/);
    const backfill = at(/^WITH changed AS/);
    const del = at(/^DELETE FROM lead_parcels lp/);
    const sweep = at(/^DELETE FROM lead_parcels WHERE/);
    expect([upsert, stale, backfill, del, sweep].every((i) => i >= 0)).toBe(true);
    expect(upsert < stale && stale < backfill && backfill < del && del < sweep).toBe(true);
    expect(pool.params[backfill]).toEqual([['coa:A2'], COAS.map((c) => c.lead_id), RUN_AT]);
    expect(pool.params[del]).toEqual([COAS.map((c) => c.lead_id), ['coa:A1', 'coa:A3'], [10, 30]]);
    expect(pool.sql[sweep]).toBe("DELETE FROM lead_parcels WHERE (lead_id LIKE 'coa:%' AND NOT EXISTS (SELECT 1 FROM coa_applications ca WHERE ca.lead_id = lead_parcels.lead_id)) AND lead_id <> ALL($1::TEXT[]);");
    expect(pool.params[sweep]).toEqual([['coa:A1', 'coa:A3']]);
    for (const s of pool.sql.filter((x) => /^\s*(DELETE FROM lead_parcels|SELECT lp\.lead_id)/.test(x))) expect(s).toMatch(/lead_id LIKE 'coa:%'/);
    expect(persisted).toEqual(expect.arrayContaining(['lead_parcels']));
    expect(out.matched).toMatchObject({ coa_eligible: 4, coa_processed: 4, coa_linked: 2, no_parcel_match: 2, cascade_matches: 2 });
    expect(out.cumulative).toEqual({ coa_corpus_linked_count: 3, coa_corpus_total: 5 });
    expect(out.written.e2.deleted).toBe(1);
    expect(out.written.e3.updated).toBe(2);
  });

  it('Q4 — the declared bounds graded by the real verdict: 2 of 4 unmatched WARNs at 10 % and PASSes at 50 %; an empty linked set reads INFO', async () => {
    const { out } = await run();
    const grade = async (matched: Record<string, unknown>, cfg: Record<string, number>) => {
      const obs: Record<string, unknown> = {};
      await compute({ descriptor: { identity: { name: 'link_coa_to_parcels' } }, checks: DESCRIPTOR.checks.map((c) => c.id), matched, cumulative: out.cumulative, written: out.written, log: { error: () => {} }, report: (id: string, o: unknown) => { obs[id] = o; } });
      return verdictLib.buildAuditTable(DESCRIPTOR, 'coa', obs, [], cfg).audit_table.rows;
    };
    const status = (rows: { metric: string; status: string }[], id: string) => rows.find((r) => String(r.metric).split(':')[0] === id)?.status;
    expect(status(await grade(out.matched, CONFIG), 'unmatched_coa_pct')).toBe('WARN');
    expect(status(await grade(out.matched, { ...CONFIG, link_coa_to_parcels_unmatched_threshold_pct: 50 }), 'unmatched_coa_pct')).toBe('PASS');
    expect(status(await grade({ ...out.matched, eligible_linked: 0, eligible_linked_with_neighbourhood: 0 }, CONFIG), 'coa_neighbourhood_coverage_pct')).toBe('INFO');
  });
});
