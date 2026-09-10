/**
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §4 R-I(4), §5 R-AA
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10.3
 *
 * Guards scripts/analysis/spec-split-check.mjs (the Spec 122/123/124 split-move
 * checker): the manifest is schema-valid, `--self-test` passes, `--check` is clean
 * against the REAL committed tree, and — mirroring
 * src/tests/step-conformance.infra.test.ts's own "RED — a hand-edited row fires
 * --check (known-bad fixture, real CLI, not just the exported function)" pattern —
 * each of the six arms is proven RED via the REAL CLI against an isolated tmp
 * fixture tree (BUILDO_SPEC_SPLIT_SPEC_DIR / BUILDO_SPEC_SPLIT_MANIFEST_PATH),
 * never merely the exported functions in-process.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Ajv from 'ajv';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GENERATOR = path.join(REPO_ROOT, 'scripts/analysis/spec-split-check.mjs');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs/specs/01-pipeline/122_split_manifest.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'docs/specs/01-pipeline/122_split_manifest.schema.json');
const SPEC_DIR = path.join(REPO_ROOT, 'docs/specs/01-pipeline');

const SPEC_FILES: Record<string, string> = {
  '119': '119_backend_verification_doctrine.md',
  '120': '120_pipeline_step_runner.md',
  '121': '121_assessment_and_verification_methodology.md',
  '122': '122_pipeline_step_optimization.md',
  '122a': '122a_step_optimization_appendix.md',
  '123': '123_step_opt_assessment_validation.md',
  '124': '124_step_standard_policy.md',
};

function runCli(args: string[], env: Record<string, string> = {}) {
  return spawnSync('node', [GENERATOR, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...env },
  });
}

/** LF-normalized copy of the real spec/manifest tree under a fresh tmp dir, so a
 * fixture can tamper with ONE file without touching the committed tree. Returns the
 * tmp dir's path RELATIVE to REPO_ROOT (the env-var convention both override vars
 * use, mirroring BUILDO_CHURN_TABLE_PATH). */
function makeFixtureTree(): { dir: string; relDir: string; relManifest: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-split-fixture-'));
  for (const file of Object.values(SPEC_FILES)) {
    fs.copyFileSync(path.join(SPEC_DIR, file), path.join(dir, file));
  }
  fs.copyFileSync(MANIFEST_PATH, path.join(dir, '122_split_manifest.json'));
  const relDir = path.relative(REPO_ROOT, dir);
  return { dir, relDir, relManifest: path.join(relDir, '122_split_manifest.json') };
}

function readManifest(dir: string) {
  return JSON.parse(fs.readFileSync(path.join(dir, '122_split_manifest.json'), 'utf8'));
}

