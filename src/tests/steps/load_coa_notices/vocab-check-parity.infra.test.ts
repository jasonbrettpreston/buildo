// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D4, §D3
//
// T-VOCAB — the closed sets of the CoA decision-notice ingestor must equal the named CHECK
// constraints of migrations/252_coa_notice_variances.sql in BOTH directions: every value the
// migration accepts is a vocab value, and every vocab value is accepted by the migration. A set
// that drifts on either side silently admits rows the parser can never emit, or rejects rows the
// parser does emit (Spec 129 §D4/D5).
//
// This suite parses the migration TEXT (never a live DB) so it runs in the pure unit tier.
import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MIGRATION_REL = 'migrations/252_coa_notice_variances.sql';
// 256 REBUILDS chk_cnv_parse_status with one more closed value ('target_unit_mismatch'). The latest
// definition of a CHECK wins, so the parse_status set is read from 256 when it declares it.
const MIGRATION_LATEST_REL = 'migrations/256_coa_notice_target_unit_mismatch.sql';
const VOCAB_REL = 'scripts/lib/coa-notices/vocab.json';

const MIGRATION_SQL = fs.readFileSync(path.join(REPO_ROOT, MIGRATION_REL), 'utf8');
const MIGRATION_LATEST_SQL = fs.readFileSync(path.join(REPO_ROOT, MIGRATION_LATEST_REL), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON closed sets of the ingestor
const VOCAB = require(path.join(REPO_ROOT, VOCAB_REL)) as {
  check_backed: Record<string, string[]>;
};

/** Column name of a CHECK's IN-list → the vocab key that column's closed set belongs to. */
const COLUMN_TO_VOCAB_KEY: Record<string, string> = {
  source_family: 'source_family',
  parse_status: 'parse_status',
  parse_confidence: 'parse_confidence',
  target_status: 'target_status',
  decision: 'decision',
  decision_source: 'decision_source',
  citation_kind: 'citation_kind',
  required_unit: 'unit',
  proposed_unit: 'unit',
  bound: 'bound',
};

/** Strip `--` line comments (outside of string literals — the migration has none in CHECKs). */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/** Every `CONSTRAINT chk_cnv_<name> CHECK ( … )` block, with balanced parentheses. */
function extractCheckBlocks(sql: string): Array<{ name: string; body: string }> {
  const text = stripLineComments(sql);
  const out: Array<{ name: string; body: string }> = [];
  const re = /CONSTRAINT\s+chk_cnv_(\w+)\s+CHECK\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = re.lastIndex; // just past the opening '('
    let depth = 1;
    let i = start;
    for (; i < text.length && depth > 0; i += 1) {
      const ch = text[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    out.push({ name: m[1]!, body: text.slice(start, i - 1) });
  }
  return out;
}

/** The quoted values of every `IN ( 'a', 'b', … )` list inside a CHECK body, keyed by column. */
function inListsByColumn(checkBody: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /(\w+)\s+(?:NOT\s+)?IN\s*\(([^()]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(checkBody)) !== null) {
    const column = m[1]!;
    const values = Array.from(m[2]!.matchAll(/'([^']*)'/g)).map((x) => x[1]!);
    if (values.length === 0) continue;
    out[column] = Array.from(new Set(values)).sort();
  }
  return out;
}

/**
 * The CHECK-backed closed sets declared in the migration, keyed by vocab key. The two unit CHECKs
 * (`required_unit`, `proposed_unit`) both map to `unit` and must be identical.
 */
export function checkSetsFromSql(sql: string): Record<string, string[]> {
  const byColumn: Record<string, string[]> = {};
  for (const block of extractCheckBlocks(sql)) {
    for (const [column, values] of Object.entries(inListsByColumn(block.body))) {
      if (!(column in COLUMN_TO_VOCAB_KEY)) continue;
      byColumn[column] = values;
    }
  }
  if ('required_unit' in byColumn && 'proposed_unit' in byColumn) {
    expect(byColumn.required_unit).toEqual(byColumn.proposed_unit);
  }
  const sets: Record<string, string[]> = {};
  for (const [column, values] of Object.entries(byColumn)) {
    sets[COLUMN_TO_VOCAB_KEY[column]!] = values;
  }
  return sets;
}

/**
 * The CHECK-backed closed sets with the LATEST definition of every CHECK winning: 252 first, then
 * any CHECK 256 rebuilds (today only chk_cnv_parse_status) overlaid on top.
 */
export function checkSetsFromLatestSql(baseSql: string, latestSql: string): Record<string, string[]> {
  const sets = checkSetsFromSql(baseSql);
  for (const block of extractCheckBlocks(latestSql)) {
    for (const [column, values] of Object.entries(inListsByColumn(block.body))) {
      if (!(column in COLUMN_TO_VOCAB_KEY)) continue;
      sets[COLUMN_TO_VOCAB_KEY[column]!] = values;
    }
  }
  return sets;
}

/** Every value missing on either side, named. Empty ⇒ the two closed sets agree. */
export function parityProblems(
  sqlSets: Record<string, string[]>,
  vocabSets: Record<string, string[]>,
): string[] {
  const problems: string[] = [];
  const keys = new Set([...Object.keys(sqlSets), ...Object.keys(vocabSets)]);
  for (const key of Array.from(keys).sort()) {
    const sqlVals = new Set(sqlSets[key] ?? []);
    const vocabVals = new Set(vocabSets[key] ?? []);
    if (!(key in sqlSets)) {
      problems.push(`set '${key}' is missing from the migration CHECKs`);
      continue;
    }
    if (!(key in vocabSets)) {
      problems.push(`set '${key}' is missing from vocab.check_backed`);
      continue;
    }
    for (const v of Array.from(sqlVals).sort()) {
      if (!vocabVals.has(v)) problems.push(`CHECK value '${v}' of '${key}' is missing from vocab`);
    }
    for (const v of Array.from(vocabVals).sort()) {
      if (!sqlVals.has(v)) problems.push(`vocab value '${v}' of '${key}' is missing from the CHECK`);
    }
  }
  return problems;
}

function vocabSets(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(VOCAB.check_backed)) {
    out[key] = [...values].sort();
  }
  return out;
}

describe('T-VOCAB coa-notice closed sets == migration CHECKs', () => {
  it('T-VOCAB-1 every CHECK set equals its vocab set, both directions', () => {
    const problems = parityProblems(checkSetsFromLatestSql(MIGRATION_SQL, MIGRATION_LATEST_SQL), vocabSets());
    expect(problems).toEqual([]);
  });

  it('T-VOCAB-2 a CHECK value missing from vocab is caught', () => {
    const sqlSets = checkSetsFromLatestSql(MIGRATION_SQL, MIGRATION_LATEST_SQL);
    const broken = vocabSets();
    broken.parse_status = (broken.parse_status ?? []).filter((v) => v !== 'side_ambiguous');
    const problems = parityProblems(sqlSets, broken);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain('side_ambiguous');
  });

  it('T-VOCAB-3 a vocab value missing from the CHECK is caught', () => {
    const brokenSql = MIGRATION_SQL.replace("'refused', ", '');
    expect(brokenSql).not.toBe(MIGRATION_SQL);
    const problems = parityProblems(checkSetsFromLatestSql(brokenSql, MIGRATION_LATEST_SQL), vocabSets());
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain('refused');
  });

  it('T-VOCAB-4 the target CHECK pins the sentinels', () => {
    expect(MIGRATION_SQL).toContain('chk_cnv_target_coherent');
    expect(MIGRATION_SQL).toContain('chk_cnv_target_sentinel');
    expect(VOCAB.check_backed.target_status).toContain('unmapped');
    expect(VOCAB.check_backed.target_status).toContain('ambiguous');
  });
});
