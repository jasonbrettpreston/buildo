// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-54 (Spec 136 §fe.54)
//
// task-367 COMPLY.3 (MF-98 · McFrontend queue · lane BL-HB367; RR-0385 item 6, RR-0413). The rule, Spec 136 fe.54 (Spec 128 Rule 12, 128:39):
//   "a surface declares what the user sees when it fails" and "An unhandled state is a FAIL, not a blank screen."
// TESTED: every SURFACE descriptor in the programme scope (scripts/surfaces/_schema/converted-surfaces.json scope.programme_scopes, the
// manifest's own fence, not a second list) that reads a contract (`inputs.answer === 'contract'`) declares an `error` entry in `states[]`
// and an `errors.answer` that is neither `none` nor `UNRESEARCHED`.
// LIMITS (stated, not widened): declarations only, and the error state only. Code is not read: the known break at
// mobile/src/lib/maxbldHelp.ts:19 (a failed Help open is only logged; task-440 RULE-CHECKS.md:102) is not caught here; it is owned by the
// task-343 leftovers. Descriptors outside the programme scope (8 today: 6 estate_other, 2 platform_shared) are not judged.
// Files come from `git ls-files`, so an untracked descriptor never counts. No DB, no network.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MANIFEST = 'scripts/surfaces/_schema/converted-surfaces.json';
const SURFACE_RE = /^scripts\/surfaces\/.+\/surfaces\/[^/]+\.descriptor\.json$/;
const SAMPLE = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json';
const BAD_ERRORS = new Set(['none', 'UNRESEARCHED']);

export interface Descriptor {
  kind?: string;
  identity?: { id?: string };
  programme?: { scope?: string };
  inputs?: { answer?: string };
  states?: Array<{ name?: string }>;
  errors?: { answer?: string };
}
export interface Scanned { path: string; d: Descriptor }

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;
const scope = readJson<{ scope: { programme_scopes: string[]; expected_count: number } }>(MANIFEST).scope;

/** Problems of the in-scope SURFACE descriptors that read a contract. Pure: descriptors and scopes in, one line per problem out. */
export function failureStateProblems(list: Scanned[], scopes: readonly string[]): string[] {
  const out: string[] = [];
  for (const { path, d } of list) {
    if (d.kind !== 'SURFACE' || !scopes.includes(d.programme?.scope ?? '')) continue;
    if (d.inputs?.answer !== 'contract') continue;
    const id = d.identity?.id ?? path;
    if (!(d.states ?? []).some((s) => s.name === 'error')) out.push(`${id}: reads a contract but declares no error state`);
    const ea = d.errors?.answer ?? 'none';
    if (BAD_ERRORS.has(ea)) out.push(`${id}: reads a contract but its errors answer is ${ea}`);
  }
  return out;
}

function scanned(): Scanned[] {
  return execFileSync('git', ['ls-files', '--', 'scripts/surfaces/'], { cwd: ROOT, stdio: 'pipe' })
    .toString()
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => SURFACE_RE.test(f))
    .map((f) => ({ path: f, d: readJson<Descriptor>(f) }));
}

const copy = (mut: (d: Descriptor) => void): Scanned => {
  const d = structuredClone(readJson<Descriptor>(SAMPLE));
  mut(d);
  return { path: `${SAMPLE} (copy)`, d };
};
const noErrorState = (d: Descriptor) => { d.states = (d.states ?? []).filter((s) => s.name !== 'error'); };

describe('fe.54: a contract-reading surface declares its failure state', () => {
  it('A. the real tree: no problem in the programme scope, and the scanned SURFACE count equals the manifest count', () => {
    const list = scanned();
    const problems = failureStateProblems(list, scope.programme_scopes);
    const inScope = list.filter(({ d }) => d.kind === 'SURFACE' && scope.programme_scopes.includes(d.programme?.scope ?? ''));
    const readers = inScope.filter(({ d }) => d.inputs?.answer === 'contract');
    console.log(`fe.54: scanned ${list.length} surface descriptors, ${inScope.length} in scope, ${readers.length} read a contract, ${problems.length} problems`);
    expect(problems, `fe.54 (Spec 128 Rule 12, 128:39) contract readers with no declared failure state:\n  ${problems.join('\n  ')}`).toEqual([]);
    expect(inScope.length).toBe(scope.expected_count);
  });

  it('B. RED planted (KNOWN_BAD, in memory): each defect in a copy of mobile_parcel_search gives exactly one problem', () => {
    const cases: Array<[Scanned, string]> = [
      [copy(noErrorState), 'mobile_parcel_search: reads a contract but declares no error state'],
      [copy((d) => { d.errors = { ...d.errors, answer: 'none' }; }), 'mobile_parcel_search: reads a contract but its errors answer is none'],
      [copy((d) => { d.errors = { ...d.errors, answer: 'UNRESEARCHED' }; }), 'mobile_parcel_search: reads a contract but its errors answer is UNRESEARCHED'],
    ];
    for (const [s, line] of cases) expect(failureStateProblems([s], scope.programme_scopes)).toEqual([line]);
  });

  it('C. controls: the unchanged copy, a STATIC page with no contract input, and an out-of-scope descriptor give 0', () => {
    expect(failureStateProblems([copy(() => {})], scope.programme_scopes)).toEqual([]);
    const staticPage = copy((d) => { d.inputs = { answer: 'none' }; noErrorState(d); d.errors = { answer: 'none' }; });
    expect(failureStateProblems([staticPage], scope.programme_scopes)).toEqual([]);
    const outOfScope = copy((d) => { d.programme = { scope: 'estate_other' }; noErrorState(d); });
    expect(failureStateProblems([outOfScope], scope.programme_scopes)).toEqual([]);
  });
});
