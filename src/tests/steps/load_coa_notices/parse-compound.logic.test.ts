// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5 (rule (b), fold LCN-D4)
//
// RED/GREEN lock for the compound-sentence parse (operator ruling LCN-D4, 2026-10-07: fix the
// parser, keep C3 at 0.85/0.80). The default loads the library; `COA_PARSE_IMPL=<path>` loads
// another implementation (the red run used the commit-A parser, aca09e37). Every T-CMP case is
// red against that parser and green against the fold (Spec 08 §11.4, both directions).
// The T-CMP-N cases are NEGATIVE locks: they stay non-pair under both parsers, so the fold
// cannot buy pair rate by guessing.
//
// ALL test text is SYNTHETIC: invented sentences in the notices' grammar, no real address or
// person.
import { describe, it, expect } from 'vitest';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const IMPL = process.env.COA_PARSE_IMPL || 'scripts/lib/coa-notices/parse-values.js';

type Item = {
  required_value: number | null;
  required_unit: string | null;
  proposed_value: number | null;
  proposed_unit: string | null;
  parse_status: string;
  parse_confidence: string;
  qualified: boolean;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS implementation chosen by env
const P = require(path.isAbsolute(IMPL) ? IMPL : path.join(REPO_ROOT, IMPL)) as {
  classifyItem: (item: { head: string; body: string; groupBylaw?: string; targetFamily?: string | null }) => Item;
  extractValues: (s: string) => Array<{ value: number; unit: string | null; index: number }>;
};

const HEAD = 'Chapter 10.20.40.10.(1), By-law No. 569-2013';
const item = (body: string) => P.classifyItem({ head: HEAD, body, groupBylaw: '569-2013' });

function expectPair(r: Item, req: [number, string], prop: [number, string]) {
  expect(r.parse_status).toBe('pair');
  expect([r.required_value, r.required_unit]).toEqual(req);
  expect([r.proposed_value, r.proposed_unit]).toEqual(prop);
}

describe('coa-notices compound-sentence parse (fold LCN-D4)', () => {
  it('T-CMP-1 an "X or Y times the lot area" alternative pairs the first aligned expression', () => {
    const r = item(
      'To permit the proposed 181.2 square metres floor area or 0.81 times the lot area, whereas the By-law permits a maximum 140.5 square metres floor area or 0.6 times the lot area.',
    );
    expectPair(r, [140.5, 'm2'], [181.2, 'm2']);
    expect(r.parse_confidence).toBe('medium');
  });

  it('T-CMP-2 a context value repeated on both sides is not the requirement', () => {
    const r = item(
      'To permit the proposed 6.1 square metres of the first floor to be within 4 metres of the front main wall, whereas the By-law requires a minimum 10 square metres of the first floor to be within 4 metres of the front main wall.',
    );
    expectPair(r, [10, 'm2'], [6.1, 'm2']);
  });

  it('T-CMP-3 a parenthetical equivalent is dropped in favour of the stated value', () => {
    const r = item(
      'The altered dwelling will cover 38% of the lot area (150.2 m²); the maximum permitted lot coverage is 33% of the lot area (130.4 m²).',
    );
    expectPair(r, [33, 'pct'], [38, 'pct']);
  });

  it('T-CMP-4 a "long by wide" dimension list aligns position by position', () => {
    const r = item(
      'The front yard parking space will measure 4.7 m long by 2.6 m wide; the minimum required dimensions of a parking space are 5.6 m long by 3.2 m wide.',
    );
    expectPair(r, [5.6, 'm'], [4.7, 'm']);
  });

  it('T-CMP-5 an enumerated (i)/(ii) list aligns position by position', () => {
    const r = item(
      'To permit (i) a side yard setback of 0.6 metres on the east side and (ii) 0.45 metres on the west side, whereas the By-law requires (i) a minimum side yard setback of 1.2 metres on the east side and (ii) 0.9 metres on the west side.',
    );
    expectPair(r, [1.2, 'm'], [0.6, 'm']);
  });

  it('T-CMP-6 a conditional clause is used only when it holds the only value, and flags qualified', () => {
    const r = item(
      'The front exterior stairs will be located 0 m from the front lot line. Exterior stairs may encroach into a required building setback if the stairs are no closer to a lot line than 0.6 m.',
    );
    expectPair(r, [0.6, 'm'], [0, 'm']);
    expect(r.qualified).toBe(true);
    expect(r.parse_confidence).toBe('medium');
  });

  it('T-CMP-7 a conditional value never displaces the main requirement', () => {
    const r = item(
      'To permit eaves projecting 0.75 metres into the side yard, whereas the By-law permits eaves to encroach a maximum 0.6 metres, provided they are no closer than 0.3 metres to a lot line.',
    );
    expectPair(r, [0.6, 'm'], [0.75, 'm']);
    expect(r.qualified).toBe(true);
  });

  it('T-CMP-8 a sentence boundary without a period after a unit is still a boundary', () => {
    const r = item(
      'The maximum permitted building depth is 19.0m The proposed building depth is 19.7m.',
    );
    expectPair(r, [19, 'm'], [19.7, 'm']);
  });

  it('T-CMP-9 a value-bearing sentence beside a requirement, with no side words, is the proposed side', () => {
    const r = item(
      'A minimum of 10 m² of the first floor must be within 4 m of the front main wall. 4.7 m² of the first floor is within 4 m of the front main wall.',
    );
    expectPair(r, [10, 'm2'], [4.7, 'm2']);
  });

  it('T-CMP-10 number words and "no" before a unit are values', () => {
    expectPair(
      item(
        'In this case, one parking space will be provided. A minimum of two parking spaces are required.',
      ),
      [2, 'spaces'],
      [1, 'spaces'],
    );
    expectPair(
      item('No parking spaces will be provided. A total of one parking space is required.'),
      [1, 'spaces'],
      [0, 'spaces'],
    );
    expectPair(
      item(
        'The rear garage will have a height of two storeys. An ancillary building is permitted a maximum height of one storey.',
      ),
      [1, 'storeys'],
      [2, 'storeys'],
    );
  });

  it('T-CMP-11 "the number of storeys is N" reads the unit before the number', () => {
    expectPair(
      item('The proposed number of storeys is 3. The maximum permitted number of storeys is 2.'),
      [2, 'storeys'],
      [3, 'storeys'],
    );
  });

  it('T-CMP-12 a reversed whereas with both sides unambiguous is swapped, not dropped', () => {
    const r = item(
      'The By-law requires a minimum front yard setback of 6 metres, whereas the proposed front yard setback will be 4.8 metres.',
    );
    expectPair(r, [6, 'm'], [4.8, 'm']);
    expect(r.parse_confidence).toBe('medium');
  });

  it('T-CMP-13 "the required <noun>" is an adjective, not a requirement marker', () => {
    const r = item(
      'A total of 51% of the required front yard landscaping will be maintained as soft landscaping; a minimum of 75% of the required front yard landscaping shall be maintained as soft landscaping.',
    );
    expectPair(r, [75, 'pct'], [51, 'pct']);
  });

  it('T-CMP-13b "The required <noun> is N" with no proposed word stays a requirement (guardian F1)', () => {
    expectPair(
      item(
        'The proposed front yard setback is 4.8 metres. The required front yard setback is 6 metres.',
      ),
      [6, 'm'],
      [4.8, 'm'],
    );
  });

  it('T-CMP-14"or" inside a noun phrase ("building or structure") is not a compound', () => {
    const r = item(
      'The height of the building will be 8.9 m. The maximum permitted height of a building or structure is 8.5 m.',
    );
    expectPair(r, [8.5, 'm'], [8.9, 'm']);
  });

  it('T-CMP-15 several proposals against one requirement pair the one that deviates most along the bound', () => {
    const r = item(
      'The altered dwelling will be located 0.65 m from the east side lot line and 1.35 m from the west side lot line; the minimum required side yard setback is 1.8 m.',
    );
    expectPair(r, [1.8, 'm'], [0.65, 'm']);
    expect(r.parse_confidence).toBe('medium');
  });

  it('T-CMP-16 among several proposals, the one the requirement names wins over position and bound', () => {
    const r = item(
      'The width of the parking space will be 3.3 m and the proposed driveway width will be 3.6 m; the minimum required driveway width is 6 m.',
    );
    expectPair(r, [6, 'm'], [3.6, 'm']);
  });

  // T-CMP-17/N7 come from the blind precision read of the fold (7 of 80 new pairs wrong, two
  // classes): a lot-line condition answers a lot-line proposal, and values far apart are not a list.
  it('T-CMP-17 a lot-line condition pairs with the lot-line proposal, not with the main limit', () => {
    const r = item(
      'The eaves will project 0.5 m and will be located 0.1 m from the south lot line. Roof eaves may project a maximum of 0.9 m provided that they are no closer than 0.3 m to a lot line.',
    );
    expectPair(r, [0.3, 'm'], [0.1, 'm']);
    expect(r.qualified).toBe(true);
    // the plural ("side lot lines") is the same measure (round-2 precision read)
    expectPair(
      item(
        'The eaves will be located 0.0 m from the east and west side lot lines. Roof eaves may project a maximum of 0.9 m provided that they are no closer than 0.3 m to a lot line.',
      ),
      [0.3, 'm'],
      [0, 'm'],
    );
  });

  // R1 (operator ruling 2026-10-09): a coordinated list whose positions are of MIXED families
  // pairs the unique position in the mapped target's family when a target family is known.
  describe('T-CMP-R1 coordinated member by target family', () => {
    const R1_HEAD = '1. Chapter 900.3.10(5), By-law 569-2013';
    const R1_BODY =
      'The maximum permitted floor space index is 120.0 square metres or 0.6 times the area of the lot, whereas the proposed floor space index is 150.0 square metres or 0.75 times the area of the lot.';
    const r1 = (targetFamily?: string) =>
      P.classifyItem({
        head: R1_HEAD,
        body: R1_BODY,
        groupBylaw: '569-2013',
        ...(targetFamily === undefined ? {} : { targetFamily }),
      } as { head: string; body: string; groupBylaw?: string; targetFamily?: string });

    it('T-CMP-R1-1 a mixed-family list pairs the unique position in the ratio family', () => {
      const r = r1('ratio');
      expect(r.parse_status).toBe('pair');
      expect([r.required_value, r.required_unit]).toEqual([0.6, 'ratio']);
      expect([r.proposed_value, r.proposed_unit]).toEqual([0.75, 'ratio']);
    });

    it('T-CMP-R1-2 a mixed-family list pairs the unique position in the area family', () => {
      const r = r1('area');
      expect(r.parse_status).toBe('pair');
      expect([r.required_value, r.required_unit]).toEqual([120, 'm2']);
      expect([r.proposed_value, r.proposed_unit]).toEqual([150, 'm2']);
    });

    it('T-CMP-R1-3 with no target family the list pairs position 0, unchanged', () => {
      const r = r1();
      expect(r.parse_status).toBe('pair');
      expect([r.required_value, r.required_unit]).toEqual([120, 'm2']);
      expect([r.proposed_value, r.proposed_unit]).toEqual([150, 'm2']);
    });

    it('T-CMP-R1-4 a same-family list pairs position 0 whatever the target family', () => {
      const r = P.classifyItem({
        head: HEAD,
        body: 'The proposed parking space is 5.2 m long by 2.4 m wide, whereas a parking space 5.6 m long by 2.6 m wide is required.',
        groupBylaw: '569-2013',
        targetFamily: 'length',
      } as { head: string; body: string; groupBylaw?: string; targetFamily?: string });
      expect(r.parse_status).toBe('pair');
      expect([r.required_value, r.required_unit]).toEqual([5.6, 'm']);
      expect([r.proposed_value, r.proposed_unit]).toEqual([5.2, 'm']);
    });
  });

  describe('negative locks: genuinely ambiguous text stays non-pair (closed reason codes)', () => {
    it('T-CMP-N7 a definitional value far from the limit is not aligned as a list', () => {
      const r = item(
        'The deck will encroach 2.9 m into the required rear yard setback and will be located 1.6 m from the side lot line. A platform attached to or less than 0.3 m from a building, with a floor no higher than the first floor of the building above established grade, may encroach into the required rear yard setback 2.5 m if it is no closer to a side lot line than 1.6 m.',
      );
      expect(r.parse_status).not.toBe('pair');
    });

    it('T-CMP-N1 a formula requirement ("plus" / "for each") stays multi_value_ambiguous', () => {
      expect(
        item(
          'To permit the proposed 0.78 times the area of the lot, whereas the By-law permits a maximum floor space index of 0.6 times the area of the lot plus 10 square metres.',
        ).parse_status,
      ).toBe('multi_value_ambiguous');
      expect(
        item(
          'To permit the proposed 9.1 metres, whereas the By-law permits a maximum height of 7.5 metres plus 0.3 metres for each 1 metre of lot frontage.',
        ).parse_status,
      ).toBe('multi_value_ambiguous');
    });

    it('T-CMP-N2 two same-family requirements against one proposal stay multi_value_ambiguous', () => {
      expect(
        item(
          'To permit the proposed side yard setback of 0.6 metres, whereas the By-law requires a minimum side yard setback of 1.2 metres on one side and 0.9 metres on the other side.',
        ).parse_status,
      ).toBe('multi_value_ambiguous');
    });

    it('T-CMP-N3 several proposals with no bound to choose by stay multi_value_ambiguous', () => {
      expect(
        item(
          'The platforms will be 2.1 m and 3.4 m deep; the By-law requires a platform depth of 2.5 m.',
        ).parse_status,
      ).toBe('multi_value_ambiguous');
    });

    it('T-CMP-N4 a proposal in another family stays unit_family_mismatch', () => {
      expect(
        item(
          'To permit the proposed 2.5 storeys, whereas the By-law permits a maximum height of 10 metres.',
        ).parse_status,
      ).toBe('unit_family_mismatch');
    });

    it('T-CMP-N5 a one-sided reversed whereas stays side_ambiguous', () => {
      expect(
        item(
          'The By-law requires a minimum front yard setback of 6 metres, whereas 4.8 metres exists.',
        ).parse_status,
      ).toBe('side_ambiguous');
    });

    it('T-CMP-N6 a requirement with no value anywhere stays no_required_value', () => {
      expect(
        item(
          'In this case, the vehicle access will be from the front street. Vehicle access on a corner lot must be from the flanking street.',
        ).parse_status,
      ).toBe('no_required_value');
    });
  });
});
