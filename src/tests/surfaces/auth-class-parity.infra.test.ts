// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md R-18 ("A surface's declared auth must match its contracts' auth class, as a
//            checks[] entry at severity FAIL"; lock pending, proven red against the /builders mismatch), docs/specs/02-web-admin/126_maxbld_surface_standard.md
//            §2.0 (scope D fenced, consequence 1: not scheduled), §11b.1 (the host allow-list), docs/specs/00-architecture/13_authentication.md §3.5.
//
// MF-46 stage C · the R-18 lock (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md §3.3 and fold 9; DECISIONS-v1 D-4 (a), ruled in the operator round
// 2026-11-11 "8. y"). For every descriptor in scopes A-C (parcel_product, parcel_admin, platform_shared):
//   P-1 it declares a checks[] entry of kind auth_class_parity at severity FAIL (a scope A-C descriptor without it fails);
//   P-2 its guards.session is a class (anon -> public, authenticated and entitled -> authenticated, admin -> admin); UNRESEARCHED fails;
//   P-3 a web page or route (identity.route under src/app/, or a CONTRACT route) has the class the request path gets: for a MaxBLD internal page the
//       host table's row class (src/lib/auth/host-policy.ts), otherwise classifyRoute (src/lib/auth/route-guard.ts);
//   P-4 every contract it references (inputs/outputs contract_ref, by id or route) resolves, and has the same class as the descriptor.
// MF-46 follow-up (operator 2026-11-12, R-18 option (b)): the findings on the tip are named exceptions with an owning row in
// scripts/surfaces/_schema/auth-class-parity-exceptions.json (the navigation-lock form): a finding not listed fails, a listed one no longer made fails.
// Scope D (estate_other) is printed by count only ("examined N, scope D not scheduled: M"); the examined counts are printed, not pinned (fold 9).
// RED: a fixture copy of the live /builders + /api/builders pair (page authenticated, data public) moved into scope A fails P-4 and P-3, as R-18 names
// it (recorded deviation: the live pair is scope D and fenced, so the red is proven on a copy, D-4 (a)).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyRoute } from '@/lib/auth/route-guard';
import { MAXBLD_INTERNAL_PREFIX, MAXBLD_ROUTES, matchMaxbldRoute } from '@/lib/auth/host-policy';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON
const ROOT = process.cwd();
const SCOPES_AC = ['parcel_product', 'parcel_admin', 'platform_shared'];
const CLASS_OF: Record<string, string> = { anon: 'public', authenticated: 'authenticated', entitled: 'authenticated', admin: 'admin' };

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === '_schema' ? [] : walk(p);
  return e.name.endsWith('.descriptor.json') ? [p] : [];
});
const ALL: Json[] = walk(path.join(ROOT, 'scripts/surfaces')).sort().map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as Json);

/**
 * The request path of a web page or route file under src/app (route groups dropped, a dynamic segment as a sample value), else null. A boundary file
 * (error.tsx, not-found.tsx, layout.tsx) is not a request path: it renders under the pages it wraps, which are judged themselves.
 */
export const urlOf = (route: unknown): string | null => {
  if (typeof route !== 'string') return null;
  if (route.startsWith('/')) return route.replace(/\[[^\]]+\]/g, 'x');
  if (!route.startsWith('src/app/') || !/\/(page|route)\.tsx?$/.test(route)) return null;
  const segs = route.slice('src/app/'.length).split('/').slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).map((s) => (/^\[.*\]$/.test(s) ? 'x' : s));
  return `/${segs.join('/')}`;
};
/** The class the request path gets: a MaxBLD internal page takes its host-table row's class (the only way it is served), else classifyRoute. */
export const pathClass = (url: string): string => {
  if (url === MAXBLD_INTERNAL_PREFIX || url.startsWith(`${MAXBLD_INTERNAL_PREFIX}/`)) {
    const row = MAXBLD_ROUTES.find((r) => r.internal === url) ?? matchMaxbldRoute(url);
    return row ? row.routeClass : 'refused';
  }
  return classifyRoute(url);
};

const EXCEPTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/surfaces/_schema/auth-class-parity-exceptions.json'), 'utf8')).exceptions as Array<{ finding: string; owner: string; why: string }>;
/** Findings no exception explains, and exceptions no finding matches (stale). */
export const judge = (lines: readonly string[], allow: readonly { finding: string }[]): { unexplained: string[]; stale: string[] } => ({
  unexplained: lines.filter((l) => !allow.some((a) => a.finding === l)),
  stale: allow.filter((a) => !lines.includes(a.finding)).map((a) => a.finding),
});

