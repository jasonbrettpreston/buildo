// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.5
// engine hardening G1–G4 (DeepSeek security lens, 2026-09-27).
//
// Four independent red-first locks against the SUB-ENG-1 engine:
//   G1  assistant tool_calls re-fed to the model on the NEXT turn must be
//       redacted, not echoed raw (§C.1.5).
//   G2  --transcript must resolve inside the repo — TRANSCRIPT_OUTSIDE_REPO
//       (the F-DS13 BRIEF_OUTSIDE_REPO pattern, mirrored).
//   G3  a provider turn with NO message key is a ledgered MALFORMED_MODEL_TURN
//       error and is retried under the F1 counter, never a rejected promise.
//   G4  every scrubbedEnv(...) child-env call in scripts/lib/exec-tools.js
//       names 'DEEPSEEK_' (Spec 08 F-II6), statically, at the source.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, stopTurn, writeBrief, ledgerRecords, cleanupTempDir, type Turn,
} from './helpers/deepseek-exec-harness';

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

describe('G1: tool-call arguments re-fed to the model are redacted (§C.1.5)', () => {
  let repo = '';
  let ledgerDir = '';

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-g1-ledger-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  it('the assistant message echoing a secret-bearing tool_call is redacted before the next turn (§C.1.5)', async () => {
    const SECRET = 'sk-' + 'a'.repeat(24);
    const { seen, client } = capturingClient([
      toolTurn('c1', 'read_file', { path: 'seed.txt', reason: `note ${SECRET}` }),
      stopTurn(),
    ]);

    const res = await runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });

    // Turn 2's message history must not leak the secret back into the model context.
    const history = seen[1] ?? [];
    const assistantWithCalls = history.filter(
      (m) => (m as { role?: string }).role === 'assistant' && (m as { tool_calls?: unknown[] }).tool_calls,
    );
    expect(assistantWithCalls.length).toBeGreaterThan(0);
    for (const m of assistantWithCalls) {
      const serialized = JSON.stringify(m);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).toContain('[REDACTED]');
    }

    // The call itself still executed against the RAW args — redaction is a
    // transport-layer concern, not an execution-layer one.
    const records = ledgerRecords(ledgerDir, res.run_id);
    const readCall = records.find((r) => r.kind === 'tool_call' && r.tool === 'read_file') as { status?: string } | undefined;
    expect(readCall?.status).toBe('ok');
  });
});

describe('G2: --transcript must resolve inside the repo (TRANSCRIPT_OUTSIDE_REPO)', () => {
  let repo = '';
  let ledgerDir = '';
  let outside = '';

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-g2-ledger-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-outside-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
    cleanupTempDir(outside);
  });

  it('(a) an absolute --transcript path OUTSIDE the repo root throws TRANSCRIPT_OUTSIDE_REPO', async () => {
    const outsidePath = path.join(outside, 'transcript.json');
    fs.writeFileSync(outsidePath, '[]');
    await expect(
      runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, transcript: outsidePath }),
    ).rejects.toThrow(/TRANSCRIPT_OUTSIDE_REPO/);
  });

  it('(a) a `../`-laced relative --transcript path that escapes the repo throws TRANSCRIPT_OUTSIDE_REPO', async () => {
    // A relative path is joined against repoRoot; enough `..` segments climb
    // out of the throwaway repo regardless of the OS temp layout.
    const escaping = ['..', '..', '..', '..', 'transcript-escape.json'].join('/');
    await expect(
      runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, transcript: escaping }),
    ).rejects.toThrow(/TRANSCRIPT_OUTSIDE_REPO/);
  });

  it('(b) the refused run writes no ledger file — the fence fires before any ledger record', async () => {
    const outsidePath = path.join(outside, 'transcript.json');
    fs.writeFileSync(outsidePath, '[]');
    await expect(
      runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, transcript: outsidePath }),
    ).rejects.toThrow(/TRANSCRIPT_OUTSIDE_REPO/);
    const ledgers = fs.readdirSync(ledgerDir).filter((f) => f.endsWith('.jsonl'));
    expect(ledgers).toEqual([]);
  });

  it('(c) green direction: a repo-relative transcript inside the repo resolves and the run completes', async () => {
    fs.writeFileSync(path.join(repo, 'transcript.json'), JSON.stringify([toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }), stopTurn()]));
    const res = await runEngine({
      repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, transcript: 'transcript.json',
    });
    expect(res.status).toBe('completed');
    // the recorded turn was actually replayed from the file
    const readCall = ledgerRecords(ledgerDir, res.run_id).find((r) => r.kind === 'tool_call' && r.tool === 'read_file') as { status?: string } | undefined;
    expect(readCall?.status).toBe('ok');
  });
});

