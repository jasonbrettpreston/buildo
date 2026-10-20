// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.10 (field lineage), P5.12 (disclosures),
//            P5.15 (answer reconciliation); docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md / 69a_mcbylaw_register.md (the rulings each answer cites);
//            docs/specs/01-pipeline/131_lot_configuration_policy.md (lot configuration); report:
//            docs/reports/2026-10-20-bylaw-e2e-verification.md (golden lots — the seed of Spec 133 lock 6)
//
// Golden-lot end-to-end verification of the operator's envelope-review answers (lane e2e-verify-1, 2026-10-20).
// Every "wrong" and "disclose" answer (docs/reference/envelope-answers.json + envelope-answer-dispositions.json) is
// exercised on real parcels from the local dev DB, snapshotted with no DB dependency in
// src/tests/fixtures/bylaw-golden-lots/lots.json; the cases, their expectations and the initial-run evidence are in
// cases.json (generated: node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --write; --check reports staleness). The calculation path is the committed evaluator with the production unit assembly (helper:
// src/tests/helpers/bylaw-golden-lots.ts). One case per answer × zone:
//   PROVEN          the evaluator answers what the operator said, on every listed lot            → it
//   FAILS           it does not (finding E2E-F-nn, evidence in cases.json `initial`)              → it.fails (green when fixed)
//   OWED            the effect lands in compute_maxbld_scenarios (Spec 78 Phase 5, ①, not built) → it (the unit reaches an
//                   affected real lot) + it.todo (the lot-level disclosure / field, with its lineage field)
//   NOT_EXERCISABLE no real lot can exercise it (or the operator pinned it out of scope)         → it (the reason holds)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadAssembly, runCheck, type Check, type GoldenLot } from './helpers/bylaw-golden-lots';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped fixture JSON
interface Case {
  unit_id: string; zone: string; family: string; verdict: string; disposition: string; tracker_state: string;
  class: 'PROVEN' | 'FAILS' | 'OWED' | 'NOT_EXERCISABLE'; finding?: string | null; owed_field?: string | null; reason: string;
  lineage?: { field: string; owed: string[] };
  checks: (Check & { rationale?: string; initial?: { pass: boolean; observed: Json } })[];
}

const ROOT = process.cwd();
const FIX = path.join(ROOT, 'src/tests/fixtures/bylaw-golden-lots');
const read = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const lotsDoc = read(path.join(FIX, 'lots.json'));
const LOTS = new Map<string, GoldenLot>((lotsDoc.lots as GoldenLot[]).map((l) => [l.id, l]));
const CASES = read(path.join(FIX, 'cases.json')).cases as Case[];
const A = await loadAssembly(ROOT);
const tracker = read(path.join(ROOT, 'docs/reports/generated/envelope-answer-tracker.json')).rows as Json[];
const lineage = new Map<string, Json>((read(path.join(ROOT, 'docs/reference/maxbld-field-lineage.json')).fields as Json[]).map((f) => [f.field, f]));
const spec78 = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/78_optimal_lot_configuration.md'), 'utf8');
const disp = new Map<string, Json>((read(path.join(ROOT, 'docs/reference/envelope-answer-dispositions.json')).dispositions as Json[]).map((d) => [d.unit_id, d]));

