// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-494 (D5), M-465 (option view), Q-M1 b+ (the mechanical cells stored on
//            the increment-3 night), M-60 (existing positions never move); DL-7 a, DL-3 a / b (form a: width 63; form b: width 61,
//            the M-472 storage half held)
//
// MB-27 increment 3 (the Layer 2 night) · migration 297 · RED FIRST. Written, NOT applied here (lane D applies it on the night,
// --only=297 --dry-run first). The lock reads the width and the option classes from the code and the scope, so the same lock holds
// for form a (61 -> 63) and form b (61): the migration must agree with the encoder, whichever form the G-STOR gate takes.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const RB = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
const SCOPE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/layer2-scope.json'), 'utf8'));
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const file = fs.readdirSync(path.join(ROOT, 'migrations')).find((f) => /^297_.*\.sql$/.test(f));
const SQL = file ? fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8') : '';
// MB-27 increment 5 (named re-pin): migration 315 widens the encoder to 70; this file's text is the 61-wide era (54 base pairs + the 7 roof_form
// slots), so the encoder width is read with the increment-5 additions taken out (the new principal target and the suite_height slots).
const width = (RB.tailPairs ? RB.tailPairs(SCOPE).length : 0) + RB.scopePairs(SCOPE).filter((p: { target: string }) => p.target !== 'principal_coverage_path_b_pct').length + RB.optionPairs(SCOPE, VOCAB.design_options).filter((p: { option_name: string }) => p.option_name === 'roof_form').length;

describe('migration 297 (written, not applied)', () => {
  it('exists as one file', () => {
    expect(typeof file).toBe("string");
    expect(String(file)).toMatch(/^297_resolve_bylaws_/);
  });
  // MB-27 increment 4 (D-8 a named move; Spec 69a M-379 dated note 2026-11-11): the scope gains house_with_secondary_suite and
  // migration 304 re-creates the view with it, so the class list is read from the LATEST migration that re-creates the view.
  it('the latest option view (297, then 304) lists exactly the scope\'s roof_form classes', () => {
    const latest = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^\d+_.*\.sql$/.test(f))
      .filter((f) => /CREATE OR REPLACE VIEW bylaw_resolution_option_results/.test(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8')))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).pop();
    const VIEW = latest ? fs.readFileSync(path.join(ROOT, 'migrations', latest), 'utf8') : '';
    const m = /bylaw_resolution_option_results[\s\S]*?CROSS JOIN \(VALUES ([^)]*\)(?:, \([^)]*\))*)\) AS c \(class\)/.exec(VIEW);
    const got = m ? [...String(m[1]).matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
    expect(got).toEqual(SCOPE.options.roof_form.classes);
  });
  it("every width CHECK and view filter is one ruled width: 61 (form b, DL-3 b) or 63 (form a, Q-M1 b+), with the 54 base pairs and 7 option slots of 295 kept (M-465) (literal anchors, not read from the encoder)", () => {
    const ws = [...SQL.matchAll(/cardinality\((?:l\.)?(?:codes|numbers|reason_ids|unit_ids)\) = (\d+)/g)].map((x) => Number(x[1]));
    expect(ws.length).toBeGreaterThan(0);
    const w = [...new Set(ws)];
    expect(w.length).toBe(1);
    expect([61, 63]).toContain(w[0]);
    expect([RB.scopePairs(SCOPE).length, RB.optionPairs(SCOPE, VOCAB.design_options).length]).toEqual([55, 15]); // MB-27 increment 5 (named re-pin): 315 adds one base pair and the 8 suite_height slots; 297's own text stays 61
  });
  it("the migration width equals the encoder width (the second, independent check)", () => {
    const ws = [...SQL.matchAll(/cardinality\((?:l\.)?(?:codes|numbers|reason_ids|unit_ids)\) = (\d+)/g)].map((x) => Number(x[1]));
    expect([...new Set(ws)]).toEqual([width]);
  });
  it('carries no DROP TABLE and no data rewrite outside the declared views and CHECKs (the 295 form)', () => {
    expect(/DROP TABLE|TRUNCATE|DELETE FROM/i.test(SQL)).toBe(false);
  });
});
