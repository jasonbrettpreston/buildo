/**
 * SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 19 load_wsib)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, Rule 4
 *
 * WSIB Businesses Classification Details CSV → `wsib_registry` — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS / IS NOT. Under operator ruling A-1(b) the library owns the whole
 * acquire → validate → write pipeline (`scripts/lib/step/{acquire,write,staleness}.js`).
 * What is left here is what a compute is FOR: the pure CSV→column mapping, the two
 * pure helpers the runner calls by name, and one observer per declared check. This file
 * is NOT the step shell (that is `scripts/load-wsib.js`) and it is NOT the descriptor —
 * it is the seam the runner drives.
 *
 * ⚠️ WS-D1 CARRIED. csv-parse collapses the duplicate `Description` headers to the LAST
 * one, so the single `Description` cell holds the SUBCLASS text, and `naics_description`
 * takes it while `subclass_description` stays null. shapeRecord's second Description arm is dead; it is
 * kept verbatim (and commented) so the deviation is visible, never silently "fixed".
 *
 * ⚠️ THE HEADER CHECK LIVES HERE — A DECLARED DEVIATION. The legacy loader validated the
 * CSV header on the FIRST row (`:274-284`, throwing `Schema drift: missing column …`).
 * The library exposes no CSV header on its acquired block, so this module owns that
 * behaviour inside `shapeRecord` (the same throw, byte-for-byte) until the orchestrator
 * seats it as a declared check. It is a deviation from "the library owns validation",
 * declared here rather than hidden.
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE. `scripts/lib/step/verdict.js` derives it from the
 * rows. A compute that decided its own verdict could disagree with its own table.
 */
'use strict';

// ---- vocabulary (Rule 4 — strings only, legacy verbatim; NO numeric module constant) ----

/** Legal-entity suffix stripping (:28-32), same logic as extract-builders.js. */
const SUFFIXES = [
  'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
  'INC\\.?', 'CORP\\.?', 'LTD\\.?', 'CO\\.?', 'LLC\\.?', 'L\\.?P\\.?',
];
const SUFFIX_PATTERN = new RegExp(`\\s*\\b(${SUFFIXES.join('|')})\\s*$`, 'i');

/** GTA municipalities for is_gta classification (:45-52). */
const GTA_CITIES = [
  'toronto', 'scarborough', 'etobicoke', 'north york', 'east york',
  'mississauga', 'brampton', 'caledon',
  'markham', 'vaughan', 'richmond hill', 'king city', 'aurora',
  'newmarket', 'stouffville', 'georgina',
  'oakville', 'burlington', 'milton', 'halton hills',
  'ajax', 'pickering', 'oshawa', 'whitby', 'clarington',
];

/** The required header columns (:276) — the schema-drift fence. */
const REQUIRED_COLUMNS = ['Legal name', 'Predominant class', 'Mailing Address'];

/** The Class G (Construction) prefix the legacy filter keys on (legacy `startsWith('G')`). */
const G_PREFIX = 'G';

// ---- pure seams (Rule 2 — the runner calls these by name; compute is just compute) ----

/**
 * Coerce a source LEGAL NAME → the normalized JOIN key, else null (a loss, counted, never
 * fabricated). Byte-identical to the legacy `normalizeName` (:35-41): upper-case, collapse
 * spaces, strip ONE OR TWO legal suffixes, strip trailing punctuation. The library's
 * acquisition seam calls this by name for every parsed CSV row. It throws ONLY on an absent
 * `Legal name` column (`undefined` — schema drift, legacy :274-284); any present cell never
 * throws — a non-string cell is simply a null key (counted in `bad_key_count`).
 */
function coerceKey(raw) {
  // Panel F3 (restores legacy :274-284): `undefined` means the `Legal name` COLUMN is absent
  // (csv-parse omits a missing header's key), which is schema drift — the run fails before any
  // write, exactly as the legacy first-row header check did. A null/blank CELL stays a bad key.
  if (raw === undefined) throw new Error('Schema drift: missing column "Legal name"');
  if (typeof raw !== 'string') return null;
  if (!raw || !raw.trim()) return null;
  let n = raw.toUpperCase().trim();
  n = n.replace(/\s+/g, ' ');
  n = n.replace(SUFFIX_PATTERN, '').trim();
  n = n.replace(SUFFIX_PATTERN, '').trim(); // Run twice for double suffixes
  n = n.replace(/[.,;]+$/, '').trim();
  return n || null;
}

