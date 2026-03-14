#!/usr/bin/env node
/**
 * PoC AIC Inspection Scraper
 *
 * Scrapes building permit inspection statuses from the City of Toronto
 * Application Information Centre (AIC) portal.
 *
 * Usage:
 *   node scripts/poc-aic-scraper.js                    # batch mode (10 permits)
 *   node scripts/poc-aic-scraper.js "24 132854"        # single permit by year+sequence
 *
 * Requires: playwright, playwright-extra, puppeteer-extra-plugin-stealth
 * Env vars: PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 */

const pipeline = require('./lib/pipeline');

const AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus';
const PAGE_TIMEOUT = 30000;
const MAX_RETRIES = 3;

// Target permit types for stage-level scraping (Spec 38 §3.6)
const TARGET_TYPES = [
  'Small Residential Projects',
  'Building Additions/Alterations',
  'New Houses',
];

// Realistic user agent — MANDATORY, portal blocks headless Chrome
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Status mapping: portal values → DB values (Spec 38 §3.4)
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
  if (!trimmed || trimmed === '-' || trimmed === 'N/A') return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // "Mon D, YYYY" / "Month D, YYYY" format (AIC portal uses this)
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
    const status = normalizeStatus(cells[1]);

    if (!status || stageName.toLowerCase() === 'inspection stage') continue;

    const inspectionDate = cells.length >= 3 ? parseInspectionDate(cells[2]) : null;
    results.push({ stage_name: stageName, status, inspection_date: inspectionDate });
  }

  return results;
}

async function launchBrowser() {
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch {
    pipeline.log.error('[scraper]', 'Playwright not installed. Run: npm install playwright playwright-extra puppeteer-extra-plugin-stealth');
    throw new Error('Missing dependency: playwright');
  }

  let addExtra, StealthPlugin;
  try {
    addExtra = require('playwright-extra').addExtra;
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
  } catch {
    pipeline.log.warn('[scraper]', 'Stealth plugin not installed — portal will likely block requests');
  }

  const proxyServer =
    process.env.PROXY_HOST && process.env.PROXY_PORT
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
    userAgent: USER_AGENT,
    ...(process.env.PROXY_USER && {
      httpCredentials: {
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS || '',
      },
    }),
  });

  return { browser, context };
}

/**
 * Scrape all inspection data for a given year+sequence.
 * One search can yield multiple permits at the same address.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} yearSeq - e.g. "24 132854"
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ searched: number, scraped: number, upserted: number }>}
 */
