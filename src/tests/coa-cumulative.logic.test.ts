// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.357 (blind first, then one cumulative headline set), m.321 (pre-registration before the round), m.322 (floors only go up)
// Red first: docs/reports/red-evidence/bylaw/coa-cumulative-red.txt. Pure checks, no external data.
// The door reuses the scorer unchanged: this module only assembles the cumulative inputs; coa-scorecard.mjs --floors scores them.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const CU = await import(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-cumulative.mjs'));

const notice = (fn: string) => ({ file_number: fn, address: fn, variances: [] });
const frozen = { batch: 'coa-2026-a,b,c', role: 'frozen', notices: 'n172.json', parcels: 'p172.json', plan_facts: 'pf172' };
const blind = { batch: 'coa-2026-d', role: 'blind', notices: 'nd.json', parcels: 'pd.json', plan_facts: 'pfd', prereg: 'scripts/x/prereg-d.json', blind: { totals: { MATCH: 1 } } };
const set = (batches: unknown[]) => ({ schema: 'coa-cumulative-set-v1', $comment: 'c', floors: 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json', batches });
const files: Record<string, unknown> = {
  'n172.json': [notice('A1/26X'), notice('A2/26X')], 'p172.json': { 'A1/26X': { parcels: [] }, 'A2/26X': { parcels: [] } },
  'nd.json': [notice('A3/26X')], 'pd.json': { 'A3/26X': { parcels: [] } },
};
const pf: Record<string, Record<string, string>> = { pf172: { 'A1-26X.json': '{"a":1}' }, pfd: { 'A3-26X.json': '{"c":3}', 'A2-26X.json': '{"b":2}' } };
const io = (over: Partial<{ committed: (p: string) => boolean; pf: typeof pf; files: typeof files }> = {}) => ({
  readJson: (p: string) => (over.files || files)[p],
  listPlanFacts: (d: string) => (over.pf || pf)[d] || {},
  isCommitted: over.committed || (() => true),
});

describe('M-357: the cumulative all-notices set (assembled from committed batches; scored by the unchanged scorer)', () => {
  it('unions notices, parcels and plan facts of every batch, frozen set first', () => {
    const r = CU.assembleCumulative(set([frozen, blind]), io());
    expect(r.problems).toEqual([]);
    expect(r.notices.map((n: { file_number: string }) => n.file_number)).toEqual(['A1/26X', 'A2/26X', 'A3/26X']);
    expect(Object.keys(r.parcels).sort()).toEqual(['A1/26X', 'A2/26X', 'A3/26X']);
    // CHAT-134: a re-upload plan-facts file for a frozen-set lot (A2) joins only here, at the fold-in
    expect(Object.keys(r.planFacts).sort()).toEqual(['A1-26X.json', 'A2-26X.json', 'A3-26X.json']);
  });
  it('a batch that is not blind-scored first is refused: no committed pre-registration, or no recorded blind result', () => {
    expect(CU.assembleCumulative(set([frozen, blind]), io({ committed: () => false })).problems.join(' ')).toMatch(/coa-2026-d: pre-registration .* not committed/);
    const { blind: _b, ...noResult } = blind;
    expect(CU.assembleCumulative(set([frozen, noResult]), io()).problems.join(' ')).toMatch(/coa-2026-d: no recorded blind result/);
    const { prereg: _p, ...noPrereg } = blind;
    expect(CU.assembleCumulative(set([frozen, noPrereg]), io()).problems.join(' ')).toMatch(/coa-2026-d: no pre-registration/);
  });
  it('one notice per file number across the set (a re-upload never duplicates a notice)', () => {
    const dup = { ...files, 'nd.json': [notice('A3/26X'), notice('A1/26X')], 'pd.json': { 'A3/26X': { parcels: [] }, 'A1/26X': { parcels: [] } } };
    expect(CU.assembleCumulative(set([frozen, blind]), io({ files: dup })).problems.join(' ')).toMatch(/A1\/26X is in coa-2026-a,b,c and coa-2026-d/);
  });
  it('a plan-facts file held twice with different values is refused, never silently overridden', () => {
    const clash = { ...pf, pfd: { ...pf.pfd, 'A1-26X.json': '{"a":9}' } };
    expect(CU.assembleCumulative(set([frozen, blind]), io({ pf: clash })).problems.join(' ')).toMatch(/plan facts A1-26X\.json differ between coa-2026-a,b,c and coa-2026-d/);
    const same = { ...pf, pfd: { ...pf.pfd, 'A1-26X.json': '{"a":1}' } };
    expect(CU.assembleCumulative(set([frozen, blind]), io({ pf: same })).problems).toEqual([]);
  });
  it('the set shape: schema, floors file, exactly one frozen set and it comes first', () => {
    expect(CU.assembleCumulative({ ...set([frozen]), schema: 'x' }, io()).problems.join(' ')).toMatch(/schema must be coa-cumulative-set-v1/);
    expect(CU.assembleCumulative(set([blind, frozen]), io()).problems.join(' ')).toMatch(/the first batch must be the frozen reference set/);
    expect(CU.assembleCumulative({ ...set([frozen]), floors: '' }, io()).problems.join(' ')).toMatch(/floors/);
  });
  it('the committed set file passes its own shape check and names the M-322 floors file', () => {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/cumulative-set.json'), 'utf8'));
    expect(CU.checkSetShape(s)).toEqual([]);
    expect(s.floors).toBe('scripts/analysis/bylaw-validation/coa-expected/floors-172.json');
    expect(s.batches[0].role).toBe('frozen');
  });
});
