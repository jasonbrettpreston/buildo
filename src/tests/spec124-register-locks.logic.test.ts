// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DF
//
// R-DF (operator 2026-10-17): McDonald's Airtight V3 is the final step standard. A
// ruling is admitted only when its register row is RECORDED (labelled V3) and
// OBSERVABLE (it names an existing lock file in backticks). This lock reads EVERY
// Spec 124 §5 register row (the same row shape extractRegisterRulingIds reads, so
// R-A…R-Z, R-K.1, R-PACE-1 and the moved 124a LIVE REGISTER rows are all in scope)
// and fails a row that carries no "McDonald's Airtight V3" label or whose backticked
// tokens name no file in the repo. A row moved to a 124a LIVE REGISTER section for the
// byte budget (M32 on, Spec 124 §4 R-I(4)) stays in force and stays under this lock.
//
// Widened 2026-10-20 (operator y, consolidation 1-4; observe-1): the lock used to start
// at R-CX, the first row written under V3-final. Rows written before R-CX predate the
// label, so the ones that still fail sit on a closed, shrink-only grandfather list per
// arm: the list must equal exactly the rows that fail today (fix a row → remove it),
// and only a pre-R-CX row may ever be on it. Every row from R-CX on is checked as before.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SPEC_124 = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md');
const SPEC_124A = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md');
const LIVE_REGISTER_HEADING = /^## .*\(moved from Spec 124 §5\).*LIVE REGISTER/;
// Same row shape as scripts/analysis/spec-split-check.mjs REGISTER_ROW_RE (extractRegisterRulingIds).
const REGISTER_ROW = /^\|\s*(R-[A-Z]+(?:[.-][0-9]+)?)\s*\|/;
const FIRST_V3_FINAL_ROW = 'R-CX';
const LOCK_DIRS = ['src/tests', 'scripts'];

// Pre-R-CX rows with no "McDonald's Airtight V3" label (measured 2026-10-20: 101). Shrink-only.
const UNLABELLED_GRANDFATHERED = [
  'R-A', 'R-B', 'R-C', 'R-D', 'R-E', 'R-F', 'R-G', 'R-H', 'R-I', 'R-J', 'R-K', 'R-L', 'R-M', 'R-N', 'R-O', 'R-P', 'R-Q', 'R-R', 'R-T',
  'R-K.1', 'R-U', 'R-V', 'R-W', 'R-X', 'R-Y', 'R-Z', 'R-AA', 'R-AB', 'R-AC', 'R-AD', 'R-PACE-1', 'R-AE', 'R-AF', 'R-AG', 'R-AH', 'R-AI',
  'R-AJ', 'R-AK', 'R-AL', 'R-AM', 'R-AN', 'R-AO', 'R-AP', 'R-AQ', 'R-AQ.1', 'R-AR', 'R-AR.1', 'R-AS', 'R-AT', 'R-AU', 'R-AV', 'R-AW', 'R-AX',
  'R-AY', 'R-AZ', 'R-BA', 'R-BB', 'R-BC', 'R-BD', 'R-BE', 'R-BF', 'R-BG', 'R-BH', 'R-BJ', 'R-BK', 'R-BL', 'R-BM', 'R-BN', 'R-BO', 'R-BP',
  'R-BQ', 'R-BR', 'R-BS', 'R-BT', 'R-BU', 'R-BV', 'R-BW', 'R-BX', 'R-BY', 'R-CA', 'R-CB', 'R-CC', 'R-CD', 'R-CE', 'R-CF', 'R-CG', 'R-CH',
  'R-CI', 'R-CJ', 'R-CK', 'R-CL', 'R-CM', 'R-CN', 'R-CO', 'R-CP', 'R-CQ', 'R-CR', 'R-CS', 'R-CT', 'R-CU', 'R-CW',
];
// Pre-R-CX rows whose backticks name no existing lock file (measured 2026-10-20: 15). Shrink-only.
const LOCKLESS_GRANDFATHERED = [
  'R-E', 'R-F', 'R-I', 'R-J', 'R-N', 'R-O', 'R-AB', 'R-AC', 'R-BF', 'R-BT', 'R-BY', 'R-CA', 'R-CJ', 'R-CU', 'R-CV',
];

// Register ids sort like spreadsheet columns (R-Z < R-AA), so compare length first.
function idOrder(a: string, b: string): number {
  const x = a.slice(2);
  const y = b.slice(2);
  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
}

// A V3-final row is a two-letter id at or after R-CX, or an amendment of one (R-DF.1). Amendments are ordered by
// their base id, so R-K.1, R-AQ.1 and R-AR.1 (bases before R-CX) are not V3-final; R-PACE-1 is not a two-letter id.
// (verify-12 N5, operator y 2026-10-20 consolidation 1-4.)
function isV3Final(id: string): boolean {
  const m = /^(R-[A-Z]{2})(?:\.[0-9]+)?$/.exec(id);
  return !!m && idOrder(m[1]!, FIRST_V3_FINAL_ROW) >= 0;
}

function listFiles(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else out.push(path.relative(REPO_ROOT, full));
  }
  return out;
}

