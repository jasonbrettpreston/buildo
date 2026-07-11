// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §6.8 + §8 (reserved sponsor slot)
//
// A NAMED, reserved region in the Parcel Cost Tool detail layout for future architect / designer /
// trade sponsorships (Spec 100 §8). v1 ships ZERO sponsor code: the slot renders `null` until the
// `EXPO_PUBLIC_PARCEL_SPONSORS` flag is set — never an empty styled box (Spec 100 Known Failure
// Modes: "sponsor-slot empty DOM"). Placed on the detail screen so the layout position is claimed.

import type { ReactElement } from 'react';

export interface SponsorSlotProps {
  /** Where in the detail flow this slot sits — reserved for future targeting. */
  placement: 'detail_footer';
}

/** Returns `null` while the sponsor feature is flag-gated off (the v1 state). */
export function SponsorSlot(_props: SponsorSlotProps): ReactElement | null {
  const enabled = process.env.EXPO_PUBLIC_PARCEL_SPONSORS === '1';
  if (!enabled) return null;
  // Future (Spec 100 §8): render the targeted sponsor card here. No v1 code.
  return null;
}
