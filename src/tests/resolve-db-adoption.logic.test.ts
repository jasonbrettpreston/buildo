// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (§P0 — the 24-file census)
//
// THE CENSUS LOCK (WF3 2026-08-23). This is the regression lock for the P0
// defect itself, not for the resolver's internals.
//
// The measured census that opened P0:
//     grep -rln "localhost:5432\|host: 'localhost'\|host: process.env.PG_HOST" scripts/
//   → 24 files, in three tiers:
//       tier 1  (3)  fully hardcoded pools, no env escape
//       tier 2 (11)  PG_* fallbacks that never read DATABASE_URL
//       tier 3 (10)  read DATABASE_URL but fall back to the pre-cutover default
//
// Every one of them, run with no env set, connected to localhost:5432/buildo —
// the PRE-CUTOVER database — and said nothing. This test re-runs that census in
// CODE (comments excluded, so the specs and docblocks that must keep NAMING the
// old target still can) and requires it to be EMPTY.
//
// tasks/lessons.md: "An apply-time invariant is not enforcement — it needs a
// standing audit row." A one-shot conversion proves a state; only a recurring
// check defends it. Without this file, file #25 lands next month.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FENCED,
  KNOWN_BAD,
  ROOT,
  SILENT_DEFAULT_PATTERNS,
  census,
  codeOf,
  stripComments,
  trackedScriptFiles,
} from './script-source-scan';

/**
 * Files whose OLD default already pointed at the AUTHORITATIVE stack
 * (127.0.0.1:54322/postgres), not the pre-cutover DB. Converting them was still
 * right — one resolver with one rule beats a per-script allow-list of "which
 * defaults happen to be correct today", which is the state that let 24 scripts
 * drift unnoticed — but the cost is REAL and ADDITIONAL to the P0 defect: their
 * zero-config invocation is gone. Recorded here, and their docstrings must say
 * so, because a retirement nobody wrote down is how the next reader concludes
 * the script is broken.
 *
 * NOT in `FENCED`: these files ARE converted and MUST stay in the census scan.
 */
const RETIRED_ZERO_CONFIG: Record<string, string> = {
  'scripts/bootstrap-first-admin.js': 'defaulted to 127.0.0.1:54322 — the right DB; now requires an explicit target',
  'scripts/wipe-supabase-auth-state.js': 'defaulted to 127.0.0.1:54322 — the right DB; now requires an explicit target',
};

describe('no script under scripts/ silently defaults to the pre-cutover database', () => {
  it('the P0 census is EMPTY in code', () => {
    const hits = census();
    const report = hits.map((h) => `  ${h.file}:${h.line}  [${h.pattern}]  ${h.text}`).join('\n');
    expect(hits, `silent pre-cutover DB defaults still present:\n${report}`).toEqual([]);
  });

  it('the census patterns are not vacuous — each still matches its known-bad shape', () => {
    // A source-scan whose regexes silently stopped matching would report a
    // clean census forever. Prove each pattern still fires on the exact code
    // it was written against (Spec 121 §12b.6 — every checker ships a
    // known-bad fixture and CI asserts it FIRES).
    expect(KNOWN_BAD).toHaveLength(SILENT_DEFAULT_PATTERNS.length);
    KNOWN_BAD.forEach((line, i) => {
      const pattern = SILENT_DEFAULT_PATTERNS[i];
      expect(pattern, `no pattern at index ${i}`).toBeDefined();
      expect(
        pattern!.re.test(line),
        `pattern "${pattern!.id}" no longer matches its fixture`,
      ).toBe(true);
    });
  });

  it('the census actually COVERS the resolver itself (the untracked-file blind spot)', () => {
    // ROOT-CAUSE LOCK, 2026-08-23. Both P0 locks were green through all of
    // development and went red the instant the work was committed. Not the
    // working diff — TRACKED-NESS: `git ls-files` sees only tracked files, and
    // scripts/lib/resolve-db.js was untracked (`??`) the whole time it was
    // written, so the census silently skipped the one file it most needs to
    // cover. Committing it merely REVEALED two bugs that were latent from the
    // first run. A scan that cannot see a brand-new file is a scan that passes
    // hardest exactly when new code is landing.
    const scanned = trackedScriptFiles();
    expect(scanned).toContain('scripts/lib/resolve-db.js');
    expect(scanned).toContain('scripts/migrate.js');
    // and the census is reading real content, not an empty set
    expect(scanned.length).toBeGreaterThan(50);
  });

  it('the resolver may NAME the pre-cutover DB in its error text without tripping the census', () => {
    // The complement of the fix. resolve-db.js's error messages exist to tell
    // an operator exactly which database was refused — "localhost:5432/buildo,
    // 222 migrations". The old bare /localhost:5432/ pattern read that as a
    // violation, which would have forced the resolver to stop explaining
    // itself. Prose mentioning the target is fine; a connection URL is not.
    const code = codeOf('scripts/lib/resolve-db.js');
    expect(code).toMatch(/localhost:5432\/buildo/); // still says it, in code (template literals)
    expect(census().filter((h) => h.file === 'scripts/lib/resolve-db.js')).toEqual([]);
  });

  it('stripComments does not blind the scan to real code', () => {
    const src = [
      '// target: localhost:5432/buildo (historical note)',
      '/* localhost:5432 in a block comment */',
      " * host: 'localhost' in a jsdoc line",
      "const pool = new Pool({ host: 'localhost' });",
    ].join('\n');
    const stripped = stripComments(src);
    expect(stripped).toContain("new Pool({ host: 'localhost' })");
    expect(stripped).not.toContain('historical note');
    expect(stripped).not.toContain('block comment');
    expect(stripped).not.toContain('jsdoc line');
  });
});

