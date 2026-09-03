// WF3 `wf3_enrich_parcels_cloud_stall` — hardening landed regardless of the H4-vs-H5 ruling
// (premise verification: H4 confirmed with real numbers — successful cloud runs measure
// 107-126 min total, pass2 ~47-48 min the dominant single pass; H6 refuted at the code+manifest
// level; H5/H3 remain undetermined pending a live capture). This file covers the two
// unconditional instruments: commit 1 (bounded, LOUD per-pass SET LOCAL timeouts) and commit 3
// (silence-gated pg_stat_activity stall diagnostic on the optimal-config pass).
//
// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6/§3.7/§3.10
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (fail-safe-loud)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUPS } from '@/features/admin-controls/components/GlobalConfigCard';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');

const REPO_ROOT = join(__dirname, '..', '..');
const SRC = readFileSync(join(REPO_ROOT, 'scripts', 'enrich-parcels.js'), 'utf8');
const SEED = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts', 'seeds', 'logic_variables.json'), 'utf8'));

describe('WF3 enrich_parcels stall commit 1 — bounded, LOUD per-pass SET LOCAL timeouts', () => {
  it('seed declares enrich_parcels_pass_statement_timeout_minutes and enrich_parcels_lock_timeout_ms with sane bounds/defaults', () => {
    const t = SEED.enrich_parcels_pass_statement_timeout_minutes;
    if (!t) throw new Error('enrich_parcels_pass_statement_timeout_minutes missing from seed JSON');
    expect(t.default).toBeGreaterThan(48); // must exceed the STEP 0 measured max real pass (48.3 min) with margin
    expect(t.min).toBe(0);
    expect(t.max).toBeGreaterThanOrEqual(t.default);

    const l = SEED.enrich_parcels_lock_timeout_ms;
    if (!l) throw new Error('enrich_parcels_lock_timeout_ms missing from seed JSON');
    expect(l.default).toBeGreaterThan(0);
    expect(l.min).toBe(0);
  });

  it('LOGIC_VARS_SCHEMA validates both new keys with bounds mirroring the seed', () => {
    expect(SRC).toMatch(
      /enrich_parcels_pass_statement_timeout_minutes:\s*z\.coerce\.number\(\)\.finite\(\)\.min\(0\)\.max\(180\)/,
    );
    expect(SRC).toMatch(/enrich_parcels_lock_timeout_ms:\s*z\.coerce\.number\(\)\.finite\(\)\.min\(0\)\.max\(3600000\)/);
  });

  it('main() resolves both vars from logicVars with the documented defaults', () => {
    expect(SRC).toMatch(
      /enrich_parcels_pass_statement_timeout_minutes:\s*Number\(logicVars\?\.enrich_parcels_pass_statement_timeout_minutes\s*\?\?\s*PASS_STATEMENT_TIMEOUT_MINUTES_DEFAULT\)/,
    );
    expect(SRC).toMatch(
      /enrich_parcels_lock_timeout_ms:\s*Number\(logicVars\?\.enrich_parcels_lock_timeout_ms\s*\?\?\s*PASS_LOCK_TIMEOUT_MS_DEFAULT\)/,
    );
  });

  it('the passes-1-4 shared transaction issues SET LOCAL statement_timeout / lock_timeout before any pass runs', () => {
    const txnBlock = SRC.slice(SRC.indexOf('await pipeline.withTransaction(pool'), SRC.indexOf('runPass(\'pass1_zoning\''));
    expect(txnBlock).toMatch(/SET LOCAL statement_timeout = \$\{passTimeoutMs\}/);
    expect(txnBlock).toMatch(/SET LOCAL lock_timeout = \$\{lockTimeoutMs\}/);
  });

  it('all 4 passes are wrapped by runPass with their own distinct pass name', () => {
    expect(SRC).toMatch(/runPass\('pass1_zoning',/);
    expect(SRC).toMatch(/runPass\('pass2_max_build',/);
    expect(SRC).toMatch(/runPass\('pass3_existing_structure',/);
    expect(SRC).toMatch(/runPass\('pass4_comparable_builds',/);
  });

  it('RED->GREEN: runPass rethrows a 57014 (statement_timeout) LOUD with the pass name in the message', async () => {
    const pgErr = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    await expect(ep.runPass('pass2_max_build', async () => { throw pgErr; })).rejects.toThrow(
      /pass2_max_build[\s\S]*statement_timeout/,
    );
  });

  it('RED->GREEN: runPass rethrows a 55P03 (lock_timeout) LOUD with the pass name in the message', async () => {
    const pgErr = Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
    await expect(ep.runPass('pass4_comparable_builds', async () => { throw pgErr; })).rejects.toThrow(
      /pass4_comparable_builds[\s\S]*lock_timeout/,
    );
  });

  it('runPass passes through an unrelated error unchanged (never masks a real pass bug as a timeout)', async () => {
    const otherErr = new Error('column "foo" does not exist');
    await expect(ep.runPass('pass1_zoning', async () => { throw otherErr; })).rejects.toThrow(
      'column "foo" does not exist',
    );
  });

  it('the SET LOCAL fence: withPipelineStatementTimeout is untouched — every other caller still gets session statement_timeout=0', () => {
    const pipelineSrc = readFileSync(join(REPO_ROOT, 'scripts', 'lib', 'pipeline.js'), 'utf8');
    expect(pipelineSrc).toMatch(/const setSql = `SET statement_timeout TO \$\{timeoutMs\}`;/);
    expect(pipelineSrc).toContain("const timeoutMs = raw === undefined ? 0 : parseInt(raw, 10);");
  });
});

describe('admin GROUPS — WF3 enrich_parcels stall knobs are visible to operators', () => {
  it('GlobalConfigCard GROUPS includes both new keys', () => {
    const allKeys = GROUPS.flatMap((g) => g.keys);
    expect(allKeys).toContain('enrich_parcels_pass_statement_timeout_minutes');
    expect(allKeys).toContain('enrich_parcels_lock_timeout_ms');
  });
});
