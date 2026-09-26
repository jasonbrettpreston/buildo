// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (G7);
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate K)
//
// WF2 gate K — `scripts/analysis/gates/red-evidence.mjs`. G7's "prove red" is
// only real evidence once the report cites a COMMITTED vitest JSON reporter
// artifact under `docs/reports/red-evidence/<slug>/*.json` with >=1 failed
// assertion — never the bare word `RED` in prose (operator decision 3,
// 2026-09-26). This suite proves the module both directions, directly,
// against real tmp-dir fixtures (a checker never proven to fire is not a
// check, Spec 121 §12b.6).

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as redEvidence from '../../scripts/analysis/gates/red-evidence.mjs';

const SLUG = 'fixture_step';
const tmpDirs: string[] = [];

function makeRepoRoot(): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gate-k-test-'));
  tmpDirs.push(dir);
  return dir;
}

function writeArtifact(repoRoot: string, name: string, doc: unknown): string {
  const dir = path.join(repoRoot, 'docs/reports/red-evidence', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(doc));
  return `docs/reports/red-evidence/${SLUG}/${name}`;
}

const vitestDoc = (assertions: Array<{ status: string; fullName: string }>) => ({
  testResults: [{ assertionResults: assertions }],
});

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('gate K — red-first proof is a committed vitest JSON artifact, not the word RED', () => {
  it('T1: selfTest() does not throw', () => {
    expect(() => redEvidence.selfTest()).not.toThrow();
  });

  describe('T2: selfTestCases() — every fixture the module ships, both directions', () => {
    for (const c of redEvidence.selfTestCases() as Array<{
      name: string;
      build: (repoRoot: string) => string;
      expect: { pass: boolean; violations: number; claims: number };
    }>) {
      it(`T2: ${c.name}`, () => {
        const repoRoot = makeRepoRoot();
        const reportText = c.build(repoRoot);
        const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText });
        expect(got.pass).toBe(c.expect.pass);
        expect(got.violations).toHaveLength(c.expect.violations);
        expect(got.claims).toBe(c.expect.claims);
      });
    }
  });

  describe('T3: direct assertions over real tmp-dir fixtures', () => {
    it('T3a: GOOD — cited artifact exists, has a failed assertion, cited name matches -> pass', () => {
      const repoRoot = makeRepoRoot();
      const relPath = writeArtifact(repoRoot, 'lock.json', vitestDoc([
        { status: 'passed', fullName: 'unrelated' },
        { status: 'failed', fullName: 'the real red-first lock' },
      ]));
      const report = `red-first lock: \`${relPath}\` (\`the real red-first lock\`)`;
      const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText: report });
      expect(got.pass).toBe(true);
      expect(got.violations).toEqual([]);
      expect(got.claims).toBe(1);
    });

    it('T3b: RED — the cited artifact was never committed (missing file)', () => {
      const repoRoot = makeRepoRoot();
      const report = `red-first lock: \`docs/reports/red-evidence/${SLUG}/never-committed.json\``;
      const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText: report });
      expect(got.pass).toBe(false);
      expect(got.claims).toBe(1);
      expect(got.violations[0]).toContain('missing artifact');
    });

    it('T3c: RED — the artifact exists but has zero failed assertions', () => {
      const repoRoot = makeRepoRoot();
      const relPath = writeArtifact(repoRoot, 'allgreen.json', vitestDoc([
        { status: 'passed', fullName: 'a' },
        { status: 'passed', fullName: 'b' },
      ]));
      const report = `red-first lock: \`${relPath}\``;
      const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText: report });
      expect(got.pass).toBe(false);
      expect(got.violations[0]).toContain('no assertionResults');
    });

    it('T3d: RED — a cited test name is absent from the artifact', () => {
      const repoRoot = makeRepoRoot();
      const relPath = writeArtifact(repoRoot, 'lock2.json', vitestDoc([
        { status: 'failed', fullName: 'the lock that actually ran' },
      ]));
      const report = `red-first lock: \`${relPath}\` (\`a lock nobody ran\`)`;
      const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText: report });
      expect(got.pass).toBe(false);
      expect(got.violations[0]).toContain('cited test name');
      expect(got.violations[0]).toContain('a lock nobody ran');
    });

    it('T3e: GREEN (vacuous) — no red-first claim at all, only bare prose "RED"', () => {
      const repoRoot = makeRepoRoot();
      const report = 'Genuine RED output, 38 RED for the designed reason — no artifact cited.';
      const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText: report });
      expect(got.pass).toBe(true);
      expect(got.violations).toEqual([]);
      expect(got.claims).toBe(0);
    });

    it('T3f: not vitest JSON reporter output (no testResults[]) -> violation', () => {
      const repoRoot = makeRepoRoot();
      const dir = path.join(repoRoot, 'docs/reports/red-evidence', SLUG);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'notreally.json'), JSON.stringify({ ok: true }));
      const report = `red-first lock: \`docs/reports/red-evidence/${SLUG}/notreally.json\``;
      const got = redEvidence.checkRedEvidence({ repoRoot, slug: SLUG, reportText: report });
      expect(got.pass).toBe(false);
      expect(got.violations[0]).toContain('not vitest JSON reporter output');
    });
  });
});
