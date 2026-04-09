'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 3 step 3
//
// Browser geolocation hook with feature-detected Permissions API, a
// discriminated union return type, and cleanup on unmount. The spec 75
// blueprint calls out:
//   - Safari < 16 and HTTP contexts don't have `navigator.permissions.query`
//   - Some permission names throw on query in Safari (wrap in try/catch)
//   - Permission state can change while the app is open (subscribe)
//   - Permanently denied state needs a distinct CTA (send to settings,
//     not re-prompt)
//
// This hook does NOT fall back to a saved home base — that's a concern
// for the onboarding flow and the `useLeadFeedState` store's `location`
// field. This hook only reports what the BROWSER knows.

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureEvent } from '@/lib/observability/capture';

export type GeolocationStatus =
  | { state: 'idle' }
  | { state: 'requesting' }
  | { state: 'granted'; coords: { lat: number; lng: number }; accuracy: number | null; timestamp: number }
  | { state: 'prompt' } // permission not yet asked
  | { state: 'denied'; permanent: boolean }
  | { state: 'unsupported' } // Permissions API unavailable (Safari < 16, HTTP context)
  | { state: 'error'; message: string };

async function checkPermissionState(): Promise<
  'granted' | 'prompt' | 'denied' | 'unsupported'
> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported';
  }
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state as 'granted' | 'prompt' | 'denied';
  } catch (err) {
    // Safari throws for some permission names — treat as unsupported.
    // Phase 3-vi observability: ping engineering so we can measure
    // which Safari versions are still throwing. Pre-fix this catch
    // was completely silent — we had no way to know how many users
    // were hitting the Safari quirk path.
    captureEvent('lead_feed.geolocation_query_failed', {
      error_message: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : 'unknown',
    });
    return 'unsupported';
  }
}

/**
 * Hook entry point. Returns the current status + a `request()` action
 * that triggers the browser permission prompt. The hook initializes in
 * `'idle'` state and transitions based on the Permissions API + the
 * geolocation callback.
 *
 * Cleanup: unsubscribes from permission-change events on unmount.
 */
export function useGeolocation(): {
  status: GeolocationStatus;
  request: () => void;
} {
  const [status, setStatus] = useState<GeolocationStatus>({ state: 'idle' });
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  // Store the onChange callback in a ref so the effect cleanup can
  // pass the EXACT same function reference to removeEventListener.
  // The Phase 3-i adversarial review caught a bug where cleanup set
  // `perm.onchange = null`, which is a different subscription
  // mechanism and leaks the addEventListener-registered handler.
  const onChangeRef = useRef<(() => void) | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus({ state: 'unsupported' });
      return;
    }
    setStatus({ state: 'requesting' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus({
          state: 'granted',
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy ?? null,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        // A PERMISSION_DENIED after an explicit getCurrentPosition call
        // IS persistent — the user has just actively denied, or the
        // browser has a site-level block. Unlike the initial
        // Permissions API 'denied' state (which can mean "never asked
        // in this session"), this one we can classify as permanent.
        if (err.code === err.PERMISSION_DENIED) {
          setStatus({ state: 'denied', permanent: true });
          return;
        }
        setStatus({ state: 'error', message: err.message });
      },
      {
        enableHighAccuracy: false, // high accuracy drains battery; 20-50m is fine for lead feed
        maximumAge: 60_000, // accept a cached position up to 1 minute old
        timeout: 10_000,
      },
    );
  }, []);

  // Initial permission check + subscription to permission changes.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const initial = await checkPermissionState();
      if (cancelled) return;
      if (initial === 'unsupported') {
        setStatus({ state: 'unsupported' });
        return;
      }
      if (initial === 'denied') {
        // Permissions API `denied` state can mean "user denied this
        // session" OR "persistently blocked in site settings" —
        // indistinguishable at this layer. Treat as non-permanent so
        // the UI can still offer a re-prompt. The `permanent: true`
        // flag is only set from the explicit getCurrentPosition error
        // callback (in `request()` above), where the transition IS
        // unambiguous.
        setStatus({ state: 'denied', permanent: false });
        return;
      }
      // 'granted' or 'prompt' — subscribe to permission-change events
      // so we react if the user revokes permission via browser UI.
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          if (cancelled) return;
          permissionStatusRef.current = perm;
          const onChange = () => {
            if (perm.state === 'denied') {
              setStatus({ state: 'denied', permanent: true });
            } else if (perm.state === 'prompt') {
              setStatus({ state: 'prompt' });
            } else if (perm.state === 'granted') {
              request();
            }
          };
          onChangeRef.current = onChange;
          perm.addEventListener('change', onChange);
        } catch {
          // Safari quirk on some permission names — no subscription,
          // fall through to initial state handling below.
        }
      }
      if (initial === 'granted') {
        // User has already granted permission in a prior session —
        // auto-fetch the position instead of showing the "tap to
        // share location" prompt UI. Emitting `prompt` here (the
        // pre-fix behaviour) was a state machine error because the
        // user is NOT in a prompt state.
        request();
      } else {
        setStatus({ state: 'prompt' });
      }
    })();

    return () => {
      cancelled = true;
      const perm = permissionStatusRef.current;
      const onChange = onChangeRef.current;
      if (perm && onChange) {
        perm.removeEventListener('change', onChange);
      }
      permissionStatusRef.current = null;
      onChangeRef.current = null;
    };
  }, [request]);

  // visibilitychange handler — re-poll the Permissions API whenever
  // the page returns to the foreground. iOS WebKit kills the
  // 'change' event listener registered above when the app is pushed
  // to the background; if the user toggles GPS off in Settings and
  // returns to the app, the change handler never fires and our
  // status is stuck on the pre-suspend value. Force-polling on
  // visibility return is the documented workaround.
  // (User-supplied Gemini holistic 2026-04-09 — "Mobile OS Suspend Drift".)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Cancellation guard mirroring the mount effect's `cancelled` ref:
    // if the component unmounts while `checkPermissionState()` is
    // awaiting, we must NOT call setStatus on the unmounted component.
    // Independent reviewer C11 caught this in the WF3 holistic review.
    let active = true;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const polled = await checkPermissionState();
        if (!active) return;
        if (polled === 'denied') {
          setStatus({ state: 'denied', permanent: true });
        } else if (polled === 'prompt') {
          setStatus({ state: 'prompt' });
        } else if (polled === 'granted') {
          // Re-fetch the position — iOS may have invalidated the
          // last fix during the suspend window.
          request();
        }
        // 'unsupported' — leave status alone, the original mount
        // effect already set it correctly.
      })();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [request]);

  return { status, request };
}
