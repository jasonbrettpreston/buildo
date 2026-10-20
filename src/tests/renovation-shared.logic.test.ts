// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.7 (the shared pure module), P5.12
//            (`through_lot_front_line`, `mechanical_attic_excluded`), P5.13 (the M-228 / M-229 vectors, added 2026-10-20);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-228, M-229 (operator 2026-10-20, "1 & 2 y").
//
// The pure functions are built ahead of compute_maxbld_scenarios ① (scenario plan N1 (a) / N6a); the step's wiring is
// OWED to ①. Every law number comes from the registry: the 10.5.40.40(2) literals are read from
// docs/reference/bylaw-provisions.json (`numeric_literals`), never typed here.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS shared module, as cost-model-shared.js
const RS = require('../../src/features/leads/lib/renovation-shared');

type Lit = { clause_path: string; raw: string; unit: string; value: number };
const provisions = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/reference/bylaw-provisions.json'), 'utf8'));
const row = provisions.rows.find((r: { regulation_id: string }) => r.regulation_id === '10.5.40.40(2)');
const lit = (unit: string): Lit => {
  const l = (row.numeric_literals as Lit[]).filter((x) => x.unit === unit);
  if (l.length !== 1) throw new Error(`10.5.40.40(2): expected one ${unit} literal, got ${l.length}`);
  return l[0] as Lit;
};
// 10.5.40.40(2): "not more than 5% of the permitted maximum gross floor area of the building to a maximum of 20 square metres"
const CLAUSE = { share: lit('pct').value / 100, max_sqm: lit('m2').value };

describe('renovation-shared — purity (Spec 78 P5.7; Spec 124 R-BZ / R-CA)', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/features/leads/lib/renovation-shared.js'), 'utf8');
  it('imports nothing and touches no clock, randomness, process, locale or I/O', () => {
    expect(src.match(/\brequire\(|\bimport\b|Date\b|Math\.random|process\.|toLocale|Intl\.|fetch\(/g) ?? []).toEqual([]);
  });
  it('the 10.5.40.40(2) literals are registered and quoted verbatim', () => {
    expect(row.verbatim).toContain('not more than 5% of the permitted maximum gross floor area of the building to a maximum of 20 square metres');
    expect([lit('pct').raw, lit('m2').raw]).toEqual(['5%', '20 square metres']);
  });
});

describe('M-228 — a through lot takes its front lot line on its address street (10.5.30.20(1)(B))', () => {
  const lines = [{ line_id: 'e1', street_name: 'Example Ave' }, { line_id: 'e3', street_name: 'Back St' }];
  it('through lot: front on the address street, rear on the other, disclosed through_lot_front_line', () => {
    expect(RS.throughLotFrontLine({ isThroughLot: true, addressStreet: 'EXAMPLE  AVE ', streetLines: lines })).toEqual({
      status: 'applies', front_line_id: 'e1', rear_line_ids: ['e3'], front_street: 'Example Ave',
      disclosure: { code: 'through_lot_front_line', params: { street: 'Example Ave' } }, candidates: [],
    });
    expect(RS.throughLotFrontLine({ isThroughLot: true, addressStreet: 'Back St', streetLines: lines }).front_line_id).toBe('e3');
  });
  it('not a through lot: not_applicable, no disclosure', () => {
    const r = RS.throughLotFrontLine({ isThroughLot: false, addressStreet: 'Example Ave', streetLines: lines });
    expect([r.status, r.disclosure]).toEqual(['not_applicable', null]);
  });
  it('the address street on no street line, on both, or missing: undecided with the candidates, never a guess', () => {
    for (const [addressStreet, ls] of [['Elsewhere Rd', lines], [null, lines], ['Same St', [{ line_id: 'a', street_name: 'Same St' }, { line_id: 'b', street_name: 'Same St' }]]] as const) {
      const r = RS.throughLotFrontLine({ isThroughLot: true, addressStreet, streetLines: ls });
      expect([r.status, r.front_line_id, r.disclosure, r.candidates.length]).toEqual(['undecided', null, null, 2]);
    }
  });
});

describe('M-229 — mechanical attic area is left out of GFA (10.5.40.40(2); amends M-171)', () => {
  it('pitched roof, counted attic, FSI binds: GFA stays at the cap and the build gains min(5 % × max GFA, 20 m²)', () => {
    // max GFA 300 m² (FSI × lot); plates 290 m² + counted attic 40 m² = 330 m² gross; 5 % × 300 = 15 m² < 20 m²
    expect(RS.mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: 40, grossFloorAreaSqm: 330, permittedMaxGfaSqm: 300, clause: CLAUSE })).toEqual({
      excluded_sqm: 15, floor_area_sqm: 315, gfa_sqm: 300, gain_sqm: 15, disclosure: { code: 'mechanical_attic_excluded', params: { X: 15 } },
    });
  });
  it('the 20 m² cap binds on a large permitted GFA', () => {
    // plates 590 m² + attic 60 m²; 5 % × 600 = 30 m² > 20 m²
    const r = RS.mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: 60, grossFloorAreaSqm: 650, permittedMaxGfaSqm: 600, clause: CLAUSE });
    expect([r.excluded_sqm, r.floor_area_sqm, r.gfa_sqm, r.gain_sqm]).toEqual([20, 620, 600, 20]);
  });
  it('never more than the attic built', () => {
    const r = RS.mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: 8, grossFloorAreaSqm: 308, permittedMaxGfaSqm: 300, clause: CLAUSE });
    expect([r.excluded_sqm, r.floor_area_sqm, r.gfa_sqm, r.gain_sqm]).toEqual([8, 308, 300, 8]);
  });
  it('a flat-roof design or a failing attic (outside GFA already, M-203) is unchanged', () => {
    for (const atticCounted of [false]) {
      const r = RS.mechanicalAtticExclusion({ atticCounted, atticFloorAreaSqm: 40, grossFloorAreaSqm: 330, permittedMaxGfaSqm: 300, clause: CLAUSE });
      expect(r).toEqual({ excluded_sqm: 0, floor_area_sqm: 300, gfa_sqm: 300, gain_sqm: 0, disclosure: null });
    }
    const flat = RS.mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: 0, grossFloorAreaSqm: 300, permittedMaxGfaSqm: 300, clause: CLAUSE });
    expect([flat.excluded_sqm, flat.gain_sqm, flat.disclosure]).toEqual([0, 0, null]);
  });
  it('FSI not binding: the area is still outside GFA, the build does not grow', () => {
    const r = RS.mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: 40, grossFloorAreaSqm: 280, permittedMaxGfaSqm: 300, clause: CLAUSE });
    expect([r.excluded_sqm, r.floor_area_sqm, r.gfa_sqm, r.gain_sqm]).toEqual([15, 280, 265, 0]);
  });
  it('no permitted maximum GFA (FSI not_applicable / unlimited): no base for the share, no exclusion, the build unchanged', () => {
    const r = RS.mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: 40, grossFloorAreaSqm: 330, permittedMaxGfaSqm: null, clause: CLAUSE });
    expect(r).toEqual({ excluded_sqm: 0, floor_area_sqm: 330, gfa_sqm: 330, gain_sqm: 0, disclosure: null });
  });
});
