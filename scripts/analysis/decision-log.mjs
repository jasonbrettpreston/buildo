#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HK (operator decision logs and their register
//            rows); R-DF (RECORDED); R-DJ (1) (every generator --check runs at pre-commit)
//
// OPERATOR DECISION LOGS → REGISTER ROWS. The operator rules on review pages (exported as one JSON document per
// question) and in chat. Each set of rulings is committed verbatim as a decision log,
// `docs/reports/decisions/<yyyy-mm-dd>-<slug>.json`, and every approved decision must be recorded as a register row
// that cites it, so no ruling is lost when it is transferred (operator 2026-10-20: "Ensure you used a generator to
// transfer the rulings etc or you will have forgoteen some").
//
// Citation form, anywhere in a spec line: `<log stem>#<decision id>`, e.g. `2026-10-20-scenario-build-rulings#R-4`.
// The stem names the log file, the id names the decision in it. A register row is a markdown table row whose first
// cell is a register id (`| R-GY |`, `| **M-230** |`, `| **LC-60** |`).
//
// Modes (exactly one; there is no default mode and no default write; an unknown flag exits 2):
//   --check   file-only, writes nothing. RED (exit 1) when an approved decision has no citing register row; a
//             citation names a log or a decision id that does not exist; a routed decision has no row with its
//             routed id in its routed register; a log is malformed. Exit 2 on unreadable input or bad usage.
//   --write   emits a register-row skeleton for every approved decision that no register row cites yet, grouped by
//             the routed register, to stdout, or to the file named by --out. Writes no spec: a skeleton is filled in
//             (rule text, conflict check, seven questions) and pasted by a person, and --check then proves coverage.
//   --import <one source> --out <log.json>   builds a log from a raw record committed under
//             docs/reports/decisions/raw/<stem>/, copying question and recommendation verbatim and keeping an existing
//             log's lane-added fields (`decision_vocab`, `routing`, `amendments`, `options`). The sources:
//             --answers <dir> --entries <file> --url <url> --title <text>   a review-page export: <dir>/*.json are the
//                 page's decision documents ({ref, decision, updated_at}), <file> its entries ({ref, key, note, …});
//             --page-rows <file> --url <url> --title <text>   a review page's rows export {source, rows [{id, question,
//                 recommendation, answer {choice, decided_at, note} | null, answered_via}]} (an unanswered row is listed
//                 in the log's `unanswered`, not a decision);
//             --chat <file>   a chat record {source (with its date), operator_quote, decisions [{id, subject|question,
//                 recommendation, decision, operator_quote? | quote_ref? (names another quote key in the record),
//                 decided_at?}]};
//             --rulings-md <file> --quote <text> --decided-at <date>   a rulings memo whose "## Spec N: …" sections
//                 each carry a "**Recommendation.**" block and whose "Summary of asks" table has a "| N |" row.
//
// --check also re-derives every log from its committed raw record (`source.raw`) and is RED when a log has no raw
// record or differs from it (a hand-edited log), when an amended decision's routed row does not carry the
// amendment's operator quote, and when a register row in another register cites a routed decision. A routing entry
// may say `owed` (the routed row belongs to another lane and has not landed); it needs no row, and it is RED once
// the row exists and `owed` is still there.
//
// A log: { log_id (= file stem), source {kind: page|chat, url | operator_quote, raw}, decision_vocab {value: approve |
// amend | reject | defer | no_ruling}, decisions [{id, question, recommendation, decision, decided_at}], routing {id:
// {register, row, owed?} | {register, rests_on: [register id]} (no_ruling, R-DV-1)}, amendments {id: {text, operator_quote, decided_at, source}}, options {id: text} }. An amendment turns
// an approval into `amend`; its routed row must carry the amendment's operator quote.
//
// Deterministic: sorted output, LF, no clock, no DB, no network. BUILDO_DECISION_LOG_ROOT (absolute) points every
// mode at another tree (tests use a fixture tree).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const LOG_DIR_REL = 'docs/reports/decisions';
export const SPEC_ROOT_REL = 'docs/specs';
/** What a log's decision value means. Only `approve` and `amend` (approved with a change) need a register row. */
// R-DV-1 (operator 2026-10-20, `2026-10-20-bylaw-fix-rulings#R-DV-1`): `no_ruling` records that an existing ruling already
// decides the question. It needs no new register row; its routing names the register row(s) it rests on
// (`routing.<id>.rests_on`), and --check is RED when one of them is not a register row in the routed register.
export const MEANINGS = Object.freeze(['approve', 'amend', 'reject', 'defer', 'no_ruling']);
const NEEDS_ROW = new Set(['approve', 'amend']);
const STEM_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_RE = /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/;
// A citation: a dated stem, '#', a decision id. The id stops before punctuation that ends a sentence.
const CITATION_RE = /\b(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)#([A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)/g;
// A register row: a table row whose first cell is a register id, bold or not.
export const REGISTER_ROW_RE = /^\|\s*\*{0,2}([A-Z]{1,4}-[A-Z0-9]+(?:\.[0-9]+)?)\*{0,2}\s*\|/;

