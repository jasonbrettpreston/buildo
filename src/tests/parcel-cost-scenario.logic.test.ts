// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3, §2.4, §2.11 (dated notes 2026-11-09, MB-86)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-67 (dated note 2026-11-09: Spec 88 prices the stored Layer 3 scenario areas)
//
// MB-86 · McBylaws queue · lane E-COST · stage 7. The per-scenario cost lines of the pure engine
// (scripts/lib/parcel-cost.js buildScenarioCostLines / mergeScenarioLines):
//   - the golden-25 cost answer key (blind second seat, folded 100/100), with real numbers on 24 lots;
//   - the worked examples COST-1..COST-14 (plan v2 §5.2, houseplex priced per operator "1. accept");
//   - the locks: identity, status parity, positive, the premium-ratio plausibility invariant (D-13),
//     the coherence fence with its named exception, determinism, and every scenario has a cost or a
//     stated reason.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const P = req(path.join(ROOT, 'scripts/lib/parcel-cost.js')) as Json;
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const AREAS = readJson('src/tests/fixtures/cost/golden-25-scenario-areas.json').rows as Json[];
const KEY = readJson('src/tests/fixtures/cost/golden-25-cost-key.json');

/** The six engine tunables at their seed values (scripts/seeds/logic_variables.json). */
const CFG = { fsiMaxPlausible: 99.999, escalationMinMultiplier: 1, escalationFallbackMultiplier: 1, premiumDefault: 1, adjustmentFactorDefault: 1, minPriceableAreaSqm: 0 };
const RATES: Json = {
  FB: { cost_per_sqm: 4844, cost_adjustment_factor: 1, escalation_index_base: 100 },
  HOUSEPLEX: { cost_per_sqm: 4306, cost_adjustment_factor: 1, escalation_index_base: 100 },
};
/** The four parcel_cost_lines rows of migration 298. */
const DB_ROWS = [
  { id: 'scenario:detached_house/gfa_max_m2', archetype: 'FB', base_confidence: 'high' },
  { id: 'scenario:detached_house/gfa_flat_m2', archetype: 'FB', base_confidence: 'high' },
  { id: 'scenario:detached_house/gfa_pitched_m2', archetype: 'FB', base_confidence: 'high' },
  { id: 'scenario:detached_houseplex/gfa_max_m2', archetype: 'HOUSEPLEX', base_confidence: 'low' },
];
const LINES = P.mergeScenarioLines(P.SCENARIO_COST_LINES, DB_ROWS);
const MAX = 'scenario:detached_house/gfa_max_m2';
const FLAT = 'scenario:detached_house/gfa_flat_m2';
const PITCHED = 'scenario:detached_house/gfa_pitched_m2';
const HOUSEPLEX = 'scenario:detached_houseplex/gfa_max_m2';

const row = (bt: string, field: string, over: Json = {}): Json => ({
  building_type: bt, field_id: field, status: 'computed', value: 200, reason: null, flags: [], content_sha: `sha-${bt}-${field}`, ...over,
});
const house = (field: string, over: Json = {}) => row('detached_house', field, over);
const run = (rows: Json[] | null, opts: Json = {}) =>
  P.buildScenarioCostLines(
    { neighbourhood_cost_premium: opts.premium ?? 1, max_build_confidence: opts.maxBuildConfidence ?? null },
    rows,
    opts.rates ?? RATES,
    opts.index ?? 100,
    { config: CFG, scenarioLines: opts.lines ?? LINES, coaTotal: opts.coaTotal ?? null },
  );

