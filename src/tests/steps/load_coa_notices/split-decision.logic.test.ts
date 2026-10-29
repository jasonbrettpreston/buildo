// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §5 (j), §10, :49
// SPEC LINK: decision log 2026-10-25-batch-g#CHAT-157.SPLIT-DECISION-ROUND; 2026-10-26-batch-j#CHAT-169.SPLIT-THREE-FAMILIES;
//            2026-10-26-batch-l#CHAT-172.SPLIT-CONDITIONS-READ; 2026-10-26-batch-n#CHAT-183.SPLIT-CONDITIONS-PER-FAMILY
//
// RED/GREEN lock for the item-level split of a decision that refuses some variance items and approves others (the
// CHAT-157 round, all three 2017 wording families per CHAT-169). Refused wins per item (Spec 129 :49); every other item
// takes the notice decision (F2/F3) or the approval sentence's class (F1); anything the rule cannot resolve fails the
// whole notice closed to `unknown` and is counted in `split_decisions.notices_unknown`.
//
// Red runs (Spec 129 :238 form): the base red is this file run against the compute BEFORE the split existed; a mutant
// red selects ONE named in-memory patch of the real compute source by env, `COA_SPLIT_MUTANT=<name>`
// (src/tests/fixtures/coa-notices/split-mutants.cjs). A mutant makes at least its designed case red. T-SPLIT-CHAT183
// reads no environment variable at all (CHAT-183 trip-wire).
//
// ALL notice text is SYNTHETIC (lower case, marked synth-fixture); the values are those of the pinned 2017 notices.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isDeepStrictEqual } from 'util';
import Module from 'module';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const COMPUTE_REL = 'scripts/lib/compute/load-coa-notices.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON fixtures

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS mutant table
const MUTANTS = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/split-mutants.cjs')) as Record<string, { find: string; replace: string }>;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS synthetic corpus
const SC = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/split-corpus.cjs')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS synthetic corpus
const corpus = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/corpus.cjs')) as Json;

/** Compile the real compute source with named patches applied, at the real path (relative requires resolve). */
function loadCompute(patches: string[] = []): Json {
  const file = path.join(REPO_ROOT, COMPUTE_REL);
  let src = fs.readFileSync(file, 'utf8');
  for (const name of patches) {
    const p = MUTANTS[name];
    if (!p) throw new Error(`unknown split mutant ${name}`);
    if (!src.includes(p.find)) throw new Error(`split mutant ${name} does not apply`);
    src = src.replace(p.find, p.replace);
  }
  const m = new Module(file) as Module & { _compile: (s: string, f: string) => void; paths: string[] };
  m.filename = file;
  m.paths = (Module as unknown as { _nodeModulePaths: (d: string) => string[] })._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports as Json;
}
const RED_MUTANT = process.env.COA_SPLIT_MUTANT ? [process.env.COA_SPLIT_MUTANT] : [];
const C = loadCompute(RED_MUTANT);

const ab = (d: unknown) => (d === 'refused' ? 'R' : d === 'approved' ? 'A' : d === 'approved_with_conditions' ? 'AWC' : String(d));
const CFG = { coa_notices_mail_lag_max_days: 60, coa_notices_doc_pair_rate_min_items: 1, coa_notices_oob_sample_max: 5 };

/** One synthetic notice → shapeDocument → reconcileNotices: the kept rows' decisions (by item ordinal) + the counter. */
function run(lines: string[], compute: Json = C, over: Json = {}) {
  const doc = SC.doc(lines, over);
  const result = compute.shapeDocument(doc, {});
  const rec = compute.reconcileNotices([{ doc, result }], { config: CFG });
  const rows = (rec.rows as Json[]).filter((r) => !r.drop_reason).sort((a, b) => a.item_ordinal - b.item_ordinal);
  return { result, rec, rows, decisions: rows.map((r) => ab(r.decision)), split: rec.stats.split_decisions as Json | undefined };
}
const rep = (d: string, n: number) => Array.from({ length: n }, () => d);
const N = SC.NOTICES;

