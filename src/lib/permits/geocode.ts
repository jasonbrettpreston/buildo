import { query } from '@/lib/db/client';
import type { Permit } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Pause execution for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a one-line address string suitable for the Google Geocoding API.
 *
 * Example: "123 Main St, Toronto, ON, Canada"
 */
function buildAddressString(
  streetNum: string,
  streetName: string,
  streetType: string,
  city: string
): string {
  const parts: string[] = [];

  if (streetNum) parts.push(streetNum);
  if (streetName) parts.push(streetName);
  if (streetType) parts.push(streetType);

  const street = parts.join(' ');
  const fullParts = [street, city, 'ON', 'Canada'].filter(Boolean);
  return fullParts.join(', ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Geocode a single street address using the Google Geocoding API.
 *
 * Requires the `GOOGLE_MAPS_API_KEY` environment variable to be set.
 *
 * @returns The geocoded coordinates and formatted address, or `null` if the
 *          address could not be resolved.
 */
export async function geocodeAddress(
  streetNum: string,
  streetName: string,
  streetType: string,
  city: string
): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY environment variable is not set. ' +
        'Geocoding requires a valid Google Maps API key.'
    );
  }

  const address = buildAddressString(streetNum, streetName, streetType, city);
  if (!address.trim()) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);
  // Bias results towards Ontario, Canada
  url.searchParams.set('components', 'country:CA|administrative_area:ON');

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(
        `[geocode] HTTP ${response.status} from Google Geocoding API for "${address}"`
      );
      return null;
    }

    const data = (await response.json()) as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
      error_message?: string;
    };

    if (data.status === 'ZERO_RESULTS') {
      return null;
    }

    if (data.status !== 'OK') {
      console.error(
        `[geocode] Google API status "${data.status}" for "${address}": ${data.error_message ?? ''}`
      );
      return null;
    }

    const result = data.results[0];
    if (!result) return null;

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formatted_address: result.formatted_address,
    };
  } catch (err) {
    console.error(`[geocode] Failed to geocode "${address}":`, err);
    return null;
  }
}

/**
 * Look up a single permit by its composite key, geocode its address, and
 * persist the resulting latitude/longitude back to the database.
 *
 * @returns `true` if geocoding succeeded and the row was updated, `false`
 *          otherwise.
 */
export async function geocodePermit(
  permitNum: string,
  revisionNum: string
): Promise<boolean> {
  const rows = await query<Permit>(
    `SELECT street_num, street_name, street_type, city
     FROM permits
     WHERE permit_num = $1 AND revision_num = $2
     LIMIT 1`,
    [permitNum, revisionNum]
  );

  if (rows.length === 0) {
    console.error(
      `[geocode] Permit ${permitNum}/${revisionNum} not found`
    );
    return false;
  }

  const permit = rows[0];

  const result = await geocodeAddress(
    permit.street_num,
    permit.street_name,
    permit.street_type,
    permit.city
  );

  if (!result) {
    // Mark the permit as attempted so we don't retry endlessly
    await query(
      `UPDATE permits
       SET geocoded_at = NOW()
       WHERE permit_num = $1 AND revision_num = $2`,
      [permitNum, revisionNum]
    );
    return false;
  }

  await query(
    `UPDATE permits
     SET latitude    = $1,
         longitude   = $2,
         geocoded_at = NOW()
     WHERE permit_num = $3 AND revision_num = $4`,
    [result.lat, result.lng, permitNum, revisionNum]
  );

  return true;
}

/**
 * Batch-geocode permits that have not yet been geocoded.
 *
 * Finds permits where `latitude IS NULL AND geocoded_at IS NULL` (i.e. never
 * attempted), then geocodes them one by one with rate limiting to stay within
 * the Google Geocoding API free-tier limit of 10 requests per second.
 *
 * @param limit  Maximum number of permits to process (default 500).
 * @returns Counts of successfully geocoded and failed permits.
 */
export async function batchGeocode(
  limit: number = 500
): Promise<{ geocoded: number; failed: number }> {
  const permits = await query<Pick<Permit, 'permit_num' | 'revision_num'>>(
    `SELECT permit_num, revision_num
     FROM permits
     WHERE latitude IS NULL
       AND geocoded_at IS NULL
     ORDER BY first_seen_at ASC
     LIMIT $1`,
    [limit]
  );

  let geocoded = 0;
  let failed = 0;

  // Rate limiting: process up to 10 per second
  const MAX_PER_SECOND = 10;
  let requestsThisSecond = 0;
  let windowStart = Date.now();

  for (const permit of permits) {
    // Enforce rate limit
    const now = Date.now();
    if (now - windowStart >= 1000) {
      // Reset the window
      windowStart = now;
      requestsThisSecond = 0;
    }

    if (requestsThisSecond >= MAX_PER_SECOND) {
      const waitMs = 1000 - (now - windowStart);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      windowStart = Date.now();
      requestsThisSecond = 0;
    }

    try {
      const success = await geocodePermit(
        permit.permit_num,
        permit.revision_num
      );
      if (success) {
        geocoded++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(
        `[geocode] Unexpected error geocoding ${permit.permit_num}/${permit.revision_num}:`,
        err
      );
      failed++;
    }

    requestsThisSecond++;
  }

  console.log(
    `[geocode] Batch complete: ${geocoded} geocoded, ${failed} failed out of ${permits.length} total`
  );

  return { geocoded, failed };
}
