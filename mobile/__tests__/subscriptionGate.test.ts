/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 2 Subscription gate
//             docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 Gate stability + 2026-05-05 narrow carve-out amendment
//
// _layout.tsx orchestrates ~6 third-party libraries (expo-router, TanStack
// Query, Reanimated, BottomTabBar, AppState, IncompleteBanner) which are
// impractical to fully render under jest-node. Instead this suite asserts
// the source-level invariants that drive the gate: every status branch
// is present, the loading guard is wired, the AppState listener is
// installed, the post-payment transition fires the right side effects,
// and cancelled_pending_deletion ALWAYS triggers signOut+redirect (spec
// explicit per §10 Step 2). Behavioural coverage of paywallStore
// transitions lives in paywallStore.test.ts.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const layoutSrc = fs.readFileSync(
  path.join(__dirname, '../app/(app)/_layout.tsx'),
  'utf8',
);

describe('subscription gate — source invariants', () => {
  it('renders <SubscriptionLoadingGuard> while subscription_status is unresolved', () => {
    expect(layoutSrc).toMatch(/SubscriptionLoadingGuard/);
    // The loading guard must be one of the early-return branches in the
    // gate body — assert it appears in JSX form (component rendering) at
    // least once. Without this rule the gate could flash the paywall
    // during the initial fetch (spec §9 explicit prohibition).
    expect(layoutSrc).toMatch(/<SubscriptionLoadingGuard\s*\/>/);
  });

  it('renders <PaywallScreen> when subscription_status is "expired" and not dismissed', () => {
    expect(layoutSrc).toMatch(/PaywallMount|PaywallScreen/);
    expect(layoutSrc).toMatch(/'expired'/);
  });

  it('handles cancelled_pending_deletion by signing out and redirecting', () => {
    expect(layoutSrc).toMatch(/cancelled_pending_deletion/);
    expect(layoutSrc).toMatch(/signOut/);
    expect(layoutSrc).toMatch(/sign-in/);
  });

  it('refetches user-profile on AppState "active" (post-webhook restoration path)', () => {
    expect(layoutSrc).toMatch(/AppState\.addEventListener/);
    expect(layoutSrc).toMatch(/['"]active['"]/);
    expect(layoutSrc).toMatch(/invalidateQueries[\s\S]*['"]user-profile['"]/);
  });

  it('clears paywall + invalidates leads cache on the "expired" → "active" transition', () => {
    // Spec §10 Step 2: when status flips to 'active' from 'expired', clear
    // paywallStore and invalidate the leads cache so the feed reloads.
    expect(layoutSrc).toMatch(/clearPaywall|paywallStore[\s\S]*\.reset\(/);
    expect(layoutSrc).toMatch(/invalidateQueries[\s\S]*['"]leads['"]/);
  });

  it('manufacturer accounts (admin_managed) never see the paywall', () => {
    // The branch must allow 'admin_managed' through to <Tabs> without
    // routing to <PaywallScreen>. Asserted as: the gate's status checks
    // include 'admin_managed' in the same group as 'trial' / 'active' /
    // 'past_due' (i.e., NOT in a branch that returns the paywall).
    //
    // Since the gate uses a fall-through pattern (specific branches return
    // first, then the default <Tabs> render), we verify 'admin_managed'
    // is NOT in the same conditional as 'expired'. A negative regex is
    // brittle, so instead assert the file doesn't have a literal
    // `'expired' || 'admin_managed'` (or vice versa) anywhere.
    expect(layoutSrc).not.toMatch(/['"]admin_managed['"][\s\S]{0,40}['"]expired['"]/);
    expect(layoutSrc).not.toMatch(/['"]expired['"][\s\S]{0,40}['"]admin_managed['"]/);
  });

  it('the "expired" branch checks paywallStore.dismissed', () => {
    // Inline-blur degradation: when dismissed AND expired, render <Tabs>
    // (the children handle the inline-blur banner). The gate must read
    // paywallStore.dismissed somewhere alongside the expired check.
    expect(layoutSrc).toMatch(/paywallDismissed|dismissed/);
  });

  it('Spec 99 §6.5 amendment 2026-05-05 enumerates the AppLayout isFetching carve-out', () => {
    // The narrow `isFetching && subscription_status === 'expired'` carve-out
    // at line 216 is permitted ONLY because Spec 99 §6.5 was amended on
    // 2026-05-05 (resolves WF5 H1) to enumerate it explicitly. Three
    // assertions guard against drift:
    //   1. Categorical rule still present (amendment must not delete it).
    //   2. Amendment header exists.
    //   3. AppLayout case is enumerated by file path + status value inside
    //      the amendment block.
    const specSrc = fs.readFileSync(
      path.join(__dirname, '../../docs/specs/03-mobile/99_mobile_state_architecture.md'),
      'utf8',
    );
    // 1. Categorical rule body — the existing BANNED comment in the §6.5
    //    code-block survives the amendment.
    expect(specSrc).toMatch(/isFetching toggles on every refetch/);
    // 2. Amendment header exists.
    expect(specSrc).toMatch(/Permitted (narrow )?carve-outs/);
    // 3. AppLayout case enumerated — slice the spec from the amendment
    //    header forward and assert the file path + 'expired' both appear
    //    within the amendment block (not somewhere else in the spec).
    const amendmentMatch = specSrc.match(/Permitted (narrow )?carve-outs[\s\S]{0,2000}/);
    expect(amendmentMatch).not.toBeNull();
    const amendmentBlock = amendmentMatch![0];
    expect(amendmentBlock).toMatch(/_layout\.tsx/);
    expect(amendmentBlock).toMatch(/subscription_status/);
    expect(amendmentBlock).toMatch(/['"]expired['"]/);
  });
});

describe('signOut wiring', () => {
  it('authStore.signOut calls usePaywallStore.reset() (Spec 96 §9 sign-out reset; renamed from clear() per Spec 99 §B5)', () => {
    const authSrc = fs.readFileSync(
      path.join(__dirname, '../src/store/authStore.ts'),
      'utf8',
    );
    expect(authSrc).toMatch(/usePaywallStore[\s\S]*\.reset\(/);
  });
});

describe('feed + flight-board inline blur', () => {
  it('lead feed renders <InlineBlurBanner> when paywallDismissed && expired', () => {
    const feedSrc = fs.readFileSync(
      path.join(__dirname, '../app/(app)/index.tsx'),
      'utf8',
    );
    expect(feedSrc).toMatch(/InlineBlurBanner/);
    expect(feedSrc).toMatch(/BlurredFeedPlaceholder/);
    expect(feedSrc).toMatch(/['"]expired['"]/);
  });

  it('flight board renders <InlineBlurBanner> when paywallDismissed && expired', () => {
    const fbSrc = fs.readFileSync(
      path.join(__dirname, '../app/(app)/flight-board.tsx'),
      'utf8',
    );
    expect(fbSrc).toMatch(/InlineBlurBanner/);
    expect(fbSrc).toMatch(/BlurredFeedPlaceholder/);
    expect(fbSrc).toMatch(/['"]expired['"]/);
  });
});

describe('PaywallScreen — 60-second Webhook Delay Refresh (spec §9)', () => {
  const paywallSrc = fs.readFileSync(
    path.join(__dirname, '../src/components/paywall/PaywallScreen.tsx'),
    'utf8',
  );

  it('schedules a 60-second timer to reveal the Refresh link', () => {
    // Spec §9: the link is hidden initially and revealed after 60s without
    // a status change. The exact constant name doesn't matter — assert the
    // 60_000ms (or 60000ms) delay and a setTimeout call.
    expect(paywallSrc).toMatch(/setTimeout/);
    expect(paywallSrc).toMatch(/60[_]?000/);
  });

  it('clears the timeout on unmount (prevents setState on unmounted component)', () => {
    // Spec §9 explicit: the cleanup return must clear the timer so a user
    // who pays before the 60s elapses doesn't trigger a setState on an
    // unmounted PaywallScreen.
    expect(paywallSrc).toMatch(/return\s*\(\s*\)\s*=>\s*clearTimeout/);
  });

  it('Refresh link tap calls queryClient.invalidateQueries(["user-profile"])', () => {
    expect(paywallSrc).toMatch(/invalidateQueries[\s\S]*['"]user-profile['"]/);
  });

  it('shows the "still expired" hint when status did not change after refresh', () => {
    // Spec §9: "If still 'expired', a `text-zinc-500 text-xs` message appears:
    // 'Still showing trial ended — please check buildo.com.'"
    expect(paywallSrc).toMatch(/Still showing trial ended/);
  });

  it('shows the inline ActivityIndicator while the refresh is in-flight', () => {
    expect(paywallSrc).toMatch(/<ActivityIndicator[\s\S]*size=['"]small['"]/);
  });
});

describe('settings — manage subscription link', () => {
  it('hides ManageSubscriptionRow for manufacturer accounts', () => {
    const settingsSrc = fs.readFileSync(
      path.join(__dirname, '../app/(app)/settings.tsx'),
      'utf8',
    );
    expect(settingsSrc).toMatch(/account_preset[\s\S]{0,40}['"]manufacturer['"]/);
    expect(settingsSrc).toMatch(/return null/);
  });

  it('opens the billing page via expo-web-browser', () => {
    const settingsSrc = fs.readFileSync(
      path.join(__dirname, '../app/(app)/settings.tsx'),
      'utf8',
    );
    expect(settingsSrc).toMatch(/WebBrowser\.openBrowserAsync/);
    expect(settingsSrc).toMatch(/buildo\.com\/account\/billing/);
  });
});