describe('the fenced exclusions stay small and stay explained', () => {
  it('every fenced file names a reason and still exists', () => {
    const tracked = new Set(trackedScriptFiles({ includeFenced: true }));
    for (const [file, reason] of Object.entries(FENCED)) {
      expect(tracked.has(file), `${file} is fenced but no longer tracked`).toBe(true);
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it.each(Object.keys(RETIRED_ZERO_CONFIG))(
    '%s documents that its zero-config default was RETIRED, not lost by accident',
    (file) => {
      // These two are the only conversions that cost a WORKING default. The
      // docstring is the only place a future reader will look when the script
      // suddenly refuses to run, so the retirement must be stated there.
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src).toMatch(/DATABASE_URL \/ PG_\*\s*(—\s*)?\(REQUIRED\)/);
      expect(src).toMatch(/No default/);
      expect(src).toMatch(/127\.0\.0\.1:54322/);
      // and it must NOT still advertise the retired convenience
      expect(src).not.toMatch(/\(optional\) — same contract/);
    },
  );

  it('both files are converted and still censused — RETIRED_ZERO_CONFIG is not an exemption', () => {
    for (const file of Object.keys(RETIRED_ZERO_CONFIG)) {
      expect(file in FENCED, `${file} must NOT be fenced out of the census`).toBe(false);
      expect(trackedScriptFiles()).toContain(file);
    }
  });

  it('the fence list has not grown — 2 entries, both deferred by an explicit ruling', () => {
    // A silently-growing exclusion list is how a census lock dies. Any addition
    // must be a deliberate edit to this number with a followup filed.
    expect(Object.keys(FENCED)).toHaveLength(2);
  });
});

describe('the converted files route through the shared resolver', () => {
  // The census going quiet is necessary but not sufficient: a file could pass
  // by deleting its pool entirely, or by hand-rolling a second resolver. Pin
  // the adoption itself.
  //
  // 24 from the original census + 12 more the census GREP COULD NOT SEE:
  // pipeline.createPool() callers (a different idiom for the same pre-cutover
  // default) plus run-step.mjs's bespoke `const host = PG_HOST || 'localhost'`
  // and supabase-load-gates.js's source pool.
  const CONVERTED = [
    'scripts/analysis/_tmp_reset_coa_links.js',
    'scripts/analysis/backfill-admin-watchlist.js',
    'scripts/analysis/capture-timeline-fixtures.mjs',
    'scripts/analysis/cost-estimates-sanity-audit.js',
    'scripts/analysis/massing-coverage-analysis.js',
    'scripts/analysis/p14-trade-attachment-evaluation.js',
    'scripts/analysis/parcel-sanity-audit.js',
    'scripts/analysis/scope-report-queries.js',
    'scripts/analysis/wf2-archetype-shadow-compare.js',
    'scripts/analysis/wf2-reset-coa-trade-classification.js',
    'scripts/analysis/wf3-cost-coherence-sanity.js',
    'scripts/analysis/wf3-sample-full-dump.js',
    'scripts/backfill/migrate-entities.js',
    'scripts/backfill/seed-pipeline-runs.js',
    'scripts/bootstrap-first-admin.js',
    'scripts/generate-db-docs.mjs',
    'scripts/migrate.js',
    'scripts/restore-db.js',
    'scripts/seed-coa.js',
    'scripts/seed-parcels.js',
    'scripts/seed-pipeline-schedules.js',
    'scripts/seed-trades.ts',
    'scripts/seeds/apply-logic-variables.js',
    'scripts/wipe-supabase-auth-state.js',
  ];

  /** The widened set: same defect, an idiom the census grep could not match. */
  const WIDENED = [
    'scripts/analysis/_rc_q.js',
    'scripts/analysis/wf1-bylaw-heuristic-validation.js',
    'scripts/analysis/wf1-cost-accuracy-investigation.js',
    'scripts/analysis/wf1-cost-matrix-rekey-pis.js',
    'scripts/analysis/wf1-gfa-accuracy-investigation.js',
    'scripts/analysis/wf1-reno-build-pattern-investigation.js',
    'scripts/analysis/wf2-priceable-none-taxonomy.js',
    'scripts/generate-lineage-docs.mjs',
    'scripts/local-cron.js',
    'scripts/one-time/backfill-parcels-zoning-index.js',
    'scripts/one-time/backfill-permits-coa-zoning-index.js',
    'scripts/validation/run-step.mjs',
    'scripts/validation/supabase-load-gates.js',
  ];

  const ALL = [...CONVERTED, ...WIDENED];

  it('the original set is exactly the 24 files the census measured', () => {
    expect(CONVERTED).toHaveLength(24);
    expect([...CONVERTED].sort()).toEqual(CONVERTED);
  });

  it('no file is counted twice across the original and widened sets', () => {
    expect(new Set(ALL).size).toBe(ALL.length);
  });

  it.each(ALL)('%s imports scripts/lib/resolve-db', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).toMatch(/resolve-db/);
  });

  it('no converted file still imports createPool from lib/pipeline', () => {
    // The widened half existed BECAUSE createPool() carries the same default.
    // Converting a file and leaving the import is a no-op that reads as a fix.
    // Matched on the IMPORT (comments explaining the old call are fine, and
    // run-step.mjs keeps a local wrapper of the same name that now delegates).
    const offenders = ALL.filter((f) =>
      /\{[^}]*\bcreatePool\b[^}]*\}\s*=\s*(?:require\(|await import\()['"][^'"]*lib\/pipeline/.test(
        readFileSync(join(ROOT, f), 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
