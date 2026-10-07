// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-21 (seed from the page: 12 UNVERIFIED legacy claims
//            retired; legacy C/L/G/H ids rewritten once to regulation_id; absence claims re-derived once), M-20 (S13
//            one source); docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (regulation_id, unit id
//            `regulation_id#clause_path`; no permanent alias field), §6.1 (external.json `ref` entries), §9 (G-ALIAS
//            cut: a one-time S12/S13 migration); docs/reports/mcbylaw-phase1-plan.md S12
//
// S12 — the one-time legacy-id map. Every legacy claim id of Spec 67 (Appendix A C1–C76, Appendix B L1–L28,
// Appendix C G1–G23 and absence check A1, Appendix E H1–H28) is cut into FRAGMENTS — the part of the claim that
// falls in one regulation of the current slice (or one cited article/page for a retired claim, or the whole claim
// for an absence or external claim) — and every fragment maps EXACTLY ONCE to one target:
//   unit      a slice unit id `regulation_id#clause_path` (the fragment's page evidence lies in one leaf)
//   row       a slice regulation_id (the evidence spans several leaves or a lead-in of that regulation)
//   external  an external.json id (`REF-n`; H26–H28)
//   retired   a closed reason: unverified_claim (M-21: the 12 UNVERIFIED C-claims) · absence_rederived
//             (the absence probes re-run on the current pinned pages; the exhaustive slice now carries the law)
// Unit/row targets are SEEDED FROM THE PAGE: the claim's own quoted text is located in the pinned normalized page
// and the leaves it covers decide the target; a quote that matches more than one place needs an authored pick,
// which is then checked (the pick must be one of the matches). Nothing here is a permanent alias or gate: the map
// is written once to docs/reports/ for S13 to rewrite Specs 58/67/78, and this module retires with S13.
//
// Inputs: the Spec 67 / 58 / 78 text at the blobs pinned in the decisions seed (read with `git cat-file`, so the
// map stays reproducible after S13 rewrites the specs), the live slice (sliceSnapshot of the committed snapshot),
// the pinned pages, and scripts/seeds/bylaw/legacy-decisions.json (authored: retirements, external refs, picks).
//
// Reason codes (checkLegacyMap):
//   legacy_source_mismatch     the live adoption differs from the decisions seed's, or a source blob id is not a git object id
//   legacy_id_unmapped         an inventory legacy id has no fragment in the map (totality, inventory → map)
//   legacy_id_unknown          a map / decision / spec reference names an id not in the inventory (map → inventory)
//   fragment_duplicate         a fragment key appears twice (exactly-once)
//   fragment_target_invalid    a target kind outside the closed set, or a unit/row/external id that does not exist
//   fragment_evidence_missing  a unit/row target whose recorded evidence is not found in the target's page text
//   fragment_ambiguous         a quote matches more than one place and no authored pick resolves it
//   fragment_not_located       a non-retired claim whose quote is not found on the current page (needs operator)
//   retire_reason_invalid      a retirement reason outside the closed set, or unverified_claim on a claim the
//                              source does not mark UNVERIFIED (or an UNVERIFIED claim not retired)
//   absence_not_holding        a re-derived absence probe no longer meets its expectation (needs operator)
//   decision_unused            an authored pick / relocate / retire / external entry that the build never applied
//   map_drift                  the committed map differs from the regenerated one

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSnapshotPages, sliceSnapshot, unitsOf } from './slice.mjs';
import { cmpStr } from './text.mjs';

export const LEGACY_MAP_VERSION = 'legacy-map-v1';
export const DECISIONS_REL = 'scripts/seeds/bylaw/legacy-decisions.json';
export const MAP_JSON_REL = 'docs/reports/mcbylaw-legacy-id-map.json';
export const MAP_MD_REL = 'docs/reports/mcbylaw-legacy-id-map.md';
export const SPEC67_REL = 'docs/specs/01-pipeline/67_maxbuild_bylaw_derivation.md';
export const SPEC58_REL = 'docs/specs/01-pipeline/58_source_zoning_bylaw.md';
export const SPEC78_REL = 'docs/specs/01-pipeline/78_optimal_lot_configuration.md';
export const TARGET_KINDS = Object.freeze(['unit', 'row', 'external', 'retired']);
export const RETIRE_REASONS = Object.freeze(['unverified_claim', 'absence_rederived', 'quote_not_in_cited_article']);
/** Legacy page keys (one page per chapter URL, Phase 0) → current pinned page keys (one page per section, S3). */
export const LEGACY_PAGES = Object.freeze({ ch800: 'ch800_50', ch200: 'ch200_5', ch995: 'ch995_10' });
/** The legacy id families and their ranges, as defined by Spec 67's appendices. */
export const FAMILIES = Object.freeze({ C: 'Appendix A', L: 'Appendix B', G: 'Appendix C', A: 'Appendix C (absence checks)', H: 'Appendix E' });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const naturalId = (a, b) => cmpStr(a.replace(/\d+/g, (d) => d.padStart(4, '0')), b.replace(/\d+/g, (d) => d.padStart(4, '0')));

// ---------------------------------------------------------------- parsing Spec 67 (PURE)

const cellsOf = (line) => line.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((x) => x.trim());
const unquote = (s) => s.replace(/^"|"$/g, '').trim();
const statementOf = (s) => s.replace(/^\*\(absence claim\)\*\s*/, '').trim();

