'use client';

// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2
//
// /subscribe/success — Stripe checkout return page (P26-26B + the 26-FOLD).
// NOT cosmetic-only: it briefly polls the visitor's profile status so a user
// who pays and stays on this tab sees their upgrade confirmed. Honest copy at
// every stage — this page NEVER claims the account is active until the server
// says so, and never claims failure (the webhook may simply be seconds away).
//
// The poll is best-effort by design: a mobile-handoff visitor has NO web
// session, so GET /api/user-profile returns 401 for them — we detect that on
// the first poll, stop immediately, and show the "return to the app" copy
// (the app's AppState re-fetch is their real confirmation path, Spec 96 §6).
// Web-session visitors (Spec 96 §3 Path B) get the live confirmation.
//
// Bounded: max 6 polls x 2s, then the honest "you'll be active shortly" state.
// Activation truth lives in the webhook alone — this page only OBSERVES.

import { useEffect, useRef, useState } from 'react';

type Phase = 'polling' | 'confirmed' | 'pending';

const MAX_POLLS = 6;
const POLL_INTERVAL_MS = 2000;
const ACTIVE_STATUSES = new Set(['active', 'admin_managed']);

export default function SubscribeSuccessPage() {
  const [phase, setPhase] = useState<Phase>('polling');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        if (cancelled) return;
        try {
          const res = await fetch('/api/user-profile', { credentials: 'include' });
          if (res.status === 401) {
            // Sessionless mobile-handoff visitor — polling can never resolve
            // here. Stop immediately; the app is their confirmation surface.
            setPhase('pending');
            return;
          }
          if (res.ok) {
            const body = (await res.json()) as {
              data?: { subscription_status?: string | null } | null;
            };
            const status = body?.data?.subscription_status;
            if (typeof status === 'string' && ACTIVE_STATUSES.has(status)) {
              setPhase('confirmed');
              return;
            }
          }
        } catch {
          // Transient network error — keep polling within the bound.
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      if (!cancelled) setPhase('pending');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-sm text-center">
        {phase === 'polling' && (
          <>
            <div
              className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"
              role="status"
              aria-label="Confirming your upgrade"
            />
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              Payment received
            </h1>
            <p className="text-sm text-gray-500">
              Your account is being upgraded — confirming now…
            </p>
          </>
        )}
        {phase === 'confirmed' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              You’re all set
            </h1>
            <p className="text-sm text-gray-500">
              Your subscription is active. Head back to the Buildo app — your
              leads are waiting.
            </p>
          </>
        )}
        {phase === 'pending' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              Payment received
            </h1>
            <p className="text-sm text-gray-500">
              Your account will be active shortly. Return to the Buildo app —
              it refreshes your status automatically (usually within a
              minute).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
