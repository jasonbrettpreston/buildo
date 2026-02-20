#!/usr/bin/env node
/**
 * Load Toronto Neighbourhood Boundaries (GeoJSON) and Neighbourhood Profiles (Census XLSX)
 * into the neighbourhoods table.
 *
 * Usage:
 *   node scripts/load-neighbourhoods.js [boundaries-geojson] [profiles-xlsx]
 *
 * If no paths given, downloads from Toronto Open Data.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const XLSX = require('xlsx');

const BOUNDARIES_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson';

const PROFILES_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/6e19a90f-971c-46b3-852c-0c48c436d1fc/resource/19d4a806-7385-4889-acf2-256f1e079060/download/nbhd_2021_census_profile_full_158model.xlsx';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// Census characteristic row names to extract
const INCOME_CHARACTERISTICS = {
  'Average total income of household in 2020 ($)': 'avg_household_income',
  'Median total income of household in 2020 ($)': 'median_household_income',
  'Average total income in 2020 among recipients ($)': 'avg_individual_income',
};

const PCT_CHARACTERISTIC = 'Prevalence of low income based on the Low-income measure, after tax (LIM-AT) (%)';

// Period of construction rows to find dominant era
const CONSTRUCTION_PERIODS = [
  '1960 or before',
  '1961 to 1980',
  '1981 to 1990',
  '1991 to 2000',
  '2001 to 2005',
  '2006 to 2010',
  '2011 to 2015',
  '2016 to 2021',
];

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
      }
      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && downloaded % (2 * 1024 * 1024) < chunk.length) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          console.log(`  Downloaded: ${(downloaded / 1024 / 1024).toFixed(1)} MB (${pct}%)`);
        }
      });
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Parse neighbourhood ID from column header: "Agincourt North (129)"
// ---------------------------------------------------------------------------
function parseColumnHeader(header) {
  const match = String(header).match(/^(.+)\s*\((\d+)\)$/);
  if (!match) return null;
  return { name: match[1].trim(), neighbourhood_id: parseInt(match[2], 10) };
}

// ---------------------------------------------------------------------------
// Parse numeric value from Census data (handles commas, $, %)
// ---------------------------------------------------------------------------
function parseNumeric(val) {
  if (val == null || val === '' || val === '...' || val === 'x' || val === 'F') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[$,%\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Step 1: Load boundaries GeoJSON
// ---------------------------------------------------------------------------
async function loadBoundaries(geojsonPath) {
  console.log('Step 1: Loading neighbourhood boundaries...');
  const raw = fs.readFileSync(geojsonPath, 'utf8');
  const geojson = JSON.parse(raw);

  let inserted = 0;
  for (const feature of geojson.features) {
    const props = feature.properties;
    const neighbourhoodId = parseInt(props.AREA_S_CD || props.AREA_SHORT_CODE || props.AREA_ID || '0', 10);
    const name = props.AREA_NAME || props.AREA_LONG_CODE || '';

    if (!neighbourhoodId || !name) {
      console.log(`  Skipping feature with missing ID or name`);
      continue;
    }

    await pool.query(
      `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)
       VALUES ($1, $2, $3)
       ON CONFLICT (neighbourhood_id) DO UPDATE SET
         name = EXCLUDED.name,
         geometry = EXCLUDED.geometry`,
      [neighbourhoodId, name, JSON.stringify(feature.geometry)]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} neighbourhood boundaries.`);
  return inserted;
}

// ---------------------------------------------------------------------------
// Step 2: Load Census profiles from XLSX (transposed format)
// ---------------------------------------------------------------------------
async function loadProfiles(xlsxPath) {
  console.log('Step 2: Loading Census profiles from XLSX...');

  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`  Sheet "${sheetName}" has ${rows.length} rows`);

  if (rows.length === 0) {
    console.log('  No data rows found. Skipping profiles.');
    return;
  }

  // Discover neighbourhood columns from headers
  const headers = Object.keys(rows[0]);

  // Find the characteristic column (first column)
  const charColName = headers.find(h =>
    h === 'Characteristic' || h === 'characteristic' || h === 'Neighbourhood Name' || h === '_0'
  ) || headers[0];
  console.log(`  Characteristic column: "${charColName}"`);

  // Build neighbourhood columns mapping
  // Two formats:
  //   1. Headers like "Agincourt North (129)" -> parse name + ID
  //   2. Headers are just names, row 0 contains neighbourhood IDs
  const neighbourhoodColumns = {};
  const row0 = rows[0];
  const row0Char = String(row0[charColName] || '').trim();

  for (const col of headers) {
    if (col === charColName) continue;

    // Try format 1: "Name (ID)"
    const parsed = parseColumnHeader(col);
    if (parsed) {
      neighbourhoodColumns[col] = parsed;
      continue;
    }

    // Try format 2: column name is neighbourhood name, row 0 has the ID
    if (row0Char === 'Neighbourhood Number' || row0Char === 'Neighbourhood ID') {
      const idVal = parseInt(row0[col], 10);
      if (idVal > 0) {
        neighbourhoodColumns[col] = { name: col, neighbourhood_id: idVal };
      }
    }
  }
  console.log(`  Found ${Object.keys(neighbourhoodColumns).length} neighbourhood columns`);

  if (Object.keys(neighbourhoodColumns).length === 0) {
    console.log('  WARNING: No neighbourhood columns found. Listing first 5 headers:');
    headers.slice(0, 5).forEach(h => console.log(`    "${h}"`));
    return;
  }

  // Skip the ID row if present
  const dataRows = row0Char === 'Neighbourhood Number' || row0Char === 'Neighbourhood ID'
    ? rows.slice(1)
    : rows;

  // Accumulators per neighbourhood for computed fields
  const tenureData = {};
  const familyData = {};
  const marriedData = {};
  const educationData = {};
  const immigrantData = {};
  const minorityData = {};
  const languageData = {};
  const constructionData = {};

  let matchedRows = 0;

  for (const record of dataRows) {
    const characteristic = String(record[charColName] || '').trim();
    if (!characteristic) continue;

    // Direct income updates
    if (INCOME_CHARACTERISTICS[characteristic]) {
      const dbCol = INCOME_CHARACTERISTICS[characteristic];
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          await pool.query(
            `UPDATE neighbourhoods SET ${dbCol} = $1 WHERE neighbourhood_id = $2`,
            [Math.round(val), info.neighbourhood_id]
          );
        }
      }
    }

    // Low income percentage
    if (characteristic === PCT_CHARACTERISTIC) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          await pool.query(
            'UPDATE neighbourhoods SET low_income_pct = $1 WHERE neighbourhood_id = $2',
            [val, info.neighbourhood_id]
          );
        }
      }
    }

    // Tenure: Owner and Renter counts
    if (characteristic === 'Owner') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!tenureData[info.neighbourhood_id]) tenureData[info.neighbourhood_id] = { owner: 0, renter: 0 };
          tenureData[info.neighbourhood_id].owner = val;
        }
      }
    }
    if (characteristic === 'Renter') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!tenureData[info.neighbourhood_id]) tenureData[info.neighbourhood_id] = { owner: 0, renter: 0 };
          tenureData[info.neighbourhood_id].renter = val;
        }
      }
    }

    // Construction periods
    if (CONSTRUCTION_PERIODS.includes(characteristic)) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null && val > 0) {
          if (!constructionData[info.neighbourhood_id]) constructionData[info.neighbourhood_id] = {};
          constructionData[info.neighbourhood_id][characteristic] = val;
        }
      }
    }

    // Family
    if (characteristic === 'Total couple families') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!familyData[info.neighbourhood_id]) familyData[info.neighbourhood_id] = { couples: 0, loneParent: 0 };
          familyData[info.neighbourhood_id].couples = val;
        }
      }
    }
    if (characteristic === 'Total one-parent families') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!familyData[info.neighbourhood_id]) familyData[info.neighbourhood_id] = { couples: 0, loneParent: 0 };
          familyData[info.neighbourhood_id].loneParent = val;
        }
      }
    }

    // Married (handle "common law" vs "common-law")
    if (characteristic === 'Married or living common law' || characteristic === 'Married or living common-law') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!marriedData[info.neighbourhood_id]) marriedData[info.neighbourhood_id] = { married: 0, total: 0 };
          marriedData[info.neighbourhood_id].married = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Marital status for the total population aged 15 years and over')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!marriedData[info.neighbourhood_id]) marriedData[info.neighbourhood_id] = { married: 0, total: 0 };
          marriedData[info.neighbourhood_id].total = val;
        }
      }
    }

    // University degree (handle both Census 2016 and 2021 naming)
    if (characteristic === 'University certificate, diploma or degree at bachelor level or above'
        || characteristic.replace(/\u2019/g, "'") === "Bachelor's degree or higher") {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!educationData[info.neighbourhood_id]) educationData[info.neighbourhood_id] = { university: 0, total: 0 };
          educationData[info.neighbourhood_id].university = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Highest certificate, diploma or degree for the population aged')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!educationData[info.neighbourhood_id]) educationData[info.neighbourhood_id] = { university: 0, total: 0 };
          educationData[info.neighbourhood_id].total = val;
        }
      }
    }

    // Immigrants
    if (characteristic === 'Immigrants') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!immigrantData[info.neighbourhood_id]) immigrantData[info.neighbourhood_id] = { immigrants: 0, total: 0 };
          immigrantData[info.neighbourhood_id].immigrants = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Immigrant status and period of immigration for the population in private households')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!immigrantData[info.neighbourhood_id]) immigrantData[info.neighbourhood_id] = { immigrants: 0, total: 0 };
          immigrantData[info.neighbourhood_id].total = val;
        }
      }
    }

    // Visible minority
    if (characteristic === 'Total visible minority population') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!minorityData[info.neighbourhood_id]) minorityData[info.neighbourhood_id] = { visible: 0, total: 0 };
          minorityData[info.neighbourhood_id].visible = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Visible minority for the population in private households')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!minorityData[info.neighbourhood_id]) minorityData[info.neighbourhood_id] = { visible: 0, total: 0 };
          minorityData[info.neighbourhood_id].total = val;
        }
      }
    }

    // English knowledge
    if (characteristic === 'English only') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!languageData[info.neighbourhood_id]) languageData[info.neighbourhood_id] = { english: 0, total: 0 };
          languageData[info.neighbourhood_id].english = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Knowledge of official languages for the')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!languageData[info.neighbourhood_id]) languageData[info.neighbourhood_id] = { english: 0, total: 0 };
          languageData[info.neighbourhood_id].total = val;
        }
      }
    }
  }

  console.log(`  Matched ${matchedRows} characteristic rows for updates.`);
  console.log('  Computing derived percentages...');

  // Compute tenure percentages
  for (const [nid, data] of Object.entries(tenureData)) {
    const total = data.owner + data.renter;
    if (total > 0) {
      await pool.query(
        'UPDATE neighbourhoods SET tenure_owner_pct = $1, tenure_renter_pct = $2 WHERE neighbourhood_id = $3',
        [Math.round((data.owner / total) * 1000) / 10, Math.round((data.renter / total) * 1000) / 10, parseInt(nid, 10)]
      );
    }
  }

  // Dominant construction period
  const periodMap = {
    '1960 or before': 'pre-1960',
    '1961 to 1980': '1961-1980',
    '1981 to 1990': '1981-1990',
    '1991 to 2000': '1991-2000',
    '2001 to 2005': '2001-2005',
    '2006 to 2010': '2006-2010',
    '2011 to 2015': '2011-2015',
    '2016 to 2021': '2016-2021',
  };
  for (const [nid, periods] of Object.entries(constructionData)) {
    let maxCount = 0;
    let dominant = null;
    for (const [period, count] of Object.entries(periods)) {
      if (count > maxCount) { maxCount = count; dominant = period; }
    }
    if (dominant) {
      await pool.query(
        'UPDATE neighbourhoods SET period_of_construction = $1 WHERE neighbourhood_id = $2',
        [periodMap[dominant] || dominant, parseInt(nid, 10)]
      );
    }
  }

  // Family percentages
  for (const [nid, data] of Object.entries(familyData)) {
    const total = data.couples + data.loneParent;
    if (total > 0) {
      await pool.query(
        'UPDATE neighbourhoods SET couples_pct = $1, lone_parent_pct = $2 WHERE neighbourhood_id = $3',
        [Math.round((data.couples / total) * 1000) / 10, Math.round((data.loneParent / total) * 1000) / 10, parseInt(nid, 10)]
      );
    }
  }

  // Married percentage
  for (const [nid, data] of Object.entries(marriedData)) {
    if (data.total > 0) {
      await pool.query('UPDATE neighbourhoods SET married_pct = $1 WHERE neighbourhood_id = $2',
        [Math.round((data.married / data.total) * 1000) / 10, parseInt(nid, 10)]);
    }
  }

  // University degree percentage
  for (const [nid, data] of Object.entries(educationData)) {
    if (data.total > 0) {
      await pool.query('UPDATE neighbourhoods SET university_degree_pct = $1 WHERE neighbourhood_id = $2',
        [Math.round((data.university / data.total) * 1000) / 10, parseInt(nid, 10)]);
    }
  }

  // Immigrant percentage
  for (const [nid, data] of Object.entries(immigrantData)) {
    if (data.total > 0) {
      await pool.query('UPDATE neighbourhoods SET immigrant_pct = $1 WHERE neighbourhood_id = $2',
        [Math.round((data.immigrants / data.total) * 1000) / 10, parseInt(nid, 10)]);
    }
  }

  // Visible minority percentage
  for (const [nid, data] of Object.entries(minorityData)) {
    if (data.total > 0) {
      await pool.query('UPDATE neighbourhoods SET visible_minority_pct = $1 WHERE neighbourhood_id = $2',
        [Math.round((data.visible / data.total) * 1000) / 10, parseInt(nid, 10)]);
    }
  }

  // English knowledge percentage
  for (const [nid, data] of Object.entries(languageData)) {
    if (data.total > 0) {
      await pool.query('UPDATE neighbourhoods SET english_knowledge_pct = $1 WHERE neighbourhood_id = $2',
        [Math.round((data.english / data.total) * 1000) / 10, parseInt(nid, 10)]);
    }
  }

  console.log('  Census profile updates complete.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Buildo Neighbourhood Loader ===');
  console.log('');

  let boundariesPath = process.argv[2];
  let profilesPath = process.argv[3];

  // Download boundaries if not provided
  if (!boundariesPath) {
    boundariesPath = path.join(__dirname, '..', 'neighbourhoods-4326.geojson');
    if (!fs.existsSync(boundariesPath)) {
      console.log('Downloading Neighbourhood Boundaries GeoJSON...');
      await downloadFile(BOUNDARIES_URL, boundariesPath);
      console.log('Download complete.');
    } else {
      console.log(`Using cached boundaries: ${boundariesPath}`);
    }
  }

  // Download profiles if not provided
  if (!profilesPath) {
    profilesPath = path.join(__dirname, '..', 'neighbourhood-profiles-2021.xlsx');
    if (!fs.existsSync(profilesPath)) {
      console.log('Downloading Neighbourhood Profiles XLSX...');
      await downloadFile(PROFILES_URL, profilesPath);
      console.log('Download complete.');
    } else {
      console.log(`Using cached profiles: ${profilesPath}`);
    }
  }

  console.log('');

  const startTime = Date.now();

  // Step 1: Load boundaries
  const boundaryCount = await loadBoundaries(boundariesPath);

  // Step 2: Load Census profiles
  await loadProfiles(profilesPath);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Load Complete ===');
  console.log(`Neighbourhoods: ${boundaryCount}`);
  console.log(`Duration:       ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});
