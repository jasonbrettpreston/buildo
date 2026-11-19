// SPEC LINK: MORNING-DECISIONS.md:725 (McStorage writer/stamp, one of the eight automatic checks) and :704 ("no all-lot headline fill": the all-lot table is replaced, its successor has no name yet);
//            McStorage policy P3 (stamp), P4 (stale never served), P6 (one writer: the step; mcbylaws/MB-26/runbook-increment1.md:298).
//
// Logic locks for CHK.5 (scripts/analysis/policy-checks/chk5-mcstorage.mjs) and the driver scripts/analysis/policy-checks.mjs: WAITS while no record table is named (exit 0, never a pass),
// a refusal for an unverified or replaced table, enforcement once a table is verified, and the CLI end to end in a throwaway git repo. No DB, no network.
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

const TBL = ['parcel', 'maxbld', 'scenarios'].join('_'); // the replaced all-lot table (MORNING-DECISIONS.md:704)
const NEW_TBL = 'opened_lot_records_fixture';
const entry = (over: Json = {}): Json => ({ name: NEW_TBL, producers: ['scripts/**/producer-*.js'], stamp_columns: ['table_version', 'settings_sha'], read_guard: ['assertCurrentStamp'], verified: true, verified_source: 'fixture migration', ...over });
const CHK3 = { chk3_component_globs: ['src/components/report/**'], chk3_binding_sources_path: 'scripts/surfaces/_schema/binding-sources.json' }; // CHK.3 keys: the driver runs every check
const config = (tables: Json[], extra: Json = {}): Json => ({ chk5_tables: tables, chk5_replaced_tables: [TBL], ...CHK3, ...extra });
const run = (cfg: Json, over: Json = {}): Json => D.runChecks!({ files: [], allFiles: null, config: cfg, ledger: [], ...over });
const rules = (r: Json): string[] => r.findings.map((f: Json) => f.rule);

const WRITE = `await db.query("INSERT INTO ${NEW_TBL} (a) VALUES (1)")`;
const READ_BARE = `db.query("SELECT a FROM ${NEW_TBL} WHERE parcel_id = $1")`;
const READ_OK = `// assertCurrentStamp\nconst s = 'table_version settings_sha'; assertCurrentStamp(s); db.query("SELECT a FROM ${NEW_TBL}")`;

describe('CHK.5 states', () => {
  it('module loads', () => expect(D.importError).toBeUndefined());
  it('WAITS: no table named yet = a WAITS line naming the owner and ruling :704, no findings (not a pass)', () => {
    const r = run(config([]));
    expect(r.findings).toEqual([]);
    expect(r.waits).toHaveLength(1);
    expect(r.waits[0]).toMatch(/^WAITS CHK\.5 chk5_tables is empty/);
    expect(r.waits[0]).toContain('MORNING-DECISIONS.md:704');
    expect(r.waits[0]).toContain('owner');
  });
  it('FAIL closed: chk5_tables that is not an array is a finding, not a WAITS', () => {
    const r = run({ chk5_tables: null, ...CHK3 });
    expect(rules(r)).toEqual(['chk5-config']);
    expect(r.waits).toEqual([]);
  });
  it('RED: an entry with verified:false, or verified without a verified_source, is refused (names are never guessed)', () => {
    expect(rules(run(config([entry({ verified: false })])))).toEqual(['chk5-config']);
    expect(rules(run(config([entry({ verified_source: '' })])))).toEqual(['chk5-config']);
  });
  it('RED: the replaced all-lot table is never accepted as a verified record table', () => {
    const r = run(config([entry({ name: TBL })]));
    expect(rules(r)).toEqual(['chk5-config']);
    expect(r.findings[0].msg).toContain('replaced');
  });
  it('a populated config never reads as WAITS (a violation cannot hide behind it)', () => {
    const r = run(config([entry()]), { files: [{ path: 'src/lib/w.ts', content: WRITE }] });
    expect(r.waits).toEqual([]);
    expect(rules(r)).toEqual(['chk5-producer']);
  });
});