/** Trim-or-empty, the legacy `(row.X || '').trim()` fallback, preserved verbatim. */
function text(record, name) {
  const v = record[name];
  return typeof v === 'string' ? v.trim() : '';
}

/** The GTA substring classifier, byte-identical to the legacy `isGTA` (:54-58). */
function isGTA(address) {
  if (!address) return false;
  const lower = address.toLowerCase();
  return GTA_CITIES.some((city) => lower.includes(city));
}

/** The Class G prefix test the filter and the dedupe share (legacy `startsWith('G')`). */
function isG(s) {
  return typeof s === 'string' && s.startsWith(G_PREFIX);
}

/**
 * shapeRecord(record, seam) → the column values `outputs.writes[0]` binds, the string
 * skip-reason `'non_g'` / `'no_name'` for a row the step refuses to load, or a THROW for
 * a record that is missing a required header column (the carried schema-drift fence,
 * `:274-284`).
 *
 * Byte-identical to the legacy mapping `:286-333`: the G filter FIRST (predominant OR
 * subclass G), then the legal-name key, then `''`→null for the text columns. The third
 * argument is the runner seam — `seam.run_at` is the DB clock the write stamps as
 * `last_seen_at` (legacy RUN_AT, `:136`); no wall clock is read here.
 *
 * @param {Record<string, string>} record one parsed CSV row (publisher's verbatim shape)
 * @param {{run_at?: string|Date}} [seam] the injected runner seam (clock only)
 * @returns {Record<string, unknown>|string}
 */
function shapeRecord(record, seam) {
  const r = record || {};

  // The declared deviation: the legacy header check (:274-284), byte-for-byte. The
  // library exposes no CSV header, so this module is the one home for it (see header).
  for (const col of REQUIRED_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(r, col)) {
      throw new Error(`Schema drift: missing column "${col}". Found: ${Object.keys(r).join(', ')}`);
    }
  }

  const predominantClass = text(r, 'Predominant class');
  const subclass = text(r, 'Class/subclass');

  // The G filter (:289-292): keep predominant-G OR subclass-G, else the skip reason.
  if (!isG(predominantClass) && !isG(subclass)) {
    return 'non_g';
  }

  const legalName = text(r, 'Legal name');
  const legalNorm = coerceKey(legalName);
  if (!legalNorm) {
    // Unreachable at runtime: the library drops bad keys (coerceKey → null) BEFORE a
    // record reaches shapeRecord, counting them in bad_key_count. Kept verbatim (:295-298).
    return 'no_name';
  }

  const tradeName = text(r, 'Trade name') || null;
  const address = text(r, 'Mailing Address') || null;

  // WS-D1 (:63-66): csv-parse collapses the duplicate "Description" headers to the LAST
  // one, so `Description` and `Description_1` never coexist — descKeys[0] is the only
  // arm that ever fires and the second arm is dead. Carried verbatim, deliberately.
  const keys = Object.keys(r);
  const descKeys = keys.filter((k) => k.startsWith('Description'));
  const naicsDesc = descKeys.length > 0 ? (r[descKeys[0]] || '').trim() : '';
  const subclassDesc = descKeys.length > 1 ? (r[descKeys[1]] || '').trim() : '';

  return {
    legal_name: legalName,
    trade_name: tradeName,
    legal_name_normalized: legalNorm,
    trade_name_normalized: coerceKey(tradeName),
    mailing_address: address,
    predominant_class: predominantClass, // raw, may be '' (:73)
    naics_code: text(r, 'NAICS code') || null,
    naics_description: naicsDesc || null,
    subclass: subclass || null,
    subclass_description: subclassDesc || null,
    business_size: text(r, 'Business size') || null,
    is_gta: isGTA(address),
    last_seen_at: seam && seam.run_at ? seam.run_at : null, // the runner's DB clock (RUN_AT :136)
  };
}

/**
 * Dedupe shaped rows by `legal_name_normalized|mailing_address` (:308), keeping the
 * G-predominant row: the FIRST row takes the slot, and a later row replaces it ONLY when
 * the incumbent is not G-predominant and the newcomer is (:311-317). The legacy
 * `seenKeys`/flush machinery is NOT carried — the library's write performs the upsert, so
 * only the per-key G-preference survives.
 */
