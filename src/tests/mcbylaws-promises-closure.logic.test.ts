// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-73 (promises check, plan §4 "Inputs (K4a)"); R-KU.
// A green must be bound to (artifact blob hash, input hashes, commit): the closure is the set of inputs to hash.

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { importsOf, resolveSpec, closureOf, blobsOf }
  from '../../scripts/analysis/mcbylaws-promises/promise-closure.mjs';

let repo: Repo | null = null;
afterEach(() => { if (repo) { repo.cleanup(); repo = null; } });

const chain = () => {
  const r = makeRepo();
  r.write('a.test.mjs', "import { b } from './b.mjs';\nexport const t = b;\n");
  r.write('b.mjs', "import { c } from './c.mjs';\nimport d from './d.json';\nimport fs from 'node:fs';\nexport const b = c + d + fs;\n");
  r.write('c.mjs', 'export const c = 1;\n');
  r.write('d.json', '{"k": 1}\n');
  r.commit('chain');
  return r;
};

describe('importsOf', () => {
  it.each([
    ["import { a } from './x.mjs';", ['./x.mjs']],
    ["import * as n from './x.mjs';", ['./x.mjs']],
    ['import x from "../x.mjs";', ['../x.mjs']],
    ["export { a } from './x.mjs';", ['./x.mjs']],
    ["export * from './x.mjs';", ['./x.mjs']],
    ["import './side.mjs';", ['./side.mjs']],
    ["const m = import('./dyn.mjs');", ['./dyn.mjs']],
    ["const m = require('./req.mjs');", ['./req.mjs']],
    ["const m = require(`./tpl.mjs`);", ['./tpl.mjs']],
    ["import a from './x.mjs';\nimport b from './x.mjs';", ['./x.mjs']],
    ['const n = 1;', []],
  ])('%s -> %j', (src, want) => {
    const got = importsOf(src);
    expect(got.specifiers).toEqual(want);
    expect(got.untraceable).toBe(false);
  });

  it.each([
    'const m = import(name);',
    "const m = require(x + 'y');",
    'const m = import(`./${n}.mjs`);',
  ])('untraceable: %s', (src) => {
    expect(importsOf(src).untraceable).toBe(true);
  });

  it('a template literal with ${ is untraceable even as a static import source', () => {
    expect(importsOf('const m = import(`${x}`);').specifiers).toEqual([]);
    expect(importsOf("const m = require(`./${x}`);").untraceable).toBe(true);
  });

  it('a commented-out import still counts (no comment stripping)', () => {
    expect(importsOf("// import './gone.mjs';\n").specifiers).toEqual(['./gone.mjs']);
  });
});

describe('resolveSpec', () => {
  const set = (paths: string[]) => new Set(paths);
  it.each([
    ['src/a.mjs', './b.mjs', ['src/b.mjs'], 'src/b.mjs'],
    ['src/a.mjs', '../b.mjs', ['b.mjs'], 'b.mjs'],
    ['src/a.mjs', './c', ['src/c.ts'], 'src/c.ts'],
    ['src/a.mjs', './c', ['src/c.json'], 'src/c.json'],
    ['src/a.mjs', './dir', ['src/dir/index.mjs'], 'src/dir/index.mjs'],
    ['src/a.mjs', './q.js', ['src/q.ts'], 'src/q.ts'],
    ['src/a.mjs', './gone.mjs', ['src/other.mjs'], null],
  ])('%s + %s -> %s', (from, spec, tracked, want) => {
    expect(resolveSpec(from, spec, set(tracked))).toBe(want);
  });

  it.each(['node:fs', 'vitest', '@/lib/a', '../..'])('non-relative %s -> null', (spec) => {
    expect(resolveSpec('src/a.mjs', spec, set(['src/a.mjs', 'lib/a.mjs'] as string[]))).toBeNull();
  });
});

describe('closureOf', () => {
  it('follows relative imports transitively; bare and node: are ignored', () => {
    repo = chain();
    const got = closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['a.test.mjs'] });
    expect(got.files).toEqual(['a.test.mjs', 'b.mjs', 'c.mjs', 'd.json']);
    expect(got.lines).toEqual([]);
  });

  it('an untracked root -> cannot-decide:unreadable', () => {
    repo = chain();
    expect(closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['nope.mjs'] }).lines)
      .toEqual(['FAIL:R:cannot-decide:unreadable:nope.mjs']);
  });

  it('an unresolved relative specifier is a failure line', () => {
    repo = makeRepo();
    repo.write('b.mjs', "import './missing.mjs';\n");
    repo.commit('b');
    expect(closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['b.mjs'] }).lines)
      .toEqual(['FAIL:R:cannot-decide:unresolved:b.mjs:./missing.mjs']);
  });

  it('an untraceable import is a failure line; a literal dynamic import is followed', () => {
    repo = makeRepo();
    repo.write('dyn.mjs', "const n = 'x';\nexport const m = import(n);\nexport const l = import('./leaf.mjs');\n");
    repo.write('leaf.mjs', 'export const leaf = 1;\n');
    repo.write('req.mjs', "const k = 'x';\nexport const r = require(k + 'y');\n");
    repo.commit('dyn');
    const dyn = closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['dyn.mjs'] });
    expect(dyn.lines).toEqual(['FAIL:R:untraceable:dyn.mjs']);
    expect(dyn.files).toEqual(['dyn.mjs', 'leaf.mjs']);
    expect(closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['req.mjs'] }).lines)
      .toEqual(['FAIL:R:untraceable:req.mjs']);
  });

  it('a cycle terminates and lists each file once', () => {
    repo = makeRepo();
    repo.write('x.mjs', "import './y.mjs';\n");
    repo.write('y.mjs', "import './x.mjs';\n");
    repo.commit('cycle');
    const got = closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['x.mjs'] });
    expect(got.files).toEqual(['x.mjs', 'y.mjs']);
    expect(got.lines).toEqual([]);
  });

  it('an unknown rev -> FAIL:R:cannot-decide', () => {
    repo = chain();
    expect(closureOf({ cwd: repo.dir, rev: 'deadbeef', roots: ['a.test.mjs'] }).lines)
      .toEqual(['FAIL:R:cannot-decide']);
  });
});

describe('blobsOf — F-TRANS', () => {
  it('editing c.mjs two hops from the test changes ONLY c.mjs blob', () => {
    repo = chain();
    const files = closureOf({ cwd: repo.dir, rev: 'HEAD', roots: ['a.test.mjs'] }).files;
    const before = blobsOf({ cwd: repo.dir, rev: 'HEAD', files });
    expect(Object.keys(before).sort()).toEqual([...files].sort());
    repo.write('c.mjs', 'export const c = 2;\n');
    repo.commit('edit c');
    const after = blobsOf({ cwd: repo.dir, rev: 'HEAD', files });
    const changed = Object.keys(before).filter((p) => before[p] !== after[p]);
    expect(changed).toEqual(['c.mjs']);
  });

  it('a path absent at the rev is left out', () => {
    repo = chain();
    const got = blobsOf({ cwd: repo.dir, rev: 'HEAD', files: ['b.mjs', 'gone.mjs'] });
    expect(Object.keys(got)).toEqual(['b.mjs']);
    expect(got['b.mjs']).toMatch(/^[0-9a-f]{40,64}$/);
  });
});
