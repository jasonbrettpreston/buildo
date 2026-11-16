// 🔗 SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3 (dated note 2026-11-14, MF-47)
//
// MF-47 · the two server action wrappers: the session comes from the verified cookie helper, the plan key is coerced to a string, a closed code is
// returned (never a thrown Stripe message), and redirect() runs only on a url and OUTSIDE every try/catch (it throws NEXT_REDIRECT; a caught
// redirect would turn a good session into an error page).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const redirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));
const sessionUid = vi.fn();
vi.mock('@/lib/auth/require-parcel-tool-page', () => ({ sessionUid: () => sessionUid() }));
const createParcelCheckout = vi.fn();
const createParcelPortal = vi.fn();
vi.mock('@/lib/stripe/parcel-checkout', () => ({ createParcelCheckout: (...a: unknown[]) => createParcelCheckout(...a), createParcelPortal: (...a: unknown[]) => createParcelPortal(...a) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { startParcelCheckout, openParcelPortal } from '@/app/(maxbld)/parcel-tool/subscribe/actions';

beforeEach(() => { vi.clearAllMocks(); sessionUid.mockResolvedValue('00000000-0000-0000-0000-0000000f0047'); });

describe('startParcelCheckout', () => {
  it('passes the cookie uid and the plan key (coerced to a string) and redirects to the returned url, outside the try/catch', async () => {
    createParcelCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/c/pay/x' });
    await expect(startParcelCheckout('pro')).rejects.toThrow('NEXT_REDIRECT:https://checkout.stripe.com/c/pay/x');
    expect(createParcelCheckout).toHaveBeenCalledWith('00000000-0000-0000-0000-0000000f0047', 'pro');
    createParcelCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/c/pay/y' });
    await expect(startParcelCheckout({ evil: 1 } as unknown as string)).rejects.toThrow('NEXT_REDIRECT');
    expect(createParcelCheckout).toHaveBeenLastCalledWith('00000000-0000-0000-0000-0000000f0047', '[object Object]');
  });
  it('returns a closed code and never redirects on a refusal', async () => {
    createParcelCheckout.mockResolvedValueOnce({ error: 'STRIPE_PRICE_NOT_CONFIGURED' });
    await expect(startParcelCheckout('basic')).resolves.toEqual({ error: 'STRIPE_PRICE_NOT_CONFIGURED' });
    expect(redirect).not.toHaveBeenCalled();
  });
  it('a throwing session read or lib becomes TRY_AGAIN, not a thrown error', async () => {
    sessionUid.mockRejectedValueOnce(new Error('jwks down'));
    await expect(startParcelCheckout('basic')).resolves.toEqual({ error: 'TRY_AGAIN' });
    expect(redirect).not.toHaveBeenCalled();
  });
  it('no session -> the lib is called with null and answers NOT_SIGNED_IN', async () => {
    sessionUid.mockResolvedValueOnce(null);
    createParcelCheckout.mockResolvedValueOnce({ error: 'NOT_SIGNED_IN' });
    await expect(startParcelCheckout('basic')).resolves.toEqual({ error: 'NOT_SIGNED_IN' });
    expect(createParcelCheckout).toHaveBeenCalledWith(null, 'basic');
  });
});

describe('openParcelPortal', () => {
  it('redirects to the portal url; a refusal returns its code', async () => {
    createParcelPortal.mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/session/x' });
    await expect(openParcelPortal()).rejects.toThrow('NEXT_REDIRECT:https://billing.stripe.com/p/session/x');
    createParcelPortal.mockResolvedValueOnce({ error: 'PORTAL_NOT_CONFIGURED' });
    await expect(openParcelPortal()).resolves.toEqual({ error: 'PORTAL_NOT_CONFIGURED' });
  });
});

describe('structure locks', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/app/(maxbld)/parcel-tool/subscribe/actions.ts'), 'utf8');
  it("'use server' first; redirect( appears only after the last catch in each action; no display text", () => {
    expect(src.split('\n').find((l) => l.trim() !== '')).toBe("'use server';");
    for (const fn of ['startParcelCheckout', 'openParcelPortal']) {
      const body = src.slice(src.indexOf(`export async function ${fn}`));
      const end = body.indexOf('\n}\n');
      const f = body.slice(0, end);
      expect(f.lastIndexOf('redirect(')).toBeGreaterThan(f.lastIndexOf('catch'));
    }
    expect(src).not.toMatch(/['"`][A-Z][a-z]+ [a-z]+ [a-z]+/); // a sentence-shaped literal (display text) is caught
  });
});
