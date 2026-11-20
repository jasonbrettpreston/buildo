// SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.05, fe.44; docs/specs/03-mobile/90_mobile_engineering_protocol.md §5; 132_step_standard_handbook.md §6 R-BA
//
// COMPLY.3 stage 1 (task-367) — Gate B `scripts/analysis/gates/mobile-literals.mjs` and Gate C `scripts/analysis/gates/mobile-never-do.mjs`, each proven in BOTH
// directions (08_agents.md:462 "Every lock is proven in BOTH directions"): RED on a planted-defect fixture, GREEN on a clean twin. Report-only: nothing wires them.
import { describe, it, expect } from 'vitest';
import * as gateB from '../../scripts/analysis/gates/mobile-literals.mjs';
import * as gateC from '../../scripts/analysis/gates/mobile-never-do.mjs';

const FIX = 'scripts/steps/_schema/fixtures/mobile-gates';
const ROOT = process.cwd();
type F = { file: string; id: string; line: number };
const hit = (list: F[], file: string, id: string) => list.some((f) => f.file.endsWith(file) && f.id === id);

describe('gate B — numbers in mobile code (fe.44 conversion factor bound; time/count positions informational)', () => {
  const { bound, info } = gateB.scan(ROOT, [FIX]);
  it('B1 RED: the planted conversion factors are BOUND findings (fe.44)', () => {
    expect(hit(bound, 'bad-b.tsx', 'B1-conversion-factor')).toBe(true);
    expect(bound.filter((f: F) => f.file.endsWith('bad-b.tsx')).length).toBe(2);
  });
  it('B2 RED: the four informational classes each fire on the planted file', () => {
    for (const id of ['U1-upper-snake-number', 'U2-timer-number', 'U3-retry-count', 'U4-query-option-number']) expect(hit(info, 'bad-b.tsx', id), id).toBe(true);
  });
  it('B3 GREEN: the clean twin has no finding of any class', () => {
    expect([...bound, ...info].filter((f: F) => f.file.endsWith('clean-b.tsx'))).toEqual([]);
  });
  it('B4: tests, mocks and generated files are skipped by name', () => {
    expect(gateB.isSkipped('mobile/src/a.test.tsx')).toBe(true);
    expect(gateB.isSkipped('mobile/src/__tests__/a.ts')).toBe(true);
    expect(gateB.isSkipped('mobile/src/theme.generated.ts')).toBe(true);
    expect(gateB.isSkipped('mobile/src/lib/a.ts')).toBe(false);
  });
});

describe('gate C — the Spec 90 §5 never-do list', () => {
  const findings = gateC.scan(ROOT, [FIX]) as F[];
  it('C1 RED: every one of the six rows fires on the planted file', () => {
    for (const row of gateC.ROWS) expect(hit(findings, 'bad-c.tsx', row.id), row.id).toBe(true);
  });
  it('C2: the list is six rows, each with its quote from Spec 90 §5', () => {
    expect(gateC.ROWS.length).toBe(6);
    for (const row of gateC.ROWS) expect(row.quote.length).toBeGreaterThan(10);
  });
  it('C3 GREEN: the clean twin has no finding (lucide-react-native is not lucide-react; a local `document` is not the DOM)', () => {
    expect(findings.filter((f: F) => f.file.endsWith('clean-c.tsx'))).toEqual([]);
  });
});
