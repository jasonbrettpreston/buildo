#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.5 (invariants[]/plausibility[] last_measured)
// registry-truth plan P2-C4 (PLAN :223); fold 19 MQ-A3 (a) + compliance amendment; FLEET-2 A-5.
//
// `last_measured` is GENERATED, never hand-kept (R-BF): every invariants[]/plausibility[] entry's
// `last_measured` is written from the capture harness's sidecar
// `docs/reports/golden/<slug>/measured.json` (capture-step-golden.js measuredFromCapture /
// mergeMeasured; reduction rule = the LATEST capture per entry, `sample_n` informational) plus an
// optional second input `measured-validate.json` for `validate_only` entries (written by `step-validate
// --write`, event 'step_validate_write'; an entry's own `event` is carried, absent = 'golden_capture').
//
//   node scripts/analysis/generate-last-measured.mjs           write every descriptor whose entries moved
//   node scripts/analysis/generate-last-measured.mjs --check   write nothing; exitCode 1 when any entry
//                                                              would change (a hand edit / stale value) or
//                                                              carries a last_measured with no measured source
//
// Formatting: a descriptor that is byte-identical to JSON.stringify(doc, null, 2) + '\n' is
// re-serialised that way; any other descriptor keeps every byte except the replaced
// `last_measured` object, written on one line. An entry with no `last_measured` key is reported
// `missing`, never inserted. `last_measured` is outside source_fingerprint
// (capture-step-golden.js stripLastMeasuredForFingerprint), so regenerating moves no golden.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATEGORIES = ['invariants', 'plausibility'];

/** The schema's lastMeasured object from one sidecar entry, or null when it has no measured cost. */
export function lastMeasuredFromSidecar(e) {
  if (!e || !Number.isFinite(e.cost_ms) || e.cost_ms < 0) return null;
  return {
    value: e.value,
    at: e.at,
    commit: e.commit,
    cost_ms: e.cost_ms,
    sample_n: e.sample_n,
    source_run: { run_id: e.run_id ?? null, chain: e.chain ?? null, event: e.event ?? 'golden_capture' },
  };
}

/** Index of the bracket that closes the `{` / `[` at `open`, honouring JSON strings. */
function closeOf(text, open) {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`generate-last-measured: unbalanced bracket at offset ${open}`);
}

/** Within the object spanning [objOpen, objClose], the [start, end] of key `key`'s value at depth 1, or null. */
function valueSpan(text, objOpen, objClose, key) {
  let depth = 0;
  let inStr = false;
  let strStart = -1;
  for (let i = objOpen; i <= objClose; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') {
        inStr = false;
        if (depth === 1 && text.slice(strStart + 1, i) === key) {
          let j = i + 1;
          while (/\s/.test(text[j])) j++;
          if (text[j] === ':') {
            j++;
            while (/\s/.test(text[j])) j++;
            const end = (text[j] === '{' || text[j] === '[') ? closeOf(text, j) : j;
            return [j, end];
          }
        }
      }
      continue;
    }
    if (c === '"') { inStr = true; strStart = i; } else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return null;
}

/** The [open, close] spans of the object elements directly inside the array spanning [arrOpen, arrClose]. */
function objectElements(text, arrOpen, arrClose) {
  const out = [];
  let inStr = false;
  for (let i = arrOpen + 1; i < arrClose; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      const close = closeOf(text, i);
      out.push([i, close]);
      i = close;
    }
  }
  return out;
}

const oneLine = (obj) => JSON.stringify(obj, null, 1).replace(/\n\s*/g, ' ');

/**
 * Regenerate every invariants[]/plausibility[] entry's last_measured in ONE descriptor text.
 * @returns {{text: string, changed: string[], unsourced: string[], skipped: string[], missing: string[]}}
 */
