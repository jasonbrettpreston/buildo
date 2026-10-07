// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (`scope`, `scope_rule_id`, `out_of_scope_reason`), §6.4
//            rules 1, 2, 11 (pinned page set; exhaustiveness is a gate; a definition flip needs --accept --ruling),
//            §8 rule 7 (every pin moves through one door: --accept --ruling=<RATIFIED Spec 69 id>), §9 G-UNIVERSE (TOC
//            arm + scope arm), §10 stage 3; docs/specs/01-pipeline/69_mcbylaw_policy.md M-31, M-37, M-47 (+ S3 notes),
//            M-15; docs/reports/mcbylaw-phase1-plan.md S5
//
// Stage 3 (Scope) and the G-UNIVERSE TOC + scope arms. PURE except universeInputs() and acceptUniverse().
//
//   tocUniverse({pages, pageSet})                 → TOC entries of the pinned pages, each mapped to a page or not
//   checkToc({pages, pageSet, universe, vocab, rulings}) → {violations, entries, counts}            (TOC arm)
//   scopeRows({rows, universe, vocab, rulings})   → {rows:[{regulation_id, page, kind, scope, reason, rule_id, …}],
//                                                    violations, usage}                              (scope rules)
//   universeCounts(scoped, toc)                   → the counts universe.lock.json pins
//   checkUniverse({...})                          → {status: pass|fail|not_run, pass, violations, checked, counts}
//   acceptUniverse({root, ruling})                → writes universe.lock.json + a ratchet-exceptions.json row
//   parseRulings(spec69Text)                      → Map(id → 'RATIFIED' | 'PROPOSED' | 'RETIRED')
//   selfTest()
//
// Reason codes (closed):
//   toc_root_missing          no pinned page has role toc_root
//   toc_empty                 the pinned pages' TOCs parse to 0 entries
//   toc_page_missing          a pinned page (section or toc_root) was not handed to the gate (a short universe)
//   toc_unmapped              a TOC entry maps to neither a pinned page nor a page rule
//   page_rule_invalid         a page rule's disposition / reason is outside the vocab, or its entry is pinned
//   page_rule_orphan          a page rule matches no TOC entry
//   scope_rule_invalid        a scope rule's shape is wrong (tier/kind/reason/match keys/regex/evidence/basis)
//   scope_rule_orphan         a scope rule matches no row
//   scope_unmatched           a row matches no scope rule
//   scope_ambiguous           a row matches two rules in its winning tier
//   scope_evidence_missing    a row a mechanical/judgment rule matched holds none of the rule's evidence phrases
//   retired_page_unruled      a retired page has no page_status rule (its rows would be absent or in scope)
//   ruling_not_ratified       a rule (or the --accept) cites a Spec 69 id that is not RATIFIED
//   universe_lock_mismatch    computed counts / in-scope id set differ from universe.lock.json (same adoption)
//   universe_ledger_mismatch  universe.lock.json and the latest ratchet-exceptions.json universe_pin disagree
// Arm states that are not failures: lock absent (`universe_lock_absent`) or pinned under an older adoption
// (`universe_lock_stale`) ⇒ status not_run; rows / page rules awaiting a ruling are counted, never failures.
// acceptUniverse alone refuses with `awaiting_ruling` (an accept-time refusal, not a gate reason code). Rules that fail
// to compile never take part in matching (no match-everything fallback) and are not also reported as orphans.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseToc, stableStringify, writeAtomic } from './snapshot.mjs';
import { definitionUsage } from './definitions.mjs';

export const UNIVERSE_REL = 'scripts/seeds/bylaw/universe.json';
export const LOCK_REL = 'scripts/seeds/bylaw/universe.lock.json';
export const LEDGER_REL = 'scripts/seeds/bylaw/ratchet-exceptions.json';
export const SPEC69_REL = 'docs/specs/01-pipeline/69_mcbylaw_policy.md';

export const REASON_CODES = Object.freeze([
  'toc_root_missing',
  'toc_empty',
  'toc_page_missing',
  'toc_unmapped',
  'page_rule_invalid',
  'page_rule_orphan',
  'scope_rule_invalid',
  'scope_rule_orphan',
  'scope_unmatched',
  'scope_ambiguous',
  'scope_evidence_missing',
  'retired_page_unruled',
  'ruling_not_ratified',
  'universe_lock_mismatch',
  'universe_ledger_mismatch',
]);

/** Tier ↔ kind (universe.json $comment). Administrative is tier 3 (M-31: after the mechanical and ruled page-status
 * tiers, before every other judgment reason and the in-scope page default). */
const TIER_KIND = Object.freeze({ 1: 'mechanical', 2: 'page_status', 3: 'judgment', 4: 'judgment', 5: 'mechanical', 6: 'page_scope' });
const MATCH_KEYS = Object.freeze(['pages', 'kinds', 'articles', 'article_patterns', 'regulation_ids', 'verbatim_patterns', 'exclude_verbatim_patterns', 'definition_used']);
const ADMIN = 'administrative_no_application_effect';

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

export class UniverseError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'UniverseError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- rulings

