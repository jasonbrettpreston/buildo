// SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.31 (every MaxBLD page is descriptor + content + standard library components),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (the gate reads stable signals), docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4.
//
// task-313 McApp card 1 (PLAN-313-v1 M6; RR-0499 "1a" own start-up screen; RR-0503 3 A: Connecting… for the whole loading state, a plain wordmark, no
// Help & Support) · the mobile LIST binding of `mobile_parcel_opening`, the Opening page the MaxBLD front door (MaxbldAppGate.tsx) draws while the first
// entitlement read has no answer. On the wall's pattern (WallBinding.tsx): the rows of `screens.mobile_parcel_opening` in
// scripts/surfaces/_schema/static-page.json are copied into the slice (`page`) and drawn by pageProps (PageTableBinding.tsx). This file keeps what stays
// code: the closed name lists, the situation -> flags, and the typed class table (the wall's). The rows read no contract value.
import slice from '@/generated/surfaces/mobile_parcel_opening.json';
import { LOT_MAP_BOTTOM_PADDING, LOT_MAP_HEX as H, LOT_MAP_LAYOUT as L, LOT_MAP_SIZES as Z } from '@/constants/lotMap';
import { SEARCH_MAX_WIDTH } from '@/constants/parcelSearch';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import { pageProps, type PageScreen, type PageStyles } from '@/components/surfaces/PageTableBinding';

/** The generated slice: the content strings and the page rows (scripts/surfaces/emit-mobile-surfaces.mjs). */
export const OPENING_SLICE: { surface: string; config: Record<string, number>; content: Record<string, string>; page: PageScreen } = slice as unknown as {
  surface: string; config: Record<string, number>; content: Record<string, string>; page: PageScreen;
};

/** The closed list of flag names a `when` of the rows may name: the three states of the front door that draw the page. */
export const OPENING_FLAG_NAMES = ['loading', 'offline', 'error'] as const;
/** The closed lists of the other names the rows may use (read by the S-page arm of scripts/surfaces/surface-validate.mjs; data, not logic). */
export const OPENING_VALUE_NAMES = [] as const;
export const OPENING_VAR_PATHS = [] as const;
export const OPENING_CHOICES: Record<string, readonly string[]> = {};
export const OPENING_CONTRACT = 'contract_parcels_entitlement';

/** One render of the Opening: the front-door answer that draws it (decideMaxbldGate in mobile/src/lib/appShell.ts). */
export type OpeningSituation = { kind: (typeof OPENING_FLAG_NAMES)[number] };

/** The typed per-platform class table: the wall's (the MF-53 layout table, mobile/src/constants/lotMap.ts); the rows never carry a class. */
const STYLES: PageStyles = {
  screen: L.screen, scroll: L.scroll, column: L.column, bottomPadding: LOT_MAP_BOTTOM_PADDING, maxWidth: SEARCH_MAX_WIDTH,
  bar: L.semiTop, back: L.semiBack, backIconSize: Z.backIcon, iconColor: H.icon,
  status: L.semiLoadingText, heading: L.semiHeading,
  notice: {
    error: { box: L.noticeError, icon: L.noticeIcon, text: L.noticeText, title: L.noticeHeading },
    neutral: { box: L.notice, icon: L.noticeIconNeutral, text: L.noticeTextNeutral, title: L.noticeHeading },
  },
  card: { idle: L.semiCard, checked: L.semiCardChecked, row: L.semiCardRow, dotIdle: L.semiDot, dotChecked: L.semiDotChecked, text: L.semiCardText },
  button: {
    default: { className: L.semiSelect, busyClassName: L.semiSelect, text: L.selectText },
    outline: { className: L.semiRetry, busyClassName: L.semiRetry, text: L.retryText },
  },
};

/** The props tree of one render. Try again (offline and error) is the retry action: the mount refetches the entitlement read. */
export function openingProps(s: OpeningSituation): PropsNode {
  return pageProps(OPENING_SLICE.page, { loading: s.kind === 'loading', offline: s.kind === 'offline', error: s.kind === 'error' }, {}, STYLES);
}

export type OpeningBindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the rows' refs resolve against: none (the rows name content keys only). */
export function openingData(): OpeningBindingData {
  return { contract: { [OPENING_CONTRACT]: {} }, derived: {} };
}
