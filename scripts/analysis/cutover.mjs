#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md (①②③ — ③ cutover);
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-K, R-AN, R-AO
//
// `npm run cutover -- --step=<slug>` — the ③ cutover as ONE command (WF2 "conversion
// simplification" item 4). Runs, IN ORDER, the entries of the one declared list
// `scripts/analysis/cutover-generators.json` and prints every file each one changed.
// Two entries are builtins (the registry edits the cutover itself makes); the rest run
// an existing generator unchanged. Idempotent: a second run changes 0 files.
//
// Replaces: grepping a precedent cutover commit (8c362325, 1e3b544a) and hand-editing
// the registry/fleet files. It decides nothing a human must judge — the closing note
// lists what stays the author's job (owner-spec As-built, live recaptures, ...).
//
//   node scripts/analysis/cutover.mjs --step=<manifest slug> [--skip=<id,...>] [--list]
//   --skip   named entries are not run, and the run SAYS so (never silent)
//   --list   print the declared list and exit
//   --repo   repo root (tests only; default: this checkout)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ownerSpecsFor, SYSTEM_MAP_REL } from './gates/owner-spec-diff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');
export const GENERATORS_REL = 'scripts/analysis/cutover-generators.json';
export const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
export const CENSUS_RELS = [
  'scripts/steps/_schema/step-archetype-census.json',
  // census COPIES a test mutates into a known-bad fixture — kept in step with the live row
  'scripts/steps/_schema/fixtures/census/bad-mismatched-archetype.json',
  'scripts/steps/_schema/fixtures/census/missing-slug-totality.json',
];
export const KINDS = Object.freeze(['builtin', 'cmd']);
export const BUILTINS = Object.freeze(['register', 'census']);
// `throw` (default): a failing generator stops the cutover. `report`: it is printed,
// the run continues, and the command exits 1 — for a check whose red is EXPECTED
// until an author step lands (the scorecard regen before the assert_schema recapture).
export const ON_FAIL = Object.freeze(['throw', 'report']);
export const RETAINED_REASON = 'RETAINED at cutover per Spec 124 R-AO: archetype and batch are the census\'s own '
  + 'pre-cutover values, kept verbatim and never re-derived from the descriptor (a copy would make fast invariant '
  + '#25 compare a value to itself); converted.json registers the file in converted[] and deletes its pending[] '
  + 'entry in the same commit (R-K).';

// ---------------------------------------------------------------------------
// Pure text edits — surgical, EOL-preserving, verified by a re-parse.
// ---------------------------------------------------------------------------

const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n');
const toLf = (t) => t.replace(/\r\n/g, '\n');
const fromLf = (t, eol) => (eol === '\r\n' ? t.replace(/\n/g, '\r\n') : t);

/** Index of the bracket/brace closing the one opened at `open` (string-aware). */
function matchingClose(s, open) {
  const want = s[open] === '[' ? ']' : '}';
  const pairs = { '[': ']', '{': '}' };
  const stack = [];
  let inStr = false;
  for (let i = open; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') stack.push(pairs[c]);
    else if (c === ']' || c === '}') {
      if (stack.pop() !== c) throw new Error('cutover: unbalanced JSON text');
      if (stack.length === 0) {
        if (c !== want) throw new Error('cutover: unbalanced JSON text');
        return i;
      }
    }
  }
  throw new Error('cutover: unterminated JSON value');
}

/** JSON.stringify(value, null, 2) with every line after the first indented by `indent` spaces. */
function render(value, indent) {
  if (Array.isArray(value) && value.length === 0) return '[]';
  return JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : ' '.repeat(indent) + l)).join('\n');
}

function assertParsesTo(text, expected, what) {
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(expected)) {
    throw new Error(`cutover: the surgical edit of ${what} does not re-parse to the intended object — refusing to write`);
  }
}

/**
 * converted.json text with `file` appended to converted[] and removed from pending[] (R-K).
 * Unchanged (same string) when already registered. PURE.
 */
export function registerText(text, file) {
  const eol = eolOf(text);
  const s = toLf(text);
  const doc = JSON.parse(s);
  const pendingFile = (p) => (typeof p === 'string' ? p : p && p.file);
  const inPending = (doc.pending || []).some((p) => pendingFile(p) === file);
  const inConverted = (doc.converted || []).includes(file);
  if (inConverted && !inPending) return text;
  const next = {
    ...doc,
    pending: (doc.pending || []).filter((p) => pendingFile(p) !== file),
    converted: inConverted ? doc.converted : [...(doc.converted || []), file],
  };
  let out = s;
  for (const key of ['pending', 'converted']) {
    const m = new RegExp(`\\n  "${key}": \\[`).exec(out);
    if (!m) throw new Error(`cutover: ${CONVERTED_REL} has no top-level "${key}" array`);
    const open = m.index + m[0].length - 1;
    out = out.slice(0, open) + render(next[key], 2) + out.slice(matchingClose(out, open) + 1);
  }
  assertParsesTo(out, next, CONVERTED_REL);
  return fromLf(out, eol);
}

