/**
 * SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md §2, §3
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 17 `neighbourhoods`, lock 57)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rule 2, Rule 3, Rule 10
 *
 * Toronto Neighbourhood Boundaries (GeoJSON) + the 2021 Neighbourhood Census Profile
 * (XLSX lookup) → `neighbourhoods`: DOMAIN LOGIC ONLY — the pure feature → column
 * mapping, the pure census pivot, and the pure helpers the runner calls by name.
 *
 * ONE guarded upsert carries BOTH sources: the PRIMARY GeoJSON supplies
 * `neighbourhood_id` / `name` / `geometry` (`geom` via the `wkb_geometry` binding,
 * `geometry_repair` "none") and the XLSX LOOKUP supplies the 14 census columns, which
 * declare `on_empty:"preserve_null"` because legacy kept the stored value when the
 * source omitted a cell (absent row or a ÷0 guard wrote nothing; the bulk-5 arm was
 * literally `COALESCE(v.col, n.col)`, N-D2/N-D14). THE VERDICT IS NOT COMPUTED HERE —
 * `step/verdict.js` derives it from the rows (Rule 10): this file returns no verdict
 * key and keeps no parallel fail/warn booleans (N-D11).
 *
 * ⚠️ NO MODULE NUMERIC CONSTANT (Spec 124 §5 R-BA gate E): `1000` and `10` — the legacy
 * `Math.round(x * 1000) / 10` percentage form — stay INLINE. The string vocabularies
 * below are publisher-derived literals, not tunables.
 */
'use strict';

const { safeParsePositiveInt, safeParseIntOrNull } = require('../safe-math');

// ── descriptor-derived constants (ONE home each) ───────────────────────────
// The descriptor ships beside this file, so these are read at require() time and are
// the SAME bytes the write plan is built from: the primary external's `key_property`,
// the external that carries `role:"lookup"`, and `outputs.writes[0]`'s census columns
// (those filtered `on_empty === 'preserve_null'`, in descriptor order).
const DESCRIPTOR = require('../../load-neighbourhoods.descriptor.json');

/** The primary external — the only url'd external WITHOUT a `role` (absent = primary, RE-FREEZE #27). */
const PRIMARY_EXTERNAL = DESCRIPTOR.inputs.reads.externals.find((e) => !e.role && e.key_property != null);

/** The key column the primary source carries the neighbourhood id on (N-D6: `AREA_SHORT_CODE` only). */
const KEY_PROPERTY = PRIMARY_EXTERNAL.key_property;

/** The census lookup external (RE-FREEZE #27): xlsx-only, never gated, absorbed here as attribute columns. */
const LOOKUP_ID = (DESCRIPTOR.inputs.reads.externals.find((e) => e.role === 'lookup') || {}).id;

/** The 14 census columns `outputs.writes[0]` binds with `on_empty:"preserve_null"`, in descriptor order. */
const CENSUS_COLUMNS = (DESCRIPTOR.outputs.writes[0].columns || [])
  .filter((c) => c.on_empty === 'preserve_null')
  .map((c) => c.name);

// ── publisher vocabulary (verbatim from the oracle) ─────────────────────────
// The characteristic row names the census profile publishes. Byte-identical to the
// pre-conversion loader: a rename here would silently zero a column.

const INCOME_CHARACTERISTICS = {
  'Average total income of household in 2020 ($)': 'avg_household_income',
  'Median total income of household in 2020 ($)': 'median_household_income',
  'Average total income in 2020 among recipients ($)': 'avg_individual_income',
};

const PCT_CHARACTERISTIC = 'Prevalence of low income based on the Low-income measure, after tax (LIM-AT) (%)';

// Period of construction rows to find dominant era
const CONSTRUCTION_PERIODS = [
  '1960 or before',
  '1961 to 1980',
  '1981 to 1990',
  '1991 to 2000',
  '2001 to 2005',
  '2006 to 2010',
  '2011 to 2015',
  '2016 to 2021',
];

/** The stored `period_of_construction` vocabulary (the oracle's `periodMap`). */
const PERIOD_MAP = {
  '1960 or before': 'pre-1960',
  '1961 to 1980': '1961-1980',
  '1981 to 1990': '1981-1990',
  '1991 to 2000': '1991-2000',
  '2001 to 2005': '2001-2005',
  '2006 to 2010': '2006-2010',
  '2011 to 2015': '2011-2015',
  '2016 to 2021': '2016-2021',
};

