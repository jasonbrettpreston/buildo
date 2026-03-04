#!/usr/bin/env node
/**
 * Investigate whether PLB/MS/DM permits share a base permit number
 * with BLD permits, or if we need address-based grouping.
 *
 * Checks:
 * 1. Permit number format distribution (with/without type codes)
 * 2. Whether stripping the code suffix produces shared base numbers
 * 3. Address-based co-occurrence of BLD + PLB/MS/DM
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

async function main() {
  console.log('=== Permit Number Linking Analysis ===\n');

  // 1. How many permits have type codes embedded in permit_num?
  const codeDistribution = await pool.query(`
    SELECT
      CASE
        WHEN permit_num ~ '\\s[A-Z]{2,4}(\\s|$)' THEN
          (regexp_match(permit_num, '\\s([A-Z]{2,4})(?:\\s|$)'))[1]
        ELSE 'NO_CODE'
      END AS code,
      COUNT(*) as cnt
    FROM permits
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('--- Permit Number Code Distribution ---');
  for (const row of codeDistribution.rows) {
    console.log(`  ${(row.code || 'NO_CODE').padEnd(10)} ${String(row.cnt).padStart(8)}`);
  }

  // 2. Extract base number (first 8+ chars before the code) and check for shared bases
  // Format: "YY NNNNNN CODE NN" → base = "YY NNNNNN"
  const sharedBases = await pool.query(`
    WITH parsed AS (
      SELECT
        permit_num,
        revision_num,
        TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) AS base_num,
        CASE
          WHEN permit_num ~ '\\s[A-Z]{2,4}(\\s|$)' THEN
            (regexp_match(permit_num, '\\s([A-Z]{2,4})(?:\\s|$)'))[1]
          ELSE NULL
        END AS code,
        street_num, street_name, street_type
      FROM permits
    ),
    bases_with_multiple_codes AS (
      SELECT base_num, array_agg(DISTINCT code ORDER BY code) AS codes, COUNT(DISTINCT code) AS code_count
      FROM parsed
      WHERE code IS NOT NULL
      GROUP BY base_num
      HAVING COUNT(DISTINCT code) > 1
    )
    SELECT code_count, codes::text, COUNT(*) AS base_count
    FROM bases_with_multiple_codes
    GROUP BY code_count, codes::text
    ORDER BY base_count DESC
    LIMIT 20
  `);
  console.log('\n--- Base Numbers Shared by Multiple Codes ---');
  console.log('  (If BLD+PLB share base "21 123456", they would appear here)');
  if (sharedBases.rows.length === 0) {
    console.log('  NONE FOUND — base numbers are NOT shared across codes');
  } else {
    for (const row of sharedBases.rows) {
      console.log(`  ${row.codes.padEnd(30)} ${String(row.base_count).padStart(6)} base numbers`);
    }
  }

  // 3. Show a few example permit_nums with codes for manual inspection
  const examples = await pool.query(`
    SELECT permit_num, permit_type, work, street_num, street_name
    FROM permits
    WHERE permit_num ~ '\\s(PLB|BLD|MS|DM)\\s'
    ORDER BY street_name, street_num, permit_num
    LIMIT 30
  `);
  console.log('\n--- Sample Permits with Type Codes ---');
  for (const row of examples.rows) {
    const addr = `${row.street_num} ${row.street_name}`.padEnd(25);
    console.log(`  ${row.permit_num.padEnd(22)} ${row.permit_type.padEnd(30)} ${addr}`);
  }

  // 4. Address-based co-occurrence: how many addresses have BOTH a BLD and a PLB/MS/DM?
  const coOccurrence = await pool.query(`
    WITH coded AS (
      SELECT
        permit_num,
        street_num, street_name, street_type,
        CASE
          WHEN permit_num ~ '\\s[A-Z]{2,4}(\\s|$)' THEN
            (regexp_match(permit_num, '\\s([A-Z]{2,4})(?:\\s|$)'))[1]
          ELSE NULL
        END AS code
      FROM permits
    ),
    addr_codes AS (
      SELECT
        street_num || ' ' || street_name || ' ' || street_type AS address,
        array_agg(DISTINCT code ORDER BY code) AS codes,
        COUNT(DISTINCT code) AS code_count
      FROM coded
      WHERE code IN ('BLD', 'PLB', 'MS', 'DM', 'DRN', 'STS')
      GROUP BY 1
      HAVING COUNT(DISTINCT code) > 1
    )
    SELECT codes::text, COUNT(*) AS address_count
    FROM addr_codes
    GROUP BY codes::text
    ORDER BY address_count DESC
    LIMIT 20
  `);
  console.log('\n--- Address-Based Co-occurrence (BLD + narrow-scope) ---');
  if (coOccurrence.rows.length === 0) {
    console.log('  No addresses found with both BLD and narrow-scope permits');
  } else {
    for (const row of coOccurrence.rows) {
      console.log(`  ${row.codes.padEnd(30)} ${String(row.address_count).padStart(6)} addresses`);
    }
  }

  // 5. Also check: do most permits even HAVE the code in permit_num?
  // Some Toronto data may use permit_type instead
  const noCodeByType = await pool.query(`
    SELECT permit_type, COUNT(*) as cnt
    FROM permits
    WHERE permit_num !~ '\\s[A-Z]{2,4}(\\s|$)'
    GROUP BY permit_type
    ORDER BY cnt DESC
    LIMIT 15
  `);
  console.log('\n--- Permits WITHOUT Code in permit_num (by permit_type) ---');
  for (const row of noCodeByType.rows) {
    console.log(`  ${row.permit_type.padEnd(40)} ${String(row.cnt).padStart(8)}`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
