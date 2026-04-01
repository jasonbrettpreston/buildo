/**
 * Pure functions for extracting contact information from Serper web search results.
 * No side effects — all functions take data in, return structured contacts out.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  rating?: number;
  ratingCount?: number;
}

export interface SerperResponse {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: {
    title?: string;
    phone?: string;
    website?: string;
    address?: string;
    [key: string]: unknown;
  };
}

export interface ExtractedContacts {
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  houzz: string | null;
}

// ---------------------------------------------------------------------------
// Phone extraction
// ---------------------------------------------------------------------------

// North American phone: (416) 487-0359, 416-487-0359, 416.487.0359, +1-416-487-0359
const PHONE_PATTERN =
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Reject patterns that look like dates, zip codes, or IDs
const PHONE_REJECT = /^\d{3}[-.]?\d{2}[-.]?\d{4}$/; // too few digits pattern
const PHONE_AREA_CODES = [
  '416', '647', '437', // Toronto
  '905', '289', '365', // GTA
  '519', '226', '548', // SW Ontario
  '613', '343', '683', // Eastern Ontario
  '705', '249',        // Northern Ontario
  '807',               // NW Ontario
  '519', '226',        // Kitchener/Waterloo
];

export function extractPhoneNumbers(snippets: string[]): string[] {
  const phones: string[] = [];
  for (const text of snippets) {
    const matches = text.match(PHONE_PATTERN) || [];
    for (const m of matches) {
      const digits = m.replace(/\D/g, '');
      // Take only the core 10-11 digits — trailing noise (extensions, unit numbers)
      // can inflate the digit count and cause valid numbers to be discarded.
      const coreDigits = digits.length >= 11 && digits.startsWith('1')
        ? digits.slice(0, 11)
        : digits.slice(0, 10);
      if (coreDigits.length < 10) continue;
      const areaCode = coreDigits.length === 11 ? coreDigits.slice(1, 4) : coreDigits.slice(0, 3);
      if (PHONE_AREA_CODES.includes(areaCode)) {
        // Normalize to (XXX) XXX-XXXX
        const d = coreDigits.length === 11 ? coreDigits.slice(1) : coreDigits;
        const formatted = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
        if (!phones.includes(formatted)) phones.push(formatted);
      }
    }
  }
  return phones;
}

// ---------------------------------------------------------------------------
// Email extraction
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Reject common non-contact emails
const EMAIL_REJECT = [
  'noreply@', 'no-reply@', 'donotreply@',
  'example.com', 'test.com', 'email.com',
  'sentry.io', 'wixpress.com',
];

export function extractEmails(snippets: string[]): string[] {
  const emails: string[] = [];
  for (const text of snippets) {
    const matches = text.match(EMAIL_PATTERN) || [];
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
      if (!emails.includes(lower)) emails.push(lower);
    }
  }
  return emails;
}

// ---------------------------------------------------------------------------
// HTML noise stripping (prevent catastrophic backtracking on minified JS/SVG)
// ---------------------------------------------------------------------------

/**
 * Strip script/style/svg tags and remaining HTML to prevent catastrophic
 * regex backtracking on minified JS and false-positive phones from SVG paths.
 */
