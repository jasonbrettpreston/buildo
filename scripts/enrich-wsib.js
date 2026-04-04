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
const EMAIL_REJECT = [
  // Auto-generated / template
  'noreply@', 'no-reply@', 'donotreply@', 'example@', 'example.com', 'yourdomain.com',
  'test.com', 'email.com', 'sentry.io', 'wixpress.com', 'sampleemail.com',
  // Image filenames parsed as emails (Serper snippet artifacts)
  '.png', '.jpg', '.gif', '.svg', '.webp', '@2x.', '@3x.',
  // Government domains (wrong match for businesses)
  '.gov.', 'toronto.ca', 'ontario.ca', 'canada.ca', '.gov.uk', '.gov.ca',
  // Generic directory/platform emails
  'accessibility@', 'webmaster@', 'customerservice@', 'support@construction.com',
  'info@osmca.org',
];
// Personal email providers — blocked for Medium+ but allowed for Small Business
// (sole proprietor plumbers/electricians legitimately use gmail as business email)
const PERSONAL_EMAIL_REJECT = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'live.com', 'live.ca', 'aol.com'];

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
  // Construction directories / project listing sites
  'procore.com', 'constructconnect.com', 'canada.constructconnect.com',
  'projects.constructconnect.com', 'dcnonl.com', 'buildingconnected.com',
  'yorkmaps.ca', 'ww4.yorkmaps.ca', '31safer.ca',
  'constructionassociation.ca', 'ogca.ca', 'rescon.com',
  'construction.com', 'sweets.construction.com',
  'trustedpros.ca', 'canpages.ca',
  // Government / municipal sites (toronto.ca, ontario.ca, canada.ca already in main list above)
  'escribemeetings.com', 'investburlington.ca',
  'citywindsor.ca', 'skicanada.org', 'beachmetro.com',
  // Data brokers / scrapers
  'rocketreach.co', 'datanyze.com', 'apollo.io',
  // News / media / magazines
  'insauga.com', 'ourtimes.ca',
  // Cloud storage / CDN (not company websites)
  's3.amazonaws.com', 'cc-production-uploads-bucket.s3',
  // Website builders / platforms (not company websites)
  'bold.pro', 'ca.bold.pro',
  // Job boards
  'ziprecruiter.com', 'monster.com',
  // Other non-company sites
  'scribd.com', 'prd.tecprd.ethicsefile.com',
  'darien.il.us', 'cfcanada.fticonsulting.com', 'cmcsa.com',
  'legacyclassic.com', 'epa.gov',
  'hub.datanorthyorkshire.org', 'files.cityofportsmouth.com',
  'northyorks.gov.uk', 'cityofportsmouth.com',
  'pub-markham.escribemeetings.com',
  // Batch 3 additions
  'sec.gov', 'scc-csc.ca', 'q4cdn.com', 'jooble.org', 'ca.jooble.org',
  'bynder.cloud', 'flydenver.com', 'wapa.gov', 'petvalu.ca',
  'jobs.siemens-energy.com', 'whatsapp.com', 'web.whatsapp.com',
  'sentry10.bynder.cloud', 'assets.cadillacfairview.com',
  'liftsuperstore.com', 'orka.ca',
  'eartotheground-digital.com', 'levelbyoxford.com',
  'apps.dot.illinois.gov', 'team-global-m-s-m-group-job-agency.wh',
  'scaffolding.ca',
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

// NAICS code → human-readable search terms (what people actually Google)
const NAICS_SEARCH_TERMS = {
  // Building Equipment (G4)
  '238210': 'electrician electrical contractor',
  '238220': 'plumber plumbing HVAC heating cooling contractor',
  '238299': 'building equipment contractor',
  '238291': 'building systems contractor',
  // Specialty Trades (G5)
  '238320': 'painter painting wall covering contractor',
  '238350': 'finish carpentry cabinetry trim contractor',
  '238310': 'drywall insulation contractor',
  '238330': 'flooring contractor',
  '238340': 'tile tiling terrazzo contractor',
  '238990': 'specialty trades contractor',
  '238910': 'excavation site preparation contractor',
  '238390': 'specialty trades contractor',
  // Foundation, Structure & Exterior (G3)
  '238130': 'framing carpenter contractor',
  '238170': 'siding exterior contractor',
  '238160': 'roofing roofer contractor',
  '238140': 'masonry bricklayer contractor',
  '238190': 'exterior construction contractor',
  '238110': 'concrete foundation contractor',
  '238150': 'glass glazing window contractor',
  '238120': 'structural steel contractor',
  // Residential (G1)
  '236110': 'home builder residential contractor',
  // Non-Residential (G6)
  '236220': 'commercial building general contractor',
  '236210': 'industrial building contractor',
  // Professional
  '541370': 'surveying contractor',
  '541340': 'drafting design services',
  '541514': 'computer systems design',
};
const NAICS_FALLBACK = 'contractor';

