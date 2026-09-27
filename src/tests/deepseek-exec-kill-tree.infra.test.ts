// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.9
//
// run_bash_command TIMEOUT on Windows: the kill takes down the process tree,
// and dispatch can never hang on a process that escaped it.
// Measured 2026-09-27 (operator push failed twice on the commit-9 clamp
// lock, 20 s timeout): `taskkill /pid <child> /T /F` snapshots the tree and
// then kills it; a process created in between by cmd.exe (outside any libuv
// job) escapes, keeps OUR inherited stdout pipe open, and dispatch waited on
// `close` until it exited (34-36 s against a 30 s fixture, 2 of 14 loaded
// trials). The escape itself is a load race; the HANG is reproduced
// deterministically below with a cmd.exe `start /b` pipe holder.
//
// Fixture start is not assumed: npm's own startup can exceed a short ceiling
// under load (the kill then lands before the fixture exists and the test
// would prove nothing). Each arm re-runs with a doubled ceiling until the
// fixture's pid file proves it started, and bounds time against THAT ceiling.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRepo, REPO_ROOT, cleanupTempDir } from './helpers/deepseek-exec-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly
const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));

const CEILINGS_MS = [1500, 3000, 6000, 12000];
// Budget for the kill + bounded post-kill wait on top of the ceiling. The
// pipe-holding fixtures live 9 s, so an unbounded wait on any of them blows
// this bound by seconds; the fixed code stays well inside it.
const KILL_BUDGET_MS = 5000;
const PID_LOG = 'children.log';

type Outcome = { toolResult: { ok: boolean; error?: { code: string; detail?: { orphan_output_holder?: boolean } } } };

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as { code?: string }).code === 'EPERM';
  }
}

describe.runIf(process.platform === 'win32')('run_bash_command TIMEOUT: tree killed, and no escaped pipe holder can hang dispatch (§C.1.9)', () => {
  let repo = '';
  let ledgerDir = '';
  const seenPids: number[] = [];

  function readPids(): number[] {
    const log = path.join(repo, PID_LOG);
    return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(Number) : [];
  }

  // Dispatch `npm run test` with a rising ceiling until the fixture has
  // provably started (its pid file exists); returns that attempt.
  async function runUntilStarted(): Promise<{ outcome: Outcome; elapsedMs: number; ceilingMs: number; pids: number[] }> {
    const realPolicy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
    for (const ceilingMs of CEILINGS_MS) {
      fs.rmSync(path.join(repo, PID_LOG), { force: true });
      const policy = { ...realPolicy, limits: { ...realPolicy.limits, timeout_ceiling_ms: ceilingMs } };
      const fakeLedger = { path: path.join(ledgerDir, 'unit.jsonl'), append: () => {}, close: () => {} };
      const tools = createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState: { readState: {} } });
      const startedAt = Date.now();
      const outcome: Outcome = await tools.dispatch('run_bash_command', { argv: ['npm', 'run', 'test'], timeout_ms: 999999999, reason: 'r' });
      const elapsedMs = Date.now() - startedAt;
      const pids = readPids();
      seenPids.push(...pids);
      if (pids.length > 0) {
        return { outcome, elapsedMs, ceilingMs, pids };
      }
    }
    throw new Error(`the fixture never started within a ${CEILINGS_MS[CEILINGS_MS.length - 1]}ms ceiling`);
  }

  beforeEach(() => {
    repo = makeRepo();
    // the fake ledger must live OUTSIDE the repo (the ledger dir is self-protected, §C.1.4)
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-killtree-ledger-'));
    seenPids.length = 0;
  });
  afterEach(() => {
    // never leave a fixture process behind, even when an assertion failed
    for (const pid of [...seenPids, ...readPids()]) {
      try { process.kill(pid); } catch { /* already gone */ }
    }
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  // A busy node spawner (its children sit in its libuv job): the kill must
  // leave none of them alive, and nothing is left holding the pipe.
  it('dispatch returns within ceiling + kill budget AND every spawned child is gone', async () => {
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'kill-tree', version: '1.0.0', scripts: { test: 'node spawner.js' } }));
    // Each child is `ping` (tiny) with INHERITED stdio — it holds our pipe.
    // Bounded: at most 150 children, and the spawner stops after 6 s.
    fs.writeFileSync(path.join(repo, 'spawner.js'), [
      "const { spawn } = require('child_process');",
      "const fs = require('fs');",
      `const log = require('path').join(__dirname, '${PID_LOG}');`,
      'let n = 0;',
      'const t = setInterval(() => {',
      "  const c = spawn('ping', ['-n', '10', '127.0.0.1'], { stdio: 'inherit' });",
      "  fs.appendFileSync(log, c.pid + '\\n');",
      '  if (++n >= 150) clearInterval(t);',
      '}, 40);',
      'setTimeout(() => clearInterval(t), 6000);',
    ].join('\n'));

    const { outcome, elapsedMs, ceilingMs, pids } = await runUntilStarted();

    expect(outcome.toolResult.error?.code, JSON.stringify(outcome.toolResult).slice(0, 600)).toBe('TIMEOUT');
    expect(elapsedMs, `dispatch took ${elapsedMs}ms at a ${ceilingMs}ms ceiling`).toBeLessThan(ceilingMs + KILL_BUDGET_MS);
    expect(pids.filter(isAlive), 'no spawned child outlives the kill').toEqual([]);
    expect(outcome.toolResult.error?.detail?.orphan_output_holder).toBe(false);
  }, 120000);

  // The pipe-holder case, deterministic: `start /b` makes cmd.exe create a
  // process OUTSIDE any libuv job (the parentage of the measured escape) that
  // inherits our stdout pipe, and cmd.exe exits at once. Before the fix,
  // dispatch waited on `close` until that holder exited (~9.6 s measured);
  // now the wait is bounded and the escape is RECORDED
  // (error.detail.orphan_output_holder), never silent. Its whole ancestor
  // chain is dead before the kill, so nothing can reach it by parent pid —
  // the documented limit (a Windows Job Object is the only full fix, filed);
  // the afterEach reaps it by its own pid.
  it('a pipe holder that escaped the kill cannot hang dispatch: bounded wait + orphan_output_holder recorded', async () => {
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'kill-tree', version: '1.0.0', scripts: { test: 'start /b node holder.js' } }));
    fs.writeFileSync(path.join(repo, 'holder.js'), [
      `require('fs').writeFileSync(require('path').join(__dirname, '${PID_LOG}'), process.pid + '\\n');`,
      'setTimeout(() => {}, 9000);',
    ].join('\n'));

    const { outcome, elapsedMs, ceilingMs, pids } = await runUntilStarted();

    expect(pids.length, 'the holder started (non-vacuous)').toBe(1);
    expect(outcome.toolResult.error?.code, JSON.stringify(outcome.toolResult).slice(0, 300)).toBe('TIMEOUT');
    expect(elapsedMs, `dispatch took ${elapsedMs}ms at a ${ceilingMs}ms ceiling`).toBeLessThan(ceilingMs + KILL_BUDGET_MS);
    expect(outcome.toolResult.error?.detail?.orphan_output_holder).toBe(true);
  }, 120000);
});
