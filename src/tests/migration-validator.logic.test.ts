// Logic Layer Tests — Migration safety validator
// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §3.2 + spec 75 §7a
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const validator = require('../../scripts/validate-migration.js') as {
  validateMigration: (content: string, filename: string) => { ok: boolean; errors: string[] };
  LARGE_TABLES: string[];
};

const { validateMigration } = validator;

const wrap = (body: string): string => `-- UP\n${body}\n-- DOWN\n-- noop\n`;

describe('validateMigration', () => {
  it('passes a clean migration with UP/DOWN and a benign column add', () => {
    const sql = wrap('ALTER TABLE permits ADD COLUMN photo_url TEXT;');
    const result = validateMigration(sql, 'migrations/001_clean.sql');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when DROP TABLE has no ALLOW-DESTRUCTIVE marker', () => {
    const sql = wrap('DROP TABLE permits;');
    const result = validateMigration(sql, 'migrations/002_drop.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DROP TABLE'))).toBe(true);
  });

  it('passes DROP TABLE when ALLOW-DESTRUCTIVE marker is present', () => {
    const sql = wrap('-- ALLOW-DESTRUCTIVE: removing legacy table\nDROP TABLE legacy_thing;');
    const result = validateMigration(sql, 'migrations/003_drop_ok.sql');
    expect(result.ok).toBe(true);
  });

  it('fails when DROP COLUMN has no ALLOW-DESTRUCTIVE marker', () => {
    const sql = wrap('ALTER TABLE permits DROP COLUMN photo_url;');
    const result = validateMigration(sql, 'migrations/004_drop_col.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DROP COLUMN'))).toBe(true);
  });

  it('fails CREATE INDEX without CONCURRENTLY on permits', () => {
    const sql = wrap('CREATE INDEX idx_permits_foo ON permits (foo);');
    const result = validateMigration(sql, 'migrations/005_idx.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('concurrently'))).toBe(true);
  });

  it('passes CREATE INDEX without CONCURRENTLY on a small table', () => {
    const sql = wrap('CREATE INDEX idx_lead_views_user ON lead_views (user_id);');
    const result = validateMigration(sql, 'migrations/006_small_idx.sql');
    expect(result.ok).toBe(true);
  });

  it('passes CREATE INDEX CONCURRENTLY on permits', () => {
    const sql = wrap('CREATE INDEX CONCURRENTLY idx_permits_loc ON permits USING GIST (location);');
    const result = validateMigration(sql, 'migrations/007_concurrent.sql');
    expect(result.ok).toBe(true);
  });

  it('passes CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS on permit_trades', () => {
    const sql = wrap(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_uniq ON permit_trades (permit_num, trade_slug);',
    );
    const result = validateMigration(sql, 'migrations/008_uniq.sql');
    expect(result.ok).toBe(true);
  });

  it('fails ALTER TABLE ADD COLUMN NOT NULL without DEFAULT', () => {
    const sql = wrap('ALTER TABLE permits ADD COLUMN foo TEXT NOT NULL;');
    const result = validateMigration(sql, 'migrations/009_notnull.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('NOT NULL'))).toBe(true);
  });

  it('passes ALTER TABLE ADD COLUMN NOT NULL DEFAULT', () => {
    const sql = wrap("ALTER TABLE permits ADD COLUMN foo TEXT NOT NULL DEFAULT '';");
    const result = validateMigration(sql, 'migrations/010_notnull_def.sql');
    expect(result.ok).toBe(true);
  });

  it('fails when missing UP block', () => {
    const sql = '-- DOWN\nDROP INDEX idx_foo;\n';
    const result = validateMigration(sql, 'migrations/011_no_up.sql');
    expect(result.ok).toBe(false);
    const firstError = result.errors[0]!;
    expect(result.errors.some((e) => e.includes("missing '-- UP'"))).toBe(true);
    expect(firstError.length).toBeGreaterThan(0);
  });

  it('fails when missing DOWN block', () => {
    const sql = '-- UP\nALTER TABLE permits ADD COLUMN bar TEXT;\n';
    const result = validateMigration(sql, 'migrations/012_no_down.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("missing '-- DOWN'"))).toBe(true);
  });

  it('ignores DROP TABLE inside a line comment', () => {
    const sql = wrap('-- DROP TABLE permits;\nALTER TABLE permits ADD COLUMN baz INT;');
    const result = validateMigration(sql, 'migrations/013_commented.sql');
    expect(result.ok).toBe(true);
  });

  it('passes ALTER TABLE DROP COLUMN with ALLOW-DESTRUCTIVE marker', () => {
    const sql = wrap('-- ALLOW-DESTRUCTIVE\nALTER TABLE permits DROP COLUMN photo_url;');
    const result = validateMigration(sql, 'migrations/014_drop_col_ok.sql');
    expect(result.ok).toBe(true);
  });

  it('fails multi-clause ADD COLUMN where later clause lacks DEFAULT', () => {
    const sql = wrap('ALTER TABLE permits ADD COLUMN a INT, ADD COLUMN b TEXT NOT NULL;');
    const result = validateMigration(sql, 'migrations/015_multi.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('NOT NULL'))).toBe(true);
  });

  it('fails multi-clause ADD COLUMN where first clause is the offender', () => {
    const sql = wrap("ALTER TABLE permits ADD COLUMN a TEXT NOT NULL, ADD COLUMN b INT DEFAULT 0;");
    const result = validateMigration(sql, 'migrations/016_multi_first.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('NOT NULL'))).toBe(true);
  });

  it('passes multi-clause ADD COLUMN where all NOT NULL clauses have DEFAULT', () => {
    const sql = wrap(
      "ALTER TABLE permits ADD COLUMN a INT DEFAULT 0 NOT NULL, ADD COLUMN b TEXT NOT NULL DEFAULT '';",
    );
    const result = validateMigration(sql, 'migrations/017_multi_ok.sql');
    expect(result.ok).toBe(true);
  });

  it('fails CREATE INDEX on permits with no terminating semicolon (end of file)', () => {
    const sql = '-- UP\nCREATE INDEX idx_permits_foo ON permits (foo)\n-- DOWN\n-- noop\n';
    // No semicolon before -- DOWN; the indexRe must still catch this.
    const result = validateMigration(sql, 'migrations/018_no_semi.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('concurrently'))).toBe(true);
  });

  it('fails TRUNCATE TABLE without ALLOW-DESTRUCTIVE marker', () => {
    const sql = wrap('TRUNCATE TABLE permits;');
    const result = validateMigration(sql, 'migrations/019_truncate.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('TRUNCATE'))).toBe(true);
  });

  it('passes when CREATE INDEX is inside a block comment', () => {
    const sql = wrap('/* CREATE INDEX idx_bad ON permits (col); */\nALTER TABLE permits ADD COLUMN q INT;');
    const result = validateMigration(sql, 'migrations/020_block_comment.sql');
    expect(result.ok).toBe(true);
  });

  it('does not false-positive on -- inside a string literal', () => {
    const sql = wrap("INSERT INTO logs (msg) VALUES ('x -- DROP TABLE permits');");
    const result = validateMigration(sql, 'migrations/021_string_dashdash.sql');
    expect(result.ok).toBe(true);
  });

  it('runCli exits non-zero when no files provided', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const v = require('../../scripts/validate-migration.js') as {
      runCli: (argv: string[]) => number;
    };
    const code = v.runCli([]);
    expect(code).toBe(1);
  });
});