export function stripHtmlNoise(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

// ---------------------------------------------------------------------------
// HTML email extraction (scrape builder website)
// ---------------------------------------------------------------------------

const MAILTO_PATTERN = /href=["']mailto:([^"'?#]+)/gi;

export function extractEmailsFromHtml(html: string): string[] {
  const emails: string[] = [];

  // Extract from mailto: links — use .match() to pull only the valid email
  // portion, discarding query params (?subject=) that the regex boundary might miss.
  const mailtoMatches = html.matchAll(MAILTO_PATTERN);
  for (const m of mailtoMatches) {
    const lower = m[1].toLowerCase();
    if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
    EMAIL_PATTERN.lastIndex = 0;
    const emailMatch = lower.match(EMAIL_PATTERN);
    if (emailMatch && emailMatch.length > 0) {
      const cleanEmail = emailMatch[0];
      if (!emails.includes(cleanEmail)) emails.push(cleanEmail);
    }
  }
  EMAIL_PATTERN.lastIndex = 0;

  // Also scan visible text for email patterns
  const textMatches = html.match(EMAIL_PATTERN) || [];
  for (const m of textMatches) {
    const lower = m.toLowerCase();
    if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
    if (!emails.includes(lower)) emails.push(lower);
  }

  return emails;
}

// ---------------------------------------------------------------------------
// Website extraction
// ---------------------------------------------------------------------------

// Directories and social sites to skip when looking for the builder's own website
const DIRECTORY_DOMAINS = [
  'instagram.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com',
  'houzz.com', 'yellowpages.ca', 'yellowpages.com', 'yelp.com', 'yelp.ca',
  'indeed.com', 'indeed.ca', 'glassdoor.com', 'glassdoor.ca',
  'mapquest.com', 'google.com', 'google.ca',
  'zoominfo.com', 'datanyze.com', 'dnb.com',
  'bidsandtenders.ca', 'merx.com',
  'wsib.ca', 'wsib.on.ca',
  'canada411.ca', 'canada.com',
  'trustpilot.com', 'bbb.org',
  'cylex.ca', 'cybo.com', 'kompass.com',
  'wikipedia.org', 'reddit.com',
  'homestars.com', 'homeadvisor.com', 'thumbtack.com', 'angi.com',
  'ontario.ca', 'canada.ca', 'gov.on.ca',
  'pagesjaunes.ca', 'nextdoor.com', 'bark.com',
];

export function extractWebsite(results: SerperOrganicResult[]): string | null {
  for (const r of results) {
    try {
      const url = new URL(r.link);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (DIRECTORY_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) continue;
      // Return the root domain (not the deep link)
      return `https://${url.hostname}`;
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Social link extraction
// ---------------------------------------------------------------------------

interface SocialLinks {
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  houzz: string | null;
}

const SOCIAL_DOMAINS: Record<keyof SocialLinks, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com', 'ca.linkedin.com'],
  houzz: ['houzz.com'],
};

export function extractSocialLinks(results: SerperOrganicResult[]): SocialLinks {
  const links: SocialLinks = { instagram: null, facebook: null, linkedin: null, houzz: null };

  for (const r of results) {
    try {
      const host = new URL(r.link).hostname.replace(/^www\./, '').toLowerCase();
      for (const [key, domains] of Object.entries(SOCIAL_DOMAINS)) {
        if (links[key as keyof SocialLinks]) continue; // already found
        if (domains.some((d) => host === d || host.endsWith('.' + d))) {
          links[key as keyof SocialLinks] = r.link;
        }
      }
    } catch {
      continue;
    }
  }

  return links;
}

// ---------------------------------------------------------------------------
// Full extraction from Serper response
// ---------------------------------------------------------------------------

export function extractContacts(response: SerperResponse): ExtractedContacts {
  const results = response.organic || [];
  const snippets = results.map((r) => r.snippet || '');

  // Knowledge graph may have direct phone/website
  if (response.knowledgeGraph?.phone) {
    snippets.unshift(response.knowledgeGraph.phone);
  }

  const phones = extractPhoneNumbers(snippets);
  const emails = extractEmails(snippets);
  const website = extractWebsite(results);
  const social = extractSocialLinks(results);

  return {
    phone: phones[0] || null,
    email: emails[0] || null,
    website: response.knowledgeGraph?.website || website,
    ...social,
  };
}

// ---------------------------------------------------------------------------
// Search query construction
// ---------------------------------------------------------------------------

export interface BuilderSearchInput {
  name: string;
  trade_name?: string | null;
  legal_name?: string | null;
  mailing_address?: string | null;
}

/**
 * Extract city from a WSIB mailing address like "123 Main St, Toronto, ON, M5V 1A1".
 * Validates the candidate city is not a PO Box, Suite, unit number, or postal code.
 */
export function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim());
  // WSIB format: street, city, province, postal — but sometimes malformed
  if (parts.length < 3) return null;

  // Patterns that are NOT a city name
  const NON_CITY = /^(PO\s+Box|P\.?O\.?\s*Box|Suite|Ste\.?|Unit|Apt\.?|#|\d{1,5}\s|RR\s?\d)/i;
  const POSTAL_CODE = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;

  // Try parts[1] first (standard position), then parts[2] as fallback
  for (let i = 1; i < Math.min(parts.length, 4); i++) {
    const candidate = parts[i];
    if (!candidate) continue;
    if (NON_CITY.test(candidate)) continue;
    if (POSTAL_CODE.test(candidate)) continue;
    // Reject if it looks like a province abbreviation only
    if (/^(ON|AB|BC|SK|MB|QC|NB|NS|PE|NL|NT|YT|NU)$/i.test(candidate)) continue;
    return candidate;
  }
  return null;
}

export function buildSearchQuery(builder: BuilderSearchInput): string {
  // Prefer trade name (public-facing brand), fall back to legal/builder name
  const name = builder.trade_name || builder.legal_name || builder.name;
  const city = extractCity(builder.mailing_address) || 'Toronto';
  return `"${name}" "${city}" contractor`;
}

// ---------------------------------------------------------------------------
// Pre-flight skip filters — prevent wasting Serper credits on unenrichable entities
// ---------------------------------------------------------------------------

export interface SkipCandidate {
  name: string;
  trade_name?: string | null;
  has_wsib_match?: boolean;
}

export interface SkipResult {
  skip: boolean;
  reason: 'numbered_corp' | 'individual' | 'generic_trade_name' | null;
}

const NUMBERED_CORP_PATTERN = /^\d{5,}/;

const BUSINESS_KEYWORDS =
  /\b(homes?|builders?|construct|develop|design|group|project|reno|plumb|electric|hvac|roof|mason|concrete|contract|pav|excavat|landscape|paint|floor|insul|demol|glass|steel|iron|fenc|deck|drain|fire|solar|elevator|sid|waterproof|cabinet|mill|tile|stone|pool|caulk|trim|property|properties|invest|capital|holding|enterpr|restoration|maintenance|service|tech|solution|supply|architec|engineer|consult|manage|venture|tower|condo|real|custom|infra|mechanic|scaffold|crane|window|door|lumber|wood|metal|weld|pil|excavat|grad|asphalt|survey|environment|energy|systems|basement|estate|living|residence|habitat|urban|metro|civic|municipal|structural|foundation|framing|forming|drywall|glazing|insulation|masonry|siding|eavestrough|millwork|cabinetry|tiling|flooring|roofing|plumbing|electrical|painting|fencing|decking|demolition|drilling|boring|remediat|abatement|hoist|rigging|welding|paving|grading)/i;

const GENERIC_TRADE_NAMES = new Set([
  'CONTRACTING',
  'GENERAL CONTRACTING',
  'CONSTRUCTION',
  'DESIGN CO',
  'HOLDINGS CO',
  'CUSTOM HOME',
  'CUSTOM HOME LTD',
  'HOLDINGS',
  'BUILDING',
  'RENOVATIONS',
  'GENERAL CONTRACTOR',
  'DRYWALL',
  'PAINTING',
  'FLOORING',
  'ROOFING',
  'PLUMBING',
  'ELECTRICAL',
]);

/**
 * Determine if an entity should be skipped before calling Serper.
 * Returns { skip: true, reason } or { skip: false, reason: null }.
 */
export function shouldSkipEntity(candidate: SkipCandidate): SkipResult {
  const name = (candidate.name || '').trim();

  // 1. Numbered corporations (e.g., "1000287552 ONTARIO INC")
  if (NUMBERED_CORP_PATTERN.test(name)) {
    return { skip: true, reason: 'numbered_corp' };
  }

  // 2. Generic WSIB trade names — if trade_name is what we'd search with
  let hasValidTradeName = false;
  if (candidate.trade_name) {
    const normalized = candidate.trade_name.trim().toUpperCase()
      .replace(/[.,;'"]/g, '').replace(/\s+/g, ' ');
    if (normalized.length < 4 || GENERIC_TRADE_NAMES.has(normalized)) {
      return { skip: true, reason: 'generic_trade_name' };
    }
    hasValidTradeName = true;
  }

  // 3. Likely individuals — 2-3 word names without business keywords, no WSIB
  //    Skip this check if entity has a valid trade name (search will use that instead)
  if (!candidate.has_wsib_match && !hasValidTradeName) {
    const words = name.split(/\s+/);
    if (words.length >= 2 && words.length <= 3 && !BUSINESS_KEYWORDS.test(name)) {
      return { skip: true, reason: 'individual' };
    }
  }

  return { skip: false, reason: null };
}
