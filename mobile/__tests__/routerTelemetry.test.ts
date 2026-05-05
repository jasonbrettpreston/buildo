/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §7.3 Router decision telemetry
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11 PostHog PII whitelist
//
// Spec 99 §7.3 mandates:
//   - DEV builds: every router.replace/router.push from AuthGate or AppLayout
//     MUST emit track('route_decision', { authority, branch, from, to, reason }).
//   - Production builds: ONLY 4 enumerated events emit telemetry —
//     1. signOut → /(auth)/sign-in (covered by track('signout_initiated') in
//        authStore.ts; left as-is by this WF3),
//     2. AuthGate Branch 2 (AccountDeletedError) → reactivation modal SHOWN,
//     3. cancelled_pending_deletion → forced sign-out (AppLayout deletion handler),
//     4. AppLayout expired → active transition (paywall clears).
//
// Source-grep style mirrors mobile/__tests__/subscriptionGate.test.ts —
// _layout.tsx orchestrates ~6 third-party libraries impractical to render
// under jest-node, so the contract is enforced via static-shape assertions.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const rootLayoutSrc = fs.readFileSync(
  path.join(__dirname, '../app/_layout.tsx'),
  'utf8',
);
const appLayoutSrc = fs.readFileSync(
  path.join(__dirname, '../app/(app)/_layout.tsx'),
  'utf8',
);
const analyticsSrc = fs.readFileSync(
  path.join(__dirname, '../src/lib/analytics.ts'),
  'utf8',
);
const authStoreSrc = fs.readFileSync(
  path.join(__dirname, '../src/store/authStore.ts'),
  'utf8',
);

// Helper: extract the body of a `case '<label>':` block (up to the next
// `case ` or `default:`). The earlier version also terminated on `\}\s*$`
// in multiline mode — that fired on any line ending in `}`, including the
// inner `if (__DEV__) {}` block's closing line, truncating the extracted
// arm and silently scoping subsequent assertions to a partial body. Drop
// the `\}\s*$` terminator and rely solely on the case/default lookahead;
// over-capture past the switch close is harmless because the regexes that
// consume the captured fragment are anchored on case-specific tokens.
function extractSwitchCase(src: string, caseLabel: string): string {
  const re = new RegExp(
    `case ['"]${caseLabel}['"]:[\\s\\S]*?(?=case ['"][^'"]+['"]:|default:)`,
  );
  const m = src.match(re);
  return m ? m[0] : '';
}

