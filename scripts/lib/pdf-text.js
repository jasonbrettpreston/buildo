/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D11 (acquisition seam text extraction)
 *
 * GENERIC, domain-free PDF text extraction. This module knows nothing about notices (or any
 * other document domain): it takes bytes, returns text. It is the ONE seam through which a
 * PDF's text layer enters the pipeline, so the seam's contract is declared here and nowhere
 * else:
 *
 *   - It NEVER writes a file, NEVER logs, NEVER reads the process environment, NEVER fetches.
 *     Its only input is the argument object; its only side effect is the pdf.js worker's own
 *     teardown.
 *   - The ONLY throw is the bad-args guard (`PDF_TEXT_E_BAD_ARGS`); every pdf.js failure is
 *     folded into a result object so a caller can decide a posture without try/catch.
 *   - No `err.message` (and therefore no document text) ever leaves this module: extraction
 *     errors are classified into a fixed vocabulary (`password` / `invalid_pdf` / `unknown`),
 *     never relayed.
 *
 * LINE RECONSTRUCTION (the reason this module exists): pdf.js `getTextContent()` yields text
 * runs in CONTENT-STREAM order, which is neither reading order nor spatially sorted. Notice
 * pages interleave runs arbitrarily, so a naive join produces word salad. We reconstruct lines
 * geometrically: sort runs by y (descending — PDF y grows upward, so top of page first) then x
 * (ascending), then walk them, starting a new line whenever the run's y leaves a tolerance band
 * around the line's first item. Within a line we re-sort by x and join with a single space. This
 * is the declared contract every acquisition-arm test proves.
 */
'use strict';

/** @type {Promise<unknown> | null} cached dynamic import of pdf.js — loaded at most once. */
let pdfjsPromise = null;

/**
 * Load the ESM-only pdf.js. From CommonJS the only working door is a dynamic `import()` of an
 * absolute file URL (measured on Node 24 in this repo). The promise is cached so repeated
 * `extractPdfText` calls do not re-pay module evaluation.
 *
 * @returns {Promise<{ getDocument: (params: object) => { promise: Promise<unknown>, destroy: () => Promise<void> } }>}
 */
function loadPdfjs() {
  if (pdfjsPromise === null) {
    // Legacy build: the modern build assumes browser globals this repo's Node runtime lacks.
    const { pathToFileURL } = require('url');
    const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsPromise = import(pathToFileURL(entry).href).then((pdfjs) => {
      // Node has no `Worker`, so pdf.js falls back to its "fake worker" — which still has to
      // RESOLVE the worker module. Point it at the sibling file by absolute URL (the same
      // directory as pdf.mjs) so no relative path, no HTTP fetch and no bundler guessing is
      // involved. `getDocument`'s `useWorkerFetch:false` keeps it off the network regardless.
      try {
        const workerEntry = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerEntry).href;
        }
      } catch {
        // If the worker asset is missing the extraction attempt below folds into extract_error.
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * True iff `bytes` starts with the ASCII `%PDF-` magic.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {boolean}
 */
function hasPdfMagic(bytes) {
  if (bytes === null || bytes === undefined) return false;
  if (!(bytes instanceof Buffer || bytes instanceof Uint8Array)) return false;
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //   -
  );
}

/**
 * Collapse every whitespace run to one space and trim.
 *
 * @param {unknown} s
 * @returns {string}
 */
function collapseWhitespace(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/**
 * Reconstruct reading-order lines for ONE page from its text runs.
 *
 * @param {Array<{ str?: string, transform?: number[] }>} items
 * @param {number} lineYTolerance
 * @returns {string} the page's lines joined with `\n` (no trailing newline; empty lines dropped)
 */
function reconstructPageLines(items, lineYTolerance) {
  const runs = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || it.str === '') continue;
    const tr = it.transform;
    const x = Array.isArray(tr) ? tr[4] : 0;
    const y = Array.isArray(tr) ? tr[5] : 0;
    runs.push({ str: it.str, x: typeof x === 'number' ? x : 0, y: typeof y === 'number' ? y : 0 });
  }

  // Top of the page first (PDF y grows upward), then left-to-right as the tie-break.
  runs.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let current = null; // { y: firstItemY, items: [] }
  for (const run of runs) {
    if (current === null || Math.abs(run.y - current.y) > lineYTolerance) {
      if (current !== null) lines.push(current.items);
      current = { y: run.y, items: [run] };
    } else {
      current.items.push(run);
    }
  }
  if (current !== null) lines.push(current.items);

  const out = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    const text = collapseWhitespace(line.map((r) => r.str).join(' '));
    if (text !== '') out.push(text);
  }
  return out.join('\n');
}