function dedupeBySourceId(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.legal_name_normalized}|${row.mailing_address || ''}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, row);
      continue;
    }
    if (!isG(existing.predominant_class) && isG(row.predominant_class)) {
      byKey.set(key, row);
    }
  }
  const kept = [...byKey.values()];
  return { kept, duplicateCount: rows.length - kept.length };
}

/** §3.5-style status → counter deltas; the runner's geometry-validator seam is inert for a class-A upsert. */
function validatorCounterDelta() {
  return { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true };
}

/**
 * Class A (`guarded_upsert`, `retract: "none"`): there is no `delete_sql`, so the
 * departure delete must always be skipped. The runner also guards this (fold 0a); this
 * is the step's own truthful answer.
 */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Checks — one function per declared check, in DESCRIPTOR ORDER, name === id
// ===========================================================================

/**
 * The gate decision that ended the run (descriptor checks[0], `when: "pre"`, INFO —
 * the LPA-D4 successor of the legacy chain-skip, legacy :89-125). A gated skip must
 * say WHY: the absent-file terminal `skipped_no_source_file` lands here and this row
 * carries the reason (`no_source_file`) in its detail; the detail is null on a load.
 * PURELY DESCRIPTIVE: `violations` is 0 always, so an INFO row can never gate.
 */
function wsib_load_skipped(ctx) {
  const gate = ctx.gate || {};
  ctx.report('wsib_load_skipped', { violations: 0, detail: gate.skipped ? gate.reason : null });
}

/**
 * The file this run read (descriptor checks[1], `when: "post"`, INFO) — the successor of the
 * legacy INFO audit rows `source_file` (legacy :384) and `current_file` (chain skip, :102).
 * `acquired.source_path` is the repo-relative match resolveLocalSource picked (newest by name,
 * scripts/lib/step/acquire.js); the library persists no acquired field into records_meta, so
 * this row is the only ledger record of WHICH annual file loaded. PURELY DESCRIPTIVE:
 * `violations` is 0 always, so an INFO row can never gate.
 */
function wsib_source_file(ctx) {
  const p = (ctx.acquired || {}).source_path;
  ctx.report('wsib_source_file', { violations: 0, detail: typeof p === 'string' ? p : null });
}

/**
 * The unique-Class-G floor (descriptor checks[2], bound `value_min`, WARN, legacy :387).
 * `feature_count` is the post-dedupe unique key count the library measured (= the legacy
 * `seenKeys.size`); the floor arrives through `limit_from_config`
 * (`load_wsib_unique_class_g_warn_min`) — never a literal here (Rule 3). A run where the
 * library measured no count reports `null` (not measured) rather than a fabricated 0,
 * which would otherwise FAIL a real load.
 *
 * Q1 doctrine (verdict.js :146-152, :177): the `value_min` arm compares `value` to the
 * config-substituted floor, and compute never repeats the comparison — a `violations`
 * 0/1 flag would be read by nothing while the row displayed the count it was derived
 * from. The measured branch reports the raw count as BOTH `value` (comparand) and
 * `detail` (displayed number), and reads no threshold at all.
 */
function wsib_unique_class_g(ctx) {
  const n = numberOrNull((ctx.acquired || {}).feature_count);
  if (n == null) {
    return ctx.report('wsib_unique_class_g', { detail: null, value: null });
  }
  ctx.report('wsib_unique_class_g', { detail: n, value: n });
}

/**
 * The no-name skip rate (descriptor checks[3], bound `pct`, WARN, legacy :378-392). The
 * legacy ratio was `skipped_no_name / (unique_class_g + skipped_no_name) * 100`, so the
 * numerator is `bad_key_count` and the denominator is `feature_count + bad_key_count`.
 * WS-D7: the library counts a nameless NON-G row as `bad_key` BEFORE the G filter, so a
 * row the legacy scored `skipped_non_g` lands here instead.
 *
 * The pct arm reads `value` only — the PERCENTAGE (1.0 / 0.5), never a 0/1 flag
 * (.cursor/wf3_skip_rate_never_fails_active_task.md): a flag compared against the bound
 * itself (1) is right only by accident and describes a comparison never made. Exactly
 * 1.0 PASSes under the inclusive `pct <=` grammar, where the legacy WARNed — the
 * declared deviation WS-D9 (0 rows affected on the 2025 file).
 */
