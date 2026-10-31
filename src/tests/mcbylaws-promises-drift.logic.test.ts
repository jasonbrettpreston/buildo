// SPEC LINK: MB-73 plan §5 and §9 F-D1, F-P5, F-P6 — the drift arm of the promises check. R-KU (ids by pattern,
//            R4-09: an allowlist of permitted targets, not a name match), K9/K10: tracked files only, config at the BASE ref.

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { SCAN_CONFIG_PATH, loadScanConfig, importSpecifiers, oldEngineLines, notDoingTokens, notDoingLines, withdrawnLines } from '../../scripts/analysis/mcbylaws-promises/promise-drift.mjs';

// Built by concatenation so this test source itself carries none of the forbidden names.
const FORBIDDEN = [
  ['maxbld', '-main-building.js'].join(''),
  ['wf1/', 'p3-', 'engine'].join(''),
  ['renovation', '-shared.js'].join(''),
  ['runMax', 'bldScenarios'].join(''),
  ['dump', 'all.mjs'].join(''),
  ['blind-run', '-parcels.json'].join(''),
];

const CONFIG = {
  scan_roots: ['src/'], forbidden: FORBIDDEN, layer_paths: ['src/layer3/'],
  allow_imports: ['node:fs', 'some-old-harness', 'node:*'],
};
type ScanConfig = { scan_roots: string[]; forbidden: string[]; layer_paths: string[]; allow_imports: string[] };
const withConfig = (over: Record<string, unknown> = {}) => ({ ...CONFIG, ...over }) as ScanConfig;
const file = (path: string, text: string) => ({ path, text });
const old = (files: { path: string; text: string }[], config: ScanConfig = CONFIG) =>
  oldEngineLines({ files, config });

let repo: Repo | null = null;
afterEach(() => { repo?.cleanup(); repo = null; });

describe('importSpecifiers', () => {
  it('finds from, side-effect import, dynamic import and require in both quote styles', () => {
    const text = [
      "import a from './a.mjs';",
      'import "side.mjs";',
      "const b = await import(\"dyn.mjs\");",
      "const c = require('req.js');",
    ].join('\n');
    expect(importSpecifiers(text)).toEqual(['./a.mjs', 'side.mjs', 'dyn.mjs', 'req.js']);
    expect(importSpecifiers('export const x = 1;')).toEqual([]);
  });
});

describe('oldEngineLines — F-D1', () => {
  it('a layer-3 file importing the forbidden module is red in every built name; relative and allowed is green', () => {
    for (const name of FORBIDDEN) {
      expect(old([file('src/layer3/a.mjs', `import { x } from '${name}';\n`)])).toEqual(['FAIL:W:old-engine:src/layer3/a.mjs']);
    }
    const green = "import a from './a.mjs';\nimport b from '../b.mjs';\nimport fs from 'node:fs';\nimport h from 'some-old-harness';\nimport p from 'node:path';\n";
    expect(old([file('src/layer3/a.mjs', green)])).toEqual([]);
  });

  it('allow_imports is an allowlist, not a name match (R4-09)', () => {
    const text = "import x from 'some-old-harness-internal';\n";
    const red = ['FAIL:W:old-engine:src/layer3/a.mjs'];
    expect(old([file('src/layer3/a.mjs', text)])).toEqual(red);
    expect(old([file('src/layer3/a.mjs', "import y from 'zzz-elsewhere';\n")])).toEqual(red);
    expect(old([file('src/layer3/a.mjs', text)], withConfig({ allow_imports: ['some-old-*'] }))).toEqual([]);
  });

  it('a bare specifier outside a layer path is not red; a forbidden name anywhere under a scan root is', () => {
    expect(old([file('src/other/a.mjs', "import x from 'does-not-exist';\n")])).toEqual([]);
    expect(old([file('src/other/a.mjs', `export const p = '${FORBIDDEN[1]}';\n`)]))
      .toEqual(['FAIL:W:old-engine:src/other/a.mjs']);
    expect(old([file('other/a.mjs', `export const p = '${FORBIDDEN[1]}';\n`)])).toEqual([]);
  });
});