/**
 * Spec 69 register ids and their status: a row `| **M-15** | … | RATIFIED 2026-10-06 … |` → RATIFIED; a struck
 * `~~M-19~~` → RETIRED. Dated-note rows (`| | *Dated note …`) belong to the row above and carry no id. PURE.
 */
export function parseRulings(text) {
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\|\s*(?:\*\*(M-\d+|P-\d+)\*\*|~~(M-\d+|P-\d+)~~)\s*\|/.exec(line);
    if (!m) continue;
    if (m[2]) {
      out.set(m[2], 'RETIRED');
      continue;
    }
    const cells = line.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
    const status = cells[cells.length - 1] || '';
    out.set(m[1], /^RATIFIED\b/.test(status) ? 'RATIFIED' : /^PROPOSED\b/.test(status) ? 'PROPOSED' : /^RETIRED\b/.test(status) ? 'RETIRED' : 'UNKNOWN');
  }
  return out;
}

// ---------------------------------------------------------------- TOC arm

const sectionOf = (id) => id.split('.').slice(0, 2).join('.');
const chapterOf = (id) => id.split('.')[0];

/** Every TOC entry of the pinned pages (union), each with the pinned page it maps to, if any. PURE. */
export function tocUniverse({ pages, pageSet }) {
  const pinned = (pageSet.pages || []).filter((p) => p.role === 'section' && p.section);
  const bySection = new Map(pinned.map((p) => [p.section, p.key]));
  const chapters = new Set(pinned.map((p) => chapterOf(p.section)));
  const entries = new Map();
  const pinnedKeys = new Set((pageSet.pages || []).map((p) => p.key));
  for (const p of [...pages].sort((a, b) => cmpStr(a.key, b.key))) {
    if (!pinnedKeys.has(p.key)) continue; // only the pinned pages' TOCs make the universe
    for (const r of parseToc(String(p.html || ''))) {
      if (!entries.has(r.id)) entries.set(r.id, { id: r.id, level: r.level, title: r.title, listed_on: [] });
      entries.get(r.id).listed_on.push(p.key);
    }
  }
  const out = [];
  for (const e of [...entries.values()].sort((a, b) => cmpStr(a.id, b.id))) {
    let page = null;
    if (e.level === 'chapter') page = chapters.has(e.id) ? `chapter:${e.id}` : null;
    else page = bySection.get(sectionOf(e.id)) || null;
    out.push({ ...e, listed_on: e.listed_on.length, page });
  }
  return out;
}

/** Validate page rules and map every unpinned TOC entry to one. PURE. */
export function checkToc({ pages, pageSet, universe, vocab, rulings }) {
  const v = [];
  if (!(pageSet.pages || []).some((p) => p.role === 'toc_root')) v.push('toc_root_missing: page-set.json pins no toc_root page');
  const handed = new Set(pages.map((p) => p.key));
  for (const p of pageSet.pages || []) if ((p.role === 'section' || p.role === 'toc_root') && !handed.has(p.key)) v.push(`toc_page_missing: pinned page ${p.key} was not loaded`);
  const entries = tocUniverse({ pages, pageSet });
  if (entries.length === 0) v.push('toc_empty: the pinned pages parse to 0 TOC entries');
  const dispositions = new Set(vocab.scope.page_rule_disposition || []);
  // page-rule reasons + the JUDGMENT out_of_scope reasons (a page is never 'deleted_slot' / 'definition_not_used')
  const oosJudgment = Object.fromEntries(Object.entries(vocab.scope.out_of_scope_reason || {}).filter(([, x]) => x && x.kind === 'judgment'));
  const reasons = { ...(vocab.scope.page_rule_reason || {}), ...oosJudgment };
  const rules = (universe.page_rules || []).map((r, i) => ({ ...r, idx: i, hits: 0, re: null }));
  const pinnedIds = new Set(entries.filter((e) => e.page).map((e) => e.id));
  for (const r of rules) {
    const label = r.entry || r.entry_pattern || `#${r.idx}`;
    if (!dispositions.has(r.disposition)) v.push(`page_rule_invalid: ${label} disposition ${r.disposition}`);
    if (!Object.hasOwn(reasons, r.reason)) v.push(`page_rule_invalid: ${label} reason ${r.reason}`);
    if (!!r.entry === !!r.entry_pattern) v.push(`page_rule_invalid: ${label} needs exactly one of entry | entry_pattern`);
    if (r.entry_pattern && !/^\^.*\$$/.test(r.entry_pattern)) v.push(`page_rule_invalid: ${label} entry_pattern must be anchored ^…$`);
    else if (r.entry_pattern) {
      try {
        r.re = new RegExp(r.entry_pattern);
      } catch {
        v.push(`page_rule_invalid: ${label} entry_pattern does not compile`);
      }
    }
    if (r.entry && pinnedIds.has(r.entry)) v.push(`page_rule_invalid: ${label} is a pinned entry; a page rule never overrides a pinned page`);
    // Spec 68 §9 G-PROV: `deferred_by_ruling:<id>` may cite a PROPOSED row (counted); every other ruling is RATIFIED
    const okStatus = r.reason === 'deferred_by_ruling' ? ['RATIFIED', 'PROPOSED'] : ['RATIFIED'];
    if (r.ruling !== null && r.ruling !== undefined && !okStatus.includes(rulings.get(r.ruling))) v.push(`ruling_not_ratified: page rule ${label} cites ${r.ruling} (${rulings.get(r.ruling) || 'absent'})`);
  }
  const mapped = [];
  for (const e of entries) {
    if (e.page) {
      mapped.push({ ...e, mapping: e.level === 'chapter' ? 'chapter_via_sections' : 'page' });
      continue;
    }
    // a rule on the entry itself, else on its section (articles of a ruled section), else on its chapter
    const keys = [e.id, sectionOf(e.id), chapterOf(e.id)];
    let rule = null;
    for (const k of keys) {
      rule = rules.find((r) => (r.entry === k) || (r.re && r.re.test(k)));
      if (rule) break;
    }
    if (!rule) {
      v.push(`toc_unmapped: ${e.level} ${e.id} "${e.title}" maps to no pinned page and no page rule`);
      mapped.push({ ...e, mapping: 'unmapped' });
      continue;
    }
    rule.hits++;
    mapped.push({ ...e, mapping: 'page_rule', disposition: rule.disposition, reason: rule.reason, ruling: rule.ruling || null });
  }
  for (const r of rules) if (r.hits === 0) v.push(`page_rule_orphan: ${r.entry || r.entry_pattern} matches no TOC entry`);
  const counts = { entries: entries.length, mapped_chapter: 0, mapped_page: 0, page_rule: {}, awaiting_ruling: 0, unmapped: 0 };
  for (const e of mapped) {
    if (e.mapping === 'page') counts.mapped_page++;
    else if (e.mapping === 'chapter_via_sections') counts.mapped_chapter++;
    else if (e.mapping === 'unmapped') counts.unmapped++;
    else {
      const k = `${e.disposition}:${e.reason}`;
      counts.page_rule[k] = (counts.page_rule[k] || 0) + 1;
      if (!e.ruling) counts.awaiting_ruling++;
    }
  }
  counts.page_rule = Object.fromEntries(Object.entries(counts.page_rule).sort((a, b) => cmpStr(a[0], b[0])));
  return { counts, entries: mapped, violations: v };
}