/** The lines of one appendix: from its `## Appendix X` heading to the next `## ` heading. */
function appendixLines(lines, letter) {
  const i = lines.findIndex((l) => l.startsWith(`## Appendix ${letter} `));
  if (i < 0) return [];
  const j = lines.findIndex((l, k) => k > i && /^## /.test(l));
  return lines.slice(i + 1, j < 0 ? lines.length : j);
}

/** Absence probes from a "phrase@page=n/m" list (Appendix B re-verification) or "\"phrase\"@page=n (expect m)" (A1). */
export function parseProbes(text) {
  const probes = [];
  for (const m of text.matchAll(/(?:"([^"]+)"|([^,"]+?))@([A-Za-z]\w*)=(\d+)(?:\/(\d+)| \(expect (\d+)\))/g)) {
    const pattern = (m[1] ?? m[2]).trim();
    probes.push({ expect: Number(m[5] ?? m[6]), legacy_page: m[3], pattern, regex: m[1] === undefined });
  }
  const entries = (text.match(/@[A-Za-z]\w*=\d+/g) || []).length;
  if (entries !== probes.length) probes.push({ expect: null, legacy_page: null, parse_error: `${entries} entries, ${probes.length} parsed`, pattern: text, regex: false });
  return probes;
}

/**
 * Parse the legacy inventory from Spec 67's appendices. Returns claims sorted by id:
 * {legacy_id, family, cited, kind: verbatim|absence|unverified, evidence: [{page|null, text}], source_result}.
 * PURE.
 */
export function parseLegacy(spec67) {
  const lines = spec67.split(/\r?\n/);
  const claims = [];
  for (const l of appendixLines(lines, 'A')) {
    if (!/^\| C\d+ \|/.test(l)) continue;
    const c = cellsOf(l);
    const result = c[4];
    const kind = /^UNVERIFIED/.test(result) ? 'unverified' : /^ABSENCE PHRASE/.test(result) ? 'absence' : 'verbatim';
    const perPage = [...(c[7] || '').matchAll(/(ch[\w]+): "(.*?)"(?=<br>|$)/g)].map((m) => ({ page: m[1], text: m[2] }));
    claims.push({ cited: c[2], evidence: perPage.length ? perPage : [{ page: null, text: unquote(c[3]) }], family: 'C', kind, legacy_id: c[0], source_result: result });
  }
  const b = appendixLines(lines, 'B');
  const reverify = new Map();
  let inReverify = false;
  for (const l of b) {
    if (l.startsWith('**Re-verification')) inReverify = true;
    if (inReverify && /^\| L\d+ \|/.test(l)) {
      const c = cellsOf(l);
      reverify.set(c[0], c[4]);
    }
  }
  for (const l of b) {
    if (l.startsWith('**Corrections')) break;
    if (!/^\| L\d+ \|/.test(l)) continue;
    const c = cellsOf(l);
    const absence = /\(absence\)/.test(c[2]);
    claims.push({
      cited: c[2], evidence: absence ? [] : [{ page: null, text: unquote(c[3]) }], family: 'L', kind: absence ? 'absence' : 'verbatim', legacy_id: c[0],
      probes: absence ? parseProbes(reverify.get(c[0]) || '') : undefined, source_result: c[5], statement: absence ? statementOf(c[3]) : undefined,
    });
  }
  for (const l of appendixLines(lines, 'C')) {
    if (/^\| G\d+ \|/.test(l)) {
      const c = cellsOf(l);
      claims.push({ cited: c[1], evidence: [{ page: null, text: unquote(c[3]) }], family: 'G', kind: 'verbatim', legacy_id: c[0], source_result: 'extract' });
    } else if (/^\| A\d+ \|/.test(l)) {
      const c = cellsOf(l);
      claims.push({ cited: '(absence)', evidence: [], family: 'A', kind: 'absence', legacy_id: c[0], probes: parseProbes(c[3]), source_result: c[2], statement: c[1] });
    }
  }
  for (const l of appendixLines(lines, 'E')) {
    if (!/^\| H\d+ \|/.test(l)) continue;
    const c = cellsOf(l);
    claims.push({ cited: c[1], evidence: [{ page: null, text: unquote(c[3]) }], family: 'H', kind: 'verbatim', legacy_id: c[0], source_result: 'extract' });
  }
  return claims.sort((x, y) => naturalId(x.legacy_id, y.legacy_id));
}

/**
 * Citation tokens of a cited string: every by-law reference (`10.20.40.70`, `10.5.50.10(1)(A)` → regulation
 * `10.5.50.10(1)`), ranges `(1)-(3)` and siblings `(100)/(105)` expanded at regulation level; `(inherited) chX, chY`
 * → page tokens. Returns [{kind: article|regulation|page, id}] unique, in order. PURE.
 */
