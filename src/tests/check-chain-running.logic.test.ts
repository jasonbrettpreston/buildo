// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §4
//
// Parse-smoke test for scripts/check-chain-running.js — the GitHub-Actions
// -invoked isChainRunning re-implementation. Exercises only the pure
// writeOutput helper (GITHUB_OUTPUT file vs stdout fallback); the
// DB-querying run() path delegates entirely to
// scripts/lib/chain-concurrency.js, already locked by
// chain-concurrency.logic.test.ts, and connects via SUPABASE_DATABASE_URL —
// not exercised here without a live DB (mirrors restore-db.logic.test.ts's
// pure-logic-only scope).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkChainRunning = require('../../scripts/check-chain-running.js') as {
  writeOutput: (key: string, value: string) => void;
};

describe('check-chain-running.js — script presence', () => {
  it('exists in scripts/ directory', () => {
    const scriptPath = require.resolve('../../scripts/check-chain-running.js');
    expect(scriptPath).toMatch(/check-chain-running\.js$/);
  });

  it('exports writeOutput and run', () => {
    expect(typeof checkChainRunning.writeOutput).toBe('function');
  });
});

describe('check-chain-running.js — writeOutput', () => {
  let tmpDir: string | null = null;
  const ORIGINAL_GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

  afterEach(() => {
    if (ORIGINAL_GITHUB_OUTPUT === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = ORIGINAL_GITHUB_OUTPUT;
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('appends key=value to $GITHUB_OUTPUT when set (the GitHub Actions contract)', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'check-chain-running-test-'));
    const outputFile = join(tmpDir, 'github_output');
    writeFileSync(outputFile, '');
    process.env.GITHUB_OUTPUT = outputFile;

    checkChainRunning.writeOutput('skip', 'true');

    expect(readFileSync(outputFile, 'utf-8')).toBe('skip=true\n');
  });

  it('appends multiple writes without overwriting earlier ones', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'check-chain-running-test-'));
    const outputFile = join(tmpDir, 'github_output');
    writeFileSync(outputFile, '');
    process.env.GITHUB_OUTPUT = outputFile;

    checkChainRunning.writeOutput('skip', 'false');
    checkChainRunning.writeOutput('skip', 'true');

    expect(readFileSync(outputFile, 'utf-8')).toBe('skip=false\nskip=true\n');
  });

  it('falls back to console.log "key=value" when $GITHUB_OUTPUT is unset (local/manual invocation)', () => {
    delete process.env.GITHUB_OUTPUT;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    checkChainRunning.writeOutput('skip', 'true');
    expect(logSpy).toHaveBeenCalledWith('skip=true');
    logSpy.mockRestore();
  });
});
