// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-IH (124a §B26 appended row; §B32), amends
//            R-EY (9)
//
// Spec 124 R-IH stage 1 (operator approved 2026-10-20, chat "yes to all ensure they comply to the governing specs
// and are recorded as a ruling if necessary", `2026-10-20-chat-batch-d-rulings#CHAT-25`: "Yes, staged so no V3 step
// drops (E1): stage 1 advisory line; …"). For a descriptor `deviations[]` entry the authorizing citation is the one
// in `adjudicated_by`; stage 1 only REPORTS the entries whose only resolving register id is in `why`. The R-EY (9)
// verdict is unchanged: such an entry still counts as cited until stage 3.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');

type Entry = { source: string; key: string; text: string };
type WhyOnly = { index: number; key: string; ids: string[] };
type L = {
  exceptionEntries: (slug: string, src: Record<string, unknown>) => Entry[];
  exceptionCitationFailures: (e: Entry[], ids: Set<string>) => { fails: string[]; uncited: Array<{ source: string; key: string }>; total: number };
  whyOnlyDeviations: (descriptor: unknown, ids: Set<string>) => WhyOnly[];
  whyOnlyAdvisoryLine: (slug: string, found: WhyOnly[]) => string | null;
};

let m: L;
beforeAll(async () => {
  m = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/v3-label.mjs')).href)) as unknown as L;
});

const ids = new Set(['R-BZ', 'R-IB', 'R-GO']);
const descriptor = {
  deviations: [
    { from: 'cited where it should be', adjudicated_by: 'operator [register: Spec 124 R-GO]', why: 'mentions R-BZ G3' },
    { from: 'the 16 probes', adjudicated_by: 'wave-4 lane B ② (drafted; operator ruling owed at integration)', why: 'the catalog reads leave compute (R-BZ G3)' },
    { from: 'no id anywhere', adjudicated_by: 'lane note', why: 'no rule named' },
    { from: 'an unknown id only in why', adjudicated_by: 'lane note', why: 'see R-ZZ' },
  ],
};

describe('R-IH stage 1 — the why-only advisory (verdict unchanged)', () => {
  it('whyOnlyDeviations names each deviation whose only resolving id is in `why`, with its index and ids', () => {
    expect(m.whyOnlyDeviations(descriptor, ids)).toEqual([{ index: 1, key: 'the 16 probes', ids: ['R-BZ'] }]);
  });

  it('an entry citing in adjudicated_by, an entry citing nowhere, and an unresolving id in why are not why-only', () => {
    expect(m.whyOnlyDeviations({ deviations: [descriptor.deviations[0], descriptor.deviations[2], descriptor.deviations[3]] }, ids)).toEqual([]);
    expect(m.whyOnlyDeviations(null, ids)).toEqual([]);
    expect(m.whyOnlyDeviations({}, ids)).toEqual([]);
  });

  it('the R-EY (9) verdict is unchanged: the why-only entry still counts as cited (only the two id-less entries fail)', () => {
    const r = m.exceptionCitationFailures(m.exceptionEntries('x', { descriptor }), ids);
    expect(r.fails).toEqual(['deviations[] 2/4 no rule id']);
    expect(r.uncited.map((e) => e.key)).toEqual(['no id anywhere', 'an unknown id only in why']);
  });

  it('the advisory line names the step, says the verdict is unchanged and lists each entry; none when there is nothing', () => {
    const line = m.whyOnlyAdvisoryLine('enrich_permits', m.whyOnlyDeviations(descriptor, ids));
    expect(line).toBe('[step-validate] R-EY (9) why-only enrich_permits (advisory, Spec 124 R-IH stage 1; verdict unchanged): 1 deviation cites a register id only in why: deviations[1] "the 16 probes" (R-BZ)');
    expect(m.whyOnlyAdvisoryLine('enrich_permits', [])).toBeNull();
  });

  it('step-validate prints the advisory line per step and a run total, and the label still reads exceptionsSignal', () => {
    const sv = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(sv).toContain('whyOnlyAdvisoryLine(row.slug, whyOnly)');
    expect(sv).toContain('R-EY (9) why-only advisory (Spec 124 R-IH stage 1; verdict unchanged):');
    expect(sv).toMatch(/exceptions: exceptions9\.fails/);
  });
});
