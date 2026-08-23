// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3, §4.1
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (§P0)
//
// File-shape lock for scripts/validation/run-step.mjs's Postgres connection
// surface (Guardian follow-up, Phase-0 OUTPUT-panel review of the restore
// tooling work).
//
// ── WHY THIS FILE CHANGED (WF3 2026-08-23, Spec 122 §P0) ────────────────────
// The three original assertions pinned run-step.mjs's OWN inline pool:
//   1. it imports resolveSslConfig from ../lib/ssl-config.js
//   2. `const host = process.env.PG_HOST || 'localhost';`
//   3. `ssl: resolveSslConfig({ host })` — the SAME host variable in both
//      the Pool config and the ssl resolution, "not two independent reads
//      that could diverge"
//
// run-step.mjs no longer builds a pool at all: it delegates to the one shared
// resolver, scripts/lib/resolve-db.js. Each fence is accounted for rather than
// dropped:
//   (1) PRESERVED, one level down — resolve-db.js imports resolveSslConfig and
//       is now the only ssl-key constructor on this path (Spec 113 §4.1 is
//       satisfied more strictly than before: one site instead of many).
//   (2) KNOWINGLY RETIRED — the `|| 'localhost'` fallback WAS the P0 defect.
//       run-step.mjs is a validation RUNNER; silently grading the 222-migration
//       pre-cutover DB is precisely the lying-instrument failure P0 exists to
//       remove. The replacement invariant (assert below) is that an absent
//       target REFUSES instead of defaulting.
//   (3) PRESERVED verbatim — resolve-db.js threads one `host` const into both
//       the pool config and resolveSslConfig. Asserted at its new home, since
//       divergence there would now affect every caller, not just this one.
//
// No live DB — matches the src/tests/migrate-runner.infra.test.ts file-shape
// test convention (regex assertions against file content).

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';

describe('scripts/validation/run-step.mjs — connection surface (file shape)', () => {
  let content: string;
  let resolver: string;

  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/validation/run-step.mjs'),
      'utf-8',
    );
    resolver = fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/resolve-db.js'), 'utf-8');
  });

  it('routes its pool through the shared resolver instead of constructing one inline', () => {
    expect(content).toMatch(
      /import\s*\{\s*createResolvedPool\s*\}\s*from\s*['"]\.\.\/lib\/resolve-db\.js['"]/,
    );
    expect(content).toMatch(/createResolvedPool\(\{\s*label:/);
  });

  it('no longer builds its own pg.Pool or its own ssl key (Spec 113 §4.1)', () => {
    expect(content).not.toMatch(/new Pool\(/);
    expect(content).not.toMatch(/ssl:\s*resolveSslConfig/);
  });

  it('fence (2) replacement: an absent target REFUSES, it does not fall back to localhost', () => {
    // The retired `PG_HOST || 'localhost'` line must not come back anywhere on
    // this path — not in run-step.mjs, not in the resolver it now delegates to.
    expect(content).not.toMatch(/process\.env\.PG_HOST\s*\|\|/);
    expect(resolver).toMatch(/no explicit database target/);
  });

  it('fence (1) preserved: the resolver is the ssl-config importer for this path', () => {
    expect(resolver).toMatch(/require\(['"]\.\/ssl-config['"]\)/);
    expect(resolver).toMatch(/resolveSslConfig/);
  });

  it('fence (3) preserved: ONE resolved `host` feeds both the pool config and resolveSslConfig', () => {
    // The original invariant, verbatim, at its new home — two independent
    // reads of PG_HOST could still diverge, and now would do so fleet-wide.
    expect(resolver).toMatch(/ssl:\s*resolveSslConfig\(\{\s*host\s*\}\)/);
    const discrete = resolver.slice(resolver.indexOf('const host = env.PG_HOST'));
    expect(discrete).toMatch(/const host = env\.PG_HOST\.trim\(\);/);
    // `\r?\n` on purpose: this repo is `core.autocrlf=true` with no
    // .gitattributes, and \n-anchored source scans silently stop matching on a
    // CRLF checkout — the documented cause of the 6 standing CRLF failures.
    expect(discrete.slice(0, discrete.indexOf('};'))).toMatch(/\bhost,\r?\n/);
  });
});
