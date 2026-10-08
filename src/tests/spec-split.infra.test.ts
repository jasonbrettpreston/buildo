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
  '124a': '124a_step_standard_policy_appendix.md',
  // McBylaw S8 (Spec 68 header byte budget): registered for arm (iv) budgets + the arm (v) system-map shape check.
  '68': '68_mcbylaw_standard.md',
  '69': '69_mcbylaw_policy.md',
  // Spec 69's §1 register, moved out by M19 (2026-10-07) — a move destination like 124a.
  '69a': '69a_mcbylaw_register.md',
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

  // Spec 124 §5 R-AM (batch-2 Phase 0.8, 2026-09-15) — THE RULING-ID HALF of
  // arm (iii), ratified as a register row and locked here.
  //
  // The MECHANISM already shipped (CITATION_RULING_RE + extractRegisterRulingIds,
  // `Spec 124 R-<letter>` resolved against §5's `| R-X | ... |` rows) — batch-2's
  // plan proposed "extend spec-split-check's census from #anchors to R-xx ids"
  // and that premise is REFUTED: measured 2026-09-15, arm (iii) already censused
  // 2472 citations with 0 dangling, ruling ids included. What was missing was the
  // POLICY row (the rule existed only as tool behaviour) and this both-directions
  // lock on the ruling arm specifically — the section arm above never exercised
  // `kind: 'ruling'` at all. The class is live and has bitten twice: R-PACE-1 was
  // cited as "Spec 124 R-AA" (the spec-move rule, unrelated) in Spec 122 §8.3 and
  // in batch1 I2's commit-9 message, and the register itself records `R-S` as a
  // promised id that was never written.
  it('RED/GREEN — a `Spec 124 R-xx` ruling citation resolves against the §5 register, both directions', async () => {
    const mod = await import(GENERATOR);
    const specTexts: Record<string, string> = {};
    for (const [id, file] of Object.entries(SPEC_FILES)) {
      specTexts[id] = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
    }
    const ids = mod.extractRegisterRulingIds(specTexts['124']);
    // GREEN — every id batch-2 Phase 0.8 allocated must resolve NOW, off a REAL
    // §5 row, not a fixture. (The plan's own draft named `R-AM` as the dangling
    // case; the block shifted one letter when the concurrent enrich-runner WF took
    // R-AK, so the ratified block is R-AL..R-AP — recorded, not silently renumbered.)
    expect(ids.has('R-AN'), 'R-AN must be a real §5 register row after batch-2 Phase 0.8').toBe(true);
    for (const real of ['R-AL', 'R-AM', 'R-AN', 'R-AO', 'R-AP']) {
      expect(ids.has(real), `${real} must be a real §5 register row`).toBe(true);
    }
    // The recorded never-written id stays never-written (Spec 124 `:218`) — a
    // silent fill would be exactly the rot this rule forbids.
    expect(ids.has('R-S'), 'R-S is recorded as never-written and must not be silently filled').toBe(false);
    const resolves = mod.checkCitationsResolve(
      [{ citation: 'Spec 124 R-AN', specId: '124', kind: 'ruling' as const, file: 'fixture.md', line: 1 }],
      specTexts,
      [],
    );
    expect(resolves.dangling.length, JSON.stringify(resolves.dangling)).toBe(0);
    // RED — an unallocated ruling id dangles, and `known_dangling` is the only
    // way to carry one knowingly.
    const bogus = [{ citation: 'Spec 124 R-ZZZ', specId: '124', kind: 'ruling' as const, file: 'fixture.md', line: 1 }];
    expect(mod.checkCitationsResolve(bogus, specTexts, []).dangling.length).toBe(1);
    expect(
      mod.checkCitationsResolve(bogus, specTexts, [{ citation: 'Spec 124 R-ZZZ', sites: 1, why: 'fixture', owner: 'x', declared: '2026-09-15' }]).dangling.length,
    ).toBe(0);
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

  // Operator ruling "Split to 124a" (2026-10-02): arm (vi) totality runs over EVERY
  // appendix in APPENDIX_SPECS (122a, 124a), and M08/M09 are the first moves into 124a.
  // Each test builds its OWN fixture tree — the shared `fixture` above is mutated by
  // earlier tests in this block.
  it('RED — a 124a "(moved from ...)" heading with no moves[] row fails --check (arm vi covers every appendix)', () => {
    const local = makeFixtureTree();
    fs.appendFileSync(
      path.join(local.dir, SPEC_FILES['124a']!),
      '\n\n## Appendix §B99 — Undeclared fixture move (moved from Spec 124 §' + '999) — HISTORICAL\n\nbody\n',
    );
    const run = runCli(['--check'], {
      BUILDO_SPEC_SPLIT_SPEC_DIR: local.relDir,
      BUILDO_SPEC_SPLIT_MANIFEST_PATH: local.relManifest,
    });
    expect(run.status, `stdout=${run.stdout}`).toBe(1);
    expect(run.stderr).toContain('arm(vi) UNDECLARED MOVE — 124a heading');
  });

  it('GREEN/RED — the Spec 124 -> 124a moves (M08, M09, M14–M18) are lossless: an untouched copy verifies, one changed byte in a moved block fails arm (i)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { moves: { id: string; to_spec: string; content_sha256: string | null }[] };
    const into124a = manifest.moves.filter((m) => m.to_spec === '124a');
    expect(into124a.map((m) => m.id)).toEqual(['M08', 'M09', 'M14', 'M15', 'M16', 'M17', 'M18']);
    for (const m of into124a) expect(m.content_sha256, `${m.id} must carry the hash --refresh recorded`).toMatch(/^[0-9a-f]{64}$/);

    const green = makeFixtureTree();
    const ok = runCli(['--check'], {
      BUILDO_SPEC_SPLIT_SPEC_DIR: green.relDir,
      BUILDO_SPEC_SPLIT_MANIFEST_PATH: green.relManifest,
    });
    expect(ok.status, `stderr=${ok.stderr}`).toBe(0);

    const red = makeFixtureTree();
    const appendixPath = path.join(red.dir, SPEC_FILES['124a']!);
    const text = fs.readFileSync(appendixPath, 'utf8');
    // A string only M08's block carries: `| R-B |` stopped being unique once M18 moved register rows R-A..R-AI here.
    expect(text.split('link_massing_grid_degrees').length - 1, 'the tamper target must exist exactly once in M08\'s moved block').toBe(1);
    fs.writeFileSync(appendixPath, text.replace('link_massing_grid_degrees', 'link_massing_grid_degree5'));
    const bad = runCli(['--check'], {
      BUILDO_SPEC_SPLIT_SPEC_DIR: red.relDir,
      BUILDO_SPEC_SPLIT_MANIFEST_PATH: red.relManifest,
    });
    expect(bad.status, `stdout=${bad.stdout}`).toBe(1);
    expect(bad.stderr).toContain('arm(i) move M08');
  });

  // M18 (2026-10-07, P1-C9 register move): register rows R-A..R-AI live in 124a §B7, a section headed LIVE REGISTER.
  // Arm (iii) resolves a `Spec 124 R-xx` citation against Spec 124 §5 PLUS those sections only — a register-shaped
  // row in a HISTORICAL 124a block (M08's worked-examples table has `| R-B |`) never counts as a ruling.
  it('RED/GREEN — register rows moved to 124a §B7 (M18, LIVE REGISTER) still resolve; a history block row does not', async () => {
    const mod = await import(GENERATOR);
    const texts: Record<string, string> = {};
    for (const [id, file] of Object.entries(SPEC_FILES)) texts[id] = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
    expect(mod.extractRegisterRulingIds(texts['124']).has('R-A'), 'R-A moved out of Spec 124 itself').toBe(false);
    const ids = mod.extractRegisterRulingIds(texts['124'], texts['124a']);
    for (const id of ['R-A', 'R-J', 'R-K.1', 'R-PACE-1', 'R-AI', 'R-AJ', 'R-BR', 'R-BS', 'R-BT']) expect(ids.has(id), id).toBe(true);
    expect(ids.has('R-S'), 'R-S stays never-written').toBe(false);
    const row = '\n\n| R-ZQ | fixture | x | y |\n';
    const hist = `${texts['124a']}\n## Appendix §B99 — fixture (moved from Spec 124 §2) — HISTORICAL, 2026-10-07${row}`;
    expect(mod.extractRegisterRulingIds(texts['124'], hist).has('R-ZQ'), 'a HISTORICAL block row must not resolve').toBe(false);
    const live = `${texts['124a']}\n## Appendix §B98 — fixture rows (moved from Spec 124 §5) — LIVE REGISTER, 2026-10-07${row}`;
    expect(mod.extractRegisterRulingIds(texts['124'], live).has('R-ZQ'), 'a LIVE REGISTER block row resolves').toBe(true);
    const cite = [{ citation: 'Spec 124 R-B', specId: '124', kind: 'ruling' as const, file: 'fixture.md', line: 1 }];
    expect(mod.checkCitationsResolve(cite, texts, []).dangling.length).toBe(0);
    expect(mod.checkCitationsResolve(cite, { ...texts, '124a': '' }, []).dangling.length, 'without 124a §B7, R-B dangles').toBe(1);
  });

  it('GREEN — the Spec 69 -> 69a register move (M19) is declared, hashed and lands in 69a', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { moves: { id: string; from_spec: string; to_spec: string; content_sha256: string | null }[] };
    const m19 = manifest.moves.find((m) => m.id === 'M19');
    expect(m19 && [m19.from_spec, m19.to_spec]).toEqual(['69', '69a']);
    expect(m19!.content_sha256).toMatch(/^[0-9a-f]{64}$/);
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