describe('loadScanConfig — read at the base ref', () => {
  it('the base copy wins over a later working-tree or committed change', () => {
    const r = (repo = makeRepo());
    r.write(SCAN_CONFIG_PATH, JSON.stringify(CONFIG));
    const base = r.commit('config');
    r.write(SCAN_CONFIG_PATH, JSON.stringify(withConfig({ forbidden: [] })));
    const out = loadScanConfig(r.dir, base);
    expect(out.config).toEqual(CONFIG);
    expect(out.lines).toEqual([]);
    expect(loadScanConfig(r.dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef').lines)
      .toEqual(['FAIL:R:cannot-decide:scan-config']);
  });

  it('unparseable, absent, or with a missing or non-array field is cannot-decide', () => {
    const r = (repo = makeRepo());
    const noForbidden = `{"scan_roots":["src/"],"layer_paths":[],"allow_imports":[]}`;
    const bodies = ['not json', JSON.stringify(withConfig({ forbidden: 'x' })), JSON.stringify(withConfig({ scan_roots: [] })), noForbidden];
    const bad = { config: null, lines: ['FAIL:R:cannot-decide:scan-config'] };
    // Each body differs, so every commit has a real change (git commit exits 1 on an empty commit).
    for (const [i, body] of bodies.entries()) {
      r.write(SCAN_CONFIG_PATH, body);
      expect(loadScanConfig(r.dir, r.commit(`c-${i}`)), body).toEqual(bad);
    }
    // Absent at the ref: an unrelated change, committed, so the config is simply not there.
    r.write('README.md', 'changed\n');
    expect(loadScanConfig(r.dir, r.commit('no-config'))).toEqual(bad);
  });
});

describe('notDoingTokens and notDoingLines — F-P6', () => {
  it('extracts ids and path-like words, dropping prose', () => {
    expect(notDoingTokens('LC-2, LC-3 and src/foo.mjs')).toEqual(['LC-2', 'LC-3', 'src/foo.mjs']);
    expect(notDoingTokens('building a new layer, nothing else')).toEqual([]);
  });

  it('a token found as a whole word in a scanned file is red; LC-22 does not match', () => {
    const item = { id: 'ND-x', tokens: ['LC-2'] };
    const red = ['FAIL:R:not-doing-has-code:ND-x:src/x/a.mjs'];
    expect(notDoingLines({ items: [item], files: [file('src/x/a.mjs', 'const a = LC-22;\n')], config: CONFIG })).toEqual([]);
    expect(notDoingLines({ items: [item], files: [file('src/x/a.mjs', 'const a = LC-2;\n')], config: CONFIG })).toEqual(red);
    const noTokens = [{ id: 'ND-x', tokens: [] }, item];
    expect(notDoingLines({ items: noTokens, files: [file('other/a.mjs', 'LC-2\n')], config: CONFIG })).toEqual([]);
    const files = [file('src/x/a.mjs', 'const a = LC-2;\n'), file('src/x/a.mjs', 'LC-2\n')];
    expect(notDoingLines({ items: [item], files, config: CONFIG })).toEqual(red);
  });
});

describe('withdrawnLines — F-P5', () => {
  it('a later commit touching the globs is red, one outside them is not', () => {
    repo = makeRepo();
    const r = repo;
    r.write('src/x/a.txt', 'a\n');
    const since = r.commit('withdraw');
    r.write('src/x/b.txt', 'b\n');
    const later = r.commit('touch');
    const item = { id: 'WD-1', globs: ['src/x/**'], since };
    expect(withdrawnLines({ cwd: r.dir, rev: later, items: [item] })).toEqual(['FAIL:R:withdrawn-has-commits:WD-1']);
    r.write('elsewhere/c.txt', 'c\n');
    const outside = r.commit('outside');
    expect(withdrawnLines({ cwd: r.dir, rev: outside, items: [{ ...item, globs: ['src/y/**'] }] })).toEqual([]);
    expect(withdrawnLines({ cwd: r.dir, rev: later, items: [{ ...item, globs: ['src/y/**'] }] })).toEqual([]);
  });

  it('no globs or no since is cannot-decide; a bad since is a git failure', () => {
    repo = makeRepo();
    const r = repo;
    r.write('src/x/a.txt', 'a\n');
    const since = r.commit('base');
    r.write('src/x/b.txt', 'b\n');
    const rev = r.commit('touch');
    const ok = { id: 'WD-1', globs: ['src/x/**'], since };
    expect(withdrawnLines({ cwd: r.dir, rev, items: [{ id: 'WD-2', globs: [], since }] }))
      .toEqual(['FAIL:R:cannot-decide:withdrawn-no-globs:WD-2']);
    expect(withdrawnLines({ cwd: r.dir, rev, items: [{ id: 'WD-3', since }] }))
      .toEqual(['FAIL:R:cannot-decide:withdrawn-no-globs:WD-3']);
    expect(withdrawnLines({ cwd: r.dir, rev, items: [{ ...ok, id: 'WD-4', since: 'not-a-sha' }] }))
      .toEqual(['FAIL:R:cannot-decide:withdrawn-git:WD-4']);
    expect(withdrawnLines({ cwd: r.dir, rev, items: [ok] })).toEqual(['FAIL:R:withdrawn-has-commits:WD-1']);
  });
});
