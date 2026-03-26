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
const pipeline = require('./lib/pipeline');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ExcelJS = require('exceljs');

const BOUNDARIES_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson';

const PROFILES_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/6e19a90f-971c-46b3-852c-0c48c436d1fc/resource/19d4a806-7385-4889-acf2-256f1e079060/download/nbhd_2021_census_profile_full_158model.xlsx';

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
          pipeline.log.info('[load-neighbourhoods]',`  Downloaded: ${(downloaded / 1024 / 1024).toFixed(1)} MB (${pct}%)`);
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
async function loadBoundaries(pool, geojsonPath, hasPostGIS) {
  pipeline.log.info('[load-neighbourhoods]','Step 1: Loading neighbourhood boundaries...');
  const raw = fs.readFileSync(geojsonPath, 'utf8');
  const geojson = JSON.parse(raw);

  const geomLine = hasPostGIS
    ? ', geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)'
    : '';

  let inserted = 0;
  await pipeline.withTransaction(pool, async (client) => {
    for (const feature of geojson.features) {
      const props = feature.properties;
      const neighbourhoodId = parseInt(props.AREA_S_CD || props.AREA_SHORT_CODE || props.AREA_ID || '0', 10);
      const name = props.AREA_NAME || props.AREA_LONG_CODE || '';

      if (!neighbourhoodId || !name) {
        pipeline.log.info('[load-neighbourhoods]',`  Skipping feature with missing ID or name`);
        continue;
      }

      await client.query(
        `INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)
         VALUES ($1, $2, $3)
         ON CONFLICT (neighbourhood_id) DO UPDATE SET
           name = EXCLUDED.name,
           geometry = EXCLUDED.geometry${geomLine}
         WHERE neighbourhoods.name IS DISTINCT FROM EXCLUDED.name
            OR neighbourhoods.geometry::text IS DISTINCT FROM EXCLUDED.geometry::text`,
        [neighbourhoodId, name, JSON.stringify(feature.geometry)]
      );
      inserted++;
    }
  });

  pipeline.log.info('[load-neighbourhoods]',`  Inserted ${inserted} neighbourhood boundaries.`);
  return inserted;
}

