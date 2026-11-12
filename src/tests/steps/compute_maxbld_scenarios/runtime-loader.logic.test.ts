// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (Phase-5 step identity); docs/specs/01-pipeline/124a_step_standard_policy_appendix.md
//            R-EH (a) dated note 2026-11-02 (§B-AM; CHAT-232.REH-BIND); docs/specs/01-pipeline/69a_mcbylaw_register.md M-377, M-384
//
// MB-31 (e) / MB-35 · D8-SHELL, the step's runtime loader (operator "a yes" 2026-11-11, D-1..D-7; card
// ~/Buildo-scratch/mcbylaws/inc3/build/CARD-d8-shell.md). RED FIRST on 6b5ef8e22 (no buildSourceSql, no loader, no migration 309).
//   (a) buildSourceSql: one batch statement; the runner binds its keyset only; the population ids, radii and divisor are checked
//       literals equal to the validated config (operator "option 2" 2026-11-11, STOP-11); bad values throw; the cohort table read.
//   (b) the golden 25 as the batch statement's rows (raw lookups + validated config) reproduce the McProof key, value for value.
//   (c) every emitted row satisfies migration 309's two CHECKs (D-1 a: only the declared gain reasons field is computed with no value).
//   (d) the ring walk of MB-31 plan 19.2 (RG-4, RG-5, RG-8, start abutters, null estimates, depth, row order).
//   (e) fail closed: no parcels row, no stamp, a catalogue setting without a config value, no zone list in the config (D-54).
//   (f) settings_sha is the catalogue settings as read, and only them; (g) matched.processed counts the parcels.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const G25 = 'src/tests/fixtures/layer3/golden-25';
const MIGRATION = 'migrations/309_parcel_maxbld_scenarios.sql';
const TOL: Record<string, number> = { front: 0.0005, footprint: 0.005, gfa: 0.01, height: 1e-9, storeys: 1e-9, units: 1e-9 };
const FIELDS: [string, string][] = [
  ['front_setback_used_m', 'front'],
  ['footprint_max_m2', 'footprint'],
  ['height_max_m', 'height'],
  ['storeys_max', 'storeys'],
  ['gfa_max_m2', 'gfa'],
  ['units_max', 'units'],
];

let S: Json;
let D: Json;
let CAT: Json;
let CONFIG: Json;
let RAW: Json;
let ROWS: Json[];
const expected = readJsonl(`${G25}/expected.jsonl`);

/** The validated ctx.config of the run: every declared variable at its seed default (the values migrations 276-310 insert). */
function seedConfig(): Json {
  const lv = readJson('scripts/seeds/logic_variables.json');
  const out: Json = {};
  for (const d of D.config.logic_variables as Json[]) out[d.name] = lv[d.name].default;
  return out;
}

/** The golden 25 as the batch statement returns them: the stored lot (pure core), the parcels row, the decoded result views, and the fixture's neighbours. */
function goldenBatch(): { rows: Json[]; raw: Json } {
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const parcels = readJson(`${G25}/parcels-rows.json`) as unknown as Json[];
  const out = MZ.materializeBatch(parcels, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const lines = readJsonl(`${G25}/inputs.jsonl`);
  const rows = out.rows.lots.map((lot: Json) => {
    const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;
    const line = lines.find((l) => l.case === e.case) as Json;
    const view = (d: Json) => ({ parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...d });
    return {
      id: lot.parcel_id,
      parcel: parcels.find((p) => p.id === lot.parcel_id),
      lot: { parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, permitted: lot.permitted, permitted_text_ids: lot.permitted_text_ids ?? null, table_version: lot.table_version, evaluator_version: lot.evaluator_version },
      cells: lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option).map(view),
      options: lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).map((d: Json) => { const { option_name: _n, ...rest } = d; return view(rest); }), // eslint-disable-line @typescript-eslint/no-unused-vars
      abutters: (line.abutments || []).map((a: Json, i: number) => ({ parcel_id: lot.parcel_id, neighbour_id: 900000 + i, shared_len_m: 10, est: a.est, est_status: a.st, bldg_m: a.bldg, same_street: a.sameStreet, residential: a.res })),
      street: line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: 800000 + i, est: v })) : [],
      zone: [],
      ring_edges: [],
    };
  });
  const raw = {
    bylaw_resolution_units: out.rows.units,
    bylaw_resolution_texts: out.rows.texts,
  };
  return { rows, raw };
}

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  D = readJson('scripts/compute-maxbld-scenarios.descriptor.json');
  CAT = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
  CONFIG = seedConfig();
  const g = goldenBatch();
  RAW = g.raw;
  ROWS = g.rows;
});

