/**
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md
 *
 * Source-scan guardrail tests for scripts/backup-db.js.
 * These verify spec 47 protocol compliance and backup-specific invariants
 * without requiring a live database or GCS credentials.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/backup-db.js');
const scriptSource = () => fs.readFileSync(SCRIPT_PATH, 'utf-8');

describe('backup-db.js — spec 47 protocol compliance', () => {
  it('declares ADVISORY_LOCK_ID = 112', () => {
    const source = scriptSource();
    expect(source).toMatch(/ADVISORY_LOCK_ID\s*=\s*112\b/);
  });

  it('uses pipeline.withAdvisoryLock for concurrency guard', () => {
    const source = scriptSource();
    expect(source).toMatch(/pipeline\.withAdvisoryLock/);
  });

  it('calls pipeline.emitSummary', () => {
    const source = scriptSource();
    expect(source).toMatch(/pipeline\.emitSummary/);
  });

  it('calls pipeline.emitMeta', () => {
    const source = scriptSource();
    expect(source).toMatch(/pipeline\.emitMeta/);
  });

  it('uses pipeline.getDbTimestamp (not bare new Date()) for the primary run timestamp', () => {
    const source = scriptSource();
    // RUN_AT — the timestamp used in the GCS object name and emitSummary —
    // must come from pipeline.getDbTimestamp (DB clock, per spec 47 §14.1).
    // new Date() is permitted for GCS date arithmetic (comparing timeCreated,
    // computing the retention cutoff) since those are not DB writes (B3 only
    // bans new Date() when producing timestamps written to the database).
    expect(source).toMatch(/pipeline\.getDbTimestamp/);
    // The RUN_AT assignment must use getDbTimestamp, not new Date()
    expect(source).not.toMatch(/RUN_AT\s*=\s*new\s+Date/);
  });

  it('imports @google-cloud/storage', () => {
    const source = scriptSource();
    expect(source).toMatch(/@google-cloud\/storage/);
  });

  it('includes SPEC LINK header pointing to spec 112', () => {
    const source = scriptSource();
    expect(source).toMatch(/SPEC LINK.*112_backup_recovery/);
  });
});

describe('backup-db.js — backup-specific invariants', () => {
  it('guards BACKUP_GCS_BUCKET env var before lock acquisition', () => {
    const source = scriptSource();
    // Guard must appear before withAdvisoryLock so a missing bucket
    // throws before acquiring the lock (fail-fast, no wasted lock lifetime)
    const guardIdx = source.indexOf('BACKUP_GCS_BUCKET');
    const lockIdx = source.indexOf('withAdvisoryLock');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(lockIdx);
  });

  it('guards pg_dump exit/finish race with pgDumpFailed flag', () => {
    const source = scriptSource();
    // pgDumpFailed must be declared and set to true in both the 'error' and
    // 'close' handlers, and the 'finish' handler must check it before resolving.
    // Without this guard a non-zero pg_dump exit races with GCS 'finish' and
    // the Promise resolves on a corrupt/partial object.
    expect(source).toMatch(/pgDumpFailed\s*=\s*false/);
    expect(source).toMatch(/pgDumpFailed\s*=\s*true/);
    expect(source).toMatch(/if\s*\(!pgDumpFailed\)\s*resolve\(\)/);
  });

  it('retention pruning is non-fatal: has try/catch with pipeline.log.warn on failure', () => {
    const source = scriptSource();
    // Prune failure must not abort the backup — the try/catch wraps the entire
    // pruning block and logs a warning rather than rethrowing.
    expect(source).toMatch(/BACKUP_RETAIN_DAYS|retain_days|blobs_pruned/);
    const pruneBlock = source.slice(source.indexOf('Retention pruning'));
    expect(pruneBlock).toMatch(/try\s*\{/);
    expect(pruneBlock).toMatch(/catch\s*\(/);
    expect(pruneBlock).toMatch(/pipeline\.log\.warn/);
  });

  it('audit_table includes a verdict field (not hardcoded PASS)', () => {
    const source = scriptSource();
    // audit_table.verdict must be computed from row statuses, not hardcoded
    const auditBlock = source.slice(source.indexOf('audit_table'));
    expect(auditBlock).toMatch(/verdict/);
    // Hardcoded 'PASS' as the sole verdict value is banned per spec 47 §8.2
    expect(auditBlock).not.toMatch(/verdict\s*:\s*['"]PASS['"]/);
  });
});
