// Infra Layer Tests — Migration 074 (entities photo_url + photo_validated_at)
// 🔗 SPEC LINK: docs/specs/00-architecture/01_database_schema.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '074_entities_photo_url.sql',
);

describe('Migration 074 — entities photo columns', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('has UP and DOWN blocks', () => {
    expect(sql).toMatch(/^--\s*UP\b/m);
    expect(sql).toMatch(/^--\s*DOWN\b/m);
  });

  it('adds photo_url VARCHAR(500) column', () => {
    expect(sql).toMatch(/ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_url VARCHAR\(500\)/);
  });

  it('adds photo_validated_at TIMESTAMPTZ column', () => {
    expect(sql).toMatch(/ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_validated_at TIMESTAMPTZ/);
  });

  it('adds HTTPS CHECK constraint allowing NULL', () => {
    expect(sql).toMatch(/CHECK \(photo_url IS NULL OR photo_url LIKE 'https:\/\/%'\)/);
  });

  it('DOWN block uses ALLOW-DESTRUCTIVE marker for DROP COLUMN', () => {
    expect(sql).toMatch(/--\s*ALLOW-DESTRUCTIVE/);
    // DROP COLUMN statements must appear in DOWN block (commented-out per convention)
    expect(sql).toMatch(/DROP COLUMN IF EXISTS photo_url/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS photo_validated_at/);
  });
});
