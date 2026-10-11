/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D2
 *
 * The CoA decision-PDF manifest contract — a PURE CommonJS module.
 *
 * It declares the closed sets of the pinned inventory (source families, sessions, kinds,
 * revisions, panels, exclusion reasons, pacing floor) and validates a manifest against them.
 * It reads no file, never touches `fs`, `process.env`, the clock or the network, so a static
 * scan can prove purity. `docIdFor` and `parseDocTitle` derive everything from the URL string
 * alone; `validateManifest` returns a list of short, closed-shape problem sentences (empty =
 * valid) rather than throwing — the caller decides the posture.
 *
 * A problem sentence names the offending field and the doc_id/url. URLs carry no personal
 * data (they are public City of Toronto document paths), so naming them is safe.
 */
'use strict';

/** Closed sets + the pacing floor for the pinned inventory. Frozen: a mutation is a bug. */
const MANIFEST_CONTRACT = Object.freeze({
  source_families: Object.freeze(['toronto_ca_decision_pdf']),
  sessions: Object.freeze(['am', 'pm', 'full']),
  kinds: Object.freeze(['committee', 'delegated']),
  revisions: Object.freeze(['original', 'revised']),
  panels: Object.freeze(['etobicoke_york', 'north_york', 'toronto_east_york', 'scarborough', 'york', 'unknown']),
  excluded_reasons: Object.freeze(['http_404_at_pin', 'delegated_decision', 'operator_excluded']),
  pace_floor_ms: 2000,
});

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** The basename of a URL (fallback: a bare path), decoded of any percent-escapes. */
function basenameOf(url) {
  const s = String(url);
  const cut = s.split(/[?#]/)[0];
  const parts = cut.split('/');
  let base = parts[parts.length - 1] || '';
  try {
    base = decodeURIComponent(base);
  } catch {
    // A malformed escape sequence: keep the raw basename rather than throw.
  }
  return base;
}

/**
 * parseDocTitle(url) → { hearing_date, session, kind, revision, panel } from the URL basename
 * ONLY. Every field is from the contract's closed sets, or null for a date that is not present.
 */
function parseDocTitle(url) {
  const base = basenameOf(url);

  // Date: a full English month name, `[_ -]`, day, `[_ -,]+`, 4-digit year.
  let hearing_date = null;
  const dm = new RegExp(`(${MONTHS.join('|')})[_ -]+(\\d{1,2})[_ ,-]+(\\d{4})`, 'i').exec(base);
  if (dm) {
    const month = MONTHS.indexOf(dm[1].toLowerCase()) + 1;
    const day = Number(dm[2]);
    const year = Number(dm[3]);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    hearing_date = isRealCalendarDate(iso) ? iso : null;
  }

  // Session: AM / PM as a standalone token, else a full-day hearing.
  const session = /(^|[_ -])AM([_ .-]|$)/i.test(base)
    ? 'am'
    : /(^|[_ -])PM([_ .-]|$)/i.test(base)
      ? 'pm'
      : 'full';

  const kind = /delegated/i.test(base) ? 'delegated' : 'committee';
  const revision = /revised/i.test(base) ? 'revised' : 'original';

  // Panel: first match wins, so a more specific token is tested before the bare `York`.
  let panel = 'unknown';
  if (/Etobicoke|EYK/i.test(base)) panel = 'etobicoke_york';
  else if (/North.?York|_NY_|-NY-/i.test(base)) panel = 'north_york';
  else if (/TEY|Toronto.?East/i.test(base)) panel = 'toronto_east_york';
  else if (/Scarborough|_SC_|-SC-/i.test(base)) panel = 'scarborough';
  else if (/York/i.test(base)) panel = 'york';

  return { hearing_date, session, kind, revision, panel };
}

/**
 * docIdFor(url) → a deterministic id: the lower-cased basename without `.pdf`, every run of
 * non `[a-z0-9]` characters collapsed to a single `-`, trimmed of leading/trailing `-`,
 * truncated to 80 characters.
 */
function docIdFor(url) {
  const base = basenameOf(url).replace(/\.pdf$/i, '');
  const id = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id.slice(0, 80);
}

// --- validation helpers -----------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOC_ID = /^[a-z0-9][a-z0-9_-]{2,80}$/;

/** True iff `iso` is `YYYY-MM-DD` AND a real calendar date (rejects 2017-02-30). Pure arithmetic, no clock. */
function isRealCalendarDate(iso) {
  if (!ISO_DATE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= days;
}

/** Parse a URL and return its https host, or null if it is not a parseable https URL. */
function httpsHost(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  return u.hostname;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * validateManifest(m, { hostAllowlist }) → string[] of problems (empty = valid).
 *
 * The shape is closed: every field named below is checked for presence, type and (where it has
 * one) its closed set. A missing `kind` or `session` on a document IS a problem — those are
 * contract values, never defaults.
 */
function validateManifest(m, options = {}) {
  const { hostAllowlist } = options;
  const allow = Array.isArray(hostAllowlist) ? hostAllowlist : [];
  const problems = [];

  if (!isPlainObject(m)) return ['manifest is not an object'];
  // Fail closed: a caller that supplies no allowlist cannot have its hosts checked.
  if (allow.length === 0) problems.push('hostAllowlist must be a non-empty array (supplied by the caller)');

  // --- top level --------------------------------------------------------------------------
  if (!MANIFEST_CONTRACT.source_families.includes(m.source_family)) {
    problems.push(`source_family not in contract: ${JSON.stringify(m.source_family)}`);
  }
  if (!isNonEmptyString(m.user_agent)) {
    problems.push('user_agent must be a non-empty string');
  }
  if (!Number.isInteger(m.pace_ms) || m.pace_ms < MANIFEST_CONTRACT.pace_floor_ms) {
    problems.push(`pace_ms must be an integer >= ${MANIFEST_CONTRACT.pace_floor_ms}: ${JSON.stringify(m.pace_ms)}`);
  }

  if (!isPlainObject(m.discovered_via) || !isNonEmptyString(m.discovered_via.cdx_query) || !isNonEmptyString(m.discovered_via.run_at)) {
    problems.push('discovered_via must be an object with string cdx_query and run_at');
  }

  if (!isPlainObject(m.robots) || !isNonEmptyString(m.robots.url) || !HEX64.test(String(m.robots.sha256)) || !isNonEmptyString(m.robots.fetched_at) || m.robots.verdict !== 'allowed') {
    problems.push('robots must be an object with url, 64-hex sha256, fetched_at and verdict "allowed"');
  }

  if (!isPlainObject(m.terms) || !isNonEmptyString(m.terms.url) || !HEX64.test(String(m.terms.sha256)) || !isNonEmptyString(m.terms.fetched_at)) {
    problems.push('terms must be an object with url, 64-hex sha256 and fetched_at');
  }

  if (!Array.isArray(m.documents) || m.documents.length === 0) {
    problems.push('documents must be a non-empty array');
  }
  if (!Array.isArray(m.excluded)) {
    problems.push('excluded must be an array');
  }

  // --- documents --------------------------------------------------------------------------
  const seenIds = new Set();
  const seenDocUrls = new Set();
  const excludedUrls = new Set(
    Array.isArray(m.excluded)
      ? m.excluded.map((e) => (isPlainObject(e) ? e.url : undefined)).filter((u) => typeof u === 'string')
      : [],
  );

  if (Array.isArray(m.documents)) {
    m.documents.forEach((d, i) => {
      if (!isPlainObject(d)) {
        problems.push(`documents[${i}] is not an object`);
        return;
      }
      const who = d.doc_id || d.url || `documents[${i}]`;

      if (typeof d.doc_id !== 'string' || !DOC_ID.test(d.doc_id)) {
        problems.push(`documents[${i}].doc_id is not a valid doc id: ${who}`);
      } else if (seenIds.has(d.doc_id)) {
        problems.push(`duplicate doc_id: ${d.doc_id}`);
      } else {
        seenIds.add(d.doc_id);
      }

      const host = httpsHost(d.url);
      if (host === null) {
        problems.push(`${who}.url must be an https URL: ${String(d.url)}`);
      } else {
        if (!allow.includes(host)) {
          problems.push(`${who}.url host not allowed: ${host}`);
        }
        if (seenDocUrls.has(d.url)) {
          problems.push(`duplicate document url: ${d.url}`);
        } else {
          seenDocUrls.add(d.url);
        }
        if (excludedUrls.has(d.url)) {
          problems.push(`document url also appears in excluded: ${d.url}`);
        }
      }

      if (typeof d.sha256 !== 'string' || !HEX64.test(d.sha256)) {
        problems.push(`${who}.sha256 must be 64 lowercase hex: ${String(d.sha256)}`);
      }
      if (!Number.isInteger(d.bytes) || d.bytes <= 0) {
        problems.push(`${who}.bytes must be an integer > 0: ${JSON.stringify(d.bytes)}`);
      }
      if (typeof d.hearing_date !== 'string' || !isRealCalendarDate(d.hearing_date)) {
        problems.push(`${who}.hearing_date must be a real ISO date YYYY-MM-DD: ${String(d.hearing_date)}`);
      }
      if (!MANIFEST_CONTRACT.sessions.includes(d.session)) {
        problems.push(`${who}.session not in contract: ${JSON.stringify(d.session)}`);
      }
      if (!MANIFEST_CONTRACT.kinds.includes(d.kind)) {
        problems.push(`${who}.kind not in contract: ${JSON.stringify(d.kind)}`);
      }
      if (!MANIFEST_CONTRACT.revisions.includes(d.revision)) {
        problems.push(`${who}.revision not in contract: ${JSON.stringify(d.revision)}`);
      }
      if (!MANIFEST_CONTRACT.panels.includes(d.panel)) {
        problems.push(`${who}.panel not in contract: ${JSON.stringify(d.panel)}`);
      }
      if (!isNonEmptyString(d.pinned_at)) {
        problems.push(`${who}.pinned_at must be a non-empty string`);
      }
      if (!(d.wayback_ts === null || typeof d.wayback_ts === 'string')) {
        problems.push(`${who}.wayback_ts must be a string or null`);
      }
    });
  }

  // --- excluded ---------------------------------------------------------------------------
  const seenExcluded = new Set();
  if (Array.isArray(m.excluded)) {
    m.excluded.forEach((e, i) => {
      if (!isPlainObject(e)) {
        problems.push(`excluded[${i}] is not an object`);
        return;
      }
      const who = e.url || `excluded[${i}]`;
      if (httpsHost(e.url) === null) {
        problems.push(`excluded[${i}].url must be an https URL: ${String(e.url)}`);
      } else if (seenExcluded.has(e.url)) {
        problems.push(`duplicate excluded url: ${e.url}`);
      } else {
        seenExcluded.add(e.url);
      }
      if (!MANIFEST_CONTRACT.excluded_reasons.includes(e.reason)) {
        problems.push(`${who}.reason not in contract: ${JSON.stringify(e.reason)}`);
      }
    });
  }

  return problems;
}

module.exports = { MANIFEST_CONTRACT, parseDocTitle, validateManifest, docIdFor };
