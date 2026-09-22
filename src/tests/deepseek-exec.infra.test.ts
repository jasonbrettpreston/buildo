// SPEC LINK: docs/specs/00-architecture/08_agents.md §C
//
// Phase-1 locks for the DeepSeek Execution Engine (SUB-ENG-1). Every test
// drives `runEngine` with a TRANSCRIPT client (scripts/lib/exec-model.js) or
// a directly-injected `opts.modelClient` — no lock in this file makes a live
// API call, per §11.3 ("no lock may need a live API call").
//
// The throwaway-repo + transcript-client harness (GIT_*-scrubbed env,
// fail-closed temp-repo guard per tasks/lessons.md 2026-09-21, toolTurn/
// hookedClient/ledgerRecords helpers) is shared with
// src/tests/deepseek-exec-fences.infra.test.ts via
// src/tests/helpers/deepseek-exec-harness.ts (Phase 2 commit 6 extraction —
// same behavior, single definition, avoiding two copies of the same guard).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  makeRepo, scrubbedChildEnv, runEngine, resolveProvider, redact,
  toolTurn, rawToolTurn, hookedClient, writeBrief, ledgerRecords,
} from './helpers/deepseek-exec-harness';

describe('SUB-ENG-1 Phase 1 — deepseek-exec.js (Spec 08 §C)', () => {
  let repo = '';
  let ledgerDir = '';
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-ledger-'));
    savedEnv.EXECUTION_PROVIDER = process.env.EXECUTION_PROVIDER;
    savedEnv.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    delete process.env.EXECUTION_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
    if (ledgerDir) fs.rmSync(ledgerDir, { recursive: true, force: true });
    if (savedEnv.EXECUTION_PROVIDER === undefined) delete process.env.EXECUTION_PROVIDER;
    else process.env.EXECUTION_PROVIDER = savedEnv.EXECUTION_PROVIDER;
    if (savedEnv.DEEPSEEK_API_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = savedEnv.DEEPSEEK_API_KEY;
  });

  // ---------------------------------------------------------------------
  // Lock 1 — loop terminates on max_iterations
  // ---------------------------------------------------------------------
  it('lock 1: loop terminates on max_iterations — run_end.status === "budget_exhausted"', async () => {
    const briefPath = writeBrief(repo);
    const turns = Array.from({ length: 6 }, (_, i) => toolTurn(`c${i}`, 'grep_files', { pattern: 'seed', reason: 'probe' }));
    const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns, maxIterations: 3 });
    expect(summary.status).toBe('budget_exhausted');
    expect(summary.iterations).toBe(3);
    const records = ledgerRecords(ledgerDir, summary.run_id);
    const last = records[records.length - 1]!;
    expect(last.kind).toBe('run_end');
    expect(last.status).toBe('budget_exhausted');
  });

  // ---------------------------------------------------------------------
  // Lock 2 — malformed tool call aborts, no tool ever runs
  // ---------------------------------------------------------------------
  describe('lock 2: a malformed tool call aborts BEFORE any tool executes', () => {
    it('unknown tool name', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: [toolTurn('c1', 'bogus_tool', { reason: 'r' })] });
      expect(summary.status).toBe('aborted');
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(records.some((r) => r.kind === 'error' && r.code === 'MALFORMED_TOOL_CALL')).toBe(true);
      expect(records.some((r) => r.kind === 'tool_call')).toBe(false);
    });

    it('bad args — missing required field', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: [toolTurn('c1', 'read_file', { reason: 'r' })] });
      expect(summary.status).toBe('aborted');
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(records.some((r) => r.kind === 'error' && r.code === 'MALFORMED_TOOL_CALL')).toBe(true);
      expect(records.some((r) => r.kind === 'tool_call')).toBe(false);
    });

    it('unparsable JSON arguments', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: [rawToolTurn('c1', 'read_file', '{not json')] });
      expect(summary.status).toBe('aborted');
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(records.some((r) => r.kind === 'error' && r.code === 'MALFORMED_TOOL_CALL')).toBe(true);
      expect(records.some((r) => r.kind === 'tool_call')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // Lock 3 — write_file NOT_READ, both directions
  // ---------------------------------------------------------------------
  it('lock 3: write_file on an unread existing file is blocked NOT_READ (file unchanged); after read_file the same write succeeds (file changed)', async () => {
    const target = path.join(repo, 'seed.txt');
    const before = fs.readFileSync(target, 'utf8');
    const briefPath = writeBrief(repo);

    // Direction 1, in its OWN run: an unread write is blocked and the file
    // is provably unchanged (checked BEFORE any later write could land).
    const blockedSummary = await runEngine({
      repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
      transcriptTurns: [toolTurn('c1', 'write_file', { path: 'seed.txt', content: 'unauthorized\n', reason: 'r' })],
    });
    const blockedRecords = ledgerRecords(ledgerDir, blockedSummary.run_id) as Array<{ kind: string; tool?: string; status?: string; error?: { code: string } }>;
    const blockedCall = blockedRecords.find((r) => r.kind === 'tool_call')!;
    expect(blockedCall).toMatchObject({ tool: 'write_file', status: 'blocked', error: { code: 'NOT_READ' } });
    expect(fs.readFileSync(target, 'utf8')).toBe(before); // unchanged by the blocked write

    // Direction 2, a SEPARATE run: read_file then write_file succeeds.
    const ledgerDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-ledger3-'));
    const okSummary = await runEngine({
      repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir: ledgerDir2,
      transcriptTurns: [
        toolTurn('c2', 'read_file', { path: 'seed.txt', reason: 'r' }),
        toolTurn('c3', 'write_file', { path: 'seed.txt', content: 'authorized\n', reason: 'r' }),
      ],
    });
    const okRecords = ledgerRecords(ledgerDir2, okSummary.run_id) as Array<{ kind: string; tool?: string; status?: string }>;
    const okCall = okRecords.filter((r) => r.kind === 'tool_call')[1]!;
    expect(okCall).toMatchObject({ tool: 'write_file', status: 'ok' });
    expect(fs.readFileSync(target, 'utf8')).toBe('authorized\n'); // changed by the authorized write
    fs.rmSync(ledgerDir2, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------
  // Lock 4 — STALE
  // ---------------------------------------------------------------------
  it('lock 4: STALE — read, then mutate out-of-band, then write is blocked STALE', async () => {
    const target = path.join(repo, 'seed.txt');
    const briefPath = writeBrief(repo);
    const turns = [
      toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
      toolTurn('c2', 'write_file', { path: 'seed.txt', content: 'should not land\n', reason: 'r' }),
    ];
    const client = hookedClient(turns, { 1: () => fs.writeFileSync(target, 'tampered out of band\n') });
    const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, modelClient: client });
    const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string; error?: { code: string } }>;
    const writeCall = records.find((r) => r.kind === 'tool_call' && r.tool === 'write_file');
    expect(writeCall).toMatchObject({ status: 'blocked', error: { code: 'STALE' } });
    expect(fs.readFileSync(target, 'utf8')).toBe('tampered out of band\n');
  });

  // ---------------------------------------------------------------------
  // Lock 5 — edit_file AMBIGUOUS_MATCH / unique / replace_all
  // ---------------------------------------------------------------------
  it('lock 5: edit_file — AMBIGUOUS_MATCH blocked, a unique match succeeds, replace_all succeeds', async () => {
    const target = path.join(repo, 'multi.txt');
    fs.writeFileSync(target, 'aaa bbb aaa ccc\n');
    execFileSync('git', ['add', '-A'], { cwd: repo, env: scrubbedChildEnv() });
    execFileSync('git', ['commit', '-q', '-m', 'multi'], { cwd: repo, env: scrubbedChildEnv() });

    const briefPath = writeBrief(repo);
    const turns = [
      toolTurn('c1', 'read_file', { path: 'multi.txt', reason: 'r' }),
      toolTurn('c2', 'edit_file', { path: 'multi.txt', old_string: 'aaa', new_string: 'Z', reason: 'r' }), // ambiguous (2x)
      toolTurn('c3', 'edit_file', { path: 'multi.txt', old_string: 'bbb', new_string: 'X', reason: 'r' }), // unique
      toolTurn('c4', 'edit_file', { path: 'multi.txt', old_string: 'aaa', new_string: 'Z', replace_all: true, reason: 'r' }), // replace_all
    ];
    const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns });
    const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string; error?: { code: string } }>;
    const edits = records.filter((r) => r.kind === 'tool_call' && r.tool === 'edit_file');
    expect(edits[0]).toMatchObject({ status: 'blocked', error: { code: 'AMBIGUOUS_MATCH' } });
    expect(edits[1]).toMatchObject({ status: 'ok' });
    expect(edits[2]).toMatchObject({ status: 'ok' });
    expect(fs.readFileSync(target, 'utf8')).toBe('Z X Z ccc\n');
  });

  // ---------------------------------------------------------------------
  // Lock 6 — every tool call ledgered exactly once; seq gap-free
  // ---------------------------------------------------------------------
  it('lock 6: every tool call appears in the ledger exactly once; seq is gap-free', async () => {
    const briefPath = writeBrief(repo);
    const turns = [
      toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
      toolTurn('c2', 'grep_files', { pattern: 'seed', reason: 'r' }),
      toolTurn('c3', 'read_file', { path: 'does-not-exist.txt', reason: 'r' }),
      toolTurn('c4', 'run_bash_command', { argv: ['git', 'status', '--porcelain'], reason: 'r' }),
    ];
    const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns });
    const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; seq: number }>;
    const toolCallCount = records.filter((r) => r.kind === 'tool_call').length;
    expect(toolCallCount).toBe(turns.length);
    const seqs = records.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
  });

  // ---------------------------------------------------------------------
  // Lock 7 — run_bash_command pre/post, all four fields, equal for a read-only call
  // ---------------------------------------------------------------------
  it('lock 7: every run_bash_command record carries pre AND post with all four fields; an allowlisted "git status --porcelain" runs and post equals pre', async () => {
    const briefPath = writeBrief(repo);
    const summary = await runEngine({
      repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
      transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['git', 'status', '--porcelain'], reason: 'r' })],
    });
    const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string; pre?: Record<string, unknown>; post?: Record<string, unknown> }>;
    const call = records.find((r) => r.kind === 'tool_call' && r.tool === 'run_bash_command')!;
    expect(call.status).toBe('ok');
    for (const field of ['status_porcelain', 'status_sha256', 'diff_sha256', 'head_sha']) {
      expect(call.pre).toHaveProperty(field);
      expect(call.post).toHaveProperty(field);
    }
    expect(call.post).toEqual(call.pre);
  });

  // ---------------------------------------------------------------------
  // Lock 8 — FLAG_NOT_ALLOWED / COMMAND_NOT_ALLOWED
  // ---------------------------------------------------------------------
  it('lock 8: run_bash_command — an unallowlisted flag is FLAG_NOT_ALLOWED, an unallowlisted command is COMMAND_NOT_ALLOWED', async () => {
    const briefPath = writeBrief(repo);
    const turns = [
      toolTurn('c1', 'run_bash_command', { argv: ['npm', 'run', 'lint', '--', '--fix'], reason: 'r' }),
      toolTurn('c2', 'run_bash_command', { argv: ['rm', '-rf', 'x'], reason: 'r' }),
    ];
    const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns });
    const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string; error?: { code: string } }>;
    const calls = records.filter((r) => r.kind === 'tool_call');
    expect(calls[0]).toMatchObject({ status: 'blocked', error: { code: 'FLAG_NOT_ALLOWED' } });
    expect(calls[1]).toMatchObject({ status: 'blocked', error: { code: 'COMMAND_NOT_ALLOWED' } });
  });

  // ---------------------------------------------------------------------
  // Lock 9 — a ledger write failure aborts the run
  // ---------------------------------------------------------------------
  it('lock 9: a ledger write failure aborts the run', async () => {
    const briefPath = writeBrief(repo);
    // openLedger's own mkdirSync fails: a FILE already occupies the path the
    // ledger directory needs to be created at. The run must throw before it
    // can log run_start, let alone dispatch a tool.
    const blockerFile = path.join(ledgerDir, 'blocker');
    fs.writeFileSync(blockerFile, 'x');
    const badLedgerDir = path.join(blockerFile, 'nested'); // blockerFile is a FILE, not a dir

    await expect(runEngine({
      repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir: badLedgerDir,
      transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
    })).rejects.toThrow();

    // Also prove a THROWING append() (not just an unopenable directory)
    // aborts the run before any further ledger record is written, via the
    // opts.ledger test-only injection point.
    const goodLedgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-ledger2-'));
    let calls = 0;
    const throwingLedger = {
      path: path.join(goodLedgerDir, 'fake-run.jsonl'),
      append(record: { kind: string }) {
        calls += 1;
        if (calls === 1) return record; // let run_start through
        throw new Error('simulated ledger write failure');
      },
      close() {},
    };
    await expect(runEngine({
      repoRoot: repo, briefPath, provider: 'deepseek', ledger: throwingLedger,
      transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
    })).rejects.toThrow(/simulated ledger write failure/);
    fs.rmSync(goodLedgerDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------
  // Lock 10 — kill sentinel
  // ---------------------------------------------------------------------
  describe('lock 10: kill sentinel halts the run, zero tool calls after it', () => {
    it('sentinel present before the run starts — zero model turns, zero tool calls', async () => {
      fs.writeFileSync(path.join(ledgerDir, 'KILL'), '');
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      expect(summary.status).toBe('killed');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string }>;
      expect(records.some((r) => r.kind === 'kill')).toBe(true);
      expect(records.some((r) => r.kind === 'tool_call')).toBe(false);
      expect(records.some((r) => r.kind === 'model_turn')).toBe(false);
    });

    it('sentinel appears mid-run — the tool call before it lands, none after', async () => {
      const briefPath = writeBrief(repo);
      const turns = [
        toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
        toolTurn('c2', 'read_file', { path: 'seed.txt', reason: 'r' }),
      ];
      const client = hookedClient(turns, { 1: () => fs.writeFileSync(path.join(ledgerDir, 'KILL'), '') });
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, modelClient: client });
      expect(summary.status).toBe('killed');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string }>;
      expect(records.filter((r) => r.kind === 'tool_call')).toHaveLength(1); // only c1
      expect(records.some((r) => r.kind === 'kill')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Lock 11 — provider precedence and fallback
  // ---------------------------------------------------------------------
  describe('lock 11: provider precedence (--provider > EXECUTION_PROVIDER > default claude) and unknown-value fallback', () => {
    it('resolveProvider unit arms', () => {
      expect(resolveProvider('deepseek', 'claude')).toEqual({ provider: 'deepseek', provider_source: 'flag' });
      expect(resolveProvider(undefined, 'deepseek')).toEqual({ provider: 'deepseek', provider_source: 'env' });
      expect(resolveProvider(undefined, undefined)).toEqual({ provider: 'claude', provider_source: 'default' });
      const unknown = resolveProvider('bogus', undefined);
      expect(unknown.provider).toBe('claude');
      expect(unknown.provider_source.startsWith('fallback:')).toBe(true);
    });

    it('provider "claude" end-to-end: only run_start + run_end{delegated_to_claude}', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'claude', ledgerDir });
      expect(summary.status).toBe('delegated_to_claude');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; status?: string }>;
      expect(records).toHaveLength(2);
      expect(records[0]!.kind).toBe('run_start');
      expect(records[1]).toMatchObject({ kind: 'run_end', status: 'delegated_to_claude' });
    });

    it('unknown --provider value resolves to claude with provider_source starting "fallback:" end-to-end', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'not-a-real-provider', ledgerDir });
      expect(summary.status).toBe('delegated_to_claude');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; provider?: string; provider_source?: string }>;
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.provider).toBe('claude');
      expect(runStart.provider_source!.startsWith('fallback:')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Lock 12 — redact() unit arms + a live env secret never lands in the ledger
  // ---------------------------------------------------------------------
  describe('lock 12: redact() — every §C.1.5 pattern, plus a live DEEPSEEK_API_KEY never reaches the ledger', () => {
    it('sk- token', () => {
      const secret = 'sk-abcdefghijklmnopqrstuvwx';
      const out = redact(`token ${secret} end`);
      expect(out).not.toContain(secret);
      expect(out).toContain('[REDACTED]');
    });
    it('AIza (Google API key)', () => {
      const secret = `AIza${'A'.repeat(31)}`;
      const out = redact(`key=${secret}`);
      expect(out).not.toContain(secret);
    });
    it('gh[pousr]_ (GitHub token)', () => {
      const secret = `ghp_${'x'.repeat(36)}`;
      const out = redact(secret);
      expect(out).not.toContain(secret);
    });
    it('postgres(ql):// URL — only the password segment is redacted', () => {
      const out = redact('postgresql://user:supersecret@host:5432/db');
      expect(out).not.toContain('supersecret');
      expect(out).toBe('postgresql://user:[REDACTED]@host:5432/db');
    });
    it('key=value / key: "value" shapes (api_key, secret, token, password)', () => {
      expect(redact('api_key=abcdefgh12345')).not.toContain('abcdefgh12345');
      expect(redact('password: "abcdefgh1"')).not.toContain('abcdefgh1');
      expect(redact('SECRET_TOKEN=zzzzzzzzzzzz')).not.toContain('zzzzzzzzzzzz');
    });
    it('a ledger written with DEEPSEEK_API_KEY set in the env contains no sk-test substring anywhere', async () => {
      process.env.DEEPSEEK_API_KEY = 'sk-testtesttesttest1234';
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
          { message: { role: 'assistant', content: 'the key is sk-testtesttesttest1234, do not use it', tool_calls: [] }, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, finish_reason: 'stop' },
        ],
      });
      const raw = fs.readFileSync(path.join(ledgerDir, `${summary.run_id}.jsonl`), 'utf8');
      expect(raw).not.toContain('sk-test');
    });
  });
});
