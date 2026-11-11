// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-62 follow-up: the processing sequence),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35; docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (values as data).
//
// MF-62 follow-up · McFrontend queue · lane E. Reads migrations/312_report_check_sequence.sql as text (no DB; the orchestrator's DB job applies it).
// Operator 2026-11-11 (verbatim, "Processing demo + choose-lot"): "the show report button shows before the animation is complete - also why do we
// need that button - after the each fact runs - we need to paude and then have somet the possibilities report for the address is ready and then
// transisiton.  Let's slow it down and make it more compelling."
//   (a) the two existing pace rows move to the seed defaults by UPDATEs guarded on the exact value they replace (precedent migration 238): an
//       operator-set value is never clobbered and a re-apply changes 0 rows; the description is byte-identical to the seed;
//   (b) the new hold row is inserted with the seed default and description, ON CONFLICT (variable_key) DO NOTHING;
//   (c) one transaction, no table altered, the DOWN comment-only.
// Each RED plant is an in-memory copy of the text, never a file edit.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATION = 'migrations/312_report_check_sequence.sql';
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json'));
const sql = (t: string): string => t.replace(/'/g, "''");
/** The values migration 306 first inserted (pinned there); each guarded UPDATE replaces exactly that value. */
const FROM: Record<string, number> = { report_check_min_ms: 6000, report_check_skip_after_ms: 2000 };
const NEW_KEY = 'report_check_ready_hold_ms';

export const migrationProblems = (s: string): string[] => {
  const up = upOf(s);
  const out: string[] = [];
  for (const [k, from] of Object.entries(FROM)) {
    const m = new RegExp(`UPDATE logic_variables\\s+SET variable_value = (\\d+),\\s+description = '((?:[^']|'')*)',\\s+updated_at = NOW\\(\\)\\s+WHERE variable_key = '${k}'\\s+AND variable_value = (\\d+);`).exec(up);
    if (!m) { out.push(`${k}: no guarded UPDATE`); continue; }
    if (Number(m[1]) !== SEED[k].default) out.push(`${k}: the new value is not the seed default`);
    if (m[2] !== sql(SEED[k].description)) out.push(`${k}: the description is not byte-identical to the seed`);
    if (Number(m[3]) !== from) out.push(`${k}: the guard is not the value 306 inserted (${from})`);
  }
  const ins = new RegExp(`INSERT INTO logic_variables \\(variable_key, variable_value, variable_value_json, description\\) VALUES\\s+\\('${NEW_KEY}', (\\d+), NULL, '((?:[^']|'')*)'\\)\\s+ON CONFLICT \\(variable_key\\) DO NOTHING;`).exec(up);
  if (!ins) out.push(`${NEW_KEY}: no INSERT ... ON CONFLICT DO NOTHING`);
  else {
    if (Number(ins[1]) !== SEED[NEW_KEY]?.default) out.push(`${NEW_KEY}: the value is not the seed default`);
    if (ins[2] !== sql(String(SEED[NEW_KEY]?.description))) out.push(`${NEW_KEY}: the description is not byte-identical to the seed`);
  }
  if (/ALTER TABLE|DROP |DELETE FROM/i.test(up)) out.push('a table altered or rows deleted');
  if (/UPDATE logic_variables[^;]*WHERE variable_key = '[^']+'\s*;/.test(up)) out.push('an unguarded UPDATE');
  if (!up.trim().startsWith('BEGIN;') || !up.trim().endsWith('COMMIT;')) out.push('not one transaction');
  const down = (s.split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1);
  if (down.some((l) => l.trim() !== '' && !l.trim().startsWith('--'))) out.push('a DOWN line is not a comment');
  return out;
};

describe('migration 312: the processing-sequence settings (data, not code)', () => {
  it('the seed holds the ruled sequence: 23000 (operator D-6: "it needs longer"), skip from the start, a 1500 ms hold; all three in "MaxBLD Report"', () => {
    expect(SEED.report_check_min_ms.default).toBe(23000);
    expect(SEED.report_check_skip_after_ms.default).toBe(0);
    expect(SEED[NEW_KEY]).toMatchObject({ default: 1500, type: 'number', min: 500, max: 5000, admin: { group: 'MaxBLD Report' } });
    expect(SEED[NEW_KEY].default).toBeLessThan(SEED.report_check_min_ms.default);
  });
  it('the committed migration is clean', () => {
    expect(migrationProblems(read(MIGRATION))).toEqual([]);
  });
  it('RED: an unguarded UPDATE (would clobber an operator-set value)', () => {
    expect(migrationProblems(read(MIGRATION).replace(/\s+AND variable_value = 6000;/, ';')).length).toBeGreaterThan(0);
  });
  it('RED: a value that is not the seed default', () => {
    expect(migrationProblems(read(MIGRATION).replace('SET variable_value = 23000', 'SET variable_value = 6000')).length).toBeGreaterThan(0);
  });
  it('RED: a description that drifts from the seed', () => {
    expect(migrationProblems(read(MIGRATION).replace(/(description = ')/, '$1x')).length).toBeGreaterThan(0);
  });
  it('RED: the hold inserted without ON CONFLICT DO NOTHING', () => {
    expect(migrationProblems(read(MIGRATION).replace(/\s+ON CONFLICT \(variable_key\) DO NOTHING;/, ';')).length).toBeGreaterThan(0);
  });
  it('RED: an uncommented DOWN line', () => {
    expect(migrationProblems(`${read(MIGRATION)}\nDELETE FROM logic_variables WHERE variable_key = '${NEW_KEY}';\n`).length).toBeGreaterThan(0);
  });
});
