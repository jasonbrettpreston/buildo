// 🔗 SPEC LINK: docs/specs/00-architecture/01_database_schema.md §Migration needed
// 🔗 MIGRATION: migrations/084_entities_photo_drift_repair.sql
//
// Sibling of migration-083-drift-repair.infra.test.ts. Discovered
// during live verification of 083 that `entities.photo_url` column
// was ALSO missing (same class of historical drift as 039/067/078)
// and was blocking LEAD_FEED_SQL's builder CTE with
// `column e.photo_url does not exist` (pg code 42703). Migration 084
// replays 074's content idempotently.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../migrations/084_entities_photo_drift_repair.sql',
);

const source = fs.readFileSync(MIGRATION_PATH, 'utf-8');

describe('migration 084 — entities photo_url drift repair', () => {
  it('adds entities.photo_url with IF NOT EXISTS', () => {
    expect(source).toContain('ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500)');
  });

  it('adds entities.photo_validated_at with IF NOT EXISTS', () => {
    expect(source).toContain('ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_validated_at TIMESTAMPTZ');
  });

  it('adds the entities_photo_url_https CHECK constraint idempotently via pg_constraint lookup', () => {
    // PostgreSQL doesn't support `ALTER TABLE ADD CONSTRAINT IF NOT
    // EXISTS`. The DO block that checks pg_constraint first is the
    // idempotent pattern from 039's FK adds. Without this guard, a
    // re-run of 084 would fail with "constraint already exists".
    expect(source).toContain('pg_constraint WHERE conname = \'entities_photo_url_https\'');
    expect(source).toContain('entities_photo_url_https');
    expect(source).toMatch(/CHECK\s*\(\s*photo_url IS NULL OR photo_url LIKE 'https:\/\/%'\s*\)/);
  });

  it('has an ALLOW-DESTRUCTIVE DOWN block (matches migration 074)', () => {
    expect(source).toContain('-- DOWN');
    expect(source).toContain('-- ALLOW-DESTRUCTIVE');
    expect(source).toContain('-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_url');
    expect(source).toContain('-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_validated_at');
    expect(source).toContain('-- ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https');
  });

  it('documents the drift source + discovery context in the header', () => {
    expect(source).toContain('historical drift');
    expect(source).toContain('083');
    // The discovery context references the pg error that surfaced
    // during migration 083's live verification. Error message can
    // wrap across comment lines, so check for the distinctive
    // column reference rather than the exact text.
    expect(source).toContain('column e.photo_url');
  });
});
