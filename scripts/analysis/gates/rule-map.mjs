// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DF, R-AM, R-BA (operator y 2026-10-20 consolidation 1-4)
//
// The rule map (scripts/steps/_schema/rule-map.json) ties every Spec 124 register id and every other
// step-standard id to exactly one line of the handbook, Spec 132 (docs/specs/01-pipeline/132_step_standard_handbook.md;
// Spec 124 R-GU, operator y 2026-10-20; docs/handbook/step-standard.md is now a pointer). The register
// stays the authority; the handbook is the reading surface. This module is the one reader: the lock
// (src/tests/handbook-rule-map.logic.test.ts), the generator (scripts/generate-step-handbook.mjs) and
// step-validate's unenforced-rule print all read through it.
//
// Register ids are read by extractRegisterRulingIds (spec-split-check.mjs), the same reader R-EY (9)
// and spec-split-check arm (iii) use, so an id resolves here exactly when it resolves there.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRegisterRulingIds } from '../spec-split-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const RULE_MAP_REL = 'scripts/steps/_schema/rule-map.json';
export const HANDBOOK_REL = 'docs/specs/01-pipeline/132_step_standard_handbook.md';
export const BYLAW_RULE_MAP_REL = 'scripts/analysis/bylaw/_schema/bylaw-rule-map.json';
export const BYLAW_HANDBOOK_REL = 'docs/specs/01-pipeline/133_bylaw_handbook.md';
/**
 * The generated handbooks, keyed by spec id (Spec 124 R-IY; 124a §B25: "generated_size_caps and arm (iii-b)'s resolver
 * are keyed by spec id"). 132 is the step handbook (rule map hand-curated from the Spec 124 register); 133 is the by-law
 * handbook (rule map GENERATED from the Spec 69a M-rows and Spec 131 LC-rows, Spec 69a M-260).
 */
export const HANDBOOKS = Object.freeze({
  '132': Object.freeze({ spec: '132', ruleMapRel: RULE_MAP_REL, handbookRel: HANDBOOK_REL, generator: 'scripts/generate-step-handbook.mjs' }),
  '133': Object.freeze({ spec: '133', ruleMapRel: BYLAW_RULE_MAP_REL, handbookRel: BYLAW_HANDBOOK_REL, generator: 'scripts/generate-bylaw-handbook.mjs' }),
});

export function loadHandbookRuleMap(specId, repoRoot = REPO_ROOT) {
  const h = HANDBOOKS[specId];
  if (!h) throw new Error(`no handbook registered for Spec ${specId}`);
  return JSON.parse(fs.readFileSync(path.join(repoRoot, h.ruleMapRel), 'utf8'));
}

export const SPEC_124_REL = 'docs/specs/01-pipeline/124_step_standard_policy.md';
export const SPEC_124A_REL = 'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md';
export const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';
export const STEP_VALIDATE_REL = 'scripts/analysis/step-validate.mjs';
export const GATES_DIR_REL = 'scripts/analysis/gates';

/** Statuses whose rule is in force (must map to a live line and be enforced or listed unenforced). */
export const IN_FORCE = Object.freeze(['active', 'amended-by', 'process', 'one-off']);
export const HISTORY_SECTION = 'history';

export function loadRuleMap(repoRoot = REPO_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, RULE_MAP_REL), 'utf8'));
}

export function readRegisterIds(repoRoot = REPO_ROOT) {
  const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  return extractRegisterRulingIds(read(SPEC_124_REL), read(SPEC_124A_REL));
}

/** Text a `check` enforcement ref must name a token in: step-validate plus every gate module. */
export function readCheckCorpus(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, GATES_DIR_REL);
  const gates = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  return [fs.readFileSync(path.join(repoRoot, STEP_VALIDATE_REL), 'utf8'), ...gates].join('\n');
}

