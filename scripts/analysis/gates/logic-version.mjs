// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan P2-C3: logic_version closed rule + fingerprint_inputs E — fold 8 item 1 (b2), fold 8b items 4-5, fold 8c item 4)
//
// GATE P2-C3 — TWO closed rules over the CONVERTED fleet, one per half:
//
// (1) `staleness.logic_version` is HAND-BUMPED (fold 8 item 1, ruling b2): a
//     deliberate SEMANTIC signal a human raises when the step's ANSWER changes,
//     NEVER a files hash and never a derived value. THE CLOSED RULE:
//     `logic_version` != "none"  <=>  the step declares a `staleness.trigger[]`
//     entry with `signal: "code_version"`. Both directions are RED:
//       * a non-"none" value with NO code_version trigger — nothing reads it,
//         so the hand-bump is an unenforced promise; and
//       * a code_version trigger with `logic_version: "none"` — the trigger
//         has nothing to compare, so it can never fire.
//     A MISSING `logic_version` counts as "none" (vacuously equal to "none",
//     so such a step is only RED when it DOES declare a code_version trigger).
//
// (2) `staleness.fingerprint_inputs` is E: every entry is EITHER
//       * a DECLARED DATA SIGNAL in the `<table>:<signal>` grammar —
//         `<table>` and `<column>` are `[a-z_][a-z0-9_]*`, `<signal>` is
//         `count` or `<column>_null_count` — or
//       * a REPO-RELATIVE FILE THAT IS A REAL IMPORT OF THE STEP: reachable by
//         the transitive RELATIVE `require(...)` / `import ... from` /
//         `import(...)` walk from the CONVERTED step file (the shell, which
//         requires its compute).
//     An entry carrying a `:` that does not match the grammar is an UNDECLARED
//     data-signal form (RED). Any other entry the walk does not reach is RED
//     (not a real import). `"none"` declares nothing and is out of scope.
//
// No allowlist, no ledger (R-BC): both halves are derived from converted.json
// (R-AN) and the files on disk, never from a retyped list.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConvertedJson } from './converted-set.mjs';
import { descriptorPathFor } from './notes-cap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** The closed `<table>:<signal>` grammar of a DECLARED data signal. FINAL. */
export const DATA_SIGNAL_RE = /^[a-z_][a-z0-9_]*:(count|[a-z_][a-z0-9_]*_null_count)$/;

/** THE logic_version rule, one line (rule (1) above). FINAL. */
export const LOGIC_VERSION_RULE = 'staleness.logic_version is HAND-BUMPED: `logic_version` != "none" <=> the step declares a `staleness.trigger[]` entry with `signal: "code_version"`; both directions are RED (a value nothing reads, or a trigger that compares nothing).';

/** Extension suffixes `requireWalk` tries (in order) when resolving a relative specifier. */
const RESOLVE_SUFFIXES = Object.freeze(['.js', '.cjs', '.mjs']);

/** The import/require forms the walk parses; the SECOND capture group is the specifier. */
const IMPORT_PATTERNS = Object.freeze([
  /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g,
  /\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g,
]);

/**
 * Does this descriptor declare a `staleness.trigger[]` entry with
 * `signal: "code_version"`? Half of rule (1) — the trigger that makes a
 * hand-bumped `logic_version` a live signal.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @returns {boolean}
 */
export function hasCodeVersionTrigger(descriptor) {
  const t = descriptor?.staleness?.trigger;
  return Array.isArray(t) && t.some((row) => row && row.signal === 'code_version');
}

/**
 * Every `staleness.logic_version` violation in ONE step (rule (1)). PURE — no
 * disk. Item is always `'staleness.logic_version'`. Both directions RED: a
 * non-`"none"` value with no code_version trigger, and a code_version trigger
 * with a `"none"`/missing `logic_version`.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @returns {Array<{step: string, item: string, detail: string}>}
 */