describe('MB-86 golden-25 cost answer key (blind seat, plan v2 §5.1)', () => {
  const byParcel = new Map<number, Json[]>();
  for (const r of AREAS) byParcel.set(r.parcel_id, [...(byParcel.get(r.parcel_id) || []), r]);
  const got: Json[] = [];
  for (const [parcelId, rows] of byParcel) {
    const out = run(rows);
    for (const [line, v] of Object.entries(out.lines) as [string, Json][]) got.push({ parcel_id: parcelId, line, ...v });
  }

  it('the key has 100 lines (25 lots x 4 scenarios) and the engine produces exactly those lines', () => {
    expect(KEY.rows).toHaveLength(100);
    expect(got.map((g) => `${g.parcel_id}|${g.line}`).sort()).toEqual(KEY.rows.map((k: Json) => `${k.parcel_id}|${k.line}`).sort());
  });

  it('every key line equals the engine: status, reason, total, per_sqm and area (tolerance $0.01)', () => {
    for (const k of KEY.rows as Json[]) {
      const g = got.find((x) => x.parcel_id === k.parcel_id && x.line === k.line) as Json;
      const where = `${k.case} ${k.line}`;
      expect(g.status, where).toBe(k.status);
      expect(g.reason ?? null, where).toBe(k.reason ?? null);
      for (const f of ['total', 'per_sqm', 'area']) {
        if (k[f] === null) expect(g[f], `${where} ${f}`).toBeUndefined();
        else expect(Math.abs(g[f] - k[f]), `${where} ${f}: ${g[f]} vs ${k[f]}`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it('holds REAL numbers: >= 20 lots priced, a number on every detached scenario, the headline range of plan v2 F19', () => {
    const priced = (KEY.rows as Json[]).filter((k) => k.total !== null);
    expect(new Set(priced.map((k) => k.parcel_id)).size).toBeGreaterThanOrEqual(20);
    for (const line of [MAX, FLAT, PITCHED]) expect(priced.some((k) => k.line === line), line).toBe(true);
    const head = priced.filter((k) => k.line === MAX).map((k) => k.total).sort((a, b) => a - b);
    expect(head).toHaveLength(24);
    expect(head[0]).toBe(615401.14); // A0388_26TEY
    expect(head[head.length - 1]).toBe(2412796.4); // A0229_26NY
  });

  it('refusals are listed by reason: 25 houseplex no_area_row (lane E rows not stored yet), A0166 x3 inherited', () => {
    const unpriced = (KEY.rows as Json[]).filter((k) => k.total === null);
    expect(unpriced.filter((k) => k.line === HOUSEPLEX && k.reason === 'no_area_row')).toHaveLength(25);
    expect(unpriced.filter((k) => k.case === 'A0166_26EYK' && k.reason === 'l3_not_evaluated:unlimited_in_arithmetic')).toHaveLength(3);
    expect(unpriced).toHaveLength(28);
    expect((KEY.rows as Json[]).filter((k) => k.status === 'at_least').map((k) => k.case).sort()).toEqual(['A0097_26SC', 'A0179_26EYK']);
  });
});

describe('MB-86 worked examples COST-1..COST-14 (plan v2 §5.2)', () => {
  it('COST-1 flat exact: 243.47 m2 x 4,844 = $1,179,368.68', () => {
    const l = run([house('gfa_flat_m2', { value: 243.47 })]).lines[FLAT];
    expect(l).toMatchObject({ status: 'computed', reason: null, total: 1179368.68, per_sqm: 4844, area: 243.47, area_basis: 'bylaw_gfa' });
  });
  it('COST-2 pitched exact: 482.7834 m2 = $2,338,602.79, area stored to cents', () => {
    const l = run([house('gfa_pitched_m2', { value: 482.7834, flags: ['headline:gfa_pitched_a_m2'] })]).lines[PITCHED];
    expect(l).toMatchObject({ status: 'computed', total: 2338602.79, area: 482.78, flags: ['headline:gfa_pitched_a_m2'] });
  });
  it('COST-3 headline gfa_max_m2 is priced; a headline:<row> flag is not a lower bound', () => {
    const l = run([house('gfa_max_m2', { value: 243.47, flags: ['headline:gfa_flat_m2'] })]).lines[MAX];
    expect(l).toMatchObject({ status: 'computed', total: 1179368.68 });
  });
  it('COST-4 flat with headline_lower_bound -> at_least, still priced', () => {
    const out = run([house('gfa_flat_m2', { value: 456.2776447058824, flags: ['headline_lower_bound:main_wall_shares_not_resolved'] })]);
    expect(out.lines[FLAT]).toMatchObject({ status: 'at_least', total: 2210208.91 });
    expect(out.counts.at_least).toBe(1);
  });
  it('COST-5 a not_buildable area -> not_buildable with its reason, no number', () => {
    const l = run([house('gfa_flat_m2', { status: 'not_buildable', value: null, reason: 'no_room' })]).lines[FLAT];
    expect(l).toEqual({ status: 'not_buildable', reason: 'no_room', flags: [], l3_content_sha: 'sha-detached_house-gfa_flat_m2', area_basis: 'bylaw_gfa' });
  });
  it('COST-6 absent rate -> not_evaluated/no_rate, counted no_rate and GFA-computed-cost-missing', () => {
    const out = run([house('gfa_flat_m2')], { rates: { HOUSEPLEX: RATES.HOUSEPLEX } });
    expect(out.lines[FLAT]).toMatchObject({ status: 'not_evaluated', reason: 'no_rate' });
    expect(out.lines[FLAT].total).toBeUndefined();
    expect(out.counts).toMatchObject({ no_rate: 1, gfa_computed_cost_missing: 1 });
  });
  it('COST-7 premium 1.35: per_sqm 6,539.40, 200 m2 = $1,307,880.00', () => {
    expect(run([house('gfa_flat_m2')], { premium: 1.35 }).lines[FLAT]).toMatchObject({ per_sqm: 6539.4, total: 1307880 });
  });
  it('COST-8 escalation floor: index 90 < base 100 gives x1 (never deflate); index 110 gives x1.1', () => {
    expect(run([house('gfa_flat_m2')], { index: 90 }).lines[FLAT]).toMatchObject({ total: 968800, rate_inputs: { escalation_multiplier: 1 } });
    expect(run([house('gfa_flat_m2')], { index: 110 }).lines[FLAT]).toMatchObject({ total: 1065680, per_sqm: 5328.4 });
  });
  it('COST-9 GFA refused while the rate is present -> the inherited refusal, not a price', () => {
    const out = run([house('gfa_max_m2', { status: 'not_evaluated', value: null, reason: 'unlimited_in_arithmetic' })]);
    expect(out.lines[MAX]).toMatchObject({ status: 'not_evaluated', reason: 'l3_not_evaluated:unlimited_in_arithmetic' });
    expect(out.counts).toMatchObject({ refused: 4, gfa_computed_cost_missing: 0 }); // the inherited refusal + three no_area_row lines
  });
  it('COST-10 two scenarios with equal GFA -> equal cost', () => {
    const out = run([house('gfa_flat_m2', { value: 254.485 }), house('gfa_pitched_m2', { value: 254.485 })]);
    expect(out.lines[FLAT].total).toBe(out.lines[PITCHED].total);
  });
  it('COST-11 houseplex priced at HOUSEPLEX 4,306 $/m2: 300 m2 = $1,291,800.00, area confidence low', () => {
    const l = run([row('detached_houseplex', 'gfa_max_m2', { value: 300 })]).lines[HOUSEPLEX];
    expect(l).toMatchObject({ status: 'computed', total: 1291800, per_sqm: 4306, area_confidence: 'low', area_basis: 'bylaw_gfa', rate_inputs: { archetype: 'HOUSEPLEX', rate_confidence: 'medium-low' } });
  });
  it('COST-11b the rate confidence rides the line (FE-06 medium-low for HOUSEPLEX, Spec 88 §3 high for FB); the area band stays in the closed Spec 88 set', () => {
    const out = run([house('gfa_flat_m2'), row('detached_houseplex', 'gfa_max_m2', { value: 300 })]);
    expect(out.lines[HOUSEPLEX].rate_inputs.rate_confidence).toBe('medium-low');
    expect(out.lines[HOUSEPLEX].area_confidence).toBe('low');
    expect(out.lines[FLAT].rate_inputs.rate_confidence).toBe('high');
    const remapped = P.mergeScenarioLines(P.SCENARIO_COST_LINES, [{ id: FLAT, archetype: 'HOUSEPLEX', base_confidence: 'high' }]);
    expect(run([house('gfa_flat_m2')], { lines: remapped }).lines[FLAT].rate_inputs).toMatchObject({ archetype: 'HOUSEPLEX', rate_confidence: 'medium-low' });
    for (const l of Object.values(out.lines) as Json[]) if (l.area_confidence) expect(['high', 'medium', 'low']).toContain(l.area_confidence);
  });
  it('COST-12 malformed rate (cost_per_sqm not a number) -> not_evaluated/malformed_rate, counted', () => {
    const out = run([house('gfa_flat_m2')], { rates: { ...RATES, FB: { ...RATES.FB, cost_per_sqm: 'abc' } } });
    expect(out.lines[FLAT]).toMatchObject({ status: 'not_evaluated', reason: 'malformed_rate' });
    expect(out.counts).toMatchObject({ malformed_rate: 1, gfa_computed_cost_missing: 1 });
  });
  it('COST-13 houseplex: the premium applies (1.35 -> $5,813.10/m2, 300 m2 = $1,743,930.00) and a lower bound is at_least', () => {
    const l = run([row('detached_houseplex', 'gfa_max_m2', { value: 300, flags: ['headline_lower_bound:x'] })], { premium: 1.35 }).lines[HOUSEPLEX];
    expect(l).toMatchObject({ status: 'at_least', per_sqm: 5813.1, total: 1743930 });
  });
  it('COST-14 houseplex with no stored area row -> not_evaluated/no_area_row; with no parcel_cost_lines row -> no_rate_line', () => {
    expect(run([house('gfa_flat_m2')]).lines[HOUSEPLEX]).toEqual({ status: 'not_evaluated', reason: 'no_area_row', flags: [], l3_content_sha: null, area_basis: 'bylaw_gfa' });
    const lines = P.mergeScenarioLines(P.SCENARIO_COST_LINES, DB_ROWS.slice(0, 3));
    const out = run([row('detached_houseplex', 'gfa_max_m2')], { lines });
    expect(out.lines[HOUSEPLEX]).toMatchObject({ status: 'not_evaluated', reason: 'no_rate_line' });
    expect(out.counts).toMatchObject({ no_rate: 1, gfa_computed_cost_missing: 1 });
  });
});

describe('MB-86 locks (plan v2 §5.3)', () => {
  const ALL = [house('gfa_max_m2', { value: 312.5 }), house('gfa_flat_m2', { value: 0 }), house('gfa_pitched_m2', { status: 'not_modelled', value: null, reason: 'r' }), row('detached_houseplex', 'gfa_max_m2', { value: 410.2 })];

  it('every scenario has a cost or a stated reason: all four lines present, each with a total or a non-empty reason', () => {
    for (const premium of [1, 1.15, 1.85]) {
      const out = run(ALL, { premium });
      expect(Object.keys(out.lines).sort()).toEqual([FLAT, MAX, PITCHED, HOUSEPLEX].sort());
      for (const [id, l] of Object.entries(out.lines) as [string, Json][]) {
        const priced = typeof l.total === 'number';
        expect(priced || (typeof l.reason === 'string' && l.reason.length > 0) || l.status === 'not_modelled', id).toBe(true);
        expect(['computed', 'at_least', 'not_evaluated', 'not_buildable', 'not_modelled'], id).toContain(l.status);
      }
    }
  });
  it('a parcel with no stored Layer 3 rows gets no scenario line at all (no menu churn outside the Layer 3 population)', () => {
    expect(run(null).lines).toEqual({});
  });
  it('identity, positivity and the premium-ratio plausibility invariant (D-13): per_sqm / (rate x adj x esc) equals the premium, in [1.00, 1.85]', () => {
    for (const premium of [1, 1.15, 1.35, 1.6, 1.85]) {
      const out = run(ALL, { premium });
      for (const l of Object.values(out.lines) as Json[]) {
        if (typeof l.total !== 'number') continue;
        expect(l.total).toBeGreaterThan(0);
        expect(l.per_sqm).toBeGreaterThan(0);
        expect(Math.abs(l.total / l.area - l.per_sqm)).toBeLessThanOrEqual(0.01);
        const ri = l.rate_inputs;
        const ratio = l.per_sqm / (ri.cost_per_sqm * ri.adjustment_factor * ri.escalation_multiplier);
        expect(Math.abs(ratio - premium)).toBeLessThanOrEqual(0.01);
        expect(ratio).toBeGreaterThanOrEqual(0.995);
        expect(ratio).toBeLessThanOrEqual(1.855);
      }
    }
  });
  it('status parity: each line status and flags follow the area row (computed -> computed/at_least; others carry no number)', () => {
    const out = run(ALL);
    expect(out.lines[MAX].status).toBe('computed');
    expect(out.lines[FLAT]).toMatchObject({ status: 'not_evaluated', reason: 'area_not_priceable' });
    expect(out.lines[PITCHED]).toMatchObject({ status: 'not_modelled', reason: 'r' });
    expect(out.lines[PITCHED].total).toBeUndefined();
    expect(out.counts).toMatchObject({ priced: 2, refused: 1, not_modelled: 1, gfa_computed_cost_missing: 1 });
  });
  it('coherence: a scenario total above the coa_build total by more than $1 carries l3_envelope_exceeds_old_coa and is counted; at or within $1 it does not', () => {
    const r = [house('gfa_flat_m2', { value: 200, flags: ['b', 'a'] })]; // total 968,800
    const over = run(r, { coaTotal: 968798.99 });
    expect(over.lines[FLAT].flags).toEqual(['a', 'b', 'l3_envelope_exceeds_old_coa']);
    expect(over.counts.exceed_coa).toBe(1);
    expect(run(r, { coaTotal: 968799 }).lines[FLAT].flags).toEqual(['a', 'b']);
    expect(run(r, { coaTotal: null }).counts.exceed_coa).toBe(0);
  });
  it('determinism: the same rows in any order give the same lines; the stamp carries the area row content_sha', () => {
    const a = run(ALL);
    const b = run([...ALL].reverse());
    expect(b).toEqual(a);
    expect(a.lines[MAX].l3_content_sha).toBe('sha-detached_house-gfa_max_m2');
  });
  it('mergeScenarioLines: an unknown scenario: id halts; a duplicate halts; config is required', () => {
    expect(() => P.mergeScenarioLines(P.SCENARIO_COST_LINES, [...DB_ROWS, { id: 'scenario:x/y', archetype: 'FB', base_confidence: 'high' }])).toThrow(/unknown to SCENARIO_COST_LINES: scenario:x\/y/);
    expect(() => P.mergeScenarioLines(P.SCENARIO_COST_LINES, [DB_ROWS[0], DB_ROWS[0]])).toThrow(/duplicate/);
    expect(() => P.buildScenarioCostLines({}, [], RATES, 100, { scenarioLines: LINES })).toThrow(/requires opts.config/);
  });
  it('the 13 existing lines are untouched: PARCEL_COST_LINES has no scenario: id, and scenario ids are disjoint', () => {
    expect(P.PARCEL_COST_LINES).toHaveLength(13);
    expect(P.PARCEL_COST_LINES.some((l: Json) => String(l.id).startsWith('scenario:'))).toBe(false);
    expect(P.SCENARIO_COST_LINES.map((l: Json) => l.id)).toEqual([MAX, FLAT, PITCHED, HOUSEPLEX]);
  });
});