/** Parse a neighbourhood id from a column header `"Agincourt North (129)"`; null when the header is not `"Name (ID)"`. Verbatim (oracle `parseColumnHeader`). */
function parseColumnHeader(header) {
  const match = String(header).match(/^(.+)\s*\((\d+)\)$/);
  if (!match) return null;
  return { name: match[1].trim(), neighbourhood_id: safeParsePositiveInt(match[2], 'neighbourhood_id') };
}

/** Parse a Census cell: suppression tokens and blanks are `null`, commas/`$`/`%` are stripped, a number passes through. Verbatim (oracle `parseNumeric`). */
function parseNumeric(val) {
  if (val == null || val === '' || val === '...' || val === 'x' || val === 'F') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[$,%\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * The neighbourhood id from a primary feature's key property, or `null` when it is 0
 * (fixture cases d/e: `'0'`, `''`, `undefined` ⇒ `null` ⇒ the bad-key refusal). A
 * NON-NUMERIC key THROWS `/positive integer/` — the legacy halt (oracle L2), never a
 * silent skip. ⚠️ The 2nd argument (the `{geojson}` data object the seam passes) is
 * IGNORED: the id is a publisher attribute, not geometry-derived.
 */
function coerceKey(raw) {
  const parsed = safeParsePositiveInt(raw || '0', 'neighbourhood_id');
  return parsed === 0 ? null : parsed;
}

/**
 * One primary feature's column values, or the 0p skip REASON string. The name prefers
 * `AREA_NAME` with the `AREA_LONG_CODE` fallback (oracle L1); no name ⇒ the reason
 * string `'missing_name'` (the converted counterpart of the legacy
 * `Skipping feature with missing ID or name`). Every census column is PRESENT: the
 * lookup cell, or `null` when the nid is absent from the census map (N-D14 — the
 * `on_empty:"preserve_null"` axis turns that null into "keep the stored value").
 */
function shapeRecord(record, seam) {
  const props = record || {};
  const name = props.AREA_NAME || props.AREA_LONG_CODE || '';
  if (!name) return 'missing_name';
  const key = coerceKey(props[KEY_PROPERTY]);
  const census = ((seam && seam.lookups) || {})[LOOKUP_ID];
  const row = (census && key != null && census[key]) || {};
  const shaped = {
    geojson: seam.geojson,
    name,
    geometry: seam.geojson,
  };
  for (const col of CENSUS_COLUMNS) {
    shaped[col] = row[col] ?? null;
  }
  return shaped;
}

/**
 * The census pivot: `rows` → `{ map, stats }`. A port of the oracle `loadProfiles`
 * from `const headerKeys = Object.keys(rows[0]);` to its end, SEMANTICS VERBATIM —
 * the same char-column discovery (format 1 `"Name (ID)"`, format 2 header-name +
 * `row0` id), the same ID-row skip, the same accumulators, every `if` INDEPENDENT
 * (never else-if), `matchedRows++` per matched characteristic row, the `val !== null`
 * / `val > 0` / `total > 0` guards, `Math.round` for income, `Math.round(x * 1000) / 10`
 * for the percentage columns, `low_income_pct` NOT rounded, the dominant period
 * max-count first-wins then `PERIOD_MAP[d] || d`, the `’`→`'` normalisation, and the
 * 5 `startsWith('Total - …')` prefixes.
 *
 * ⚠️ The legacy `UPDATE … SET` statements become per-column ASSIGNMENTS into
 * `map[nid][col]`: a nid entry is created LAZILY, only when a non-null value is
 * assigned, so a cell the legacy never pushed (absent, ÷0, or suppressed) stays
 * ABSENT — exactly the "keep the stored value" semantics `preserve_null` reproduces.
 * The bulk-5 arm assigns only non-null pcts. No logging, no pool.
 */
function buildLookup(externalId, rows, _seam) {
  if (externalId !== LOOKUP_ID) {
    throw new Error(`[neighbourhoods] buildLookup was called for external "${externalId}", not the declared lookup "${LOOKUP_ID}"`);
  }

  const map = {};
  const stats = { matched_rows: 0, neighbourhood_columns: 0 };

  if (!rows || rows.length === 0) return { map, stats };

  /** Assign `value` into `map[nid][col]`, creating the nid entry lazily (legacy wrote nothing ⇒ entry absent). */
  const put = (nid, col, value) => {
    if (!map[nid]) map[nid] = {};
    map[nid][col] = value;
  };

  // Discover neighbourhood columns from headers
  const headerKeys = Object.keys(rows[0]);

  // Find the characteristic column (first column)
  const charColName = headerKeys.find((h) =>
    h === 'Characteristic' || h === 'characteristic' || h === 'Neighbourhood Name' || h === '_0'
  ) || headerKeys[0];

  // Build neighbourhood columns mapping — two formats:
  //   1. Headers like "Agincourt North (129)" -> parse name + ID
  //   2. Headers are just names, row 0 contains neighbourhood IDs
  const neighbourhoodColumns = {};
  const row0 = rows[0];
  const row0Char = String(row0[charColName] || '').trim();

  for (const col of headerKeys) {
    if (col === charColName) continue;

    // Try format 1: "Name (ID)"
    const parsed = parseColumnHeader(col);
    if (parsed) {
      neighbourhoodColumns[col] = parsed;
      continue;
    }

    // Try format 2: column name is neighbourhood name, row 0 has the ID
    if (row0Char === 'Neighbourhood Number' || row0Char === 'Neighbourhood ID') {
      const idVal = safeParseIntOrNull(row0[col]);
      if (idVal > 0) {
        neighbourhoodColumns[col] = { name: col, neighbourhood_id: idVal };
      }
    }
  }

  if (Object.keys(neighbourhoodColumns).length === 0) {
    return { map, stats };
  }

  // Skip the ID row if present
  const dataRows = row0Char === 'Neighbourhood Number' || row0Char === 'Neighbourhood ID'
    ? rows.slice(1)
    : rows;

  // Accumulators per neighbourhood for computed fields
  const tenureData = {};
  const familyData = {};
  const marriedData = {};
  const educationData = {};
  const immigrantData = {};
  const minorityData = {};
  const languageData = {};
  const constructionData = {};
  // Income accumulators: dbCol → { neighbourhood_id → value }
  const incomeData = {};
  const lowIncomeData = {};

  let matchedRows = 0;

  for (const record of dataRows) {
    const characteristic = String(record[charColName] || '').trim();
    if (!characteristic) continue;

    // Direct income columns — accumulate per dbCol.
    if (INCOME_CHARACTERISTICS[characteristic]) {
      const dbCol = INCOME_CHARACTERISTICS[characteristic];
      matchedRows++;
      if (!incomeData[dbCol]) incomeData[dbCol] = {};
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          incomeData[dbCol][info.neighbourhood_id] = Math.round(val);
        }
      }
    }

    // Low income percentage — accumulate, NOT rounded.
    if (characteristic === PCT_CHARACTERISTIC) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          lowIncomeData[info.neighbourhood_id] = val;
        }
      }
    }

    // Tenure: Owner and Renter counts
    if (characteristic === 'Owner') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!tenureData[info.neighbourhood_id]) tenureData[info.neighbourhood_id] = { owner: 0, renter: 0 };
          tenureData[info.neighbourhood_id].owner = val;
        }
      }
    }
    if (characteristic === 'Renter') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!tenureData[info.neighbourhood_id]) tenureData[info.neighbourhood_id] = { owner: 0, renter: 0 };
          tenureData[info.neighbourhood_id].renter = val;
        }
      }
    }

    // Construction periods
    if (CONSTRUCTION_PERIODS.includes(characteristic)) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null && val > 0) {
          if (!constructionData[info.neighbourhood_id]) constructionData[info.neighbourhood_id] = {};
          constructionData[info.neighbourhood_id][characteristic] = val;
        }
      }
    }

    // Family
    if (characteristic === 'Total couple families') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!familyData[info.neighbourhood_id]) familyData[info.neighbourhood_id] = { couples: 0, loneParent: 0 };
          familyData[info.neighbourhood_id].couples = val;
        }
      }
    }
    if (characteristic === 'Total one-parent families') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!familyData[info.neighbourhood_id]) familyData[info.neighbourhood_id] = { couples: 0, loneParent: 0 };
          familyData[info.neighbourhood_id].loneParent = val;
        }
      }
    }

    // Married (handle "common law" vs "common-law")
    if (characteristic === 'Married or living common law' || characteristic === 'Married or living common-law') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!marriedData[info.neighbourhood_id]) marriedData[info.neighbourhood_id] = { married: 0, total: 0 };
          marriedData[info.neighbourhood_id].married = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Marital status for the total population aged 15 years and over')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!marriedData[info.neighbourhood_id]) marriedData[info.neighbourhood_id] = { married: 0, total: 0 };
          marriedData[info.neighbourhood_id].total = val;
        }
      }
    }

    // University degree (handle both Census 2016 and 2021 naming)
    if (characteristic === 'University certificate, diploma or degree at bachelor level or above'
        || characteristic.replace(/’/g, "'") === "Bachelor's degree or higher") {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!educationData[info.neighbourhood_id]) educationData[info.neighbourhood_id] = { university: 0, total: 0 };
          educationData[info.neighbourhood_id].university = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Highest certificate, diploma or degree for the population aged')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!educationData[info.neighbourhood_id]) educationData[info.neighbourhood_id] = { university: 0, total: 0 };
          educationData[info.neighbourhood_id].total = val;
        }
      }
    }

    // Immigrants
    if (characteristic === 'Immigrants') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!immigrantData[info.neighbourhood_id]) immigrantData[info.neighbourhood_id] = { immigrants: 0, total: 0 };
          immigrantData[info.neighbourhood_id].immigrants = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Immigrant status and period of immigration for the population in private households')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!immigrantData[info.neighbourhood_id]) immigrantData[info.neighbourhood_id] = { immigrants: 0, total: 0 };
          immigrantData[info.neighbourhood_id].total = val;
        }
      }
    }

    // Visible minority
    if (characteristic === 'Total visible minority population') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!minorityData[info.neighbourhood_id]) minorityData[info.neighbourhood_id] = { visible: 0, total: 0 };
          minorityData[info.neighbourhood_id].visible = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Visible minority for the population in private households')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!minorityData[info.neighbourhood_id]) minorityData[info.neighbourhood_id] = { visible: 0, total: 0 };
          minorityData[info.neighbourhood_id].total = val;
        }
      }
    }

    // English knowledge
    if (characteristic === 'English only') {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!languageData[info.neighbourhood_id]) languageData[info.neighbourhood_id] = { english: 0, total: 0 };
          languageData[info.neighbourhood_id].english = val;
        }
      }
    }
    if (characteristic.startsWith('Total - Knowledge of official languages for the')) {
      matchedRows++;
      for (const [col, info] of Object.entries(neighbourhoodColumns)) {
        const val = parseNumeric(record[col]);
        if (val !== null) {
          if (!languageData[info.neighbourhood_id]) languageData[info.neighbourhood_id] = { english: 0, total: 0 };
          languageData[info.neighbourhood_id].total = val;
        }
      }
    }
  }

  stats.matched_rows = matchedRows;
  stats.neighbourhood_columns = Object.keys(neighbourhoodColumns).length;

  // ── census assignments (the legacy batch UPDATEs, folded per column) ──

  // Income columns (avg/median household + avg individual)
  for (const [dbCol, byNid] of Object.entries(incomeData)) {
    for (const [nid, val] of Object.entries(byNid)) put(nid, dbCol, val);
  }

  // Low income percentage
  for (const [nid, val] of Object.entries(lowIncomeData)) put(nid, 'low_income_pct', val);

  // Tenure percentages
  for (const [nid, data] of Object.entries(tenureData)) {
    const total = data.owner + data.renter;
    if (total > 0) {
      put(nid, 'tenure_owner_pct', Math.round((data.owner / total) * 1000) / 10);
      put(nid, 'tenure_renter_pct', Math.round((data.renter / total) * 1000) / 10);
    }
  }

  // Dominant construction period
  for (const [nid, periodCounts] of Object.entries(constructionData)) {
    let maxCount = 0;
    let dominant = null;
    for (const [period, count] of Object.entries(periodCounts)) {
      if (count > maxCount) { maxCount = count; dominant = period; }
    }
    if (dominant) {
      put(nid, 'period_of_construction', PERIOD_MAP[dominant] || dominant);
    }
  }

  // Family percentages
  for (const [nid, data] of Object.entries(familyData)) {
    const total = data.couples + data.loneParent;
    if (total > 0) {
      put(nid, 'couples_pct', Math.round((data.couples / total) * 1000) / 10);
      put(nid, 'lone_parent_pct', Math.round((data.loneParent / total) * 1000) / 10);
    }
  }

  // Bulk arm: married, university_degree, immigrant, visible_minority, english_knowledge
  // percentages — only the NON-NULL pcts are assigned (the legacy COALESCE arm).
  const censusIds = [...new Set([
    ...Object.keys(marriedData),
    ...Object.keys(educationData),
    ...Object.keys(immigrantData),
    ...Object.keys(minorityData),
    ...Object.keys(languageData),
  ])];

  for (const nid of censusIds) {
    const married = marriedData[nid];
    const university = educationData[nid];
    const immigrant = immigrantData[nid];
    const minority = minorityData[nid];
    const language = languageData[nid];
    const marriedPct = married && married.total > 0 ? Math.round((married.married / married.total) * 1000) / 10 : null;
    const universityPct = university && university.total > 0 ? Math.round((university.university / university.total) * 1000) / 10 : null;
    const immigrantPct = immigrant && immigrant.total > 0 ? Math.round((immigrant.immigrants / immigrant.total) * 1000) / 10 : null;
    const minorityPct = minority && minority.total > 0 ? Math.round((minority.visible / minority.total) * 1000) / 10 : null;
    const englishPct = language && language.total > 0 ? Math.round((language.english / language.total) * 1000) / 10 : null;
    if (marriedPct !== null) put(nid, 'married_pct', marriedPct);
    if (universityPct !== null) put(nid, 'university_degree_pct', universityPct);
    if (immigrantPct !== null) put(nid, 'immigrant_pct', immigrantPct);
    if (minorityPct !== null) put(nid, 'visible_minority_pct', minorityPct);
    if (englishPct !== null) put(nid, 'english_knowledge_pct', englishPct);
  }

  return { map, stats };
}

