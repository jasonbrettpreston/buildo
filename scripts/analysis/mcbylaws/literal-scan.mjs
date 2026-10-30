// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-67 arm L); R-KN, R-KR, R-LA.
// Arm L: a bare literal in a by-law file is a second, invisible copy of a by-law tunable. Numbers must be
// 0/1/2/100 or allow-listed; strings must be allow-listed; JSON data modules are walked in JS; a
// `ast-grep-ignore` token is itself a failure (L8). The scanner fails CLOSED (L7). R-LA: the baseline is
// SHRINK-ONLY — a listed file may keep the literals counted at the base, never add one.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, deadGlobs } from './paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const RULE_FILE = 'scripts/ast-grep-rules/bylaw-literal.yml';
export const ALLOW_REL = 'mcbylaws/literal-allow.json';
const BASE_NUMBERS = [0, 1, 2, 100];
const NUMBER_RULE = 'bylaw-no-number-literal';
const STRING_RULE = 'bylaw-string-literal';
const fail = (code, detail) => (detail === undefined ? `FAIL:L:${code}` : `FAIL:L:${code}:${detail}`);

/** `{numbers:Set<number>, strings:Set<string>}` — numbers always carry the four allowed sentinels. */
export function allowSet(allowJson) {
  const a = allowJson && typeof allowJson === 'object' ? allowJson : {};
  const list = (k) => (Array.isArray(a[k]) ? a[k] : []);
  return {
    numbers: new Set([...BASE_NUMBERS, ...list('numbers').filter((n) => typeof n === 'number')]),
    strings: new Set([...list('status_words'), ...list('field_names')].filter((s) => typeof s === 'string')),
  };
}

