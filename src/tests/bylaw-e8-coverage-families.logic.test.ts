// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-251 (dated note 2026-11-11: the E8 hold in vocab unit_application),
//            M-182 (dated note 2026-11-11: houseplex family A, x.30.1(2) forms only on a mapped lot, the Q-D2 a form), M-180(2)/(3), M-252
//
// MB-27 increment 4 · McBylaws queue · lane E · RED FIRST (on the parent the suite takes the zone value over the exception on families
// A-C, and the houseplex takes "no lot coverage" on family A). Card ~/Buildo-scratch/mcbylaws/inc4/cards/CARD-D4-E8-FAMILY-B.md, lock.
// Fixtures: four 2 % sample parcels (~/Buildo-scratch/mcbylaws/inc3/impact/sample-parcels.json): 1641 (RM x18, LC unmapped: family A),
// 5612 (x383 40 %, LC mapped below 45: family B), 24256 (house not evaluated, lot-area band: family C), 20618 (RT x97, no family).
// Release: assertion block "the hold" changes only by a named move citing the D-4 ruling (the DL-21 form).
import { beforeAll, describe, expect, it } from 'vitest';
import { decodedLots, readJson, type Json } from './steps/compute_maxbld_scenarios/golden25-harness';

const FIX = 'src/tests/fixtures/layer3/increment-4/parcels-rows.json';
const SUITE = 'house_with_secondary_suite';
const cov = (lots: Map<number, Json>, pid: number, cls: string): Json => (lots.get(pid) as Json).cells(cls).lot_coverage_pct as Json;
const view = (c: Json) => [c.s, c.kind, c.value, c.clause];
let LOTS: Map<number, Json>;

beforeAll(() => {
  LOTS = decodedLots(FIX);
});

describe('the E8 hold (until D-4 rules): the suite keeps the exception coverage on families B and C', () => {
  it('five unit_application rows set the 10.x.30.1(2) units aside for detached_house, ruling "E8 hold ... until D-4"', () => {
    const ua = readJson('scripts/seeds/bylaw/vocab.json').unit_application as Json;
    const held = Object.keys(ua).filter((k) => /^10\.\d0\.30\.1\(2\)#whole$/.test(k)).sort();
    expect(held).toEqual(['10.10.30.1(2)#whole', '10.20.30.1(2)#whole', '10.40.30.1(2)#whole', '10.60.30.1(2)#whole', '10.80.30.1(2)#whole']);
    for (const k of held) {
      expect(ua[k].excluded_building_types).toEqual(['detached_house']);
      expect(ua[k].ruling).toBe('E8 hold (MB-27 increment 4, operator 2026-11-11; until D-4)');
    }
  });
  it('family B (5612): the suite equals the house, the exception 40 %, never the zone 45 %', () => {
    expect(view(cov(LOTS, 5612, SUITE))).toEqual(view(cov(LOTS, 5612, 'detached_house')));
    expect(view(cov(LOTS, 5612, SUITE))).toEqual(['applies', 'number', 40, '900.6.10(383)#(383)[SSP](A)']);
  });
  it('family C (24256): the suite equals the house, not evaluated, never 45 %', () => {
    expect(view(cov(LOTS, 24256, SUITE))).toEqual(view(cov(LOTS, 24256, 'detached_house')));
    expect(cov(LOTS, 24256, SUITE).s).toBe('not_evaluated');
  });
});

describe('family A (houseplex fix, operator "3. a"): "no lot coverage" never beats the exception number on an unmapped lot', () => {
  it('x.30.1(2) on RD, RS, RT and RM carries the mapped(LC) condition (the Q-D2 a COR form)', () => {
    const adj = readJson('scripts/seeds/bylaw/adjudications.json').adjudications as Json[];
    for (const z of ['20', '40', '60', '80']) {
      const a = adj.find((x) => x.id === `COR-10.${z}.30.1(2)#whole/condition`) as Json;
      expect(a && a.value).toEqual({ if: 'mapped(LC)', tokens: ['overlay_mapped'] });
    }
  });
  it('1641 (RM x18, LC unmapped): the suite and the houseplex both take the exception 33 %, never unregulated', () => {
    const want = ['applies', 'number', 33, '900.6.10(18)#(18)[SSP](C)'];
    expect(view(cov(LOTS, 1641, 'detached_house'))).toEqual(want);
    expect(view(cov(LOTS, 1641, SUITE))).toEqual(want);
    expect(view(cov(LOTS, 1641, 'detached_houseplex'))).toEqual(want);
  });
  // OUTPUT panel fold: the same condition reaches every class and structure the unit names (measured on the 2 % sample: semi-detached
  // houseplex 104 principal cells, the suite's garden_suite and laneway_suite structures 23 + 23); on 1641 the suite's ancillary cells keep the exception number
  it('1641: the semi-detached houseplex takes the exception 33 % too, and the suite\'s garden_suite / laneway_suite cells equal the detached house\'s', () => {
    const lot = LOTS.get(1641) as Json;
    expect(view(lot.cells('semi_detached_houseplex').lot_coverage_pct)).toEqual(['applies', 'number', 33, '900.6.10(18)#(18)[SSP](C)']);
    for (const st of ['garden_suite', 'laneway_suite']) expect([st, view(lot.cells(SUITE, st).lot_coverage_pct)]).toEqual([st, view(lot.cells('detached_house', st).lot_coverage_pct)]);
  });
  it('family B for the houseplex is left to D-4: 5612 keeps the increment-3 zone 45 % (M-180(2))', () => {
    expect(view(cov(LOTS, 5612, 'detached_houseplex'))).toEqual(['applies', 'number', 45, '10.80.30.40(1)#(1)(D)']);
  });
});

describe('E9 guard: no suite coverage cell ships the zone (D) value over an exception while the suite form of M-180(3) is absent', () => {
  it('disclosure-families.json has no suite form of the M-180(3) sentence, and no fixture suite cell is won by a 10.x.30.40(1)(D) unit over an exception house cell', () => {
    const fam = JSON.stringify(readJson('scripts/lib/compute/maxbld/disclosure-families.json'));
    expect(fam.includes('rule for a building with a secondary suite')).toBe(false);
    for (const pid of [1641, 5612, 24256, 20618]) {
      const h = cov(LOTS, pid, 'detached_house');
      const s = cov(LOTS, pid, SUITE);
      const overException = h.s !== 'applies' || String(h.clause || '').startsWith('900.');
      if (overException) expect(/^10\.\d0\.30\.40\(1\)#\(1\)\(D\)$/.test(String(s.clause || ''))).toBe(false);
    }
  });
});
