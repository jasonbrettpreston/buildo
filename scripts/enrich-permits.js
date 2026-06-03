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
  return [...SCALARS, ...c.jsonbCols, 'zoning_parcel_count', 'zoning_dominant_parcel_id', 'zoning_dominant_parcel_method', ...RAVINE_COLS];
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
  // Zoning cols (nullable) → NULL on un-link. The §8e ravine cols are EXCLUDED here: the
  // boolean is NOT NULL (can't be NULLed), so reset it to false (= "not determined in
  // ravine") + ravine_distance_m to NULL (= "no parcel link", §11.2) — appended below.
  const set = [
    ...allWriteCols(target).filter((col) => !RAVINE_COLS.includes(col)).map((col) => `${col} = NULL`),
    'is_in_ravine_protection_area = false',
    'ravine_distance_m = NULL',
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
    // L5 disagreement protocol (permits only, §11.3): geometry stays authoritative; flag for
    // operator triage. INFO at count 0 (RNFP currently 0 rows) — WARN ONLY on a real disagreement,
    // so a clean run never collapses PASS (Spec 48 §3.6).
    if (target === 'permits') {
      const dis = (await pool.query(
        `SELECT COUNT(*)::int AS n FROM permits WHERE permit_type = 'RNFP' AND is_in_ravine_protection_area = false`)).rows[0].n;
      auditRows.push({ metric: 'permit_type_geometry_disagreement', value: dis, status: dis > 0 ? 'WARN' : 'INFO' });
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
      parcels: ['id', 'zoning_class', 'bylaw_max_coverage_pct', 'bylaw_max_fsi', 'bylaw_max_height_m', 'exception_number', 'zoning_overlays', 'lot_size_sqm', 'zoning_enriched_at', 'is_in_ravine_protection_area', 'ravine_distance_m'],
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
  ADVISORY_LOCK_ID, TARGETS, PERMITS_COVERAGE_FAIL, COA_COVERAGE_FAIL, RAVINE_COLS,
  validateTarget, allWriteCols, assertWf2Ran, assertRavinesEnriched, buildEnrichmentSql,
  buildUpdateSql, buildNullifyOrphansSql, enrichLeads, coverageGate, verdictCascade,
};
