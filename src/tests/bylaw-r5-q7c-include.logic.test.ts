// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-76 A2; docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 13, §9 G-XREF
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const AU = await load('scripts/analysis/bylaw/authored.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const XR = await load('scripts/analysis/bylaw/xref.mjs');

const codesOf = (r: Json) => [...new Set((r.violations || []).map((v: Json) => v.code))];

describe('P1-R5 Q7(c) — an INCLUDE of a section / Article excludes the unit own regulation (Spec 69 M-76 A2)', () => {
  const fixtures: Json[] = typeof FX.xrefFixtures === 'function' ? FX.xrefFixtures() : [];
  const byName = (prefix: string) => fixtures.find((f) => f.name.startsWith(prefix))!;

  it('good twin: an Article include that contains the unit own regulation expands to the OTHER rows', () => {
    const f = byName('good twin: M-76 A2 (R5 Q7c)');
    expect(f).toBeTruthy();
    const r = XR.checkXref(f.input);
    expect(r.violations).toEqual([]);
    expect(r.counts.include_group_expansions).toBe(1);
    expect(r.counts.include_group_rows).toBe(2);
  });

  it('a group whose only in-scope row is the unit own regulation is include_unresolved', () => {
    const f = byName('include_unresolved: M-76 A2 (R5 Q7c)');
    expect(f).toBeTruthy();
    expect(codesOf(XR.checkXref(f.input))).toEqual(['include_unresolved']);
  });

  it('a transitive include_cycle among the other in-scope rows still fires', () => {
    const f = byName('include_cycle: M-76 A2 — an Article include whose other rows include the unit back');
    expect(f).toBeTruthy();
    expect(codesOf(XR.checkXref(f.input))).toEqual(['include_cycle']);
  });

  it('selfTest passes', () => {
    expect(XR.selfTest().pass).toBe(true);
  });
});

describe('P1-R5 Q7(c) invariant — groupRows itself is unchanged and still yields the own row', () => {
  it('groupRows on an unmodified index includes the own row', () => {
    const rows = XR.groupRows(AU.buildIndex(FX.fixtureSlice()), { kind: 'article', id: '10.20.40.70' });
    expect(rows).toEqual(['10.20.40.70(3)', '10.20.40.70(4)', '10.20.40.70(6)']);
  });
});
