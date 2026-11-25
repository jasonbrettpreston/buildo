// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md §3.2, §6 (dated note 2026-11-11, MF-53: the map page uses the brand tokens),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (numbers live here, never in the binding)
//
// MF-53 · the "choose your lot" page's layout table: the class strings, hexes and numbers LotMapBinding.tsx hands to the parts. Data, not
// code; the same rules as PARCEL_SEARCH_LAYOUT (mobile/src/constants/parcelSearch.ts), whose screen, column, pill, notice, card and button
// classes are reused verbatim so the two pages of the search flow look the same. SRCH.DAYLIGHT (task-322, R-D1): every colour is a Daylight
// report-* token of mobile/tailwind.config.js (small pages v8); the hexes below are the twins of those keys, as REPORT_HEX in reportPage.ts is.
import { PARCEL_SEARCH_LAYOUT as S, PARCEL_SHELF_HEIGHT } from '@/constants/parcelSearch';

export const LOT_MAP_LAYOUT = {
  screen: S.screen,
  scroll: S.scroll,
  column: S.column,
  pill: 'mt-2 flex-row items-center gap-1 rounded-full border border-report-field bg-report-card py-1 pl-4 pr-1',
  pillText: 'flex-1 px-2 py-3 text-base font-normal text-report-ink',
  clear: 'min-h-[44px] min-w-[44px] rounded-full',
  listHeader: S.listHeader,
  rail: S.rail,
  badge: S.badge,
  notice: S.notice,
  noticeError: S.noticeError,
  noticeIcon: S.noticeIcon,
  noticeIconNeutral: 'text-report-muted',
  noticeText: S.noticeText,
  noticeTextNeutral: S.noticeTextNeutral,
  noticeHeading: 'text-base font-semibold text-report-ink',
  retry: S.retry,
  retryText: S.retryText,
  loading: 'mt-10 items-center',
  loadingText: 'mt-2 text-center text-sm font-normal text-report-muted',
  mapFrame: 'mt-4 w-full overflow-hidden rounded-[20px] bg-report-card shadow-report-card',
  card: S.card,
  cardChecked: S.cardChecked,
  cardRow: S.cardRow,
  cardTitle: 'text-[12px] font-semibold uppercase tracking-wider text-report-amber-ink',
  cardArea: 'mt-1 text-base font-semibold text-report-ink',
  marker: 'min-w-[24px] items-center rounded-full bg-report-card px-2 py-1 border border-report-amber-ink',
  markerChecked: 'min-w-[24px] items-center rounded-full bg-report-amber px-2 py-1 border border-report-amber-ink',
  markerText: 'text-xs font-bold text-report-amber-ink',
  markerTextChecked: 'text-xs font-bold text-report-ink',
  select: S.select,
  selectText: S.selectText,
  // SRCH.C12 (v8 choose-lot.html:279): the help link reuses the search page link classes; the prompt is small muted text beside it.
  // SRCH.SEMI stage 2 (task-319, MF-93): the semi question page's own keys, drawn from the approved mock (small pages v8, choose-lot: .top, h2,
  // .card[role=radio], .btn.p, .btn.s). Semi-only: the shared card, heading and select keys above stay as the lot map and search page read them.
  semiTop: 'min-h-[56px] w-full flex-row items-center border-b border-report-line bg-report-page px-4',
  semiBack: 'min-h-[44px] min-w-[44px] -ml-3 rounded-xl',
  semiHeading: 'mt-6 w-full text-lg font-bold leading-6 text-report-ink',
  semiCard:
    'mt-3 h-auto sm:h-auto min-h-[44px] w-full flex-col items-start justify-start rounded-[20px] px-4 py-4 bg-report-card dark:bg-report-card border-report-line dark:border-report-line active:bg-report-sky dark:active:bg-report-sky',
  semiCardChecked:
    'mt-3 h-auto sm:h-auto min-h-[44px] w-full flex-col items-start justify-start rounded-[20px] px-4 py-4 bg-report-card dark:bg-report-card border-report-ink dark:border-report-ink active:bg-report-sky dark:active:bg-report-sky',
  semiCardRow: 'w-full flex-row items-center gap-[14px]',
  semiDot: 'h-[22px] w-[22px] rounded-full border-2 border-report-field bg-report-card',
  semiDotChecked: 'h-[22px] w-[22px] rounded-full border-[7px] border-report-ink bg-report-card',
  semiCardText: 'flex-1 text-base font-normal text-report-ink',
  // task-465 (McFixV2.1; RR-0485 "1 inside", finding 19, the approved mock state 7 .semi h3 / .ans div): the question is the focus, 26/32 bold; the
  // answers are smaller and lighter, 15/20 at 48 px. New keys, because the report-limit wall (WallBinding.tsx) reads semiHeading, semiCard,
  // semiCardChecked and semiCardText and has no ruling for a new look.
  semiQuestionHeading: 'mt-6 w-full text-[26px] leading-[32px] font-bold text-report-ink',
  semiAnswerCard:
    'mt-3 h-auto sm:h-auto min-h-[48px] w-full flex-col items-start justify-start rounded-[20px] px-4 py-3 bg-report-card dark:bg-report-card border-report-line dark:border-report-line active:bg-report-sky dark:active:bg-report-sky',
  semiAnswerCardChecked:
    'mt-3 h-auto sm:h-auto min-h-[48px] w-full flex-col items-start justify-start rounded-[20px] px-4 py-3 bg-report-card dark:bg-report-card border-report-ink dark:border-report-ink active:bg-report-sky dark:active:bg-report-sky',
  semiAnswerText: 'flex-1 text-[15px] leading-[20px] font-normal text-report-muted',
  semiSelect: 'mt-6 min-h-[48px] w-full rounded-xl',
  semiRetry: 'mt-3 min-h-[48px] w-full rounded-xl bg-report-button dark:bg-report-button border-report-button-border dark:border-report-button-border',
  semiLoadingText: 'mt-6 text-base font-normal text-report-muted',
  // task-362 (choose-lot.html:278 `<p class="small" id="pick-hint">`, 13px muted): the hint under the disabled Choose a lot button, centred like the help row.
  pickHint: 'mt-2 w-full text-center text-xs font-normal text-report-soft',
  helpRow: 'mt-3 flex-row flex-wrap items-center justify-center gap-1',
  helpPrompt: 'text-xs font-normal text-report-soft',
  helpLink: S.report,
  helpLinkText: S.reportText,
} as const;

