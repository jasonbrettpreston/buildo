/**
 * PoC AIC Inspection Scraper
 *
 * Scrapes building permit inspection statuses from the City of Toronto
 * Application Information Centre (AIC) portal.
 *
 * Usage: node scripts/poc-aic-scraper.js [permit_num]
 *
 * Requires: playwright, playwright-extra, puppeteer-extra-plugin-stealth
 * Env vars: PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 */

const { Pool } = require('pg');

const AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus';
const PAGE_TIMEOUT = 30000;
const MAX_RETRIES = 3;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/buildo',
});

async function upsertInspections(permitNum, inspections) {
  const client = await pool.connect();
  try {
    for (const insp of inspections) {
      await client.query(
        `INSERT INTO permit_inspections (permit_num, stage_name, status, inspection_date, scraped_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (permit_num, stage_name) DO UPDATE
         SET status = EXCLUDED.status,
             inspection_date = EXCLUDED.inspection_date,
             scraped_at = NOW()`,
        [permitNum, insp.stage_name, insp.status, insp.inspection_date]
      );
    }
  } finally {
    client.release();
  }
}

function parseInspectionTable(html) {
  const results = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    if (cells.length < 2) continue;

    const stageName = cells[0];
    const rawStatus = cells[1].trim().toLowerCase();
    let status;
    if (rawStatus === 'outstanding') status = 'Outstanding';
    else if (rawStatus === 'pass' || rawStatus === 'passed') status = 'Pass';
    else if (rawStatus === 'fail' || rawStatus === 'failed') status = 'Fail';
    else if (rawStatus === 'partial' || rawStatus === 'partially completed') status = 'Partial';
    else continue;

    if (stageName.toLowerCase() === 'inspection stage') continue;

    let inspectionDate = null;
    if (cells.length >= 3) {
      const raw = cells[2].trim();
      if (raw && raw !== '-' && raw !== 'N/A') {
        const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) {
          const [, month, day, year] = slashMatch;
          inspectionDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          inspectionDate = raw.slice(0, 10);
        }
      }
    }

    results.push({ stage_name: stageName, status, inspection_date: inspectionDate });
  }

  return results;
}

async function scrapePermit(permitNum) {
  let chromium, addExtra, StealthPlugin;
  try {
    chromium = require('playwright').chromium;
  } catch {
    console.error('Playwright not installed. Run: npm install playwright playwright-extra puppeteer-extra-plugin-stealth');
    process.exit(1);
  }

  try {
    addExtra = require('playwright-extra').addExtra;
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
  } catch {
    // Stealth plugin optional for PoC
  }

  const proxyServer = process.env.PROXY_HOST && process.env.PROXY_PORT
    ? `http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
    : undefined;

  const launchOpts = {
    headless: true,
    ...(proxyServer && { proxy: { server: proxyServer } }),
  };

  let browser;
  if (addExtra && StealthPlugin) {
    const stealthChromium = addExtra(chromium);
    stealthChromium.use(StealthPlugin());
    browser = await stealthChromium.launch(launchOpts);
  } else {
    browser = await chromium.launch(launchOpts);
  }

  const context = await browser.newContext({
    ...(process.env.PROXY_USER && {
      httpCredentials: {
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS || '',
      },
    }),
  });

  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT);

  try {
    // Step 1: Initialize session
    await page.goto(`${AIC_BASE}/setup.do?action=init`);
    await page.waitForLoadState('networkidle');

    // Step 2: Input permit number and search
    await page.fill('input[name="query"]', permitNum);
    await page.click('input[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Step 3: Click through accordions per AIC portal flow
    // The portal requires navigating through "Address" and "Application Number"
    // accordions before reaching the inspection data.
    const addrAccordion = page.locator('a:has-text("Address"), button:has-text("Address")').first();
    if (await addrAccordion.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addrAccordion.click();
      await page.waitForLoadState('networkidle');
    }

    const appNumAccordion = page.locator('a:has-text("Application Number"), button:has-text("Application Number")').first();
    if (await appNumAccordion.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appNumAccordion.click();
      await page.waitForLoadState('networkidle');
    }

    // Step 4: Click "Status" button beside Inspections to trigger the data view
    const inspLink = page.locator('a:has-text("Status"), button:has-text("Status")').first();
    if (await inspLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inspLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Step 5: Extract the inspection table HTML
    const tableLocator = page.locator('table').first();
    await tableLocator.waitFor({ timeout: 10000 }).catch(() => {});
    const tableHtml = await tableLocator.innerHTML().catch(() => '');
    const inspections = parseInspectionTable(tableHtml);

    console.log(`[${permitNum}] Found ${inspections.length} inspection stages`);

    if (inspections.length > 0) {
      await upsertInspections(permitNum, inspections);
      console.log(`[${permitNum}] Upserted ${inspections.length} inspection records`);
    }

    return inspections;
  } finally {
    await browser.close();
  }
}

async function main() {
  const permitNum = process.argv[2];

  if (!permitNum) {
    // Batch mode: query DB for eligible permits
    const { rows } = await pool.query(`
      SELECT DISTINCT p.permit_num
      FROM permits p
      LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
      WHERE p.status = 'Issued'
        AND p.structure_type ILIKE '%residential%'
        AND (pi.scraped_at IS NULL OR pi.scraped_at < NOW() - INTERVAL '7 days')
      ORDER BY p.permit_num
      LIMIT 10
    `);

    console.log(`Found ${rows.length} permits to scrape`);

    for (const row of rows) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await scrapePermit(row.permit_num);
          break;
        } catch (err) {
          console.error(`[${row.permit_num}] Attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
          if (attempt === MAX_RETRIES) {
            console.error(`[${row.permit_num}] All retries exhausted, skipping`);
          }
        }
      }
    }
  } else {
    // Single permit mode
    await scrapePermit(permitNum);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
