// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (`applies_to.part` = named_addresses with refs;
//            `instrument` {kind, citation, municipality}), §10 (determinism; Spec 69a M-117 R-DET recursive lock)
//            docs/specs/01-pipeline/54_source_address_points.md §3 (the shared JOIN-key normalizers)
//            docs/specs/01-pipeline/129_source_coa_notices.md §7 (D7 link path + seeded 50-item precision sample)
//            Plan: .cursor/mcbylaw/named-addr-plan.md (phase2-plan-v2 P2-8.0(a))
//
// Named addresses in Ch.900 [SSP]/[PBS] items: a PURE, deterministic parse of each raw `applies_to.refs[]` string
// into structured addresses, a citation splitter for `instrument.citation`, and the pure pieces of the
// address_points → parcel resolution (range membership, status roll-up, the seeded sample, the precision bound).
// The raw strings stay authoritative; everything here is derived. No clock, entropy, host or locale API.
//
//   parseNamedRef(raw)              → {raw, addresses:[…], status: parsed|partial|unparsed, reasons:[…], historical_qualifier?}
//   splitCitations(citation)        → {raw, citations:[…], status: parsed|partial|unparsed}
//   historicalQualifier(text)       → {as_of_year, phrase} | null   ("municipally known as … in 1983")
//   cityStreet(phrase)              → {street, street_type, direction, city_full, key}  (key = the stored linear_name_normalized)
//   addrKey(a) / splitAddrNum(s)    → the stored addr_num_normalized form / its (number, suffix)
//   inRange(numSuffix, range)       → boolean (parity + (number, suffix) order, '' < 'A')
//   classifyItem(…) / rollUp(…)     → closed match_status
//   drawSample(items, seed, n, sha) → deterministic sample (caller injects the hash function)
//   deriveUnitNamed(unit)           → {unit_id, refs:[parseNamedRef…], citation} | null — the GENERATED table fields
//                                     (render.mjs row.named_units); Layer 2 resolves them to parcels at run time
//                                     with classifyItem, never through the table (P2-8.0(a))
//   scorePrecision(verdicts)        → {n, correct, precision, wilson_lower_95}
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Spec 54 §3 step 3: the ONE normalizer that wrote address_points.addr_num_normalized / linear_name_normalized.
const { normalizeAddressNumber, parseLinearName } = require('../../lib/address-normalizers.js');

export const NAMED_ADDR_VERSION = 'named-addr-v1';
export const PARSE_STATUS = Object.freeze(['parsed', 'partial', 'unparsed']);
export const MATCH_STATUS = Object.freeze(['exact', 'ambiguous', 'not_found', 'range_partial']);
export const MATCH_REASONS = Object.freeze([
  'no_refs', 'unparsed_ref', 'no_street', 'no_number', 'no_parcel_link', 'multi_parcel', 'multi_street', 'endpoint_missing',
]);
export const CITATION_KINDS = Object.freeze(['bylaw', 'section', 'schedule', 'regulation_569', 'statute', 'tribunal_file']);

