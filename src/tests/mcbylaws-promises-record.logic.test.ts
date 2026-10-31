// SPEC LINK: MB-73 plan sections 3 and 4; K4b (a green certifies a committed state), K6 / FV-2 (a stale green may be
//            re-recorded), R-LG (records are written once by the tool, add-only). Each case is one clause of the brief.
import { describe, expect, it, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GREEN_DIR, RED_DIR, recordRel, writeExclusive, blobsFor, isStale, staleLines,
  uncommittedLines, reRecord, addOnlyLines,
} from '../../scripts/analysis/mcbylaws-promises/promise-record.mjs';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';

const repo: { r: Repo | null } = { r: null };
afterEach(() => { if (repo.r) repo.r.cleanup(); repo.r = null; });

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-promises-record-'));
  dirs.push(d);
  return d;
};
const tmpFiles = (d: string) => {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const abs = path.join(p, e.name);
      if (e.isDirectory()) walk(abs); else out.push(abs);
    }
  };
  walk(d);
  return out.filter((p) => p.endsWith('.tmp'));
};

describe('promise-record — writer (R-LG)', () => {
  it('recordRel builds green/red paths and rejects a bad kind', () => {
    expect(recordRel('green', 'A')).toBe(`${GREEN_DIR}A.json`);
    expect(recordRel('red', 'A')).toBe(`${RED_DIR}A.json`);
    expect(() => recordRel('blue' as 'green', 'A')).toThrow(/bad_kind/);
  });

  it('writes once, a second write of the same id throws exists:, and no temp is left', () => {
    const root = tmpDir();
    const rec = { id: 'A', binding: { sha256: 'x' } };
    expect(writeExclusive(root, 'green', rec)).toBe(`${GREEN_DIR}A.json`);
    const text = fs.readFileSync(path.join(root, GREEN_DIR, 'A.json'), 'utf8');
    expect(JSON.parse(text)).toEqual(rec);
    expect(text.endsWith('\n')).toBe(true);
    expect(() => writeExclusive(root, 'green', rec)).toThrow(/^exists:/);
    expect(tmpFiles(root)).toEqual([]);
  });

  it('rejects an id outside the root', () => {
    const root = tmpDir();
    expect(() => writeExclusive(root, 'green', { id: '../x' })).toThrow(/unsafe_id/);
    expect(tmpFiles(root)).toEqual([]);
  });
});

describe('promise-record — staleness and re-record (K6, FV-2)', () => {
  it('a green whose input blob differs is stale; same blobs pass', () => {
    const rec = { id: 'A', inputs: { 'src.txt': 'abc' } };
    expect(staleLines(rec, { 'src.txt': 'def' })).toEqual(['FAIL:R:stale-green:A']);
    expect(staleLines(rec, { 'src.txt': 'abc' })).toEqual([]);
    expect(isStale(rec, { 'src.txt': 'abc' })).toBe(false);
    expect(isStale(rec, { 'src.txt': 'def' })).toBe(true);
  });

  it('reRecord overwrites a stale green keeping red_of, refuses red_of change and a fresh record', () => {
    const root = tmpDir();
    const oldRec = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'abc' }, commit: 'c1' };
    writeExclusive(root, 'green', oldRec);
    const fresh = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'abc' }, commit: 'c2' };
    expect(() => reRecord(root, oldRec, fresh, { 'src.txt': 'abc' })).toThrow(/^fresh:/);
    const changed = { id: 'A', red_of: 'r2', inputs: { 'src.txt': 'def' }, commit: 'c2' };
    expect(() => reRecord(root, oldRec, changed, { 'src.txt': 'def' })).toThrow(/^record_rewritten:/);
    const next = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'def' }, commit: 'c2' };
    expect(reRecord(root, oldRec, next, { 'src.txt': 'def' })).toBe(`${GREEN_DIR}A.json`);
    expect(JSON.parse(fs.readFileSync(path.join(root, GREEN_DIR, 'A.json'), 'utf8'))).toEqual(next);
    expect(tmpFiles(root)).toEqual([]);
  });
});

