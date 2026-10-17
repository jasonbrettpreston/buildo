// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D10 (T-CHECKS)
//
// RED/GREEN lock for the 12 DECLARED `load_coa_notices` checks. Each case runs the real
// `compute(ctx)` (`scripts/lib/compute/load-coa-notices.js`) with EXACTLY ONE check id, turns the
// observation it reports into the audit row via the library's `checkRow` (`scripts/lib/step/verdict.js`),
// and asserts the row STATUS — i.e. the status the verdict cascade would read, not the raw observation.
//
// RED BASELINE (Spec 08 §11.4, both directions): `COA_CHECKS_IMPL=inert` swaps the dispatch table for a
// fake whose every check reports `{violations: 0, value: 1}` — a compute that never trips. Every
// `T-CHECKS-C*` case below FAILS against it and PASSES against the committed compute.
//
// The health fixture mirrors the runner's `ctx.acquired` contract exactly:
//   · `document_set` = `{manifest_sha256, docs_total, docs_excluded, docs_by_status{…}, bytes_fetched}`
//   · `reconcile`     = the `stats` object `reconcileNotices` returns
//
// EVERY fixture below is SYNTHETIC: invented application numbers, hashes and counts. No PDF, no person.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');

type Observation = { violations?: number; value?: number; detail?: unknown };
type Row = { metric: string; value: unknown; threshold: unknown; status: string };
type Check = {
  id: string;
  limit: string;
  severity: 'FAIL' | 'WARN';
  limit_from_config?: string;
  warn_limit?: string;
  warn_limit_from_config?: string;
  when: string;
};

// The DESCRIPTOR lands later (T-CHECKS only locks the compute's behaviour against the declared
// bounds); the declared check objects are reproduced here VERBATIM so this suite reads the same
// limits the descriptor will.
const CHECKS: Check[] = [
  { id: 'doc_sha_mismatch', limit: 'viol == 0', severity: 'FAIL', when: 'pre_write' },
  { id: 'doc_acquire_failed', limit: 'viol == 0', severity: 'FAIL', when: 'pre_write' },
  {
    id: 'pair_rate_569',
    limit: 'value_min 0.85',
    limit_from_config: 'coa_notices_pair_rate_warn_min',
    warn_limit: 'value_min 0.8',
    warn_limit_from_config: 'coa_notices_pair_rate_fail_min',
    severity: 'FAIL',
    when: 'pre_write',
  },
  {
    id: 'notices_without_section_pct',
    limit: 'pct <= 10',
    limit_from_config: 'coa_notices_no_section_warn_max_pct',
    severity: 'WARN',
    when: 'pre_write',
  },
  {
    id: 'mail_lag_out_of_bounds',
    limit: 'viol <= 0',
    limit_from_config: 'coa_notices_mail_lag_viol_max',
    severity: 'FAIL',
    when: 'pre_write',
  },
  { id: 'reason_totality', limit: 'viol == 0', severity: 'FAIL', when: 'pre_write' },
  {
    id: 'unit_target_mismatch',
    limit: 'viol <= 0',
    limit_from_config: 'coa_notices_unit_target_viol_max',
    severity: 'FAIL',
    when: 'pre_write',
  },
  { id: 'target_unit_mismatch_items', limit: 'viol == 0', severity: 'WARN', when: 'pre_write' },
  { id: 'doc_pair_rate_floor', limit: 'value_min 0.6', limit_from_config: 'coa_notices_doc_pair_rate_floor', severity: 'WARN', when: 'pre_write' }, // LCN-D5 (R-DC)
  { id: 'docs_no_notices', limit: 'viol == 0', severity: 'FAIL', when: 'pre_write' },
  {
    id: 'items_total_floor',
    limit: 'value_min 1000',
    limit_from_config: 'coa_notices_items_min',
    severity: 'FAIL',
    when: 'pre_write',
  },
  {
    id: 'direction_violation_pct',
    limit: 'pct <= 5',
    limit_from_config: 'coa_notices_direction_viol_max_pct',
    severity: 'WARN',
    when: 'post',
  },
  {
    id: 'required_out_of_bounds',
    limit: 'viol <= 0',
    limit_from_config: 'coa_notices_required_oob_max',
    severity: 'WARN',
    when: 'post',
  },
];

