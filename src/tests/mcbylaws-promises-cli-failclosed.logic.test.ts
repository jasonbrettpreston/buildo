// SPEC LINK: MB-73 stage 8 fixes B3 / B4b / B5 and condition 4; R-KQ, R-KU, R-KK, W:held, W:literal.
// The CLI fails CLOSED: `--check` / `--status` without `--base`, a base policy that cannot be read, a run that cannot
// run, the two WAIT lines always printed and never scoring, and an audit pack that carries the REAL counts.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../scripts/analysis/mcbylaws-promises/mcbylaws-promises.mjs';
import { WAITS } from '../../scripts/analysis/mcbylaws-promises/promise-check.mjs';
import { makePromisesRepo } from './fixtures/mcbylaws-promises/fixture-repo';

type Made = ReturnType<typeof makePromisesRepo>;
const repos: { cleanup(): void }[] = [];
const homes: string[] = [];
afterAll(() => {
  for (const r of repos) r.cleanup();
  for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
});

/** A fixture repo and an empty home, both registered for cleanup; every CLI call gets that home. */
function repo(opts: Record<string, boolean> = {}): Made & { home: string } {
  const made = makePromisesRepo(opts);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-promises-home-'));
  repos.push(made.r);
  homes.push(home);
  return { ...made, home };
}

type Io = { cwd: string; home: string; run?: Made['run'] };

/** Runs main with captured out / err. */
function run(argv: string[], io: Io) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, { ...io, out: (s: string) => out.push(s), err: (s: string) => err.push(s) } as never);
  return { code, out, err, text: out.join('\n'), errText: err.join('\n') };
}

const POLICY_LOOSE = '{"pending_globs":[],"literal_scope":[]}\n';

describe('B3 the base is required', () => {
  it.each([['--check'], ['--status']])('%s without --base cannot decide, exit 2', (mode) => {
    const made = repo();
    const res = run([mode], { cwd: made.r.dir, home: made.home, run: made.run });
    expect(res.code).toBe(2);
    expect(res.text).toContain('FAIL:R:cannot-decide:no-base');
    expect(res.err).toEqual([]);
  });

  it('--check with --base made.base is green', () => {
    const made = repo();
    const res = run(['--check', '--base', made.base], { cwd: made.r.dir, home: made.home, run: made.run });
    expect(res.code).toBe(0);
    expect(res.text).not.toContain('FAIL:');
  });
});

describe('B4b the drift inputs come from the base ref', () => {
  it('an unreadable base policy is cannot-decide:policy, exit 2', () => {
    const made = repo({ scanConfig: false });
    made.r.write('mcbylaws/protected-paths.json', 'not json\n');
    const rev = made.commit('bad policy');
    const res = run(['--check', '--base', rev], { cwd: made.r.dir, home: made.home, run: made.run });
    expect(res.code).toBe(2);
    expect(res.text).toContain('FAIL:R:cannot-decide:policy');
  });

  it('held_limit 0 at the base with one held patch is FAIL:W:held:1:0, and the checked rev cannot loosen it', () => {
    const made = repo();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-held-'));
    try {
      fs.writeFileSync(path.join(dir, 'one.patch'), 'p\n');
      made.r.write('mcbylaws/protected-paths.json', JSON.stringify({ ...JSON.parse(POLICY_LOOSE), held_dirs: [dir], held_limit: 0 }));
      const base = made.commit('policy at base');
      // The checked rev lifts the limit; the base still judges it.
      made.r.write('mcbylaws/protected-paths.json', JSON.stringify({ ...JSON.parse(POLICY_LOOSE), held_dirs: [], held_limit: 12 }));
      const rev = made.commit('loosen');
      const res = run(['--check', '--rev', rev, '--base', base], { cwd: made.r.dir, home: made.home, run: made.run });
      // The CLI reads the drift policy at the BASE: a limit of 0 cannot be decided (never a pass), the loosened rev is not used.
      expect(res.text, res.text).toContain('FAIL:R:cannot-decide:held');
      expect(res.text).not.toContain('FAIL:W:held:');
      expect(res.code).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('held_limit 1 at the base with two held patches is FAIL:W:held:2:1, and the checked rev cannot lift the limit', () => {
    const made = repo();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-held-'));
    try {
      for (const n of ['a', 'b']) fs.writeFileSync(path.join(dir, `${n}.patch`), 'p\n');
      made.r.write('mcbylaws/protected-paths.json', JSON.stringify({ ...JSON.parse(POLICY_LOOSE), held_dirs: [dir], held_limit: 1 }));
      const base = made.commit('policy at base');
      made.r.write('mcbylaws/protected-paths.json', JSON.stringify({ ...JSON.parse(POLICY_LOOSE), held_dirs: [], held_limit: 12 }));
      const rev = made.commit('loosen');
      const res = run(['--check', '--rev', rev, '--base', base], { cwd: made.r.dir, home: made.home, run: made.run });
      expect(res.text, res.text).toContain('FAIL:W:held:2:1');
      expect(res.code).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('condition 4 the WAIT lines are printed', () => {
  it('--check prints both WAIT lines and the exit is unchanged', () => {
    const made = repo();
    const res = run(['--check', '--base', made.base], { cwd: made.r.dir, home: made.home, run: made.run });
    expect(res.code).toBe(0);
    expect(res.out.filter((l) => l.startsWith('WAIT:'))).toEqual(WAITS);
    expect(res.out[res.out.length - 1]).toBe('promises: 1 done, 0 red, 0 not yet');
  });

  it('--status appends the same lines after the table and still exits 0', () => {
    const made = repo();
    const res = run(['--status', '--base', made.base], { cwd: made.r.dir, home: made.home, run: made.run });
    expect(res.code).toBe(0);
    expect(res.text).toContain('| R-ZZ | done |');
    for (const line of WAITS) expect(res.text).toContain(line);
    expect(res.text.indexOf('WAIT:')).toBeGreaterThan(res.text.indexOf('| R-ZZ | done |'));
  });
});

describe('B5 the audit pack carries the real counts', () => {
  it('a skipped test shows skipped in the counts and exits 1', () => {
    const made = repo();
    const skipped = () => ({
      ok: true,
      json: { testResults: [{ name: `/x/${made.entry.artifact}`, assertionResults: [{ fullName: made.entry.test_name, status: 'skipped' }] }] },
    });
    const res = run(['--audit-pack'], { cwd: made.r.dir, home: made.home, run: skipped });
    expect(res.code).toBe(1);
    const pack = JSON.parse(res.out[0]!);
    expect(pack.entries[0].counts).toBe('Tests  0 passed | 1 skipped (1)');
    expect(res.text).toContain('FAIL:R:not-green:R-ZZ');
    expect(res.text.indexOf('FAIL:R:not-green:R-ZZ')).toBeGreaterThan(res.text.indexOf('pack_sha256'));
  });

  it('a run that cannot run exits 2 with no pack', () => {
    const made = repo();
    const res = run(['--audit-pack'], { cwd: made.r.dir, home: made.home, run: (() => ({ ok: false, reason: 'boom' })) as never });
    expect(res.code).toBe(2);
    expect(res.text).toContain('FAIL:R:cannot-decide:run:boom');
    expect(res.text).not.toContain('promises-audit-pack-v1');
  });
});
