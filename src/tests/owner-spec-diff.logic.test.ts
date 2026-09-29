// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BB (OWNER-SPEC-DIFF, fast invariant #43)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 row 9(b)

// A converted.json append must touch every owner spec the system map names for that
// script, or its census row carries spec_diff "N-A" + spec_diff_reason (>= 20 chars).
// Replaces the commit-body "N-A" convention.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ownerSpecsFor,
  checkOwnerSpecDiff,
  convertedFilesOf,
  NA_REASON_MIN,
} from '../../scripts/analysis/gates/owner-spec-diff.mjs';

const MAP = [
  '| # | Spec File | Feature | Implementation | Tests | Status |',
  '|---|---|---|---|---|---|',
  '| 43 | `01-pipeline/43_chain_sources.md` | Sources | `scripts/b.js`, `scripts/c.js` | `t` | Done |',
  '| 62 | `01-pipeline/62_x.md` | X | `scripts/b.js` | `t` | Done |',
  '| 27 | `archive/27_old.md` | Old | `scripts/b.js` | `t` | Done |',
  '| 90 | `docs/reference/90_ref.md` | Ref | `scripts/c.js` | `t` | Done |',
  '| 91 | `01-pipeline/91_y.md` | Y | `scripts/bb.js` | `t` | Done |',
].join('\n');
const S43 = 'docs/specs/01-pipeline/43_chain_sources.md';
const S62 = 'docs/specs/01-pipeline/62_x.md';

