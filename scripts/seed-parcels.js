#!/usr/bin/env node
/**
 * Seed sample parcels into the database and link them to existing permits.
 *
 * This makes the Property Details section immediately visible on permit
 * detail pages without downloading the full 327MB Toronto parcel CSV.
 *
 * Usage: PG_PASSWORD=postgres node scripts/seed-parcels.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// Realistic Toronto lot dimensions by structure type
const LOT_PRESETS = {
  detached:      { sqm: 500, frontage_m: 15.24, depth_m: 32.92 },
  semi:          { sqm: 280, frontage_m: 7.62,  depth_m: 36.58 },
  townhouse:     { sqm: 180, frontage_m: 6.10,  depth_m: 29.57 },
  apartment:     { sqm: 2500, frontage_m: 45.72, depth_m: 54.86 },
  commercial:    { sqm: 800, frontage_m: 18.29, depth_m: 43.89 },
  default:       { sqm: 400, frontage_m: 12.19, depth_m: 32.92 },
};

function pickLotPreset(structureType) {
  const s = (structureType || '').toLowerCase();
  if (s.includes('detached') && !s.includes('semi')) return LOT_PRESETS.detached;
  if (s.includes('semi')) return LOT_PRESETS.semi;
  if (s.includes('townhouse') || s.includes('town')) return LOT_PRESETS.townhouse;
  if (s.includes('apartment') || s.includes('condo')) return LOT_PRESETS.apartment;
  if (s.includes('office') || s.includes('retail') || s.includes('commercial') || s.includes('industrial')) return LOT_PRESETS.commercial;
  return LOT_PRESETS.default;
}

function sqmToSqft(sqm) { return sqm * 10.7639; }
function mToFt(m) { return m * 3.28084; }

async function main() {
  console.log('=== Buildo Parcel Seeder ===');
  console.log('');

  // Find permits with real street addresses that aren't already linked
  const result = await pool.query(`
    SELECT DISTINCT ON (p.street_num, p.street_name)
      p.permit_num, p.revision_num,
      p.street_num, p.street_name, p.street_type,
      p.structure_type
    FROM permits p
    LEFT JOIN permit_parcels pp
      ON pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
    WHERE p.street_num IS NOT NULL
      AND p.street_num != ''
      AND p.street_num != '0'
      AND p.street_num ~ '^[1-9][0-9]*$'
      AND p.street_name IS NOT NULL
      AND p.street_name != ''
      AND p.street_type IS NOT NULL
      AND p.street_type != ''
      AND pp.id IS NULL
    ORDER BY p.street_num, p.street_name, p.issued_date DESC NULLS LAST
    LIMIT 10
  `);

  if (result.rows.length === 0) {
    console.log('No eligible permits found (all may already be linked).');
    await pool.end();
    return;
  }

  console.log(`Found ${result.rows.length} permits to seed parcels for:`);
  let seeded = 0;

  for (const permit of result.rows) {
    const lot = pickLotPreset(permit.structure_type);
    const lotSqft = sqmToSqft(lot.sqm);
    const frontageFt = mToFt(lot.frontage_m);
    const depthFt = mToFt(lot.depth_m);

    // Generate a unique parcel_id
    const parcelId = `SEED-${permit.street_num}-${(permit.street_name || '').replace(/\s+/g, '-').substring(0, 10)}`;
    const addrNumNorm = (permit.street_num || '').trim().toUpperCase();
    const streetNameNorm = (permit.street_name || '').trim().toUpperCase();
    const streetTypeNorm = (permit.street_type || '').trim().toUpperCase();

    // Insert parcel (skip if parcel_id already exists)
    const parcelResult = await pool.query(`
      INSERT INTO parcels (
        parcel_id, feature_type, address_number, linear_name_full,
        addr_num_normalized, street_name_normalized, street_type_normalized,
        lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (parcel_id) DO UPDATE SET parcel_id = EXCLUDED.parcel_id
      RETURNING id
    `, [
      parcelId,
      'COMMON',
      permit.street_num,
      `${permit.street_name} ${permit.street_type}`,
      addrNumNorm,
      streetNameNorm,
      streetTypeNorm,
      lot.sqm.toFixed(2),
      lotSqft.toFixed(2),
      lot.frontage_m.toFixed(2),
      frontageFt.toFixed(2),
      lot.depth_m.toFixed(2),
      depthFt.toFixed(2),
    ]);

    const dbParcelId = parcelResult.rows[0].id;

    // Link permit to parcel
    await pool.query(`
      INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (permit_num, revision_num, parcel_id) DO NOTHING
    `, [permit.permit_num, permit.revision_num, dbParcelId, 'exact_address', 0.95]);

    seeded++;
    console.log(`  ${seeded}. ${permit.street_num} ${permit.street_name} ${permit.street_type} -> parcel ${parcelId} (${permit.permit_num})`);
  }

  console.log('');
  console.log(`=== Seeded ${seeded} parcels and linked to permits ===`);
  console.log('Visit a permit detail page to see the Property Details section.');

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