export const MODES = Object.freeze(['--check', '--write', '--import']);
const VALUE_FLAGS = Object.freeze({
  '--check': [],
  '--write': ['--out'],
  '--import': ['--answers', '--entries', '--url', '--title', '--chat', '--rulings-md', '--quote', '--decided-at', '--page-rows', '--out'],
});
const REQUIRED_VALUES = Object.freeze({ '--check': [], '--write': [], '--import': ['--out'] });
/** The --import sources: exactly one, each with the flags it needs. */
const IMPORT_SOURCES = Object.freeze({
  page: ['--answers', '--entries', '--url', '--title'],
  'page-rows': ['--page-rows', '--url', '--title'],
  chat: ['--chat'],
  'rulings-md': ['--rulings-md', '--quote', '--decided-at'],
});

/**
 * Parse argv. PURE. Returns {mode, values} or {error}. Exactly one mode; every other token is a value flag that the
 * mode accepts, followed by its value; anything else is an error (exit 2), so a typo never falls through to a write.
 */
export function parseArgs(argv) {
  const modes = argv.filter((a) => MODES.includes(a));
  if (modes.length !== 1) return { error: `exactly one mode is required (${MODES.join(' | ')}); got ${modes.length ? modes.join(' ') : 'none'}` };
  const mode = modes[0];
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === mode) continue;
    if (!VALUE_FLAGS[mode].includes(a)) return { error: `unknown flag for ${mode}: ${a}` };
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
    if (a in values) return { error: `${a} given twice` };
    values[a] = v;
    i += 1;
  }
  if (mode === '--import') {
    const given = Object.entries(IMPORT_SOURCES).filter(([, fl]) => fl[0] in values);
    const usage = Object.values(IMPORT_SOURCES).map((fl) => fl.join(' ')).join(' | ');
    if (given.length !== 1) return { error: `--import needs exactly one source (${usage})` };
    const [form, fl] = given[0];
    for (const x of fl) if (!(x in values)) return { error: `--import (${form}) needs ${x}` };
    for (const x of new Set(Object.values(IMPORT_SOURCES).flat())) if (x in values && !fl.includes(x)) return { error: `--import (${form}) does not take ${x}` };
  }
  for (const f of REQUIRED_VALUES[mode]) if (!(f in values)) return { error: `${mode} needs ${f}` };
  return { mode, values };
}

