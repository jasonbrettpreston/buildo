// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §11 (T-ACQ, RE-FREEZE #32)
//
// T-ACQ drives the `pdf_document_set` acquisition arm of `scripts/lib/step/acquire.js` — the ONE
// arm that fetches NO single URL: its source version is the committed manifest's sha256, its
// documents are pinned sha256-by-sha256, and every document is fetched under a host allowlist, a
// byte cap, a pace floor, and an in-memory text extraction. Everything here is fake: a fake
// `ctxFetch`, a fake `sleep`, a temp `repoRoot` carrying the synthetic manifest. No real network
// call, no file written by the arm.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ReadableStream } from 'node:stream/web';

const REPO_ROOT = path.resolve(__dirname, '../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const acquire = require(path.join(REPO_ROOT, 'scripts/lib/step/acquire.js')) as {
  acquirePdfDocumentSet: (args: Record<string, unknown>) => Promise<DocSetResult>;
  acquireExternal: (args: Record<string, unknown>) => Promise<DocSetResult>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const coa = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as {
  shapeDocument: (doc: Record<string, unknown>, cfg: unknown) => { doc_status: string; notices: unknown[] };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfTool = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/build-pdf.cjs')) as {
  buildPdf: (pages: Array<Array<Record<string, unknown>>>, opts?: { noText?: boolean; perPage?: number }) => Buffer;
  buildLinesPdf: (lines: string[], opts?: { perPage?: number }) => Buffer;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const corpus = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/corpus.cjs')) as {
  NOTICE_A: string[];
};

// ── the fake fetch's response shape (no `body` → the arm reads `arrayBuffer()`) ───────────────
type FakeResponse = {
  status: number;
  ok: boolean;
  headers: { get: (name: string) => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
  body?: ReadableStream<Uint8Array>;
};

type FetchCall = { url: string; init: Record<string, unknown> };
type FetchRecorder = {
  calls: FetchCall[];
  urls: string[];
  ctxFetch: (url: string, init?: Record<string, unknown>) => Promise<FakeResponse>;
};

type DocSetResult = {
  acquired: {
    content_hash: string;
    source_dataset_version: string;
    bytes_downloaded: number;
    document_set: {
      manifest_sha256: string;
      docs_total: number;
      docs_excluded: number;
      docs_by_status: Record<string, number>;
      bytes_fetched: number;
    };
  };
  tier1: { skip: boolean; reason: string };
  tier2: { skip: boolean; reason: string };
  features: unknown[];
  docResults: Array<{ doc: Record<string, unknown>; doc_status: string; result: unknown }>;
  emitBlock: unknown;
};

const HOST = 'example.test';

const OK_HEADERS = (extra: Record<string, string> = {}) => {
  const map: Record<string, string> = { ...extra };
  return { get: (name: string): string | null => { const k = name.toLowerCase(); return k in map ? map[k] ?? null : null; } };
};

/** `{status, ok, headers, arrayBuffer}` — the only response shape the arm ever reads. */
function makeResponse(status: number, buf: Buffer | null, extraHeaders: Record<string, string> = {}): FakeResponse {
  const bytes = buf || Buffer.alloc(0);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: OK_HEADERS(extraHeaders),
    arrayBuffer: async () => ab,
  };
}

type Recorder = FetchRecorder & {
  replies: Map<string, FakeResponse>;
  handler: (url: string, buf: Buffer | null, status?: number, extraHeaders?: Record<string, string>) => void;
  streamHandler: (url: string, buf: Buffer, extraHeaders?: Record<string, string>) => void;
};

function makeRecorder(): Recorder {
  const calls: FetchCall[] = [];
  const urls: string[] = [];
  const replies = new Map<string, FakeResponse>();
  const handler = (url: string, buf: Buffer | null, status = 200, extraHeaders: Record<string, string> = {}): void => {
    replies.set(url, makeResponse(status, buf, extraHeaders));
  };
  // The streamed shape the arm's `downloadWithRetries` reads (a real Node ReadableStream body).
  const streamHandler = (url: string, buf: Buffer, extraHeaders: Record<string, string> = {}): void => {
    replies.set(url, {
      status: 200,
      ok: true,
      headers: OK_HEADERS(extraHeaders),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      body: streamOf(buf),
    });
  };
  const ctxFetch = async (url: string, init?: Record<string, unknown>): Promise<FakeResponse> => {
    calls.push({ url, init: init || {} });
    urls.push(url);
    return replies.get(url) || makeResponse(404, null);
  };
  return { calls, urls, ctxFetch, replies, handler, streamHandler };
}

const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

// ── the external / descriptor / config the arm reads ────────────────────────────────────────
function makeExternal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'coa_notices',
    format: 'pdf_document_set',
    manifest: 'scripts/seeds/x/manifest.json',
    pdf: {
      host_allowlist: [HOST],
      user_agent: 'from-external',
      pace_ms_from_config: 'PDF_PACE_MS',
      max_doc_bytes_from_config: 'PDF_MAX_BYTES',
      max_pages_from_config: 'PDF_MAX_PAGES',
      max_text_chars_from_config: 'PDF_MAX_TEXT_CHARS',
      line_y_tolerance_from_config: 'PDF_LINE_Y_TOL',
    },
    ...overrides,
  };
}

