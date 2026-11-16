'use server';

// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3 (dated note 2026-11-14, MF-47),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.1 (the product gates are per-feature code),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (a mount file holds no display text: these return closed codes only).
//
// MF-47 · the two MaxBLD server actions: start a checkout for a plan, open the Customer Portal. Thin wrappers over src/lib/stripe/parcel-checkout.ts
// (all the logic and its tests live there): the session from the verified cookie (never a request value), the closed result code returned, and
// redirect() called LAST, outside every try/catch (it throws NEXT_REDIRECT). No page imports them yet (the plans page is a separate ruled row);
// the return url is the existing /parcel-tool page. The plan key arrives from the client, so it is coerced to a string and validated in the lib.
import { redirect } from 'next/navigation';
import { sessionUid } from '@/lib/auth/require-parcel-tool-page';
import { logError } from '@/lib/logger';
import {
  createParcelCheckout,
  createParcelPortal,
  type CheckoutErrorCode,
  type CheckoutResult,
  type PortalErrorCode,
  type PortalResult,
} from '@/lib/stripe/parcel-checkout';

const TAG = '[maxbld/subscribe-actions]';

/** Starts the Stripe-hosted checkout for `planKey` ('basic' | 'pro'); returns a closed error code, or never returns (redirects). */
export async function startParcelCheckout(planKey: string): Promise<{ error: CheckoutErrorCode }> {
  let result: CheckoutResult;
  try {
    result = await createParcelCheckout(await sessionUid(), String(planKey));
  } catch (cause) {
    logError(TAG, cause, { event: 'checkout_action_failed' });
    return { error: 'TRY_AGAIN' };
  }
  if ('error' in result) return result;
  redirect(result.url);
}

/** Opens the MaxBLD Customer Portal; returns a closed error code, or never returns (redirects). */
export async function openParcelPortal(): Promise<{ error: PortalErrorCode }> {
  let result: PortalResult;
  try {
    result = await createParcelPortal(await sessionUid());
  } catch (cause) {
    logError(TAG, cause, { event: 'portal_action_failed' });
    return { error: 'UNEXPECTED' };
  }
  if ('error' in result) return result;
  redirect(result.url);
}