// Helper: assert that `track(eventName, ...)` appears INSIDE an
// `if (__DEV__) { ... }` block within the given source fragment. The
// previous regex `if\s*\(__DEV__\)\s*\{[\s\S]*?track\(...\)[\s\S]*?\}`
// false-passes when the track call is OUTSIDE the guard but the props
// object's `}` happens to land between them (the lazy `[\s\S]*?\}` matches
// the props-close, not the if-block close). Replaced with explicit brace
// counting between the `if (__DEV__) {` opening and the track call: if the
// open-vs-close delta is exactly 1, the track call is inside the guard.
function assertDevGuardedTrack(fragment: string, eventName: string): void {
  const devOpenIdx = fragment.search(/if\s*\(__DEV__\)\s*\{/);
  expect(devOpenIdx).toBeGreaterThanOrEqual(0);
  const trackRe = new RegExp(`track\\(['"]${eventName}['"]`);
  const trackIdx = fragment.search(trackRe);
  expect(trackIdx).toBeGreaterThan(devOpenIdx);
  const between = fragment.slice(devOpenIdx, trackIdx);
  const opens = (between.match(/\{/g) ?? []).length;
  const closes = (between.match(/\}/g) ?? []).length;
  // Exactly one unclosed `{` between the __DEV__ guard opening and the
  // track call → the call is inside the guard's block. Greater than 1 ⇒
  // nested guard (still inside); 0 ⇒ guard already closed before the call
  // (test must fail).
  expect(opens - closes).toBeGreaterThanOrEqual(1);
}

describe('Spec 99 §7.3 — analytics whitelist contract', () => {
  it('ALLOWED_KEYS includes the 8 new route-telemetry keys', () => {
    // route_decision payload: { authority, branch, from, to, reason }
    // reactivation_modal_shown payload: { days_remaining }
    // subscription_expired_to_active payload: { prev, next }
    const allowedKeysMatch = analyticsSrc.match(
      /const ALLOWED_KEYS = new Set\(\[([\s\S]*?)\] as const\)/,
    );
    expect(allowedKeysMatch).not.toBeNull();
    const allowedBlock = allowedKeysMatch![1];
    for (const key of [
      'authority',
      'branch',
      'from',
      'to',
      'reason',
      'days_remaining',
      'prev',
      'next',
    ]) {
      expect(allowedBlock).toMatch(new RegExp(`['"]${key}['"]`));
    }
  });

  it('AllowedKey type union includes the 8 new keys', () => {
    // Drift guard: ALLOWED_KEYS and the AllowedKey type must stay aligned,
    // otherwise TypeScript will allow keys at compile time that get stripped
    // at runtime, or vice versa.
    const typeUnionMatch = analyticsSrc.match(
      /type AllowedKey =([\s\S]*?);/,
    );
    expect(typeUnionMatch).not.toBeNull();
    const typeBlock = typeUnionMatch![1];
    for (const key of [
      'authority',
      'branch',
      'from',
      'to',
      'reason',
      'days_remaining',
      'prev',
      'next',
    ]) {
      expect(typeBlock).toMatch(new RegExp(`['"]${key}['"]`));
    }
  });
});

describe('Spec 99 §7.3 — AuthGate (mobile/app/_layout.tsx) telemetry', () => {
  it("emits track('route_decision', ...) in the 'navigate' case (DEV-only)", () => {
    // The 'navigate' case at line ~155 fires router.replace(decision.to).
    // §7.3 mandates a route_decision event for every router.replace from
    // AuthGate, gated to DEV builds.
    const navigateCase = extractSwitchCase(rootLayoutSrc, 'navigate');
    expect(navigateCase.length).toBeGreaterThan(0);
    expect(navigateCase).toMatch(/track\(['"]route_decision['"]/);
    // The track call MUST be inside an `if (__DEV__) { ... }` guard.
    // Brace-counting verification (see helper) — robust against props-object
    // closing braces appearing inside the call.
    assertDevGuardedTrack(navigateCase, 'route_decision');
  });

  it("emits track('reactivation_modal_shown', ...) in the 'reactivation-modal' case (production)", () => {
    // Spec 99 §7.3 production event #2 — compliance-critical, proves the user
    // saw the 30-day deletion-window prompt. Must NOT be __DEV__-guarded.
    const reactCase = extractSwitchCase(rootLayoutSrc, 'reactivation-modal');
    expect(reactCase.length).toBeGreaterThan(0);
    expect(reactCase).toMatch(/track\(['"]reactivation_modal_shown['"]/);
    // Negative assertion: the reactivation_modal_shown call inside this case
    // must NOT be inside an __DEV__ guard. We extract a window around the
    // call and assert no `if (__DEV__)` precedes it within the case scope.
    const callIdx = reactCase.indexOf("track('reactivation_modal_shown'");
    const altCallIdx = reactCase.indexOf('track("reactivation_modal_shown"');
    const idx = callIdx >= 0 ? callIdx : altCallIdx;
    expect(idx).toBeGreaterThanOrEqual(0);
    // Assert: between case label start and the track call, no `if (__DEV__) {`
    // opens an unclosed block. (A simpler heuristic: count `if (__DEV__)`
    // openings vs. their closing braces in the prefix; we conservatively
    // assert no `if (__DEV__)` appears AT ALL within the case prefix.)
    const prefix = reactCase.slice(0, idx);
    expect(prefix).not.toMatch(/if\s*\(__DEV__\)/);
  });
});

describe('Spec 99 §7.3 — AppLayout (mobile/app/(app)/_layout.tsx) telemetry', () => {
  it("emits track('route_decision', ...) in the cancelled_pending_deletion handler (DEV-only)", () => {
    // The deletion useEffect (~lines 151-161) fires router.replace('/(auth)/sign-in').
    // Anchor: the comment "Sign-out fast path for cancelled_pending_deletion".
    const handlerMatch = appLayoutSrc.match(
      /Sign-out fast path for cancelled_pending_deletion[\s\S]*?\}, \[profile\?\.subscription_status, router\]\);/,
    );
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch![0];
    expect(handler).toMatch(/track\(['"]route_decision['"]/);
    // Brace-counting verification (see helper).
    assertDevGuardedTrack(handler, 'route_decision');
  });

  it("emits track('cancelled_pending_deletion_signout') (production)", () => {
    // §7.3 production event #3. Must fire from the same useEffect, NOT
    // __DEV__-guarded, distinct from signout_initiated (different trigger
    // path — listener-null branch vs. explicit signOut()).
    const handlerMatch = appLayoutSrc.match(
      /Sign-out fast path for cancelled_pending_deletion[\s\S]*?\}, \[profile\?\.subscription_status, router\]\);/,
    );
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch![0];
    expect(handler).toMatch(/track\(['"]cancelled_pending_deletion_signout['"]/);
    // Verify NOT __DEV__-guarded: the prefix from start of handler to the
    // call must not contain an unclosed __DEV__ block. Conservative check:
    // no `if (__DEV__)` immediately precedes the call within ~80 chars.
    const callIdx = handler.search(
      /track\(['"]cancelled_pending_deletion_signout['"]/,
    );
    expect(callIdx).toBeGreaterThanOrEqual(0);
    const prefix80 = handler.slice(Math.max(0, callIdx - 80), callIdx);
    expect(prefix80).not.toMatch(/if\s*\(__DEV__\)\s*\{[^}]*$/);
  });

  it("emits track('subscription_expired_to_active', ...) in the post-payment transition (production)", () => {
    // §7.3 production event #4. Must fire inside the post-payment useEffect's
    // `if (prev === 'expired' && next === 'active')` block. The block body
    // contains nested object literals (`{ queryKey: ['leads'] }`), so a naive
    // `[\s\S]*?\}` capture matches the wrong `}`. Anchor instead on the next
    // statement OUTSIDE the if-block at the same useEffect indent level —
    // `prevStatusRef.current = next;` — which is a stable existing terminator.
    const ifOpenIdx = appLayoutSrc.search(
      /if \(prev === ['"]expired['"] && next === ['"]active['"]\) \{/,
    );
    expect(ifOpenIdx).toBeGreaterThanOrEqual(0);
    const ifCloseIdx = appLayoutSrc.indexOf(
      'prevStatusRef.current = next;',
      ifOpenIdx,
    );
    expect(ifCloseIdx).toBeGreaterThan(ifOpenIdx);
    const block = appLayoutSrc.slice(ifOpenIdx, ifCloseIdx);
    expect(block).toMatch(/clearPaywall\(\)/); // sanity: right block extracted
    expect(block).toMatch(/track\(['"]subscription_expired_to_active['"]/);
    // Production event — not __DEV__-guarded.
    const callIdx = block.search(
      /track\(['"]subscription_expired_to_active['"]/,
    );
    const prefix80 = block.slice(Math.max(0, callIdx - 80), callIdx);
    expect(prefix80).not.toMatch(/if\s*\(__DEV__\)\s*\{[^}]*$/);
  });
});

describe('Spec 99 §7.3 — existing telemetry regression guards', () => {
  it("authStore.ts still emits track('signout_initiated') (production event #1, unchanged)", () => {
    // Audit line 135: production event #1 is "partially covered by
    // track('signout_initiated') in authStore.ts:131". Renaming would break
    // existing PostHog dashboards. WF3 H3 leaves it as-is.
    expect(authStoreSrc).toMatch(/track\(['"]signout_initiated['"]/);
  });
});
