// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §7 (migrate.js is the only schema authority)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EU (operator y 2026-10-20)
//
// R-EU: `node scripts/migrate.js --only=271,272,278 [--dry-run]` applies exactly the listed
// migration files, through the same per-file transaction and the same schema_migrations row, and REFUSES
// (before any file runs) when a listed file references an object or logic-variable key that an unapplied,
// unlisted EARLIER file creates. The selection is the pure module scripts/lib/migrate-select.js; this suite
// drives it with fixture SQL and with the real migrations/ files under a fixture applied-map. No database.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS module */
const sel = require(path.join(process.cwd(), 'scripts/lib/migrate-select.js')) as {
  parseOnly: (raw: unknown) => number[];
  fileNumber: (f: string) => number | null;
  createdObjects: (sql: string) => Set<string>;
  selectOnly: (a: { files: string[]; applied: Map<string, string>; only: number[]; readSql: (f: string) => string; checksum: (s: string) => string }) => {
    ok: boolean; run: string[]; skip: string[]; held: string[]; refusals: string[];
  };
  onlyFlagRefusal: (a: { force: boolean; verify: boolean }) => string | null;
};

const sum = (s: string) => `sum:${s.length}`;
const FIX: Record<string, string> = {
  '270_a.sql': "INSERT INTO logic_variables (variable_key, variable_value) VALUES ('a_key', 1) ON CONFLICT DO NOTHING;",
  '271_b.sql': "-- reads nothing held\nINSERT INTO logic_variables (variable_key, variable_value) VALUES ('b_key', 2) ON CONFLICT DO NOTHING;",
  '272_c.sql': "CREATE TABLE IF NOT EXISTS c_table (id int);\nALTER TABLE c_table ADD COLUMN IF NOT EXISTS c_col text;\nINSERT INTO logic_variables (variable_key, variable_value) VALUES\n  ('c_key', 3),\n  ('c_key_two', 4)\nON CONFLICT DO NOTHING;",
  '273_d.sql': "INSERT INTO logic_variables (variable_key, variable_value, description)\nSELECT 'd_key', COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'old_d'), 5), 'x'\nON CONFLICT DO NOTHING;",
  '274_uses_c.sql': "UPDATE logic_variables SET variable_value = 9 WHERE variable_key = 'c_key';",
  '275_uses_table.sql': 'INSERT INTO c_table (id) VALUES (1);',
  '276_comment_only.sql': "-- mentions c_table in a comment only\nINSERT INTO logic_variables (variable_key, variable_value) VALUES ('e_key', 6) ON CONFLICT DO NOTHING;",
};
const files = Object.keys(FIX).sort();
const readSql = (f: string) => FIX[f]!;
const appliedThrough = (n: number) => new Map(files.filter((f) => sel.fileNumber(f)! <= n).map((f) => [f, sum(FIX[f]!)]));

