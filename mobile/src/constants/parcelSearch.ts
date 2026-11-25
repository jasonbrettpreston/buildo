// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SEARCH archetype profile)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6, §3, §4
//            Surface S-002 `mobile_parcel_search` —
//            scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json
//
// The SEARCH archetype's declared parameters, externalised. Spec 126 §3.1 row 4 makes
// `config.debounce_ms`, `config.min_query_len` and `guards.rate_bucket` REQUIRED descriptor
// answers; these constants are named after those descriptor fields so the value in the code and
// the value in the descriptor are checkable against each other by name, not by memory.
//
// Each constant carries the two sides of its truth: what the descriptor declares, and where the
// behaviour is actually enforced. None of these is a free choice made here.

// The debounce and the minimum query length have no constant here: config.debounce_ms and config.min_query_len of the generated slice are their one home (registered logic
// variables maxbld_page_debounce_ms and maxbld_page_min_query_len), read through the reader in SearchBinding.tsx.

// task-454 SEARCHFIX.6 (MORNING-DECISIONS.md:1494 "register them"; Spec 128 Rule 3): the candidate cap and the recent-search count have no constant here
// either: they are the registered settings maxbld_page_candidate_cap and maxbld_page_recent_max (config.candidate_cap and config.recent_max of the generated
// slice), read in SearchBinding.tsx and recentSearchesStore.ts. Prior text: SEARCH_CANDIDATE_LIMIT = 10 and SEARCH_RECENT_MAX = 3 were typed here.

// The SEARCH archetype's third declared parameter, `guards.rate_bucket`, is deliberately NOT
// mirrored here. It is `parcels-search:{uid}` over a 60 s window; its per-minute count is the server
// setting parcel_lookup_search_per_min (default 60, read by `src/app/api/parcels/lookup/route.ts`;
// task-454), it is enforced entirely server-side, and the client
// reacts to the 429 it produces rather than to the bucket's name. A TS constant nobody reads would
// be a second copy of a server fact with nothing keeping it honest — the descriptor's
// `guards.rate_bucket` is its one home.

// ── Brand tokens (Spec 117 §6.1) ────────────────────────────────────────────
// Surface-scoped shades of the roles already ratified in Spec 117 §3.2. They are NativeWind
// arbitrary-value classes rather than new entries in `mobile/tailwind.config.js`, because Spec 117
// §7 makes a change to the brand token table a two-file, same-commit obligation (mobile config +
// src/app/globals.css) — and these are deeper neighbours of existing roles, not new brand roles.
// The amber primary is `#f59e0b`, unchanged from §3.2.
//
// Every hex has exactly ONE definition site: here.
export const PARCEL_SEARCH_TOKENS = {
  /** Neutral 950 (bg) — §3.2 `#09090b`, deepened for the centred search field. */
  screenBg: 'bg-[#0e0e10]',
  /** Neutral 900 (card) — §3.2 `#18181b` verbatim. The search surface. */
  searchSurface: 'bg-[#18181b]',
  /** Between card and elevated — the suggestion chip. */
  chipBg: 'bg-[#161618]',
  /**
   * Neutral 800 — §3.2 `#27272a`. The pressed chip.
   * The `active:` variant is part of the literal on purpose: Tailwind generates a class only if
   * the FULL class string appears in a scanned file, so composing `active:${...}` at runtime would
   * silently produce a class that was never generated.
   */
  chipBgPressed: 'active:bg-[#27272a]',
  /** Softer than §3.2's `#3f3f46` border, for the search field. */
  borderSearch: 'border-[#2e2e33]',
  /** Softer still — candidate rows. */
  borderRow: 'border-[#2a2a2c]',
  /** The chip border. */
  borderChip: 'border-[#353437]',
  /** Primary — §3.2 `#f59e0b`, verbatim. */
  primaryText: 'text-[#f59e0b]',
  primaryBg: 'bg-[#f59e0b]',
  /** On-primary: AA-safe dark text on an amber fill. */
  onPrimaryText: 'text-[#472a00]',
  /** Text secondary — §3.2 `#a1a1aa` (zinc-400), verbatim. */
  textSecondary: 'text-zinc-400',
} as const;

/** Spec 117 §6.1 layout: the centred "Google-style" column never exceeds this width. */
export const SEARCH_MAX_WIDTH = 448;

// ── S-004 product shelf (operator ruling 2026-09-16 (c)) ────────────────────
// The MaxBLD product shell's three-tab shelf: Lookup · Tracked Lots · Account. Every screen in the
// parcel-tool Stack sits above it, so each reserves PARCEL_SHELF_HEIGHT at the bottom of its
// scroll content. The five-tab lead-gen bar (S-046) is hidden while these routes are focused.
export const PARCEL_SHELF_HEIGHT = 82;
/** Bottom padding is max(this, safe-area inset) — a device with no inset still gets breathing room. */
export const PARCEL_SHELF_MIN_BOTTOM_PAD = 24;

