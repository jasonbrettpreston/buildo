// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5
//
// fast-check property tests for the CoA-notice document parse + reconciliation. Each invariant is a
// statement that MUST hold for EVERY generated document set: the reason counters sum to their totals
// at every level (C9 reason totality), a `pair` row carries both values in one unit family, a written
// row's keys are exactly the declared write columns (never a text/owner/agent column), and variance
// keys are unique among kept rows.
//
// ALL generated text is SYNTHETIC — invented sentences, no real person named.
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../');

interface ParsedItem {
  item_ordinal: number;
  source_page: number;
  parse_status: string;
  required_value: number | null;
  required_unit: string | null;
  proposed_value: number | null;
  proposed_unit: string | null;
  target_status: string;
  parse_confidence: string;
  [k: string]: unknown;
}

interface ParsedNotice {
  notice_status: string;
  items: ParsedItem[];
  [k: string]: unknown;
}

interface ShapeResult {
  doc_status: string;
  notices: ParsedNotice[];
  counts: { notices_by_status: Record<string, number>; blocks: number; ordinal_fallback_notices: number };
}

interface Row {
  variance_key: string;
  parse_status: string;
  required_value: number | null;
  required_unit: string | null;
  proposed_value: number | null;
  proposed_unit: string | null;
  target_status: string;
  parse_confidence: string;
  drop_reason?: string;
  [k: string]: unknown;
}

interface ReconcileResult {
  rows: Row[];
  stats: {
    notices_total: number;
    notices_by_status: Record<string, number>;
    items_total: number;
    items_by_parse_status: Record<string, number>;
    items_by_target_status: Record<string, number>;
    items_by_confidence: Record<string, number>;
    [k: string]: unknown;
  };
}

interface ComputeModule {
  shapeDocument: (doc: unknown, cfg?: unknown) => ShapeResult;
  reconcileNotices: (docResults: Array<{ doc: unknown; result: ShapeResult }>, opts?: { config?: Record<string, unknown> }) => ReconcileResult;
  shapeRecord: (record: unknown) => Record<string, unknown> | string;
  ROW_COLUMNS: readonly string[];
}

interface ParseValuesModule {
  unitFamily: (unit: unknown) => string | null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS compute under test
const C = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as ComputeModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS pure value extractors
const P = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/parse-values.js')) as ParseValuesModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS shared synthetic corpus
const corpus = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/corpus.cjs')) as {
  header: (fileNo: string, zoning: string, kind?: string) => string[];
  decision: (text: string) => string[];
  mailed: (d: string) => string[];
  paginate: (lines: string[], perPage?: number, fileNo?: string) => string[];
};

/**
 * Synthetic item bodies covering EVERY parse outcome the extractors can emit:
 * pair, unit_family_mismatch, multi_value_ambiguous, side_ambiguous, no_required_value,
 * no_proposed_value, no_split.
 */
const BODIES = [
  // clean proposed/required pair (metres)
  'To permit the proposed side yard setback of 0.9 metres, whereas the By-law requires a minimum side yard setback of 1.2 metres.',
  // clean pair (percent)
  'To permit the proposed lot coverage of 41%, whereas the By-law permits a maximum lot coverage of 33%.',
  // unit-family mismatch (storeys vs metres)
  'To permit the proposed 2.5 storeys, whereas the By-law permits a maximum height of 10 metres.',
  // compound required side → multi_value_ambiguous
  'To permit the proposed 0.78 times the area of the lot, whereas the By-law permits a maximum floor space index of 0.6 times the area of the lot plus 10 square metres.',
  // reversed whereas → side_ambiguous
  'The By-law requires a minimum front yard setback of 6 metres, whereas the proposed front yard setback will be 4.8 metres.',
  // a body with no number → no_required_value (or no_split)
  'To permit the proposed building height, whereas the By-law permits a maximum building height of metres.',
  // only a required side → no_proposed_value
  'The By-law requires a minimum side yard setback of 1.2 metres.',
  // an unnumbered hedge with no lexicon word → no_split
  'The building is close to the street and the lot.',
];

const HEAD = (i: number) => `Chapter 10.20.40.${10 + i}.(1), By-law No. 569-2013`;

interface NoticeSpec {
  n: number;
  items: string[];
  perPage: number;
}

