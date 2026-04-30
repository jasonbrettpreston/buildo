// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3
//            docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3
//
// Lead id parser. The mobile client encodes a lead's identity as either:
//   - `${permit_num}--${revision_num}` for building permits
//   - `COA-${application_number}` for Committee of Adjustment applications
//
// Returns null for malformed input so the route handler can return a 400
// (badRequestInvalidId) instead of leaking the parse failure as a 500.

export type ParsedLeadId =
  | { kind: 'permit'; permit_num: string; revision_num: string }
  | { kind: 'coa'; application_number: string };

export function parseLeadId(raw: string | undefined | null): ParsedLeadId | null {
  if (typeof raw !== 'string') return null;
  // The dynamic-segment id arrives URL-decoded by Next.js, but defensively
  // trim — a stray newline from a misbehaving client would otherwise pass
  // the non-empty checks below and reach the SQL parameter.
  const id = raw.trim();
  if (id.length === 0) return null;

  // CoA branch: prefix must be exactly `COA-` (case-sensitive — the mobile
  // client encodes uppercase). Application numbers can contain slashes
  // (`A0123/24EYK`) so we don't impose a character whitelist beyond non-empty.
  if (id.startsWith('COA-')) {
    const application_number = id.slice(4);
    if (application_number.length === 0) return null;
    return { kind: 'coa', application_number };
  }

  // Permit branch: split on `--`. Toronto permit numbers contain single
  // dashes (`23-145678-BLD`) so a `--` only appears as the encoded
  // separator. Use indexOf+slice rather than split to support permit
  // numbers that might (defensively) contain `--` in the future — first
  // occurrence wins, everything after is the revision_num.
  const sep = id.indexOf('--');
  if (sep <= 0) return null;
  const permit_num = id.slice(0, sep);
  const revision_num = id.slice(sep + 2);
  if (permit_num.length === 0 || revision_num.length === 0) return null;
  return { kind: 'permit', permit_num, revision_num };
}
