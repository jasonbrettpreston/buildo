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
//   --import --answers <dir> --entries <file> --url <url> --title <text> --out <log.json>
//             builds a log from a review-page export: <dir>/*.json are the page's decision documents
//             ({ref, decision, updated_at}), <file> is the page's entries array ({ref, key, note, evidence, …}). The
//             question and the recommendation are copied verbatim; an existing log's lane-added fields
//             (`decision_vocab`, `routing`, `amendments`) are kept.
//
// A log: { log_id (= file stem), source {kind: page|chat, url | operator_quote}, decision_vocab {value: approve |
// amend | reject | defer}, decisions [{id, question, recommendation, decision, decided_at}], routing {id: {register,
// row}}, amendments {id: {text, operator_quote, decided_at, source}} }. An amendment turns an approval into `amend`;
// its row must carry the amended text.
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
export const MEANINGS = Object.freeze(['approve', 'amend', 'reject', 'defer']);
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
  '--import': ['--answers', '--entries', '--url', '--title', '--out'],
});
const REQUIRED_VALUES = Object.freeze({ '--check': [], '--write': [], '--import': ['--answers', '--entries', '--url', '--title', '--out'] });

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
  }
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
 * The check. PURE over its inputs: `logs` = [{stem, log}], `specs` = [{rel, text}].
 * Returns {problems: string[], missing: [{stem, id, log, d}], citations, decisions, rows}; `missing` feeds --write.
 */
export function checkDecisionLogs(logs, specs) {
  const problems = [];
  const byStem = new Map();
  for (const { stem, log } of logs) {
    problems.push(...validateLog(stem, log));
    byStem.set(stem, log);
  }
  const cites = collectCitations(specs);
  for (const c of cites) {
    const log = byStem.get(c.stem);
    if (!log) { problems.push(`${c.rel}:${c.line}: cites ${c.stem}#${c.id}, but there is no decision log ${LOG_DIR_REL}/${c.stem}.json`); continue; }
    if (!(log.decisions || []).some((d) => d && d.id === c.id)) problems.push(`${c.rel}:${c.line}: cites ${c.stem}#${c.id}, which is not a decision in that log`);
  }
  const missing = [];
  let decisions = 0;
  const rowKeys = new Set();
  for (const { stem, log } of logs) {
    for (const d of log.decisions || []) {
      if (!d || !d.id) continue;
      decisions += 1;
      if (!NEEDS_ROW.has(meaningOf(log, d))) continue;
      const rows = cites.filter((c) => c.stem === stem && c.id === d.id && c.row_id);
      for (const c of rows) rowKeys.add(`${c.rel}|${c.row_id}`);
      if (rows.length === 0) {
        problems.push(`${stem}#${d.id}: approved ${String(d.decided_at || '').slice(0, 10)}, but no register row cites it`);
        missing.push({ stem, id: d.id, log, d });
        continue;
      }
      const route = (log.routing || {})[d.id];
      if (!route || !route.register) continue;
      const inRegister = rows.filter((c) => c.rel === route.register);
      if (inRegister.length === 0) {
        problems.push(`${stem}#${d.id}: routed to ${route.register}, but its register rows are in ${[...new Set(rows.map((c) => c.rel))].join(', ')}`);
      } else if (route.row && !inRegister.some((c) => c.row_id === route.row)) {
        problems.push(`${stem}#${d.id}: routed to row ${route.row} in ${route.register}, but the citing rows there are ${[...new Set(inRegister.map((c) => c.row_id))].join(', ')}`);
      }
    }
  }
  return { problems, missing, citations: cites.length, decisions, rows: rowKeys.size };
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
      const src = log.source.kind === 'page' ? `${log.source.title || 'review page'}, ${log.source.url}` : `chat: "${log.source.operator_quote}"`;
      const amend = (log.amendments || {})[id];
      const verb = meaningOf(log, d) === 'amend' ? 'approved, then amended' : 'approved';
      const amendText = amend ? ` Amended ${amend.decided_at} (${amend.source || 'chat'}: "${amend.operator_quote}"): ${amend.text}` : '';
      L.push(`| ${route.row || '<NEXT-ID>'} | **${cell(d.question)}** Operator ${verb} ${String(d.decided_at).slice(0, 10)} (${cell(src)}; \`${stem}#${id}\`). Approved: ${cell(d.recommendation)}${cell(amendText)} <RULE TEXT> | <SOURCE / AMENDS> | <LOCK> | <STATUS> |`);
    }
    L.push('');
  }
  return L.join('\n');
}

/** Build a log from a review-page export. PURE over its inputs. */
export function importPageExport({ stem, title, url, answers, entries, previous }) {
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
    $comment: 'Operator decision log (scripts/analysis/decision-log.mjs; Spec 124 R-HK). Question, recommendation and decision are the review page export, verbatim. `decision_vocab`, `routing` (the register and row that record each decision) and `amendments` are added by the lane and are not the page text.',
    log_id: stem,
    source: { kind: 'page', title, url },
    decision_vocab: (previous && previous.decision_vocab) || { keep: 'approve' },
    decisions,
    routing: (previous && previous.routing) || {},
    amendments: (previous && previous.amendments) || {},
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
  return { logs, specs };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(`[decision-log] ${parsed.error}\nusage: node scripts/analysis/decision-log.mjs --check | --write [--out <file>] | --import --answers <dir> --entries <file> --url <url> --title <text> --out <log.json>`);
    process.exit(2);
  }
  const root = process.env.BUILDO_DECISION_LOG_ROOT ? path.resolve(process.env.BUILDO_DECISION_LOG_ROOT) : REPO_ROOT;
  const { mode, values } = parsed;
  try {
    if (mode === '--import') {
      const out = values['--out'];
      const stem = path.basename(out, '.json');
      const answersDir = values['--answers'];
      const answers = fs.readdirSync(answersDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(answersDir, f), 'utf8')));
      const entries = JSON.parse(fs.readFileSync(values['--entries'], 'utf8'));
      const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
      const log = importPageExport({ stem, title: values['--title'], url: values['--url'], answers, entries, previous });
      const problems = validateLog(stem, log);
      if (problems.length) throw new Error(problems.join('\n'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`);
      console.log(`[decision-log] --import: wrote ${out} (${log.decisions.length} decisions)`);
    } else {
      const { logs, specs } = loadTree(root);
      const r = checkDecisionLogs(logs, specs);
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
        console.log(`[decision-log] clean — ${logs.length} log(s), ${r.decisions} decision(s), ${r.rows} register row(s), ${r.citations} citation(s); every approved decision has a register row`);
      }
    }
  } catch (err) {
    console.error(`[decision-log] ${err.message}`);
    process.exitCode = 2;
  }
}
