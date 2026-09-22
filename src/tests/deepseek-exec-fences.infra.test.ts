// SPEC LINK: docs/specs/00-architecture/08_agents.md §C
//
// Phase-2 "safety fences" locks for the DeepSeek Execution Engine
// (SUB-ENG-1) — path confinement + allowlist hardening (commit 6),
// self-protection denylist (commit 7, G10/F11), secret fences (commit 8,
// G5), kill switch + budgets (commit 9, G6/G8), git_commit fences (commit
// 10, G9), and multi-worker isolation (commit 10b, F13/§C.6). Built
// incrementally: each commit adds its own arms to this one file so the full
// Phase-2 lock list lives in one place by commit 10, per the plan's phase
// description.
//
// Every test drives `runEngine` with a TRANSCRIPT client or a directly-
// injected `opts.modelClient`/`opts.ledger` — no lock in this file makes a
// live API call (§11.3). The throwaway-repo harness (GIT_*-scrubbed env,
// fail-closed temp-repo guard) is shared with deepseek-exec.infra.test.ts
// via src/tests/helpers/deepseek-exec-harness.ts.
//
// Tests must NOT depend on the real repo's husky hooks: the temp repo this
// suite creates has no `.husky`, so `git commit` there runs no hooks — the
// real-hook path is exercised by Phase 4's supervised pilot, not here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, runEngine, toolTurn, writeBrief, ledgerRecords,
} from './helpers/deepseek-exec-harness';

describe('SUB-ENG-1 Phase 2 — safety fences (Spec 08 §C)', () => {
  let repo = '';
  let ledgerDir = '';
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-fences-ledger-'));
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

  function toolCallOf(records: Array<Record<string, unknown>>, tool: string, index = 0) {
    return records.filter((r) => r.kind === 'tool_call' && r.tool === tool)[index] as
      { status?: string; error?: { code: string } } | undefined;
  }

  // =========================================================================
  // Commit 6 — path confinement + allowlist hardening
  // =========================================================================
  describe('commit 6: path confinement', () => {
    it('a directory junction inside the repo pointing OUTSIDE it is blocked reading through it (PATH_OUTSIDE_REPO)', async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-outside-'));
      fs.writeFileSync(path.join(outside, 'secret-outside.txt'), 'should never be read\n');
      const junctionPath = path.join(repo, 'escape-junction');
      fs.symlinkSync(outside, junctionPath, 'junction');

      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'escape-junction/secret-outside.txt', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const call = toolCallOf(records, 'read_file');
      expect(call).toMatchObject({ status: 'blocked', error: { code: 'PATH_OUTSIDE_REPO' } });
      fs.rmSync(outside, { recursive: true, force: true });
    });

    it('a legitimate path (no junction) still reads fine', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'read_file')).toMatchObject({ status: 'ok' });
    });
  });

  describe('commit 6: allowlist collision locks (§C.4 positional matching)', () => {
    const cases: Array<{ name: string; argv: string[]; code: string }> = [
      { name: 'git -C .. status --porcelain', argv: ['git', '-C', '..', 'status', '--porcelain'], code: 'COMMAND_NOT_ALLOWED' },
      { name: 'git --git-dir=../x/.git log', argv: ['git', '--git-dir=../x/.git', 'log'], code: 'COMMAND_NOT_ALLOWED' },
      { name: 'git log --output=x', argv: ['git', 'log', '--output=x'], code: 'FLAG_NOT_ALLOWED' },
      { name: 'npx vitest run ... --reporter=json --outputFile=o.json', argv: ['npx', 'vitest', 'run', 'src/x.test.ts', '--reporter=json', '--outputFile=o.json'], code: 'FLAG_NOT_ALLOWED' },
      { name: 'node step-validate.mjs --step=... --write', argv: ['node', 'scripts/analysis/step-validate.mjs', '--step=assert_data_bounds', '--write'], code: 'FLAG_NOT_ALLOWED' },
      { name: 'node scripts/deepseek-exec.js (not a validator)', argv: ['node', 'scripts/deepseek-exec.js'], code: 'COMMAND_NOT_ALLOWED' },
    ];
    for (const c of cases) {
      it(`${c.name} ⇒ blocked ${c.code}`, async () => {
        const briefPath = writeBrief(repo);
        const summary = await runEngine({
          repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: c.argv, reason: 'r' })],
        });
        const records = ledgerRecords(ledgerDir, summary.run_id);
        expect(toolCallOf(records, 'run_bash_command')).toMatchObject({ status: 'blocked', error: { code: c.code } });
      });
    }

    it('a legitimate "git status --porcelain" is still allowed', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['git', 'status', '--porcelain'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'run_bash_command')).toMatchObject({ status: 'ok' });
    });
  });

  describe('commit 6: Windows cmd.exe route — ARGV_UNSAFE_TOKEN', () => {
    it.runIf(process.platform === 'win32')('an npx argv token containing a cmd.exe metacharacter is blocked ARGV_UNSAFE_TOKEN', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['npx', 'vitest', 'run', 'src/a&calc.test.ts'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'run_bash_command')).toMatchObject({ status: 'blocked', error: { code: 'ARGV_UNSAFE_TOKEN' } });
    });

    it.runIf(process.platform === 'win32')('a normal npx path with no metacharacters is unaffected by the guard', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['npm', 'run', 'typecheck'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const call = toolCallOf(records, 'run_bash_command');
      expect(call?.status).not.toBe('blocked');
    });
  });
});