describe('(a) buildSourceSql: one batch statement; the runner binds its keyset only, the settings are checked literals (operator "option 2", STOP-11)', () => {
  it('binds only last_key and batch_size; count_binds none; every placeholder of the reads is rendered', () => {
    const plan = S.buildSourceSql(D, CONFIG, { mode: 'incremental' }) as Json;
    expect(plan.batch_binds).toEqual(['last_key', 'batch_size']);
    expect(plan.count_binds).toEqual([]);
    expect(plan.count_sql).toContain('parcel_maxbld_population');
    expect(String(plan.batch_sql).match(/\$\d+/g)).toEqual(['$1', '$2']);
  });
  it('the literals in the SQL equal the validated config values', () => {
    const config = { ...CONFIG, compute_maxbld_scenarios_population_parcel_ids: ['6640', '30065'], fya_placeholder_street_radius_m: 210.5, fya_placeholder_zone_radius_m: 480, compute_maxbld_scenarios_bbox_degree_divisor: 77000 };
    const sql = String(S.buildSourceSql(D, config, {}).batch_sql);
    expect(sql).toContain('unnest((ARRAY[6640, 30065]::int[]))');
    expect(sql).toContain('ST_DWithin(q.geom::geography, s.geom::geography, (210.5::double precision))');
    expect(sql).toContain('ST_Expand(s.geom, (210.5::double precision)/ (77000::double precision))');
    expect(sql).toContain('ST_DWithin(p.geom::geography, s.geom::geography, (480::double precision))');
    expect(sql).toContain('ST_Expand(s.geom, (480::double precision)/ (77000::double precision))');
  });
  it('a non-integer population id or a non-finite setting throws before any SQL is built', () => {
    const bad = (over: Json) => () => S.buildSourceSql(D, { ...CONFIG, ...over }, {});
    for (const id of ['12a', '1.5', '-3', '', ' 7', '1;DROP TABLE parcels']) expect(bad({ compute_maxbld_scenarios_population_parcel_ids: ['6640', id] }), `id ${JSON.stringify(id)}`).toThrow(/is not an integer/);
    expect(bad({ compute_maxbld_scenarios_population_parcel_ids: '6640' })).toThrow(/is not a list/);
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, '200', null, undefined]) {
      expect(bad({ fya_placeholder_street_radius_m: v }), `street radius ${String(v)}`).toThrow(/is not a finite number/);
      expect(bad({ compute_maxbld_scenarios_bbox_degree_divisor: v }), `divisor ${String(v)}`).toThrow(/is not a finite number/);
    }
    expect(S.settingLiterals({ ...CONFIG })[3]).toBe(`ARRAY[${(CONFIG.compute_maxbld_scenarios_population_parcel_ids as string[]).join(', ')}]::int[]`);
  });
  it('edge numbers render as plain numeric literals; an integer id given as a number is accepted; the reads use only $4-$6', () => {
    for (const v of [1e21, 5e-324, -1.5e-7, 0]) {
      const lit = S.settingLiterals({ ...CONFIG, fya_placeholder_street_radius_m: v })[4] as string;
      expect(lit, String(v)).toMatch(/^-?[0-9.]+(e[+-][0-9]+)?::double precision$/);
    }
    expect(S.settingLiterals({ ...CONFIG, compute_maxbld_scenarios_population_parcel_ids: [7, '08'] })[3]).toBe('ARRAY[7, 8]::int[]');
    const used = Object.values(S.READ_SQL as Json).flatMap((sql) => String(sql).match(/\$\d+/g) || []);
    expect([...new Set(used)].sort()).toEqual(['$4', '$5', '$6']);
  });
  it('pages the population by its integer id (keyset > $1, ORDER BY, LIMIT $2) and returns that id as the source key', () => {
    const sql = String(S.buildSourceSql(D, CONFIG, {}).batch_sql);
    expect(sql).toMatch(/pop\.id > \$1\s+ORDER BY pop\.id\s+LIMIT \$2/);
    expect(sql).toContain('FROM parcel_maxbld_population');
    expect(sql).toMatch(/^SELECT s\.id,$/m);
    expect(sql).toMatch(/ORDER BY s\.id$/);
    expect(D.execution.materialize_source.key).toBe('id');
    // every list read is aggregated in a stated order
    expect((sql.match(/json_agg\(x ORDER BY /g) || []).length).toBe(6);
  });
  it('read 5 takes the radius in metres on geography; the gist prefilter widens it into degrees by the divisor', () => {
    expect(S.READ_SQL.street_pool).toMatch(/q\.geom && ST_Expand\(s\.geom, \$4::double precision \/ \$6::double precision\)/);
    expect(S.READ_SQL.street_pool).toMatch(/ST_DWithin\(q\.geom::geography, s\.geom::geography, \$4::double precision\)/);
    expect(S.READ_SQL.zone_pool).toMatch(/p\.geom && ST_Expand\(s\.geom, \$5::double precision \/ \$6::double precision\)/);
    expect(S.READ_SQL.zone_pool).toMatch(/ST_DWithin\(p\.geom::geography, s\.geom::geography, \$5::double precision\)/);
    const div = (D.config.logic_variables as Json[]).find((d) => d.name === 'compute_maxbld_scenarios_bbox_degree_divisor') as Json;
    expect(div.max, 'D-4: at or below a degree of longitude at the north edge (about 80,400 m)').toBe(80000);
  });
});

