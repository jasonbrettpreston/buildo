// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JD (a green ② lock closes a defect-ledger row; dated note CHAT-191)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
//
// Ledger locks for classify_coa_trades CCT-D7 (realtor by slug; absence is a WARN row) and CCT-D9
// (manifest supports_full follows override.force_full; table-map entry). No DB.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const rd = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const D = JSON.parse(rd('scripts/classify-coa-trades.descriptor.json'));
const M = JSON.parse(rd('scripts/manifest.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(join(process.cwd(), 'scripts/lib/compute/classify-coa-trades.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdictLib = require(join(process.cwd(), 'scripts/lib/step/verdict.js'));
function realtorRow(d: any, trades: any[]) {
  const out = compute.materializeRows([], { config: { classify_coa_trades_tier: 1, classify_coa_trades_lead_score_scale: 100, classify_coa_trades_realtor_confidence: 0.5, p16_inference_layer_enabled: 0 }, lookups: { trades, product_groups: [] } });
  const seen: Record<string, any> = {};
  compute.checks.realtor_unavailable({ matched: out.matched, report: (k: string, o: unknown) => { seen[k] = o; } });
  return verdictLib.buildAuditTable(d, 'coa', seen, [], {}, new Set(['realtor_unavailable'])).rows.find((r: any) => r.metric === 'realtor_unavailable');
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
function assertD7(d: any, src0: string) {
  const src = stripComments(src0);
  if (!/REALTOR_SLUG\s*=\s*'realtor'/.test(src) || /\b33\b/.test(src) || /pipeline-realtor-availability/.test(src)) throw new Error('realtor not by slug');
  const c = d.checks.find((x: any) => x.id === 'realtor_unavailable');
  if (!c || c.severity !== 'WARN' || c.limit !== 'viol == 0') throw new Error('no declared WARN realtor check');
}
function assertD9(m: any, d: any, funnel: string) {
  if (m.scripts.classify_coa_trades.supports_full !== (d.override.force_full !== 'none')) throw new Error('supports_full disagrees');
  if (!/classify_coa_trades:\s*'lead_trades'/.test(funnel)) throw new Error('no table-map entry');
}
describe('classify_coa_trades ledger locks', () => {
  const src = rd('scripts/lib/compute/classify-coa-trades.js');
  const funnel = rd('src/lib/admin/funnel.ts');
  it('CCT-D7', () => { expect(() => assertD7(D, src)).not.toThrow(); const m = clone(D); m.checks = m.checks.filter((c: any) => c.id !== 'realtor_unavailable'); expect(() => assertD7(m, src)).toThrow(); });
  it('CCT-D7 (behaviour, N2) — no realtor slug in the trades lookup: a WARN row, never a swallowed error', () => {
    const miss = realtorRow(D, [{ id: 1, slug: 'framing' }]);
    expect(miss?.status).toBe('WARN');
    const hit = realtorRow(D, [{ id: 1, slug: 'framing' }, { id: 7, slug: 'realtor' }]);
    expect(hit?.status).toBe('PASS');
    const m = clone(D); m.checks = m.checks.filter((c: any) => c.id !== 'realtor_unavailable');
    expect(realtorRow(m, [{ id: 1, slug: 'framing' }])).toBeUndefined();
  });
  it('CCT-D9', () => {
    expect(() => assertD9(M, D, funnel)).not.toThrow();
    const m = clone(M); m.scripts.classify_coa_trades.supports_full = true;
    expect(() => assertD9(m, D, funnel)).toThrow(/supports_full disagrees/);
    expect(() => assertD9(M, D, funnel.replace(/classify_coa_trades:\s*'lead_trades'/g, ''))).toThrow(/table-map/);
  });
});