/** Map colours (react-native-maps takes colour values, not classes): the Daylight twins. Amber is report-amber; the stroke is report-amber-ink (v8 draws #b45309, which has no report token: OPERATOR item). */
export const LOT_MAP_HEX = {
  lotStroke: '#9a4a07', // report-amber-ink
  lotFill: 'rgba(245,158,11,0.12)', // report-amber at the v8 alpha
  lotFillChecked: 'rgba(245,158,11,0.40)',
  lotFillBuilt: 'rgba(245,158,11,0.24)', // SRCH.LOTCARD C.5: a lot with a building footprint (presence only), between the plain and the picked tier
  pin: '#1d1b18', // report-ink (the v8 pin)
  icon: '#4d4841', // report-muted
  check: '#1d1b18', // report-ink
  onPrimary: '#1d1b18', // report-ink on amber
  primary: '#f59e0b', // report-amber
} as const;

/** Numbers (FE-05: none in the binding). */
export const LOT_MAP_SIZES = { mapHeight: 280, lotStroke: 2, icon: 16, noticeIcon: 14, backIcon: 22 } as const;
/** The initial region is the server's start view padded by this factor, so the outlines never touch the frame. */
export const LOT_MAP_REGION_PAD = 1.4;
/** The scroll content's bottom padding: the S-004 shelf plus 24, as the search page. */
export const LOT_MAP_BOTTOM_PADDING = PARCEL_SHELF_HEIGHT + 24;
/**
 * The light map style: structure only (points of interest and label icons off, as the old dark style had them), no colour, so no new palette
 * (the v8 tile colours have no report token: OPERATOR item). iOS takes userInterfaceStyle "light"; Android (Google) takes this list.
 */
export const LOT_MAP_STYLE = [
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
] as const;
