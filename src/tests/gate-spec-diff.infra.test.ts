// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-AG, §5 R-BA (gate J)
//
// WF2 gate J — the two checkers that keep the estate UNDERSTANDABLE:
//   J1 `scripts/hooks/check-spec-diff.mjs` — a commit that moves the step
//      contract (`scripts/steps/**`, `scripts/lib/compute/**`, `*.descriptor.json`)
//      must either stage a spec or declare `Spec-diff: N-A <why>` in its body.
//   J2 `scripts/analysis/gates/generated-docs.mjs` — every committed artifact
//      under `docs/reports/generated/` is either regenerated-and-drift-checked or
//      explicitly retired with a why; nothing is unowned.
//
// Both suites prove BOTH directions (Spec 121 §12b.6): the RED arm fires on the
// known-bad fixture, and the GREEN arm stays quiet on the known-good one. The
// live-tree assertion (J2) is the real registry against the real directory.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as specDiff from '../../scripts/hooks/check-spec-diff.mjs';
import * as generatedDocs from '../../scripts/analysis/gates/generated-docs.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');

// ===========================================================================
// J1 — the commit-msg Spec-diff rule
// ===========================================================================

const MSG = (subject: string, ...body: string[]): string => [subject, '', ...body, ''].join('\n');

// The exact fixture from the brief: a descriptor staged, no spec, no trailer.
const DESCRIPTOR = 'scripts/steps/load_parcels.descriptor.json';

describe('gate J1 — specDiffDecision (pure core)', () => {
  it('T1 descriptor staged + no spec + no trailer → red, naming the trigger', () => {
    const r = specDiff.specDiffDecision([DESCRIPTOR], MSG('feat: x'));
    expect(r.status).toBe('red');
    expect(r.triggers).toEqual([DESCRIPTOR]);
  });

  it('T2 + a spec staged → spec_staged (the spec moved with the code)', () => {
    const r = specDiff.specDiffDecision(
      [DESCRIPTOR, 'docs/specs/01-pipeline/41_chain_permits.md'],
      MSG('feat: x'),
    );
    expect(r.status).toBe('spec_staged');
    expect(r.triggers).toEqual([DESCRIPTOR]);
  });

  it('T3 + trailer "Spec-diff: N-A line-ending only change" → declared_NA', () => {
    const r = specDiff.specDiffDecision([DESCRIPTOR], MSG('feat: x', 'Spec-diff: N-A line-ending only change'));
    expect(r.status).toBe('declared_NA');
  });

  it('T4 trailer "Spec-diff: N-A x" (why too short) → red', () => {
    const r = specDiff.specDiffDecision([DESCRIPTOR], MSG('feat: x', 'Spec-diff: N-A x'));
    expect(r.status).toBe('red');
  });

  it('T5 only src/app/x.ts staged → not_triggered', () => {
    const r = specDiff.specDiffDecision(['src/app/x.ts'], MSG('feat: x'));
    expect(r.status).toBe('not_triggered');
    expect(r.triggers).toEqual([]);
  });

  it('T6 trailer inside a "#" comment line → red (a comment is not a declaration)', () => {
    const r = specDiff.specDiffDecision([DESCRIPTOR], MSG('feat: x', '# Spec-diff: N-A line-ending only change'));
    expect(r.status).toBe('red');
  });

  it('T7a the why must be ≥ 10 non-space chars — exactly 10 passes, 9 fails', () => {
    expect(specDiff.specDiffDecision([DESCRIPTOR], MSG('feat: x', 'Spec-diff: N-A 1234567890')).status).toBe('declared_NA');
    expect(specDiff.specDiffDecision([DESCRIPTOR], MSG('feat: x', 'Spec-diff: N-A 123456789')).status).toBe('red');
  });

  it('T7b all three trigger classes fire; a write-only "Spec-diff:" line is not an N-A', () => {
    expect(specDiff.specDiffDecision(['scripts/steps/foo.js'], MSG('s')).status).toBe('red');
    expect(specDiff.specDiffDecision(['scripts/lib/compute/foo.js'], MSG('s')).status).toBe('red');
    expect(specDiff.specDiffDecision(['a/b.descriptor.json'], MSG('s')).status).toBe('red');
    expect(specDiff.specDiffDecision([DESCRIPTOR], MSG('s', 'Spec-diff: yes it moved')).status).toBe('red');
  });

  it('T7c the subject line is never read for the trailer (body only)', () => {
    expect(specDiff.specDiffDecision([DESCRIPTOR], 'feat: x Spec-diff: N-A line-ending only change').status).toBe('red');
  });

  it('T7d messageBody drops the subject and "#" comment lines, keeps the rest', () => {
    const body = specDiff.messageBody('subject\n# comment\n\ntrailer line');
    expect(body).toEqual(['', 'trailer line']);
  });
});

