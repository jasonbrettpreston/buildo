// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D11
//
// The acquisition seam's text extractor (scripts/lib/pdf-text.js) is the ONE door a PDF's text
// layer enters through. The module is generic (it knows nothing about notices), so this file is
// its contract, not a notice test: magic sniffing, geometric LINE RECONSTRUCTION (the reason the
// module exists — pdf.js yields content-stream order, not reading order), the two size caps, the
// no-text-layer posture, error folding (never relaying err.message), the bad-args guard, and
// PURITY (the module must not touch fs / child_process / env / os.tmpdir / console / writeFile).
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

const REPO_ROOT = path.resolve(__dirname, '../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS seam
const { hasPdfMagic, extractPdfText } = require(path.join(REPO_ROOT, 'scripts/lib/pdf-text.js')) as {
  hasPdfMagic: (bytes: Buffer | Uint8Array) => boolean;
  extractPdfText: (
    bytes: Buffer | Uint8Array | string,
    options?: { maxPages?: number; maxTextChars?: number; lineYTolerance?: number },
  ) => Promise<{
    status: string;
    code: string | null;
    page_count: number | null;
    text_chars: number;
    pages: string[] | null;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the shared in-memory PDF builder
const { buildPdf } = require(path.join(REPO_ROOT, 'src/tests/fixtures/coa-notices/build-pdf.cjs')) as {
  buildPdf: (pages: Array<Array<{ x: number; y: number; text: string }>>, opts?: { noText?: boolean }) => Buffer;
};

const OPTS = { maxPages: 50, maxTextChars: 100000, lineYTolerance: 2 };

describe('pdf-text logic', () => {
  it('T-PDF-1 hasPdfMagic sniffs the %PDF- header', () => {
    expect(hasPdfMagic(Buffer.from('%PDF-1.4'))).toBe(true);
    expect(hasPdfMagic(Buffer.from('<!doctype html>'))).toBe(false);
    expect(hasPdfMagic(Buffer.from('%PD'))).toBe(false);
  });

  it('T-PDF-2 reconstructs reading-order lines per page', async () => {
    const bytes = buildPdf([
      [
        { x: 72, y: 700, text: 'File Number: A0001/17EYK' },
        { x: 300, y: 700.6, text: 'Zoning RD' },
        { x: 72, y: 680, text: 'second line' },
      ],
      [{ x: 72, y: 700, text: 'page two' }],
    ]);
    const result = await extractPdfText(bytes, { ...OPTS, lineYTolerance: 2 });
    expect(result.status).toBe('ok');
    expect(result.page_count).toBe(2);
    expect(result.pages).toEqual(['File Number: A0001/17EYK Zoning RD\nsecond line', 'page two']);
  });

  it('T-PDF-3 orders runs on the same line left-to-right', async () => {
    // RIGHT run appears FIRST in the content stream; geometry must win over stream order.
    const bytes = buildPdf([[{ x: 300, y: 700, text: 'RIGHT' }, { x: 72, y: 700, text: 'LEFT' }]]);
    const result = await extractPdfText(bytes, { ...OPTS, lineYTolerance: 2 });
    expect(result.status).toBe('ok');
    expect(result.pages).toEqual(['LEFT RIGHT']);
  });

  it('T-PDF-4 lineYTolerance decides whether a nearby run joins the line', async () => {
    const bytes = buildPdf([[{ x: 72, y: 700, text: 'a' }, { x: 72, y: 697, text: 'b' }]]);
    const strict = await extractPdfText(bytes, { ...OPTS, lineYTolerance: 2 });
    expect(strict.pages).toEqual(['a\nb']);
    const loose = await extractPdfText(bytes, { ...OPTS, lineYTolerance: 4 });
    expect(loose.pages).toEqual(['a b']);
  });

  it('T-PDF-5 refuses a document over maxPages without reading a page', async () => {
    const bytes = buildPdf([
      [{ x: 72, y: 700, text: 'p1' }],
      [{ x: 72, y: 700, text: 'p2' }],
      [{ x: 72, y: 700, text: 'p3' }],
    ]);
    const result = await extractPdfText(bytes, { ...OPTS, maxPages: 2 });
    expect(result.status).toBe('too_large');
    expect(result.code).toBe('max_pages');
    expect(result.page_count).toBe(3);
    expect(result.pages).toBe(null);
  });

  it('T-PDF-6 refuses a document over maxTextChars', async () => {
    const bytes = buildPdf([[{ x: 72, y: 700, text: 'this page has far more than ten characters' }]]);
    const result = await extractPdfText(bytes, { ...OPTS, maxTextChars: 10 });
    expect(result.status).toBe('too_large');
    expect(result.code).toBe('max_text_chars');
    expect(result.pages).toBe(null);
  });

  it('T-PDF-7 reports a page with no text layer', async () => {
    const bytes = buildPdf([[]], { noText: true });
    const result = await extractPdfText(bytes, OPTS);
    expect(result.status).toBe('no_text_layer');
    expect(result.pages).toBe(null);
  });

  it('T-PDF-8 folds a garbage document into extract_error without relaying its text', async () => {
    const bytes = Buffer.from('%PDF-1.4 not really a pdf');
    const result = await extractPdfText(bytes, OPTS);
    expect(result.status).toBe('extract_error');
    expect(['invalid_pdf', 'unknown']).toContain(result.code);
    expect(JSON.stringify(result)).not.toContain('not really');
  });

  it('T-PDF-9 rejects non-bytes and non-positive options with the exact message', async () => {
    await expect(extractPdfText('x', OPTS)).rejects.toThrow('PDF_TEXT_E_BAD_ARGS');
    await expect(extractPdfText(Buffer.from('%PDF-'), { ...OPTS, maxPages: 0 })).rejects.toThrow('PDF_TEXT_E_BAD_ARGS');
  });

  it('T-PDF-10 stays pure — no fs / child_process / env / tmpdir / console / writeFile', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/pdf-text.js'), 'utf8');
    for (const banned of [
      "require('fs')",
      'require("fs")',
      'node:fs',
      'child_process',
      'os.tmpdir',
      'process.env',
      'writeFile',
      'console.',
    ]) {
      expect(src).not.toContain(banned);
    }
  });
});
