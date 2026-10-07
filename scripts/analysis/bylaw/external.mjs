// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6.1 (external rows: one file, discriminated by `kind`;
//            the seven EXT-* rows; the separate `unverified` branch), §9 G-READ (external arm), §8 rule 8 (module
//            shape: check…() → {pass, violations, checked} + selfTest()), §6 `feeds` (Spec 69 M-52 structure × aspect);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-27, M-28
//
// G-READ external arm over scripts/seeds/bylaw/external.json. checkExternal(doc) is pure over its inputs; with
// `seeds` it also reads manifest.json and, lazily, the pages/<key>.txt of a row whose url is a pinned by-law page.
// Validated here: the seven EXT-* rows and `ref` entries (key set + closed reason). Counted, not validated:
// `model_heuristic` entries (their arm, §6.3, lands with S9's classifier).
//
// Reason codes (closed set for the external arm):
//   external_shape                     top level, unknown/missing key, wrong type, unknown kind or enum value,
//                                      unreadable manifest
//   external_id_invalid                id does not match its kind (EXT-gov-n / EXT-prov-n / EXT-risk-n, REF-n,
//                                      HEUR-n), or a duplicate id
//   external_row_set                   the EXT-* rows are not exactly the seven of §6.1
//   external_verified_incomplete       a verified_* row (or one of its additional_sources) lacks citation, an https
//                                      url, a 64-hex source_sha256; or the row lacks an excerpt or a real ISO verified_on
//   external_unverified_claims         an unverified row carries a citation, url, sha, excerpt, verified_on, an
//                                      additional source, or any explanation other than "not evaluated — citation pending"
//   external_url_not_primary           a verified_primary row's url (or an additional source's) is not on a government host
//   external_not_evaluated_undisclosed a verified row's explanation does not say what MaxBLD does not evaluate
//   external_evaluated_by_invalid      evaluated_by_us is not "no" or "yes:<spec number>"
//   external_precedence_invalid        precedence not in none · active, or `active` on a row that is not a verified_primary
//                                      provincial row carrying provincial_units[] (Spec 69 M-55), or units on a `none` row
//   external_provincial_unit_invalid   a provincial unit outside the Spec 68 §6.1 shape (target, bound, value, scope,
//                                      limits_bylaw consistent with bound, direction_basis)
//   external_feeds_invalid             risk_feeds empty, duplicated, or outside the M-52 vocabulary
//   external_pinned_page_mismatch      a row on a pinned page whose source_sha256 is not the manifest raw_sha256,
//                                      or an excerpt fragment not found in pages/<key>.txt
//   external_not_canonical             (checkExternalFile) bytes differ from the canonical serialization

import fs from 'node:fs';
import path from 'node:path';

export const EXTERNAL_FILE = 'external.json';
export const SCHEMA_VERSION = 'external-v1';
export const SEVEN_ROWS = Object.freeze(['EXT-gov-1', 'EXT-prov-1', 'EXT-risk-1', 'EXT-risk-2', 'EXT-risk-3', 'EXT-risk-4', 'EXT-risk-5']);
export const UNVERIFIED_TEXT = 'not evaluated — citation pending';
export const NOT_EVALUATED_PHRASE = 'does not evaluate';
/** Joins verbatim excerpt fragments; each fragment must appear in the source as written. */
export const EXCERPT_SEPARATOR = ' … ';
// Closed vocabularies. FEED_* mirror Spec 68 §6 / M-52 until S5's vocab.json carries the two maps.
const ROW_KINDS = Object.freeze({ governance_former_bylaw: 'EXT-gov-', provincial_precedence: 'EXT-prov-', risk_reference: 'EXT-risk-' });
const OTHER_KINDS = Object.freeze({ ref: 'REF-', model_heuristic: 'HEUR-' });
const STATUSES = Object.freeze(['verified_primary', 'verified_secondary', 'unverified']);
const REF_REASONS = Object.freeze(['phase2_exception']);
export const FEED_STRUCTURES = Object.freeze(['principal', 'suite', 'ancillary', 'any']);
export const FEED_ASPECTS = Object.freeze(['envelope', 'landscaping', 'parking_access', 'use_permission', 'lot', 'measurement']);
// Government hosts (equal to, or a subdomain of, one of these) count as primary.
export const PRIMARY_HOSTS = Object.freeze(['ontario.ca', 'toronto.ca', 'canada.ca', 'gc.ca']);

