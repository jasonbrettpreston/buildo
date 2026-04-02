#!/usr/bin/env node
/**
 * Enrich WSIB registry entries directly with contact data via Serper web search.
 *
 * Targets wsib_registry table (not entities). Contacts flow to entities
 * via link-wsib.js COALESCE copy on match.
 *
 * Prioritizes: Large Business > Medium Business > Small Business.
 * Requires trade_name for search quality. Applies shouldSkipEntity() filters.
 *
 * Requires SERPER_API_KEY environment variable (serper.dev).
 *
 * Usage:
 *   node scripts/enrich-wsib.js [--limit N] [--dry-run]
 *
 * Environment:
 *   SERPER_API_KEY   — API key from serper.dev (required)
 *   ENRICH_LIMIT     — Max entries to process (default 50, overridden by --limit)
 *   PIPELINE_CHAIN   — Set by run-chain.js when running as part of a chain
 *
 * SPEC LINK: docs/specs/pipeline/46_wsib_enrichment.md
 */
const pipeline = require('./lib/pipeline');

const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
const SERPER_URL = 'https://google.serper.dev/search';
const SLUG = 'enrich_wsib_registry';
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;
const RATE_LIMIT_MS = parseInt(process.env.ENRICH_RATE_MS || '500', 10);

// ---------------------------------------------------------------------------
// Contact extraction (shared with enrich-web-search.js)
// ---------------------------------------------------------------------------

const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const PHONE_AREA_CODES = [
  '416', '647', '437', '905', '289', '365',
  '519', '226', '548', '613', '343', '683',
  '705', '249', '807',
];

function extractPhones(snippets) {
  const phones = [];
  for (const text of snippets) {
    const matches = text.match(PHONE_PATTERN) || [];
    for (const m of matches) {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) continue;
      const ac = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
      if (PHONE_AREA_CODES.includes(ac)) {
        const d = digits.length === 11 ? digits.slice(1) : digits;
        const fmt = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
        if (!phones.includes(fmt)) phones.push(fmt);
      }
    }
  }
  return phones;
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_REJECT = ['noreply@', 'no-reply@', 'donotreply@', 'example.com', 'test.com', 'email.com', 'sentry.io', 'wixpress.com'];

function extractEmails(snippets) {
  const emails = [];
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

const MAILTO_PATTERN = /href="mailto:([^"?]+)/gi;