async function scrapeYearSequence(context, yearSeq, pool) {
  const [year, sequence] = yearSeq.split(' ');
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT);

  // Asset blocking to reduce bandwidth (Spec 38 §3.7)
  await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf,ico}', (route) =>
    route.abort()
  );

  let searched = 0;
  let scraped = 0;
  let upserted = 0;

  try {
    // Step 1: Initialize session
    await page.goto(`${AIC_BASE}/setup.do?action=init`);
    await page.waitForLoadState('networkidle');

    // Step 2: Fill year (box 1) and sequence (box 2) — leave type/revision/work empty
    // The portal has 5 input boxes for the application number parts
    const inputs = await page.locator('input[type="text"]').all();
    if (inputs.length < 2) {
      pipeline.log.warn('[scraper]', `Unexpected form layout — found ${inputs.length} text inputs`, { yearSeq });
      return { searched: 0, scraped: 0, upserted: 0 };
    }

    // Hide the map overlay that intercepts pointer events
    await page.evaluate(() => {
      const mapContainer = document.getElementById('mapContainer');
      if (mapContainer) mapContainer.style.display = 'none';
    });

    // Use JavaScript to set values and trigger change events
    await page.evaluate(
      ([y, s]) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        inputs[0].value = y;
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        inputs[1].value = s;
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      },
      [year, sequence]
    );

    // Step 3: Click Search via JS (bypasses any remaining overlay issues)
    await page.evaluate(() => {
      const btn = document.getElementById('submitButton');
      if (btn) btn.click();
    });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    searched = 1;

    // Step 4: Click "Show Results" via JS (button may be initially disabled, wait for it)
    await page.waitForFunction(() => {
      const btn = document.getElementById('showResultsLink');
      return btn && !btn.disabled;
    }, { timeout: 10000 }).catch(() => {
      pipeline.log.warn('[scraper]', 'Show Results button never became enabled');
    });

    await page.evaluate(() => {
      const btn = document.getElementById('showResultsLink');
      if (btn && !btn.disabled) btn.click();
    });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Step 5: Click the address row to expand all permits at this address
    // The address is in a table row — it may be a link or a clickable row
    const addressClicked = await page.evaluate(() => {
      // Try clicking the address table row (second row, first is header)
      const rows = document.querySelectorAll('table tr');
      for (const row of rows) {
        const text = row.textContent.trim();
        // Skip header rows, look for rows with street addresses
        if (text === 'Address' || !text) continue;
        // Click any link in the row first, otherwise click the row itself
        const link = row.querySelector('a');
        if (link) {
          link.click();
          return link.textContent.trim();
        }
        // Some rows are clickable divs/tds
        const td = row.querySelector('td');
        if (td) {
          td.click();
          return td.textContent.trim();
        }
      }
      return null;
    });

    if (addressClicked) {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      pipeline.log.info('[scraper]', `Clicked address: ${addressClicked}`, { yearSeq });
    } else {
      pipeline.log.warn('[scraper]', 'No address found to click', { yearSeq });
    }

    // Step 6: Read the address permit table and find Inspection permits
    // Use evaluate to extract structured data from the permit table
    const permits = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const results = [];
      for (const row of rows) {
        const tds = row.querySelectorAll('td');
        if (tds.length < 4) continue;
        const appNum = tds[0].textContent.trim();
        const appType = tds[1].textContent.trim();
        const date = tds[2].textContent.trim();
        const status = tds[3].textContent.trim();
        const link = tds[0].querySelector('a');
        results.push({ appNum, appType, date, status, hasLink: !!link });
      }
      return results;
    });

    const inspectionPermits = permits.filter((p) => p.status === 'Inspection' && p.hasLink);
    pipeline.log.info('[scraper]', `Found ${permits.length} permits, ${inspectionPermits.length} in Inspection`, {
      permits: permits.map((p) => `${p.appNum} [${p.status}]`),
    });

    for (const permit of inspectionPermits) {
      pipeline.log.info('[scraper]', `Processing: ${permit.appNum}`, { type: permit.appType });

      try {
        // Step 7: Click permit application# link via JS
        const clicked = await page.evaluate((appNum) => {
          const rows = document.querySelectorAll('table tr');
          for (const row of rows) {
            const td = row.querySelector('td');
            if (td && td.textContent.trim() === appNum) {
              const link = td.querySelector('a');
              if (link) { link.click(); return true; }
            }
          }
          return false;
        }, permit.appNum);

        if (!clicked) {
          pipeline.log.warn('[scraper]', `Could not click link for ${permit.appNum}`);
          continue;
        }

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Step 8: Look for "Status" link specifically in the Inspection Process section
        // The portal has multiple "Status" links — one for Orders and one for Inspections
        // We need the one near "Inspection Process" text, NOT "Orders Issued"
        const statusLinkFound = await page.evaluate(() => {
          // Find the Inspection Process section first, then find the Status link within it
          const allText = document.body.innerHTML;
          const inspProcIndex = allText.indexOf('Inspection Process');
          const ordersIndex = allText.indexOf('Orders Issued');

          const links = document.querySelectorAll('a');
          let inspectionStatusLink = null;

          for (const link of links) {
            if (link.textContent.trim() === 'Status') {
              // Check if this link is near the Inspection Process section
              // by seeing if it appears before the Orders section
              const linkHtml = link.outerHTML;
              const linkIndex = allText.indexOf(linkHtml);

              if (inspProcIndex >= 0 && linkIndex > inspProcIndex) {
                // Found a Status link after Inspection Process
                if (ordersIndex < 0 || linkIndex < ordersIndex) {
                  // And before Orders Issued (if it exists)
                  inspectionStatusLink = link;
                  break;
                }
              }
              // Fallback: if no Inspection Process section, use first Status link
              if (!inspectionStatusLink) inspectionStatusLink = link;
            }
          }

          if (inspectionStatusLink) {
            inspectionStatusLink.click();
            return true;
          }
          return false;
        });

        if (!statusLinkFound) {
          pipeline.log.info('[scraper]', `No Status link for ${permit.appNum} — stages not yet created by inspector`);
          await page.goBack();
          await page.waitForLoadState('networkidle');
          continue;
        }

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Step 9: Parse the inspection stages table
        // The inspection stages appear in a section/modal after clicking Status
        // Look for a table with "Inspection Stage" or stage-like columns
        const tableHtml = await page.evaluate(() => {
          const tables = document.querySelectorAll('table');
          // Find the table that has inspection stage data (not Orders)
          for (const table of tables) {
            const text = table.innerText;
            // Inspection stages table has status values like Outstanding/Passed/Not Passed
            if (text.includes('Outstanding') || text.includes('Passed') || text.includes('Not Passed')) {
              return table.innerHTML;
            }
            // Also check for column headers specific to inspection stages
            const headers = table.querySelectorAll('th');
            const headerTexts = Array.from(headers).map(h => h.textContent.trim());
            if (headerTexts.includes('Inspection Stage') || headerTexts.includes('Stage')) {
              return table.innerHTML;
            }
          }
          return '';
        });

        const inspections = parseInspectionTable(tableHtml);

        if (inspections.length > 0) {
          // Extract permit_num (first 3 parts: YY NNNNNN TYPE)
          const permitNum = permit.appNum.split(/\s+/).slice(0, 3).join(' ');

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

          upserted += inspections.length;
          scraped++;
          pipeline.log.info('[scraper]', `Scraped ${inspections.length} stages for ${permitNum}`, {
            stages: inspections.map((i) => `${i.stage_name}: ${i.status}`),
          });
        } else {
          pipeline.log.warn('[scraper]', `No stages parsed for ${permit.appNum}`);
        }

        // Navigate back for next permit
        await page.goBack();
        await page.waitForLoadState('networkidle');
        await page.goBack();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      } catch (err) {
        pipeline.log.error('[scraper]', err, { appNum: permit.appNum, phase: 'permit_scrape' });
        try {
          await page.goto(`${AIC_BASE}/setup.do?action=init`);
          await page.waitForLoadState('networkidle');
        } catch {
          break;
        }
      }
    }
  } finally {
    await page.close();
  }

  return { searched, scraped, upserted };
}

