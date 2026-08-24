// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (§P0)
//
// Shared source-scan primitives for the P0 census locks
// (resolve-db-adoption.logic.test.ts + resolve-db.logic.test.ts).
//
// ── WHY THIS MODULE EXISTS (post-commit defect, 2026-08-23) ─────────────────
// Both locks were GREEN through development and went RED the moment commits
// 3531b141/9e2da7b1 landed. The cause was NOT the working diff — it was
// TRACKED-NESS. Both derivations went through `git ls-files` / `git grep`,
// which see only TRACKED files, and `scripts/lib/resolve-db.js` was untracked
// (`??`) the whole time it was being written. So the census silently skipped
// the one file it most needs to cover, and committing it merely REVEALED two
// latent bugs that had been masked from the start:
//
//   1. the `/localhost:5432/` pattern matched the resolver's own ERROR-MESSAGE
//      template literals (`:225`, `:305`) — prose, not connection config;
//      stripComments removes comments, never string literals.
//   2. `git grep 'minMigration: null'` matched the resolver's JSDoc at `:56`
//      alongside migrate.js's real call site — documentation read as a call.
//
// Both fixes are here, and both derive from TRACKED FILE CONTENT
// (`git ls-files` + `readFileSync`) — never from `git diff`, `git status`, or
// any other working-state derivation. That keeps the locks identical on a
// clean clone, in CI, and in a tree carrying unrelated in-flight edits.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = process.cwd();

/**
 * Files allowed to keep a defaulted PG_* target, each with a stated fence.
 * An entry here is a promise the exclusion was reasoned about — not a place
 * to park a violation.
 */
export const FENCED: Record<string, string> = {
  // Coordinator boundary (WF3 2026-08-23): createPool's default feeds all 27
  // manifest steps + run-chain + the cloud cron. Changing it is a separate,
  // measured commit — filed in docs/reports/review_followups.md.
  'scripts/lib/pipeline.js':
    "createPool's default — blast radius is every pipeline step; separate measured commit",
  // The pre-flight checker REPORTS the target; it must mirror whatever
  // createPool actually does, or it reports a target nothing uses. It moves
  // WITH pipeline.js, never before it. (It opens no pool of its own.)
  'scripts/ai-env-check.mjs':
    'diagnostic that mirrors createPool default by design; moves with pipeline.js',
};

/**
 * The census patterns, applied to CODE only.
 *
 * ⚠️ Pattern 1 is deliberately anchored to a connection-URL LITERAL
 * (`postgres://…localhost:5432`), not a bare `localhost:5432`. The bare form
 * matched ordinary prose — including the resolver's own error messages, whose
 * whole job is to name the pre-cutover DB so an operator knows what went
 * wrong. A census that cannot tell "connects to the wrong DB" from "mentions
 * the wrong DB" would force the resolver to stop explaining itself. The real
 * defect shape is a connection string used as a fallback; that is what this
 * matches, and `known-bad fixture` coverage below proves it still fires.
 */
export const SILENT_DEFAULT_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: 'pre-cutover connection-string literal', re: /postgres(?:ql)?:\/\/[^\s'"`]*localhost:5432/ },
  { id: "hardcoded host: 'localhost'", re: /host:\s*['"]localhost['"]/ },
  { id: 'defaulted PG_* target var', re: /process\.env\.PG_(HOST|PORT|DATABASE)\s*\|\|/ },
];

/** The exact code each pattern was written against — proves none has gone vacuous. */
export const KNOWN_BAD = [
  "  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/buildo' });",
  "  const c = new Client({ host: 'localhost', user: 'postgres', database: 'buildo' });",
  "    host: process.env.PG_HOST || 'localhost',",
];

/**
 * Strip block and line comments, PRESERVING the line count so reported line
 * numbers match the real file. Deliberately crude: it over-strips a `//`
 * inside a string literal, which can only cause a FALSE PASS on a line that
 * has no other signal — and every real violation here is bare code.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1').replace(/^\s*\*.*$/, ''))
    .join('\n');
}

/**
 * Every TRACKED script under scripts/, from committed/index content only.
 *
 * `git ls-files` (not `git diff`/`git status`) so the set is identical on a
 * clean clone and in CI, and unaffected by unrelated in-flight edits sitting
 * in the tree. `includeFenced` exists so a test can assert the fenced files
 * are still real, tracked paths rather than stale strings.
 */
export function trackedScriptFiles(opts?: { includeFenced?: boolean }): string[] {
  const all = execFileSync('git', ['ls-files', '--', 'scripts/'], { cwd: ROOT, stdio: 'pipe' })
    .toString()
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => /\.(js|mjs|cjs|ts)$/.test(f));
  return opts?.includeFenced ? all : all.filter((f) => !(f in FENCED));
}

/** Comment-stripped source of a repo-relative path. */
export function codeOf(file: string): string {
  return stripComments(readFileSync(join(ROOT, file), 'utf8'));
}

export interface CensusHit {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

/** Run the census over tracked script CODE. Empty is the invariant. */
export function census(): CensusHit[] {
  const hits: CensusHit[] = [];
  for (const file of trackedScriptFiles()) {
    codeOf(file)
      .split(/\r?\n/)
      .forEach((text, i) => {
        for (const { id, re } of SILENT_DEFAULT_PATTERNS) {
          if (re.test(text)) hits.push({ file, line: i + 1, text: text.trim(), pattern: id });
        }
      });
  }
  return hits;
}

/**
 * Tracked scripts whose CODE (not prose) passes the floor-exemption sentinel.
 *
 * Comment-stripped on purpose: `resolve-db.js` DOCUMENTS `minMigration: null`
 * extensively — that documentation is the point, and a raw `git grep` read it
 * as a call site.
 */
export function floorExemptionCallSites(): string[] {
  return trackedScriptFiles({ includeFenced: true })
    .filter((f) => /minMigration\s*:\s*null/.test(codeOf(f)))
    .sort();
}