/** Validate one parsed log; returns problems (strings). PURE. */
export function validateLog(stem, log) {
  const p = [];
  if (!STEM_RE.test(stem)) p.push(`${stem}: file name is not <yyyy-mm-dd>-<slug>.json`);
  if (!log || typeof log !== 'object' || Array.isArray(log)) return [...p, `${stem}: not a JSON object`];
  if (log.log_id !== stem) p.push(`${stem}: log_id "${log.log_id}" differs from the file name`);
  const src = log.source || {};
  if (!['page', 'chat'].includes(src.kind)) p.push(`${stem}: source.kind must be page or chat`);
  if (src.kind === 'page' && !/^https:\/\//.test(src.url || '')) p.push(`${stem}: a page source needs its url`);
  if (src.kind === 'chat' && !String(src.operator_quote || '').trim()) p.push(`${stem}: a chat source needs the operator's quote`);
  const vocab = log.decision_vocab || {};
  if (Object.keys(vocab).length === 0) p.push(`${stem}: decision_vocab is empty`);
  for (const [k, v] of Object.entries(vocab)) if (!MEANINGS.includes(v)) p.push(`${stem}: decision_vocab.${k} = "${v}" is not one of ${MEANINGS.join(' / ')}`);
  if (!Array.isArray(log.decisions) || log.decisions.length === 0) return [...p, `${stem}: no decisions[]`];
  const seen = new Set();
  for (const d of log.decisions) {
    const id = d && d.id;
    if (!id || !ID_RE.test(id)) { p.push(`${stem}: a decision has no usable id`); continue; }
    if (seen.has(id)) p.push(`${stem}#${id}: duplicate id`);
    seen.add(id);
    for (const f of ['question', 'recommendation', 'decision', 'decided_at']) if (!(typeof d[f] === 'string' && d[f].trim())) p.push(`${stem}#${id}: missing ${f}`);
    if (d.decision && !(d.decision in vocab)) p.push(`${stem}#${id}: decision "${d.decision}" is not in decision_vocab`);
  }
  for (const [id, r] of Object.entries(log.routing || {})) {
    if (!seen.has(id)) p.push(`${stem}: routing names unknown decision ${id}`);
    if (!r || typeof r.register !== 'string' || !r.register.endsWith('.md')) p.push(`${stem}: routing.${id}.register must be a spec path`);
    if (r && r.row !== undefined && !(typeof r.row === 'string' && REGISTER_ROW_RE.test(`| ${r.row} |`))) p.push(`${stem}: routing.${id}.row "${r && r.row}" is not a register id`);
    if (r && r.owed !== undefined && !(typeof r.owed === 'string' && r.owed.trim() && r.row)) p.push(`${stem}: routing.${id}.owed needs the owing lane and a routed row`);
    if (r && r.rests_on !== undefined) {
      if (!Array.isArray(r.rests_on) || r.rests_on.length === 0) p.push(`${stem}: routing.${id}.rests_on must be a non-empty list of register ids`);
      else for (const x of r.rests_on) if (!(typeof x === 'string' && REGISTER_ROW_RE.test(`| ${x} |`))) p.push(`${stem}: routing.${id}.rests_on "${x}" is not a register id`);
    }
  }
  for (const d of log.decisions) {
    if (!d || !seen.has(d.id) || vocab[d.decision] !== 'no_ruling') continue;
    const r = (log.routing || {})[d.id];
    if (!r || r.rests_on === undefined) p.push(`${stem}#${d.id}: a no_ruling decision needs routing.${d.id}.rests_on (the register row it rests on)`);
  }
  for (const id of Object.keys(log.options || {})) if (!seen.has(id)) p.push(`${stem}: options names unknown decision ${id}`);
  for (const [id, a] of Object.entries(log.amendments || {})) {
    if (!seen.has(id)) p.push(`${stem}: amendments names unknown decision ${id}`);
    if (!a || !String(a.text || '').trim() || !String(a.operator_quote || '').trim() || !String(a.decided_at || '').trim()) p.push(`${stem}: amendments.${id} needs text, operator_quote and decided_at`);
  }
  return p;
}

/** The meaning of a decision (approve / amend / reject / defer); an amendment upgrades approve to amend. PURE. */
export function meaningOf(log, d) {
  const m = (log.decision_vocab || {})[d.decision];
  return m === 'approve' && (log.amendments || {})[d.id] ? 'amend' : m;
}

/** Every citation in a set of spec texts. PURE. `specs` = [{rel, text}]. */
export function collectCitations(specs) {
  const out = [];
  for (const { rel, text } of specs) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, i) => {
      const row = REGISTER_ROW_RE.exec(line);
      for (const m of line.matchAll(CITATION_RE)) out.push({ rel, line: i + 1, stem: m[1], id: m[2], row_id: row ? row[1] : null });
    });
  }
  return out;
}

/**
 * Re-derive a log's decisions from its committed raw record and name every difference. PURE given `io`
 * ({read(rel) → text | null, list(rel) → names | null}). Returns problems (strings).
 */