describe('(b) the golden 25 through the runtime loader reproduce the McProof key', () => {
  it('every stated house value and status, with settings_sha set on every row', () => {
    const out = S.materializeRows(ROWS, { config: CONFIG, lookups: RAW }) as Json;
    const rows = out.rows.e1 as Json[];
    expect(rows.length).toBe(25 * 169); // MB-27 increment 5 (lane B5B-1, FIT-a): +16 fitted rows per parcel (5 x 3 types + units_fit); was 25 * 153
    let compared = 0;
    for (const e of expected) {
      const house = new Map(rows.filter((r) => r.parcel_id === e.parcel_id && r.building_type === 'detached_house').map((r) => [r.field_id, r]));
      expect((house.get('permitted') as Json).status, `${e.case}: permitted`).toBe('permitted');
      for (const [field, key] of FIELDS) {
        const cell = e[key] || {};
        const row = house.get(field) as Json;
        if (cell.s === 'number') {
          expect(row.status, `${e.case}/${key}`).toBe('computed');
          expect(Math.abs(row.value - cell.v), `${e.case}/${key}: ${row.value} vs ${cell.v}`).toBeLessThanOrEqual(TOL[key] ?? 0);
        } else {
          expect(row.status, `${e.case}/${key}`).toBe('not_evaluated');
        }
        compared += 1;
      }
    }
    expect(compared).toBe(150);
    // the reader gets its INPUT (abutters, street, ring, bt_units), not facts: 82 Kelsonia Ave (205238) reads its two qualifying abutters (trace is JSON text at the write boundary, MB-35 attempt 3)
    const front = rows.find((r) => r.parcel_id === 205238 && r.building_type === 'detached_house' && r.field_id === 'front_setback_used_m') as Json;
    expect((JSON.parse(front.trace) as Json[]).find((t) => t.kind === 'fact' && t.id === 'nbr_q_n')).toMatchObject({ value: 2 });
    const units = rows.find((r) => r.parcel_id === 205238 && r.building_type === 'detached_houseplex' && r.field_id === 'units_max') as Json;
    expect((JSON.parse(units.trace) as Json[]).find((t) => t.kind === 'fact' && t.id === 'bt_units')).toMatchObject({ value: 4 });
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.settings_sha))).toBe(true);
  });
});

