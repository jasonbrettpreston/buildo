'use client';

// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2
//
// /subscribe — the web checkout landing page (P26-26B). A mobile-handoff
// visitor arrives with `?nonce=...` in the URL and NO web session (the nonce
// is the credential). This page is a thin client spinner: it POSTs the nonce
// to /api/subscribe/exchange and redirects to the returned Stripe-hosted
// checkout URL via window.location.assign. All authorization, single-use
// consumption, and Stripe session creation happen server-side — this page
// holds no secrets and makes no decisions.
//
// Failure UX: any non-200 (expired/consumed/unknown nonce → 400
// INVALID_NONCE; config gaps → named 500s) lands on one honest error state
// telling the user to return to the app and tap the subscribe button again
// (the session route mints a fresh nonce).

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Phase = 'working' | 'error';

function SubscribeInner() {
  const searchParams = useSearchParams();
  const nonce = searchParams.get('nonce');
  const [phase, setPhase] = useState<Phase>('working');
  // React 18 StrictMode double-invokes effects in dev; the nonce is
  // single-use, so a second POST would consume-fail. Guard with a ref.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!nonce) {
      setPhase('error');
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/subscribe/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce }),
        });
        if (!res.ok) {
          setPhase('error');
          return;
        }
        const body = (await res.json()) as { data?: { url?: string } | null };
        const url = body?.data?.url;
        if (typeof url === 'string' && url.startsWith('https://')) {
          window.location.assign(url);
          return; // navigation in flight — keep the spinner up
        }
        setPhase('error');
      } catch {
        setPhase('error');
      }
    })();
  }, [nonce]);

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            This checkout link is invalid or has expired
          </h1>
          <p className="text-sm text-gray-500">
            Checkout links are single-use and expire after 15 minutes. Return
            to the Buildo app and tap “Continue at buildo.com” again to get a
            fresh one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"
          role="status"
          aria-label="Preparing secure checkout"
        />
        <p className="text-sm text-gray-500">Preparing your secure checkout…</p>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  // useSearchParams requires a Suspense boundary for prerendering.
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      }
    >
      <SubscribeInner />
    </Suspense>
  );
}
