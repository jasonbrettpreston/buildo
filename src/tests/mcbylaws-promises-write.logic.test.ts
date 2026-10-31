// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan sections 3 and 4); R-KQ, R-KU, R-LG, K4b, K6, FV-2.
// Workflow is write red -> COMMIT -> build -> write green: writeGreen reads the red at HEAD, so the helpers commit what
// they wrote and a record that has not been committed is read from disk.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { bindRecord, sha256, canon } from '../../scripts/analysis/mcbylaws-loop/loop-record.mjs';
import { blobsFor } from '../../scripts/analysis/mcbylaws-promises/promise-record.mjs';
import { writeRed, writeGreen, gitHead } from '../../scripts/analysis/mcbylaws-promises/promise-write.mjs';
import { identityHash } from '../../scripts/analysis/mcbylaws-promises/promise-register.mjs';

const ART = 't.test.mjs';
const MOD = 'm.mjs';
const ROW = { id: 'R-1', file: 'docs/specs/x.md', quoted_line: 'the promise' };
const ENTRY = { artifact: ART, test_name: 'does it' };
const RED_P = 'mcbylaws/promises/red/R-1.json';
const GREEN_P = 'mcbylaws/promises/green/R-1.json';
const BODY = (v: number) => `import { v } from './m.mjs';\nimport { it, expect } from 'vitest';\nit('does it', () => { expect(v).toBe(${v}); });\n`;

let repo: Repo;
afterEach(() => repo && repo.cleanup());

type Runner = (opts: { cwd: string; files: string[] }) => { ok: boolean; json?: unknown; reason?: string };
type Fake = { runner: Runner; calls: string[][] };

/** A fake runner returning one vitest JSON with the given assertion status, or a failure. */
function fake(status?: string, num?: Record<string, number>): Fake {
  const calls: string[][] = [];
  const runner: Runner = ({ files }) => {
    calls.push(files);
    if (status === undefined) return { ok: false, reason: 'exit:2' };
    return { ok: true, json: { testResults: [{ name: `/x/${files[0]}`, assertionResults: [{ fullName: ENTRY.test_name, status }] }],
      ...(num || {}) } } as { ok: boolean; json: unknown };
  };
  return { runner, calls };
}

function build() {
  repo = makeRepo();
  repo.write(ART, BODY(1));
  repo.write(MOD, 'export const v = 1;\n');
  const base = repo.commit('base');
  /** A record read from the last commit. */
  const read = (rel: string) => JSON.parse(repo.git(['show', `HEAD:${rel}`])) as Record<string, unknown>;
  /** A record read from the work tree (written but not yet committed). */
  const disk = (rel: string) => JSON.parse(fs.readFileSync(path.join(repo.dir, rel), 'utf8')) as Record<string, unknown>;
  return { base, read, disk };
}

const redOnDisk = (f: Fake) => writeRed({ cwd: repo.dir, id: 'R-1', entry: ENTRY, runner: f.runner });
const green = (f: Fake) => writeGreen({ cwd: repo.dir, id: 'R-1', row: ROW, entry: ENTRY, runner: f.runner });
/** A red, then its commit: a green can only follow a COMMITTED red. */
const red = (f: Fake) => {
  const rel = redOnDisk(f);
  repo.commit('red');
  return rel;
};
/** A green, then its commit, so a later case sees it at HEAD. */
const greenCommitted = (f: Fake) => {
  const rel = green(f);
  repo.commit('green');
  return rel;
};
const blobsAt = (files: string[]) => {
  const out: Record<string, string> = {};
  for (const f of files) out[f] = repo.git(['rev-parse', `HEAD:${f}`]);
  return out;
};

describe('gitHead', () => {
  it('returns HEAD and throws no-head outside a repository', () => {
    const b = build();
    expect(b.base).toBe(repo.git(['rev-parse', 'HEAD']));
    expect(gitHead(repo.dir)).toBe(b.base);
    const empty = makeRepo();
    try {
      expect(() => gitHead(empty.dir)).toThrow(/^no-head/);
    } finally {
      empty.cleanup();
    }
  });
});

