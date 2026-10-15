// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.3, §C.1.4
//
// WF3 B2 (2026-10-15, Mac mini): two engine fences compared a canonical
// (realpath) location against a NON-canonical spelling of a path that did not
// exist yet — `secretEnvDirs` de-dup and the bash ledger-dir fence. On macOS
// `/var/...` is a symlink to `/private/var/...`, so both missed. The shared
// `realpathDeepestAncestor` canonicalises a not-yet-existing path through its
// deepest existing ancestor. This lock uses an explicit symlink so it fails on
// EVERY OS if the helper regresses to a leaf-only realpath, not just on macOS.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { realpathDeepestAncestor, resolveConfinedPath } = require('../../scripts/lib/exec-path.js') as {
  realpathDeepestAncestor: (p: string) => string;
  resolveConfinedPath: (root: string, p: string) => string;
};

describe('realpathDeepestAncestor (Spec 08 §C.1.3) — one canonical spelling for not-yet-existing paths', () => {
  let base: string;
  let target: string;
  let link: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-path-realpath-'));
    target = path.join(base, 'target');
    link = path.join(base, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  });

  afterEach(() => {
    fs.unlinkSync(link);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('a missing leaf under a symlinked dir resolves through the link to the real dir', () => {
    const viaLink = path.join(link, 'missing', 'run.jsonl');
    expect(realpathDeepestAncestor(viaLink)).toBe(path.join(fs.realpathSync(target), 'missing', 'run.jsonl'));
  });

  it('the symlinked and real spellings of the same missing path compare equal', () => {
    expect(realpathDeepestAncestor(path.join(link, 'x.env'))).toBe(realpathDeepestAncestor(path.join(target, 'x.env')));
  });

  it('an existing path resolves to its full realpath', () => {
    expect(realpathDeepestAncestor(link)).toBe(fs.realpathSync(target));
  });

  it('resolveConfinedPath keeps its contract on top of the helper: an escape via the link is PATH_OUTSIDE_REPO', () => {
    const repo = path.join(base, 'repo');
    fs.mkdirSync(repo);
    const escape = path.join(repo, 'out');
    fs.symlinkSync(target, escape, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => resolveConfinedPath(repo, 'out/new-file.txt')).toThrow(/escapes repo root/);
    expect(resolveConfinedPath(repo, 'inside/new-file.txt')).toBe(path.join(fs.realpathSync(repo), 'inside', 'new-file.txt'));
  });
});