const CONFIG: Record<string, number> = {
  coa_notices_pair_rate_warn_min: 0.85,
  coa_notices_pair_rate_fail_min: 0.8,
  coa_notices_no_section_warn_max_pct: 10,
  coa_notices_mail_lag_viol_max: 0,
  coa_notices_unit_target_viol_max: 0,
  coa_notices_doc_pair_rate_floor: 0.6,
  coa_notices_doc_pair_rate_min_items: 10,
  coa_notices_items_min: 1000,
  coa_notices_direction_viol_max_pct: 5,
  coa_notices_required_oob_max: 0,
};

const ON_CHECK_ERROR = 'fail_step';

// ---- the two implementations (RED BASELINE switch) -------------------------------------------

/** The fake the RED baseline dispatches: never trips, whatever the fixture says. */
function inertReport(id: string, report: (id: string, observation: Observation) => void) {
  report(id, { violations: 0, value: 1 });
}

const INERT = Object.fromEntries(CHECKS.map((c) => [c.id, () => inertReport(c.id, curReport)])) as
  Record<string, () => void>;

let curReport: (id: string, observation: Observation) => void = () => {};

// the CJS compute under test (createRequire, so no require-imports lint applies)
const COMPUTE = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as {
  compute: (ctx: unknown) => Promise<unknown>;
  checks: Record<string, () => void>;
  shapeDocument: (doc: unknown, cfg: unknown) => unknown;
  reconcileNotices: (docs: unknown, opts: { config: Record<string, number> }) => {
    stats: { items_total: number; pairs_569: number; items_569: number; mail_lag: unknown; direction: unknown; unit_target_mismatch: number; target_unit_mismatch_items: number };
  };
};
// the real CJS verdict library
const verdict = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  checkRow: (check: Check, observation: Observation | undefined, onCheckError: string, config?: Record<string, number> | null) => Row | null;
};

const RED = process.env.COA_CHECKS_IMPL === 'inert';
/** The dispatch table the test drives: the inert fake under the RED baseline, the committed one otherwise. */
const checks = RED ? INERT : COMPUTE.checks;

// ---- the fixture builder ---------------------------------------------------------------------

interface Counts { [k: string]: number }

interface Fixture {
  document_set: {
    manifest_sha256: string;
    docs_total: number;
    docs_excluded: number;
    docs_by_status: Counts;
    bytes_fetched: number;
  };
  reconcile: {
    notices_total: number;
    notices_by_status: Counts;
    items_total: number;
    items_by_parse_status: Counts;
    items_by_target_status: Counts;
    items_by_confidence: Counts;
    pair_rate_569: number | null;
    doc_pair_rates: Record<string, number>;
    doc_items_569: Record<string, number>;
    doc_pair_rate_min_eligible: { rate: number; doc_id: string | null; eligible_docs: number };
    mail_lag: { measured: number; unmeasured: number; out_of_bounds: number | null; min: number | null; max: number | null };
    unit_target_mismatch: number;
    target_unit_mismatch_items: number;
    direction: { known: number; violations: number };
    required_oob: { count: number; measured: number; sample_keys: string[] };
  };
}

/** Deep clone so a mutation in one case can never leak into the next. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * A HEALTHY fixture: every acquired document `parsed`, every by-status map summing to its
 * independently tallied total, the 569 pair rate 0.9, the mail lag fully measured and inside the
 * bound, a 5000-item parse and a direction population whose proposed values sit on the VIOLATING
 * side (the permitted side, measured, is the C14 tripwire below).
 */
