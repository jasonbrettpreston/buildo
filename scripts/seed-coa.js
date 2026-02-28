#!/usr/bin/env node
/**
 * Seed the coa_applications table with realistic sample data.
 * Use when the CKAN API is unreachable. Run load-coa.js for production data.
 *
 * Usage: node scripts/seed-coa.js
 */
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const SAMPLE_RECORDS = [
  // Recent approved — upcoming leads
  { app: 'A0001/26EYK', address: '123 QUEEN ST E', ward: '13', decision: 'Approved', decision_date: '2026-02-10', hearing_date: '2026-01-20', description: 'To permit a rear yard setback variance of 5.5m instead of 7.5m to allow construction of a two-storey rear addition.', applicant: 'SMITH DEVELOPMENTS INC.' },
  { app: 'A0002/26EYK', address: '456 KING ST W', ward: '10', decision: 'Approved with Conditions', decision_date: '2026-02-15', hearing_date: '2026-02-01', description: 'To permit a maximum building height of 12.0m instead of 10.0m and a side yard setback of 0.9m instead of 1.2m for a new 3-storey dwelling.', applicant: 'METRO HOMES LTD.' },
  { app: 'A0003/26EYK', address: '789 BLOOR ST W', ward: '04', decision: 'Approved', decision_date: '2026-01-25', hearing_date: '2026-01-10', description: 'To permit the construction of a new detached garage in the rear yard with a maximum floor area of 50 sq m.', applicant: 'J. WILSON ARCHITECTURE' },
  { app: 'A0004/26NYK', address: '50 EGLINTON AVE E', ward: '08', decision: 'Approved', decision_date: '2026-02-20', hearing_date: '2026-02-05', description: 'To permit interior alterations to convert a single-family dwelling to a two-unit dwelling and to construct a rear deck.', applicant: 'ABLE CONSTRUCTION GROUP' },
  { app: 'A0005/26EYK', address: '200 DUNDAS ST W', ward: '10', decision: 'Approved with Conditions', decision_date: '2026-02-01', hearing_date: '2026-01-15', description: 'To permit a front yard setback of 3.0m instead of 6.0m and to permit a building coverage of 42% instead of 33% for an addition to a commercial building.', applicant: 'DOWNTOWN BUILDERS INC.' },
  { app: 'A0006/26NYK', address: '333 DANFORTH AVE', ward: '14', decision: 'Approved', decision_date: '2026-01-30', hearing_date: '2026-01-15', description: 'To permit a laneway suite in the rear yard with a height of 6.5m and a floor area of 60 sq m.', applicant: 'RIVERDALE HOMES' },
  { app: 'A0007/26EYK', address: '88 HARBORD ST', ward: '11', decision: 'Approved', decision_date: '2026-02-18', hearing_date: '2026-02-05', description: 'To permit the conversion of the existing basement to a secondary suite and to construct an external staircase.', applicant: 'ANNEX RENOVATIONS LTD.' },
  { app: 'A0008/26NYK', address: '1500 LAWRENCE AVE W', ward: '06', decision: 'Approved with Conditions', decision_date: '2026-02-12', hearing_date: '2026-01-28', description: 'To permit a building length of 22m instead of 17m for a new industrial warehouse addition.', applicant: 'NORTHGATE INDUSTRIAL' },
  { app: 'A0009/26EYK', address: '75 ST CLAIR AVE W', ward: '08', decision: 'Approved', decision_date: '2026-01-20', hearing_date: '2026-01-08', description: 'To permit a driveway width of 5.5m instead of 3.0m and to remove one protected tree to facilitate construction of a new dwelling.', applicant: 'FOREST HILL CONSTRUCTION' },
  { app: 'A0010/26NYK', address: '420 COLLEGE ST', ward: '11', decision: 'Approved', decision_date: '2026-02-22', hearing_date: '2026-02-08', description: 'To permit a patio in the front yard of a restaurant with an area of 15 sq m and to permit an illuminated sign.', applicant: 'LITTLE ITALY HOSPITALITY INC.' },

  // Refused / Withdrawn — should NOT appear as leads
  { app: 'A0011/26EYK', address: '999 BAY ST', ward: '13', decision: 'Refused', decision_date: '2026-02-05', hearing_date: '2026-01-20', description: 'To permit a building height of 25m in a residential zone.', applicant: 'TALL BUILDINGS CORP.' },
  { app: 'A0012/26NYK', address: '150 YONGE ST', ward: '13', decision: 'Withdrawn', decision_date: '2026-02-10', hearing_date: '2026-01-25', description: 'To permit a parking reduction for a commercial development.', applicant: 'YONGE STREET PARTNERS' },

  // Older approved — beyond 90-day window
  { app: 'A0013/25EYK', address: '300 RONCESVALLES AVE', ward: '04', decision: 'Approved', decision_date: '2025-10-15', hearing_date: '2025-10-01', description: 'To permit a third storey addition to an existing semi-detached dwelling.', applicant: 'RONCY BUILDERS' },
  { app: 'A0014/25NYK', address: '600 JANE ST', ward: '05', decision: 'Approved', decision_date: '2025-09-01', hearing_date: '2025-08-20', description: 'To permit construction of 4 townhouse units on a lot currently used as a parking lot.', applicant: 'WEST END DEVELOPMENT GROUP' },

  // Already linked to a permit — should NOT appear as leads
  { app: 'A0015/25EYK', address: '50 SPADINA AVE', ward: '10', decision: 'Approved', decision_date: '2026-01-15', hearing_date: '2026-01-05', description: 'To permit a reduced side yard setback for a renovation.', applicant: 'CHINATOWN RENOS LTD.' },

  // More recent approved for variety
  { app: 'A0016/26EYK', address: '222 OSSINGTON AVE', ward: '04', decision: 'Approved', decision_date: '2026-02-25', hearing_date: '2026-02-10', description: 'To permit a reduced parking requirement for a mixed-use building with 6 residential units and ground floor retail.', applicant: 'TRINITY BELLWOODS DEVELOPMENT' },
  { app: 'A0017/26NYK', address: '1000 FINCH AVE W', ward: '01', decision: 'Approved with Conditions', decision_date: '2026-02-08', hearing_date: '2026-01-22', description: 'To permit the construction of a secondary suite in an accessory building and to increase the maximum lot coverage.', applicant: 'NORTH YORK HOME BUILDERS' },
  { app: 'A0018/26EYK', address: '45 BROADVIEW AVE', ward: '14', decision: 'Approved', decision_date: '2026-02-14', hearing_date: '2026-01-30', description: 'To permit a reduced rear yard setback of 4.0m instead of 7.5m for a new 3-storey residential building.', applicant: 'RIVERSIDE DEVELOPMENT CO.' },
  { app: 'A0019/26NYK', address: '800 SHEPPARD AVE E', ward: '18', decision: 'Approved', decision_date: '2026-02-03', hearing_date: '2026-01-20', description: 'To permit the construction of a new drive-through restaurant with reduced landscaping.', applicant: 'QUICKSERVE RESTAURANTS INC.' },
  { app: 'A0020/26EYK', address: '155 DUPONT ST', ward: '09', decision: 'Approved with Conditions', decision_date: '2026-02-17', hearing_date: '2026-02-03', description: 'To permit a 4-storey condominium building with a floor space index of 2.5 instead of 2.0.', applicant: 'MIDTOWN CONDO DEVELOPERS' },
];

