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
import { execFileSync } from 'node:child_process';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, multiToolTurn, writeBrief, ledgerRecords, scrubbedChildEnv,
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

  // A minimal npm-runnable fixture: `npm run test` (allowlisted) runs
  // `node sleep.js`, which writes its own pid immediately, sleeps `ms`, then
  // (only if never killed) writes a "done" marker and exits. Shared by the
  // commit 9 timeout/budget arms below.
  function writeSleepFixture(dir: string, ms: number): void {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'sleep-fixture', version: '1.0.0', scripts: { test: 'node sleep.js' } }));
    fs.writeFileSync(
      path.join(dir, 'sleep.js'),
      `const fs=require('fs');const path=require('path');const dir=__dirname;` +
      `fs.writeFileSync(path.join(dir,'sleep.pid'),String(process.pid));` +
      `setTimeout(()=>{fs.writeFileSync(path.join(dir,'sleep.done'),'done');process.exit(0);},${ms});`,
    );
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
    const cases: Array<{ name: string; argv: string[]; codes: string[] }> = [
      { name: 'git -C .. status --porcelain', argv: ['git', '-C', '..', 'status', '--porcelain'], codes: ['COMMAND_NOT_ALLOWED'] },
      { name: 'git --git-dir=../x/.git log', argv: ['git', '--git-dir=../x/.git', 'log'], codes: ['COMMAND_NOT_ALLOWED'] },
      { name: 'git log --output=x', argv: ['git', 'log', '--output=x'], codes: ['FLAG_NOT_ALLOWED'] },
      { name: 'npx vitest run ... --reporter=json --outputFile=o.json', argv: ['npx', 'vitest', 'run', 'src/x.test.ts', '--reporter=json', '--outputFile=o.json'], codes: ['FLAG_NOT_ALLOWED'] },
      { name: 'node step-validate.mjs --step=... --write', argv: ['node', 'scripts/analysis/step-validate.mjs', '--step=assert_data_bounds', '--write'], codes: ['FLAG_NOT_ALLOWED'] },
      // As of commit 7, the self-protection scan (§C.1.4) runs BEFORE the
      // allowlist and catches this specific path first — PATH_DENIED is the
      // MORE specific, correct code once that fence exists; COMMAND_NOT_ALLOWED
      // is what commit 6 alone would have produced. Both directions still
      // prove "blocked", which is this arm's actual contract.
      { name: 'node scripts/deepseek-exec.js (not a validator)', argv: ['node', 'scripts/deepseek-exec.js'], codes: ['COMMAND_NOT_ALLOWED', 'PATH_DENIED'] },
    ];
    for (const c of cases) {
      it(`${c.name} ⇒ blocked (${c.codes.join(' or ')})`, async () => {
        const briefPath = writeBrief(repo);
        const summary = await runEngine({
          repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: c.argv, reason: 'r' })],
        });
        const records = ledgerRecords(ledgerDir, summary.run_id);
        const call = toolCallOf(records, 'run_bash_command');
        expect(call?.status).toBe('blocked');
        expect(c.codes).toContain(call?.error?.code);
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

  // =========================================================================
  // Commit 7 — self-protection denylist in the tool layer (G10, F11)
  // =========================================================================
  describe('commit 7: self-protection denylist (G10, F11) — the RED-first trio', () => {
    it('write_file("scripts/lib/exec-policy.json") is blocked PATH_DENIED', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'scripts/lib/exec-policy.json', content: '{}', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'PATH_DENIED' } });
      expect(fs.existsSync(path.join(repo, 'scripts', 'lib', 'exec-policy.json'))).toBe(false);
    });

    it('write_file("scripts/deepseek-exec.js") is blocked PATH_DENIED', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'scripts/deepseek-exec.js', content: '// tampered', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'PATH_DENIED' } });
      expect(fs.existsSync(path.join(repo, 'scripts', 'deepseek-exec.js'))).toBe(false);
    });

    it('a bash argv naming a file inside the ledger dir is blocked, and the ledger dir is untouched', async () => {
      const briefPath = writeBrief(repo);
      const before = fs.readdirSync(ledgerDir).sort();
      // A run that names its OWN ledger dir's (future) file path in an
      // otherwise-plausible git argv — the run_id is not known ahead of the
      // call, so a synthetic sibling file under the same ledger dir proves
      // the same fence (the block is by DIRECTORY, not by exact filename).
      const targetInLedgerDir = path.join(ledgerDir, 'some-other-run.jsonl');
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['git', 'diff', '--', targetInLedgerDir], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const call = toolCallOf(records, 'run_bash_command');
      expect(call?.status).toBe('blocked');
      expect(['PATH_DENIED', 'PATH_OUTSIDE_REPO']).toContain(call?.error?.code);
      const after = fs.readdirSync(ledgerDir).sort();
      // The blocked command never ran, so the ONLY change to ledgerDir is
      // this run's own ledger file landing — nothing named by the blocked
      // argv was created, read into, or otherwise touched.
      expect(after.filter((f) => !before.includes(f))).toEqual([`${summary.run_id}.jsonl`]);
    });
  });

  describe('commit 7: self-protection — the legitimate path still works', () => {
    it('write_file to an ordinary repo file (not on the denylist) still succeeds', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'ordinary.txt', content: 'fine\n', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'ok' });
      expect(fs.readFileSync(path.join(repo, 'ordinary.txt'), 'utf8')).toBe('fine\n');
    });
  });

  describe('commit 7: exec-ledger.js static-source lock — no truncate/unlink/rename/writeFileSync path', () => {
    // Strips /** */ and // comments before scanning (tasks/lessons.md,
    // 2026-09-10 "the scanner cannot tell prose from code" — exec-ledger.js's
    // own docblock names these five identifiers IN PROSE to explain the
    // lock, e.g. "contains NO truncate ... or writeFileSync call", which a
    // naive regex-over-the-whole-file scan would misread as the code it
    // forbids. \r?\n handles a CRLF checkout (tasks/lessons.md WD-1).
    function stripComments(src: string): string {
      return src.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    }
    it('the ledger module CODE (comments stripped) contains none of the five identifiers', () => {
      const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', 'exec-ledger.js'), 'utf8');
      expect(/truncate|unlinkSync|rmSync|renameSync|writeFileSync|'w'/.test(stripComments(src))).toBe(false);
    });
    it('sanity: the raw (unstripped) source DOES mention these identifiers in its own docblock — proves the strip is load-bearing, not vacuous', () => {
      const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', 'exec-ledger.js'), 'utf8');
      expect(/truncate|writeFileSync/.test(src)).toBe(true);
    });
  });

  // =========================================================================
  // Commit 8 — secret fences: read deny + redaction before prompt and ledger (G5)
  // =========================================================================
  describe('commit 8: secret read-deny', () => {
    it('read_file(".env") is blocked SECRET_DENIED; read_file("package.json") is allowed', async () => {
      fs.writeFileSync(path.join(repo, '.env'), 'DEEPSEEK_API_KEY=sk-shouldneverbereadatall12\n');
      fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"throwaway"}\n');
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'read_file', { path: '.env', reason: 'r' }),
          toolTurn('c2', 'read_file', { path: 'package.json', reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const reads = records.filter((r) => r.kind === 'tool_call' && r.tool === 'read_file') as Array<{ status?: string; error?: { code: string } }>;
      expect(reads[0]).toMatchObject({ status: 'blocked', error: { code: 'SECRET_DENIED' } });
      expect(reads[1]).toMatchObject({ status: 'ok' });
    });

    it('grep_files over a repo containing .env with a live-shaped key returns zero MATCHES from it (checked at the tool-result level, not the ledger — result_summary only carries a count)', async () => {
      fs.writeFileSync(path.join(repo, '.env'), 'DEEPSEEK_API_KEY=sk-thisshouldneverbegrepped1\n');
      fs.writeFileSync(path.join(repo, 'findme.txt'), 'DEEPSEEK_API_KEY appears in findme.txt too\n');
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly, below the engine loop
      const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      const fakeLedger = { path: path.join(ledgerDir, 'unit.jsonl'), append: () => {}, close: () => {} };
      const tools = createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState: { readState: {} } });
      const outcome = await tools.dispatch('grep_files', { pattern: 'DEEPSEEK_API_KEY', reason: 'r' });
      expect(outcome.toolResult.ok).toBe(true);
      const paths = (outcome.toolResult.matches as Array<{ path: string }>).map((m) => m.path);
      expect(paths).not.toContain('.env');
      expect(paths).toContain('findme.txt');
    });

    it('write_file/edit_file to a secret-denied path are blocked SECRET_DENIED (both tools)', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'secrets/creds.pem', content: 'nope', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'SECRET_DENIED' } });
      expect(fs.existsSync(path.join(repo, 'secrets', 'creds.pem'))).toBe(false);
    });
  });

  describe('commit 8: redact() reaches everything the model can see', () => {
    it('a turn that both writes a secret-embedding file AND narrates the secret in its own text: zero occurrences of the raw secret anywhere in the ledger, and the narration is [REDACTED]', async () => {
      const secret = 'sk-abcdefghijklmnopqrstuvwx';
      const briefPath = writeBrief(repo);
      const writeTurn = {
        message: {
          role: 'assistant' as const,
          // write_file's OWN args.content is stored as {bytes,sha256} (§C.3)
          // — never raw text — so the meaningful redaction surface for THIS
          // turn is the assistant's own accompanying narration, which is a
          // plain string that DOES pass through redact() verbatim.
          content: `about to write the key ${secret} to a file`,
          tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'write_file', arguments: JSON.stringify({ path: 'ordinary2.txt', content: `token ${secret} end`, reason: 'r' }) } }],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        finish_reason: 'tool_calls',
      };
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: [writeTurn] });
      const raw = fs.readFileSync(path.join(ledgerDir, `${summary.run_id}.jsonl`), 'utf8');
      expect(raw).not.toContain(secret);
      expect(raw).toContain('[REDACTED]');
    });

    it('a live DEEPSEEK_API_KEY set in the env never appears anywhere in the ledger file, including a distinct literal value', async () => {
      process.env.DEEPSEEK_API_KEY = 'sk-livekeylivekeylivekey';
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
          { message: { role: 'assistant', content: 'the key is sk-livekeylivekeylivekey, never print it', tool_calls: [] }, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, finish_reason: 'stop' },
        ],
      });
      const raw = fs.readFileSync(path.join(ledgerDir, `${summary.run_id}.jsonl`), 'utf8');
      expect(raw).not.toContain('livekey');
    });
  });

  // =========================================================================
  // Commit 9 — kill switch + budgets in a LIVE loop (G6/G8)
  // =========================================================================
  describe('commit 9: kill switch mid-turn (multiple tool calls in ONE model turn)', () => {
    it('a transcript turn with 3 tool calls, sentinel created right after the 1st ledger record lands: exactly 1 tool_call record, one kill record, run_end.status === "killed"', async () => {
      const briefPath = writeBrief(repo);
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS ledger writer directly
      const { openLedger } = require(path.join(REPO_ROOT, 'scripts/lib/exec-ledger.js'));
      const runId = `kill-mid-turn-${Date.now()}`;
      const realLedger = openLedger({ ledgerDir, runId });
      let toolCallCount = 0;
      // opts.ledger is the same test-only injection point Phase 1's lock 9
      // uses to prove "a ledger write failure aborts the run" — here it lets
      // this test drop the KILL sentinel deterministically, right after the
      // FIRST tool_call record lands and BEFORE the loop's next kill check,
      // rather than racing a real background process against the engine.
      const wrappedLedger = {
        path: realLedger.path,
        append(record: { kind: string }) {
          const written = realLedger.append(record);
          if (written.kind === 'tool_call') {
            toolCallCount += 1;
            if (toolCallCount === 1) {
              fs.writeFileSync(path.join(ledgerDir, `${runId}.kill`), '');
            }
          }
          return written;
        },
        close() { realLedger.close(); },
      };
      const turn = multiToolTurn([
        { id: 'c1', name: 'read_file', args: { path: 'seed.txt', reason: 'r' } },
        { id: 'c2', name: 'read_file', args: { path: 'seed.txt', reason: 'r' } },
        { id: 'c3', name: 'read_file', args: { path: 'seed.txt', reason: 'r' } },
      ]);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', runId, ledger: wrappedLedger, transcriptTurns: [turn] });
      expect(summary.status).toBe('killed');
      const records = ledgerRecords(ledgerDir, runId);
      expect(records.filter((r) => r.kind === 'tool_call')).toHaveLength(1);
      expect(records.some((r) => r.kind === 'kill')).toBe(true);
      fs.rmSync(path.join(ledgerDir, `${runId}.jsonl`), { force: true });
      fs.rmSync(path.join(ledgerDir, `${runId}.kill`), { force: true });
    });
  });

  describe('commit 9: kill switch — CLI process-level exit code', () => {
    it('a KILL sentinel present before the run starts makes the real CLI process exit non-zero', () => {
      const briefPath = writeBrief(repo);
      const transcriptPath = path.join(repo, 'transcript.json');
      fs.writeFileSync(transcriptPath, JSON.stringify([]));
      fs.writeFileSync(path.join(ledgerDir, 'KILL'), '');
      const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
      let exitCode = 0;
      try {
        execFileSync(process.execPath, [cliPath, '--brief', briefPath, '--provider=deepseek', '--transcript', transcriptPath, '--ledger-dir', ledgerDir], {
          cwd: repo, env: scrubbedChildEnv(), stdio: 'pipe',
        });
      } catch (err) {
        exitCode = (err as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
      fs.rmSync(path.join(ledgerDir, 'KILL'), { force: true });
    });
  });

  describe('commit 9: budgets — max_total_tokens', () => {
    it('usage_total.total_tokens exceeding max_total_tokens ends the run budget_exhausted', async () => {
      const briefPath = writeBrief(repo);
      const turns = [
        toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
        toolTurn('c2', 'read_file', { path: 'seed.txt', reason: 'r' }),
      ].map((t) => ({ ...t, usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 } }));
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns, maxTotalTokens: 150,
      });
      expect(summary.status).toBe('budget_exhausted');
      expect(summary.usage_total.total_tokens).toBeGreaterThan(150);
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(records[records.length - 1]).toMatchObject({ kind: 'run_end', status: 'budget_exhausted' });
    });
  });

  describe('commit 9: budgets — timeout_ms clamped to timeout_ceiling_ms, never rejected', () => {
    it('a requested timeout_ms far beyond the ceiling is CLAMPED to the ceiling (not rejected) — proven via a custom policy + a direct tool dispatch', async () => {
      writeSleepFixture(repo, 30000); // sleeps far longer than the clamped ceiling below
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly, below the engine loop
      const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const realPolicy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      const policy = { ...realPolicy, limits: { ...realPolicy.limits, timeout_ceiling_ms: 700 } };
      const fakeLedger = { path: path.join(ledgerDir, 'clamp-unit.jsonl'), append: () => {}, close: () => {} };
      const tools = createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState: { readState: {} } });
      const startedAt = Date.now();
      const outcome = await tools.dispatch('run_bash_command', { argv: ['npm', 'run', 'test'], timeout_ms: 999999999, reason: 'r' });
      const elapsedMs = Date.now() - startedAt;
      // Requested a timeout ~1.4M times the ceiling; the call is neither
      // rejected outright (it DID spawn) nor does it wait the full 30s the
      // fixture sleeps — it is killed around the 700ms ceiling.
      expect(outcome.toolResult.error?.code).toBe('TIMEOUT');
      expect(elapsedMs).toBeLessThan(15000);
      expect(fs.existsSync(path.join(repo, 'sleep.done'))).toBe(false);
    }, 20000);
  });

  describe('commit 9: budgets — a bash command exceeding its timeout is killed, and the child is gone afterwards', () => {
    it('run_bash_command with timeout_ms:500 against a 30s sleep fixture: TIMEOUT, and the sleep process is no longer running', async () => {
      writeSleepFixture(repo, 30000);
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['npm', 'run', 'test'], timeout_ms: 500, reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const call = toolCallOf(records, 'run_bash_command');
      expect(call?.error?.code).toBe('TIMEOUT');
      const pidPath = path.join(repo, 'sleep.pid');
      expect(fs.existsSync(pidPath)).toBe(true); // the fixture DID start, proving this isn't a vacuous pass
      const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
      let stillAlive = true;
      for (let i = 0; i < 20 && stillAlive; i++) {
        try {
          process.kill(pid, 0);
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          stillAlive = false;
        }
      }
      expect(stillAlive).toBe(false);
      expect(fs.existsSync(path.join(repo, 'sleep.done'))).toBe(false);
    }, 20000);
  });
});