describe('R-EU — migrate.js --only=<n,…> applies chosen migrations only', () => {
  it('parses --only as a sorted, de-duplicated list of positive integers; anything else refuses', () => {
    expect(sel.parseOnly('278,272,271,272')).toEqual([271, 272, 278]);
    expect(() => sel.parseOnly('')).toThrow(/--only/);
    expect(() => sel.parseOnly(true)).toThrow(/--only/);
    expect(() => sel.parseOnly('271,abc')).toThrow(/--only/);
    expect(() => sel.parseOnly('0')).toThrow(/--only/);
    expect(sel.fileNumber('278_coa_logic_variables.sql')).toBe(278);
    expect(sel.fileNumber('README.sql')).toBeNull();
  });

  it('--only refuses alongside --force (re-run everything) and --verify (a read-only mode)', () => {
    expect(sel.onlyFlagRefusal({ force: true, verify: false })).toMatch(/--force/);
    expect(sel.onlyFlagRefusal({ force: false, verify: true })).toMatch(/--verify/);
    expect(sel.onlyFlagRefusal({ force: false, verify: false })).toBeNull();
  });

  it('createdObjects reads tables, columns and seeded logic-variable keys (first tuple element / SELECT form), never comments', () => {
    expect([...sel.createdObjects(FIX['272_c.sql']!)].sort()).toEqual(['c_col', 'c_key', 'c_key_two', 'c_table']);
    expect([...sel.createdObjects(FIX['273_d.sql']!)]).toEqual(['d_key']);
    expect(sel.createdObjects('-- CREATE TABLE ghost (id int);\nSELECT 1;').size).toBe(0);
  });

  it('GREEN: independent listed files run in order; the unlisted unapplied earlier files are reported as held', () => {
    const r = sel.selectOnly({ files, applied: appliedThrough(270), only: [271, 276], readSql, checksum: sum });
    expect(r).toMatchObject({ ok: true, run: ['271_b.sql', '276_comment_only.sql'], skip: [], held: ['272_c.sql', '273_d.sql', '274_uses_c.sql', '275_uses_table.sql'], refusals: [] });
  });

  it('RED: a listed file that uses a key or table an unapplied unlisted earlier file creates is refused, naming both', () => {
    const key = sel.selectOnly({ files, applied: appliedThrough(271), only: [274], readSql, checksum: sum });
    expect(key.ok).toBe(false);
    expect(key.run).toEqual([]);
    expect(key.refusals.join('\n')).toMatch(/274_uses_c\.sql depends on held 272_c\.sql \(c_key\)/);
    const table = sel.selectOnly({ files, applied: appliedThrough(271), only: [275], readSql, checksum: sum });
    expect(table.refusals.join('\n')).toMatch(/275_uses_table\.sql depends on held 272_c\.sql \(c_table\)/);
    // Listing the dependency too makes it legal (they run in file order).
    expect(sel.selectOnly({ files, applied: appliedThrough(271), only: [272, 274, 275], readSql, checksum: sum })).toMatchObject({ ok: true, run: ['272_c.sql', '274_uses_c.sql', '275_uses_table.sql'] });
  });

  it('an already-applied listed file is skipped when unchanged and refused on checksum drift; an unknown number refuses', () => {
    expect(sel.selectOnly({ files, applied: appliedThrough(272), only: [272, 273], readSql, checksum: sum })).toMatchObject({ ok: true, run: ['273_d.sql'], skip: ['272_c.sql'] });
    const drift = new Map(appliedThrough(272));
    drift.set('272_c.sql', 'sum:stale');
    expect(sel.selectOnly({ files, applied: drift, only: [272], readSql, checksum: sum }).refusals.join('\n')).toMatch(/272_c\.sql .*checksum/);
    expect(sel.selectOnly({ files, applied: appliedThrough(270), only: [299], readSql, checksum: sum }).refusals.join('\n')).toMatch(/no migration file numbered 299/);
  });

  it('the Night P4 case on the REAL files: 271, 272, 278 run; 274, 275, 276 are held; no dependency refusal', () => {
    const dir = path.join(process.cwd(), 'migrations');
    const real = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const realSql = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
    // Fixture applied-map: everything except 271, 272, 274, 275, 276, 278 (the dev DB state is NOT read).
    const pending = new Set([271, 272, 274, 275, 276, 278]);
    const applied = new Map(real.filter((f) => !pending.has(sel.fileNumber(f)!)).map((f) => [f, sum(realSql(f))]));
    const r = sel.selectOnly({ files: real, applied, only: [271, 272, 278], readSql: realSql, checksum: sum });
    expect(r.refusals).toEqual([]);
    expect(r.run.map((f) => sel.fileNumber(f))).toEqual([271, 272, 278]);
    expect(r.held.map((f) => sel.fileNumber(f))).toEqual([274, 275, 276]);
  });

  it('migrate.js wires --only through the pure selection, refuses before any file runs, and skips the seed loader under --only', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/migrate.js'), 'utf8');
    expect(src).toContain("require('./lib/migrate-select')");
    expect(src).toMatch(/selectOnly\(/);
    expect(src).toMatch(/onlyFlagRefusal\(/);
    // The seed loader inserts EVERY logic_variables.json key, held files' keys included — it must not run under --only.
    expect(src).toMatch(/if \(!dryRun && !verifyOnly && only === null\)/);
  });
});
