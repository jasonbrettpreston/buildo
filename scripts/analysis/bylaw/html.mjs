// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-TEXT (slice from the HTML structure: clause
//            cells + anchors, depth from table nesting; Spec 69 M-57), §10 stage 2 (Slice), §6.4 rule 10;
//            docs/reports/mcbylaw-phase1-plan.md S4 (rework 2026-10-07, operator rulings R1/R2).
//
// The City page's own structure, read from the RAW page (the pinned .htm), mapped onto the pinned
// normalized text (the verbatim source). Two PURE pieces:
//   normalizeWithMap(html)  the normalizer v1 (snapshot.mjs normalize) re-run step for step, keeping for every
//                           output character the raw offset it came from. Its text must equal normalize(html)
//                           (checked by the caller; a mismatch is a structural problem, never a guess).
//   pageStructure(html)     a tag walk (no DOM library: the independent parse5 cross-check lives in the
//                           crosscheck test) returning headings, and every table row with its cells, table
//                           depth, alignment and anchors, in document order, from the first <H1> on (the
//                           TOC table before it is not content).

import { normalize } from './snapshot.mjs';

function mapReplace(s, map, re, fn) {
  let out = '';
  const m2 = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    out += s.slice(last, m.index);
    for (let i = last; i < m.index; i++) m2.push(map[i]);
    const rep = fn(m);
    out += rep;
    for (let i = 0; i < rep.length; i++) m2.push(map[m.index]);
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  for (let i = last; i < s.length; i++) m2.push(map[i]);
  return [out, m2];
}

/** One entity decoded exactly as normalizer v1 decodes it (its own code path, not a copy); memoized. */
const ENTITY_CACHE = new Map();
const decodeEntity = (ent) => {
  if (!ENTITY_CACHE.has(ent)) ENTITY_CACHE.set(ent, normalize(`x${ent}x`).slice(1, -1));
  return ENTITY_CACHE.get(ent);
};

/** normalize(html) with a raw-offset map: {text, map} where map[k] = raw index of text[k]. PURE. */
export function normalizeWithMap(html) {
  let s = String(html);
  let map = Array.from({ length: s.length }, (_, i) => i);
  [s, map] = mapReplace(s, map, /<script[\s\S]*?<\/script>/gi, () => ' ');
  [s, map] = mapReplace(s, map, /<style[\s\S]*?<\/style>/gi, () => ' ');
  [s, map] = mapReplace(s, map, /<\/?(a|span|b|i|em|strong|u|sup|sub|font)\b[^>]*>/gi, () => '');
  [s, map] = mapReplace(s, map, /<[^>]+>/g, () => ' ');
  [s, map] = mapReplace(s, map, /&#x([0-9a-f]+);/gi, (m) => String.fromCodePoint(parseInt(m[1], 16)));
  [s, map] = mapReplace(s, map, /&#(\d+);/g, (m) => String.fromCodePoint(Number(m[1])));
  [s, map] = mapReplace(s, map, /&([a-z0-9]+);/gi, (m) => decodeEntity(m[0]));
  [s, map] = mapReplace(s, map, /[‘’]/g, () => "'");
  [s, map] = mapReplace(s, map, /[“”]/g, () => '"');
  [s, map] = mapReplace(s, map, /[–—]/g, () => '-');
  [s, map] = mapReplace(s, map, / /g, () => ' ');
  [s, map] = mapReplace(s, map, /\s+/g, () => ' ');
  const lead = s.length - s.trimStart().length;
  const text = s.trim();
  return { map: map.slice(lead, lead + text.length), text };
}

/** First normalized index whose raw offset is >= raw (text.length if none). PURE. */
export function rawToNorm(map, raw) {
  let lo = 0;
  let hi = map.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid] < raw) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const attrOf = (attrs, name) => {
  // The name must open an attribute (never `name=` inside another attribute's value, e.g. href="x?name=s").
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

/**
 * The content structure of a City page. Returns {contentStart, headings[], rows[], tables[]}, all offsets raw:
 *   headings  {start, end, level, anchor}                                (an <H1>..<H6> element)
 *   tables    {id, start, end, depth, parent}                           (depth 1 = outermost content table)
 *   rows      {start, end, table, depth, cells:[{start, end, contentStart, contentEnd, align, anchors[]}]}
 * Implied closes follow HTML: a <TD> closes an open cell, a <TR> closes an open row, </TABLE> closes the
 * table's open row and cell; a cell outside any row opens an implied row. PURE.
 */
export function pageStructure(html) {
  const h = String(html);
  const tagRe = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<(\/?)([A-Za-z][A-Za-z0-9]*)\b([^>]*)>/gi;
  // The content starts at the first real <H1> tag (never one inside a comment or a script).
  let contentStart = h.length;
  for (const t of h.matchAll(tagRe)) {
    if (t[3] && !t[2] && t[3].toLowerCase() === 'h1') {
      contentStart = t.index;
      break;
    }
  }
  const headings = [];
  const rows = [];
  const tables = [];
  const tstack = []; // {id, row, cell}
  tagRe.lastIndex = contentStart;
  let heading = null;
  const closeCell = (t, at) => {
    if (t.cell) {
      t.cell.contentEnd = at;
      t.cell.end = at;
      t.cell = null;
    }
  };
  const closeRow = (t, at) => {
    closeCell(t, at);
    if (t.row) {
      t.row.end = at;
      t.row = null;
    }
  };
  let m;
  while ((m = tagRe.exec(h))) {
    if (!m[3]) continue; // comment / script / style
    const close = m[2] === '/';
    const tag = m[3].toLowerCase();
    const at = m.index;
    const end = at + m[0].length;
    const top = tstack[tstack.length - 1];
    if (/^h[1-6]$/.test(tag)) {
      if (!close) heading = { anchor: null, end: null, level: Number(tag[1]), start: at };
      else if (heading) {
        heading.end = end;
        headings.push(heading);
        heading = null;
      }
      continue;
    }
    if (tag === 'a' && !close) {
      const name = attrOf(m[4], 'name');
      if (name !== null) {
        if (heading && heading.anchor === null) heading.anchor = name;
        else if (top && top.cell) top.cell.anchors.push(name);
      }
      continue;
    }
    if (tag === 'table') {
      if (!close) {
        const t = { depth: tstack.length + 1, end: null, id: tables.length, parent: top ? top.id : null, start: at };
        tables.push(t);
        tstack.push({ cell: null, id: t.id, row: null });
      } else if (tstack.length) {
        const t = tstack.pop();
        closeRow(t, at);
        tables[t.id].end = end;
      }
      continue;
    }
    if (!top) continue;
    if (tag === 'tr') {
      if (!close) {
        closeRow(top, at);
        top.row = { cells: [], depth: tstack.length, end: null, start: at, table: top.id };
        rows.push(top.row);
      } else closeRow(top, at);
      continue;
    }
    if (tag === 'td' || tag === 'th') {
      if (!close) {
        closeCell(top, at);
        if (!top.row) {
          top.row = { cells: [], depth: tstack.length, end: null, implied: true, start: at, table: top.id };
          rows.push(top.row);
        }
        top.cell = { align: (attrOf(m[4], 'align') || '').toLowerCase(), anchors: [], colspan: Math.max(1, Number(attrOf(m[4], 'colspan')) || 1), rowspan: Math.max(1, Number(attrOf(m[4], 'rowspan')) || 1), contentEnd: null, contentStart: end, end: null, start: at };
        top.row.cells.push(top.cell);
      } else closeCell(top, at);
    }
  }
  for (const t of tstack) closeRow(t, h.length);
  return { contentStart, headings, rows, tables };
}
