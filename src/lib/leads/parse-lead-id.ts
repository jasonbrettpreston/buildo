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

  // ── P21: Additive colon-form id support (Spec 91 §id-format, 2026-07-11) ──
  //
  // The mobile lead feed (get-lead-feed.ts, permit_candidates CTE) emits
  // lead_id as `${permit_num}:${LPAD(revision_num,2,'0')}` — no prefix.
  // The lead_key column and lead_trades use `permit:${permit_num}:${revision_num}`.
  // All three new colon forms are accepted here additively; the existing
  // `COA-` and `--` branches above/below are deliberate fences and MUST NOT
  // be altered.
  //
  // Toronto permit_num format assumption: `YY-NNNNNN-TYPE` (e.g. `23-145678-BLD`)
  // or `YY NNNNNN TYPE` (space-separated). Single dashes and spaces are legal
  // within permit_num; COLONS are not — the colon is therefore an unambiguous
  // separator for the new forms.

  // coa: lowercase prefix (feed-emitted: `coa:${ca.application_number}`)
  if (id.startsWith('coa:')) {
    const application_number = id.slice('coa:'.length);
    if (application_number.length === 0) return null;
    return { kind: 'coa', application_number };
  }

  // permit: explicit prefix (lead_key / lead_trades: `permit:${num}:${LPAD(rev,2,'0')}`)
  // Use lastIndexOf so the full permit_num is captured as the initial segment
  // and revision_num is always the final colon-delimited part.
  if (id.startsWith('permit:')) {
    const rest = id.slice('permit:'.length);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon <= 0) return null;
    const permit_num = rest.slice(0, lastColon);
    const revision_num = rest.slice(lastColon + 1);
    if (permit_num.length === 0 || revision_num.length === 0) return null;
    return { kind: 'permit', permit_num, revision_num };
  }

  // NUM:REV — feed-emitted colon form (no prefix; checked after `permit:` and
  // `coa:` guards so those prefixes match first). revision_num must not itself
  // contain `:` (that would be a different, unrecognised encoding).
  if (id.includes(':')) {
    const colonIdx = id.indexOf(':');
    const permit_num = id.slice(0, colonIdx);
    const revision_num = id.slice(colonIdx + 1);
    if (permit_num.length === 0 || revision_num.length === 0) return null;
    if (revision_num.includes(':')) return null;
    return { kind: 'permit', permit_num, revision_num };
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
