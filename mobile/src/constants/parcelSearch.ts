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
