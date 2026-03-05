#!/usr/bin/env node
/**
 * Enrich builders with contact data via Serper web search API.
 *
 * Prioritizes WSIB-matched builders (have trade name + legal name + mailing address).
 * Extracts: phone, email, website, social links (Instagram, Facebook, LinkedIn, Houzz).
 * Stores core contacts on builders table, social links in builder_contacts.
 *
 * Requires SERPER_API_KEY environment variable (serper.dev).
 *
 * Usage:
 *   node scripts/enrich-web-search.js [--limit N] [--dry-run]
 *
 * Environment:
 *   SERPER_API_KEY   — API key from serper.dev (required)
 *   ENRICH_LIMIT     — Max builders to process (default 50, overridden by --limit)
 *   PIPELINE_CHAIN   — Set by run-chain.js when running as part of a chain
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
const SERPER_URL = 'https://google.serper.dev/search';
const SLUG = 'enrich_web_search';
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;
const RATE_LIMIT_MS = parseInt(process.env.ENRICH_RATE_MS || '500', 10);
const WSIB_ONLY = process.env.ENRICH_WSIB_ONLY === '1';
const UNMATCHED_ONLY = process.env.ENRICH_UNMATCHED_ONLY === '1';

// ---------------------------------------------------------------------------
// Contact extraction (mirrors src/lib/builders/extract-contacts.ts)
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
const EMAIL_REJECT = ['noreply@', 'no-reply@', 'donotreply@', 'example.com', 'test.com', 'sentry.io', 'wixpress.com'];

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

const SOCIAL_DOMAINS = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com', 'ca.linkedin.com'],
  houzz: ['houzz.com'],
};

function extractSocialLinks(results) {
  const links = { instagram: null, facebook: null, linkedin: null, houzz: null };
  for (const r of results) {
    try {
      const host = new URL(r.link).hostname.replace(/^www\./, '').toLowerCase();
      for (const [key, domains] of Object.entries(SOCIAL_DOMAINS)) {
        if (links[key]) continue;
        if (domains.some((d) => host === d || host.endsWith('.' + d))) {
          links[key] = r.link;
        }
      }
    } catch { continue; }
  }
  return links;
}

function extractContacts(response) {
  const results = response.organic || [];
  const snippets = results.map((r) => r.snippet || '');
  if (response.knowledgeGraph?.phone) snippets.unshift(response.knowledgeGraph.phone);

  const phones = extractPhones(snippets);
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

function extractCity(address) {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 3) return parts[1];
  return null;
}

function buildSearchQuery(builder) {
  const name = builder.trade_name || builder.legal_name || builder.name;
  const city = extractCity(builder.mailing_address) || 'Toronto';
  return `"${name}" "${city}" contractor`;
}

// ---------------------------------------------------------------------------
// Serper API call
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

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1]
    ? parseInt(args[limitIdx + 1], 10)
    : parseInt(process.env.ENRICH_LIMIT || '50', 10);

  if (!SERPER_API_KEY) {
    console.log('SERPER_API_KEY not set — skipping web search enrichment');
    return;
  }

  const mode = WSIB_ONLY ? 'WSIB-matched only' : UNMATCHED_ONLY ? 'Unmatched only' : 'All builders';
  console.log(`=== Web Search Enrichment (${mode}) ===\n`);
  if (dryRun) console.log('DRY RUN — no database writes\n');
  console.log(`Limit: ${limit} | Rate: ${RATE_LIMIT_MS}ms\n`);

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
      console.warn('Could not insert pipeline_runs row:', err.message);
    }
  }

  // Query builders that need enrichment, with optional WSIB filtering
  let wsibFilter = '';
  if (WSIB_ONLY) wsibFilter = 'AND w.id IS NOT NULL';
  if (UNMATCHED_ONLY) wsibFilter = 'AND w.id IS NULL';

  const { rows: builders } = await pool.query(`
    SELECT
      b.id,
      b.name,
      b.phone,
      b.email,
      b.website,
      w.trade_name,
      w.legal_name,
      w.mailing_address
    FROM builders b
    LEFT JOIN wsib_registry w ON w.linked_builder_id = b.id
    WHERE b.enriched_at IS NULL
    ${wsibFilter}
    ORDER BY
      CASE WHEN w.id IS NOT NULL THEN 0 ELSE 1 END,  -- WSIB-matched first
      b.permit_count DESC
    LIMIT $1
  `, [limit]);

  console.log(`Found ${builders.length} unenriched builder(s)`);
  if (builders.length === 0) {
    console.log('Nothing to enrich.');
    await finalize(runId, startMs, 0, 0, 0, { processed: 0, matched: 0, failed: 0 });
    return;
  }

  const wsibCount = builders.filter((b) => b.trade_name || b.legal_name).length;
  console.log(`  WSIB-matched: ${wsibCount} | Name-only: ${builders.length - wsibCount}\n`);

  let enriched = 0;
  let contactsFound = 0;
  let failed = 0;

  // Per-field extraction counters for records_meta
  const fieldCounts = { phone: 0, email: 0, website: 0, instagram: 0, facebook: 0, linkedin: 0, houzz: 0 };
  let websitesScraped = 0;

  for (let i = 0; i < builders.length; i++) {
    const b = builders[i];
    const query = buildSearchQuery(b);

    try {
      if (dryRun) {
        console.log(`  [${i + 1}/${builders.length}] ${b.name} → query: ${query}`);
        enriched++;
        continue;
      }

      const response = await searchSerper(query);
      const contacts = extractContacts(response);

      // If no email from snippets but we have a website, scrape it
      const websiteUrl = contacts.website || b.website;
      if (websiteUrl) websitesScraped++;
      if (!contacts.email && !b.email && websiteUrl) {
        try {
          const pageRes = await fetch(websiteUrl, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Buildo/1.0)' },
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            const scraped = extractEmailsFromHtml(html);
            if (scraped.length > 0) contacts.email = scraped[0];
            // Also try phones from page if none from snippets
            if (!contacts.phone && !b.phone) {
              const pagePhones = extractPhones([html]);
              if (pagePhones.length > 0) contacts.phone = pagePhones[0];
            }
          }
        } catch { /* timeout or fetch error — skip silently */ }
      }

      // Count how many new contact fields we found
      let newFields = 0;

      // Update builders table (COALESCE preserves existing data)
      const updates = [];
      const params = [];
      let paramIdx = 1;

      if (contacts.phone && !b.phone) {
        updates.push(`phone = COALESCE(phone, $${paramIdx})`);
        params.push(contacts.phone);
        paramIdx++;
        newFields++;
        fieldCounts.phone++;
      }
      if (contacts.email && !b.email) {
        updates.push(`email = COALESCE(email, $${paramIdx})`);
        params.push(contacts.email);
        paramIdx++;
        newFields++;
        fieldCounts.email++;
      }
      if (contacts.website && !b.website) {
        updates.push(`website = COALESCE(website, $${paramIdx})`);
        params.push(contacts.website);
        paramIdx++;
        newFields++;
        fieldCounts.website++;
      }

      // Always mark as enriched (even if no contacts found — prevents retry loops)
      updates.push('enriched_at = NOW()');
      params.push(b.id);

      await pool.query(
        `UPDATE builders SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );

      // Insert social links into builder_contacts
      const socialTypes = ['instagram', 'facebook', 'linkedin', 'houzz'];
      for (const type of socialTypes) {
        if (contacts[type]) {
          await pool.query(
            `INSERT INTO builder_contacts (builder_id, contact_type, contact_value, source)
             VALUES ($1, $2, $3, 'web_search')
             ON CONFLICT DO NOTHING`,
            [b.id, type, contacts[type]]
          );
          newFields++;
          fieldCounts[type]++;
        }
      }

      if (newFields > 0) contactsFound++;
      enriched++;

      const summary = [
        contacts.phone ? `📞` : '',
        contacts.email ? `✉️` : '',
        contacts.website ? `🌐` : '',
        contacts.instagram ? 'IG' : '',
        contacts.linkedin ? 'LI' : '',
        contacts.facebook ? 'FB' : '',
        contacts.houzz ? 'HZ' : '',
      ].filter(Boolean).join(' ') || 'no contacts';

      console.log(`  [${i + 1}/${builders.length}] ${b.name} → ${summary}`);

    } catch (err) {
      console.error(`  [${i + 1}/${builders.length}] ${b.name} — ERROR: ${err.message}`);
      failed++;

      // On API error, still mark as enriched to avoid infinite retry
      await pool.query(
        'UPDATE builders SET enriched_at = NOW() WHERE id = $1',
        [b.id]
      ).catch(() => {});
    }

    // Rate limiting
    if (i < builders.length - 1) await sleep(RATE_LIMIT_MS);
  }

  const meta = {
    processed: enriched + failed,
    matched: enriched,
    failed,
    websites_found: websitesScraped,
    extracted_fields: fieldCounts,
  };

  await finalize(runId, startMs, enriched, contactsFound, failed, meta);
}

async function finalize(runId, startMs, enriched, contactsFound, failed, meta) {
  const durationMs = Date.now() - startMs;

  console.log('\n=== Results ===');
  console.log(`  Processed:       ${enriched + failed}`);
  console.log(`  Contacts found:  ${contactsFound}`);
  console.log(`  No contacts:     ${enriched - contactsFound}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Duration:        ${(durationMs / 1000).toFixed(1)}s`);

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = 'completed', duration_ms = $1,
           records_total = $2, records_new = $3, records_meta = $4
       WHERE id = $5`,
      [durationMs, enriched + failed, contactsFound, JSON.stringify(meta), runId]
    ).catch(() => {});
  }

  await pool.end();
}

run().catch((err) => {
  console.error('\nFatal error:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