const ROW_KEYS = Object.freeze(['additional_sources', 'authority', 'citation', 'evaluated_by_us', 'excerpt', 'explanation', 'id', 'kind', 'precedence', 'provincial_units', 'risk_feeds', 'source_sha256', 'title', 'url', 'verification_status', 'verified_on']);
const SOURCE_KEYS = Object.freeze(['citation', 'source_sha256', 'url']);
const REF_KEYS = Object.freeze(['citation', 'id', 'kind', 'reason', 'url']);
const UNIT_KEYS = Object.freeze(['bound', 'bylaw_prevails_citation', 'citation', 'direction_basis', 'limits_bylaw', 'scope', 'target', 'unit', 'unit_id', 'value', 'verbatim']);
const SCOPE_KEYS = Object.freeze(['applies_to', 'land', 'other_building_contains_unit', 'principal_building_types', 'unit_configurations']);
// How a provincial unit restrains a by-law (Spec 69 M-55): min_permission = a by-law max may not be below `value`
// (bound max); max_requirement = a by-law min may not be above `value` (bound min). Never imposed where the by-law is silent.
const LIMITS = Object.freeze({ min_permission: 'max', max_requirement: 'min' });
const DIRECTION_BASIS = Object.freeze(['verbatim', 'inferred']);
const APPLIES_TO = Object.freeze(['parcel', 'building_pair']);
const LANDS = Object.freeze(['parcel_of_urban_residential_land']);
const UNIT_MEASURES = Object.freeze(['m', 'pct', 'ratio']);
const isCount = (n) => Number.isInteger(n) && n >= 0 && n <= 3;

/** Problems with one provincial unit (Spec 68 §6.1); empty when the unit is well formed. */
function unitProblems(u) {
  if (!isObj(u)) return ['not an object'];
  const out = keyDiff(u, UNIT_KEYS);
  for (const k of ['unit_id', 'citation', 'verbatim', 'target']) if (!isText(u[k])) out.push(`${k} must be text`);
  if (!['min', 'max'].includes(u.bound)) out.push('bound must be min · max');
  if (!UNIT_MEASURES.includes(u.unit)) out.push(`unit must be ${UNIT_MEASURES.join(' · ')}`);
  if (!(typeof u.value === 'number' && Number.isFinite(u.value) && u.value >= 0) && u.value !== 'unlimited') out.push('value must be a non-negative number or "unlimited"');
  if (!own(LIMITS, u.limits_bylaw)) out.push(`limits_bylaw must be ${Object.keys(LIMITS).join(' · ')}`);
  else if (LIMITS[u.limits_bylaw] !== u.bound) out.push(`limits_bylaw ${u.limits_bylaw} needs bound ${LIMITS[u.limits_bylaw]}`);
  if (!DIRECTION_BASIS.includes(u.direction_basis)) out.push(`direction_basis must be ${DIRECTION_BASIS.join(' · ')}`);
  if (u.bylaw_prevails_citation !== null && !isText(u.bylaw_prevails_citation)) out.push('bylaw_prevails_citation must be text or null');
  const sc = u.scope;
  if (!isObj(sc)) return [...out, 'scope must be an object'];
  out.push(...keyDiff(sc, SCOPE_KEYS).map((x) => `scope ${x}`));
  if (!LANDS.includes(sc.land)) out.push('scope.land unknown');
  if (!APPLIES_TO.includes(sc.applies_to)) out.push('scope.applies_to must be parcel · building_pair');
  if (!Array.isArray(sc.principal_building_types) || sc.principal_building_types.length === 0 || !sc.principal_building_types.every(isText)) out.push('scope.principal_building_types must be non-empty text[]');
  const cfg = Array.isArray(sc.unit_configurations) ? sc.unit_configurations : null;
  if (!cfg || cfg.length === 0 || cfg.some((c) => !isObj(c) || keyDiff(c, ['ancillary_units', 'house_units']).length
    || ![c.ancillary_units, c.house_units].every((a) => Array.isArray(a) && a.length > 0 && a.every(isCount)))) out.push('scope.unit_configurations must be non-empty [{ancillary_units[], house_units[]}] of counts 0..3');
  if (sc.applies_to === 'building_pair' ? sc.other_building_contains_unit !== true : sc.other_building_contains_unit !== null) out.push('scope.other_building_contains_unit is true for building_pair, null for parcel');
  return out;
}

