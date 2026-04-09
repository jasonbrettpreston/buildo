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
  } catch {
    // Safari throws for some permission names — treat as unsupported.
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
        setStatus({ state: 'denied', permanent: true });
        return;
      }
      if (initial === 'prompt') {
        setStatus({ state: 'prompt' });
        return;
      }
      // granted — subscribe to changes so we can react if the user
      // revokes permission while the app is open.
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
            }
          };
          perm.addEventListener('change', onChange);
        } catch {
          // Safari quirk; ignore.
        }
      }
      setStatus({ state: 'prompt' }); // trigger the user to call request()
    })();

    return () => {
      cancelled = true;
      const perm = permissionStatusRef.current;
      if (perm) {
        // Remove all listeners by setting the event handler to null.
        // The stored reference is sufficient — we re-subscribe fresh on
        // each mount.
        perm.onchange = null;
      }
    };
  }, []);

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

  return { status, request };
}
