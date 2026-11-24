// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0a principle 1 and §11b.2 (the page structure is rows of the page table; one binding per
//            archetype per platform; refs only), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-18, FE-31,
//            docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (the gate is the server 403; the read only picks the words).
//
// task-452 SEARCHFIX.4 · the mobile LIST binding of S-096 `mobile_parcel_wall`, the wall a refused lookup shows (RR-0443; RR-0444 2b "a subscription upgrade with
// more report room", "a user with an expired subscription gets a reactivate screen"; RR-0454 item 3: the plan line, no top-up or upgrade control until the
// buying work; RR-0455: phone first, the web waits for its switch-on, the no-plan page is task-357). On the semi page's pattern (SemiQuestionBinding.tsx):
// the rows of `screens.mobile_parcel_wall` in scripts/surfaces/_schema/static-page.json are copied into the slice (`page`) and drawn by pageProps
// (PageTableBinding.tsx). This file keeps what stays code: the closed name lists, the situation -> flags and values, the typed class table, and the
// contract values the rows' vars resolve against. The count and the date are the entitlement read's (RR-0310), never the 403's.
import slice from '@/generated/surfaces/mobile_parcel_wall.json';
import { LOT_MAP_BOTTOM_PADDING, LOT_MAP_HEX as H, LOT_MAP_LAYOUT as L, LOT_MAP_SIZES as Z } from '@/constants/lotMap';
import { SEARCH_MAX_WIDTH } from '@/constants/parcelSearch';
import { PARCEL_TAB_ROUTE, type WallKind } from '@/lib/parcelSearchMatch';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import { pageProps, type PageScreen, type PageStyles } from '@/components/surfaces/PageTableBinding';

/** The generated slice: the content strings and the page rows (scripts/surfaces/emit-mobile-surfaces.mjs). */
export const WALL_SLICE: { surface: string; config: Record<string, number>; content: Record<string, string>; page: PageScreen } = slice as unknown as {
  surface: string; config: Record<string, number>; content: Record<string, string>; page: PageScreen;
};

/** The closed list of flag names a `when` of the rows may name (task-357 appends no_plan, checking and none). */
export const WALL_FLAG_NAMES = ['limit', 'reactivate'] as const;
/** The closed lists of the other names the rows may use (read by the S-page arm of scripts/surfaces/surface-validate.mjs; data, not logic). */
export const WALL_VALUE_NAMES = ['route'] as const;
export const WALL_VAR_PATHS = ['reportsLimit', 'resetsOnDisplay'] as const;
export const WALL_CHOICES: Record<string, readonly string[]> = {};
export const WALL_CONTRACT = 'contract_parcels_entitlement';

/** One render of the wall: its state and the two served fields of the entitlement read. */
export type WallSituation = { kind: WallKind; reportsLimit: number | null; resetsOnDisplay: string | null };

/** The typed per-platform class table: the semi page's (the MF-53 layout table, mobile/src/constants/lotMap.ts) plus the notice title and small classes; the rows never carry a class. */
const STYLES: PageStyles = {
  screen: L.screen, scroll: L.scroll, column: L.column, bottomPadding: LOT_MAP_BOTTOM_PADDING, maxWidth: SEARCH_MAX_WIDTH,
  bar: L.semiTop, back: L.semiBack, backIconSize: Z.backIcon, iconColor: H.icon,
  status: L.semiLoadingText, heading: L.semiHeading,
  notice: {
    error: { box: L.noticeError, icon: L.noticeIcon, text: L.noticeText },
    // RR-0466 (MD:2410-2413): the first line emphasised (the existing notice heading look), the reset line smaller beneath it; full literals so NativeWind generates them.
    neutral: { box: L.notice, icon: L.noticeIconNeutral, text: L.noticeTextNeutral, title: L.noticeHeading, small: 'text-xs font-normal text-report-muted' },
  },
  card: { idle: L.semiCard, checked: L.semiCardChecked, row: L.semiCardRow, dotIdle: L.semiDot, dotChecked: L.semiDotChecked, text: L.semiCardText },
  button: {
    default: { className: L.semiSelect, busyClassName: L.semiSelect, text: L.selectText },
    outline: { className: L.semiRetry, busyClassName: L.semiRetry, text: L.retryText },
  },
};

/** The props tree of one render. Go to Tracked Lots targets the Tracked tab route (the mount switches tab with router.navigate). */
export function wallProps(s: WallSituation): PropsNode {
  return pageProps(WALL_SLICE.page, { limit: s.kind === 'limit', reactivate: s.kind === 'reactivate' }, { route: PARCEL_TAB_ROUTE.tracked }, STYLES);
}

export type WallBindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the rows' vars resolve against: the two served fields of the entitlement read. */
export function wallData(s: WallSituation): WallBindingData {
  return { contract: { [WALL_CONTRACT]: { reportsLimit: s.reportsLimit, resetsOnDisplay: s.resetsOnDisplay } }, derived: {} };
}
