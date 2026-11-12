// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 dated note 2026-11-11 (MF-44: the MaxBLD web pages on synthetic goldens,
//            the live switch), §11b.7 W4-W6, docs/specs/00-architecture/13_authentication.md §3.2 (getClaims for reads),
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 (a server page gates itself first), docs/specs/03-mobile/100_mobile_parcel_cost_tool.md
//            §2.8 (log hygiene), docs/specs/02-web-admin/128_surface_standard_policy.md R-03 (scope D fenced).
//
// MF-44 · the MaxBLD web pages lock (operator "01-a 0-2 b as long as they are complaint"). Cases:
//   G  the page gate: no session -> /login; the dev sentinel is never entitled; no row, a lapsed status and a lead_gen-only user are not entitled;
//      each active status is; a DB error is thrown (fail closed) and logged;
//   R  the report route: a bad lot id is not found BEFORE the gate runs; a good id runs the gate, then not found while the switch is off;
//   S  the search page: a plan holder gets the idle page, anyone else the unauthorized state; both pages are force-dynamic;
//   L  the live switch is pinned false; nothing under src/app/(maxbld)/parcel-tool imports openReport, the query cache, a fetch, the lead-gen
//      feature or links to /dashboard; the paths classify authenticated (route-guard fail-closed default).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }),
}));
const auth = vi.hoisted(() => ({ dev: false, claims: null as null | { sub?: unknown }, claimsError: null as unknown, throws: false }));
const log = vi.hoisted(() => ({ logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('next/navigation', () => nav);
vi.mock('@/lib/logger', () => log);
vi.mock('@/lib/db/client', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/auth/route-guard', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/route-guard')>()), isDevMode: () => auth.dev }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims: async () => { if (auth.throws) throw new Error('jwks fetch failed'); return { data: auth.claims ? { claims: auth.claims } : null, error: auth.claimsError }; } } }),
}));

import { requireParcelToolPage } from '@/lib/auth/require-parcel-tool-page';
import { classifyRoute } from '@/lib/auth/route-guard';
import { MAXBLD_WEB_LIVE, WEB_STATIC_SITUATION, WEB_UNAUTHORIZED_SITUATION } from '@/lib/surfaces/maxbld-web';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'src/app/(maxbld)/parcel-tool');
const UID = '11111111-2222-4333-8444-555555555555';
import type { Queryable } from '@/lib/entitlements';
// Dated 2026-11-11 (MF-46, DECISIONS-v1 D-2 b "8. y"): the gate reads the terms record after the entitlement read; this helper answers
// that read with an accepted row (or `terms`), so every entitlement assertion below is unchanged.
const db = (rows: Array<{ status: string }> | Error, terms: Array<{ tos_accepted_at: string | null }> | Error = [{ tos_accepted_at: '2026-11-11T00:00:00Z' }]) => {
  const query = vi.fn(async (...a: unknown[]) => {
    const r = String(a[0]).includes('user_profiles') ? terms : rows;
    if (r instanceof Error) throw r;
    return { rows: r };
  });
  return Object.assign({ query } as unknown as Queryable, { query });
};

beforeEach(() => {
  auth.dev = false; auth.claims = { sub: UID }; auth.claimsError = null; auth.throws = false;
  nav.notFound.mockClear(); nav.redirect.mockClear(); log.logInfo.mockClear(); log.logError.mockClear();
});

