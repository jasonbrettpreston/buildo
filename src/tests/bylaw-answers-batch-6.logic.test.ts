// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-158, M-169(4), M-175, M-176(1), M-177, M-178, M-180, M-182,
//            M-187, M-192, M-196, M-205, M-211(3), M-214, M-216 (cited; batch-6 dated notes under M-169, M-187, M-192, M-196);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (rooftop_elements_exempt, forms_deferred,
//            townhouse_driveway_width, lawfully_existing_relief, r_pre1953_fsi_relief)
//
// Review answers batch 6 (live page DB dump envdb12, 2026-10-20; operator: "bylaws updte - all review now"): 59 new answers,
// mostly R zone 10.10.*, ruled by provision family across the parallel chapters (10.20 / 10.40 / 10.60 / 10.80 mirror
// 10.10), plus the three batch-5 null answers the operator has since answered "disclose". Production path as batches 3-5.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const spec78 = read('docs/specs/01-pipeline/78_optimal_lot_configuration.md');
const code = (c: string): string => (spec78.split('\n').find((l) => l.startsWith(`| \`${c}\` |`)) ?? '');
const disp = new Map<string, Json>(JSON.parse(read('docs/reference/envelope-answer-dispositions.json')).dispositions.map((d: Json) => [d.unit_id, d]));

const T = {
  "ROOF15_ANT": "On a building taller than 15.0 m, antennae on the roof may rise up to 5.0 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF15_FLAG": "On a building taller than 15.0 m, flagpoles on the roof may rise up to 5.0 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF15_DISH": "On a building taller than 15.0 m, satellite dishes on the roof may rise up to 5.0 m above the height limit; rooftop elements are design details and are not modelled.",
  "TH_SUITE": "A secondary suite is permitted in a townhouse; townhouses, and a secondary suite in a townhouse, are not modelled in this release.",
  "GARDEN_LAWFUL": "For garden suites, a building or use that existed or was authorized on or before February 3, 2022 counts as lawfully existing.",
};

describe('M-169(4) — R rooftop allowances over 15.0 m (10.10.40.10(8)) are disclosed, never evaluated (rooftop_elements_exempt)', () => {
  for (const [id, k] of [['10.10.40.10(8)#(8)(A)', 'ROOF15_ANT'], ['10.10.40.10(8)#(8)(B)', 'ROOF15_FLAG'], ['10.10.40.10(8)#(8)(C)', 'ROOF15_DISH']] as [string, keyof typeof T][]) {
    it(`${id} carries its rooftop sentence`, () => {
      expect(unitOf(id).disclosure).toBe(T[k]);
    });
  }
  it('rooftop_elements_exempt cites R 10.10.40.10(8)', () => {
    expect(code('rooftop_elements_exempt')).toMatch(/R 10\.10\.40\.10\(8\)/);
  });
});

describe('PIN NONRES-4 / SCOPE-TOWER-1 — the Eglinton transit and tower arms answered "disclose" are pinned, no disclosure applied', () => {
  for (const id of ['10.10.40.71(1)#whole', '10.10.40.10(10)#(10)(A)', '10.10.40.10(10)#(10)(B)', '10.10.40.10(10)#(10)(C)']) {
    it(`${id} carries no disclosure and its disposition names the pin`, () => {
      expect(unitOf(id).disclosure).toBe('none');
      expect(disp.get(id)?.corrected_value).toMatch(/PIN (NONRES-4|SCOPE-TOWER-1): out of scope/);
    });
  }
});

describe('M-196(1) / M-214(3) — R 10.10.20.41(6) and the townhouse suite host 150.10.20.1(1)(C) (forms_deferred)', () => {
  it('10.10.20.41(6) names M-196(1) and M-214(3) in its gaps', () => {
    expect(unitOf('10.10.20.41(6)#whole').calculation_handling.gaps).toMatch(/M-196\(1\).*M-214\(3\)/);
  });
  it('150.10.20.1(1)(C) carries the townhouse-suite sentence', () => {
    expect(unitOf('150.10.20.1(1)#(1)(C)').disclosure).toBe(T.TH_SUITE);
  });
});