// The City's own type abbreviations (measured 2026-10-14: the last token of the 9,619 distinct address_points
// linear_name_full values) and the long / variant spellings the by-law text uses for them.
const TYPE_ALIASES = Object.freeze({
  AVE: 'AVE', AVENUE: 'AVE', AV: 'AVE',
  RD: 'RD', ROAD: 'RD',
  DR: 'DR', DRIVE: 'DR',
  CRES: 'CRES', CRESCENT: 'CRES', CRESC: 'CRES',
  ST: 'ST', STREET: 'ST',
  CRT: 'CRT', COURT: 'CRT', CT: 'CRT',
  PL: 'PL', PLACE: 'PL',
  BLVD: 'BLVD', BOULEVARD: 'BLVD',
  LANE: 'LANE', LN: 'LANE',
  GT: 'GT', GATE: 'GT',
  SQ: 'SQ', SQUARE: 'SQ',
  TER: 'TER', TERR: 'TER', TERRACE: 'TER',
  WAY: 'WAY',
  GDNS: 'GDNS', GARDENS: 'GDNS',
  TRL: 'TRL', TRAIL: 'TRL',
  CRCL: 'CRCL', CIRCLE: 'CRCL', CIR: 'CRCL',
  MEWS: 'MEWS',
  GRV: 'GRV', GROVE: 'GRV',
  HTS: 'HTS', HEIGHTS: 'HTS',
  PKWY: 'PKWY', PARKWAY: 'PKWY',
  PTWY: 'PTWY', PATHWAY: 'PTWY',
  PATH: 'PATH', WALK: 'WALK',
  CRCT: 'CRCT', CIRCUIT: 'CRCT',
});
const DIRECTIONS = Object.freeze({ N: 'N', S: 'S', E: 'E', W: 'W', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' });

const squash = (s) => s.replace(/\s+/g, ' ').trim();

/** The street phrase in the City's spelling. key = parseLinearName(city_full).street_name — byte-equal to the stored
 *  linear_name_normalized for a City-spelled street (the shared function on both sides; its quirks included). */
export function cityStreet(phrase) {
  if (typeof phrase !== 'string') return null;
  const toks = squash(phrase.toUpperCase().replace(/[.,]/g, ' ').replace(/[`'’]/g, '')).split(' ').filter(Boolean);
  if (toks.length === 0 || !toks.some((t) => /[A-Z]/.test(t))) return null;
  let dir = null;
  if (toks.length >= 2 && DIRECTIONS[toks[toks.length - 1]] && TYPE_ALIASES[toks[toks.length - 2]]) {
    dir = DIRECTIONS[toks.pop()];
  }
  let typeIdx = -1;
  for (let i = toks.length - 1; i >= 1; i -= 1) if (TYPE_ALIASES[toks[i]]) { typeIdx = i; break; }
  // a type word is only a type when it ends the phrase (direction already removed): "St Clarens Ave" → AVE
  if (typeIdx !== toks.length - 1) typeIdx = -1;
  const type = typeIdx >= 0 ? TYPE_ALIASES[toks[typeIdx]] : null;
  const nameToks = typeIdx >= 0 ? toks.slice(0, typeIdx) : toks;
  if (nameToks.length === 0 || nameToks.some((t) => /\d/.test(t))) return null;
  const street = nameToks.join(' ');
  const cityFull = [street, type, dir].filter(Boolean).join(' ');
  const key = parseLinearName(cityFull).street_name || null;
  return { street, street_type: type, direction: dir, city_full: cityFull, key };
}

const NUM_RE = /^(\d+)(?:\s*(1\/2)|([A-Z]))?$/;
/** '125 1/2' / '146E' / '40' → {number, suffix}. Returns null for anything else. */
export function splitAddrNum(s) {
  if (typeof s !== 'string') return null;
  const m = NUM_RE.exec(squash(s.toUpperCase()));
  if (!m) return null;
  return { number: Number(m[1]), suffix: m[2] || m[3] || '' };
}
/** The stored addr_num_normalized form (Spec 54: normalizeAddressNumber of the City's ADDRESS_NUMBER). */
export function addrKey({ number, suffix }) {
  return normalizeAddressNumber(suffix === '1/2' ? `${number} 1/2` : `${number}${suffix || ''}`);
}
const cmpNS = (a, b) => (a.number !== b.number ? a.number - b.number : a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0);
export function inRange(ns, range) {
  if (!ns || !range) return false;
  if (range.parity === 'odd' && ns.number % 2 !== 1) return false;
  if (range.parity === 'even' && ns.number % 2 !== 0) return false;
  return cmpNS(range.from, ns) <= 0 && cmpNS(ns, range.to) <= 0;
}

// ── historical qualifier ──────────────────────────────────────────────────────────────────────────────────────────
export function historicalQualifier(text) {
  if (typeof text !== 'string') return null;
  const t = squash(text);
  let m = /municipally known in the year (\d{4}) as/i.exec(t);
  if (m) return { as_of_year: Number(m[1]), phrase: m[0] };
  m = /(?:municipally )?known as\b[^;:]*?\bin (\d{4})\b/i.exec(t);
  if (m) return { as_of_year: Number(m[1]), phrase: m[0] };
  return null;
}

// ── ref parsing ───────────────────────────────────────────────────────────────────────────────────────────────────
const PARITY_PREFIX = /^(?:on or between\s+)?(?:the\s+)?(odd|even)[- ]number(?:ed)? addresses (?:of|on|from)\s+/i;
const LEAD_NOISE = [/^on or between\s+/i, /^the lot known as\s+/i, /^(?:on\s+)?the lands (?:municipally )?known as\s+/i, /^lands (?:municipally )?known as\s+/i, /^the\s+(?=\d)/i];
const PARITY_SUFFIX = /\s*\((odd|even)\)\s*$|\s*,?\s+(odd|even)(?: addresses only| and inclusive| numbers)?\s*$/i;
const NUMSPEC = /^(\d+(?:\s*1\/2|[A-Z](?![A-Z]))?)(?:\s*(?:-|–|to)\s*(\d+(?:\s*1\/2|[A-Z](?![A-Z]))?))?(?=\s|$)/i;

function parseNum(tok) {
  return splitAddrNum(tok.replace(/\s+/g, ' '));
}

/** Split a list ref into segments: "A, B and C St." → ["A", "B", "C St."]; keeps parenthesised parity with its segment. */
function segments(body) {
  return body.split(/\s*;\s*|\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i).map(squash).filter(Boolean);
}

function parseSegment(seg) {
  let s = seg;
  let parity = null;
  let partOf = false;
  const pp = PARITY_PREFIX.exec(s);
  if (pp) { parity = pp[1].toLowerCase(); s = s.slice(pp[0].length); }
  for (const re of LEAD_NOISE) s = s.replace(re, '');
  if (/^part of\s+/i.test(s)) { partOf = true; s = s.replace(/^part of\s+/i, ''); }
  const ps = PARITY_SUFFIX.exec(s);
  if (ps) { parity = parity || (ps[1] || ps[2]).toLowerCase(); s = s.slice(0, ps.index); }
  s = squash(s.replace(/\.$/, '').replace(/,$/, ''));
  const m = NUMSPEC.exec(s);
  if (!m) return { kind: 'text', text: s, parity, partOf };
  const from = parseNum(m[1]);
  const to = m[2] ? parseNum(m[2]) : null;
  const rest = squash(s.slice(m[0].length));
  return { kind: 'num', from, to, parity, partOf, street: rest || null };
}

function rangeParity(from, to, stated) {
  if (stated) return { parity: stated, parity_basis: 'stated' };
  if (from.number % 2 === to.number % 2) return { parity: from.number % 2 ? 'odd' : 'even', parity_basis: 'inferred' };
  return { parity: 'all', parity_basis: 'inferred' };
}

function streetFields(cs) {
  return { street: cs.street, street_type: cs.street_type, direction: cs.direction, city_full: cs.city_full, street_key: cs.key };
}

/** Parse one raw `applies_to.refs[]` string. PURE. */
export function parseNamedRef(raw) {
  const out = { raw: raw ?? null, addresses: [], status: 'unparsed', reasons: [] };
  if (typeof raw !== 'string' || !raw.trim()) { out.reasons.push('empty_ref'); return out; }
  const hq = historicalQualifier(raw);
  if (hq) out.historical_qualifier = hq;
  let body = squash(raw);
  // "Baldwin Street (40 to 131)": street first, range in brackets
  const sf = /^([A-Za-z][A-Za-z .'’]+?)\s*\((\d+[A-Z]?)\s*(?:to|-)\s*(\d+[A-Z]?)\)\s*\.?$/i.exec(body);
  if (sf) body = `${sf[2]}-${sf[3]} ${sf[1]}`;
  if (/^(?:a|any|the) lot(?:s)? fronting on\b/i.test(body)) { out.reasons.push('descriptive_lot'); return out; }
  const segs = segments(body).map(parseSegment);
  // a segment without a street takes the street of the next segment that has one ("707, 709 and 711 Dovercourt Road")
  let carry = null;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const g = segs[i];
    if (g.kind !== 'num') { carry = null; continue; }
    if (g.street) carry = g.street; else if (carry) g.street = carry;
  }
  // a parity prefix on the first segment of a ref ("odd numbered addresses of 1-19 X, 2-20 Y") is per-segment only
  let bad = 0;
  for (const g of segs) {
    if (g.kind !== 'num') { bad += 1; out.reasons.push(/[a-z]/i.test(g.text) && !/\d/.test(g.text) ? 'no_house_number' : 'unrecognised_segment'); continue; }
    const cs = g.street ? cityStreet(g.street) : null;
    if (!g.from || (g.to === null && /\d/.test(g.street || '') && !cs)) { bad += 1; out.reasons.push('unrecognised_number'); continue; }
    if (!cs) { bad += 1; out.reasons.push('no_street'); continue; }
    if (g.to) {
      if (!g.to || cmpNS(g.from, g.to) > 0) { bad += 1; out.reasons.push('inverted_range'); continue; }
      out.addresses.push({
        ...streetFields(cs),
        range: { from: g.from, to: g.to, from_key: addrKey(g.from), to_key: addrKey(g.to), ...rangeParity(g.from, g.to, g.parity) },
        ...(g.partOf ? { part_of: true } : {}),
      });
    } else {
      out.addresses.push({ ...streetFields(cs), number: g.from.number, suffix: g.from.suffix, key: addrKey(g.from), ...(g.partOf ? { part_of: true } : {}) });
    }
    if (g.partOf) out.reasons.push('part_of_lot');
  }
  if (out.addresses.length === 0) out.status = 'unparsed';
  else out.status = bad > 0 || out.addresses.some((a) => a.part_of) ? 'partial' : 'parsed';
  out.reasons = [...new Set(out.reasons)].sort();
  return out;
}

// ── citation splitting ────────────────────────────────────────────────────────────────────────────────────────────
const MUNI_RE = /\b((?:the\s+)?(?:former\s+)?(?:City|Borough|Town|Township|Village|Metropolitan) of [A-Z][A-Za-z]+(?: York| Toronto)?)\b/g;
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_RE = new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2},\\s*\\d{4}`, 'g');
const READ_RE = /,?\s*as it read\b[^;]*?(?=;|$)/gi;
const BYLAW_NUM = /\b(\d{1,4}-\d{2,4}|\d{4,5})\b(\s*\((?:OMB|OLT)\))?/g;
const SECTION_RE = /\bSection\s+(\d[\d.]*(?:\s*\(\s*[0-9a-z]+\s*\))*(?:\s*\d+(?:\([a-z]\))?)?)\s*(?=,|\s+of\b|$)/gi;
const REG569_RE = /^(?:Clauses?\s+|regulations?\s+)?\d{1,3}\.\d+\.\d+/i;

const blank = (s, start, len) => s.slice(0, start) + ' '.repeat(len) + s.slice(start + len);

/** Split one `instrument.citation` string into its by-laws, sections, schedules. PURE. */
export function splitCitations(citation) {
  const out = { raw: citation ?? null, citations: [], status: 'unparsed' };
  if (typeof citation !== 'string' || !citation.trim()) return out;
  const raw = squash(citation.replace(/By-\s+law/gi, 'By-law').replace(/`/g, "'"));
  if (REG569_RE.test(raw)) {
    // a By-law 569-2013 regulation list (optionally "or with the provisions of By-law 569-2013 … as it read …")
    const read = /as it read\b.*$/i.exec(raw);
    const regs = raw.replace(/,?\s*or with the provisions of By-law 569-2013.*$/i, '');
    out.citations.push({ kind: 'regulation_569', ref: squash(regs), bylaw: '569-2013', municipality: null, qualifier: null });
    if (/or with the provisions of By-law 569-2013/i.test(raw)) {
      out.citations.push({ kind: 'bylaw', bylaw: '569-2013', municipality: null, qualifier: read ? squash(read[0]) : null });
    }
    out.status = 'partial'; // the regulation list itself is not split into regulations
    return out;
  }
  if (/\bPlanning Act\b/i.test(raw)) {
    out.citations.push({ kind: 'statute', ref: raw, bylaw: null, municipality: null, qualifier: null });
    out.status = 'parsed';
    return out;
  }
  let work = raw;
  const qualifiers = [];
  for (const re of [READ_RE]) {
    work = work.replace(re, (m) => { qualifiers.push(squash(m.replace(/^,/, ''))); return ' '.repeat(m.length); });
  }
  work = work.replace(DATE_RE, (m) => ' '.repeat(m.length));
  const amended = /\bas amended\b/i.test(work);
  // tribunal files: "OMB File. R960113"
  work = work.replace(/\bOMB File\.?\s*([A-Z]\d{5,})/g, (m, f) => { out.citations.push({ kind: 'tribunal_file', ref: f, bylaw: null, municipality: null, qualifier: null }); return ' '.repeat(m.length); });
  const munis = [];
  for (const m of work.matchAll(MUNI_RE)) munis.push({ at: m.index, name: squash(m[1].replace(/^the\s+/i, '')) });
  const muniAt = (pos) => { let best = null; for (const m of munis) if (m.at < pos) best = m.name; return best; };
  const sections = [];
  for (const m of work.matchAll(SECTION_RE)) sections.push({ at: m.index, end: m.index + m[0].length, section: squash(m[1]) });
  for (const s of sections) work = blank(work, s.at, s.end - s.at);
  const schedule = /\bSchedule\s+['"]?[A-Z]['"]?(?:\s+(?:Exception\s+\d+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))?/.exec(work);
  const found = [];
  for (const m of work.matchAll(BYLAW_NUM)) {
    const num = m[1];
    // the year of a "Section 12(1) 18" stays inside the blanked section; a 4-digit bare number must follow "by-law"
    if (/^\d{4}$/.test(num) && !/by-?laws?\b[^.;]*$/i.test(work.slice(0, m.index))) continue;
    found.push({ at: m.index, bylaw: num, tribunal: m[2] ? squash(m[2]).replace(/[()]/g, '') : null });
  }
  for (const f of found) {
    const sec = sections.filter((s) => s.at < f.at && !found.some((g) => g !== f && g.at > s.at && g.at < f.at)).pop();
    const base = { bylaw: f.bylaw, municipality: muniAt(f.at), qualifier: null };
    if (f.tribunal) base.tribunal = f.tribunal;
    if (sec) out.citations.push({ kind: 'section', section: sec.section, ...base });
    else if (schedule && schedule.index < f.at) out.citations.push({ kind: 'schedule', part: squash(schedule[0]), ...base });
    else out.citations.push({ kind: 'bylaw', ...base });
  }
  const q = [...qualifiers, ...(amended ? ['as amended'] : [])];
  if (q.length) for (const c of out.citations) if (c.kind !== 'tribunal_file') c.qualifier = q.join('; ');
  // order by position in the string is already preserved for by-laws; tribunal files were pushed first → move last
  out.citations.sort((a, b) => (a.kind === 'tribunal_file') - (b.kind === 'tribunal_file'));
  const bylawCount = out.citations.filter((c) => c.bylaw).length;
  const orphanSections = sections.filter((s) => !found.some((f) => f.at > s.at)).length;
  out.status = bylawCount === 0 ? 'unparsed' : orphanSections > 0 ? 'partial' : 'parsed';
  return out;
}

// ── the derived table fields (operator ruling, lane NAMED-ADDR-2) ─────────────────────────────────────────────────
/**
 * The DERIVED named-reference fields of one agreed unit, as the generated table carries them (render.mjs buildTable
 * → row.named_units[]): `refs` = one parseNamedRef per raw `applies_to.refs[]` string when part = named_addresses (each
 * keeps its `raw`, the authoritative string), `citation` = splitCitations(instrument.citation) or null. null when the
 * unit names neither. map_area / lot_list refs are not addresses and are not parsed. PURE; regenerated on every
 * `--check` / `--write`, never hand-edited (G-DRIFT). No DB-derived field (match_status, parcels) ever enters here.
 */
export function deriveUnitNamed(unit) {
  const at = unit && unit.applies_to;
  const refs = at && typeof at === 'object' && at.part === 'named_addresses' && Array.isArray(at.refs) ? at.refs : [];
  const inst = unit && unit.instrument;
  const cit = inst && typeof inst === 'object' && typeof inst.citation === 'string' && inst.citation.trim() ? inst.citation : null;
  if (refs.length === 0 && cit === null) return null;
  return { unit_id: unit.unit_id, refs: refs.map(parseNamedRef), citation: cit === null ? null : splitCitations(cit) };
}

// ── resolution (pure pieces; the runner supplies the address points) ─────────────────────────────────────────────
const RANK = { exact: 0, range_partial: 1, ambiguous: 2, not_found: 3 };
export function worst(statuses) {
  if (statuses.length === 0) return 'not_found';
  return statuses.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'exact');
}

/**
 * Classify one parsed address item against the address points on its candidate streets.
 * points: [{address_point_id, linear_name_full, addr_num_normalized, parcel_id|null}], already filtered to the
 * item's candidate streets (tier 1 = exact City full name; tier 2 = the shared key) by the caller.
 * Returns {match_status, reasons[], parcels[], streets[], members_found, endpoints_found?}.
 */
export function classifyItem(item, points) {
  const reasons = [];
  if (item.range) {
    const r = item.range;
    const members = points.filter((p) => inRange(splitAddrNum(p.addr_num_normalized), r));
    const streets = [...new Set(members.map((p) => p.linear_name_full))].sort();
    const parcels = [...new Set(members.map((p) => p.parcel_id).filter((x) => x !== null && x !== undefined))].sort((a, b) => a - b);
    const keys = new Set(members.map((p) => p.addr_num_normalized));
    const ends = [keys.has(r.from_key), keys.has(r.to_key)];
    const res = { parcels, streets, members_found: keys.size, endpoints_found: ends.filter(Boolean).length };
    if (members.length === 0) return { match_status: 'not_found', reasons: ['no_number'], ...res };
    if (streets.length > 1) return { match_status: 'ambiguous', reasons: ['multi_street'], ...res };
    if (parcels.length === 0) return { match_status: 'not_found', reasons: ['no_parcel_link'], ...res };
    if (!ends[0] || !ends[1]) return { match_status: 'range_partial', reasons: ['endpoint_missing'], ...res };
    return { match_status: 'exact', reasons, ...res };
  }
  const hits = points.filter((p) => p.addr_num_normalized === item.key);
  const streets = [...new Set(hits.map((p) => p.linear_name_full))].sort();
  const parcels = [...new Set(hits.map((p) => p.parcel_id).filter((x) => x !== null && x !== undefined))].sort((a, b) => a - b);
  const res = { parcels, streets, members_found: hits.length ? 1 : 0 };
  if (hits.length === 0) return { match_status: 'not_found', reasons: ['no_number'], ...res };
  if (streets.length > 1) return { match_status: 'ambiguous', reasons: ['multi_street'], ...res };
  if (parcels.length === 0) return { match_status: 'not_found', reasons: ['no_parcel_link'], ...res };
  if (parcels.length > 1) return { match_status: 'ambiguous', reasons: ['multi_parcel'], ...res };
  return { match_status: 'exact', reasons, ...res };
}

/** Deterministic sample: order by hash(seed|id) ascending, take n. `hash` is injected (sha256 hex in the runner). */
export function drawSample(items, seed, n, hash) {
  return items
    .map((it) => ({ it, h: hash(`${seed}|${it.sample_id}`) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : a.it.sample_id < b.it.sample_id ? -1 : 1))
    .slice(0, n)
    .map((x) => x.it);
}

/** Precision of a read sample + the Wilson 95 % lower bound (Spec 69a M-126 reporting). ambiguous ⇒ incorrect. */
export function scorePrecision(verdicts) {
  const read = verdicts.filter((v) => v === 'correct' || v === 'incorrect' || v === 'ambiguous');
  const n = read.length;
  const k = read.filter((v) => v === 'correct').length;
  if (n === 0) return { n: 0, correct: 0, precision: null, wilson_lower_95: null };
  const z = 1.959963984540054;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { n, correct: k, precision: p, wilson_lower_95: Math.round(((centre - half) / den) * 1e4) / 1e4 };
}
