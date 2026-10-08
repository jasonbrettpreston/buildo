// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5
//
// RED/GREEN lock for the pure CoA-notice value extractors. The SAME suite runs against two
// implementations selected by env: `COA_PARSE_IMPL=spike` loads the P2-12a RED baseline
// (`src/tests/fixtures/coa-notices/spike-parser.cjs`); the default loads the library
// (`scripts/lib/coa-notices/parse-values.js`). Every `T-*` case below FAILS against the spike
// and PASSES against the library (Spec 08 §11.4 — a lock proven both directions).
//
// ALL test text is SYNTHETIC — invented sentences, no real person named.
import { describe, it, expect } from 'vitest';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const IMPL =
  process.env.COA_PARSE_IMPL === 'spike'
    ? 'src/tests/fixtures/coa-notices/spike-parser.cjs'
    : 'scripts/lib/coa-notices/parse-values.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS implementation chosen by env
const P = require(path.join(REPO_ROOT, IMPL)) as {
  relabelUnit: (raw: unknown) => string | null;
  unitFamily: (unit: unknown) => string | null;
  extractValues: (s: unknown) => Array<{ value: number; unit: string | null; index: number }>;
  classifySide: (s: unknown) => string | null;
  detectBound: (s: unknown) => string | null;
  isCompound: (s: unknown) => boolean;
  isQualified: (s: unknown) => boolean;
  splitPair: (s: unknown) => {
    required: string | null;
    proposed: string | null;
    method: string | null;
    reversed: boolean;
  };
  parseCitation: (head: unknown, groupBylaw?: unknown) => {
    cited_bylaw: string | null;
    citation_kind: string;
    regulation_id_as_cited: string | null;
    exception_ref: string | null;
    clause_count: number;
  };
  classifyItem: (item: { head: unknown; body: unknown; groupBylaw?: unknown }) => {
    cited_bylaw: string | null;
    citation_kind: string;
    regulation_id_as_cited: string | null;
    exception_ref: string | null;
    clause_count: number;
    required_value: number | null;
    required_unit: string | null;
    proposed_value: number | null;
    proposed_unit: string | null;
    parse_status: string;
    parse_confidence: string;
    bound: string | null;
    qualified: boolean;
  };
  mapTarget: (
    text: unknown,
    entries: Array<{ target: string; any: string[]; none: string[] }>,
  ) => { target: string; target_status: string; matched: string[] };
};

