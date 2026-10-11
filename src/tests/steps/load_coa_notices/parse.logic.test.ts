// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5
//
// RED/GREEN lock for the DOCUMENT-level CoA-notice parse: page-furniture removal, a by-law token
// wrapped to the next line, the decision read from the decision paragraph only, consent items
// skipped, a signature page never counted twice, per-application dedup (superseded / same-date
// conflict / identical), the later hearing date winning, and the PII guarantee that no output text
// leaves the compute. The SAME suite runs against two implementations selected by env: the default
// loads the library (`scripts/lib/compute/load-coa-notices.js`); `COA_PARSE_IMPL=spike` loads the
// P2-12a RED baseline (`src/tests/fixtures/coa-notices/spike-parser.cjs`). Every `T-*` case below
// FAILS against the spike and PASSES against the library (Spec 08 §11.4 — a lock proven both ways).
//
// ALL test text is SYNTHETIC — invented sentences, no real person named.
import { describe, it, expect } from 'vitest';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const IMPL =
  process.env.COA_PARSE_IMPL === 'spike'
    ? 'src/tests/fixtures/coa-notices/spike-parser.cjs'
    : 'scripts/lib/compute/load-coa-notices.js';

interface ParsedItem {
  item_ordinal: number;
  source_page: number;
  cited_bylaw: string | null;
  citation_kind: string;
  regulation_id_as_cited: string | null;
  exception_ref: string | null;
  target: string;
  target_status: string;
  bound: string | null;
  required_value: number | null;
  required_unit: string | null;
  proposed_value: number | null;
  proposed_unit: string | null;
  parse_status: string;
  parse_confidence: string;
  qualified: boolean;
  clause_count: number;
  bylaw_rejected: boolean;
}

interface ParsedNotice {
  application_number: string | null;
  notice_status: string;
  page: number;
  zoning_as_stated?: string | null;
  decision?: string;
  decision_mailed_on?: string | null;
  consent_items_skipped?: number;
  items: ParsedItem[];
}

interface ShapeResult {
  doc_status: string;
  notices: ParsedNotice[];
  counts: { notices_by_status: Record<string, number>; blocks: number; ordinal_fallback_notices: number };
}

interface Row {
  variance_key: string;
  application_number: string | null;
  source_sha256: string;
  hearing_date: string;
  parse_status: string;
  required_value: number | null;
  proposed_value: number | null;
  drop_reason?: string;
  [k: string]: unknown;
}

interface ReconcileResult {
  rows: Row[];
  stats: Record<string, unknown>;
}

interface ComputeModule {
  shapeDocument: (doc: unknown, cfg?: unknown) => ShapeResult;
  reconcileNotices: (docResults: Array<{ doc: unknown; result: ShapeResult }>, opts?: { config?: Record<string, unknown> }) => ReconcileResult;
}

