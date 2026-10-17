// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DF
//
// R-DF (operator 2026-10-17): McDonald's Airtight V3 is the final step standard. A
// ruling is admitted only when its register row is RECORDED (labelled V3) and
// OBSERVABLE (it names an existing lock file in backticks). This lock reads every
// Spec 124 §5 register row from R-CX on — the first row written under V3-final — and
// fails a row that carries no "McDonald's Airtight V3" label or whose backticked
// tokens name no file in the repo.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SPEC_124 = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md');
const FIRST_V3_FINAL_ROW = 'R-CX';
const LOCK_DIRS = ['src/tests', 'scripts'];

// Register ids sort like spreadsheet columns (R-Z < R-AA), so compare length first.
function idOrder(a: string, b: string): number {
  const x = a.slice(2);
  const y = b.slice(2);
  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
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

function v3FinalRows(): RegisterRow[] {
  const lines = fs.readFileSync(SPEC_124, 'utf8').split('\n');
  const rows: RegisterRow[] = [];
  for (const line of lines) {
    const m = /^\| (R-[A-Z]{2}) \|/.exec(line);
    const id = m?.[1];
    if (id && idOrder(id, FIRST_V3_FINAL_ROW) >= 0) rows.push({ id, text: line });
  }
  return rows;
}

describe('Spec 124 §5 R-DF — every V3-final register row is labelled and names a lock', () => {
  const files = LOCK_DIRS.flatMap((d) => listFiles(path.join(REPO_ROOT, d), []));
  const rows = v3FinalRows();

  it('finds the V3-final rows (R-CX on)', () => {
    expect(rows.map((r) => r.id)).toContain(FIRST_V3_FINAL_ROW);
    expect(rows.map((r) => r.id)).toContain('R-DF');
  });

  it("each row carries the McDonald's Airtight V3 label", () => {
    const unlabelled = rows.filter((r) => !r.text.includes("McDonald's Airtight V3")).map((r) => r.id);
    expect(unlabelled).toEqual([]);
  });

  it('each row names at least one existing lock file in backticks', () => {
    const lockless = rows
      .filter((r) => {
        const tokens = [...r.text.matchAll(/`([^`]+)`/g)].map((t) => t[1] ?? '');
        return !tokens.some((t) => namesExistingFile(t, files));
      })
      .map((r) => r.id);
    expect(lockless).toEqual([]);
  });

  it('RED direction — an unlabelled, lockless row is caught', () => {
    const files0 = ['src/tests/step-producer.logic.test.ts'];
    expect(namesExistingFile('step-producer.logic', files0)).toBe(true);
    expect(namesExistingFile('no-such-lock.logic', files0)).toBe(false);
    expect(namesExistingFile('pct <= N', files0)).toBe(false);
  });
});
