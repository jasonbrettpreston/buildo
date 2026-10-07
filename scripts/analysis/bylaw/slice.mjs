// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (regulation_id, clauses[], unit id
//            `regulation_id#clause_path`, verified_against_sha256 = sha of the unit's normalized text),
//            §6.4 rules 1, 6, §9 G-TEXT (structure from the HTML; every-level numbering; variants never merged),
//            §10 stage 2 (Slice); docs/specs/01-pipeline/69_mcbylaw_policy.md M-2, M-36, M-47, M-57;
//            docs/reports/mcbylaw-phase1-plan.md S4 (rework 2026-10-07: operator rulings R1–R4).
//
// Stage 2 of the McBylaw generator, sliced from the City page's own STRUCTURE (operator ruling R1, Spec 69
// M-57): the clause cells (`<TD ALIGN=RIGHT …>(x)</TD>`, with their `<A Name>` anchors), their depth from
// table nesting, and the headings. Text patterns are used only for an inline list inside ONE cell (R1) and
// for enacting-text regulations, which have no HTML. Data tables are units of their own, keyed (table, row,
// column), with their row and column headers (R2). Every character of the pinned normalized page is owned by
// exactly one clause node or one declared non-regulation span; offsets map back through normalizeWithMap,
// whose text must equal the pinned normalized page. A numbering gap at any level fails unless the page
// proves the number absent (R3); a repeated division is a status-tagged variant, never merged (R4).
//
// Ids (Spec 68 §6):
//   regulation_id   `<article>(<n>)`; a definition `800.50(<n>)`; the article's own text outside any numbered
//                   regulation `<article>#article`; a variant `<id>~<status>` (e.g. `200.15.1(1)~under_appeal`).
//   clause_path     the full path: `(3)(A)(i)`; a table cell adds `[T<k>.R<i>.C<j>]` (k = table under its
//                   owner, i/j from 1); an inline list inside a cell continues the path (`[T1.R2.C2](A)(i)`).
//   unit_id         `regulation_id#clause_path` of every LEAF node with text.
// Unit text (the sha input) = the ancestors' own text (+ a cell's row and column headers) + the leaf's own text,
// joined by one space, so a lead-in or header edit marks its leaves stale.
// Every function is PURE except loadSnapshotPages() (reads the committed seeds; no clock, no network).

import fs from 'node:fs';
import path from 'node:path';
import { normalizeWithMap, pageStructure, rawToNorm } from './html.mjs';
import { decodePage, parseToc, sha256 } from './snapshot.mjs';
import { LEVELS, REF_AFTER, REF_BEFORE, ROMAN, cmpStr, defectChars, extractLiterals, extractRefs, extractTags, parseClauses, scanNumbers } from './text.mjs';

export { breakBefore, defectChars, exclusionSpans, extractLiterals, extractRefs, extractTags, parseClauses, scanNumbers, UNIT_TABLE } from './text.mjs';

export const SLICER_VERSION = 'slice-v2';

/** Sections whose numbered divisions are defined terms (term = the title cell). Declared until S5 moves page kinds. */
export const DEFINITION_SECTIONS = Object.freeze(['800.50']);

/**
 * Captured enacting by-laws (Spec 69 M-36) whose amendments are sliced into rows now (operator ruling R5,
 * 2026-10-07). 206-2026 and 650-2026 are captured and pinned, but their map and Ch.900 exception rows are
 * Phase 2; 654-2025 is consolidated (600.60) and kept as enacting_source only.
 */
export const SLICED_ENACTING = Object.freeze(['1075-2026']);

/** Variant status read from the variant's own text (R4). Closed set; null = unstatused. */
export const VARIANT_STATUSES = Object.freeze([
  ['under_appeal', /\bUnder Appeal\b/i],
  ['tribunal_order', /\((?:OLT|LPAT|OMB)\)/],
]);

const MARKER_CELL_RE = /<TD\b[^>]*\bALIGN\s*=\s*"?RIGHT"?[^>]*>\s*(?:<A\b[^>]*>)?\s*\(([^)\s<]{1,6})\)\s*(?:<\/A>)?\s*<\/TD>/gi;
const isWs = (s) => /^\s*$/.test(s);
const symClass = (s) => (/^\d+$/.test(s) ? 'N' : /^[A-Z]$/.test(s) ? 'U' : ROMAN.includes(s) ? 'r' : /^[a-z]$/.test(s) ? 'l' : 'X');
const SEQ = { U: LEVELS[0], r: LEVELS[1], l: LEVELS[2] };

/** The successor symbol list between two siblings (exclusive), or null when the level is unknown. */
function missingBetween(a, b) {
  const ca = symClass(a ?? b); // a = null: the first division of a list (must be (A) / (i) / (a))
  if (ca === 'N') {
    const out = [];
    for (let k = Number(a) + 1; k < Number(b) && out.length < 60; k++) out.push(String(k));
    return out;
  }
  const seq = SEQ[ca];
  if (!seq) return [];
  const i = a === null ? -1 : seq.indexOf(a);
  const j = seq.indexOf(b);
  return j > i + 1 ? seq.slice(i + 1, j) : [];
}

/** Does the raw page text between two offsets hold `(sym)` as a division (not glued to an id)? */
const rawHolds = (html, from, to, sym) => new RegExp(`(?<![\\w.)\\]])\\(${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)(?![\\w(])`).test(html.slice(from, to).replace(/<[^>]+>/g, ' '));

/**
 * Slice one section page from its structure. Input {key, section, file, html, normalized, status?, ruling?,
 * carve_in?}. Returns {key, rows[], spans[], problems[], numbering:{gaps[], unproven[]}, cells:{html, sliced},
 * inline[]}. Offsets on rows/spans are offsets into `normalized`. PURE.
 */
