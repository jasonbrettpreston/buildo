// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §5 Paywall Screen
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b
//
// Published response contract for POST /api/subscribe/session — consumed
// by the Expo client via mobile/src/hooks/useSubscribeCheckout.ts.
// Cross-Domain Scenario B: any breaking change here must be coordinated
// with the mobile repo (.claude/domain-crossdomain.md).

export interface SubscribeSessionResponse {
  /**
   * Single-use checkout URL of the form
   * `https://buildo.com/subscribe?nonce={uuid}`. The nonce is server-side,
   * 15-minute TTL, and contains no UID or email — the web checkout page
   * exchanges it server-to-server to recover the Firebase UID.
   */
  url: string;
}