pipeline.run('poc-aic-scraper', async (pool) => {
  const singlePermit = process.argv[2];
  const startMs = Date.now();

  let totalSearched = 0;
  let totalScraped = 0;
  let totalUpserted = 0;

  const { browser, context } = await launchBrowser();

  try {
    if (singlePermit) {
      // Single permit mode — scrape one year+sequence
      pipeline.log.info('[scraper]', `Single permit mode: ${singlePermit}`);

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await scrapeYearSequence(context, singlePermit, pool);
          totalSearched += result.searched;
          totalScraped += result.scraped;
          totalUpserted += result.upserted;
          break;
        } catch (err) {
          pipeline.log.error('[scraper]', err, {
            permit: singlePermit,
            attempt,
            maxRetries: MAX_RETRIES,
          });
          if (attempt === MAX_RETRIES) {
            pipeline.log.error('[scraper]', `All retries exhausted for ${singlePermit}`);
          }
        }
      }
    } else {
      // Batch mode: query DB for eligible permits (target types, Inspection status, not recently scraped)
      const { rows } = await pool.query(
        `SELECT DISTINCT SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+') AS year_seq
         FROM permits p
         LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
         WHERE p.status = 'Inspection'
           AND p.permit_type = ANY($1)
           AND (pi.scraped_at IS NULL OR pi.scraped_at < NOW() - INTERVAL '7 days')
         ORDER BY year_seq
         LIMIT 10`,
        [TARGET_TYPES]
      );

      pipeline.log.info('[scraper]', `Batch mode: ${rows.length} year+sequence combos to scrape`);

      for (let i = 0; i < rows.length; i++) {
        const yearSeq = rows[i].year_seq;
        pipeline.progress('poc-aic-scraper', i + 1, rows.length, startMs);

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const result = await scrapeYearSequence(context, yearSeq, pool);
            totalSearched += result.searched;
            totalScraped += result.scraped;
            totalUpserted += result.upserted;
            break;
          } catch (err) {
            pipeline.log.error('[scraper]', err, {
              yearSeq,
              attempt,
              maxRetries: MAX_RETRIES,
            });
            if (attempt === MAX_RETRIES) {
              pipeline.log.error('[scraper]', `All retries exhausted for ${yearSeq}, skipping`);
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  pipeline.log.info('[scraper]', 'Scrape complete', {
    searched: totalSearched,
    scraped: totalScraped,
    upserted: totalUpserted,
  });

  pipeline.emitSummary({
    records_total: totalSearched,
    records_new: totalUpserted,
    records_updated: 0,
  });

  pipeline.emitMeta(
    { permits: ['permit_num', 'status', 'permit_type'] },
    { permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date', 'scraped_at'] },
    ['AIC Portal (secure.toronto.ca)']
  );
});