describe('CHAT-157 split decisions: F1 (TEY wording)', () => {
  it('T-SPLIT-F1a refused items R; the approval sentence "approved, subject to" is AWC after comma normalisation', () => {
    expect(run(N.F1a).decisions).toEqual(['AWC', 'AWC', 'AWC', 'R', 'AWC', 'AWC', 'R']);
  });
  it('T-SPLIT-F1b a by-law id spelled differently in the head and the decision paragraph still resolves (normId)', () => {
    expect(run(N.F1b).decisions).toEqual(['A', 'A', 'A', 'R', 'R', 'A', 'A', 'A']);
  });
  it('T-SPLIT-F1f "N and M" for one by-law keeps both numbers', () => {
    expect(run(N.F1f).decisions).toEqual(['AWC', 'R', 'AWC', 'AWC', 'R', 'AWC', 'R']);
  });
  it('T-SPLIT-F1c a refusal list after the verb, ended by (B); refused wins over the amended approval', () => {
    expect(run(N.F1c).decisions).toEqual(['A', 'A', 'R', 'A', 'A', 'R', 'R', 'A', 'A', 'A']);
  });
  it('T-SPLIT-F1d a complement approval on condition', () => {
    expect(run(N.F1d).decisions).toEqual(['AWC', 'AWC', 'R', ...rep('AWC', 6)]);
  });
  it('T-SPLIT-F1e refusal wording in a condition after the approval sentence is not read', () => {
    expect(run(N.F1e).decisions).toEqual(['AWC', 'AWC', 'AWC', 'R', 'AWC', 'AWC', 'R']);
  });
  it('T-SPLIT-F1g (CHAT-183, F1) F1 refusal grammar in a condition of a non-split approval fails the notice closed, counted', () => {
    const r = run(N.F1g);
    expect(r.decisions).toEqual(rep('unknown', 5));
    expect(r.split).toEqual({ notices: 1, refs_unresolved: 0, notices_unknown: 1 });
  });
});

describe('CHAT-157 split decisions: F2 (EYK / SC wording)', () => {
  it('T-SPLIT-F2a approved list and refused list', () => {
    expect(run(N.F2a).decisions).toEqual(['A', 'R', 'R', 'A', 'A', 'A', 'A', 'A']);
  });
  it('T-SPLIT-F2b an approved-side range; the refused item R, the rest keep AWC', () => {
    expect(run(N.F2b).decisions).toEqual([...rep('AWC', 6), 'R']);
  });
  it('T-SPLIT-F2c approved "1-5 & 7-10", refused 6', () => {
    expect(run(N.F2c).decisions).toEqual([...rep('A', 5), 'R', ...rep('A', 4)]);
  });
  it('T-SPLIT-F2d a refused-side range "6 through 8"', () => {
    expect(run(N.F2d).decisions).toEqual([...rep('A', 5), 'R', 'R', 'R', 'A', 'A']);
  });
  it('T-SPLIT-F2e the F2 refusal phrase in a condition of a whole-application approval is not a split', () => {
    const r = run(N.F2e);
    expect(r.decisions).toEqual(rep('AWC', 5));
    expect(r.split).toEqual({ notices: 0, refs_unresolved: 0, notices_unknown: 0 });
  });
  it('T-SPLIT-F2g (CHAT-183, F2) a refusal in the family grammar inside a condition is an item refusal, not counted', () => {
    const r = run(N.F2g);
    expect(r.decisions).toEqual(['AWC', 'R', 'AWC', 'AWC', 'AWC']);
    expect(r.split).toEqual({ notices: 1, refs_unresolved: 0, notices_unknown: 0 });
  });
});

describe('CHAT-157 split decisions: F3 (NY wording)', () => {
  it('T-SPLIT-F3a approve and refuse headers', () => {
    expect(run(N.F3a).decisions).toEqual(['AWC', 'AWC', 'R']);
  });
  it('T-SPLIT-F3b approve > modify-and-approve > refuse (real order)', () => {
    expect(run(N.F3b).decisions).toEqual(['AWC', 'R', 'AWC', 'AWC', 'AWC', 'AWC', 'AWC', 'R', 'AWC', 'AWC']);
  });
  it('T-SPLIT-F3c two-digit refused ordinals', () => {
    const d = run(N.F3c).decisions;
    expect(d.map((x, i) => (x === 'R' ? i + 1 : 0)).filter(Boolean)).toEqual([3, 4, 13, 14]);
  });
  it('T-SPLIT-F3d a modify-and-approve header after the refuse segment ends that segment', () => {
    expect(run(N.F3d).decisions).toEqual(['AWC', 'R', 'AWC', 'AWC', 'AWC', 'AWC', 'AWC', 'R', 'AWC', 'AWC']);
  });
  it('T-SPLIT-F3e refusal wording off the header grammar in a condition is not a split', () => {
    const r = run(N.F3e);
    expect(r.decisions).toEqual(rep('AWC', 3));
    expect(r.split).toEqual({ notices: 0, refs_unresolved: 0, notices_unknown: 0 });
  });
  it('T-SPLIT-F3g (CHAT-183, F3) the refuse header inside a condition is an item refusal, not counted', () => {
    const r = run(N.F3g);
    expect(r.decisions).toEqual(['AWC', 'R', 'AWC']);
    expect(r.split).toEqual({ notices: 1, refs_unresolved: 0, notices_unknown: 0 });
  });
});

