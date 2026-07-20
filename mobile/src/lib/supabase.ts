// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2, §5 Step 1
// Env/key contract: docs/specs/00-architecture/113_supabase_infrastructure.md §3
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing — ' +
    'check the active EAS build profile env block (Spec 113 §3).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Mandatory on native (Decision D7, 2026-07-18 program plan). Supabase's
    // default URL-based session detection assumes a browser location bar —
    // React Native has none. Leaving this at its default `true` makes the
    // client probe `window.location` during init, which is undefined on
    // native and produces a crash/hang before the client finishes
    // constructing (§6 Known Failure Modes).
    detectSessionInUrl: false,
    // [P2 plan, verify-pass fold] PKCE explicitly opted into — supabase-js's
    // base client defaults to the *implicit* flow (unlike @supabase/ssr).
    // The email-confirmation deep-link catch (app/(auth)/confirm.tsx +
    // exchangeCodeForSession) depends on GoTrue emitting a PKCE `?code=`
    // param on the confirmation redirect; do not remove without reworking
    // that flow (P2-D4).
    flowType: 'pkce',
    // Serializes concurrent auth operations (refresh, sign-in, sign-out)
    // across the JS context so two screens racing a 401-triggered refresh
    // don't produce two competing writes. NOTE: auth-js v3 removes `lock` /
    // `lockAcquireTimeout` in favor of built-in lockless coordination — this
    // is NOT a permanent API; re-verify against the v3 migration guide
    // before the next auth-js major version bump.
    //
    // P2-F1.1 verification (2026-07-19, @supabase/supabase-js@2.110.7):
    // the bundled auth-js already single-flights concurrent refreshes
    // internally (`refreshingDeferred` in `_callRefreshToken` — concurrent
    // callers share the in-flight refresh) and marks the `lock` option
    // deprecated/inert ("The auth client doesn't run `processLock`").
    // `lock: processLock` is wired anyway per the plan's belt-and-suspenders
    // ruling [panel-fold: Ground truth, MED]; the concurrent-401 guarantee
    // is provided by the SDK's own dedup.
    lock: processLock,
  },
});

// React Native has no window-focus/blur events. Without this, auth-js's
// background refresh timer keeps ticking while the app is backgrounded
// (battery drain) and can race a stale refresh against the next foreground
// launch. Wiring refresh to AppState is Supabase's documented requirement
// for React Native, not an optimization — register exactly once, at module
// load, not inside a component.
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