export function slicePage(input) {
  const { key, section, html, normalized } = input;
  const problems = [];
  const numbering = { gaps: [], unproven: [] };
  const { text, map } = normalizeWithMap(html);
  if (text !== normalized) {
    problems.push(`normalizer_map_mismatch: ${key} normalizeWithMap(raw) differs from the pinned normalized page`);
    return { cells: { html: 0, sliced: 0 }, inline: [], key, numbering, problems, rows: [], spans: [] };
  }
  const st = pageStructure(html);
  const tocIds = new Set(parseToc(html).map((r) => r.id));
  const carve = input.carve_in?.length ? new Set(input.carve_in) : null;
  const n = text.length;

  // ---- owner events over raw offsets
  const events = []; // {raw, owner}
  const own = (raw, owner) => events.push({ owner, raw });
  const span = (kind) => ({ span: kind });
  own(0, span('header_toc'));
  const nodes = [];
  const roots = new Map(); // article -> root node
  const mkNode = (o) => {
    const node = { anchors: [], children: [], ...o, idx: nodes.length };
    nodes.push(node);
    if (node.parent) node.parent.children.push(node);
    return node;
  };
  const rootOf = (article, title) => {
    if (!roots.has(article)) roots.set(article, mkNode({ article, articleTitle: title, depth: 0, origin: 'root', parent: null, path: '', rawStart: null, symbol: null }));
    return roots.get(article);
  };
  const cellText = (c) => text.slice(rawToNorm(map, c.contentStart), rawToNorm(map, c.contentEnd ?? c.contentStart)).trim();
  const markerOf = (c) => (c && c.align === 'right' ? /^\(([^)\s]{1,6})\)$/.exec(cellText(c)) : null);
  // A table holding a clause cell is a clause table: its other rows continue a clause. Any other table is data.
  const clauseTable = new Set(st.rows.filter((r) => markerOf(r.cells[0])).map((r) => r.table));
  const items = [
    ...st.headings.map((h) => ({ at: h.start, h, kind: 'heading', order: 1 })),
    ...st.tables.map((t) => ({ at: t.start, kind: 'table_open', order: 0, t })),
    ...st.tables.map((t) => ({ at: t.end ?? html.length, kind: 'table_close', order: 2, t })),
    ...st.rows.map((r) => ({ at: r.start, kind: 'row', order: 1, r })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);

  let article = null;
  let articleTitle = null;
  let included = false;
  let owner = span('header_toc');
  let stack = []; // open clause nodes {node, depth}
  const ownerAtTable = new Map(); // table id -> owner at open
  const dataTables = new Map(); // table id -> {k, owner, header: [], rowIdx}
  const tableCount = new Map(); // owner node idx -> data tables under it
  const articleRaw = []; // {article, start, end} raw ranges of included articles
  const setOwner = (raw, o) => {
    owner = o;
    own(raw, o);
  };
  // The page footer ("&copy;City of Toronto") ends the content; its own layout row is never a data row.
  const footerRaw = html.lastIndexOf('&copy;');
  const footerRow = footerRaw < 0 ? null : st.rows.filter((r) => r.start < footerRaw).at(-1);
  const stopAt = footerRaw < 0 ? html.length : Math.min(footerRaw, footerRow ? footerRow.start : footerRaw);
  for (const it of items) {
    if (it.at >= stopAt) break;
    if (it.at < st.contentStart) continue;
    if (it.kind === 'heading') {
      const h = it.h;
      const htext = text.slice(rawToNorm(map, h.start), rawToNorm(map, h.end)).trim();
      const anchor = h.anchor && /^\d+(\.\d+)+$/.test(h.anchor) ? h.anchor : null;
      const first = /^(\d+(?:\.\d+)+)\s/.exec(`${htext} `);
      const id = anchor || (first ? first[1] : null);
      if (articleRaw.length && articleRaw[articleRaw.length - 1].end === null) articleRaw[articleRaw.length - 1].end = h.start;
      setOwner(h.start, span('heading'));
      if (id && (id === section || id.startsWith(`${section}.`))) {
        article = id;
        articleTitle = htext.slice(id.length).trim();
        included = !carve || carve.has(id);
        stack = [];
        if (!tocIds.has(id)) problems.push(`__disclose heading_not_in_toc ${id}`);
        if (included) articleRaw.push({ article: id, end: null, start: h.start });
      }
      setOwner(h.end, article && included ? rootOf(article, articleTitle) : article ? span('outside_carve_in') : span('heading'));
      continue;
    }
    if (!article) continue;
    if (!included) {
      if (it.kind === 'heading') setOwner(it.at, span('outside_carve_in'));
      continue;
    }
    if (it.kind === 'table_open') {
      ownerAtTable.set(it.t.id, owner);
      continue;
    }
    if (it.kind === 'table_close') {
      const o = ownerAtTable.get(it.t.id);
      if (o) setOwner(it.at, o);
      continue;
    }
    const r = it.r;
    const c0 = r.cells[0];
    if (!c0) continue;
    if (clauseTable.has(r.table)) {
      const mt = markerOf(c0);
      if (mt) {
        stack = stack.filter((s) => s.depth < r.depth);
        const parent = stack.length ? stack[stack.length - 1].node : rootOf(article, articleTitle);
        // "(I)" where the lower-case Roman (i) is due (230.5.1.10(4)(E), 2.1.1(4)(D)): read as (i), disclosed.
        const due = parent.origin === 'root' ? 'N' : { N: 'U', U: 'r', r: 'l' }[symClass(parent.symbol)];
        const typo = mt[1] === 'I' && due === 'r';
        const sym = typo ? 'i' : mt[1];
        const sibling = parent.children.find((x) => x.origin === 'cell' && x.symbol === sym && !x.variantOf);
        const node = mkNode({ anchors: c0.anchors, article, depth: r.depth, origin: 'cell', parent, rawStart: r.start, symbol: sym, title: r.cells[1] ? cellText(r.cells[1]) : '', typo, variantOf: sibling || null });
        stack.push({ depth: r.depth, node });
        setOwner(r.start, node);
      } else {
        stack = stack.filter((s) => s.depth <= r.depth);
        setOwner(r.start, stack.length ? stack[stack.length - 1].node : rootOf(article, articleTitle));
      }
      continue;
    }
    // A data row: every cell is a unit keyed (table, row, column) under the table's owner (R2).
    let dt = dataTables.get(r.table);
    if (!dt) {
      const tOwner = ownerAtTable.get(r.table);
      const parentNode = tOwner && tOwner.span === undefined ? tOwner : rootOf(article, articleTitle);
      const k = (tableCount.get(parentNode.idx) || 0) + 1;
      tableCount.set(parentNode.idx, k);
      dt = { cells: [], grid: [], k, owner: parentNode, rowIdx: 0 };
      dataTables.set(r.table, dt);
    }
    dt.rowIdx++;
    const texts = r.cells.map(cellText);
    // A row-spanning data cell would shift every column below it: refused, never guessed (0 on the pinned pages).
    if (r.cells.some((c) => c.rowspan > 1)) problems.push(`structural: ${key} ${article} data table row spans rows (rowspan unsupported)`);
    let col = 0;
    const gridRow = [];
    r.cells.forEach((c, j) => {
      const cell = mkNode({
        article,
        column_header: '',
        depth: r.depth,
        gridCol: col,
        gridSpan: c.colspan,
        origin: 'table_cell',
        parent: dt.owner,
        path: null,
        rawStart: c.start,
        row_header: texts[0] ?? '',
        symbol: null,
        tableKey: `[T${dt.k}.R${dt.rowIdx}.C${j + 1}]`,
      });
      gridRow.push({ col, span: c.colspan, text: texts[j] });
      col += c.colspan;
      dt.cells.push({ node: cell, row: dt.rowIdx });
      setOwner(c.start, cell);
    });
    dt.grid.push(gridRow);
    setOwner(r.end ?? r.start, dt.owner);
  }
  // Column headers (R2): the header row, plus a second one when the first spans columns (a grouped header).
  for (const dt of dataTables.values()) {
    // A grouped header: the first row spans columns, or leaves cells empty that the group to its left covers
    // (970.10.15.5: "" | "" | "Parking Occupancy Rate" | "" | "" over "Land Use" | "Parking Rate" | AM | PM | Eve).
    const grouped = dt.grid.length > 2 && dt.grid[0].some((g) => g.span > 1 || !g.text);
    const headerRows = grouped ? 2 : 1;
    if (grouped) {
      let carry = '';
      for (const g of dt.grid[0]) {
        if (g.text) carry = g.text;
        else g.text = carry;
      }
    }
    const headerAt = (c) => dt.grid.slice(0, headerRows).map((row) => row.find((g) => g.col <= c && c < g.col + g.span)).filter((g) => g && g.text).map((g) => g.text);
    for (const { node, row } of dt.cells) node.column_header = row <= headerRows ? '' : [...new Set(headerAt(node.gridCol))].join(' / ');
  }
  if (articleRaw.length && articleRaw[articleRaw.length - 1].end === null) articleRaw[articleRaw.length - 1].end = html.length;
  if (footerRaw < 0) problems.push(`footer_not_found: ${key}`);
  else own(stopAt, span('footer'));
  events.sort((a, b) => a.raw - b.raw); // stable: later events at the same offset win

  // ---- character ownership
  const ownerOf = new Array(n);
  let ei = 0;
  let cur = events[0].owner;
  for (let k = 0; k < n; k++) {
    while (ei < events.length && events[ei].raw <= map[k]) cur = events[ei++].owner;
    ownerOf[k] = cur;
  }

  // ---- paths (variants named after their text is known)
  const ownText = new Map(); // node idx -> [[s,e]] ranges
  for (let k = 0; k < n; k++) {
    const o = ownerOf[k];
    if (!o || o.span !== undefined) continue;
    const rs = ownText.get(o.idx) || [];
    const last = rs[rs.length - 1];
    if (last && last[1] === k) last[1] = k + 1;
    else rs.push([k, k + 1]);
    ownText.set(o.idx, rs);
  }
  const textOfNode = (node) => (ownText.get(node.idx) || []).map(([s, e]) => text.slice(s, e)).join(' ').replace(/\s+/g, ' ').trim();
  const subtreeText = (node) => [textOfNode(node), ...node.children.map(subtreeText)].join(' ');
  const pathOf = (node) => {
    if (node.path !== null && node.origin !== 'cell' && node.origin !== 'table_cell') return node.path;
    if (node.origin === 'root') return '';
    const base = pathOf(node.parent);
    if (node.origin === 'table_cell') return `${base}${node.tableKey}`;
    return `${base}(${node.symbol})${node.variantTag || ''}`;
  };
  const numbersOf = (s) => (s.replace(/\[[^\]]*\]/g, '').match(/\d+(?:\.\d+)?/g) || []).join(',');
  const defects = []; // {node, kind, context, code?}
  for (const node of nodes) if (node.typo) defects.push({ context: '(I) read as (i)', kind: 'marker_typo', node });
  for (const node of nodes) {
    if (!node.variantOf) continue;
    const t = subtreeText(node);
    const base = subtreeText(node.variantOf);
    let status = null;
    for (const [s, re] of VARIANT_STATUSES) if (re.test(t) && !re.test(base)) status = status || s;
    const same = node.parent.children.filter((x) => x.variantOf === node.variantOf && x.idx < node.idx && x.variantStatus === status).length;
    node.variantStatus = status;
    node.variantTag = `~${status || 'unstatused'}${same ? same + 1 : ''}`;
    if (!status) {
      if (numbersOf(t) !== numbersOf(base)) problems.push(`unstatused_variant: ${key} ${node.article} (${node.symbol}) repeats with different numbers and no status`);
      else defects.push({ context: t.slice(0, 80), kind: 'variant_duplicate', node });
    }
  }
  for (const node of nodes) node.path = pathOf(node);

  // ---- inline lists inside ONE cell (R1): leaf cells / table cells with one contiguous own range
  const inline = [];
  for (const node of [...nodes]) {
    if (node.children.length || (node.origin !== 'cell' && node.origin !== 'table_cell')) continue;
    const rs = ownText.get(node.idx) || [];
    if (rs.length !== 1) continue;
    const [s0, e0] = rs[0];
    const t = text.slice(s0, e0);
    const letters = node.origin === 'table_cell' ? 0 : (node.path.replace(/~[a-z_0-9]+/g, '').match(/\(([^)]+)\)/g) || []).length - (node.parent.origin === 'root' && symClass(node.symbol) === 'N' ? 1 : 0);
    if (letters >= LEVELS.length) continue;
    const lead = t.length - t.trimStart().length;
    const parsed = parseClauses(t.slice(lead), node.path, { atStart: node.origin === 'table_cell', cell: true, startLevel: Math.max(0, letters) });
    for (const ty of parsed.typos) defects.push({ context: t.slice(lead + ty.at, lead + ty.at + 40), kind: 'marker_typo', node });
    if (parsed.repeats.length) defects.push({ context: t.slice(lead + parsed.repeats[0].at, lead + parsed.repeats[0].at + 60), count: parsed.repeats.length, kind: 'division_repeat', node });
    if (parsed.nodes.length < 2) continue;
    const made = new Map([[parsed.nodes[0].path, node]]);
    for (const pn of parsed.nodes.slice(1)) {
      const parentPath = pn.path.slice(0, pn.path.lastIndexOf('('));
      const child = mkNode({ article: node.article, depth: node.depth, origin: 'inline', parent: made.get(parentPath) || node, path: pn.path, rawStart: map[s0 + lead + pn.start], symbol: /\(([^)]+)\)$/.exec(pn.path)[1] });
      made.set(pn.path, child);
      inline.push(child);
      for (let k = s0 + lead + pn.start; k < s0 + lead + pn.end; k++) ownerOf[k] = child;
      const rest = (ownText.get(node.idx) || []).flatMap(([a, b]) => (b <= s0 + lead + pn.start || a >= s0 + lead + pn.end ? [[a, b]] : [[a, Math.min(b, s0 + lead + pn.start)], [Math.max(a, s0 + lead + pn.end), b]].filter(([x, y]) => y > x)));
      ownText.set(node.idx, rest);
      ownText.set(child.idx, [[s0 + lead + pn.start, s0 + lead + pn.end]]);
    }
  }

  // ---- numbering at every level (R3): a gap fails unless the page proves the number absent
  for (const parent of nodes) {
    for (const origin of ['cell', 'inline']) {
      const kids = parent.children.filter((x) => x.origin === origin && !x.variantOf);
      if (!kids.length) continue;
      const rawStartOf = (x) => x.rawStart ?? null; // the window runs from the previous division (its text may hold a swallowed one) to the next
      for (let i = 0; i < kids.length; i++) {
        const prev = i ? kids[i - 1] : null;
        const missing = prev ? missingBetween(prev.symbol, kids[i].symbol) : symClass(kids[i].symbol) === 'N' ? (DEFINITION_SECTIONS.includes(section) ? [] : missingBetween('0', kids[i].symbol)) : missingBetween(null, kids[i].symbol);
        if (!missing.length) continue;
        const from = prev && rawStartOf(prev) !== null ? rawStartOf(prev) : parent.rawStart ?? st.contentStart;
        const to = rawStartOf(kids[i]) ?? html.length;
        for (const s of missing) {
          const gap = { article: parent.article, key, missing: s, parent: parent.path, after: prev ? prev.symbol : null, next: kids[i].symbol };
          if (rawHolds(html, from, to, s)) numbering.unproven.push(gap);
          else numbering.gaps.push(gap);
        }
      }
    }
  }

  // A leaf whose own text still holds the next division of its list, or the first division of the level below
  // ("... 0.02 for each dwelling unit (B) In Parking Zone B"), swallowed a division: unproven, never a pass (R3).
  for (const node of nodes) {
    if (node.children.length || node.origin === 'root') continue;
    const t = textOfNode(node);
    const own = node.origin === 'table_cell' ? -1 : (node.path.replace(/~[a-z_0-9]+/g, '').replace(/\[[^\]]*\]/g, '').match(/\([^)]+\)/g) || []).length - 1;
    const suspects = new Set();
    const below = LEVELS[Math.max(0, own)];
    if (below) suspects.add(below[0]);
    const cls = node.symbol ? symClass(node.symbol) : null;
    if (cls && SEQ[cls]) suspects.add(SEQ[cls][SEQ[cls].indexOf(node.symbol) + 1]);
    for (const m of t.matchAll(/(?<=\s)\(([A-Z]|[ivx]{1,5}|[a-z])\) /g)) {
      if (!suspects.has(m[1]) || m.index < 4) continue;
      if (REF_BEFORE.test(t.slice(0, m.index)) || REF_AFTER.test(t.slice(m.index + m[0].length))) continue;
      numbering.unproven.push({ after: node.symbol, article: node.article, context: t.slice(Math.max(0, m.index - 50), m.index + 40), key, missing: m[1], next: null, parent: node.path });
    }
  }

  // ---- rows: the subtree of every top-level numbered division, and each article's own text
  const topOf = (node) => {
    let x = node;
    while (x.parent && x.parent.origin !== 'root') x = x.parent;
    return x.origin === 'root' ? x : x.parent && x.parent.origin === 'root' && symClass(x.symbol) === 'N' ? x : x.parent;
  };
  const rowsBy = new Map(); // top node idx -> {top, ks: []}
  const spanRuns = [];
  for (let k = 0; k < n; k++) {
    const o = ownerOf[k];
    if (o.span !== undefined) {
      const last = spanRuns[spanRuns.length - 1];
      if (last && last.kind === o.span && last.end === k) last.end = k + 1;
      else spanRuns.push({ end: k + 1, kind: o.span, start: k });
      continue;
    }
    if (/\s/.test(text[k])) continue;
    const top = topOf(o);
    const g = rowsBy.get(top.idx) || { first: k, last: k, top };
    g.last = k;
    rowsBy.set(top.idx, g);
  }
  const rows = [];
  for (const g of [...rowsBy.values()].sort((a, b) => a.first - b.first)) {
    const from = g.first;
    const to = g.last + 1;
    for (let k = from; k < to; k++) {
      const o = ownerOf[k];
      if (o.span !== undefined ? !/\s/.test(text[k]) : topOf(o) !== g.top) {
        problems.push(`row_not_contiguous: ${key} ${g.top.article} char ${k}`);
        break;
      }
    }
    rows.push(makeRow({ defects, from, input, map, ownerOf, text, to, top: g.top }));
  }
  for (const p of problems.filter((x) => x.startsWith('__disclose heading_not_in_toc'))) {
    const id = p.split(' ').pop();
    const r = rows.find((x) => x.article === id);
    if (r) r.defects.push({ clause_path: r.clauses[0].path, code: null, context: id, index: 0, kind: 'heading_not_in_toc' });
  }
  // Cell-set lock (R1, both directions): the raw page's clause cells in included articles == the cell nodes.
  let htmlCells = 0;
  for (const a of articleRaw) htmlCells += [...html.slice(a.start, a.end).matchAll(MARKER_CELL_RE)].length;
  const slicedCells = nodes.filter((x) => x.origin === 'cell').length;
  if (htmlCells !== slicedCells) problems.push(`cell_set_mismatch: ${key} html clause cells ${htmlCells} != sliced ${slicedCells}`);
  for (const nd of nodes) {
    if (nd.origin !== 'cell' || !nd.anchors.length) continue;
    const want = `${nd.article}(${nd.symbol})`;
    if (nd.parent.origin === 'root' && !nd.anchors.includes(want)) {
      const r = rows.find((x) => x.regulation_id.startsWith(want));
      if (r) r.defects.push({ clause_path: nd.path, code: null, context: `anchor ${nd.anchors.join(',')} != ${want}`, index: 0, kind: 'anchor_mismatch' });
    }
  }
  return {
    cells: { html: htmlCells, sliced: slicedCells },
    inline: inline.map((x) => `${x.article}`),
    key,
    numbering,
    problems: problems.filter((x) => !x.startsWith('__disclose')),
    rows,
    spans: spanRuns.filter((s) => !isWs(text.slice(s.start, s.end))),
  };
}