// ---------------------------------------------------------------- scope arm

const matchPages = (r) => (isMap(r.match) && Array.isArray(r.match.pages) ? r.match.pages : []);

function compileRule(r, vocab, retired, pinned, rulings, v) {
  const id = isStr(r.id) ? r.id : '(no id)';
  let bad = (msg) => v.push(`scope_rule_invalid: ${id} ${msg}`);
  let invalid = false;
  const bad0 = bad;
  bad = (msg) => {
    invalid = true;
    bad0(msg);
  };
  if (!isStr(r.id)) bad('has no id');
  if (!Number.isInteger(r.tier)) bad(`tier ${JSON.stringify(r.tier)} is not an integer`);
  if (TIER_KIND[r.tier] !== r.kind) bad(`tier ${r.tier} / kind ${r.kind} (tiers: ${JSON.stringify(TIER_KIND)})`);
  if (!['in', 'out'].includes(r.scope)) bad(`scope ${r.scope}`);
  const oos = vocab.scope.out_of_scope_reason || {};
  if (r.scope === 'out') {
    const reason = oos[r.reason];
    if (!reason) bad(`reason ${r.reason} is not a vocab out_of_scope_reason`);
    else if (r.kind === 'mechanical' && reason.kind !== 'mechanical') bad(`a mechanical rule cites the judgment reason ${r.reason}`);
    else if (r.kind !== 'mechanical' && reason.kind === 'mechanical') bad(`a ${r.kind} rule cites the mechanical reason ${r.reason}`);
    if (r.kind === 'judgment' && (r.reason === ADMIN) !== (r.tier === 3)) bad(`${ADMIN} is tier 3 and only it (Spec 69 M-31)`);
  } else if (r.reason !== undefined) bad('an in-scope rule carries no reason');
  if (r.scope === 'in' && !['mechanical', 'page_scope'].includes(r.kind)) bad('only mechanical and page_scope rules put rows in scope');
  if (!isMap(r.match) || Object.keys(r.match).length === 0) bad('has no match');
  const m = {};
  for (const [k, val] of Object.entries(r.match || {})) {
    if (!MATCH_KEYS.includes(k)) {
      bad(`unknown match key ${k}`);
      continue;
    }
    if (k === 'definition_used') {
      if (typeof val !== 'boolean') bad('definition_used must be a boolean');
      m[k] = val;
      continue;
    }
    if (!Array.isArray(val) || val.length === 0 || val.some((x) => !isStr(x))) {
      bad(`match.${k} must be a non-empty list of strings`);
      continue;
    }
    if (/patterns$/.test(k)) {
      try {
        m[k] = val.map((p) => new RegExp(p, 'i'));
      } catch {
        bad(`match.${k} has a pattern that does not compile`);
      }
    } else m[k] = new Set(val);
  }
  let evidence = null;
  if (r.kind === 'mechanical' || r.kind === 'judgment') {
    if (r.kind === 'judgment' || r.scope === 'out' && r.reason !== 'definition_not_used') {
      if (!Array.isArray(r.evidence) || r.evidence.length === 0) bad('needs evidence patterns');
      else {
        try {
          evidence = r.evidence.map((p) => new RegExp(p, 'i'));
        } catch {
          bad('has an evidence pattern that does not compile');
        }
        if (r.evidence.some((p) => !isStr(p))) bad('has a non-string evidence pattern');
        else if (r.kind === 'judgment') for (const p of r.evidence) if (words(p.replace(/\\[sbdw]/g, ' ').replace(/[\\^$()[\]?*+|.]/g, ' ')) < 2) bad(`judgment evidence "${p}" is under 2 words`);
      }
    }
  }
  if (r.kind === 'page_status') {
    if (!isStr(r.ruling)) bad('a page_status rule cites its ruling');
    for (const p of matchPages(r)) if (!retired.has(p)) bad(`page_status rule names ${p}, which is not a retired page`);
  }
  if (r.kind === 'page_scope') {
    if (!isStr(r.basis)) bad('a page_scope rule names its page-set basis');
    for (const p of matchPages(r)) if (!pinned.has(p) || retired.has(p)) bad(`page_scope rule names ${p}, which is not a pinned, non-retired page`);
  }
  if (r.ruling !== null && r.ruling !== undefined && rulings.get(r.ruling) !== 'RATIFIED') v.push(`ruling_not_ratified: scope rule ${id} cites ${r.ruling} (${rulings.get(r.ruling) || 'absent'})`);
  return { ...r, m, ev: evidence, hits: 0, invalid };
}