export function logicVersionViolations(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const lv = descriptor?.staleness?.logic_version;
  const declared = lv !== undefined && lv !== null && lv !== 'none';
  const cv = hasCodeVersionTrigger(descriptor);
  if (declared === cv) return [];
  const detail = declared && !cv
    ? `${step}: logic_version ${JSON.stringify(lv)} but no staleness.trigger[] entry signal "code_version" — nothing reads it; set "none" or declare the trigger — ${LOGIC_VERSION_RULE}`
    : `${step}: a code_version trigger is declared but logic_version is ${JSON.stringify(lv ?? 'none')} — the trigger compares nothing — ${LOGIC_VERSION_RULE}`;
  return [{ step, item: 'staleness.logic_version', detail }];
}

/**
 * Every repo-relative POSIX path reachable from `entryRel` by the transitive
 * RELATIVE `require(...)` / `import ... from` / `import(...)` walk, INCLUDING
 * `entryRel` itself. REAL I/O plumbing (not a rule): `read(rel)` returns the
 * file text or `null` when absent, and the resolved candidate is the FIRST one
 * `read` answers for. A specifier that does not start `./` or `../` (a package
 * or an absolute path) is skipped, as is a `.json` specifier — a descriptor is
 * read at runtime but is never a source import. Never visits a file twice.
 * @param {string} entryRel repo-relative POSIX path of the converted step file
 * @param {(rel: string) => (string|null)} read
 * @returns {Set<string>}
 */
export function requireWalk(entryRel, read) {
  const start = String(entryRel).replace(/\\/g, '/');
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const text = read(cur);
    if (typeof text !== 'string') continue;
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      while (match) {
        const spec = match[2];
        match = pattern.exec(text);
        if (!spec) continue;
        if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
        if (spec.endsWith('.json')) continue;
        const base = path.posix.join(path.posix.dirname(cur), spec).replace(/\\/g, '/');
        const resolvable = spec.endsWith('.js') || spec.endsWith('.cjs') || spec.endsWith('.mjs');
        const candidates = resolvable
          ? [base]
          : [...RESOLVE_SUFFIXES.map((ext) => `${base}${ext}`), `${base}/index.js`];
        const hit = candidates.find((candidate) => typeof read(candidate) === 'string');
        if (!hit || seen.has(hit)) continue;
        seen.add(hit);
        queue.push(hit);
      }
    }
  }
  return seen;
}

/**
 * The `staleness.fingerprint_inputs` half for ONE step (rule (2)). PURE — the
 * caller supplies the step's already-walked `imports` Set. Item is always
 * `'staleness.fingerprint_inputs'`.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @param {Set<string>} imports the step's `requireWalk` result
 * @returns {Array<{step: string, item: string, detail: string}>}
 */
export function fingerprintInputViolations(descriptor, imports) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const fi = descriptor?.staleness?.fingerprint_inputs;
  if (!Array.isArray(fi)) return [];
  const out = [];
  for (const entry of fi) {
    if (typeof entry !== 'string') continue;
    if (DATA_SIGNAL_RE.test(entry)) continue;
    if (entry.includes(':')) {
      out.push({
        step,
        item: 'staleness.fingerprint_inputs',
        detail: `${step}: fingerprint_inputs entry ${JSON.stringify(entry)} is an undeclared data-signal form (grammar <table>:count | <table>:<column>_null_count)`,
      });
      continue;
    }
    if (imports instanceof Set && imports.has(entry.replace(/\\/g, '/'))) continue;
    out.push({
      step,
      item: 'staleness.fingerprint_inputs',
      detail: `${step}: fingerprint_inputs entry ${JSON.stringify(entry)} is not a real import of the step (not reached by the relative require/import walk from its step file)`,
    });
  }
  return out;
}

/**
 * Gate P2-C3 over the whole converted fleet.
 * @param {Array<{descriptor: object, imports: Set<string>}>} entries
 * @returns {{pass: boolean, blockedSlugs: string[], detail: string, violations: Array<object>, checked: number}}
 */
