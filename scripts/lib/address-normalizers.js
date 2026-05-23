'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
 *
 * Shared normalization functions used by load-parcels.js AND
 * load-address-points.js to produce the cross-table JOIN keys
 * (parcels.addr_num_normalized + parcels.street_name_normalized vs
 *  address_points.addr_num_normalized + address_points.linear_name_normalized).
 *
 * WHY a shared module: the link-parcels.js + link-coa-to-parcels.js
 * strategies JOIN parcels and address_points on these normalized text
 * columns. If the two loaders compute them with different logic, the
 * JOIN silently produces 0 matches for the divergent rows. This module
 * is the single source of truth so a code change to normalization
 * cannot drift the JOIN keys apart.
 *
 * Functions extracted verbatim from scripts/load-parcels.js (the prior
 * source-of-truth before WF1 #parcel-address-bridge Phase 2b).
 */

// Toronto street-type tokens. Used by parseLinearName to (a) extract a
// canonical short-form street_type and (b) strip the long-form token
// from the name-only string. Matched as whole words; the regex is a
// single capture group, callable inline with String.prototype.match.
const STREET_TYPE_REGEX =
  /\b(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\b/;

const STREET_TYPE_MAP = {
  STREET: 'ST', AVENUE: 'AVE', DRIVE: 'DR', ROAD: 'RD',
  BOULEVARD: 'BLVD', COURT: 'CRT', CRESCENT: 'CRES', PLACE: 'PL',
  LANE: 'LN', TRAIL: 'TR', TERRACE: 'TERR', CIRCLE: 'CIR',
  PARKWAY: 'PKWY', GARDENS: 'GDNS', GROVE: 'GRV', HEIGHTS: 'HTS',
  SQUARE: 'SQ',
};

function normalizeAddressNumber(num) {
  if (!num) return '';
  return num.trim().replace(/^0+/, '').toUpperCase();
}

function parseLinearName(linearName) {
  if (!linearName || !linearName.trim()) {
    return { street_name: '', street_type: '' };
  }
  const upper = linearName.trim().toUpperCase();
  const typeMatch = upper.match(STREET_TYPE_REGEX);
  let streetType = '';
  if (typeMatch) {
    streetType = STREET_TYPE_MAP[typeMatch[1]] || typeMatch[1];
  }
  const nameOnly = upper
    .replace(STREET_TYPE_REGEX, '')
    .replace(/\b(NORTH|SOUTH|EAST|WEST|[NSEW])\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { street_name: nameOnly, street_type: streetType };
}

module.exports = {
  STREET_TYPE_REGEX,
  STREET_TYPE_MAP,
  normalizeAddressNumber,
  parseLinearName,
};
