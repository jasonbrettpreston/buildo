import type { Inspection } from '@/lib/permits/types';
// Single source of truth for status normalization — shared with Python scraper
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STATUS_CONFIG = require('../../../scripts/lib/status_mapping.json') as {
  status_normalization: Record<string, string>;
  enriched_status: Record<string, string>;
};

/**
 * Parse an HTML table from the AIC portal inspection status popup.
 * Expected columns: Stage Name | Status | Date
 */
export function parseInspectionTable(
  html: string,
  permitNum: string
): Inspection[] {
  const results: Inspection[] = [];

  // Match each <tr> containing <td> cells
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of html.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1] ?? '';

    // Extract all <td> contents
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    for (const cellMatch of rowHtml.matchAll(cellRegex)) {
      // Strip inner HTML tags and trim
      cells.push((cellMatch[1] ?? '').replace(/<[^>]*>/g, '').trim());
    }

    // Need at least 2 columns: stage_name, status
    if (cells.length < 2) continue;

    const stageName = cells[0]!;
    const status = normalizeStatus(cells[1]!);

    // Skip header rows
    if (!status || stageName.toLowerCase() === 'inspection stage') continue;

    const dateStr = cells.length >= 3 ? parseInspectionDate(cells[2]!) : null;

    results.push({
      permit_num: permitNum,
      stage_name: stageName,
      status,
      inspection_date: dateStr,
      scraped_at: new Date().toISOString(),
    });
  }

  return results;
}

/**
 * Normalize status text from the portal to one of the valid enum values.
 */
export function normalizeStatus(
  raw: string
): 'Outstanding' | 'Passed' | 'Not Passed' | 'Partial' | null {
  const s = raw.trim().toLowerCase();
  const mapped = STATUS_CONFIG.status_normalization[s];
  return (mapped as 'Outstanding' | 'Passed' | 'Not Passed' | 'Partial') || null;
}

/**
 * Parse a date string from the portal (various formats).
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function parseInspectionDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === 'N/A') return null;

  // Try ISO-like format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  // Try MM/DD/YYYY or DD/MM/YYYY — portal uses MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  // Try "Mon D, YYYY" / "Month D, YYYY" format (AIC portal uses this)
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const namedMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedMatch) {
    const monthNum = MONTHS[namedMatch[1]!.slice(0, 3).toLowerCase()];
    if (monthNum) {
      return `${namedMatch[3]}-${monthNum}-${namedMatch[2]!.padStart(2, '0')}`;
    }
  }

  return null;
}
