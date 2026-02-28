#!/usr/bin/env node
/**
 * Link unlinked CoA applications to building permits using address matching.
 *
 * 3-tier cascade:
 *   1. Exact address match (street_num + street_name) → 0.95 confidence
 *   2. Fuzzy address match (street_name + ward)       → 0.60 confidence
 *   3. Description similarity (full-text search)      → 0.30-0.50 confidence
 *
 * Usage: node scripts/link-coa.js [--limit N] [--dry-run]
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const STREET_TYPES = /\b(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\b/g;

function stripStreetType(name) {
  if (!name) return '';
  return name.toUpperCase().replace(STREET_TYPES, '').replace(/\s+/g, ' ').trim();
}

async function matchExactAddress(client, app) {
  const num = (app.street_num || '').trim().toUpperCase();
  const nameOnly = stripStreetType(app.street_name);
  if (!num || !nameOnly) return null;

  const rows = await client.query(
    `SELECT permit_num, revision_num
     FROM permits
     WHERE UPPER(street_num) = $1
       AND UPPER(street_name) LIKE $2
     ORDER BY issued_date DESC NULLS LAST
     LIMIT 1`,
    [num, `%${nameOnly}%`]
  );
  if (rows.rows.length === 0) return null;

  return {
    permit_num: rows.rows[0].permit_num,
    confidence: 0.95,
    match_type: 'exact_address',
  };
}

async function matchFuzzyAddress(client, app) {
  const nameOnly = stripStreetType(app.street_name);
  if (!nameOnly || !app.ward) return null;

  const rows = await client.query(
    `SELECT permit_num, revision_num
     FROM permits
     WHERE UPPER(street_name) LIKE $1
       AND ward = $2
     ORDER BY issued_date DESC NULLS LAST
     LIMIT 1`,
    [`%${nameOnly}%`, app.ward]
  );
  if (rows.rows.length === 0) return null;

  return {
    permit_num: rows.rows[0].permit_num,
    confidence: 0.60,
    match_type: 'fuzzy_address',
  };
}

async function matchDescription(client, app) {
  if (!app.description || app.description.trim().length < 10) return null;
  if (!app.ward) return null;

  const keywords = app.description
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);

  if (keywords.length < 2) return null;

  const tsQuery = keywords.join(' & ');

  try {
    const rows = await client.query(
      `SELECT permit_num, revision_num,
              ts_rank(to_tsvector('english', COALESCE(description, '')), to_tsquery('english', $1)) AS rank
       FROM permits
       WHERE to_tsvector('english', COALESCE(description, '')) @@ to_tsquery('english', $1)
         AND ward = $2
       ORDER BY rank DESC
       LIMIT 1`,
      [tsQuery, app.ward]
    );
    if (rows.rows.length === 0) return null;

    const rank = Number(rows.rows[0].rank) || 0;
    const confidence = Math.min(0.50, 0.30 + rank * 0.1);

    return {
      permit_num: rows.rows[0].permit_num,
      confidence,
      match_type: 'description_similarity',
    };
  } catch {
    // tsquery can fail with certain keyword combos
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;

  console.log('=== Buildo CoA Linker ===\n');
  if (dryRun) console.log('DRY RUN — no database writes\n');

  const client = await pool.connect();

  try {
    // Get unlinked applications
    let sql = `SELECT id, application_number, address, street_num, street_name,
                      ward, description
               FROM coa_applications
               WHERE linked_permit_num IS NULL
               ORDER BY decision_date DESC NULLS LAST`;
    if (limit) sql += ` LIMIT ${limit}`;

    const unlinked = await client.query(sql);
    console.log(`Found ${unlinked.rows.length} unlinked CoA applications\n`);

    let exact = 0, fuzzy = 0, desc = 0, noMatch = 0, errors = 0;

    for (let i = 0; i < unlinked.rows.length; i++) {
      const app = unlinked.rows[i];

      try {
        // Tier 1: Exact address
        let match = await matchExactAddress(client, app);

        // Tier 2: Fuzzy address
        if (!match) match = await matchFuzzyAddress(client, app);

        // Tier 3: Description similarity
        if (!match) match = await matchDescription(client, app);

        if (match) {
          if (!dryRun) {
            await client.query(
              `UPDATE coa_applications
               SET linked_permit_num = $1, linked_confidence = $2, last_seen_at = NOW()
               WHERE id = $3`,
              [match.permit_num, match.confidence, app.id]
            );
          }

          if (match.match_type === 'exact_address') exact++;
          else if (match.match_type === 'fuzzy_address') fuzzy++;
          else desc++;
        } else {
          noMatch++;
        }
      } catch (err) {
        errors++;
        if (errors <= 5) console.error(`  Error on ${app.application_number}: ${err.message}`);
      }

      // Progress
      if ((i + 1) % 500 === 0 || i === unlinked.rows.length - 1) {
        const total = exact + fuzzy + desc;
        process.stdout.write(
          `\r  Progress: ${i + 1}/${unlinked.rows.length} | Linked: ${total} (exact: ${exact}, fuzzy: ${fuzzy}, desc: ${desc}) | No match: ${noMatch} | Errors: ${errors}`
        );
      }
    }

    const totalLinked = exact + fuzzy + desc;
    console.log('\n');
    console.log('=== Results ===');
    console.log(`  Exact address matches:    ${exact} (0.95 confidence)`);
    console.log(`  Fuzzy address matches:    ${fuzzy} (0.60 confidence)`);
    console.log(`  Description matches:      ${desc}  (0.30-0.50 confidence)`);
    console.log(`  No match:                 ${noMatch}`);
    console.log(`  Errors:                   ${errors}`);
    console.log(`  Total linked:             ${totalLinked}/${unlinked.rows.length} (${((totalLinked / unlinked.rows.length) * 100).toFixed(1)}%)`);

    if (dryRun) {
      console.log('\nDRY RUN complete — no changes written to database.');
    }

    // Final stats
    const stats = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
        COUNT(*) FILTER (WHERE linked_confidence >= 0.90) AS high_conf,
        COUNT(*) FILTER (WHERE linked_confidence >= 0.50 AND linked_confidence < 0.90) AS med_conf,
        COUNT(*) FILTER (WHERE linked_confidence > 0 AND linked_confidence < 0.50) AS low_conf,
        COUNT(*) FILTER (WHERE decision IN ('Approved', 'Approved with Conditions') AND linked_permit_num IS NULL AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
      FROM coa_applications
    `);
    const s = stats.rows[0];
    console.log(`\nDB Stats: ${s.total} total | ${s.linked} linked (${s.high_conf} high, ${s.med_conf} med, ${s.low_conf} low) | ${s.upcoming} upcoming leads`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