function makeRow({ input, top, from, to, text, ownerOf, defects }) {
  const verbatim = text.slice(from, to);
  const isRoot = top.origin === 'root';
  const regulation_id = isRoot ? `${top.article}#article` : `${top.article}(${top.symbol})${top.variantTag || ''}`;
  // Clauses: maximal runs of one owner, grouped per node, in first-appearance order.
  const byNode = new Map();
  for (let k = from; k < to; k++) {
    const o = ownerOf[k];
    const nd = o.span !== undefined ? null : o;
    const keyIdx = nd ? nd.idx : -1;
    const g = byNode.get(keyIdx) || { node: nd, ranges: [] };
    const last = g.ranges[g.ranges.length - 1];
    if (last && last[1] === k - from) last[1] = k - from + 1;
    else g.ranges.push([k - from, k - from + 1]);
    byNode.set(keyIdx, g);
  }
  // Whitespace owned by a span inside a row (a tag between cells) joins the run before it.
  const clauses = [];
  for (const g of byNode.values()) {
    if (!g.node) {
      for (const [s, e] of g.ranges) {
        const prev = clauses.find((c) => c.ranges.some((r) => r[1] === s));
        if (prev) prev.ranges.find((r) => r[1] === s)[1] = e;
        else if (clauses.length) clauses[0].ranges.push([s, e]);
      }
      continue;
    }
    clauses.push({
      node: g.node,
      origin: g.node.origin,
      path: g.node.path,
      ranges: g.ranges,
    });
  }
  for (const c of clauses) {
    c.ranges.sort((a, b) => a[0] - b[0]);
    c.text = c.ranges.map(([s, e]) => verbatim.slice(s, e)).join('');
    // A table cell, and an inline list inside one, carries the cell's row and column headers (R2).
    let cellNode = c.node;
    while (cellNode && cellNode.origin === 'inline') cellNode = cellNode.parent;
    if (cellNode && cellNode.origin === 'table_cell') {
      c.row_header = cellNode.row_header;
      c.column_header = cellNode.column_header;
    }
    if (c.node.title !== undefined && c.node.origin === 'cell') c.title = c.node.title;
    c.ancestors = [];
    for (let x = c.node.parent; x && x.origin !== 'root'; x = x.parent) c.ancestors.unshift(x.path);
  }
  const pathAt = (pos) => {
    const o = ownerOf[from + pos];
    return o && o.span === undefined ? o.path : clauses.length ? clauses[0].path : '';
  };
  const tags = extractTags(verbatim);
  const refs = extractRefs(verbatim, tags);
  const literals = extractLiterals(verbatim);
  const scan = scanNumbers(verbatim, literals);
  const rowDefects = defectChars(verbatim).map((d) => ({ clause_path: pathAt(d.index), code: d.code, context: verbatim.slice(Math.max(0, d.index - 40), d.index + 10), index: d.index, kind: 'garbled_character' }));
  for (const c of clauses) {
    if (c.node.children.length) continue;
    const own = c.text.replace(/\[[^\]]*\]/g, '').trim();
    if (own.endsWith(':')) rowDefects.push({ clause_path: c.path, code: null, context: own.slice(-60), index: c.ranges[c.ranges.length - 1][1], kind: 'lead_in_without_items' });
  }
  const inRow = new Set(clauses.map((c) => c.node.idx));
  for (const d of defects) if (inRow.has(d.node.idx)) rowDefects.push({ clause_path: d.node.path, code: null, context: d.context, ...(d.count ? { count: d.count } : {}), index: 0, kind: d.kind });
  const withPath = (x) => ({ ...x, clause_path: pathAt(x.start) });
  const definition = DEFINITION_SECTIONS.includes(input.section) && !isRoot;
  const status = top.variantStatus;
  return {
    article: top.article,
    article_title: isRoot ? top.articleTitle : roots_title(top),
    carve_in: Boolean(input.carve_in?.length),
    clauses: clauses.map((c) => ({
      ...(c.ancestors.length ? { ancestors: c.ancestors } : {}),
      ...(c.column_header !== undefined ? { column_header: c.column_header, row_header: c.row_header } : {}),
      leaf: c.node.children.length === 0,
      origin: c.origin,
      path: c.path,
      ranges: c.ranges,
      text: c.text,
      ...(c.title !== undefined ? { title: c.title } : {}),
    })),
    defects: rowDefects,
    end: to,
    kind: definition ? 'definition' : isRoot ? 'article' : 'regulation',
    literals: literals.map(withPath),
    number: isRoot ? null : Number(top.symbol),
    page: input.key,
    refs: refs.map(withPath),
    regulation_id,
    retired: input.status === 'retired',
    ...(input.status === 'retired' ? { retired_ruling: input.ruling } : {}),
    section: input.section,
    sha256: sha256(Buffer.from(verbatim, 'utf8')),
    start: from,
    tags: tags.map(withPath),
    ...(definition ? { term: top.title } : {}),
    uncovered_numbers: scan.uncovered.map(withPath),
    ...(top.variantOf ? { variant_of: `${top.article}(${top.symbol})`, variant_status: status || 'unstatused' } : {}),
    verbatim,
  };
}