// A token names a lock when it is a repo path (an optional :line suffix dropped) or
// the leading part of a file basename under src/tests or scripts (`step-producer.logic`
// → src/tests/step-producer.logic.test.ts).
function namesExistingFile(token: string, files: string[]): boolean {
  const bare = token.replace(/:\d+(-\d+)?$/, '').replace(/\s.*$/, '');
  if (bare.length < 4) return false;
  if (bare.includes('/')) return fs.existsSync(path.join(REPO_ROOT, bare));
  return files.some((f) => {
    const base = path.basename(f);
    return base === bare || base.startsWith(`${bare}.`);
  });
}

type RegisterRow = { id: string; text: string };

// Spec 124's own lines, then the rows under 124a's LIVE REGISTER headings (the moved register blocks).
function registerLines(): string[] {
  const own = fs.readFileSync(SPEC_124, 'utf8').split('\n');
  const moved: string[] = [];
  let live = false;
  for (const line of fs.readFileSync(SPEC_124A, 'utf8').split('\n')) {
    if (/^#{1,2} /.test(line)) live = LIVE_REGISTER_HEADING.test(line);
    else if (live) moved.push(line);
  }
  return [...own, ...moved];
}

function registerRows(): RegisterRow[] {
  const rows: RegisterRow[] = [];
  for (const line of registerLines()) {
    const id = REGISTER_ROW.exec(line.trim())?.[1];
    if (id) rows.push({ id, text: line });
  }
  return rows;
}

const unlabelledIds = (rows: RegisterRow[]) => rows.filter((r) => !r.text.includes("McDonald's Airtight V3")).map((r) => r.id);
const locklessIds = (rows: RegisterRow[], files: string[]) =>
  rows
    .filter((r) => {
      const tokens = [...r.text.matchAll(/`([^`]+)`/g)].map((t) => t[1] ?? '');
      return !tokens.some((t) => namesExistingFile(t, files));
    })
    .map((r) => r.id);

describe('Spec 124 §5 R-DF — every register row is labelled and names a lock (pre-R-CX rows grandfathered, shrink-only)', () => {
  const files = LOCK_DIRS.flatMap((d) => listFiles(path.join(REPO_ROOT, d), []));
  const rows = registerRows();

  // rule-map: P4-3 (partial) — register rows parse with unique ids; statement/amends columns unchecked (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('reads every register row, the pre-V3 ones included', () => {
    const ids = rows.map((r) => r.id);
    for (const id of ['R-A', 'R-K.1', 'R-PACE-1', FIRST_V3_FINAL_ROW, 'R-DF', 'R-EY']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the rows moved to 124a (M32: R-CY…R-DE) under the lock', () => {
    const ids = rows.map((r) => r.id);
    for (const id of ['R-CY', 'R-CZ', 'R-DA', 'R-DB', 'R-DC', 'R-DD', 'R-DE']) expect(ids).toContain(id);
  });

  it("each row carries the McDonald's Airtight V3 label, or is a grandfathered pre-R-CX row", () => {
    expect(unlabelledIds(rows)).toEqual(UNLABELLED_GRANDFATHERED);
  });

  // rule-map: P4-4 (partial) — each row names an existing lock file; not both-directions or same-commit (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('each row names at least one existing lock file in backticks, or is a grandfathered pre-R-CX row', () => {
    expect(locklessIds(rows, files)).toEqual(LOCKLESS_GRANDFATHERED);
  });

  it('the grandfather lists hold only pre-R-CX rows (no V3-final row can be grandfathered)', () => {
    expect([...UNLABELLED_GRANDFATHERED, ...LOCKLESS_GRANDFATHERED].filter(isV3Final)).toEqual([]);
  });

  it('RED direction — an unlabelled, lockless row is caught', () => {
    const files0 = ['src/tests/step-producer.logic.test.ts'];
    expect(namesExistingFile('step-producer.logic', files0)).toBe(true);
    expect(namesExistingFile('no-such-lock.logic', files0)).toBe(false);
    expect(namesExistingFile('pct <= N', files0)).toBe(false);
  });

  it('RED direction — a new V3-final row with no label or lock is not absorbed by the grandfather lists', () => {
    const bad = { id: 'R-ZQ', text: '| R-ZQ | **A rule with no label and no lock.** | New | none |' };
    expect(unlabelledIds([...rows, bad])).not.toEqual(UNLABELLED_GRANDFATHERED);
    expect(locklessIds([...rows, bad], files)).not.toEqual(LOCKLESS_GRANDFATHERED);
    expect(isV3Final('R-ZQ')).toBe(true);
    expect(isV3Final('R-PACE-1')).toBe(false);
  });

  it('isV3Final reads amendment ids by their base: R-DF.1 is V3-final, R-AQ.1 / R-K.1 / R-AR.1 are not (verify-12 N5)', () => {
    expect(isV3Final('R-DF.1')).toBe(true);
    expect(isV3Final('R-CX.2')).toBe(true);
    expect(isV3Final('R-AQ.1')).toBe(false);
    expect(isV3Final('R-K.1')).toBe(false);
    expect(isV3Final('R-AR.1')).toBe(false);
    expect(isV3Final('R-DF.x')).toBe(false);
  });

  it('RED direction — a pre-R-CX row that drops its lock is caught (the list is closed, not a pattern)', () => {
    const dropped = rows.map((r) => (r.id === 'R-AD' ? { ...r, text: '| R-AD | **no lock** |' } : r));
    expect(locklessIds(dropped, files)).not.toEqual(LOCKLESS_GRANDFATHERED);
  });
});