function wsib_no_name_skip_rate(ctx) {
  const a = ctx.acquired || {};
  const bad = numberOrNull(a.bad_key_count) || 0;
  const kept = numberOrNull(a.feature_count) || 0;
  const denom = kept + bad;
  const value = denom > 0 ? (bad * 100) / denom : 0;
  ctx.report('wsib_no_name_skip_rate', { value, detail: `${value.toFixed(1)}%` });
}

/**
 * WS-D6 (descriptor checks[4], invariant `viol == 0`, WARN). `mailing_address` is
 * NULLABLE inside `UNIQUE(legal_name_normalized, mailing_address)` (migrations/040),
 * so a NULL address never conflicts and would insert a duplicate on every reload — the
 * legacy bound a blank cell as NULL (① L10). The library counts null/`''` per declared
 * column on the carried rows; a run that measured none reports `null` (not measured).
 */
function wsib_null_address_count(ctx) {
  const n = numberOrNull(((ctx.acquired || {}).column_nulls || {}).mailing_address);
  if (n == null) {
    return ctx.report('wsib_null_address_count', { violations: 0, detail: null });
  }
  ctx.report('wsib_null_address_count', { violations: n, detail: n });
}

/**
 * Row conservation, the write side (descriptor checks[5], `when: "post"`, INFO — the
 * load_massing `records_unchanged` precedent). `written.unchanged` is the guarded upsert's
 * MEASURED no-op count (scripts/lib/step/conservation.js: rows_read = skips + inserted +
 * updated + unchanged). A run with no measured write reports `null` (not measured), never
 * a fabricated 0. PURELY DESCRIPTIVE: `violations` is 0 always, so an INFO row never gates.
 */
function records_unchanged(ctx) {
  const n = numberOrNull((ctx.written || {}).unchanged);
  ctx.report('records_unchanged', { violations: 0, detail: n });
}

/**
 * Row conservation, the dedupe side (descriptor checks[6], `when: "post"`, INFO — the
 * load_massing `duplicate_key_count` precedent). `acquired.duplicate_key_count` is the
 * count of shaped rows `dedupeBySourceId` superseded (a repeated
 * `legal_name_normalized|mailing_address` key; the G-predominant row wins). Not measured ⇒
 * `null`. PURELY DESCRIPTIVE: `violations` is 0 always, so an INFO row never gates.
 */
function duplicate_key_count(ctx) {
  const n = numberOrNull((ctx.acquired || {}).duplicate_key_count);
  ctx.report('duplicate_key_count', { violations: 0, detail: n });
}

// ---- helpers ----

/** A measured count, or null when the runner did not measure it (never a fabricated 0). */
function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * The `wsib_load` emit block — the seven keys `emits[]` declares, byte-identical to the
 * pre-conversion loader's flat records_meta names (legacy :401-407), in the same order.
 * Built only on a LOAD: a gated skip re-emits the PRIOR block through the library, so a
 * half-populated block here would overwrite it with zeroes. `skipped_non_g` is the
 * shaped-skip reason the library counted (WS-D7 attributing nameless rows to bad_key),
 * `skipped_no_name` is `bad_key_count`.
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  return {
    duration_ms: numberOrNull(ctx.elapsed_ms) || 0,
    total_csv_rows: numberOrNull(a.rows_read) || 0,
    unique_class_g: numberOrNull(a.feature_count) || 0,
    records_inserted: numberOrNull(w.inserted) || 0,
    records_updated: numberOrNull(w.updated) || 0,
    skipped_non_g: numberOrNull((a.shaped_skipped_by_reason || {}).non_g) || 0,
    skipped_no_name: numberOrNull(a.bad_key_count) || 0,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  wsib_load_skipped,
  wsib_source_file,
  wsib_unique_class_g,
  wsib_no_name_skip_rate,
  wsib_null_address_count,
  records_unchanged,
  duplicate_key_count,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else. The loop is the error boundary:
 * whatever a check throws becomes `{ error }` under that check's own id, so one failing
 * observer never suppresses the observers after it and never lands on another check's row.
 */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.written) return { records_meta: {} };
  return { records_meta: { wsib_load: buildLoadMeta(ctx) } };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The pure seams the runner calls by name (§5.5 (1) — compute is just compute).
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.buildLoadMeta = buildLoadMeta;
module.exports.isGTA = isGTA;