/** The title of the article a node belongs to (stored on its root). */
function roots_title(node) {
  let x = node;
  while (x.parent) x = x.parent;
  return x.articleTitle;
}

/** Leaf units of a row: {unit_id, regulation_id, clause_path, citation, text, context, sha256, origin}. PURE. */
export function unitsOf(row) {
  const units = [];
  const byPath = new Map(row.clauses.map((c) => [c.path, c]));
  for (const c of row.clauses) {
    if (!c.leaf) continue;
    const text = c.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const context = (c.ancestors || []).map((p) => (byPath.get(p)?.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (c.column_header !== undefined) context.push(`[row] ${c.row_header}`, `[column] ${c.column_header}`);
    units.push({
      citation: `${row.article}${c.path.replace(/~[a-z_0-9]+/g, '')}`,
      clause_path: c.path,
      context,
      origin: c.origin,
      page: row.page,
      regulation_id: row.regulation_id,
      retired: row.retired,
      sha256: sha256(Buffer.from([...context, text].join(' '), 'utf8')),
      text,
      unit_id: `${row.regulation_id}#${c.path}`,
    });
  }
  return units;
}

const ACTION_RE = /\b(replacing|adding|deleting|amending)\b/i;

/**
 * Slice an enacting by-law's amendments to pinned, in-scope regulations (Spec 69 M-36; operator ruling R5).
 * Each numbered section "N. Zoning By-law 569-2013, as amended, is further amended by <action> … [so that it]
 * reads: <text>" whose target lies on a pinned in-scope article becomes one row on page `enacting:<bylaw>`:
 *   regulation_id  `<target citation>@<bylaw>` (e.g. `10.5.40.60(4)@1075-2026`), verbatim = the whole section
 *   action         replacing · adding · deleting · amending (the first verb); target = the last citation named
 *                  before "reads:" (the division the new text is), targets_named = every citation named
 *   clauses        `[instruction]` (the amending sentence) + the new text's own divisions (inline parse)
 * `scope` = pinnedScope(page-set) {sections, carve}. Returns {rows, skipped: [{section, target, reason}]}. PURE.
 */
export function sliceEnacting({ bylaw, text, scope, status = 'not_verified' }) {
  const rows = [];
  const skipped = [];
  const page = `enacting:${bylaw}`;
  const heads = [...text.matchAll(/(?<=^|\s)(\d{1,3})\. Zoning By-law 569-2013, as amended/g)];
  const endAll = (() => {
    const e = text.search(/\sEnacted and passed/);
    return e < 0 ? text.length : e;
  })();
  const seen = new Map();
  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].index;
    const to = from + text.slice(from, i + 1 < heads.length ? heads[i + 1].index : endAll).trimEnd().length;
    const verbatim = text.slice(from, to);
    const r = /\breads:\s*/.exec(verbatim);
    const instruction = r ? verbatim.slice(0, r.index + r[0].length) : verbatim;
    const named = [...instruction.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){1,3})((?:\([0-9A-Za-z]{1,5}\))*)/g)].map((m) => ({ article: m[1], citation: m[1] + m[2], path: m[2] }));
    const sectionNo = heads[i][1];
    if (!named.length) {
      skipped.push({ reason: 'no_target', section: sectionNo, target: null });
      continue;
    }
    const target = named[named.length - 1];
    const sec = target.article.split('.').slice(0, 2).join('.');
    const carve = scope.carve.get(sec);
    const inScope = scope.sections.has(sec) && (!carve || [...carve].some((a) => target.article === a || target.article.startsWith(`${a}.`)));
    if (!inScope) {
      skipped.push({ reason: 'target_not_pinned_in_scope', section: sectionNo, target: target.citation });
      continue;
    }
    // The action is the last verb before the target's last mention ("deleting the word "and" … and adding a
    // new regulation 10.5.40.40(3)(E)" adds (E); "deleting the number "0.15" … replacing it …, so that
    // regulation 10.5.40.60(4) reads" replaces (4)).
    const lastAt = instruction.lastIndexOf(target.citation);
    const verbs = [...instruction.slice(0, lastAt).matchAll(new RegExp(ACTION_RE.source, 'gi'))];
    const action = (verbs.length ? verbs[verbs.length - 1][1] : 'amending').toLowerCase();
    let id = `${target.citation}@${bylaw}`;
    const k = (seen.get(id) || 0) + 1;
    seen.set(id, k);
    if (k > 1) id = `${id}.${k}`;
    // Clauses: the instruction, then the new text's divisions (rooted at the target's own path).
    const clauses = [{ leaf: true, origin: 'instruction', path: '[instruction]', ranges: [[0, instruction.length]], text: instruction }];
    if (r) {
      const body = verbatim.slice(instruction.length);
      const groups = (target.path.match(/\(([^)]+)\)/g) || []).length;
      const parsed = parseClauses(body, target.path, { startLevel: Math.max(0, groups - 1), atStart: false });
      parsed.nodes.forEach((nd, j) => {
        const leaf = !(parsed.nodes[j + 1] && parsed.nodes[j + 1].depth > nd.depth);
        clauses.push({ leaf, origin: 'enacting', path: nd.path || target.path || '[text]', ranges: [[instruction.length + nd.start, instruction.length + nd.end]], text: body.slice(nd.start, nd.end) });
      });
    }
    for (const c of clauses) {
      const anc = [];
      for (const o of clauses) if (o !== c && o.path !== '[instruction]' && c.path !== '[instruction]' && c.path.startsWith(o.path) && c.path !== o.path) anc.push(o.path);
      if (anc.length) c.ancestors = anc;
    }
    const pathAt = (pos) => {
      let hit = clauses[0];
      for (const c of clauses) if (c.ranges[0][0] <= pos) hit = c;
      return hit.path;
    };
    const tags = extractTags(verbatim);
    const literals = extractLiterals(verbatim);
    const withPath = (x) => ({ ...x, clause_path: pathAt(x.start) });
    rows.push({
      action,
      amendment: { bylaw, section: sectionNo, status },
      article: target.article,
      article_title: null,
      carve_in: Boolean(carve),
      clauses,
      defects: defectChars(verbatim).map((d) => ({ clause_path: pathAt(d.index), code: d.code, context: verbatim.slice(Math.max(0, d.index - 40), d.index + 10), index: d.index, kind: 'garbled_character' })),
      end: to,
      kind: 'enacting_amendment',
      literals: literals.map(withPath),
      number: null,
      page,
      refs: extractRefs(verbatim, tags).map(withPath),
      regulation_id: id,
      retired: false,
      section: sec,
      sha256: sha256(Buffer.from(verbatim, 'utf8')),
      start: from,
      tags: tags.map(withPath),
      target: target.citation,
      targets_named: [...new Set(named.map((x) => x.citation))],
      uncovered_numbers: scanNumbers(verbatim, literals).uncovered.map(withPath),
      verbatim,
    });
  }
  return { rows, skipped };
}

