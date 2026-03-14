#!/usr/bin/env node
/**
 * AIC Inspection Scraper v2 — Hybrid Playwright + REST API
 *
 * Uses Playwright to maintain a browser session (WAF/TLS fingerprint),
 * but makes all data requests via the AIC portal's JAX-RS REST endpoints
 * using page.evaluate(fetch(...)) — no page navigation, no HTML parsing.
 *
 * Discovered endpoints:
 *   POST /jaxrs/search/properties  → find address by permit year+sequence
 *   POST /jaxrs/search/folders     → list all permits at an address
 *   GET  /jaxrs/search/detail/{folderRsn}  → permit detail + inspection processes
 *   GET  /jaxrs/search/status/{folderRsn}/{processRsn}  → inspection stages
 *
 * Bandwidth: ~4 KB per permit (vs ~1.5 MB with full page loads in v1)
 * Speed: ~1-2s per permit (vs ~14s with v1)
 *
 * Usage:
 *   node scripts/poc-aic-scraper-v2.js                    # batch mode (10 permits)
 *   node scripts/poc-aic-scraper-v2.js "24 132854"        # single permit
 *
 * Env vars: PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 */

const pipeline = require('./lib/pipeline');

const AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Target permit types for stage-level scraping (Spec 38 §3.6)
const TARGET_TYPES = [
  'Small Residential Projects',
  'Building Additions/Alterations',
  'New Houses',
  'Plumbing(PS)',
  'Residential Building Permit',
];

const BATCH_SIZE = parseInt(process.env.SCRAPE_BATCH_SIZE || '10', 10);
const SESSION_REFRESH_INTERVAL = 200; // re-establish WAF session every N permits

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Status normalization (matches Spec 38 §3.4 + parser.ts)
// ---------------------------------------------------------------------------

function normalizeStatus(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'outstanding') return 'Outstanding';
  if (s === 'pass' || s === 'passed') return 'Passed';
  if (s === 'fail' || s === 'failed' || s === 'not passed') return 'Not Passed';
  if (s === 'partial' || s === 'partially completed') return 'Partial';
  return null;
}