describe('(c) migration 309: the two CHECKs hold on every emitted row', () => {
  it('the migration carries the CHECKs as the test reads them (D-1 a: only gain_reasons is computed with no value)', () => {
    const text = fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8');
    expect(text).toContain("CONSTRAINT parcel_maxbld_scenarios_value_iff_computed CHECK ((status = 'computed') = (value IS NOT NULL) OR (field_id = 'gain_reasons' AND status = 'computed' AND value IS NULL))");
    expect(text).toContain("CONSTRAINT parcel_maxbld_scenarios_reason_iff_undecided CHECK ((status IN ('not_evaluated', 'not_modelled', 'not_permitted')) = (reason IS NOT NULL) OR status IN ('permitted', 'computed', 'unlimited', 'unregulated', 'not_applicable', 'not_buildable'))");
    expect(text).toMatch(/ALTER TABLE parcel_maxbld_scenarios ENABLE ROW LEVEL SECURITY;/);
    expect(text).toMatch(/ALTER TABLE parcel_maxbld_population ENABLE ROW LEVEL SECURITY;/);
    expect(text, 'read 6 looks the frontage street up per lot').toContain('CREATE INDEX IF NOT EXISTS idx_parcels_primary_frontage_street_name ON parcels (primary_frontage_street_name) WHERE primary_frontage_street_name IS NOT NULL;');
    expect(readJson('scripts/seeds/bylaw/building-types.json').gain.reasons_field, 'the exempted field is the declared one').toBe('gain_reasons');
  });
  it('every golden row passes both predicates', () => {
    const rows = S.materializeRows(ROWS, { config: CONFIG, lookups: RAW }).rows.e1 as Json[];
    const undecided = ['not_evaluated', 'not_modelled', 'not_permitted'];
    const decided = ['permitted', 'computed', 'unlimited', 'unregulated', 'not_applicable', 'not_buildable'];
    const valueOk = (r: Json) => (r.status === 'computed') === (r.value !== null && r.value !== undefined) || (r.field_id === 'gain_reasons' && r.status === 'computed' && (r.value === null || r.value === undefined));
    const reasonOk = (r: Json) => undecided.includes(r.status) === (r.reason !== null && r.reason !== undefined) || decided.includes(r.status);
    expect(rows.filter((r) => !valueOk(r)).map((r) => `${r.parcel_id}/${r.building_type}/${r.field_id}`)).toEqual([]);
    expect(rows.filter((r) => !reasonOk(r)).map((r) => `${r.parcel_id}/${r.building_type}/${r.field_id}`)).toEqual([]);
    expect(rows.filter((r) => r.field_id === 'gain_reasons' && r.status === 'computed').length, 'the exemption is used').toBeGreaterThan(0);
  });
});

describe('(d) the ring walk (MB-31 plan 19.2 steps 1-4, in the compute)', () => {
  const e = (a: number, b: number, len: number, est: number | null = null) => [
    { parcel_id: a, neighbour_id: b, shared_len_m: len, est },
    { parcel_id: b, neighbour_id: a, shared_len_m: len, est: null },
  ];
  const withEst = (edges: Json[], ests: Record<number, number | null>) => edges.map((x) => ({ ...x, est: Object.prototype.hasOwnProperty.call(ests, x.neighbour_id) ? ests[x.neighbour_id] : null }));
  // subject 1; start abutters 2 and 5; chain 2 -> 3 -> 4; chain 5 -> 6
  const street = withEst([...e(1, 2, 10), ...e(2, 3, 10), ...e(3, 4, 10), ...e(1, 5, 10), ...e(5, 6, 10)], { 3: 4.5, 4: 5.5, 6: null });
  it('levels 2..depth, start abutters never ring lots, a lot without an estimate keeps its place', () => {
    expect(S.ringLots(1, street, 2)).toEqual([{ id: 3, est: 4.5 }, { id: 6, est: null }]);
    expect(S.ringLots(1, street, 3)).toEqual([{ id: 3, est: 4.5 }, { id: 4, est: 5.5 }, { id: 6, est: null }]);
  });
  it('RG-5: the longest shared edge wins, the lowest lot id on a tie; RG-4: two chains reaching one lot count it once', () => {
    const tie = [...e(1, 2, 10), ...e(2, 7, 8), ...e(2, 3, 8), ...e(2, 9, 12)];
    expect(S.ringLots(1, tie, 2).map((r: Json) => r.id)).toEqual([9]);
    expect(S.ringLots(1, [...e(1, 2, 10), ...e(2, 7, 8), ...e(2, 3, 8)], 2).map((r: Json) => r.id)).toEqual([3]);
    const meet = [...e(1, 2, 10), ...e(1, 5, 10), ...e(2, 3, 10), ...e(5, 3, 10)];
    expect(S.ringLots(1, meet, 2).map((r: Json) => r.id)).toEqual([3]);
  });
  it('RG-8: the walk only follows the street-scoped rows it is given (read 6 holds no other street); no start abutter -> empty ring', () => {
    expect(S.ringLots(1, [...e(2, 3, 10)], 4)).toEqual([]);
    expect(S.ringLots(1, [], 2)).toEqual([]);
  });
  it('shuffled rows give the same ring; a non-integer depth throws', () => {
    const shuffled = [...street].reverse();
    expect(S.ringLots(1, shuffled, 3)).toEqual(S.ringLots(1, street, 3));
    expect(() => S.ringLots(1, street, 2.5)).toThrow(/ring depth/);
  });
});

