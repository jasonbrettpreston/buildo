// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-A: a retired variable's row is deleted; present = WARN, absent = INFO);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md (MB-31 ledger L31-10, MB-31 plan section 12: "deleted by MB-35 with a dump")
//
// MB-35 attempt 4 b5 STOP (2026-11-12): both runs ended completed_with_warnings, 22 x retired_var_row_present. The 22 retired names of
// compute_maxbld_scenarios (descriptor config.retired) were inserted by migrations 283 and 286 and nothing removed them. RED FIRST on
// 57a8995d3. The lock: replaying the migrations in order (an INSERT INTO logic_variables adds the names it lists, a DELETE FROM
// logic_variables removes them), no retired name is left; and the seed file holds none of them, so no seed run re-inserts one.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON surface
const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const D = JSON.parse(read('scripts/compute-maxbld-scenarios.descriptor.json')) as Json;
const RETIRED = (D.config.retired as Json[]).map((r) => String(r.name));

/**
 * A migration's statements: split on ';' OUTSIDE single-quoted strings ('' is an escaped quote; descriptions carry ';'), with line
 * comments dropped outside strings (the DOWN block is comments only, rule 6 of validate-migration.js).
 */
function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i] as string;
    if (inStr) {
      cur += ch;
      if (ch === "'") { if (sql[i + 1] === "'") { cur += "'"; i += 1; } else inStr = false; }
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i += 1; cur += '\n'; continue; }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === ';') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** The logic_variables keys live after replaying every migration in file order. */
function liveAfterMigrations(names: string[]): Set<string> {
  const live = new Set<string>();
  const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    for (const stmt of statements(read(`migrations/${f}`))) {
      const insert = /INSERT\s+INTO\s+(?:public\.)?logic_variables\b/i.test(stmt);
      const del = /DELETE\s+FROM\s+(?:public\.)?logic_variables\b/i.test(stmt);
      if (!insert && !del) continue;
      for (const n of names) {
        if (!stmt.includes(`'${n}'`)) continue;
        if (insert) live.add(n);
        else live.delete(n);
      }
    }
  }
  return live;
}

describe('MB-35 b5 STOP: retired compute_maxbld_scenarios variables do not linger', () => {
  it('the descriptor retires the 22 old-engine names (L31-10)', () => {
    expect(RETIRED).toHaveLength(22);
    expect(RETIRED.every((n) => n.startsWith('compute_maxbld_scenarios_'))).toBe(true);
    expect(RETIRED).not.toContain('compute_maxbld_scenarios_batch_size');
  });
  it('replaying the migrations leaves no retired name in logic_variables, and the live batch size stays', () => {
    const live = liveAfterMigrations([...RETIRED, 'compute_maxbld_scenarios_batch_size']);
    expect([...live].filter((n) => RETIRED.includes(n)).sort()).toEqual([]);
    expect(live.has('compute_maxbld_scenarios_batch_size')).toBe(true);
  });
  it('the seed file holds no retired name (no seed run re-inserts one)', () => {
    const seed = JSON.parse(read('scripts/seeds/logic_variables.json')) as Json;
    expect(RETIRED.filter((n) => Object.prototype.hasOwnProperty.call(seed, n))).toEqual([]);
  });
});