function stripHtmlNoise(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function extractEmailsFromHtml(html) {
  const emails = [];
  const mailtoMatches = html.matchAll(MAILTO_PATTERN);
  for (const m of mailtoMatches) {
    const lower = m[1].toLowerCase();
    if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
    EMAIL_PATTERN.lastIndex = 0;
    if (EMAIL_PATTERN.test(lower)) {
      if (!emails.includes(lower)) emails.push(lower);
    }
  }
  EMAIL_PATTERN.lastIndex = 0;
  const textMatches = html.match(EMAIL_PATTERN) || [];
  for (const m of textMatches) {
    const lower = m.toLowerCase();
    if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
    if (!emails.includes(lower)) emails.push(lower);
  }
  return emails;
}

const DIRECTORY_DOMAINS = [
  'instagram.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com',
  'houzz.com', 'yellowpages.ca', 'yellowpages.com', 'yelp.com', 'yelp.ca',
  'indeed.com', 'indeed.ca', 'glassdoor.com', 'glassdoor.ca',
  'mapquest.com', 'google.com', 'google.ca',
  'zoominfo.com', 'datanyze.com', 'dnb.com',
  'bidsandtenders.ca', 'merx.com', 'wsib.ca', 'wsib.on.ca',
  'canada411.ca', 'canada.com', 'trustpilot.com', 'bbb.org',
  'cylex.ca', 'cybo.com', 'kompass.com', 'wikipedia.org', 'reddit.com',
  'homestars.com', 'homeadvisor.com', 'thumbtack.com', 'angi.com',
  'ontario.ca', 'canada.ca', 'gov.on.ca',
  'pagesjaunes.ca', 'nextdoor.com', 'bark.com',
];

function extractWebsite(results) {
  for (const r of results) {
    try {
      const url = new URL(r.link);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (DIRECTORY_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) continue;
      return `https://${url.hostname}`;
    } catch { continue; }
  }
  return null;
}

function extractContacts(response) {
  const results = response.organic || [];
  const snippets = results.map((r) => r.snippet || '');
  if (response.knowledgeGraph?.phone) snippets.unshift(response.knowledgeGraph.phone);

  const phones = extractPhones(snippets);
  const emails = extractEmails(snippets);
  const website = extractWebsite(results);

  return {
    phone: phones[0] || null,
    email: emails[0] || null,
    website: response.knowledgeGraph?.website || website,
  };
}

// ---------------------------------------------------------------------------
// Search query construction
// ---------------------------------------------------------------------------

function extractCity(address) {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length < 3) return null;

  const NON_CITY = /^(PO\s+Box|P\.?O\.?\s*Box|Suite|Ste\.?|Unit|Apt\.?|#|\d{1,5}\s|RR\s?\d)/i;
  const POSTAL_CODE = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
  const PROVINCE = /^(ON|AB|BC|SK|MB|QC|NB|NS|PE|NL|NT|YT|NU)$/i;

  for (let i = 1; i < Math.min(parts.length, 4); i++) {
    const candidate = parts[i];
    if (!candidate) continue;
    if (NON_CITY.test(candidate)) continue;
    if (POSTAL_CODE.test(candidate)) continue;
    if (PROVINCE.test(candidate)) continue;
    return candidate;
  }
  return null;
}

function buildSearchQuery(entry) {
  const name = entry.trade_name || entry.legal_name;
  const city = extractCity(entry.mailing_address) || 'Ontario';
  return `"${name}" "${city}" contractor`;
}

// ---------------------------------------------------------------------------
// Pre-flight skip filters (mirrors src/lib/builders/extract-contacts.ts)
// ---------------------------------------------------------------------------

const GENERIC_TRADE_NAMES = new Set([
  'CONTRACTING', 'GENERAL CONTRACTING', 'CONSTRUCTION', 'DESIGN CO',
  'HOLDINGS CO', 'CUSTOM HOME', 'CUSTOM HOME LTD', 'HOLDINGS',
  'BUILDING', 'RENOVATIONS', 'GENERAL CONTRACTOR', 'DRYWALL',
  'PAINTING', 'FLOORING', 'ROOFING', 'PLUMBING', 'ELECTRICAL',
]);

function shouldSkipWsibEntry(entry) {
  // Skip entries without a usable search name
  const searchName = (entry.trade_name || entry.legal_name || '').trim();
  if (!searchName || searchName.length < 4) {
    return { skip: true, reason: 'no_search_name' };
  }

  // Skip generic trade names
  const normalized = searchName.toUpperCase().replace(/[.,;'"]/g, '').replace(/\s+/g, ' ');
  if (GENERIC_TRADE_NAMES.has(normalized)) {
    return { skip: true, reason: 'generic_trade_name' };
  }

  return { skip: false, reason: null };
}

// ---------------------------------------------------------------------------
// Serper API
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchSerper(query) {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, gl: 'ca', num: 10 }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Serper API ${res.status}: ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

pipeline.run('enrich-wsib', async (pool) => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1]
    ? parseInt(args[limitIdx + 1], 10)
    : parseInt(process.env.ENRICH_LIMIT || '50', 10);

  if (!SERPER_API_KEY) {
    pipeline.log.info('[enrich-wsib]', 'SERPER_API_KEY not set — skipping WSIB enrichment');
    return;
  }

  pipeline.log.info('[enrich-wsib]', '=== WSIB Registry Direct Enrichment ===');
  if (dryRun) pipeline.log.info('[enrich-wsib]', 'DRY RUN — no database writes');
  pipeline.log.info('[enrich-wsib]', `Limit: ${limit} | Rate: ${RATE_LIMIT_MS}ms`);

  const startMs = Date.now();
  let runId = null;

  if (!CHAIN_ID) {
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running') RETURNING id`,
        [SLUG]
      );
      runId = res.rows[0].id;
    } catch (err) {
      pipeline.log.warn('[enrich-wsib]', `Could not insert pipeline_runs row: ${err.message}`);
    }
  }

  // Queue: unenriched WSIB entries, prioritized by business size.
  // Uses streamQuery to avoid materializing the full result set upfront (B4).
  // Pre-count for progress logging since streamQuery doesn't know total rows.
  const countResult = await pool.query(`
    SELECT COUNT(*) AS cnt FROM wsib_registry
    WHERE last_enriched_at IS NULL
      AND (trade_name IS NOT NULL OR legal_name IS NOT NULL)
  `);
  const totalEntries = Math.min(parseInt(countResult.rows[0].cnt, 10), limit);

  pipeline.log.info('[enrich-wsib]', `Found ${totalEntries} unenriched WSIB entries`);
  if (totalEntries === 0) {
    pipeline.log.info('[enrich-wsib]', 'Nothing to enrich.');
    await finalize(pool, runId, startMs, 0, 0, 0, { processed: 0, matched: 0, failed: 0, skipped: {} });
    return;
  }

  let enriched = 0;
  let contactsFound = 0;
  let failed = 0;
  const fieldCounts = { phone: 0, email: 0, website: 0 };
  let websitesScraped = 0;
  const skipped = { no_search_name: 0, generic_trade_name: 0 };
  const sizeBreakdown = { large: 0, medium: 0, small: 0 };
  let i = 0;

  for await (const entry of pipeline.streamQuery(pool, `
    SELECT
      id,
      legal_name,
      trade_name,
      mailing_address,
      business_size,
      primary_phone,
      primary_email,
      website
    FROM wsib_registry
    WHERE last_enriched_at IS NULL
      AND (trade_name IS NOT NULL OR legal_name IS NOT NULL)
    ORDER BY
      CASE business_size
        WHEN 'Large Business' THEN 0
        WHEN 'Medium Business' THEN 1
        WHEN 'Small Business' THEN 2
        ELSE 3
      END,
      trade_name IS NOT NULL DESC,
      legal_name
    LIMIT $1
  `, [limit])) {
    i++;

    // Track size breakdown as we stream
    if (entry.business_size === 'Large Business') sizeBreakdown.large++;
    else if (entry.business_size === 'Medium Business') sizeBreakdown.medium++;
    else if (entry.business_size === 'Small Business') sizeBreakdown.small++;

    // Pre-flight filter
    const skipResult = shouldSkipWsibEntry(entry);
    if (skipResult.skip) {
      skipped[skipResult.reason]++;
      pipeline.log.info('[enrich-wsib]', `  [${i + 1}/${totalEntries}] SKIP (${skipResult.reason}): ${entry.trade_name || entry.legal_name}`);
      if (!dryRun) {
        await pool.query(
          'UPDATE wsib_registry SET last_enriched_at = NOW() WHERE id = $1',
          [entry.id]
        ).catch((err) => { pipeline.log.error('[enrich-wsib]', `Failed to mark skipped: ${err.message}`); });
      }
      continue;
    }

    const query = buildSearchQuery(entry);

    try {
      if (dryRun) {
        pipeline.log.info('[enrich-wsib]', `  [${i + 1}/${totalEntries}] ${entry.trade_name || entry.legal_name} → query: ${query}`);
        enriched++;
        continue;
      }

      const response = await searchSerper(query);
      const contacts = extractContacts(response);

      // Website scraping fallback for email
      let websiteUrl = contacts.website || entry.website;
      if (websiteUrl && !websiteUrl.startsWith('http')) {
        websiteUrl = `https://${websiteUrl}`;
      }
      if (websiteUrl) websitesScraped++;
      if (!contacts.email && !entry.primary_email && websiteUrl) {
        try {
          const pageRes = await fetch(websiteUrl, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Buildo/1.0)' },
          });
          if (pageRes.ok) {
            const rawHtml = await pageRes.text();
            const scraped = extractEmailsFromHtml(rawHtml);
            if (scraped.length > 0) contacts.email = scraped[0];
            if (!contacts.phone && !entry.primary_phone) {
              const cleanText = stripHtmlNoise(rawHtml);
              const pagePhones = extractPhones([cleanText]);
              if (pagePhones.length > 0) contacts.phone = pagePhones[0];
            }
          }
        } catch { /* timeout or fetch error — skip silently */ }
      }

      // Update wsib_registry (COALESCE preserves existing data)
      const updates = [];
      const params = [];
      let paramIdx = 1;
      const pendingFields = { phone: false, email: false, website: false };

      if (contacts.phone && !entry.primary_phone) {
        updates.push(`primary_phone = COALESCE(NULLIF(primary_phone, ''), $${paramIdx})`);
        params.push(contacts.phone);
        paramIdx++;
        pendingFields.phone = true;
      }
      if (contacts.email && !entry.primary_email) {
        updates.push(`primary_email = COALESCE(NULLIF(primary_email, ''), $${paramIdx})`);
        params.push(contacts.email);
        paramIdx++;
        pendingFields.email = true;
      }
      if (contacts.website && !entry.website) {
        updates.push(`website = COALESCE(NULLIF(website, ''), $${paramIdx})`);
        params.push(contacts.website);
        paramIdx++;
        pendingFields.website = true;
      }

      updates.push('last_enriched_at = NOW()');
      params.push(entry.id);

      await pool.query(
        `UPDATE wsib_registry SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );

      let newFields = 0;
      if (pendingFields.phone) { newFields++; fieldCounts.phone++; }
      if (pendingFields.email) { newFields++; fieldCounts.email++; }
      if (pendingFields.website) { newFields++; fieldCounts.website++; }

      if (newFields > 0) contactsFound++;
      enriched++;

      const summary = [
        contacts.phone ? '📞' : '',
        contacts.email ? '✉️' : '',
        contacts.website ? '🌐' : '',
      ].filter(Boolean).join(' ') || 'no contacts';

      pipeline.log.info('[enrich-wsib]', `  [${i + 1}/${totalEntries}] ${entry.trade_name || entry.legal_name} (${entry.business_size || 'unknown'}) → ${summary}`);

    } catch (err) {
      pipeline.log.error('[enrich-wsib]', err, { wsib_id: entry.id, name: entry.trade_name || entry.legal_name });
      failed++;

      await pool.query(
        'UPDATE wsib_registry SET last_enriched_at = NOW() WHERE id = $1',
        [entry.id]
      ).catch((dbErr) => { pipeline.log.error('[enrich-wsib]', `Failed to mark enriched: ${dbErr.message}`); });
    }

    // Rate limiting
    if (i < totalEntries) await sleep(RATE_LIMIT_MS);
  }

  pipeline.log.info('[enrich-wsib]', `  Large: ${sizeBreakdown.large} | Medium: ${sizeBreakdown.medium} | Small: ${sizeBreakdown.small}`);

  const totalSkipped = Object.values(skipped).reduce((a, b) => a + b, 0);
  pipeline.log.info('[enrich-wsib]', `Skipped ${totalSkipped} entries`, skipped);

  const meta = {
    processed: enriched + failed,
    matched: enriched,
    failed,
    skipped,
    skipped_total: totalSkipped,
    websites_found: websitesScraped,
    extracted_fields: fieldCounts,
    size_breakdown: sizeBreakdown,
  };

  await finalize(pool, runId, startMs, enriched, contactsFound, failed, meta);
});

async function finalize(pool, runId, startMs, enriched, contactsFound, failed, meta) {
  const durationMs = Date.now() - startMs;

  pipeline.log.info('[enrich-wsib]', 'Enrichment complete', {
    processed: enriched + failed, contacts_found: contactsFound,
    no_contacts: enriched - contactsFound, failed,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // WSIB enrichment stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) AS enriched,
      COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) AS with_phone,
      COUNT(*) FILTER (WHERE primary_email IS NOT NULL) AS with_email,
      COUNT(*) FILTER (WHERE website IS NOT NULL) AS with_website
    FROM wsib_registry
  `);
  const s = stats.rows[0];
  pipeline.log.info('[enrich-wsib]', `DB stats: ${s.total} total | ${s.enriched} enriched | ${s.with_phone} phone | ${s.with_email} email | ${s.with_website} website`);

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = 'completed', duration_ms = $1,
           records_total = $2, records_new = $3, records_meta = $4
       WHERE id = $5`,
      [durationMs, enriched + failed, contactsFound, JSON.stringify(meta), runId]
    ).catch((dbErr) => { pipeline.log.error('[enrich-wsib]', `Failed to update pipeline_runs: ${dbErr.message}`); });
  }

  pipeline.emitSummary({
    records_total: enriched + failed,
    records_new: contactsFound,
    records_updated: enriched - contactsFound,
    records_meta: {
      duration_ms: durationMs,
      ...meta,
    },
  });
  pipeline.emitMeta(
    { "wsib_registry": ["id", "legal_name", "trade_name", "mailing_address", "business_size", "primary_phone", "primary_email", "website"] },
    { "wsib_registry": ["primary_phone", "primary_email", "website", "last_enriched_at"] }
  );
}