function healthy(): Fixture {
  return {
    document_set: {
      manifest_sha256: 'a'.repeat(64),
      docs_total: 4,
      docs_excluded: 0,
      docs_by_status: {
        parsed: 4,
        sha_mismatch: 0,
        http_error: 0,
        timeout: 0,
        too_large: 0,
        extract_error: 0,
        no_text_layer: 0,
        no_notices_found: 0,
        excluded: 0,
      },
      bytes_fetched: 12345678,
    },
    reconcile: {
      notices_total: 12,
      notices_by_status: {
        variance_section_parsed: 11,
        no_variance_section: 0,
        not_minor_variance: 1,
        signature_page_duplicate: 0,
        duplicate_superseded: 0,
        duplicate_same_date_conflict: 0,
      },
      items_total: 5000,
      items_by_parse_status: {
        pair: 4500,
        no_required_value: 200,
        no_proposed_value: 150,
        unit_family_mismatch: 60,
        multi_value_ambiguous: 40,
        side_ambiguous: 30,
        no_split: 20,
      },
      items_by_target_status: { mapped: 4700, ambiguous: 200, unmapped: 100 },
      items_by_confidence: { high: 4000, medium: 800, low: 200 },
      pair_rate_569: 0.9,
      doc_pair_rates: { 'doc-a': 0.9, 'doc-b': 0.88 },
      doc_items_569: { 'doc-a': 3000, 'doc-b': 2000 },
      doc_pair_rate_min_eligible: { rate: 0.88, doc_id: 'doc-b', eligible_docs: 2 },
      mail_lag: { measured: 11, unmeasured: 1, out_of_bounds: 0, min: 3, max: 28 },
      unit_target_mismatch: 0,
      target_unit_mismatch_items: 0,
      direction: { known: 100, violations: 1 },
      required_oob: { count: 0, measured: 80, sample_keys: [] },
    },
  };
}

/**
 * Drive ONE check id through the dispatch table and turn what it reports into the audit row.
 * The real `compute(ctx)` loop body, isolated: `ctx.report` captures the observation, then the
 * library's `checkRow` grades it against the declared limit (config-substituted).
 */
async function rowFor(id: string, fixture: Fixture): Promise<Row> {
  const check = CHECKS.find((c) => c.id === id);
  expect(check, `the declared checks[] declare ${id}`).toBeTruthy();
  let observation: Observation | undefined;
  const ctx = {
    checks: [id],
    config: CONFIG,
    descriptor: { identity: { name: 'load_coa_notices' } },
    log: { warn() {}, error() {} },
    report(reportedId: string, o: Observation) {
      if (reportedId === id) observation = o;
    },
    acquired: { document_set: fixture.document_set, reconcile: fixture.reconcile },
    written: null,
  };
  if (RED) {
    curReport = ctx.report;
    checks[id]?.();
  } else {
    await COMPUTE.compute(ctx);
  }
  const row = verdict.checkRow(check!, observation, ON_CHECK_ERROR, CONFIG);
  expect(row, `${id} produced no row`).toBeTruthy();
  return row!;
}

const status = async (id: string, mutate?: (f: Fixture) => void): Promise<string> => {
  const f = clone(healthy());
  if (mutate) mutate(f);
  return (await rowFor(id, f)).status;
};

const ALL_IDS = CHECKS.map((c) => c.id);

// ---- the shared synthetic corpus (T-TUM builds items from it, exactly as the tripwire below does) ----
const CORPUS = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/corpus.cjs')) as {
  paginate: (lines: string[]) => string[];
  header: (fileNo: string, zoning: string, kind?: string) => string[];
  decision: (text: string) => string[];
  mailed: (d: string) => string[];
};

/** One synthetic document whose variance section is exactly `bodyLines`. */
function tumDoc(bodyLines: string[]) {
  const lines = [
    ...CORPUS.header('A0101/17EYK', 'RD - Residential Detached'),
    'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
    ...bodyLines,
    ...CORPUS.decision('The Minor Variance Application is Approved'),
    ...CORPUS.mailed('July 19, 2017'),
  ];
  const doc = {
    doc_id: 'doc-a',
    sha256: 'a'.repeat(64),
    hearing_date: '2017-07-13',
    kind: 'committee',
    revision: 'original',
    text_pages: CORPUS.paginate(lines),
  };
  const shaped = [{ doc, result: COMPUTE.shapeDocument(doc, {}) }];
  const { stats } = COMPUTE.reconcileNotices(shaped, { config: { ...CONFIG, coa_notices_mail_lag_max_days: 59 } });
  const items = (shaped[0]!.result as { notices: Array<{ items: Array<{ parse_status: string; required_unit: string | null; target: string | null; target_status: string | null }> }> })
    .notices.flatMap((n) => n.items);
  return { stats, items };
}