/**
 * Mark consolidation rows that a captured enacting amendment changes (R5: "the affected rows are current"):
 * a row whose regulation the amendment targets gets amended_by[]; a whole-regulation replacement or deletion
 * also sets current_source to the enacting row. Mutates and returns `rows`. PURE over its input.
 */
export function applyAmendments(rows, enactingRows) {
  const byReg = new Map(rows.filter((r) => !r.page.startsWith('enacting:')).map((r) => [r.regulation_id, r]));
  for (const e of enactingRows) {
    const m = /^(\d{1,3}(?:\.\d{1,3}){1,3})(\([0-9A-Za-z]{1,5}\))?((?:\([0-9A-Za-z]{1,5}\))*)$/.exec(e.target);
    if (!m || !m[2]) continue;
    const row = byReg.get(m[1] + m[2]);
    if (!row) continue;
    (row.amended_by ||= []).push({ action: e.action, bylaw: e.amendment.bylaw, row: e.regulation_id, target: e.target });
    if (!m[3] && (e.action === 'replacing' || e.action === 'deleting')) row.current_source = e.regulation_id;
  }
  return rows;
}

const ZERO = () => ({ cells_html: 0, cells_sliced: 0, defects: 0, definitions: 0, inline_units: 0, literals: 0, refs: 0, retired_rows: 0, rows: 0, table_units: 0, tag_entries: 0, tags: 0, uncovered_numbers: 0, units: 0 });

