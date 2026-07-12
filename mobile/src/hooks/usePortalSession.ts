// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §7
//            docs/specs/02-web-admin/20_stripe_web_checkout.md §5
//
// Bridge between the Settings "Manage subscription" row and the server's
// Stripe Customer Portal route (P26-26C). POSTs to
// /api/subscribe/portal-session, validates the response shape via Zod
// (Spec 90 §13 boundary), then opens the ONE-OFF portal URL in the in-app
// browser. Replaces the pre-P26 static buildo.com/account/billing link —
// the portal session is minted per tap and expires; a static URL cannot
// authenticate the user into their portal.
//
// Mirrors useSubscribeCheckout (same error taxonomy + Zod-mirror contract
// with the server's types.ts).

import { useState, useCallback } from 'react';
import { z } from 'zod';
import * as WebBrowser from 'expo-web-browser';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth, ApiError, NetworkError } from '@/lib/apiClient';

// Cross-Domain Scenario B drift mitigation: runtime guard for the contract
// published at `src/app/api/subscribe/portal-session/types.ts`
// (interface PortalSessionResponse). Keep in sync manually; a parse failure
// fails loud instead of piping a malformed URL into WebBrowser.
const PortalSessionResponseSchema = z.object({
  data: z.object({
    url: z.string().url().startsWith('https://'),
  }),
  error: z.null(),
  meta: z.null(),
});

type PortalError =
  | { kind: 'no_customer' } // never checked out — nothing to manage
  | { kind: 'unauthorized' }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string };

export function usePortalSession() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PortalError | null>(null);

  const openPortal = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await fetchWithAuth<unknown>('/api/subscribe/portal-session', {
        method: 'POST',
      });
      const parsed = PortalSessionResponseSchema.parse(raw);
      // Standard browser flow (not OAuth) — openBrowserAsync per the
      // useSubscribeCheckout precedent. Cancellations made in the portal
      // arrive via the customer.subscription.deleted webhook; the AppState
      // re-fetch picks up any status change on return.
      await WebBrowser.openBrowserAsync(parsed.data.url);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // NO_STRIPE_CUSTOMER — the only 400 this route returns.
        setError({ kind: 'no_customer' });
      } else if (err instanceof ApiError && err.status === 401) {
        setError({ kind: 'unauthorized' });
      } else if (err instanceof NetworkError) {
        setError({ kind: 'network' });
      } else {
        // Unexpected 5xx (incl. STRIPE_NOT_CONFIGURED), Zod parse failures,
        // WebBrowser errors — capture; user-recoverable 4xx are not captured.
        Sentry.captureException(err, {
          extra: { context: 'usePortalSession' },
        });
        setError({ kind: 'unknown', message: err instanceof Error ? err.message : 'Unknown error' });
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { openPortal, isLoading, error };
}
