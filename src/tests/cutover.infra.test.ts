// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-K, R-AN, R-AO;
//            docs/specs/01-pipeline/123_step_opt_assessment_validation.md (③ cutover)
//
// WF2 "conversion simplification" item 4 — `npm run cutover -- --step=<slug>`
// (scripts/analysis/cutover.mjs) runs the ONE declared generator list
// (scripts/analysis/cutover-generators.json) in order and prints what each changed.
// Locks: the declared list is closed and every generator it names exists; the two
// builtin registry edits are surgical, EOL-preserving and idempotent; and the whole
// command on a fixture repo changes 0 files on its second run (plan §Standards).
// The fixture repo follows tasks/lessons.md 2026-09-21: allowlisted child env, and
// every mutating git call guarded to the temp repo this test created.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  registerText, censusText, convertedAtFor, changedPaths, loadGenerators, KINDS, BUILTINS, RETAINED_REASON,
} from '../../scripts/analysis/cutover.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'scripts/analysis/cutover.mjs');

describe('the declared generator list', () => {
  const list = loadGenerators(REPO_ROOT);

  it('is closed: unique ids, kinds in {builtin, cmd}, builtins are exactly register + census, first', () => {
    expect(new Set(list.map((g: { id: string }) => g.id)).size).toBe(list.length);
    expect(list.every((g: { kind: string }) => KINDS.includes(g.kind))).toBe(true);
    const builtins = list.filter((g: { kind: string }) => g.kind === 'builtin').map((g: { id: string }) => g.id);
    expect(builtins).toEqual([...BUILTINS]);
    expect(list.slice(0, 2).map((g: { id: string }) => g.id)).toEqual(['register', 'census']);
  });

  it('every cmd names a generator file that exists, and the full scorecard regen runs last', () => {
    for (const g of list.filter((x: { kind: string }) => x.kind === 'cmd')) {
      expect(fs.existsSync(path.join(REPO_ROOT, g.argv[1])), `${g.id}: ${g.argv[1]}`).toBe(true);
    }
    expect(list[list.length - 1].argv).toEqual(['node', 'scripts/analysis/step-validate.mjs', '--all', '--write']);
  });

  it('package.json exposes it as `npm run cutover`', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.cutover).toBe('node scripts/analysis/cutover.mjs');
  });
});

const CONVERTED_CRLF = [
  '{',
  '  "$comment": ["x"],',
  '  "contract_version": 1,',
  '  "pending": [',
  '    {',
  '      "file": "scripts/b.js",',
  '      "registers_at": "commit ③",',
  '      "stage": "shape_clean"',
  '    }',
  '  ],',
  '  "converted": [',
  '    "scripts/a.js"',
  '  ]',
  '}',
  '',
].join('\r\n');

const CENSUS = `${JSON.stringify({
  entries: [
    { slug: 'a', file: 'scripts/a.js', archetype: 'LINK', batch: 'C5', reason: 'r' },
    { slug: 'b', file: 'scripts/b.js', archetype: 'INGESTOR', batch: 'C5', reason: 'Spec 122 §1.10 declared' },
  ],
  exemptions: [],
}, null, 2)}\n`;

describe('builtin registry edits — surgical, EOL-preserving, idempotent', () => {
  it('register: pending entry deleted, file appended, CRLF kept; a second call is a no-op', () => {
    const out = registerText(CONVERTED_CRLF, 'scripts/b.js');
    const doc = JSON.parse(out);
    expect(doc.pending).toEqual([]);
    expect(doc.converted).toEqual(['scripts/a.js', 'scripts/b.js']);
    expect(out.includes('\r\n') && !/[^\r]\n/.test(out)).toBe(true);
    expect(out).toContain('  "pending": [],\r\n');
    expect(registerText(out, 'scripts/b.js')).toBe(out);
  });

  it('census: the row is RETAINED (archetype/batch verbatim) with status converted; idempotent; a missing row throws', () => {
    const out = censusText(CENSUS, 'scripts/b.js', 'commit-3');
    const row = JSON.parse(out).entries[1];
    expect(row).toEqual({ slug: 'b', file: 'scripts/b.js', archetype: 'INGESTOR', batch: 'C5', reason: RETAINED_REASON, status: 'converted', converted_at: 'commit-3' });
    expect(JSON.parse(out).entries[0]).toEqual(JSON.parse(CENSUS).entries[0]);
    expect(censusText(out, 'scripts/b.js', 'commit-3')).toBe(out);
    expect(() => censusText(CENSUS, 'scripts/zzz.js', 'commit-3')).toThrow(/no entries\[\] row/);
  });

  it('commit form comes from pending[].registers_at, never guessed', () => {
    expect(convertedAtFor('commit ③')).toBe('commit-3');
    expect(convertedAtFor('commit 9')).toBe('commit-9');
    expect(() => convertedAtFor('')).toThrow(/cannot tell the commit form/);
  });

  it('changedPaths reports added, changed and removed paths only', () => {
    const a = new Map([['x', '1'], ['y', '2']]);
    const b = new Map([['x', '1'], ['y', '3'], ['z', '4']]);
    expect(changedPaths(a, b)).toEqual(['y', 'z']);
    expect(changedPaths(b, b)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end on a fixture repo: the second run changes 0 files.
// ---------------------------------------------------------------------------
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

describe('npm run cutover on a fixture slug', () => {
  it('first run registers + regenerates and prints each change; the second run changes 0 files', () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-'));
    put('scripts/manifest.json', JSON.stringify({ scripts: { a: { file: 'scripts/a.js' }, b: { file: 'scripts/b.js' } } }));
    put('scripts/steps/_schema/converted.json', CONVERTED_CRLF);
    put('scripts/steps/_schema/step-archetype-census.json', CENSUS);
    put('scripts/analysis/cutover-generators.json', JSON.stringify({
      generators: [
        { id: 'register', kind: 'builtin', does: 'r' },
        { id: 'census', kind: 'builtin', does: 'c' },
        { id: 'gen', kind: 'cmd', argv: ['node', '-e', "require('fs').writeFileSync('generated.txt', 'derived\\n')"], does: 'g' },
      ],
    }));
    git('init', '-q');
    git('config', 'core.autocrlf', 'false');
    git('add', '-A');
    git('commit', '-q', '-m', 'seed');

    const first = cutover();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('pending -> converted (commit-3)');
    expect(first.stdout).toContain('register: changed scripts/steps/_schema/converted.json');
    expect(first.stdout).toContain('census: changed scripts/steps/_schema/step-archetype-census.json');
    expect(first.stdout).toContain('gen: changed generated.txt');
    expect(first.stdout).toContain('3 file(s) changed');

    const second = cutover();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('already registered');
    expect(second.stdout).toContain('0 file(s) changed');
  });

  it('a slug that is neither pending nor converted is refused before anything runs', () => {
    const r = spawnSync(process.execPath, [CLI, '--step=nope', `--repo=${fixture}`], { cwd: fixture, env: env(), encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no script "nope"/);
  });
});
