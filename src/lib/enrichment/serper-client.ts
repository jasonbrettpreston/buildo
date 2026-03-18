/**
 * Shared Serper web search API client.
 * Used by both the Next.js admin enrichment route and the pipeline batch script.
 */

import { logError } from '@/lib/logger';

const SERPER_URL = 'https://google.serper.dev/search';

export interface SerperSearchOptions {
  gl?: string;
  num?: number;
}

/**
 * Search Google via Serper API. Returns structured search results.
 * Throws on HTTP errors so callers can handle retries.
 */
export async function searchSerper(
  query: string,
  options: SerperSearchOptions = {}
): Promise<Record<string, unknown>> {
  const apiKey = process.env.SERPER_API_KEY || '';
  if (!apiKey) {
    throw new Error('SERPER_API_KEY is not set');
  }

  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      gl: options.gl ?? 'ca',
      num: options.num ?? 10,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Serper API ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Fetch a website's HTML for contact scraping. Returns null on failure.
 * 5-second timeout to prevent hanging on slow sites.
 */
export async function fetchWebsiteHtml(url: string): Promise<string | null> {
  try {
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const res = await fetch(normalizedUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Buildo/1.0)' },
    });

    if (!res.ok) return null;
    return res.text();
  } catch (err) {
    logError('[serper-client]', err as Error, { event: 'website_fetch_failed', url });
    return null;
  }
}

const CONTACT_PATHS = ['/contact', '/contact-us', '/about/contact'];

/**
 * Fetch common /contact page paths from a website.
 * Returns the first successful HTML response, or null if none found.
 * Used as a fallback when the homepage has no email addresses.
 */
export async function fetchContactPageHtml(baseUrl: string): Promise<string | null> {
  let normalizedBase = baseUrl;
  if (!normalizedBase.startsWith('http')) {
    normalizedBase = `https://${normalizedBase}`;
  }
  // Strip trailing slash for clean path joining
  normalizedBase = normalizedBase.replace(/\/+$/, '');

  for (const path of CONTACT_PATHS) {
    try {
      const res = await fetch(`${normalizedBase}${path}`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Buildo/1.0)' },
      });
      if (res.ok) return res.text();
    } catch {
      continue;
    }
  }
  return null;
}
