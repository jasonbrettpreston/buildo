// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.2
// Engine fence F2 — write_file size guard: an overwrite of an EXISTING file
// that is already larger than the required policy key
// `write_file_max_existing_lines` (shipped 200) is BLOCKED with
// WRITE_TOO_LARGE_USE_EDIT, and an overwrite that would retain less than the
// required `write_file_min_retained_ratio` (shipped 0.5) of the existing
// file's bytes is BLOCKED with WRITE_SHRINK — both funnel the model to
// edit_file instead. A brand-new file is never subject to either check.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, writeBrief, ledgerRecords, cleanupTempDir, type Turn,
} from './helpers/deepseek-exec-harness';

const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
const maxLines: number = policy.write_file_max_existing_lines;
const ratio: number = policy.write_file_min_retained_ratio;

/** `lines(n)` — `n` numbered lines, newline-terminated (the shape
 * write_file's own content carries, so a same-line-count overwrite has
 * byte-identical conventions). */
function lines(n: number, tag = 'line'): string {
  return Array.from({ length: n }, (_, i) => `${tag} ${i}`).join('\n') + '\n';
}

describe('F2: write_file shrink guard (Spec 08 §C.2)', () => {
  let repo = '';
  let ledgerDir = '';

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-f2-ledger-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  function run(transcriptTurns: Turn[]) {
    return runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, transcriptTurns });
  }
  /** write the transcript in the engine's own conversation shape (read a
   * file first, then overwrite it) — the read_file is what makes the file
   * `existing` in the eyes of the fence. */
  function readThenWrite(name: string, content: string): Turn[] {
    return [
      toolTurn('r1', 'read_file', { path: name, reason: 'r' }),
      toolTurn('w1', 'write_file', { path: name, content, reason: 'r' }),
    ];
  }
  function toolCallOf(records: Array<Record<string, unknown>>, tool: string, index = 0) {
    return records.filter((r) => r.kind === 'tool_call' && r.tool === tool)[index] as
      { status?: string; error?: { code: string; detail?: Record<string, unknown> }; result_summary?: Record<string, unknown> } | undefined;
  }
  function seed(name: string, content: string) {
    fs.writeFileSync(path.join(repo, name), content);
  }

  it('arm 1: an EXISTING file bigger than max-exists lines blocks the overwrite (WRITE_TOO_LARGE_USE_EDIT)', async () => {
    const name = 'big.txt';
    const before = lines(maxLines + 50, 'old');
    seed(name, before);
    const res = await run(readThenWrite(name, lines(maxLines + 50, 'new')));
    const records = ledgerRecords(ledgerDir, res.run_id);
    const write = toolCallOf(records, 'write_file');
    expect(write?.status).toBe('blocked');
    expect(write?.error?.code).toBe('WRITE_TOO_LARGE_USE_EDIT');
    expect(fs.readFileSync(path.join(repo, name), 'utf8')).toBe(before);
    expect(write?.error?.detail?.old_lines).toBe(maxLines + 50);
    expect(res.blocked_total).toBeGreaterThanOrEqual(1);
  });

  it('arm 2: an EXISTING file of exactly max-exists lines is allowed to be overwritten', async () => {
    const name = 'edge.txt';
    seed(name, lines(maxLines, 'old'));
    const res = await run(readThenWrite(name, lines(maxLines, 'new')));
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(toolCallOf(records, 'write_file')?.status).toBe('ok');
  });

  it('arm 3: overwriting an existing file with a shrunk body blocks (WRITE_SHRINK)', async () => {
    const name = 'shrink.txt';
    const before = lines(100, 'line');
    seed(name, before);
    const res = await run(readThenWrite(name, lines(30, 'line')));
    const records = ledgerRecords(ledgerDir, res.run_id);
    const write = toolCallOf(records, 'write_file');
    expect(write?.status).toBe('blocked');
    expect(write?.error?.code).toBe('WRITE_SHRINK');
    expect(fs.readFileSync(path.join(repo, name), 'utf8')).toBe(before);
    expect(Number(write?.error?.detail?.old_bytes)).toBeGreaterThan(Number(write?.error?.detail?.new_bytes));
    expect(res.blocked_total).toBeGreaterThanOrEqual(1);
  });

  it('arm 4: overwriting an existing file with a small but admissible shrink is allowed', async () => {
    const name = 'ok-shrink.txt';
    const next = lines(60, 'line');
    seed(name, lines(100, 'line'));
    const res = await run(readThenWrite(name, next));
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(toolCallOf(records, 'write_file')?.status).toBe('ok');
    expect(fs.readFileSync(path.join(repo, name), 'utf8')).toBe(next);
  });

  it('arm 5: a brand-new file is never subject to either guard', async () => {
    const name = 'brand-new.txt';
    const content = lines(maxLines * 5, 'line');
    const res = await run([toolTurn('w1', 'write_file', { path: name, content, reason: 'r' })]);
    const records = ledgerRecords(ledgerDir, res.run_id);
    const write = toolCallOf(records, 'write_file');
    expect(write?.status).toBe('ok');
    expect((write?.result_summary as { created?: boolean } | undefined)?.created).toBe(true);
    expect(fs.readFileSync(path.join(repo, name), 'utf8')).toBe(content);
  });

  it('arm 6: edit_file is the unaffected path on the same oversized file', async () => {
    const name = 'edit.txt';
    seed(name, lines(maxLines + 50, 'line'));
    const res = await run([
      toolTurn('r1', 'read_file', { path: name, reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: name, old_string: 'line 3\n', new_string: 'LINE 3\n', reason: 'r' }),
    ]);
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(toolCallOf(records, 'edit_file')?.status).toBe('ok');
  });

  it('arm 7: the two keys are REQUIRED top-level policy keys (shipped 200 / 0.5)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { validatePolicyShape, PolicyInvalidError } = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
    expect(policy.write_file_max_existing_lines).toBe(200);
    expect(policy.write_file_min_retained_ratio).toBe(0.5);
    for (const key of ['write_file_max_existing_lines', 'write_file_min_retained_ratio']) {
      const broken = { ...policy };
      delete broken[key];
      expect(() => validatePolicyShape(broken), key).toThrow(PolicyInvalidError);
      try {
        validatePolicyShape(broken);
      } catch (err) {
        expect((err as { code?: string }).code, key).toBe('POLICY_INVALID');
        expect((err as Error).message, key).toContain(key);
      }
    }
  });

  it('arm 8: a present-but-invalid value for either key is POLICY_INVALID', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { validatePolicyShape } = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
    for (const bad of [0, 2.5, '200']) {
      let code: string | undefined;
      try {
        validatePolicyShape({ ...policy, write_file_max_existing_lines: bad });
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code, `max_lines ${JSON.stringify(bad)}`).toBe('POLICY_INVALID');
    }
    for (const bad of [-0.1, 1.5, '0.5']) {
      let code: string | undefined;
      try {
        validatePolicyShape({ ...policy, write_file_min_retained_ratio: bad });
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code, `ratio ${JSON.stringify(bad)}`).toBe('POLICY_INVALID');
    }
    expect(ratio).toBeLessThanOrEqual(1);
    expect(ratio).toBeGreaterThanOrEqual(0);
  });
});
