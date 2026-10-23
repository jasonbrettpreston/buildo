// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D4, §D3
//
// T-PII — the CoA decision-notice table stores VALUES ONLY (Spec 129 §D3): no PDF, no notice text,
// no owner/agent name. This suite locks the two structural guards:
//   * the table's column set is EXACTLY the step-written allowlist (ROW_COLUMNS) + retired_at +
//     loaded_at — nothing else can be added without failing here; and
//   * the in-memory modules (parse/loader/manifest/pdf-text) never touch the disk or the console,
//     so a static scan proves the pipeline keeps raw text in memory only.
import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MIGRATION_REL = 'migrations/252_coa_notice_variances.sql';

const MIGRATION_SQL = fs.readFileSync(path.join(REPO_ROOT, MIGRATION_REL), 'utf8');
// Later migrations may only ADD allowlisted columns (284: doc_type, source_batch; Spec 129 §2b).
const LATER_MIGRATIONS = ['migrations/284_coa_notice_values_batch_family.sql'];
const ADDED_COLUMNS = LATER_MIGRATIONS.flatMap((rel) =>
  Array.from(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)\s/g)).map((m) => m[1]!),
);

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS loader owns the written columns
const LOADER = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa-notices.js')) as {
  ROW_COLUMNS: readonly string[];
};

/** The CREATE TABLE block for coa_notice_variances (up to the closing `);`). */
function createTableBlock(sql: string): string {
  const lines = sql.split('\n');
  const startIdx = lines.findIndex((l) => /CREATE TABLE[^;]*coa_notice_variances\s*\(/.test(l));
  if (startIdx === -1) throw new Error('CREATE TABLE coa_notice_variances not found');
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s*\)\s*;/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

const SQL_TYPE_RE =
  /^([a-z][a-z0-9_]*)\s+(TEXT|VARCHAR|CHAR|SMALLINT|INTEGER|BIGINT|NUMERIC|BOOLEAN|DATE|TIMESTAMPTZ|TIMESTAMP)\b/;

/**
 * Column names of the CREATE TABLE block: a line whose first token is a lowercase identifier
 * followed by a SQL type. CONSTRAINT / UNIQUE lines, their multi-line CHECK continuations (which
 * have no type token), and the closing paren are excluded.
 */
export function tableColumns(sql: string): string[] {
  const block = createTableBlock(sql);
  const out: string[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('CONSTRAINT')) continue;
    const m = SQL_TYPE_RE.exec(line);
    if (m) out.push(m[1]!);
  }
  return out;
}

function sorted(xs: Iterable<string>): string[] {
  return Array.from(xs).sort();
}

/** Strip block and line comments so a static token scan sees code only. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/[^\n]*/g, '');
}

const PURE_MODULES = [
  'scripts/lib/compute/load-coa-notices.js',
  'scripts/lib/coa-notices/parse-values.js',
  'scripts/lib/coa-notices/manifest.js',
  'scripts/lib/coa-notices/aic-values.js',
  'scripts/lib/pdf-text.js',
];

const FORBIDDEN_TOKENS = [
  "require('fs')",
  'require("fs")',
  'node:fs',
  'writeFile',
  'createWriteStream',
  'appendFile',
  'os.tmpdir',
  'mkdtemp',
  'child_process',
  'console.',
];

describe('T-PII coa-notice table stores values only', () => {
  it("T-PII-1a the table's columns are exactly the allowlist", () => {
    expect(sorted([...tableColumns(MIGRATION_SQL), ...ADDED_COLUMNS])).toEqual(
      sorted([...LOADER.ROW_COLUMNS, 'retired_at', 'loaded_at']),
    );
  });

  it('T-PII-1b a column outside the allowlist is caught', () => {
    const brokenSql = MIGRATION_SQL.replace(
      /(variance_key TEXT PRIMARY KEY,\n)/,
      '$1  owner_name TEXT NULL,\n',
    );
    expect(brokenSql).not.toBe(MIGRATION_SQL);
    const cols = tableColumns(brokenSql);
    const allow = sorted([...LOADER.ROW_COLUMNS, 'retired_at', 'loaded_at']);
    expect(sorted(cols)).not.toEqual(allow);
    const extra = sorted(cols).filter((c) => !allow.includes(c));
    expect(extra).toEqual(['owner_name']);
  });

  it('T-PII-1c no text-bearing column name', () => {
    const forbidden = /owner|agent|name$|address|text|body|sentence|description/;
    const offenders = tableColumns(MIGRATION_SQL).filter((c) => forbidden.test(c));
    expect(offenders).toEqual([]);
  });

  it('T-PII-4 the in-memory modules never touch the disk', () => {
    const offenders: string[] = [];
    for (const rel of PURE_MODULES) {
      const code = stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
      for (const token of FORBIDDEN_TOKENS) {
        if (code.includes(token)) offenders.push(`${rel}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