/** Defect ids the ledger defines (`| <ID> | ...` rows), each with its 1-based line number in the ledger. */
export function readDefectLines(repoRoot = REPO_ROOT) {
  const ids = new Map();
  fs.readFileSync(path.join(repoRoot, DEFECT_LEDGER_REL), 'utf8').split('\n').forEach((line, i) => {
    const m = /^\|\s*([A-Z0-9]+-D[0-9]+[a-z]?)\s*\|/.exec(line);
    if (m && !ids.has(m[1])) ids.set(m[1], i + 1);
  });
  return ids;
}

/** Defect ids the ledger defines. */
export function readDefectIds(repoRoot = REPO_ROOT) {
  return new Set(readDefectLines(repoRoot).keys());
}

/**
 * Tests that only check that ids resolve or that register rows name a lock. They mention almost every id, so they
 * never count as a rule's behavioural lock, except for a `process` (governance) rule whose subject is the register.
 */
export const META_TESTS = Object.freeze(['src/tests/spec124-register-locks.logic.test.ts', 'src/tests/handbook-rule-map.logic.test.ts']);
/** The rules a meta test IS the behavioural lock for (its subject is the register itself). */
export const META_TEST_SUBJECTS = Object.freeze({ 'src/tests/spec124-register-locks.logic.test.ts': Object.freeze(['R-DF']) });

const escapeId = (s) => s.replace(/[.\-]/g, (c) => `\\${c}`);
/** Does `text` name the rule: its id as a whole token (R-K does not match R-K.1 or R-KX), or one of its aliases. */
export function mentionsRule(text, rule) {
  const names = [...(rule.mention_by_alias_only ? [] : [rule.id]), ...(rule.aliases || [])];
  return names.some((n) => new RegExp(`(?<![A-Za-z0-9-])${escapeId(n)}(?![A-Za-z0-9]|\\.[0-9])`).test(text));
}

/** Why a lock / lock-db ref is not an honest lock for this rule, or null when it is. */
export function lockRefProblem(rule, io) {
  const enf = rule.enforcement || {};
  const ref = enf.ref || '';
  if (!/^src\/tests\/.+\.test\.ts$/.test(ref)) return `${enf.kind} ref is not a test under src/tests/: ${ref}`;
  const isDb = /\.db\.test\.ts$/.test(ref);
  if (enf.kind === 'lock' && isDb) return `lock ref ${ref} is a DB test that npm test never runs — declare kind "lock-db"`;
  if (enf.kind === 'lock-db' && !isDb) return `lock-db ref ${ref} is not a *.db.test.ts`;
  if (META_TESTS.includes(ref) && rule.status !== 'process' && !(META_TEST_SUBJECTS[ref] || []).includes(rule.id)) return `lock ref ${ref} is an id-resolution meta test, not a behavioural lock`;
  if (!io.exists(ref)) return `${enf.kind} ref does not resolve: ${ref}`;
  if (!mentionsRule(io.read(ref), rule)) return `${enf.kind} ref ${ref} never names ${rule.id}${(rule.aliases || []).length ? ` or ${rule.aliases.join('/')}` : ''} — add the id where the test asserts it, or downgrade`;
  return null;
}

/** A `check` ref is `step-validate <token>`; the token (e.g. `#44`, `G7`, `measureP3Footprint`) must appear in the corpus. */
function checkRefResolves(ref, corpus) {
  const m = /^step-validate (\S+)$/.exec(ref || '');
  if (!m) return false;
  const tok = m[1];
  if (tok.startsWith('#')) return corpus.includes(tok) || corpus.includes(`id: ${tok.slice(1)},`);
  return corpus.includes(tok);
}