describe('writeRed', () => {
  const cases: [string, Parameters<typeof fake>, string][] = [
    ['failed run writes the record', ['failed'], 'ok'],
    ['passed run is not a red', ['passed'], 'not-red:R-1'],
    ['skipped run is not a red', ['skipped'], 'not-red:R-1:skipped'],
    ['pending run is not a red', ['pending'], 'not-red:R-1:pending'],
    ['runner failure is run-failed', [undefined], 'run-failed:R-1:exit:2'],
  ];
  it.each(cases)('%s', (_name, args, expected) => {
    const b = build();
    const f = fake(...args);
    const head = b.base;
    if (expected === 'ok') {
      expect(redOnDisk(f)).toBe(RED_P);
      expect(f.calls).toStrictEqual([[ART]]);
      const rec = b.disk(RED_P); // the red is written but not committed by the test
      expect(rec.schema).toBe('promise-red-v1');
      expect(rec.artifact).toBe(ART);
      expect(rec.test_name).toBe(ENTRY.test_name);
      expect(rec.artifact_blob).toBe(repo.git(['rev-parse', `HEAD:${ART}`]));
      expect(rec.commit).toBe(head);
      expect(rec.binding).toStrictEqual(bindRecord({ ...rec, binding: undefined }).binding);
      expect(rec.binding).toStrictEqual({ sha256: sha256(canon({ ...rec, binding: undefined }) as string) });
    } else {
      expect(() => redOnDisk(f)).toThrow(expected);
    }
  });

  it('a missing test is not a red', () => {
    build();
    const runner: Runner = ({ files }) => ({ ok: true, json: { testResults: [{ name: `/x/${files[0]}`, assertionResults: [] }] } });
    expect(() => redOnDisk({ runner, calls: [] })).toThrow('not-red:R-1:missing');
  });

  it('a second red throws exists', () => {
    build();
    red(fake('failed'));
    expect(() => redOnDisk(fake('failed'))).toThrow(`exists:${RED_P}`);
  });
});

describe('writeGreen', () => {
  it('without a red throws no-red-first', () => {
    build();
    expect(() => green(fake('passed'))).toThrow('no-red-first:R-1');
  });

  it('after a committed red writes a bound green with red_of and the closure inputs', () => {
    const b = build();
    red(fake('failed'));
    const blob = (blobsFor(repo.dir, 'HEAD', [ART]) as Record<string, string>)[ART];
    const head = repo.git(['rev-parse', 'HEAD']);
    expect(greenCommitted(fake('passed'))).toBe(GREEN_P);
    const rec = b.read(GREEN_P);
    expect(rec.schema).toBe('promise-green-v1');
    expect(rec.red_of).toBe(blob);
    expect(rec.artifact_blob).toBe(blob);
    expect(rec.inputs).toStrictEqual({ [ART]: blob, [MOD]: repo.git(['rev-parse', `HEAD:${MOD}`]) });
    expect(rec.commit).toBe(head);
    expect(rec.identity_sha).toBe(identityHash(ROW, ENTRY));
    expect(rec.binding).toStrictEqual(bindRecord({ ...rec, binding: undefined }).binding);
  });
});

describe('writeGreen refusals and re-record', () => {
  it.each([
    ['failing run -> not-green', 'failed', 'not-green:R-1:failed'],
    ['skipped run -> not-green', 'skipped', 'not-green:R-1:skipped'],
    ['runner failure -> run-failed', undefined, 'run-failed:R-1:exit:2'],
  ] as const)('%s', (_name, status, expected) => {
    build();
    red(fake('failed'));
    expect(() => green(fake(status))).toThrow(expected);
  });

  it('an uncommitted edit of an input throws uncommitted', () => {
    build();
    red(fake('failed'));
    repo.write(MOD, 'export const v = 2;\n');
    expect(() => green(fake('passed'))).toThrow('uncommitted:R-1:FAIL:R:uncommitted:m.mjs');
  });

  it('a second green on an unchanged tree throws fresh', () => {
    build();
    red(fake('failed'));
    greenCommitted(fake('passed'));
    expect(() => green(fake('passed'))).toThrow('fresh:R-1');
  });

  it('re-records a stale green, keeping red_of and the new input blob', () => {
    const b = build();
    red(fake('failed'));
    greenCommitted(fake('passed'));
    const first = b.read(GREEN_P);
    repo.write(MOD, 'export const v = 2;\n');
    repo.write(ART, BODY(2));
    repo.commit('edit');
    expect(b.read(GREEN_P)).toStrictEqual(first); // the committed record is untouched; it is now stale
    expect(green(fake('passed'))).toBe(GREEN_P);
    const next = b.disk(GREEN_P); // the re-record is staged in the work tree
    expect(next.red_of).toBe(first.red_of);
    expect(next.artifact_blob).not.toBe(first.artifact_blob);
    expect(next.inputs).toStrictEqual(blobsAt([ART, MOD]));
    expect(next.inputs).not.toStrictEqual(first.inputs);
  });

  it('keeps the old green red_of even when the red artifact_blob would differ now', () => {
    const b = build();
    red(fake('failed'));
    greenCommitted(fake('passed'));
    const first = b.read(GREEN_P);
    const redBlob = blobsAt([ART])[ART];
    expect(first.red_of).toBe(redBlob);
    repo.write(MOD, 'export const v = 3;\n');
    repo.write(ART, BODY(3));
    repo.commit('edit both');
    // a red captured NOW would name the new blob; the green keeps the red_of of the record it replaces
    expect(blobsAt([ART])[ART]).not.toBe(redBlob);
    green(fake('passed'));
    expect(b.disk(GREEN_P).red_of).toBe(redBlob);
  });
});