/** LAST-wins dedupe by `neighbourhood_id` (massing shape): the pre_write FAIL `duplicate_key_count` refuses any duplicate (N-D7). */
function dedupeBySourceId(features) {
  const byKey = new Map();
  for (const f of features) byKey.set(f.neighbourhood_id, f);
  const kept = [...byKey.values()];
  return { kept, duplicateCount: features.length - kept.length };
}

/** §3.5 status → counter deltas (write.js anchor `const d = classify(v.status, v.is_valid_original);`, two positional args). ⚠️ `accepted` NEVER REPAIRS (N-D13): `geometry_repair` "none" keeps `repaired` 0 EVEN WHEN `isValidOriginal === false`; the library counts stored-invalid rows itself. All four keys always present. */
function validatorCounterDelta(status, isValidOriginal) {
  if (status === 'accepted') {
    return { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true };
  }
  if (status === 'collection_extracted') {
    return { repaired: 0, collectionExtracted: 1, skipped: 0, carry: true };
  }
  return { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false };
}

/** Class A (`retract:"none"`): no `delete_sql` exists, so the delete is always skipped. */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Checks — one function per declared check, in DESCRIPTOR ORDER, name === id
// ===========================================================================

/** Finite number, else null (massing's reader). */
function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * Descriptor checks[0], FAIL — the catastrophic-load detector. `rows_shaped` is the
 * PRE-DEDUPE count of features carrying a key and a name (legacy `ids.length`), i.e. the
 * count that fed `boundaryCount >= 158`. The bound is the SHARED, pre-existing
 * `sources_neighbourhoods_floor` variable — the SAME key assert_data_bounds and
 * link_neighbourhoods declare (Rule 3, one home per concern) — read through `ctx.config`.
 * The descriptor's `limit` uses verdict.js's `value_min` form against this reported raw
 * `value` (the AP-D6 trap: a `viol == 0` limit is false on every run once the config
 * value is substituted in). Null `rows_shaped` (no acquisition) reports a null row.
 */
