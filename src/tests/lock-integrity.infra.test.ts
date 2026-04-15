/**
 * lock-integrity.infra.test.ts
 *
 * SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §5 Testing Mandate
 *
 * File-shape infra tests verifying that compute-cost-estimates.js implements
 * the advisory lock + SIGTERM concurrency contract from Spec 47 §5 and §8.
 *
 * All tests are deterministic file-reads — no live DB required.
 * This matches the infra test convention used by every other *.infra.test.ts
 * in this repo.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('compute-cost-estimates.js — advisory lock integrity (spec 47 §5)', () => {
  let script: string;

  beforeAll(() => {
    script = read('scripts/compute-cost-estimates.js');
  });

  // ─── Lock acquisition on dedicated client ───────────────────────────────────
  it('uses pool.connect() for lock (not pool.query — ephemeral connection)', () => {
    // pg advisory locks are session-scoped. pool.query() checks out an ephemeral
    // connection that returns to the pool after the query — the lock would be
    // released when the connection is reaped, not when the run ends.
    expect(script).toMatch(/const lockClient = await pool\.connect\(\)/);
  });

  it('queries pg_try_advisory_lock on lockClient (not pool.query)', () => {
    expect(script).toMatch(/lockClient\.query\([^)]*pg_try_advisory_lock/);
    expect(script).not.toMatch(/pool\.query\([^)]*pg_try_advisory_lock/);
  });

  it('queries pg_advisory_unlock on lockClient (not pool.query)', () => {
    expect(script).toMatch(/lockClient\.query\([^)]*pg_advisory_unlock/);
    expect(script).not.toMatch(/pool\.query\([^)]*pg_advisory_unlock/);
  });

  it('declares lockClientReleased = false immediately after pool.connect()', () => {
    expect(script).toMatch(/let lockClientReleased = false/);
  });

  // ─── Lock release in finally ────────────────────────────────────────────────
  it('releases lock in finally block using the same lockClient', () => {
    const finallyBlock = script.match(/\} finally \{[\s\S]*?lockClient\.release\(\)/)?.[0];
    expect(finallyBlock, 'finally block with lockClient.release() not found').toBeTruthy();
    expect(finallyBlock).toContain('pg_advisory_unlock');
    expect(finallyBlock).toContain('lockClientReleased');
  });

  it('guards lockClient.release() in finally with lockClientReleased flag', () => {
    const finallyBlock = script.match(/\} finally \{[\s\S]*?lockClient\.release\(\)/)?.[0] ?? '';
    // The release must be guarded by the flag — prevents double-release when
    // SIGTERM already released and set the flag to true.
    expect(finallyBlock).toMatch(/if\s*\(\s*!lockClientReleased\s*\)/);
  });

  it('sets lockClientReleased = true before lockClient.release() in finally', () => {
    const finallyBlock = script.match(/\} finally \{[\s\S]*?lockClient\.release\(\)/)?.[0] ?? '';
    // Find the position of assignment relative to release() call
    const assignPos = finallyBlock.lastIndexOf('lockClientReleased = true');
    const releasePos = finallyBlock.lastIndexOf('lockClient.release()');
    expect(assignPos, 'lockClientReleased = true not found in finally').toBeGreaterThan(-1);
    expect(assignPos).toBeLessThan(releasePos);
  });

  // ─── SIGTERM handler ────────────────────────────────────────────────────────
  it('registers process.on("SIGTERM") handler after pool.connect()', () => {
    const afterConnect = script.split('const lockClient = await pool.connect()')[1] ?? '';
    expect(afterConnect).toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('SIGTERM handler calls pg_advisory_unlock before exit', () => {
    const sigtermBlock = script.match(/process\.on\(\s*['"]SIGTERM['"][\s\S]*?process\.exit\(143\)/)?.[0] ?? '';
    expect(sigtermBlock, 'SIGTERM handler block not found').toBeTruthy();
    expect(sigtermBlock).toContain('pg_advisory_unlock');
  });

  it('SIGTERM handler catches unlock errors to avoid masking the exit (best-effort)', () => {
    const sigtermBlock = script.match(/process\.on\(\s*['"]SIGTERM['"][\s\S]*?process\.exit\(143\)/)?.[0] ?? '';
    // The pg_advisory_unlock inside SIGTERM must be wrapped in try/catch
    // so a DB error doesn't block process.exit(143).
    expect(sigtermBlock).toMatch(/try\s*\{[\s\S]*?pg_advisory_unlock[\s\S]*?\}\s*catch/);
  });

  it('SIGTERM handler sets lockClientReleased = true before releasing', () => {
    const sigtermBlock = script.match(/process\.on\(\s*['"]SIGTERM['"][\s\S]*?process\.exit\(143\)/)?.[0] ?? '';
    expect(sigtermBlock).toContain('lockClientReleased = true');
  });

  it('SIGTERM handler exits with code 143 (128 + SIGTERM signal 15)', () => {
    // 143 = 128 + 15. Correct signal-aware exit code for SIGTERM.
    expect(script).toMatch(/process\.exit\(143\)/);
  });

  // ─── Lock skip path ────────────────────────────────────────────────────────
  it('emits SKIP summary when lock is already held elsewhere', () => {
    const afterLock = script.split('pg_try_advisory_lock')[1] ?? '';
    const skipSection = afterLock.split('return;')[0] ?? '';
    expect(skipSection).toContain('emitSummary');
    expect(skipSection).toContain('advisory_lock_held_elsewhere');
  });

  it('releases lockClient before returning on lock skip (no leak)', () => {
    const afterLock = script.split('pg_try_advisory_lock')[1] ?? '';
    const skipSection = afterLock.split('return;')[0] ?? '';
    expect(skipSection).toContain('lockClientReleased = true');
    expect(skipSection).toContain('lockClient.release()');
  });

  // ─── Lock error path ────────────────────────────────────────────────────────
  it('releases lockClient and rethrows if pg_try_advisory_lock itself throws', () => {
    // The catch (lockErr) block must release the client and rethrow.
    // Split on the literal catch clause to get only its body.
    expect(script).toContain('} catch (lockErr)');
    const afterCatch = script.split('} catch (lockErr)')[1] ?? '';
    // Verify the catch body has the three required statements before the next }
    const catchBody = afterCatch.split(/\n\s*\}/)[0] ?? '';
    expect(catchBody, 'lockClientReleased not set in catch (lockErr)').toContain('lockClientReleased = true');
    expect(catchBody, 'lockClient.release() not in catch (lockErr)').toContain('lockClient.release()');
    expect(catchBody, 'throw lockErr not in catch (lockErr)').toContain('throw lockErr');
  });
});

describe('compute-cost-estimates.js — RUN_AT timestamp discipline (spec 47 §8)', () => {
  let script: string;

  beforeAll(() => {
    script = read('scripts/compute-cost-estimates.js');
  });

  it('captures RUN_AT from SELECT NOW() after lock — not before', () => {
    // RUN_AT after lock prevents midnight-cross drift: if the lock check
    // spans midnight, all batch writes use the same logical "run time".
    const afterLock = script.split('pg_advisory_unlock')[0] ?? '';
    // Check lock acquisition comes before RUN_AT
    const lockPos = afterLock.indexOf('pg_try_advisory_lock');
    const runAtPos = afterLock.indexOf('RUN_AT');
    expect(runAtPos).toBeGreaterThan(lockPos);
  });

  it('batch UPSERT uses RUN_AT parameter (not NOW() in SQL)', () => {
    // NOW() in a batched VALUES list would produce slightly different timestamps
    // for each batch if the run spans midnight. RUN_AT is captured once.
    // The ::timestamptz cast appears in valueGroups.push() (before INSERT INTO),
    // not inside the INSERT template itself — so we check the buildBulkUpsertSQL
    // function context broadly.
    const bulkFn = script.match(/function buildBulkUpsertSQL[\s\S]*?^}/m)?.[0] ?? '';
    expect(bulkFn, 'buildBulkUpsertSQL function not found').toBeTruthy();
    // No NOW() anywhere in the bulk builder (would bypass RUN_AT contract)
    expect(bulkFn).not.toMatch(/\bNOW\(\)/i);
    // The parameter placeholder for computed_at must have a ::timestamptz cast
    expect(bulkFn).toMatch(/::timestamptz/);
  });

  it('RUN_AT is passed through flushBatch as a parameter', () => {
    expect(script).toMatch(/flushBatch\(pool,\s*batch,\s*RUN_AT\)/);
    expect(script).toMatch(/async function flushBatch\s*\(\s*pool\s*,\s*rows\s*,\s*RUN_AT\s*\)/);
  });
});
