// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JD (a green ② lock closes a defect-ledger row; dated note CHAT-191)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
//
// Ledger locks for link_coa_to_parcels LCTP-D8 (one audit table), LCTP-D9 (trigger co-writer declared)
// and LCTP-D10 (manifest supports_full follows override.force_full). No DB.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const rd = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const D = JSON.parse(rd('scripts/link-coa-to-parcels.descriptor.json'));
const M = JSON.parse(rd('scripts/manifest.json'));
function assertD8(d: any, src: string) {
  const v = d.sharing?.varies_by_chain;
  if (v?.audit_table !== 'one' || v?.phase?.coa !== 4) throw new Error('audit table not one/phase 4');
  if (/\bphase\s*:/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) throw new Error('compute names a phase');
}
function assertD9(d: any) {
  const txt = JSON.stringify(d.limitations || []);
  if (!txt.includes('trg_mirror_permit_parcels_to_lead_parcels')) throw new Error('trigger co-writer not declared');
}
function assertD10(m: any, d: any) {
  if (m.scripts.link_coa_to_parcels.supports_full !== (d.override.force_full !== 'none')) throw new Error('supports_full disagrees with descriptor');
}
describe('link_coa_to_parcels ledger locks', () => {
  const src = rd('scripts/lib/compute/link-coa-to-parcels.js');
  it('LCTP-D8', () => { expect(() => assertD8(D, src)).not.toThrow(); const m = clone(D); m.sharing.varies_by_chain.audit_table = 'per_path'; expect(() => assertD8(m, src)).toThrow(/one\/phase 4/); expect(() => assertD8(D, `${src}\nconst a = { phase: 11 };`)).toThrow(/compute names a phase/); });
  it('LCTP-D9', () => { expect(() => assertD9(D)).not.toThrow(); const m = clone(D); m.limitations = []; expect(() => assertD9(m)).toThrow(/trigger co-writer/); });
  it('LCTP-D10', () => { expect(() => assertD10(M, D)).not.toThrow(); const m = clone(M); m.scripts.link_coa_to_parcels.supports_full = true; expect(() => assertD10(m, D)).toThrow(); });
});
