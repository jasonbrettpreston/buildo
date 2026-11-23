// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-51 (Spec 136 §fe.51)
//
// task-367 COMPLY.3 (MF-98 · McFrontend queue · lane BL-HB367; RR-0385 item 6, RR-0413). The rule, Spec 136 fe.51 (126:82, §0b item 11):
//   "A tab switch uses navigate, not push." Spec 126 called it "convention, not checked by the lock" (126:82); this test checks it.
// TESTED: in the mobile files the in-scope descriptors declare (the mobile part of the scope-fence.logic.test.ts file set, 20 today), a call `<x>.push(arg)`
// whose arg is `PARCEL_TAB_ROUTE[...]`, `PARCEL_TAB_ROUTE.<tab>` or a string literal equal to a tab route. The tab routes are parsed by AST
// from PARCEL_TAB_ROUTE (mobile/src/lib/parcelSearchMatch.ts), not copied; the parse is fail-closed: exactly the three tabs lookup, tracked
// and account, or the test fails, so a renamed or reshaped constant cannot leave (A) passing on an empty map.
// The allow-list is fail-closed both ways, in the nav-by-route.logic.test.ts form: a finding no entry explains fails, and an entry that
// matches a different number of findings than its `count` (a stale entry: 0) fails. Entries are keyed by file + call text, never by line.
// The list only shrinks: the row that fixes a control removes its entry in the same commit. The two entries are the audited tab pushes
// NAV-AUDIT #1 and #12 (126:82), each owned by an existing LATER queue row.
// LIMITS (stated, not widened): a route held in a variable is missed; the lead-gen five-tab bar is not MaxBLD; web has no tab bar (no Tabs in
// src/app/(maxbld), src/components/surfaces or src/components/report). Files come from `git ls-files`. No DB, no network.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TAB_SOURCE = 'mobile/src/lib/parcelSearchMatch.ts';
const TAB_CONST = 'PARCEL_TAB_ROUTE';
const TABS = ['account', 'lookup', 'tracked'];
const MANIFEST = 'scripts/surfaces/_schema/converted-surfaces.json';

export interface Finding { file: string; line: number; call: string }
export interface Allow { file: string; call: string; count: number; why: string }

const LAYOUT = 'mobile/app/(app)/parcel-tool/_layout.tsx';
const TRACKED = 'mobile/app/(app)/parcel-tool/tracked.tsx';
// Named, owned exceptions (plan PLAN-367-v1 section 3 T3). Shrink-only: never add an entry.
const ALLOW: Allow[] = [
  { file: LAYOUT, call: 'router.push(PARCEL_TAB_ROUTE[tab])', count: 1, why: 'owed: MF-49/MF-50 (NAV-AUDIT #1, 126:82): the parcel shelf tab press pushes its tab route' },
  { file: TRACKED, call: 'router.push(PARCEL_TAB_ROUTE.account)', count: 1, why: 'owed: MF-51/MF-52 (NAV-AUDIT #12, 126:82): the Tracked Lots account button pushes the Account tab' },
];

const parse = (rel: string, text: string) => ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** The tab routes of the PARCEL_TAB_ROUTE object literal: key to route. Throws unless exactly the three tabs, each a string literal. */
export function tabRoutes(rel: string, text: string): Map<string, string> {
  const sf = parse(rel, text);
  const out = new Map<string, string>();
  let found = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === TAB_CONST) {
      found++;
      const init = n.initializer;
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && ts.isStringLiteral(p.initializer)) out.set(p.name.text, p.initializer.text);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const keys = [...out.keys()].sort();
  if (found !== 1 || keys.join(',') !== TABS.join(',')) throw new Error(`${rel}: ${TAB_CONST} must be one object literal with exactly the tabs ${TABS.join(', ')}; found ${found} declaration(s) with ${keys.join(', ') || 'no'} string routes`);
  return out;
}