function boundaries_loaded(ctx) {
  const rs = numberOrNull((ctx.acquired || {}).rows_shaped);
  if (rs == null) {
    return ctx.report('boundaries_loaded', { violations: 0, detail: null, value: null });
  }
  ctx.report('boundaries_loaded', {
    value: rs,
    detail: rs,
    violations: rs < ctx.config.sources_neighbourhoods_floor ? 1 : 0,
  });
}

/**
 * Descriptor checks[1], INFO — the census characteristic rows `buildLookup` matched
 * (`acquired.lookups[LOOKUP_ID].stats.matched_rows`), carried so the audit table keeps its
 * row rather than going silent. Purely descriptive (INFO, never gates) and a raw count, so
 * `viol == 0`; N-D10 records that a WARN floor on it is deferred to F2. Every hop is
 * guarded — a missing acquisition or lookup reports null.
 */
function census_rows_matched(ctx) {
  const a = ctx.acquired || {};
  const lookup = (a.lookups || {})[LOOKUP_ID] || {};
  const stats = lookup.stats || {};
  const n = numberOrNull(stats.matched_rows);
  ctx.report('census_rows_matched', { violations: 0, detail: n });
}

/** Descriptor checks[2], FAIL — N-D6: a feature whose AREA_SHORT_CODE is absent, empty or 0. Pre-write refusal; violations is the raw count, so `viol == 0` passes only at zero. */
function bad_key_count(ctx) {
  const a = ctx.acquired || {};
  const n = numberOrNull(a.bad_key_count) || 0;
  ctx.report('bad_key_count', { violations: n, detail: n });
}

