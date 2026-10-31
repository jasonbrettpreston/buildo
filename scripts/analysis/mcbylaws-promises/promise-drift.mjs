// SPEC LINK: MB-73 plan §5 and §9 F-D1, F-P5, F-P6 — the drift arm of the promises check. R-KQ, R-KU (R4-09: an
//            allowlist of permitted targets, not a name match), K9/K10: tracked files only, config read at the BASE ref.

import { git, readAt } from '../mcbylaws/git-util.mjs';

/** The scan config every promise scan is read from. */
export const SCAN_CONFIG_PATH = 'mcbylaws/promises/scan-roots.json';

/** The four config fields, each an array of strings. */
const FIELDS = ['scan_roots', 'forbidden', 'layer_paths', 'allow_imports'];

const startsWithAny = (path, roots) => roots.some((r) => typeof r === 'string' && path.startsWith(r));

const isStrings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

// Fail closed: an EMPTY scan_roots or forbidden array is undecidable (an empty parse is never "nothing to check").
const REQUIRED_NON_EMPTY = ['scan_roots', 'forbidden'];

/**
 * The scan config AT `base` (never the working tree). Null, unparseable or mis-shaped -> config null + one line.
 * @param {string} cwd @param {string} base
 * @returns {{config: {scan_roots: string[], forbidden: string[], layer_paths: string[], allow_imports: string[]}|null, lines: string[]}}
 */
export function loadScanConfig(cwd, base) {
  const text = readAt(cwd, base, SCAN_CONFIG_PATH);
  const bad = { config: null, lines: ['FAIL:R:cannot-decide:scan-config'] };
  if (text === null) return bad;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return bad; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return bad;
  // Every field must be PRESENT as an array of strings, and the two that scope the scan must be non-empty
  // (fail closed: an empty parse is never "nothing to check").
  if (!FIELDS.every((f) => isStrings(parsed[f]))) return bad;
  if (!REQUIRED_NON_EMPTY.every((f) => parsed[f].length > 0)) return bad;
  const config = {};
  for (const f of FIELDS) config[f] = [...parsed[f]];
  return { config, lines: [] };
}

const SPECIFIER_RES = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

/**
 * Every module specifier in `text`: `from '<s>'`, `import '<s>'`, `import('<s>')`, `require('<s>')`.
 * @param {string} text
 * @returns {string[]} unique, in first-seen order
 */
export function importSpecifiers(text) {
  const out = [];
  for (const re of SPECIFIER_RES) {
    for (const m of String(text ?? '').matchAll(re)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** True when `spec` is relative, or an `allow_imports` entry equals it or (ends `*`) prefixes it. */
const allowed = (spec, allow) => spec.startsWith('./') || spec.startsWith('../')
  || allow.some((e) => e === spec || (e.endsWith('*') && spec.startsWith(e.slice(0, -1))));

/**
 * F-D1: files under a scan root carrying a forbidden name, or a layer-path file with a non-allowed import.
 * @param {{files: {path: string, text: string}[], config: {scan_roots: string[], forbidden: string[], layer_paths: string[], allow_imports: string[]}}} input
 * @returns {string[]} sorted unique `FAIL:W:old-engine:<path>`
 */
export function oldEngineLines({ files, config }) {
  const out = new Set();
  for (const { path, text } of files) {
    if (!startsWithAny(path, config.scan_roots)) continue;
    const body = String(text ?? '');
    const forbidden = config.forbidden.some((f) => f !== '' && body.includes(f));
    const badImport = startsWithAny(path, config.layer_paths)
      && importSpecifiers(body).some((s) => !allowed(s, config.allow_imports));
    if (forbidden || badImport) out.add(`FAIL:W:old-engine:${path}`);
  }
  return [...out].sort();
}

/**
 * The tokens of a "Not doing" row: ids and path-like words.
 * @param {string} quotedLine
 * @returns {string[]} sorted unique
 */
export function notDoingTokens(quotedLine) {
  const text = String(quotedLine ?? '');
  const out = new Set([
    ...text.matchAll(/[A-Z]{1,3}-\d+[a-z]?/g),
    ...text.matchAll(/[A-Za-z0-9_./-]+\.(?:mjs|js|ts|tsx|json)/g),
  ].map((m) => m[0]));
  return [...out].sort();
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (t) => new RegExp(`(?<![A-Za-z0-9_-])${escape(t)}(?![A-Za-z0-9_-])`);

/**
 * F-P6: a "Not doing" token that is code in a scanned file.
 * @param {{items: {id: string, tokens: string[]}[], files: {path: string, text: string}[], config: {scan_roots: string[]}}} input
 * @returns {string[]} sorted unique `FAIL:R:not-doing-has-code:<id>:<path>`
 */
export function notDoingLines({ items, files, config }) {
  const out = new Set();
  for (const item of items) {
    const tokens = (item.tokens ?? []).map(wholeWord);
    if (tokens.length === 0) continue;
    for (const { path, text } of files) {
      if (!startsWithAny(path, config.scan_roots)) continue;
      const body = String(text ?? '');
      if (tokens.some((re) => re.test(body))) out.add(`FAIL:R:not-doing-has-code:${item.id}:${path}`);
    }
  }
  return [...out].sort();
}

/**
 * F-P5: a withdrawn item whose pathspecs gained commits since the withdrawal.
 * @param {{cwd: string, rev: string, items: {id: string, globs?: string[], since?: string}[]}} input
 * @returns {string[]} sorted unique `FAIL:R:` lines
 */
export function withdrawnLines({ cwd, rev, items }) {
  const out = new Set();
  for (const item of items) {
    const globs = Array.isArray(item.globs) ? item.globs : [];
    if (globs.length === 0) { out.add(`FAIL:R:cannot-decide:withdrawn-no-globs:${item.id}`); continue; }
    if (typeof item.since !== 'string' || item.since === '') {
      out.add(`FAIL:R:cannot-decide:withdrawn-git:${item.id}`);
      continue;
    }
    const specs = globs.map((g) => `:(glob)${g}`);
    const r = git(cwd, ['log', '--format=%H', `${item.since}..${rev}`, '--', ...specs]);
    if (r.status !== 0) out.add(`FAIL:R:cannot-decide:withdrawn-git:${item.id}`);
    else if (r.stdout.trim() !== '') out.add(`FAIL:R:withdrawn-has-commits:${item.id}`);
  }
  return [...out].sort();
}