describe('load_coa_notices checks — §D10 (T-CHECKS)', () => {
  it('T-CHECKS-healthy every check passes on the healthy fixture', async () => {
    for (const id of ALL_IDS) {
      const s = await status(id);
      expect(s, `${id} = ${s}`).toBe('PASS');
    }
  });

  it('T-CHECKS-C1 sha mismatch FAILs', async () => {
    expect(await status('doc_sha_mismatch', (f) => { f.document_set.docs_by_status.sha_mismatch = 1; f.document_set.docs_total += 1; })).toBe('FAIL');
  });

  it('T-CHECKS-C2 an acquisition failure FAILs', async () => {
    expect(await status('doc_acquire_failed', (f) => { f.document_set.docs_by_status.timeout = 1; f.document_set.docs_total += 1; })).toBe('FAIL');
  });

  it('T-CHECKS-C3 a null pair rate FAILs', async () => {
    expect(await status('pair_rate_569', (f) => { f.reconcile.pair_rate_569 = null; })).toBe('FAIL');
  });

  it('T-CHECKS-C3w a rate between the bounds WARNs', async () => {
    expect(await status('pair_rate_569', (f) => { f.reconcile.pair_rate_569 = 0.82; })).toBe('WARN');
  });

  it('T-CHECKS-C3f a rate below the fail bound FAILs', async () => {
    expect(await status('pair_rate_569', (f) => { f.reconcile.pair_rate_569 = 0.7; })).toBe('FAIL');
  });

  it('T-CHECKS-C4 too many sectionless notices WARN', async () => {
    expect(await status('notices_without_section_pct', (f) => {
      f.reconcile.notices_by_status.no_variance_section = 3;
      f.reconcile.notices_by_status.variance_section_parsed = (f.reconcile.notices_by_status.variance_section_parsed ?? 0) - 3;
    })).toBe('WARN');
  });

  it('T-CHECKS-C7a a mail lag out of bounds FAILs', async () => {
    expect(await status('mail_lag_out_of_bounds', (f) => { f.reconcile.mail_lag.out_of_bounds = 2; })).toBe('FAIL');
  });

  it('T-CHECKS-C9-docs a documents map that does not sum to its total FAILs', async () => {
    expect(await status('reason_totality', (f) => { f.document_set.docs_total += 1; })).toBe('FAIL');
  });

  it('T-CHECKS-C9-notices a notices map that does not sum to its total FAILs', async () => {
    expect(await status('reason_totality', (f) => { f.reconcile.notices_total += 1; })).toBe('FAIL');
  });

  it('T-CHECKS-C9-items an items map that does not sum to its total FAILs', async () => {
    expect(await status('reason_totality', (f) => { f.reconcile.items_total += 1; })).toBe('FAIL');
  });

  it('T-CHECKS-C12 an out-of-range required value WARNs', async () => {
    expect(await status('required_out_of_bounds', (f) => { f.reconcile.required_oob.count = 1; })).toBe('WARN');
  });

  it('T-CHECKS-C13 a unit/target mismatch FAILs', async () => {
    expect(await status('unit_target_mismatch', (f) => { f.reconcile.unit_target_mismatch = 1; })).toBe('FAIL');
  });

  it('T-CHECKS-TUM the new WARN check WARNs on one target_unit_mismatch item', async () => {
    expect(await status('target_unit_mismatch_items', (f) => { f.reconcile.target_unit_mismatch_items = 1; })).toBe('WARN');
  });

  it('T-CHECKS-C14 proposed values on the permitted side WARN', async () => {
    expect(await status('direction_violation_pct', (f) => { f.reconcile.direction = { known: 100, violations: 20 }; })).toBe('WARN');
  });

  it('T-CHECKS-C15 a low per-document pair rate WARNs', async () => {
    expect(await status('doc_pair_rate_floor', (f) => {
      f.reconcile.doc_pair_rates = { ...f.reconcile.doc_pair_rates, 'doc-c': 0.4 };
      f.reconcile.doc_items_569 = { ...f.reconcile.doc_items_569, 'doc-c': 12 };
      f.reconcile.doc_pair_rate_min_eligible = { rate: 0.4, doc_id: 'doc-c', eligible_docs: 3 }; // the builder's classification (LCN-D5)
    })).toBe('WARN');
  });

  it('T-CHECKS-C16 a document with no notices FAILs', async () => {
    expect(await status('docs_no_notices', (f) => { f.document_set.docs_by_status.no_notices_found = 1; f.document_set.docs_total += 1; })).toBe('FAIL');
  });

  it('T-CHECKS-C17 an item total under the floor FAILs', async () => {
    expect(await status('items_total_floor', (f) => {
      // The map must still sum to the total (a C9 tripwire here would confound the C17 lock).
      f.reconcile.items_total = 10;
      f.reconcile.items_by_parse_status = { pair: 10, no_required_value: 0, no_proposed_value: 0, unit_family_mismatch: 0, multi_value_ambiguous: 0, side_ambiguous: 0, no_split: 0 };
      f.reconcile.items_by_target_status = { mapped: 10, ambiguous: 0, unmapped: 0 };
      f.reconcile.items_by_confidence = { high: 10, medium: 0, low: 0 };
    })).toBe('FAIL');
  });

  // ---- an exact-stats tripwire, so the fixture's shape cannot drift from the real compute ----
  it('T-CHECKS-healthy the fixture reconciles exactly as the REAL compute reconciles the synthetic corpus', async () => {
    const corpus = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/corpus.cjs')) as {
      paginate: (lines: string[]) => string[];
      NOTICE_A: string[];
      NOTICE_B: string[];
    };
    const docs = [
      { doc_id: 'doc-a', sha256: 'a'.repeat(64), hearing_date: '2017-07-13', kind: 'committee', revision: 'original', text_pages: corpus.paginate(corpus.NOTICE_A) },
      { doc_id: 'doc-b', sha256: 'b'.repeat(64), hearing_date: '2017-07-13', kind: 'committee', revision: 'original', text_pages: corpus.paginate(corpus.NOTICE_B) },
    ];
    const shaped = docs.map((doc) => ({ doc, result: COMPUTE.shapeDocument(doc, {}) }));
    const { stats } = COMPUTE.reconcileNotices(shaped, { config: { ...CONFIG, coa_notices_mail_lag_max_days: 59 } });
    // The four mapped relation shapes every check above depends on, pinned to what the REAL
    // parser/reconciler produce over the shared synthetic corpus — NOT to a hand-tallied number.
    expect(stats.items_total).toBe(4); // NOTICE_A: 3 items (1 consent-skipped), NOTICE_B: 1
    expect(stats.pairs_569).toBe(stats.items_569); // every 569 item pairs → pair_rate 1.0
    expect(stats.mail_lag).toMatchObject({ measured: 2, out_of_bounds: 0, min: 6, max: 7 });
    expect(stats.direction).toEqual({ known: 4, violations: 0 });
  });
});

