// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2b (RE-FREEZE #38, T-ACQ-VAL)
//
// T-ACQ-VAL drives the VALUES-BATCH half of the `pdf_document_set` arm in `scripts/lib/step/acquire.js`: a second
// optional manifest of committed, sha256-pinned values-only batch files read from the repo with NO network. Every
// case is offline: a temp `repoRoot` carries synthetic manifests; the fake `ctxFetch` throws if the arm ever calls
// it for a batch.
//
// RED BASELINE: `COA_VALUES_ARM=absent` hands the arm no `shapeValuesBatch` seam and strips `values_manifest`
// from the external — the pre-amendment arm. Cases that need a batch FAIL against it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '../../');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS modules under test

// eslint-disable-next-line @typescript-eslint/no-require-imports
const acquire = require(path.join(REPO_ROOT, 'scripts/lib/step/acquire.js')) as { acquirePdfDocumentSet: (a: Json) => Promise<Json> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const coa = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VOCAB = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/vocab.json')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TARGET_MAP = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/target-map.json')) as Json;

const ABSENT = process.env.COA_VALUES_ARM === 'absent';
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const NULL_LOG = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const CONFIG = { PDF_PACE_MS: 2000, PDF_MAX_BYTES: 10_000_000, PDF_MAX_PAGES: 50, PDF_MAX_TEXT_CHARS: 1_000_000, PDF_LINE_Y_TOL: 2 };

function goodBatch(id: string, app: string): Json {
  return {
    schema: 'coa-values-batch-1', batch_id: id, parser_version: 'coa-parse/1', vocab_version: VOCAB.version, target_map_version: TARGET_MAP.version,
    notices: [{
      application_number: app, doc_type: 'decision_notice', hearing_date: '2026-07-08', zoning_as_stated: 'RD (f9.0)', decision: 'approved',
      items: [{
        item_ordinal: 1, cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.30.40(1)(A)', exception_ref: null,
        target: 'lot_coverage_pct', target_status: 'mapped', bound: 'max', required_value: 33, required_unit: 'pct', proposed_value: 39, proposed_unit: 'pct',
        parse_status: 'pair', parse_confidence: 'high', qualified: false, decision: 'approved',
      }],
    }],
  };
}

/** A temp repoRoot: a PDF manifest with ONE unreachable document is not needed — zero PDFs would be refused, so pin one dead doc. */
function writeRepo(batches: Array<{ id: string; body: string; sha?: string }>, extraManifest: Json = {}): { repoRoot: string } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'valset-'));
  const seeds = path.join(repoRoot, 'scripts', 'seeds', 'x');
  fs.mkdirSync(path.join(seeds, 'aic'), { recursive: true });
  fs.writeFileSync(path.join(seeds, 'manifest.json'), JSON.stringify({
    user_agent: 'valset-test/1.0',
    documents: [{ doc_id: 'doc-1', url: 'https://example.test/doc-1.pdf', sha256: 'c'.repeat(64), hearing_date: '2017-07-13', kind: 'committee', revision: 'original', session: 'full', panel: 'unknown' }],
  }));
  const entries = batches.map((b) => {
    const rel = `scripts/seeds/x/aic/${b.id}.json`;
    if (b.body !== '__missing__') fs.writeFileSync(path.join(repoRoot, rel), b.body);
    return { batch_id: b.id, path: rel, sha256: b.sha ?? sha(b.body), notices: 1, items: 1, captured_on: '2026-10-22' };
  });
  fs.writeFileSync(path.join(seeds, 'values.json'), JSON.stringify({ schema: 'coa-values-manifest-1', source_family: 'aic_values_batch', batches: entries, excluded: [], ...extraManifest }));
  return { repoRoot };
}

