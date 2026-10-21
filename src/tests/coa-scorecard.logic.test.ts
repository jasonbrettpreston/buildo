// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-125, M-127, M-236 dated note 2026-10-20
// DRAFT RULING pending (operator): CoA scorecard tools under scripts/analysis/bylaw-validation/coa-*.
//
// Regression lock for the four-district CoA scorecard (123 notices, 496 variances, scored at ac78d5dd:
// MATCH 246 / DIFFER 29 / NO ANSWER 69 / OWED 53 / NOT MODELLED 70 / DATA 29).
// The data are values-only JSON kept OUTSIDE git (default ~/Buildo-scratch/coa-data, override COA_DATA); without them the tests skip.
// Pinned at the commit: a total that moves is a failure. At any later tree the totals are printed as information (the evaluator moved on).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels.json')) && fs.existsSync(path.join(DATA, 'expected-4d.json'));
const TOOLS = 'scripts/analysis/bylaw-validation';

describe.skipIf(!have)('CoA four-district scorecard', () => {
  it('the scorer reproduces the recorded class totals (--check)', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coasc-')), 'sc.json');
    const so = execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices.json'),
      '--parcels', path.join(DATA, 'parcels.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out,
      '--check', path.join(DATA, 'expected-4d.json')], { encoding: 'utf8' });
    expect(so).toMatch(/CHECK (OK|INFO)/);
  }, 120000);
  it('the parser reproduces the stored notice records from the scrubbed raw samples', () => {
    const docs = path.join(DATA, 'db-notices/coa_notices'); if (!fs.existsSync(docs)) return;
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coan-')), 'n.json');
    const so = execFileSync('node', [path.join(ROOT, TOOLS, 'coa-notices-from-docs.cjs'), docs, out, path.join(DATA, 'samples')], { encoding: 'utf8' });
    expect(so).toMatch(/diff 0/);
  });
});
