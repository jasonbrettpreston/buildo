// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-AUDIT ("committed bar (strata + seed) before
//            `--sample`; the bar's commit is an ancestor of the sample record's commit; exactly 50 rows per Spec 69 M-29
//            (≥ 20 whose verbatim contains a numeric literal, ≥ 1 per archetype present, every EXT-* row, the 900.1.10
//            rows, adjudicated rows eligible); PASS computed on the sample as drawn; until Phase 1 closes, a PASS is
//            invalidated if a sampled row's content hash changes. A FAIL is fixed, then a new full audit (new seed, same
//            bar; the failed rows are forced in and replace seeded rows of their own strata, so the count stays 50);
//            after a third FAIL the operator rules before any further audit; every record kept, audit count printed"),
//            §9 G-CHANGE + §4 `pending:stale` + SC-7 (stale = changed exactly; 0 unflagged changes), §4 (pending never
//            fails a gate; an on-demand gate counts as run only when its latest committed record is bound to the
//            current snapshot / row hashes), §6.4 rule 9 (re-verification after a text change needs a new draft pair),
//            §6.5 (expert-audit record); docs/specs/01-pipeline/69_mcbylaw_policy.md M-29, M-45, M-54 note (ABS rows in
//            the sample), M-55 note (both provincial direction readings flagged for the sample), M-39
//
// G-AUDIT (audit.mjs) and the G-CHANGE stale-unit arm (stale-arm.mjs), pure logic on in-memory fixtures.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const AU = await load('scripts/analysis/bylaw/audit.mjs');
const AF = await load('scripts/analysis/bylaw/audit-fixtures.mjs');
const SA = await load('scripts/analysis/bylaw/stale-arm.mjs');

const ids = (s: Json[]) => s.map((x) => x.id);

describe('G-AUDIT draw (Spec 69 M-29)', () => {
  const bar = () => AF.goodBar();
  const pop = () => AF.fixturePopulation();
  it('draws EXACTLY 50 distinct rows, deterministically from the seed', () => {
    const p = pop();
    const a = AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-1', forced: [] });
    const b = AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-1', forced: [] });
    expect(a).toHaveLength(50);
    expect(new Set(ids(a)).size).toBe(50);
    expect(ids(a)).toEqual(ids(b));
    const c = AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-2', forced: [] });
    expect(ids(c)).not.toEqual(ids(a));
  });
  it('every required member is in: every EXT-* row, the 900.1.10 rows, every ABS row, the M-55 provincial row, the M-39 adjudicated row', () => {
    const p = pop();
    const s = new Set(ids(AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-1', forced: [] })));
    for (const id of ['EXT-gov-1', 'EXT-prov-1', 'EXT-risk-1', 'EXT-risk-5', '900.1.10(1)', '900.1.10(3)', 'ABS-1', '600.60.40(3)']) expect(s.has(id), id).toBe(true);
  });
  it('≥ 20 numeric rows and ≥ 1 row per archetype present', () => {
    const p = pop();
    const s = AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-1', forced: [] });
    const byId = new Map(p.population.map((x: Json) => [x.id, x]));
    expect(s.filter((x: Json) => (byId.get(x.id) as Json).numeric).length).toBeGreaterThanOrEqual(20);
    const present = new Set(p.population.flatMap((x: Json) => x.archetypes));
    const covered = new Set(s.flatMap((x: Json) => (byId.get(x.id) as Json).archetypes));
    for (const a of present) expect(covered.has(a), String(a)).toBe(true);
  });
  it('a re-audit forces the failed rows in; they replace seeded rows, so the count stays 50', () => {
    const p = pop();
    const first = AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-1', forced: [] });
    const notIn = p.population.map((x: Json) => x.id).filter((id: string) => !ids(first).includes(id)).slice(0, 3);
    const again = AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 'seed-1', forced: notIn });
    expect(again).toHaveLength(50);
    for (const id of notIn) expect(ids(again)).toContain(id);
    // drawn (not forced / take-all) rows drop by exactly the forced count: each forced row displaces a drawn row
    const fixedBy = new Set([...AU.TAKE_ALL, 'required', 'failed_row']);
    const drawn = (s: Json[]) => s.filter((x) => !x.strata.some((t: string) => fixedBy.has(t))).length;
    expect(drawn(again)).toBe(drawn(first) - 3);
  });
  it('refuses a bar it cannot meet: forced members > 50 → bar_infeasible; < 50 eligible → population_too_small; a required row not eligible → required_not_eligible', () => {
    const p = pop();
    const big = p.population.slice(0, 51).map((x: Json) => x.id);
    expect(() => AU.drawSample({ bar: bar(), population: p.population, required: p.required, seed: 's', forced: big })).toThrow(/bar_infeasible/);
    expect(() => AU.drawSample({ bar: bar(), population: p.population.slice(0, 30), required: [], seed: 's', forced: [] })).toThrow(/population_too_small/);
    expect(() => AU.drawSample({ bar: bar(), population: p.population.filter((x: Json) => x.id !== 'ABS-1'), required: p.required, seed: 's', forced: [] })).toThrow(/required_not_eligible/);
  });
  it('audit n uses a seed derived from the ONE committed bar seed (n = 1 is the bar seed itself)', () => {
    expect(AU.auditSeed('abc', 1)).toBe('abc');
    expect(AU.auditSeed('abc', 2)).toMatch(/^[0-9a-f]{64}$/);
    expect(AU.auditSeed('abc', 2)).not.toBe(AU.auditSeed('abc', 3));
  });
});

