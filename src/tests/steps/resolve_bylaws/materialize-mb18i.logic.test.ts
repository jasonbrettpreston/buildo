// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-406 (the I10 lock: the 2013-lot assumption is recorded and disclosed on every
//            result that uses it, `inputs_defaulted` 0); MB-18 (i); docs/specs/01-pipeline/134_resolve_bylaws.md I10 and CHAT-180
//            (disclosures are recomputed on read, never stored)
// Handbook: Spec 132 §materializer.1 (R-EH: rows computed in JS); the harness is copied from materialize.logic.test.ts (same fixtures, REAL
// evaluator hooks). RED FIRST (Spec 124 R-BA): T-i7a and T-i7b are red until MB-18 (i) lands; T-i7c is the lock and is green on base.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lr = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mz = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;

const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const PAIRS = (SCOPE.structures as string[]).flatMap((structure) => (SCOPE.targets[structure] as string[]).map((target) => ({ structure, target })));
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];

const mkEnv = (over: Json = {}): Json => mz().makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: ZONES, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version }, ...over });
/** The REAL evaluator hooks the materialize audit tests use: the uncached evaluator is re-run for every Nth lot, no stub. */
const real = (nth: number, offset: number): Json => mkEnv({ audit: { everyNth: nth, offset } });

/** A parcels row as the step's source SQL selects it (same shape as materialize.logic.test.ts). */
const row = (id: number, o: Json = {}): Json => ({
  id, parcel_id: String(1000 + id), zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null,
  zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false,
  frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5, ...o,
});
/** Parcel 205238 (82 Kelsonia): RD, label f15.0 a557, exception x155, frontage 15.23 m. */
const P205238 = (o: Json = {}): Json => row(205238, { zoning_zn_string: 'RD (f15.0; a557) (x155)', exception_number: 155, frontage_m: 15.23, depth_m: 38.08, lot_size_sqm: 580.13, ...o });
/** The decoded logical results of lot `i` (arrays + the batch's own dictionaries). */
const decoded = (o: Json, i = 0): Json[] => lr().decodeLotResults({ lot: o.rows.lots[i], optionPairs: rb().optionPairs(SCOPE, VOCAB.design_options), pairs: PAIRS, classes: SCOPE.classes, map: MAP, dicts: lr().makeDecodeDicts({ units: o.rows.units, texts: o.rows.texts }) }) as Json[];
/** The logical rows read back on demand (disclosures recomputed, CHAT-180). */
const logical = (p: Json, env: Json): Json => {
  const out = mz().materializeBatch([p], env);
  return mz().logicalRowsOf(p, out.rows.lots[0], lr().makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts }), env) as Json;
};
const hit = (rows: Json[], target: string): Json => {
  const r = rows.find((x) => x.class === 'detached_houseplex' && x.structure === 'principal' && x.target === target);
  expect(r, `a detached_houseplex/principal/${target} row`).toBeTruthy();
  return r as Json;
};
/** `required_lot_*` is not in the v1 scope (layer2-scope.json): these targets are skipped, not asserted. */
const inScope = (target: string): boolean => PAIRS.some((p) => p.target === target);

describe('T-i7a (red): the M-406 assumption leaves the I10 lock intact and the stored arrays carry the values it unlocks', () => {
  let out: Json;
  beforeAll(() => { out = mz().materializeBatch([P205238()], real(1, 0)); });

  it('the lot row has no gate and inputs_defaulted is 0, on the lot row and in the batch counter (I10)', () => {
    expect(out.rows.lots[0].lot_gate).toBeNull();
    expect(out.rows.lots[0].inputs_defaulted).toBe(0);
    expect(out.matched.inputs_defaulted).toBe(0);
  });

  it('the stored arrays decode to building_depth_m 19 and building_length_m 17 for the detached_houseplex class, not not_evaluated', () => {
    expect(inScope('building_depth_m')).toBe(true);
    expect(inScope('building_length_m')).toBe(true);
    const rows = decoded(out);
    for (const [target, value] of [['building_depth_m', 19], ['building_length_m', 17]] as Array<[string, number]>) {
      const r = hit(rows, target);
      expect({ target, status: r.status }, target).not.toEqual({ target, status: 'not_evaluated' });
      expect({ target, status: r.status, value: r.value }).toEqual({ target, status: 'applies', value });
      expect(r.value_kind, target).toBe('number');
    }
  });
});

describe('T-i7b (red): logicalRowsOf recomputes the assumption disclosure on read for the results that used it (CHAT-180)', () => {
  let v: Json;
  beforeAll(() => { v = logical(P205238(), real(1, 0)); });

  it('depth and length carry the closed "If the lot has changed since" sentence; a height row carries none of it', () => {
    expect(v.lot_gate).toBeNull();
    for (const target of ['building_depth_m', 'building_length_m']) {
      if (!inScope(target)) continue;
      const d = hit(v.rows as Json[], target).disclosures as string[] | null;
      expect(Array.isArray(d), target).toBe(true);
      expect((d as string[]).length, target).toBeGreaterThan(0);
      expect((d as string[]).some((s) => s.startsWith('If the lot has changed since')), `${target}: ${JSON.stringify(d)}`).toBe(true);
    }
    const h = (v.rows as Json[]).find((r) => r.class === 'detached_houseplex' && r.structure === 'principal' && r.target === 'height_m');
    expect(h).toBeTruthy();
    expect(((h as Json).disclosures || []).some((s: string) => s.startsWith('If the lot has changed since'))).toBe(false);
  });

  it('the disclosure is not a stored field: the lot row has no disclosures column', () => {
    const out = mz().materializeBatch([P205238()], mkEnv());
    for (const k of ['disclosures', 'disclosure_set_id', 'inputs_used']) expect(out.rows.lots[0], k).not.toHaveProperty(k);
  });
});

describe('T-i7c (lock, green on base): without the assumption the same lot stays not_evaluated:existing_building_facts', () => {
  it('depth and length are not_evaluated with an existing_building_facts reason and the gate stays null', () => {
    const p = P205238();
    const env = mkEnv({ vocab: { ...VOCAB, existing_assumption: {} } }); // the lot env of an older vocab: no assumption on the lot
    const out = mz().materializeBatch([p], env);
    expect(out.rows.lots[0].lot_gate).toBeNull();
    expect(out.rows.lots[0].inputs_defaulted).toBe(0);
    const rows = decoded(out);
    for (const target of ['building_depth_m', 'building_length_m']) {
      const r = hit(rows, target);
      expect(r.status, target).toBe('not_evaluated');
      expect(String(r.reason), target).toContain('existing_building_facts');
    }
    const v = logical(p, env);
    for (const target of ['building_depth_m', 'building_length_m']) {
      const r = hit(v.rows as Json[], target);
      expect(r.status, target).toBe('not_evaluated');
      expect(String(r.reason), target).toContain('existing_building_facts');
    }
    // M-155: the read path never invents a lawfully_existing value (it stays false in the lot's flags)
    const { lot } = rb().buildLotVector(p, env.lotEnv);
    expect(lot.flags.lawfully_existing).toBe(false);
    expect(lot.existing === undefined || lot.existing === null, 'no existing as-built facts on the lot without the assumption').toBe(true);
  });
});
