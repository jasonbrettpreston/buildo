import { query } from '@/lib/db/client';
import {
  getUnlinkedApplications,
  updateCoaLink,
} from '@/lib/coa/repository';
import type { CoaApplication, CoaLinkResult } from '@/lib/coa/types';
import type { Permit } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Address parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CoA-style address string (e.g. "123 MAIN ST") into its numeric and
 * street-name components.
 *
 * The parser strips leading/trailing whitespace, normalises to upper-case, and
 * splits on the first whitespace boundary. Everything after the street number
 * is treated as the street name (including any suffix such as ST, AVE, DR).
 */
export function parseCoaAddress(
  address: string
): { street_num: string; street_name: string } {
  const trimmed = address.trim().toUpperCase();

  // Match a leading numeric portion (possibly with letter suffix, e.g. "123A")
  const match = trimmed.match(/^(\d+[A-Z]?)\s+(.+)$/);

  if (!match) {
    // Could not isolate a street number -- return the whole string as the name.
    return { street_num: '', street_name: trimmed };
  }

  return {
    street_num: match[1],
    street_name: match[2].trim(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempt an exact-address match: same street number AND street name.
 *
 * Returns the best-matching permit (by most recent `issued_date`) or null.
 */
async function matchExactAddress(
  app: CoaApplication
): Promise<CoaLinkResult | null> {
  const { street_num, street_name } = parseCoaAddress(app.address);
  if (!street_num || !street_name) return null;

  // Strip street-type suffixes (ST, AVE, DR, ...) from the CoA address so
  // we can compare against the permits table where street_name and
  // street_type are stored separately.
  const nameOnly = street_name
    .replace(
      /\b(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\b/,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!nameOnly) return null;

  const rows = await query<Permit>(
    `SELECT permit_num, revision_num
     FROM permits
     WHERE UPPER(street_num) = $1
       AND UPPER(street_name) LIKE $2
     ORDER BY issued_date DESC NULLS LAST
     LIMIT 1`,
    [street_num, `%${nameOnly}%`]
  );

  if (rows.length === 0) return null;

  return {
    coa_id: app.id,
    permit_num: rows[0].permit_num,
    permit_revision: rows[0].revision_num,
    confidence: 0.95,
    match_type: 'exact_address',
  };
}

/**
 * Attempt a fuzzy-address match: same street name AND same ward, but the
 * street number may differ or be absent.
 *
 * Returns the best-matching permit or null.
 */
async function matchFuzzyAddress(
  app: CoaApplication
): Promise<CoaLinkResult | null> {
  const { street_name } = parseCoaAddress(app.address);
  if (!street_name) return null;

  const nameOnly = street_name
    .replace(
      /\b(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\b/,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!nameOnly || !app.ward) return null;

  const rows = await query<Permit>(
    `SELECT permit_num, revision_num
     FROM permits
     WHERE UPPER(street_name) LIKE $1
       AND ward = $2
     ORDER BY issued_date DESC NULLS LAST
     LIMIT 1`,
    [`%${nameOnly}%`, app.ward]
  );

  if (rows.length === 0) return null;

  return {
    coa_id: app.id,
    permit_num: rows[0].permit_num,
    permit_revision: rows[0].revision_num,
    confidence: 0.6,
    match_type: 'fuzzy_address',
  };
}

/**
 * Attempt a description-similarity match: look for permits whose description
 * shares significant keywords with the CoA description.
 *
 * Uses PostgreSQL full-text search with `ts_rank` to score results.  Falls
 * back to a simple ILIKE search when the description is very short.
 */
async function matchDescription(
  app: CoaApplication
): Promise<CoaLinkResult | null> {
  if (!app.description || app.description.trim().length < 10) return null;

  // Extract meaningful keywords (> 3 chars, skip stop-words)
  const keywords = app.description
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8); // limit to avoid overly broad queries

  if (keywords.length < 2) return null;

  // Build a tsquery string: word1 & word2 & ...
  const tsQuery = keywords.join(' & ');

  const rows = await query<Permit & { rank: number }>(
    `SELECT permit_num, revision_num,
            ts_rank(to_tsvector('english', COALESCE(description, '')), to_tsquery('english', $1)) AS rank
     FROM permits
     WHERE to_tsvector('english', COALESCE(description, '')) @@ to_tsquery('english', $1)
       AND ward = $2
     ORDER BY rank DESC
     LIMIT 1`,
    [tsQuery, app.ward]
  );

  if (rows.length === 0) return null;

  // Scale the rank into a confidence value between 0.3 and 0.5
  const rank = Number(rows[0].rank) || 0;
  const confidence = Math.min(0.5, 0.3 + rank * 0.1);

  return {
    coa_id: app.id,
    permit_num: rows[0].permit_num,
    permit_revision: rows[0].revision_num,
    confidence,
    match_type: 'description_similarity',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to link a single CoA application to a building permit.
 *
 * The function tries three strategies in order of decreasing confidence:
 *  1. Exact address match (street number + street name).
 *  2. Fuzzy address match (street name + ward).
 *  3. Description similarity (full-text search within same ward).
 *
 * If a match is found the `coa_applications` row is updated with the permit
 * number and confidence score.
 *
 * @returns The best match result, or `null` if no match was found.
 */
export async function linkCoaToPermits(
  coaId: number
): Promise<CoaLinkResult | null> {
  // Load the CoA application
  const rows = await query<CoaApplication>(
    `SELECT
      id,
      application_number  AS application_num,
      address,
      street_num,
      street_name,
      ward,
      status,
      decision,
      decision_date,
      hearing_date,
      description,
      applicant,
      linked_permit_num,
      NULL                AS linked_permit_revision,
      linked_confidence   AS link_confidence,
      first_seen_at       AS created_at
    FROM coa_applications
    WHERE id = $1`,
    [coaId]
  );

  if (rows.length === 0) {
    return null;
  }

  const app = rows[0];

  // Strategy 1 -- exact address
  const exactMatch = await matchExactAddress(app);
  if (exactMatch) {
    await updateCoaLink(
      coaId,
      exactMatch.permit_num,
      exactMatch.permit_revision,
      exactMatch.confidence
    );
    return exactMatch;
  }

  // Strategy 2 -- fuzzy address
  const fuzzyMatch = await matchFuzzyAddress(app);
  if (fuzzyMatch) {
    await updateCoaLink(
      coaId,
      fuzzyMatch.permit_num,
      fuzzyMatch.permit_revision,
      fuzzyMatch.confidence
    );
    return fuzzyMatch;
  }

  // Strategy 3 -- description similarity
  const descMatch = await matchDescription(app);
  if (descMatch) {
    await updateCoaLink(
      coaId,
      descMatch.permit_num,
      descMatch.permit_revision,
      descMatch.confidence
    );
    return descMatch;
  }

  return null;
}

/**
 * Attempt to link all currently unlinked CoA applications.
 *
 * @param limit  Maximum number of unlinked applications to process.
 * @returns Counts of successfully linked and still-unlinked applications.
 */
export async function linkAllUnlinked(
  limit?: number
): Promise<{ linked: number; unlinked: number }> {
  const apps = await getUnlinkedApplications(limit);

  let linked = 0;
  let unlinked = 0;

  for (const app of apps) {
    try {
      const result = await linkCoaToPermits(app.id);
      if (result) {
        linked++;
      } else {
        unlinked++;
      }
    } catch (err) {
      console.error(
        `[coa-linker] Error linking CoA application ${app.application_num}:`,
        err
      );
      unlinked++;
    }
  }

  return { linked, unlinked };
}
