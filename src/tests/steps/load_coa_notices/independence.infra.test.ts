// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D6 (T-IND), §D2/§D5 (T-SHAPE)
//
// T-IND — the CoA ingestor is INDEPENDENT of McBylaw's evaluator (Spec 129 §D6).
//
// The CoA decision-notice ingestor must never reach McBylaw's bylaw evaluator or its
// generated provisions: it derives every value it stores from the raw notice text and
// the closed vocabularies it ships, never from `evaluate.mjs`/`dsl.mjs` or a
// `bylaw-provisions.json`. A single stray `require()` would silently re-couple the two
// subsystems — and a coupling that only shows up as a runtime crash two waves later is
// exactly the failure this static lock exists to make impossible.
//
// T-IND-1 walks the entry files' whole LOCAL require/import graph (a PURE text walk —
// nothing in the ingestor or the fixture is ever executed) and asserts not one reached
// repo-relative path is a forbidden McBylaw target.
// T-IND-2 proves the walker can actually SEE such a require, on a known-bad fixture:
// a checker never proven to fire is not a check (Spec 121 §12b.6).
//
// Bare module specifiers (`pdfjs-dist`, `url`) are leaves — they are not repo paths.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

/** The directory the known-bad independence fixture is written into (never executed). */
const FIXTURE_DIR_REL = 'src/tests/fixtures/coa-notices';
const FIXTURE_REL = `${FIXTURE_DIR_REL}/ind-bad.cjs`;

/** The four entry files of the CoA ingestor (facts verified by the orchestrator). */
const ENTRY_FILES = [
  'scripts/lib/compute/load-coa-notices.js',
  'scripts/lib/coa-notices/parse-values.js',
  'scripts/lib/coa-notices/manifest.js',
  'scripts/lib/pdf-text.js',
];

/**
 * The McBylaw-independence FORBIDDEN set (Spec 129 §D6). Matched both as a full
 * repo-relative path and as a basename, so a forbidden file reached through any
 * directory spelling is still caught. `resolve-bylaws.js` is forbidden whether or not
 * it exists today.
 */
const FORBIDDEN_PATHS = [
  'scripts/analysis/bylaw/evaluate.mjs',
  'scripts/analysis/bylaw/dsl.mjs',
  'scripts/lib/compute/resolve-bylaws.js',
  'scripts/generate-bylaw-provisions.mjs',
];
const FORBIDDEN_BASENAMES = [
  'evaluate.mjs',
  'dsl.mjs',
  'resolve-bylaws.js',
  'generate-bylaw-provisions.mjs',
  'bylaw-provisions.json',
];

/** Extensions a relative specifier may resolve to, in resolution order. */
const RESOLUTION_SUFFIXES = ['', '.js', '.cjs', '.mjs', '.json', '/index.js'];

/**
 * Extract every LOCAL module specifier from a source file's TEXT:
 *   · `require('…')` / `require("…")`
 *   · `import … from '…'` / `import '…'`
 *   · `import('…')` (a dynamic import with a STRING LITERAL argument only)
 * Only specifiers that start with `.` are returned — a bare specifier (`pdfjs-dist`,
 * `url`) is a package/leaf, not a repo path.
 */
function localSpecifiers(src: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\bimport\s+(?:[^'";]*?\s+from\s+)?(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const spec = m[2] as string;
      if (spec.startsWith('.')) out.push(spec);
    }
  }
  return out;
}

/** Resolve a relative specifier against its importer's repo-relative path → a repo-relative path, or null. */
function resolveRelative(
  importerRel: string,
  spec: string,
  exists: (abs: string) => boolean,
): string | null {
  const baseAbs = path.resolve(REPO_ROOT, path.dirname(importerRel), spec);
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidateAbs = `${baseAbs}${suffix}`;
    if (exists(candidateAbs)) {
      return path.relative(REPO_ROOT, candidateAbs).replace(/\\/g, '/');
    }
  }
  return null;
}

/**
 * PURE local require-graph walker. Returns every reached repo-relative path (forward
 * slashes), including each entry itself. `readFile(abs) → string` and
 * `exists(abs) → boolean` are injected so the walk is testable without touching disk
 * in a way the caller cannot control; bare module specifiers are leaves.
 */