function matches(rule, row, used) {
  const m = rule.m;
  if (m.pages && !m.pages.has(row.page)) return false;
  if (m.kinds && !m.kinds.has(row.kind)) return false;
  if (m.articles && !m.articles.has(row.article)) return false;
  if (m.article_patterns && !m.article_patterns.some((re) => re.test(String(row.article ?? '')))) return false;
  if (m.regulation_ids && !m.regulation_ids.has(row.regulation_id)) return false;
  const text = String(row.verbatim ?? '');
  if (m.verbatim_patterns && !m.verbatim_patterns.some((re) => re.test(text))) return false;
  if (m.exclude_verbatim_patterns && m.exclude_verbatim_patterns.some((re) => re.test(text))) return false;
  if (m.definition_used !== undefined && (row.kind !== 'definition' || used.has(row.regulation_id) !== m.definition_used)) return false;
  return true;
}

/** Resolve one row: the lowest matching tier wins; two hits in that tier is ambiguous. */
function resolve(row, rules, used, v) {
  const hits = rules.filter((r) => !r.invalid && matches(r, row, used));
  for (const r of hits) r.hits++; // a rule that matches but loses to a lower tier is shadowed, not an orphan
  if (hits.length === 0) {
    v.push(`scope_unmatched: ${row.regulation_id} (${row.page}, ${row.kind})`);
    return { scope: 'unmatched' };
  }
  const tier = Math.min(...hits.map((r) => r.tier));
  const win = hits.filter((r) => r.tier === tier);
  if (win.length > 1) {
    v.push(`scope_ambiguous: ${row.regulation_id} matches ${win.map((r) => r.id).join(', ')} in tier ${tier}`);
    return { scope: 'ambiguous' };
  }
  const r = win[0];
  let evidence = null;
  if (r.ev) {
    for (const re of r.ev) {
      const mm = re.exec(String(row.verbatim ?? ''));
      if (mm) {
        evidence = mm[0];
        break;
      }
    }
    if (evidence === null) v.push(`scope_evidence_missing: ${row.regulation_id} matched ${r.id} but holds none of its evidence phrases`);
  }
  const awaiting = r.kind === 'judgment' && !r.ruling;
  return {
    evidence,
    kind_of_rule: r.kind,
    reason: r.scope === 'out' ? r.reason : null,
    rule_id: r.id,
    ruling: r.ruling || null,
    scope: r.scope === 'in' ? 'in_scope' : awaiting ? 'awaiting_ruling' : 'out_of_scope',
    shadowed: hits.filter((x) => x.tier > tier).map((x) => x.id),
  };
}

/**
 * Apply the scope rules to the sliced rows (tiers 1-4 and 6 first; then the definitions matcher over the rows in
 * scope — awaiting rows count as their proposed scope, i.e. out — then tier 5 for the definition rows). PURE.
 */