/**
 * Slice the whole snapshot. `pages` = [{key, role, section, file, html, normalized, status?, ruling?, carve_in?}]
 * (the toc_root page is not sliced); `enacting` = enacting-text rows from sliceEnacting(). Returns {slicer_version,
 * rows[], units[], spans{}, problems[], numbering, defects[], pages{key: counts}, totals}. Deterministic. PURE.
 */
export function sliceSnapshot({ pages, enacting = [], scope = null }) {
  const rows = [];
  const spans = {};
  const problems = [];
  const numbering = { gaps: [], unproven: [] };
  const pageCounts = {};
  const enactingSkipped = [];
  for (const p of [...pages].sort((a, b) => cmpStr(a.key, b.key))) {
    if (p.role !== 'section') continue;
    pageCounts[p.key] = ZERO();
    const r = slicePage(p);
    rows.push(...r.rows);
    spans[p.key] = r.spans.sort((a, b) => a.start - b.start);
    problems.push(...r.problems);
    numbering.gaps.push(...r.numbering.gaps);
    numbering.unproven.push(...r.numbering.unproven);
    pageCounts[p.key].cells_html = r.cells.html;
    pageCounts[p.key].cells_sliced = r.cells.sliced;
  }
  const enactingRows = [];
  for (const e of [...enacting].sort((a, b) => cmpStr(a.bylaw, b.bylaw))) {
    if (!scope) {
      problems.push(`structural: enacting ${e.bylaw} given without the pinned scope; not sliced`);
      continue;
    }
    const r = sliceEnacting({ bylaw: e.bylaw, scope, status: e.status, text: e.text });
    pageCounts[`enacting:${e.bylaw}`] = ZERO();
    enactingRows.push(...r.rows);
    enactingSkipped.push(...r.skipped.map((s) => ({ ...s, bylaw: e.bylaw })));
  }
  applyAmendments(rows, enactingRows);
  rows.push(...enactingRows);
  const units = rows.flatMap(unitsOf);
  const defects = rows.flatMap((r) => r.defects.map((d) => ({ ...d, page: r.page, regulation_id: r.regulation_id })));
  for (const r of rows) {
    const c = pageCounts[r.page];
    c.rows++;
    if (r.kind === 'definition') c.definitions++;
    if (r.retired) c.retired_rows++;
    c.literals += r.literals.length;
    c.refs += r.refs.length;
    c.tags += r.tags.length;
    c.tag_entries += r.tags.reduce((s, x) => s + x.entries.length, 0);
    c.defects += r.defects.length;
    c.uncovered_numbers += r.uncovered_numbers.length;
  }
  for (const u of units) {
    pageCounts[u.page].units++;
    if (u.origin === 'inline') pageCounts[u.page].inline_units++;
    if (u.origin === 'table_cell') pageCounts[u.page].table_units++;
  }
  const totals = { pages: Object.keys(pageCounts).length, rows: rows.length, units: units.length };
  for (const k of ['definitions', 'inline_units', 'table_units', 'literals', 'refs', 'tags', 'tag_entries', 'defects', 'retired_rows', 'uncovered_numbers', 'cells_html', 'cells_sliced']) totals[k] = Object.values(pageCounts).reduce((s, c) => s + c[k], 0);
  totals.enacting_rows = enactingRows.length;
  return { defects, enacting_skipped: enactingSkipped, numbering, pages: pageCounts, problems, rows, slicer_version: SLICER_VERSION, spans, totals, units };
}