function buildSearchQuery(entry) {
  const name = entry.trade_name || entry.legal_name;
  const city = extractCity(entry.mailing_address) || 'Ontario';
  const trade = NAICS_SEARCH_TERMS[entry.naics_code] || NAICS_FALLBACK;
  return `"${name}" ${city} ${trade} phone email`;
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
  const searchName = (entry.trade_name || entry.legal_name || '').trim();
  const lower = searchName.toLowerCase();

  // 1. No usable search name
  if (!searchName || searchName.length < 4) {
    return { skip: true, reason: 'no_search_name' };
  }

  // 2. Generic trade names (single-word trades like "ROOFING", "DRYWALL")
  const normalized = searchName.toUpperCase().replace(/[.,;'"]/g, '').replace(/\s+/g, ' ');
  if (GENERIC_TRADE_NAMES.has(normalized)) {
    return { skip: true, reason: 'generic_trade_name' };
  }

  // 3. Corporate accounting entries (never real company names)
  if (/\baccount\b|\bacct\b|\bhead office\b|\bmain office\b|\btarget account\b|\bparent account\b/i.test(lower)) {
    return { skip: true, reason: 'corporate_account' };
  }

  // 4. Staffing/temp agencies (WSIB-registered but not construction companies)
  if (/\bstaffing\b|\bpersonnel\b|\bmanpower\b|\bemployment service\b|\btemporary\b|\bworkforce\b|\btemp service\b|\brecruitment\b/i.test(lower)) {
    return { skip: true, reason: 'staffing_agency' };
  }

  // 5. Division/subsidiary/region markers (internal names, not indexed online)
  if (/\bdivision\b|\bdivsion\b|\bdiv\b|\bregion\s|\bdistrict\s/i.test(lower)) {
    return { skip: true, reason: 'division_name' };
  }

  // 6. Non-construction despite NAICS classification
  if (/\bfood service\b|\bcatering\b|\bcamp\s|\benvironmental service\b/i.test(lower)) {
    return { skip: true, reason: 'non_construction' };
  }

  // 7. Unsearchable abbreviations (very short, no vowels, or parenthetical codes)
  if (searchName.length <= 5 && !searchName.includes(' ')) {
    return { skip: true, reason: 'abbreviation' };
  }
  if (/\(N\.?A\.?\)|\(Canada\)|\(East\)|\(West\)/i.test(searchName)) {
    return { skip: true, reason: 'abbreviation' };
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
    body: JSON.stringify({ q: query, gl: 'ca', location: 'Ontario, Canada', num: 10 }),
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
  // NAICS whitelist: building construction trades only (excludes infrastructure + non-construction).
  // Rows with NULL naics_description are intentionally excluded (non-standard entries).
  const NAICS_WHITELIST = [
    'Specialty trades construction',
    'Residential building construction',
    'Building equipment construction',
    'Foundation, structure and building exterior construction',
    'Non-residential building construction',
    'Professional, scientific and technical',
  ];
  const naicsFilter = `AND naics_description IN (${NAICS_WHITELIST.map((_, i) => `$${i + 1}`).join(', ')})`;

  // Filter to GTA + building trades + exclude Large Business conglomerates
  const countResult = await pool.query(`
    SELECT COUNT(*) AS cnt FROM wsib_registry
    WHERE last_enriched_at IS NULL
      AND is_gta = true
      AND business_size != 'Large Business'
      AND (trade_name IS NOT NULL OR legal_name IS NOT NULL)
      ${naicsFilter}
  `, NAICS_WHITELIST);
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
  const skipped = { no_search_name: 0, generic_trade_name: 0, corporate_account: 0, staffing_agency: 0, division_name: 0, non_construction: 0, abbreviation: 0 };
  const sizeBreakdown = { large: 0, medium: 0, small: 0 };
  let i = 0;

  const streamParams = [...NAICS_WHITELIST, limit];
  const limitParam = `$${streamParams.length}`;

  for await (const entry of pipeline.streamQuery(pool, `
    SELECT
      id,
      legal_name,
      trade_name,
      mailing_address,
      naics_code,
      naics_description,
      business_size,
      primary_phone,
      primary_email,
      website
    FROM wsib_registry
    WHERE last_enriched_at IS NULL
      AND is_gta = true
      AND business_size != 'Large Business'
      AND (trade_name IS NOT NULL OR legal_name IS NOT NULL)
      ${naicsFilter}
    ORDER BY
      CASE business_size
        WHEN 'Large Business' THEN 0
        WHEN 'Medium Business' THEN 1
        WHEN 'Small Business' THEN 2
        ELSE 3
      END,
      trade_name IS NOT NULL DESC,
      legal_name
    LIMIT ${limitParam}
  `, streamParams)) {
    i++;

    // Track size breakdown as we stream
    if (entry.business_size === 'Large Business') sizeBreakdown.large++;
    else if (entry.business_size === 'Medium Business') sizeBreakdown.medium++;
    else if (entry.business_size === 'Small Business') sizeBreakdown.small++;

    // Pre-flight filter
    const skipResult = shouldSkipWsibEntry(entry);
    if (skipResult.skip) {
      skipped[skipResult.reason]++;
      pipeline.log.info('[enrich-wsib]', `  [${i}/${totalEntries}] SKIP (${skipResult.reason}): ${entry.trade_name || entry.legal_name}`);
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
        pipeline.log.info('[enrich-wsib]', `  [${i}/${totalEntries}] ${entry.trade_name || entry.legal_name} → query: ${query}`);
        enriched++;
        continue;
      }

      const response = await searchSerper(query);
      const contacts = extractContacts(response);

      // Block personal email providers for Medium+ businesses (Small contractors legitimately use gmail)
      if (contacts.email && entry.business_size !== 'Small Business') {
        const emailLower = contacts.email.toLowerCase();
        if (PERSONAL_EMAIL_REJECT.some((r) => emailLower.includes(r))) {
          contacts.email = null;
        }
      }

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

      pipeline.log.info('[enrich-wsib]', `  [${i}/${totalEntries}] ${entry.trade_name || entry.legal_name} (${entry.business_size || 'unknown'}) → ${summary}`);

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