/** The R-18 findings over `descs` (contracts resolved within `descs`). */
export const parityProblems = (descs: readonly Json[]): { lines: string[]; examined: number; scopeD: number } => {
  const contracts = new Map<string, Json>();
  for (const d of descs) if (d.kind === 'CONTRACT') { contracts.set(d.identity.id, d); if (typeof d.identity.route === 'string') contracts.set(d.identity.route, d); }
  const lines: string[] = [];
  let examined = 0;
  let scopeD = 0;
  for (const d of descs) {
    if (!SCOPES_AC.includes(d.programme?.scope)) { scopeD += 1; continue; }
    examined += 1;
    const id = `${d.kind} ${d.identity?.id}`;
    const declared = (Array.isArray(d.checks) ? d.checks : []).filter((c: Json) => c.kind === 'auth_class_parity');
    if (declared.length === 0) lines.push(`R-18 P-1 ${id}: declares no auth_class_parity check`);
    else if (declared.some((c: Json) => c.severity !== 'FAIL')) lines.push(`R-18 P-1 ${id}: auth_class_parity is not severity FAIL`);
    const answer = d.guards?.session?.answer;
    const own = CLASS_OF[answer];
    if (own === undefined) { lines.push(`R-18 P-2 ${id}: guards.session is ${JSON.stringify(answer)}, not a class`); continue; }
    const url = urlOf(d.identity?.route);
    if (url !== null) {
      const want = pathClass(url);
      if (want !== own) lines.push(`R-18 P-3 ${id}: guards.session ${answer} (${own}) but ${url} is ${want}`);
    }
    const refs = [...(d.inputs?.contract_ref ?? []), ...(d.outputs?.contract_ref ?? [])].filter((r: unknown) => typeof r === 'string');
    for (const r of [...new Set<string>(refs)]) {
      const c = contracts.get(r);
      if (!c) { lines.push(`R-18 P-4 ${id}: contract ${r} does not resolve`); continue; }
      const theirs = CLASS_OF[c.guards?.session?.answer];
      if (theirs !== own) lines.push(`R-18 P-4 ${id}: guards.session ${answer} (${own}) but contract ${c.identity.id} (${c.identity.route}) is ${String(c.guards?.session?.answer)} (${theirs ?? 'no class'})`);
    }
  }
  return { lines, examined, scopeD };
};

describe('R-18 auth class parity (scopes A-C; scope D counted)', () => {
  it('the real tree: every scope A-C descriptor declares the check and its class matches its path and its contracts', () => {
    const r = parityProblems(ALL);
    console.log(`R-18: examined ${r.examined}, scope D not scheduled: ${r.scopeD}`);
    expect(r.examined).toBeGreaterThan(0);
    expect(judge(r.lines, EXCEPTIONS)).toEqual({ unexplained: [], stale: [] });
  });
  it('every exception names an owning queue row and a reason; none is listed twice', () => {
    const queue = fs.readFileSync(path.join(ROOT, '.cursor/MCFRONTEND-QUEUE.md'), 'utf8');
    for (const e of EXCEPTIONS) expect([e.finding, /^MF-\d+$/.test(e.owner) && queue.includes(`**${e.owner} `), e.why.length > 20]).toEqual([e.finding, true, true]);
    expect(new Set(EXCEPTIONS.map((e) => e.finding)).size).toBe(EXCEPTIONS.length);
  });
  it('RED: a new finding fails as unexplained; a fixed one left listed fails as stale', () => {
    const lines = parityProblems(ALL).lines;
    expect(judge([...lines, 'R-18 P-1 SURFACE planted: declares no auth_class_parity check'], EXCEPTIONS).unexplained).toEqual(['R-18 P-1 SURFACE planted: declares no auth_class_parity check']);
    expect(judge(lines.slice(1), EXCEPTIONS).stale).toEqual([lines[0]]);
  });
  it('the MaxBLD plain pages: public on the host table and declared anon', () => {
    for (const p of ['/parcel-tool/help', '/parcel-tool/terms', '/parcel-tool/privacy']) expect([p, pathClass(p)]).toEqual([p, 'public']);
    expect(pathClass('/parcel-tool')).toBe('authenticated');
    expect(urlOf('src/app/(maxbld)/parcel-tool/(static)/help/page.tsx')).toBe('/parcel-tool/help');
    expect(urlOf('src/app/builders/[id]/page.tsx')).toBe('/builders/x');
    expect(urlOf('src/app/(maxbld)/parcel-tool/(static)/error.tsx')).toBeNull();
  });
  it('RED: a fixture copy of the live /builders + /api/builders pair, moved into scope A, fails (page authenticated, data public)', () => {
    const page = structuredClone(ALL.find((d) => d.identity?.id === 'web_builders_list')) as Json;
    const api = structuredClone(ALL.find((d) => d.identity?.id === 'contract_builders')) as Json;
    expect([page.programme.scope, page.guards.session.answer, api.guards.session.answer]).toEqual(['estate_other', 'authenticated', 'anon']);
    page.programme.scope = 'parcel_product';
    page.checks = [{ id: 'x_auth_class_parity', kind: 'auth_class_parity', severity: 'FAIL', blocking: true, when: 'pre', why: 'fixture' }];
    api.programme.scope = 'parcel_product';
    api.checks = [{ id: 'y_auth_class_parity', kind: 'auth_class_parity', severity: 'FAIL', blocking: true, when: 'pre', why: 'fixture' }];
    expect(parityProblems([page, api]).lines).toEqual([
      'R-18 P-4 SURFACE web_builders_list: guards.session authenticated (authenticated) but contract contract_builders (/api/builders) is anon (public)',
    ]);
    // Without the declaration it fails P-1 too; with an UNRESEARCHED session P-2.
    page.checks = [];
    expect(parityProblems([page, api]).lines[0]).toBe('R-18 P-1 SURFACE web_builders_list: declares no auth_class_parity check');
    page.guards.session.answer = 'UNRESEARCHED';
    expect(parityProblems([page, api]).lines).toContain('R-18 P-2 SURFACE web_builders_list: guards.session is "UNRESEARCHED", not a class');
  });
  it('RED: a MaxBLD plain page declared authenticated fails P-3 against the host table', () => {
    const help = structuredClone(ALL.find((d) => d.identity?.id === 'web_help')) as Json;
    help.guards.session.answer = 'authenticated';
    expect(parityProblems([help]).lines).toEqual(['R-18 P-3 SURFACE web_help: guards.session authenticated (authenticated) but /parcel-tool/help is public']);
  });
});
