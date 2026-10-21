// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-ID (CoA cutover ruling 4, operator 2026-10-20,
//            `2026-10-20-chat-batch-c-steps#CHAT-18`), R-EG (1) (the LINK counter contract), Rule 2 (R-BZ)
//
// RED until the bundled RE-FREEZE night (REFREEZE-BUNDLE-1 item (1), Draft B restated): link_coa_to_parcels restores
// the two per-run bridge type counters the legacy step emitted (legacy-link-coa-to-parcels.js.txt :305-306, :407,
// :630-631, :663-664). The type-confirmation bit exists only in the per-batch cascade rows (`m.type_confirmed`), so
// the compute's pure `classifyMatches` counts it per batch and the runner sums the counters the match plan declares
// in `extra_counters` — closed: an undeclared key, or a declared name that collides with a LINK counter, throws.
import { describe, expect, it } from 'vitest';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS library and compute */
const stepLib = require(path.join(REPO_ROOT, 'scripts/lib/step'));
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-coa-to-parcels.js')) as ((ctx: unknown) => Promise<{ records_meta: Record<string, unknown> }>) & {
  buildMatchSql(d: unknown, config: Record<string, number> | null): { extra_counters?: string[] };
  classifyMatches(rows: unknown[], config: Record<string, number>): { rows: unknown[]; parcels: number; matches: number; counters?: Record<string, number> };
  buildMeta(ctx: unknown): Record<string, unknown>;
};
const DESCRIPTOR = require(path.join(REPO_ROOT, 'scripts/link-coa-to-parcels.descriptor.json')) as {
  checks: Array<{ id: string; severity: string }>; emits: Array<{ key: string }>; deviations: Array<{ from: string; adjudicated_by: string }>; guards: { requires: unknown[] };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const CONFIG = {
  link_coa_to_parcels_conf_tier1a: 0.95,
  link_coa_to_parcels_conf_tier1b: 0.8,
  link_coa_to_parcels_unmatched_threshold_pct: 10,
  link_coa_to_parcels_neighbourhood_coverage_min_pct: 95,
  link_coa_to_parcels_centroid_outside_max_pct: 1,
};
const NAMES = ['tier_1a_type_confirmed', 'tier_1a_type_tolerant'];
const B = (lead: string, tc: boolean | null) => ({ lead_id: lead, parcel_id: 1, match_type: 'address_points_exact', type_confirmed: tc });

describe('R-ID — link_coa_to_parcels restores tier_1a_type_confirmed / tier_1a_type_tolerant', () => {
  it('T1 — classifyMatches counts bridge matches by type_confirmed (true -> confirmed; false or unknown -> tolerant, legacy :407); other tiers count neither', () => {
    const c = compute.classifyMatches([B('coa:1', true), B('coa:2', false), B('coa:3', null), { lead_id: 'coa:4', parcel_id: 2, match_type: 'tier_1a_exact', type_confirmed: null }, { lead_id: 'coa:5', parcel_id: 3, match_type: 'tier_1b_name_only', type_confirmed: null }], CONFIG);
    expect(c.counters).toEqual({ tier_1a_type_confirmed: 1, tier_1a_type_tolerant: 2 });
    expect(c.parcels).toBe(5);
  });

  it('T2 — the match plan declares both as extra_counters; the descriptor declares both checks (INFO) and both emits; the deviation no longer lists them', () => {
    expect(compute.buildMatchSql(DESCRIPTOR, CONFIG).extra_counters).toEqual(NAMES);
    for (const n of NAMES) {
      expect(DESCRIPTOR.checks.find((k) => k.id === n)?.severity, n).toBe('INFO');
      expect(DESCRIPTOR.emits.some((e) => e.key === n), n).toBe(true);
    }
    const dev = DESCRIPTOR.deviations[3]!;
    expect(dev.from).not.toMatch(/tier_1a_type_confirmed|tier_1a_type_tolerant/);
    expect(dev.adjudicated_by).toContain('Spec 124 R-ID');
  });

  it('T3 — the real runner sums the declared extra counters across batches into ctx.matched', async () => {
    const batches = [[{ id: 'coa:A1', street_num: '1', street_name_normalized: 'QUEEN', street_name: 'QUEEN ST' }], [{ id: 'coa:A2', street_num: '2', street_name_normalized: 'KING', street_name: 'KING ST' }]];
    const query = async (text: string, values?: unknown[]) => {
      if (/^SELECT COUNT\(\*\) AS total FROM coa_applications/.test(text)) return { rows: [{ total: '2' }] };
      if (/AS id, ca\.street_num/.test(text)) return { rows: values?.[1] === 0 ? batches[0] : values?.[1] === 'coa:A1' ? batches[1] : [] };
      if (/^WITH i \(lead_id/.test(text)) return { rows: [B((values?.[0] as string[])[0]!, (values?.[0] as string[])[0] === 'coa:A1')] };
      if (/^SELECT\n {2}\(SELECT COUNT\(DISTINCT lp\.lead_id\)/.test(text)) return { rows: [{ linked: '2', total: '2' }] };
      if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
      if (/^\s*INSERT INTO lead_parcels/.test(text)) return { rows: [{ inserted: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    const d = JSON.parse(JSON.stringify(DESCRIPTOR));
    d.guards.requires = [];
    const out = await stepLib.runLinkPhase({
      descriptor: d, pool: { query, connect: async () => ({ query, release: () => {} }) }, compute, config: CONFIG, chainId: 'coa',
      log: { info: () => {}, warn: () => {}, error: () => {} }, tag: '[lctp]', clockNow: new Date('2026-10-20T12:00:00Z'),
    });
    expect(out.matched).toMatchObject({ coa_processed: 2, tier_1a_type_confirmed: 1, tier_1a_type_tolerant: 1 });
  });

  it('T4 — records_meta carries both keys (legacy :663-664) and compute reports both checks', async () => {
    const reported: string[] = [];
    const ctx = {
      descriptor: DESCRIPTOR, checks: NAMES, config: CONFIG, elapsed_ms: 1, cumulative: {}, written: {},
      matched: { tier_1a_type_confirmed: 3, tier_1a_type_tolerant: 2 },
      report: (id: string) => { reported.push(id); }, log: { error: () => {} },
    };
    const r = await compute(ctx);
    expect(reported).toEqual(NAMES);
    expect(r.records_meta).toMatchObject({ tier_1a_type_confirmed: 3, tier_1a_type_tolerant: 2 });
  });
});

describe('R-ID mechanism — runLinkPhase extra_counters is closed (an R-EG (1) additive amendment)', () => {
  const linkMatch = (extra: unknown, counters: unknown) => ({
    compute: Object.assign(async () => ({ records_meta: {} }), {
      buildMatchSql: () => ({ ...compute.buildMatchSql(DESCRIPTOR, CONFIG), extra_counters: extra }),
      primaryMatchBinds: () => [['coa:A1'], ['1'], ['QUEEN'], ['ST']],
      classifyMatches: () => ({ rows: [], parcels: 0, matches: 0, counters }),
      classifyFallback: () => ({ rows: [], parcels: 0 }),
    }),
  });
  const run = async (extra: unknown, counters: unknown) => {
    const query = async (text: string, values?: unknown[]) => {
      if (/^SELECT COUNT\(\*\) AS total/.test(text)) return { rows: [{ total: '1' }] };
      if (/AS id, ca\.street_num/.test(text)) return { rows: values?.[1] === 0 ? [{ id: 'coa:A1' }] : [] };
      if (/^SELECT\n {2}\(SELECT COUNT\(DISTINCT lp\.lead_id\)/.test(text)) return { rows: [{ linked: '0', total: '1' }] };
      if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
      return { rows: [], rowCount: 0 };
    };
    const d = JSON.parse(JSON.stringify(DESCRIPTOR));
    d.guards.requires = [];
    return stepLib.runLinkPhase({ descriptor: d, pool: { query, connect: async () => ({ query, release: () => {} }) }, compute: linkMatch(extra, counters).compute, config: CONFIG, chainId: 'coa', log: { info: () => {}, warn: () => {}, error: () => {} }, tag: '[t]', clockNow: new Date() });
  };

  it('T5 — a counter the plan does not declare throws; a declared name colliding with a LINK counter throws; a non-integer count throws', async () => {
    await expect(run(['tier_1a_type_confirmed'], { tier_1a_type_confirmed: 1, surprise: 1 })).rejects.toThrow(/extra_counters/);
    await expect(run(['coa_processed'], { coa_processed: 1 })).rejects.toThrow(/extra_counters/);
    await expect(run(['tier_1a_type_confirmed'], { tier_1a_type_confirmed: 1.5 })).rejects.toThrow(/extra_counters/);
  });

  it('T6 — no extra_counters declared: matched carries no extra key (every existing LINK step byte-identical)', async () => {
    const out = await run(undefined, undefined);
    for (const n of NAMES) expect(n in out.matched).toBe(false);
  });
});
