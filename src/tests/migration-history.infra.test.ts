// 🔗 SPEC LINK: docs/specs/00-architecture/01_database_schema.md §3 (migration discipline)
// Verifies that every foundational migration (001-040) has a documented DOWN block.
// DOWN blocks are commented SQL — they are never executed in production, but they
// document the rollback path and satisfy validate-migration.js discipline standards.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readdirSync } from 'node:fs';

const MIGRATIONS_DIR = path.resolve(__dirname, '../..', 'migrations');

function hasDOWNBlock(filename: string): boolean {
  const content = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
  return /^[ \t]*--[ \t]*DOWN\b/im.test(content);
}

describe('migrations 001-040 — DOWN block coverage', () => {
  // Collect every migration in the 001-040 range that exists on disk.
  const allFiles = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  const early = allFiles.filter(f => {
    const n = parseInt(f.slice(0, 3), 10);
    return n >= 1 && n <= 40;
  });

  it('found at least 35 migration files in range 001-040', () => {
    expect(early.length).toBeGreaterThanOrEqual(35);
  });

  for (const file of early) {
    it(`${file} has a -- DOWN block`, () => {
      expect(hasDOWNBlock(file)).toBe(true);
    });
  }
});
