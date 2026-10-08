// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 8 (Render: JSON the single source of truth, MD
//            drift-locked; `docs/reference/bylaw-provisions.{json,md}`), §6 (row fields; table-level `validated_against`
//            = adoption id + generator, vocab and normalizer versions, never a timestamp), §4 (row state closed: complete ·
//            pending · pending:stale · failed), §6.5 + Spec 69 M-52 (feeds per-pair unit counts in the render), §9 G-DRIFT
//            (total sort, LF, no locale APIs, no run timestamp), §12 (a verbatim containing `|`, `#`, `<!--` is escaped);
//            docs/reports/mcbylaw-phase1-plan.md S7 (renderer contract: fixed heading, no Status line, escaping, total sort,
//            LF, atomic writes, row-state counts)
//
// The renderer. PURE except writeFiles() and readCommitted(). The render holds TABLE content only (rows, scope, provenance, row states,
// feeds counts) — never gate states, the clock or a code-file hash — so an unrelated commit can never make it stale;
// the gate states and the five lines are printed by `--check` / `--validate` (validate.mjs), never committed.
//
// Ownership: every field here is generated (slicer, scope rules, manifest, amendments.json). Keyed (⧉) and authored (A)
// fields arrive from `authored/` at A1 (S6 owns that loader); a row renders `drafts: []` until then.

import fs from 'node:fs';
import path from 'node:path';
import { cmpSection, writeAtomic } from './snapshot.mjs';

export const GENERATOR_VERSION = 'bylaw-provisions-v1';
export const JSON_REL = 'docs/reference/bylaw-provisions.json';
export const MD_REL = 'docs/reference/bylaw-provisions.md';
export const MD_HEADING = '# By-law provisions — Toronto Zoning By-law 569-2013 (generated — do not edit)';
export const ROW_STATES = Object.freeze(['complete', 'pending', 'pending:stale', 'failed']);
/** Columns of a per-page row table in the MD (the escaping test counts them). */
export const MD_ROW_COLUMNS = 6;

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Markdown-cell escaping: backslash, pipe, backtick, &, <, > and every line break (CR, LF, U+0085, U+2028, U+2029), so
 * `<!--` cannot open a comment and `|` cannot split a cell; `#` needs no escape inside a cell (it is a heading only at
 * the start of a line, and a cell never starts one). PURE.
 */
export function escapeMd(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\r?\n|[\r\u0085\u2028\u2029]/g, ' ');
}

/** Pages in section order (cmpSection), key as the tie-break. Nested arrays (clauses, literals, tags, refs) keep the
 * slicer's document order, which is a function of the page text alone. */
const cmpPage = (a, b) => cmpSection(a.section ?? '', b.section ?? '') || cmpStr(a.key, b.key);

/**
 * The table document from the generated inputs. `rowStatus` = {regulation_id: state} for in-scope rows; `feeds` =
 * {checked, counts{"structure/aspect": n}} over agreed units. Deterministic: any input order gives the same document.
 */