export function rawProblems(stem, log, io) {
  const raw = (log.source || {}).raw;
  if (!raw || !raw.form) return [`${stem}: no committed raw export (source.raw) — import the log from a raw record under ${LOG_DIR_REL}/raw/`];
  let rebuilt;
  let fileOf;
  try {
    if (raw.form === 'page') {
      const names = io.list(raw.answers);
      const entriesText = io.read(raw.entries);
      if (!names || entriesText === null) return [`${stem}: raw export missing (${raw.answers}, ${raw.entries})`];
      const answers = names.filter((n) => n.endsWith('.json')).sort().map((n) => JSON.parse(io.read(`${raw.answers}/${n}`)));
      rebuilt = importPageExport({ stem, title: log.source.title, url: log.source.url, answers, entries: JSON.parse(entriesText), answersRel: raw.answers, entriesRel: raw.entries, previous: log });
      fileOf = (field) => (['question', 'recommendation', 'group', 'evidence'].includes(field) ? raw.entries : raw.answers);
    } else if (raw.form === 'chat') {
      const text = io.read(raw.file);
      if (text === null) return [`${stem}: raw export missing (${raw.file})`];
      rebuilt = importChat({ stem, raw: JSON.parse(text), rawRel: raw.file, previous: log });
      fileOf = () => raw.file;
    } else if (raw.form === 'page-rows') {
      const text = io.read(raw.file);
      if (text === null) return [`${stem}: raw export missing (${raw.file})`];
      rebuilt = importPageRows({ stem, title: log.source.title, url: log.source.url, raw: JSON.parse(text), rawRel: raw.file, previous: log });
      fileOf = () => raw.file;
    } else if (raw.form === 'rulings-md') {
      const text = io.read(raw.file);
      if (text === null) return [`${stem}: raw export missing (${raw.file})`];
      rebuilt = importRulingsMd({ stem, text, rawRel: raw.file, quote: log.source.operator_quote, decidedAt: raw.decided_at, previous: log });
      fileOf = () => raw.file;
    } else return [`${stem}: source.raw.form "${raw.form}" is not page / page-rows / chat / rulings-md`];
  } catch (err) {
    return [`${stem}: raw export does not import (${err.message})`];
  }
  const p = [];
  const ids = (l) => (l.decisions || []).map((d) => d.id).join(',');
  if (ids(rebuilt) !== ids(log)) return [`${stem}: decision ids [${ids(log)}] differ from the committed raw export [${ids(rebuilt)}] — re-import, never hand-edit`];
  rebuilt.decisions.forEach((r, i) => {
    const d = log.decisions[i];
    for (const field of Object.keys(r)) {
      if (JSON.stringify(r[field]) !== JSON.stringify(d[field])) {
        p.push(`${stem}#${d.id}: ${field} differs from the committed raw export (${fileOf(field)}) — re-import, never hand-edit`);
        break;
      }
    }
  });
  if (JSON.stringify(rebuilt.unanswered) !== JSON.stringify(log.unanswered)) p.push(`${stem}: unanswered differs from the committed raw export — re-import, never hand-edit`);
  for (const k of ['kind', 'url', 'title', 'operator_quote']) {
    if (rebuilt.source[k] !== undefined && rebuilt.source[k] !== log.source[k]) p.push(`${stem}: source.${k} differs from the committed raw export — re-import, never hand-edit`);
  }
  return p;
}

/**
 * The check. PURE over its inputs: `logs` = [{stem, log}], `specs` = [{rel, text}]; `opts.io` (see rawProblems)
 * turns on the raw-export arm, which the CLI always runs.
 * Returns {problems, missing: [{stem, id, log, d}], citations, decisions, rows, owed}; `missing` feeds --write.
 */