export function scopeRows({ rows, universe, vocab, rulings, pageSet }) {
  const v = [];
  const retired = new Set((pageSet.pages || []).filter((p) => p.status === 'retired').map((p) => p.key));
  const pinned = new Set((pageSet.pages || []).filter((p) => p.role === 'section').map((p) => p.key));
  const ids = new Set();
  const rules = [];
  for (const r of universe.scope_rules || []) {
    if (ids.has(r.id)) v.push(`scope_rule_invalid: ${r.id} id repeated`);
    ids.add(r.id);
    rules.push(compileRule(r, vocab, retired, pinned, rulings, v));
  }
  for (const p of retired) if (!rules.some((r) => r.kind === 'page_status' && matchPages(r).includes(p))) v.push(`retired_page_unruled: ${p}`);
  const seenIds = new Set();
  for (const row of rows) {
    if (seenIds.has(row.regulation_id)) v.push(`scope_ambiguous: regulation_id ${row.regulation_id} occurs twice in the slice`);
    seenIds.add(row.regulation_id);
  }
  const nonDef = rules.filter((r) => r.tier !== 5);
  const defRules = rules.filter((r) => r.tier === 5);
  const out = new Map();
  for (const row of rows) if (row.kind !== 'definition') out.set(row.regulation_id, { row, res: resolve(row, nonDef, new Set(), v) });
  const usage = definitionUsage({ rows, inScope: (r) => out.get(r.regulation_id)?.res.scope === 'in_scope', matcher: vocab.definitions_matcher || {} });
  for (const row of rows) if (row.kind === 'definition') out.set(row.regulation_id, { row, res: resolve(row, [...defRules, ...nonDef.filter((r) => r.tier < 5)], usage.used, v) });
  for (const r of rules) if (r.hits === 0 && !r.invalid) v.push(`scope_rule_orphan: ${r.id} matches no row`);
  const scoped = [...out.values()]
    .map(({ row, res }) => ({ evidence: res.evidence ?? null, kind: row.kind, page: row.page, reason: res.reason ?? null, regulation_id: row.regulation_id, rule_id: res.rule_id ?? null, ruling: res.ruling ?? null, scope: res.scope, shadowed: res.shadowed || [] }))
    .sort((a, b) => cmpStr(a.page, b.page) || cmpStr(a.regulation_id, b.regulation_id));
  return { rows: scoped, usage, violations: v };
}

/** The counts universe.lock.json pins (two directions: counts and the in-scope id set). PURE. */
export function universeCounts(scoped, toc = null) {
  const c = { awaiting_ruling: {}, by_page: {}, in_scope: 0, out_of_scope: {}, rows: scoped.length };
  const inIds = [];
  for (const r of scoped) {
    const p = (c.by_page[r.page] ||= { awaiting_ruling: 0, in_scope: 0, out_of_scope: 0 });
    if (r.scope === 'in_scope') {
      c.in_scope++;
      p.in_scope++;
      inIds.push(r.regulation_id);
    } else if (r.scope === 'out_of_scope') {
      c.out_of_scope[r.reason] = (c.out_of_scope[r.reason] || 0) + 1;
      p.out_of_scope++;
    } else if (r.scope === 'awaiting_ruling') {
      c.awaiting_ruling[r.reason] = (c.awaiting_ruling[r.reason] || 0) + 1;
      p.awaiting_ruling++;
    }
  }
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => cmpStr(a[0], b[0])));
  c.out_of_scope = sortObj(c.out_of_scope);
  c.awaiting_ruling = sortObj(c.awaiting_ruling);
  c.by_page = sortObj(c.by_page);
  c.in_scope_ids_sha256 = sha256(inIds.sort(cmpStr).join('\n'));
  c.definitions_in_scope = scoped.filter((r) => r.kind === 'definition' && r.scope === 'in_scope').length;
  if (toc) c.toc = toc.counts;
  return c;
}

/** The fields of a lock that must equal the computation (the ruling + adoption are provenance, not counts). */
const LOCK_KEYS = Object.freeze(['awaiting_ruling', 'by_page', 'in_scope', 'in_scope_ids_sha256', 'out_of_scope', 'rows', 'definitions_in_scope', 'toc']);

/**
 * G-UNIVERSE TOC + scope arms. Inputs are the loaded seeds (see universeInputs). Returns
 * {status: 'pass'|'fail'|'not_run', pass, violations, notes, checked, counts}. PURE.
 */
export function checkUniverse({ rows, pages, pageSet, universe, vocab, spec69Text, lock, ledger, adoptionId }) {
  const rulings = parseRulings(spec69Text);
  const pre = rulings.size === 0 ? ['ruling_not_ratified: Spec 69 parsed to 0 rulings (Spec 68 §9 G-PROV: a 0-ruling parse FAILS)'] : [];
  const toc = checkToc({ pages, pageSet, universe, vocab, rulings });
  const sc = scopeRows({ rows, universe, vocab, rulings, pageSet });
  const counts = universeCounts(sc.rows, toc);
  const violations = [...pre, ...toc.violations, ...sc.violations];
  const notes = [];
  let status = violations.length ? 'fail' : 'pass';
  if (!lock) {
    notes.push('universe_lock_absent: universe.lock.json is not pinned yet (--accept --ruling=<id>)');
    if (status === 'pass') status = 'not_run';
  } else if (!isStr(adoptionId) || !isStr(lock.adoption_id)) {
    violations.push(`universe_lock_mismatch: adoption id missing (lock ${lock.adoption_id}, current ${adoptionId})`);
    status = 'fail';
  } else if (lock.adoption_id !== adoptionId) {
    notes.push(`universe_lock_stale: pinned under ${lock.adoption_id}, current adoption ${adoptionId} (re-pin with --accept)`);
    if (status === 'pass') status = 'not_run';
  } else {
    for (const k of LOCK_KEYS) if (stableStringify(lock[k] ?? null) !== stableStringify(counts[k] ?? null)) violations.push(`universe_lock_mismatch: ${k} differs from universe.lock.json`);
    const pins = ((ledger && ledger.rows) || []).filter((r) => r.kind === 'universe_pin');
    const last = pins[pins.length - 1];
    if (!last || last.ruling !== lock.ruling || last.in_scope_ids_sha256 !== lock.in_scope_ids_sha256 || last.adoption_id !== lock.adoption_id) violations.push('universe_ledger_mismatch: the latest universe_pin row does not match universe.lock.json');
    if (rulings.get(lock.ruling) !== 'RATIFIED') violations.push(`ruling_not_ratified: universe.lock.json cites ${lock.ruling}`);
    status = violations.length ? 'fail' : 'pass';
  }
  const checked = sc.rows.length + toc.entries.length;
  return { checked, counts, notes, pass: status === 'pass', scoped: sc.rows, status, toc: toc.entries, usage: sc.usage, violations };
}

