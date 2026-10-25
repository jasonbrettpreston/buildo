// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the logical row shape), §4 (status sets), §10 (consumers read the logical row)
// Handbook: operator CHAT-77.freeze (the 11-field logical row is frozen; the physical form may change behind ONE accessor) and CHAT-80.QP (option 4)
//
// The physical form is now positional arrays plus two dictionaries. This file pins that the LOGICAL row read back from it is still exactly the
// frozen 11 fields and equals what the uncached evaluator says for the same (class, structure, target): eight fields decode from the lot row,
// inputs_used / losers / disclosures are recomputed on read (scripts/lib/bylaw-materialize.js logicalRowsOf). The output is the flat
// { lot_gate, permitted_by_class, rows: [{class, structure, target, ...11 fields}] } shape that scripts/lib/maxbld-layer2-view.js (wf1/p3plan)
// fromLogicalRows consumes; the P3 accessor run over it is recorded in the lane report (the accessor is not on this branch).

import { describe, expect, it } from 'vitest';
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const E = require(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')) as Json;

const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
/** CHAT-77.freeze, spelled out (not derived from the code under test). */
const FROZEN = ['status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers', 'disclosures'];

const mkEnv = (): Json => mz().makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: ['R', 'RD', 'RS', 'RT', 'RM'], versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
const parcel = (id: number, o: Json = {}): Json => ({
  id, parcel_id: String(1000 + id), zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null, zoning_overlays: {}, on_policy_road: false, is_corner_lot: false,
  is_through_lot: false, abuts_laneway: false, frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5, ...o,
});
const authoredRM = (): number => {
  const re = new RegExp(`^900\\.${VOCAB.exception_chapter.RM}\\.10\\((\\d+)\\)$`);
  return Number(re.exec(Object.keys(INPUT.body.authored).find((k) => re.test(k) && INPUT.body.authored[k] === 'authored') as string)![1]);
};
const rm = parcel(2, { zoning_class: 'RM', zoning_zn_string: `RM (f15.0; a550; u4) (x${authoredRM()})`, exception_number: authoredRM() });
const gated = parcel(3, { zoning_is_ambiguous: true });

/** The stored lot row plus the dictionaries, as the accessor would read them, then the logical rows. */
function logical(p: Json, env: Json): Json {
  const out = mz().materializeBatch([p], env);
  const dicts = lr().makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  return mz().logicalRowsOf(p, out.rows.lots[0], dicts, env) as Json;
}

describe('CHAT-77.freeze: the logical row is exactly the 11 frozen fields, whatever the physical form', () => {
  it('LOGICAL_RESULT_FIELDS is the spelled-out list, in order', () => {
    expect([...mz().LOGICAL_RESULT_FIELDS]).toEqual(FROZEN);
    expect(FROZEN).toHaveLength(11);
  });

  it('every row read back has the identity (class, structure, target) and exactly the 11 fields, for every class and pair', () => {
    const env = mkEnv();
    const v = logical(parcel(1), env);
    expect(Object.keys(v).sort()).toEqual(['lot_gate', 'permitted_by_class', 'rows']);
    expect(v.rows).toHaveLength(SCOPE.classes.length * 53);
    const seen = new Set<string>();
    for (const r of v.rows as Json[]) {
      expect(Object.keys(r).sort(), `${r.class}/${r.structure}/${r.target}`).toEqual(['class', 'structure', 'target', ...FROZEN].sort());
      seen.add(`${r.class}/${r.structure}/${r.target}`);
    }
    expect(seen.size).toBe(v.rows.length);
  });

  it('the stored fields and the recomputed fields equal the uncached evaluator, for an RD lot and an RM lot with an authored exception, every class and pair', () => {
    const env = mkEnv();
    for (const p of [parcel(1), rm]) {
      const v = logical(p, env);
      expect(v.lot_gate).toBeNull();
      for (const r of v.rows as Json[]) {
        const lot = mz().classLotFor(p, r.structure, r.class, env);
        const { candidates } = E.loadCandidates(lot, INPUT.body.units);
        const want = E.effective(lot, r.target, candidates, env.ctx);
        const l2 = rb().layer2Status(want, MAP);
        const where = `${p.id} ${r.class}/${r.structure}/${r.target}`;
        expect({ s: r.status, reason: r.reason }, where).toEqual({ s: l2.status, reason: l2.reason });
        if (l2.status === 'applies') expect(r.value_kind === 'number' ? r.value : r.value_kind, where).toEqual(typeof want.value === 'number' ? want.value : r.value_kind);
        else expect({ v: r.value, k: r.value_kind, w: r.winner_unit_id }, where).toEqual({ v: null, k: null, w: null });
        expect(r.inputs_used, where).toEqual([...new Set<string>((want.inputs || []).filter((x: string) => !rb().CLASS_INPUT_PATHS.includes(x)))].sort());
        expect(r.losers === null ? [] : r.losers, where).toEqual((want.losers || []).map((l: Json) => ({ unit_id: l.unit_id, dropped_by: l.dropped_by, by: l.by === undefined ? null : l.by })));
        expect(r.disclosures === null ? [] : r.disclosures, where).toEqual([...new Set<string>((want.disclosures || []).map((d: unknown) => (typeof d === 'string' ? d : JSON.stringify(d))))].sort());
        if (r.winner_unit_id !== null) expect(candidates.find((u: Json) => u.unit_id === r.winner_unit_id).layer, where).toBe(r.winner_layer);
      }
    }
  });

  it('permitted_by_class equals the evaluator\'s own words for every class', () => {
    const env = mkEnv();
    const v = logical(parcel(1), env);
    for (const c of SCOPE.classes as string[]) {
      const lot = mz().classLotFor(parcel(1), 'principal', c, env);
      const { candidates } = E.loadCandidates(lot, INPUT.body.units);
      const p = E.permitted(lot, VOCAB.scenario_class_units[c].building_type, candidates, env.ctx);
      const want: Json = p.status === 'permitted' ? { status: 'permitted' } : p.status === 'prohibited' ? { status: 'prohibited', clause: [...new Set<string>(p.winners || [])].sort().join(',') } : { status: 'not_evaluated', reason: String(p.reason) };
      expect(v.permitted_by_class[c], c).toEqual(want);
    }
  });

  it('a gated lot reads back as the gate, not_evaluated everywhere with the gate reason, empty inputs_used and no losers or disclosures', () => {
    const env = mkEnv();
    const v = logical(gated, env);
    expect(v.lot_gate).toBe('ambiguous_zone');
    for (const r of v.rows as Json[]) expect({ s: r.status, reason: r.reason, w: r.winner_unit_id, i: r.inputs_used, l: r.losers, d: r.disclosures }).toEqual({ s: 'not_evaluated', reason: 'ambiguous_zone', w: null, i: [], l: null, d: null });
    for (const w of Object.values(v.permitted_by_class) as Json[]) expect(w).toEqual({ status: 'not_evaluated', reason: 'ambiguous_zone' });
  });

  it('reading is stable: two reads of the same stored row give identical logical rows, and a recomputation does not depend on the cache state of the env', () => {
    const a = JSON.stringify(logical(parcel(1), mkEnv()));
    const env = mkEnv();
    logical(rm, env); // warm the env's caches with another lot
    expect(JSON.stringify(logical(parcel(1), env))).toBe(a);
  });
});
