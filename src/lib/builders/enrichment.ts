// ---------------------------------------------------------------------------
// Builder enrichment via Serper web search API
// ---------------------------------------------------------------------------

import { query, withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { searchSerper, fetchWebsiteHtml, fetchContactPageHtml } from '@/lib/enrichment/serper-client';
import {
  extractContacts,
  extractEmailsFromHtml,
  extractPhoneNumbers,
  stripHtmlNoise,
  buildSearchQuery,
} from '@/lib/builders/extract-contacts';
import type { SerperResponse } from '@/lib/builders/extract-contacts';
import type { Entity } from '@/lib/permits/types';

const RATE_LIMIT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Single entity enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single entity with contact data from Serper web search.
 *
 * 1. Loads the entity + optional WSIB data for search query construction.
 * 2. Calls Serper API and extracts contacts (phone, email, website, social).
 * 3. If no email found from search snippets, scrapes the entity's website.
 * 4. Updates the entity record and inserts social links into entity_contacts.
 * 5. Sets `last_enriched_at = NOW()` regardless of result (prevents retry loops).
 *
 * @returns The updated entity, or `null` if the entity was not found or enrichment failed.
 */
export async function enrichBuilder(entityId: number): Promise<Entity | null> {
  try {
    const rows = await query<Entity & {
      trade_name_wsib?: string | null;
      legal_name_wsib?: string | null;
      mailing_address?: string | null;
    }>(
      `SELECT e.*,
              w.trade_name AS trade_name_wsib,
              w.legal_name AS legal_name_wsib,
              w.mailing_address
       FROM entities e
       LEFT JOIN wsib_registry w ON w.linked_entity_id = e.id
       WHERE e.id = $1
       LIMIT 1`,
      [entityId]
    );

    const entity = rows[0];
    if (!entity) return null;

    const searchQuery = buildSearchQuery({
      name: entity.legal_name,
      ...(entity.trade_name_wsib !== undefined && { trade_name: entity.trade_name_wsib }),
      ...(entity.legal_name_wsib !== undefined && { legal_name: entity.legal_name_wsib }),
      ...(entity.mailing_address !== undefined && { mailing_address: entity.mailing_address }),
    });

    const response = await searchSerper(searchQuery) as SerperResponse;
    const contacts = extractContacts(response);

    // If no email from snippets, scrape the website (homepage + /contact fallback)
    const websiteUrl = contacts.website || entity.website;
    if (!contacts.email && !entity.primary_email && websiteUrl) {
      const html = await fetchWebsiteHtml(websiteUrl);
      if (html) {
        const scraped = extractEmailsFromHtml(html);
        if (scraped[0]) contacts.email = scraped[0];
        if (!contacts.phone && !entity.primary_phone) {
          const cleanText = stripHtmlNoise(html);
          const pagePhones = extractPhoneNumbers([cleanText]);
          if (pagePhones[0]) contacts.phone = pagePhones[0];
        }
      }
      // If homepage had no email, try common /contact page paths
      if (!contacts.email) {
        const contactHtml = await fetchContactPageHtml(websiteUrl);
        if (contactHtml) {
          const contactEmails = extractEmailsFromHtml(contactHtml);
          if (contactEmails[0]) contacts.email = contactEmails[0];
          if (!contacts.phone && !entity.primary_phone) {
            const cleanText = stripHtmlNoise(contactHtml);
            const pagePhones = extractPhoneNumbers([cleanText]);
            if (pagePhones[0]) contacts.phone = pagePhones[0];
          }
        }
      }
    }

    // Build UPDATE with COALESCE to preserve existing data
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (contacts.phone && !entity.primary_phone) {
      updates.push(`primary_phone = COALESCE(NULLIF(primary_phone, ''), $${paramIdx})`);
      params.push(contacts.phone);
      paramIdx++;
    }
    if (contacts.email && !entity.primary_email) {
      updates.push(`primary_email = COALESCE(NULLIF(primary_email, ''), $${paramIdx})`);
      params.push(contacts.email);
      paramIdx++;
    }
    if (contacts.website && !entity.website) {
      updates.push(`website = COALESCE(NULLIF(website, ''), $${paramIdx})`);
      params.push(contacts.website);
      paramIdx++;
    }

    updates.push('last_enriched_at = NOW()');
    params.push(entityId);

    const updated = await withTransaction(async (client) => {
      const { rows: [row] } = await client.query(
        `UPDATE entities SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        params
      );

      // Insert social links into entity_contacts
      const socialTypes = ['instagram', 'facebook', 'linkedin', 'houzz'] as const;
      for (const type of socialTypes) {
        if (contacts[type]) {
          await client.query(
            `INSERT INTO entity_contacts (entity_id, contact_type, contact_value, source)
             VALUES ($1, $2, $3, 'web_search')
             ON CONFLICT DO NOTHING`,
            [entityId, type, contacts[type]]
          );
        }
      }

      return row as Entity;
    });

    return updated;
  } catch (err) {
    logError('[enrichment]', err, { event: 'enrich_builder_failed', entity_id: entityId });

    // Still mark as enriched to prevent retry loops
    await query(
      'UPDATE entities SET last_enriched_at = NOW() WHERE id = $1',
      [entityId]
    ).catch((dbErr) => {
      logError('[enrichment]', dbErr, { event: 'mark_enriched_failed', entity_id: entityId });
    });

    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch enrichment
// ---------------------------------------------------------------------------

/**
 * Process unenriched entities in batches via Serper web search.
 * Prioritizes WSIB-matched entities (have trade name + mailing address).
 *
 * @param limit  Maximum number of entities to process. Defaults to 50.
 * @returns Counts of successfully enriched and failed entities.
 */
export async function enrichUnenrichedBuilders(
  limit: number = 50
): Promise<{ enriched: number; failed: number }> {
  const stats = { enriched: 0, failed: 0 };

  try {
    const unenriched = await query<{ id: number }>(
      `SELECT e.id
       FROM entities e
       LEFT JOIN wsib_registry w ON w.linked_entity_id = e.id
       WHERE e.last_enriched_at IS NULL
       ORDER BY
         CASE WHEN w.id IS NOT NULL THEN 0 ELSE 1 END,
         e.permit_count DESC
       LIMIT $1`,
      [limit]
    );

    for (let i = 0; i < unenriched.length; i++) {
      const result = await enrichBuilder(unenriched[i]!.id);
      if (result) {
        stats.enriched++;
      } else {
        stats.failed++;
      }

      if (i < unenriched.length - 1) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }
  } catch (err) {
    logError('[enrichment]', err, { event: 'batch_enrichment_error' });
  }

  return stats;
}
