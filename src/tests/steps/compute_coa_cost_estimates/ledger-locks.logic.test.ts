// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JD (a green ② lock closes a defect-ledger row; dated note CHAT-191)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
//
// Ledger locks for compute_coa_cost_estimates CCCE-D9 (admin description true) and CCCE-D10 (the
// constant phase_h_gap_active row retired, R-HR). No DB.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const rd = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const D = JSON.parse(rd('scripts/compute-coa-cost-estimates.descriptor.json'));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
function assertD10(d: any, src: string) {
  if (/phase_h_gap_active/.test(stripComments(src))) throw new Error('compute still emits phase_h_gap_active');
  if (/phase_h_gap_active/.test(JSON.stringify(d.checks))) throw new Error('descriptor declares a phase_h_gap_active check');
  const dev = (d.deviations || []).find((x: any) => /phase_h_gap_active/.test(x.from));
  if (!/R-HR/.test(dev?.adjudicated_by ?? '')) throw new Error('retirement not adjudicated R-HR');
}
function summaryOf(funnel: string) { const m = /compute_coa_cost_estimates:\s*\{\s*summary:\s*'([^']*)'/.exec(funnel); return m ? m[1] : null; }
describe('compute_coa_cost_estimates ledger locks', () => {
  const funnel = rd('src/lib/admin/funnel.ts');
  it('CCCE-D9', () => {
    const s = summaryOf(funnel);
    expect(s).toBeTruthy();
    expect(s).not.toMatch(/Geometric-only/i);
    expect(s).toMatch(/archetype ladder/);
    expect(funnel).toMatch(/compute_coa_cost_estimates:\s*'cost_estimates'/);
  });
  it('CCCE-D10', () => {
    const src = rd('scripts/lib/compute/compute-coa-cost-estimates.js');
    expect(() => assertD10(D, src)).not.toThrow();
    // RED direction: the constant row re-added to compute (comments are stripped, so a comment naming it is not a red).
    expect(() => assertD10(D, `${src}\n// phase_h_gap_active is retired (R-HR)`)).not.toThrow();
    expect(() => assertD10(D, `${src}\nctx.report('phase_h_gap_active', { value: true });`)).toThrow(/compute/);
  });
});
