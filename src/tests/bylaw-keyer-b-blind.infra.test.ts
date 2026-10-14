// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5 ("keyer B (DeepSeek, separate worktree at a commit
//            without A's draft …)"), §9 G-PROV keyer arm (the `git ls-tree` witness); docs/specs/01-pipeline/69_mcbylaw_policy.md
//            M-17; .cursor/mcbylaw/phase2-plan-v2.md §D.1 (B in a worktree WITHOUT `.a`).
//
// The keyer-B worktree CONSTRUCTION (keyer-b.mjs blindCommit / ensureKeyerBWorktree) against real temp git repos. W1
// 2026-10-14: a B worktree created at HEAD carried every committed Phase 1 `.a` and assertBlind refused it
// (a_present_in_b_worktree). The fix builds it at the newest commit whose tree holds no `.a.json`; the witness is unchanged.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const B = await load('scripts/analysis/bylaw/keyer-b.mjs');

for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]; // a hook's GIT_DIR must never reach the temp repos
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-keyerb-blind-'));
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const AUTH = 'scripts/seeds/bylaw/authored';
let n = 0;
function repo(withA: boolean) {
  const root = path.join(TMP, `main${n++}`);
  fs.mkdirSync(path.join(root, AUTH, 'ch10_20'), { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'harness');
  const base = git(root, 'rev-parse', 'HEAD');
  if (withA) {
    for (const f of ['10.20.40.10.a.json', '10.20.40.10.b.json', '10.20.40.10.prov.json']) fs.writeFileSync(path.join(root, AUTH, 'ch10_20', f), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'A1 drafts');
    fs.writeFileSync(path.join(root, 'later.txt'), 'y\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'later work');
  }
  return { root, base };
}
const aOf = (tree: string) => tree.split('\n').filter((p) => /\.a\.json$/.test(p));

describe('keyer-B worktree construction: blind by construction, witness unchanged', () => {
  it('with committed .a drafts, the new B worktree sits at the last commit before the first .a — never HEAD — and assertBlind passes', () => {
    const { root, base } = repo(true);
    expect(B.blindCommit({ mainRoot: root })).toBe(base);
    const bRoot = path.join(TMP, 'b-blind');
    const at = B.ensureKeyerBWorktree({ mainRoot: root, bRoot });
    expect(at).toBe(base);
    expect(at).not.toBe(git(root, 'rev-parse', 'HEAD'));
    expect(aOf(git(bRoot, 'ls-tree', '-r', '--name-only', 'HEAD'))).toEqual([]);
    const planned = `${AUTH}/ch900_5/900.5.10.w1-s00.p12.a.json`;
    expect(() => B.assertBlind({ bRoot, commit: at, aPaths: [planned] })).not.toThrow();
  });

  it('the witness still refuses a B worktree at HEAD (the 2026-10-14 construction): a_present_in_b_worktree — not weakened', () => {
    const { root } = repo(true);
    const bRoot = path.join(TMP, 'b-head');
    const head = git(root, 'rev-parse', 'HEAD');
    B.ensureKeyerBWorktree({ mainRoot: root, bRoot, commit: head });
    expect(() => B.assertBlind({ bRoot, commit: head, aPaths: [`${AUTH}/ch900_5/900.5.10.w1-s00.p12.a.json`] })).toThrow(/a_present_in_b_worktree/);
  });

  it('no .a ever committed → HEAD (the A1 bootstrap case); an .a in the root commit → no_blind_commit (fail closed)', () => {
    const { root } = repo(false);
    expect(B.blindCommit({ mainRoot: root })).toBe(git(root, 'rev-parse', 'HEAD'));
    const r2 = path.join(TMP, 'rootA');
    fs.mkdirSync(path.join(r2, AUTH, 'p'), { recursive: true });
    git(r2, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(r2, AUTH, 'p', 'x.a.json'), '{}\n');
    git(r2, 'add', '.');
    git(r2, 'commit', '-q', '-m', 'root with an .a');
    expect(() => B.blindCommit({ mainRoot: r2 })).toThrow(/no_blind_commit/);
  });
});
