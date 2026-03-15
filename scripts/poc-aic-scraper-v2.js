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
 * Env vars:
 *   PROXY_HOST     — proxy hostname (e.g. ca.decodo.com for Canadian IPs)
 *   PROXY_PORT     — proxy port (e.g. 20001 for Decodo Canada)
 *   PROXY_USER     — proxy username
 *   PROXY_PASS     — proxy password
 *   SCRAPE_BATCH_SIZE — permits per batch (default: 10)
 *
 * Decodo geo-targeting: use country-specific hostname + port range
 *   Random:  gate.decodo.com:10001  (will be geo-fenced by AIC portal)
 *   Canada:  ca.decodo.com:20001    (required for Toronto municipal data)
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 */

const pipeline = require('./lib/pipeline');

const AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const WAF_TRAP_THRESHOLD = 20; // consecutive empty responses before re-bootstrap

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
    const schemaDrift = [];

    // Schema validation — detect when AIC portal changes JSON structure
    function checkFields(label, obj, expected) {
      if (!obj || typeof obj !== 'object') return;
      const missing = expected.filter(k => !(k in obj));
      if (missing.length > 0) {
        schemaDrift.push(`${label}: missing fields [${missing.join(', ')}]`);
      }
    }

    async function post(path, body) {
      const r = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await r.text();
      if (r.status >= 400) return { status: r.status, data: null, size: text.length };
      try {
        return { status: r.status, data: JSON.parse(text), size: text.length };
      } catch {
        schemaDrift.push(`POST ${path}: response is not valid JSON (${text.slice(0, 100)})`);
        return { status: r.status, data: null, size: text.length };
      }
    }
    async function get(path) {
      const r = await fetch(base + path, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await r.text();
      if (r.status >= 400) return { status: r.status, data: null, size: text.length };
      try {
        return { status: r.status, data: JSON.parse(text), size: text.length };
      } catch {
        schemaDrift.push(`GET ${path}: response is not valid JSON (${text.slice(0, 100)})`);
        return { status: r.status, data: null, size: text.length };
      }
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
    if (!r1.data || r1.data.length === 0) return { properties: [], folders: [], results, totalBytes, schemaDrift };

    checkFields('properties[0]', r1.data[0], ['propertyRsn']);
    const propertyRsn = String(r1.data[0].propertyRsn);

    // Step 2: Get folders
    const r2 = await post('/jaxrs/search/folders', { ...searchBody, propertyRsn });
    totalBytes += r2.size;
    if (!r2.data) return { properties: r1.data, folders: [], results, totalBytes, schemaDrift };

    const folders = r2.data;
    if (folders.length > 0) {
      checkFields('folders[0]', folders[0], ['folderYear', 'folderSequence', 'folderSection', 'statusDesc', 'folderTypeDesc', 'folderRsn']);
    }

    // Step 3+4: For each target folder, get detail + status (chained)
    for (const folder of folders) {
      if (folder.statusDesc !== 'Inspection' || !targetTypes.includes(folder.folderTypeDesc)) continue;

      const permitNum = `${folder.folderYear} ${folder.folderSequence} ${folder.folderSection}`;

      const r3 = await get(`/jaxrs/search/detail/${folder.folderRsn}`);
      totalBytes += r3.size;

      if (r3.data) {
        checkFields('detail', r3.data, ['inspectionProcesses', 'showStatus']);
      }

      if (!r3.data || !r3.data.inspectionProcesses || r3.data.inspectionProcesses.length === 0) {
        results.push({ permitNum, error: 'no_processes' });
        continue;
      }

      if (!r3.data.showStatus) {
        results.push({ permitNum, error: 'no_status_link' });
        continue;
      }

      for (const proc of r3.data.inspectionProcesses) {
        checkFields('process', proc, ['processRsn']);

        const r4 = await get(`/jaxrs/search/status/${folder.folderRsn}/${proc.processRsn}`);
        totalBytes += r4.size;

        if (r4.data && r4.data.stages && r4.data.stages.length > 0) {
          checkFields('stages[0]', r4.data.stages[0], ['desc', 'status']);
          results.push({ permitNum, stages: r4.data.stages, orders: r4.data.orders || [] });
        } else {
          results.push({ permitNum, error: 'no_stages' });
        }
      }
    }

    return { properties: r1.data, folders, results, totalBytes, schemaDrift };
  }, { year, sequence, targetTypes, base: AIC_BASE });
}