/** `commit-3` (compressed ①②③) or `commit-9` (nine-commit form), from pending[].registers_at. PURE. */
export function convertedAtFor(registersAt) {
  const r = String(registersAt || '');
  if (/③|commit\s*-?\s*3\b/.test(r)) return 'commit-3';
  if (/commit\s*-?\s*9\b/.test(r)) return 'commit-9';
  throw new Error(`cutover: cannot tell the commit form from pending[].registers_at ${JSON.stringify(registersAt)}`);
}

/**
 * Census text with `file`'s entries[] row RETAINED as converted (R-AO: archetype/batch
 * verbatim). Unchanged when the row already reads converted. PURE.
 */
export function censusText(text, file, convertedAt) {
  const eol = eolOf(text);
  const s = toLf(text);
  const doc = JSON.parse(s);
  const idx = (doc.entries || []).findIndex((e) => e && e.file === file);
  if (idx === -1) throw new Error(`cutover: the census has no entries[] row for ${file} — add one first (R-AO)`);
  const row = doc.entries[idx];
  if (row.status === 'converted') return text;
  const nextRow = { ...row, reason: RETAINED_REASON, status: 'converted', converted_at: convertedAt };
  const next = { ...doc, entries: doc.entries.map((e, i) => (i === idx ? nextRow : e)) };
  const entriesAt = /\n  "entries": \[/.exec(s);
  if (!entriesAt) throw new Error('cutover: census has no top-level "entries" array');
  const needle = `"file": ${JSON.stringify(file)}`;
  const hit = s.indexOf(needle, entriesAt.index);
  if (hit === -1) throw new Error(`cutover: census row text for ${file} not found`);
  const open = s.lastIndexOf('\n    {', hit) + 5;
  const close = matchingClose(s, open);
  const out = s.slice(0, open) + render(nextRow, 4) + s.slice(close + 1);
  assertParsesTo(out, next, 'the census');
  return fromLf(out, eol);
}

/** Paths whose content differs between two snapshots (added, changed or removed). PURE. */
export function changedPaths(before, after) {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((k) => before.get(k) !== after.get(k)).sort();
}

// ---------------------------------------------------------------------------
// Disk / git
// ---------------------------------------------------------------------------

/** Every path git reports as changed or untracked, with a content hash (the working-tree delta). */
export function snapshot(root) {
  const out = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  const map = new Map();
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const code = parts[i].slice(0, 2);
    const rel = parts[i].slice(3);
    if (code[0] === 'R' || code[0] === 'C') i += 1; // rename/copy: next field is the source path
    const abs = path.join(root, rel);
    map.set(rel, fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex') : 'absent');
  }
  return map;
}

export function loadGenerators(root) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, GENERATORS_REL), 'utf8'));
  const list = Array.isArray(doc.generators) ? doc.generators : [];
  const ids = new Set();
  for (const g of list) {
    if (!g || typeof g.id !== 'string' || ids.has(g.id)) throw new Error(`cutover: generator ids must be unique strings (${JSON.stringify(g && g.id)})`);
    ids.add(g.id);
    if (!KINDS.includes(g.kind)) throw new Error(`cutover: generator ${g.id} kind ${JSON.stringify(g.kind)} is not one of ${KINDS.join('|')}`);
    if (g.kind === 'builtin' && !BUILTINS.includes(g.id)) throw new Error(`cutover: unknown builtin ${g.id}`);
    if (g.kind === 'cmd' && (!Array.isArray(g.argv) || g.argv.length === 0)) throw new Error(`cutover: cmd ${g.id} has no argv`);
    if (g.on_fail !== undefined && !ON_FAIL.includes(g.on_fail)) throw new Error(`cutover: generator ${g.id} on_fail ${JSON.stringify(g.on_fail)} is not one of ${ON_FAIL.join('|')}`);
  }
  return list;
}

/** The step's file + commit form, resolved from manifest.json + converted.json BEFORE anything changes. */
export function resolveStep(root, slug) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/manifest.json'), 'utf8'));
  const entry = manifest.scripts && manifest.scripts[slug];
  if (!entry || !entry.file) throw new Error(`cutover: scripts/manifest.json has no script "${slug}"`);
  const file = entry.file;
  const conv = JSON.parse(fs.readFileSync(path.join(root, CONVERTED_REL), 'utf8'));
  const pend = (conv.pending || []).find((p) => (typeof p === 'string' ? p : p.file) === file);
  if (pend) return { slug, file, alreadyConverted: false, convertedAt: convertedAtFor(typeof pend === 'string' ? '' : pend.registers_at) };
  if ((conv.converted || []).includes(file)) return { slug, file, alreadyConverted: true, convertedAt: null };
  throw new Error(`cutover: ${file} is neither pending[] nor converted[] in ${CONVERTED_REL} — ① declares it pending first (R-K)`);
}

