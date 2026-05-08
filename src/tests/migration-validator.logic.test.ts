// Logic Layer Tests — Migration safety validator
// 🔗 SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §3.2 + spec 75 §7a
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const validator = require('../../scripts/validate-migration.js') as {
  validateMigration: (content: string, filename: string) => { ok: boolean; errors: string[]; warnings: string[] };
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

  it('passes DROP TABLE when ALLOW-DESTRUCTIVE marker is present alongside block comments', () => {
    const sql = wrap('/* header comment */\n-- ALLOW-DESTRUCTIVE: removing legacy table\n/* another comment */\nDROP TABLE legacy_thing;');
    const result = validateMigration(sql, 'migrations/003b_drop_ok_block_comment.sql');
    expect(result.ok).toBe(true);
  });

  it('fails DROP TABLE when ALLOW-DESTRUCTIVE is only inside a block comment', () => {
    const sql = wrap('/* -- ALLOW-DESTRUCTIVE */\nDROP TABLE permits;');
    const result = validateMigration(sql, 'migrations/003c_drop_blocked_comment.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DROP TABLE'))).toBe(true);
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

  // ─── Rule 5: FK-signature warning ────────────────────────────────────────────

  it('Rule 5: warns when CREATE TABLE has permit_num+revision_num but no FK', () => {
    const sql = wrap(
      `CREATE TABLE permit_notes (\n  id SERIAL PRIMARY KEY,\n  permit_num VARCHAR(30) NOT NULL,\n  revision_num VARCHAR(10) NOT NULL,\n  note TEXT\n);`,
    );
    const result = validateMigration(sql, 'migrations/200_permit_notes.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('permit_notes'))).toBe(true);
  });

  it('Rule 5: no warn when composite permit signature includes REFERENCES permits', () => {
    const sql = wrap(
      `CREATE TABLE permit_notes (\n  id SERIAL PRIMARY KEY,\n  permit_num VARCHAR(30) NOT NULL,\n  revision_num VARCHAR(10) NOT NULL,\n  note TEXT,\n  FOREIGN KEY (permit_num, revision_num) REFERENCES permits (permit_num, revision_num)\n);`,
    );
    const result = validateMigration(sql, 'migrations/201_permit_notes_fk.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('Rule 5: warns when CREATE TABLE has _id INTEGER column but no REFERENCES', () => {
    const sql = wrap(
      `CREATE TABLE job_items (\n  id SERIAL PRIMARY KEY,\n  builder_id INTEGER NOT NULL,\n  label TEXT\n);`,
    );
    const result = validateMigration(sql, 'migrations/202_job_items.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('job_items'))).toBe(true);
  });

  it('Rule 5: no warn when _id INTEGER column has REFERENCES', () => {
    const sql = wrap(
      `CREATE TABLE job_items (\n  id SERIAL PRIMARY KEY,\n  builder_id INTEGER NOT NULL REFERENCES builders (id),\n  label TEXT\n);`,
    );
    const result = validateMigration(sql, 'migrations/203_job_items_fk.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('Rule 5: -- FK-EXEMPT comment suppresses all warnings for the migration', () => {
    const sql =
      `-- FK-EXEMPT: staging table, FK added in next migration\n` +
      wrap(
        `CREATE TABLE permit_notes (\n  id SERIAL PRIMARY KEY,\n  permit_num VARCHAR(30) NOT NULL,\n  revision_num VARCHAR(10) NOT NULL\n);`,
      );
    const result = validateMigration(sql, 'migrations/204_fk_exempt.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('Rule 5: no warn for the permits table itself (parent-table exemption)', () => {
    const sql = wrap(
      `CREATE TABLE permits (\n  permit_num VARCHAR(30) NOT NULL,\n  revision_num VARCHAR(10) NOT NULL,\n  PRIMARY KEY (permit_num, revision_num)\n);`,
    );
    const result = validateMigration(sql, 'migrations/205_permits_parent.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('Rule 5: no warn for CREATE TABLE with no FK-signature columns', () => {
    const sql = wrap(
      `CREATE TABLE audit_log (\n  id SERIAL PRIMARY KEY,\n  event TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);`,
    );
    const result = validateMigration(sql, 'migrations/206_audit_log.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  // ─── B1: Rule 1 scoped to UP block only ──────────────────────────────────────

  it('B1 regression: DROP TABLE in DOWN does NOT trigger Rule 1 (but DOES trigger Rule 6)', () => {
    // Rule 1 (ALLOW-DESTRUCTIVE) is UP-scoped — DROP in DOWN must not fire it.
    // Rule 6 (no executable SQL in DOWN) IS file-wide — same input still fails
    // overall because the runner runs every line. Both invariants verified.
    const sql = `-- UP\nCREATE TABLE temp_thing (id SERIAL PRIMARY KEY);\n-- DOWN\nDROP TABLE IF EXISTS temp_thing;\n`;
    const result = validateMigration(sql, 'migrations/300_b1_down_regression.sql');
    expect(result.errors.some((e) => /DROP TABLE.*ALLOW-DESTRUCTIVE/.test(e))).toBe(false);
    expect(result.errors.some((e) => /DOWN.*executable|executable.*DOWN/i.test(e))).toBe(true);
  });

  it('B1 correctness: DROP TABLE in UP block still errors without ALLOW-DESTRUCTIVE', () => {
    const sql = `-- UP\nDROP TABLE permits;\n-- DOWN\n-- noop\n`;
    const result = validateMigration(sql, 'migrations/301_b1_up_correctness.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DROP TABLE'))).toBe(true);
  });

  it('B1 regression: TRUNCATE TABLE in DOWN does NOT trigger Rule 1 (but DOES trigger Rule 6)', () => {
    const sql = `-- UP\nCREATE TABLE temp_thing (id SERIAL PRIMARY KEY);\n-- DOWN\nTRUNCATE TABLE temp_thing;\nDROP TABLE IF EXISTS temp_thing;\n`;
    const result = validateMigration(sql, 'migrations/304_b1_truncate_down.sql');
    expect(result.errors.some((e) => /TRUNCATE.*ALLOW-DESTRUCTIVE/.test(e))).toBe(false);
    expect(result.errors.some((e) => /DOWN.*executable|executable.*DOWN/i.test(e))).toBe(true);
  });

  it('B1 regression: DROP COLUMN in DOWN does NOT trigger Rule 1 (but DOES trigger Rule 6)', () => {
    const sql = `-- UP\nALTER TABLE permits ADD COLUMN extra TEXT;\n-- DOWN\nALTER TABLE permits DROP COLUMN extra;\n`;
    const result = validateMigration(sql, 'migrations/305_b1_drop_col_down.sql');
    expect(result.errors.some((e) => /DROP COLUMN.*ALLOW-DESTRUCTIVE/.test(e))).toBe(false);
    expect(result.errors.some((e) => /DOWN.*executable|executable.*DOWN/i.test(e))).toBe(true);
  });

  it('B1 + allowDestructive: marker in DOWN block only does NOT exempt UP block drops', () => {
    const sql = `-- UP\nDROP TABLE permits;\n-- DOWN\n-- ALLOW-DESTRUCTIVE: rollback recreates it\nCREATE TABLE permits (permit_num TEXT);\n`;
    const result = validateMigration(sql, 'migrations/306_b1_allow_down_only.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DROP TABLE'))).toBe(true);
  });

  // ─── CONCURRENTLY-EXEMPT: Rule 2 suppression for grandfathered migrations ────

  it('CONCURRENTLY-EXEMPT: suppresses Rule 2 for CREATE INDEX on large table', () => {
    // DOWN content kept as a comment so Rule 6 doesn't fire — original test
    // intent was Rule 2 suppression, not DOWN-block content.
    const sql = `-- CONCURRENTLY-EXEMPT: grandfathered\n-- UP\nCREATE INDEX idx_permits_foo ON permits (foo);\n-- DOWN\n-- DROP INDEX IF EXISTS idx_permits_foo;\n`;
    const result = validateMigration(sql, 'migrations/307_concurrently_exempt.sql');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('CONCURRENTLY-EXEMPT inside block comment does NOT suppress Rule 2', () => {
    const sql = `/* -- CONCURRENTLY-EXEMPT */\n-- UP\nCREATE INDEX idx_permits_foo ON permits (foo);\n-- DOWN\nDROP INDEX IF EXISTS idx_permits_foo;\n`;
    const result = validateMigration(sql, 'migrations/308_concurrently_exempt_blockcomment.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('concurrently'))).toBe(true);
  });

  // ─── B2: PRIMARY KEY exclusion from Rule 5 integer-ID check ─────────────────

  it('B2: CREATE TABLE with *_id INTEGER PRIMARY KEY does NOT produce Rule 5 warning', () => {
    const sql = wrap(
      `CREATE TABLE address_points (\n  address_point_id INTEGER PRIMARY KEY,\n  latitude DECIMAL(10,7) NOT NULL,\n  longitude DECIMAL(10,7) NOT NULL\n);`,
    );
    const result = validateMigration(sql, 'migrations/302_b2_pk_no_warn.sql');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  // ─── A4: permit_history in LARGE_TABLES ──────────────────────────────────────

  it('A4: CREATE INDEX on permit_history without CONCURRENTLY produces Rule 2 error', () => {
    const sql = wrap(`CREATE INDEX idx_ph_test ON permit_history (permit_num);`);
    const result = validateMigration(sql, 'migrations/303_a4_permit_history.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('permit_history'))).toBe(true);
  });

  // ─── Rule 6: DOWN block must not contain executable SQL ─────────────────────
  // 🔗 Why this rule exists:
  //   `scripts/migrate.js` runs the entire SQL file as one batch (line 197).
  //   It does NOT parse `-- UP` / `-- DOWN` as section markers. Author intent
  //   that the DOWN block "only runs under db:migrate:down tooling" is a
  //   misunderstanding — the runner runs every line. Migration 118
  //   (commit 2901fcd) reintroduced this antipattern with a `RAISE EXCEPTION`
  //   block in DOWN, breaking CI on every push to main for 2 days.
  // 🔗 Prior precedent: commits 1da51e4 + 68643b3 commented out 18 migrations'
  //   DOWN blocks for the same reason. This rule prevents recurrence.

  it('Rule 6: fails when DOWN block contains uncommented INSERT', () => {
    const sql = `-- UP\nCREATE TABLE t (id INT);\n-- DOWN\nINSERT INTO schema_migrations (filename) VALUES ('rollback');\n`;
    const result = validateMigration(sql, 'migrations/400_rule6_insert_down.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /DOWN.*executable|executable.*DOWN/i.test(e))).toBe(true);
  });

  it('Rule 6: fails when DOWN block contains uncommented DO $$ ... END $$', () => {
    const sql =
      `-- UP\nCREATE TABLE t (id INT);\n` +
      `-- DOWN\nDO $$\nBEGIN\n  RAISE EXCEPTION USING MESSAGE = 'manual rollback required';\nEND $$;\n`;
    const result = validateMigration(sql, 'migrations/401_rule6_do_block_down.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /DOWN.*executable|executable.*DOWN/i.test(e))).toBe(true);
  });

  it('Rule 6: passes when DOWN block is all comments (canonical pattern)', () => {
    const sql =
      `-- UP\nCREATE TABLE t (id INT);\n` +
      `-- DOWN\n-- (commented out — scripts/migrate.js runs every line)\n-- DROP TABLE t;\n`;
    const result = validateMigration(sql, 'migrations/402_rule6_commented_down.sql');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('Rule 6: passes when DOWN block is empty', () => {
    const sql = `-- UP\nCREATE TABLE t (id INT);\n-- DOWN\n`;
    const result = validateMigration(sql, 'migrations/403_rule6_empty_down.sql');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('Rule 6: fails on benign-looking SELECT 1; in DOWN (still executable)', () => {
    // Mig 099's pre-fix shape — SELECT 1; is a no-op but it IS executed.
    // The rule rejects it for consistency: every line after `-- DOWN` must be a comment.
    const sql = `-- UP\nSELECT 1;\n-- DOWN\nSELECT 1;\n`;
    const result = validateMigration(sql, 'migrations/404_rule6_select1_down.sql');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /DOWN.*executable|executable.*DOWN/i.test(e))).toBe(true);
  });
});
