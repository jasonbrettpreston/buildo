// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-379 (dated note 2026-11-11), M-386; docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.2 item 11
//
// MB-27 increment 4 · test helper (no test of its own): the golden 25 through the Layer 2 pure core (the OR-7 loader of
// disclosure-carriage.logic.test.ts), decoded per class, and the step's own rows per building type, so a lock can compare
// the suite house with the detached house. Read-only: fixtures and seeds only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
export const ROOT = process.cwd();
export const req = createRequire(path.join(ROOT, 'package.json'));
export const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const G25 = 'src/tests/fixtures/layer3/golden-25';
export const HEADLINE_ON: Record<string, string> = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };
export const META = { layer2_table_version: 'g25', settings_sha: 'g25' };

/** The seeds as the step reads them, with the increment-2 headline switched on (the golden-25 form). */
export function seeds(): Json {
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const s: Json = {
    catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
    switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
    buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
    logicVariables: readJson('scripts/seeds/logic_variables.json'),
    vocab: readJson('scripts/seeds/bylaw/vocab.json'),
    layer2Classes: SCOPE.classes,
    layer2Options: SCOPE.options,
  };
  for (const [id, state] of Object.entries(HEADLINE_ON)) {
    const row = (s.switchboard.rows as Json[]).find((r) => r.id === id);
    if (row) row.state = state;
  }
  return s;
}

/** Each golden lot (by case prefix, e.g. A0175): its decoded cells and option cells per class, the inputs line and the expected line. */
export function goldenLots(): Map<string, Json> {
  return goldenLotsWithEnv().lots;
}

/** The same, with the Layer 1 env (for the disclosure recompute) and each lot's stored source (lot row, parcels row, permission words). */
export function goldenLotsWithEnv(): { lots: Map<string, Json>; env: Json } {
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
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
  const expected = readJsonl(`${G25}/expected.jsonl`);
  const lines = readJsonl(`${G25}/inputs.jsonl`);
  const lots = new Map<string, Json>();
  for (const lot of out.rows.lots) {
    const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;
    const cells = lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option);
    const options = lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs });
    const byClass = (cls: string) => ({
      l2: C.decodeCells(cells, cls, 'principal').cells,
      l2Options: C.decodeOptionCells(options, cls, 'principal', { designOptions: VOCAB.design_options, notAbove: MZ.withNotAbove }),
    });
    const source = { parcel_id: lot.parcel_id, lot, parcel: parcels.find((p) => p.id === lot.parcel_id), permitted_by_class: lr.decodePermitted({ lot, classes: SCOPE.classes, map: MAP, dicts }) };
    lots.set(String(e.case).split('_')[0] as string, { parcel_id: lot.parcel_id, e, line: lines.find((l) => l.case === e.case), byClass, source });
  }
  return { lots, env };
}

/** The step's own parcel input for one building type of one golden lot (units and units_floor from the building-types row). */
export function parcelInput(lot: Json, bt: Json): Json {
  const line = lot.line as Json;
  const p = line.parcel || {};
  const neighbours = (line.abutments || []).map((a: Json) => ({ same_street: a.sameStreet, residential: a.res, bldg_m: a.bldg, est: a.est, est_status: a.st }));
  const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
  const c = lot.byClass(bt.class);
  return {
    parcel_id: lot.parcel_id, buildingType: bt.id, l2: c.l2, l2Options: c.l2Options,
    perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
    geometry: { lot_frontage_m: p.frontage, lot_depth_m: p.depth, lot_area_m2: p.area }, flags: { corner_lot: p.corner },
    neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: bt.units, bt_units_floor: bt.units_floor },
  };
}

/** Any parcels-rows fixture through the same pure core: parcel id -> its decoded principal cells per class and the decoded permission. */
export function decodedLots(parcelsRel: string): Map<number, Json> {
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const parcels = readJson(parcelsRel) as unknown as Json[];
  const out = MZ.materializeBatch(parcels, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const lots = new Map<number, Json>();
  for (const lot of out.rows.lots) {
    const cells = lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option);
    lots.set(lot.parcel_id, {
      parcel: parcels.find((p) => p.id === lot.parcel_id),
      raw: cells,
      cells: (cls: string, structure = 'principal') => C.decodeCells(cells, cls, structure).cells,
      permitted: lr.decodePermitted({ lot, classes: SCOPE.classes, map: MAP, dicts }),
    });
  }
  return lots;
}