/**
 * Every finding the map has against the repo. `io` = { registerIds:Set, exists(rel), read(rel), checkCorpus:string,
 * defectIds:Set }. Returns [{arm, id, detail}]; an empty array is GREEN.
 *   (a) a register id with no map entry
 *   (b) a map id twice, or a rule whose handbook_line is not a line
 *   (c) an in-force rule mapped only to a history line; a line citing no rule; a line in an unknown section
 *   (d) an id that does not resolve: register ids through extractRegisterRulingIds (a pending-integration id must
 *       NOT yet resolve), other ids through source.file + a literal anchor; `by` / merge / pending ids name map ids
 *   (e) an in-force rule with no enforcement that is not on `unenforced`; an `unenforced` entry that is stale (its
 *       rule is now enforced), names no rule, or is `partial` with no enforcement; a check/hook ref that does not
 *       resolve; a lock ref that is not a `npm test` test file naming the rule id or an alias (`lockRefProblem`:
 *       a DB test must be kind lock-db; an id-resolution meta test counts only for a process rule)
 */
export function checkRuleMap(map, io) {
  const out = [];
  const add = (arm, id, detail) => out.push({ arm, id, detail });
  const rules = map.rules || [];
  const byId = new Map();
  for (const r of rules) {
    if (byId.has(r.id)) add('b', r.id, 'listed more than once');
    byId.set(r.id, r);
  }
  for (const r of rules) {
    for (const a of r.aliases || []) if (byId.has(a) || rules.some((o) => o !== r && (o.aliases || []).includes(a))) add('b', r.id, `alias ${a} is not unique`);
    if (r.mention_by_alias_only && !(r.aliases || []).length) add('b', r.id, 'mention_by_alias_only with no alias');
  }
  const lines = new Map((map.lines || []).map((l) => [l.id, l]));
  const sections = new Set((map.sections || []).map((s) => s.id));
  const pending = new Set(((map.meta || {}).pending_integration || {}).rules || []);
  const pendingDefects = ((map.meta || {}).pending_integration || {}).defects || [];
  const unenforced = new Map((map.unenforced || []).map((u) => [u.id, u]));

  // (a)
  for (const id of io.registerIds) if (!byId.has(id)) add('a', id, 'register id has no rule-map entry (add one with its handbook_line)');

  for (const r of rules) {
    const line = lines.get(r.handbook_line);
    // (b)
    if (!line) { add('b', r.id, `handbook_line ${r.handbook_line} is not a line`); continue; }
    // (c)
    if (IN_FORCE.includes(r.status) && line.section === HISTORY_SECTION) add('c', r.id, `in-force (${r.status}) but mapped to history line ${line.id}`);
    // (d)
    const src = r.source || {};
    if (src.register) {
      const resolves = io.registerIds.has(r.id);
      if (src.pending_integration) {
        if (!pending.has(r.id)) add('d', r.id, 'pending_integration source but not in meta.pending_integration.rules');
        if (resolves) add('d', r.id, 'now resolves in the register — drop pending_integration and its meta entry');
      } else if (!resolves) add('d', r.id, 'register id does not resolve (extractRegisterRulingIds)');
    } else if (!src.file || !src.anchor) add('d', r.id, 'non-register id needs source.file + source.anchor');
    else if (!io.exists(src.file)) add('d', r.id, `source file ${src.file} missing`);
    else if (!io.read(src.file).includes(src.anchor)) add('d', r.id, `anchor not found in ${src.file}: ${src.anchor}`);
    for (const b of r.by || []) if (!byId.has(b)) add('d', r.id, `by ${b} is not a rule-map id`);
    // (e)
    const enf = r.enforcement || { kind: 'none' };
    if (IN_FORCE.includes(r.status) && enf.kind === 'none' && !unenforced.has(r.id)) add('e', r.id, 'in force with no enforcement and not on the unenforced list');
    if (enf.kind !== 'none') {
      if (enf.kind === 'check') {
        if (!checkRefResolves(enf.ref, io.checkCorpus)) add('e', r.id, `check ref does not resolve: ${enf.ref}`);
      } else if (enf.kind === 'hook') {
        if (!enf.ref || !io.exists(enf.ref)) add('e', r.id, `hook ref does not resolve: ${enf.ref}`);
      } else if (!src.pending_integration) {
        const problem = lockRefProblem(r, io);
        if (problem) add('e', r.id, problem);
      }
    }
  }
  for (const id of pending) if (!byId.has(id)) add('d', id, 'meta.pending_integration rule is not a rule-map id');
  for (const d of pendingDefects) if (io.defectIds.has(d)) add('d', d, 'pending defect now resolves in the defect ledger — drop it from meta.pending_integration.defects');
  for (const g of map.merges || []) {
    for (const id of g.ids) if (!byId.has(id)) add('d', id, `${g.id} names a non-rule`);
    for (const l of [].concat(g.line)) if (!lines.has(l)) add('d', g.id, `merge line ${l} is not a line`);
  }
  for (const l of lines.values()) {
    if (!sections.has(l.section)) add('c', l.id, `unknown section ${l.section}`);
    if (!rules.some((r) => r.handbook_line === l.id)) add('c', l.id, 'line cites no rule id');
  }
  for (const u of unenforced.values()) {
    const r = byId.get(u.id);
    if (!r) { add('e', u.id, 'unenforced entry names no rule'); continue; }
    if (u.class === 'none' && (r.enforcement || {}).kind !== 'none') add('e', u.id, 'listed unenforced (none) but now has enforcement — remove it (the list only shrinks)');
    if (u.class === 'partial' && (r.enforcement || {}).kind === 'none') add('e', u.id, 'listed partial but its enforcement is none — name the partial lock or check, or list it as none');
  }
  return out;
}