const zeroCounts = () => ({ governance_former_bylaw: 0, model_heuristic: 0, provincial_precedence: 0, ref: 0, risk_reference: 0 });

const own = (obj, k) => typeof k === 'string' && Object.hasOwn(obj, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
function isDate(v) {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return false;
  // Pure calendar arithmetic (the determinism lock bans Date in this directory; clock.mjs is the one exemption).
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1];
}
function parseUrl(v) {
  if (typeof v !== 'string') return null;
  try { return new URL(v); } catch { return null; }
}
const isHttps = (v) => parseUrl(v)?.protocol === 'https:';
/** The identity used to match a row url to a pinned page: lower-case host + path, no query/fragment/scheme. */
const pageIdentity = (v) => { const u = parseUrl(v); return u ? `${u.hostname.toLowerCase()}${u.pathname}` : null; };

export function isPrimaryUrl(url) {
  const u = parseUrl(url);
  if (!u || u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  return PRIMARY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Natural order on ids (EXT-risk-2 before EXT-risk-10); ties fall back to plain string order. */
export function compareIds(a, b) {
  const pa = /^(.*?)(\d{1,9})$/.exec(a);
  const pb = /^(.*?)(\d{1,9})$/.exec(b);
  const n = pa && pb && pa[1] === pb[1] ? Number(pa[2]) - Number(pb[2]) : 0;
  return n !== 0 ? n : a < b ? -1 : a > b ? 1 : 0;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** Canonical bytes: entries in id order, keys sorted, 2-space JSON, LF, one trailing newline. */
export function canonicalExternal(doc) {
  const entries = Array.isArray(doc?.entries) ? [...doc.entries].sort((x, y) => compareIds(String(x?.id), String(y?.id))) : doc?.entries;
  return `${JSON.stringify(sortKeys({ ...doc, entries }), null, 2)}\n`;
}

function keyDiff(obj, keys) {
  const have = Object.keys(obj).sort();
  return [...keys.filter((k) => !have.includes(k)).map((k) => `missing ${k}`), ...have.filter((k) => !keys.includes(k)).map((k) => `unknown key ${k}`)];
}

/** Pinned-page index (page identity → {key, raw_sha256, txtPath}); text is read lazily by the caller. */
function pinnedPages(seeds, v) {
  const out = new Map();
  if (!seeds) return out;
  const mPath = path.join(seeds, 'manifest.json');
  if (!fs.existsSync(mPath)) return out;
  let pages;
  try { pages = JSON.parse(fs.readFileSync(mPath, 'utf8'))?.pages; } catch (err) {
    v.push(`external_shape: manifest.json unreadable (${err instanceof Error ? err.message : String(err)})`);
    return out;
  }
  if (!Array.isArray(pages)) { v.push('external_shape: manifest.json has no pages[]'); return out; }
  for (const p of pages) {
    if (!isObj(p) || typeof p.key !== 'string' || !/^[a-z0-9_]+$/.test(p.key)) continue;
    const id = pageIdentity(p.url);
    if (id) out.set(id, { key: p.key, raw_sha256: p.raw_sha256, txtPath: path.join(seeds, 'pages', `${p.key}.txt`) });
  }
  return out;
}

function checkRow(r, v, pages) {
  const id = r.id;
  const diff = keyDiff(r, ROW_KEYS);
  if (diff.length) v.push(`external_shape: ${id} ${diff.join(', ')}`);
  for (const k of ['title', 'authority', 'explanation']) if (!isText(r[k])) v.push(`external_shape: ${id} ${k} must be non-empty text`);
  for (const k of ['citation', 'url', 'source_sha256', 'excerpt', 'verified_on']) if (r[k] != null && typeof r[k] !== 'string') v.push(`external_shape: ${id} ${k} must be text or null`);
  const statusOk = STATUSES.includes(r.verification_status);
  if (!statusOk) v.push(`external_shape: ${id} verification_status ${JSON.stringify(r.verification_status)} not in ${STATUSES.join(' · ')}`);
  const sources = Array.isArray(r.additional_sources) ? r.additional_sources : [];
  if (!Array.isArray(r.additional_sources) || sources.some((s) => !isObj(s) || keyDiff(s, SOURCE_KEYS).length)) {
    v.push(`external_shape: ${id} additional_sources must be [{citation, source_sha256, url}]`);
  }
  const feeds = Array.isArray(r.risk_feeds) ? r.risk_feeds : [];
  if (!Array.isArray(r.risk_feeds) || feeds.some((f) => !isObj(f) || keyDiff(f, ['aspect', 'structure']).length)) {
    v.push(`external_shape: ${id} risk_feeds must be [{aspect, structure}]`);
  }

  if (typeof r.evaluated_by_us !== 'string' || !/^(no|yes:[1-9]\d*)$/.test(r.evaluated_by_us)) v.push(`external_evaluated_by_invalid: ${id} ${JSON.stringify(r.evaluated_by_us)}`);
  const units = Array.isArray(r.provincial_units) ? r.provincial_units : [];
  if (!Array.isArray(r.provincial_units)) v.push(`external_shape: ${id} provincial_units must be an array`);
  if (r.precedence === 'active') {
    if (r.kind !== 'provincial_precedence' || r.verification_status !== 'verified_primary' || units.length === 0) {
      v.push(`external_precedence_invalid: ${id} active needs a verified_primary provincial_precedence row with provincial_units[] (Spec 69 M-55)`);
    }
  } else if (r.precedence !== 'none') v.push(`external_precedence_invalid: ${id} precedence ${JSON.stringify(r.precedence)} not in none · active`);
  else if (units.length) v.push(`external_precedence_invalid: ${id} carries provincial_units but precedence is none`);
  const unitIds = new Set();
  units.forEach((u, i) => {
    const probs = unitProblems(u);
    if (isObj(u) && unitIds.has(u.unit_id)) probs.push(`duplicate unit_id ${u.unit_id}`);
    if (isObj(u)) unitIds.add(u.unit_id);
    if (probs.length) v.push(`external_provincial_unit_invalid: ${id} provincial_units[${i}] ${probs.join('; ')}`);
  });

  const seen = new Set();
  let feedsBad = feeds.length === 0;
  for (const f of feeds) {
    const k = `${f?.structure}/${f?.aspect}`;
    if (!FEED_STRUCTURES.includes(f?.structure) || !FEED_ASPECTS.includes(f?.aspect) || seen.has(k)) feedsBad = true;
    seen.add(k);
  }
  if (feedsBad) v.push(`external_feeds_invalid: ${id} ${JSON.stringify(r.risk_feeds)}`);
  if (!statusOk) return;

  if (r.verification_status === 'unverified') {
    const claims = ['citation', 'url', 'source_sha256', 'excerpt', 'verified_on'].filter((k) => r[k] != null);
    if (r.explanation !== UNVERIFIED_TEXT) claims.push('explanation');
    if (sources.length) claims.push('additional_sources');
    if (claims.length) v.push(`external_unverified_claims: ${id} carries ${claims.join(', ')}`);
    return;
  }

  const missing = [];
  if (!isText(r.citation)) missing.push('citation');
  if (!isText(r.url) || !isHttps(r.url)) missing.push('url (https)');
  if (!isSha(r.source_sha256)) missing.push('source_sha256');
  if (!isText(r.excerpt) || r.excerpt.split(EXCERPT_SEPARATOR).some((f) => !isText(f))) missing.push('excerpt');
  if (!isDate(r.verified_on)) missing.push('verified_on');
  sources.forEach((s, i) => {
    if (!isText(s?.citation) || !isHttps(s?.url) || !isSha(s?.source_sha256)) missing.push(`additional_sources[${i}]`);
  });
  if (missing.length) v.push(`external_verified_incomplete: ${id} lacks ${missing.join(', ')}`);

  if (r.verification_status === 'verified_primary') {
    for (const u of [r.url, ...sources.map((s) => s?.url)]) if (isHttps(u) && !isPrimaryUrl(u)) v.push(`external_url_not_primary: ${id} ${u}`);
  }
  if (isText(r.explanation) && !r.explanation.includes(NOT_EVALUATED_PHRASE)) v.push(`external_not_evaluated_undisclosed: ${id} explanation lacks "${NOT_EVALUATED_PHRASE}"`);

  const page = pages.get(pageIdentity(r.url));
  if (page) {
    if (r.source_sha256 !== page.raw_sha256) v.push(`external_pinned_page_mismatch: ${id} source_sha256 is not the manifest raw_sha256 of ${page.key}`);
    const text = fs.existsSync(page.txtPath) ? fs.readFileSync(page.txtPath, 'utf8') : null;
    const frags = isText(r.excerpt) ? r.excerpt.split(EXCERPT_SEPARATOR) : [];
    if (text === null || frags.length === 0 || frags.some((f) => !isText(f) || !text.includes(f))) v.push(`external_pinned_page_mismatch: ${id} excerpt not found in pages/${page.key}.txt`);
  }
}

/**
 * G-READ external arm. `doc` is the parsed external.json; `seeds` (optional) is the seeds dir holding
 * manifest.json + pages/ — without it the pinned-page re-check does not run (`pinned_checked` says how many ran).
 * Returns {pass, violations (sorted), checked, counts per kind, pinned_checked}. Never mutates `doc`; never throws on data.
 */
export function checkExternal(doc, opts = {}) {
  const seeds = isObj(opts) && typeof opts.seeds === 'string' ? opts.seeds : undefined;
  const v = [];
  const counts = zeroCounts();
  if (!isObj(doc) || !Array.isArray(doc.entries) || doc.schema_version !== SCHEMA_VERSION || keyDiff(doc, ['entries', 'schema_version']).length) {
    const detail = isObj(doc) ? keyDiff(doc, ['entries', 'schema_version']).join(', ') : typeof doc;
    return { pass: false, violations: [`external_shape: top level must be {entries: [], schema_version: "${SCHEMA_VERSION}"} (${detail || 'wrong value'})`], checked: 0, counts, pinned_checked: 0 };
  }
  const pages = pinnedPages(seeds, v);
  const ids = new Set();
  const rowIds = [];
  let pinnedChecked = 0;
  doc.entries.forEach((e, i) => {
    if (!isObj(e) || typeof e.id !== 'string') { v.push(`external_shape: entries[${i}] has no string id`); return; }
    const prefix = own(ROW_KINDS, e.kind) ? ROW_KINDS[e.kind] : own(OTHER_KINDS, e.kind) ? OTHER_KINDS[e.kind] : null;
    if (prefix === null) { v.push(`external_shape: ${e.id} unknown kind ${JSON.stringify(e.kind)}`); return; }
    counts[e.kind] += 1;
    if (!new RegExp(`^${prefix}[1-9]\\d{0,8}$`).test(e.id)) v.push(`external_id_invalid: ${e.id} does not match ${prefix}<n> for kind ${e.kind}`);
    if (ids.has(e.id)) v.push(`external_id_invalid: duplicate id ${e.id} (entries[${i}])`);
    ids.add(e.id);
    if (own(ROW_KINDS, e.kind)) {
      rowIds.push(e.id);
      if (pages.has(pageIdentity(e.url))) pinnedChecked += 1;
      checkRow(e, v, pages);
    } else if (e.kind === 'ref') {
      const diff = keyDiff(e, REF_KEYS);
      if (diff.length || !isText(e.citation) || !isHttps(e.url) || !REF_REASONS.includes(e.reason)) {
        v.push(`external_shape: ${e.id} ref must be {citation, id, kind, reason ∈ ${REF_REASONS.join(' · ')}, url (https)}${diff.length ? ` — ${diff.join(', ')}` : ''}`);
      }
    }
  });
  const unique = [...new Set(rowIds)];
  const missingRows = SEVEN_ROWS.filter((id) => !unique.includes(id));
  const extraRows = unique.filter((id) => !SEVEN_ROWS.includes(id));
  if (missingRows.length || extraRows.length) v.push(`external_row_set: missing [${missingRows.join(', ')}] extra [${extraRows.join(', ')}]`);
  const violations = [...v].sort();
  return { pass: violations.length === 0, violations, checked: doc.entries.length, counts, pinned_checked: pinnedChecked };
}

/** checkExternal over the file in `seeds`, plus the canonical-bytes check. `bytes` (string or Buffer) overrides the file. */
export function checkExternalFile({ seeds, bytes } = {}) {
  const empty = (msg) => ({ pass: false, violations: [msg], checked: 0, counts: zeroCounts(), pinned_checked: 0 });
  let text;
  if (bytes !== undefined) text = String(bytes);
  else {
    if (typeof seeds !== 'string') return empty('external_shape: no seeds directory given');
    const file = path.join(seeds, EXTERNAL_FILE);
    if (!fs.existsSync(file)) return empty(`external_shape: ${EXTERNAL_FILE} missing`);
    text = fs.readFileSync(file, 'utf8');
  }
  let doc;
  try { doc = JSON.parse(text); } catch (err) {
    return empty(`external_shape: ${EXTERNAL_FILE} is not JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const r = checkExternal(doc, { seeds });
  const violations = [...r.violations];
  if (canonicalExternal(doc) !== text) violations.push(`external_not_canonical: ${EXTERNAL_FILE} is not in canonical form (sorted keys, entries by id, LF, trailing newline)`);
  violations.sort();
  return { ...r, pass: violations.length === 0, violations };
}

// ---- self-test: one known-bad fixture per reason code + the good twin, all in memory (no seeds) ----

function fixtureUnit() {
  return {
    bound: 'max', bylaw_prevails_citation: 'Reg, s. 5(2)', citation: 'Reg, s. 5(1)', direction_basis: 'verbatim', limits_bylaw: 'min_permission', target: 'lot_coverage_pct',
    unit: 'pct', unit_id: 'Reg s.5(1)1', value: 45, verbatim: 'Up to 45 per cent.',
    scope: { applies_to: 'parcel', land: 'parcel_of_urban_residential_land', other_building_contains_unit: null, principal_building_types: ['detached_house'], unit_configurations: [{ ancillary_units: [0], house_units: [3] }] },
  };
}

function fixtureDoc() {
  const row = (id, kind, evaluated) => ({
    additional_sources: [], authority: 'Authority', citation: 'Act, s. 1', evaluated_by_us: evaluated,
    excerpt: 'No person shall build.', explanation: `A permit is needed. MaxBLD ${NOT_EVALUATED_PHRASE} it.`, id, kind,
    precedence: 'none', provincial_units: [], risk_feeds: [{ aspect: 'envelope', structure: 'any' }], source_sha256: 'a'.repeat(64),
    title: 'Title', url: 'https://www.ontario.ca/laws/docs/x_e.doc', verification_status: 'verified_primary', verified_on: '2026-10-07',
  });
  return {
    entries: [
      row('EXT-gov-1', 'governance_former_bylaw', 'no'), row('EXT-prov-1', 'provincial_precedence', 'no'),
      ...[1, 2, 3].map((n) => row(`EXT-risk-${n}`, 'risk_reference', 'no')),
      row('EXT-risk-4', 'risk_reference', 'yes:61'), row('EXT-risk-5', 'risk_reference', 'yes:59'),
    ],
    schema_version: SCHEMA_VERSION,
  };
}

export function selfTestCases() {
  const mut = (fn) => () => { const d = fixtureDoc(); fn(d, (id) => d.entries.find((e) => e.id === id)); return d; };
  const unverify = (r) => Object.assign(r, { citation: null, url: null, source_sha256: null, excerpt: null, verified_on: null, explanation: UNVERIFIED_TEXT, verification_status: 'unverified' });
  return [
    { name: 'good twin', doc: mut(() => {}), expect: [] },
    { name: 'good twin (unverified row)', doc: mut((d, r) => unverify(r('EXT-risk-1'))), expect: [] },
    { name: 'external_shape', doc: mut((d, r) => { r('EXT-risk-1').kind = 'constructor'; }), expect: ['external_row_set', 'external_shape'] },
    { name: 'external_id_invalid', doc: mut((d) => { d.entries.push({ ...d.entries[6] }); }), expect: ['external_id_invalid'] },
    { name: 'external_row_set', doc: mut((d) => { d.entries.pop(); }), expect: ['external_row_set'] },
    { name: 'external_verified_incomplete', doc: mut((d, r) => { r('EXT-risk-2').verified_on = '2026-02-30'; }), expect: ['external_verified_incomplete'] },
    { name: 'external_unverified_claims', doc: mut((d, r) => { unverify(r('EXT-risk-1')); r('EXT-risk-1').citation = 'Ch.813'; }), expect: ['external_unverified_claims'] },
    { name: 'external_url_not_primary', doc: mut((d, r) => { r('EXT-risk-2').url = 'https://www.buildingcode.online/1547.html'; }), expect: ['external_url_not_primary'] },
    { name: 'external_not_evaluated_undisclosed', doc: mut((d, r) => { r('EXT-risk-1').explanation = 'A permit is needed.'; }), expect: ['external_not_evaluated_undisclosed'] },
    { name: 'external_evaluated_by_invalid', doc: mut((d, r) => { r('EXT-risk-4').evaluated_by_us = 'yes:0'; }), expect: ['external_evaluated_by_invalid'] },
    { name: 'external_precedence_invalid', doc: mut((d, r) => { r('EXT-risk-1').precedence = 'active'; }), expect: ['external_precedence_invalid'] },
    { name: 'good twin (active provincial row)', doc: mut((d, r) => { Object.assign(r('EXT-prov-1'), { precedence: 'active', provincial_units: [fixtureUnit()] }); }), expect: [] },
    { name: 'external_provincial_unit_invalid', doc: mut((d, r) => { Object.assign(r('EXT-prov-1'), { precedence: 'active', provincial_units: [{ ...fixtureUnit(), bound: 'exact' }] }); }), expect: ['external_provincial_unit_invalid'] },
    { name: 'external_feeds_invalid', doc: mut((d, r) => { r('EXT-risk-1').risk_feeds = []; }), expect: ['external_feeds_invalid'] },
  ];
}

/** Runs every self-test case; throws on the first case whose reason codes differ. Returns the case count. */
export function selfTest() {
  const cases = selfTestCases();
  for (const c of cases) {
    const got = [...new Set(checkExternal(c.doc()).violations.map((x) => x.split(':')[0]))].sort();
    if (JSON.stringify(got) !== JSON.stringify(c.expect)) throw new Error(`external self-test FAILED (${c.name}): got ${JSON.stringify(got)}`);
  }
  const bytes = canonicalExternal(fixtureDoc());
  if (!checkExternalFile({ bytes }).pass) throw new Error('external self-test FAILED (canonical good twin)');
  if (!checkExternalFile({ bytes: bytes.replace(/\n/g, '\r\n') }).violations.some((x) => x.startsWith('external_not_canonical'))) {
    throw new Error('external self-test FAILED (external_not_canonical)');
  }
  return cases.length + 2;
}
