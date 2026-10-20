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
//   node scripts/analysis/generate-last-measured.mjs --shrink-baseline   drop every baseline entry that is now
//                                                              fresh (never adds one)
//
// STALE BASELINE (Spec 124 R-GQ, operator y 2026-10-20): `--check` runs at pre-commit (R-DJ (1)). The 84
// entries that were stale when it was wired cannot be synced before REFREEZE-BUNDLE-1 (a resync moves
// descriptor fingerprints and stales POST goldens), so they are listed by step and key in the CLOSED,
// SHRINK-ONLY `scripts/steps/_schema/last-measured-stale-baseline.json`, each citing REFREEZE-BUNDLE-1.
// RED: a stale entry not on the list; a listed entry that is now fresh (it must leave, R-X); a listed
// entry with no REFREEZE-BUNDLE-1 citation, a duplicate, or any unsourced entry.
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

export const BASELINE_REL_PATH = 'scripts/steps/_schema/last-measured-stale-baseline.json';
export const BASELINE_PIN = 'REFREEZE-BUNDLE-1';
const entryKey = (e) => `${e.step}\u0000${e.key}`;

/** Every stale (would-change) entry in a run report, as {step, key}, sorted. PURE. */
export function staleEntries(report) {
  const out = [];
  for (const r of report || []) for (const key of [...new Set(r.changed || [])]) out.push({ step: r.slug, key });
  return out.sort((a, b) => (a.step < b.step ? -1 : a.step > b.step ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * R-GQ: the closed, shrink-only baseline verdict. PURE.
 * @param {Array<{step:string,key:string}>} stale
 * @param {{entries?: Array<{step:string,key:string,pin?:string}>}|null} baseline
 * @returns {{pass: boolean, problems: string[], fresh: Array<{step:string,key:string}>}}
 */
export function baselineDecision(stale, baseline) {
  const problems = [];
  const rows = Array.isArray(baseline && baseline.entries) ? baseline.entries : null;
  if (!rows) return { pass: false, problems: [`${BASELINE_REL_PATH} is missing or has no entries[]`], fresh: [] };
  const listed = new Map();
  for (const r of rows) {
    const k = entryKey(r);
    if (listed.has(k)) problems.push(`duplicate baseline entry ${r.step}.${r.key}`);
    listed.set(k, r);
    if (!r || typeof r.step !== 'string' || typeof r.key !== 'string') problems.push(`malformed baseline entry ${JSON.stringify(r)}`);
    else if (r.pin !== BASELINE_PIN) problems.push(`baseline entry ${r.step}.${r.key} must cite pin ${BASELINE_PIN}`);
  }
  const staleKeys = new Set(stale.map(entryKey));
  for (const e of stale) if (!listed.has(entryKey(e))) problems.push(`NEW stale last_measured ${e.step}.${e.key} — regenerate (node scripts/analysis/generate-last-measured.mjs); the baseline never grows`);
  const fresh = rows.filter((r) => r && !staleKeys.has(entryKey(r)));
  for (const r of fresh) problems.push(`baseline entry ${r.step}.${r.key} is fresh now — remove it (node scripts/analysis/generate-last-measured.mjs --shrink-baseline)`);
  return { pass: problems.length === 0, problems, fresh: fresh.map((r) => ({ step: r.step, key: r.key })) };
}

/** Run the generator over the estate; writes only when `check` is false. */
export function run({ check = false, dryRun = false, root = REPO_ROOT, log = console.log } = {}) {
  const report = [];
  for (const p of descriptorPaths(root)) {
    const text = fs.readFileSync(p, 'utf8');
    const doc = JSON.parse(text);
    if (!CATEGORIES.some((c) => Array.isArray(doc[c]) && doc[c].length > 0)) continue;
    const slug = doc.identity && doc.identity.name;
    const res = applyMeasuredText(text, measuredEntriesFor(slug, root));
    report.push({ path: path.relative(root, p).replace(/\\/g, '/'), slug, ...res, text: undefined });
    if (!check && !dryRun && res.changed.length > 0) fs.writeFileSync(p, res.text);
  }
  const sum = (k) => report.reduce((n, r) => n + r[k].length, 0);
  for (const r of report) {
    if (r.changed.length || r.unsourced.length || r.skipped.length || r.missing.length) {
      log(`[generate-last-measured] ${r.slug}: changed=[${r.changed.join(',')}] unsourced=[${r.unsourced.join(',')}] skipped=[${r.skipped.join(',')}] missing=[${r.missing.join(',')}]`);
    }
  }
  log(`[generate-last-measured] ${check ? 'CHECK' : 'WRITE'}: ${report.length} descriptor(s); changed ${sum('changed')}, unsourced ${sum('unsourced')}, skipped ${sum('skipped')}, missing ${sum('missing')}`);
  let red = false;
  if (check) {
    const baseline = readJson(path.join(root, BASELINE_REL_PATH));
    const decision = baselineDecision(staleEntries(report), baseline);
    for (const p of decision.problems) log(`[generate-last-measured] RED: ${p}`);
    log(`[generate-last-measured] baseline (R-GQ): ${(baseline && baseline.entries || []).length} listed stale entr${(baseline && baseline.entries || []).length === 1 ? 'y' : 'ies'} (${BASELINE_PIN}), ${decision.problems.length} problem(s)`);
    red = !decision.pass || sum('unsourced') > 0;
  }
  return { report, red };
}

/** --shrink-baseline: drop the entries that are now fresh; never adds one. Returns the removed entries. */
export function shrinkBaseline({ root = REPO_ROOT, log = console.log } = {}) {
  const p = path.join(root, BASELINE_REL_PATH);
  const baseline = readJson(p);
  if (!baseline || !Array.isArray(baseline.entries)) throw new Error(`${BASELINE_REL_PATH} is missing`);
  const { report } = run({ check: false, dryRun: true, root, log: () => {} });
  const staleKeys = new Set(staleEntries(report).map(entryKey));
  const keep = baseline.entries.filter((r) => staleKeys.has(entryKey(r)));
  const removed = baseline.entries.filter((r) => !staleKeys.has(entryKey(r)));
  if (removed.length) fs.writeFileSync(p, JSON.stringify({ ...baseline, entries: keep }, null, 2) + '\n');
  log(`[generate-last-measured] --shrink-baseline: removed ${removed.length}, ${keep.length} remain`);
  return removed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--shrink-baseline')) shrinkBaseline();
  else {
    const { red } = run({ check: process.argv.includes('--check') });
    if (red) process.exitCode = 1;
  }
}
