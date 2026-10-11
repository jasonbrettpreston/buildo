/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D11 (line reconstruction test input)
 *
 * Builds a minimal, valid, text-layer PDF IN MEMORY from synthetic text runs placed at (x, y) — the
 * in-test PDF the line-reconstruction contract is proven on. No file is written; no real notice text
 * is ever used (fixtures are synthetic). `pages` = `[[{x, y, text}]]`, one inner array per page.
 * `opts.noText` builds pages with an empty content stream (a scanned-image stand-in: no text layer).
 */
'use strict';

function esc(s) {
  return String(s).split('\\').join('\\\\').split('(').join('\\(').split(')').join('\\)');
}

function buildPdf(pages, opts = {}) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const contentIds = [];
  for (const p of pages) {
    const ops = opts.noText ? '' : p.map((t) => `BT /F1 10 Tf ${t.x} ${t.y} Td (${esc(t.text)}) Tj ET`).join('\n');
    contentIds.push(add(`<< /Length ${Buffer.byteLength(ops, 'latin1')} >>\nstream\n${ops}\nendstream`));
  }
  const parent = objs.length + pages.length + 1;
  const pageIds = [];
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(add(`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${parent} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/**
 * Lay synthetic notice LINES out on pages top-down (one line per 14 pt, wrapping to a new page every
 * `perPage` lines) — the shape the compute's T-PARSE fixtures and the acquire arm's T-ACQ tests share.
 */
function buildLinesPdf(lines, { perPage = 48 } = {}) {
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) {
    pages.push(lines.slice(i, i + perPage).map((text, j) => ({ x: 72, y: 760 - j * 14, text })).filter((t) => t.text !== ''));
  }
  return buildPdf(pages.length ? pages : [[]]);
}

module.exports = { buildPdf, buildLinesPdf };