// ===========================================================================
// J2 — generated-docs freshness
// ===========================================================================

const fixtureRepo = (...names: string[]): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-j2-'));
  fs.mkdirSync(path.join(root, generatedDocs.GENERATED_DIR_REL), { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(root, generatedDocs.GENERATED_DIR_REL, n), '# fixture\n');
  return root;
};

const ROWS = [
  { file: 'kept.md', generator: 'scripts/gen.mjs', has_check: true },
  { file: 'gone.md', retired: true, why: 'superseded by Spec 122 §1.8 prose; no generator remains' },
];

describe('gate J2 — generatedDocsDecision over a closed listing', () => {
  it('T1 a dir file absent from the list → RED (unowned)', () => {
    const r = generatedDocs.checkGeneratedDocs(fixtureRepo('kept.md', 'gone.md', 'extra.md'), ROWS);
    expect(r.pass).toBe(false);
    expect(r.violations.some((v) => v.item === 'unowned:extra.md')).toBe(true);
  });

  it('T2 a row with retired:true + why → GREEN (the retire answer)', () => {
    expect(generatedDocs.isRetired(ROWS[1])).toBe(true);
    expect(generatedDocs.rowViolation(ROWS[1])).toBeNull();
    const r = generatedDocs.checkGeneratedDocs(fixtureRepo('kept.md', 'gone.md'), ROWS);
    expect(r.pass).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('T3 a generator with no --check arm and no retire → RED', () => {
    const r = generatedDocs.checkGeneratedDocs(fixtureRepo('nocheck.md'), [
      { file: 'nocheck.md', generator: 'scripts/gen.mjs', has_check: false },
    ]);
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.detail).toMatch(/no --check arm/);
  });

  it('T4 a row with neither a checkable generator nor retired → RED', () => {
    expect(generatedDocs.rowViolation({ file: 'orphan.md' })).toMatch(/neither a checkable/);
  });

  it('T5 retired with a blank why does NOT count as retired → RED', () => {
    expect(generatedDocs.isRetired({ file: 'x.md', retired: true, why: '   ' })).toBe(false);
    expect(generatedDocs.rowViolation({ file: 'x.md', retired: true, why: '   ' })).toMatch(/neither a checkable/);
  });

  it('T6 the LIVE registry covers every file in docs/reports/generated/ (both directions)', () => {
    // GREEN direction: the closed list owns every live doc (no unowned file).
    const live = generatedDocs.liveGeneratedDocs(REPO_ROOT);
    expect(live.length).toBeGreaterThan(0);
    const r = generatedDocs.checkGeneratedDocs(REPO_ROOT);
    expect(r.violations.filter((v) => v.item.startsWith('unowned:'))).toEqual([]);
    // and RED direction: one extra file makes the same listing fail.
    const bad = generatedDocs.checkGeneratedDocs(fixtureRepo(...live, 'brand-new-report.md'));
    expect(bad.pass).toBe(false);
    expect(bad.violations.some((v) => v.item === 'unowned:brand-new-report.md')).toBe(true);
  });

  it('T7 the module self-test (known-bad + known-good) passes', () => {
    expect(generatedDocs.selfTest()).toBe(true);
  });

  it('T8 the report table names generator, --check and a proposal for every row', () => {
    const table = generatedDocs.report(REPO_ROOT);
    expect(table.length).toBe(generatedDocs.GENERATED_DOCS.length);
    for (const row of table) {
      expect(row.generator).toBeTruthy();
      expect(['yes', 'no']).toContain(row.hasCheck);
      expect(['keep', 'retire']).toContain(row.proposed);
    }
  });
});
