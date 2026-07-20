/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.6 (Account Deletion /
//             30-day reactivation window)
//
// [panel-fold: UX, HIGH] Deletion → reactivation chain lock. The routing
// decision (403 AccountDeletedError → reactivation-modal) is unit-tested in
// authGate.test.ts against the pure decideAuthGateRoute; this suite locks the
// SIDE-EFFECT half that lives in app/_layout.tsx's AuthGate component —
// modal render, POST /api/user-profile/reactivate, compliance telemetry, and
// both terminal actions (reactivate / sign out) — via source-scan (repo
// precedent: storeReset.coverage.test.ts, subscriptionGate.test.ts; the
// component has no RTL harness). Survives the Supabase SDK swap unchanged
// because the chain is server-driven (P2-G2).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const layoutSrc = fs.readFileSync(path.resolve(__dirname, '../app/_layout.tsx'), 'utf-8');
const routeSrc = fs.readFileSync(
  path.resolve(__dirname, '../src/lib/auth/decideAuthGateRoute.ts'),
  'utf-8',
);

describe('deletion → reactivation chain (Spec 93 §3.6)', () => {
  it('decideAuthGateRoute maps AccountDeletedError to the reactivation-modal decision (Branch 2)', () => {
    expect(routeSrc).toMatch(
      /profileError instanceof AccountDeletedError[\s\S]{0,300}?kind:\s*'reactivation-modal'/,
    );
  });

  it('AuthGate renders the reactivation modal with days_remaining=0 special copy', () => {
    expect(layoutSrc).toMatch(/reactivation-modal/);
    expect(layoutSrc).toMatch(/days_remaining === 0/);
    expect(layoutSrc).toMatch(/scheduled for deletion today/);
  });

  it('reactivate action POSTs to /api/user-profile/reactivate (Spec 95 Step 3b — never the PATCH route)', () => {
    expect(layoutSrc).toMatch(
      /fetchWithAuth\('\/api\/user-profile\/reactivate',\s*\{\s*method:\s*'POST'\s*\}\)/,
    );
    // On success the profile query is refetched so server state stays
    // authoritative.
    expect(layoutSrc).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\['user-profile'\]\s*\}\)/);
  });

  it('compliance telemetry fires when the modal is shown (NOT __DEV__-gated)', () => {
    expect(layoutSrc).toMatch(/track\('reactivation_modal_shown',\s*\{\s*days_remaining:/);
  });

  it('both terminal actions exist — Reactivate and Sign Out — and reactivation failure surfaces an error', () => {
    expect(layoutSrc).toMatch(/handleReactivate/);
    expect(layoutSrc).toMatch(/void signOut\(\)/);
    expect(layoutSrc).toMatch(/Unable to reactivate\. Please contact support\./);
  });
});
