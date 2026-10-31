// SPEC LINK: MB-73 plan sections 2 to 9 and condition 4; R-KQ, R-KU, R-BF. The `--check` pipeline fails CLOSED: a
// throwing step, a missing base, no rows, no in-scope row, an unreadable scan root and a missing drift input are
// all `FAIL:R:cannot-decide:...` and exit 2, and the two WAIT lines are always carried.
import { afterAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { guard, runCheck, WAITS } from '../../scripts/analysis/mcbylaws-promises/promise-check.mjs';
import { makePromisesRepo } from './fixtures/mcbylaws-promises/fixture-repo';

const ROOT = path.resolve(__dirname, '../..');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const ART = 'mcbylaws/promises/artifacts.json';
const POLICY = {
  pending_globs: [], layer23: [], protected: [], literal_scope: [], literal_exempt: [],
  held_dirs: [], held_limit: 12, worktrees: [],
};
const isCannot = (l: string) => /^FAIL:R:cannot-decide/.test(l);

const repos: { cleanup(): void }[] = [];
afterAll(() => {
  for (const r of repos) r.cleanup();
});

/** A fixture repo, registered for cleanup. */
function repo(opts: Record<string, boolean> = {}) {
  const made = makePromisesRepo(opts);
  repos.push(made.r);
  return made;
}

type Made = ReturnType<typeof repo>;

/** runCheck against one fixture commit, with a quiet drift block by default. */
function check(made: Made, extra: Record<string, unknown> = {}) {
  return runCheck({ cwd: made.r.dir, rev: made.rev, base: made.base, run: made.run, drift: { policy: POLICY }, ...extra });
}

describe('guard (B1)', () => {
  it('returns the value with no lines, and a throw as one cannot-decide line', () => {
    expect(guard('x', () => 1)).toEqual({ value: 1, lines: [] });
    expect(guard('x', () => undefined)).toEqual({ value: undefined, lines: [] });
    expect(guard('x', () => { throw new Error('boom'); })).toEqual({ value: undefined, lines: ['FAIL:R:cannot-decide:x'] });
  });
});

describe('a throwing step is never dropped (B1, K-3, K-5)', () => {
  const table: { name: string; opts: (m: Made) => Record<string, unknown>; code: string }[] = [
    { name: 'cwd is not a repository', opts: (_m) => ({ cwd: 42, rev: 'HEAD', base: 'HEAD' }), code: 'increment-ids' },
    { name: 'everything throws', opts: (_m) => ({ cwd: 42, rev: 'HEAD', base: 'HEAD', queue: () => [] }), code: 'increment-ids' },
    { name: 'the queue throws', opts: (_m) => ({ queue: () => { throw new Error('q'); } }), code: 'queue' },
    { name: 'the runner throws', opts: () => ({ run: () => { throw new Error('r'); } }), code: 'run' },
    {
      name: 'the artifact map is unreadable',
      opts: (m) => {
        m.r.write(ART, 'not json\n');
        return { rev: m.commit('bad map') };
      },
      code: 'artifacts-json',
    },
  ];
  for (const c of table) {
    it(c.name, () => {
      const made = repo();
      const res = check(made, c.opts(made));
      expect(res.lines.some((l: string) => l.startsWith(`FAIL:R:cannot-decide:${c.code}`)), JSON.stringify(res.lines)).toBe(true);
      expect(res.exit).toBe(2);
    });
  }

  it('an unreadable scan root is cannot-decide:unreadable:<path>, never an empty text', () => {
    const made = repo();
    // A gitlink object is unreadable: ls-tree lists the path but `git show <rev>:<path>` fails.
    made.r.git(['update-index', '--add', '--cacheinfo', '160000,deadbeefdeadbeefdeadbeefdeadbeefdeadbeef,src/old.mjs']);
    made.r.git(['commit', '-q', '-m', 'gitlink']);
    const rev = made.r.git(['rev-parse', 'HEAD']);
    const res = check(made, { rev });
    expect(res.lines).toContain('FAIL:R:cannot-decide:unreadable:src/old.mjs');
    expect(res.exit).toBe(2);
  });
});

describe('no rows and no rows in scope (B2)', () => {
  it('a queue with no promise row is cannot-decide:no-promises', () => {
    const made = repo();
    made.r.write('.cursor/MCBYLAWS-QUEUE.md', '# Q\n- nothing here\n');
    const res = check(made, { rev: made.commit('empty queue') });
    expect(res.lines).toContain('FAIL:R:cannot-decide:no-promises');
    expect(res.exit).toBe(2);
  });

  it('rows exist but none is in the derived scope', () => {
    const made = repo();
    made.r.write('.cursor/MCBYLAWS-QUEUE.md', '# Q\n- R-ZZ: a promise\n\n## Increments\n\n| id | note |\n|---|---|\n| 1 | first |\n| 2 | cites R-ZZ |\n');
    const rev = made.commit('scope');
    const res = check(made, { rev, incArg: '1' });
    expect(res.lines).toContain('FAIL:R:cannot-decide:no-promises-in-scope');
    expect(res.exit).toBe(2);
  });
});

describe('base is required (B3)', () => {
  const table: (string | null | undefined | object)[] = [undefined, null, '', {}];
  for (const base of table) {
    it(`base ${JSON.stringify(base)} is cannot-decide:no-base`, () => {
      const made = repo();
      const res = check(made, { base });
      expect(res.lines).toEqual(['FAIL:R:cannot-decide:no-base']);
      expect(res.exit).toBe(2);
    });
  }

  it('a record rewritten after the base is caught against the first commit', () => {
    const made = repo();
    fs.chmodSync(path.join(made.r.dir, `mcbylaws/promises/green/${made.id}.json`), 0o644);
    made.r.write(`mcbylaws/promises/green/${made.id}.json`, '{"schema":"promise-green-v1","id":"R-ZZ","red_of":"x"}\n');
    const res = check(made, { rev: made.commit('rewrite') });
    expect(res.lines).toContain('FAIL:R:record-rewritten:mcbylaws/promises/green/R-ZZ.json');
    expect(res.exit).toBe(1);
  });
});

describe('drift must be supplied (B4b)', () => {
  it('an absent drift block is cannot-decide:drift-not-supplied', () => {
    const made = repo();
    const res = check(made, { drift: undefined });
    expect(res.lines).toContain('FAIL:R:cannot-decide:drift-not-supplied');
    expect(res.exit).toBe(2);
  });

  it('more held patches than the limit is FAIL:W:held', () => {
    const made = repo();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-held-'));
    try {
      for (const n of ['a', 'b']) fs.writeFileSync(path.join(dir, `${n}.patch`), 'p\n');
      const res = check(made, { drift: { policy: { ...POLICY, held_dirs: [dir], held_limit: 1 } } });
      expect(res.lines).toContain('FAIL:W:held:2:1');
      expect(res.exit).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a literalArgs function runs inside a checkout of the checked ref that is gone afterwards', () => {
    const made = repo();
    const seen: { dir: string; text: string; exists: boolean }[] = [];
    const literalArgs = (dir: string) => {
      const text = fs.readFileSync(path.join(dir, 'src/lib/z.mjs'), 'utf8');
      seen.push({ dir, text, exists: fs.existsSync(dir) });
      return { root: dir, files: [], policy: POLICY, allow: {} };
    };
    const res = check(made, { drift: { policy: POLICY, literalArgs } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.text).toBe('export const z = 1;\n');
    expect(seen[0]!.exists).toBe(true);
    expect(fs.existsSync(seen[0]!.dir)).toBe(false);
    expect(res.lines).toEqual([]);
    expect(res.exit).toBe(0);
  });
});

describe('the run is the checked ref (B4a)', () => {
  it('an uncommitted failing edit cannot turn the checked ref red', () => {
    const made = repo();
    fs.symlinkSync(NODE_MODULES, path.join(made.r.dir, 'node_modules'));
    const res = runCheck({ cwd: made.r.dir, rev: made.rev, base: made.base, drift: { policy: POLICY } });
    expect(res.lines, JSON.stringify(res.lines)).toEqual([]);
    expect(res.exit).toBe(0);
    const bad = "import { expect, it } from 'vitest';\nimport { z } from '../lib/z.mjs';\nit('z holds', () => { expect(z).toBe(2); });\n";
    made.r.write('src/tests/z.test.ts', bad);
    const again = check(made);
    expect(again.exit).toBe(0);
    expect((again.states as Record<string, string>)['R-ZZ']).toBe('done');
  }, 180000);
});

describe('condition 4: the WAIT lines', () => {
  it('both entries on a green result, outside lines and exit', () => {
    const res = check(repo());
    expect(res.waits).toEqual(WAITS);
    expect(res.waits).toHaveLength(2);
    expect(res.lines).toEqual([]);
    expect(res.exit).toBe(0);
  });

  it('both entries on an aborted result', () => {
    const res = check(repo(), { base: null });
    expect(res.exit).toBe(2);
    expect(res.waits).toEqual(WAITS);
    expect(res.lines.some(isCannot)).toBe(true);
    expect(res.lines.some((l: string) => l.startsWith('WAIT:'))).toBe(false);
  });
});
