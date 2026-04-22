// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 7 item 2
//
// Shared Vibration API wrapper for tactile feedback on touch events in
// the leads feature. Feature-detects navigator.vibrate (Safari/iOS
// don't implement the Vibration API) and respects the user's
// prefers-reduced-motion setting (WCAG 2.1 SC 2.3.3).
//
// Callers: SaveButton (save/unsave), PermitLeadCard + BuilderLeadCard
// (tap-to-record-view), LeadFilterSheet (confirm).
//
// Duration convention:
//   - 10ms default: light feedback for frequent actions (card tap)
//   - 15ms: medium feedback for deliberate actions (filter confirm)
//   - 20ms: stronger feedback for state-changing actions (save/unsave)
//
// NEVER throws — the helper swallows all errors because haptic
// feedback is a nice-to-have, not a contract. An OS that rejects a
// vibration request (permissions, inactive tab) must not break the
// surrounding interaction.

/**
 * Trigger a short haptic tap via the Vibration API.
 *
 * @param ms duration in milliseconds (default: 10ms = light tap)
 *
 * Safe to call from any event handler in a client component. No-op on
 * SSR (`navigator === undefined`), iOS Safari (no `navigator.vibrate`),
 * or when the user has `prefers-reduced-motion: reduce` set. Errors
 * from the underlying `navigator.vibrate` call (e.g., tab inactive)
 * are swallowed.
 *
 * The `prefers-reduced-motion` check is read at call time via
 * `window.matchMedia`, not cached — so a user toggling OS-level
 * reduced-motion mid-session takes effect on the next interaction.
 * WCAG 2.1 SC 2.3.3 is strictly about visual motion, but many users
 * set it as a general "minimize non-essential stimuli" preference, so
 * respecting it for haptics as well is the conservative choice.
 */
export function hapticTap(ms = 10): void {
  // SSR guard — Next.js Server Components render without `navigator`
  if (typeof navigator === 'undefined') return;

  const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return;

  // Reduced-motion gate — check at call time so preference changes
  // take effect immediately without a page reload
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch {
      // Some older browsers throw on unknown media queries — fall
      // through to attempt the vibration, which also has its own guard
    }
  }

  try {
    nav.vibrate(ms);
  } catch {
    // Silent — haptics are a nice-to-have, not a contract.
  }
}
