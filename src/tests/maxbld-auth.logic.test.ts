// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (`web_login` shared, MaxBLD strings from content; terms
//            `tos_accepted_at` only), 11b.7 W2, 0b item 11 (navigation is a route); docs/specs/00-architecture/13_authentication.md §3.3.
//
// MF-46 · the MaxBLD sign-in routes: the actions (email links from the MaxBLD origin, one outcome per address, recovery-only set
// password, server-stamped terms written only while empty), the post-sign-in path, and the shared LoginForm's MaxBLD variant (layout
// order, no persona, every move a real link, the Buildo screen unchanged). Plan ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md §3.2, folds 5-7.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const sb = vi.hoisted(() => ({
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: sb }) }));
const pg = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ pool: pg }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { maxbldAcceptTermsAction, maxbldResetAction, maxbldSetPasswordAction, maxbldSignUpAction } from '@/lib/supabase/maxbld-actions';
import { RECOVERY_WINDOW_S, fromRecovery } from '@/lib/auth/maxbld-recovery';
import { TERMS_READ_SQL, TERMS_WRITE_SQL, acceptTerms, termsAccepted } from '@/lib/auth/maxbld-terms';
import { maxbldAfterSignIn } from '@/lib/auth/maxbld-after-sign-in';
import { AUTH_TEXT } from '@/lib/surfaces/maxbld-auth';
import { LoginForm, type LoginVariant } from '@/components/auth/LoginForm';
import { MAXBLD_ROUTES } from '@/lib/auth/host-policy';

const UID = '11111111-2222-4333-8444-555555555555';
beforeEach(() => {
  for (const f of Object.values(sb)) f.mockReset();
  pg.query.mockReset();
});

describe('sign-up', () => {
  it('the confirm link is built from the MaxBLD origin and opens the terms step; no account type is written', async () => {
    sb.signUp.mockResolvedValue({ error: null });
    expect(await maxbldSignUpAction('a@b.test', 'secret12', 'A Name')).toEqual({ code: 'sent' });
    const arg = sb.signUp.mock.calls[0]?.[0] as { options: { emailRedirectTo: string; data: Record<string, unknown> } };
    expect(arg.options.emailRedirectTo).toBe('https://maxbld.ca/auth/callback?redirect=%2Fterms-accept');
    expect(arg.options.data).toEqual({ display_name: 'A Name' });
  });
  it('one outcome for every address: an error other than a weak password still reads "sent"', async () => {
    sb.signUp.mockResolvedValue({ error: { code: 'user_already_exists', message: 'User already registered' } });
    expect(await maxbldSignUpAction('a@b.test', 'secret12', '')).toEqual({ code: 'sent' });
    sb.signUp.mockRejectedValue(new Error('network'));
    expect(await maxbldSignUpAction('a@b.test', 'secret12', '')).toEqual({ code: 'sent' });
  });
  it('a weak password is the one distinct outcome', async () => {
    sb.signUp.mockResolvedValue({ error: { code: 'weak_password', message: 'Password should be at least 6 characters' } });
    expect(await maxbldSignUpAction('a@b.test', 'x', '')).toEqual({ code: 'short' });
  });
});

