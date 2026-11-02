// SPEC LINK: MB-77 (c) — the review CLI's `--dry-run` / `--answer` wiring for the answer mode.
//
// Infra-level (spawns the real CLI, no network): `node scripts/deepseek-review.js review <file> --dry-run` must print
// ONE stdout line starting with the marker `DRY-RUN ` followed by JSON
// `{"messages":[{"role":"system","content":...},{"role":"user","content":...}]}` and exit 0 without calling the API.
// The test reads only that line: it never inspects the CLI's internals and never reads .env.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = 'scripts/deepseek-review.js';
const MARKER = 'DRY-RUN ';

/** One message of the dry-run JSON. */
type DryRunMessage = { role: string; content: string };

/** The parsed dry-run payload: system message first, then the user message. */
type DryRunPayload = { messages: DryRunMessage[] };

const tmpDirs: string[] = [];

/** A fresh temp directory, removed in afterEach. */
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb77-answer-mode-'));
  tmpDirs.push(dir);
  return dir;
}

/** Write `text` to a fresh temp file and return its path. */
function writeTempFile(text: string): string {
  const file = path.join(makeTmpDir(), 'sample.txt');
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

/** Spawn the CLI with a fixed environment (no .env is read by the test) and return stdout. */
function runCli(args: string[]): string {
  return execFileSync('node', [CLI, ...args], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, DEEPSEEK_API_KEY: 'test-key-not-real' } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Run the CLI with `--dry-run` and parse the single marked JSON line. */
function dryRun(file: string, extra: string[] = []): DryRunPayload {
  const stdout = runCli(['review', file, ...extra, '--dry-run']);
  const lines = stdout.split('\n').filter((line) => line.startsWith(MARKER));
  expect(lines.length).toBe(1);
  const parsed: unknown = JSON.parse((lines[0] ?? "").slice(MARKER.length));
  return parsed as DryRunPayload;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('MB-77 (c) fixes answer mode', () => {
  const fileText = 'const answer = 4.87; // the sample under review\n';
  let file: string;

  beforeEach(() => {
    file = writeTempFile(fileText);
  });

  it('review mode keeps the adversarial system prompt and the review suffix', () => {
    const payload = dryRun(file);
    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages.length).toBe(2);
    const system = payload.messages[0]!;
    const user = payload.messages[1]!;
    expect(system.role).toBe('system');
    expect(user.role).toBe('user');
    expect(system.content).toContain('ADVERSARIAL');
    expect(user.content).toContain(fileText);
    expect(user.content.endsWith('Review this code adversarially. Find what the author missed.')).toBe(true);
  });

  it('--answer sends answerSystemPrompt() with the file verbatim and no review wrapper', async () => {
    const P: Record<string, unknown> = (await import('../../scripts/analysis/mcproof/prompts.mjs')) as Record<string, unknown>;
    const answerSystemPrompt = P['answerSystemPrompt'] as (() => string) | undefined;
    expect(typeof answerSystemPrompt).toBe('function');
    const expectedSystem = String((answerSystemPrompt as () => string)());

    const payload = dryRun(file, ['--answer']);
    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages.length).toBe(2);
    const system = payload.messages[0]!;
    const user = payload.messages[1]!;
    expect(system.role).toBe('system');
    expect(user.role).toBe('user');
    expect(system.content).toBe(expectedSystem);
    expect(system.content).not.toContain('ADVERSARIAL');
    expect(system.content).not.toContain('adversarial');
    expect(user.content).toBe(fileText);
    expect(user.content).not.toContain('Review this code');
  });

  it('argument handling is unchanged: review with no file still exits non-zero', () => {
    expect(() => runCli(['review'])).toThrow();
  });
});