// ── S-072 Tracked Lots (Spec 117 §6.1) ──────────────────────────────────────
// A deeper, more layered set than the search surface, because this screen stacks a sticky header,
// a meta row and a scrolling list of cards — it needs two container levels where S-002 needed one.
// Every value is a surface-scoped shade of a Spec 117 §3.2 role; the amber primary is unchanged.
export const TRACKED_LOTS_HEX = {
  /** Screen + sticky header surface. */
  surface: '#131315',
  /** Container LOW — the card ground. */
  containerLow: '#1c1b1d',
  /** Container HIGH — pressed card, chip fills. */
  containerHigh: '#2a2a2c',
  /** Outline variant — card borders and dividers. */
  outlineVariant: '#353437',
  /** Primary — §3.2 `#f59e0b`, unchanged. The CoA max-build figure and the active affordances. */
  primary: '#f59e0b',
  /** Outline — a warm neutral for the mono meta row. */
  outline: '#a08e7a',
  /** Tertiary — the affirmative "new nearby ruling" badge. Reserved for a DEFINITE yes. */
  tertiary: '#56e5a9',
  /** Error — destructive affordances and the error state. */
  error: '#ffb4ab',
} as const;

export const PARCEL_SHELF_HEX = {
  /** Screen ground behind the shelf — Spec 117 §6.1, the same `#0e0e10` as the search surface. */
  screen: '#0e0e10',
  /** The shelf itself: `#131315` at 95%. */
  shelf: 'rgba(19,19,21,0.95)',
  /** zinc-800 top border. */
  border: '#27272a',
  /** Inactive tab icon + label. */
  inactive: '#9ca3af',
} as const;

/** Raw hex for props that take a colour value rather than a class (icons, ActivityIndicator). */
export const PARCEL_SEARCH_HEX = {
  primary: '#f59e0b',
  /** Paired with `primaryBg` — an icon sitting ON the amber fill. */
  onPrimary: '#472a00',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  placeholder: '#52525b',
} as const;

