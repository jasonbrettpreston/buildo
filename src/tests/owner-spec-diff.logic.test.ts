// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BB (OWNER-SPEC-DIFF, fast invariant #43)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 row 9(b)

// A converted.json append must touch every owner spec the census `owner_specs` names for that
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

const S43 = 'docs/specs/01-pipeline/43_chain_sources.md';
const S62 = 'docs/specs/01-pipeline/62_x.md';

// Census rows: `entries[]` and `exemptions[]` alike carry `owner_specs`; the system map no
// longer feeds #43 at all.
const CENSUS = [
  { slug: 'b', file: 'scripts/b.js', owner_specs: [S43, S62] },
  { slug: 'c', file: 'scripts/c.js', owner_specs: ['docs/reference/90_ref.md', S43] },
  { slug: 'r', file: 'scripts/r.js', reason: 'runner_owned', owner_specs: [S43] },
  { slug: 'u', file: 'scripts/u.js' },
];

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

  it('2. ownerSpecsFor reads census owner_specs (entries and exemptions); no substring match', () => {
    expect(ownerSpecsFor('scripts/b.js', CENSUS)).toEqual([S43, S62]);
    expect(ownerSpecsFor('scripts/r.js', CENSUS)).toEqual([S43]);
    expect(ownerSpecsFor('scripts/u.js', CENSUS)).toEqual([]);
    expect(ownerSpecsFor('scripts/bb.js', CENSUS)).toEqual([]);
  });

  it('3. ownerSpecsFor returns the declared paths sorted and unique', () => {
    expect(ownerSpecsFor('scripts/c.js', CENSUS)).toEqual(['docs/reference/90_ref.md', S43]);
  });

  it('4. ownerSpecsFor on the real census resolves declared owner specs', () => {
    const doc = JSON.parse(readRepoFile('scripts/steps/_schema/step-archetype-census.json'));
    const rows = [...doc.entries, ...doc.exemptions];
    expect(ownerSpecsFor('scripts/enrich-centreline.js', rows)).toEqual([
      'docs/specs/01-pipeline/62_source_centreline.md',
    ]);
    expect(ownerSpecsFor('scripts/reconcile-runs.js', rows)).toEqual([
      'docs/specs/01-pipeline/43_chain_sources.md',
    ]);
    expect(ownerSpecsFor('scripts/enrich-parcels.js', rows)).toEqual([
      'docs/specs/01-pipeline/65_enrich_parcels.md',
      'docs/specs/01-pipeline/67_maxbuild_bylaw_derivation.md',
      'docs/specs/01-pipeline/78_optimal_lot_configuration.md',
    ]);
  });

  it('5. PASS when every appended file touches all of its owner specs', () => {
    const res = checkOwnerSpecDiff({
      baseConverted: ['scripts/a.js'],
      headConverted: ['scripts/a.js', 'scripts/b.js'],
      changedPaths: [S43, S62, 'scripts/steps/_schema/converted.json'],
      censusEntries: CENSUS,
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
      censusEntries: CENSUS,
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
      censusEntries: CENSUS,
      mode: 'staged',
      error: null,
    });
    expect(noSpecs.pass).toBe(false);
    expect(noSpecs.detail).toContain('no owner spec');

    const excused = checkOwnerSpecDiff({
      baseConverted: [],
      headConverted: ['scripts/zzz.js'],
      changedPaths: [],
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
      censusEntries: CENSUS,
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
      censusEntries: CENSUS,
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

  it('13. owners are the UNION of the base and staged census (F1: a cutover cannot re-point its own owners)', () => {
    const S124 = 'docs/specs/01-pipeline/124_step_standard_policy.md';
    const bypass = checkOwnerSpecDiff({
      baseConverted: [],
      headConverted: ['scripts/x.js'],
      changedPaths: [S124],
      baseCensusEntries: [{ file: 'scripts/x.js', owner_specs: [S62] }],
      censusEntries: [{ file: 'scripts/x.js', owner_specs: [S124] }],
      mode: 'staged',
      error: null,
    });
    expect(bypass.pass).toBe(false);
    expect(bypass.detail).toContain(S62);

    const satisfied = checkOwnerSpecDiff({
      baseConverted: [],
      headConverted: ['scripts/x.js'],
      changedPaths: [S124, S62],
      baseCensusEntries: [{ file: 'scripts/x.js', owner_specs: [S62] }],
      censusEntries: [{ file: 'scripts/x.js', owner_specs: [S124] }],
      mode: 'staged',
      error: null,
    });
    expect(satisfied.pass).toBe(true);
  });

  it('14. a row absent from the base census uses the staged owner_specs', () => {
    const S124 = 'docs/specs/01-pipeline/124_step_standard_policy.md';
    const res = checkOwnerSpecDiff({
      baseConverted: [],
      headConverted: ['scripts/x.js'],
      changedPaths: [S124],
      baseCensusEntries: [],
      censusEntries: [{ file: 'scripts/x.js', owner_specs: [S124] }],
      mode: 'staged',
      error: null,
    });
    expect(res.pass).toBe(true);
  });

  it('NA_REASON_MIN is 20', () => {
    expect(NA_REASON_MIN).toBe(20);
  });
});
