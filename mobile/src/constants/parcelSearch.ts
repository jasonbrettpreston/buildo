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

/**
 * `config.debounce_ms` — how long typing pauses before a query fires.
 * Ground truth: the pre-existing literal in this screen (Spec 100 fold #5) — exploratory typing
 * must not burn the 60/min bucket. This constant REPLACES that literal; there is no other copy.
 */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * `config.min_query_len` — the shortest query that may reach the server.
 * Ground truth: `src/app/api/parcels/lookup/types.ts` — `q: z.string().trim().min(3)`. The server
 * 400s below this, so the client gate is a courtesy that must not drift ABOVE the server's floor.
 */
export const SEARCH_MIN_QUERY_LEN = 3;

/**
 * The candidate cap. Ground truth: `src/lib/admin/parcel-lookup.ts` slices the exact-match branch
 * to 10 and the typeahead query is `LIMIT 10`; Spec 100 §2 item 6 states "`candidates` (<=10)".
 * Beyond this the operator's 2026-09-16 ruling says: ask for a house number, do not list.
 */
export const SEARCH_CANDIDATE_LIMIT = 10;

/**
 * MF-35 (P35-D16 a): how many recent searches the search page keeps and shows as chips. Ground truth: the legacy page showed three suggestion
 * chips, and the ruling keeps that count ("max 3"). Read by mobile/src/store/recentSearchesStore.ts.
 */
export const SEARCH_RECENT_MAX = 3;

// The SEARCH archetype's third declared parameter, `guards.rate_bucket`, is deliberately NOT
// mirrored here. It is `parcels-search:{uid}`, 60/min, 60s window
// (`src/app/api/parcels/lookup/route.ts`), it is enforced entirely server-side, and the client
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
  screen: 'flex-1 bg-[#0e0e10]',
  scroll: 'flex-1',
  column: 'w-full px-4',
  header: 'items-center pt-10 pb-6',
  wordmark: 'text-2xl font-bold tracking-tight text-zinc-100',
  wordmarkAccent: 'text-2xl font-bold tracking-tight text-[#f59e0b]',
  tagline: 'mt-1 font-mono text-[11px] font-normal uppercase tracking-widest text-zinc-400',
  pill: 'flex-row items-center gap-1 rounded-full border border-[#2e2e33] bg-[#18181b] py-1 pl-4 pr-1',
  input:
    'flex-1 min-h-[44px] rounded-none border-0 bg-transparent dark:bg-transparent px-2 py-3 text-base font-normal text-zinc-100 shadow-none placeholder:text-[#52525b]',
  account: 'min-h-[44px] min-w-[44px] rounded-full bg-primary dark:bg-primary',
  /** MF-58: the legal line under the address input (ruling 2026-11-10 items 16 and 5); 13/18 muted as the small-pages draft, zinc-400 for contrast. */
  legal: 'mt-3 text-[13px] leading-[18px] font-normal text-zinc-400',
  chipRow: 'mt-3 flex-row flex-wrap gap-2',
  chip:
    'min-h-[44px] rounded-full px-3 bg-[#161618] dark:bg-[#161618] border-[#353437] dark:border-[#353437] active:bg-[#27272a] dark:active:bg-[#27272a]',
  chipText: 'font-mono text-xs font-normal text-zinc-400',
  notice: 'mt-3 rounded-xl bg-[#161618] border-[#2a2a2c]',
  noticeText: 'text-xs font-normal text-red-400',
  /** The notice icon colours: red-400 is the legacy inline #f87171; the entitlement lock is the primary amber. */
  noticeIcon: 'text-red-400',
  entitlementIcon: 'text-[#f59e0b]',
  noticeTextNeutral: 'text-xs font-normal text-zinc-300',
  retry: 'mt-2 min-h-[44px] rounded-xl',
  retryText: 'text-xs font-semibold text-[#472a00]',
  listHeader: 'mt-4 flex-row items-center justify-between',
  rail: 'font-mono text-[11px] font-normal uppercase tracking-widest text-zinc-400',
  badge: 'font-mono text-[11px] font-normal uppercase tracking-widest text-[#f59e0b]',
  card:
    'mt-2 h-auto sm:h-auto min-h-[44px] w-full flex-col items-start justify-start rounded-xl px-3 py-3 bg-[#18181b] dark:bg-[#18181b] border-[#2a2a2c] dark:border-[#2a2a2c] active:bg-[#27272a] dark:active:bg-[#27272a]',
  cardChecked:
    'mt-2 h-auto sm:h-auto min-h-[44px] w-full flex-col items-start justify-start rounded-xl px-3 py-3 bg-[#18181b] dark:bg-[#18181b] border-primary dark:border-primary active:bg-[#27272a] dark:active:bg-[#27272a]',
  cardRow: 'w-full flex-row items-center justify-between gap-2',
  cardText: 'flex-1 text-base font-normal text-zinc-100',
  segment: 'text-base font-normal text-zinc-100',
  segmentDiffers: 'text-base font-semibold text-[#f59e0b]',
  select: 'mt-4 min-h-[44px] w-full rounded-xl',
  selectText: 'text-sm font-semibold uppercase tracking-widest text-[#472a00]',
  refine: 'mt-3 text-center text-xs font-normal text-zinc-400',
  miss: 'mt-10 items-center',
  missText: 'mt-2 text-center text-base font-normal text-zinc-400',
  prompt: 'mt-10 text-center text-base font-normal text-zinc-600',
} as const;

/** Icon sizes in px (lucide `size`), the legacy values (Spec 117 §6.1). */
export const PARCEL_SEARCH_ICON = { field: 18, notice: 14, miss: 20, button: 16 } as const;

/** The scroll content's bottom padding: the S-004 shelf plus the legacy 24 (the sum stays out of the binding: FE-05). */
export const SEARCH_BOTTOM_PADDING = PARCEL_SHELF_HEIGHT + 24;
