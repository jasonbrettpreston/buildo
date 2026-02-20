#!/usr/bin/env node
/**
 * Link residential permits to parcels via address matching.
 *
 * Two-step cascade:
 *   1. Exact address (num + name + type) -> confidence 0.95
 *   2. Num + name only (ignore type mismatch) -> confidence 0.80
 *
 * Only processes residential permits (structure_type contains SFD,
 * Residential, Row, Town, Laneway, Semi).
 *
 * Usage: node scripts/link-parcels.js
 */
const { Pool } = require('pg');

const BATCH_SIZE = 1000;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// Residential structure types to process
const RESIDENTIAL_PATTERNS = [
  'SFD', 'Residential', 'Row', 'Town', 'Laneway', 'Semi',
];

function isResidential(structureType) {
  if (!structureType) return false;
  const lower = structureType.toLowerCase();
  return RESIDENTIAL_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

async function main() {
  console.log('=== Buildo Permit-Parcel Linker ===');
  console.log('');

  // Count residential permits
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM permits
     WHERE structure_type IS NOT NULL
       AND (
         structure_type ILIKE '%SFD%'
         OR structure_type ILIKE '%Residential%'
         OR structure_type ILIKE '%Row%'
         OR structure_type ILIKE '%Town%'
         OR structure_type ILIKE '%Laneway%'
         OR structure_type ILIKE '%Semi%'
       )`
  );
  const totalPermits = parseInt(countResult.rows[0].total, 10);
  console.log(`Residential permits to process: ${totalPermits.toLocaleString()}`);

  // Count already linked
  const linkedCount = await pool.query('SELECT COUNT(*) as total FROM permit_parcels');
  console.log(`Already linked: ${parseInt(linkedCount.rows[0].total, 10).toLocaleString()}`);
  console.log('');

  const startTime = Date.now();
  let processed = 0;
  let linked = 0;
  let noMatch = 0;
  let offset = 0;

  while (offset < totalPermits) {
    const batch = await pool.query(
      `SELECT permit_num, revision_num, street_num, street_name, street_type
       FROM permits
       WHERE structure_type IS NOT NULL
         AND (
           structure_type ILIKE '%SFD%'
           OR structure_type ILIKE '%Residential%'
           OR structure_type ILIKE '%Row%'
           OR structure_type ILIKE '%Town%'
           OR structure_type ILIKE '%Laneway%'
           OR structure_type ILIKE '%Semi%'
         )
       ORDER BY permit_num, revision_num
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    if (batch.rows.length === 0) break;

    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;

    for (const permit of batch.rows) {
      const num = (permit.street_num || '').trim().toUpperCase().replace(/^0+/, '');
      const name = (permit.street_name || '').trim().toUpperCase();
      const type = (permit.street_type || '').trim().toUpperCase();

      if (!num || !name) {
        noMatch++;
        processed++;
        continue;
      }

      // Strategy 1: Exact address match (num + name + type)
      let match = null;
      if (type) {
        const exact = await pool.query(
          `SELECT id FROM parcels
           WHERE addr_num_normalized = $1
             AND street_name_normalized = $2
             AND street_type_normalized = $3
           LIMIT 1`,
          [num, name, type]
        );
        if (exact.rows.length > 0) {
          match = { parcel_id: exact.rows[0].id, match_type: 'exact_address', confidence: 0.95 };
        }
      }

      // Strategy 2: Num + name only (ignore type)
      if (!match) {
        const nameOnly = await pool.query(
          `SELECT id FROM parcels
           WHERE addr_num_normalized = $1
             AND street_name_normalized = $2
           LIMIT 1`,
          [num, name]
        );
        if (nameOnly.rows.length > 0) {
          match = { parcel_id: nameOnly.rows[0].id, match_type: 'name_only', confidence: 0.80 };
        }
      }

      if (match) {
        insertParams.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        insertValues.push(
          permit.permit_num, permit.revision_num,
          match.parcel_id, match.match_type, match.confidence
        );
        linked++;
      } else {
        noMatch++;
      }

      processed++;
    }

    // Batch insert
    if (insertParams.length > 0) {
      await pool.query(
        `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
         VALUES ${insertParams.join(', ')}
         ON CONFLICT (permit_num, revision_num, parcel_id) DO UPDATE SET
           match_type = EXCLUDED.match_type,
           confidence = EXCLUDED.confidence,
           linked_at = NOW()`,
        insertValues
      );
    }

    offset += BATCH_SIZE;

    if (processed % 10000 === 0 || processed >= totalPermits) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / totalPermits) * 100).toFixed(1);
      console.log(`  ${processed.toLocaleString()} / ${totalPermits.toLocaleString()} (${pct}%) - linked: ${linked.toLocaleString()} - ${elapsed}s`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Linking Complete ===');
  console.log(`Permits processed:  ${processed.toLocaleString()}`);
  console.log(`Successfully linked: ${linked.toLocaleString()} (${((linked / Math.max(processed, 1)) * 100).toFixed(1)}%)`);
  console.log(`No match found:     ${noMatch.toLocaleString()}`);
  console.log(`Duration:           ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Linking failed:', err);
  process.exit(1);
});