export function checkDecisionLogs(logs, specs, opts = {}) {
  const problems = [];
  const byStem = new Map();
  for (const { stem, log } of logs) {
    const v = validateLog(stem, log);
    problems.push(...v);
    byStem.set(stem, log);
    if (opts.io && v.length === 0) problems.push(...rawProblems(stem, log, opts.io));
  }
  const cites = collectCitations(specs);
  for (const c of cites) {
    const log = byStem.get(c.stem);
    if (!log) { problems.push(`${c.rel}:${c.line}: cites ${c.stem}#${c.id}, but there is no decision log ${LOG_DIR_REL}/${c.stem}.json`); continue; }
    if (!(log.decisions || []).some((d) => d && d.id === c.id)) problems.push(`${c.rel}:${c.line}: cites ${c.stem}#${c.id}, which is not a decision in that log`);
  }
  const lineText = new Map(specs.map((s) => [s.rel, String(s.text).replace(/\r\n/g, '\n').split('\n')]));
  const missing = [];
  let decisions = 0;
  let owed = 0;
  let noRuling = 0;
  const rowIdsIn = new Map();
  for (const s of specs) {
    const ids = new Set();
    for (const line of (lineText.get(s.rel) || [])) { const m = REGISTER_ROW_RE.exec(line); if (m) ids.add(m[1]); }
    rowIdsIn.set(s.rel, ids);
  }
  const rowKeys = new Set();
  for (const { stem, log } of logs) {
    for (const d of log.decisions || []) {
      if (!d || !d.id) continue;
      decisions += 1;
      const meaning = meaningOf(log, d);
      if (meaning === 'no_ruling') {
        noRuling += 1;
        const route = (log.routing || {})[d.id] || {};
        for (const x of route.rests_on || []) if (!(rowIdsIn.get(route.register) || new Set()).has(x)) problems.push(`${stem}#${d.id}: no_ruling rests on ${x}, which is not a register row in ${route.register}`);
        continue;
      }
      if (!NEEDS_ROW.has(meaning)) continue;
      const rows = cites.filter((c) => c.stem === stem && c.id === d.id && c.row_id);
      for (const c of rows) rowKeys.add(`${c.rel}|${c.row_id}`);
      const route = (log.routing || {})[d.id] || {};
      if (route.owed) {
        if (rows.some((c) => c.rel === route.register && c.row_id === route.row)) problems.push(`${stem}#${d.id}: routed row ${route.row} now exists, but the routing still says owed by ${route.owed} — drop "owed"`);
        else { owed += 1; continue; }
      }
      if (rows.length === 0) {
        problems.push(`${stem}#${d.id}: approved ${String(d.decided_at || '').slice(0, 10)}, but no register row cites it`);
        missing.push({ stem, id: d.id, log, d });
        continue;
      }
      let routedRows = rows;
      if (route.register) {
        const inRegister = rows.filter((c) => c.rel === route.register);
        if (inRegister.length === 0) {
          problems.push(`${stem}#${d.id}: routed to ${route.register}, but its register rows are in ${[...new Set(rows.map((c) => c.rel))].join(', ')}`);
          continue;
        }
        for (const c of rows) if (c.rel !== route.register) problems.push(`${stem}#${d.id}: routed to ${route.register}, but register row ${c.row_id} in ${c.rel} also cites it`);
        if (route.row && !inRegister.some((c) => c.row_id === route.row)) {
          problems.push(`${stem}#${d.id}: routed to row ${route.row} in ${route.register}, but the citing rows there are ${[...new Set(inRegister.map((c) => c.row_id))].join(', ')}`);
          continue;
        }
        routedRows = route.row ? inRegister.filter((c) => c.row_id === route.row) : inRegister;
      }
      if (meaning === 'amend') {
        const a = log.amendments[d.id];
        const carries = routedRows.some((c) => (lineText.get(c.rel) || [])[c.line - 1].includes(a.operator_quote));
        if (!carries) {
          const r0 = routedRows[0];
          problems.push(`${stem}#${d.id}: amended ${a.decided_at}, but its row ${r0.row_id} in ${r0.rel} does not carry the amendment quote "${a.operator_quote}"`);
        }
      }
    }
  }
  return { problems, missing, citations: cites.length, decisions, rows: rowKeys.size, owed, no_ruling: noRuling };
}

