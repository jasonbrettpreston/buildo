// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0a principle 1 and §11b.2 (page structure is data; a row names only what its binding supplies),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-18, FE-31; docs/specs/02-web-admin/127_surface_conversion_procedure.md §3.2a (SV arms).
//
// PAGE.TABLE (task-390) fix round · the S-page arm of scripts/surfaces/surface-validate.mjs (implemented in screen-checks.mjs beside the other arms): at build
// time, for every screen row, every name is checked against what the screen's binding supplies, so a wrong name fails the hook, not a render.
//   P1 the real table, binding and content give no finding (the positive control of every case below);
//   P2 each planted wrong name is refused, and the SAME mutation with a valid name passes: a flag in `when`, a part's `when`, `busy`, a choices `list` and
//      `select`, a button `target`, a `vars` path, the screen `contract`, a content key that is missing, a content key that is only a PREFIX (not a leaf),
//      and a choices row whose content prefix lacks the leaf of one supplied answer;
//   P4 the arm cannot pass on nothing: it expects one screen per binding module that calls the page builder; an unreadable table, an empty one, a failed
//      context and fewer screens than expected are each a finding naming the file and both counts; the real table is the passing control;
//   P3 the supplied names are read from the binding's exports (data lists), and a binding without them is refused.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pageArm, pageProblems, supplyOf } from '../../../scripts/surfaces/screen-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON documents
const ROOT = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const rj = (p: string): Json => JSON.parse(read(p));
const ID = 'mobile_parcel_semi_question';
const TABLE = rj('scripts/surfaces/_schema/static-page.json');
const SCREEN = TABLE.screens[ID] as Json;
const CONTENT = rj(`scripts/surfaces/parcel_product/F01/surfaces/${ID}.content.json`) as Record<string, string>;
const SUPPLIED = supplyOf(read(SCREEN.binding));
const CONTRACTS = ['contract_parcels_lookup'];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const run = (screen: Json, content: Record<string, string> = CONTENT): string[] => pageProblems(ID, screen, SUPPLIED, content, CONTRACTS);
const sec = (s: Json, id: string): Json => s.sections.find((x: Json) => x.id === id);

describe('P1 the real screen', () => {
  it('names the binding it reads, and no name in any row is outside what that binding supplies', () => {
    expect(SCREEN.binding).toBe('mobile/src/components/surfaces/SemiQuestionBinding.tsx');
    expect(SUPPLIED.flags.length).toBeGreaterThan(0);
    expect(run(SCREEN)).toEqual([]);
  });
});

describe('P2 each wrong name is refused; the same change with a valid name passes', () => {
  const cases: Array<[string, (s: Json, v: string) => void, string, string]> = [
    ['a when', (s, v) => { sec(s, 'loading').when = v; }, 'nearest_lot', 'ask'],
    ["a part's when", (s, v) => { sec(s, 'error').parts[0].when = v; }, 'nearest_lot', 'schema_drift'],
    ['busy', (s, v) => { sec(s, 'continue').busy = v; }, 'nearest_lot', 'loading'],
    ['a choices list', (s, v) => { sec(s, 'answer').list = v; }, 'candidates', 'answers'],
    ['a choices select', (s, v) => { sec(s, 'answer').select = v; }, 'picked', 'selected'],
    ['a button target', (s, v) => { sec(s, 'continue').target = v; }, 'href', 'route'],
    ['a vars path', (s, v) => { sec(s, 'ratelimit').parts[0].vars.seconds = v; }, 'errors.500.x', 'errors.429.retryAfterSeconds'],
    ['the contract', (s, v) => { s.contract = v; }, 'contract_other', 'contract_parcels_lookup'],
    ['a content key', (s, v) => { sec(s, 'loading').content = v; }, 'state.nothing', 'state.loading'],
    ['a button idle key', (s, v) => { sec(s, 'continue').idle = v; }, 'select.nothing', 'select.none'],
  ];
  for (const [why, mutate, bad, good] of cases) {
    it(`${why}: ${bad} is refused, ${good} passes`, () => {
      const wrong = clone(SCREEN); mutate(wrong, bad);
      expect([why, run(wrong).length > 0]).toEqual([why, true]);
      const right = clone(SCREEN); mutate(right, good);
      expect([why, run(right)]).toEqual([why, []]);
    });
  }
  it('a content key that is only a prefix of leaves is refused (the leaf must exist exactly)', () => {
    const s = clone(SCREEN); sec(s, 'loading').content = 'state';
    expect(run(s).some((l) => l.includes('state'))).toBe(true);
    const t = clone(SCREEN); sec(t, 'question').content = 'question';
    expect(run(t).length).toBeGreaterThan(0);
  });
  it('a choices row whose content prefix lacks the leaf of a supplied answer is refused; with the leaf it passes', () => {
    const without = { ...CONTENT }; delete without['answer.not_sure'];
    expect(run(SCREEN, without).length).toBeGreaterThan(0);
    expect(run(SCREEN, CONTENT)).toEqual([]);
  });
});

