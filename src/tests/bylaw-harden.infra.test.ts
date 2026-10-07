// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (rule 7a absence, verified against the pinned page),
//            §7.6 (eval-vectors.json: a vector's building type comes from its Spec 67 source); docs/specs/01-pipeline/
//            69_mcbylaw_policy.md M-50, M-54 note, M-60
//
// Seed-level hardening locks (red-team REDTEAM.md A11, A12, A18; oracle-B vector review):
//   - every absence ruling in scripts/seeds/bylaw/absence-rulings.json is executed against its pinned page (no id filter)
//   - the production vocab's threshold tokens pass the structural check against the fixture units
//   - every by_law_expected eval vector without a building type resolves under M-50 (types agree); a vector whose
//     Spec 67 source states no type and whose types disagree is no_expected:building_type_unstated, never expected
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- seed JSON / .mjs surface
const ROOT = process.cwd();
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const E: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')).href);
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const LANE_VOCAB = read('src/tests/fixtures/bylaw/eval-vocab.json');
const UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units.filter((u: Json) => u.candidate);
const SEED = read('scripts/seeds/bylaw/eval-vectors.json');
const SPEC67 = fs.readFileSync(path.join(ROOT, SEED.spec67), 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));

describe('absence-rulings.json: every entry executed against its pinned page (structural, case-insensitive)', () => {
  it('checkAbsenceRulings executes every ruling (no id filter) and all pass', () => {
    const pages: Json = {};
    for (const r of ABS.rulings) { const p = path.join(ROOT, `scripts/seeds/bylaw/pages/${r.checked_page}.txt`); pages[r.checked_page] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
    const res = E.checkAbsenceRulings({ rulings: ABS.rulings, pages, vocab: PVOCAB });
    expect({ pass: res.pass, violations: res.violations, executed: res.executed }).toEqual({ pass: true, violations: [], executed: ABS.rulings.length });
  });
});

describe('vocab threshold tokens (structural check)', () => {
  it('vocab.json threshold tokens pass against the fixture units', () => {
    expect(E.checkThresholdTokens(PVOCAB, UNITS).violations).toEqual([]);
  });
});

describe('eval vectors: building type from the Spec 67 source, else M-50 (no_expected:building_type_unstated)', () => {
  const C = E.makeContext(LANE_VOCAB);
  it('the worked examples whose Spec 67 source states the base answer is the detached-house answer carry detached_house, with the anchor line', () => {
    for (const v of SEED.vectors.filter((x: Json) => ['41 Derwyn Road', '64 Eastbourne Crescent'].includes(x.source) && x.lot)) {
      expect([v.id, v.lot.building_type]).toEqual([v.id, 'detached_house']);
      const a = v.building_type_from;
      expect([v.id, Boolean(a && (SPEC67[a.line - 1] ?? '').includes(a.text))]).toEqual([v.id, true]);
    }
  });
  it('no by_law_expected vector with building type NULL comes back needs_user_input:building_type', () => {
    const bad: string[] = [];
    for (const v of SEED.vectors.filter((x: Json) => x.vector_status === 'by_law_expected' && x.lot && !x.lot.building_type)) {
      const r = E.effective(v.lot, v.target, E.loadCandidates(v.lot, UNITS).candidates, C);
      if (r.status === 'not_evaluated' && r.reason === 'needs_user_input:building_type') bad.push(v.id);
    }
    expect(bad).toEqual([]);
  });
  it('every building_type_unstated vector keeps its Spec 67 value and expects the M-50 not_evaluated', () => {
    for (const v of SEED.vectors.filter((x: Json) => x.vector_status === 'no_expected:building_type_unstated')) {
      expect([v.id, v.lot.building_type, v.expected.not_evaluated, typeof v.spec67_value]).toEqual([v.id, null, 'needs_user_input:building_type', 'number']);
    }
  });
});