/** L9: a hit on a module-specifier line is an import/export source, never a by-law string. */
const isModuleSource = (line) => /^\s*import\s/.test(line) || /\bfrom\s+['"]/.test(line);

/**
 * Run the two rules over ONE file. `ok:false` ONLY when the binary cannot spawn, stdout is not valid JSON,
 * or the exit status is neither 0 nor 1 (L7: a finding is exit 1, never a scanner failure).
 */
export function scanFile({ root, rel, astGrepBin, ruleFile }) {
  const res = spawnSync(astGrepBin, ['scan', '-r', ruleFile, '--json=compact', rel], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const broken = (why) => ({ ok: false, numbers: [], strings: [], error: why });
  if (res.error) return broken(`spawn: ${res.error.message}`);
  if (res.status !== 0 && res.status !== 1) return broken(`exit ${res.status}: ${res.stderr || ''}`);
  let parsed;
  try { parsed = JSON.parse(res.stdout || ''); } catch (e) { return broken(`json: ${e.message}`); }
  if (!Array.isArray(parsed)) return broken('json: not an array');
  const numbers = [];
  const strings = [];
  for (const m of parsed) {
    if (!m || typeof m !== 'object' || typeof m.text !== 'string') continue;
    const text = m.text.trim();
    if (text === '') continue;
    const range = m.range && m.range.start ? m.range.start : {};
    const lines = typeof range.line === 'number' ? lineText(root, rel, range.line) : '';
    if (m.ruleId === NUMBER_RULE) numbers.push(text);
    else if (m.ruleId === STRING_RULE) { if (!isModuleSource(lines)) strings.push(text); }
  }
  return { ok: true, numbers, strings };
}

function lineText(root, rel, idx) {
  try { return (fs.readFileSync(path.join(root, rel), 'utf8').split('\n')[idx] || '').trim(); } catch { return ''; }
}

/** Every number and string VALUE of a parsed JSON document (L5). */
function jsonValues(node, nums, strs) {
  if (Array.isArray(node)) { for (const v of node) jsonValues(v, nums, strs); return [nums, strs]; }
  if (node && typeof node === 'object') { for (const v of Object.values(node)) jsonValues(v, nums, strs); return [nums, strs]; }
  if (typeof node === 'number') nums.push(String(node));
  else if (typeof node === 'string') strs.push(node);
  return [nums, strs];
}

/** Report only the EXCESS over the baseline (R-LA, shrink only); a text absent there counts 0. */
function excess(observed, baseline, code) {
  const base = baseline && typeof baseline === 'object' ? baseline : {};
  const seen = new Map();
  for (const k of observed) seen.set(k, (seen.get(k) || 0) + 1);
  const out = [];
  for (const [k, n] of seen) for (let i = base[k] || 0; i < n; i += 1) out.push(fail(code, k));
  return out;
}

/**
 * Arm L over repo-relative `files` resolved under `root`. Returns `[{file, verdicts}]`; empty array = pass.
 */
export function scanScope({ root, files, policy, allow, astGrepBin, ruleFile }) {
  const sets = allowSet(allow);
  const baseline = (allow && allow.baseline) || {};
  const out = [];
  for (const rel of Array.isArray(files) ? files : []) {
    const c = classify(policy, rel);
    if (!c.literalScope || c.literalExempt) continue;
    const base = baseline[rel] || { numbers: {}, strings: {} };
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) {
      out.push({ file: rel, verdicts: [fail('cannot-scan', `${rel} unreadable: ${e.message}`)] });
      continue;
    }
    let verdicts;
    if (rel.endsWith('.json')) {
      let doc;
      try { doc = JSON.parse(text); } catch (e) {
        out.push({ file: rel, verdicts: [fail('cannot-scan', `${rel} unparsable: ${e.message}`)] });
        continue;
      }
      const [nums, strs] = jsonValues(doc, [], []);
      verdicts = [
        ...excess(nums.filter((n) => !sets.numbers.has(Number(n))), base.numbers, 'json-number'),
        ...excess(strs.filter((s) => !sets.strings.has(s)), base.strings, 'json-string'),
      ];
    } else if (text.includes('ast-grep-ignore')) {
      out.push({ file: rel, verdicts: [fail('suppressed', rel)] });
      continue;
    } else {
      const res = scanFile({ root, rel, astGrepBin, ruleFile });
      if (!res.ok) {
        out.push({ file: rel, verdicts: [fail('cannot-scan', `${rel} ${res.error}`)] });
        continue;
      }
      verdicts = [
        ...excess(res.numbers, base.numbers, 'number'),
        ...excess(res.strings.filter((s) => !sets.strings.has(s)), base.strings, 'string'),
      ];
    }
    if (verdicts.length) out.push({ file: rel, verdicts });
  }
  return out;
}

/** L10: a `literal_scope` glob matching no tracked file and not listed in `pending_globs`. */
export function deadScopeLines(policy, tracked) {
  return deadGlobs(policy, tracked).filter((d) => d.list === 'literal_scope').map((d) => fail('dead-glob', d.glob));
}

/** R-LA: the baseline object to commit — every non-allowed literal text with its observed count, per file. */
export function baselineFor({ root, files, astGrepBin, ruleFile, policy, allow }) {
  const sets = allowSet(allow);
  const baseline = {};
  const bump = (map, k) => { map[k] = (map[k] || 0) + 1; };
  for (const rel of Array.isArray(files) ? files : []) {
    if (policy) {
      const c = classify(policy, rel);
      if (!c.literalScope || c.literalExempt) continue;
    }
    const entry = { numbers: {}, strings: {} };
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    if (rel.endsWith('.json')) {
      const [nums, strs] = jsonValues(JSON.parse(text), [], []);
      for (const n of nums) if (!sets.numbers.has(Number(n))) bump(entry.numbers, n);
      for (const s of strs) if (!sets.strings.has(s)) bump(entry.strings, s);
    } else {
      if (text.includes('ast-grep-ignore')) continue;
      const res = scanFile({ root, rel, astGrepBin, ruleFile });
      if (!res.ok) continue;
      for (const n of res.numbers) bump(entry.numbers, n);
      for (const s of res.strings) if (!sets.strings.has(s)) bump(entry.strings, s);
    }
    if (Object.keys(entry.numbers).length || Object.keys(entry.strings).length) baseline[rel] = entry;
  }
  return baseline;
}

/** CLI — `--baseline <file>...` prints the commit-able baseline; `--scan <file>...` prints the verdicts. */
function main(argv) {
  const ruleFile = path.join(REPO_ROOT, RULE_FILE);
  const astGrepBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'ast-grep');
  const allow = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ALLOW_REL), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mcbylaws/protected-paths.json'), 'utf8'));
  const files = argv.slice(1);
  const args = { root: REPO_ROOT, files, policy, allow, astGrepBin, ruleFile };
  if (argv[0] === '--baseline') process.stdout.write(`${JSON.stringify(baselineFor(args), null, 2)}\n`);
  else if (argv[0] === '--scan') for (const v of scanScope(args)) for (const line of v.verdicts) process.stdout.write(`${v.file} ${line}\n`);
  else { process.stderr.write('usage: literal-scan.mjs --scan|--baseline <file>...\n'); process.exitCode = 2; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