// ── MF-35 layout table (Spec 117 §6.1 and its dated note 2026-11-10; P35-D11) ─────────────────────────────────────────────────────────────
// The class strings and numbers the search page's binding (mobile/src/components/surfaces/SearchBinding.tsx) hands to the React Native
// Reusables parts. Data, not code: every class is a FULL literal so NativeWind generates it (a composed `dark:${x}` would silently not exist).
// Rules pinned by mobile/__tests__/parcelScreens.golden.test.ts:
//   - 44 px is `min-h-[44px]` (NativeWind's rem is 14 here, so `min-h-11` is 38.5 px; plan F-A); no other `min-h-` token on a Button or Input;
//   - every `dark:` token of a vendored variant in use has a twin with the same chain (`dark:bg-`, `dark:border-`, `dark:active:bg-`; P35-D2 a),
//     so light-mode and dark-mode phones look the same;
//   - every Text carries an explicit size, weight and colour (the RNR Text base is `text-foreground text-base`).
// The S-002 hexes are the §6.1 values above; the RNR roles (`bg-primary`, `border-primary`) come from the generated theme (Spec 117 §7 note).
export const PARCEL_SEARCH_LAYOUT = {
  screen: 'flex-1 bg-report-page',
  scroll: 'flex-1',
  column: 'w-full px-4',
  header: 'items-center pt-10 pb-6',
  wordmark: 'text-2xl font-bold tracking-tight text-report-ink',
  wordmarkAccent: 'text-2xl font-bold tracking-tight text-report-amber-ink',
  tagline: 'mt-1 text-[12px] font-semibold uppercase tracking-widest text-report-muted',
  pill: 'flex-row items-center gap-1 rounded-full border border-report-field bg-report-card py-1 pl-4 pr-1',
  // task-465 (McFixV2.1; RR-0483, RR-0487 approved mock MOCK-465-approved.html .box/.bar/.drop/.rowi/.msg/.hint): the box is one object; closed it is
  // a pill, open the drop-down hangs from it under a thin grey line. rounded-[26px] (not rounded-full, which turns a tall box into a capsule).
  box: 'w-full overflow-hidden rounded-[26px] border border-report-field bg-report-card',
  bar: 'min-h-[52px] flex-row items-center gap-2 py-1 pl-4 pr-[6px]',
  /** The spinner at the right edge of the box, in a 44 px slot (mock .go). */
  spinnerSlot: 'h-[44px] w-[44px] items-center justify-center',
  drop: 'w-full border-t border-report-line',
  /** A drop-down row: 48 px, the address only (P35-D15 b: no area line); the first row has no top rule (mock .rowi:first-child). */
  row: 'h-auto sm:h-auto min-h-[48px] w-full flex-row items-center justify-start gap-3 rounded-none border-t border-report-line px-4 py-[6px] bg-transparent dark:bg-transparent active:bg-report-page dark:active:bg-report-page',
  rowFirst: 'h-auto sm:h-auto min-h-[48px] w-full flex-row items-center justify-start gap-3 rounded-none px-4 py-[6px] bg-transparent dark:bg-transparent active:bg-report-page dark:active:bg-report-page',
  rowText: 'flex-1 text-[15px] leading-[20px] font-medium text-report-ink',
  /** One answer line in the drop-down (the miss, outside Toronto, the prompt): an icon, a 15/20 line and a 13/18 line under it. */
  msg: 'w-full flex-row items-start gap-3 px-4 py-3',
  msgBody: 'flex-1',
  msgTitle: 'text-[15px] leading-[20px] font-normal text-report-ink',
  msgSub: 'mt-[2px] text-[13px] leading-[18px] font-normal text-report-soft',
  /** The one line under the rows after Enter (mock .hint): more than one match, or the refine line. */
  hint: 'border-t border-report-line px-4 pt-2 pb-[10px] text-[12px] leading-[16px] font-normal text-report-soft',
  input:
    'flex-1 h-[44px] min-h-[44px] rounded-none border-0 bg-transparent dark:bg-transparent px-0 py-0 text-[16px] font-normal text-report-ink shadow-none placeholder:text-report-soft',
  /** MF-58: the legal line under the address input (ruling 2026-11-10 items 16 and 5); 13/18 muted as small pages v8 (.legal).
   *  task-465 (finding 6, mock .legal): smaller and quieter, 11/15 in report-soft (the mock's #8a8172 is under WCAG AA on the page; report-soft is 5.61:1). */
  legal: 'mt-6 text-center text-[11px] leading-[15px] font-normal text-report-soft',
  /** SRCH.A6 (task-320): the reports-left line under the box, v8 .small: one small centred muted line. task-465 (mock .count): 12/16 in report-soft. */
  allowance: 'mt-4 text-center text-[12px] leading-[16px] font-normal text-report-soft',
  chipRow: 'mt-2 flex-row flex-wrap justify-center gap-[6px]',
  /** task-465 (O16, mock .chip): a 32 px plain pill inside a transparent 44 px Button, so the 44 px floor holds. */
  chip: 'h-auto sm:h-auto min-h-[44px] px-0 bg-transparent dark:bg-transparent active:bg-transparent dark:active:bg-transparent',
  chipPill: 'min-h-[32px] flex-row items-center rounded-full border border-report-button-border px-3',
  chipText: 'text-[13px] leading-[18px] font-normal text-report-muted',
  notice: 'mt-3 rounded-xl bg-report-card border-report-button-border',
  /** The v8 error banner: the report's refused fill and ring. */
  noticeError: 'mt-3 rounded-xl bg-report-no-fill border-report-no-ring',
  noticeText: 'text-sm font-normal text-report-no',
  /** The notice icon colours: the report's refused colour; the entitlement lock is the amber-as-text ink. */
  noticeIcon: 'text-report-no',
  entitlementIcon: 'text-report-amber-ink',
  noticeTextNeutral: 'text-sm font-normal text-report-muted',
  retry: 'mt-2 min-h-[44px] rounded-xl',
  retryText: 'text-xs font-semibold text-report-ink',
  listHeader: 'mt-4 flex-row items-center justify-between',
  rail: 'text-[12px] font-semibold uppercase tracking-wider text-report-soft',
  badge: 'text-[12px] font-semibold uppercase tracking-wider text-report-amber-ink',
  card:
    'mt-2 h-auto sm:h-auto min-h-[44px] w-full flex-col items-start justify-start rounded-[20px] px-3 py-3 bg-report-card dark:bg-report-card border-report-line dark:border-report-line active:bg-report-sky dark:active:bg-report-sky',
  cardChecked:
    'mt-2 h-auto sm:h-auto min-h-[44px] w-full flex-col items-start justify-start rounded-[20px] px-3 py-3 bg-report-card dark:bg-report-card border-report-ink dark:border-report-ink active:bg-report-sky dark:active:bg-report-sky',
  cardRow: 'w-full flex-row items-center justify-between gap-2',
  cardText: 'flex-1 text-base font-normal text-report-ink',
  // task-465 (O12; mock .rowi .a b i): the typed part is bold and the rest medium, both ink (prior: the differing part in amber, P35-D17 a).
  segment: 'text-[15px] leading-[20px] font-bold text-report-ink',
  segmentDiffers: 'text-[15px] leading-[20px] font-medium text-report-ink',
  select: 'mt-4 min-h-[44px] w-full rounded-xl',
  selectText: 'text-base font-bold text-report-ink',
  refine: 'mt-3 text-center text-xs font-normal text-report-soft',
  /** MF-46 follow-up (P35-D18 a, dated 2026-11-12): the "Report incorrect address match" link under SELECT. */
  report: 'mt-2 min-h-[44px] self-center',
  reportText: 'text-xs font-semibold text-report-ink underline',
  miss: 'mt-10 items-center',
  missText: 'mt-2 text-center text-base font-normal text-report-muted',
  prompt: 'mt-10 text-center text-base font-normal text-report-soft',
} as const;

/** Icon sizes in px (lucide `size`), the legacy values (Spec 117 §6.1). */
export const PARCEL_SEARCH_ICON = { field: 18, notice: 14, miss: 20, button: 16, row: 18, msg: 18 } as const;

/** The scroll content's bottom padding: the S-004 shelf plus the legacy 24 (the sum stays out of the binding: FE-05). */
export const SEARCH_BOTTOM_PADDING = PARCEL_SHELF_HEIGHT + 24;
