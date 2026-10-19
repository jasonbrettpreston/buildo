// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.15 (the trace tooling: field lineage
//            and answer reconciliation), docs/specs/01-pipeline/131_lot_configuration_policy.md LC-41, LC-42
//
// Shared, read-only resolvers for the two MaxBLD trace generators (generate-maxbld-lineage.mjs,
// generate-answer-tracker.mjs). No DB, no network, no clock: every answer comes from committed files.
//   - provisionsIndex(root): regulation ids and clause paths of docs/reference/bylaw-provisions.json
//   - agreedUnitIds(root):   the agreed keyed unit ids (authored shards + adjudications, agree.mjs), the set the gates read
//   - migrationColumns(root): table → column → [migration files] parsed from migrations/*.sql
//   - seededLogicVariables(root, prefix): logic-variable keys that a migration seeds
//   - disclosureCodes(specText): the closed P5.12 code list of Spec 78
//   - ruleIds(root): every Spec 69 M-row id (69a + 69), with its status word

import fs from 'node:fs';
import path from 'node:path';
import { loadAuthored } from './authored.mjs';
import { checkAgree, agreedUnits } from './agree.mjs';

export const PROVISIONS_REL = 'docs/reference/bylaw-provisions.json';
export const SPEC78_REL = 'docs/specs/01-pipeline/78_optimal_lot_configuration.md';
export const SPEC69A_REL = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
export const SPEC69_REL = 'docs/specs/01-pipeline/69_mcbylaw_policy.md';

export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);
export const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
export const readText = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
/** Markdown table cell: pipes escaped, newlines flattened. */
export const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/** { ids: Set<regulation_id>, clauses: Map<regulation_id, Set<clause path>> } */
export function provisionsIndex(root) {
  const j = readJson(root, PROVISIONS_REL);
  const ids = new Set();
  const clauses = new Map();
  for (const r of j.rows || []) {
    ids.add(r.regulation_id);
    clauses.set(r.regulation_id, new Set((r.clauses || []).map((c) => c.path)));
  }
  return { ids, clauses };
}

/**
 * Resolve a cited id: a bare regulation id ("10.80.40.10(1)") or one with a clause path below it
 * ("10.80.40.10(1)(B)(ii)" → regulation 10.80.40.10(1), clause (1)(B)(ii)). Amendment-variant ids
 * ("150.7.60.60(7)@1075-2026") resolve on their base id. Returns null when it resolves, else a reason.
 */
