'use strict';
// ---------------------------------------------------------------------------
// Logic-variable consumer scanner — the ONE scanner shared by
// src/tests/logic-var-admin-declarations.logic.test.ts (the "dead ⇒
// deprecated" check) and any generator that needs to know whether a seed
// key is actually read anywhere.
//
// WF2 "Admin Tunable Coverage" commit 2 (.cursor/wf2_admin_tunable_coverage_active_task.md)
// — G6's grounding measurement ("Consumption of the 302") is reproduced here
// as a reusable function so the test and any future generator agree on ONE
// definition of "consumed," not two independently-drifting ones. A scanner
// that missed the dynamic lifecycle_seq_band_* family or the pg_cron
// SQL-only path would falsely condemn 221 live keys as dead — see the three
// consumption classes below, each with a live example:
//
//   1. "dynamic"  — lifecycle_seq_band_<N>_min/_max (×220). Never referenced
//      by literal key name; scripts/quality/assert-lifecycle-phase-distribution.js
//      builds the key at runtime via `lifecycle_seq_band_${seq}_min` template
//      literals (BAND_KEY_PATTERN, :96 there). Matched here by the SAME regex.
//   2. "static"   — the key literal appears verbatim in a scripts/**/*.js,
//      src/**/*.ts(x), or migrations/**/*.sql file (a LOGIC_VARS_SCHEMA
//      field, a ctx.config.<key> read, a hand-written SQL literal, a test's
//      own key-list, etc.).
//   3. "sql"      — same literal-scan mechanism as "static," reported with
//      its own kind for readability when the ONLY hit found is a .sql file
//      (e.g. lead_view_retention_days, referenced from the pg_cron job SQL
//      in migrations/233 + migrations/235).
//
// A key with NO hit in any of the three is genuinely dead (G6 measured 0
// dead members across the 302 as of 2026-09-03; this scanner reproduces
// that 0 automatically).
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['scripts', 'src', 'migrations'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx', '.sql']);
// Generated / data files that can contain a key's literal text WITHOUT that
// being a "consumer" — the seed JSON is the declaration site, not a reader;
// the registry doc is generated FROM the seed and would make every key
// trivially "consumed" by its own row.
const EXCLUDE_RELATIVE = new Set([
  'scripts/seeds/logic_variables.json',
  'docs/reference/logic-variables-registry.md',
]);

const BAND_KEY_PATTERN = /^lifecycle_seq_band_(\d+)_(min|max)$/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (!EXCLUDE_RELATIVE.has(rel)) out.push({ abs: full, rel });
    }
  }
}

let _corpus = null;
/** Lazily builds + caches the full scanned corpus (file list + text). */
function corpus() {
  if (_corpus) return _corpus;
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  _corpus = files.map((f) => ({ ...f, text: fs.readFileSync(f.abs, 'utf-8') }));
  return _corpus;
}

/** Test-only escape hatch — forces a fresh corpus scan on the next call. */
function _resetCorpusCache() {
  _corpus = null;
}

/**
 * Returns consumption evidence for one seed key, or null if no consumer was
 * found anywhere in scripts/, src/, or migrations/.
 * @param {string} key
 * @returns {{ kind: 'dynamic' | 'static' | 'sql', evidence: string } | null}
 */
function findConsumer(key) {
  if (BAND_KEY_PATTERN.test(key)) {
    return {
      kind: 'dynamic',
      evidence: 'scripts/quality/assert-lifecycle-phase-distribution.js (BAND_KEY_PATTERN family, built via template literal)',
    };
  }
  for (const { rel, text } of corpus()) {
    if (text.includes(key)) {
      return { kind: rel.endsWith('.sql') ? 'sql' : 'static', evidence: rel };
    }
  }
  return null;
}

/** @param {string} key */
function isConsumed(key) {
  return findConsumer(key) !== null;
}

module.exports = { findConsumer, isConsumed, BAND_KEY_PATTERN, _resetCorpusCache };