/** One table cell: line breaks become spaces and a literal pipe is escaped, so a skeleton row stays one row. PURE. */
export function cell(text) {
  return String(text).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

/** Register-row skeletons for the missing decisions, grouped by routed register. PURE. */
export function skeletons(missing) {
  const groups = new Map();
  for (const m of missing) {
    const reg = ((m.log.routing || {})[m.id] || {}).register || '(unrouted: choose the register by subject)';
    if (!groups.has(reg)) groups.set(reg, []);
    groups.get(reg).push(m);
  }
  const L = [];
  for (const [reg, ms] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    L.push(`## ${reg}`, '');
    for (const { stem, id, log, d } of ms) {
      const route = (log.routing || {})[id] || {};
      const src = log.source.kind === 'page' ? `${log.source.title || 'review page'}, ${log.source.url}` : `chat: "${d.operator_quote || log.source.operator_quote}"`;
      const amend = (log.amendments || {})[id];
      const verb = meaningOf(log, d) === 'amend' ? 'approved, then amended' : 'approved';
      const amendText = amend ? ` Amended ${amend.decided_at} (${amend.source || 'chat'}: "${amend.operator_quote}"): ${amend.text}` : '';
      L.push(`| ${route.row || '<NEXT-ID>'} | **${cell(d.question)}** Operator ${verb} ${String(d.decided_at).slice(0, 10)} (${cell(src)}; \`${stem}#${id}\`). Approved: ${cell(d.recommendation)}${cell(amendText)} <RULE TEXT> | <SOURCE / AMENDS> | <LOCK> | <STATUS> |`);
    }
    L.push('');
  }
  return L.join('\n');
}

const LANE_COMMENT = '`decision_vocab`, `routing` (the register and row that record each decision), `amendments` and `options` are added by the lane and are not the operator\'s text; everything else is re-derived from `source.raw` by `--check`.';
/** The lane-added fields an import keeps from an existing log. PURE. */
function laneFields(previous, defaultVocab) {
  const out = {
    decision_vocab: (previous && previous.decision_vocab) || defaultVocab,
    routing: (previous && previous.routing) || {},
    amendments: (previous && previous.amendments) || {},
  };
  if (previous && previous.options && Object.keys(previous.options).length) out.options = previous.options;
  return out;
}
/** The default vocabulary for raw decision values: the approval words seen in the operator's pages and chat. */
function vocabFor(values) {
  const v = {};
  for (const x of values) {
    if (!['approve', 'y', 'keep'].includes(x)) throw new Error(`decision value "${x}" has no default meaning; declare decision_vocab in the existing log`);
    v[x] = 'approve';
  }
  return v;
}

/** Build a log from a review-page export. PURE over its inputs. */
export function importPageExport({ stem, title, url, answers, entries, answersRel, entriesRel, previous }) {
  const byRef = new Map(entries.map((e) => [e.ref, e]));
  const decisions = answers
    .map((a) => {
      const e = byRef.get(a.ref);
      if (!e) throw new Error(`decision ${a.ref} has no entry in the page's entries`);
      return {
        id: a.ref,
        group: e.step || null,
        question: e.key,
        recommendation: e.note,
        evidence: (e.evidence || []).map((x) => ({ label: x.file, quote: x.quote })),
        decision: a.decision,
        decided_at: a.updated_at,
        source_url: url,
      };
    })
    .sort((a, b) => idCompare(a.id, b.id));
  for (const e of entries) if (!decisions.some((d) => d.id === e.ref)) throw new Error(`entry ${e.ref} has no exported decision (the page export is incomplete)`);
  return {
    $comment: `Operator decision log (scripts/analysis/decision-log.mjs; Spec 124 R-HK). Question, recommendation and decision are the review page export, verbatim. ${LANE_COMMENT}`,
    log_id: stem,
    source: { kind: 'page', title, url, raw: { form: 'page', answers: answersRel, entries: entriesRel } },
    ...laneFields(previous, { keep: 'approve' }),
    decisions,
  };
}

/**
 * The citation id of a chat record's decision id. A record id that is already a usable id (ID_RE) is kept; one that is
 * not (batch G, 2026-10-21: "CHAT-29/F-SC-1", "CHAT-29/Front yard accuracy") is derived mechanically — each "/" becomes
 * ".", each run of spaces "-" — and the record's own id is kept verbatim as the decision's `raw_id`, so the transfer
 * stays mechanical and no id is hand-typed (Spec 124 R-HK). PURE.
 */
export function citationId(rawId) {
  const s = String(rawId == null ? '' : rawId);
  if (ID_RE.test(s)) return s;
  return s.trim().replace(/\s*\/\s*/g, '.').replace(/\s+/g, '-');
}

/** Build a log from a committed chat record. PURE over its inputs. */
export function importChat({ stem, raw, rawRel, previous }) {
  const date = raw.decided_at || (/\d{4}-\d{2}-\d{2}/.exec(String(raw.source || '')) || [])[0];
  if (!date) throw new Error('the chat record names no date (decided_at, or a date in source)');
  if (!String(raw.operator_quote || '').trim()) throw new Error('the chat record has no operator_quote');
  const decisions = (raw.decisions || []).map((d) => {
    const id = citationId(d.id);
    const out = { id, question: d.question || d.subject, recommendation: d.recommendation, decision: d.decision, decided_at: d.decided_at || date };
    if (id !== d.id) out.raw_id = d.id;
    if (d.operator_quote) out.operator_quote = d.operator_quote;
    if (d.quote_ref !== undefined) {
      // A record with several operator quotes names the one each decision rests on (R-DV-1 import, batch C).
      if (!String(raw[d.quote_ref] || '').trim()) throw new Error(`${d.id}: quote_ref "${d.quote_ref}" names no quote in the record`);
      out.operator_quote = raw[d.quote_ref];
    }
    return out;
  });
  return {
    $comment: `Operator decision log (scripts/analysis/decision-log.mjs; Spec 124 R-HK). Imported verbatim from the committed chat record ${rawRel}. ${LANE_COMMENT}`,
    log_id: stem,
    source: { kind: 'chat', operator_quote: raw.operator_quote, record: raw.source || null, raw: { form: 'chat', file: rawRel } },
    // R-DV-1: the default vocabulary is computed only when the previous log declares none, so a log that declares
    // a meaning for a non-approval word (settled, bug_fix) re-imports.
    ...laneFields(previous, previous && previous.decision_vocab ? null : vocabFor([...new Set(decisions.map((d) => d.decision))])),
    decisions,
  };
}

/**
 * Build a log from a review page's rows export ({source, rows: [{id, question, recommendation, answer: {choice,
 * decided_at, excluded, note} | null, answered_via}]}). A row with no answer is not a decision of this log; it is
 * listed in `unanswered` with where it was answered instead. PURE over its inputs.
 */
export function importPageRows({ stem, title, url, raw, rawRel, previous }) {
  if (!Array.isArray(raw.rows)) throw new Error('the page export has no rows[]');
  const decisions = [];
  const unanswered = [];
  for (const r of raw.rows) {
    if (!r.answer) { unanswered.push({ id: r.id, answered_via: r.answered_via || null }); continue; }
    const d = { id: r.id, question: r.question, recommendation: r.recommendation, decision: r.answer.choice, decided_at: r.answer.decided_at };
    if (String(r.answer.note || '').trim()) d.note = r.answer.note;
    if ((r.answer.excluded || []).length) d.excluded = r.answer.excluded;
    d.source_url = url;
    decisions.push(d);
  }
  decisions.sort((a, b) => idCompare(a.id, b.id));
  return {
    $comment: `Operator decision log (scripts/analysis/decision-log.mjs; Spec 124 R-HK). Question, recommendation and decision are the review page rows export ${rawRel}, verbatim. ${LANE_COMMENT}`,
    log_id: stem,
    source: { kind: 'page', title, url, record: raw.source || null, raw: { form: 'page-rows', file: rawRel } },
    ...laneFields(previous, previous && previous.decision_vocab ? null : vocabFor([...new Set(decisions.map((d) => d.decision))])),
    decisions,
    ...(unanswered.length ? { unanswered } : {}),
  };
}

/**
 * Build a log from a rulings memo approved in chat with one quote: each "## Spec N: <title>" section's
 * "**Recommendation.**" block (to the next "---" or heading) and the "| N |" row of its summary table. PURE.
 */
export function importRulingsMd({ stem, text, rawRel, quote, decidedAt, previous }) {
  const md = String(text).replace(/\r\n/g, '\n');
  const sections = md.split(/^## /m).slice(1);
  const decisions = [];
  for (const s of sections) {
    const m = /^Spec (\d+[a-z]?):/.exec(s);
    if (!m) continue;
    const heading = s.split('\n')[0].trim();
    const i = s.indexOf('**Recommendation.**');
    if (i < 0) throw new Error(`section "${heading}" has no **Recommendation.** block`);
    const rec = s.slice(i).split(/\n---\s*(?:\n|$)/)[0].trim();
    const row = md.split('\n').find((l) => l.startsWith(`| ${m[1]} |`));
    if (!row) throw new Error(`the summary table has no "| ${m[1]} |" row`);
    const cells = row.split('|').map((c) => c.trim());
    decisions.push({
      id: `SPEC-${m[1]}`,
      question: `Role of ${heading}. Today: ${cells[2]}.`,
      recommendation: rec,
      summary_recommendation: cells[3],
      must_go_with: cells[4],
      decision: 'y',
      decided_at: decidedAt,
    });
  }
  if (!decisions.length) throw new Error('no "## Spec N:" section with a recommendation');
  return {
    $comment: `Operator decision log (scripts/analysis/decision-log.mjs; Spec 124 R-HK). The operator approved the memo ${rawRel} in chat ("${quote}"); each recommendation is that file's text, verbatim (the question is the section heading plus the summary table's Today cell). ${LANE_COMMENT}`,
    log_id: stem,
    source: { kind: 'chat', operator_quote: quote, raw: { form: 'rulings-md', file: rawRel, decided_at: decidedAt } },
    ...laneFields(previous, { y: 'approve' }),
    decisions,
  };
}

/** Natural id order (R-2 before R-10). PURE. */
export function idCompare(a, b) {
  const split = (s) => s.split(/(\d+)/).map((t) => (/^\d+$/.test(t) ? Number(t) : t));
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (x[i] === y[i]) continue;
    if (typeof x[i] === 'number' && typeof y[i] === 'number') return x[i] - y[i];
    return String(x[i]) < String(y[i]) ? -1 : 1;
  }
  return 0;
}

function walkMd(dir, root, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMd(full, root, out);
    else if (ent.name.endsWith('.md')) out.push({ rel: path.relative(root, full).split(path.sep).join('/'), text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

/** Read a tree: every log under docs/reports/decisions and every spec under docs/specs. */
export function loadTree(root = REPO_ROOT) {
  const dir = path.join(root, LOG_DIR_REL);
  const logs = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ stem: f.replace(/\.json$/, ''), log: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
    : [];
  const specDir = path.join(root, SPEC_ROOT_REL);
  const specs = fs.existsSync(specDir) ? walkMd(specDir, root, []).sort((a, b) => (a.rel < b.rel ? -1 : 1)) : [];
  const io = {
    read: (rel) => (fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isFile() ? fs.readFileSync(path.join(root, rel), 'utf8') : null),
    list: (rel) => (fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isDirectory() ? fs.readdirSync(path.join(root, rel)) : null),
  };
  return { logs, specs, io };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(`[decision-log] ${parsed.error}\nusage: node scripts/analysis/decision-log.mjs --check | --write [--out <file>] | --import (--answers <dir> --entries <file> --url <url> --title <text> | --page-rows <file> --url <url> --title <text> | --chat <file> | --rulings-md <file> --quote <text> --decided-at <date>) --out <log.json>`);
    process.exit(2);
  }
  const root = process.env.BUILDO_DECISION_LOG_ROOT ? path.resolve(process.env.BUILDO_DECISION_LOG_ROOT) : REPO_ROOT;
  const { mode, values } = parsed;
  try {
    if (mode === '--import') {
      const out = values['--out'];
      const stem = path.basename(out, '.json');
      const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
      // Raw records are cited by their path relative to the repo root, so --check can re-derive the log.
      const rel = (p) => path.relative(root, path.resolve(p)).split(path.sep).join('/');
      let log;
      if (values['--answers']) {
        const answersDir = values['--answers'];
        const answers = fs.readdirSync(answersDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(answersDir, f), 'utf8')));
        const entries = JSON.parse(fs.readFileSync(values['--entries'], 'utf8'));
        log = importPageExport({ stem, title: values['--title'], url: values['--url'], answers, entries, answersRel: rel(answersDir), entriesRel: rel(values['--entries']), previous });
      } else if (values['--page-rows']) {
        log = importPageRows({ stem, title: values['--title'], url: values['--url'], raw: JSON.parse(fs.readFileSync(values['--page-rows'], 'utf8')), rawRel: rel(values['--page-rows']), previous });
      } else if (values['--chat']) {
        log = importChat({ stem, raw: JSON.parse(fs.readFileSync(values['--chat'], 'utf8')), rawRel: rel(values['--chat']), previous });
      } else {
        log = importRulingsMd({ stem, text: fs.readFileSync(values['--rulings-md'], 'utf8'), rawRel: rel(values['--rulings-md']), quote: values['--quote'], decidedAt: values['--decided-at'], previous });
      }
      const problems = validateLog(stem, log);
      if (problems.length) throw new Error(problems.join('\n'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`);
      console.log(`[decision-log] --import: wrote ${out} (${log.decisions.length} decisions)`);
    } else {
      const { logs, specs, io } = loadTree(root);
      const r = checkDecisionLogs(logs, specs, { io });
      if (mode === '--write') {
        const text = r.missing.length ? skeletons(r.missing) : '';
        if (values['--out']) {
          fs.writeFileSync(values['--out'], text);
          console.log(`[decision-log] --write: ${r.missing.length} skeleton row(s) → ${values['--out']}`);
        } else {
          process.stdout.write(text || '[decision-log] --write: every approved decision has a register row; no skeleton\n');
        }
      } else if (r.problems.length) {
        console.error(`[decision-log] RED — ${r.problems.length} problem(s):\n  ${r.problems.join('\n  ')}`);
        process.exitCode = 1;
      } else {
        console.log(`[decision-log] clean — ${logs.length} log(s), ${r.decisions} decision(s), ${r.rows} register row(s), ${r.citations} citation(s), ${r.owed} owed by another lane, ${r.no_ruling} no_ruling resting on an existing row; every approved decision has a register row or is owed, and every log matches its raw record`);
      }
    }
  } catch (err) {
    console.error(`[decision-log] ${err.message}`);
    process.exitCode = 2;
  }
}