export function resolveRegulation(idx, cited) {
  if (idx.ids.has(String(cited))) return null;
  const base = String(cited).replace(/@[^#]*$/, '');
  if (idx.ids.has(base)) return null;
  const m = /^(.*?\(\d+[A-Za-z]?\))((?:\([^()]+\))+)$/.exec(base);
  if (m && idx.ids.has(m[1])) {
    const num = /\(\d+[A-Za-z]?\)$/.exec(m[1])[0];
    const clause = num + m[2];
    return idx.clauses.get(m[1]).has(clause) ? null : `clause ${clause} not in ${m[1]}`;
  }
  return 'regulation id not in bylaw-provisions.json';
}

let agreedCache = null;
/** Agreed keyed unit ids, resolved the way the gates read them (authored shards + adjudications). */
export function agreedUnitIds(root) {
  return new Set(agreedUnitMap(root).keys());
}

/** Map<unit_id, agreed unit> (the unit's keyed fields, e.g. `disclosure`, `calculation_handling`). */
export function agreedUnitMap(root) {
  if (agreedCache && agreedCache.root === root) return agreedCache.map;
  const seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  const vocab = JSON.parse(fs.readFileSync(path.join(seeds, 'vocab.json'), 'utf8'));
  const adjPath = path.join(seeds, 'adjudications.json');
  const adjudications = fs.existsSync(adjPath) ? JSON.parse(fs.readFileSync(adjPath, 'utf8')) : null;
  const ag = checkAgree({ shards: loadAuthored(root), adjudications, vocab });
  const map = agreedUnits(ag);
  agreedCache = { root, map };
  return map;
}

/** Corrections (M-75) per unit id from adjudications.json: [{id, field, rule}] */
export function correctionsByUnit(root) {
  const p = path.join(root, 'scripts', 'seeds', 'bylaw', 'adjudications.json');
  const out = new Map();
  if (!fs.existsSync(p)) return out;
  for (const a of JSON.parse(fs.readFileSync(p, 'utf8')).adjudications || []) {
    if (a.kind !== 'correction' || !a.unit) continue;
    if (!out.has(a.unit)) out.set(a.unit, []);
    out.get(a.unit).push({ id: a.id, field: a.field, rule: a.rule || '' });
  }
  return out;
}

export function dslTargets(root) {
  const v = readJson(root, 'scripts/seeds/bylaw/vocab.json');
  return new Set(Array.isArray(v.dsl_target) ? v.dsl_target : Object.keys(v.dsl_target || {}));
}

const NOT_COLUMN = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude', 'like']);
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Map<table, Map<column, Set<file>>> from CREATE TABLE / ALTER TABLE … ADD [COLUMN] / RENAME COLUMN … TO. */
export function migrationColumns(root) {
  const dir = path.join(root, 'migrations');
  const out = new Map();
  const add = (t, c, f) => {
    const tt = t.toLowerCase().replace(/^public\./, '').replace(/"/g, '');
    if (!out.has(tt)) out.set(tt, new Map());
    const m = out.get(tt);
    const cc = c.toLowerCase().replace(/"/g, '');
    if (!m.has(cc)) m.set(cc, new Set());
    m.get(cc).add(f);
  };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort(cmp)) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
    const create = /CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/gi;
    let m;
    while ((m = create.exec(sql))) {
      const open = m.index + m[0].length - 1;
      const close = matchParen(sql, open);
      if (close < 0) continue;
      for (const part of splitTopLevel(sql.slice(open + 1, close))) {
        const w = /^\s*("?[A-Za-z_]\w*"?)/.exec(part);
        if (w && !NOT_COLUMN.has(w[1].toLowerCase().replace(/"/g, ''))) add(m[1], w[1], f);
      }
    }
    const alter = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)([^;]*)/gi;
    while ((m = alter.exec(sql))) {
      const body = m[2];
      const addRe = /\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?[A-Za-z_]\w*"?)/gi;
      let a;
      while ((a = addRe.exec(body))) if (!NOT_COLUMN.has(a[1].toLowerCase().replace(/"/g, ''))) add(m[1], a[1], f);
      const ren = /\bRENAME\s+COLUMN\s+"?\w+"?\s+TO\s+("?\w+"?)/gi;
      while ((a = ren.exec(body))) add(m[1], a[1], f);
    }
  }
  return out;
}

/** Logic-variable keys `<prefix><name>` that appear in any migration (a seed). */
export function seededLogicVariables(root, prefix) {
  const dir = path.join(root, 'migrations');
  const re = new RegExp(`['"]${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-z0-9_]+)['"]`, 'g');
  const out = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    let m;
    while ((m = re.exec(sql))) out.add(m[1]);
  }
  return out;
}

/** The backticked suffixes in the Spec 78 P5.9 table. */
export function p59Names(specText) {
  const start = specText.indexOf('### P5.9 Logic variables');
  const end = specText.indexOf('### P5.10', start);
  const out = new Set();
  if (start < 0 || end < 0) return out;
  for (const line of specText.slice(start, end).split('\n')) {
    const m = /^\| `([a-z0-9_]+)`(?: \/ `([a-z0-9_]+)`)? \|/.exec(line);
    if (m) { out.add(m[1]); if (m[2]) out.add(m[2]); }
  }
  return out;
}

/** The closed P5.12 disclosure codes of Spec 78 (first backticked cell of each table row). */
export function disclosureCodes(specText) {
  const start = specText.indexOf('### P5.12 Disclosures');
  const end = specText.indexOf('### P5.13', start);
  const out = new Set();
  if (start < 0 || end < 0) return out;
  for (const line of specText.slice(start, end).split('\n')) {
    const m = /^\| `([a-z0-9_]+)` \|/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Map<'M-n', statusWord> over Spec 69a + Spec 69 register rows (`| **M-n** | … | STATUS … |`). */
export function ruleIds(root) {
  const out = new Map();
  for (const rel of [SPEC69A_REL, SPEC69_REL]) {
    for (const line of readText(root, rel).split('\n')) {
      const m = /^\| \*\*(M-\d+)\*\* \|/.exec(line);
      if (!m) continue;
      const cells = line.split(/(?<!\\)\|/);
      const status = (cells[cells.length - 2] || '').trim().split(/\s+/)[0] || '';
      out.set(m[1], status.replace(/[^A-Z_]/g, ''));
    }
  }
  return out;
}

/** Plain-wording terms (Spec 131 LC-52): a template that uses the by-law term must carry its plain meaning. */
export const PLAIN_TERMS = [
  { term: /\bGFA\b/, plain: 'floor-area total (GFA)' },
  { term: /\bFSI\b/, plain: 'allowed floor area (FSI)', alt: /times the lot area \(FSI/ },
  { term: /established grade/, plain: 'the ground level the City measures from (established grade)' },
  { term: /\bCoA\b/, plain: 'Committee of Adjustment (CoA)' },
];
export const TEMPLATE_MAX_WORDS = 45;

/** Lint the Spec 78 P5.12 templates (LC-52). Returns problems: one per template over the word cap or with an unglossed term. */
export function lintDisclosureTemplates(specText) {
  const start = specText.indexOf('### P5.12 Disclosures');
  const end = specText.indexOf('### P5.13', start);
  const problems = [];
  if (start < 0 || end < 0) return ['P5.12 block not found'];
  for (const line of specText.slice(start, end).split('\n')) {
    const m = /^\| `([a-z0-9_]+)` \| "([^"]*)"/.exec(line);
    if (!m) continue;
    const [, code, tpl] = m;
    const words = tpl.split(/\s+/).filter(Boolean).length;
    if (words > TEMPLATE_MAX_WORDS) problems.push(`${code}: ${words} words > ${TEMPLATE_MAX_WORDS}`);
    for (const t of PLAIN_TERMS) {
      if (t.term.test(tpl) && !tpl.includes(t.plain) && !(t.alt && t.alt.test(tpl))) problems.push(`${code}: "${t.term.source}" without "${t.plain}"`);
    }
  }
  return problems;
}
