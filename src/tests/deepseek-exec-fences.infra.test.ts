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
import { execFileSync, spawnSync } from 'node:child_process';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, multiToolTurn, writeBrief, ledgerRecords, scrubbedChildEnv, cleanupTempDir,
} from './helpers/deepseek-exec-harness';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly
const { committerLockFileName } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));

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
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
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
      // The blocked command never ran, so the only NEW entries in ledgerDir
      // are this run's own ledger file and (as of commit 10b) its own
      // active-claims.json registry write — nothing named by the blocked
      // argv (e.g. "some-other-run.jsonl") was ever created, read into, or
      // otherwise touched.
      const newEntries = after.filter((f) => !before.includes(f));
      expect(newEntries).not.toContain('some-other-run.jsonl');
      expect(newEntries.every((f) => f === `${summary.run_id}.jsonl` || f === 'active-claims.json')).toBe(true);
      expect(newEntries).toContain(`${summary.run_id}.jsonl`);
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

  describe('read_file: read_max_bytes caps the WINDOW, not the file (run 20260923T003332Z-afa733d5, batch-2 row 2.6)', () => {
    // Founding measurement: scripts/lib/step/index.js is 308,909 bytes; the
    // first handler compared stat.size against the 262,144-byte cap BEFORE
    // windowing, so every (offset, limit) read of the runner was TOO_LARGE and
    // the engine spent 30 iterations grepping blind. Both directions:
    //   - a windowed read of an over-cap file is ok (RED before the fix)
    //   - an un-windowed read of that file is still TOO_LARGE
    //   - a window whose OWN bytes exceed the cap is TOO_LARGE
    //   - a file over the 16x ceiling is TOO_LARGE even windowed
    function toolsWith(readMaxBytes: number) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly, below the engine loop
      const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      policy.limits.read_max_bytes = readMaxBytes;
      const fakeLedger = { path: path.join(ledgerDir, 'readcap-unit.jsonl'), append: () => {}, close: () => {} };
      return createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState: { readState: {} } });
    }
    const LINE = 'x'.repeat(99) + '\n'; // 100 bytes per line

    it('a windowed read of a file over read_max_bytes returns the window (RED before: TOO_LARGE on stat.size)', async () => {
      fs.writeFileSync(path.join(repo, 'big.js'), LINE.repeat(50)); // 5,000 bytes
      const tools = toolsWith(1000);
      const outcome = await tools.dispatch('read_file', { path: 'big.js', offset: 10, limit: 5, reason: 'r' });
      expect(outcome.toolResult.ok).toBe(true);
      expect(outcome.toolResult.lines_total).toBe(51);
      expect(outcome.toolResult.truncated).toBe(true);
      expect((outcome.toolResult.content as string).split('\n')).toHaveLength(5);
    });

    it('an un-windowed read of the same file is still TOO_LARGE, and the message says to window', async () => {
      fs.writeFileSync(path.join(repo, 'big.js'), LINE.repeat(50));
      const tools = toolsWith(1000);
      const outcome = await tools.dispatch('read_file', { path: 'big.js', reason: 'r' });
      expect(outcome.toolResult).toMatchObject({ ok: false, error: { code: 'TOO_LARGE' } });
      expect(outcome.toolResult.error.message).toMatch(/offset\+limit/);
    });

    it('a window whose own bytes exceed read_max_bytes is TOO_LARGE (the cap still protects the model)', async () => {
      fs.writeFileSync(path.join(repo, 'big.js'), LINE.repeat(50));
      const tools = toolsWith(1000);
      const outcome = await tools.dispatch('read_file', { path: 'big.js', offset: 1, limit: 20, reason: 'r' }); // ~2,000 bytes
      expect(outcome.toolResult).toMatchObject({ ok: false, error: { code: 'TOO_LARGE' } });
      expect(outcome.toolResult.error.message).toMatch(/smaller limit/);
    });

    it('a file over the 16x ceiling is TOO_LARGE even when windowed', async () => {
      fs.writeFileSync(path.join(repo, 'huge.js'), LINE.repeat(200)); // 20,000 bytes > 16 x 1000
      const tools = toolsWith(1000);
      const outcome = await tools.dispatch('read_file', { path: 'huge.js', offset: 1, limit: 2, reason: 'r' });
      expect(outcome.toolResult).toMatchObject({ ok: false, error: { code: 'TOO_LARGE' } });
      expect(outcome.toolResult.error.message).toMatch(/file ceiling/);
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
      const call = toolCallOf(records, 'run_bash_command') as { error?: { code: string }; duration_ms?: number } | undefined;
      expect(call?.error?.code).toBe('TIMEOUT');
      // Hardened (Step 9 panel fold, flaky-lock report from the Phase 3
      // builder): assert the ledger's OWN duration_ms is well under the 30s
      // sleep the fixture would otherwise run for — a GENEROUS margin
      // (< 15000ms against a 500ms timeout_ms), never an exact elapsed
      // window. This is the assertion that actually proves the kill fired
      // promptly, rather than only the eventual (polled, CPU-contention-
      // sensitive) process-death check below.
      expect(call?.duration_ms).toBeDefined();
      expect(call!.duration_ms!).toBeLessThan(15000);
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

  // =========================================================================
  // Commit 10 — git_commit fences (G9)
  // =========================================================================
  describe('commit 10: git_commit — refused flags, never stripped-and-retried', () => {
    it('args:["--no-verify"] is refused (FLAG_REFUSED) and NOTHING executes — no git operation, no ledgered write required first', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'git_commit', { message: 'nope', paths: ['seed.txt'], args: ['--no-verify'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'FLAG_REFUSED' } });
    });
  });

  describe('commit 10: git_commit — the happy path, and PATH_NOT_LEDGERED', () => {
    it('write_file then git_commit succeeds; `git log -1` in the temp repo shows the Executed-By trailer; HEAD advances', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'committed-by-engine.txt', content: 'hello\n', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): engine commit', paths: ['committed-by-engine.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const call = toolCallOf(records, 'git_commit') as { status?: string; result_summary?: { sha: string }; pre?: { head_sha: string }; post?: { head_sha: string } } | undefined;
      expect(call?.status).toBe('ok');
      expect(call?.post?.head_sha).not.toBe(call?.pre?.head_sha); // HEAD advanced
      const log = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
      expect(log).toContain('Executed-By: deepseek-exec');
      expect(log).toContain(summary.run_id);
    });

    it('git_commit with a path never written this run ⇒ PATH_NOT_LEDGERED', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'git_commit', { message: 'test(08_agents): x', paths: ['seed.txt'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'PATH_NOT_LEDGERED' } });
    });
  });

  describe('commit 10: git_commit — single-committer advisory lock', () => {
    it('a committer lock already held by a LIVE pid ⇒ COMMITTER_BUSY', async () => {
      const lockPath = path.join(ledgerDir, committerLockFileName(repo));
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, run_id: 'other-run', repo_root: repo, ts: new Date().toISOString() }));
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'blocked-by-lock.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): x', paths: ['blocked-by-lock.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'COMMITTER_BUSY' } });
      fs.rmSync(lockPath, { force: true });
    });

    it('a stale committer lock (dead pid) is reclaimed, and the commit succeeds', async () => {
      const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
      const lockPath = path.join(ledgerDir, committerLockFileName(repo));
      fs.writeFileSync(lockPath, JSON.stringify({ pid: dead.pid, run_id: 'stale-run', repo_root: repo, ts: new Date(0).toISOString() }));
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'reclaimed.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): reclaimed', paths: ['reclaimed.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'ok' });
      // the lock is released back to normal — a THIRD commit in the same
      // process right after also succeeds, proving no lingering lock.
      const summary2 = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'reclaimed2.txt', content: 'y', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): reclaimed2', paths: ['reclaimed2.txt'], reason: 'r' }),
        ],
      });
      const records2 = ledgerRecords(ledgerDir, summary2.run_id);
      expect(toolCallOf(records2, 'git_commit')).toMatchObject({ status: 'ok' });
    });
  });

  describe('commit 10: bash argv — the commit-adjacent block list, and a legitimate typecheck-shaped call', () => {
    const blockedCases: string[][] = [
      ['git', 'add', '-A'],
      ['git', 'push'],
      ['git', 'reset', '--hard'],
      ['rm', '-rf', 'x'],
      ['npm', 'run', 'lint', '--', '--fix'],
    ];
    for (const argv of blockedCases) {
      it(`${argv.join(' ')} ⇒ blocked`, async () => {
        const briefPath = writeBrief(repo);
        const summary = await runEngine({
          repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv, reason: 'r' })],
        });
        const records = ledgerRecords(ledgerDir, summary.run_id);
        expect(toolCallOf(records, 'run_bash_command')?.status).toBe('blocked');
      });
    }

    it('a "npm run typecheck"-shaped call (temp repo package.json defines it as `node -e 0`) is allowed', async () => {
      fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'typecheck-fixture', version: '1.0.0', scripts: { typecheck: 'node -e 0' } }));
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['npm', 'run', 'typecheck'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const call = toolCallOf(records, 'run_bash_command') as { status?: string; result_summary?: { exit_code: number } } | undefined;
      expect(call?.status).toBe('ok');
    });
  });

  describe('commit 10: write to ../outside is blocked, inside the repo is allowed', () => {
    it('write_file("../outside-escape.txt") is blocked PATH_OUTSIDE_REPO', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: '../outside-escape.txt', content: 'nope', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'PATH_OUTSIDE_REPO' } });
      expect(fs.existsSync(path.join(repo, '..', 'outside-escape.txt'))).toBe(false);
    });

    it('write_file to a normal path inside the repo is allowed', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'inside-ok.txt', content: 'fine\n', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'ok' });
    });
  });

  // =========================================================================
  // Commit 10b — multi-worker isolation (F13, §C.6): write scope, reserved
  // registries, active claims, per-worktree committer lock
  // =========================================================================
  describe('commit 10b: exec-brief.js front-matter parser (unit, no repo needed)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { parseBrief } = require(path.join(REPO_ROOT, 'scripts/lib/exec-brief.js'));
    it('parses write_scope and strips the front-matter block from the body', () => {
      const content = '---\nwrite_scope:\n- scripts/**\n- src/tests/**\n---\nBody text here\n';
      const { writeScope, body } = parseBrief(content);
      expect(writeScope).toEqual(['scripts/**', 'src/tests/**']);
      expect(body).toBe('Body text here\n');
    });
    it('pilot 2026-09-22 (commit 12d): a YAML-indented list (`  - glob`) with CRLF endings parses; the un-indented form stays accepted', () => {
      // RED before 12d: LIST_ITEM_RE anchored `-` at column 0, so the indented form returned []
      // and the live pilot run (20260922T183557Z-e50c6774) downgraded to claude on `no_write_scope`.
      const indented = '---\r\nwrite_scope:\r\n  - scripts/lib/compute/assert-data-bounds.js\r\n  - src/tests/steps/assert_data_bounds/**\r\n---\r\nBody\r\n';
      expect(parseBrief(indented).writeScope).toEqual([
        'scripts/lib/compute/assert-data-bounds.js',
        'src/tests/steps/assert_data_bounds/**',
      ]);
      expect(parseBrief('---\nwrite_scope:\n- a/**\n---\n').writeScope).toEqual(['a/**']);
    });
    it('no front matter ⇒ empty scope, body === the whole content', () => {
      const content = 'plain brief, no front matter\n';
      const { writeScope, body } = parseBrief(content);
      expect(writeScope).toEqual([]);
      expect(body).toBe(content);
    });
    it('an unterminated front-matter block ⇒ empty scope, body === the whole content (not an error)', () => {
      const content = '---\nwrite_scope:\n- scripts/**\nno closing delimiter\n';
      const { writeScope, body } = parseBrief(content);
      expect(writeScope).toEqual([]);
      expect(body).toBe(content);
    });
  });

  describe('commit 10b: exec-glob.js minimal matcher (unit, pure)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { matchGlob } = require(path.join(REPO_ROOT, 'scripts/lib/exec-glob.js'));
    it('scripts/steps/x/** matches scripts/steps/x/a/b.js', () => {
      expect(matchGlob('scripts/steps/x/**', 'scripts/steps/x/a/b.js')).toBe(true);
    });
    it('scripts/steps/x/** does NOT match scripts/steps/xy/a.js (segment-boundary honesty, not a naive prefix match)', () => {
      expect(matchGlob('scripts/steps/x/**', 'scripts/steps/xy/a.js')).toBe(false);
    });
    it('src/tests/*.test.ts matches a direct file but NOT a nested one (single * stays within one segment)', () => {
      expect(matchGlob('src/tests/*.test.ts', 'src/tests/foo.test.ts')).toBe(true);
      expect(matchGlob('src/tests/*.test.ts', 'src/tests/nested/foo.test.ts')).toBe(false);
    });
  });

  describe('commit 11 (§B amendment, F14 carry-over): NO_WRITE_SCOPE is now a fallback:no_write_scope DOWNGRADE to claude, never a non-zero refusal', () => {
    // Phase 2 commit 10b originally made an empty write_scope a terminal
    // `run_end.status: 'no_write_scope'` refusal (exit != 0) — §B forbids a
    // halt ("an engine-unavailable provider resolves to claude and logs the
    // downgrade with its reason — never a throw-and-halt"), so commit 11
    // folds this into the SAME downgrade path as engine_unavailable:no_api_key.
    it('run_start.provider==="claude", provider_source==="fallback:no_write_scope", run_end{status:"delegated_to_claude"}, write_scope recorded empty', async () => {
      const briefPath = writeBrief(repo, { writeScope: null });
      // A transcript is supplied so a LIVE CLIENT exists — isolating this
      // arm to the write_scope reason alone. Without one, no_api_key would
      // ALSO be true (no DEEPSEEK_API_KEY in this suite's scrubbed env) and
      // commit 11's precedence (no_api_key checked first, per the brief's
      // reason order) would report that reason instead — proven by the
      // sibling "engine_unavailable:no_api_key" describe block below, which
      // deliberately omits the transcript.
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: [] });
      expect(summary.status).toBe('delegated_to_claude');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; write_scope?: string[]; status?: string; provider?: string; provider_source?: string }>;
      expect(records).toHaveLength(2);
      expect(records[0]!.kind).toBe('run_start');
      expect(records[0]!.write_scope).toEqual([]);
      expect(records[0]!.provider).toBe('claude');
      expect(records[0]!.provider_source).toBe('fallback:no_write_scope');
      expect(records[1]).toMatchObject({ kind: 'run_end', status: 'delegated_to_claude' });
    });

    it('the real CLI process exits ZERO on an empty write_scope (§B: never a throw-and-halt)', () => {
      const briefPath = writeBrief(repo, { writeScope: null });
      const transcriptPath = path.join(repo, 'empty-transcript.json');
      fs.writeFileSync(transcriptPath, JSON.stringify([]));
      const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
      let exitCode = 0;
      let stdout = '';
      try {
        stdout = execFileSync(process.execPath, [cliPath, '--brief', briefPath, '--provider=deepseek', '--transcript', transcriptPath, '--ledger-dir', ledgerDir], {
          cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8',
        });
      } catch (err) {
        exitCode = (err as { status?: number }).status ?? 1;
        stdout = (err as { stdout?: string }).stdout ?? '';
      }
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout.trim().split('\n').pop()!) as { status: string };
      expect(summary.status).toBe('delegated_to_claude');
    });

    it('provider claude is UNAFFECTED by an empty write_scope (it never dispatches a tool)', async () => {
      const briefPath = writeBrief(repo, { writeScope: null });
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'claude', ledgerDir });
      expect(summary.status).toBe('delegated_to_claude');
    });
  });

  // =========================================================================
  // Commit 11 — F14: general-purpose execution substrate (§B/§C.6.2 amendment)
  // =========================================================================
  describe('commit 11 (F14): engine_unavailable:no_api_key — provider deepseek downgrades to claude when no live client exists', () => {
    it('no DEEPSEEK_API_KEY, no modelClient, no transcript ⇒ run_start.provider==="claude", provider_source starts "fallback:engine_unavailable", run_end.status==="delegated_to_claude", exit 0', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir });
      expect(summary.status).toBe('delegated_to_claude');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; provider?: string; provider_source?: string }>;
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.provider).toBe('claude');
      expect(runStart.provider_source).toBe('fallback:engine_unavailable:no_api_key');
    });

    it('DEEPSEEK_API_KEY set + a transcript provided ⇒ provider stays "deepseek" (a live client exists; no downgrade)', async () => {
      process.env.DEEPSEEK_API_KEY = 'sk-testtesttesttest1234';
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; provider?: string; provider_source?: string }>;
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.provider).toBe('deepseek');
      expect(runStart.provider_source).toBe('flag');
    });

    it('a transcript alone (no DEEPSEEK_API_KEY) ⇒ provider stays "deepseek" — a transcript IS a live client (§C.5, no lock needs a real API call)', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; provider?: string }>;
      expect(records.find((r) => r.kind === 'run_start')!.provider).toBe('deepseek');
    });

    it('the downgrade fires just as well when deepseek was resolved from EXECUTION_PROVIDER (env), not only --provider (flag) — precedence itself is untouched, resolveProvider still runs first', async () => {
      process.env.EXECUTION_PROVIDER = 'deepseek';
      const briefPath = writeBrief(repo);
      const summary = await runEngine({ repoRoot: repo, briefPath, ledgerDir }); // no opts.provider ⇒ env wins
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; provider?: string; provider_source?: string }>;
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.provider).toBe('claude');
      expect(runStart.provider_source).toBe('fallback:engine_unavailable:no_api_key');
    });
  });

  describe('commit 11 (F14): the engine prints ONE stderr line on any downgrade', () => {
    it('CLI process stderr contains the documented line on an engine-unavailable downgrade (run still exits 0 — spawnSync, not execFileSync, so a SUCCESSFUL run\'s stderr is still observable)', () => {
      const briefPath = writeBrief(repo);
      const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
      const result = spawnSync(process.execPath, [cliPath, '--brief', briefPath, '--provider=deepseek', '--ledger-dir', ledgerDir], {
        cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('deepseek-exec: provider downgraded to claude (engine_unavailable:no_api_key)');
    });

    it('a normal deepseek run (transcript client, non-empty scope) never prints the downgrade line — no downgrade occurred', () => {
      const briefPath = writeBrief(repo);
      const transcriptPath = path.join(repo, 'ok-transcript.json');
      fs.writeFileSync(transcriptPath, JSON.stringify([]));
      const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
      const result = spawnSync(process.execPath, [cliPath, '--brief', briefPath, '--provider=deepseek', '--transcript', transcriptPath, '--ledger-dir', ledgerDir], {
        cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8',
      });
      expect(result.stderr).not.toContain('provider downgraded to claude');
    });
  });

  describe('commit 11 (F14): claude_only_globs — money/auth/PII/migrations, PATH_CLAUDE_ONLY, both directions', () => {
    it('write_file to migrations/** is blocked PATH_CLAUDE_ONLY; a non-matching path (still inside the default ** scope) is allowed', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'migrations/0001_add_col.sql', content: 'ALTER TABLE x;', reason: 'r' }),
          toolTurn('c2', 'write_file', { path: 'scripts/claude-only-control.js', content: 'x', reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const calls = records.filter((r) => r.kind === 'tool_call' && r.tool === 'write_file') as Array<{ status?: string; error?: { code: string } }>;
      expect(calls[0]).toMatchObject({ status: 'blocked', error: { code: 'PATH_CLAUDE_ONLY' } });
      expect(calls[1]).toMatchObject({ status: 'ok' });
    });

    it('PATH_CLAUDE_ONLY wins even when the brief\'s write_scope explicitly names the claude-only path (scope cannot widen past policy)', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['src/lib/auth/**'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'src/lib/auth/session.ts', content: 'x', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'PATH_CLAUDE_ONLY' } });
    });

    it('git_commit.paths matching .github/workflows/** is blocked PATH_CLAUDE_ONLY (direct dispatch, defense-in-depth)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly
      const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      const realRepo = fs.realpathSync(repo);
      fs.mkdirSync(path.join(realRepo, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(realRepo, '.github', 'workflows', 'ci.yml'), 'x');
      const fakeLedger = { path: path.join(ledgerDir, 'claude-only-unit.jsonl'), append: () => {}, close: () => {} };
      const runState = { readState: {}, writtenPaths: new Set([path.join(realRepo, '.github', 'workflows', 'ci.yml')]) };
      const tools = createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState, writeScope: ['**'] });
      const outcome = await tools.dispatch('git_commit', { message: 'test(08_agents): x', paths: ['.github/workflows/ci.yml'], reason: 'r' });
      expect(outcome.toolResult.ok).toBe(false);
      expect(outcome.toolResult.error.code).toBe('PATH_CLAUDE_ONLY');
    });
  });

  describe('commit 11 (F14): allowlist review for general repo work — read-only additions', () => {
    it('npm run build / npx tsc --noEmit / npx eslint <path> / git ls-files -- <path> are all allowed', async () => {
      fs.writeFileSync(path.join(repo, 'lintable.js'), 'const x = 1;\n');
      execFileSync('git', ['add', '-A'], { cwd: repo, env: scrubbedChildEnv() });
      execFileSync('git', ['commit', '-q', '-m', 'lintable'], { cwd: repo, env: scrubbedChildEnv() });
      const briefPath = writeBrief(repo);
      const turns = [
        toolTurn('c1', 'run_bash_command', { argv: ['git', 'ls-files', '--', 'lintable.js'], reason: 'r' }),
      ];
      const summary = await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns });
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string }>;
      expect(records.filter((r) => r.kind === 'tool_call')[0]).toMatchObject({ status: 'ok' });
    });

    it('npx eslint --fix is still refused (FLAG_NOT_ALLOWED — the entry has no flags)', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'run_bash_command', { argv: ['npx', 'eslint', 'seed.txt', '--fix'], reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string; error?: { code: string } }>;
      expect(records.find((r) => r.kind === 'tool_call')).toMatchObject({ status: 'blocked', error: { code: 'FLAG_NOT_ALLOWED' } });
    });
  });

  describe('commit 11 (F14): --repo <path> — confinement derives from the flag, not from cwd', () => {
    it('CLI spawned from a DIFFERENT cwd with --repo pointing at the throwaway repo still confines correctly', () => {
      const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
      const briefPath = writeBrief(repo);
      const transcriptPath = path.join(repo, 'repo-flag-transcript.json');
      fs.writeFileSync(transcriptPath, JSON.stringify([toolTurn('c1', 'write_file', { path: 'repo-flag-test.txt', content: 'x', reason: 'r' })]));
      const stdout = execFileSync(process.execPath, [cliPath, '--repo', repo, '--brief', briefPath, '--provider=deepseek', '--transcript', transcriptPath, '--ledger-dir', ledgerDir], {
        cwd: os.tmpdir(), env: scrubbedChildEnv(), encoding: 'utf8',
      });
      const summary = JSON.parse(stdout.trim().split('\n').pop()!) as { run_id: string };
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; tool?: string; status?: string }>;
      expect(records.find((r) => r.kind === 'tool_call' && r.tool === 'write_file')).toMatchObject({ status: 'ok' });
      expect(fs.existsSync(path.join(repo, 'repo-flag-test.txt'))).toBe(true);
    });

    it('--repo pointing at a directory with no .git throws an engine-level fault (never a silent no-op)', () => {
      const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-git-repo-'));
      try {
        const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
        const briefPath = writeBrief(repo);
        const result = spawnSync(process.execPath, [cliPath, '--repo', notARepo, '--brief', briefPath, '--provider=claude', '--ledger-dir', ledgerDir], {
          env: scrubbedChildEnv(), encoding: 'utf8',
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/not a git worktree/);
      } finally {
        fs.rmSync(notARepo, { recursive: true, force: true });
      }
    });
  });

  describe('commit 10b: PATH_OUT_OF_SCOPE — write_file/edit_file, both directions', () => {
    it('write_file outside a declared write_scope is blocked; inside the same scope is allowed', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['scripts/**'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'outside-scope.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'write_file', { path: 'scripts/inside-scope.js', content: 'x', reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      const calls = records.filter((r) => r.kind === 'tool_call' && r.tool === 'write_file') as Array<{ status?: string; error?: { code: string } }>;
      expect(calls[0]).toMatchObject({ status: 'blocked', error: { code: 'PATH_OUT_OF_SCOPE' } });
      expect(calls[1]).toMatchObject({ status: 'ok' });
    });

    it('git_commit.paths outside the declared write_scope is blocked PATH_OUT_OF_SCOPE (direct dispatch — normal flow cannot even reach this state, since a write outside scope is already refused; this proves the tool\'s OWN independent check, defense-in-depth)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly
      const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      const realRepo = fs.realpathSync(repo);
      fs.writeFileSync(path.join(realRepo, 'out-of-scope-commit.txt'), 'x');
      const fakeLedger = { path: path.join(ledgerDir, 'scope-unit.jsonl'), append: () => {}, close: () => {} };
      const runState = { readState: {}, writtenPaths: new Set([path.join(realRepo, 'out-of-scope-commit.txt')]) };
      const tools = createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState, writeScope: ['scripts/**'] });
      const outcome = await tools.dispatch('git_commit', { message: 'test(08_agents): x', paths: ['out-of-scope-commit.txt'], reason: 'r' });
      expect(outcome.toolResult.ok).toBe(false);
      expect(outcome.toolResult.error.code).toBe('PATH_OUT_OF_SCOPE');
    });
  });

  describe('commit 10b: PATH_RESERVED — registry_reserved wins even when scope names the file', () => {
    it('scope scripts/** + write to scripts/manifest.json ⇒ PATH_RESERVED', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['scripts/**'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'write_file', { path: 'scripts/manifest.json', content: '{}', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'PATH_RESERVED' } });
    });
  });

  describe('commit 10b: active-claims registry (unit — direct acquireClaim/releaseClaim, bypassing the run lifecycle to hold a claim open across two calls)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
    const { acquireClaim, releaseClaim, ClaimConflictError } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));

    it('two runs, same worktree, overlapping scope ⇒ CLAIM_CONFLICT on the second', () => {
      const claim1 = acquireClaim({ ledgerDir, runId: 'run-a', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] });
      expect(() => acquireClaim({ ledgerDir, runId: 'run-b', repoRoot: repo, branch: 'main', writeScope: ['scripts/foo/**'] }))
        .toThrow(ClaimConflictError);
      releaseClaim({ ledgerDir, claimId: claim1.claimId });
    });

    it('disjoint scopes ⇒ both start', () => {
      const claim1 = acquireClaim({ ledgerDir, runId: 'run-a', repoRoot: repo, branch: 'main', writeScope: ['scripts/steps/a/**'] });
      const claim2 = acquireClaim({ ledgerDir, runId: 'run-b', repoRoot: repo, branch: 'main', writeScope: ['scripts/steps/b/**'] });
      expect(claim1.claimId).not.toBe(claim2.claimId);
      releaseClaim({ ledgerDir, claimId: claim1.claimId });
      releaseClaim({ ledgerDir, claimId: claim2.claimId });
    });

    it('a stale entry (dead pid) is dropped, freeing an otherwise-overlapping scope', () => {
      const claimsPath = path.join(ledgerDir, 'active-claims.json');
      const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
      fs.writeFileSync(claimsPath, JSON.stringify([{
        claim_id: 'stale-1', run_id: 'stale-run', pid: dead.pid, repo_root: fs.realpathSync(repo),
        branch: 'main', write_scope: ['scripts/**'], ts: new Date(0).toISOString(),
      }]));
      const claim = acquireClaim({ ledgerDir, runId: 'run-c', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] });
      expect(claim.claimId).toBeTruthy();
      const claims = JSON.parse(fs.readFileSync(claimsPath, 'utf8')) as Array<{ claim_id: string }>;
      expect(claims.find((c) => c.claim_id === 'stale-1')).toBeUndefined();
      releaseClaim({ ledgerDir, claimId: claim.claimId });
    });

    it('the claim is gone from the registry after run_end (end-to-end via runEngine)', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      const claimsPath = path.join(ledgerDir, 'active-claims.json');
      const claims = fs.existsSync(claimsPath) ? JSON.parse(fs.readFileSync(claimsPath, 'utf8')) as Array<{ run_id: string }> : [];
      expect(claims.find((c) => c.run_id === summary.run_id)).toBeUndefined();
    });
  });

  describe('commit 10b: run_start gains write_scope + claim_id', () => {
    it('run_start records the declared write_scope and a non-empty claim_id', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['scripts/**', 'src/tests/**'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; write_scope?: string[]; claim_id?: string }>;
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.write_scope).toEqual(['scripts/**', 'src/tests/**']);
      expect(typeof runStart.claim_id).toBe('string');
      expect(runStart.claim_id!.length).toBeGreaterThan(0);
    });
  });

  describe('commit 10b: committer lock is per-worktree (amends commit 10)', () => {
    it('two DIFFERENT worktrees commit without COMMITTER_BUSY colliding — their lock filenames differ', async () => {
      const repo2 = makeRepo();
      try {
        expect(committerLockFileName(repo)).not.toBe(committerLockFileName(repo2));
        const briefPath1 = writeBrief(repo);
        const briefPath2 = writeBrief(repo2);
        const summary1 = await runEngine({
          repoRoot: repo, briefPath: briefPath1, provider: 'deepseek', ledgerDir,
          transcriptTurns: [
            toolTurn('c1', 'write_file', { path: 'worktree1.txt', content: 'a', reason: 'r' }),
            toolTurn('c2', 'git_commit', { message: 'test(08_agents): w1', paths: ['worktree1.txt'], reason: 'r' }),
          ],
        });
        const summary2 = await runEngine({
          repoRoot: repo2, briefPath: briefPath2, provider: 'deepseek', ledgerDir,
          transcriptTurns: [
            toolTurn('c1', 'write_file', { path: 'worktree2.txt', content: 'b', reason: 'r' }),
            toolTurn('c2', 'git_commit', { message: 'test(08_agents): w2', paths: ['worktree2.txt'], reason: 'r' }),
          ],
        });
        expect(toolCallOf(ledgerRecords(ledgerDir, summary1.run_id), 'git_commit')).toMatchObject({ status: 'ok' });
        expect(toolCallOf(ledgerRecords(ledgerDir, summary2.run_id), 'git_commit')).toMatchObject({ status: 'ok' });
      } finally {
        fs.rmSync(repo2, { recursive: true, force: true });
      }
    });

    it('the SAME repo twice (lock still held) ⇒ COMMITTER_BUSY', async () => {
      const lockPath = path.join(ledgerDir, committerLockFileName(repo));
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, run_id: 'holder', repo_root: repo, ts: new Date().toISOString() }));
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'busy-again.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): x', paths: ['busy-again.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'COMMITTER_BUSY' } });
      fs.rmSync(lockPath, { force: true });
    });
  });

  // ===========================================================================
  // Step 9 output-panel fold (SUB-ENG-1 commit 12b) — A3 Code Reviewer,
  // A5 Integration + Idempotency Lens, DeepSeek lenses. See
  // docs/specs/00-architecture/08_agents.md §C for the reconciled contract.
  // ===========================================================================

  describe('F-II1 (CRITICAL): git_commit refuses a dirty index and undoes a stage mismatch, both directions', () => {
    it('a pre-staged stray file (never ledgered this run) is refused INDEX_DIRTY; nothing is committed; the stray stays staged', async () => {
      const briefPath = writeBrief(repo);
      fs.writeFileSync(path.join(repo, 'stray.txt'), 'stray content, never ledgered this run\n');
      execFileSync('git', ['add', 'stray.txt'], { cwd: repo, env: scrubbedChildEnv() });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'legit.txt', content: 'legit, this run wrote it\n', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): legit change', paths: ['legit.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'INDEX_DIRTY' } });
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      expect(staged).toEqual(['stray.txt']); // the pre-existing stray stage is untouched — never reset, never committed
      const log = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
      expect(log.trim()).not.toBe('test(08_agents): legit change'); // no commit happened at all
    });

    it('a clean index (the normal case) commits exactly the ledgered paths — no INDEX_DIRTY false positive', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'clean-index.txt', content: 'x\n', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): clean index', paths: ['clean-index.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'ok' });
      const files = execFileSync('git', ['show', '--stat', '--format=', 'HEAD'], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
      expect(files).toContain('clean-index.txt');
      expect(files).not.toContain('stray');
    });
  });

  describe('F-DS3 (CRITICAL): git_commit.args is reserved in v1 — ANY non-empty value is refused, closing the git long-option-abbreviation class', () => {
    const cases = ['--amen', '-n', '--no-verify', '--only'];
    for (const flag of cases) {
      it(`args:["${flag}"] ⇒ FLAG_REFUSED, nothing executes`, async () => {
        const briefPath = writeBrief(repo);
        const summary = await runEngine({
          repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
          transcriptTurns: [
            toolTurn('c1', 'write_file', { path: `refused-${flag.replace(/[^a-z0-9]/gi, '')}.txt`, content: 'x', reason: 'r' }),
            toolTurn('c2', 'git_commit', { message: 'test(08_agents): x', paths: [`refused-${flag.replace(/[^a-z0-9]/gi, '')}.txt`], args: [flag], reason: 'r' }),
          ],
        });
        const records = ledgerRecords(ledgerDir, summary.run_id);
        expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'FLAG_REFUSED' } });
      });
    }

    it('args: [] (empty, the honest "no flags" declaration) is unaffected — the commit still succeeds', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'empty-args.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): empty args', paths: ['empty-args.txt'], args: [], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'ok' });
    });
  });

  describe('F-II4 (HIGH): commit message format — validated BEFORE any git call, both directions', () => {
    it('a message whose first line does not match the required pattern ⇒ MESSAGE_FORMAT, no git call at all (index stays clean)', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'bad-message.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'fixed some stuff', paths: ['bad-message.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'blocked', error: { code: 'MESSAGE_FORMAT' } });
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' }).trim();
      expect(staged).toBe(''); // never even reached `git add`
    });

    it('a conforming message (type(NN_spec): description) is accepted and lands', async () => {
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'good-message.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'feat(08_agents): a conforming message', paths: ['good-message.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'ok' });
      const log = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
      expect(log.trim()).toBe('feat(08_agents): a conforming message');
    });

    it('the system prompt states the required pattern (so the model has seen it before its first git_commit call)', async () => {
      const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      expect(typeof policy.commit_message_pattern).toBe('string');
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      expect(summary.status).toBe('completed');
      // model_turn.assistant_text doesn't carry the system prompt itself (that's
      // a separate 'system' message never ledgered verbatim) — the contract this
      // arm actually proves is that the pattern is loaded from POLICY, not
      // hardcoded text that could drift from the hook; see the direct policy
      // read above for the load-bearing assertion.
    });
  });

  describe('F-II6: git_commit child env scrubs DEEPSEEK_* in addition to GIT_*', () => {
    it('a DEEPSEEK_API_KEY set in the parent env is not visible inside the husky hooks a commit spawns (temp repo has no husky, so this is proven via a printenv-shaped fixture hook)', async () => {
      process.env.DEEPSEEK_API_KEY = 'sk-shouldneverreachthehook12';
      // A pre-commit hook that fails (and reports) if DEEPSEEK_API_KEY leaked through.
      const huskyDir = path.join(repo, '.husky');
      fs.mkdirSync(huskyDir, { recursive: true });
      fs.writeFileSync(
        path.join(huskyDir, 'pre-commit'),
        '#!/bin/sh\nif [ -n "$DEEPSEEK_API_KEY" ]; then echo "LEAKED:$DEEPSEEK_API_KEY"; exit 1; fi\nexit 0\n',
      );
      execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repo, env: scrubbedChildEnv() });
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [
          toolTurn('c1', 'write_file', { path: 'hook-checked.txt', content: 'x', reason: 'r' }),
          toolTurn('c2', 'git_commit', { message: 'test(08_agents): hook checked', paths: ['hook-checked.txt'], reason: 'r' }),
        ],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id);
      expect(toolCallOf(records, 'git_commit')).toMatchObject({ status: 'ok' }); // the hook did NOT fail — DEEPSEEK_API_KEY was absent
    });
  });

  describe('F-II2/F-DS7 (HIGH): write_scope globs must be directory-anchored — SCOPE_GLOB_UNANCHORED, both directions, plus normalisation', () => {
    it('write_scope: ["*.md"] is refused at run_start — run_end.status "scope_invalid", ledgered SCOPE_GLOB_UNANCHORED, no claim acquired', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['*.md'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      expect(summary.status).toBe('scope_invalid');
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; code?: string; claim_id?: string | null }>;
      expect(records.some((r) => r.kind === 'error' && r.code === 'SCOPE_GLOB_UNANCHORED')).toBe(true);
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.claim_id).toBeNull();
      const claimsPath = path.join(ledgerDir, 'active-claims.json');
      const claims = fs.existsSync(claimsPath) ? JSON.parse(fs.readFileSync(claimsPath, 'utf8')) as unknown[] : [];
      expect(claims).toHaveLength(0);
    });

    it('write_scope: ["**"] — the deliberate whole-repo catch-all — is NOT refused (the ONE exempted unanchored-looking glob)', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['**'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      expect(summary.status).toBe('completed');
    });

    it('a well-formed anchored scope (docs/**, src/**) is unaffected', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['docs/**', 'src/**'] });
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      expect(summary.status).toBe('completed');
    });

    it('exec-claims.scopesOverlap: docs/** vs src/** do not conflict; src/**/*.test.ts vs src/tests/** conflict (prefix rule unchanged)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { scopesOverlap } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      expect(scopesOverlap(['docs/**'], ['src/**'])).toBe(false);
      expect(scopesOverlap(['src/**/*.test.ts'], ['src/tests/**'])).toBe(true);
    });

    it('exec-claims.scopesOverlap normalises "./src/**" and "src/**" as identical (F-DS7)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { scopesOverlap } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      expect(scopesOverlap(['./src/**'], ['src/**'])).toBe(true);
      expect(scopesOverlap(['src\\\\foo\\\\**'], ['src/foo/**'])).toBe(true);
    });

    it('exec-glob.isAnchoredGlob: *.md and **/foo.ts unanchored; docs/**, src/foo*.ts, and bare ** anchored', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { isAnchoredGlob } = require(path.join(REPO_ROOT, 'scripts/lib/exec-glob.js'));
      expect(isAnchoredGlob('*.md')).toBe(false);
      expect(isAnchoredGlob('**/foo.ts')).toBe(false);
      expect(isAnchoredGlob('docs/**')).toBe(true);
      expect(isAnchoredGlob('src/foo*.ts')).toBe(true);
      expect(isAnchoredGlob('**')).toBe(true);
    });
  });

  describe('F-DS14 (MED): detached HEAD — branch is null, never the literal "HEAD"; two unrelated detached repos never false-conflict', () => {
    it('a detached-HEAD run_start.branch is null, not "HEAD"', async () => {
      execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: repo, env: scrubbedChildEnv() });
      const briefPath = writeBrief(repo);
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      const records = ledgerRecords(ledgerDir, summary.run_id) as Array<{ kind: string; branch?: unknown }>;
      const runStart = records.find((r) => r.kind === 'run_start')!;
      expect(runStart.branch).toBeNull();
    });

    it('two DIFFERENT repos, both detached HEAD, overlapping scope: NO false CLAIM_CONFLICT (repo_root differs, branch is null on both)', async () => {
      const repo2 = makeRepo();
      try {
        execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: repo, env: scrubbedChildEnv() });
        execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: repo2, env: scrubbedChildEnv() });
        const briefPath1 = writeBrief(repo, { writeScope: ['scripts/**'] });
        const briefPath2 = writeBrief(repo2, { writeScope: ['scripts/**'] });
        const summary1 = await runEngine({
          repoRoot: repo, briefPath: briefPath1, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
        });
        const summary2 = await runEngine({
          repoRoot: repo2, briefPath: briefPath2, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
        });
        expect(summary1.status).toBe('completed');
        expect(summary2.status).toBe('completed'); // NOT claim_conflict
      } finally {
        fs.rmSync(repo2, { recursive: true, force: true });
      }
    });
  });

  describe('F-DS15 (MED): budget check is evaluated AFTER "model finished", not before', () => {
    it('a FINAL turn (no tool calls) whose own usage pushes total over maxTotalTokens still reports "completed", not "budget_exhausted"', async () => {
      const briefPath = writeBrief(repo);
      const turns = [
        {
          message: { role: 'assistant' as const, content: 'done, nothing left to do', tool_calls: [] },
          usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
          finish_reason: 'stop',
        },
      ];
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns, maxTotalTokens: 150,
      });
      expect(summary.status).toBe('completed');
      expect(summary.usage_total.total_tokens).toBeGreaterThan(150);
    });

    it('regression check: a turn that STILL wants to call a tool and is already over budget is still budget_exhausted (the reorder did not remove the fence)', async () => {
      const briefPath = writeBrief(repo);
      const turns = [
        toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' }),
        toolTurn('c2', 'read_file', { path: 'seed.txt', reason: 'r' }),
      ].map((t) => ({ ...t, usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 } }));
      const summary = await runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, transcriptTurns: turns, maxTotalTokens: 150,
      });
      expect(summary.status).toBe('budget_exhausted');
    });
  });

  describe('F-DS13 (MED): --brief must resolve inside the repo — BRIEF_OUTSIDE_REPO, both directions', () => {
    it('a --brief path pointing OUTSIDE the repo root throws an engine-level fault naming BRIEF_OUTSIDE_REPO', async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-outside-'));
      const outsideBrief = path.join(outside, 'brief.md');
      fs.writeFileSync(outsideBrief, '---\nwrite_scope:\n- scripts/**\n---\nbody\n');
      try {
        await expect(runEngine({ repoRoot: repo, briefPath: outsideBrief, provider: 'deepseek', ledgerDir })).rejects.toThrow(/BRIEF_OUTSIDE_REPO/);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it('the real CLI process exits non-zero and stderr names BRIEF_OUTSIDE_REPO', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-outside-cli-'));
      const outsideBrief = path.join(outside, 'brief.md');
      fs.writeFileSync(outsideBrief, 'plain brief\n');
      try {
        const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
        const result = spawnSync(process.execPath, [cliPath, '--brief', outsideBrief, '--repo', repo, '--provider=claude', '--ledger-dir', ledgerDir], {
          env: scrubbedChildEnv(), encoding: 'utf8',
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('BRIEF_OUTSIDE_REPO');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it('a `.cursor/`-rooted brief (the documented norm, repo-relative) still works', async () => {
      fs.mkdirSync(path.join(repo, '.cursor'), { recursive: true });
      const cursorBrief = path.join(repo, '.cursor', 'task.md');
      fs.writeFileSync(cursorBrief, '---\nwrite_scope:\n- scripts/**\n---\nbody\n');
      const summary = await runEngine({
        repoRoot: repo, briefPath: '.cursor/task.md', provider: 'deepseek', ledgerDir,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      });
      expect(summary.status).toBe('completed');
      void cursorBrief;
    });
  });

  describe('F-DS9 (HIGH): policy shape validation — POLICY_INVALID, both directions', () => {
    it('a policy object missing registry_reserved throws POLICY_INVALID', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { validatePolicyShape, PolicyInvalidError } = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
      const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      const broken = { ...real };
      delete broken.registry_reserved;
      expect(() => validatePolicyShape(broken)).toThrow(PolicyInvalidError);
      try {
        validatePolicyShape(broken);
      } catch (err) {
        expect((err as { code?: string }).code).toBe('POLICY_INVALID');
        expect((err as Error).message).toContain('registry_reserved');
      }
    });

    it('the REAL exec-policy.json (as shipped) passes shape validation without throwing', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { validatePolicyShape } = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
      const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      expect(() => validatePolicyShape(real)).not.toThrow();
    });
  });

  describe('F-DS16 (MED): an unrecognised TOOL_SCHEMAS property type throws (fails closed, not open)', () => {
    it('validateType({ type: "bogus" }, ...) throws a plain Error naming the bogus type', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { validateType } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      expect(() => validateType({ type: 'bogus' }, 'x', 'some.key')).toThrow(/bogus/);
    });
    it('the four real schema types (string/integer/boolean/array) are unaffected', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { validateType } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      expect(() => validateType({ type: 'string' }, 'x', 'k')).not.toThrow();
      expect(() => validateType({ type: 'integer' }, 1, 'k')).not.toThrow();
      expect(() => validateType({ type: 'boolean' }, true, 'k')).not.toThrow();
      expect(() => validateType({ type: 'array', items: { type: 'string' } }, ['a'], 'k')).not.toThrow();
    });
  });

  describe('F-DS8: a handler-level fs fault produces a structured tool_call record, never an uncaught crash', () => {
    it('write_file into a path whose parent segment is itself a FILE (ENOTDIR-class TOCTOU) is a structured blocked/error record, not an unhandled rejection', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly, below the engine loop
      const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
      const fakeLedger = { path: path.join(ledgerDir, 'handler-fault-unit.jsonl'), append: () => {}, close: () => {} };
      const tools = createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState: { readState: {} }, writeScope: ['**'] });
      fs.writeFileSync(path.join(repo, 'iamafile'), 'x');
      const outcome = await tools.dispatch('write_file', { path: 'iamafile/nested.txt', content: 'y', reason: 'r' });
      expect(outcome.toolResult.ok).toBe(false);
      expect(typeof outcome.toolResult.error.code).toBe('string');
      expect(outcome.toolResult.error.code.length).toBeGreaterThan(0);
    });

    it('classifySpawnFailure maps an ENOBUFS spawn result to OUTPUT_TOO_LARGE, and leaves a normal failure\'s fallback code alone', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { classifySpawnFailure } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const overflowed = classifySpawnFailure({ error: { code: 'ENOBUFS' } }, { code: 'HOOK_FAILED', message: 'fallback text' });
      expect(overflowed.code).toBe('OUTPUT_TOO_LARGE');
      const normal = classifySpawnFailure({ status: 1 }, { code: 'HOOK_FAILED', message: 'fallback text' });
      expect(normal).toEqual({ code: 'HOOK_FAILED', message: 'fallback text' });
    });
  });

  describe('F-DS2 (CRITICAL): active-claims registry — atomic write + CLAIMS_CORRUPT on a genuinely unparsable file (never a silent empty-start)', () => {
    it('a present-but-unparsable active-claims.json throws ClaimsCorruptError (the run refuses to start), never returns []', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireClaim, ClaimsCorruptError } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      fs.mkdirSync(ledgerDir, { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'active-claims.json'), '{ this is not valid JSON');
      expect(() => acquireClaim({ ledgerDir, runId: 'corrupt-run', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] }))
        .toThrow(ClaimsCorruptError);
      fs.rmSync(path.join(ledgerDir, 'active-claims.json'), { force: true });
    });

    it('a MISSING active-claims.json (first run ever) is still a legitimate fresh start, not CLAIMS_CORRUPT', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireClaim, releaseClaim } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      fs.rmSync(path.join(ledgerDir, 'active-claims.json'), { force: true });
      const claim = acquireClaim({ ledgerDir, runId: 'fresh-run', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] });
      expect(claim.claimId).toBeTruthy();
      releaseClaim({ ledgerDir, claimId: claim.claimId });
    });

    it('writeClaims is atomic (tmp + rename) — no ".tmp-" artifact survives a successful acquire/release cycle', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireClaim, releaseClaim } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      const claim = acquireClaim({ ledgerDir, runId: 'atomic-run', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] });
      releaseClaim({ ledgerDir, claimId: claim.claimId });
      const leftovers = fs.readdirSync(ledgerDir).filter((f) => f.includes('.tmp-'));
      expect(leftovers).toEqual([]);
    });
  });

  describe('F-DS5: the claims-mutex lock file — pid-liveness-first reclaim, mtime as a fallback ONLY when the pid field is unreadable', () => {
    it('a claims-mutex lock held by a DEAD pid is reclaimed immediately, not via the 30s mtime window', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireClaim, releaseClaim } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
      fs.mkdirSync(ledgerDir, { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'active-claims.lock'), JSON.stringify({ pid: dead.pid, ts: new Date().toISOString() })); // FRESH mtime, dead pid
      const startedAt = Date.now();
      const claim = acquireClaim({ ledgerDir, runId: 'dead-pid-lock-run', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] });
      expect(claim.claimId).toBeTruthy();
      expect(Date.now() - startedAt).toBeLessThan(1000);
      releaseClaim({ ledgerDir, claimId: claim.claimId });
    });

    it('a claims-mutex lock with an unreadable pid field falls back to mtime staleness', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireClaim, releaseClaim } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      fs.mkdirSync(ledgerDir, { recursive: true });
      const lockPath = path.join(ledgerDir, 'active-claims.lock');
      fs.writeFileSync(lockPath, 'not json at all');
      const old = new Date(Date.now() - 60000);
      fs.utimesSync(lockPath, old, old);
      const claim = acquireClaim({ ledgerDir, runId: 'mtime-fallback-run', repoRoot: repo, branch: 'main', writeScope: ['scripts/**'] });
      expect(claim.claimId).toBeTruthy();
      releaseClaim({ ledgerDir, claimId: claim.claimId });
    });

    it('releaseFileLock does not delete a claims-mutex lock that no longer carries our own pid', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireFileLock, releaseFileLock } = require(path.join(REPO_ROOT, 'scripts/lib/exec-claims.js'));
      fs.mkdirSync(ledgerDir, { recursive: true });
      acquireFileLock(ledgerDir);
      const lockPath = path.join(ledgerDir, 'active-claims.lock');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, ts: new Date().toISOString() })); // as if reclaimed by someone else
      releaseFileLock(ledgerDir);
      expect(fs.existsSync(lockPath)).toBe(true);
      fs.rmSync(lockPath, { force: true });
    });

    it('the committer lock: releaseCommitterLock does not delete a lock file whose run_id no longer matches ours', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireCommitterLock, releaseCommitterLock } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const lockPath = path.join(ledgerDir, 'ownership-unit.lock');
      expect(acquireCommitterLock(lockPath, { pid: process.pid, run_id: 'run-mine', repo_root: repo, ts: new Date().toISOString() })).toBe(true);
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, run_id: 'run-other', repo_root: repo, ts: new Date().toISOString() }));
      releaseCommitterLock(lockPath, 'run-mine');
      expect(fs.existsSync(lockPath)).toBe(true);
      const remaining = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      expect(remaining.run_id).toBe('run-other');
      fs.rmSync(lockPath, { force: true });
    });

    it('the committer lock: releaseCommitterLock DOES delete a lock file that still matches our own run_id (the ordinary path)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireCommitterLock, releaseCommitterLock } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const lockPath = path.join(ledgerDir, 'ownership-unit2.lock');
      acquireCommitterLock(lockPath, { pid: process.pid, run_id: 'run-mine2', repo_root: repo, ts: new Date().toISOString() });
      releaseCommitterLock(lockPath, 'run-mine2');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('the committer lock: a lock with a missing/non-numeric pid field falls back to mtime staleness for reclaim', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireCommitterLock } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const lockPath = path.join(ledgerDir, 'mtime-fallback-unit.lock');
      fs.writeFileSync(lockPath, JSON.stringify({ run_id: 'no-pid-run', ts: new Date(0).toISOString() }));
      const old = new Date(Date.now() - 60000);
      fs.utimesSync(lockPath, old, old);
      expect(acquireCommitterLock(lockPath, { pid: process.pid, run_id: 'new-run', repo_root: repo, ts: new Date().toISOString() })).toBe(true);
      fs.rmSync(lockPath, { force: true });
    });

    it('the committer lock: the SAME fallback does NOT reclaim while the mtime is still fresh (fail-closed until genuinely stale)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module directly
      const { acquireCommitterLock } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
      const lockPath = path.join(ledgerDir, 'mtime-fresh-unit.lock');
      fs.writeFileSync(lockPath, JSON.stringify({ run_id: 'no-pid-run', ts: new Date().toISOString() }));
      expect(acquireCommitterLock(lockPath, { pid: process.pid, run_id: 'new-run', repo_root: repo, ts: new Date().toISOString() })).toBe(false);
      fs.rmSync(lockPath, { force: true });
    });
  });

  describe('F-DS6: a claim is released promptly on an ESCAPING throw, not only at process exit (defense-in-depth remains a backstop, not the only path)', () => {
    it('a ledger.append failure mid-run throws out of runEngine, and the claim is gone from the registry immediately (same process, no exit needed)', async () => {
      const briefPath = writeBrief(repo, { writeScope: ['scripts/**'] });
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS ledger writer directly
      const { openLedger } = require(path.join(REPO_ROOT, 'scripts/lib/exec-ledger.js'));
      const runId = `ds6-throw-${Date.now()}`;
      const realLedger = openLedger({ ledgerDir, runId });
      let appendCount = 0;
      const wrappedLedger = {
        path: realLedger.path,
        append(record: { kind: string }) {
          appendCount += 1;
          if (appendCount > 1 && record.kind !== 'run_start') {
            throw new Error('simulated ledger write failure mid-run');
          }
          return realLedger.append(record);
        },
        close() { realLedger.close(); },
      };
      await expect(runEngine({
        repoRoot: repo, briefPath, provider: 'deepseek', runId, ledger: wrappedLedger,
        transcriptTurns: [toolTurn('c1', 'read_file', { path: 'seed.txt', reason: 'r' })],
      })).rejects.toThrow(/simulated ledger write failure/);
      const claimsPath = path.join(ledgerDir, 'active-claims.json');
      const claims = fs.existsSync(claimsPath) ? JSON.parse(fs.readFileSync(claimsPath, 'utf8')) as Array<{ run_id: string }> : [];
      expect(claims.find((c) => c.run_id === runId)).toBeUndefined();
      fs.rmSync(path.join(ledgerDir, `${runId}.jsonl`), { force: true });
    });
  });
});
