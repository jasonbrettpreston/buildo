// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MA (amends R-KV; 2026-11-01-batch-ao#CHAT-216.O-28)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/h/plan.md sections 2.1 and 4.1 (P1-P3: the prereg file name form, owned by one pure module)
//
// R-MA (the prereg join by task): the prereg file name `prereg-<MB-id>-<k>.json` is parsed by ONE pure module, so that
// every consumer (the join, the gate, the evidence sweep) reads `<k>` as an INTEGER and never as a byte string.
// The bug this pins: byte order sorts `-10.json` before `-2.json`, so a "newest wins" join silently keeps k=2.
import { afterAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { byNewest, PREREG_FORM_RE, parsePreregName } from '../../scripts/analysis/mcbylaws/prereg-name.mjs';
import { hooksPathVerdict, readRealHooksPath } from './hooks-path-guard.global';

const DIR = 'scripts/analysis/bylaw-validation/coa-expected';

type Parsed = { task: string; k: number };

/** Parse and assert non-null (strict TS: `.map(parsePreregName)` yields nullable values). */
const parsed = (rel: string): Parsed => {
  const got = parsePreregName(rel) as Parsed | null;
  if (got === null) throw new Error(`expected ${rel} to parse`);
  return got;
};

describe('R-MA prereg-name: the file name form prereg-<MB-id>-<k>.json', () => {
  // P1: the name form, one table, the captures are task and k.
  const CASES: ReadonlyArray<readonly [string, Parsed | null]> = [
    [`${DIR}/prereg-MB-78-2.json`, { task: 'MB-78', k: 2 }],
    [`${DIR}/prereg-MB-18-10.json`, { task: 'MB-18', k: 10 }],
    [`${DIR}/prereg-mb18-a.json`, null],
    [`${DIR}/prereg-MB-18-02.json`, null],
    [`${DIR}/prereg-MB-18-0.json`, null],
    [`${DIR}/prereg-MB-18-1.json.bak`, null],
    ['other/prereg-MB-1-1.json', null],
  ];

  it.each(CASES)('P1 parsePreregName(%s) -> %j', (rel, want) => {
    expect(parsePreregName(rel)).toEqual(want);
  });

  it('P1 the k capture is a NUMBER, never the string "10"', () => {
    const got = parsePreregName(`${DIR}/prereg-MB-18-10.json`);
    expect(got).not.toBeNull();
    expect(got?.k).toBe(10);
    expect(typeof got?.k).toBe('number');
    expect(got?.task).toBe('MB-18');
  });

  it('P1 the exported pattern is the documented form', () => {
    expect(PREREG_FORM_RE.source).toBe('^scripts\\/analysis\\/bylaw-validation\\/coa-expected\\/prereg-(MB-\\d+)-([1-9]\\d*)\\.json$');
  });

  // P2: integer order, not byte order. The byte-order fact is asserted first, so the test shows WHY byNewest exists.
  it('P2 byte order puts -10 before -2, byNewest puts k=10 first', () => {
    const names = [`${DIR}/prereg-MB-18-2.json`, `${DIR}/prereg-MB-18-10.json`];
    expect([...names].sort()[0]).toMatch(/-10\.json$/);
    const newest = names.map(parsed).sort(byNewest)[0] as Parsed;
    expect(newest.k).toBe(10);
    expect(newest.task).toBe('MB-18');
  });

  it('P2 byte order puts -1 before -10, byNewest puts k=10 first', () => {
    const names = [`${DIR}/prereg-MB-18-1.json`, `${DIR}/prereg-MB-18-10.json`];
    expect([...names].sort()[0]).toMatch(/-1\.json$/);
    const newest = names.map(parsed).sort(byNewest)[0] as Parsed;
    expect(newest.k).toBe(10);
  });

  it('P2 byNewest is descending on the integer k', () => {
    expect(byNewest({ k: 2 }, { k: 10 })).toBeGreaterThan(0);
    expect(byNewest({ k: 10 }, { k: 2 })).toBeLessThan(0);
    expect(byNewest({ k: 3 }, { k: 3 })).toBe(0);
  });

  // P3: the form lives ONLY directly inside coa-expected/ — no "/" in either capture.
  it('P3 the form matches only directly inside coa-expected/ (no slash in either capture)', () => {
    expect(PREREG_FORM_RE.test(`${DIR}/prereg-MB-1-1.json`)).toBe(true);
    expect(PREREG_FORM_RE.test(`${DIR}/sub/prereg-MB-1-1.json`)).toBe(false);
    expect(PREREG_FORM_RE.test(`${DIR}/prereg-MB-1/x-1.json`)).toBe(false);
    expect(PREREG_FORM_RE.test(`x/${DIR}/prereg-MB-1-1.json`)).toBe(false);
  });
});

// The `ba05d889` guard: a leaked core.hooksPath is pinned on the file that caused it.
const ROOT = path.resolve(__dirname, '../..');
afterAll(() => expect(hooksPathVerdict(readRealHooksPath(ROOT), process.env.CI === 'true')).toBeNull());