describe('CHAT-157 split decisions: the paragraph cuts', () => {
  it('T-SPLIT-cut-reasons nothing after "the reasons for the decision" is read', () => {
    expect(run(N.cutReasons).decisions).toEqual(['A', 'A', 'R', 'A', 'A']);
  });
  it('T-SPLIT-cut-paraend nothing after the date-decision-mailed line is read', () => {
    expect(run(N.cutParaEnd).decisions).toEqual(['A', 'A', 'R', 'A', 'A']);
  });
});

describe('CHAT-157 split decisions: fail closed (all items unknown, counted)', () => {
  const unknown = (lines: string[], n: number) => {
    const r = run(lines);
    expect(r.decisions).toEqual(rep('unknown', n));
    return r;
  };
  it('T-SPLIT-fail-a1 a refused number that names no item', () => {
    const r = unknown(N.failA1, 5);
    expect(r.split).toEqual({ notices: 1, refs_unresolved: 1, notices_unknown: 1 });
  });
  it('T-SPLIT-fail-a2 a refused number that names two items', () => {
    const r = unknown(N.failA2, 5);
    expect(r.split?.refs_unresolved).toBe(1);
  });
  it('T-SPLIT-fail-b1 a refused list F2_ANY detects and F2_LIST cannot parse ("3 to 5")', () => unknown(N.failB1, 5));
  it('T-SPLIT-fail-b1t a refused list "3 through" (the list guard)', () => unknown(N.failB1t, 5));
  it('T-SPLIT-fail-b2 a refused list "1-"', () => unknown(N.failB2, 5));
  it('T-SPLIT-fail-b3 a by-law id with nothing pending', () => unknown(N.failB3, 8));
  it('T-SPLIT-fail-b4 a number left pending after a resolved reference', () => unknown(N.failB4, 8));
  it('T-SPLIT-fail-c a family match with no refusal reference', () => unknown(N.failC, 5));
  it('T-SPLIT-fail-d1 the refusal printed before the approval', () => unknown(N.failD1, 5));
  it('T-SPLIT-fail-d2 the notice decision is not an approval', () => unknown(N.failD2, 5));
  it('T-SPLIT-fail-e1 the approval printed before the refusal (F1)', () => unknown(N.failE1, 8));
  it('T-SPLIT-fail-e2 the approval sentence classes as refused (F1)', () => unknown(N.failE2, 8));
});