const CONFIG = {
  PDF_PACE_MS: 2000,
  PDF_MAX_BYTES: 10_000_000,
  PDF_MAX_PAGES: 50,
  PDF_MAX_TEXT_CHARS: 1_000_000,
  PDF_LINE_Y_TOL: 2,
};

function makeDescriptor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    identity: { name: 'load_coa_notices', spec_version: '1.0' },
    staleness: {
      trigger: [{ signal: 'content_hash', position: 'post_acquisition', external: 'x' }],
      logic_version: 'v1',
    },
    ...overrides,
  };
}

const NULL_LOG = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

type ManifestDoc = {
  doc_id: string;
  url: string;
  sha256: string;
  hearing_date: string;
  kind: string;
  revision?: string;
  session?: string;
  panel?: string;
};

function makeDoc(i: number, buf: Buffer, overrides: Partial<ManifestDoc> = {}): ManifestDoc {
  return {
    doc_id: `doc-${i}`,
    url: `https://${HOST}/doc-${i}.pdf`,
    sha256: sha256(buf),
    hearing_date: '2017-07-13',
    kind: 'committee',
    revision: 'original',
    session: 'full',
    panel: 'etobicoke_york',
    ...overrides,
  };
}

/** Write the synthetic manifest into a fresh temp repoRoot and return its path. */
function writeManifest(documents: ManifestDoc[], extra: Record<string, unknown> = {}): { repoRoot: string; manifestSha: string; body: string } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfset-'));
  const rel = path.join('scripts', 'seeds', 'x', 'manifest.json');
  const abs = path.join(repoRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const body = `${JSON.stringify({ user_agent: 'pdfset-test/1.0', documents, ...extra }, null, 2)}\n`;
  fs.writeFileSync(abs, body);
  return { repoRoot, manifestSha: sha256(body), body };
}

/** The arm's full argument object. */
function baseArgs(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    log: NULL_LOG,
    tag: 'acquire',
    external: makeExternal(),
    descriptor: makeDescriptor(),
    config: CONFIG,
    prior: null,
    forced: false,
    emitSkeleton: {},
    timeoutMs: 5000,
    base: { content_hash: null, source_dataset_version: null, bytes_downloaded: 0 },
    tier1: { skip: false, reason: 'no_pre_acquisition_trigger' },
    shapeDocument: coa.shapeDocument,
    sleep: async () => {},
    targetEmpty: async () => false, // R-DD: the target holds rows, so a skip is honoured
    // Spec 124 R-EB (a): the runner-owned pace floor and redirect cap (seed defaults)
    runner: { step_acquire_pdf_pace_ms: 2000, step_acquire_max_redirects: 5 },
    ...over,
  };
}

/** The first `docResults` entry (the arm always returns one per document). */
function firstResult(out: DocSetResult) {
  const r = out.docResults[0];
  if (!r) throw new Error('expected at least one docResults entry');
  return r;
}

const NOTICE_PDF = pdfTool.buildLinesPdf(corpus.NOTICE_A);

/** A Node ReadableStream over `buf` — the streaming shape the arm's `downloadWithRetries` reads. */
function streamOf(buf: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
}

// The `FetchRecorder` type above is the shape `makeRecorder` returns; the arm only ever reads
// `ctxFetch`, `calls` and `urls`.

