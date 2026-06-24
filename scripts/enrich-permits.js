#!/usr/bin/env node
/**
 * Enrich Permit + CoA Zoning (Spec 58 WF3 / Spec 66) — copies the WF2-enriched
 * parcel zoning feed onto permits (via permit_parcels) and coa_applications (via
 * lead_parcels). ONE script, two chain modes via ENRICH_TARGET. Always-full
 * relational join (DEC-3); idempotent (IS DISTINCT FROM).
 * SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const mb = require('./lib/max-build');

const ADVISORY_LOCK_ID = 66; // §R2 — lock = spec number
const TAG = '[enrich-permits]';
const TARGETS = ['permits', 'coa'];

// F-H12 gate FAIL thresholds — mirror docs/specs/_contracts.json zoning.* (DEC-5).
// (contracts.infra.test.ts pins these literals against the JSON.)
const PERMITS_COVERAGE_FAIL = 80;
const COA_COVERAGE_FAIL = 80;

// Scalar zoning fields copied verbatim from the dominant parcel (already NUMERIC/TEXT).
const SCALARS = ['zoning_class', 'bylaw_max_coverage_pct', 'bylaw_max_fsi', 'bylaw_max_height_m', 'exception_number'];

// §8e ravine columns (Spec 59 / migration 169). Aggregated across linked parcels (L12),
// NOT dominant-parcel scalars. In allWriteCols → UPDATE guard + emitMeta writes; but the
// boolean is NOT NULL so the orphan-nullify resets it to false (not NULL) — see buildNullifyOrphansSql.
const RAVINE_COLS = ['is_in_ravine_protection_area', 'ravine_distance_m'];

// §8e heritage columns (Spec 61 / migration 172). Aggregated across linked parcels with
// L12 Part-IV-wins precedence (bool_or per type + MIN(date) FILTER), NOT dominant-parcel
// scalars. In allWriteCols → UPDATE guard + emitMeta writes; the boolean is NOT NULL so the
// orphan-nullify resets it to false (type/date → NULL) — see buildNullifyOrphansSql.
const HERITAGE_COLS = ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date'];

// §8e centreline columns (Spec 62 / migration 176). Aggregated across linked parcels (L12):
// is_corner_lot/is_through_lot via bool_or; primary_frontage_street_name is the smallest-par.id
// non-NULL value (§11.1, NOT a bool_or). The booleans are NOT NULL so the orphan-nullify resets
// them to false (frontage → NULL), like ravine/heritage — see buildNullifyOrphansSql.
const CENTRELINE_COLS = ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway'];

// Max-build columns (Spec 65 / migration 186). Lot-validation INPUTS + max-build OUTPUTS, both from
// the DOMINANT parcel (assembly has no coherent envelope — max_build_confidence degrades to 'low'
// when zoning_parcel_count > 1). The two NOT-NULL booleans (garden_suite_fits, envelope_constrained)
// reset to false on orphan-nullify; the rest → NULL. mb.LOT_MAXBUILD_COLS = inputs + outputs.
// (is_through_lot is already propagated via CENTRELINE_COLS — not duplicated here.)
const MAXBUILD_COLS = mb.LOT_MAXBUILD_COLS;

// Existing-structure columns (Spec 65 Phase 1 / migration 188). Propagated from the DOMINANT
// parcel (the lead's main building); all nullable (incl. existing_structure_confidence TEXT) →
// orphan-nullify uses the generic = NULL path (NO NOT-NULL bools).
const EXISTING_STRUCTURE_COLS = mb.EXISTING_COLS;

// Scenario GFA columns (Spec 65 Phase 2 / migration 190). Propagated from the DOMINANT parcel; all
// nullable numerics → generic =NULL orphan path. (max_build_stories_basis rides the max-build
// propagation — it's in MAX_BUILD_COLS/LOT_MAXBUILD_COLS.)
const SCENARIO_COLS = mb.SCENARIO_COLS;

// L24c coverage-guard default (operator-overridable via logic_variables.centreline_propagation_coverage_min).
// 0.90 sits below the ~3% zero-intersection floor so a healthy ~97% run never false-HALTs, yet a
// partial §8d run (≪50% enriched) trips it. See assertCentrelineEnriched.
const CENTRELINE_COVERAGE_MIN_DEFAULT = 0.90;

// Per-target config (DEC-1/2/4). leadKey = the temp-table identity columns.
// The 7 parcel overlay-membership booleans (WF2 / migration 165) — bool_or'd across
// a lead's linked parcels to build overlay_summary (Spec 66 frozen shape).
const OVERLAY_FLAGS = ['in_policy_area', 'on_policy_road', 'in_rooming_house_overlay',
  'in_parking_zone_overlay', 'in_building_setback_overlay', 'on_priority_retail', 'in_queenstw_eat_overlay'];

const CFG = {
  permits: {
    table: 'permits',
    leadAlias: 'p',
    leadKey: ['permit_num', 'revision_num'],
    from: 'permits p',
    linkAlias: 'pp',
    linkJoin: 'JOIN permit_parcels pp ON pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num',
    confidence: 'pp.confidence',
    keySelect: 'p.permit_num, p.revision_num',
    // overlay_summary = membership booleans (bool_or across linked parcels) + dominant detail.
    jsonbExtra: `ag.applicable_bylaws AS applicable_bylaws,
         jsonb_build_object(${OVERLAY_FLAGS.map((f) => `'${f}', ag.ov_${f}`).join(', ')},
           'detail', dom.zoning_overlays) AS overlay_summary,`,
    jsonbCols: ['applicable_bylaws', 'overlay_summary'],
  },
  coa: {
    table: 'coa_applications',
    leadAlias: 'c',
    leadKey: ['id'],
    from: 'coa_applications c',
    linkAlias: 'lp',
    linkJoin: 'JOIN lead_parcels lp ON lp.lead_id = c.lead_id', // DEC-4: stored key, never re-derive
    confidence: 'lp.confidence',
    keySelect: 'c.id',
    jsonbExtra: `jsonb_build_object(
           'base', jsonb_build_object('zoning_class', dom.zoning_class, 'bylaw_max_fsi', dom.bylaw_max_fsi,
             'bylaw_max_coverage_pct', dom.bylaw_max_coverage_pct, 'bylaw_max_height_m', dom.bylaw_max_height_m,
             'exception_number', dom.exception_number),
           'parcels', ag.applicable_bylaws) AS variance_context,`,
    jsonbCols: ['variance_context'],
  },
};

function validateTarget(t) {
  if (!TARGETS.includes(t)) {
    throw new Error(`${TAG} ENRICH_TARGET must be one of ${TARGETS.join('|')} — got ${JSON.stringify(t)}`);
  }
  return t;
}

function allWriteCols(target) {
  const c = CFG[target];
  return [...SCALARS, ...c.jsonbCols, 'zoning_parcel_count', 'zoning_dominant_parcel_id', 'zoning_dominant_parcel_method', ...RAVINE_COLS, ...HERITAGE_COLS, ...CENTRELINE_COLS, ...MAXBUILD_COLS, ...EXISTING_STRUCTURE_COLS, ...SCENARIO_COLS];
}

// ---------------------------------------------------------------------------
// Precondition — WF2 must have enriched parcels (Spec 58 §10).
// ---------------------------------------------------------------------------
async function assertWf2Ran(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM parcels WHERE zoning_enriched_at IS NOT NULL');
  if (rows[0].n === 0) {
    throw new Error(`${TAG} no parcel has zoning_enriched_at — WF2 (enrich-parcels) has not run; cannot enrich permits/CoA`);
  }
}

// §8e precondition (DEC-D) — enrich-ravines (§8d) must have populated parcels' ravine feed.
// Cross-chain: §8d runs in the sources chain, this runs in permits/coa — so this HALT (not
// chain order) is the load-bearing guard. The lineage TEXT column is the only reliable signal
// (is_in_ravine_protection_area defaults false, so it can't distinguish "ran" from "never ran").
async function assertRavinesEnriched(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM parcels WHERE ravine_dataset_version_when_enriched IS NOT NULL');
  if (rows[0].n === 0) {
    throw new Error(`${TAG} no parcel has ravine_dataset_version_when_enriched — enrich-ravines (§8d) has not run; cannot propagate ravine to permits/CoA`);
  }
}

// §8e precondition (Spec 61 DEC-F) — enrich-heritage (§8d) must have populated parcels'
// heritage feed. Same cross-chain HALT rationale as ravine (lineage TEXT col is the only
// reliable "ran" signal; is_heritage_designated defaults false).
async function assertHeritageEnriched(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM parcels WHERE heritage_dataset_version_when_enriched IS NOT NULL');
  if (rows[0].n === 0) {
    throw new Error(`${TAG} no parcel has heritage_dataset_version_when_enriched — enrich-heritage (§8d) has not run; cannot propagate heritage to permits/CoA`);
  }
}

// §8e L24 — column-existence guard. Fails fast with a clear message if migration 171 (source
// parcels cols) or 172 (target lead cols) has not been applied, instead of a cryptic
// "column does not exist" mid-UPDATE. No existing information_schema check in this file to mirror.
async function assertHeritageColumns(client, target) {
  const targetTable = CFG[target].table;
  const want = {
    parcels: ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'heritage_dataset_version_when_enriched'],
    [targetTable]: ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date'],
  };
  for (const [tbl, cols] of Object.entries(want)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])`,
      [tbl, cols],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length > 0) {
      throw new Error(`${TAG} ${tbl} missing heritage columns [${missing.join(', ')}] — migration ${tbl === 'parcels' ? '171' : '172'} not applied`);
    }
  }
}

// §8e L24a (Spec 62) — column-existence guard. Fail fast with a clear message if migration 174
// (parcels source cols + lineage) or 176 (target lead cols) is unapplied, not a cryptic
// "column does not exist" mid-UPDATE.
async function assertCentrelineColumns(client, target) {
  const targetTable = CFG[target].table;
  const want = {
    parcels: ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway', 'centreline_dataset_version_when_enriched'],
    [targetTable]: ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway'],
  };
  for (const [tbl, cols] of Object.entries(want)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])`,
      [tbl, cols],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length > 0) {
      // abuts_laneway ships in mig 191/192 (Phase 3); the rest in 174/176.
      throw new Error(`${TAG} ${tbl} missing centreline columns [${missing.join(', ')}] — migration ${tbl === 'parcels' ? '174/191' : '176/192'} not applied`);
    }
  }
}

// §8e (Spec 65) — column-existence guard for the max-build feed. Fail fast with a clear message if
// migration 185 (parcels source cols) or 186 (target lead cols) is unapplied, not a cryptic
// "column does not exist" mid-UPDATE. The "enrich-parcels ran" precondition is already covered by
// assertWf2Ran (max-build is a second pass of the SAME enrich-parcels script/txn as zoning).
async function assertMaxBuildColumns(client, target) {
  const targetTable = CFG[target].table;
  const want = {
    parcels: ['lot_size_confidence', ...mb.LOT_MAXBUILD_OUTPUT_COLS],
    [targetTable]: mb.LOT_MAXBUILD_COLS,
  };
  for (const [tbl, cols] of Object.entries(want)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])`,
      [tbl, cols],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length > 0) {
      // max_build_stories_basis (Phase 2) ships in 189/190; the Phase-3 accessory cols in 191/192 — cite all.
      throw new Error(`${TAG} ${tbl} missing max-build columns [${missing.join(', ')}] — migration ${tbl === 'parcels' ? '185/189/191' : '186/190/192'} not applied`);
    }
  }
}

// §8e (Spec 65 Phase 1) — column-existence guard for the existing-structure feed (mig 187 parcels /
// 188 target). Same fail-fast rationale as assertMaxBuildColumns.
async function assertExistingStructureColumns(client, target) {
  const targetTable = CFG[target].table;
  const want = { parcels: mb.EXISTING_COLS, [targetTable]: mb.EXISTING_COLS };
  for (const [tbl, cols] of Object.entries(want)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])`,
      [tbl, cols],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length > 0) {
      throw new Error(`${TAG} ${tbl} missing existing-structure columns [${missing.join(', ')}] — migration ${tbl === 'parcels' ? '187' : '188'} not applied`);
    }
  }
}

// §8e (Spec 65 Phase 2) — column-existence guard for the scenario GFA feed (mig 189 parcels / 190 target).
async function assertScenarioColumns(client, target) {
  const targetTable = CFG[target].table;
  const want = { parcels: mb.SCENARIO_COLS, [targetTable]: mb.SCENARIO_COLS };
  for (const [tbl, cols] of Object.entries(want)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])`,
      [tbl, cols],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length > 0) {
      throw new Error(`${TAG} ${tbl} missing scenario columns [${missing.join(', ')}] — migration ${tbl === 'parcels' ? '189' : '190'} not applied`);
    }
  }
}

// §8e L24b/c (Spec 62) — enrich-centreline (§8d) must have populated parcels' feed, RECENTLY +
// BROADLY. This is the load-bearing cross-chain HALT (§8d runs in the sources chain, this in
// permits/coa). Stricter than the ravine/heritage `>0` precedent — deliberate per §L24.
async function assertCentrelineEnriched(client) {
  // L24b recency — a successful enrich_centreline must post-date the most recent load-parcels.
  // The lineage TEXT column alone can't tell "stale-vs-reloaded-parcels" apart; a parcels reload
  // after enrichment leaves the stamp set but the spatial join stale.
  const { rows: r } = await client.query(`
    SELECT
      (SELECT max(completed_at) FROM pipeline_runs WHERE pipeline IN ('sources:enrich_centreline','enrich_centreline') AND status = 'completed') AS enriched_at,
      (SELECT max(completed_at) FROM pipeline_runs WHERE pipeline IN ('sources:parcels','parcels')                       AND status = 'completed') AS parcels_at`);
  const enrichedAt = r[0].enriched_at;
  const parcelsAt = r[0].parcels_at;
  if (!enrichedAt) {
    throw new Error(`${TAG} no successful enrich_centreline run — §8d has not run; cannot propagate centreline to permits/CoA`);
  }
  if (parcelsAt && new Date(enrichedAt) < new Date(parcelsAt)) {
    throw new Error(`${TAG} enrich_centreline (${enrichedAt}) predates the latest load-parcels (${parcelsAt}) — parcels reloaded after centreline enrichment; re-run enrich_centreline (§8d)`);
  }
  // L24c coverage — enriched / all valid-geom parcels >= tunable threshold. (The schema can't
  // cleanly express "intersecting", so denominator is all valid-geom; ~3% are zero-intersection
  // so a healthy run is ≈97% while a partial §8d is ≪50% — the gap is wide, default 0.90 is safe.)
  const minRow = await client.query(`SELECT variable_value FROM logic_variables WHERE variable_key = 'centreline_propagation_coverage_min'`);
  const threshold = minRow.rows.length && minRow.rows[0].variable_value != null ? Number(minRow.rows[0].variable_value) : CENTRELINE_COVERAGE_MIN_DEFAULT;
  const cov = (await client.query(`
    SELECT COUNT(*) FILTER (WHERE centreline_dataset_version_when_enriched IS NOT NULL)::float
         / NULLIF(COUNT(*) FILTER (WHERE geom IS NOT NULL), 0) AS pct
    FROM parcels`)).rows[0].pct;
  if (cov === null) {
    throw new Error(`${TAG} no valid-geom parcels — cannot assess centreline coverage`);
  }
  if (Number(cov) < threshold) {
    throw new Error(`${TAG} centreline parcels coverage ${(Number(cov) * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% min — §8d only partially enriched; refusing to propagate (would mark most leads false/false/NULL). Override via logic_variables.centreline_propagation_coverage_min.`);
  }
}

// §8e DEC-D2 (Spec 62) — per-target link-table guard. Verify THIS target's configured link table
// (permit_parcels for permits, lead_parcels for coa — keyed off CFG) exists AND carries its join
// columns, so a missing/renamed link table FAILs clearly (not a cryptic relation/column-not-found
// mid-transaction).
async function assertLinkTable(client, target) {
  const linkTable = target === 'permits' ? 'permit_parcels' : 'lead_parcels';
  const joinCols = target === 'permits' ? ['permit_num', 'revision_num', 'parcel_id'] : ['lead_id', 'parcel_id'];
  // Check table existence FIRST so a missing/renamed table FAILs clearly (a column probe on a
  // non-existent table returns 0 rows → a misleading "missing columns" message) [DeepSeek R1].
  const tbl = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [linkTable]);
  if (tbl.rows.length === 0) {
    throw new Error(`${TAG} link table "${linkTable}" does not exist for target ${target} — cannot join to propagate`);
  }
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])`,
    [linkTable, joinCols],
  );
  const present = new Set(rows.map((row) => row.column_name));
  const missing = joinCols.filter((col) => !present.has(col));
  if (missing.length > 0) {
    throw new Error(`${TAG} link table "${linkTable}" missing/renamed columns [${missing.join(', ')}] for target ${target} — cannot join to propagate`);
  }
}

// ---------------------------------------------------------------------------
// SQL builders (DEC-1/3/4 — set-based; decomposed temp table → trivial UPDATE).
// scopeWhere is a TRUSTED internal/test predicate over the lead alias.
// ---------------------------------------------------------------------------
function buildEnrichmentSql({ target, scopeWhere = 'TRUE' }) {
  const c = CFG[target];
  const key = c.leadKey.join(', ');
  // Inside `cand` the lead key columns also exist on the link table (permit_parcels
  // has permit_num/revision_num; parcels has id), so window PARTITIONs must qualify
  // with the lead alias to avoid "column reference is ambiguous".
  const qkey = c.leadKey.map((k) => `${c.leadAlias}.${k}`).join(', ');
  // area_share = parcel lot ÷ total linked lot (dominant = largest); drives the
  // deterministic jsonb order (idempotency — WF2 lesson) AND the rn=1 dominant pick.
  return `
CREATE TEMP TABLE lead_zoning_enrich ON COMMIT DROP AS
WITH cand AS (
  SELECT ${c.keySelect},
         par.id AS parcel_id, par.zoning_class, par.bylaw_max_coverage_pct, par.bylaw_max_fsi,
         par.bylaw_max_height_m, par.exception_number, par.zoning_overlays, par.lot_size_sqm,
         par.is_in_ravine_protection_area, par.ravine_distance_m,
         par.is_heritage_designated, par.heritage_designation_type, par.heritage_designation_date,
         par.is_corner_lot, par.is_through_lot, par.primary_frontage_street_name, par.abuts_laneway,
         ${MAXBUILD_COLS.filter((col) => col !== 'lot_size_sqm').map((col) => `par.${col}`).join(', ')},
         ${EXISTING_STRUCTURE_COLS.map((col) => `par.${col}`).join(', ')},
         ${SCENARIO_COLS.map((col) => `par.${col}`).join(', ')},
         ${OVERLAY_FLAGS.map((f) => `par.${f}`).join(', ')},
         ${c.confidence} AS confidence,
         par.lot_size_sqm / NULLIF(SUM(par.lot_size_sqm) OVER (PARTITION BY ${qkey}), 0) AS area_share,
         ROW_NUMBER() OVER (PARTITION BY ${qkey}
           ORDER BY par.lot_size_sqm DESC NULLS LAST, ${c.confidence} DESC NULLS LAST, par.id ASC) AS rn
  FROM ${c.from}
  ${c.linkJoin}
  JOIN parcels par ON par.id = ${target === 'permits' ? 'pp' : 'lp'}.parcel_id
  WHERE (${scopeWhere})
),
ag AS (
  SELECT ${key},
    jsonb_agg(jsonb_build_object(
      'parcel_id', parcel_id, 'zoning_class', zoning_class, 'bylaw_max_fsi', bylaw_max_fsi,
      'bylaw_max_coverage_pct', bylaw_max_coverage_pct, 'bylaw_max_height_m', bylaw_max_height_m,
      'exception_number', exception_number, 'area_share', round(area_share::numeric, 4))
      ORDER BY area_share DESC NULLS LAST, parcel_id) AS applicable_bylaws,
    COUNT(*)                         AS zoning_parcel_count,
    COUNT(DISTINCT zoning_class)     AS distinct_zones,
    -- §8e L12 ravine propagation: any linked parcel inside → true; signed distance =
    -- MIN(ABS) over linked parcels × sign(any-inside). MIN ignores NULLs, so a lead
    -- whose parcels all have NULL distance gets NULL (orphan semantic, §11.2).
    COALESCE(bool_or(is_in_ravine_protection_area), false) AS new_in_ravine,
    MIN(ABS(ravine_distance_m))      AS min_abs_dist,
    -- §8e L12 heritage propagation: any linked parcel designated → true; type via Part-IV-wins
    -- precedence (has_part_iv > has_part_v_hcd); date = MIN(date) of the winning type's parcels.
    COALESCE(bool_or(is_heritage_designated), false)                                    AS new_heritage,
    bool_or(heritage_designation_type = 'part_iv_individual')                           AS has_part_iv,
    bool_or(heritage_designation_type = 'part_v_hcd')                                   AS has_part_v_hcd,
    MIN(heritage_designation_date) FILTER (WHERE heritage_designation_type = 'part_iv_individual') AS part_iv_date,
    MIN(heritage_designation_date) FILTER (WHERE heritage_designation_type = 'part_v_hcd')         AS part_v_date,
    -- §8e L12 centreline propagation: corner/through via bool_or (a consolidated multi-parcel lead
    -- can be both — no mutual-exclusivity carve-out, F-S6). primary_frontage_street_name (§11.1):
    -- smallest-parcel_id non-NULL value — array_agg ORDER BY parcel_id FILTER drops NULLs, [1] of
    -- an empty filtered array is NULL (correct orphan semantic). parcel_id = the cand alias of par.id.
    COALESCE(bool_or(is_corner_lot), false)  AS new_is_corner_lot,
    COALESCE(bool_or(is_through_lot), false) AS new_is_through_lot,
    COALESCE(bool_or(abuts_laneway), false)  AS new_abuts_laneway,
    (array_agg(primary_frontage_street_name ORDER BY parcel_id) FILTER (WHERE primary_frontage_street_name IS NOT NULL))[1] AS new_primary_frontage,
    ${OVERLAY_FLAGS.map((f) => `bool_or(${f}) AS ov_${f}`).join(',\n    ')}
  FROM cand GROUP BY ${key}
)
SELECT ${c.leadKey.map((k) => `dom.${k}`).join(', ')},
       ${SCALARS.map((s) => `dom.${s}`).join(', ')},
       ${c.jsonbExtra}
       ag.zoning_parcel_count,
       dom.parcel_id AS zoning_dominant_parcel_id,
       'max_area'::text AS zoning_dominant_parcel_method,
       ag.new_in_ravine AS is_in_ravine_protection_area,
       ag.min_abs_dist * CASE WHEN ag.new_in_ravine THEN -1 ELSE 1 END AS ravine_distance_m,
       ag.new_heritage AS is_heritage_designated,
       -- L12 Part-IV-wins; outer new_heritage guard keeps type/date NULL when undesignated (invariant-explicit).
       CASE WHEN ag.new_heritage
            THEN (CASE WHEN ag.has_part_iv THEN 'part_iv_individual'
                       WHEN ag.has_part_v_hcd THEN 'part_v_hcd' ELSE NULL END)
            ELSE NULL END AS heritage_designation_type,
       CASE WHEN ag.new_heritage
            THEN (CASE WHEN ag.has_part_iv THEN ag.part_iv_date
                       WHEN ag.has_part_v_hcd THEN ag.part_v_date ELSE NULL END)
            ELSE NULL END AS heritage_designation_date,
       ag.new_is_corner_lot AS is_corner_lot,
       ag.new_is_through_lot AS is_through_lot,
       ag.new_abuts_laneway AS abuts_laneway,
       ag.new_primary_frontage AS primary_frontage_street_name,
       -- §8e max-build propagation (Spec 65): lot INPUTS + envelope OUTPUTS from the DOMINANT parcel
       -- (rn=1). max_build_confidence degrades to 'low' on a multi-parcel assembly (no coherent envelope).
       ${MAXBUILD_COLS.filter((col) => col !== 'max_build_confidence').map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       CASE WHEN ag.zoning_parcel_count > 1 THEN 'low' ELSE dom.max_build_confidence END AS max_build_confidence,
       ${EXISTING_STRUCTURE_COLS.map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       ${SCENARIO_COLS.map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       ag.distinct_zones
FROM cand dom
JOIN ag USING (${key})
WHERE dom.rn = 1;`;
}

function buildUpdateSql({ target }) {
  const c = CFG[target];
  const cols = allWriteCols(target);
  const set = cols.map((col) => `${col} = e.${col}`).join(',\n    ');
  const guard = cols.map((col) => `${c.leadAlias}.${col} IS DISTINCT FROM e.${col}`).join('\n      OR ');
  const join = c.leadKey.map((k) => `${c.leadAlias}.${k} = e.${k}`).join(' AND ');
  return `
UPDATE ${c.table} ${c.leadAlias} SET
    ${set},
    zoning_enriched_at = $1
FROM lead_zoning_enrich e
WHERE ${join}
  AND (
      ${guard}
  );`;
}

// ---------------------------------------------------------------------------
// Engine — runs on a single client (caller owns the transaction).
// ---------------------------------------------------------------------------
async function enrichLeads(client, opts = {}) {
  const { target, scopeWhere = 'TRUE', runAt = null } = opts;
  validateTarget(target);
  const c = CFG[target];

  await client.query('DROP TABLE IF EXISTS lead_zoning_enrich');
  await client.query(buildEnrichmentSql({ target, scopeWhere }));

  const stats = (await client.query(`
    SELECT COUNT(*)::int AS enriched_leads,
           COUNT(*) FILTER (WHERE zoning_parcel_count > 1)::int AS multi_parcel,
           COUNT(*) FILTER (WHERE distinct_zones > 1)::int      AS heterogeneous
    FROM lead_zoning_enrich`)).rows[0];
  const total = (await client.query(
    `SELECT COUNT(*)::int AS n FROM ${c.from} WHERE (${scopeWhere})`)).rows[0].n;

  const stamp = runAt || (await pipeline.getDbTimestamp(client));
  const upd = await client.query(buildUpdateSql({ target }), [stamp]);

  // Reset leads that WERE enriched but have since lost ALL parcel links (un-link) —
  // those rows are absent from the temp table, so the UPDATE above never clears their
  // now-stale zoning (DeepSeek CRIT). Idempotent: sets zoning_enriched_at NULL so the
  // WHERE no longer matches on re-run.
  const orphaned = await client.query(buildNullifyOrphansSql({ target, scopeWhere }));

  return {
    scoped: total,
    updated: upd.rowCount,
    orphansCleared: orphaned.rowCount,
    gaps: total - stats.enriched_leads,
    multiParcel: stats.multi_parcel,
    heterogeneous: stats.heterogeneous,
  };
}

function buildNullifyOrphansSql({ target, scopeWhere = 'TRUE' }) {
  const c = CFG[target];
  // Zoning cols (nullable) → NULL on un-link. The §8e ravine + heritage cols are EXCLUDED
  // from the generic =NULL map: each has a NOT-NULL boolean that can't be NULLed, so reset the
  // boolean to false + the rest to NULL — appended below (ravine §11.2 / heritage L12).
  const set = [
    ...allWriteCols(target).filter((col) => !RAVINE_COLS.includes(col) && !HERITAGE_COLS.includes(col)
      && !CENTRELINE_COLS.includes(col) && !mb.MAX_BUILD_BOOL_COLS.includes(col)).map((col) => `${col} = NULL`),
    'is_in_ravine_protection_area = false',
    'ravine_distance_m = NULL',
    'is_heritage_designated = false',
    'heritage_designation_type = NULL',
    'heritage_designation_date = NULL',
    // §8e centreline: NOT-NULL booleans reset to false (NOT NULL → would crash PG 23502), name → NULL.
    'is_corner_lot = false',
    'is_through_lot = false',
    'abuts_laneway = false', // Spec 65 Phase 3 — NOT-NULL bool (mig 192), reset to false on orphan
    'primary_frontage_street_name = NULL',
    // §8e max-build (Spec 65): the two NOT-NULL booleans reset to false; the rest of MAXBUILD_COLS
    // (lot inputs + envelope outputs) fall through the generic = NULL map above.
    'garden_suite_fits = false',
    'envelope_constrained = false',
  ].join(', ');
  const linkExists = target === 'permits'
    ? `SELECT 1 FROM permit_parcels pp WHERE pp.permit_num = ${c.leadAlias}.permit_num AND pp.revision_num = ${c.leadAlias}.revision_num`
    : `SELECT 1 FROM lead_parcels lp WHERE lp.lead_id = ${c.leadAlias}.lead_id`;
  return `
UPDATE ${c.table} ${c.leadAlias} SET ${set}, zoning_enriched_at = NULL
WHERE ${c.leadAlias}.zoning_enriched_at IS NOT NULL AND (${scopeWhere})
  AND NOT EXISTS (${linkExists});`;
}

// Sparse-by-design null rates for the target table (Spec 66 §3a INFO rows).
async function nullRates(client, table) {
  const r = (await client.query(`
    SELECT ROUND(100.0*COUNT(*) FILTER (WHERE bylaw_max_fsi IS NULL)/NULLIF(COUNT(*),0),1) AS fsi,
           ROUND(100.0*COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NULL)/NULLIF(COUNT(*),0),1) AS cov,
           ROUND(100.0*COUNT(*) FILTER (WHERE bylaw_max_height_m IS NULL)/NULLIF(COUNT(*),0),1) AS height
    FROM ${table}`)).rows[0];
  return { fsi: r.fsi === null ? null : Number(r.fsi), cov: r.cov === null ? null : Number(r.cov), height: r.height === null ? null : Number(r.height) };
}

function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

// Coverage gate (F-H12) — NULLIF-guarded (DeepSeek div-by-zero).
async function coverageGate(client, target) {
  if (target === 'permits') {
    // construction permits only — JOIN the canonical permit_type_classifications table
    // (not a hand-rolled class='construction' literal list).
    const r = (await client.query(`
      SELECT COUNT(*) FILTER (WHERE ptc.class='construction')::int AS denom,
             COUNT(*) FILTER (WHERE ptc.class='construction' AND p.zoning_class IS NOT NULL)::int AS num
      FROM permits p LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type`)).rows[0];
    return { denom: r.denom, pct: r.denom ? Math.round((1000 * r.num) / r.denom) / 10 : null, fail: PERMITS_COVERAGE_FAIL };
  }
  const r = (await client.query(
    `SELECT COUNT(*)::int AS denom, COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)::int AS num FROM coa_applications`)).rows[0];
  return { denom: r.denom, pct: r.denom ? Math.round((1000 * r.num) / r.denom) / 10 : null, fail: COA_COVERAGE_FAIL };
}

async function main(pool) {
  const target = validateTarget(process.env.ENRICH_TARGET);
  const cfg = CFG[target];

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    let result;
    await pipeline.withTransaction(pool, async (client) => {
      await assertWf2Ran(client);
      await assertRavinesEnriched(client); // §8e DEC-D
      await assertHeritageColumns(client, target); // §8e L24 — clear message if mig 171/172 unapplied
      await assertHeritageEnriched(client); // §8e DEC-F
      await assertCentrelineColumns(client, target); // §8e L24a — mig 174/176 applied?
      await assertCentrelineEnriched(client); // §8e L24b recency + L24c coverage
      await assertMaxBuildColumns(client, target); // §8e (Spec 65) — mig 185/186 applied?
      await assertExistingStructureColumns(client, target); // §8e (Spec 65 Phase 1 + WF3-A flag) — mig 187/188 + 193/194 applied?
      await assertScenarioColumns(client, target); // §8e (Spec 65 Phase 2 + WF3-A cur-GFA range) — mig 189/190 + 193/194 applied?
      await assertLinkTable(client, target); // §8e DEC-D2 — link table + join cols present?
      const runAt = await pipeline.getDbTimestamp(client);
      result = await enrichLeads(client, { target, scopeWhere: 'TRUE', runAt });
    });

    const g = await coverageGate(pool, target);
    const nr = await nullRates(pool, cfg.table);
    const prefix = target === 'permits' ? 'permits' : 'coa';
    const auditRows = [];
    // F-H12 hard gate (DEC-5) — NULLIF-guarded.
    if (g.pct === null) {
      // zero denominator (empty construction set / empty CoA) — correctly-named per mode.
      const zeroMetric = target === 'permits' ? 'permits_construction_count_zero' : 'coa_row_count_zero';
      auditRows.push({ metric: zeroMetric, value: true, status: 'INFO' });
      auditRows.push({ metric: `${prefix}_zoning_class_coverage_pct`, value: null, status: 'INFO' });
    } else {
      auditRows.push({
        metric: `${prefix}_zoning_class_coverage_pct`, value: g.pct,
        status: g.pct >= g.fail + 3 ? 'PASS' : g.pct >= g.fail ? 'WARN' : 'FAIL',
      });
    }
    auditRows.push({ metric: `${prefix}_enriched_count`, value: result.updated, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_no_parcel_link_count`, value: result.gaps, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_unlink_cleared_count`, value: result.orphansCleared, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_multi_parcel_count`, value: result.multiParcel, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_heterogeneous_assembly_count`, value: result.heterogeneous, status: 'INFO' });
    // Sparse-by-design null rates (Spec 66 §3a) — INFO only.
    const np = target === 'permits' ? 'permits' : 'coa';
    auditRows.push({ metric: `${np}_bylaw_max_fsi_null_pct`, value: nr.fsi, status: 'INFO' });
    auditRows.push({ metric: `${np}_bylaw_max_coverage_pct_null_pct`, value: nr.cov, status: 'INFO' });
    auditRows.push({ metric: `${np}_bylaw_max_height_m_null_pct`, value: nr.height, status: 'INFO' });
    // §8e ravine propagation observability (INFO — the zoning F-H12 gate + verdict are untouched).
    const rv = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_in_ravine_protection_area)::int AS in_ravine,
             COUNT(*) FILTER (WHERE ravine_distance_m IS NOT NULL)::int AS with_dist
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_in_ravine_count`, value: rv.in_ravine, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_with_ravine_distance_count`, value: rv.with_dist, status: 'INFO' });
    // §8e heritage propagation observability (Spec 61 — INFO; zoning F-H12 gate + verdict untouched).
    const hr = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_heritage_designated)::int                          AS designated,
             COUNT(*) FILTER (WHERE heritage_designation_type = 'part_iv_individual')::int AS part_iv,
             COUNT(*) FILTER (WHERE heritage_designation_type = 'part_v_hcd')::int         AS part_v
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_heritage_designated_count`, value: hr.designated, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_part_iv_count`, value: hr.part_iv, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_part_v_hcd_count`, value: hr.part_v, status: 'INFO' });
    // §8e centreline propagation observability (Spec 62 — INFO; zoning F-H12 gate + verdict untouched).
    const cl = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_corner_lot)::int                            AS corner,
             COUNT(*) FILTER (WHERE is_through_lot)::int                           AS through_lot,
             COUNT(*) FILTER (WHERE abuts_laneway)::int                            AS abuts_laneway,
             COUNT(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)::int AS frontage
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_corner_lot_count`, value: cl.corner, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_through_lot_count`, value: cl.through_lot, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_abuts_laneway_count`, value: cl.abuts_laneway, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_with_frontage_name_count`, value: cl.frontage, status: 'INFO' });
    // §8e max-build propagation observability (Spec 65 — INFO; zoning F-H12 gate + verdict untouched).
    // Per-output populated counts + confidence distribution keep the footprint/GFA gap visible.
    const me = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE lot_size_confidence IS NOT NULL)::int        AS with_lot_conf,
             COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)::int AS with_footprint,
             COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)::int       AS with_gfa,
             COUNT(*) FILTER (WHERE max_build_confidence = 'high')::int           AS mb_high,
             COUNT(*) FILTER (WHERE max_build_confidence = 'medium')::int         AS mb_medium,
             COUNT(*) FILTER (WHERE max_build_confidence = 'low')::int            AS mb_low,
             COUNT(*) FILTER (WHERE garden_suite_fits)::int                       AS suite_fits,
             COUNT(*) FILTER (WHERE envelope_constrained)::int                    AS constrained
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_with_lot_confidence_count`, value: me.with_lot_conf, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_max_buildable_footprint_count`, value: me.with_footprint, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_max_buildable_gfa_count`, value: me.with_gfa, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_max_build_confidence_high_count`, value: me.mb_high, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_max_build_confidence_medium_count`, value: me.mb_medium, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_max_build_confidence_low_count`, value: me.mb_low, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_garden_suite_fits_count`, value: me.suite_fits, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_envelope_constrained_count`, value: me.constrained, status: 'INFO' });
    // §8e existing-structure propagation observability (Spec 65 Phase 1 — INFO; never gates verdict).
    const ex = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE existing_footprint_sqm IS NOT NULL)::int          AS with_footprint,
             COUNT(*) FILTER (WHERE existing_gfa_sqm IS NOT NULL)::int                AS with_gfa,
             COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')::int      AS conf_high,
             COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')::int       AS conf_low,
             COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)::int         AS with_greenspace,
             COUNT(*) FILTER (WHERE existing_data_quality_flag = '${mb.MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT}')::int AS mislinked
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_existing_footprint_count`, value: ex.with_footprint, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_existing_gfa_count`, value: ex.with_gfa, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_existing_structure_confidence_high_count`, value: ex.conf_high, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_existing_structure_confidence_low_count`, value: ex.conf_low, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_existing_greenspace_count`, value: ex.with_greenspace, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_existing_mislinked_footprint_count`, value: ex.mislinked, status: 'INFO' });
    // §8e scenario GFA + cur-GFA-range propagation observability (Spec 65 Phase 2 + WF3-A — INFO).
    const sc = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)::int AS with_coa,
             COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)::int        AS with_floor,
             COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)::int   AS with_pot2,
             COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)::int   AS with_pot3,
             COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)::int      AS with_range,
             COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)::int   AS with_kitchen,
             COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)::int      AS with_bath
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_max_newbuild_coa_gfa_count`, value: sc.with_coa, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_cur_floor_gfa_count`, value: sc.with_floor, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_cur_pot_2story_gfa_count`, value: sc.with_pot2, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_cur_pot_3story_gfa_count`, value: sc.with_pot3, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_cur_gfa_range_basis_count`, value: sc.with_range, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_cur_est_kitchen_gfa_count`, value: sc.with_kitchen, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_cur_est_bath_gfa_count`, value: sc.with_bath, status: 'INFO' });
    // §8e accessory-fit propagation observability (Spec 65 Phase 3 — INFO; permission distribution).
    const acc = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)::int        AS garage_fits,
             COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')::int     AS garage_aor,
             COUNT(*) FILTER (WHERE garage_permission = 'coa_required')::int    AS garage_coa,
             COUNT(*) FILTER (WHERE rear_suite_type = 'laneway')::int           AS suite_laneway,
             COUNT(*) FILTER (WHERE rear_suite_type = 'garden')::int            AS suite_garden,
             COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')::int  AS suite_aor,
             COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')::int AS suite_coa
      FROM ${cfg.table}`)).rows[0];
    auditRows.push({ metric: `${prefix}_garage_fits_count`, value: acc.garage_fits, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_garage_permission_as_of_right_count`, value: acc.garage_aor, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_garage_permission_coa_required_count`, value: acc.garage_coa, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_rear_suite_laneway_count`, value: acc.suite_laneway, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_rear_suite_garden_count`, value: acc.suite_garden, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_rear_suite_permission_as_of_right_count`, value: acc.suite_aor, status: 'INFO' });
    auditRows.push({ metric: `${prefix}_rear_suite_permission_coa_required_count`, value: acc.suite_coa, status: 'INFO' });
    // L5 disagreement protocol (permits only, §11.3): geometry stays authoritative; flag for
    // operator triage. INFO at count 0 (RNFP/Heritage currently 0 rows) — WARN ONLY on a real
    // disagreement, so a clean run never collapses PASS (Spec 48 §3.6).
    if (target === 'permits') {
      const dis = (await pool.query(
        `SELECT COUNT(*)::int AS n FROM permits WHERE permit_type = 'RNFP' AND is_in_ravine_protection_area = false`)).rows[0].n;
      auditRows.push({ metric: 'permit_type_geometry_disagreement', value: dis, status: dis > 0 ? 'WARN' : 'INFO' });
      const hdis = (await pool.query(
        `SELECT COUNT(*)::int AS n FROM permits WHERE permit_type = 'Heritage' AND is_heritage_designated = false`)).rows[0].n;
      auditRows.push({ metric: 'permit_type_heritage_disagreement', value: hdis, status: hdis > 0 ? 'WARN' : 'INFO' });
    }
    const stepDur = target === 'permits' ? 'enrich_permits_duration_ms' : 'enrich_coa_zoning_duration_ms';
    auditRows.push({ metric: stepDur, value: Date.now() - t0, status: 'INFO' });

    pipeline.emitSummary({
      records_total: null, records_new: null, records_updated: result.updated,
      records_meta: {
        audit_table: {
          phase: ADVISORY_LOCK_ID,
          name: target === 'permits' ? 'Permit zoning enrichment' : 'CoA zoning enrichment',
          verdict: verdictCascade(auditRows), rows: auditRows,
        },
      },
    });

    const readsCommon = {
      parcels: ['id', 'zoning_class', 'bylaw_max_coverage_pct', 'bylaw_max_fsi', 'bylaw_max_height_m', 'exception_number', 'zoning_overlays', 'lot_size_sqm', 'zoning_enriched_at', 'is_in_ravine_protection_area', 'ravine_distance_m', 'is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'is_corner_lot', 'is_through_lot', 'abuts_laneway', 'primary_frontage_street_name', 'centreline_dataset_version_when_enriched',
        // §8e max-build feed (Spec 65) — lot INPUTS + envelope OUTPUTS read off the dominant parcel.
        'frontage_m', 'depth_m', 'lot_size_confidence', 'lot_size_basis', ...mb.LOT_MAXBUILD_OUTPUT_COLS,
        // §8e existing-structure feed (Spec 65 Phase 1) — read off the dominant parcel.
        ...mb.EXISTING_COLS,
        // §8e scenario GFA feed (Spec 65 Phase 2) — read off the dominant parcel.
        ...mb.SCENARIO_COLS],
    };
    const reads = target === 'permits'
      ? { permits: ['permit_num', 'revision_num', 'permit_type'], permit_parcels: ['permit_num', 'revision_num', 'parcel_id', 'confidence'], permit_type_classifications: ['permit_type', 'class'], ...readsCommon }
      : { coa_applications: ['id', 'lead_id'], lead_parcels: ['lead_id', 'parcel_id', 'confidence'], ...readsCommon };
    pipeline.emitMeta(reads, { [cfg.table]: [...allWriteCols(target), 'zoning_enriched_at'] });

    pipeline.log.info(TAG, `[${target}] enriched ${result.updated} (coverage ${g.pct}%, gaps ${result.gaps}, multi ${result.multiParcel})`);
    return { ok: true };
  });

  if (!lockResult.acquired) return; // §R12 — SKIP emitted
}

if (require.main === module) {
  pipeline.run('enrich-permits', main);
}

module.exports = {
  ADVISORY_LOCK_ID, TARGETS, PERMITS_COVERAGE_FAIL, COA_COVERAGE_FAIL, RAVINE_COLS, HERITAGE_COLS, CENTRELINE_COLS, MAXBUILD_COLS, EXISTING_STRUCTURE_COLS, SCENARIO_COLS,
  validateTarget, allWriteCols, assertWf2Ran, assertRavinesEnriched, assertHeritageEnriched,
  assertHeritageColumns, assertCentrelineColumns, assertCentrelineEnriched, assertLinkTable, assertMaxBuildColumns, assertExistingStructureColumns, assertScenarioColumns,
  buildEnrichmentSql, buildUpdateSql, buildNullifyOrphansSql, enrichLeads,
  coverageGate, verdictCascade,
};