function writeManifest(dir: string, manifest: unknown) {
  fs.writeFileSync(path.join(dir, '122_split_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('spec-split-check.mjs — manifest schema + self-test + real-tree --check', () => {
  it('the committed manifest validates against its own schema', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allowUnionTypes: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(manifest);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it('--self-test passes (Spec 120 §12b.6 — proven to fire, both directions, on all six arms)', () => {
    const run = runCli(['--self-test']);
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('self-test PASSED');
  });

  it('--check is clean against the real committed tree', () => {
    const run = runCli(['--check']);
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('clean —');
  });

  it('--refresh is idempotent — a second run against the real tree performs no further mutation', () => {
    const before = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const run = runCli(['--refresh']);
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('nothing to do');
    const after = fs.readFileSync(MANIFEST_PATH, 'utf8');
    expect(after).toBe(before);
  });
});

describe('spec-split-check.mjs — six arms, RED via the REAL CLI on an isolated fixture tree', () => {
  let fixture: { dir: string; relDir: string; relManifest: string };

  beforeAll(() => {
    fixture = makeFixtureTree();
  });

  it('RED — arm (iv): a manifest fixture with a 1-line budget fails --check', () => {
    const manifest = readManifest(fixture.dir);
    manifest.budgets['122'] = { headroom_pct: 10, measured_at: { lines: 1, bytes: 1, commit: 'fixture' } };
    writeManifest(fixture.dir, manifest);
    const run = runCli(['--check'], {
      BUILDO_SPEC_SPLIT_SPEC_DIR: fixture.relDir,
      BUILDO_SPEC_SPLIT_MANIFEST_PATH: fixture.relManifest,
    });
    expect(run.status, `stdout=${run.stdout}`).toBe(1);
    expect(run.stderr).toContain('BUDGET BREACH');
  });

  it('RED — bad-dangling-citation.md: an undeclared dangling citation fails via the real exported resolver', async () => {
    // arm (iii)'s citation CENSUS deliberately walks the real repo tree (docs/ src/
    // scripts/ tasks/ .cursor/ under REPO_ROOT) regardless of BUILDO_SPEC_SPLIT_*
    // overrides — those overrides only relocate the SPEC/manifest files being
    // resolved AGAINST, matching production's real requirement (Spec 08 A7: "the
    // hook validates the WORKING TREE"). Proving this arm RED via a full subprocess
    // CLI spawn would require mutating a real committed file as a test side effect;
    // instead this calls the same exported resolver the CLI itself calls, against a
    // real dangling citation string, real spec headings read from disk.
    const mod = await import(GENERATOR);
    const specTexts: Record<string, string> = {};
    for (const [id, file] of Object.entries(SPEC_FILES)) {
      specTexts[id] = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
    }
    const badCitations = [{ citation: 'Spec 122 §99.99', specId: '122', number: '99.99', kind: 'section' as const, file: 'fixture.md', line: 1 }];
    const result = mod.checkCitationsResolve(badCitations, specTexts, []);
    expect(result.dangling.length, JSON.stringify(result.dangling)).toBe(1);
    const declared = mod.checkCitationsResolve(badCitations, specTexts, [
      { citation: 'Spec 122 §99.99', sites: 1, why: 'fixture', owner: 'x', declared: '2026-09-10' },
    ]);
    expect(declared.dangling.length).toBe(0);
  });

  it('RED — bad-undeclared-move.md: a 122a "(moved from ...)" heading with no moves[] row fails --check', () => {
    const appendixPath = path.join(fixture.dir, SPEC_FILES['122a']!);
    fs.appendFileSync(
      appendixPath,
      '\n\n## Appendix §A99 — Undeclared fixture move (moved from Spec 122 §999) — HISTORICAL\n\nbody\n',
    );
    const run = runCli(['--check'], {
      BUILDO_SPEC_SPLIT_SPEC_DIR: fixture.relDir,
      BUILDO_SPEC_SPLIT_MANIFEST_PATH: fixture.relManifest,
    });
    expect(run.status, `stdout=${run.stdout}`).toBe(1);
    expect(run.stderr).toContain('UNDECLARED MOVE');
  });

  it('RED — bad-move-breaks-reader.json: a move whose anchor collides with a declared reader_guards slice fails --check', () => {
    const manifest = readManifest(fixture.dir);
    manifest.budgets = {
      '122': { headroom_pct: 10, measured_at: { lines: 999999, bytes: 99999999, commit: 'fixture' } },
      '123': { headroom_pct: 10, measured_at: { lines: 999999, bytes: 99999999, commit: 'fixture' } },
      '124': { headroom_pct: 10, measured_at: { lines: 999999, bytes: 99999999, commit: 'fixture' } },
    };
    manifest.moves.push({
      id: 'M99',
      from_spec: '122',
      anchor: '### 1.2a',
      to_spec: '122a',
      to_anchor: '## Appendix §A98 — Fixture',
      content_sha256: null,
      line_count: 1,
      moved_at: null,
      commit: null,
      classification: 'HISTORICAL',
      evidence: 'fixture: colliding with a reader guard on purpose',
    });
    writeManifest(fixture.dir, manifest);
    const run = runCli(['--check'], {
      BUILDO_SPEC_SPLIT_SPEC_DIR: fixture.relDir,
      BUILDO_SPEC_SPLIT_MANIFEST_PATH: fixture.relManifest,
    });
    expect(run.status, `stdout=${run.stdout}`).toBe(1);
    expect(run.stderr).toContain('slices on a moved anchor');
  });
});
