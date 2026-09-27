// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.4
//
// Engine-fence panel (DeepSeek security lens, 2026-09-27, grounded): the
// §C.1.4 self-protection denylist named exec-tools.js/exec-ledger.js but not
// the SIBLING fence modules those two require — exec-path.js (confinement +
// secret fence), exec-glob.js (the matcher every fence uses), exec-policy-match.js
// (the bash allowlist), exec-claims.js, exec-brief.js (write_scope parser),
// exec-env.js, exec-worktree.js (the F10 capture), exec-model.js — nor the
// shared lock harness. The engine could write and git_commit a weakened fence
// module that the NEXT run would load. The set is DERIVED from the directory
// (R-AN), so a new exec-*.js module is covered without retyping.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, writeBrief, ledgerRecords, cleanupTempDir,
} from './helpers/deepseek-exec-harness';

const fenceModules = fs.readdirSync(path.join(REPO_ROOT, 'scripts/lib'))
  .filter((f) => /^exec-.*\.js$/.test(f))
  .map((f) => `scripts/lib/${f}`);
const protectedTargets = [...fenceModules, 'src/tests/helpers/deepseek-exec-harness.ts'];

describe('self-protection covers every engine fence module (Spec 08 §C.1.4)', () => {
  let repo = '';
  let ledgerDir = '';
  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-selfprotect-ledger-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  it('the derived module set is the real one (not an empty glob)', () => {
    expect(fenceModules).toEqual(expect.arrayContaining([
      'scripts/lib/exec-tools.js', 'scripts/lib/exec-path.js', 'scripts/lib/exec-glob.js', 'scripts/lib/exec-policy-match.js',
    ]));
  });

  it.each(protectedTargets)('write_file(%s) is blocked PATH_DENIED, nothing written', async (p) => {
    const summary = await runEngine({
      repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir,
      transcriptTurns: [toolTurn('c1', 'write_file', { path: p, content: '// tampered\n', reason: 'r' })],
    });
    const call = ledgerRecords(ledgerDir, summary.run_id)
      .find((r) => r.kind === 'tool_call' && r.tool === 'write_file') as { status?: string; error?: { code: string } } | undefined;
    expect(call?.status).toBe('blocked');
    expect(call?.error?.code).toBe('PATH_DENIED');
    expect(fs.existsSync(path.join(repo, p))).toBe(false);
  });

  it('a non-engine scripts/lib module stays writable (no over-match)', async () => {
    const summary = await runEngine({
      repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir,
      transcriptTurns: [toolTurn('c1', 'write_file', { path: 'scripts/lib/executor-notes.js', content: '// ok\n', reason: 'r' })],
    });
    const call = ledgerRecords(ledgerDir, summary.run_id)
      .find((r) => r.kind === 'tool_call' && r.tool === 'write_file') as { status?: string } | undefined;
    expect(call?.status).toBe('ok');
  });
});
