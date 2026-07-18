// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3, §4.1
//
// File-shape lock for scripts/validation/run-step.mjs's Postgres connection
// surface (Guardian follow-up, Phase-0 OUTPUT-panel review of the restore
// tooling work). run-step.mjs builds its OWN pg.Pool (createPool()) rather
// than reusing scripts/lib/pipeline.js's — Spec 113 §4.1 requires every new
// Postgres pool to import the shared ssl-config helper instead of
// constructing its own `ssl` key, and Spec 113 §3's D14 env contract expects
// the same PG_HOST-with-localhost-fallback convention at every canonical
// call site so ssl resolution and the actual connection target never
// diverge. No live DB — matches the src/tests/migrate-runner.infra.test.ts
// file-shape test convention (regex assertions against file content).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/validation/run-step.mjs — connection surface (file shape)', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/validation/run-step.mjs'),
      'utf-8',
    );
  });

  it('imports the shared ssl-config helper rather than constructing its own ssl key', () => {
    expect(content).toMatch(/import\s*\{\s*resolveSslConfig\s*\}\s*from\s*['"]\.\.\/lib\/ssl-config\.js['"]/);
  });

  it('resolves host via PG_HOST with a localhost fallback (Spec 113 §3 D14 convention)', () => {
    expect(content).toMatch(/const host = process\.env\.PG_HOST \|\| ['"]localhost['"];/);
  });

  it('threads the SAME resolved `host` variable into both the Pool config and resolveSslConfig — not two independent reads that could diverge', () => {
    expect(content).toMatch(/ssl:\s*resolveSslConfig\(\{\s*host\s*\}\)/);
  });
});