async function scrapeYearSequence(page, yearSeq, dbPool) {
  const [year, sequence] = yearSeq.split(' ');

  // Single round-trip: all 4 API calls execute inside Chrome
  const { properties, folders, results, totalBytes, schemaDrift } = await fetchPermitChain(page, year, sequence, TARGET_TYPES);

  if (properties.length === 0) {
    pipeline.log.info('[scraper]', `No property found for ${yearSeq}`);
    return { searched: 1, scraped: 0, upserted: 0, bytes: totalBytes, schemaDrift: schemaDrift || [] };
  }

  const inspectionFolders = folders.filter(
    (f) => f.statusDesc === 'Inspection' && TARGET_TYPES.includes(f.folderTypeDesc)
  );
  pipeline.log.info('[scraper]', `${yearSeq}: ${folders.length} folders, ${inspectionFolders.length} target inspections`, {
    all: folders.map((f) => `${f.folderYear} ${f.folderSequence} ${f.folderSection} [${f.statusDesc}]`),
  });

  let scraped = 0;
  let upserted = 0;
  let totalStatusChanges = 0;

  for (const result of results) {
    if (result.error) {
      pipeline.log.info('[scraper]', `${result.permitNum}: ${result.error}`);
      continue;
    }

    // Upsert stages into permit_inspections, tracking status changes
    const client = await dbPool.connect();
    let statusChanges = 0;
    try {
      for (const stage of result.stages) {
        const status = normalizeStatus(stage.status);
        if (!status) continue;

        const inspDate = parseInspectionDate(stage.date);

        // Check existing status before upsert to detect changes
        const existing = await client.query(
          `SELECT status FROM permit_inspections WHERE permit_num = $1 AND stage_name = $2`,
          [result.permitNum, stage.desc]
        );
        const oldStatus = existing.rows[0]?.status;

        // Only update if data actually changed — prevents dead tuple bloat
        const res = await client.query(
          `INSERT INTO permit_inspections (permit_num, stage_name, status, inspection_date, scraped_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (permit_num, stage_name) DO UPDATE
           SET status = EXCLUDED.status,
               inspection_date = EXCLUDED.inspection_date,
               scraped_at = NOW()
           WHERE permit_inspections.status IS DISTINCT FROM EXCLUDED.status
              OR permit_inspections.inspection_date IS DISTINCT FROM EXCLUDED.inspection_date`,
          [result.permitNum, stage.desc, status, inspDate]
        );
        // Only count actual DB writes — rowCount=0 when IS DISTINCT FROM skips the update
        if (res.rowCount > 0) {
          upserted++;
          if (oldStatus && oldStatus !== status) statusChanges++;
        }
      }
    } finally {
      client.release();
    }
    totalStatusChanges += statusChanges;
    scraped++;
    pipeline.log.info('[scraper]', `Scraped ${result.stages.length} stages for ${result.permitNum}`, {
      stages: result.stages.map((s) => `${s.desc}: ${s.status}`),
      statusChanges,
    });
  }

  return { searched: 1, scraped, upserted, bytes: totalBytes, schemaDrift: schemaDrift || [], statusChanges: totalStatusChanges };
}

// Classify error for telemetry
function categorizeError(err) {
  const msg = (err.message || String(err)).toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('socket hang up')) return 'connection_refused';
  if (msg.includes('403') || msg.includes('forbidden')) return 'waf_block';
  if (msg.includes('407') || msg.includes('proxy auth')) return 'proxy_auth';
  if (msg.includes('429') || msg.includes('too many')) return 'rate_limited';
  if (msg.includes('json') || msg.includes('unexpected token')) return 'json_parse';
  if (msg.includes('navigation') || msg.includes('net::err')) return 'navigation';
  return 'unknown';
}