describe('CHK.5 enforcement of a verified table', () => {
  it('RED (a): a write outside the declared producers; GREEN in a producer; a comment mention is green', () => {
    expect(rules(run(config([entry()]), { files: [{ path: 'src/lib/w.ts', content: WRITE }] }))).toEqual(['chk5-producer']);
    expect(run(config([entry()]), { files: [{ path: 'scripts/steps/producer-a.js', content: WRITE }] }).findings).toEqual([]);
    expect(run(config([entry()]), { files: [{ path: 'src/lib/c.ts', content: `// INSERT INTO ${NEW_TBL}` }] }).findings).toEqual([]);
  });
  it('RED (b): a reader that does not name the stamp columns and the guard; GREEN when it does', () => {
    const r = run(config([entry()]), { files: [{ path: 'src/lib/r.ts', content: READ_BARE }] });
    expect(rules(r)).toEqual(['chk5-reader']);
    expect(r.findings[0].msg).toContain('table_version');
    expect(run(config([entry()]), { files: [{ path: 'src/lib/r.ts', content: READ_OK }] }).findings).toEqual([]);
  });
  it('tests, fixtures and migrations are not scanned', () => {
    const files = [{ path: 'src/lib/w.test.ts', content: WRITE }, { path: 'src/tests/fixtures/x.ts', content: WRITE }, { path: 'migrations/9_x.sql', content: `INSERT INTO ${NEW_TBL} VALUES (1);` }];
    expect(run(config([entry()]), { files }).findings).toEqual([]);
  });
  it('RED (c): with the whole tree in view, no stale-stamp test naming the table is a finding; GREEN with one', () => {
    const noStale = [{ path: 'src/a.test.ts', content: `it('works', () => 1); ${NEW_TBL}` }];
    const stale = [{ path: 'src/s.test.ts', content: `it('stale stamp is not served', () => 1); ${NEW_TBL}` }];
    expect(run(config([entry()]), { allFiles: noStale }).findings.map((f: Json) => f.item)).toEqual([`stale-stamp-test@${NEW_TBL}`]);
    expect(run(config([entry()]), { allFiles: stale }).findings).toEqual([]);
    expect(run(config([entry()]), { allFiles: null }).findings).toEqual([]); // a staged run cannot see the whole tree
  });
  it('a ledger row with a dated-note ruling id clears exactly its finding', () => {
    const files = [{ path: 'src/lib/w.ts', content: WRITE }];
    const f = run(config([entry()]), { files }).findings[0];
    const row = { rule: f.rule, item: f.item, ruling: 'MD:2026-11-18:744', quote: 'Add to the named list..' };
    expect(run(config([entry()]), { files, ledger: [row] }).findings).toEqual([]);
    expect(run(config([entry()]), { files, ledger: [{ ...row, ruling: 'M-246' }] }).errors).toHaveLength(1);
  });
});

// ---- the CLI end to end, in a throwaway git repo ----
// A hook run exports GIT_DIR, GIT_INDEX_FILE and friends: a child git started with them would act on the REAL repository (it once committed to the worktree's branch). Every child here gets an environment with every GIT_* variable removed.
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
const cli = (cwd: string, ...args: string[]) => spawnSync('node', [DRIVER, ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
const repo = (cfg: Json | null, ledgerRows: Json[] = []): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
  git(dir, 'init', '-q');
  fs.mkdirSync(path.join(dir, 'docs/reports/policy'), { recursive: true });
  if (cfg) fs.writeFileSync(path.join(dir, 'docs/reports/policy/policy-config.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 'docs/reports/policy/policy-ledger.json'), JSON.stringify({ rows: ledgerRows }));
  git(dir, 'add', '-A');
  return dir;
};

describe('driver CLI', () => {
  it('WAITS: an empty chk5_tables prints a WAITS line and exits 0', () => {
    const r = cli(repo(config([])), '--staged');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^WAITS CHK\.5 /m);
    expect(r.stdout).toContain('POLICY CHECKS OK');
  });
  it('FAIL closed: a missing config, an unknown mode and an unverified table all exit 1', () => {
    expect(cli(repo(null), '--staged').status).toBe(1);
    expect(cli(repo(config([])), '--bogus').status).toBe(1);
    const r = cli(repo(config([entry({ verified: false })])), '--staged');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('FAIL:chk5-config');
  });
  it('a staged write outside the producers exits 1 and prints the ledger row to add', () => {
    const dir = repo(config([entry()]));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/w.ts'), `${WRITE}\n`);
    git(dir, 'add', '-A');
    const r = cli(dir, '--staged');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('FAIL:chk5-producer:src/w.ts:1');
    expect(r.stderr).toContain('ledger row');
  });
  it('commit-msg: a ledger row ADDED without its ruling id in an Operator-Ruling trailer exits 1; with it, 0; a row already in HEAD needs none', () => {
    const row = { rule: 'chk5-producer', item: 'x', ruling: 'D-12', quote: 'a verbatim operator line' };
    const dir = repo(config([]), [row]);
    const msg = path.join(dir, 'MSG');
    fs.writeFileSync(msg, 'feat(1_x): y\n');
    expect(cli(dir, '--commit-msg', msg).status).toBe(1);
    fs.writeFileSync(msg, 'feat(1_x): y\n\nOperator-Ruling: "yes" (D-12)\n');
    expect(cli(dir, '--commit-msg', msg).status).toBe(0);
    git(dir, 'commit', '-q', '-m', 'init');
    fs.writeFileSync(msg, 'feat(1_x): z\n');
    expect(cli(dir, '--commit-msg', msg).status).toBe(0);
  });
  it('--all on the committed tree is green (the suite and CI backstop) and WAITS', () => {
    const r = cli(ROOT, '--all');
    expect(r.stdout + r.stderr).not.toMatch(/FAIL/);
    expect(r.stdout).toMatch(/^WAITS CHK\.5 /m);
    expect(r.status).toBe(0);
  }, 60000);
});