describe('M-176(1) / M-187 Q4 / M-214 — R 10.10.30.20(1)(C) per-unit frontage is disclosed (parallel chapters)', () => {
  it('10.10.30.20(1)(C) names the driveway trade-off and the forms not modelled', () => {
    expect(unitOf('10.10.30.20(1)#(1)(C)').calculation_handling.gaps).toMatch(/M-176\(1\) \/ M-187 Q4.*M-214\(2\)\/\(3\)/);
  });
});

describe('M-211(3) / M-178 — renovation and lawful-date readings', () => {
  it('10.10.40.40(2)(A) names the pre-1953 FSI 0.69 relief as disclosed, never applied', () => {
    expect(unitOf('10.10.40.40(2)#(2)(A)').calculation_handling.gaps).toMatch(/M-211\(3\) \(with M-192\).*r_pre1953_fsi_relief/);
  });
  it('150.7.1(2) carries the garden-suite lawful-date sentence', () => {
    expect(unitOf('150.7.1(2)#whole').disclosure).toBe(T.GARDEN_LAWFUL);
  });
});

describe('the operator\'s explicit "disclose" on the three batch-5 null answers is honoured', () => {
  for (const [id, c] of [['10.5.30.11(3)#whole', 'vacant_existing_lot'], ['10.5.40.10(3)#(3)(B)', 'rooftop_elements_exempt'], ['10.5.40.71(2)#whole', 'lawfully_existing_relief']] as [string, string][]) {
    it(`${id} is disclosed_by ${c}`, () => {
      const d = disp.get(id);
      expect([d?.verdict, d?.disposition, d?.disclosure_code]).toEqual(['disclose', 'disclosed_by', c]);
      expect(unitOf(id).disclosure).not.toBe('none');
    });
  }
});

const tracker = new Map<string, Json>(JSON.parse(read('docs/reports/generated/envelope-answer-tracker.json')).rows.map((r: Json) => [r.unit_id, r]));
const PINS: [string, string][] = [
  ['5.10.40.70(6)#(6)(B)', 'NONRES-1'], ['5.10.40.80(1)#(1)(B)', 'NONRES-2'], ['10.5.40.60(4)#(4)(B)', 'SCOPE-100UNITS-1'],
  ['10.10.40.71(1)#whole', 'NONRES-4'], ['10.10.40.10(10)#(10)(A)', 'SCOPE-TOWER-1'], ['10.10.40.10(10)#(10)(B)', 'SCOPE-TOWER-1'],
  ['10.10.40.10(10)#(10)(C)', 'SCOPE-TOWER-1'],
];
describe('verify-12f N1 / N8 — pinned rows carry scope_pin and the tracker says they are pinned out of scope', () => {
  for (const [id, pin] of PINS) {
    it(`${id} is pinned ${pin}, UNFIXED, reason "pinned out of scope"`, () => {
      expect(disp.get(id)?.scope_pin).toBe(pin);
      expect([tracker.get(id)?.state, tracker.get(id)?.reason]).toEqual(['UNFIXED', `pinned out of scope (PIN ${pin}): answer kept, no disclosure applied`]);
    });
  }
  it('no disposition calls the 100-unit cladding arm or the tower arms non-residential', () => {
    for (const id of ['10.5.40.60(4)#(4)(B)', '10.10.40.10(10)#(10)(A)']) expect(disp.get(id)?.corrected_value).toMatch(/residential but outside the MaxBLD building types/);
  });
});

describe('verify-12f N6 — 10.5.40.11(2) is re-cited to M-192 alone', () => {
  it('10.5.40.11(2) disposition and correction cite M-192, not M-211', () => {
    expect(disp.get('10.5.40.11(2)#whole')?.fix_ids).toEqual(['M-192']);
    const c = (JSON.parse(read('scripts/seeds/bylaw/adjudications.json')).adjudications as Json[]).find((x) => x.id === 'COR-10.5.40.11(2)#whole/calculation_handling');
    expect(c?.rule).toBe('Spec 69a M-192; Spec 78 P5.12 lawfully_existing_relief; M-75');
  });
});

describe('verify-12f N3 — M-228 / M-229 rows say the computation is owed to step commit ①', () => {
  for (const id of ['10.5.30.20(1)#(1)(A)', '10.5.30.20(1)#(1)(B)', '10.5.40.40(2)#whole']) {
    it(`${id} names the owed computation`, () => {
      expect(disp.get(id)?.corrected_value).toMatch(/is owed to the Spec 78 Phase-5 step commit ① \(P5\.(5|13)/);
    });
  }
});
