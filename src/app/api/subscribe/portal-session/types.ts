// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §5
//            docs/specs/03-mobile/96_mobile_subscription.md §7
//
// Published response contract for POST /api/subscribe/portal-session —
// consumed by the Expo client via mobile/src/hooks/usePortalSession.ts.
// Cross-Domain Scenario B: any breaking change here must be coordinated
// with the mobile Zod mirror (.claude/domain-crossdomain.md).

export interface PortalSessionResponse {
  /**
   * One-off Stripe Customer Portal session URL (short-lived, single visitor).
   * Created per request via stripe.billingPortal.sessions.create — never a
   * static link. The portal handles cancel / payment-method updates /
   * past_due recovery.
   */
  url: string;
}
