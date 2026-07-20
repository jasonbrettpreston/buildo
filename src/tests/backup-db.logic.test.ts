/**
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md
 *
 * Source-scan guardrail tests for scripts/backup-db.js.
 * These verify spec 47 protocol compliance and backup-specific invariants
 * without requiring a live database or S3-compatible credentials.
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
    // RUN_AT — the timestamp used in the object name and emitSummary —
    // must come from pipeline.getDbTimestamp (DB clock, per spec 47 §14.1).
    // new Date() is permitted for retention-cutoff arithmetic (not a DB
    // write) since those are not DB writes (B3 only bans new Date() when
    // producing timestamps written to the database).
    expect(source).toMatch(/pipeline\.getDbTimestamp/);
    // The RUN_AT assignment must use getDbTimestamp, not new Date()
    expect(source).not.toMatch(/RUN_AT\s*=\s*new\s+Date/);
  });

  it('imports @aws-sdk/client-s3 and @aws-sdk/lib-storage — not @google-cloud/storage', () => {
    const source = scriptSource();
    expect(source).toMatch(/@aws-sdk\/client-s3/);
    expect(source).toMatch(/@aws-sdk\/lib-storage/);
    expect(source).not.toMatch(/@google-cloud\/storage/);
  });

  it('includes SPEC LINK header pointing to spec 112', () => {
    const source = scriptSource();
    expect(source).toMatch(/SPEC LINK.*112_backup_recovery/);
  });
});

describe('backup-db.js — S3-compatible destination invariants (Spec 112 §2.1/§4.2)', () => {
  it('guards BACKUP_S3_* env vars before lock acquisition', () => {
    const source = scriptSource();
    // Guard must appear before withAdvisoryLock so a missing destination
    // throws SKIP before acquiring the lock (fail-fast, no wasted lock lifetime)
    const guardIdx = source.indexOf('BACKUP_S3_ENDPOINT');
    const lockIdx = source.indexOf('withAdvisoryLock');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(lockIdx);
  });

  it('SKIP guard checks all four BACKUP_S3_* vars, not just one', () => {
    const source = scriptSource();
    for (const varName of [
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_BUCKET',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
    ]) {
      expect(source).toContain(varName);
    }
    expect(source).toMatch(/skipped:\s*true/);
  });

  it('does NOT read the retired BACKUP_GCS_BUCKET / GOOGLE_APPLICATION_CREDENTIALS env vars', () => {
    const source = scriptSource();
    // Historical-reference comments mentioning the retired var name (e.g.
    // "mirrors the retired BACKUP_GCS_BUCKET guard") are fine — only an
    // actual read of the env var is banned.
    expect(source).not.toMatch(/process\.env\.BACKUP_GCS_BUCKET/);
    expect(source).not.toMatch(/process\.env\.GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it('reads SUPABASE_DATABASE_URL with DATABASE_URL fallback for the pg_dump target', () => {
    const source = scriptSource();
    expect(source).toMatch(/SUPABASE_DATABASE_URL/);
    expect(source).toMatch(
      /process\.env\.SUPABASE_DATABASE_URL\s*\|\|\s*process\.env\.DATABASE_URL/
    );
  });

  it('does not route pg_dump TLS through resolveSslConfig — uses isLocalMode only for the decision', () => {
    const source = scriptSource();
    expect(source).toMatch(/isLocalMode/);
    expect(source).not.toMatch(/resolveSslConfig/);
  });

  it('sets PGSSLMODE=verify-full and PGSSLROOTCERT for non-local pg_dump targets', () => {
    const source = scriptSource();
    expect(source).toMatch(/PGSSLMODE/);
    expect(source).toMatch(/verify-full/);
    expect(source).toMatch(/PGSSLROOTCERT/);
    expect(source).toMatch(/SUPABASE_CA_CERT_PATH/);
  });

  it('guards pg_dump exit racing the S3 upload with a pgDumpFailed flag, and aborts the upload on failure', () => {
    const source = scriptSource();
    expect(source).toMatch(/pgDumpFailed\s*=\s*false/);
    expect(source).toMatch(/pgDumpFailed\s*=\s*true/);
    expect(source).toMatch(/upload\.abort\(\)/);
  });

  it('writes a .manifest.json sidecar alongside the .dump object (Spec 112 §4.2 NEW)', () => {
    const source = scriptSource();
    expect(source).toMatch(/manifest\.json/);
    expect(source).toMatch(/manifestObjectName/);
  });

  it('manifest sidecar includes all six Spec 112 §4.2 baseline fields', () => {
    const source = scriptSource();
    expect(source).toMatch(/row_counts/);
    expect(source).toMatch(/invalid_geom_ids/);
    expect(source).toMatch(/sequence_values/);
    expect(source).toMatch(/mv_monthly_permit_stats_count/);
    expect(source).toMatch(/postgis_full_version/);
    expect(source).toMatch(/run_at/);
  });

  it('sources manifest baseline fields via scripts/validation/supabase-load-gates.js, not a duplicated query surface', () => {
    const source = scriptSource();
    expect(source).toMatch(/require\(['"]\.\/validation\/supabase-load-gates['"]\)/);
    expect(source).toMatch(/getBaseTables/);
    expect(source).toMatch(/getRowCounts/);
    expect(source).toMatch(/getInvalidGeomIds/);
    expect(source).toMatch(/getSequenceValues/);
    expect(source).toMatch(/getMatviewCount/);
    expect(source).toMatch(/getPostgisVersion/);
  });

  it('retention pruning is non-fatal: has try/catch with pipeline.log.warn on failure', () => {
    const source = scriptSource();
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

  it('records_meta uses dest_path (not the retired gcs_path field name)', () => {
    const source = scriptSource();
    expect(source).toMatch(/dest_path/);
    expect(source).not.toMatch(/gcs_path/);
  });

  it('records_meta includes manifest_path (Spec 112 §4.2 NEW output field)', () => {
    const source = scriptSource();
    expect(source).toMatch(/manifest_path/);
  });
});

describe('backup-db.js — F8 fold 2026-07-20 (Gemini findings)', () => {
  it('throws when backupSizeBytes is 0 after a nominally-successful upload', () => {
    const source = scriptSource();
    expect(source).toMatch(/backupSizeBytes\s*===\s*0/);
    const zeroByteBlock = source.slice(source.indexOf('backupSizeBytes === 0'));
    expect(zeroByteBlock.slice(0, 200)).toMatch(/throw new Error/);
  });

  it('uses pg-connection-string to parse the pg_dump target, not a hand-rolled new URL() parser', () => {
    const source = scriptSource();
    expect(source).toMatch(/require\(['"]pg-connection-string['"]\)/);
    expect(source).not.toMatch(/new URL\(connectionString\)/);
  });

  it('prune cutoff uses Date.now(), not RUN_AT (retention arithmetic is not a DB write)', () => {
    const source = scriptSource();
    const pruneBlock = source.slice(source.indexOf('Retention pruning'));
    expect(pruneBlock).toMatch(/new Date\(Date\.now\(\)\s*-\s*config\.retainDays/);
    expect(pruneBlock).not.toMatch(/RUN_AT\.getTime\(\)/);
  });

  it('listAllObjects filters page-by-page via an onPage callback rather than buffering the full listing', () => {
    const source = scriptSource();
    const fnBody = source.slice(
      source.indexOf('async function listAllObjects'),
      source.indexOf('async function listAllObjects') + 800
    );
    expect(fnBody).toMatch(/onPage/);
    expect(fnBody).not.toMatch(/const objects = \[\]/);
  });

  it('captures pg_dump stderr into the pgDumpError message on a non-zero exit', () => {
    const source = scriptSource();
    expect(source).toMatch(/stdio:\s*\[\s*'ignore',\s*'pipe',\s*'pipe'\s*\]/);
    expect(source).toMatch(/pgDumpStderrChunks/);
    expect(source).toMatch(/Buffer\.concat\(pgDumpStderrChunks\)/);
  });

  it('supports an optional BACKUP_S3_REGION env var, defaulting to "auto"', () => {
    const source = scriptSource();
    expect(source).toMatch(/BACKUP_S3_REGION/);
    expect(source).toMatch(/DEFAULT_S3_REGION\s*=\s*'auto'/);
  });

  it('does not contain the no-op .replace(\'Z\', \'Z\') (dead code removed)', () => {
    const source = scriptSource();
    expect(source).not.toMatch(/\.replace\(['"]Z['"],\s*['"]Z['"]\)/);
  });
});
