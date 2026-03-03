#!/usr/bin/env node
/**
 * Link similar permits by propagating scope tags from BLD permits to companion
 * permits (PLB, MS, DM, etc.) that share the same base permit number.
 *
 * A BLD permit "24 123456 BLD 00" has companions like "24 123456 PLB 00",
 * "24 123456 MS 00". This script copies the BLD's scope_tags and project_type
 * to those companions so they inherit the same classification.
 *
 * Usage: node scripts/link-similar.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

async function run() {
  console.log('Linking similar permits (BLD → companion propagation)...\n');

  // Propagate scope_tags + project_type from BLD to companion permits
  const propagateResult = await pool.query(
    `UPDATE permits AS companion
     SET
       scope_tags = bld.scope_tags,
       project_type = bld.project_type,
       scope_classified_at = NOW(),
       scope_source = 'propagated'
     FROM (
       SELECT
         TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) AS base_num,
         scope_tags,
         project_type
       FROM permits
       WHERE permit_num ~ '\\sBLD(\\s|$)'
         AND scope_tags IS NOT NULL
         AND array_length(scope_tags, 1) > 0
     ) AS bld
     WHERE TRIM(SPLIT_PART(companion.permit_num, ' ', 1) || ' ' || SPLIT_PART(companion.permit_num, ' ', 2)) = bld.base_num
       AND companion.permit_num !~ '\\sBLD(\\s|$)'
       AND companion.permit_num ~ '\\s[A-Z]{2,4}(\\s|$)'`
  );

  const propagated = propagateResult.rowCount || 0;
  console.log(`Propagated scope tags to ${propagated.toLocaleString()} companion permits`);

  // Re-add demolition tag to DM permits that lost it during propagation
  const demFixResult = await pool.query(
    `UPDATE permits
     SET scope_tags = array_append(scope_tags, 'demolition')
     WHERE permit_type = 'Demolition Folder (DM)'
       AND NOT ('demolition' = ANY(scope_tags))`
  );
  const demFixed = demFixResult.rowCount || 0;
  if (demFixed > 0) {
    console.log(`Re-added demolition tag to ${demFixed} DM companion permits`);
  }

  console.log('\nDone.');
  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