const readRepoFile = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('owner-spec-diff (fast invariant #43)', () => {
  it('1. convertedFilesOf normalizes entries (string or {file}, backslashes -> /)', () => {
    expect(convertedFilesOf({ converted: ['scripts/a.js', { file: 'scripts\\b.js' }] })).toEqual([
      'scripts/a.js',
      'scripts/b.js',
    ]);
    expect(convertedFilesOf({})).toEqual([]);
  });

  it('2. ownerSpecsFor matches only the literal backticked token (archive skipped, bb.js not matched)', () => {
    expect(ownerSpecsFor('scripts/b.js', MAP)).toEqual([S43, S62]);
  });

  it('3. ownerSpecsFor uses an as-is docs/ cell and prefixes everything else (panel I-3)', () => {
    expect(ownerSpecsFor('scripts/c.js', MAP)).toEqual(['docs/reference/90_ref.md', S43]);
  });

  it('4. ownerSpecsFor on the real system map resolves both specs for enrich-centreline.js', () => {
    const text = readRepoFile('docs/specs/00-architecture/00_system_map.md');
    expect(ownerSpecsFor('scripts/enrich-centreline.js', text)).toEqual([
      'docs/specs/01-pipeline/43_chain_sources.md',
      'docs/specs/01-pipeline/62_source_centreline.md',
    ]);
  });

  it('5. PASS when every appended file touches all of its owner specs', () => {
    const res = checkOwnerSpecDiff({
      baseConverted: ['scripts/a.js'],
      headConverted: ['scripts/a.js', 'scripts/b.js'],
      changedPaths: [S43, S62, 'scripts/steps/_schema/converted.json'],
      systemMapText: MAP,
      censusEntries: [],
      mode: 'staged',
      error: null,
    });
    expect(res.id).toBe(43);
    expect(res.pass).toBe(true);
    expect(res.appended).toEqual(['scripts/b.js']);
    expect(res.blockedFiles).toEqual([]);
    expect(res.detail).toContain('1 file(s) appended');
  });

  it('6. FAIL when an owner spec is missing and no N-A census row excuses it', () => {
    const res = checkOwnerSpecDiff({
      baseConverted: ['scripts/a.js'],
      headConverted: ['scripts/a.js', 'scripts/b.js'],
      changedPaths: [S43],
      systemMapText: MAP,
      censusEntries: [],
      mode: 'staged',
      error: null,
    });
    expect(res.pass).toBe(false);
    expect(res.blockedFiles).toEqual(['scripts/b.js']);
    expect(res.detail).toContain(S62);
    expect(res.detail).toContain('spec_diff "N-A"');
  });

  it('7. N-A with a >= 20-char reason passes', () => {
    const res = checkOwnerSpecDiff({
      baseConverted: ['scripts/a.js'],
      headConverted: ['scripts/a.js', 'scripts/b.js'],
      changedPaths: [],
      systemMapText: MAP,
      censusEntries: [
        {
          file: 'scripts/b.js',
          spec_diff: 'N-A',
          spec_diff_reason: 'pure refactor, no owner-spec behaviour change',
        },
      ],
      mode: 'staged',
      error: null,
    });
    expect(res.pass).toBe(true);
    expect(res.blockedFiles).toEqual([]);
  });

  it('8. N-A with a too-short reason fails', () => {
    const res = checkOwnerSpecDiff({
      baseConverted: ['scripts/a.js'],
      headConverted: ['scripts/a.js', 'scripts/b.js'],
      changedPaths: [],
      systemMapText: MAP,
      censusEntries: [
        { file: 'scripts/b.js', spec_diff: 'N-A', spec_diff_reason: 'too short' },
      ],
      mode: 'staged',
      error: null,
    });
    expect(res.pass).toBe(false);
    expect(res.blockedFiles).toEqual(['scripts/b.js']);
  });

  it('9. zero owner specs fails unless a valid N-A row documents it', () => {
    const noSpecs = checkOwnerSpecDiff({
      baseConverted: [],
      headConverted: ['scripts/zzz.js'],
      changedPaths: [],
      systemMapText: MAP,
      censusEntries: [],
      mode: 'staged',
      error: null,
    });
    expect(noSpecs.pass).toBe(false);
    expect(noSpecs.detail).toContain('no owner spec');

    const excused = checkOwnerSpecDiff({
      baseConverted: [],
      headConverted: ['scripts/zzz.js'],
      changedPaths: [],
      systemMapText: MAP,
      censusEntries: [
        {
          file: 'scripts/zzz.js',
          spec_diff: 'N-A',
          spec_diff_reason: 'legacy scratch script, no owning spec row',
        },
      ],
      mode: 'staged',
      error: null,
    });
    expect(excused.pass).toBe(true);
  });

  it('10. nothing appended passes trivially', () => {
    const res = checkOwnerSpecDiff({
      baseConverted: ['scripts/a.js'],
      headConverted: ['scripts/a.js'],
      changedPaths: [],
      systemMapText: MAP,
      censusEntries: [],
      mode: 'staged',
      error: null,
    });
    expect(res.pass).toBe(true);
    expect(res.appended).toEqual([]);
    expect(res.detail).toContain('0 file(s) appended');
  });

  it('11. an error input is unreadable and blocks', () => {
    const res = checkOwnerSpecDiff({
      error: 'git failed',
      baseConverted: [],
      headConverted: [],
      changedPaths: [],
      systemMapText: MAP,
      censusEntries: [],
    });
    expect(res.pass).toBe(false);
    expect(res.detail).toContain('unreadable');
  });

  it('12. step-validate.mjs wiring locks (panel I-2 / I-4)', () => {
    const src = readRepoFile('scripts/analysis/step-validate.mjs');

    const i = src.indexOf('readCommitChangeSet(REPO_ROOT)');
    const j = src.indexOf('nothing to validate, exiting clean');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);

    expect(src).toContain('if (ownerSpecHardStop) anyHardStop = true;');

    const start = src.indexOf('function fastInvariants(');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\nfunction ', start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).not.toContain('checkOwnerSpecDiff');

    expect(src).toContain('converted: convertedFilesOf(parsed)');
  });

  it('NA_REASON_MIN is 20', () => {
    expect(NA_REASON_MIN).toBe(20);
  });
});
