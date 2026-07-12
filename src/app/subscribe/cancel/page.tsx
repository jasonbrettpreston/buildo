// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2
//
// /subscribe/cancel — Stripe checkout cancel-return page (P26-26B). Purely
// informational: the user backed out on the Stripe-hosted page, no charge was
// made, no state changed anywhere. Server component (no interactivity).
// A fresh checkout requires a fresh nonce — the app's paywall CTA mints one.

export default function SubscribeCancelPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Checkout cancelled
        </h1>
        <p className="text-sm text-gray-500">
          No charge was made. If you change your mind, return to the Buildo
          app and tap “Continue at buildo.com” to start again.
        </p>
      </div>
    </div>
  );
}