/** Descriptor checks[3], FAIL — N-D7: two features sharing an AREA_SHORT_CODE (legacy `cannot affect row a second time`). Pre-write refusal; violations is the raw count, so `viol == 0` passes only at zero. */
function duplicate_key_count(ctx) {
  const a = ctx.acquired || {};
  const n = numberOrNull(a.duplicate_key_count) || 0;
  ctx.report('duplicate_key_count', { violations: n, detail: n });
}

/** Descriptor checks[4], FAIL — N-D17: a feature with a null geometry (legacy `ST_GeomFromGeoJSON` of a jsonb 'null' threw). Pre-write refusal; violations is the raw count, so `viol == 0` passes only at zero. */
function null_geometry_count(ctx) {
  const a = ctx.acquired || {};
  const n = numberOrNull(a.null_geometry_count) || 0;
  ctx.report('null_geometry_count', { violations: n, detail: n });
}

/** Descriptor checks[5], WARN — N-D1: the guarded upsert inserted a NEW boundary row (`written.inserted`; the insert path is dead on live input). Violations is the raw count, so `viol == 0` passes only at zero. */
function boundary_rows_inserted(ctx) {
  const w = ctx.written || {};
  const n = numberOrNull(w.inserted) || 0;
  ctx.report('boundary_rows_inserted', { violations: n, detail: n });
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in DESCRIPTOR ORDER. */
const CHECKS = {
  boundaries_loaded,
  census_rows_matched,
  bad_key_count,
  duplicate_key_count,
  null_geometry_count,
  boundary_rows_inserted,
};

/**
 * ⚠️ REQUIRE-TIME INVARIANT (SPEC LINK 122 §5.5): the dispatch keys ARE the declared
 * check ids. The descriptor ships beside this file and is ALREADY required above, so this
 * reuses that binding rather than requiring the same bytes a second time; a mismatch is a
 * load-order bug, not a runtime condition — it must throw at require() time rather than
 * surface as a silently-unscored check on a green run.
 */
const DECLARED_CHECKS = DESCRIPTOR.checks.map((c) => c.id);
const DISPATCH_KEYS = Object.keys(CHECKS);
if (DISPATCH_KEYS.length !== DECLARED_CHECKS.length
    || DISPATCH_KEYS.some((id, i) => id !== DECLARED_CHECKS[i])) {
  throw new Error('load-neighbourhoods compute dispatch keys are not the descriptor\'s declared check ids: '
    + `dispatch=[${DISPATCH_KEYS.join(', ')}] declared=[${DECLARED_CHECKS.join(', ')}]`);
}
for (const id of DECLARED_CHECKS) {
  if (CHECKS[id].name !== id) {
    throw new Error(`load-neighbourhoods compute: checks.${id} is bound to a function named "${CHECKS[id].name}"`);
  }
}

/**
 * The emit block — the keys `emits[]` 2-4 declare, byte-identical to the pre-conversion
 * loader's names (the legacy top-level `records_meta` keys by name). `has_postgis` is
 * retired (N-D4 — it is now the fail-loud guard guards.requires postgis). Built only on a
 * LOAD: a gated skip re-emits the PRIOR block through the library, so a half-populated
 * block here would overwrite it.
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired || {};
  const lookup = (a.lookups || {})[LOOKUP_ID] || {};
  const stats = lookup.stats || {};
  return {
    boundaries_loaded: numberOrNull(a.rows_shaped) || 0,
    census_rows_matched: numberOrNull(stats.matched_rows) || 0,
    duration_ms: numberOrNull(ctx.elapsed_ms) || 0,
  };
}

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row, never suppress siblings. */
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
  return { records_meta: buildLoadMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The pure seams the runner calls by name (§5.5 (1) — compute is just compute).
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.buildLookup = buildLookup;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.buildLoadMeta = buildLoadMeta;
// The parse/compute seams, exported so a lock can drive them without a write plan.
module.exports.parseColumnHeader = parseColumnHeader;
module.exports.parseNumeric = parseNumeric;
module.exports.KEY_PROPERTY = KEY_PROPERTY;
module.exports.LOOKUP_ID = LOOKUP_ID;
module.exports.CENSUS_COLUMNS = CENSUS_COLUMNS;
