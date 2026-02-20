// ---------------------------------------------------------------------------
// Builder database repository
// ---------------------------------------------------------------------------

import { query } from '@/lib/db/client';
import type { Builder } from '@/lib/permits/types';
import { normalizeBuilderName } from '@/lib/builders/normalize';

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Insert a builder or update its counters if a matching normalized name
 * already exists.
 *
 * On conflict (same `name_normalized`):
 *  - `permit_count` is incremented by 1.
 *  - `last_seen_at` is set to NOW().
 *  - The original (un-normalized) `name` is kept from the first insert.
 *
 * @param name  The raw builder name as it appears on the permit.
 * @returns     The inserted or updated builder row.
 */
export async function upsertBuilder(name: string): Promise<Builder> {
  const normalized = normalizeBuilderName(name);

  const rows = await query<Builder>(
    `INSERT INTO builders (name, name_normalized, permit_count, first_seen_at, last_seen_at)
     VALUES ($1, $2, 1, NOW(), NOW())
     ON CONFLICT (name_normalized) DO UPDATE SET
       permit_count = builders.permit_count + 1,
       last_seen_at = NOW()
     RETURNING *`,
    [name, normalized]
  );

  return rows[0];
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Find a builder by its raw name. The name is normalized before lookup so
 * that variations like "Acme Inc." and "ACME" resolve to the same record.
 *
 * @returns The matching builder or `null` if none exists.
 */
export async function getBuilderByName(name: string): Promise<Builder | null> {
  const normalized = normalizeBuilderName(name);

  const rows = await query<Builder>(
    'SELECT * FROM builders WHERE name_normalized = $1 LIMIT 1',
    [normalized]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Retrieve a builder by its primary key.
 *
 * @returns The builder or `null` if not found.
 */
export async function getBuilderById(id: number): Promise<Builder | null> {
  const rows = await query<Builder>(
    'SELECT * FROM builders WHERE id = $1 LIMIT 1',
    [id]
  );

  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Search & listing
// ---------------------------------------------------------------------------

/**
 * Search for builders whose name matches the given query string.
 * Uses case-insensitive `ILIKE` with a leading and trailing wildcard.
 *
 * @param searchQuery  The partial name to search for.
 * @param limit        Maximum number of results (default 25).
 * @returns            Matching builders ordered by `permit_count` descending.
 */
export async function searchBuilders(
  searchQuery: string,
  limit: number = 25
): Promise<Builder[]> {
  const pattern = `%${searchQuery}%`;

  return query<Builder>(
    `SELECT * FROM builders
     WHERE name ILIKE $1 OR name_normalized ILIKE $1
     ORDER BY permit_count DESC
     LIMIT $2`,
    [pattern, limit]
  );
}

/**
 * Return the most active builders sorted by permit count descending.
 *
 * @param limit  Maximum number of builders to return (default 50).
 */
export async function getTopBuilders(limit: number = 50): Promise<Builder[]> {
  return query<Builder>(
    'SELECT * FROM builders ORDER BY permit_count DESC LIMIT $1',
    [limit]
  );
}