describe('G the page gate', () => {
  it('no session -> redirect to /login; a claims error is no session', async () => {
    auth.claims = null;
    await expect(requireParcelToolPage(db([]))).rejects.toThrow('NEXT_REDIRECT /login?redirect=/parcel-tool');
    auth.claims = { sub: UID }; auth.claimsError = new Error('jwks');
    await expect(requireParcelToolPage(db([]))).rejects.toThrow('NEXT_REDIRECT /login?redirect=/parcel-tool');
  });
  it('a sign-in call that throws is not a missing session: it is logged and thrown to the error boundary, never a redirect', async () => {
    auth.throws = true;
    await expect(requireParcelToolPage(db([]))).rejects.toThrow('jwks fetch failed');
    expect(nav.redirect).not.toHaveBeenCalled();
    expect(log.logError).toHaveBeenCalledWith('[auth/require-parcel-tool-page]', expect.any(Error), { stage: 'session-verify' });
  });
  it('the dev sentinel is never entitled and never reads the database', async () => {
    auth.dev = true;
    const d = db([{ status: 'active' }]);
    await expect(requireParcelToolPage(d)).resolves.toEqual({ uid: 'dev-user', entitled: false });
    expect(d.query).not.toHaveBeenCalled();
  });
  it('no parcel_tool row, a lapsed status -> not entitled; each active status -> entitled; the read is parcel_tool only', async () => {
    await expect(requireParcelToolPage(db([]))).resolves.toEqual({ uid: UID, entitled: false });
    for (const s of ['cancelled_pending_deletion', 'expired', 'canceled']) await expect(requireParcelToolPage(db([{ status: s }]))).resolves.toEqual({ uid: UID, entitled: false });
    for (const s of ['trial', 'active', 'past_due', 'admin_managed']) await expect(requireParcelToolPage(db([{ status: s }]))).resolves.toEqual({ uid: UID, entitled: true });
    const d = db([]);
    await requireParcelToolPage(d);
    expect(d.query.mock.calls[0]).toEqual([expect.stringContaining('FROM entitlements'), [UID, 'parcel_tool']]);
  });
  it('MF-46 D-2 b: an entitled user with no terms record goes to the terms step; a not-entitled user is never asked; a terms read error is thrown', async () => {
    await expect(requireParcelToolPage(db([{ status: 'active' }], []))).rejects.toThrow('NEXT_REDIRECT /terms-accept?redirect=/parcel-tool');
    await expect(requireParcelToolPage(db([{ status: 'active' }], [{ tos_accepted_at: null }]))).rejects.toThrow('NEXT_REDIRECT /terms-accept?redirect=/parcel-tool');
    const lapsed = db([{ status: 'expired' }], []);
    await expect(requireParcelToolPage(lapsed)).resolves.toEqual({ uid: UID, entitled: false });
    expect(lapsed.query).toHaveBeenCalledTimes(1);
    await expect(requireParcelToolPage(db([{ status: 'active' }], new Error('pg down')))).rejects.toThrow('pg down');
    expect(log.logError).toHaveBeenCalledWith('[auth/require-parcel-tool-page]', expect.any(Error), { stage: 'terms-lookup', uid: UID });
  });
  it('a database error is thrown (fail closed) and logged with the uid only', async () => {
    await expect(requireParcelToolPage(db(new Error('pg down')))).rejects.toThrow('pg down');
    expect(log.logError).toHaveBeenCalledWith('[auth/require-parcel-tool-page]', expect.any(Error), { stage: 'entitlement-lookup', uid: UID });
  });
});

