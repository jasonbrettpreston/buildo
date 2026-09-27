// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.2
// Engine fence F3: every write_file/edit_file normalises line endings to LF
// before touching disk — `\r\n` and lone `\r` in model-supplied content are
// converted to `\n`. The tool result and the ledger `tool_call.result_summary`
// report how many `\r` characters were removed (`cr_normalized`). edit_file
// normalises `old_string`/`new_string` the same way and matches against the
// file's LF view; the written file keeps CRLF ONLY if the committed file was
// uniformly CRLF (every `\n` preceded by `\r`, no lone `\r`) — otherwise LF.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, runEngine, toolTurn, stopTurn, writeBrief, ledgerRecords, cleanupTempDir, type Turn,
} from './helpers/deepseek-exec-harness';

type ResultSummary = { cr_normalized?: number; eol?: string };
type ToolCallRecord = { status?: string; error?: { code: string }; result_summary?: ResultSummary };

const crCount = (s: string) => s.split('\r').length - 1;

function capturingClient(turns: Turn[]) {
  const seen: unknown[][] = [];
  let i = 0;
  return {
    seen,
    client: {
      async next(messages: unknown[]) {
        seen.push(JSON.parse(JSON.stringify(messages)));
        const t = turns[i];
        i += 1;
        return t ?? stopTurn();
      },
    },
  };
}

describe('F3: engine writes are LF (Spec 08 §C.2)', () => {
  let repo = '';
  let ledgerDir = '';
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-f3-ledger-'));
    savedEnv.EXECUTION_PROVIDER = process.env.EXECUTION_PROVIDER;
    savedEnv.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    delete process.env.EXECUTION_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
    if (savedEnv.EXECUTION_PROVIDER === undefined) delete process.env.EXECUTION_PROVIDER;
    else process.env.EXECUTION_PROVIDER = savedEnv.EXECUTION_PROVIDER;
    if (savedEnv.DEEPSEEK_API_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = savedEnv.DEEPSEEK_API_KEY;
  });

  function seed(name: string, text: string): void {
    fs.writeFileSync(path.join(repo, name), text);
  }
  function disk(name: string): string {
    return fs.readFileSync(path.join(repo, name), 'utf8');
  }
  function run(client: unknown) {
    return runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
  }
  function toolCallOf(records: Array<Record<string, unknown>>, tool: string, index = 0): ToolCallRecord | undefined {
    return records.filter((r) => r.kind === 'tool_call' && r.tool === tool)[index] as ToolCallRecord | undefined;
  }

  it('arm 1: write_file normalises CRLF + lone CR to LF and reports cr_normalized', async () => {
    const { client } = capturingClient([
      toolTurn('w1', 'write_file', { path: 'a.txt', content: 'a\r\nb\rc\n', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(disk('a.txt')).toBe('a\nb\nc\n');
    expect(crCount(disk('a.txt'))).toBe(0);
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(toolCallOf(records, 'write_file')?.status).toBe('ok');
    expect(toolCallOf(records, 'write_file')?.result_summary?.cr_normalized).toBe(2);
  });

  it('arm 2: write_file of already-LF content reports cr_normalized 0', async () => {
    const { client } = capturingClient([
      toolTurn('w1', 'write_file', { path: 'b.txt', content: 'x\ny\n', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(disk('b.txt')).toBe('x\ny\n');
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(toolCallOf(records, 'write_file')?.status).toBe('ok');
    expect(toolCallOf(records, 'write_file')?.result_summary?.cr_normalized).toBe(0);
  });

  it('arm 3: write_file over an existing LF file writes LF (no CR reaches disk)', async () => {
    seed('c.txt', '1\n2\n3\n');
    const { client } = capturingClient([
      toolTurn('r1', 'read_file', { path: 'c.txt', reason: 'r' }),
      toolTurn('w1', 'write_file', { path: 'c.txt', content: '1\r\n2\r\n3\r\n', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(crCount(disk('c.txt'))).toBe(0);
    expect(disk('c.txt')).toBe('1\n2\n3\n');
    expect(toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'write_file')?.result_summary?.cr_normalized).toBe(3);
  });

  it('arm 4: edit_file normalises old_string/new_string and matches on the LF view', async () => {
    seed('d.txt', 'x\ny\nz\n');
    const { client } = capturingClient([
      toolTurn('r1', 'read_file', { path: 'd.txt', reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: 'd.txt', old_string: 'x\r\ny', new_string: 'X\nY', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(disk('d.txt')).toBe('X\nY\nz\n');
    const summary = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'edit_file')?.result_summary;
    expect(summary?.cr_normalized).toBe(1);
    expect(summary?.eol).toBe('lf');
  });

  it('arm 5: edit_file new_string CRs are stripped before writing', async () => {
    seed('e.txt', 'p\nq\n');
    const { client } = capturingClient([
      toolTurn('r1', 'read_file', { path: 'e.txt', reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: 'e.txt', old_string: 'p', new_string: 'P\r\nP2', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(disk('e.txt')).toBe('P\nP2\nq\n');
    expect(toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'edit_file')?.result_summary?.cr_normalized).toBe(1);
  });

  it('arm 6: edit_file on a uniformly CRLF file writes the result back CRLF', async () => {
    seed('f.txt', 'a\r\nb\r\nc\r\n');
    const { client } = capturingClient([
      toolTurn('r1', 'read_file', { path: 'f.txt', reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: 'f.txt', old_string: 'a\nb', new_string: 'A\nB', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(disk('f.txt')).toBe('A\r\nB\r\nc\r\n');
    const summary = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'edit_file')?.result_summary;
    expect(summary?.eol).toBe('crlf');
  });

  it('arm 7: edit_file on a MIXED file (CRLF + LF + lone LF) writes LF', async () => {
    seed('g.txt', 'a\r\nb\nc\n');
    const { client } = capturingClient([
      toolTurn('r1', 'read_file', { path: 'g.txt', reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: 'g.txt', old_string: 'c', new_string: 'C', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(disk('g.txt')).toBe('a\nb\nC\n');
    const summary = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'edit_file')?.result_summary;
    expect(summary?.eol).toBe('lf');
  });

  it('arm 8: ambiguous match is detected against the NORMALISED old_string', async () => {
    seed('h.txt', 'k\nk\n');
    const { client } = capturingClient([
      toolTurn('r1', 'read_file', { path: 'h.txt', reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: 'h.txt', old_string: 'k\r\n', new_string: 'K\n', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    const call = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'edit_file');
    expect(call?.status).toBe('blocked');
    expect(call?.error?.code).toBe('AMBIGUOUS_MATCH');
    expect(disk('h.txt')).toBe('k\nk\n');
  });
});
