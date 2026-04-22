// 🔗 SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §12.14 Diff narrator
//
// Tests the FAIL-OPEN behavior of scripts/diff-narrator.js. The narrator
// MUST never block a commit on its own — every error path must exit 0 with
// the commit message file unmodified.
//
// We exec the script as a child process to test the real fail-open
// branches without mocking the @google/genai SDK (which would only test
// the mock, not the script). Each test sets up an environment that
// triggers a specific failure and asserts the message file is untouched.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'diff-narrator.js');
const ORIGINAL_MSG = 'feat(00_engineering_standards): test commit\n';

let tmpFile = '';

function writeMsg(content: string): string {
  tmpFile = path.join(
    os.tmpdir(),
    `diff-narrator-test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  fs.writeFileSync(tmpFile, content, 'utf8');
  return tmpFile;
}

function runScript(opts: {
  diff: string;
  msgFile: string;
  env?: Record<string, string | undefined>;
  isolateCwd?: boolean;
}): { exitCode: number | null; messageAfter: string } {
  // When isolateCwd is set, run from a temp directory so the script's
  // dotenv.config() can't reload GEMINI_API_KEY from the repo's .env file.
  const cwd = opts.isolateCwd ? os.tmpdir() : undefined;
  const baseEnv = { ...process.env, ...opts.env };
  // spawnSync passes undefined values through as the literal string "undefined",
  // so we filter them out to actually unset.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === 'string') env[k] = v;
  }
  const result = spawnSync('node', [SCRIPT, opts.msgFile], {
    input: opts.diff,
    encoding: 'utf8',
    env: env as NodeJS.ProcessEnv,
    cwd,
    timeout: 30_000,
  });
  return {
    exitCode: result.status,
    messageAfter: fs.readFileSync(opts.msgFile, 'utf8'),
  };
}

afterEach(() => {
  if (tmpFile && fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
  tmpFile = '';
});

describe('diff-narrator — fail-open contract', () => {
  it('exits 0 + leaves message untouched when no GEMINI_API_KEY is set', () => {
    const msgFile = writeMsg(ORIGINAL_MSG);
    const result = runScript({
      diff: 'diff --git a/foo b/foo\n+something',
      msgFile,
      env: { GEMINI_API_KEY: undefined },
      isolateCwd: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.messageAfter).toBe(ORIGINAL_MSG);
  });

  it('exits 0 + leaves message untouched when stdin diff is empty', () => {
    const msgFile = writeMsg(ORIGINAL_MSG);
    const result = runScript({
      diff: '',
      msgFile,
      // GEMINI_API_KEY may or may not be present — the empty-diff guard
      // runs before the API call, so this passes regardless.
    });
    expect(result.exitCode).toBe(0);
    expect(result.messageAfter).toBe(ORIGINAL_MSG);
  });

  it('exits 0 + leaves message untouched when the message file does not exist', () => {
    const result = spawnSync(
      'node',
      [SCRIPT, '/nonexistent/path/COMMIT_EDITMSG'],
      {
        input: 'diff --git a/foo b/foo\n+x',
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(result.status).toBe(0);
  });

  it('exits 0 when no message file path is passed at all', () => {
    const result = spawnSync('node', [SCRIPT], {
      input: '',
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
  });

  it('does not double-append when the narrator footer already exists', () => {
    // Pre-populate the file with a footer marker. The script should detect
    // it and exit 0 without re-running the API call.
    const withFooter = `${ORIGINAL_MSG}\n--- diff narrator (BUILDO_DIFF_NARRATOR=1) ---\nold summary\n`;
    const msgFile = writeMsg(withFooter);
    const result = runScript({
      diff: 'diff --git a/foo b/foo\n+x',
      msgFile,
      // Even if GEMINI_API_KEY were set, the footer-detect path runs
      // before the API call.
    });
    expect(result.exitCode).toBe(0);
    expect(result.messageAfter).toBe(withFooter);
  });
});