// ---------------------------------------------------------------- I/O: inputs, accept

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);

/**
 * Load every committed input checkUniverse needs (pages, page set, rules, vocab, Spec 69, lock, ledger, slice rows).
 * `slice` is injected (slice.mjs sliceSnapshot output) so this module does not depend on the slicer's internals.
 */
export function universeInputs({ root, slice, pages, adoptionId }) {
  const seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  return {
    adoptionId,
    ledger: readJson(path.join(root, LEDGER_REL), { rows: [] }),
    lock: readJson(path.join(root, LOCK_REL), null),
    pageSet: JSON.parse(fs.readFileSync(path.join(seeds, 'page-set.json'), 'utf8')),
    pages,
    rows: slice.rows,
    spec69Text: fs.readFileSync(path.join(root, SPEC69_REL), 'utf8'),
    universe: JSON.parse(fs.readFileSync(path.join(root, UNIVERSE_REL), 'utf8')),
    vocab: JSON.parse(fs.readFileSync(path.join(seeds, 'vocab.json'), 'utf8')),
  };
}

/**
 * `--accept --ruling=<id>` for the universe (Spec 68 §8 rule 7): refuse unless <id> is a RATIFIED Spec 69 row, every
 * gate violation other than the lock comparison is clear, and nothing awaits a ruling (no judgment rule or page rule
 * without a ruling). Then write universe.lock.json and append a `universe_pin` row to ratchet-exceptions.json
 * (row shape and literal-anchor citation copied from gates/ledger.mjs semantics). Atomic writes, sorted keys, LF.
 */
export function acceptUniverse({ root, ruling, inputs }) {
  if (!isStr(inputs.adoptionId)) throw new UniverseError('universe_lock_mismatch', 'refused: no current adoption id');
  const rulings = parseRulings(inputs.spec69Text);
  if (rulings.get(ruling) !== 'RATIFIED') throw new UniverseError('ruling_not_ratified', `--ruling=${ruling} is ${rulings.get(ruling) || 'absent'} in Spec 69`);
  if (!inputs.spec69Text.includes(`**${ruling}**`)) throw new UniverseError('ruling_not_ratified', `Spec 69 does not cite **${ruling}** literally`);
  const r = checkUniverse({ ...inputs, lock: null });
  const blocking = r.violations.filter((x) => !x.startsWith('universe_'));
  if (blocking.length) throw new UniverseError(blocking[0].split(':')[0], `refused: ${blocking.length} violation(s): ${blocking.slice(0, 5).join('; ')}`);
  const awaiting = Object.values(r.counts.awaiting_ruling).reduce((s, n) => s + n, 0) + r.counts.toc.awaiting_ruling;
  if (awaiting > 0) throw new UniverseError('awaiting_ruling', `refused: ${awaiting} row(s) / page rule(s) still await an operator ruling (see .cursor/mcbylaw/s5-rulings-needed.md)`);
  const lock = { adoption_id: inputs.adoptionId, ruling, vocab_version: inputs.vocab.version };
  for (const k of LOCK_KEYS) lock[k] = r.counts[k];
  const current = readJson(path.join(root, LOCK_REL), null);
  if (current && stableStringify(current) === stableStringify(lock)) return { counts: r.counts, lock, unchanged: true }; // idempotent re-accept
  // ledger first, then the lock: a failure between the two leaves an orphan pin row (RED, re-accept repairs it),
  // never a lock that no ledger row authorizes
  const ledger = readJson(path.join(root, LEDGER_REL), { rows: [] });
  ledger.rows = [...(ledger.rows || []), { adjudicated_by: 'operator', adoption_id: inputs.adoptionId, anchor: `**${ruling}**`, in_scope: r.counts.in_scope, in_scope_ids_sha256: r.counts.in_scope_ids_sha256, kind: 'universe_pin', ruling, spec_ref: SPEC69_REL }];
  writeAtomic(path.join(root, LEDGER_REL), stableStringify(ledger));
  writeAtomic(path.join(root, LOCK_REL), stableStringify(lock));
  return { counts: r.counts, lock };
}

