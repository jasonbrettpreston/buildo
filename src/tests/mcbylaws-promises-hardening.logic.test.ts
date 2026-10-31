// SPEC LINK: MB-73 plan sections 3 and 4; K-2 (re-recording replaces the record atomically: no window without a record,
//            no temp left behind, a failed write keeps the old bytes), K6 / FV-2 (only a stale green may be re-recorded),
//            B3 / R-LG (a forged green — a valid binding over a rewritten record — is still record-rewritten).
import { describe, expect, it, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GREEN_DIR, RED_DIR, writeExclusive, reRecord, addOnlyLines } from '../../scripts/analysis/mcbylaws-promises/promise-record.mjs';
import { bindRecord } from '../../scripts/analysis/mcbylaws-loop/loop-record.mjs';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';

const repo: { r: Repo | null } = { r: null };
afterEach(() => { if (repo.r) repo.r.cleanup(); repo.r = null; });

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-promises-hardening-'));
  dirs.push(d);
  return d;
};
const entries = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
const readGreen = (root: string, id: string) => fs.readFileSync(path.join(root, GREEN_DIR, `${id}.json`), 'utf8');

describe('promise-record — K-2: re-record is atomic', () => {
  it('writes the new record over a stale one and leaves no temp behind', () => {
    const root = tmpDir();
    const oldRec = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'old' }, commit: 'c1' };
    writeExclusive(root, 'green', oldRec);
    const newRec = bindRecord({ id: 'A', red_of: 'r1', inputs: { 'src.txt': 'new' }, commit: 'c2' });
    expect(reRecord(root, oldRec, newRec, { 'src.txt': 'new' })).toBe(`${GREEN_DIR}A.json`);
    expect(JSON.parse(readGreen(root, 'A'))).toEqual(newRec);
    expect(entries(path.join(root, GREEN_DIR))).toEqual(['A.json']);
  });

  it('keeps the old bytes and no temp when the new record cannot be serialised', () => {
    const root = tmpDir();
    const oldRec = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'old' }, commit: 'c1' };
    writeExclusive(root, 'green', oldRec);
    const before = readGreen(root, 'A');
    const bad = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'new' }, commit: 'c2', n: BigInt(1) };
    expect(() => reRecord(root, oldRec, bad, { 'src.txt': 'new' })).toThrow();
    expect(readGreen(root, 'A')).toBe(before);
    expect(entries(path.join(root, GREEN_DIR))).toEqual(['A.json']);
  });

  it('refuses a fresh old record and a changed red_of without touching the file', () => {
    const root = tmpDir();
    const oldRec = { id: 'A', red_of: 'r1', inputs: { 'src.txt': 'same' }, commit: 'c1' };
    writeExclusive(root, 'green', oldRec);
    const before = readGreen(root, 'A');
    const same = { ...oldRec, commit: 'c2' };
    expect(() => reRecord(root, oldRec, same, { 'src.txt': 'same' })).toThrow(/^fresh:A$/);
    expect(readGreen(root, 'A')).toBe(before);
    const other = { id: 'A', red_of: 'r2', inputs: { 'src.txt': 'new' }, commit: 'c2' };
    expect(() => reRecord(root, oldRec, other, { 'src.txt': 'new' })).toThrow(/^record_rewritten:A$/);
    expect(readGreen(root, 'A')).toBe(before);
    expect(entries(path.join(root, GREEN_DIR))).toEqual(['A.json']);
  });
});

describe('promise-record — B3: a forged green is still record-rewritten', () => {
  const GREEN = `${GREEN_DIR}A.json`;
  const RED = `${RED_DIR}A.json`;
  const marker = (n: number) => `marker-${n}.txt`;

  it('a re-bound green with the same id and red_of and fresh inputs is record-rewritten', () => {
    repo.r = makeRepo();
    const r = repo.r;
    r.write('src.txt', 'one\n');
    const blob = r.git(['hash-object', '--', 'src.txt']).trim();
    const green = bindRecord({ id: 'A', red_of: 'r1', inputs: { 'src.txt': blob }, commit: 'c1' });
    r.write(GREEN, `${JSON.stringify(green, null, 2)}\n`);
    r.write(RED, '{"id":"A","reason":"r1"}\n');
    r.write(marker(1), '1\n');
    const base = r.commit('base');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);

    const forged = bindRecord({ id: 'A', red_of: 'r1', inputs: { 'src.txt': blob }, commit: 'forged' });
    expect(forged.binding.sha256).not.toBe(green.binding.sha256);
    r.write(GREEN, `${JSON.stringify(forged, null, 2)}\n`);
    r.write(marker(2), '2\n');
    r.commit('forge the green');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([`FAIL:R:record-rewritten:${GREEN}`]);

    r.write(GREEN, `${JSON.stringify(green, null, 2)}\n`);
    r.write(marker(3), '3\n');
    r.commit('restore the green');
    expect(addOnlyLines({ cwd: r.dir, base, rev: 'HEAD' })).toEqual([]);
  });
});