async function scrapeWithRetry(page, yearSeq, dbPool) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await scrapeYearSequence(page, yearSeq, dbPool);
    } catch (err) {
      lastError = err;
      const category = categorizeError(err);
      pipeline.log.error('[scraper]', err, { yearSeq, attempt, maxRetries: MAX_RETRIES, category });
      if (attempt === MAX_RETRIES) {
        pipeline.log.error('[scraper]', `All retries exhausted for ${yearSeq} [${category}], skipping`);
        return { searched: 1, scraped: 0, upserted: 0, bytes: 0, schemaDrift: [], retryExhausted: true, errorCategory: category, errorMessage: (err.message || String(err)).slice(0, 200) };
      }
      // Exponential backoff: 2s, 4s, 8s
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt - 1)));
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Session bootstrap — launch browser + establish WAF session
// ---------------------------------------------------------------------------

async function bootstrapSession() {
  const { browser, context } = await launchBrowser();
  const page = await context.newPage();

  // Block images/css/fonts but allow scripts — WAFs run JS challenges to verify
  // the browser isn't headless. Blocking scripts causes permanent shadow-ban.
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['document', 'xhr', 'fetch', 'script'].includes(type)) return route.continue();
    return route.abort();
  });

  await page.goto(`${AIC_BASE}/setup.do?action=init`, { waitUntil: 'commit' });
  await page.waitForTimeout(1000);
  return { browser, page };
}

// ---------------------------------------------------------------------------
// Latency percentiles
// ---------------------------------------------------------------------------

function computePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted[sorted.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

pipeline.run('poc-aic-scraper', async (pool) => {
  const singlePermit = process.argv[2];
  const startMs = Date.now();

  // Telemetry accumulator — emitted in records_meta for assert-data-bounds
  const tel = {
    permits_attempted: 0,
    permits_found: 0,
    permits_scraped: 0,
    not_found_count: 0,
    proxy_errors: 0,
    consecutive_empty: 0,
    consecutive_empty_max: 0,
    session_refreshes: 0,
    session_bootstraps: 0,
    session_failures: 0,
    schema_drift: [],
    status_changes: 0,
    total_upserted: 0,
    error_categories: {},
    last_error: null,
    latencies: [],
  };

  // Proxy validation — warn if no proxy configured or using wrong endpoint
  if (!process.env.PROXY_HOST) {
    pipeline.log.warn('[scraper]', 'No PROXY_HOST configured — connecting directly to AIC portal. WAF will likely block headless requests. Set PROXY_HOST=ca.decodo.com PROXY_PORT=20001 for Canadian residential proxy.');
  } else {
    const host = process.env.PROXY_HOST;
    pipeline.log.info('[scraper]', `Proxy: ${host}:${process.env.PROXY_PORT}`);
    if (host === 'gate.decodo.com') {
      pipeline.log.warn('[scraper]', 'Using gate.decodo.com (random geo) — AIC portal may geo-fence non-Canadian IPs. Use ca.decodo.com:20001 for Canadian IPs.');
    }
  }

  // Step 0: Launch browser + establish WAF session
  pipeline.log.info('[scraper]', 'Launching browser for WAF session...');
  let { browser, page } = await bootstrapSession();
  pipeline.log.info('[scraper]', 'WAF session established');

  function accumulateResult(result) {
    tel.permits_attempted++;
    if (result.scraped > 0) {
      tel.permits_found++;
      tel.permits_scraped += result.scraped;
      tel.consecutive_empty = 0;
    } else if (result.searched > 0 && result.scraped === 0) {
      tel.not_found_count++;
      tel.consecutive_empty++;
      tel.consecutive_empty_max = Math.max(tel.consecutive_empty_max, tel.consecutive_empty);
    }
    tel.total_upserted += (result.upserted || 0);
    if (result.retryExhausted) {
      tel.proxy_errors++;
      if (result.errorCategory) {
        tel.error_categories[result.errorCategory] = (tel.error_categories[result.errorCategory] || 0) + 1;
      }
      if (result.errorMessage) tel.last_error = result.errorMessage;
    }
    if (result.schemaDrift) {
      for (const drift of result.schemaDrift) {
        if (!tel.schema_drift.includes(drift)) tel.schema_drift.push(drift);
      }
    }
    tel.status_changes += (result.statusChanges || 0);
  }

  try {
    if (singlePermit) {
      pipeline.log.info('[scraper]', `Single permit mode: ${singlePermit}`);
      const reqStart = Date.now();
      const result = await scrapeWithRetry(page, singlePermit, pool);
      tel.latencies.push(Date.now() - reqStart);
      accumulateResult(result);
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

        // WAF trap detection — consecutive empty responses indicate silent block
        if (tel.consecutive_empty >= WAF_TRAP_THRESHOLD) {
          pipeline.log.warn('[scraper]', `WAF trap detected (${tel.consecutive_empty} consecutive empty). Re-bootstrapping session...`);
          try {
            await browser.close();
            ({ browser, page } = await bootstrapSession());
            tel.session_bootstraps++;
            tel.consecutive_empty = 0;
            pipeline.log.info('[scraper]', 'Session re-bootstrapped successfully');
          } catch (bootstrapErr) {
            tel.session_failures++;
            pipeline.log.error('[scraper]', bootstrapErr, { event: 'session_bootstrap_failed' });
            break; // Can't continue without a browser
          }
        }

        // Periodic WAF session refresh to prevent expiry on long runs
        if (i > 0 && i % SESSION_REFRESH_INTERVAL === 0) {
          pipeline.log.info('[scraper]', `Refreshing WAF session (after ${i} permits)...`);
          try {
            await page.goto(`${AIC_BASE}/setup.do?action=init`, { waitUntil: 'commit' });
            await page.waitForTimeout(1000);
            tel.session_refreshes++;
          } catch (refreshErr) {
            tel.session_failures++;
            pipeline.log.error('[scraper]', refreshErr, { event: 'session_refresh_failed' });
          }
        }

        const reqStart = Date.now();
        const result = await scrapeWithRetry(page, yearSeq, pool);
        tel.latencies.push(Date.now() - reqStart);
        accumulateResult(result);
      }
    }
  } finally {
    await browser.close();
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const latencyStats = computePercentiles(tel.latencies);

  pipeline.log.info('[scraper]', 'Scrape complete', {
    permits_attempted: tel.permits_attempted,
    permits_scraped: tel.permits_scraped,
    status_changes: tel.status_changes,
    proxy_errors: tel.proxy_errors,
    session_bootstraps: tel.session_bootstraps,
    schema_drift: tel.schema_drift.length,
    latency_p50: `${latencyStats.p50}ms`,
    latency_p95: `${latencyStats.p95}ms`,
    elapsed: `${elapsed}s`,
  });

  const durationMs = Date.now() - startMs;

  pipeline.emitSummary({
    records_total: tel.permits_attempted,
    records_new: tel.total_upserted,
    records_updated: tel.status_changes,
    records_meta: {
      scraper_telemetry: {
        permits_attempted: tel.permits_attempted,
        permits_found: tel.permits_found,
        permits_scraped: tel.permits_scraped,
        not_found_count: tel.not_found_count,
        proxy_errors: tel.proxy_errors,
        consecutive_empty_max: tel.consecutive_empty_max,
        session_refreshes: tel.session_refreshes,
        session_bootstraps: tel.session_bootstraps,
        session_failures: tel.session_failures,
        schema_drift: tel.schema_drift,
        status_changes: tel.status_changes,
        error_categories: tel.error_categories,
        last_error: tel.last_error,
        proxy_configured: !!process.env.PROXY_HOST,
        proxy_host: process.env.PROXY_HOST || null,
        latency: latencyStats,
      },
      audit_table: {
        phase: 1,
        name: 'Data Ingestion',
        verdict: 'PASS',
        rows: [
          { metric: 'permits_attempted', value: tel.permits_attempted, threshold: null, status: 'INFO' },
          { metric: 'permits_found', value: tel.permits_found, threshold: null, status: 'INFO' },
          { metric: 'not_found_count', value: tel.not_found_count, threshold: null, status: 'INFO' },
          { metric: 'records_inserted', value: tel.total_upserted, threshold: null, status: 'INFO' },
          { metric: 'records_updated', value: tel.status_changes, threshold: null, status: 'INFO' },
          { metric: 'duration_ms', value: durationMs, threshold: null, status: 'INFO' },
          { metric: 'exit_code', value: 0, threshold: '== 0', status: 'PASS' },
          { metric: 'pipeline_summary_emitted', value: true, threshold: '== true', status: 'PASS' },
        ],
      },
    },
  });

  pipeline.emitMeta(
    { permits: ['permit_num', 'status', 'permit_type'] },
    { permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date', 'scraped_at'] },
    ['AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)']
  );
});