export function buildTable({ slice, scoped, manifest, amendments, vocab, rowStatus = {}, feeds = { checked: 0, counts: {} } }) {
  const sectionPages = (manifest.pages || []).filter((p) => p.role === 'section').sort(cmpPage);
  const pageOrder = new Map(sectionPages.map((p, i) => [p.key, i]));
  const scope = new Map((scoped || []).map((s) => [s.regulation_id, s]));
  const clauseStart = new Map((slice.rows || []).flatMap((r) => (r.clauses || []).map((c) => [`${r.regulation_id}#${c.path}`, c.start])));
  const unitsByRow = new Map();
  const byDoc = (a, b) => (clauseStart.get(a.unit_id) ?? 1e9) - (clauseStart.get(b.unit_id) ?? 1e9) || cmpStr(a.unit_id, b.unit_id);
  for (const u of [...(slice.units || [])].sort(byDoc)) {
    if (!unitsByRow.has(u.regulation_id)) unitsByRow.set(u.regulation_id, []);
    unitsByRow.get(u.regulation_id).push({ clause_path: u.clause_path, sha256: u.sha256, unit_id: u.unit_id });
  }
  const rowIds = new Set((slice.rows || []).map((r) => r.regulation_id));
  const orphanUnits = [...unitsByRow.keys()].filter((id) => !rowIds.has(id));
  if (orphanUnits.length) throw new Error(`render: ${orphanUnits.length} clause unit group(s) name no row (e.g. ${orphanUnits[0]})`);
  const rows = [...(slice.rows || [])]
    .sort((a, b) => (pageOrder.get(a.page) ?? 1e9) - (pageOrder.get(b.page) ?? 1e9) || cmpStr(a.page, b.page) || a.start - b.start || cmpStr(a.regulation_id, b.regulation_id))
    .map((r) => {
      if (!pageOrder.has(r.page)) throw new Error(`render: row ${r.regulation_id} is on ${r.page}, which is not a pinned section page`);
      const s = scope.get(r.regulation_id) || { scope: 'unscoped', reason: null, rule_id: null, ruling: null };
      const inScope = s.scope === 'in_scope';
      const state = inScope ? rowStatus[r.regulation_id] ?? 'pending' : null;
      if (state !== null && !ROW_STATES.includes(state)) throw new Error(`render: row ${r.regulation_id} has row_status ${state} outside ${ROW_STATES.join(' · ')}`);
      const out = {
        amendments: (r.tags || []).flatMap((t) => (t.entries || []).map((e) => ({ bylaw: e.bylaw, clause_path: t.clause_path ?? null, qualifier: e.qualifier ?? null }))),
        article: r.article,
        article_title: r.article_title ?? null,
        clauses: (r.clauses || []).map((c) => ({ end: c.end, leaf: c.leaf === true, path: c.path, start: c.start })),
        defects: (r.defects || []).map((d) => ({ clause_path: d.clause_path ?? null, kind: d.kind })),
        drafts: [],
        kind: r.kind,
        numeric_literals: (r.literals || []).map((l) => ({ clause_path: l.clause_path ?? null, raw: l.raw, unit: l.unit ?? null, value: l.value ?? null })),
        page: r.page,
        refs: (r.refs || []).map((x) => ({ citation: x.citation, clause_path: x.clause_path ?? null, via: x.via ?? null })),
        regulation_id: r.regulation_id,
        retired: r.retired === true,
        row_status: state,
        out_of_scope_reason: s.reason ?? null,
        scope: s.scope,
        scope_rule_id: s.rule_id ?? null,
        scope_ruling: s.ruling ?? null,
        section: r.section,
        sha256: r.sha256,
        units: unitsByRow.get(r.regulation_id) || [],
        term: r.term ?? null,
        verbatim: r.verbatim,
      };
      return out;
    });
  const pages = {};
  for (const p of sectionPages) {
    pages[p.key] = {
      consolidation: p.consolidation ?? null,
      fetch_id: p.fetch_id ?? null,
      normalized_sha256: p.normalized_sha256 ?? null,
      raw_sha256: p.raw_sha256 ?? null,
      section: p.section,
      status: p.status ?? 'live',
      url: p.url,
    };
  }
  const states = Object.fromEntries(ROW_STATES.map((k) => [k, 0]));
  let inScope = 0;
  let out = 0;
  let awaiting = 0;
  let unscoped = 0;
  for (const r of rows) {
    if (r.scope === 'in_scope') {
      inScope++;
      states[r.row_status]++;
    } else if (r.scope === 'out_of_scope') out++;
    else if (r.scope === 'awaiting_ruling') awaiting++;
    else unscoped++;
  }
  const statuses = (amendments && amendments.statuses) || {};
  return {
    amendment_statuses: Object.fromEntries(Object.keys(statuses).sort().map((b) => [b, (statuses[b] && statuses[b].status) || 'not_verified'])),
    counts: { awaiting_ruling: awaiting, disclosed_defects: rows.reduce((n, r) => n + r.defects.length, 0), in_scope: inScope, out_of_scope: out, row_states: states, rows: rows.length, unscoped, units: rows.reduce((n, r) => n + r.units.length, 0) },
    feeds: { checked: feeds.checked || 0, counts: Object.fromEntries(Object.keys(feeds.counts || {}).sort().map((k) => [k, feeds.counts[k]])) },
    pages,
    rows,
    validated_against: {
      adoption_id: manifest.adoption_id,
      generator_version: GENERATOR_VERSION,
      normalizer_version: manifest.normalizer_version,
      slicer_version: slice.slicer_version,
      vocab_version: (vocab && vocab.version) || null,
    },
  };
}

/** Recursively sorted-key copy (arrays keep their order). PURE. */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/**
 * Canonical JSON: sorted keys everywhere; the top level one key per line; `rows` one row per line (a re-key diff is
 * one line per row); LF; one trailing newline. PURE; renderJson(JSON.parse(x)) === x.
 */