function parseInspectionDate(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '-' || trimmed === 'N/A' || trimmed === '') return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const MONTHS = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const namedMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedMatch) {
    const monthNum = MONTHS[namedMatch[1].slice(0, 3).toLowerCase()];
    if (monthNum) {
      return `${namedMatch[3]}-${monthNum}-${namedMatch[2].padStart(2, '0')}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Browser launch (one-time)
// ---------------------------------------------------------------------------

async function launchBrowser() {
  const { chromium } = require('playwright');
  let addExtra, StealthPlugin;
  try {
    addExtra = require('playwright-extra').addExtra;
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
  } catch {}

  const proxyServer = process.env.PROXY_HOST && process.env.PROXY_PORT
    ? `http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}` : undefined;

  const launchOpts = {
    headless: true,
    ...(proxyServer && { proxy: { server: proxyServer } }),
  };

  let browser;
  if (addExtra && StealthPlugin) {
    const sc = addExtra(chromium);
    sc.use(StealthPlugin());
    browser = await sc.launch(launchOpts);
  } else {
    browser = await chromium.launch(launchOpts);
  }

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    ...(process.env.PROXY_USER && {
      httpCredentials: { username: process.env.PROXY_USER, password: process.env.PROXY_PASS || '' },
    }),
  });

  return { browser, context };
}

// ---------------------------------------------------------------------------
// Core scrape logic — single chained page.evaluate (zero Node↔Browser round-trips)
// ---------------------------------------------------------------------------

/**
 * Execute the full 4-step API chain inside the browser context.
 * All fetches run inside Chromium — Node only receives the finished result.
 */
async function fetchPermitChain(page, year, sequence, targetTypes) {
  return page.evaluate(async ({ year, sequence, targetTypes, base }) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

    async function post(path, body) {
      const r = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await r.text();
      return { status: r.status, data: r.status < 400 ? JSON.parse(text) : null, size: text.length };
    }
    async function get(path) {
      const r = await fetch(base + path, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await r.text();
      return { status: r.status, data: r.status < 400 ? JSON.parse(text) : null, size: text.length };
    }

    let totalBytes = 0;
    const results = [];

    // Step 1: Search properties
    const searchBody = {
      ward: '', folderYear: year, folderSequence: sequence,
      folderSection: '', folderRevision: '', folderType: '',
      address: '', searchType: '0',
      mapX: null, mapY: null,
      propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0',
    };

    const r1 = await post('/jaxrs/search/properties', searchBody);
    totalBytes += r1.size;
    if (!r1.data || r1.data.length === 0) return { properties: [], folders: [], results, totalBytes };

    const propertyRsn = String(r1.data[0].propertyRsn);

    // Step 2: Get folders
    const r2 = await post('/jaxrs/search/folders', { ...searchBody, propertyRsn });
    totalBytes += r2.size;
    if (!r2.data) return { properties: r1.data, folders: [], results, totalBytes };

    const folders = r2.data;

    // Step 3+4: For each target folder, get detail + status (chained)
    for (const folder of folders) {
      if (folder.statusDesc !== 'Inspection' || !targetTypes.includes(folder.folderTypeDesc)) continue;

      const permitNum = `${folder.folderYear} ${folder.folderSequence} ${folder.folderSection}`;

      const r3 = await get(`/jaxrs/search/detail/${folder.folderRsn}`);
      totalBytes += r3.size;

      if (!r3.data || !r3.data.inspectionProcesses || r3.data.inspectionProcesses.length === 0) {
        results.push({ permitNum, error: 'no_processes' });
        continue;
      }

      if (!r3.data.showStatus) {
        results.push({ permitNum, error: 'no_status_link' });
        continue;
      }

      for (const proc of r3.data.inspectionProcesses) {
        const r4 = await get(`/jaxrs/search/status/${folder.folderRsn}/${proc.processRsn}`);
        totalBytes += r4.size;

        if (r4.data && r4.data.stages && r4.data.stages.length > 0) {
          results.push({ permitNum, stages: r4.data.stages, orders: r4.data.orders || [] });
        } else {
          results.push({ permitNum, error: 'no_stages' });
        }
      }
    }

    return { properties: r1.data, folders, results, totalBytes };
  }, { year, sequence, targetTypes, base: AIC_BASE });
}

async function scrapeYearSequence(page, yearSeq, dbPool) {
  const [year, sequence] = yearSeq.split(' ');

  // Single round-trip: all 4 API calls execute inside Chrome
  const { properties, folders, results, totalBytes } = await fetchPermitChain(page, year, sequence, TARGET_TYPES);

  if (properties.length === 0) {
    pipeline.log.info('[scraper]', `No property found for ${yearSeq}`);
    return { searched: 1, scraped: 0, upserted: 0, bytes: totalBytes };
  }

  const inspectionFolders = folders.filter(
    (f) => f.statusDesc === 'Inspection' && TARGET_TYPES.includes(f.folderTypeDesc)
  );
  pipeline.log.info('[scraper]', `${yearSeq}: ${folders.length} folders, ${inspectionFolders.length} target inspections`, {
    all: folders.map((f) => `${f.folderYear} ${f.folderSequence} ${f.folderSection} [${f.statusDesc}]`),
  });

  let scraped = 0;
  let upserted = 0;

  for (const result of results) {
    if (result.error) {
      pipeline.log.info('[scraper]', `${result.permitNum}: ${result.error}`);
      continue;
    }

    // Upsert stages into permit_inspections
    const client = await dbPool.connect();
    try {
      for (const stage of result.stages) {
        const status = normalizeStatus(stage.status);
        if (!status) continue;

        const inspDate = parseInspectionDate(stage.date);

        await client.query(
          `INSERT INTO permit_inspections (permit_num, stage_name, status, inspection_date, scraped_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (permit_num, stage_name) DO UPDATE
           SET status = EXCLUDED.status,
               inspection_date = EXCLUDED.inspection_date,
               scraped_at = NOW()`,
          [result.permitNum, stage.desc, status, inspDate]
        );
        upserted++;
      }
    } finally {
      client.release();
    }

    scraped++;
    pipeline.log.info('[scraper]', `Scraped ${result.stages.length} stages for ${result.permitNum}`, {
      stages: result.stages.map((s) => `${s.desc}: ${s.status}`),
    });
  }

  return { searched: 1, scraped, upserted, bytes: totalBytes };
}

async function scrapeWithRetry(page, yearSeq, dbPool) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await scrapeYearSequence(page, yearSeq, dbPool);
    } catch (err) {
      pipeline.log.error('[scraper]', err, { yearSeq, attempt, maxRetries: MAX_RETRIES });
      if (attempt === MAX_RETRIES) {
        pipeline.log.error('[scraper]', `All retries exhausted for ${yearSeq}, skipping`);
        return { searched: 1, scraped: 0, upserted: 0, bytes: 0 };
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

pipeline.run('poc-aic-scraper', async (pool) => {
  const singlePermit = process.argv[2];
  const startMs = Date.now();

  // Step 0: Launch browser + load init page (establishes WAF session)
  pipeline.log.info('[scraper]', 'Launching browser for WAF session...');
  const { browser, context } = await launchBrowser();
  const page = await context.newPage();

  // Block everything except documents and XHR (we only need the session + fetch)
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['document', 'xhr', 'fetch'].includes(type)) return route.continue();
    return route.abort();
  });

  await page.goto(`${AIC_BASE}/setup.do?action=init`, { waitUntil: 'commit' });
  await page.waitForTimeout(1000);
  pipeline.log.info('[scraper]', 'WAF session established');

  let totalSearched = 0;
  let totalScraped = 0;
  let totalUpserted = 0;
  let totalBytes = 0;

  try {
    if (singlePermit) {
      pipeline.log.info('[scraper]', `Single permit mode: ${singlePermit}`);
      const result = await scrapeWithRetry(page, singlePermit, pool);
      totalSearched += result.searched;
      totalScraped += result.scraped;
      totalUpserted += result.upserted;
      totalBytes += result.bytes;
    } else {
      // Batch mode: query DB for eligible permits
      const { rows } = await pool.query(
        `SELECT DISTINCT SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+') AS year_seq
         FROM permits p
         LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
         WHERE p.status = 'Inspection'
           AND p.permit_type = ANY($1)
           AND (pi.scraped_at IS NULL OR pi.scraped_at < NOW() - INTERVAL '7 days')
           AND SUBSTRING(p.permit_num FROM '^[0-9]{2}')::int <= 26
         ORDER BY year_seq DESC
         LIMIT $2`,
        [TARGET_TYPES, BATCH_SIZE]
      );

      pipeline.log.info('[scraper]', `Batch mode: ${rows.length} year+sequence combos to scrape`);

      for (let i = 0; i < rows.length; i++) {
        const yearSeq = rows[i].year_seq;
        pipeline.progress('poc-aic-scraper', i + 1, rows.length, startMs);

        // Refresh WAF session periodically to prevent expiry on long runs
        if (i > 0 && i % SESSION_REFRESH_INTERVAL === 0) {
          pipeline.log.info('[scraper]', `Refreshing WAF session (after ${i} permits)...`);
          await page.goto(`${AIC_BASE}/setup.do?action=init`, { waitUntil: 'commit' });
          await page.waitForTimeout(1000);
        }

        const result = await scrapeWithRetry(page, yearSeq, pool);
        totalSearched += result.searched;
        totalScraped += result.scraped;
        totalUpserted += result.upserted;
        totalBytes += result.bytes;
      }
    }
  } finally {
    await browser.close();
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  pipeline.log.info('[scraper]', 'Scrape complete', {
    searched: totalSearched,
    scraped: totalScraped,
    upserted: totalUpserted,
    bytes: totalBytes,
    bytesHuman: `${(totalBytes / 1024).toFixed(1)} KB`,
    elapsed: `${elapsed}s`,
  });

  pipeline.emitSummary({
    records_total: totalSearched,
    records_new: totalUpserted,
    records_updated: 0,
  });

  pipeline.emitMeta(
    { permits: ['permit_num', 'status', 'permit_type'] },
    { permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date', 'scraped_at'] },
    ['AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)']
  );
});