function buildDoc(spec: NoticeSpec): { doc: Record<string, unknown>; lines: string[] } {
  const fileNo = `A0${spec.n}/17EYK`;
  const lines: string[] = [
    ...corpus.header(fileNo, 'RD - Residential Detached'),
    'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
  ];
  spec.items.forEach((body, i) => {
    lines.push(`${i + 1}. ${HEAD(i)}`);
    lines.push(body);
  });
  lines.push(...corpus.decision('The Minor Variance Application is Approved'));
  lines.push(...corpus.mailed('July 19, 2017'));
  const doc = {
    doc_id: `doc-${spec.n}`,
    sha256: String(spec.n).padStart(2, '0').repeat(32),
    hearing_date: '2017-07-13',
    kind: 'committee',
    revision: 'original',
    session: 'full',
    text_pages: corpus.paginate(lines, spec.perPage, fileNo),
  };
  return { doc, lines };
}

const noticeSpecArb: fc.Arbitrary<NoticeSpec> = fc.record({
  // `A0${n}` with a 3-digit n → `A0101/17EYK`-style file numbers (FILE_RE needs 3–4 digits).
  n: fc.integer({ min: 101, max: 106 }),
  items: fc.array(fc.constantFrom(...BODIES), { minLength: 0, maxLength: 5 }),
  perPage: fc.integer({ min: 5, max: 40 }),
});

const docSpecsArb: fc.Arbitrary<NoticeSpec[]> = fc
  .uniqueArray(noticeSpecArb, {
    minLength: 1,
    maxLength: 6,
    selector: (s) => s.n,
  });

const CONFIG = { coa_notices_mail_lag_max_days: 21 };

// RED BASELINE (Spec 08 §11.4): `COA_PROP_IMPL=drop` simulates a parser that DROPS a reason bucket (the
// first non-zero parse-status bucket vanishes from the map) — T-PROP-1 must FAIL under it.
const DROP_BUCKET = process.env.COA_PROP_IMPL === 'drop';

function run(specs: NoticeSpec[]): ReconcileResult {
  const docResults = specs.map((spec) => {
    const { doc } = buildDoc(spec);
    return { doc, result: C.shapeDocument(doc, {}) };
  });
  const res = C.reconcileNotices(docResults, { config: CONFIG });
  if (DROP_BUCKET) {
    const k = Object.keys(res.stats.items_by_parse_status).find((key) => (res.stats.items_by_parse_status[key] ?? 0) > 0);
    if (k) delete res.stats.items_by_parse_status[k];
  }
  return res;
}

const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
const kept = (rows: Row[]): Row[] => rows.filter((r) => !r.drop_reason);

describe('coa-notices parse property invariants', () => {
  it('T-PROP-1 reasons sum to totals at every level', () => {
    fc.assert(
      fc.property(docSpecsArb, (specs) => {
        const { rows, stats } = run(specs);
        expect(sum(stats.notices_by_status)).toBe(stats.notices_total);
        expect(sum(stats.items_by_parse_status)).toBe(stats.items_total);
        expect(sum(stats.items_by_target_status)).toBe(stats.items_total);
        expect(sum(stats.items_by_confidence)).toBe(stats.items_total);
        expect(rows.length).toBe(stats.items_total);
      }),
      { numRuns: 100 },
    );
  });

  it('T-PROP-2 a pair carries both values in one unit family', () => {
    fc.assert(
      fc.property(docSpecsArb, (specs) => {
        const { rows } = run(specs);
        for (const row of kept(rows)) {
          if (row.parse_status !== 'pair') continue;
          expect(Number.isFinite(row.required_value)).toBe(true);
          expect(Number.isFinite(row.proposed_value)).toBe(true);
          expect(row.required_value as number).toBeGreaterThanOrEqual(0);
          expect(row.proposed_value as number).toBeGreaterThanOrEqual(0);
          expect(P.unitFamily(row.required_unit)).not.toBe(null);
          expect(P.unitFamily(row.proposed_unit)).toBe(P.unitFamily(row.required_unit));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('T-PROP-3 row keys are exactly the declared write columns', () => {
    fc.assert(
      fc.property(docSpecsArb, (specs) => {
        const { rows } = run(specs);
        const declared = [...C.ROW_COLUMNS].sort();
        for (const row of rows) {
          const shaped = C.shapeRecord(row);
          if (typeof shaped === 'string') {
            expect(shaped.length).toBeGreaterThan(0);
            continue;
          }
          expect(Object.keys(shaped).sort()).toEqual(declared);
        }
        const forbidden = ['owner', 'agent', 'name', 'address', 'text', 'body'];
        for (const col of C.ROW_COLUMNS) {
          expect(forbidden).not.toContain(col);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('T-PROP-4 keys are unique', () => {
    fc.assert(
      fc.property(docSpecsArb, (specs) => {
        const { rows } = run(specs);
        const keptRows = kept(rows);
        const unique = new Set(keptRows.map((r) => r.variance_key));
        expect(unique.size).toBe(keptRows.length);
      }),
      { numRuns: 100 },
    );
  });
});
