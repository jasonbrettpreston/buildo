// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 paywallStore State Machine
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B5 + §9.12 reset convention
//
// Two-state paywall control for the subscription gate. The store is
// intentionally NOT MMKV-persisted (spec §9 explicit) so a returning
// subscriber whose status flipped to `'active'` on the server is never
// stuck in inline-blur mode from a prior session. It also means a user
// signing out on a shared device cannot leave `dismissed: true` for the
// next user — provided authStore.signOut() calls reset() (spec §9
// "Sign-out reset (critical)").
//
// Naming: this store originally exposed `clear()` per Spec 96 §9. Spec 99
// §B5 standardized `.reset()` across all stores so the §9.12 store-
// enumeration coverage test can assert the convention uniformly. Renamed
// 2026-05-03 as part of the §9.12 / §9.15 P2 batch.

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
  reset: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  visible: false,
  dismissed: false,
  show: () => set({ visible: true, dismissed: false }),
  dismiss: () => set({ visible: false, dismissed: true }),
  reset: () => set({ visible: false, dismissed: false }),
}));