describe('reset and set a new password', () => {
  it('reset always reads "sent" and links to the set-password page through the callback', async () => {
    sb.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limited' } });
    expect(await maxbldResetAction('a@b.test')).toEqual({ code: 'sent' });
    expect(sb.resetPasswordForEmail.mock.calls[0]?.[1]).toEqual({ redirectTo: 'https://maxbld.ca/auth/callback?redirect=%2Fset-password' });
  });
  it('OUTPUT security F3: the recovery entry must be within the link lifetime', () => {
    const now = 1_000_000;
    expect(fromRecovery({ amr: [{ method: 'recovery', timestamp: now - 10 }] }, now)).toBe(true);
    expect(fromRecovery({ amr: [{ method: 'recovery', timestamp: now - RECOVERY_WINDOW_S - 1 }] }, now)).toBe(false);
    expect(fromRecovery({ amr: [{ method: 'recovery' }] }, now)).toBe(false);
    expect(fromRecovery({ amr: [{ method: 'recovery', timestamp: now + 60 }] }, now)).toBe(false);
  });
  it('OUTPUT security F1: every MaxBLD link the code builds matches the Supabase redirect allow-list (GoTrue globs the whole URL)', async () => {
    const fsm = await import('node:fs');
    const toml = fsm.readFileSync('supabase/config.toml', 'utf8');
    const list = JSON.parse(/^additional_redirect_urls = (\[.*\])$/m.exec(toml)?.[1] ?? '[]') as string[];
    const esc = (t: string): string => t.replace(/[.+?^{}()|[\]\\$]/g, (c) => `\\${c}`);
    const glob = (g: string): RegExp => new RegExp(`^${g.split('**').map((part) => part.split('*').map(esc).join('[^/]*')).join('.*')}$`);
    const ok = (u: string): boolean => list.some((g) => glob(g).test(u));
    sb.signUp.mockResolvedValue({ error: null });
    sb.resetPasswordForEmail.mockResolvedValue({ error: null });
    await maxbldSignUpAction('a@b.test', 'secret12', '');
    await maxbldResetAction('a@b.test');
    const links = [
      (sb.signUp.mock.calls[0]?.[0] as { options: { emailRedirectTo: string } }).options.emailRedirectTo,
      (sb.resetPasswordForEmail.mock.calls[0]?.[1] as { redirectTo: string }).redirectTo,
      `https://maxbld.ca/auth/callback?redirect=${encodeURIComponent('/terms-accept?redirect=%2Fparcel-tool')}`,
    ];
    for (const l of links) expect([l, ok(l)]).toEqual([l, true]);
    expect(ok('https://evil.test/auth/callback?redirect=x')).toBe(false);
    expect(ok('https://maxbld.ca.evil.test/auth/callback')).toBe(false);
  });
  it('a normal sign-in session cannot set a password (RED: recovery only)', async () => {
    sb.getClaims.mockResolvedValue({ data: { claims: { sub: UID, amr: [{ method: 'password' }] } }, error: null });
    expect(await maxbldSetPasswordAction('newsecret')).toEqual({ code: 'expired' });
    expect(sb.updateUser).not.toHaveBeenCalled();
    sb.getClaims.mockResolvedValue({ data: null, error: new Error('no session') });
    expect(await maxbldSetPasswordAction('newsecret')).toEqual({ code: 'expired' });
  });
  it('a recovery session sets the password and goes to the search page', async () => {
    sb.getClaims.mockResolvedValue({ data: { claims: { sub: UID, amr: [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) - 5 }] } }, error: null });
    sb.updateUser.mockResolvedValue({ error: null });
    expect(await maxbldSetPasswordAction('newsecret')).toEqual({ code: 'done', next: '/parcel-tool' });
    expect(sb.updateUser).toHaveBeenCalledWith({ password: 'newsecret' });
  });
});

describe('the terms record (D-2 b)', () => {
  it('writes only tos_accepted_at, server time, only while empty; never onboarding_complete', () => {
    expect(TERMS_WRITE_SQL).toContain('tos_accepted_at = NOW()');
    expect(TERMS_WRITE_SQL).toContain('WHERE user_profiles.tos_accepted_at IS NULL');
    expect(TERMS_WRITE_SQL).not.toMatch(/onboarding_complete/);
    expect(TERMS_WRITE_SQL).not.toMatch(/\$2/);
  });
  it('read and write take the uid only', async () => {
    pg.query.mockResolvedValue({ rows: [{ tos_accepted_at: null }] });
    expect(await termsAccepted(pg as never, UID)).toBe(false);
    expect(pg.query).toHaveBeenCalledWith(TERMS_READ_SQL, [UID]);
    pg.query.mockResolvedValue({ rows: [] });
    expect(await termsAccepted(pg as never, UID)).toBe(false);
    pg.query.mockResolvedValue({ rows: [{ tos_accepted_at: '2026-11-11T00:00:00Z' }] });
    expect(await termsAccepted(pg as never, UID)).toBe(true);
    await acceptTerms(pg as never, UID);
    expect(pg.query).toHaveBeenLastCalledWith(TERMS_WRITE_SQL, [UID]);
  });
  it('the action needs the box ticked, a session, and keeps only a MaxBLD target', async () => {
    expect(await maxbldAcceptTermsAction(false, '/parcel-tool')).toEqual({ code: 'required' });
    expect(pg.query).not.toHaveBeenCalled();
    sb.getClaims.mockResolvedValue({ data: null, error: new Error('none') });
    expect(await maxbldAcceptTermsAction(true, '/parcel-tool')).toEqual({ code: 'expired' });
    sb.getClaims.mockResolvedValue({ data: { claims: { sub: UID } }, error: null });
    pg.query.mockResolvedValue({ rows: [] });
    expect(await maxbldAcceptTermsAction(true, '/dashboard')).toEqual({ code: 'done', next: '/parcel-tool' });
    expect(await maxbldAcceptTermsAction(true, '/parcel-tool/123')).toEqual({ code: 'done', next: '/parcel-tool/123' });
    pg.query.mockRejectedValue(new Error('pg down'));
    expect(await maxbldAcceptTermsAction(true, '/parcel-tool')).toEqual({ code: 'generic' });
  });
  it('after sign-in the terms step comes first, carrying a MaxBLD target only', () => {
    expect(maxbldAfterSignIn(undefined)).toBe('/terms-accept?redirect=%2Fparcel-tool');
    expect(maxbldAfterSignIn('/dashboard')).toBe('/terms-accept?redirect=%2Fparcel-tool');
    expect(maxbldAfterSignIn('/parcel-tool/9')).toBe('/terms-accept?redirect=%2Fparcel-tool%2F9');
    expect(maxbldAfterSignIn(['/a', '/b'])).toBe('/terms-accept?redirect=%2Fparcel-tool');
  });
});

