// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-130, M-132, M-317; operator CHAT-81.FAM-ALL (2026-10-23-batch-b), families in docs/reports/bylaw/2026-10-23-families-pending.json
// Red first: before the family readings the 26 units are pending. Two readings are stopped (929 (F), 200 (C)(ii)): they need a licence wording the card does not name.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('CHAT-81.FAM-ALL family readings', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
  const U: Map<string, Json> = AG.agreedUnits(ag);
  const arch = (id: string): string => (U.get(id) as Json)?.archetype;
  it('FAM-HIST, FAM-ABUT-NAMED, FAM-STEP, FAM-PLAT, FAM-PARKLEN stay UNUSUAL / no target', () => {
    for (const id of ['900.2.10(621)#(621)[SSP](B)', '900.3.10(937)#(937)[SSP](I)(i)', '900.3.10(937)#(937)[SSP](I)(ii)', '900.3.10(350)#(350)[SSP](E)(i)', '900.3.10(350)#(350)[SSP](E)(ii)',
      '900.3.10(1029)#(1029)[SSP](C)(i)', '900.3.10(1029)#(1029)[SSP](C)(ii)', '900.3.10(1029)#(1029)[SSP](C)(iii)', '900.3.10(1121)#(1121)[SSP](C)(i)', '900.4.10(200)#(200)[SSP](C)(i)', '900.3.10(975)#(975)[SSP](B)']) {
      expect(arch(id), id).toBe('UNUSUAL');
    }
    expect((U.get('900.3.10(1401)#(1401)[SSP](B)') as Json).target).toBe('none');
    expect((U.get('900.3.10(1401)#(1401)[SSP](C)') as Json).target).toBe('none');
    expect(arch('900.3.10(350)#(350)[SSP](F)(ii)')).toBe('PERMIT');
  });
  it('FAM-ABUT-COMP, FAM-FSI, FAM-ANCCOV, FAM-SEP, FAM-ARMS take the approved LIMITs', () => {
    for (const id of ['900.5.10(278)#(278)[SSP](C)(ii)', '900.5.10(278)#(278)[SSP](D)(ii)', '900.3.10(1121)#(1121)[SSP](C)(ii)']) expect((U.get(id) as Json).target, id).toBe('street_setback_m');
    expect((U.get('900.3.10(9)#(9)[SSP](E)(i)') as Json).bound).toBe('max');
    expect((U.get('900.3.10(9)#(9)[SSP](E)(ii)') as Json).bound).toBe('max');
    for (const id of ['900.3.10(971)#(971)[SSP](D)', '900.3.10(975)#(975)[SSP](D)']) expect((U.get(id) as Json).target, id).toBe('ancillary_coverage_pct');
    expect((U.get('900.3.10(1120)#(1120)[SSP](G)(iii)') as Json).target).toBe('separation_m');
    expect((U.get('900.4.10(200)#(200)[SSP](G)(i)') as Json).numeric_expression[0]).toContain('by_type(semi_detached_house: 15.0 m; other: 7.5 m × dwelling_units)');
  });
  it('the two stopped readings stay pending', () => {
    const st = (reg: string): string[] => [...ag.units].filter(([id]) => id.startsWith(reg + '#')).map(([, r]) => r.state as string);
    expect(st('900.3.10(929)').filter((x) => x === 'pending').length).toBe(1);
    expect(st('900.4.10(200)').filter((x) => x === 'pending').length).toBe(1);
  });
});