// ---------------------------------------------------------------- self-test

const SPEC69_FIXTURE = ['| **M-31** | x | y | G-UNIVERSE | RATIFIED 2026-10-06 (decision 2) |', '| **M-47** | x | y | G-UNIVERSE | RATIFIED 2026-10-07 |', '| **M-90** | x | y | G-UNIVERSE | PROPOSED |', '| ~~M-19~~ | RETIRED → P-1. | | | RETIRED |'].join('\n');

const tocHtml = (rows) => rows.map(([id, href, title]) => `<TR><TD>${/^\d+$/.test(id) ? `Chapter ${id}` : id}</TD><TD><A HREF="${href}">${title}</A></TD></TR>`).join('\n');

/** A two-page fixture: ch10_20 (RD) and a retired ch230_20, TOC listing chapters 10, 230 and 30. */
export function fixtureInputs() {
  const html = tocHtml([['10', 'ZBL_NewProvision_Chapter10_20.htm', 'Residential'], ['230', 'ZBL_NewProvision_Chapter230_20.htm', 'Bicycle'], ['30', 'ZBL_NewProvision_Chapter30.htm', 'Commercial'], ['10.20', 'ZBL_NewProvision_Chapter10_20.htm', 'RD'], ['10.20.40.70', '#10.20.40.70', 'Setbacks'], ['230.20', 'ZBL_NewProvision_Chapter230_20.htm', 'RA'], ['10.30', 'ZBL_NewProvision_Chapter10_30.htm', 'Unpinned']]);
  const reg = (id, page, verbatim, kind = 'regulation') => ({ article: id.replace(/\(.*$/, ''), kind, page, regulation_id: id, verbatim, ...(kind === 'definition' ? { term: verbatim.replace(/^\(\d+\) (.*?) means.*$/, '$1') } : {}) });
  return {
    adoptionId: 'adoption-1',
    ledger: { rows: [] },
    lock: null,
    pageSet: { pages: [{ key: 'ch1', role: 'toc_root' }, { key: 'ch10_20', role: 'section', section: '10.20' }, { key: 'ch230_20', role: 'section', section: '230.20', status: 'retired' }, { key: 'ch800_50', role: 'section', section: '800.50' }] },
    pages: [{ key: 'ch1', html }, { key: 'ch10_20', html }, { key: 'ch230_20', html }, { key: 'ch800_50', html }],
    rows: [
      reg('10.20.40.70(1)', 'ch10_20', '(1) Front Yard Setback The required minimum front yard setback is 6.0 metres.'),
      reg('10.20.40.70(2)', 'ch10_20', '(2) (THIS DOES NOT CURRENTLY CONTAIN A REGULATION) [ By-law: 1-2020 ]'),
      reg('10.20.20.100(1)', 'ch10_20', '(1) Ambulance Depot In the RD zone, an ambulance depot must be on a major street.'),
      reg('230.20.1.20(1)', 'ch230_20', '(1) Bicycle Parking Standards in the RA zone'),
      reg('800.50(290)', 'ch800_50', '(290) Front Yard Setback means the distance.', 'definition'),
      reg('800.50(55)', 'ch800_50', '(55) Apartment Building means a building.', 'definition'),
    ],
    spec69Text: SPEC69_FIXTURE,
    universe: {
      page_rules: [{ entry: '30', level: 'chapter', disposition: 'out', reason: 'other_zone_category', ruling: null }, { entry: '10.30', level: 'section', disposition: 'deferred', reason: 'deferred_by_ruling', ruling: 'M-47' }],
      scope_rules: [
        { id: 'SR-DELETED', tier: 1, kind: 'mechanical', scope: 'out', reason: 'deleted_slot', match: { verbatim_patterns: ['THIS DOES NOT CURRENTLY CONTAIN A REGULATION'] }, evidence: ['does not currently contain'] },
        { id: 'SR-RETIRED', tier: 2, kind: 'page_status', scope: 'out', reason: 'apartment_building_only', ruling: 'M-47', match: { pages: ['ch230_20'] } },
        { id: 'SR-NONRES', tier: 4, kind: 'judgment', scope: 'out', reason: 'non_residential_use_condition', ruling: null, match: { article_patterns: ['\\.20\\.100$'] }, evidence: ['ambulance depot'] },
        { id: 'SR-DEF-UNUSED', tier: 5, kind: 'mechanical', scope: 'out', reason: 'definition_not_used', match: { kinds: ['definition'], definition_used: false } },
        { id: 'SR-DEF-USED', tier: 5, kind: 'mechanical', scope: 'in', match: { kinds: ['definition'], definition_used: true } },
        { id: 'SR-IN', tier: 6, kind: 'page_scope', scope: 'in', basis: 'phase0', match: { kinds: ['regulation', 'article'], pages: ['ch10_20'] } },
      ],
    },
    vocab: {
      definitions_matcher: { case_insensitive: true, plurals: ['s'], longest_first: true, transitive: true },
      scope: {
        out_of_scope_reason: { deleted_slot: { kind: 'mechanical' }, definition_not_used: { kind: 'mechanical' }, apartment_building_only: { kind: 'judgment' }, non_residential_use_condition: { kind: 'judgment' }, administrative_no_application_effect: { kind: 'judgment' } },
        page_rule_disposition: ['out', 'map_rule', 'deferred'],
        page_rule_reason: { other_zone_category: 'x', deferred_by_ruling: 'y' },
      },
      version: 'fixture',
    },
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const mut = (fn) => () => {
  const i = fixtureInputs();
  fn(i);
  return i;
};
const lockFor = (i, ruling = 'M-47') => {
  const r = checkUniverse({ ...i, lock: null });
  const lock = { adoption_id: i.adoptionId, ruling, vocab_version: 'fixture' };
  for (const k of LOCK_KEYS) lock[k] = clone(r.counts[k]);
  return lock;
};
const pinned = (fn) => mut((i) => {
  i.lock = lockFor(i);
  i.ledger = { rows: [{ kind: 'universe_pin', ruling: 'M-47', adoption_id: i.adoptionId, in_scope_ids_sha256: i.lock.in_scope_ids_sha256 }] };
  fn(i);
});

/** One known-bad fixture per reason code, plus the good twins (unpinned → not_run; pinned → pass). */
export const FIXTURES = Object.freeze([
  { reason: null, name: 'good twin, unpinned: not_run, nothing fails', input: mut(() => {}), status: 'not_run' },
  { reason: null, name: 'good twin, pinned: pass', input: pinned(() => {}), status: 'pass' },
  { reason: 'toc_root_missing', input: mut((i) => (i.pageSet.pages = i.pageSet.pages.filter((p) => p.role !== 'toc_root'))) },
  { reason: 'toc_empty', input: mut((i) => { i.pages = i.pages.map((p) => ({ ...p, html: '' })); i.universe.page_rules = []; }) },
  { reason: 'toc_page_missing', input: mut((i) => i.pageSet.pages.push({ key: 'ch10_40', role: 'section', section: '10.40' })) },
  { reason: 'toc_unmapped', input: mut((i) => i.universe.page_rules.shift()) },
  { reason: 'page_rule_invalid', input: mut((i) => (i.universe.page_rules[0].disposition = 'maybe')) },
  { reason: 'page_rule_orphan', input: mut((i) => i.universe.page_rules.push({ entry: '77', level: 'chapter', disposition: 'out', reason: 'other_zone_category', ruling: null })) },
  { reason: 'scope_rule_invalid', input: mut((i) => i.universe.scope_rules.push({ id: 'SR-BAD', tier: '1', kind: 'mechanical', scope: 'out', reason: 'deleted_slot', match: { regulation_ids: ['99.9(9)'] }, evidence: ['no such'] })) },
  { reason: 'scope_rule_orphan', input: mut((i) => i.universe.scope_rules.splice(2, 0, { id: 'SR-NONE', tier: 4, kind: 'judgment', scope: 'out', reason: 'non_residential_use_condition', ruling: null, match: { regulation_ids: ['99.9(9)'] }, evidence: ['no such'] })) },
  { reason: 'scope_unmatched', input: mut((i) => i.rows.push({ article: '10.20.40.80', kind: 'regulation', page: 'ch10_21', regulation_id: '10.21.40.80(1)', verbatim: '(1) x' })) },
  { reason: 'scope_ambiguous', input: mut((i) => i.universe.scope_rules.splice(3, 0, { id: 'SR-NONRES-2', tier: 4, kind: 'judgment', scope: 'out', reason: 'non_residential_use_condition', ruling: null, match: { regulation_ids: ['10.20.20.100(1)'] }, evidence: ['ambulance depot'] })) },
  { reason: 'scope_evidence_missing', input: mut((i) => (i.universe.scope_rules[2].evidence = ['fire hall'])) },
  { reason: 'retired_page_unruled', input: mut((i) => { i.universe.scope_rules.splice(1, 1); i.rows = i.rows.filter((r) => r.page !== 'ch230_20'); }) },
  { reason: 'ruling_not_ratified', input: mut((i) => (i.universe.page_rules[0].ruling = 'M-90')) },
  { reason: 'universe_lock_mismatch', input: pinned((i) => (i.lock.in_scope += 1)) },
  { reason: 'universe_ledger_mismatch', input: pinned((i) => (i.ledger.rows = [])) },
]);

export function selfTest() {
  const results = [];
  for (const f of FIXTURES) {
    const r = checkUniverse(f.input());
    const codes = [...new Set(r.violations.map((x) => x.split(':')[0]))];
    const ok = f.reason === null ? r.violations.length === 0 && r.status === f.status : r.status === 'fail' && codes.length === 1 && codes[0] === f.reason;
    results.push({ name: f.name || f.reason, expected: f.reason, got: codes, status: r.status, ok });
  }
  const covered = new Set(FIXTURES.map((f) => f.reason).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, ok: false, got: [] });
  return { pass: results.every((r) => r.ok), results };
}