describe('P3 the supplied names are the binding exports', () => {
  it('a binding with no flag list is refused; with the lists it reads them', () => {
    expect(() => supplyOf('export const NOTHING = 1;')).toThrow(/FLAG_NAMES/);
    const s = supplyOf("export const A_FLAG_NAMES = ['x', 'y'] as const;\nexport const A_VALUE_NAMES = ['v'] as const;\nexport const A_VAR_PATHS = ['p.q'] as const;\nexport const A_CHOICES = { v: ['a', 'b'] } as const;\nexport const A_CONTRACT = 'c_one';");
    expect(s).toEqual({ flags: ['x', 'y'], values: ['v'], vars: ['p.q'], choices: { v: ['a', 'b'] }, contract: 'c_one' });
  });
});

describe('P4 the arm fails on an unreadable or empty table', () => {
  const BUILDER = 'mobile/src/components/surfaces/PageTableBinding.tsx';
  const TABLE_PATH = 'scripts/surfaces/_schema/static-page.json';
  const DESC = `scripts/surfaces/parcel_product/F01/surfaces/${ID}.descriptor.json`;
  // task-452 (SEARCHFIX.4; dated 2026-11-24; prior text kept: the context held the semi screen alone, one screen expected): the wall S-096 is the
  // second screens row, so the context carries both converted surfaces, both bindings, both contracts and their files; the counts move 1 -> 2.
  const WALL = 'mobile_parcel_wall';
  const WALL_SCREEN = TABLE.screens[WALL] as Json;
  const WALL_DESC = `scripts/surfaces/parcel_product/F01/surfaces/${WALL}.descriptor.json`;
  const files = [TABLE_PATH, SCREEN.binding, BUILDER, DESC, `scripts/surfaces/parcel_product/F01/surfaces/${ID}.content.json`,
    WALL_SCREEN.binding, WALL_DESC, `scripts/surfaces/parcel_product/F01/surfaces/${WALL}.content.json`];
  const rootWith = (table: string | null): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-arm-'));
    for (const f of files) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(root, f)); }
    if (table === null) fs.rmSync(path.join(root, TABLE_PATH)); else fs.writeFileSync(path.join(root, TABLE_PATH), table);
    return root;
  };
  const ctxOf = (root: string, ok = true) => ({
    root, ok, manifest: { converted: [ID, WALL] }, inScope: new Map([[ID, { d: rj(DESC), file: DESC }], [WALL, { d: rj(WALL_DESC), file: WALL_DESC }]]),
    contracts: new Map([['contract_parcels_lookup', {}], ['contract_parcels_entitlement', {}]]),
    bindings: { modules: [{ path: SCREEN.binding, platform: 'mobile' }, { path: WALL_SCREEN.binding, platform: 'mobile' }, { path: BUILDER, platform: 'mobile' }] },
  });
  it('the real table is the passing control: two screens expected, two found, no finding', () => {
    expect(pageArm(ctxOf(rootWith(read(TABLE_PATH))))).toEqual({ findings: [], note: 'S-page ok (2 of 2 screens)' });
  });
  it('RED: a missing table, an empty screens map and a failed context are each a finding', () => {
    const missing = pageArm(ctxOf(rootWith(null))).findings;
    expect(missing).toEqual([`SV-PAGE ${TABLE_PATH}: no readable screens (expected 2 screen(s) from the binding modules that call the page builder, found 0)`]);
    expect(pageArm(ctxOf(rootWith(JSON.stringify({ pages: {}, screens: {} })))).findings).toEqual(missing);
    expect(pageArm(ctxOf(rootWith(read(TABLE_PATH)), false)).findings).toEqual(missing);
  });
  it('a comment-only or string-only mention of the builder does not count as a caller; a real call in a file that is not a bindings.json module is a finding naming the file', () => {
    const root = rootWith(read(TABLE_PATH));
    const c = ctxOf(root);
    const mention = 'mobile/src/components/surfaces/MentionBinding.tsx';
    fs.writeFileSync(path.join(root, mention), "// pageProps(a) is drawn elsewhere\n/* pageProps(b) */\nexport const note = 'pageProps(c)';\n");
    c.bindings.modules.push({ path: mention, platform: 'mobile' });
    expect(pageArm(c).findings).toEqual([]);
    const stray = 'mobile/src/components/surfaces/StrayBinding.tsx';
    fs.writeFileSync(path.join(root, stray), 'export const x = pageProps(a, b, c, d);\n');
    expect(pageArm(c).findings).toEqual([`SV-PAGE ${stray}: calls the page builder but is not a bindings.json module`]);
  });
  it('RED: a second caller of the builder with no screen in the table is a finding with both counts', () => {
    const root = rootWith(read(TABLE_PATH));
    const other = 'mobile/src/components/surfaces/OtherBinding.tsx';
    fs.writeFileSync(path.join(root, other), 'export const x = pageProps(a, b, c, d);\n');
    const c = ctxOf(root); c.bindings.modules.push({ path: other, platform: 'mobile' });
    expect(pageArm(c).findings).toEqual([`SV-PAGE ${TABLE_PATH}: 2 screen(s) read, 3 expected (the binding modules that call the page builder)`]);
  });
});