/**
 * Count non-whitespace characters.
 *
 * @param {string} s
 * @returns {number}
 */
function nonWhitespaceChars(s) {
  const m = s.replace(/\s+/g, '');
  return m.length;
}

/**
 * Extract a PDF's text layer, reconstructing reading-order lines per page.
 *
 * @param {Buffer|Uint8Array} bytes the whole PDF, in memory
 * @param {{ maxPages?: number, maxTextChars?: number, lineYTolerance?: number }} [options]
 * @returns {Promise<{
 *   status: 'ok'|'too_large'|'no_text_layer'|'extract_error',
 *   code: string|null,
 *   page_count: number|null,
 *   text_chars: number,
 *   pages: string[]|null
 * }>}
 */
async function extractPdfText(bytes, options = {}) {
  const isBytes = bytes instanceof Buffer || bytes instanceof Uint8Array;
  const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const { maxPages, maxTextChars, lineYTolerance } = options ?? {};
  if (!isBytes || !positive(maxPages) || !positive(maxTextChars) || !positive(lineYTolerance)) {
    throw new Error('PDF_TEXT_E_BAD_ARGS');
  }

  /** @type {any} */
  let loadingTask = null;
  try {
    const pdfjs = await loadPdfjs();
    // pdf.js REQUIRES a plain `Uint8Array` and rejects a `Buffer` outright ("Please provide binary
    // data as `Uint8Array`, rather than `Buffer`." — measured), even though Buffer IS a Uint8Array
    // subclass. Build a no-copy view over the SAME memory: `new Uint8Array(buffer, offset, length)`
    // for a Buffer (whose bytes may be a slice of a shared pool), or the bytes themselves when they
    // are already a plain Uint8Array.
    const data =
      bytes instanceof Buffer
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : new Uint8Array(bytes);
    loadingTask = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
      disableStream: true,
      useWorkerFetch: false,
      verbosity: 0,
    });
    const doc = await loadingTask.promise;
    const numPages = doc.numPages;

    if (numPages > maxPages) {
      return { status: 'too_large', code: 'max_pages', page_count: numPages, text_chars: 0, pages: null };
    }

    const pages = [];
    let total = 0;
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = reconstructPageLines(content.items || [], lineYTolerance);
      pages.push(pageText);
      total += pageText.length;
      if (total > maxTextChars) {
        return { status: 'too_large', code: 'max_text_chars', page_count: numPages, text_chars: total, pages: null };
      }
    }

    if (nonWhitespaceChars(pages.join('')) === 0) {
      return { status: 'no_text_layer', code: null, page_count: numPages, text_chars: 0, pages: null };
    }
    return { status: 'ok', code: null, page_count: numPages, text_chars: total, pages };
  } catch (err) {
    let code = 'unknown';
    if (err && err.name === 'PasswordException') code = 'password';
    else if (err && err.name === 'InvalidPDFException') code = 'invalid_pdf';
    // Deliberately NEVER include err.message / any document text in the result.
    return { status: 'extract_error', code, page_count: null, text_chars: 0, pages: null };
  } finally {
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      try {
        await loadingTask.destroy();
      } catch {
        // Swallow ONLY here: the work is already done and a throwing worker teardown must not
        // mask a successful extraction (the doc proxy has no destroy of its own — the LOADING
        // TASK owns teardown, measured). Any other error path has already returned.
      }
    }
  }
}

module.exports = { hasPdfMagic, extractPdfText };