export function citationTokens(cited) {
  const out = [];
  const push = (kind, id) => { if (!out.some((t) => t.id === id)) out.push({ id, kind }); };
  if (/^\(inherited\)/.test(cited)) {
    for (const m of cited.matchAll(/ch[\w]+/g)) push('page', m[0]);
    return out;
  }
  const re = /(\d+(?:\.\d+)+)((?:\([0-9A-Za-z]+\))*)((?:\s*(?:-|\/)\s*\([0-9A-Za-z]+\))*)/g;
  for (const m of cited.matchAll(re)) {
    const article = m[1];
    const parens = [...m[2].matchAll(/\(([0-9A-Za-z]+)\)/g)].map((x) => x[1]);
    if (!parens.length) { push('article', article); continue; }
    const first = parens[0];
    push('regulation', `${article}(${first})`);
    // a range / sibling list after the clause path: only expand at regulation level (numeric) when the chain
    // has a single paren, e.g. (1)-(3) or (100)/(105); (1)(A)-(D) stays inside regulation (1)
    const tail = [...m[3].matchAll(/(-|\/)\s*\(([0-9A-Za-z]+)\)/g)];
    if (parens.length === 1 && /^\d+$/.test(first)) {
      let prev = Number(first);
      for (const t of tail) {
        if (!/^\d+$/.test(t[2])) break;
        const n = Number(t[2]);
        if (t[1] === '-') for (let k = prev + 1; k <= n; k++) push('regulation', `${article}(${k})`);
        else push('regulation', `${article}(${n})`);
        prev = n;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- locating evidence on the page (PURE)

const QUOTES = /[‘’“”'`"]/g;
/** Squeezed form for matching: whitespace dropped, quotes dropped, lower-cased; `map[i]` = offset in the source. */
export function squeeze(text) {
  let s = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch) || QUOTES.test(ch)) { QUOTES.lastIndex = 0; continue; }
    QUOTES.lastIndex = 0;
    const low = ch.toLowerCase();
    s += low;
    for (let k = 0; k < low.length; k++) map.push(i);
  }
  return { map, s };
}

/** Evidence pieces: the quote split on ellipses; pieces under 3 squeezed chars are dropped. PURE. */
export function piecesOf(text) {
  return text.split(/\.\.\.|…/).map((p) => p.trim().replace(/[.,;:]+$/, '')).filter((p) => squeeze(p).s.length >= 3);
}

/** Every placement of the ordered pieces in [from, to) of a squeezed page: [{start, end}] in source offsets. */
function placements(sq, pieces, from, to) {
  const ps = pieces.map((p) => squeeze(p).s);
  if (!ps.length) return [];
  const out = [];
  const lo = sq.map.findIndex((o) => o >= from);
  const hi = (() => { let k = sq.map.length; while (k > 0 && sq.map[k - 1] >= to) k--; return k; })();
  if (lo < 0) return [];
  let at = sq.s.indexOf(ps[0], lo);
  while (at >= 0 && at + ps[0].length <= hi) {
    const spans = [[at, at + ps[0].length]];
    let cur = at + ps[0].length;
    let ok = true;
    for (const p of ps.slice(1)) {
      const k = sq.s.indexOf(p, cur);
      if (k < 0 || k + p.length > hi) { ok = false; break; }
      spans.push([k, k + p.length]);
      cur = k + p.length;
    }
    if (ok) out.push(spans.map(([a, z]) => [sq.map[a], sq.map[z - 1] + 1]));
    at = sq.s.indexOf(ps[0], at + 1);
  }
  return out;
}

/** The leaves (and lead-in clauses) of `rows` overlapped by source spans. Returns Map regulation_id → {leaves, leadIns}. */
function covered(rows, spans) {
  const hit = new Map();
  for (const r of rows) {
    for (const c of r.clauses) {
      for (const [a, z] of c.ranges) {
        const ca = r.start + a;
        const cz = r.start + z;
        if (!spans.some(([s, e]) => s < cz && ca < e)) continue;
        const h = hit.get(r.regulation_id) || { leadIns: new Set(), leaves: new Set() };
        (c.leaf ? h.leaves : h.leadIns).add(c.path);
        hit.set(r.regulation_id, h);
      }
    }
  }
  return hit;
}

/** Target for one regulation's coverage: one leaf (lead-ins only its ancestors) → unit; else → row. */
function targetOf(row, h) {
  const leaves = [...h.leaves].sort(cmpStr);
  if (leaves.length === 1) {
    const leaf = row.clauses.find((c) => c.path === leaves[0]);
    const anc = new Set(leaf.ancestors || []);
    if ([...h.leadIns].every((p) => anc.has(p))) return { id: `${row.regulation_id}#${leaves[0]}`, kind: 'unit' };
  }
  return { id: row.regulation_id, kind: 'row', units: leaves.map((p) => `${row.regulation_id}#${p}`) };
}

const articleOf = (regulationId) => regulationId.replace(/\(.*$/, '');

/** The search window around `scopeRows` on a page: from the end of the row before to the start of the row after
 * (so an article heading between rows is inside), as offsets into the normalized page. */
function windowOf(pageRows, scopeRows, pageLength) {
  const lo = Math.min(...scopeRows.map((r) => r.start));
  const hi = Math.max(...scopeRows.map((r) => r.end));
  const before = pageRows.filter((r) => r.end <= lo).reduce((m, r) => Math.max(m, r.end), 0);
  const after = pageRows.filter((r) => r.start >= hi).reduce((m, r) => Math.min(m, r.start), pageLength);
  return [before, after];
}

/** Page keys a token can live on (legacy page keys mapped to current ones). */
const currentPage = (k) => LEGACY_PAGES[k] || k;

/** Rows a token scopes the search to (in page order). */
function rowsForToken(rowsByPage, allRows, token) {
  if (token.kind === 'page') return rowsByPage.get(currentPage(token.id)) || [];
  if (token.kind === 'regulation') return allRows.filter((r) => r.regulation_id === token.id || r.regulation_id.startsWith(`${token.id}~`));
  return allRows.filter((r) => r.article === token.id || r.article.startsWith(`${token.id}.`));
}

// ---------------------------------------------------------------- absence re-derivation (PURE)

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Re-run one probe on the current normalized page text. */
export function runProbe(probe, pageText) {
  let re;
  try {
    re = new RegExp(probe.regex ? probe.pattern : escapeRe(probe.pattern), 'gi');
  } catch {
    return null; // unparseable pattern: the probe cannot hold
  }
  return pageText ? (pageText.match(re) || []).length : null;
}

// ---------------------------------------------------------------- the map (PURE)

/**
 * Build the legacy-id map. Inputs: {claims (parseLegacy), slice (sliceSnapshot), pageText {key: normalized},
 * decisions (legacy-decisions.json), external (external.json doc)}. Returns {fragments[], absence[], problems[]}.
 * Every fragment is {key, legacy_id, family, token, target {kind, id?, units?, reason?}, evidence[]?, matches?}.
 */
export function buildMap({ claims, slice, pageText, decisions }) {
  const rowsByPage = new Map();
  for (const r of slice.rows) {
    if (!rowsByPage.has(r.page)) rowsByPage.set(r.page, []);
    rowsByPage.get(r.page).push(r);
  }
  for (const rs of rowsByPage.values()) rs.sort((a, b) => a.start - b.start);
  const rowById = new Map(slice.rows.map((r) => [r.regulation_id, r]));
  const sqCache = new Map();
  const sq = (k) => { if (!sqCache.has(k)) sqCache.set(k, squeeze(pageText[k] || '')); return sqCache.get(k); };
  const fragments = [];
  const absence = [];
  const problems = [];
  const picks = decisions.picks || {};
  const relocate = decisions.relocate || {};
  const retire = decisions.retire || {};
  const used = new Set();
  const externalOf = decisions.external || {};
  const probesByPhrase = new Map();
  for (const c of claims) for (const p of c.probes || []) probesByPhrase.set(p.pattern.toLowerCase(), [...(probesByPhrase.get(p.pattern.toLowerCase()) || []), { ...p, from: c.legacy_id }]);

  for (const c of claims) {
    const tokens = citationTokens(c.cited);
    const base = { family: c.family, legacy_id: c.legacy_id };
    if (externalOf[c.legacy_id]) {
      used.add(`external:${c.legacy_id}`);
      fragments.push({ ...base, key: `${c.legacy_id}@whole`, target: { id: externalOf[c.legacy_id], kind: 'external' }, token: 'whole' });
      continue;
    }
    if (c.kind === 'absence') {
      let probes = c.probes || [];
      if (c.family === 'C') {
        const phrase = unquote(c.evidence[0].text).toLowerCase();
        probes = (probesByPhrase.get(phrase) || []).map(({ from, ...p }) => ({ ...p, via: from }));
      }
      const art = /^§(\d+(?:\.\d+)+) \(absence\)$/.exec(c.cited);
      const rerun = probes.map((p) => {
        const page = currentPage(p.legacy_page);
        // a claim cited as "§<article> (absence)" is about that article's body only (L22: 10.5.60)
        const text = art ? (rowsByPage.get(page) || []).filter((r) => r.article === art[1] || r.article.startsWith(`${art[1]}.`)).map((r) => r.verbatim).join(' ') : pageText[page];
        const count = runProbe(p, text);
        return { ...p, count, holds: count === p.expect, page };
      });
      const holds = rerun.length > 0 && rerun.every((p) => p.holds);
      absence.push({ holds, legacy_id: c.legacy_id, probes: rerun, statement: c.statement || unquote(c.evidence[0]?.text || '') });
      if (!holds) problems.push(`absence_not_holding: ${c.legacy_id} ${rerun.length ? rerun.filter((p) => !p.holds).map((p) => `${p.pattern}@${p.page}=${p.count} (expect ${p.expect})`).join('; ') : 'no probes'}`);
      fragments.push({ ...base, key: `${c.legacy_id}@absence`, target: holds ? { kind: 'retired', reason: 'absence_rederived' } : { kind: 'unlocated' }, token: 'absence' });
      continue;
    }
    if (c.kind === 'unverified') {
      for (const t of tokens) fragments.push({ ...base, key: `${c.legacy_id}@${t.id}`, target: { kind: 'retired', reason: 'unverified_claim' }, token: t.id });
      if (!tokens.length) problems.push(`legacy_id_unmapped: ${c.legacy_id} has no citation token`);
      continue;
    }
    // verbatim: locate each evidence text in the window of the pages its tokens scope; the leaves it covers
    // decide the fragments (one per regulation) and their targets
    if (!tokens.length) {
      problems.push(`fragment_not_located: ${c.legacy_id}@whole — no by-law citation (${c.cited})`);
      fragments.push({ ...base, key: `${c.legacy_id}@whole`, target: { kind: 'unlocated' }, token: 'whole' });
      continue;
    }
    const live = [];
    for (const t of tokens) {
      const r = retire[`${c.legacy_id}@${t.id}`];
      if (r) used.add(`retire:${c.legacy_id}@${t.id}`);
      if (r) fragments.push({ ...base, key: `${c.legacy_id}@${t.id}`, target: { kind: 'retired', reason: r.reason }, token: t.id, why: r.why });
      else live.push(t);
    }
    const scope = new Map(); // page → rows
    const tokenPages = new Map(); // token id → pages
    for (const t of live) {
      const rows = t.kind === 'regulation' ? slice.rows.filter((r) => r.article === articleOf(t.id)) : rowsForToken(rowsByPage, slice.rows, t);
      tokenPages.set(t.id, new Set(rows.map((r) => r.page)));
      for (const r of rows) scope.set(r.page, [...(scope.get(r.page) || []), r]);
    }
    const hits = new Map(); // regulation_id → {leaves, leadIns, evidence, relocated}
    const pending = new Set(); // pages whose evidence is recorded as an unlocated fragment (ambiguous / relocation)
    for (const [page, prs] of [...scope].sort((a, b) => cmpStr(a[0], b[0]))) {
      const pageRows = rowsByPage.get(page) || [];
      const [from, to] = windowOf(pageRows, prs, (pageText[page] || '').length);
      for (const ev of c.evidence) {
        if (ev.page && currentPage(ev.page) !== page) continue;
        let pl = placements(sq(page), piecesOf(ev.text), from, to);
        let relocated = false;
        if (!pl.length) {
          // not in the cited article: the legacy citation may be wrong (H19 cites 10.40.20.20; the text is
          // 10.40.20.40) or the legacy check matched elsewhere on the page — search the whole page, but accept
          // a relocation only by an authored decision (`relocate`)
          pl = placements(sq(page), piecesOf(ev.text), 0, (pageText[page] || '').length);
          relocated = true;
        }
        if (!pl.length) continue;
        const cands = pl.map((spans) => [...covered(pageRows, spans)].map(([rid, h]) => targetOf(rowById.get(rid), h).id).sort(naturalId).join(' + '));
        const key = `${c.legacy_id}@${page}`;
        const chosen = relocated ? relocate[key] : picks[key];
        let k = new Set(cands).size === 1 && !relocated ? 0 : cands.indexOf(chosen);
        if (k >= 0 && (relocated || new Set(cands).size > 1)) used.add(`${relocated ? 'relocate' : 'picks'}:${key}`);
        if (k < 0) {
          const what = relocated ? 'fragment_not_located' : 'fragment_ambiguous';
          problems.push(`${what}: ${key} — ${relocated ? 'not in the cited article; found elsewhere on the page' : 'more than one match'}: [${[...new Set(cands)].join(' | ')}]${chosen ? ` (decision ${chosen} not among them)` : ''}`);
          fragments.push({ ...base, candidates: [...new Set(cands)], key, target: { kind: 'unlocated' }, token: page });
          pending.add(page);
          continue;
        }
        for (const [rid, h] of covered(pageRows, pl[k])) {
          const cur = hits.get(rid) || { evidence: new Set(), leadIns: new Set(), leaves: new Set(), relocated };
          h.leaves.forEach((x) => cur.leaves.add(x));
          h.leadIns.forEach((x) => cur.leadIns.add(x));
          cur.evidence.add(ev.text);
          hits.set(rid, cur);
        }
      }
    }
    const tokenOf = (row, relocated) => live.find((t) => (t.kind === 'regulation' && (row.regulation_id === t.id || row.regulation_id.startsWith(`${t.id}~`)))
      || (t.kind === 'article' && (row.article === t.id || row.article.startsWith(`${t.id}.`))) || (t.kind === 'page' && currentPage(t.id) === row.page))
      || (relocated ? live.find((t) => tokenPages.get(t.id).has(row.page)) : undefined);
    const seen = new Set();
    for (const [rid, h] of [...hits].sort((a, b) => naturalId(a[0], b[0]))) {
      const row = rowById.get(rid);
      const t = tokenOf(row, h.relocated);
      for (const x of live) if (x === t || (tokenOf(row, false) && rowsForToken(rowsByPage, slice.rows, x).includes(row))) seen.add(x.id);
      fragments.push({
        ...base, evidence: [...h.evidence].sort(cmpStr), key: `${c.legacy_id}@${rid}`, target: targetOf(row, h), token: t ? t.id : 'uncited',
        ...(h.relocated ? { relocated: true } : {}),
      });
    }
    for (const t of live) {
      if (seen.has(t.id) || [...tokenPages.get(t.id)].some((p) => pending.has(p))) continue;
      problems.push(`fragment_not_located: ${c.legacy_id}@${t.id} — quote not found on the current page`);
      fragments.push({ ...base, key: `${c.legacy_id}@${t.id}`, target: { kind: 'unlocated' }, token: t.id });
    }
  }
  for (const kind of ['picks', 'relocate', 'retire', 'external']) {
    for (const k of Object.keys(decisions[kind] || {})) if (!used.has(`${kind}:${k}`)) problems.push(`decision_unused: ${kind} ${k} was not applied (stale or unnecessary)`);
  }
  fragments.sort((a, b) => naturalId(a.legacy_id, b.legacy_id) || naturalId(a.key, b.key));
  return { absence, fragments, problems };
}

// ---------------------------------------------------------------- references in Specs 58 / 67 / 78 (PURE)

/** The lines of a `## ` section whose heading starts with `start` (to the next `## `). */
function sectionText(text, start) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(start));
  if (i < 0) return '';
  const j = lines.findIndex((l, k) => k > i && /^## /.test(l));
  return lines.slice(i, j < 0 ? lines.length : j).join('\n');
}

/** Where S13 rewrites legacy ids (Spec 69 M-21): Spec 58 §13, Spec 78 §5, Spec 67 above its appendices. */
export const REFERENCE_SCOPES = Object.freeze([
  { name: 'spec58 §13', source: 'spec58', start: '## 13.' },
  { name: 'spec67 body', source: 'spec67', start: null },
  { name: 'spec78 §5', source: 'spec78', start: '## §5' },
]);
const REF_ID_RE = /(?<![\w\-.])([CLGHA]\d{1,3})(?![\w-])/g;

/** Legacy-id references per scope: {scope: {id: count}}. A bare `A<n>` other than an inventory id is not counted. PURE. */
export function scanReferences(specs, inventoryIds) {
  const out = {};
  for (const s of REFERENCE_SCOPES) {
    const text = s.start ? sectionText(specs[s.source] || '', s.start) : (specs[s.source] || '').split(/\r?\n## Appendix A /)[0];
    const counts = {};
    for (const m of text.matchAll(REF_ID_RE)) {
      if (m[1][0] === 'A' && !inventoryIds.has(m[1])) continue; // A1..A7 authoring batches are not legacy ids
      counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    out[s.name] = Object.fromEntries(Object.keys(counts).sort(naturalId).map((k) => [k, counts[k]]));
  }
  return out;
}

// ---------------------------------------------------------------- the committed map (PURE)

/**
 * Assemble the committed map document from buildMap() output. `rewrite` is what S13 needs: legacy id → the
 * regulation_ids (or external ids) its fragments map to, or [] when every fragment is retired.
 */
export function assembleMap({ claims, built, decisions, references, slicerVersion }) {
  const byTarget = { external: 0, retired: 0, row: 0, unit: 0 };
  const byReason = Object.fromEntries(RETIRE_REASONS.map((r) => [r, 0]));
  const byFamily = {};
  const pickedIds = new Set(Object.values(decisions.picks || {}));
  for (const f of built.fragments) {
    byTarget[f.target.kind] = (byTarget[f.target.kind] || 0) + 1;
    if (f.target.kind === 'retired') byReason[f.target.reason] = (byReason[f.target.reason] || 0) + 1;
    byFamily[f.family] = (byFamily[f.family] || 0) + 1;
  }
  const rewrite = {};
  const fullyRetired = [];
  for (const c of claims) {
    const own = built.fragments.filter((f) => f.legacy_id === c.legacy_id);
    const ids = own.filter((f) => ['unit', 'row', 'external'].includes(f.target.kind)).map((f) => (f.target.kind === 'unit' ? f.target.id.split('#')[0] : f.target.id));
    rewrite[c.legacy_id] = [...new Set(ids)].sort(naturalId);
    if (own.length && own.every((f) => f.target.kind === 'retired')) fullyRetired.push(c.legacy_id);
  }
  return {
    $comment: `GENERATED by scripts/analysis/bylaw/legacy.mjs --write (S12, Spec 69 M-21) from Spec 67 at blob ${decisions.legacy_sources?.spec67}, the live slice and ${DECISIONS_REL}. One-time migration map for S13; do not edit.`,
    absence: built.absence,
    adoption_id: decisions.adoption_id,
    counts: {
      claims: claims.length,
      claims_fully_retired: fullyRetired.length,
      fragments: built.fragments.length,
      fragments_by_family: Object.fromEntries(Object.keys(byFamily).sort().map((k) => [k, byFamily[k]])),
      fragments_by_target: byTarget,
      problems: built.problems.length,
      relocated: built.fragments.filter((f) => f.relocated).length,
      retired_by_reason: byReason,
      uncited: built.fragments.filter((f) => f.token === 'uncited').length,
      unverified_claims_retired: claims.filter((c) => c.kind === 'unverified' && fullyRetired.includes(c.legacy_id)).length,
    },
    fragments: built.fragments.map((f) => {
      const o = { family: f.family, key: f.key, legacy_id: f.legacy_id, target: f.target, token: f.token };
      if (f.evidence) o.evidence = f.evidence;
      if (f.relocated) o.relocated = true;
      if (f.candidates) o.candidates = f.candidates;
      if (f.why) o.why = f.why;
      if (f.target.kind === 'unit' && pickedIds.has(f.target.id)) o.picked = true;
      return o;
    }),
    legacy_sources: decisions.legacy_sources,
    problems: built.problems,
    proposed_refs: decisions.proposed_refs || [],
    references,
    rewrite,
    slicer_version: slicerVersion,
    version: LEGACY_MAP_VERSION,
  };
}

/** Minimum shared squeezed characters for a quote that only partly covers a target (a quote that starts or ends
 * inside it). */
export const MIN_OVERLAP = 20;

/**
 * Does squeezed quote piece `p` share text with squeezed target text `hay`: one contains the other, or `p` ends
 * with a prefix of `hay` / starts with a suffix of `hay` of at least MIN_OVERLAP characters. PURE.
 */
export function overlaps(p, hay, min = MIN_OVERLAP) {
  if (!p || !hay) return false;
  if (hay.includes(p) || p.includes(hay)) return true;
  if (p.length < min || hay.length < min) return false;
  const head = hay.slice(0, min);
  for (let i = p.indexOf(head); i >= 0; i = p.indexOf(head, i + 1)) if (hay.startsWith(p.slice(i))) return true;
  const tail = hay.slice(-min);
  for (let i = p.indexOf(tail); i >= 0; i = p.indexOf(tail, i + 1)) if (hay.endsWith(p.slice(0, i + min))) return true;
  return false;
}

/** Deterministic serialization: sorted keys at every level, 2-space indent, LF, trailing newline. PURE. */
export function canonical(doc) {
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort(cmpStr).map((k) => [k, sortKeys(v[k])])) : v);
  return `${JSON.stringify(sortKeys(doc), null, 2)}\n`;
}

/**
 * Validate a map document against its inputs (the reason codes in the header). PURE over
 * {doc, claims, slice, external (external.json doc), decisions}. Returns {pass, violations, checked}.
 */
export function validateMap({ doc, claims, slice, external, decisions }) {
  const v = [];
  const ids = new Set(claims.map((c) => c.legacy_id));
  const units = new Map(slice.rows.flatMap(unitsOf).map((u) => [u.unit_id, u]));
  const rows = new Map(slice.rows.map((r) => [r.regulation_id, r]));
  const extIds = new Set([...(external?.entries || []).map((e) => e.id), ...(decisions.proposed_refs || []).map((e) => e.id)]);
  if (doc.adoption_id !== decisions.adoption_id) v.push(`legacy_source_mismatch: map adoption ${doc.adoption_id} ≠ decisions ${decisions.adoption_id}`);
  const seenKeys = new Set();
  const mapped = new Set();
  for (const f of doc.fragments || []) {
    if (seenKeys.has(f.key)) v.push(`fragment_duplicate: ${f.key}`);
    seenKeys.add(f.key);
    if (!ids.has(f.legacy_id)) v.push(`legacy_id_unknown: fragment ${f.key} names ${f.legacy_id}`);
    else mapped.add(f.legacy_id);
    const t = f.target || {};
    if (t.kind === 'unlocated') {
      v.push(`${f.candidates ? 'fragment_ambiguous' : 'fragment_not_located'}: ${f.key}`);
      continue;
    }
    if (!TARGET_KINDS.includes(t.kind)) {
      v.push(`fragment_target_invalid: ${f.key} kind ${t.kind}`);
      continue;
    }
    if (t.kind === 'unit' && !units.has(t.id)) v.push(`fragment_target_invalid: ${f.key} unit ${t.id} not in the slice`);
    if (t.kind === 'row' && !rows.has(t.id)) v.push(`fragment_target_invalid: ${f.key} row ${t.id} not in the slice`);
    if (t.kind === 'external' && !extIds.has(t.id)) v.push(`fragment_target_invalid: ${f.key} external ${t.id} not in external.json or proposed_refs`);
    if (t.kind === 'retired' && !RETIRE_REASONS.includes(t.reason)) v.push(`retire_reason_invalid: ${f.key} reason ${t.reason}`);
    if ((t.kind === 'unit' && units.has(t.id)) || (t.kind === 'row' && rows.has(t.id))) {
      const u = units.get(t.id);
      const hay = squeeze(t.kind === 'unit' ? [...u.context, u.text].join(' ') : rows.get(t.id).verbatim).s;
      // seeded from the page: at least one piece of the claim's own quote lies in the target's text (or the
      // target's whole text lies in one piece, when the quote spans several regulations)
      const pieces = (f.evidence || []).flatMap(piecesOf).map((p) => squeeze(p).s);
      if (!pieces.some((p) => p.length >= 8 && overlaps(p, hay))) v.push(`fragment_evidence_missing: ${f.key} — no piece of the quote is in ${t.id}`);
    }
  }
  for (const id of ids) if (!mapped.has(id)) v.push(`legacy_id_unmapped: ${id}`);
  const unverified = new Set(claims.filter((c) => c.kind === 'unverified').map((c) => c.legacy_id));
  for (const f of doc.fragments || []) {
    if (f.target?.reason === 'unverified_claim' && !unverified.has(f.legacy_id)) v.push(`retire_reason_invalid: ${f.key} unverified_claim on a claim the source does not mark UNVERIFIED`);
    if (unverified.has(f.legacy_id) && f.target?.reason !== 'unverified_claim') v.push(`retire_reason_invalid: ${f.key} UNVERIFIED claim not retired`);
  }
  for (const p of doc.problems || []) if (p.startsWith('decision_unused')) v.push(p);
  for (const a of doc.absence || []) if (!a.holds) v.push(`absence_not_holding: ${a.legacy_id}`);
  for (const k of [...Object.keys(decisions.picks || {}), ...Object.keys(decisions.relocate || {}), ...Object.keys(decisions.retire || {}), ...Object.keys(decisions.external || {})]) {
    if (!ids.has(k.split('@')[0])) v.push(`legacy_id_unknown: decision ${k}`);
  }
  for (const [scope, counts] of Object.entries(doc.references || {})) for (const id of Object.keys(counts)) if (!ids.has(id)) v.push(`legacy_id_unknown: ${scope} references ${id}`);
  v.sort();
  return { checked: (doc.fragments || []).length, pass: v.length === 0, violations: v };
}

// ---------------------------------------------------------------- I/O

/** A spec's text at a pinned git blob (so the map is reproducible after S13 rewrites the spec). */
export function readBlob(root, blob) {
  if (!/^[0-9a-f]{40,64}$/.test(String(blob))) throw new Error(`legacy_source_mismatch: ${blob} is not a git object id`);
  return execFileSync('git', ['cat-file', 'blob', blob], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Load every input from the repo at `root`. */
export function loadInputs(root = ROOT) {
  const decisions = JSON.parse(fs.readFileSync(path.join(root, DECISIONS_REL), 'utf8'));
  const src = decisions.legacy_sources;
  const specs = { spec58: readBlob(root, src.spec58), spec67: readBlob(root, src.spec67), spec78: readBlob(root, src.spec78) };
  const seeds = path.join(root, 'scripts/seeds/bylaw');
  const p = loadSnapshotPages(seeds);
  const slice = sliceSnapshot({ enacting: p.enacting, pages: p.pages, scope: p.scope });
  const pageText = Object.fromEntries(p.pages.map((x) => [x.key, x.normalized]));
  const external = JSON.parse(fs.readFileSync(path.join(seeds, 'external.json'), 'utf8'));
  return { adoption_id: p.adoption_id, decisions, external, pageText, slice, specs };
}

/** Build the map document from loaded inputs. Returns {doc, claims}. */
export function generate(inputs) {
  const claims = parseLegacy(inputs.specs.spec67);
  const built = buildMap({ claims, decisions: inputs.decisions, pageText: inputs.pageText, slice: inputs.slice });
  const references = scanReferences(inputs.specs, new Set(claims.map((c) => c.legacy_id)));
  const doc = assembleMap({ built, claims, decisions: inputs.decisions, references, slicerVersion: inputs.slice.slicer_version });
  return { claims, doc };
}

/** --check: regenerate, validate, compare with the committed JSON + MD. Returns {pass, violations, checked}. */
export function checkFiles(root = ROOT) {
  const inputs = loadInputs(root);
  const { claims, doc } = generate(inputs);
  const r = validateMap({ claims, decisions: inputs.decisions, doc, external: inputs.external, slice: inputs.slice });
  const v = [...r.violations];
  if (inputs.adoption_id !== inputs.decisions.adoption_id) v.push(`legacy_source_mismatch: live adoption ${inputs.adoption_id} ≠ decisions ${inputs.decisions.adoption_id}`);
  const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null);
  v.push(...driftViolations({ doc, json: read(MAP_JSON_REL), md: read(MAP_MD_REL) }));
  v.sort();
  return { checked: r.checked, doc, pass: v.length === 0, violations: v };
}

/** map_drift: the committed JSON / MD text (null = missing) against the regenerated document. PURE. */
export function driftViolations({ doc, json, md }) {
  const v = [];
  if (json !== canonical(doc)) v.push(`map_drift: ${MAP_JSON_REL} differs from the regenerated map`);
  if (md !== renderMap(doc)) v.push(`map_drift: ${MAP_MD_REL} differs from the regenerated render`);
  return v;
}

/** --write: regenerate both files; returns the validation of what was written. */
export function writeFiles(root = ROOT) {
  const inputs = loadInputs(root);
  const { claims, doc } = generate(inputs);
  const r = validateMap({ claims, decisions: inputs.decisions, doc, external: inputs.external, slice: inputs.slice });
  if (!r.pass) return { checked: r.checked, counts: doc.counts, pass: false, violations: ['refused: --write writes only a map with zero violations', ...r.violations] };
  fs.writeFileSync(path.join(root, MAP_JSON_REL), canonical(doc));
  fs.writeFileSync(path.join(root, MAP_MD_REL), renderMap(doc));
  return { checked: r.checked, counts: doc.counts, pass: r.pass, violations: r.violations };
}

// ---------------------------------------------------------------- rendering (PURE)

/** Escape pipes (and newlines) for a Markdown table cell. PURE. */
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
/** Human text for a fragment target. PURE. */
const targetText = (t) => (t.kind === 'retired' ? `retired: \`${t.reason}\`` : t.kind === 'unlocated' ? '**unlocated**' : `${t.kind} \`${t.id}\``);

/** One Markdown table: a header row, a separator row, then `rows` (arrays of already-cell-escaped strings). */
const table = (header, rows) => [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n');

/** The generated docs/reports/mcbylaw-legacy-id-map.md. PURE. */
export function renderMap(doc) {
  const lines = [];
  const blank = () => lines.push('');
  lines.push('# McBylaw legacy-id map (S12, one-time, Spec 69 M-21)');
  blank();
  lines.push(`> GENERATED by \`node scripts/analysis/bylaw/legacy.mjs --write\` from Spec 67 (blob \`${doc.legacy_sources?.spec67}\`), the live slice (${doc.adoption_id}, ${doc.slicer_version}) and \`${DECISIONS_REL}\`. Do not edit. S13 rewrites the legacy ids in Specs 58/67/78 from \`${MAP_JSON_REL}\` (\`rewrite\`); there is no permanent alias field or gate (Spec 68 §6).`);
  blank();

  lines.push('## Counts');
  blank();
  const counts = doc.counts;
  const countRows = [
    ['Legacy claims (C/L/G/A/H)', String(counts.claims)],
    ['Fragments (each maps exactly once)', String(counts.fragments)],
  ];
  for (const [kind, n] of Object.entries(counts.fragments_by_target)) countRows.push([`→ ${kind}`, String(n)]);
  for (const [reason, n] of Object.entries(counts.retired_by_reason)) countRows.push([`retired: \`${reason}\``, String(n)]);
  countRows.push(
    ['Claims wholly retired', String(counts.claims_fully_retired)],
    ['UNVERIFIED C-claims retired (M-21: 12)', String(counts.unverified_claims_retired)],
    ['Fragments relocated (legacy citation wrong; authored)', String(counts.relocated)],
    ['Fragments outside the legacy citation (`uncited`)', String(counts.uncited)],
    ['Open problems', String(counts.problems)],
  );
  lines.push(table(['Measure', 'Value'], countRows.map((r) => [cell(r[0]), cell(r[1])])));
  blank();

  lines.push('## Rewrite table (legacy id → regulation_id)');
  blank();
  const rewriteRows = Object.keys(doc.rewrite).sort(naturalId).map((id) => {
    const ids = doc.rewrite[id];
    const val = ids.length ? ids.map((x) => `\`${x}\``).join(', ') : '— (retired)';
    return [cell(`\`${id}\``), cell(val)];
  });
  lines.push(table(['Legacy id', 'regulation_id(s) / ref'], rewriteRows));
  blank();

  lines.push('## Fragments');
  blank();
  const fragRows = doc.fragments.map((f) => {
    const notes = [
      f.relocated ? 'relocated (authored)' : null,
      f.picked ? 'picked (authored)' : null,
      f.token === 'uncited' ? 'outside the legacy citation' : null,
      f.target.units && f.target.units.length > 0 ? `${f.target.units.length} units` : null,
      f.why || null,
    ].filter(Boolean).join('; ');
    return [cell(`\`${f.key}\``), cell(f.token), cell(targetText(f.target)), cell(notes)];
  });
  lines.push(table(['Fragment', 'Cited as', 'Target', 'Notes'], fragRows));
  blank();

  lines.push('## Absence claims re-derived once (current pinned pages)');
  blank();
  const absRows = doc.absence.map((a) => {
    const probes = a.probes.map((p) => `\`${p.pattern}\`@${p.page}=${p.count} (expect ${p.expect})`).join(', ');
    return [cell(a.legacy_id), cell(a.statement), cell(probes), a.holds ? 'yes' : '**no**'];
  });
  lines.push(table(['Claim', 'Statement', 'Probes (pattern@page = count, expect)', 'Holds'], absRows));
  blank();

  lines.push('## Proposed external.json refs');
  blank();
  const refRows = doc.proposed_refs.map((r) => [cell(r.id), cell(`\`${r.reason}\``), cell(r.citation), cell(r.url)]);
  lines.push(table(['id', 'reason', 'citation', 'url'], refRows));
  blank();

  lines.push('## Legacy-id references S13 rewrites');
  blank();
  const refCountRows = Object.entries(doc.references).map(([scope, counts2]) => {
    const ids = Object.entries(counts2).map(([id, n]) => `${id} (${n})`).join(', ');
    return [cell(scope), cell(ids || '—')];
  });
  lines.push(table(['Scope', 'ids (count)'], refCountRows));
  blank();

  lines.push('## Open problems');
  blank();
  if (doc.problems.length) for (const p of doc.problems) lines.push(`- ${cell(p)}`);
  else lines.push('None.');
  blank();

  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const r = mode === '--write' ? writeFiles() : mode === '--check' ? checkFiles() : null;
  if (!r) {
    console.error('usage: node scripts/analysis/bylaw/legacy.mjs --write | --check');
    process.exitCode = 2;
  } else {
    if (r.counts) console.log(JSON.stringify(r.counts));
    for (const x of r.violations) console.error(x);
    console.log(r.pass ? 'legacy map: PASS' : `legacy map: FAIL (${r.violations.length})`);
    process.exitCode = r.pass ? 0 : 1;
  }
}
