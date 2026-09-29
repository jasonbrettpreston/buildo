// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BB (OWNER-SPEC-DIFF, fast invariant #43)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 row 9(b)
//
// A FIXTURE CUTOVER on a temp git repo, proven both directions: `npm run cutover` registers the
// slug, then the staged change set is judged by the SAME reader + predicate step-validate --staged
// uses. The fixture follows tasks/lessons.md 2026-09-21: allowlisted child env, every mutating
// git call guarded to the temp repo this test created (copied from cutover.infra.test.ts).

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readCommitChangeSet, checkOwnerSpecDiff } from '../../scripts/analysis/gates/owner-spec-diff.mjs';

// Git exports GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE into hook environments. readCommitChangeSet
// runs IN-PROCESS here, so its `git` children would inherit them and read the REAL repo's index
// instead of the fixture's (the same trap capture-harness-overwrite.infra.test.ts documents). Scrub
// them for this worker; the allowlisted env() below still covers the spawned CLI.
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) delete process.env[k];

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'scripts/analysis/cutover.mjs');

const ENV_ALLOW = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
let fixture = '';
function env(): NodeJS.ProcessEnv {
  const e: Record<string, string | undefined> = {};
  for (const k of ENV_ALLOW) if (process.env[k] !== undefined) e[k] = process.env[k];
  const out: Record<string, string | undefined> = { ...e, HOME: fixture, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'cutover-test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'cutover-test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
  return out as NodeJS.ProcessEnv;
}
function git(...args: string[]) {
  const real = fs.realpathSync(fixture);
  if (!real.startsWith(fs.realpathSync(os.tmpdir())) || real === fs.realpathSync(REPO_ROOT)) throw new Error(`refusing git outside the fixture (${real})`);
  const r = spawnSync('git', args, { cwd: fixture, env: env(), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}
function put(rel: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(fixture, rel)), { recursive: true });
  fs.writeFileSync(path.join(fixture, rel), text);
}
function cutover() {
  return spawnSync(process.execPath, [CLI, '--step=b', `--repo=${fixture}`], { cwd: fixture, env: env(), encoding: 'utf8' });
}
afterAll(() => {
  if (fixture && fixture.startsWith(os.tmpdir())) fs.rmSync(fixture, { recursive: true, force: true });
});

const judge = () => checkOwnerSpecDiff(readCommitChangeSet(fixture));

const S43 = 'docs/specs/01-pipeline/43_chain_sources.md';
const S62 = 'docs/specs/01-pipeline/62_b.md';
const CONV = 'scripts/steps/_schema/converted.json';
const CENSUS_REL = 'scripts/steps/_schema/step-archetype-census.json';

describe('owner-spec-diff after a fixture cutover — both directions', () => {
  it('seeds the fixture and `npm run cutover` registers the slug and names owner specs #43 and #62', () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'osd-'));
    put('scripts/manifest.json', JSON.stringify({ scripts: { a: { file: 'scripts/a.js' }, b: { file: 'scripts/b.js' } } }));
    put(CONV, JSON.stringify({ contract_version: 1, pending: [{ file: 'scripts/b.js', registers_at: 'commit ③', stage: 'shape_clean' }], converted: ['scripts/a.js'] }, null, 2) + '\n');
    put(CENSUS_REL, JSON.stringify({
      entries: [
        { slug: 'a', file: 'scripts/a.js', archetype: 'LINK', batch: 'C5', reason: 'r' },
        { slug: 'b', file: 'scripts/b.js', archetype: 'INGESTOR', batch: 'C5', reason: 'Spec 122 §1.10 declared' },
      ],
      exemptions: [],
    }, null, 2) + '\n');
    put('scripts/analysis/cutover-generators.json', JSON.stringify({ generators: [{ id: 'register', kind: 'builtin', does: 'r' }, { id: 'census', kind: 'builtin', does: 'c' }] }));
    put('docs/specs/00-architecture/00_system_map.md', [
      '| # | Spec File | Feature | Implementation | Tests | Status |',
      '|---|---|---|---|---|---|',
      '| 43 | `01-pipeline/43_chain_sources.md` | Sources | `scripts/a.js`, `scripts/b.js` | `t` | Done |',
      '| 62 | `01-pipeline/62_b.md` | B | `scripts/b.js` | `t` | Done |',
    ].join('\n') + '\n');
    put(S43, '# 43\n');
    put(S62, '# 62\n');
    git('init', '-q');
    git('config', 'core.autocrlf', 'false');
    git('add', '-A');
    git('commit', '-q', '-m', 'seed');

    const r = cutover();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(S43);
    expect(r.stdout).toContain(S62);
    expect(r.stdout).toContain('#43');
  });

  it('RED: registry staged but owner specs untouched blocks scripts/b.js and names both specs', () => {
    git('add', CONV, CENSUS_REL);
    const res = judge();
    expect(res.pass).toBe(false);
    expect(res.blockedFiles).toEqual(['scripts/b.js']);
    expect(res.detail).toContain(S43);
    expect(res.detail).toContain(S62);
  });

  it('partial: one owner spec appended clears it, the other stays', () => {
    fs.appendFileSync(path.join(fixture, S62), '\nAs-built.\n');
    git('add', S62);
    const res = judge();
    expect(res.pass).toBe(false);
    expect(res.detail).toContain(S43);
    expect(res.detail).not.toContain(S62);
  });

  it('GREEN: both owner specs appended makes the staged change set pass', () => {
    fs.appendFileSync(path.join(fixture, S43), '\nAs-built.\n');
    git('add', S43);
    const res = judge();
    expect(res.pass).toBe(true);
    expect(res.detail).toContain('1 file(s) appended');
  });

  it('N-A arm: an explicit spec_diff N-A entry with a reason also passes', () => {
    git('reset', '-q', 'HEAD', '--', S43, S62);
    expect(judge().pass).toBe(false);

    const doc = JSON.parse(fs.readFileSync(path.join(fixture, CENSUS_REL), 'utf8'));
    const entry = doc.entries.find((e: { slug: string }) => e.slug === 'b');
    entry.spec_diff = 'N-A';
    entry.spec_diff_reason = 'fixture: owner specs intentionally unchanged';
    fs.writeFileSync(path.join(fixture, CENSUS_REL), JSON.stringify(doc, null, 2) + '\n');
    git('add', CENSUS_REL);
    expect(judge().pass).toBe(true);
  });

  it('pre-push form: with nothing staged, HEAD~1..HEAD is judged and passes', () => {
    git('commit', '-q', '-m', 'cutover b');
    const res = judge();
    expect(res.pass).toBe(true);
    expect(res.detail).toContain('1 file(s) appended');
  });
});
