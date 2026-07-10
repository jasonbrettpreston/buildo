// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2
//
// [PF9] The Spec 76 §3.4 nested Flight Center page is RETIRED — the tool is
// now the standalone /admin/flight-center (Spec 36). permanentRedirect (308)
// — not plain redirect() (307/temporary) — because the move is permanent and
// next.config.ts carries no redirects() block to extend. Two parallel flight
// boards must never coexist.

import { permanentRedirect } from 'next/navigation';

export default function LegacyFlightCenterRedirect(): never {
  permanentRedirect('/admin/flight-center');
}