export function checkLogicVersion(entries) {
  const violations = [];
  let checked = 0;
  for (const entry of entries || []) {
    violations.push(...logicVersionViolations(entry?.descriptor));
    violations.push(...fingerprintInputViolations(entry?.descriptor, entry?.imports));
    const fi = entry?.descriptor?.staleness?.fingerprint_inputs;
    if (Array.isArray(fi)) checked += fi.length;
  }
  const blockedSlugs = [...new Set(violations.map((v) => v.step))].sort();
  const pass = violations.length === 0;
  const detail = pass
    ? `LOGIC-VERSION (P2-C3): ${(entries || []).length} step(s) logic_version <=> code_version trigger; ${checked} fingerprint_inputs entr(y/ies) examined, 0 violations`
    : `LOGIC-VERSION (P2-C3): ${violations.length} violation(s) [${violations.map((v) => `${v.step} ${v.item}`).join('; ')}]; ${checked} fingerprint_inputs entr(y/ies) examined`;
  return { pass, blockedSlugs, detail, violations, checked };
}

/**
 * Every converted step joined to its own import closure, in `converted.json`
 * order (R-AN). REAL I/O: reads each descriptor beside its step file and walks
 * that step file with the on-disk reader. A converted entry with no readable
 * descriptor THROWS (a broken registry is never something to skip).
 * @param {string} [repoRoot]
 * @returns {Array<{descriptor: object, slug: string, entry: string, imports: Set<string>}>}
 */
export function loadLogicVersionFleet(repoRoot = REPO_ROOT) {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(repoRoot, String(rel).replace(/\\/g, '/')), 'utf8');
    } catch {
      return null;
    }
  };
  const parsed = readConvertedJson(repoRoot);
  const files = Array.isArray(parsed.converted) ? parsed.converted : [];
  return files.map((relFile) => {
    const entry = String(relFile).replace(/\\/g, '/');
    const descriptorRel = descriptorPathFor(entry);
    let descriptor;
    try {
      const text = read(descriptorRel);
      if (text === null) throw new Error('file not found');
      descriptor = JSON.parse(text);
    } catch (e) {
      throw new Error(`converted step ${entry} has no readable descriptor at ${descriptorRel}: ${e.message}`);
    }
    const slug = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
    return { descriptor, slug, entry, imports: requireWalk(entry, read) };
  });
}

/**
 * In-memory fixtures + assertions. Throws on the first failure.
 */
export function selfTest() {
  const mk = (over = {}) => ({
    identity: { name: 'fixture_step', archetype: 'LINK' },
    staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: 'none' },
    ...over,
  });
  const cvRow = { signal: 'code_version', position: 'pre_compute', emit_key: 'code_version' };
  const fail = (label, extra) => {
    throw new Error(`self-test FAILED (${label}): ${extra}`);
  };
  const want = (label, got, expected) => {
    if (got !== expected) fail(label, `expected ${expected}, got ${got}`);
  };

  want(
    'code_version trigger + v1',
    logicVersionViolations(mk({ staleness: { trigger: [cvRow], logic_version: 'v1', fingerprint_inputs: 'none' } })).length,
    0,
  );
  want(
    'none trigger + v1',
    logicVersionViolations(mk({ staleness: { trigger: 'none', logic_version: 'v1', fingerprint_inputs: 'none' } })).length,
    1,
  );
  want(
    'code_version trigger + none',
    logicVersionViolations(mk({ staleness: { trigger: [cvRow], logic_version: 'none', fingerprint_inputs: 'none' } })).length,
    1,
  );

  want(
    'reached import + declared data signal',
    fingerprintInputViolations(
      mk({ staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: ['a.js', 'parcels:count'] } }),
      new Set(['a.js']),
    ).length,
    0,
  );
  want(
    'unreached import',
    fingerprintInputViolations(
      mk({ staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: ['b.js'] } }),
      new Set(['a.js']),
    ).length,
    1,
  );
  want(
    'undeclared data-signal form',
    fingerprintInputViolations(
      mk({ staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: ['parcels:max_x'] } }),
      new Set(['a.js']),
    ).length,
    1,
  );

  const map = { 's.js': "require('./c')", 'c.js': '' };
  const read = (rel) => (rel in map ? map[rel] : null);
  want('requireWalk closure size', requireWalk('s.js', read).size, 2);
}