describe('promise-record — uncommitted (K4b)', () => {
  it('is [] for a committed file and red for an edited or never-committed file', () => {
    repo.r = makeRepo();
    const r = repo.r;
    r.write('src.txt', 'one\n');
    r.commit('base');
    expect(uncommittedLines(r.dir, ['src.txt'])).toEqual([]);
    r.write('src.txt', 'two\n');
    expect(uncommittedLines(r.dir, ['src.txt'])).toEqual(['FAIL:R:uncommitted:src.txt']);
    expect(uncommittedLines(r.dir, ['src.txt', 'nope.txt']))
      .toEqual(['FAIL:R:uncommitted:src.txt', 'FAIL:R:uncommitted:nope.txt']);
    r.write('src.txt', 'one\n');
    r.write('other.txt', 'x\n');
    expect(uncommittedLines(r.dir, ['other.txt'])).toEqual(['FAIL:R:uncommitted:other.txt']);
  });
});

describe('promise-record — add-only (R-LG, F-REREWRITE)', () => {
  const green = (redOf: string, inputs: Record<string, string>, commit: string) =>
    `${JSON.stringify({ id: 'A', red_of: redOf, inputs, commit }, null, 2)}\n`;
  const GREEN = `${GREEN_DIR}A.json`;
  const RED = `${RED_DIR}A.json`;

  it('deleting the green, editing the red, or editing a fresh green is record-rewritten', () => {
    repo.r = makeRepo();
    const r = repo.r;
    r.write('src.txt', 'one\n');
    const blob = r.git(['hash-object', '--', 'src.txt']).trim();
    r.write(GREEN, green('r1', { 'src.txt': blob }, 'c1'));
    r.write(RED, '{"id":"A","reason":"r1"}\n');
    const base = r.commit('base');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);
    fs.rmSync(path.join(r.dir, GREEN));
    r.commit('delete the green');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([`FAIL:R:record-rewritten:${GREEN}`]);
    r.write(GREEN, green('r1', { 'src.txt': blob }, 'c1'));
    r.commit('restore the green');
    r.write(RED, '{"id":"A","reason":"r2"}\n');
    r.commit('edit the red');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([`FAIL:R:record-rewritten:${RED}`]);
    r.write(RED, '{"id":"A","reason":"r1"}\n');
    r.commit('restore red');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);
    r.write(GREEN, green('r1', { 'src.txt': blob }, 'c9'));
    r.commit('edit the fresh green');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([`FAIL:R:record-rewritten:${GREEN}`]);
  });

  it('a stale green may be re-recorded keeping id and red_of; untouched and added pass', () => {
    repo.r = makeRepo();
    const r = repo.r;
    r.write('src.txt', 'one\n');
    const blob1 = r.git(['hash-object', '--', 'src.txt']).trim();
    r.write(GREEN, green('r1', { 'src.txt': blob1 }, 'c1'));
    r.write(RED, '{"id":"A","reason":"r1"}\n');
    const base = r.commit('base');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);
    expect(addOnlyLines({ cwd: r.dir, base: 'no-such-rev', rev: 'HEAD' })).toEqual(['FAIL:R:cannot-decide']);
    r.write('src.txt', 'two\n');
    r.commit('change input');
    const blob2 = r.git(['hash-object', '--', 'src.txt']).trim();
    r.write(GREEN, green('r1', { 'src.txt': blob2 }, 'c2'));
    r.commit('re-record');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);
    r.write(`${RED_DIR}B.json`, '{"id":"B"}\n');
    r.commit('add a red');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);
    const rev = r.git(['rev-parse', 'HEAD']);
    expect(blobsFor(r.dir, rev, ['src.txt'])).toEqual({ 'src.txt': blob2 });
    expect(blobsFor(r.dir, rev, ['missing.txt'])).toEqual({});
    expect(blobsFor(r.dir, '', ['src.txt'])).toEqual({ 'src.txt': blob2 });
  });
});
