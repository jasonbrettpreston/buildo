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
      // Must be 10 or 11 digits (with country code)
      if (digits.length < 10 || digits.length > 11) continue;
      const areaCode = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
      if (PHONE_AREA_CODES.includes(areaCode)) {
        // Normalize to (XXX) XXX-XXXX
        const d = digits.length === 11 ? digits.slice(1) : digits;
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
 * Extract city from a WSIB mailing address like "123 Main St, Toronto, ON, M5V 1A1"
 */
export function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim());
  // WSIB format: street, city, province, postal
  if (parts.length >= 3) return parts[1];
  return null;
}

export function buildSearchQuery(builder: BuilderSearchInput): string {
  // Prefer trade name (public-facing brand), fall back to legal/builder name
  const name = builder.trade_name || builder.legal_name || builder.name;
  const city = extractCity(builder.mailing_address) || 'Toronto';
  return `"${name}" "${city}" contractor`;
}
