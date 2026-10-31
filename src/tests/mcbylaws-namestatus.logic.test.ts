// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan §B1b, arm R (G67-09),
import * as fs from 'node:fs';
import * as path from 'node:path';
//            lines 88-93 — renames and path lists. R1: a Layer 2/3 file renamed OUT of the globs is still classified
//            (executed, adjudication E6: `--name-only` reports only the destination). R2: a path with a newline is
//            escaped when printed, so it cannot forge a summary line.
//
// The parser is the only place a `-z` name-status stream becomes paths. It is fail-closed: unknown or truncated input
// is null (the caller turns that into a failure line), never a partial list; an empty stream is an empty list.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as ns from '../../scripts/analysis/mcbylaws/name-status.mjs';
import { makeRepo } from './fixtures/mcbylaws-gate/repo-helper';

/** Run git in a temp repo (no GIT_* passthrough, no global config) and return raw utf8 stdout. */
function gitRaw(repo: { dir: string }, args: string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  ) as NodeJS.ProcessEnv;
  const r = spawnSync('git', args, {
    cwd: repo.dir,
    encoding: 'utf8',
    env: { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

describe('name-status parser — pure cases', () => {
  it('empty input is an empty list (never a pass on its own)', () => {
    expect(ns.parseNameStatusZ('')).toEqual([]);
  });

  it('parses A/M/D/T/U with one path each', () => {
    const raw = 'A\u0000a/new.mjs\u0000M\u0000a/mod.mjs\u0000D\u0000a/gone.mjs\u0000T\u0000a/link\u0000U\u0000a/conflict\u0000';
    expect(ns.parseNameStatusZ(raw)).toEqual([
      { status: 'A', score: null, path: 'a/new.mjs', oldPath: null },
      { status: 'M', score: null, path: 'a/mod.mjs', oldPath: null },
      { status: 'D', score: null, path: 'a/gone.mjs', oldPath: null },
      { status: 'T', score: null, path: 'a/link', oldPath: null },
      { status: 'U', score: null, path: 'a/conflict', oldPath: null },
    ]);
  });

  it('parses a rename with TWO paths (old then new) and its score', () => {
    expect(ns.parseNameStatusZ('R100\u0000a/e.mjs\u0000b/e2.mjs\u0000')).toEqual([
      { status: 'R', score: 100, path: 'b/e2.mjs', oldPath: 'a/e.mjs' },
    ]);
  });

  it('parses a copy entry with TWO paths', () => {
    expect(ns.parseNameStatusZ('C075\u0000a/src.mjs\u0000a/dst.mjs\u0000')).toEqual([
      { status: 'C', score: 75, path: 'a/dst.mjs', oldPath: 'a/src.mjs' },
    ]);
  });

  it('truncated input (a rename missing its second path) is null', () => {
    expect(ns.parseNameStatusZ('R100\u0000a/e.mjs\u0000')).toBeNull();
  });

  it('a missing trailing path for a plain letter is null', () => {
    expect(ns.parseNameStatusZ('M\u0000a/mod.mjs\u0000A\u0000')).toBeNull();
    expect(ns.parseNameStatusZ('M')).toBeNull();
  });

  it('an unknown status letter is null, never a partial list', () => {
    expect(ns.parseNameStatusZ('M\u0000a/ok.mjs\u0000X\u0000a/weird.mjs\u0000')).toBeNull();
    expect(ns.parseNameStatusZ('R\u0000a\u0000b\u0000')).toBeNull();
    expect(ns.parseNameStatusZ('R100\u0000a\u0000b\u0000Q9\u0000c\u0000')).toBeNull();
  });

  it('allPaths is sorted, unique, and includes BOTH sides of a rename', () => {
    const entries = ns.parseNameStatusZ('R100\u0000a/e.mjs\u0000b/e2.mjs\u0000M\u0000z/m.mjs\u0000D\u0000a/e.mjs\u0000');
    expect(entries).not.toBeNull();
    expect(ns.allPaths(entries as ns.NameStatusEntry[])).toEqual(['a/e.mjs', 'b/e2.mjs', 'z/m.mjs']);
  });

  it('escapePath keeps one path on one line (control chars and backslash)', () => {
    expect(ns.escapePath('a/new\nPROTECTED: none')).toBe('a/new\\x0aPROTECTED: none');
    expect(ns.escapePath('a/tab\there')).toBe('a/tab\\x09here');
    expect(ns.escapePath('a\\b/c')).toBe('a\\\\b/c');
    expect(ns.escapePath('a/del\u007f')).toBe('a/del\\x7f');
    expect(ns.escapePath('plain/path.mjs')).toBe('plain/path.mjs');
  });

  it('escapePath output never contains a raw newline', () => {
    for (const p of ['a\nb', 'a\r\nb', 'a\tb', 'a\u0000b', 'a\\\\\nb']) {
      expect(ns.escapePath(p)).not.toMatch(/[\u0000-\u001f\u007f]/);
    }
  });
});

describe('name-status parser — real temp repo (arm R)', () => {
  it('R0: a rename is actually staged so the R entry is readable (helper smoke)', () => {
    const repo = makeRepo();
    try {
      repo.write('a/e.mjs', 'export const x = 1;\n');
      repo.commit('base');
      fs.mkdirSync(path.join(repo.dir, 'b'));
      repo.git(['mv', 'a/e.mjs', 'b/e2.mjs']);
      expect(repo.git(['status', '--porcelain'])).toContain('R  a/e.mjs -> b/e2.mjs');
    } finally {
      repo.cleanup();
    }
  });

  it('R1: a staged rename yields an R entry whose allPaths holds both old and new (--name-only shows only the new)', () => {
    const repo = makeRepo();
    try {
      repo.write('scripts/analysis/bylaw/e.mjs', 'export const x = 1;\n');
      repo.commit('base');
      repo.git(['mv', 'scripts/analysis/bylaw/e.mjs', 'scripts/analysis/e2.mjs']);
      const raw = gitRaw(repo, ['diff', '--cached', '--name-status', '-z', '-M']);
      const entries = ns.parseNameStatusZ(raw);
      expect(entries).not.toBeNull();
      const e = (entries as ns.NameStatusEntry[])[0]!;
      expect(e.status).toBe('R');
      expect(e.path).toBe('scripts/analysis/e2.mjs');
      expect(e.oldPath).toBe('scripts/analysis/bylaw/e.mjs');
      const all = ns.allPaths(entries as ns.NameStatusEntry[]);
      expect(all).toContain('scripts/analysis/bylaw/e.mjs');
      expect(all).toContain('scripts/analysis/e2.mjs');
      const nameOnly = gitRaw(repo, ['diff', '--cached', '--name-only', '-z']);
      expect(nameOnly).toBe('scripts/analysis/e2.mjs\u0000');
      expect(nameOnly).not.toContain('scripts/analysis/bylaw/e.mjs');
    } finally {
      repo.cleanup();
    }
  });

  it('R2: a file named with a newline is ONE path and prints on one line', () => {
    const repo = makeRepo();
    try {
      repo.write('seed.txt', 'seed\n');
      repo.commit('base');
      const forged = 'a\nPROTECTED: none';
      repo.write(forged, 'x\n');
      repo.stage(forged);
      const raw = gitRaw(repo, ['diff', '--cached', '--name-status', '-z', '-M']);
      const entries = ns.parseNameStatusZ(raw);
      expect(entries).not.toBeNull();
      expect((entries as ns.NameStatusEntry[]).length).toBe(1);
      const e = (entries as ns.NameStatusEntry[])[0]!;
      expect(e.status).toBe('A');
      expect(e.path).toBe(forged);
      const printed = ns.escapePath(e.path);
      expect(printed).toBe('a\\x0aPROTECTED: none');
      expect(printed.split('\n').length).toBe(1);
    } finally {
      repo.cleanup();
    }
  });
});