describe('G-AUDIT score: PASS computed on the sample as drawn (SC-4: ≥ 95 % agree and 0 numeric disagreements)', () => {
  it('48 / 50 agree, 0 numeric → pass; 47 / 50 → fail; 49 / 50 with 1 numeric disagreement → fail', () => {
    const b = AF.goodBar();
    expect(AU.scoreAudit(AF.scoredRecord({ disagree: 2 }), b).state).toBe('pass');
    expect(AU.scoreAudit(AF.scoredRecord({ disagree: 3 }), b).state).toBe('fail');
    expect(AU.scoreAudit(AF.scoredRecord({ disagree: 1, numeric: 1 }), b).state).toBe('fail');
  });
  it('missing results, a missing explicit confirmation (900.1.10(3) implicit override; M-55 direction readings) or an unresolved disagreement → pending, never fail', () => {
    const b = AF.goodBar();
    expect(AU.scoreAudit(AF.scoredRecord({ missing: 1 }), b).state).toBe('pending');
    expect(AU.scoreAudit(AF.scoredRecord({ dropConfirm: true }), b).state).toBe('pending');
    expect(AU.scoreAudit(AF.scoredRecord({ disagree: 1, unresolved: true }), b).state).toBe('pending');
  });
});

describe('G-AUDIT gate: closed reason codes, a known-bad fixture per code + a good twin', () => {
  const st = AU.selfTest ? AU.selfTest() : { pass: false, results: [] };
  it('selfTest passes', () => {
    expect(st.results.filter((r: Json) => !r.ok)).toEqual([]);
    expect(st.pass).toBe(true);
  });
  it('every reason code has a known-bad fixture and a good twin', () => {
    expect(AU.REASON_CODES.length).toBeGreaterThan(0);
    for (const c of AU.REASON_CODES) {
      expect(st.results.some((r: Json) => r.expected === c && r.ok), `bad ${c}`).toBe(true);
      expect(st.results.some((r: Json) => r.expected === null && r.twin_of === c && r.ok), `twin ${c}`).toBe(true);
    }
  });
  it('states: no record → not_run; awaiting the expert → not_run (pending never fails); PASS → pass; sampled row changed → not_run (invalidated); FAIL → fail', () => {
    const s = (name: string) => AU.checkAudit(AF.gateScenario(name)).status;
    expect(s('no_records')).toBe('not_run');
    expect(s('awaiting_expert')).toBe('not_run');
    expect(s('pass')).toBe('pass');
    expect(s('pass_row_changed')).toBe('not_run');
    expect(s('fail')).toBe('fail');
    expect(s('reaudit_pass')).toBe('pass');
    expect(s('uncommitted')).toBe('not_run');
  });
  it('the audit count is printed (counts.audits)', () => {
    expect(AU.checkAudit(AF.gateScenario('reaudit_pass')).counts.audits).toBe(2);
  });
});

describe('G-CHANGE stale-unit arm (stale-arm.mjs): closed reason codes, red→green', () => {
  const st = SA.selfTest ? SA.selfTest() : { pass: false, results: [] };
  it('selfTest passes', () => {
    expect(st.results.filter((r: Json) => !r.ok)).toEqual([]);
    expect(st.pass).toBe(true);
  });
  it('every reason code has a known-bad fixture and a good twin', () => {
    expect(SA.REASON_CODES.length).toBeGreaterThan(0);
    for (const c of SA.REASON_CODES) {
      expect(st.results.some((r: Json) => r.expected === c && r.ok), `bad ${c}`).toBe(true);
      expect(st.results.some((r: Json) => r.expected === null && r.twin_of === c && r.ok), `twin ${c}`).toBe(true);
    }
  });
  it('not_run (never a pass) without a committed record bound to the latest adoption and the current unit shas', () => {
    expect(SA.checkStaleArm({ adoptions: [{ adoption_id: 'adoption-1' }], slice: { rows: [], units: [] }, record: null, shards: [], witness: null }).status).toBe('not_run');
    expect(SA.checkStaleArm({ adoptions: [{ adoption_id: 'adoption-1' }, { adoption_id: 'adoption-2' }], slice: { rows: [], units: [] }, record: null, shards: [], witness: null }).status).toBe('not_run');
  });
  it('gitBlobOid equals git\'s blob id ("hello\\n" → ce01362…)', () => {
    expect(SA.gitBlobOid(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});