/**
 * Enforcement across the map. A rule listed `partial` on `unenforced` counts under `partial` whatever its kind; every
 * other rule counts under its kind, so `lock` is the number of rules a named test fully locks.
 */
export function enforcementCounts(map) {
  const partial = new Set((map.unenforced || []).filter((u) => u.class === 'partial').map((u) => u.id));
  const out = { lock: 0, 'lock-db': 0, check: 0, hook: 0, partial: 0, none: 0 };
  for (const r of map.rules || []) {
    const k = (r.enforcement || { kind: 'none' }).kind;
    if (k !== 'none' && partial.has(r.id)) out.partial += 1;
    else out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** The standing count step-validate prints: in-force rules with no or partial machine check. */
export function unenforcedSummary(map) {
  const byId = new Map((map.rules || []).map((r) => [r.id, r]));
  const listed = map.unenforced || [];
  const inForce = listed.filter((u) => byId.has(u.id) && IN_FORCE.includes(byId.get(u.id).status));
  return {
    total: listed.length,
    inForce: inForce.map((u) => u.id),
    none: inForce.filter((u) => u.class === 'none').map((u) => u.id),
    partial: inForce.filter((u) => u.class === 'partial').map((u) => u.id),
    notInForce: listed.length - inForce.length,
  };
}

export function defaultIo(repoRoot = REPO_ROOT) {
  const cache = new Map();
  return {
    registerIds: readRegisterIds(repoRoot),
    exists: (rel) => fs.existsSync(path.join(repoRoot, rel)),
    read: (rel) => { if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(repoRoot, rel), 'utf8')); return cache.get(rel); },
    checkCorpus: readCheckCorpus(repoRoot),
    defectIds: readDefectIds(repoRoot),
  };
}

/** step-validate's `--all` report line (never a hard stop): the standing unenforced-rule count, R-BA's own test. */
export function unenforcedReportLine(map) {
  const s = unenforcedSummary(map);
  return `[step-validate] rule-map: ${s.inForce.length} in-force rule(s) with no or partial machine check (${s.none.length} none, ${s.partial.length} partial): ${s.inForce.join(', ')}; ${s.notInForce} retired id(s) also listed (${RULE_MAP_REL} unenforced[], ${HANDBOOK_REL} §6)`;
}