const label = (c: Case): string => `${c.unit_id} @${c.zone} (${c.verdict})`;
const runAll = (c: Case): void => {
  for (const k of c.checks) {
    const r = runCheck(A, LOTS, k);
    expect.soft(r.pass, `${k.kind} on lot ${k.lot} ${JSON.stringify(k.scenario)}${'target' in k ? ` ${k.target}` : ''} — ${k.rationale ?? ''}\nobserved: ${JSON.stringify({ ...r.observed, disclosures: (r.observed.disclosures || []).filter((d: string) => !d.startsWith('alternate compliance path')) })}`).toBe(true);
  }
};
const byFamily = (cls: Case['class']): Map<string, Case[]> => {
  const m = new Map<string, Case[]>();
  for (const c of CASES.filter((x) => x.class === cls)) m.set(c.family, [...(m.get(c.family) || []), c]);
  return new Map([...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
};

describe('golden-lot fixtures are complete and self-contained', () => {
  it('every "wrong" and "disclose" answer in the tracker has at least one golden-lot case', () => {
    const have = new Set(CASES.map((c) => c.unit_id));
    const missing = tracker.filter((r) => (r.verdict === 'wrong' || r.verdict === 'disclose') && !have.has(r.unit_id)).map((r) => r.unit_id);
    expect(missing).toEqual([]);
  });
  it('every check names a snapshotted golden lot, and every golden lot is a real parcel with its stored columns', () => {
    const bad = CASES.flatMap((c) => c.checks.filter((k) => !LOTS.has(k.lot)).map((k) => `${c.unit_id}: ${k.lot}`));
    expect(bad).toEqual([]);
    for (const l of LOTS.values()) expect([typeof l.id, l.lot.parcel_id, typeof l.stored]).toEqual(['string', l.id, 'object']);
  });
  it('PROVEN and OWED cases carry at least one check on a real lot; FAILS cases name a finding', () => {
    expect(CASES.filter((c) => c.class === 'PROVEN' && !c.checks.length).map(label)).toEqual([]);
    expect(CASES.filter((c) => c.class === 'FAILS' && !/^E2E-F-\d\d$/.test(String(c.finding))).map(label)).toEqual([]);
  });
});

describe('OWED-TO-① cases cite a real field-lineage entry and a real P5.12 code', () => {
  it('every OWED case names a persisted field of docs/reference/maxbld-field-lineage.json (a compute_maxbld_scenarios output)', () => {
    const bad = CASES.filter((c) => c.class === 'OWED' && !(c.lineage && lineage.get(c.lineage.field)?.persisted === true)).map(label);
    expect(bad).toEqual([]);
  });
  it('every disclosure code an OWED case is owed to is a P5.12 code in Spec 78', () => {
    const codes = new Set(CASES.filter((c) => c.class === 'OWED').map((c) => /`([a-z0-9_]+)`/.exec(String(c.owed_field))?.[1]).filter(Boolean) as string[]);
    expect([...codes].filter((k) => !spec78.includes(k)).sort()).toEqual([]);
  });
});

describe('PROVEN — the answer takes effect on real lots', () => {
  for (const [fam, cs] of byFamily('PROVEN')) {
    describe(fam, () => {
      for (const c of cs) it(label(c), () => runAll(c));
    });
  }
});

// every FAILS case flipped 2026-10-20 (bylaw-fix-1): the block runs only while a finding is open (vitest rejects an empty suite)
if (CASES.some((c) => c.class === 'FAILS')) describe('FAILS — the answer does not take effect (it.fails: turns green when the fix lands)', () => {
  for (const [fam, cs] of byFamily('FAILS')) {
    describe(fam, () => {
      for (const c of cs) it.fails(`[${c.finding}] ${label(c)} — ${c.reason}`, () => runAll(c));
    });
  }
});

describe('OWED-TO-① — the effect lands in compute_maxbld_scenarios (Spec 78 Phase 5, not built)', () => {
  for (const [fam, cs] of byFamily('OWED')) {
    describe(fam, () => {
      for (const c of cs) {
        if (c.checks.length) it(`${label(c)}: reaches an affected real lot`, () => runAll(c));
        it.todo(`${label(c)} → ${c.owed_field}`);
      }
    });
  }
});

describe('legacy paths (Spec 65 enrich_parcels, Spec 78 §1–§6 opt-config) do not read the by-law units', () => {
  // Spec 78 §5.2 S9: "the §P2.1 suite constants are stale … until then the table records the as-built code, not the law";
  // the stored columns are replaced by compute_maxbld_scenarios (①). Evidence: the snapshotted stored columns.
  const stale = [...LOTS.values()].filter((l) => l.stored.max_garden_suite_gfa_sqm != null && l.stored.max_garden_suite_gfa_sqm !== 120);
  it('the snapshot carries the legacy garden-suite column on the golden lots (the evidence for the todo below)', () => {
    expect(stale.length).toBeGreaterThan(0);
  });
  it.todo(`stored max_garden_suite_gfa_sqm (legacy constant 60 m², one storey) on ${stale.length} golden lots vs answers 150.7.60.50(4)(A) 120 m² and 150.7.60.40(2) two storeys → suite_gfa_sqm (①)`);
});

describe('NOT-EXERCISABLE — no real lot can exercise the answer', () => {
  for (const c of CASES.filter((x) => x.class === 'NOT_EXERCISABLE')) {
    it(`${label(c)}: ${c.reason.slice(0, 120)}`, () => {
      const d = disp.get(c.unit_id);
      if (/^pinned out of scope/.test(c.reason)) expect(d?.scope_pin).toBeTruthy();
      else expect(c.reason.length).toBeGreaterThan(40);
    });
  }
});