describe('the shared LoginForm, MaxBLD variant', () => {
  const html = (mode: LoginVariant['mode']): string =>
    renderToStaticMarkup(createElement(LoginForm, { variant: { mode, text: AUTH_TEXT, afterSignIn: '/terms-accept?redirect=%2Fparcel-tool' } }));
  const hrefs = (h: string): string[] => [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1] as string);
  const tablePaths = new Set(MAXBLD_ROUTES.map((r) => r.path));

  it('log in: email, password, Forgot password, Log in, then Google; Create account is a link; no persona, no Buildo copy', () => {
    const h = html('login');
    const at = (s: string): number => h.indexOf(s);
    const order = [AUTH_TEXT['field.email'], AUTH_TEXT['field.password'], AUTH_TEXT['login.forgot'], `>${AUTH_TEXT['login.submit']}</button>`, AUTH_TEXT.google, AUTH_TEXT['login.create.link']].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).not.toMatch(/<select|Individual Tradesperson|Lead Generation|Sign In to MaxBLD/);
    expect(hrefs(h)).toEqual(['/reset-password', '/signup', '/terms', '/privacy', '/help']);
  });
  it('sign up: name, email, password; Log in is a link; no account type', () => {
    const h = html('signup');
    expect(h).toContain(AUTH_TEXT['signup.title']);
    expect(h).not.toMatch(/<select|I am a/);
    expect(hrefs(h)).toEqual(['/login', '/terms', '/privacy', '/help']);
  });
  it('reset and set: their own fields; no Google', () => {
    expect(html('reset')).not.toContain(AUTH_TEXT.google);
    expect(html('set')).toContain(AUTH_TEXT['set.field.confirm']);
    expect(html('set')).not.toContain(AUTH_TEXT['field.email']);
  });
  it('every link the variant renders is a maxbld.ca host-table path (no dead link, no scope D)', () => {
    for (const m of ['login', 'signup', 'reset', 'set'] as const) for (const href of hrefs(html(m))) expect([m, href, tablePaths.has(href) || href === '/parcel-tool']).toEqual([m, href, true]);
  });
  it('the only <button>s are the submit and Google (moves between routes are links)', () => {
    const buttons = [...html('login').matchAll(/<button[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(buttons).toEqual([AUTH_TEXT['login.submit'], AUTH_TEXT.google]);
  });
  it('without a variant the Buildo screen still renders its own copy (Buildo title, no MaxBLD strings); LoginForm.ui.test.tsx pins the rest', () => {
    const h = renderToStaticMarkup(createElement(LoginForm, {}));
    expect(h).toContain('Sign In to MaxBLD');
    expect(h).not.toContain(AUTH_TEXT['login.forgot']);
  });
});

describe('the MaxBLD auth content', () => {
  it('has no digit, no banned claim word, and no address or name', () => {
    for (const [k, v] of Object.entries(AUTH_TEXT)) {
      expect([k, /\d/.test(v)]).toEqual([k, false]);
      expect([k, /\b(AI|satellite|guarantee|every scenario|updated)\b/i.test(v)]).toEqual([k, false]);
      expect([k, /@/.test(v)]).toEqual([k, false]);
    }
  });
});
