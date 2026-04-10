// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.4 + §4.5
//
// Pure presentation helpers for the Phase 3-iii composite cards. Co-located
// with the cards in `src/features/leads/lib/` so the data layer doesn't
// import them. All functions are total — they accept the nullable types
// from `LeadFeedItem` and return either a string or `null` (the card
// branches on null to omit the corresponding row entirely, never renders
// an empty box).
//
// Each helper has a tight unit test in `src/tests/format.logic.test.ts`.
// Independent review of Phase 3-iii caught that source data (CKAN, WSIB)
// can be dirty: phone numbers with letters, websites with `javascript:`
// schemes, names with non-ASCII characters. The sanitize* helpers below
// are the security boundary between that source data and the DOM.

/**
 * Formats a meter distance for the card distance line. Returns "850m"
 * under 1km, "1.2km" otherwise. Negative or non-finite input falls back
 * to null so the card omits the line — better than rendering "NaNm".
 */
export function formatDistance(m: number | null | undefined): string | null {
  if (m === null || m === undefined || !Number.isFinite(m) || m < 0) {
    return null;
  }
  if (m < 1000) {
    return `${Math.round(m)}m`;
  }
  return `${(m / 1000).toFixed(1)}km`;
}

/**
 * Composes a permit address from the two raw permits.street_* columns.
 * Both null → null (caller falls back to permit_type or omits the line).
 * One null → return the non-null one alone (better than nothing).
 */
export function formatAddress(
  streetNum: string | null,
  streetName: string | null,
): string | null {
  const num = streetNum?.trim() || null;
  const name = streetName?.trim() || null;
  if (!num && !name) return null;
  if (!num) return name;
  if (!name) return num;
  return `${num} ${name}`;
}

/**
 * Formats a project cost for the card cost row. Prefers the precise
 * `estimated_cost` (from cost_estimates.estimated_cost::float8) when
 * present; falls back to a humanized `cost_tier` label when only the
 * tier is known; returns null when both are absent so the card omits
 * the entire cost row.
 *
 * Examples:
 *   formatCostDisplay(750000, 'large')  → "$750K"
 *   formatCostDisplay(2_500_000, 'mega') → "$2.5M"
 *   formatCostDisplay(null, 'medium')   → "Medium project"
 *   formatCostDisplay(null, null)       → null
 */
export function formatCostDisplay(
  estimatedCost: number | null,
  tier: 'small' | 'medium' | 'large' | 'major' | 'mega' | null,
): string | null {
  if (
    estimatedCost !== null &&
    Number.isFinite(estimatedCost) &&
    estimatedCost > 0
  ) {
    if (estimatedCost >= 1_000_000) {
      return `$${(estimatedCost / 1_000_000).toFixed(1)}M`;
    }
    if (estimatedCost >= 1_000) {
      // Phase 3-holistic WF3 Phase F (2026-04-09, Independent reviewer
      // Phase 0-3 I1): use Math.floor, not Math.round. Math.round on
      // 999_500 → 1000 → "$1000K", which is incoherent at the $1M
      // boundary. Math.floor on the same value → 999 → "$999K".
      return `$${Math.floor(estimatedCost / 1_000)}K`;
    }
    return `$${Math.floor(estimatedCost)}`;
  }
  if (tier === null) return null;
  const labels: Record<typeof tier & string, string> = {
    small: 'Small project',
    medium: 'Medium project',
    large: 'Large project',
    major: 'Major project',
    mega: 'Mega project',
  };
  return labels[tier];
}

/**
 * Builds the avatar fallback initials from a builder's legal_name. Takes
 * the first letter of the first two words, uppercased. Single-word names
 * yield a single letter. Empty / whitespace-only / null → "?" so the
 * Avatar fallback always has SOMETHING to render. Unicode-safe (uses
 * the spread iterator, NOT charAt, so multi-byte first letters survive).
 *
 *   "ACME CONSTRUCTION"  → "AC"
 *   "Plumbing Plus"      → "PP"
 *   "Müller Builders"    → "MB"
 *   "Plumbing"           → "P"
 *   ""                   → "?"
 *   null                 → "?"
 */
export function formatBuilderInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  const first = words[0];
  const second = words[1];
  // Use the iterator to take the first code point of each word — handles
  // surrogate pairs and combining characters better than charAt(0).
  const firstChar = first ? [...first][0] ?? '' : '';
  const secondChar = second ? [...second][0] ?? '' : '';
  const initials = `${firstChar}${secondChar}`.toUpperCase();
  return initials || '?';
}

/**
 * Sanitizes a website URL for use in a card's outbound link. Returns
 * the validated URL string if it parses as http(s), null otherwise.
 * Rejects `javascript:`, `data:`, `file:`, bare `//`, mailto, etc.
 * Uses the WHATWG URL constructor (NOT a regex) — the parser is the
 * authoritative validator and handles all the weird cases (Unicode
 * domains, port-only urls, IPv6 brackets, percent-encoding).
 *
 * Caught by Phase 3-iii self-checklist item 13 + DeepSeek "source data
 * is dirty" review echo.
 */
export function sanitizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Use URL.canParse (Node 19.9+, all modern browsers) instead of a
  // try/catch around `new URL()`. Avoids the silent-catch-fallback
  // ast-grep rule by not having a catch at all — the validator's
  // contract is "return the URL if it parses, null otherwise" and
  // canParse expresses that directly without swallowing exceptions.
  if (!URL.canParse(trimmed)) return null;
  const u = new URL(trimmed);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.toString();
}

/**
 * Sanitizes a phone number into a digit-only `tel:` href payload. Strips
 * everything except digits and a leading `+`, clamps to E.164 max (15
 * digits per ITU-T E.164), and rejects results outside the 10-15 digit
 * window. Source data is messy: WSIB enrichment leaves things like
 * "(416) 555-1234 ext 7" or "Call: 555-CALL-NOW".
 *
 * Per spec 75 §9 security checklist: malformed phone numbers must
 * disable the Call button rather than render a bogus tel: URL —
 * 10-digit floor catches truncation, 15-digit ceiling catches
 * concatenated/corrupted source data. Caught by independent reviewer
 * 2026-04-09.
 *
 *   sanitizeTelHref('(416) 555-1234')      → '4165551234'
 *   sanitizeTelHref('+1 416 555-1234 x99') → '+1416555123499' (14 digits, valid)
 *   sanitizeTelHref('555-1234')            → null  (only 7 digits)
 *   sanitizeTelHref('1234567890123456789') → '123456789012345' (clamped to 15)
 *   sanitizeTelHref('CALL US')             → null
 *   sanitizeTelHref('')                    → null
 *   sanitizeTelHref(null)                  → null
 */
export function sanitizeTelHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip extensions BEFORE the digit pass — without this, an input
  // like "(416) 555-1234 ext 99" becomes "416555123499", a 12-digit
  // junk number that some carriers will actually try to dial. The
  // tel: URI scheme has no portable extension syntax, so extensions
  // are dropped entirely. Caught by Gemini 2026-04-09 review.
  // Match common markers (x, ext, ext., #, comma) case-insensitively.
  const withoutExtension = raw.split(/x|ext\.?|#|,/i)[0] ?? '';
  const leadingPlus = withoutExtension.trim().startsWith('+');
  const digits = withoutExtension.replace(/\D/g, '').slice(0, 15);
  if (digits.length < 10) return null;
  return leadingPlus ? `+${digits}` : digits;
}
