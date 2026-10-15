// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md (R-M — the before-image
//            is written to docs/reports/golden/<slug>/before-image/*.jsonl); docs/reports/review_followups.md
//            ("Tests write before-image *.jsonl into the real golden tree")
//
// Test-only sandbox for R-M before-image files.
//
// `scripts/lib/step/write.js#persistBeforeImageRows` writes to
// `<repo>/docs/reports/golden/<slug>/before-image/<runAt>-<table>.jsonl`, rooted at its own __dirname,
// with no injection point. Run from a test, that left real untracked files in the working tree (and
// rewrote two tracked fixture files) on every suite run.
//
// This module, installed once per test file by `src/tests/setup.ts`, maps every path INSIDE a
// `docs/reports/golden/<slug>/before-image` directory to the same relative path under a per-file
// os.tmpdir() root, for the fs calls the library and the tests use: mkdirSync, appendFileSync,
// writeFileSync (writes) and existsSync, readFileSync, readdirSync, rmSync, unlinkSync (reads and
// cleanup). The library still returns its normal repo-relative `path`, and a test that reads that
// path back gets the sandboxed bytes.
//
// It replaces: per-file workarounds (vi.spyOn stubs, delete-after-assert) that only some tests used.
// Not covered: child processes, fs.promises, streams, and lstatSync/statSync (the lock test uses
// lstatSync to look at the real disk). The library is unchanged, so lib_fingerprint is unchanged.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BEFORE_IMAGE_REL = /^docs[\\/]reports[\\/]golden[\\/][^\\/]+[\\/]before-image(?:[\\/]|$)/;
const PATCHED = Symbol.for('buildo.beforeImageSandbox');
const MAPPED_FNS = [
  'mkdirSync',
  'appendFileSync',
  'writeFileSync',
  'existsSync',
  'readFileSync',
  'readdirSync',
  'rmSync',
  'unlinkSync',
] as const;

type FsFn = (...args: unknown[]) => unknown;
const fsTable = fs as unknown as Record<string, FsFn>;

let sandboxRoot: string | null = null;

/** The repo path a test or the library asked for, mapped into the sandbox when it is a before-image path. */
export function mapBeforeImagePath(p: unknown): unknown {
  if (sandboxRoot === null || typeof p !== 'string' || !p.includes('before-image')) return p;
  const rel = path.relative(REPO_ROOT, path.resolve(p));
  if (!BEFORE_IMAGE_REL.test(rel)) return p;
  return path.join(sandboxRoot, rel);
}

/** The per-file sandbox root, or null when the sandbox is not installed. */
export function beforeImageSandboxRoot(): string | null {
  return sandboxRoot;
}

/** Creates this file's sandbox root and patches the fs functions once per process. Returns the root. */
export function installBeforeImageSandbox(): string {
  if (!(fsTable as unknown as Record<symbol, boolean>)[PATCHED]) {
    for (const name of MAPPED_FNS) {
      const original = fsTable[name] as FsFn;
      fsTable[name] = function mapped(this: unknown, first: unknown, ...rest: unknown[]) {
        return original.call(this, mapBeforeImagePath(first), ...rest);
      };
    }
    (fsTable as unknown as Record<symbol, boolean>)[PATCHED] = true;
  }
  sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildo-before-image-'));
  return sandboxRoot;
}

/** Removes this file's sandbox root (a tmp path, never mapped). */
export function removeBeforeImageSandbox(): void {
  if (sandboxRoot === null) return;
  const root = sandboxRoot;
  sandboxRoot = null;
  fs.rmSync(root, { recursive: true, force: true });
}