function parseAddress(address) {
  const match = address.match(/^(\d+[A-Z]?)\s+(.+)$/);
  return match ? { street_num: match[1], street_name: match[2] } : { street_num: null, street_name: address };
}

async function main() {
  console.log('=== Seeding CoA Applications ===\n');

  const client = await pool.connect();
  let inserted = 0;

  try {
    for (const rec of SAMPLE_RECORDS) {
      const { street_num, street_name } = parseAddress(rec.address);
      const hash = crypto.createHash('sha256').update(JSON.stringify(rec)).digest('hex');

      // Handle the linked permit case
      const linkedPermit = rec.app === 'A0015/25EYK' ? '26 100001 BLD' : null;
      const linkedConf = linkedPermit ? 0.92 : null;

      const result = await client.query(
        `INSERT INTO coa_applications (
          application_number, address, street_num, street_name, ward,
          status, decision, decision_date, hearing_date, description,
          applicant, linked_permit_num, linked_confidence, data_hash,
          first_seen_at, last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        ON CONFLICT (application_number) DO UPDATE SET
          data_hash = EXCLUDED.data_hash,
          last_seen_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          rec.app, rec.address, street_num, street_name, rec.ward,
          'Complete', rec.decision, rec.decision_date, rec.hearing_date,
          rec.description, rec.applicant, linkedPermit, linkedConf, hash,
        ]
      );
      if (result.rows[0]?.is_insert) inserted++;
    }

    console.log(`Inserted ${inserted} records (${SAMPLE_RECORDS.length - inserted} already existed)\n`);

    // Show stats
    const stats = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE decision IN ('Approved', 'Approved with Conditions')) AS approved,
        COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
        COUNT(*) FILTER (WHERE decision IN ('Approved', 'Approved with Conditions')
                          AND linked_permit_num IS NULL
                          AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
      FROM coa_applications
    `);
    const s = stats.rows[0];
    console.log(`CoA Stats:`);
    console.log(`  Total:    ${s.total}`);
    console.log(`  Approved: ${s.approved}`);
    console.log(`  Linked:   ${s.linked}`);
    console.log(`  Upcoming: ${s.upcoming} (Pre-Permit leads)`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