describe('CHAT-157 split decisions: mapping, dedup, errors, PII, defaults', () => {
  it('T-SPLIT-consent the consent item is skipped and the mapping follows the raw items after the skip', () => {
    const r = run(N.consent);
    expect(r.rows.map((x) => [x.item_ordinal, ab(x.decision)])).toEqual([[1, 'A'], [3, 'R'], [4, 'A']]);
  });
  it('T-SPLIT-dedup two documents, same date, differing refused items: duplicate_same_date_conflict', () => {
    const d1 = SC.doc(N.F2a, { doc_id: 'doc-1', sha256: 'a'.repeat(64) });
    const d2 = SC.doc(N.dedupOther, { doc_id: 'doc-2', sha256: 'b'.repeat(64) });
    const rec = C.reconcileNotices([{ doc: d1, result: C.shapeDocument(d1, {}) }, { doc: d2, result: C.shapeDocument(d2, {}) }], { config: CFG });
    const rows = rec.rows as Json[];
    expect(rows.length).toBe(16);
    expect(rows.every((r) => r.drop_reason === 'duplicate_same_date_conflict')).toBe(true);
  });
  it('T-SPLIT-D33 a throw inside the split leaves the compute as a closed code + doc id + page, never text', () => {
    const T = loadCompute(['throw-text', ...RED_MUTANT]);
    const doc = SC.doc(N.F2a);
    let err: Json | null = null;
    try { T.shapeDocument(doc, {}); } catch (e) { err = e as Json; }
    expect(err).not.toBeNull();
    expect(String(err!.message)).toMatch(/^COA_PARSE_E_SPLIT_[A-Z_]+ doc=\S+ page=\S+$/);
    expect(String(err!.message)).not.toMatch(/synth-fixture/i);
    expect(err!.code).toBe('SPLIT_THROW');
  });
  it('T-SPLIT-PII no fixture text leaves shapeDocument or the stats; the counters are integers', () => {
    const keys = ['F1a', 'F1b', 'F1c', 'F1d', 'F1e', 'F1f', 'F1g', 'F2a', 'F2b', 'F2c', 'F2d', 'F2e', 'F2g', 'F3a', 'F3b', 'F3c', 'F3d', 'F3e', 'F3g', 'failA1', 'failB3', 'failE2', 'consent'];
    for (const k of keys) {
      const r = run(N[k]);
      expect(JSON.stringify(r.result)).not.toMatch(/synth-fixture/i);
      expect(JSON.stringify(r.rec.stats)).not.toMatch(/synth-fixture/i);
      for (const v of Object.values(r.split ?? {})) expect(Number.isInteger(v)).toBe(true);
    }
  });
  it('T-SPLIT-VERSION gate #48: EXTRACTOR_VERSION and the descriptor staleness.logic_version move together, to coa-extractor-4', () => {
    const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/load-coa-notices.descriptor.json'), 'utf8')) as Json;
    expect(C.EXTRACTOR_VERSION).toBe(d.staleness.logic_version);
    expect(C.EXTRACTOR_VERSION).toBe('coa-extractor-4');
  });
  it('T-SPLIT-counter the counter is summed over kept PDF notices and rides the coa_notices_load block', () => {
    const docs = ['F2a', 'F1g', 'failA1', 'G1'].map((k, i) => SC.doc(N[k], { doc_id: `doc-${i}`, sha256: String(i).repeat(64) }));
    const rec = C.reconcileNotices(docs.map((doc) => ({ doc, result: C.shapeDocument(doc, {}) })), { config: CFG });
    expect(rec.stats.split_decisions).toEqual({ notices: 3, refs_unresolved: 1, notices_unknown: 2 });
    const meta = C.buildLoadMeta({ acquired: { reconcile: rec.stats }, written: {} });
    expect(meta.split_decisions).toEqual({ notices: 3, refs_unresolved: 1, notices_unknown: 2 });
    expect(C.buildLoadMeta({ acquired: {}, written: {} }).split_decisions).toEqual({ notices: 0, refs_unresolved: 0, notices_unknown: 0 });
  });
  it('G-1 a whole refusal is not a split', () => {
    const r = run(N.G1);
    expect(r.decisions).toEqual(rep('R', 4));
    expect(r.split?.notices ?? 0).toBe(0);
  });
  it('G-2 both whole-application templates printed: the notice decision, not a split', () => {
    expect(run(N.G2).decisions).toEqual(rep('AWC', 3));
  });
  it('G-3 a typo whole refusal stays refused', () => {
    expect(run(N.G3).decisions).toEqual(rep('R', 3));
  });
  it('G-4 corpus NOTICE_A (refusal wording only in the conditions sentence) is AWC, not a split', () => {
    const doc = corpus.doc({}, corpus.NOTICE_A);
    const rec = C.reconcileNotices([{ doc, result: C.shapeDocument(doc, {}) }], { config: CFG });
    expect((rec.rows as Json[]).map((r) => ab(r.decision))).toEqual(rep('AWC', 3));
  });
  it('G-5 waste wording in the conditions is not a refusal', () => {
    expect(run(N.G5).decisions).toEqual(rep('A', 3));
  });
  it('G-6 a values-batch notice keeps its own per-item decisions', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the closed vocab (values only)
    const VOCAB = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/vocab.json'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the target map version
    const TM = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/target-map.json'));
    const item = (n: number, decision: string) => ({ item_ordinal: n, cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: `10.20.30.4${n}(1)`, exception_ref: null, target: 'lot_coverage_pct', target_status: 'mapped', bound: 'max', required_value: 33, required_unit: 'pct', proposed_value: 39, proposed_unit: 'pct', parse_status: 'pair', parse_confidence: 'high', qualified: false, decision });
    const b = { schema: 'coa-values-batch-1', batch_id: 'coa-2026-t', parser_version: 'coa-parse/1', vocab_version: VOCAB.version, target_map_version: TM.version, notices: [{ application_number: 'A0100/26SC', doc_type: 'decision_notice', hearing_date: '2026-07-08', zoning_as_stated: 'RD', decision: 'approved', items: [item(1, 'approved'), item(2, 'refused')] }] };
    const doc = { doc_id: 'coa-2026-t', sha256: 'c'.repeat(64), hearing_date: null, kind: 'committee', revision: 'original', family: 'aic_values_batch', parser_version: b.parser_version, vocab_version: b.vocab_version, target_map_version: b.target_map_version };
    const rec = C.reconcileNotices([{ doc, result: C.shapeValuesBatch(b) }], { config: CFG });
    expect((rec.rows as Json[]).map((r) => ab(r.decision))).toEqual(['A', 'R']);
  });
  it('G-7 a notice with no decision anchor keeps unknown on every item (NOT NULL holds)', () => {
    expect(run(N.G7).decisions).toEqual(rep('unknown', 4));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T-SPLIT-CHAT183: the CHAT-183 trip-wire. The split reads exactly the 70 pinned 2017 documents; bounding the read at a
// conditions header is required before this extractor reads any new document. No environment variable, no skipIf.
// ---------------------------------------------------------------------------------------------------------------
const CHAT183 = 'the PDF split reads exactly the 70 pinned 2017 documents (CHAT-183: bound the read at a conditions header before this extractor reads any new document)';
const MAN_REL = 'scripts/seeds/coa-notices/manifest-toronto-2017.json';
const DESC_REL = 'scripts/load-coa-notices.descriptor.json';
const STEP_REL = 'scripts/load-coa-notices.js';
const N_DOCS = 70;
const DIGEST = '19be36912dfeb70dd1547a947f8abb5b59daaf2449024bb2fea8fb63fdca0ff7';
const REQUIRERS = ['scripts/analysis/coa-notices/build-manifest.mjs', 'scripts/load-coa-notices.js'];
// before-image: R-M golden before-images, which src/tests/helpers/before-image-sandbox.ts maps to a per-file tmp root (not descriptors).
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'coverage', 'dist', 'build', '.turbo', '.expo', 'before-image']);

function walk(dir: string, keep: (p: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), keep, out); continue; }
    const p = path.join(dir, e.name);
    if (keep(p)) out.push(p);
  }
  return out;
}
function pdfSets(node: unknown, acc: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((x) => pdfSets(x, acc));
  else if (node && typeof node === 'object') {
    if ((node as Json).format === 'pdf_document_set') acc.push(node as Json);
    for (const v of Object.values(node as Json)) pdfSets(v, acc);
  }
  return acc;
}
interface LockInput { descriptors: Record<string, Json>; manifest: Json | null; stepSource: string; stepDescriptor: unknown; requirers: string[] }
/** The lock: pure. [] when green, else what differed. */
function chat183(x: LockInput): string[] {
  const p: string[] = [];
  const sets = Object.entries(x.descriptors).flatMap(([rel, j]) => pdfSets(j).map((e) => ({ rel, e })));
  if (sets.length !== 1) p.push(`pdf_document_set externals: ${sets.length} (${sets.map((s) => s.rel).join(', ')})`);
  const one = sets[0];
  if (one && (one.rel !== DESC_REL || one.e.manifest !== MAN_REL)) p.push(`external is ${one.rel} -> ${one.e.manifest}`);
  if (!/^const descriptor = require\('\.\/load-coa-notices\.descriptor\.json'\);$/m.test(x.stepSource)) p.push(`${STEP_REL} does not bind its descriptor by the literal path`);
  if (!isDeepStrictEqual(x.stepDescriptor, x.descriptors[DESC_REL])) p.push(`${STEP_REL}'s descriptor is not ${DESC_REL}`);
  if (!isDeepStrictEqual([...x.requirers].sort(), REQUIRERS)) p.push(`load-coa-notices requirers: ${x.requirers.join(', ')}`);
  if (!x.manifest) p.push('the 2017 manifest is missing');
  else {
    const docs = x.manifest.documents as Json[];
    const d = crypto.createHash('sha256').update(docs.map((m) => m.sha256).sort().join('\n')).digest('hex');
    if (docs.length !== N_DOCS || d !== DIGEST) p.push(`manifest ${docs.length} / ${d.slice(0, 12)}`);
  }
  return p;
}
const REQUIRE_RE = /(?:require\(|from\s+|import\()\s*['"`][^'"`]*load-coa-notices(?:\.js|\.descriptor\.json)?['"`]/;
function committedInput(): LockInput {
  const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join('/');
  const descriptors = Object.fromEntries(walk(REPO_ROOT, (f) => f.endsWith('.descriptor.json')).map((f) => [rel(f), JSON.parse(fs.readFileSync(f, 'utf8'))]));
  const manPath = path.join(REPO_ROOT, MAN_REL);
  const code = (f: string) => /\.(c|m)?[jt]sx?$/.test(f) && !/\.test\.[jt]sx?$/.test(f) && !f.includes(`${path.sep}tests${path.sep}`);
  const requirers = [...walk(path.join(REPO_ROOT, 'scripts'), code), ...walk(path.join(REPO_ROOT, 'src'), code)]
    .filter((f) => REQUIRE_RE.test(fs.readFileSync(f, 'utf8'))).map(rel);
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the step file's own descriptor binding
  const step = require(path.join(REPO_ROOT, STEP_REL)) as Json;
  return {
    descriptors,
    manifest: fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : null,
    stepSource: fs.readFileSync(path.join(REPO_ROOT, STEP_REL), 'utf8'),
    stepDescriptor: step.descriptor,
    requirers,
  };
}

describe('T-SPLIT-CHAT183 the split reads exactly the 70 pinned 2017 documents (CHAT-183)', () => {
  const input = committedInput();
  it('T-SPLIT-CHAT183 the committed tree', () => {
    expect(chat183(input), CHAT183).toEqual([]);
  });
  it('T-SPLIT-CHAT183-neg every route to a new document is flagged; a reorder is not', () => {
    const clone = (o: unknown) => JSON.parse(JSON.stringify(o));
    const ext = (d: Json) => d.inputs.reads.externals as Json[];
    const other = Object.keys(input.descriptors).find((k) => k !== DESC_REL) as string;
    const man = input.manifest as Json;
    const mutants: Record<string, LockInput> = {
      'manifest repointed': (() => { const d = clone(input.descriptors); ext(d[DESC_REL])[0]!.manifest = 'scripts/seeds/coa-notices/manifest-toronto-2018.json'; return { ...input, descriptors: d, stepDescriptor: d[DESC_REL] }; })(),
      'second pdf_document_set (union primary)': (() => { const d = clone(input.descriptors); ext(d[DESC_REL]).push({ ...clone(ext(d[DESC_REL])[0]), id: 'synthetic:second-set' }); return { ...input, descriptors: d, stepDescriptor: d[DESC_REL] }; })(),
      "another step's descriptor declares one": (() => { const d = clone(input.descriptors); d[other].inputs = { ...(d[other].inputs || {}), reads: { ...((d[other].inputs || {}).reads || {}), externals: [{ id: 'synthetic:other', format: 'pdf_document_set', manifest: 'scripts/seeds/x.json' }] } }; return { ...input, descriptors: d }; })(),
      'the external moved to another step (same manifest)': (() => { const d = clone(input.descriptors); const e = ext(d[DESC_REL]).shift(); d[other].inputs = { ...(d[other].inputs || {}), reads: { ...((d[other].inputs || {}).reads || {}), externals: [e] } }; return { ...input, descriptors: d, stepDescriptor: d[DESC_REL] }; })(),
      'manifest +1 document': { ...input, manifest: { ...man, documents: [...man.documents, { ...man.documents[0], doc_id: 'synthetic-extra', sha256: '0'.repeat(64) }] } },
      'manifest -1 document': { ...input, manifest: { ...man, documents: man.documents.slice(1) } },
      'one sha changed': { ...input, manifest: { ...man, documents: [{ ...man.documents[0], sha256: 'f'.repeat(64) }, ...man.documents.slice(1)] } },
      'manifest missing': { ...input, manifest: null },
      'step file binds its descriptor by an expression': { ...input, stepSource: input.stepSource.replace("require('./load-coa-notices.descriptor.json')", "require(process.env.SYNTHETIC || './load-coa-notices.descriptor.json')") },
      'step descriptor differs from the file': { ...input, stepDescriptor: { ...(input.stepDescriptor as Json), synthetic: true } },
      'an extra requirer': { ...input, requirers: [...input.requirers, 'scripts/analysis/synthetic-caller.mjs'] },
    };
    for (const [name, m] of Object.entries(mutants)) expect(chat183(m).length, `${name} must be flagged (${CHAT183})`).toBeGreaterThan(0);
    expect(chat183({ ...input, manifest: { ...man, documents: [...man.documents].reverse() } })).toEqual([]);
  });
});
