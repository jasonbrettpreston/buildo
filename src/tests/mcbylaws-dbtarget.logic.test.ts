// SPEC LINK: MB-67 F4 (output panel O67-23; operator card CARD-aj3-four item 3, CARD-local-db) —
// any McBylaws script or night whose DB target is not 127.0.0.1:54322 is refused; the cloud waits.
// Locked by scripts/analysis/mcbylaws/db-target.mjs: scanDbTargets / scanDbTargetsInFiles / isDbScopePath.

import { describe, expect, it } from 'vitest';
import { scanDbTargets, scanDbTargetsInFiles, isDbScopePath } from '../../scripts/analysis/mcbylaws/db-target.mjs';

const FAIL = 'FAIL:V:db-target-not-local';

// [text, expected verdicts]
const ROWS: Array<[string, string[]]> = [
  // RED — cloud hosts, wrong ports, remote hosts, no-port URLs, cloud npm scripts, unparseable URLs
  ['postgres://u:p@db.abc.supabase.co:5432/postgres', [`${FAIL}:postgres://u:p@db.abc.supabase.co:5432/postgres`]],
  ['postgresql://postgres:postgres@127.0.0.1:5432/postgres', [`${FAIL}:postgresql://postgres:postgres@127.0.0.1:5432/postgres`]],
  ['PGHOST=10.0.0.5 psql', [`${FAIL}:PGHOST=10.0.0.5`]],
  ['psql -h example.com -p 54322', [`${FAIL}:psql -h example.com -p 54322`]],
  ['DATABASE_URL=postgres://localhost/x', [`${FAIL}:DATABASE_URL=postgres://localhost/x`]],
  ['npm run cloud:migrate', [`${FAIL}:cloud:migrate`]],
  ['postgres:///nohost', [`${FAIL}:postgres:///nohost`]],
  // GREEN — the local stack only
  ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', []],
  ['PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres', []],
  ['psql -h localhost -p 54322', []],
  ['a night that loads parcels and grades them; nothing else.', []],
  ['the words cloud and cloudy and a cloud: of words', []],
];

describe('scanDbTargets — only 127.0.0.1:54322 or localhost:54322 is local', () => {
  it.each(ROWS)('%s', (text, expected) => {
    expect(scanDbTargets(text).map(() => FAIL)).toEqual(expected.map(() => FAIL));
  });
});

describe('scanDbTargets — detail rules', () => {
  it('snippet is the offending token, at most 60 chars', () => {
    const url = `postgres://u:p@${'a'.repeat(80)}.supabase.co:5432/postgres`;
    const [v] = scanDbTargets(url);
    expect(v!.length).toBeLessThanOrEqual(FAIL.length + 1 + 60);
  });

  it('a cloud host name alone (pooler, supabase.com) is a target', () => {
    expect(scanDbTargets('host pooler.supabase.com today')[0]).toMatch(new RegExp(`^${FAIL}:`));
    expect(scanDbTargets('db.x.supabase.co')).toHaveLength(1);
  });

  it('every non-local target in one text is reported, URLs before env/psql', () => {
    const got = scanDbTargets('PGHOST=10.0.0.5 psql -h example.com -p 54322');
    expect(got.map(() => FAIL)).toEqual([FAIL, FAIL]);
  });

  it('PGHOST=localhost with PGPORT=54322 is local; PGPORT other is not', () => {
    expect(scanDbTargets('PGHOST=localhost PGPORT=54322')).toEqual([]);
    expect(scanDbTargets('PGHOST=localhost PGPORT=5433')).toEqual([`${FAIL}:PGHOST: localhost`]);
  });

  it('fail closed: garbage input is refused, never read as "nothing to check"', () => {
    expect(scanDbTargets(null)[0]).toMatch(/^FAIL:V:db-target-not-local/);
    expect(scanDbTargets(undefined)[0]).toMatch(/^FAIL:V:db-target-not-local/);
    expect(scanDbTargets(42)[0]).toMatch(/^FAIL:V:db-target-not-local/);
  });
});

describe('scanDbTargetsInFiles — every verdict suffixed with the path', () => {
  it('suffixes each verdict with :<path>, and an empty file list is a pass', () => {
    expect(scanDbTargetsInFiles([{ path: 'a.mjs', text: 'npm run cloud:migrate' }]))
      .toEqual([`${FAIL}:cloud:migrate:a.mjs`]);
    expect(scanDbTargetsInFiles([{ path: 'b.mjs', text: 'psql -h localhost -p 54322' }])).toEqual([]);
    expect(scanDbTargetsInFiles([])).toEqual([]);
  });
});

describe('isDbScopePath — the caller gates which files the scan covers', () => {
  const CASES: Array<[string, boolean]> = [
    ['scripts/analysis/mcbylaws/run-mcbylaws.mjs', true],
    ['scripts/analysis/mcbylaws-loop/night-1.mjs', true],
    ['scripts/analysis/mcbylaws/db-target.mjs', false],
    ['.cursor/nights/2026-10-20-night-1.md', true],
    ['.cursor/briefs/f4.md', true],
    ['.cursor/rules/thing.md', false],
    ['.cursor/plans/night.mjs', false],
    ['.mb67-briefs/f4.md', true],
    ['.mb67-briefs/deep/f4.txt', true],
    // N67-4 — engine briefs carry run lines and connection strings
    ['.cursor/engine-briefs/mb67-g1.md', true],
    ['.cursor/engine-briefs/sub/x.md', true],
    ['.cursor/engine-briefs/x.json', false],
    ['.cursor/other/x.md', false],
    ['scripts/analysis/decision-log.mjs', false],
    ['scripts/analysis/mcbylaws-x/a.mjs', false],
    ['src/tests/mcbylaws-dbtarget.logic.test.ts', false],
  ];
  it.each(CASES)('%s -> %s', (p, expected) => {
    expect(isDbScopePath(p)).toBe(expected);
  });

  it('rejects a non-string path', () => {
    expect(isDbScopePath(null)).toBe(false);
    expect(isDbScopePath(7)).toBe(false);
  });
});