export function applyMeasuredText(text, entries) {
  const doc = JSON.parse(text);
  const pretty = JSON.stringify(doc, null, 2) + '\n' === text;
  const changed = [];
  const unsourced = [];
  const skipped = [];
  const missing = [];
  const edits = [];
  const rootOpen = text.indexOf('{');
  const rootClose = closeOf(text, rootOpen);
  for (const cat of CATEGORIES) {
    if (!Array.isArray(doc[cat])) continue;
    const arr = pretty ? null : valueSpan(text, rootOpen, rootClose, cat);
    const spans = arr ? objectElements(text, arr[0], arr[1]) : [];
    doc[cat].forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') return;
      const id = entry.id;
      if (!('last_measured' in entry)) { missing.push(id); return; }
      const src = entries ? entries[id] : undefined;
      if (!src) { unsourced.push(id); return; }
      const lm = lastMeasuredFromSidecar(src);
      if (!lm) { skipped.push(id); return; }
      if (JSON.stringify(entry.last_measured) === JSON.stringify(lm)) return;
      changed.push(id);
      entry.last_measured = lm;
      if (!pretty) {
        const span = spans[idx];
        const v = span ? valueSpan(text, span[0], span[1], 'last_measured') : null;
        if (!v) throw new Error(`generate-last-measured: cannot locate ${cat}[${idx}] (${id}).last_measured in the text`);
        edits.push({ start: v[0], end: v[1], text: oneLine(lm) });
      }
    });
  }
  if (pretty) return { text: changed.length ? JSON.stringify(doc, null, 2) + '\n' : text, changed, unsourced, skipped, missing };
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end + 1);
  return { text: out, changed, unsourced, skipped, missing };
}

function readJson(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/** Every descriptor path, sorted. */
export function descriptorPaths(root = REPO_ROOT) {
  const out = [];
  for (const dir of ['scripts', 'scripts/quality']) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) if (f.endsWith('.descriptor.json')) out.push(path.join(abs, f));
  }
  return out.sort();
}

/** The merged measured entries for one slug: the capture sidecar, then the validate_only input. */
export function measuredEntriesFor(slug, root = REPO_ROOT) {
  const dir = path.join(root, 'docs/reports/golden', slug);
  const a = readJson(path.join(dir, 'measured.json'));
  const b = readJson(path.join(dir, 'measured-validate.json'));
  return { ...((b && b.entries) || {}), ...((a && a.entries) || {}) };
}

/** Run the generator over the estate; writes only when `check` is false. */
export function run({ check = false, root = REPO_ROOT, log = console.log } = {}) {
  const report = [];
  for (const p of descriptorPaths(root)) {
    const text = fs.readFileSync(p, 'utf8');
    const doc = JSON.parse(text);
    if (!CATEGORIES.some((c) => Array.isArray(doc[c]) && doc[c].length > 0)) continue;
    const slug = doc.identity && doc.identity.name;
    const res = applyMeasuredText(text, measuredEntriesFor(slug, root));
    report.push({ path: path.relative(root, p).replace(/\\/g, '/'), slug, ...res, text: undefined });
    if (!check && res.changed.length > 0) fs.writeFileSync(p, res.text);
  }
  const sum = (k) => report.reduce((n, r) => n + r[k].length, 0);
  for (const r of report) {
    if (r.changed.length || r.unsourced.length || r.skipped.length || r.missing.length) {
      log(`[generate-last-measured] ${r.slug}: changed=[${r.changed.join(',')}] unsourced=[${r.unsourced.join(',')}] skipped=[${r.skipped.join(',')}] missing=[${r.missing.join(',')}]`);
    }
  }
  log(`[generate-last-measured] ${check ? 'CHECK' : 'WRITE'}: ${report.length} descriptor(s); changed ${sum('changed')}, unsourced ${sum('unsourced')}, skipped ${sum('skipped')}, missing ${sum('missing')}`);
  const red = check && (sum('changed') > 0 || sum('unsourced') > 0);
  return { report, red };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { red } = run({ check: process.argv.includes('--check') });
  if (red) process.exitCode = 1;
}