describe('(e) fail closed', () => {
  it('a population id with no parcels row, or with no Layer 2 stamp, halts the run by name', () => {
    expect(() => S.materializeRows([{ ...ROWS[0], parcel: null }], { config: CONFIG, lookups: RAW })).toThrow(/matches no parcels row/);
    expect(() => S.materializeRows([{ ...ROWS[0], lot: null }], { config: CONFIG, lookups: RAW })).toThrow(/has no Layer 2 stamp/);
  });
  it('a catalogue setting with no validated config value, or no zone list in the config, throws (a seed is never a runtime fallback)', () => {
    const { fya_porch_allowance_m: _gone, ...short } = CONFIG; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => S.materializeRows(ROWS.slice(0, 1), { config: short, lookups: RAW })).toThrow(/fya_porch_allowance_m has no validated ctx\.config value/);
    const { resolve_bylaws_population_zone_classes: _zones, ...noZones } = CONFIG; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => S.materializeRows(ROWS.slice(0, 1), { config: noZones, lookups: RAW })).toThrow(/resolve_bylaws_population_zone_classes/);
  });
  it('an empty page computes nothing and returns the census at 0 (R-JG)', () => {
    const out = S.materializeRows([], { config: CONFIG, lookups: {} }) as Json;
    expect(out.rows.e1).toEqual([]);
    expect(out.matched.processed).toBe(0);
    expect(out.matched.closure_violations).toBe(0);
  });
});

describe('(f) settings_sha and (g) the processed count', () => {
  const shaOf = (config: Json, raw: Json = RAW) => ((S.materializeRows(ROWS.slice(0, 1), { config, lookups: raw }).rows.e1 as Json[])[0] as Json).settings_sha;
  it('settings_sha is the sha256 of the catalogue settings as read from ctx.config', () => {
    const lv = readJson('scripts/seeds/logic_variables.json');
    const catalogue = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
    const overlay: Json = { ...lv };
    for (const s of catalogue.settings as Json[]) overlay[s.id] = { ...lv[s.id], value: CONFIG[s.id] };
    expect(shaOf({ ...CONFIG })).toBe(CAT.sha256(CAT.settingVals(catalogue, overlay)));
  });
  it('moves with a catalogue setting, never with the batch size, the population, the divisor or the lookup row order', () => {
    const base = shaOf({ ...CONFIG });
    expect(shaOf({ ...CONFIG, fya_porch_allowance_m: CONFIG.fya_porch_allowance_m + 0.5 })).not.toBe(base);
    expect(shaOf({ ...CONFIG, compute_maxbld_scenarios_batch_size: 50, compute_maxbld_scenarios_population_parcel_ids: ['6640'], compute_maxbld_scenarios_bbox_degree_divisor: 70000 })).toBe(base);
    expect(shaOf({ ...CONFIG }, { ...RAW, bylaw_resolution_texts: [...RAW.bylaw_resolution_texts].reverse() })).toBe(base);
  });
  it('matched.processed (records_total) counts the parcels of the page', () => {
    const out = S.materializeRows(ROWS.slice(0, 3), { config: CONFIG, lookups: RAW }) as Json;
    expect(out.matched.processed).toBe(3);
    expect(out.matched.parcels).toBe(3);
    expect(D.counters.records_total.source).toBe('matched.processed');
  });
});
