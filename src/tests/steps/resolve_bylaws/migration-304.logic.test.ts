// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-379 (dated note 2026-11-11: D-6 re-ruled a, the option-view migration
//            304), M-465 (option view), M-494 (D5, the listed classes), M-60 (existing positions never move)
//
// MB-27 increment 4 (the Layer 2 night) · migration 304 · RED FIRST (absent on the parent). Written, NOT applied here: the increment-4
// night applies it alone first (--only=304 --dry-run first). The 297 form: the view only, the width and positions of 295 kept.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const RB = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
const SCOPE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/layer2-scope.json'), 'utf8'));
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const file = fs.readdirSync(path.join(ROOT, 'migrations')).find((f) => /^304_.*\.sql$/.test(f));
const SQL = file ? fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8') : '';
const SQL297 = fs.readFileSync(path.join(ROOT, 'migrations', fs.readdirSync(path.join(ROOT, 'migrations')).find((f) => /^297_.*\.sql$/.test(f)) as string), 'utf8');
// MB-27 increment 5 (named re-pin): migration 315 widens the encoder to 70; this file's text is the 61-wide era (54 base pairs + the 7 roof_form
// slots), so the encoder width is read with the increment-5 additions taken out (the new principal target and the suite_height slots).
const width = (RB.tailPairs ? RB.tailPairs(SCOPE).length : 0) + RB.scopePairs(SCOPE).filter((p: { target: string }) => p.target !== 'principal_coverage_path_b_pct').length + RB.optionPairs(SCOPE, VOCAB.design_options).filter((p: { option_name: string }) => p.option_name === 'roof_form').length;
const classesOf = (sql: string) => {
  const m = /bylaw_resolution_option_results[\s\S]*?CROSS JOIN \(VALUES ([^)]*\)(?:, \([^)]*\))*)\) AS c \(class\)/.exec(sql);
  return m ? [...String(m[1]).matchAll(/'([a-z_]+)'/g)].map((x) => String(x[1])) : [];
};
const viewBody = (sql: string) => {
  const m = /CREATE OR REPLACE VIEW bylaw_resolution_option_results AS([\s\S]*?);\s*\n/.exec(sql);
  return m ? String(m[1]) : '';
};

describe('migration 304 (written, not applied)', () => {
  it('exists as one file', () => {
    expect(typeof file).toBe('string');
    expect(String(file)).toMatch(/^304_resolve_bylaws_/);
  });
  it("lists exactly the scope's roof_form classes, the suite third (D-6 re-ruled a)", () => {
    expect(classesOf(SQL)).toEqual(SCOPE.options.roof_form.classes);
    expect(classesOf(SQL)).toEqual(['detached_house', 'detached_houseplex', 'house_with_secondary_suite']);
  });
  it('is the 297 view with the class list as its only change (the column list, width and override read kept)', () => {
    const same = (s: string) => s.replace(/CROSS JOIN \(VALUES \('detached_house'\)[^\n]*AS c \(class\)/, 'CLASSES');
    expect(viewBody(SQL).length).toBeGreaterThan(0);
    expect(same(viewBody(SQL))).toBe(same(viewBody(SQL297)));
  });
  it('the width equals the encoder width', () => {
    const ws = [...SQL.matchAll(/cardinality\((?:l\.)?(?:codes|numbers|reason_ids|unit_ids)\) = (\d+)/g)].map((x) => Number(x[1]));
    expect([...new Set(ws)]).toEqual([width]);
  });
  it('carries no table, column, constraint or data change', () => {
    expect(/DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE|INSERT INTO|UPDATE /i.test(SQL.replace(/^--.*$/gm, ''))).toBe(false);
  });
});
