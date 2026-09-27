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
