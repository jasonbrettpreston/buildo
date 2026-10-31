// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-73 (promises check, plan §4 "Inputs (K4a)"); R-KU.
// A green is bound to (artifact blob hash, input hashes, commit): the closure is the set of inputs to hash, and a
// module that cannot be decided (an untraceable import, an unresolved one) is a failure line, never a pass.

import * as path from 'node:path';
import { git, readAt, listTracked } from '../mcbylaws/git-util.mjs';

/** Only these are parsed for imports; a `.json` file is a leaf. */
const PARSED = new Set(['.mjs', '.js', '.ts', '.tsx']);
/** Extension probing order for a specifier with no extension. */
const SUFFIXES = ['.mjs', '.js', '.ts', '.tsx', '.json'];
/** A quoted literal without `${` (quotes may be single, double or backtick). */
const LIT = String.raw`(['"\x60])((?:(?!\1)[^\\$\x60]|\\.)*)\1`;
const STATIC_RE = new RegExp(String.raw`(?:^|[\s;])(?:import|export)\b[^;'"\x60]*?\bfrom\s*${LIT}`, 'gm');
const SIDE_RE = new RegExp(String.raw`(?:^|[\s;}])import\s+${LIT}`, 'gm');
const CALL_RE = /\b(?:import|require)\s*\(\s*([^)]*)/g;
const TPL_RE = new RegExp(String.raw`^\x60((?:(?!\$\{)[^\\\x60]|\\.)*)\x60$`);

/** Does `text` begin with `quote` and close with `quote` with no `${` inside? */
const quotedLiteral = (text, quote) =>
  text.length >= 2 && text[0] === quote && text[text.length - 1] === quote && !text.includes('${');

/**
 * The module specifiers `source` names, plus whether any dynamic import/require could not be traced to a literal.
 * @param {string} source
 * @returns {{specifiers: string[], untraceable: boolean}}
 */
export function importsOf(source) {
  const out = [];
  const push = (s) => { if (s !== '') out.push(s); };
  for (const re of [STATIC_RE, SIDE_RE]) {
    re.lastIndex = 0;
    for (const m of source.matchAll(re)) push(m[2]);
  }
  let untraceable = false;
  for (const m of source.matchAll(CALL_RE)) {
    const arg = m[1].trim();
    const tpl = TPL_RE.exec(arg);
    if (quotedLiteral(arg, arg[0])) push(arg.slice(1, -1));
    else if (tpl && tpl[1] !== undefined) push(tpl[1]);
    else untraceable = true;
  }
  return { specifiers: [...new Set(out)], untraceable };
}

/**
 * The tracked repo-relative path the RELATIVE `spec` names from `fromPath`, or null (bare/`node:` specifiers -> null).
 * @param {string} fromPath
 * @param {string} spec
 * @param {Set<string>} trackedSet
 * @returns {string|null}
 */
export function resolveSpec(fromPath, spec, trackedSet) {
  if (typeof spec !== 'string' || !(spec.startsWith('./') || spec.startsWith('../'))) return null;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
  const bases = [joined, ...SUFFIXES.map((s) => joined + s), ...SUFFIXES.map((s) => `${joined}/index${s}`)];
  const ext = path.posix.extname(joined);
  const extra = ext === '.js' ? [joined.slice(0, -3) + '.ts'] : [];
  for (const cand of [...bases, ...extra]) {
    if (cand.startsWith('..') || !trackedSet.has(cand)) continue;
    return cand;
  }
  return null;
}

/**
 * Follow RELATIVE imports from `roots` at `rev`; every visited path (roots included) and every failure line.
 * @param {{cwd: string, rev: string, roots: string[]}} args
 * @returns {{files: string[], lines: string[]}}
 */
export function closureOf({ cwd, rev, roots }) {
  const trackedList = listTracked(cwd, rev);
  if (!Array.isArray(trackedList)) return { files: [], lines: ['FAIL:R:cannot-decide'] };
  const tracked = new Set(trackedList);
  const lines = [];
  const seen = new Set();
  const queue = [];
  for (const root of roots) {
    if (!tracked.has(root)) { lines.push(`FAIL:R:cannot-decide:unreadable:${root}`); continue; }
    queue.push(root);
  }
  while (queue.length > 0) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    if (!PARSED.has(path.posix.extname(p))) continue;
    const src = readAt(cwd, rev, p);
    if (typeof src !== 'string') { lines.push(`FAIL:R:cannot-decide:unreadable:${p}`); continue; }
    const { specifiers, untraceable } = importsOf(src);
    if (untraceable) lines.push(`FAIL:R:untraceable:${p}`);
    for (const spec of specifiers) {
      if (!(spec.startsWith('./') || spec.startsWith('../'))) continue;
      const target = resolveSpec(p, spec, tracked);
      if (target === null) { lines.push(`FAIL:R:cannot-decide:unresolved:${p}:${spec}`); continue; }
      queue.push(target);
    }
  }
  return { files: [...seen].sort(), lines: [...new Set(lines)] };
}

/**
 * `<rev>:<path>` blob id per path; a path that does not resolve is left out (a staleness check then sees it changed).
 * @param {{cwd: string, rev: string, files: string[]}} args
 * @returns {Record<string, string>}
 */
export function blobsOf({ cwd, rev, files }) {
  const out = {};
  for (const p of files) {
    const r = git(cwd, ['rev-parse', `${rev}:${p}`]);
    if (r.status === 0 && r.stdout.trim() !== '') out[p] = r.stdout.trim();
  }
  return out;
}
