// ---------------------------------------------------------------------------
// Builder enrichment via Google Places API
// ---------------------------------------------------------------------------

import { query } from '@/lib/db/client';
import type { Builder } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

/** Delay between enrichment requests in milliseconds to respect rate limits. */
const RATE_LIMIT_DELAY_MS = 1_500;

/** Base URL for the Google Places Text Search endpoint. */
const PLACES_TEXT_SEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';

/** Base URL for the Google Places Details endpoint. */
const PLACES_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Google Places lookup
// ---------------------------------------------------------------------------

/**
 * Search Google Places for a builder by name.
 *
 * The query is constructed as `"{builderName} contractor {city}"` to bias
 * results towards construction-related businesses in the target city.
 *
 * If the text search returns a candidate, a follow-up Places Details request
 * is made to retrieve phone number and website (fields not included in the
 * text search response).
 *
 * @returns The top matching place or `null` if no results / API error.
 */
export async function searchGooglePlaces(
  builderName: string,
  city: string = 'Toronto'
): Promise<PlacesResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('[enrichment] GOOGLE_MAPS_API_KEY is not set; skipping Places lookup');
    return null;
  }

  try {
    // 1. Text Search to find the place
    const searchQuery = `${builderName} contractor ${city}`;
    const searchParams = new URLSearchParams({
      query: searchQuery,
      key: GOOGLE_MAPS_API_KEY,
    });

    const searchResponse = await fetch(`${PLACES_TEXT_SEARCH_URL}?${searchParams}`);
    if (!searchResponse.ok) {
      console.error(
        `[enrichment] Places text search HTTP ${searchResponse.status}:`,
        await searchResponse.text()
      );
      return null;
    }

    const searchData = await searchResponse.json();
    if (
      searchData.status !== 'OK' ||
      !searchData.results ||
      searchData.results.length === 0
    ) {
      return null;
    }

    const topResult = searchData.results[0];
    const placeId: string = topResult.place_id;

    // 2. Place Details to get phone + website
    const detailsParams = new URLSearchParams({
      place_id: placeId,
      fields: 'formatted_phone_number,website',
      key: GOOGLE_MAPS_API_KEY,
    });

    const detailsResponse = await fetch(`${PLACES_DETAILS_URL}?${detailsParams}`);
    let phone: string | null = null;
    let website: string | null = null;

    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json();
      if (detailsData.status === 'OK' && detailsData.result) {
        phone = detailsData.result.formatted_phone_number ?? null;
        website = detailsData.result.website ?? null;
      }
    }

    return {
      place_id: placeId,
      name: topResult.name ?? builderName,
      formatted_address: topResult.formatted_address ?? '',
      phone,
      website,
      rating: topResult.rating ?? null,
      review_count: topResult.user_ratings_total ?? null,
    };
  } catch (err) {
    console.error('[enrichment] Google Places API error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single builder enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single builder record with data from Google Places.
 *
 * 1. Loads the builder from the database.
 * 2. Calls `searchGooglePlaces` with the builder's name.
 * 3. Updates the builder record with any results found.
 * 4. Sets `enriched_at = NOW()` regardless of whether a match was found
 *    (so we don't repeatedly retry the same builder).
 *
 * @returns The updated builder, or `null` if the builder was not found.
 */
export async function enrichBuilder(builderId: number): Promise<Builder | null> {
  try {
    // Look up builder
    const rows = await query<Builder>(
      'SELECT * FROM builders WHERE id = $1 LIMIT 1',
      [builderId]
    );

    if (rows.length === 0) {
      console.warn(`[enrichment] Builder id=${builderId} not found`);
      return null;
    }

    const builder = rows[0];
    const placesResult = await searchGooglePlaces(builder.name);

    if (placesResult) {
      // Update with enrichment data
      const [updated] = await query<Builder>(
        `UPDATE builders SET
          google_place_id   = $1,
          google_rating     = $2,
          google_review_count = $3,
          phone             = COALESCE(phone, $4),
          website           = COALESCE(website, $5),
          enriched_at       = NOW()
        WHERE id = $6
        RETURNING *`,
        [
          placesResult.place_id,
          placesResult.rating,
          placesResult.review_count,
          placesResult.phone,
          placesResult.website,
          builderId,
        ]
      );
      return updated;
    }

    // No Places match -- still mark as enriched so we don't retry
    const [updated] = await query<Builder>(
      `UPDATE builders SET enriched_at = NOW() WHERE id = $1 RETURNING *`,
      [builderId]
    );
    return updated;
  } catch (err) {
    console.error(`[enrichment] Failed to enrich builder id=${builderId}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch enrichment
// ---------------------------------------------------------------------------

/**
 * Process all builders that have not yet been enriched (`enriched_at IS NULL`).
 *
 * Builders are processed one at a time with a configurable delay between each
 * request to respect Google Places API rate limits.
 *
 * @param limit  Maximum number of builders to process in this run.
 *               Defaults to 50.
 * @returns Counts of successfully enriched and failed builders.
 */
export async function enrichUnenrichedBuilders(
  limit: number = 50
): Promise<{ enriched: number; failed: number }> {
  const stats = { enriched: 0, failed: 0 };

  try {
    const unenriched = await query<Builder>(
      `SELECT * FROM builders
       WHERE enriched_at IS NULL
       ORDER BY permit_count DESC
       LIMIT $1`,
      [limit]
    );

    console.log(
      `[enrichment] Found ${unenriched.length} unenriched builder(s) to process`
    );

    for (let i = 0; i < unenriched.length; i++) {
      const builder = unenriched[i];

      const result = await enrichBuilder(builder.id);
      if (result) {
        stats.enriched++;
      } else {
        stats.failed++;
      }

      // Rate-limit delay between requests (skip after the last one)
      if (i < unenriched.length - 1) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }
  } catch (err) {
    console.error('[enrichment] Batch enrichment error:', err);
  }

  console.log(
    `[enrichment] Batch complete: ${stats.enriched} enriched, ${stats.failed} failed`
  );

  return stats;
}