describe('coa-notices parse-values', () => {
  describe('T-PARSE unit-family pairing', () => {
    it('T-PARSE-a pair requires the same unit family', () => {
      const r = P.classifyItem({
        head: 'Chapter 10.10.40.30.(1), By-law No. 569-2013',
        body: 'To permit the proposed 2.5 storeys, whereas the By-law permits a maximum height of 10 metres.',
      });
      expect(r.parse_status).toBe('unit_family_mismatch');
      expect(r.required_value).toBe(10);
      expect(r.required_unit).toBe('m');
      expect(r.proposed_value).toBe(2.5);
      expect(r.proposed_unit).toBe('storeys');
      expect(r.parse_confidence).toBe('low');
    });
  });

  describe('T-PARSE compound detection', () => {
    it('T-PARSE-b a compound required side is multi_value_ambiguous at low confidence', () => {
      const r = P.classifyItem({
        head: 'Chapter 10.10.40.30.(1), By-law No. 569-2013',
        body: 'To permit the proposed 0.78 times the area of the lot, whereas the By-law permits a maximum floor space index of 0.6 times the area of the lot plus 10 square metres.',
      });
      expect(r.parse_status).toBe('multi_value_ambiguous');
      expect(r.parse_confidence).toBe('low');
      // values are still filled in
      expect(r.proposed_value).toBe(0.78);
      expect(r.proposed_unit).toBe('ratio');
      expect(r.required_value).toBe(0.6);
      expect(r.required_unit).toBe('ratio');
    });

    it('T-PARSE-b a single-value 569 chapter pair is high confidence', () => {
      const r = P.classifyItem({
        head: 'Chapter 10.10.40.30.(1), By-law No. 569-2013',
        body: 'To permit the proposed 0.9 metres, whereas the By-law requires a minimum side yard setback of 1.2 metres.',
      });
      expect(r.parse_status).toBe('pair');
      expect(r.parse_confidence).toBe('high');
      expect(r.proposed_value).toBe(0.9);
      expect(r.proposed_unit).toBe('m');
      expect(r.required_value).toBe(1.2);
      expect(r.required_unit).toBe('m');
      expect(r.bound).toBe('min');
    });
  });

  describe('T-PARSE reversed side', () => {
    it('T-PARSE-c a reversed whereas is side_ambiguous', () => {
      const r = P.classifyItem({
        head: 'Chapter 10.10.40.30.(1), By-law No. 569-2013',
        body: 'The By-law requires a minimum front yard setback of 6 metres, whereas the proposed front yard setback will be 4.8 metres.',
      });
      expect(r.parse_status).toBe('side_ambiguous');
      expect(r.parse_confidence).toBe('low');
    });
  });

  describe('T-PARSE number grammar', () => {
    it('T-PARSE-d1 a separated decimal yields no value', () => {
      const vals = P.extractValues('a ratio of 0 .357 times');
      expect(vals.length).toBe(0);
      expect(vals.some((v) => v.value === 357)).toBe(false);
      expect(vals.some((v) => v.value === 0)).toBe(false);
    });

    it('T-PARSE-d2 a thousands comma is grouped', () => {
      expect(P.extractValues('1,200 square metres')[0]).toMatchObject({ value: 1200, unit: 'm2' });
    });
  });

  describe('T-PARSE unit relabel', () => {
    it('T-PARSE-e relabels both ways and rejects unknown units', () => {
      expect(P.relabelUnit('metres')).toBe('m');
      expect(P.relabelUnit('square metres')).toBe('m2');
      expect(P.relabelUnit('m\u00b2')).toBe('m2');
      expect(P.relabelUnit('metres\u00b2')).toBe('m2');
      expect(P.relabelUnit('sq. m')).toBe('m2');
      expect(P.relabelUnit('%')).toBe('pct');
      expect(P.relabelUnit('times')).toBe('ratio');
      expect(P.relabelUnit('space')).toBe('spaces');
      expect(P.relabelUnit('spaces')).toBe('spaces');
      expect(P.relabelUnit('storey')).toBe('storeys');
      expect(P.relabelUnit('furlongs')).toBe(null);
    });
  });

  describe('T-PARSE citation parsing', () => {
    it('T-PARSE-g keeps a digit-initial by-law token and drops a non-digit one', () => {
      const a = P.parseCitation('Section 6(3) Part II 3.B(II), By-law No. A-438-86');
      expect(a.cited_bylaw).not.toBe('A-438-86');
      expect(a.cited_bylaw).toBe(null);
      expect(a.citation_kind).toBe('none');
    });

    it('T-PARSE-g keeps the exception ref alongside a chapter regulation', () => {
      const b = P.parseCitation('Chapter 10.20.40.70.(1)(A) & Exception RD 5, By-law No. 569-2013');
      expect(b.regulation_id_as_cited).toBe('10.20.40.70(1)(A)');
      expect(b.exception_ref).toBe('RD5');
      expect(b.citation_kind).toBe('chapter_regulation');
      expect(b.cited_bylaw).toBe('569-2013');
    });

    it('T-PARSE-g counts distinct regulation ids and keeps the first', () => {
      const c = P.parseCitation(
        'Chapter 10.20.40.70.(1)(A) and Chapter 10.20.40.80.(2), By-law No. 569-2013',
      );
      expect(c.clause_count).toBe(2);
      expect(c.regulation_id_as_cited).toBe('10.20.40.70(1)(A)');
    });
  });

  describe('T-PARSE qualified rules', () => {
    it('T-PARSE-i a qualified required side is flagged and never high confidence', () => {
      const r = P.classifyItem({
        head: 'Chapter 10.10.40.30.(1), By-law No. 569-2013',
        body: 'To permit the proposed 1.5 metres, whereas for a corner lot the By-law requires a minimum side yard setback of 2.4 metres.',
      });
      expect(r.qualified).toBe(true);
      expect(r.parse_confidence).not.toBe('high');
    });
  });

  describe('T-BOUND bound detection', () => {
    it('T-BOUND reads one family and refuses to guess between two', () => {
      expect(P.detectBound('a maximum height of 10 metres')).toBe('max');
      expect(P.detectBound('a minimum of 6 metres')).toBe('min');
      expect(P.detectBound('a minimum of 6 metres and a maximum of 10 metres')).toBe(null);
    });
  });

  describe('T-SIDE side classification', () => {
    it('T-SIDE reads proposed and required phrases', () => {
      expect(P.classifySide('To permit the proposed 7.7 metres')).toBe('proposed');
      expect(P.classifySide('the By-law permits a maximum 7 metres')).toBe('required');
    });
  });

  describe('T-MAPFN target mapping', () => {
    const entries = [
      { target: 'north', any: ['front yard'], none: [] },
      { target: 'south', any: ['rear yard'], none: [] },
      { target: 'east', any: ['side yard'], none: ['corner lot'] },
    ];

    it('T-MAPFN maps exactly one matching entry', () => {
      expect(P.mapTarget('the front yard setback', entries)).toEqual({
        target: 'north',
        target_status: 'mapped',
        matched: ['north'],
      });
    });

    it('T-MAPFN reports ambiguity with sorted matched targets', () => {
      expect(P.mapTarget('the front yard and rear yard', entries)).toEqual({
        target: 'ambiguous',
        target_status: 'ambiguous',
        matched: ['north', 'south'],
      });
    });

    it('T-MAPFN lets a none phrase suppress an entry', () => {
      expect(P.mapTarget('the side yard of a corner lot', entries)).toEqual({
        target: 'unmapped',
        target_status: 'unmapped',
        matched: [],
      });
    });

    it('T-MAPFN leaves an unmatched text unmapped', () => {
      expect(P.mapTarget('a rooftop sign', entries)).toEqual({
        target: 'unmapped',
        target_status: 'unmapped',
        matched: [],
      });
    });
  });

  describe('T-PII-3 input hygiene', () => {
    it('T-PII-3 throws the closed code only and never echoes input text', () => {
      let message = '';
      expect(() => {
        try {
          P.classifyItem({ head: 7, body: 'Owner: Jane Example' });
        } catch (err) {
          message = (err as Error).message;
          throw err;
        }
      }).toThrow(/^COA_PARSE_E_BAD_INPUT$/);
      expect(message).not.toContain('Jane');
    });
  });

  describe('unitFamily sanity', () => {
    it('groups canonical units into families', () => {
      expect(P.unitFamily('m')).toBe('length');
      expect(P.unitFamily('m2')).toBe('area');
      expect(P.unitFamily('storeys')).toBe('storeys');
      expect(P.unitFamily('spaces')).toBe('count');
      expect(P.unitFamily('nonsense')).toBe(null);
    });
  });
});