// ════════════════════════════════════════════════════════════════════════════════════════════
// 1 — the happy path
// ════════════════════════════════════════════════════════════════════════════════════════════
// rule-map: R-BY — pdf_document_set acquisition arm (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
describe('T-ACQ-1 happy path: two pinned documents', () => {
  it('parses both, counts them, and reports every byte fetched', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const d2 = makeDoc(2, NOTICE_PDF, { revision: 'revised' });
    const { repoRoot } = writeManifest([d1, d2]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, null, 302, { location: d1.url }); // never used: exact URL replies below
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));

    expect(out.docResults).toHaveLength(2);
    expect(out.docResults.map((r) => r.doc_status)).toEqual(['parsed', 'parsed']);
    expect(out.acquired.document_set.docs_by_status.parsed).toBe(2);
    const notices = (firstResult(out).result as { notices: unknown[] }).notices;
    expect(Array.isArray(notices)).toBe(true);
    expect(notices.length).toBeGreaterThanOrEqual(1);
    for (const r of out.docResults) expect('text_pages' in r.doc).toBe(false);
    expect(out.acquired.document_set.bytes_fetched).toBe(2 * NOTICE_PDF.length);
    expect(out.acquired.bytes_downloaded).toBe(2 * NOTICE_PDF.length);
    expect(out.tier2.skip).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 2 — the pace floor
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-2 pacing', () => {
  it('waits the pace exactly once (between the two documents) at the 2000ms floor', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const d2 = makeDoc(2, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1, d2]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);
    const sleep = vi.fn(async () => {});

    await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot, sleep }));

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('refuses a pace below the floor, naming pace_ms_from_config', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const d2 = makeDoc(2, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1, d2]);
    const fetch = makeRecorder();

    await expect(
      acquire.acquirePdfDocumentSet(baseArgs({
        ctxFetch: fetch.ctxFetch, repoRoot, config: { ...CONFIG, PDF_PACE_MS: 1500 },
      })),
    ).rejects.toThrow(/pace_ms_from_config/);
    expect(fetch.calls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 3 — the tier-2 gate fires BEFORE any GET
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-3 skip before any GET', () => {
  async function firstRun(): Promise<{ repoRoot: string; contentHash: string; d1: ManifestDoc; d2: ManifestDoc; bytes: Buffer }> {
    const d1 = makeDoc(1, NOTICE_PDF);
    const d2 = makeDoc(2, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1, d2]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);
    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));
    return { repoRoot, contentHash: out.acquired.content_hash, d1, d2, bytes: NOTICE_PDF };
  }

  it('skips an unchanged manifest + logic_version with zero fetch calls', async () => {
    const { repoRoot, contentHash, d1, d2 } = await firstRun();
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot, prior: { content_hash: contentHash },
    }));

    expect(out.tier2.skip).toBe(true);
    expect(out.tier2.reason).toBe('unchanged_content_hash');
    expect(fetch.calls).toHaveLength(0);
    expect(out.docResults).toHaveLength(0);
  });

  it('forced: true fetches and reports force_run', async () => {
    const { repoRoot, contentHash, d1, d2 } = await firstRun();
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot, prior: { content_hash: contentHash }, forced: true,
    }));

    expect(out.tier2.skip).toBe(false);
    expect(out.tier2.reason).toBe('force_run');
    expect(fetch.calls).toHaveLength(2);
  });

  it('a hand-bumped logic_version is NOT skipped', async () => {
    const { repoRoot, contentHash, d1, d2 } = await firstRun();
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot, prior: { content_hash: contentHash },
      descriptor: makeDescriptor({ staleness: { trigger: [{ signal: 'content_hash', position: 'post_acquisition', external: 'x' }], logic_version: 'v2' } }),
    }));

    expect(out.tier2.skip).toBe(false);
    expect(fetch.calls).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 4 — a pinned sha that does not match
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-4 sha mismatch', () => {
  it('marks sha_mismatch and never shapes the document', async () => {
    const other = pdfTool.buildLinesPdf(['A DIFFERENT SYNTHETIC BODY', 'NOTICE OF DECISION']);
    const d1 = makeDoc(1, other, { sha256: sha256(NOTICE_PDF) }); // pinned to a DIFFERENT body
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, other);
    const shapeDocument = vi.fn(coa.shapeDocument);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot, shapeDocument }));

    expect(out.docResults).toHaveLength(1);
    expect(firstResult(out).doc_status).toBe('sha_mismatch');
    expect(firstResult(out).result).toBeNull();
    expect(shapeDocument).not.toHaveBeenCalled();
    expect(out.acquired.document_set.docs_by_status.sha_mismatch).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 5 — the allowlist on the request AND every redirect hop
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-5 cross-host redirect + non-https', () => {
  it('refuses a 302 to a foreign host without ever requesting it', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, null, 302, { location: 'https://evil.example/x.pdf' });
    fetch.handler('https://evil.example/x.pdf', NOTICE_PDF);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));

    expect(firstResult(out).doc_status).toBe('http_error');
    expect(fetch.urls).not.toContain('https://evil.example/x.pdf');
  });

  it('refuses a declared http:// (non-https) url without a request', async () => {
    const d1 = makeDoc(1, NOTICE_PDF, { url: `http://${HOST}/doc-1.pdf` });
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));

    expect(firstResult(out).doc_status).toBe('http_error');
    expect(fetch.calls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 6 — an HTML soft-404 is an http_error, not a PDF
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-6 HTML body', () => {
  it('refuses a <!doctype html> body projected as 200', async () => {
    const html = Buffer.from('<!doctype html><html><body>Not a PDF</body></html>', 'utf8');
    const d1 = makeDoc(1, html); // sha matches, so the magic bytes are what refuse it
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, html);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));

    expect(firstResult(out).doc_status).toBe('http_error');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 7 — the byte cap
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-7 over-cap', () => {
  it('refuses on declared content-length above the knob WITHOUT reading the body', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF, 200, { 'content-length': String(CONFIG.PDF_MAX_BYTES + 1) });

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));

    expect(firstResult(out).doc_status).toBe('too_large');
    expect(out.acquired.document_set.bytes_fetched).toBe(0);
  });

  it('refuses a body larger than the cap that declares no content-length', async () => {
    const big = Buffer.alloc(300, 0x41); // larger than the tiny cap below
    const d1 = makeDoc(1, big);
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, big);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot, config: { ...CONFIG, PDF_MAX_BYTES: 100 },
    }));

    expect(firstResult(out).doc_status).toBe('too_large');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 8 — a page-less (scanned-image stand-in) PDF
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-8 no text layer', () => {
  it('reports no_text_layer for a PDF whose content stream carries no text', async () => {
    const noText = pdfTool.buildPdf([[]], { noText: true });
    const d1 = makeDoc(1, noText);
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, noText);
    const shapeDocument = vi.fn(coa.shapeDocument);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot, shapeDocument }));

    expect(firstResult(out).doc_status).toBe('no_text_layer');
    expect(firstResult(out).result).toBeNull();
    expect(shapeDocument).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 9 — the timeout posture
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-9 timeout', () => {
  it('maps a TimeoutError to the timeout doc_status', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1]);
    const ctxFetch = vi.fn(async () => {
      const err = new Error('timed out');
      err.name = 'TimeoutError';
      throw err;
    });

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch, repoRoot }));

    expect(firstResult(out).doc_status).toBe('timeout');
    expect(out.acquired.document_set.docs_by_status.timeout).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 10 — an excluded[] entry counts and is never fetched
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-10 excluded entries', () => {
  it('counts an excluded entry in docs_total/docs_excluded and never requests it', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const excludedUrl = `https://${HOST}/gone.pdf`;
    const { repoRoot } = writeManifest([d1], { excluded: [{ url: excludedUrl, reason: 'http_404_at_pin' }] });
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(excludedUrl, NOTICE_PDF);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));

    expect(out.acquired.document_set.docs_excluded).toBe(1);
    expect(out.acquired.document_set.docs_total).toBe(2);
    expect(out.acquired.document_set.docs_by_status.excluded).toBe(1);
    expect(fetch.urls).not.toContain(excludedUrl);
    expect(out.acquired.document_set.docs_by_status.parsed).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 11 — the arm writes nothing
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-11 no disk writes', () => {
  it('never calls writeFileSync / mkdtempSync / createWriteStream', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1]); // the TEST writes the manifest; spying starts after
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);

    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const mkdtempSpy = vi.spyOn(fs, 'mkdtempSync');
    const createWriteStreamSpy = vi.spyOn(fs, 'createWriteStream');
    try {
      await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot }));
    } finally {
      writeSpy.mockRestore();
      mkdtempSpy.mockRestore();
      createWriteStreamSpy.mockRestore();
    }

    expect(writeSpy).not.toHaveBeenCalled();
    expect(mkdtempSpy).not.toHaveBeenCalled();
    expect(createWriteStreamSpy).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 12 — the extractor's page TEXTS reach shapeDocument, and the arm's result carries no text
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-12 in-memory pages, text-free result', () => {
  it('hands shapeDocument string text_pages and returns no notice text', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    const shapeDocument = vi.fn(coa.shapeDocument);

    const out = await acquire.acquirePdfDocumentSet(baseArgs({ ctxFetch: fetch.ctxFetch, repoRoot, shapeDocument }));

    expect(shapeDocument).toHaveBeenCalledTimes(1);
    const call0 = shapeDocument.mock.calls[0];
    expect(call0).toBeDefined();
    const seen = (call0 as unknown[])[0] as { text_pages: string[] };
    expect(Array.isArray(seen.text_pages)).toBe(true);
    expect(seen.text_pages.length).toBeGreaterThanOrEqual(1);
    for (const p of seen.text_pages) expect(typeof p).toBe('string');
    expect(JSON.stringify(out.docResults)).not.toContain('NOTICE OF DECISION');
    expect(JSON.stringify(out)).not.toContain('NOTICE OF DECISION');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 13 — the manifest refusals
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-13 manifest refusals', () => {
  it('refuses an absolute manifest path', async () => {
    const fetch = makeRecorder();
    await expect(acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot: '/tmp', external: makeExternal({ manifest: '/etc/manifest.json' }),
    }))).rejects.toThrow(/manifest.*repo-relative/);
  });

  it('refuses a manifest path containing ..', async () => {
    const fetch = makeRecorder();
    await expect(acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot: '/tmp', external: makeExternal({ manifest: '../seeds/manifest.json' }),
    }))).rejects.toThrow(/manifest.*repo-relative/);
  });

  it('refuses a manifest that does not exist', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfset-'));
    const fetch = makeRecorder();
    await expect(acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot, external: makeExternal({ manifest: 'scripts/seeds/x/manifest.json' }),
    }))).rejects.toThrow(/does not exist/);
  });

  it('refuses a document whose sha256 is not 64 hex', async () => {
    const d1 = makeDoc(1, NOTICE_PDF, { sha256: 'a'.repeat(63) });
    const { repoRoot } = writeManifest([d1]);
    const fetch = makeRecorder();
    await expect(acquire.acquirePdfDocumentSet(baseArgs({
      ctxFetch: fetch.ctxFetch, repoRoot,
    }))).rejects.toThrow(/manifest.*64-hex sha256/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 14 — acquireExternal's dispatch to the arm
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-14 acquireExternal dispatch', () => {
  it('dispatches pdf_document_set and issues no HEAD', async () => {
    const d1 = makeDoc(1, NOTICE_PDF);
    const d2 = makeDoc(2, NOTICE_PDF);
    const { repoRoot } = writeManifest([d1, d2]);
    const fetch = makeRecorder();
    fetch.handler(d1.url, NOTICE_PDF);
    fetch.handler(d2.url, NOTICE_PDF);

    const out = await acquire.acquireExternal({
      ctxFetch: fetch.ctxFetch,
      log: NULL_LOG,
      tag: 'acquire',
      slug: 'load-coa-notices',
      external: makeExternal(),
      descriptor: makeDescriptor(),
      config: CONFIG,
      runner: { step_acquire_pdf_pace_ms: 2000, step_acquire_max_redirects: 5 }, // Spec 124 R-EB (a)
      prior: null,
      forced: false,
      timeoutMs: 5000,
      preAcquisitionGate: () => ({ skip: false, reason: 'no_pre_acquisition_trigger' }),
      repoRoot,
      shapeDocument: coa.shapeDocument,
      sleep: async () => {},
    });

    expect(out.docResults).toHaveLength(2);
    expect(fetch.calls).toHaveLength(2);
    for (const c of fetch.calls) {
      const init = c.init as { method?: string };
      expect(init.method === 'HEAD').toBe(false);
    }
    expect(out.acquired.document_set.docs_by_status.parsed).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 15 — the unrecognised-format throw names pdf_document_set
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T-ACQ-15 unknown format', () => {
  it('names "pdf_document_set" among the declared formats', async () => {
    const fetch = makeRecorder();
    // a well-formed HEAD 200 so the format check (not the HEAD) is what throws
    fetch.handler(`https://${HOST}/x.pdf`, null, 200, { 'last-modified': 'Wed, 19 Jul 2017 00:00:00 GMT' });
    // the GET streams real bytes, so the download succeeds and only the format dispatch refuses
    fetch.streamHandler(`https://${HOST}/x.pdf`, NOTICE_PDF);
    await expect(acquire.acquireExternal({
      ctxFetch: fetch.ctxFetch,
      log: NULL_LOG,
      tag: 'acquire',
      slug: 'load-coa-notices',
      external: makeExternal({ format: 'pdf', url: `https://${HOST}/x.pdf` }),
      descriptor: makeDescriptor(),
      config: CONFIG,
      runner: { step_acquire_pdf_pace_ms: 2000, step_acquire_max_redirects: 5 }, // Spec 124 R-EB (a)
      prior: null,
      forced: false,
      timeoutMs: 5000,
      preAcquisitionGate: () => ({ skip: false, reason: 'no_pre_acquisition_trigger' }),
    })).rejects.toThrow(/"pdf_document_set"/);
  });
});
