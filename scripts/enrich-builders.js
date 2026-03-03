#!/usr/bin/env node
/**
 * Enrich builders with Google Places data (phone, website, rating, reviews).
 * Processes unenriched builders in batches with rate limiting.
 *
 * Requires GOOGLE_MAPS_API_KEY environment variable.
 * Usage: GOOGLE_MAPS_API_KEY=xxx node scripts/enrich-builders.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const RATE_LIMIT_MS = 1500;
const BATCH_LIMIT = parseInt(process.env.ENRICH_LIMIT || '50', 10);

const PLACES_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchGooglePlaces(builderName) {
  const params = new URLSearchParams({
    query: `${builderName} contractor Toronto`,
    key: GOOGLE_MAPS_API_KEY,
  });

  const res = await fetch(`${PLACES_SEARCH_URL}?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) return null;

  const top = data.results[0];
  const placeId = top.place_id;

  // Get phone + website from details
  const detailParams = new URLSearchParams({
    place_id: placeId,
    fields: 'formatted_phone_number,website',
    key: GOOGLE_MAPS_API_KEY,
  });

  let phone = null;
  let website = null;
  const detailRes = await fetch(`${PLACES_DETAILS_URL}?${detailParams}`);
  if (detailRes.ok) {
    const detail = await detailRes.json();
    if (detail.status === 'OK' && detail.result) {
      phone = detail.result.formatted_phone_number ?? null;
      website = detail.result.website ?? null;
    }
  }

  return {
    place_id: placeId,
    rating: top.rating ?? null,
    review_count: top.user_ratings_total ?? null,
    phone,
    website,
  };
}

async function run() {
  if (!GOOGLE_MAPS_API_KEY) {
    console.log('GOOGLE_MAPS_API_KEY not set — skipping Google Places enrichment');
    return;
  }

  console.log(`Enriching builders via Google Places (limit: ${BATCH_LIMIT})...\n`);

  const { rows: builders } = await pool.query(
    `SELECT id, name FROM builders
     WHERE enriched_at IS NULL
     ORDER BY permit_count DESC
     LIMIT $1`,
    [BATCH_LIMIT]
  );

  console.log(`Found ${builders.length} unenriched builder(s)`);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < builders.length; i++) {
    const { id, name } = builders[i];
    try {
      const result = await searchGooglePlaces(name);
      if (result) {
        await pool.query(
          `UPDATE builders SET
            google_place_id = $1, google_rating = $2, google_review_count = $3,
            phone = COALESCE(phone, $4), website = COALESCE(website, $5),
            enriched_at = NOW()
          WHERE id = $6`,
          [result.place_id, result.rating, result.review_count, result.phone, result.website, id]
        );
        enriched++;
      } else {
        await pool.query('UPDATE builders SET enriched_at = NOW() WHERE id = $1', [id]);
        enriched++;
      }
    } catch (err) {
      console.error(`  Failed: ${name} — ${err.message}`);
      failed++;
    }

    if (i < builders.length - 1) await sleep(RATE_LIMIT_MS);
    if ((i + 1) % 10 === 0) console.log(`  Progress: ${i + 1} / ${builders.length}`);
  }

  console.log(`\nDone: ${enriched} enriched, ${failed} failed`);
  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