/** Every `<x>.push(arg)` whose arg is a tab route. Pure: path, text and the tab routes in, findings out. */
export function findTabPushes(rel: string, text: string, routes: ReadonlySet<string>): Finding[] {
  const sf = parse(rel, text);
  const out: Finding[] = [];
  const isTab = (a: ts.Expression): boolean => {
    if (ts.isElementAccessExpression(a) || ts.isPropertyAccessExpression(a)) return ts.isIdentifier(a.expression) && a.expression.text === TAB_CONST;
    if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return routes.has(a.text);
    return false;
  };
  const visit = (n: ts.Node): void => {
    // the ! is safe: the length check before it proves the first argument exists
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'push' && n.arguments.length > 0 && isTab(n.arguments[0]!)) {
      out.push({ file: rel, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, call: n.getText(sf).replace(/\s+/g, ' ') });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const keyOf = (a: { file: string; call: string }) => `${a.file} ${a.call}`;

/** Findings no entry explains, and entries whose match count is not their `count` (a stale entry matches 0). */
export function judge(findings: Finding[], allow: Allow[]): { unexplained: string[]; miscounted: string[] } {
  const keys = new Set(allow.map(keyOf));
  const unexplained = findings.filter((f) => !keys.has(keyOf(f))).map((f) => `${f.file}:${f.line} ${f.call}`);
  const miscounted = allow
    .map((a) => ({ a, n: findings.filter((f) => keyOf(f) === keyOf(a)).length }))
    .filter(({ a, n }) => n !== a.count)
    .map(({ a, n }) => `${keyOf(a)}: expected ${a.count}, found ${n}`);
  return { unexplained, miscounted };
}

const routes = new Set(tabRoutes(TAB_SOURCE, readFileSync(join(ROOT, TAB_SOURCE), 'utf8')).values());
const git = (args: string[]) => execFileSync('git', args, { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').map((s) => s.trim());
/** The tracked mobile .ts/.tsx files the in-scope descriptors declare (identity.route plus x-draft.files): the scope-fence file set, mobile part. */
function mobileFiles(): string[] {
  const scopes = (JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8')) as { scope: { programme_scopes: string[] } }).scope.programme_scopes;
  const tracked = new Set(git(['ls-files']));
  const out = new Set<string>();
  for (const f of git(['ls-files', '--', 'scripts/surfaces/']).filter((p) => p.endsWith('.descriptor.json'))) {
    const d = JSON.parse(readFileSync(join(ROOT, f), 'utf8')) as { programme?: { scope?: string }; identity?: { route?: string }; 'x-draft'?: { files?: string[] } };
    if (!scopes.includes(d.programme?.scope ?? '')) continue;
    for (const p of [d.identity?.route, ...(d['x-draft']?.files ?? [])]) if (p && p.startsWith('mobile/') && /\.tsx?$/.test(p) && tracked.has(p)) out.add(p);
  }
  return [...out].sort();
}
function scanTree(): { files: string[]; findings: Finding[] } {
  const files = mobileFiles();
  return { files, findings: files.flatMap((f) => findTabPushes(f, readFileSync(join(ROOT, f), 'utf8'), routes)) };
}

describe('fe.51: a tab switch uses navigate, not push', () => {
  it('A. the real tree: every tab push is explained by an allow-list entry, and every entry matches exactly its count', () => {
    const { files, findings } = scanTree();
    console.log(`fe.51: scanned ${files.length} mobile files, ${routes.size} tab routes, ${findings.length} tab pushes, ${ALLOW.length} owned exceptions`);
    expect(judge(findings, ALLOW)).toEqual({ unexplained: [], miscounted: [] });
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('A2. the allow-list only shrinks; each entry has an owner row and a count', () => {
    expect(ALLOW.length).toBeLessThanOrEqual(2);
    for (const a of ALLOW) {
      expect(a.why).toMatch(/^owed: MF-\d+/);
      expect(a.count).toBeGreaterThan(0);
    }
    expect(new Set(ALLOW.map(keyOf)).size).toBe(ALLOW.length);
  });

  it('B. RED planted (KNOWN_BAD, in memory): a push of a tab route gives exactly one finding; a stale entry fails', () => {
    for (const code of ['router.push(PARCEL_TAB_ROUTE.tracked);', "router.push('/(app)/parcel-tool/account');"]) {
      expect(findTabPushes('planted.tsx', code, routes), code).toHaveLength(1);
    }
    const stale: Allow = { file: LAYOUT, call: 'router.push(PARCEL_TAB_ROUTE.lookup)', count: 1, why: 'owed: MF-49 (stale)' };
    expect(judge(scanTree().findings, [...ALLOW, stale]).miscounted).toEqual([`${keyOf(stale)}: expected 1, found 0`]);
  });

  it('B2. RED planted: a reshaped tab constant fails closed', () => {
    expect(() => tabRoutes('x.ts', "export const PARCEL_TAB_ROUTE = { lookup: '/a', tracked: '/b' };")).toThrow(/exactly the tabs/);
    expect(() => tabRoutes('x.ts', 'export const OTHER = {};')).toThrow(/found 0 declaration/);
  });

  it('C. controls: navigate, replace and a non-tab push give 0', () => {
    const controls = ['router.navigate(PARCEL_TAB_ROUTE.tracked);', 'router.replace(PARCEL_TAB_ROUTE.lookup);', 'router.push(trackedLotRoute(id));'];
    for (const code of controls) expect(findTabPushes('control.tsx', code, routes), code).toEqual([]);
  });
});
