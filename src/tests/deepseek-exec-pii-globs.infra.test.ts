// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.6.2
// Engine fence F4 — PII paths are claude-only. `claude_only_globs` gains
// `src/app/api/user-profile/**` and `src/app/api/admin/users/**` (the §B
// money/auth/PII downgrade enforced as `PATH_CLAUDE_ONLY`), measured in
// docs/reports/2026-09-27-engine-pii-path-map.md ("Orchestrator adjudication").
// RED TODAY: arms 1-3 fail until those two globs land in exec-policy.json;
// arm 4 (the no-over-match direction) already passes and must stay passing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, writeBrief, ledgerRecords, cleanupTempDir, type Turn,
} from './helpers/deepseek-exec-harness';

const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
const claudeOnlyGlobs: string[] = policy.claude_only_globs;

// The two globs fence F4 lands (docs/reports/2026-09-27-engine-pii-path-map.md).
const PII_GLOBS = ['src/app/api/user-profile/**', 'src/app/api/admin/users/**'];

describe('F4: PII paths are claude-only (Spec 08 §B, §C.6.2)', () => {
  let repo = '';
  let ledgerDir = '';

  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-f4-ledger-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  function run(transcriptTurns: Turn[]) {
    return runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, transcriptTurns });
  }
  function toolCallOf(records: Array<Record<string, unknown>>, tool: string, index = 0) {
    return records.filter((r) => r.kind === 'tool_call' && r.tool === tool)[index] as
      { status?: string; error?: { code: string }; result_summary?: Record<string, unknown> } | undefined;
  }

  it('arm 1: claude_only_globs contains both new PII globs', () => {
    expect(claudeOnlyGlobs).toEqual(expect.arrayContaining(PII_GLOBS));
  });

  it.each([
    'src/app/api/user-profile/route.ts',
    'src/app/api/user-profile/delete/route.ts',
    'src/app/api/admin/users/route.ts',
    'src/app/api/admin/users/[uid]/subscription/events/route.ts',
  ])('arm 2: write_file to %s is blocked PATH_CLAUDE_ONLY even under write_scope **', async (p) => {
    const res = await run([toolTurn('w1', 'write_file', { path: p, content: 'x\n', reason: 'r' })]);
    const call = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'write_file');
    expect(call?.status).toBe('blocked');
    expect(call?.error?.code).toBe('PATH_CLAUDE_ONLY');
    expect(fs.existsSync(path.join(repo, p))).toBe(false);
  });

  it('arm 3: edit_file to a seeded claude-only PII path is blocked PATH_CLAUDE_ONLY and leaves the file untouched', async () => {
    const target = 'src/app/api/admin/users/route.ts';
    fs.mkdirSync(path.join(repo, 'src/app/api/admin/users'), { recursive: true });
    fs.writeFileSync(path.join(repo, target), 'a\n');
    const res = await run([
      toolTurn('r1', 'read_file', { path: target, reason: 'r' }),
      toolTurn('e1', 'edit_file', { path: target, old_string: 'a', new_string: 'b', reason: 'r' }),
    ]);
    const call = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'edit_file');
    expect(call?.status).toBe('blocked');
    expect(call?.error?.code).toBe('PATH_CLAUDE_ONLY');
    expect(fs.readFileSync(path.join(repo, target), 'utf8')).toBe('a\n');
  });

  // F4b (operator ruling 2026-09-27, docs/reports/2026-09-27-engine-pii-path-map.md):
  // one blocked-write arm per glob class — a literal file and a `**` glob each.
  it.each([
    ['business-contact writer (literal)', 'src/lib/builders/extract-contacts.ts'],
    ['business-contact writer (**)', 'src/lib/enrichment/serper-client.ts'],
    ['business-contact loader script (literal)', 'scripts/enrich-wsib.js'],
    ['payment route (**)', 'src/app/api/webhooks/stripe/route.ts'],
    ['payment route (**, nested)', 'src/app/api/subscribe/exchange/route.ts'],
    ['PII-redaction fence (literal)', 'src/lib/api/public-projections.ts'],
    ['PII-redaction fence (literal, mobile)', 'mobile/src/lib/persistFilter.ts'],
  ])('F4b arm: %s — write_file to %s is blocked PATH_CLAUDE_ONLY', async (_cls, p) => {
    const res = await run([toolTurn('w1', 'write_file', { path: p, content: 'x\n', reason: 'r' })]);
    const call = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'write_file');
    expect(call?.status).toBe('blocked');
    expect(call?.error?.code).toBe('PATH_CLAUDE_ONLY');
    expect(fs.existsSync(path.join(repo, p))).toBe(false);
  });

  it.each([
    // Left engine-writable by the same ruling: converted-step code fed by the
    // public WSIB CSV, a sibling of a fenced literal, and a read-only consumer.
    'scripts/load-wsib.js',
    'scripts/lib/compute/link-wsib.js',
    'src/lib/builders/normalize.ts',
    'src/lib/admin/github-dispatch.ts',
    'src/features/leads/lib/get-lead-feed.ts',
  ])('F4b arm (stays open): write_file to %s is allowed', async (p) => {
    const res = await run([toolTurn('w1', 'write_file', { path: p, content: 'x\n', reason: 'r' })]);
    expect(toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'write_file')?.status).toBe('ok');
  });

  it.each([
    'src/app/api/admin/user-stats/route.ts',
    'src/app/api/user-profiles-public/route.ts',
    'src/app/api/admin/users.ts',
  ])('arm 4 (no over-match): write_file to %s is allowed', async (p) => {
    const res = await run([toolTurn('w1', 'write_file', { path: p, content: 'x\n', reason: 'r' })]);
    const call = toolCallOf(ledgerRecords(ledgerDir, res.run_id), 'write_file');
    expect(call?.status).toBe('ok');
  });
});