// G3 counts against the F1 allowance (malformed_tool_call_retry_max).
const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
const retryMax: number = policy.malformed_tool_call_retry_max;

describe('G3: a provider turn with no message is a ledgered error, retried per the F1 counter', () => {
  let repo = '';
  let ledgerDir = '';

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-g3-ledger-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  // A turn shaped like a real completion but with the `message` key absent —
  // a provider contract violation the engine must survive, not crash on.
  const messageLessTurn = () => ({
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    finish_reason: 'stop',
  }) as unknown as Turn;

  function customClient(turns: Array<Turn | null>) {
    let i = 0;
    return {
      async next() {
        if (i >= turns.length) return stopTurn();
        const t = turns[i];
        i += 1;
        return t as Turn;
      },
    };
  }
  function malformedModelCount(records: Array<Record<string, unknown>>) {
    return records.filter((r) => r.kind === 'error' && r.code === 'MALFORMED_MODEL_TURN').length;
  }
  function run(client: unknown) {
    return runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
  }

  it('(a) one message-less turn is ledgered and retried; the following good call still runs', async () => {
    const client = customClient([
      messageLessTurn(),
      toolTurn('g1', 'read_file', { path: 'seed.txt', reason: 'r' }),
      stopTurn(),
    ]);
    const res = await run(client);
    expect(res.status).toBe('completed');
    const records = ledgerRecords(ledgerDir, res.run_id);
    expect(malformedModelCount(records)).toBe(1);
    const readCall = records.find((r) => r.kind === 'tool_call' && r.tool === 'read_file') as { status?: string } | undefined;
    expect(readCall?.status).toBe('ok');
  });

  it('(b) retryMax+1 CONSECUTIVE message-less turns abort the run', async () => {
    const turns: Array<Turn | null> = [];
    for (let n = 0; n <= retryMax; n += 1) turns.push(messageLessTurn());
    turns.push(stopTurn());
    const res = await run(customClient(turns));
    expect(res.status).toBe('aborted');
    expect(malformedModelCount(ledgerRecords(ledgerDir, res.run_id))).toBe(retryMax + 1);
  });

  it('(c) a `null` turn is ledgered as MALFORMED_MODEL_TURN, retried, and the run completes', async () => {
    const res = await run(customClient([null, stopTurn()]));
    expect(res.status).toBe('completed');
    expect(malformedModelCount(ledgerRecords(ledgerDir, res.run_id))).toBe(1);
  });
});

describe('G4: grep_files child env scrubs DEEPSEEK_* (Spec 08 F-II6)', () => {
  it('every scrubbedEnv(...) call in scripts/lib/exec-tools.js names DEEPSEEK_', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'), 'utf8');
    const calls = [...source.matchAll(/scrubbedEnv\(([^)]*)\)/g)];
    expect(calls.length, 'expected at least 3 scrubbedEnv(...) call sites in exec-tools.js').toBeGreaterThanOrEqual(3);
    for (const call of calls) {
      const argText = (call[1] ?? '').trim();
      expect(
        argText.includes("'DEEPSEEK_'"),
        `scrubbedEnv(${argText}) in scripts/lib/exec-tools.js does not scrub the DEEPSEEK_ env prefix (Spec 08 F-II6)`,
      ).toBe(true);
    }
  });
});

// L17 round 2 (3d) — a registered NON-vendor secret (no sk-/AIza/gh*_ shape,
// so only the real-value registry can catch it) placed in a tool_call
// argument AND in a tool result never reaches the model.
describe('G1b: a non-vendor real secret is masked in re-fed args and tool results (§C.1.5, L17)', () => {
  let repo = '';
  let ledgerDir = '';
  let savedSecret: string | undefined;
  beforeEach(() => {
    savedSecret = process.env.X_SECRET;
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-g1b-ledger-'));
  });
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.X_SECRET; else process.env.X_SECRET = savedSecret;
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  it('X_SECRET in a read_file reason and in the file content is absent from seen[1]', async () => {
    const SECRET = 'xs3cret-Value-9876-QQ';
    process.env.X_SECRET = SECRET;
    fs.writeFileSync(path.join(repo, 'carrier.txt'), `value=${SECRET}\n`);
    const { seen, client } = capturingClient([
      toolTurn('c1', 'read_file', { path: 'carrier.txt', reason: `check ${SECRET}` }),
      stopTurn(),
    ]);
    await runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
    const serialized = JSON.stringify(seen[1] ?? []);
    expect(serialized).toContain('carrier.txt');
    expect(serialized).not.toContain(SECRET);
    expect(serialized).toContain('[REDACTED]');
  });
});