// ---------------------------------------------------------------------------
// Step 2: Load Census profiles from XLSX (transposed format)
// ---------------------------------------------------------------------------
async function loadProfiles(pool, xlsxPath) {
  pipeline.log.info('[load-neighbourhoods]','Step 2: Loading Census profiles from XLSX...');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.worksheets[0];
  const sheetName = sheet.name;

  // Convert ExcelJS sheet to array-of-objects (like xlsx sheet_to_json)
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.value != null ? String(cell.value) : `_${colNumber}`;
  });
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber] || `_${colNumber}`;
      obj[key] = cell.value != null ? cell.value : '';
    });
    // Fill missing columns with default ''
    for (const h of headers) {
      if (h && !(h in obj)) obj[h] = '';
    }
    rows.push(obj);
  });

  pipeline.log.info('[load-neighbourhoods]',`  Sheet "${sheetName}" has ${rows.length} rows`);

  if (rows.length === 0) {
    pipeline.log.info('[load-neighbourhoods]','  No data rows found. Skipping profiles.');
    return;
  }

  // Discover neighbourhood columns from headers
  const headerKeys = Object.keys(rows[0]);

  // Find the characteristic column (first column)
  const charColName = headerKeys.find(h =>
    h === 'Characteristic' || h === 'characteristic' || h === 'Neighbourhood Name' || h === '_0'
  ) || headerKeys[0];
  pipeline.log.info('[load-neighbourhoods]',`  Characteristic column: "${charColName}"`);

  // Build neighbourhood columns mapping
  // Two formats:
  //   1. Headers like "Agincourt North (129)" -> parse name + ID
  //   2. Headers are just names, row 0 contains neighbourhood IDs
  const neighbourhoodColumns = {};
  const row0 = rows[0];
  const row0Char = String(row0[charColName] || '').trim();

  for (const col of headerKeys) {
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
  pipeline.log.info('[load-neighbourhoods]',`  Found ${Object.keys(neighbourhoodColumns).length} neighbourhood columns`);

  if (Object.keys(neighbourhoodColumns).length === 0) {
    pipeline.log.info('[load-neighbourhoods]','  WARNING: No neighbourhood columns found. Listing first 5 headers:');
    headerKeys.slice(0, 5).forEach(h => pipeline.log.info('[load-neighbourhoods]', `    "${h}"`));
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

  pipeline.log.info('[load-neighbourhoods]',`  Matched ${matchedRows} characteristic rows for updates.`);
  pipeline.log.info('[load-neighbourhoods]','  Computing derived percentages...');

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

  // Bulk update: married, university_degree, immigrant, visible_minority, english_knowledge percentages
  const censusIds = [...new Set([
    ...Object.keys(marriedData),
    ...Object.keys(educationData),
    ...Object.keys(immigrantData),
    ...Object.keys(minorityData),
    ...Object.keys(languageData),
  ])];

  if (censusIds.length > 0) {
    const ids = censusIds.map(id => parseInt(id, 10));
    const marriedPcts = ids.map(id => {
      const d = marriedData[id]; return d && d.total > 0 ? Math.round((d.married / d.total) * 1000) / 10 : null;
    });
    const universityPcts = ids.map(id => {
      const d = educationData[id]; return d && d.total > 0 ? Math.round((d.university / d.total) * 1000) / 10 : null;
    });
    const immigrantPcts = ids.map(id => {
      const d = immigrantData[id]; return d && d.total > 0 ? Math.round((d.immigrants / d.total) * 1000) / 10 : null;
    });
    const minorityPcts = ids.map(id => {
      const d = minorityData[id]; return d && d.total > 0 ? Math.round((d.visible / d.total) * 1000) / 10 : null;
    });
    const englishPcts = ids.map(id => {
      const d = languageData[id]; return d && d.total > 0 ? Math.round((d.english / d.total) * 1000) / 10 : null;
    });

    await pipeline.withTransaction(pool, async (client) => {
      await client.query(`
        UPDATE neighbourhoods AS n SET
          married_pct = COALESCE(v.married_pct, n.married_pct),
          university_degree_pct = COALESCE(v.university_degree_pct, n.university_degree_pct),
          immigrant_pct = COALESCE(v.immigrant_pct, n.immigrant_pct),
          visible_minority_pct = COALESCE(v.visible_minority_pct, n.visible_minority_pct),
          english_knowledge_pct = COALESCE(v.english_knowledge_pct, n.english_knowledge_pct)
        FROM (
          SELECT unnest($1::int[]) AS neighbourhood_id,
                 unnest($2::float[]) AS married_pct,
                 unnest($3::float[]) AS university_degree_pct,
                 unnest($4::float[]) AS immigrant_pct,
                 unnest($5::float[]) AS visible_minority_pct,
                 unnest($6::float[]) AS english_knowledge_pct
        ) AS v
        WHERE n.neighbourhood_id = v.neighbourhood_id
      `, [ids, marriedPcts, universityPcts, immigrantPcts, minorityPcts, englishPcts]);
    });
  }

  pipeline.log.info('[load-neighbourhoods]','  Census profile updates complete.');
  return matchedRows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
pipeline.run('load-neighbourhoods', async (pool) => {
  pipeline.log.info('[load-neighbourhoods]','=== Buildo Neighbourhood Loader ===');
  pipeline.log.info('[load-neighbourhoods]','');

  let boundariesPath = process.argv[2];
  let profilesPath = process.argv[3];

  // Download boundaries if not provided
  if (!boundariesPath) {
    boundariesPath = path.join(__dirname, '..', 'data', 'neighbourhoods-4326.geojson');
    if (!fs.existsSync(boundariesPath)) {
      pipeline.log.info('[load-neighbourhoods]','Downloading Neighbourhood Boundaries GeoJSON...');
      await downloadFile(BOUNDARIES_URL, boundariesPath);
      pipeline.log.info('[load-neighbourhoods]','Download complete.');
    } else {
      pipeline.log.info('[load-neighbourhoods]',`Using cached boundaries: ${boundariesPath}`);
    }
  }

  // Download profiles if not provided
  if (!profilesPath) {
    profilesPath = path.join(__dirname, '..', 'data', 'neighbourhood-profiles-2021.xlsx');
    if (!fs.existsSync(profilesPath)) {
      pipeline.log.info('[load-neighbourhoods]','Downloading Neighbourhood Profiles XLSX...');
      await downloadFile(PROFILES_URL, profilesPath);
      pipeline.log.info('[load-neighbourhoods]','Download complete.');
    } else {
      pipeline.log.info('[load-neighbourhoods]',`Using cached profiles: ${profilesPath}`);
    }
  }

  // Detect PostGIS for optional geom column population
  const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  const hasPostGIS = pgisCheck.rows.length > 0;
  if (!hasPostGIS) pipeline.log.info('[load-neighbourhoods]', 'PostGIS not installed — skipping geom column');
  pipeline.log.info('[load-neighbourhoods]','');

  const startTime = Date.now();

  // Step 1: Load boundaries
  const boundaryCount = await loadBoundaries(pool, boundariesPath, hasPostGIS);

  // Step 2: Load Census profiles
  const profileUpdates = await loadProfiles(pool, profilesPath);

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[load-neighbourhoods]', 'Load complete', {
    boundaries: boundaryCount, census_updates: profileUpdates,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  const auditRows = [
    { metric: 'boundaries_loaded', value: boundaryCount, threshold: '>= 158', status: boundaryCount >= 158 ? 'PASS' : 'FAIL' },
    { metric: 'census_rows_matched', value: profileUpdates, threshold: null, status: 'INFO' },
    { metric: 'has_postgis', value: hasPostGIS ? 'yes' : 'no', threshold: null, status: 'INFO' },
  ];
  const hasFails = boundaryCount < 158;

  pipeline.emitSummary({
    records_total: boundaryCount,
    records_new: boundaryCount,
    records_updated: profileUpdates,
    records_meta: {
      duration_ms: durationMs,
      boundaries_loaded: boundaryCount,
      census_rows_matched: profileUpdates,
      has_postgis: hasPostGIS,
      audit_table: {
        phase: 24,
        name: 'Neighbourhood Boundaries',
        verdict: hasFails ? 'FAIL' : 'PASS',
        rows: auditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "City GeoJSON": ["AREA_SHORT_CODE", "AREA_NAME", "geometry"], "Census XLSX": ["income", "tenure", "demographics"] },
    { "neighbourhoods": ["neighbourhood_id", "name", "geometry", "geom", "avg_household_income", "median_household_income", "avg_individual_income", "low_income_pct", "tenure_owner_pct", "tenure_renter_pct", "period_of_construction", "couples_pct", "lone_parent_pct", "married_pct", "university_degree_pct", "immigrant_pct", "visible_minority_pct", "english_knowledge_pct"] }
  );
});
