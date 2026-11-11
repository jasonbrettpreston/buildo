// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md §3.2, §6 (dated note 2026-11-11, MF-53: the map page uses the brand tokens),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (numbers live here, never in the binding)
//
// MF-53 · the "choose your lot" page's layout table: the class strings, hexes and numbers LotMapBinding.tsx hands to the parts. Data, not
// code; the same rules as PARCEL_SEARCH_LAYOUT (mobile/src/constants/parcelSearch.ts), whose screen, column, pill, notice, card and button
// classes are reused verbatim so the two pages of the search flow look the same. Every hex is a Spec 117 §3.2 role or a search-page shade.
import { PARCEL_SEARCH_LAYOUT as S, PARCEL_SHELF_HEIGHT } from '@/constants/parcelSearch';
import { DARK_MAP_STYLE } from '@/constants/tokens';

export const LOT_MAP_LAYOUT = {
  screen: S.screen,
  scroll: S.scroll,
  column: S.column,
  pill: 'mt-2 flex-row items-center gap-1 rounded-full border border-[#2e2e33] bg-[#18181b] py-1 pl-4 pr-1',
  pillText: 'flex-1 px-2 py-3 text-base font-normal text-zinc-100',
  clear: 'min-h-[44px] min-w-[44px] rounded-full',
  listHeader: S.listHeader,
  rail: S.rail,
  badge: S.badge,
  notice: S.notice,
  noticeIcon: S.noticeIcon,
  noticeIconNeutral: 'text-zinc-400',
  noticeText: S.noticeText,
  noticeTextNeutral: 'text-sm font-normal text-zinc-300',
  noticeHeading: 'text-base font-semibold text-zinc-100',
  retry: S.retry,
  retryText: S.retryText,
  loading: 'mt-10 items-center',
  loadingText: 'mt-2 text-center text-sm font-normal text-zinc-400',
  mapFrame: 'mt-4 w-full overflow-hidden rounded-xl border border-[#2a2a2c]',
  card: S.card,
  cardChecked: S.cardChecked,
  cardRow: S.cardRow,
  cardTitle: 'font-mono text-[11px] font-semibold uppercase tracking-widest text-[#f59e0b]',
  cardArea: 'mt-1 text-base font-semibold text-zinc-100',
  cardFacts: 'mt-1 text-sm font-normal text-zinc-400',
  marker: 'min-w-[24px] items-center rounded-full bg-[#18181b] px-2 py-1 border border-[#f59e0b]',
  markerChecked: 'min-w-[24px] items-center rounded-full bg-[#f59e0b] px-2 py-1 border border-[#f59e0b]',
  markerText: 'text-xs font-bold text-[#f59e0b]',
  markerTextChecked: 'text-xs font-bold text-[#472a00]',
  select: S.select,
  selectText: S.selectText,
} as const;

/** Map colours (react-native-maps takes colour values, not classes). Amber is §3.2 primary; neutrals are the zinc scale. */
export const LOT_MAP_HEX = {
  lotStroke: '#f59e0b',
  lotFill: 'rgba(245,158,11,0.12)',
  lotFillChecked: 'rgba(245,158,11,0.40)',
  neighbourStroke: '#52525b',
  neighbourFill: 'rgba(161,161,170,0.08)',
  neighbourFillChecked: 'rgba(245,158,11,0.40)',
  neighbourStrokeChecked: '#f59e0b',
  pin: '#f4f4f5',
  icon: '#a1a1aa',
  onPrimary: '#472a00',
  primary: '#f59e0b',
} as const;

/** Numbers (FE-05: none in the binding). */
export const LOT_MAP_SIZES = { mapHeight: 280, lotStroke: 2, neighbourStroke: 1, icon: 16, noticeIcon: 14 } as const;
/** The initial region is the server's start view padded by this factor, so the outlines never touch the frame. */
export const LOT_MAP_REGION_PAD = 1.4;
/** The scroll content's bottom padding: the S-004 shelf plus 24, as the search page. */
export const LOT_MAP_BOTTOM_PADDING = PARCEL_SHELF_HEIGHT + 24;
/** Android (Google) dark tiles: the app's one existing dark map style, reused (iOS takes userInterfaceStyle "dark"). */
export const LOT_MAP_STYLE = DARK_MAP_STYLE;