function runBuiltin(root, id, step) {
  if (id === 'register') {
    const abs = path.join(root, CONVERTED_REL);
    const t = fs.readFileSync(abs, 'utf8');
    const n = registerText(t, step.file);
    if (n !== t) fs.writeFileSync(abs, n);
    return;
  }
  // census
  if (step.alreadyConverted) return;
  for (const rel of CENSUS_RELS) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const t = fs.readFileSync(abs, 'utf8');
    const n = censusText(t, step.file, step.convertedAt);
    if (n !== t) fs.writeFileSync(abs, n);
  }
}

/** @returns {string|null} null on success, else the failure text (thrown unless on_fail is `report`). */
function runCmd(root, g) {
  const [bin, ...rest] = g.argv;
  const res = spawnSync(bin === 'node' ? process.execPath : bin, rest, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (res.status === 0) return null;
  const tail = `${res.stdout || ''}\n${res.stderr || ''}`.trim().split('\n').slice(-15).join('\n');
  const text = `cutover: ${g.id} (${g.argv.join(' ')}) exited ${res.status}\n${tail}`;
  if (g.on_fail === 'report') return text;
  throw new Error(text);
}

export function runCutover({ root = DEFAULT_ROOT, slug, skip = [], log = console.log }) {
  const generators = loadGenerators(root);
  const unknown = skip.filter((s) => !generators.some((g) => g.id === s));
  if (unknown.length) throw new Error(`cutover: --skip names no declared generator: ${unknown.join(', ')}`);
  const step = resolveStep(root, slug);
  log(`[cutover] ${slug} (${step.file}) — ${step.alreadyConverted ? 'already registered' : `pending -> converted (${step.convertedAt})`}`);
  const changed = {};
  const failed = [];
  for (const g of generators) {
    if (skip.includes(g.id)) {
      log(`[cutover]   ${g.id}: SKIPPED (--skip) — ${g.does}`);
      continue;
    }
    const before = snapshot(root);
    if (g.kind === 'builtin') runBuiltin(root, g.id, step);
    else {
      const fail = runCmd(root, g);
      if (fail) {
        failed.push(g.id);
        log(`[cutover]   ${g.id}: FAILED (on_fail report — continuing)\n${fail}`);
      }
    }
    const diff = changedPaths(before, snapshot(root));
    changed[g.id] = diff;
    log(`[cutover]   ${g.id}: ${diff.length ? `changed ${diff.join(', ')}` : 'no change'}`);
  }
  const total = new Set(Object.values(changed).flat()).size;
  log(`[cutover] ${total} file(s) changed. Still the author's judgement (not generated): owner-spec As-built text; `
    + 'live-DB recaptures (assert_schema POST after its probe list moves); execution-budget-disposition.json '
    + 'step_timeout; write-class-disposition.json declared_by notes; orphan ledger rows; programme-items.json '
    + 'evidence; review_followups.md rows; generator code edits; legacy-shell text-scan test lists (retiring a '
    + 'lock needs its successor named); the step\'s own seeds/tests.');
  // Fast invariant #43 OWNER-SPEC-DIFF (Spec 124 §5 R-BB) — surface the obligation now, not only
  // when the commit hook refuses. An absent system map (fixture repos) is reported, never a throw.
  const mapAbs = path.join(root, SYSTEM_MAP_REL);
  if (!fs.existsSync(mapAbs)) {
    log(`[cutover] owner specs (#43): system map absent (${SYSTEM_MAP_REL}) — cannot name them here`);
  } else {
    const owners = ownerSpecsFor(step.file, fs.readFileSync(mapAbs, 'utf8'));
    log(`[cutover] owner specs this cutover commit must touch (#43 OWNER-SPEC-DIFF), or declare census spec_diff "N-A" + spec_diff_reason: ${owners.length ? owners.join(', ') : 'NONE named in the system map — N-A required'}`);
  }
  if (failed.length) log(`[cutover] FAILED (reported): ${failed.join(', ')} — re-run them after the author steps above.`);
  return { step, changed, total, failed };
}

function parseArgs(argv) {
  const out = { slug: null, skip: [], list: false, root: DEFAULT_ROOT };
  for (const a of argv) {
    if (a.startsWith('--step=')) out.slug = a.slice(7);
    else if (a.startsWith('--skip=')) out.skip = a.slice(7).split(',').filter(Boolean);
    else if (a.startsWith('--repo=')) out.root = path.resolve(a.slice(7));
    else if (a === '--list') out.list = true;
    else throw new Error(`cutover: unknown argument ${a}`);
  }
  return out;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.list) {
      for (const g of loadGenerators(opts.root)) console.log(`${g.id} (${g.kind}) — ${g.does}`);
    } else {
      if (!opts.slug) throw new Error('usage: npm run cutover -- --step=<slug> [--skip=<id,...>] [--list]');
      const res = runCutover({ root: opts.root, slug: opts.slug, skip: opts.skip });
      if (res.failed.length) process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