function args(repoRoot: string, over: Json = {}): Json {
  const external: Json = {
    id: 'coa_notices', format: 'pdf_document_set', manifest: 'scripts/seeds/x/manifest.json', values_manifest: 'scripts/seeds/x/values.json',
    pdf: { host_allowlist: ['example.test'], pace_ms_from_config: 'PDF_PACE_MS', max_doc_bytes_from_config: 'PDF_MAX_BYTES', max_pages_from_config: 'PDF_MAX_PAGES', max_text_chars_from_config: 'PDF_MAX_TEXT_CHARS', line_y_tolerance_from_config: 'PDF_LINE_Y_TOL' },
  };
  if (ABSENT) delete external.values_manifest;
  return {
    ctxFetch: async () => ({ status: 404, ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }),
    log: NULL_LOG, tag: 'acquire', external,
    descriptor: { identity: { name: 'load_coa_notices', spec_version: '1.0' }, staleness: { trigger: [{ signal: 'content_hash', position: 'post_acquisition', external: 'x' }], logic_version: 'v1' } },
    config: CONFIG, prior: null, forced: false, emitSkeleton: {}, timeoutMs: 5000, repoRoot,
    base: { content_hash: null, source_dataset_version: null, bytes_downloaded: 0 },
    tier1: { skip: false, reason: 'no_pre_acquisition_trigger' },
    shapeDocument: coa.shapeDocument, shapeValuesBatch: ABSENT ? undefined : coa.shapeValuesBatch,
    sleep: async () => {}, targetEmpty: async () => false,
    runner: { step_acquire_pdf_pace_ms: 2000, step_acquire_max_redirects: 5 }, ...over,
  };
}

const batchResults = (out: Json) => out.docResults.filter((r: Json) => r.doc.family === 'aic_values_batch');

