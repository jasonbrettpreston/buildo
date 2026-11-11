// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (an admin RSC page gates itself first),
//            docs/specs/00-architecture/13_authentication.md sections 3.6 and 4a (profiles.is_admin, the MFA gate),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14: the preview page pattern).
//
// MB-93 · McBylaws queue · the internal preview (operator 2026-11-11 "D-1 b and D-2 to D-8 a"; D-2 a: the live mode lives on
// /admin/report-preview, guarded by requireAdminPage() at the top of the page; plan ~/Buildo-scratch/mcfrontend/PREVIEW/plan.md
// section 9.1, Security S1). The middleware only checks that an auth cookie is present (route-guard.ts), so the page gates itself:
// the REAL page function runs with a mocked session; no user, a getUser error, a non-admin, a profiles-lookup error and an admin
// below aal2 (MFA enforced) all end in notFound() BEFORE the page reads its query string; only an admin renders.
// Auth, DB and telemetry are mocked (the admin-media.security.test.ts style); no database.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ getUser: vi.fn(), aal: vi.fn(), isAdmin: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/auth/verify-admin', () => ({ isProfileAdmin: h.isAdmin }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: h.getUser, mfa: { getAuthenticatorAssuranceLevel: h.aal } } })),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import ReportPreviewPage from '@/app/admin/report-preview/page';

const UID = '11111111-2222-4333-8444-555555555555';
type Q = Record<string, string | string[] | undefined>;

/** A searchParams promise that records whether the page awaited it (the query string is read only after the guard). */
const tracked = (q: Q) => {
  const seen = { read: false };
  const p = {
    then: (ok: (v: Q) => unknown, bad?: (e: unknown) => unknown) => {
      seen.read = true;
      return Promise.resolve(q).then(ok, bad);
    },
  } as unknown as Promise<Q>;
  return { p, seen };
};

const env = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEV_MODE;
  delete process.env.ADMIN_MFA_ENFORCED;
  h.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  h.isAdmin.mockResolvedValue(true);
  h.aal.mockResolvedValue({ data: { currentLevel: 'aal2' } });
});
afterEach(() => {
  process.env = { ...env };
});

describe('/admin/report-preview gates itself (requireAdminPage at the top of the page)', () => {
  const refused: Array<[string, () => void]> = [
    ['no session user', () => h.getUser.mockResolvedValue({ data: { user: null }, error: null })],
    ['a getUser error', () => h.getUser.mockResolvedValue({ data: { user: null }, error: new Error('jwt expired') })],
    ['a signed-in non-admin', () => h.isAdmin.mockResolvedValue(false)],
    ['a profiles lookup error', () => h.isAdmin.mockRejectedValue(new Error('db down'))],
    ['an admin below aal2 while MFA is enforced', () => {
      process.env.ADMIN_MFA_ENFORCED = 'true';
      h.aal.mockResolvedValue({ data: { currentLevel: 'aal1' } });
    }],
  ];
  for (const [label, arrange] of refused) {
    for (const q of [{}, { view: 'page', target: 'web' }, { state: 'permitted' }] as Q[]) {
      it(`${label}: notFound before the query string is read (${JSON.stringify(q)})`, async () => {
        arrange();
        const { p, seen } = tracked(q);
        await expect(ReportPreviewPage({ searchParams: p })).rejects.toThrow('NEXT_NOT_FOUND');
        expect(seen.read).toBe(false);
      });
    }
  }

  it('an admin session renders the page (states and the v21 page view)', async () => {
    for (const q of [{}, { view: 'page', target: 'web' }] as Q[]) {
      const { p, seen } = tracked(q);
      const el = await ReportPreviewPage({ searchParams: p });
      expect(el).toBeTruthy();
      expect(seen.read).toBe(true);
    }
    expect(h.isAdmin).toHaveBeenCalledWith(expect.anything(), UID);
  });

  // regression-guardian OUTPUT LOW-1: the dev path (isDevMode: NODE_ENV not production and DEV_MODE=true) admits the dev sentinel with no session
  it('dev mode with no session renders through the dev sentinel; no session or profiles read', async () => {
    process.env.DEV_MODE = 'true';
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { p, seen } = tracked({});
    expect(await ReportPreviewPage({ searchParams: p })).toBeTruthy();
    expect(seen.read).toBe(true);
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.isAdmin).not.toHaveBeenCalled();
  });

  it('the page source calls requireAdminPage() as its first statement', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/app/admin/report-preview/page.tsx', 'utf8');
    const body = /export default async function ReportPreviewPage\([^)]*\)[^{]*\{\s*([^\n]*)/.exec(src);
    expect(body?.[1]).toBe('await requireAdminPage();');
  });
});