interface CorpusModule {
  FAKE_NAMES: string[];
  NOTICE_A: string[];
  NOTICE_B: string[];
  NOTICE_C: string[];
  NOTICE_WRAP: string[];
  SIGNATURE_A: string[];
  CONSENT_ONLY: string[];
  header: (fileNo: string, zoning: string, kind?: string) => string[];
  decision: (text: string) => string[];
  mailed: (d: string) => string[];
  paginate: (lines: string[], perPage?: number, fileNo?: string) => string[];
  doc: (overrides: Record<string, unknown>, lines: string[]) => Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS implementation chosen by env
const C = require(path.join(REPO_ROOT, IMPL)) as ComputeModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS shared synthetic corpus
const corpus = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/corpus.cjs')) as CorpusModule;

/** The application number these cases reconcile against. */
const APP = 'A0101/17EYK';

/** The 3 items of NOTICE_A, with item 3's proposed coverage replaced by `pct`. */
function noticeAWithCoverage(pct: number): string[] {
  return corpus.NOTICE_A.map((line) =>
    line.includes('the proposed lot coverage of 41%')
      ? `To permit the proposed lot coverage of ${pct}%, whereas the By-law permits a maximum lot coverage of 33%.`
      : line,
  );
}

function shape(doc: Record<string, unknown>): ShapeResult {
  return C.shapeDocument(doc, {});
}

function keptRowsOf(res: ReconcileResult): Row[] {
  return res.rows.filter((r) => r.application_number === APP && !r.drop_reason);
}

function droppedRowsOf(res: ReconcileResult): Row[] {
  return res.rows.filter((r) => r.application_number === APP && r.drop_reason);
}

/** The first parsed item of a notice, asserted present (narrows away the index-undefined). */
function firstItem(notice: ParsedNotice): ParsedItem {
  const item = notice.items[0];
  expect(item).toBeDefined();
  return item as ParsedItem;
}

describe('coa-notices document-level parse', () => {
  it('T-PARSE-f page furniture is removed only at page edges', () => {
    const res = shape(corpus.doc({}, corpus.NOTICE_WRAP));
    const notice = res.notices.find((n) => n.notice_status === 'variance_section_parsed');
    expect(notice).toBeDefined();
    const item = firstItem(notice!);
    expect(notice!.items).toHaveLength(1);
    expect(item.parse_status).toBe('pair');
    expect(item.required_value).toBe(10);
    expect(item.required_unit).toBe('m');
  });

  it('T-PARSE-g a by-law token wrapped to the next line is read', () => {
    const res = shape(corpus.doc({}, corpus.NOTICE_B));
    const notice = res.notices.find((n) => n.application_number === 'A0102/17EYK');
    expect(notice).toBeDefined();
    expect(notice!.items).toHaveLength(1);
    const item = firstItem(notice!);
    expect(item.cited_bylaw).toBe('569-2013');
    expect(item.citation_kind).toBe('chapter_regulation');
    expect(item.required_value).toBe(1200);
    expect(item.proposed_value).toBe(1150);
    expect(item.required_unit).toBe('m2');
  });

  it('T-PARSE-j the decision comes from the decision paragraph only', () => {
    const res = shape(corpus.doc({}, corpus.NOTICE_A));
    const notice = res.notices.find((n) => n.application_number === APP);
    expect(notice).toBeDefined();
    // NOTICE_A's conditions sentence contains "refused" — the decision must not pick it up.
    expect(notice!.decision).toBe('approved_with_conditions');
  });

  it('T-PARSE-k consent items inside a mixed notice are skipped and counted', () => {
    const res = shape(corpus.doc({}, corpus.NOTICE_C));
    const notice = res.notices.find((n) => n.application_number === 'A0103/17EYK');
    expect(notice).toBeDefined();
    expect(notice!.items).toHaveLength(1);
    expect(firstItem(notice!).item_ordinal).toBe(1);
    expect(notice!.consent_items_skipped).toBe(1);
  });

  it('T-PARSE-sig a signature page is not a second notice', () => {
    const doc = corpus.doc({}, [...corpus.NOTICE_A, ...corpus.SIGNATURE_A]);
    const res = shape(doc);
    expect(res.notices.some((n) => n.notice_status === 'signature_page_duplicate')).toBe(true);
    const rec = C.reconcileNotices([{ doc, result: res }], { config: {} });
    expect(keptRowsOf(rec)).toHaveLength(3);
    expect(new Set(keptRowsOf(rec).map((r) => r.variance_key)).size).toBe(3);
  });

  it('T-PARSE-dedup-revised a revised document beats the original', () => {
    const doc1 = corpus.doc({ doc_id: 'doc-1', sha256: 'a'.repeat(64), revision: 'original' }, corpus.NOTICE_A);
    const doc2 = corpus.doc({ doc_id: 'doc-2', sha256: 'b'.repeat(64), revision: 'revised' }, noticeAWithCoverage(35));
    const r1 = shape(doc1);
    const r2 = shape(doc2);
    const rec = C.reconcileNotices([{ doc: doc1, result: r1 }, { doc: doc2, result: r2 }], { config: {} });
    const kept = keptRowsOf(rec);
    expect(kept).toHaveLength(3);
    expect(kept.every((r) => r.source_sha256 === 'b'.repeat(64))).toBe(true);
    expect(kept.some((r) => r.proposed_value === 35)).toBe(true);
    const dropped = droppedRowsOf(rec);
    expect(dropped).toHaveLength(3);
    expect(dropped.every((r) => r.source_sha256 === 'a'.repeat(64))).toBe(true);
    expect(dropped.every((r) => r.drop_reason === 'duplicate_superseded')).toBe(true);
  });

  it('T-PARSE-dedup-conflict differing lists on the same date with neither revised are both dropped', () => {
    const doc1 = corpus.doc({ doc_id: 'doc-1', sha256: 'a'.repeat(64), revision: 'original' }, corpus.NOTICE_A);
    const doc2 = corpus.doc({ doc_id: 'doc-2', sha256: 'b'.repeat(64), revision: 'original' }, noticeAWithCoverage(35));
    const r1 = shape(doc1);
    const r2 = shape(doc2);
    const rec = C.reconcileNotices([{ doc: doc1, result: r1 }, { doc: doc2, result: r2 }], { config: {} });
    expect(keptRowsOf(rec)).toHaveLength(0);
    const dropped = droppedRowsOf(rec);
    expect(dropped).toHaveLength(6);
    expect(dropped.every((r) => r.drop_reason === 'duplicate_same_date_conflict')).toBe(true);
  });

  it('T-PARSE-dedup-identical identical item lists are one notice', () => {
    const doc1 = corpus.doc({ doc_id: 'doc-1', sha256: 'a'.repeat(64), revision: 'original' }, corpus.NOTICE_A);
    const doc2 = corpus.doc({ doc_id: 'doc-2', sha256: 'b'.repeat(64), revision: 'original' }, corpus.NOTICE_A);
    const r1 = shape(doc1);
    const r2 = shape(doc2);
    const rec = C.reconcileNotices([{ doc: doc1, result: r1 }, { doc: doc2, result: r2 }], { config: {} });
    const kept = keptRowsOf(rec);
    expect(kept).toHaveLength(3);
    // lexicographically smaller sha is 'a' * 64
    expect(kept.every((r) => r.source_sha256 === 'a'.repeat(64))).toBe(true);
    const dropped = droppedRowsOf(rec);
    expect(dropped).toHaveLength(3);
    expect(dropped.every((r) => r.drop_reason === 'duplicate_superseded')).toBe(true);
  });

  it('T-PARSE-later the later hearing date wins', () => {
    const doc1 = corpus.doc({ doc_id: 'doc-1', sha256: 'a'.repeat(64), hearing_date: '2017-07-13' }, corpus.NOTICE_A);
    const doc2 = corpus.doc({ doc_id: 'doc-2', sha256: 'b'.repeat(64), hearing_date: '2017-08-13' }, noticeAWithCoverage(35));
    const r1 = shape(doc1);
    const r2 = shape(doc2);
    const rec = C.reconcileNotices([{ doc: doc1, result: r1 }, { doc: doc2, result: r2 }], { config: {} });
    const kept = keptRowsOf(rec);
    expect(kept).toHaveLength(3);
    expect(kept.every((r) => r.source_sha256 === 'b'.repeat(64))).toBe(true);
    expect(kept.every((r) => r.hearing_date === '2017-08-13')).toBe(true);
  });

  it('T-PII-text no output carries notice text', () => {
    const all = [
      ...corpus.NOTICE_A,
      ...corpus.NOTICE_B,
      ...corpus.NOTICE_C,
      ...corpus.NOTICE_WRAP,
      ...corpus.SIGNATURE_A,
      ...corpus.CONSENT_ONLY,
    ];
    const doc = corpus.doc({ doc_id: 'doc-all', sha256: 'f'.repeat(64) }, all);
    const res = shape(doc);
    const rec = C.reconcileNotices([{ doc, result: res }], { config: {} });
    const blob = `${JSON.stringify(res)}\n${JSON.stringify(rec)}`;
    for (const name of corpus.FAKE_NAMES) expect(blob).not.toContain(name);
    expect(blob).not.toContain('EXAMPLE AVE');
    expect(blob).not.toContain('PLAN 0000');
    expect(blob.toLowerCase()).not.toContain('whereas');
    // …and the serialized blob is the DECLARED output envelope (a text-free block, not a raw dump):
    // the spike emits `stats: {}`, so a notice-text-bearing shape can never hide behind a partial block.
    expect(typeof rec.stats.notices_total).toBe('number');
    expect(typeof rec.stats.items_total).toBe('number');
  });

  it('doc_status is no_notices_found for a page with no notice block', () => {
    const res = shape(corpus.doc({ doc_id: 'doc-empty' }, ['nothing here']));
    expect(res.doc_status).toBe('no_notices_found');
  });
});
