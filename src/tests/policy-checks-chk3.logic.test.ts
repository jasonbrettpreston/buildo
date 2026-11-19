// SPEC LINK: MORNING-DECISIONS.md:725 ("nothing new without a ruling": one of the eight automatic checks), :744 (built in the repo under its hooks), :750 (re-use);
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md:782 (binding-sources.json is protected); operator 2026-11-11 "build with existing components: new ones need a named reason and a ruling".
//
// Logic locks for CHK.3 (scripts/analysis/policy-checks/chk3-nothing-new.mjs) through the driver scripts/analysis/policy-checks.mjs: a new component file, a new dependency key and a binding-sources change
// each need a policy-ledger row whose ruling id is in an Operator-Ruling trailer; renames, tests, version and script bumps and ordinary commits are not hit. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const DRIVER = path.join(ROOT, 'scripts/analysis/policy-checks.mjs');
const D: Json = await import(pathToFileURL(DRIVER).href).catch((err: unknown) => ({ importError: String(err) }));
const C3: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/policy-checks/chk3-nothing-new.mjs')).href).catch((err: unknown) => ({ importError: String(err) }));

const BIND = 'scripts/surfaces/_schema/binding-sources.json';
const cfg: Json = { chk5_tables: [], chk3_component_globs: ['src/components/report/**', 'src/components/search/**', 'mobile/src/components/**', 'mobile/src/constants/report*'], chk3_binding_sources_path: BIND };
const run = (over: Json = {}): Json => D.runChecks!({ files: [], allFiles: null, changes: [], pkgBefore: '{}', pkgAfter: '{}', config: cfg, ledger: [], ...over });
const items = (r: Json): string[] => r.findings.map((f: Json) => `${f.rule}@${f.item}`).sort();
const pkg = (deps: Json, extra: Json = {}): string => JSON.stringify({ name: 'x', scripts: {}, dependencies: deps, ...extra });

describe('CHK.3 nothing new without a ruling', () => {
  it('module loads', () => {
    expect(D.importError).toBeUndefined();
    expect(C3.importError).toBeUndefined();
  });
  it('RED: a new component file, a new dependency key and a binding-sources change each need a row', () => {
    const r = run({ changes: [{ status: 'A', path: 'src/components/report/New.tsx' }, { status: 'M', path: BIND }, { status: 'A', path: 'mobile/src/components/shared/Chip.tsx' }], pkgBefore: pkg({ a: '1' }), pkgAfter: pkg({ a: '1', b: '2' }) });
    expect(items(r)).toEqual(['chk3-binding-source@binding-sources.json', 'chk3-new-component@mobile/src/components/shared/Chip.tsx', 'chk3-new-component@src/components/report/New.tsx', 'chk3-new-dependency@b']);
  });
  it('a new devDependencies key is new too', () => {
    expect(items(run({ pkgBefore: pkg({}), pkgAfter: pkg({}, { devDependencies: { t: '1' } }) }))).toEqual(['chk3-new-dependency@t']);
  });
  it('GREEN: version bumps, script changes, tests, edits of existing files, renames and files outside the roots are not hit', () => {
    const r = run({
      changes: [{ status: 'A', path: 'src/components/report/New.test.tsx' }, { status: 'M', path: 'src/components/report/Old.tsx' }, { status: 'R', path: 'src/components/report/Moved.tsx' }, { status: 'A', path: 'src/lib/helper.ts' }],
      pkgBefore: pkg({ a: '1' }, { scripts: { x: '1' } }),
      pkgAfter: pkg({ a: '2' }, { scripts: { x: '2', y: '3' } }),
    });
    expect(r.findings).toEqual([]);
  });
  it('GREEN: an ordinary commit with nothing flagged', () => {
    expect(run({ changes: [{ status: 'M', path: 'src/lib/x.ts' }] }).findings).toEqual([]);
  });
  it('a ledger row (rule, item, ruling id, quote) clears exactly its finding; a second site with the same key stays (collision)', () => {
    const changes = [{ status: 'A', path: 'src/components/report/New.tsx' }];
    const row = { rule: 'chk3-new-component', item: 'src/components/report/New.tsx', ruling: 'D-12', quote: 'a verbatim operator line' };
    expect(run({ changes, ledger: [row] }).findings).toEqual([]);
    expect(run({ changes: [...changes, ...changes], ledger: [row] }).findings).toHaveLength(1);
  });
  it('RED (fail closed): a config without the CHK.3 keys is a finding, not a pass', () => {
    const r = run({ config: { chk5_tables: [] } });
    expect(r.findings.map((f: Json) => f.rule)).toEqual(['chk3-new-component']);
  });
  it('orphan: a row whose approved component or dependency is gone is RED; a row whose thing still exists is a standing permission', () => {
    const rows = [
      { rule: 'chk3-new-component', item: 'src/components/report/Gone.tsx', ruling: 'D-12', quote: 'a verbatim operator line' },
      { rule: 'chk3-new-component', item: 'src/components/report/Here.tsx', ruling: 'D-12', quote: 'a verbatim operator line' },
      { rule: 'chk3-new-dependency', item: 'left-pad', ruling: 'D-12', quote: 'a verbatim operator line' },
      { rule: 'chk3-new-dependency', item: 'kept', ruling: 'D-12', quote: 'a verbatim operator line' },
    ];
    const gone = run({ ledger: rows, gone: { exists: (p: string) => p.endsWith('Here.tsx'), deps: new Set(['kept']) } });
    expect(gone.orphans.map((o: Json) => o.item).sort()).toEqual(['left-pad', 'src/components/report/Gone.tsx']);
    expect(run({ ledger: rows }).orphans).toEqual([]);
  });
});

