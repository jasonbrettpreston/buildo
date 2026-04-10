// 🔗 SPEC LINK: scripts/migrate.js — WF3 2026-04-10 schema_migrations tracking
//
// File-shape tests for the migration runner. Verify the tracking table
// behaviour, checksum drift detection, and --verify / --force / --dry-run
// flags are wired. Matches the existing file-shape test convention used
// across *.infra.test.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/migrate.js — file shape', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/migrate.js'),
      'utf-8',
    );
  });

  it('creates schema_migrations tracking table if missing', () => {
    expect(content).toMatch(/CREATE TABLE IF NOT EXISTS schema_migrations/);
    expect(content).toMatch(/filename\s+TEXT PRIMARY KEY/);
    expect(content).toMatch(/checksum\s+TEXT NOT NULL/);
    expect(content).toMatch(/duration_ms\s+INTEGER NOT NULL/);
  });

  it('computes SHA-256 checksum of file contents', () => {
    expect(content).toMatch(/sha256/);
    expect(content).toMatch(/crypto\.createHash\(['"]sha256['"]\)/);
  });

  it('skips already-applied migrations when checksum matches', () => {
    expect(content).toMatch(/skippedCount/);
    expect(content).toMatch(/applied\.has\(file\)/);
  });

  it('warns on checksum drift instead of silently re-running', () => {
    expect(content).toMatch(/checksum has changed/);
    expect(content).toMatch(/--force/);
  });

  it('supports --force flag to re-run all migrations', () => {
    expect(content).toMatch(/process\.argv\.includes\(['"]--force['"]\)/);
  });

  it('supports --dry-run flag to preview without executing', () => {
    expect(content).toMatch(/process\.argv\.includes\(['"]--dry-run['"]\)/);
    expect(content).toMatch(/Would run/);
  });

  it('supports --verify flag for CI drift detection', () => {
    expect(content).toMatch(/process\.argv\.includes\(['"]--verify['"]\)/);
    expect(content).toMatch(/DRIFT/);
    expect(content).toMatch(/MISSING/);
  });

  it('--verify exits non-zero when drift or missing files detected', () => {
    // Match the verify-block exit path with a multiline regex
    expect(content).toMatch(/missing > 0 \|\| drift > 0[\s\S]*?process\.exit\(1\)/);
  });

  it('records applied migrations with filename, checksum, duration_ms', () => {
    expect(content).toMatch(/recordApplied/);
    expect(content).toMatch(/INSERT INTO schema_migrations/);
    expect(content).toMatch(/ON CONFLICT/);
  });

  it('preserves CONCURRENTLY handling for non-transactional index creation', () => {
    expect(content).toMatch(/CONCURRENTLY/);
    expect(content).toMatch(/splitTopLevelStatements/);
  });
});
