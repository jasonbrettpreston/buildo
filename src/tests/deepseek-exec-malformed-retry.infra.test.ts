// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.10
// Engine fence F1: a malformed tool call (unparsable JSON, unknown name, or
// args that fail schema validation) is RETRIED, not fatal — the engine
// ledgers MALFORMED_TOOL_CALL and feeds a role:'tool' error back to the model
// with the offending tool_call_id, then continues (bounded by the required
// policy key `malformed_tool_call_retry_max`, shipped value 2).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, rawToolTurn, stopTurn, writeBrief, ledgerRecords, cleanupTempDir, type Turn,
} from './helpers/deepseek-exec-harness';

const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
const retryMax: number = policy.malformed_tool_call_retry_max;

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

describe('F1: malformed tool call is retried, not fatal (Spec 08 §C.1.10)', () => {
  let repo = '';
  let ledgerDir = '';
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-f1-ledger-'));
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

  function run(client: unknown, briefRepo = repo) {
    return runEngine({ repoRoot: briefRepo, briefPath: writeBrief(briefRepo), provider: 'deepseek', ledgerDir, modelClient: client });
  }
  function malformedCount(records: Array<Record<string, unknown>>) {
    return records.filter((r) => r.kind === 'error' && r.code === 'MALFORMED_TOOL_CALL').length;
  }
  function toolCallOf(records: Array<Record<string, unknown>>, tool: string, index = 0) {
    return records.filter((r) => r.kind === 'tool_call' && r.tool === tool)[index] as
      { status?: string; error?: { code: string } } | undefined;
  }
  function toolMessages(messages: unknown[]) {
    return messages.filter((m) => (m as { role?: string }).role === 'tool') as Array<{ tool_call_id?: string; content?: unknown }>;
  }

  it('arm 1: an unparsable call is retried; the following good call still runs', async () => {
    const { seen, client } = capturingClient([
      rawToolTurn('m1', 'read_file', '{not json'),
      toolTurn('g1', 'read_file', { path: 'seed.txt', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(malformedCount(records)).toBe(1);
    expect(toolCallOf(records, 'read_file')?.status).toBe('ok');
    const msgs = toolMessages(seen[1] ?? []);
    const m1 = msgs.find((m) => m.tool_call_id === 'm1');
    expect(m1).toBeDefined();
    expect(String(m1?.content)).toContain('MALFORMED_TOOL_CALL');
  });

  it('arm 2: an unknown tool name is retried, not fatal, and never executes', async () => {
    const { client } = capturingClient([
      toolTurn('m1', 'bogus_tool', { reason: 'r' }),
      toolTurn('g1', 'read_file', { path: 'seed.txt', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(malformedCount(records)).toBe(1);
    expect(records.filter((r) => r.kind === 'tool_call' && r.tool === 'bogus_tool')).toHaveLength(0);
  });

  it('arm 3: args that fail schema validation are retried, not fatal', async () => {
    const { client } = capturingClient([
      toolTurn('m1', 'read_file', { reason: 'r' }),
      toolTurn('g1', 'read_file', { path: 'seed.txt', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(malformedCount(ledgerRecords(ledgerDir, res.run_id))).toBe(1);
  });

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'arm 3b: an inherited Object.prototype key (%s) is an unexpected argument — MALFORMED and retried, never an engine crash',
    async (key) => {
      const { client } = capturingClient([
        rawToolTurn('m1', 'read_file', JSON.stringify({ path: 'seed.txt', reason: 'r', [key]: 1 })),
        toolTurn('g1', 'read_file', { path: 'seed.txt', reason: 'r' }),
        stopTurn(),
      ]);
      const res = await run(client);
      expect(res.status).toBe('completed');
      const records = ledgerRecords(ledgerDir, res.run_id);
      expect(malformedCount(records)).toBe(1);
      expect(records.filter((r) => r.kind === 'tool_call')).toHaveLength(1);
    },
  );

  it('arm 4: retryMax+1 CONSECUTIVE malformed calls abort the run', async () => {
    const turns: Turn[] = [];
    for (let n = 0; n <= retryMax; n += 1) turns.push(rawToolTurn(`m${n}`, 'read_file', '{not json'));
    turns.push(stopTurn());
    const { client } = capturingClient(turns);
    const res = await run(client);
    expect(res.status).toBe('aborted');
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(malformedCount(records)).toBe(retryMax + 1);
    expect(records.filter((r) => r.kind === 'tool_call')).toHaveLength(0);
  });

  it('arm 5: a well-formed call resets the consecutive-malformed counter', async () => {
    const turns: Turn[] = [];
    for (let n = 0; n < retryMax; n += 1) turns.push(rawToolTurn(`m${n}`, 'read_file', '{not json'));
    turns.push(toolTurn('g1', 'read_file', { path: 'seed.txt', reason: 'r' }));
    for (let n = 0; n < retryMax; n += 1) turns.push(rawToolTurn(`n${n}`, 'read_file', '{not json'));
    turns.push(stopTurn());
    const { client } = capturingClient(turns);
    const res = await run(client);
    expect(res.status).toBe('completed');
    expect(malformedCount(ledgerRecords(ledgerDir, res.run_id))).toBe(2 * retryMax);
  });

  it('arm 6: within one turn, every malformed call still gets a tool-error reply', async () => {
    const turn: Turn = {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'm1', type: 'function', function: { name: 'read_file', arguments: '{not json' } },
          { id: 'g1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'seed.txt', reason: 'r' }) } },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      finish_reason: 'tool_calls',
    };
    const { seen, client } = capturingClient([turn, stopTurn()]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    const msgs = toolMessages(seen[1] ?? []);
    expect(String(msgs.find((m) => m.tool_call_id === 'm1')?.content)).toContain('MALFORMED_TOOL_CALL');
    expect(String(msgs.find((m) => m.tool_call_id === 'g1')?.content)).toContain('"ok":true');
  });

  it('arm 7: malformed_tool_call_retry_max is a REQUIRED policy key (shipped value 2)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { validatePolicyShape, PolicyInvalidError } = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
    const broken = { ...policy };
    delete broken.malformed_tool_call_retry_max;
    expect(() => validatePolicyShape(broken)).toThrow(PolicyInvalidError);
    try {
      validatePolicyShape(broken);
    } catch (err) {
      expect((err as { code?: string }).code).toBe('POLICY_INVALID');
      expect((err as Error).message).toContain('malformed_tool_call_retry_max');
    }
    expect(policy.malformed_tool_call_retry_max).toBe(2);
  });

  it('arm 8: a present-but-invalid malformed_tool_call_retry_max (negative, fractional, string) is POLICY_INVALID', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { validatePolicyShape } = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
    for (const bad of [-1, 1.5, '2', null]) {
      let code: string | undefined;
      try {
        validatePolicyShape({ ...policy, malformed_tool_call_retry_max: bad });
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code, `value ${JSON.stringify(bad)}`).toBe('POLICY_INVALID');
    }
    expect(() => validatePolicyShape({ ...policy, malformed_tool_call_retry_max: 0 })).not.toThrow();
  });
});