describe('T-TUM target_unit_mismatch (ruling 2026-10-09)', () => {
  // Synthetic items through the SAME seams the tripwire above uses: shapeDocument → reconcileNotices.
  // (a) a pair whose parsed unit family differs from its keyword-mapped target's family is NOT
  //     claimed as a pair: it is stored as 'target_unit_mismatch', counted once, and C13 stays 0.
  // (b) a pair whose family matches its mapped target stays 'pair'; both counters stay 0.
  const FSI_AS_AREA = [
    '1. Chapter 10.20.40.10.(1)(A), By-law No. 569-2013',
    'The proposed building will have a floor space index of 0.9 m², whereas the By-law permits a maximum floor space index of 0.8 m².',
  ];
  const SIDE_SETBACK_AS_LENGTH = [
    '1. Chapter 10.20.40.70.(3), By-law No. 569-2013',
    'To permit the proposed side yard setback of 0.9 metres, whereas the By-law requires a minimum side yard setback of 1.2 metres.',
  ];

  it('T-TUM-a a pair whose unit family differs from its mapped target is stored target_unit_mismatch', () => {
    const { stats, items } = tumDoc(FSI_AS_AREA);
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    // The keyword-mapped target is fsi (family ratio) while the parsed required unit is m² (area).
    expect(it0.target).toBe('fsi');
    expect(it0.target_status).toBe('mapped');
    expect(it0.required_unit).toBe('m2');
    expect(it0.parse_status).toBe('target_unit_mismatch');
    expect(stats.target_unit_mismatch_items).toBe(1);
    expect(stats.unit_target_mismatch).toBe(0); // C13 does not see it: it is no longer a pair
  });

  it('T-TUM-b a pair whose unit family matches its mapped target stays a pair', () => {
    const { stats, items } = tumDoc(SIDE_SETBACK_AS_LENGTH);
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.target).toBe('side_setback_m');
    expect(it0.target_status).toBe('mapped');
    expect(it0.required_unit).toBe('m');
    expect(it0.parse_status).toBe('pair');
    expect(stats.target_unit_mismatch_items).toBe(0);
    expect(stats.unit_target_mismatch).toBe(0);
  });
});
