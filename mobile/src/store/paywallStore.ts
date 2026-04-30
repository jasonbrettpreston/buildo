// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 paywallStore State Machine
//
// Two-state paywall control for the subscription gate. The store is
// intentionally NOT MMKV-persisted (spec §9 explicit) so a returning
// subscriber whose status flipped to `'active'` on the server is never
// stuck in inline-blur mode from a prior session. It also means a user
// signing out on a shared device cannot leave `dismissed: true` for the
// next user — provided authStore.signOut() calls clear() (spec §9
// "Sign-out reset (critical)").

import { create } from 'zustand';

interface PaywallState {
  /** True while the full <PaywallScreen> is rendered. */
  visible: boolean;
  /** True after the user tapped "Maybe later" — feed/flight-board enter inline-blur mode. */
  dismissed: boolean;
  /** Open the full paywall (e.g., user taps the inline-blur banner). */
  show: () => void;
  /** User dismissed the full paywall — switch to inline-blur. */
  dismiss: () => void;
  /** Reset both flags. Called on sign-out and when subscription_status flips to 'active'. */
  clear: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  visible: false,
  dismissed: false,
  show: () => set({ visible: true, dismissed: false }),
  dismiss: () => set({ visible: false, dismissed: true }),
  clear: () => set({ visible: false, dismissed: false }),
}));
