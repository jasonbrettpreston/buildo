import type { ParsedAddress } from './types';

// Street-type suffixes (same set as src/lib/coa/linker.ts:60)
const STREET_TYPE_REGEX =
  /\b(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\b/;

// Map long-form street types to short-form
const STREET_TYPE_MAP: Record<string, string> = {
  STREET: 'ST',
  AVENUE: 'AVE',
  DRIVE: 'DR',
  ROAD: 'RD',
  BOULEVARD: 'BLVD',
  COURT: 'CRT',
  CRESCENT: 'CRES',
  PLACE: 'PL',
  LANE: 'LN',
  TRAIL: 'TR',
  TERRACE: 'TERR',
  CIRCLE: 'CIR',
  PARKWAY: 'PKWY',
  GARDENS: 'GDNS',
  GROVE: 'GRV',
  HEIGHTS: 'HTS',
  SQUARE: 'SQ',
};

/**
 * Parse a LINEAR_NAME_FULL value (e.g. "Jane St", "Queen Street West")
 * into normalized components for address matching.
 *
 * Returns {street_name, street_type} both uppercased.
 * Directional suffixes (N, S, E, W) are stripped from the name.
 */
export function parseLinearName(linearName: string): {
  street_name: string;
  street_type: string;
} {
  if (!linearName || !linearName.trim()) {
    return { street_name: '', street_type: '' };
  }

  const upper = linearName.trim().toUpperCase();

  // Extract street type
  const typeMatch = upper.match(STREET_TYPE_REGEX);
  let streetType = '';
  if (typeMatch) {
    streetType = STREET_TYPE_MAP[typeMatch[1]] || typeMatch[1];
  }

  // Remove the street type and directional suffixes to get the name
  const nameOnly = upper
    .replace(STREET_TYPE_REGEX, '')
    .replace(/\b(NORTH|SOUTH|EAST|WEST|[NSEW])\s*$/, '') // trailing direction
    .replace(/\s+/g, ' ')
    .trim();

  return { street_name: nameOnly, street_type: streetType };
}

/**
 * Normalize an address number (strip leading zeros, uppercase letters).
 */
export function normalizeAddressNumber(num: string | null | undefined): string {
  if (!num) return '';
  return num.trim().replace(/^0+/, '').toUpperCase();
}

/**
 * Parse a full address into normalized components for matching against parcels.
 */
export function parseAddress(
  streetNum: string | null | undefined,
  streetName: string | null | undefined,
  streetType: string | null | undefined
): ParsedAddress {
  return {
    num: normalizeAddressNumber(streetNum),
    street_name: (streetName || '').trim().toUpperCase(),
    street_type: (streetType || '').trim().toUpperCase(),
  };
}