/** Read the committed snapshot into sliceSnapshot() input (the one I/O function here). */
export function loadSnapshotPages(seeds) {
  const pageSet = JSON.parse(fs.readFileSync(path.join(seeds, 'page-set.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(seeds, 'manifest.json'), 'utf8'));
  const byKey = new Map(pageSet.pages.map((p) => [p.key, p]));
  const pages = manifest.pages.map((m) => {
    const p = byKey.get(m.key) || {};
    return {
      carve_in: p.carve_in || m.carve_in,
      file: p.file,
      html: decodePage(fs.readFileSync(path.join(seeds, 'pages', `${m.key}.htm`))),
      key: m.key,
      normalized: fs.readFileSync(path.join(seeds, 'pages', `${m.key}.txt`), 'utf8'),
      role: m.role,
      ruling: p.ruling,
      section: m.section,
      status: p.status || m.status,
    };
  });
  const capFile = path.join(seeds, 'enacting', 'manifest.json');
  const captures = fs.existsSync(capFile) ? JSON.parse(fs.readFileSync(capFile, 'utf8')).captures : {};
  const enacting = SLICED_ENACTING.filter((b) => captures[b]).map((b) => ({ bylaw: b, text: fs.readFileSync(path.join(seeds, 'enacting', `${b}.txt`), 'utf8') }));
  return { adoption_id: manifest.adoption_id, enacting, normalizer_version: manifest.normalizer_version, pages, scope: pinnedScopeOf(pageSet) };
}

/** Pinned in-scope sections (not retired) and the carve-in articles of carve-in pages. PURE. */
export function pinnedScopeOf(pageSet) {
  const sections = new Set();
  const carve = new Map();
  for (const p of pageSet.pages) {
    if (p.role !== 'section' || p.status === 'retired') continue;
    sections.add(p.section);
    if (p.carve_in?.length) carve.set(p.section, new Set(p.carve_in));
  }
  return { carve, sections };
}
