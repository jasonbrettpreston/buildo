// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JD (a green ② lock closes a defect-ledger row; dated note CHAT-191)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-GR; 124a R-GN dated note CHAT-191.CL-Q12
//
// Ledger lock for classify_coa_scope CCS-D6: one deciding check, scope_classified_pct an INFO row. No DB.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync(join(process.cwd(), 'scripts/classify-coa-scope.descriptor.json'), 'utf8'));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
function assertOne(d: any) {
  // Every non-INFO check decides the verdict: exactly one, unmapped_scope_pct.
  const deciding = d.checks.filter((c: any) => c.severity !== 'INFO');
  if (deciding.length !== 1 || deciding[0].id !== 'unmapped_scope_pct') throw new Error('not exactly one deciding check');
  if (d.checks.find((c: any) => c.id === 'scope_classified_pct')?.severity !== 'INFO') throw new Error('scope_classified_pct not INFO');
}
describe('classify_coa_scope ledger locks', () => {
  it('CCS-D6', () => { expect(() => assertOne(D)).not.toThrow(); const m = clone(D); m.checks.find((c: any) => c.id === 'scope_classified_pct').severity = 'WARN'; expect(() => assertOne(m)).toThrow(); });
});
