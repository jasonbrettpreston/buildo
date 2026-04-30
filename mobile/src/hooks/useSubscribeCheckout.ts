// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §5 Paywall Screen
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b
//
// Bridge between <PaywallScreen> and the server's nonce-issuing route.
// POSTs to /api/subscribe/session, validates the response shape via Zod
// (Spec 90 §13 Zod boundary — a malformed URL into WebBrowser would
// crash the JS bridge), then opens the URL in the in-app browser.
//
// We use openBrowserAsync (NOT openAuthSessionAsync) because the Stripe
// checkout is a standard browser redirect, not an OAuth flow with a
// custom callback URL scheme — see spec §5 explicit note.

import { useState, useCallback } from 'react';
import { z } from 'zod';
import * as WebBrowser from 'expo-web-browser';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth, ApiError, NetworkError } from '@/lib/apiClient';

// Cross-Domain Scenario B drift mitigation: this Zod schema is the
// runtime guard for the contract published in the server repo at
// `src/app/api/subscribe/session/types.ts` (interface SubscribeSessionResponse).
// The mobile workspace cannot import server-side types directly without a
// shared-types package (Spec 90 §7 — deferred). When the server contract
// changes:
//   1. Update src/app/api/subscribe/session/types.ts on the server
//   2. Mirror the change in this Zod schema
//   3. The schema parse will fail loud if step 2 is missed — Zod throws,
//      useQuery surfaces the error, and the user sees the toast instead of
//      a silent malformed URL into WebBrowser.openBrowserAsync.
const SubscribeSessionResponseSchema = z.object({
  data: z.object({
    url: z.string().url().startsWith('https://'),
  }),
  error: z.null(),
  meta: z.null(),
});

type CheckoutError =
  | { kind: 'already_active' }
  | { kind: 'unauthorized' }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string };

export function useSubscribeCheckout() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);

  const openCheckout = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await fetchWithAuth<unknown>('/api/subscribe/session', {
        method: 'POST',
      });
      const parsed = SubscribeSessionResponseSchema.parse(raw);
      // openBrowserAsync resolves when the user dismisses the in-app browser.
      // We don't await any signal from Stripe here — payment confirmation
      // arrives via the webhook and the AppState 'active' re-fetch in the
      // subscription gate. Failure to open the browser (rare — bad URL, OS
      // policy) propagates to the catch.
      await WebBrowser.openBrowserAsync(parsed.data.url);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError({ kind: 'already_active' });
      } else if (err instanceof ApiError && err.status === 401) {
        setError({ kind: 'unauthorized' });
      } else if (err instanceof NetworkError) {
        setError({ kind: 'network' });
      } else {
        // 'unknown' covers unexpected 5xx, Zod parse failures on a malformed
        // URL, and WebBrowser invocation errors — the highest-severity case.
        // Send to Sentry so production crashes don't disappear into a typed
        // local state. ApiError 4xx and NetworkError are user-recoverable
        // states; we don't capture those.
        Sentry.captureException(err, {
          extra: { context: 'useSubscribeCheckout' },
        });
        setError({ kind: 'unknown', message: err instanceof Error ? err.message : 'Unknown error' });
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { openCheckout, isLoading, error };
}