export function requireGraph(
  entry: string,
  readFile: (abs: string) => string,
  exists: (abs: string) => boolean,
): string[] {
  const entryRel = path.relative(REPO_ROOT, path.resolve(REPO_ROOT, entry)).replace(/\\/g, '/');
  const reached = new Set<string>([entryRel]);
  const queue: string[] = [entryRel];
  const seen = new Set<string>([entryRel]);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentAbs = path.join(REPO_ROOT, current);
    // A JSON (or otherwise non-JS) require is a leaf — never parsed for specifiers.
    if (current.endsWith('.json')) continue;
    if (!exists(currentAbs)) continue;
    let src: string;
    try {
      src = readFile(currentAbs);
    } catch {
      continue;
    }
    for (const spec of localSpecifiers(src)) {
      const target = resolveRelative(current, spec, exists);
      if (target === null) continue;
      reached.add(target);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...reached].sort();
}

/** True iff any reached path is a forbidden McBylaw target (by full path OR basename). */
function reachesForbidden(reached: string[]): string | null {
  for (const rel of reached) {
    if (FORBIDDEN_PATHS.includes(rel)) return rel;
    if (FORBIDDEN_BASENAMES.includes(path.basename(rel))) return rel;
  }
  return null;
}

const readFileAbs = (abs: string): string => fs.readFileSync(abs, 'utf8');
const existsAbs = (abs: string): boolean => fs.existsSync(abs);

describe('T-IND — the CoA ingestor reaches no McBylaw evaluator or provisions (Spec 129 §D6)', () => {
  // -------------------------------------------------------------------------
  // T-IND-1 — the LIVE independence lock over every entry file.
  // -------------------------------------------------------------------------
  it('T-IND-1: no entry file reaches a McBylaw evaluator, DSL or provisions file', () => {
    for (const entry of ENTRY_FILES) {
      expect(fs.existsSync(path.join(REPO_ROOT, entry)), `entry file missing: ${entry}`).toBe(true);
      const reached = requireGraph(entry, readFileAbs, existsAbs);
      const hit = reachesForbidden(reached);
      expect(hit, `${entry} reaches forbidden McBylaw target ${hit}; full graph: ${JSON.stringify(reached)}`).toBeNull();
    }
  });

  it('T-IND-1b: the lock is not vacuous — the walk reaches the ingestor\'s real local graph', () => {
    // The entry files have a small, known local graph; if the walker silently returned
    // only the entries (a parse regression) T-IND-1 would pass for the wrong reason.
    const reached = requireGraph('scripts/lib/compute/load-coa-notices.js', readFileAbs, existsAbs);
    expect(reached).toContain('scripts/lib/compute/load-coa-notices.js');
    expect(reached).toContain('scripts/lib/coa-notices/parse-values.js');
    expect(reached).toContain('scripts/lib/coa-notices/vocab.json');
    expect(reached).toContain('scripts/lib/coa-notices/target-map.json');
    // Bare specifiers are leaves — no package path sneaks into the reached set.
    expect(reached.some((r) => r.includes('node_modules'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T-IND-2 — the walker CATCHES a forbidden require (proven-red fixture).
  // -------------------------------------------------------------------------
  it('T-IND-2: the walker catches a forbidden require on the known-bad fixture', () => {
    // The committed fixture is NEVER executed — the walker only reads its text.
    try {
      const reached = requireGraph(FIXTURE_REL, readFileAbs, existsAbs);
      expect(reached, 'the walker must reach the forbidden evaluator through the fixture require')
        .toContain('scripts/analysis/bylaw/evaluate.mjs');
      // The checker function reports SOME forbidden target (evaluate.mjs itself, or a
      // forbidden file it transitively imports — both are in the forbidden set).
      expect(reachesForbidden(reached)).not.toBeNull();
    } finally {
      // nothing to clean up: the fixture is committed
    }
  });

  it('T-IND-2b: the forbidden matcher catches each forbidden target by path and by basename', () => {
    for (const forbidden of FORBIDDEN_PATHS) {
      expect(reachesForbidden([forbidden]), `path form not caught: ${forbidden}`).toBe(forbidden);
    }
    // A forbidden file reached under an unexpected directory is still caught by basename.
    expect(reachesForbidden(['some/other/dir/bylaw-provisions.json'])).toBe('some/other/dir/bylaw-provisions.json');
    expect(reachesForbidden(['scripts/lib/coa-notices/manifest.js'])).toBeNull();
  });
});