describe('T-ACQ-VAL values batches ride the same primary, offline', () => {
  it('reads, verifies and shapes a pinned batch with no fetch and no pace', async () => {
    const body = JSON.stringify(goodBatch('coa-2026-t', 'A0100/26SC'));
    const { repoRoot } = writeRepo([{ id: 'coa-2026-t', body }]);
    const fetched: string[] = [];
    const out = await acquire.acquirePdfDocumentSet(args(repoRoot, { ctxFetch: async (u: string) => { fetched.push(u); return { status: 404, ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }; } }));
    const [r] = batchResults(out);
    expect(r.doc_status).toBe('parsed');
    expect(r.doc).toMatchObject({ doc_id: 'coa-2026-t', sha256: sha(body), family: 'aic_values_batch', parser_version: 'coa-parse/1', target_map_version: TARGET_MAP.version });
    expect(r.result.notices).toHaveLength(1);
    expect(fetched).toEqual(['https://example.test/doc-1.pdf']); // the PDF only; never a batch
    expect(out.acquired.document_set.docs_total).toBe(2);
    expect(out.acquired.document_set.docs_by_status.parsed).toBe(1);
    expect(out.acquired.document_set.docs_by_status.http_error).toBe(1); // the dead PDF, counted by the existing path
  });
  it('a batch whose bytes differ from the pin is sha_mismatch and yields no notices', async () => {
    const body = JSON.stringify(goodBatch('coa-2026-t', 'A0100/26SC'));
    const { repoRoot } = writeRepo([{ id: 'coa-2026-t', body, sha: 'e'.repeat(64) }]);
    const [r] = batchResults(await acquire.acquirePdfDocumentSet(args(repoRoot)));
    expect(r.doc_status).toBe('sha_mismatch');
    expect(r.result).toBeNull();
  });
  it('a missing, unparseable or invalid batch is extract_error (C2 FAILs before any write)', async () => {
    const bad = JSON.stringify({ ...goodBatch('coa-2026-u', 'A0100/26SC'), notices: [{ ...goodBatch('x', 'A0100/26SC').notices[0], purpose: 'free text' }] });
    const { repoRoot } = writeRepo([
      { id: 'coa-2026-t', body: '__missing__', sha: 'a'.repeat(64) },
      { id: 'coa-2026-u', body: bad },
      { id: 'coa-2026-v', body: '{not json' },
    ]);
    const out = await acquire.acquirePdfDocumentSet(args(repoRoot));
    expect(batchResults(out).map((r: Json) => r.doc_status)).toEqual(['extract_error', 'extract_error', 'extract_error']);
    expect(out.acquired.document_set.docs_by_status.extract_error).toBe(3);
  });
  it('the values manifest joins the content hash; without one the hash is the old formula', async () => {
    const body = JSON.stringify(goodBatch('coa-2026-t', 'A0100/26SC'));
    const { repoRoot } = writeRepo([{ id: 'coa-2026-t', body }]);
    const withValues = await acquire.acquirePdfDocumentSet(args(repoRoot));
    const manifestSha = sha(fs.readFileSync(path.join(repoRoot, 'scripts/seeds/x/manifest.json')));
    const valuesSha = sha(fs.readFileSync(path.join(repoRoot, 'scripts/seeds/x/values.json')));
    expect(withValues.acquired.content_hash).toBe(sha(`${manifestSha}:${valuesSha}:v1`));
    const noValues = args(repoRoot);
    delete (noValues.external as Json).values_manifest;
    expect((await acquire.acquirePdfDocumentSet(noValues)).acquired.content_hash).toBe(sha(`${manifestSha}:v1`));
  });
  it('an unchanged manifest pair skips with no batch read; a new batch (a manifest commit) re-runs', async () => {
    const t = JSON.stringify(goodBatch('coa-2026-t', 'A0100/26SC'));
    const { repoRoot } = writeRepo([{ id: 'coa-2026-t', body: t }]);
    const first = await acquire.acquirePdfDocumentSet(args(repoRoot));
    const again = await acquire.acquirePdfDocumentSet(args(repoRoot, { prior: { content_hash: first.acquired.content_hash } }));
    expect(again.tier2).toMatchObject({ skip: true, reason: 'unchanged_content_hash' });
    expect(again.docResults).toHaveLength(0);
    const u = JSON.stringify(goodBatch('coa-2026-u', 'A0101/26SC'));
    const grown = writeRepo([{ id: 'coa-2026-t', body: t }, { id: 'coa-2026-u', body: u }]);
    const rerun = await acquire.acquirePdfDocumentSet(args(grown.repoRoot, { prior: { content_hash: first.acquired.content_hash } }));
    expect(rerun.tier2.skip).toBe(false);
    expect(batchResults(rerun)).toHaveLength(2);
  });
  it('refuses a declared values_manifest with no shapeValuesBatch seam, and an escaping path', async () => {
    const body = JSON.stringify(goodBatch('coa-2026-t', 'A0100/26SC'));
    const { repoRoot } = writeRepo([{ id: 'coa-2026-t', body }]);
    await expect(acquire.acquirePdfDocumentSet(args(repoRoot, { shapeValuesBatch: undefined }))).rejects.toThrow('shapeValuesBatch');
    const a = args(repoRoot);
    (a.external as Json).values_manifest = '../values.json';
    await expect(acquire.acquirePdfDocumentSet(a)).rejects.toThrow('repo-relative');
  });
});

// The REAL router path: runIngestPhase calls `acquireExternal`, which dispatches to the arm. A defect found at the
// 2210 fleet night: the router neither accepted nor forwarded `shapeValuesBatch`, so every declared values_manifest
// threw. The direct-arm cases above could not see it.
describe('T-ACQ-VAL-ROUTER values batches through acquireExternal', () => {
  it('forwards shapeValuesBatch to the arm and returns the batch as a parsed document', async () => {
    const body = JSON.stringify(goodBatch('coa-2026-t', 'A0100/26SC'));
    const { repoRoot } = writeRepo([{ id: 'coa-2026-t', body }]);
    const a = args(repoRoot);
    const out = await (acquire as unknown as { acquireExternal: (x: Json) => Promise<Json> }).acquireExternal({
      ...a, slug: 'load-coa-notices', preAcquisitionGate: () => ({ skip: false, reason: 'no_pre_acquisition_trigger' }),
    });
    const [r] = batchResults(out);
    expect(r.doc_status).toBe('parsed');
    expect(r.result.notices).toHaveLength(1);
  });
});