// ---- the CLI in a throwaway git repo (every GIT_* variable removed: see policy-checks-chk5.logic.test.ts) ----
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
const cli = (cwd: string, ...args: string[]) => spawnSync('node', [DRIVER, ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
const put = (dir: string, rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const repo = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy3-'));
  git(dir, 'init', '-q');
  put(dir, 'docs/reports/policy/policy-config.json', JSON.stringify(cfg));
  put(dir, 'docs/reports/policy/policy-ledger.json', JSON.stringify({ rows: [] }));
  put(dir, 'package.json', pkg({ a: '1' }));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
};

describe('CHK.3 in the commit-msg hook (CLI)', () => {
  it('an ordinary staged change passes', () => {
    const dir = repo();
    put(dir, 'src/lib/x.ts', 'export const x = 1;\n');
    git(dir, 'add', '-A');
    const msg = path.join(dir, 'MSG');
    fs.writeFileSync(msg, 'feat(1_x): y\n');
    expect(cli(dir, '--commit-msg', msg).status).toBe(0);
  });
  it('a staged new component with no row exits 1 and prints the row to add; the row with its trailer exits 0; the row without the trailer exits 1', () => {
    const dir = repo();
    put(dir, 'src/components/report/New.tsx', 'export const N = 1;\n');
    git(dir, 'add', '-A');
    const msg = path.join(dir, 'MSG');
    fs.writeFileSync(msg, 'feat(1_x): y\n');
    const red = cli(dir, '--commit-msg', msg);
    expect(red.status).toBe(1);
    expect(red.stderr).toContain('FAIL:chk3-new-component:src/components/report/New.tsx');
    put(dir, 'docs/reports/policy/policy-ledger.json', JSON.stringify({ rows: [{ rule: 'chk3-new-component', item: 'src/components/report/New.tsx', ruling: 'D-12', quote: 'a verbatim operator line' }] }));
    git(dir, 'add', '-A');
    expect(cli(dir, '--commit-msg', msg).status).toBe(1); // no trailer
    fs.writeFileSync(msg, 'feat(1_x): y\n\nOperator-Ruling: "a verbatim operator line" (D-12)\n');
    expect(cli(dir, '--commit-msg', msg).status).toBe(0);
  });
  it('a staged new dependency key exits 1; a version bump exits 0', () => {
    const dir = repo();
    const msg = path.join(dir, 'MSG');
    fs.writeFileSync(msg, 'feat(1_x): y\n');
    put(dir, 'package.json', pkg({ a: '2' }));
    git(dir, 'add', '-A');
    expect(cli(dir, '--commit-msg', msg).status).toBe(0);
    put(dir, 'package.json', pkg({ a: '2', b: '1' }));
    git(dir, 'add', '-A');
    const r = cli(dir, '--commit-msg', msg);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('FAIL:chk3-new-dependency:package.json');
  });
  it('a staged binding-sources change exits 1', () => {
    const dir = repo();
    put(dir, BIND, '{}\n');
    git(dir, 'add', '-A');
    const msg = path.join(dir, 'MSG');
    fs.writeFileSync(msg, 'feat(1_x): y\n');
    expect(cli(dir, '--commit-msg', msg).status).toBe(1);
  });
});