export function renderJson(doc) {
  const d = sortKeys(doc);
  const parts = [];
  for (const k of Object.keys(d)) {
    if (k === 'rows' && !Array.isArray(d.rows)) throw new Error('renderJson: rows is not an array');
    if (k === 'rows') parts.push(`  "rows": [${d.rows.length ? `\n${d.rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ` : ''}]`);
    else parts.push(`  ${JSON.stringify(k)}: ${JSON.stringify(d[k] ?? null)}`);
  }
  return `{\n${parts.join(',\n')}\n}\n`;
}

/** Each amending by-law with its status (a status other than in_force is the P-1 notice), qualifier and clause. */
const amendCell = (r, statuses) => (r.amendments.length ? r.amendments.map((a) => `${a.bylaw} [${statuses[a.bylaw] ?? 'not_verified'}]${a.qualifier ? ` (${a.qualifier})` : ''}${a.clause_path ? ` @${a.clause_path}` : ''}`).join('; ') : 'none');
const scopeCell = (r) => (r.scope === 'in_scope' ? 'in' : `${r.scope === 'out_of_scope' ? 'out' : r.scope}: ${r.out_of_scope_reason ?? '—'}`);

/** The human render. Fixed heading on line 1, no Status line, escaped cells, LF, one trailing newline. PURE. */
export function renderMarkdown(doc) {
  const L = [];
  const v = doc.validated_against;
  const c = doc.counts;
  const s = c.row_states;
  L.push(MD_HEADING);
  L.push('');
  L.push('> Generated by `node scripts/generate-bylaw-provisions.mjs --write` (Spec 68 §10 stage 8). `bylaw-provisions.json` is the');
  L.push('> single source of truth; this file is its drift-locked render (G-DRIFT: `--check` regenerates both in memory and');
  L.push('> byte-compares). Gate states and the five lines are printed by `--check` / `--validate`, never stored here.');
  L.push('> A `pending` row is not yet authored: never quote it to a buyer as authoritative (Spec 69 P-1).');
  L.push('');
  L.push(`- validated_against: ${v.adoption_id} · generator ${v.generator_version} · slicer ${v.slicer_version} · normalizer ${v.normalizer_version} · vocab ${v.vocab_version ?? '—'}`);
  L.push(`- rows ${c.rows} · in scope ${c.in_scope} · out of scope ${c.out_of_scope} · awaiting a ruling ${c.awaiting_ruling} · unscoped ${c.unscoped} · clause units ${c.units} · source defects disclosed ${c.disclosed_defects}`);
  L.push(`- row states (in scope): complete ${s.complete} · pending ${s.pending} (stale ${s['pending:stale']}) · failed ${s.failed}`);
  const pairs = Object.entries(doc.feeds.counts);
  L.push(`- feeds (Spec 69 M-52), over ${doc.feeds.checked} agreed LIMIT/PERMIT/PROHIBIT unit(s): ${pairs.length ? pairs.map(([k, n]) => `${k} ${n}`).join(' · ') : 'none yet'}`);
  const st = {};
  for (const x of Object.values(doc.amendment_statuses)) st[x] = (st[x] || 0) + 1;
  L.push(`- amending by-laws ${Object.keys(doc.amendment_statuses).length}: ${Object.keys(st).sort().map((k) => `${k} ${st[k]}`).join(' · ') || 'none'} (each row lists its by-laws with their status; a status other than in_force is a notice, Spec 69 P-1, and never changes a row's state)`);
  L.push('');
  L.push('## Pages');
  L.push('');
  L.push('| Page | Section | Status | Consolidation (version · amendments to) | Rows | In scope |');
  L.push('|---|---|---|---|---|---|');
  const byPage = new Map();
  for (const r of doc.rows) {
    if (!byPage.has(r.page)) byPage.set(r.page, []);
    byPage.get(r.page).push(r);
  }
  const pageKeys = Object.keys(doc.pages).sort((a, b) => cmpPage({ key: a, section: doc.pages[a].section }, { key: b, section: doc.pages[b].section }));
  for (const k of pageKeys) {
    const p = doc.pages[k];
    const rs = byPage.get(k) || [];
    const cons = p.consolidation ? `${p.consolidation.version_date ?? '—'} · ${p.consolidation.amendments_up_to ?? '—'}` : '—';
    L.push(`| ${escapeMd(k)} | ${escapeMd(p.section)} | ${escapeMd(p.status)} | ${escapeMd(cons)} | ${rs.length} | ${rs.filter((r) => r.scope === 'in_scope').length} |`);
  }
  for (const k of pageKeys) {
    const rs = byPage.get(k) || [];
    if (!rs.length) continue;
    const p = doc.pages[k];
    L.push('');
    L.push(`## ${escapeMd(p.section)} (${escapeMd(k)})`);
    L.push('');
    L.push(`Source: ${escapeMd(p.url)} · normalized sha256 \`${String(p.normalized_sha256).slice(0, 16)}\` · fetch ${escapeMd(p.fetch_id ?? '—')}`);
    L.push('');
    L.push('| Regulation | Scope | Row status | Units | Amendments | Text |');
    L.push('|---|---|---|---|---|---|');
    for (const r of rs) {
      L.push(`| ${escapeMd(r.regulation_id)} | ${escapeMd(scopeCell(r))} | ${escapeMd(r.row_status ?? '—')} | ${r.units.length} | ${escapeMd(amendCell(r, doc.amendment_statuses))} | ${escapeMd(r.verbatim)} |`);
    }
  }
  return `${L.join('\n')}\n`;
}

/** Both renders, keyed by repo-relative path. PURE. */
export function renderAll(doc) {
  return { [JSON_REL]: renderJson(doc), [MD_REL]: renderMarkdown(doc) };
}

/** Atomic writes (tmp + rename per file, Spec 68 §6.4 rule 10) of {relPath: text} under root. */
export function writeFiles(root, files) {
  for (const rel of Object.keys(files).sort()) writeAtomic(path.join(root, rel), files[rel]);
}

/** Committed text of each render path (null when absent). I/O. */
export function readCommitted(root, rels) {
  return Object.fromEntries(rels.map((rel) => {
    const f = path.join(root, rel);
    return [rel, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null];
  }));
}