describe('R the report route (O-2 b)', () => {
  it('a bad lot id is not found before the gate; a good id runs the gate, then not found while the switch is off', async () => {
    const { default: Page } = await import('@/app/(maxbld)/parcel-tool/[parcelId]/page');
    auth.claims = null; // a gate run would redirect; a bad id must never get there
    for (const bad of ['', ' ', 'x'.repeat(33)]) {
      await expect(Page({ params: Promise.resolve({ parcelId: bad }) })).rejects.toThrow('NEXT_NOT_FOUND');
    }
    expect(nav.redirect).not.toHaveBeenCalled();
    await expect(Page({ params: Promise.resolve({ parcelId: '12345' }) })).rejects.toThrow('NEXT_REDIRECT /login?redirect=/parcel-tool');
    auth.dev = true;
    await expect(Page({ params: Promise.resolve({ parcelId: '12345' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('R2 the fail-closed tripwire past the switch', () => {
  it('with the switch flipped and no live render built, the route throws instead of rendering anything', async () => {
    vi.resetModules();
    vi.doMock('@/lib/surfaces/maxbld-web', async (orig) => ({ ...(await orig<typeof import('@/lib/surfaces/maxbld-web')>()), MAXBLD_WEB_LIVE: true }));
    const { default: Page } = await import('@/app/(maxbld)/parcel-tool/[parcelId]/page');
    auth.dev = true;
    await expect(Page({ params: Promise.resolve({ parcelId: '12345' }) })).rejects.toThrow('the live web report render lands with the live switch');
    vi.doUnmock('@/lib/surfaces/maxbld-web');
    vi.resetModules();
  });
});

describe('S the search page', () => {
  it('a plan holder gets the idle page, anyone else the unauthorized state', async () => {
    const { default: Page } = await import('@/app/(maxbld)/parcel-tool/page');
    auth.dev = true;
    const el = (await Page()) as { props: { situation: unknown } };
    expect(el.props.situation).toEqual(WEB_UNAUTHORIZED_SITUATION);
    vi.resetModules();
    vi.doMock('@/lib/auth/require-parcel-tool-page', () => ({ requireParcelToolPage: async () => ({ uid: UID, entitled: true }) }));
    const { default: Page2 } = await import('@/app/(maxbld)/parcel-tool/page');
    const { WEB_STATIC_SITUATION: idle } = await import('@/lib/surfaces/maxbld-web');
    expect(((await Page2()) as { props: { situation: unknown } }).props.situation).toEqual(idle);
    expect(idle).toEqual(WEB_STATIC_SITUATION);
    vi.doUnmock('@/lib/auth/require-parcel-tool-page');
  });
  it('both pages are force-dynamic (a per-user render is never cached)', () => {
    for (const f of ['page.tsx', '[parcelId]/page.tsx']) expect([f, /export const dynamic = 'force-dynamic';/.test(fs.readFileSync(path.join(DIR, f), 'utf8'))]).toEqual([f, true]);
  });
});

describe('C the shared pure core stays import-free (OUTPUT security F3: the web bundle reads it by relative path, and `@/` names a different tree on each platform)', () => {
  const importLines = (t: string): string[] => t.split('\n').filter((l) => /^\s*(import|export\s+[^=]*\bfrom\b)|\brequire\(/.test(l));
  it('mobile/src/lib/parcelSearchCore.ts has no import, re-export or require', () => {
    expect(importLines(fs.readFileSync(path.join(ROOT, 'mobile/src/lib/parcelSearchCore.ts'), 'utf8'))).toEqual([]);
  });
  it('RED: a planted import, re-export and require are each caught', () => {
    expect(importLines("import { x } from '@/lib/errors';\nexport { y } from './z';\nconst a = require('b');\n// plain comment")).toHaveLength(3);
  });
});

describe('L the live switch and the fences', () => {
  it('the live switch is off until the MB-44 row flips it', () => {
    expect(MAXBLD_WEB_LIVE).toBe(false);
  });
  const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
  const BANNED: Array<[RegExp, string]> = [
    [/\bopenReport\b/, 'the report meter (T13: the lookup route only)'],
    [/@tanstack\/react-query/, 'the persisted query cache (IndexedDB; security S-4)'],
    // A URL string of the lookup route (the report route imports only its query schema, `@/app/api/parcels/lookup/types`, to check the lot id).
    [/\bfetch\(|fetchWithAuth|['"`]\/api\/parcels\/lookup/, 'a lookup request (no report is charged while the switch is off)'],
    [/features\/leads|\/dashboard|\/permits\/|\/builders/, 'scope D (Spec 128 R-03)'],
    // Dated 2026-11-11 (MF-46; Spec 126 §11b.1 "Auth ... existing, not converted"; §11b.3 `web_login` shared): the one named exception is the
    // shared sign-in screen, by exact module name; any other component outside the binding modules still fails (planted case below).
    [/@\/components\/(?!surfaces\/|auth\/LoginForm['"])/, 'a component outside the binding modules (plan v2 P16; OUTPUT security F7)'],
  ];
  // OUTPUT panel (regression 1): the binding and the pages' data module are scanned too, so a fetch added there cannot charge a report either.
  it('nothing under src/app/(maxbld)/parcel-tool, the web SEARCH binding or maxbld-web.ts meters, caches, fetches or reaches scope D (non-vacuous)', () => {
    // MF-46 stage C (dated 2026-11-11; plan v3 §12 fold 12): the five plain-page files under parcel-tool/(static) join the walk, and the web STATIC
    // binding, its data module and the page table (where every link of those pages is written) are scanned too (8 -> 16).
    const all = [...files(DIR), path.join(ROOT, 'src/components/surfaces/web/SearchBinding.tsx'), path.join(ROOT, 'src/lib/surfaces/maxbld-web.ts'),
      path.join(ROOT, 'src/components/surfaces/web/StaticBinding.tsx'), path.join(ROOT, 'src/lib/surfaces/maxbld-static.ts'), path.join(ROOT, 'scripts/surfaces/_schema/static-page.json')];
    // MF-46 stage B (dated 2026-11-11): 16 -> 23, the MaxBLD sign-in client mount, its four routes and the terms step page and client.
    // MF-46 (dated 2026-11-11, plan v1 fold 4): 23 -> 24, the refused-page target (static)/refused/page.tsx.
    // MF-46 OUTPUT panel (regression F2, dated 2026-11-11): the shared LoginForm the mounts may import is scanned too, 24 -> 25.
    all.push(path.join(ROOT, 'src/components/auth/LoginForm.tsx'));
    expect(all.length).toBe(25);
    for (const f of all) for (const [re, why] of BANNED) expect([path.relative(ROOT, f), why, re.test(fs.readFileSync(f, 'utf8'))]).toEqual([path.relative(ROOT, f), why, false]);
  });
  it('RED: each banned form is caught in a planted text', () => {
    const planted = ["import { openReport } from '@/lib/entitlements';", "import { useQuery } from '@tanstack/react-query';", "const url = '/api/parcels/lookup?q=x';", "<a href='/dashboard'>", "import { Card } from '@/components/ui/Card';"];
    planted.forEach((t, i) => expect((BANNED[i] as [RegExp, string])[0].test(t)).toBe(true));
    // MF-46: the named exception is exact: another auth component, or a LoginForm look-alike path, is still caught.
    const comp = (BANNED[4] as [RegExp, string])[0];
    expect([comp.test("import { X } from '@/components/auth/Other';"), comp.test("import { X } from '@/components/auth/LoginFormX';"), comp.test("import { LoginForm } from '@/components/auth/LoginForm';")]).toEqual([true, true, false]);
  });
  // OUTPUT panel (regression 2): each provider layout carries its own forced scheme: the web pages dark, the admin pages light (MF-37 batch C-2).
  it('the parcel-tool layout forces dark; the admin layout still forces light', () => {
    const web = fs.readFileSync(path.join(DIR, 'layout.tsx'), 'utf8');
    const admin = fs.readFileSync(path.join(ROOT, 'src/app/(maxbld)/admin/layout.tsx'), 'utf8');
    expect([/forceColorScheme="dark"/.test(web), /scheme="dark"/.test(web), /"light"/.test(web)]).toEqual([true, true, false]);
    expect([/forceColorScheme="light"/.test(admin), /scheme="light"/.test(admin)]).toEqual([true, true]);
  });
  it('the web paths classify authenticated (route-guard fail-closed default; signed-out visitors go to /login)', () => {
    expect([classifyRoute('/parcel-tool'), classifyRoute('/parcel-tool/12345')]).toEqual(['authenticated', 'authenticated']);
  });
});
