'use strict';
/**
 * COMPUTE for `classify_coa_scope` (Spec 122 §5.5; phase-4 wave 4, commit ②).
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.6.D, §6.8 row 666
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2, R-BZ, R-DF, W4A-R4)
 *
 * Rule 2 — COMPUTE IS JUST COMPUTE. No pool, no clock read of its own, no transaction, no lock, no
 * config loader, no verdict. The runner (`runEnrichPhase`) owns the cursor (`ctx.stream`), the per-batch
 * short transaction (`ctx.flushBatch`), the run clock (`ctx.clock`) and the audit verdict.
 *
 * ONE PHASE (`classify`, `txn:"post_commit"` — the compute_parcel_cost_estimates form, wave-4 plan
 * §B.2.4): stream the pending CoAs, classify each with the shipped classifier
 * (`scripts/lib/coa-scope-classifier.js`, unchanged; Spec 84 §7 dual path with the TS twin), and flush
 * each batch as one explicit-VALUES UPDATE, the legacy statement (`classify-coa-scope.js:133-144`).
 *
 * THE PENDING SET (W4A-R4 (a), the §6.3 watermark pin): a CoA is pending when it was never classified or
 * the coa root touched it after its last classification (`scope_classified_at < last_seen_at`). The coa
 * root moves `last_seen_at` for every fed key, so every CoA in each feed is re-classified (parity; R-DZ
 * keeps that touch). `scope_classified_at` is the run clock (W4A-R4 (b)) and advances on every
 * classified row, all-NULL outputs included, or the row would be re-fetched forever (`b3373342`).
 */

const { classifyCoaScope } = require('../coa-scope-classifier');

const TAG = '[classify_coa_scope]';

/** The project_type vocabulary of the shipped classifier (`(null)` = no project keyword fired). */
const PROJECT_TYPES = ['NewConstruction', 'Addition', 'Alteration', 'Demolition', 'Severance', 'Mixed', '(null)'];
/** The coa_type_class vocabulary of the shipped classifier (`(null)` = no use-class keyword fired). */
const COA_TYPE_CLASSES = ['residential', 'commercial', 'institutional', 'mixed', '(null)'];

/** The pending cursor, byte-identical to the legacy source SELECT (`classify-coa-scope.js:165-174`). */
function buildSourceSql() {
  return `SELECT id, description, status, decision
         FROM coa_applications
        WHERE description IS NOT NULL
          AND description <> ''
          AND (scope_classified_at IS NULL OR scope_classified_at < last_seen_at)
        ORDER BY id ASC`;
}

/**
 * One batch's UPDATE: the legacy VALUES statement (`classify-coa-scope.js:133-144`), unguarded as legacy
 * (outputs.writes[0].write_discipline.guard "none", the Spec 124 Rule 9 / V7 grandfathered form, Q-CE2 /
 * Q-W4G-1 precedent): every streamed row is written and its watermark advances, all-NULL outputs included.
 * The narrowing is the pending cursor (buildSourceSql), never a value guard.
 *
 * @param {Array<{id:number, coa_type_class:string|null, project_type:string|null, scope_tags:string[]|null, structure_type:string|null}>} batch
 * @param {Date} runAt the runner's run clock
 * @returns {{sql: string, params: unknown[]}}
 */
function buildFlushSql(batch, runAt) {
  const valuesParts = [];
  const params = [];
  let p = 1;
  for (const row of batch) {
    valuesParts.push(`($${p++}::bigint, $${p++}::text, $${p++}::text, $${p++}::text[], $${p++}::text)`);
    params.push(row.id, row.coa_type_class, row.project_type, row.scope_tags, row.structure_type);
  }
  const runAtParam = p;
  params.push(runAt);
  const sql = `UPDATE coa_applications ca
              SET coa_type_class      = v.coa_type_class,
                  project_type        = v.project_type,
                  scope_tags          = v.scope_tags,
                  structure_type      = v.structure_type,
                  scope_classified_at = $${runAtParam}::timestamptz,
                  scope_source        = 'description'
             FROM (VALUES ${valuesParts.join(', ')}) AS v(id, coa_type_class, project_type, scope_tags, structure_type)
            WHERE ca.id = v.id`;
  return { sql, params };
}

/** Distribution keys: the classifier value, or `(null)` (the legacy audit-row key, `:189-192`). */
function distKey(value) {
  return value ?? '(null)';
}

/**
 * The `classify` pass. `ctx.stream` / `ctx.flushBatch` are the runner seams (Spec 122 §5.5); the batch
 * size is the declared `classify_coa_scope_batch_size` (the legacy batch cap, CCS-D3).
 */
async function runClassifyPass(client, ctx) {
  const batchSize = Number(ctx.config.classify_coa_scope_batch_size);
  const runAt = ctx.clock.now();
  const counts = {
    processed: 0,
    scopeClassified: 0,
    unmappedScope: 0,
    noClass: 0,
    noProjectType: 0,
    structureTyped: 0,
    updated: 0,
  };
  const projectTypeDist = Object.fromEntries(PROJECT_TYPES.map((k) => [k, 0]));
  const coaTypeClassDist = Object.fromEntries(COA_TYPE_CLASSES.map((k) => [k, 0]));
  let batch = [];

  async function flush() {
    if (batch.length === 0) return;
    const { sql, params } = buildFlushSql(batch, runAt);
    const result = await ctx.flushBatch(sql, params);
    counts.updated += result.rowCount ?? 0;
    batch = [];
    if (typeof ctx.onProgress === 'function') ctx.onProgress(counts.processed);
  }

  for await (const row of ctx.stream(buildSourceSql(), [], { batchSize })) {
    counts.processed++;
    const out = classifyCoaScope({ description: row.description, status: row.status, decision: row.decision });
    if (out.scope_tags === null) counts.unmappedScope++;
    else counts.scopeClassified++;
    if (out.coa_type_class === null) counts.noClass++;
    if (out.project_type === null) counts.noProjectType++;
    if (out.structure_type !== null) counts.structureTyped++;
    const pt = distKey(out.project_type);
    const ct = distKey(out.coa_type_class);
    // A value outside the declared vocabulary is a classifier change this module must learn about, not
    // a row to bucket silently: the Σ-identity below would otherwise still hold.
    if (!(pt in projectTypeDist)) throw new Error(`${TAG} classifier returned project_type ${JSON.stringify(out.project_type)}, outside PROJECT_TYPES`);
    if (!(ct in coaTypeClassDist)) throw new Error(`${TAG} classifier returned coa_type_class ${JSON.stringify(out.coa_type_class)}, outside COA_TYPE_CLASSES`);
    projectTypeDist[pt]++;
    coaTypeClassDist[ct]++;
    batch.push({ id: row.id, coa_type_class: out.coa_type_class, project_type: out.project_type, scope_tags: out.scope_tags, structure_type: out.structure_type });
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  return {
    scanned: counts.processed,
    updated: counts.updated,
    counts,
    projectTypeDist,
    coaTypeClassDist,
  };
}

/** Percent with one decimal place's worth of precision kept raw (the bound compares the unrounded value, as legacy did). */
function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** The legacy row rendering: one decimal place and a percent sign (`classify-coa-scope.js:226-233`). */
function pctText(v) {
  return v.toFixed(1) + '%';
}

/**
 * STEP-LEVEL POST PHASE — `execution.enrich_hooks.post_phase`, called once by the runner after the phase.
 * No read: every value is this run's own counters (the legacy step read nothing after its loop either).
 */
function computePostPhase(_pool, { passRaw }) {
  const pass = passRaw.classify || {};
  const c = pass.counts || { processed: 0, scopeClassified: 0, unmappedScope: 0, noClass: 0, noProjectType: 0, structureTyped: 0, updated: 0 };
  const projectTypeDist = pass.projectTypeDist || Object.fromEntries(PROJECT_TYPES.map((k) => [k, 0]));
  const coaTypeClassDist = pass.coaTypeClassDist || Object.fromEntries(COA_TYPE_CLASSES.map((k) => [k, 0]));
  const sum = (o) => Object.values(o).reduce((n, v) => n + v, 0);
  if (sum(projectTypeDist) !== c.processed || sum(coaTypeClassDist) !== c.processed) {
    throw new Error(`${TAG} distribution Σ-identity broke: project_type ${sum(projectTypeDist)}, coa_type_class ${sum(coaTypeClassDist)}, processed ${c.processed}`);
  }
  const unmappedPct = pct(c.unmappedScope, c.processed);
  const flat = {};
  for (const k of PROJECT_TYPES) flat[`project_type_${k === '(null)' ? 'null' : k.toLowerCase()}_count`] = projectTypeDist[k];
  for (const k of COA_TYPE_CLASSES) flat[`coa_type_class_${k === '(null)' ? 'null' : k}_count`] = coaTypeClassDist[k];
  return {
    matched: {
      coa_processed: c.processed,
      scope_classified: c.scopeClassified,
      unmapped_scope: c.unmappedScope,
      no_class: c.noClass,
      no_project_type: c.noProjectType,
      structure_typed: c.structureTyped,
      records_updated: c.updated,
      unmapped_scope_pct: unmappedPct,
      scope_classified_pct: pct(c.scopeClassified, c.processed),
      coa_type_class_null_pct: pct(c.noClass, c.processed),
      structure_type_classified_pct: pct(c.structureTyped, c.processed),
      project_type_distribution: projectTypeDist,
      coa_type_class_distribution: coaTypeClassDist,
      ...flat,
    },
    compute: {
      coa_processed: c.processed,
      records_new_aggregate: 0,
      records_updated_aggregate: c.updated,
    },
  };
}

// ===========================================================================
// Checks — one function per declared check (Spec 122 §5.5 (1)); each reads ctx.matched and reports.
// None judges: the library compares against the declared bound.
// ===========================================================================

function coa_processed(ctx) {
  ctx.report('coa_processed', { violations: 0, detail: ctx.matched.coa_processed });
}
function scope_classified(ctx) {
  ctx.report('scope_classified', { violations: 0, detail: ctx.matched.scope_classified });
}
// The one declared decision (CCS-D6): unmapped share of this run's processed CoAs, inclusive bound.
function unmapped_scope_pct(ctx) {
  ctx.report('unmapped_scope_pct', { value: ctx.matched.unmapped_scope_pct, detail: pctText(ctx.matched.unmapped_scope_pct) });
}
function scope_classified_pct(ctx) {
  ctx.report('scope_classified_pct', { violations: 0, detail: pctText(ctx.matched.scope_classified_pct) });
}
function no_class(ctx) {
  ctx.report('no_class', { violations: 0, detail: ctx.matched.no_class });
}
function coa_type_class_null_pct(ctx) {
  ctx.report('coa_type_class_null_pct', { violations: 0, detail: pctText(ctx.matched.coa_type_class_null_pct) });
}
function no_project_type(ctx) {
  ctx.report('no_project_type', { violations: 0, detail: ctx.matched.no_project_type });
}
function structure_type_classified_pct(ctx) {
  ctx.report('structure_type_classified_pct', { violations: 0, detail: pctText(ctx.matched.structure_type_classified_pct) });
}
// The legacy rows carried only the keys that occurred (`classify-coa-scope.js:189-192`); zero buckets are left out
// of the row the same way. The full fixed-key counts are the flat emits (project_type_<k>_count, coa_type_class_<k>_count).
function nonZero(dist) {
  return Object.fromEntries(Object.entries(dist || {}).filter(([, n]) => n > 0));
}
function project_type_distribution(ctx) {
  ctx.report('project_type_distribution', { violations: 0, detail: nonZero(ctx.matched.project_type_distribution) });
}
function coa_type_class_distribution(ctx) {
  ctx.report('coa_type_class_distribution', { violations: 0, detail: nonZero(ctx.matched.coa_type_class_distribution) });
}

const CHECKS = {
  coa_processed,
  scope_classified,
  unmapped_scope_pct,
  scope_classified_pct,
  no_class,
  coa_type_class_null_pct,
  no_project_type,
  structure_type_classified_pct,
  project_type_distribution,
  coa_type_class_distribution,
};

function buildMeta(ctx) {
  const m = ctx.matched || {};
  const meta = {
    duration_ms: ctx.elapsed_ms,
    coa_processed: m.coa_processed,
    scope_classified: m.scope_classified,
    unmapped_scope: m.unmapped_scope,
    no_class: m.no_class,
    no_project_type: m.no_project_type,
    structure_typed: m.structure_typed,
  };
  for (const k of Object.keys(m)) {
    if (/^(project_type|coa_type_class)_[a-z]+_count$/.test(k)) meta[k] = m[k];
  }
  return meta;
}

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
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildMeta(ctx) };
}

const passes = [
  { name: 'classify', txn: 'post_commit', run: runClassifyPass },
];

module.exports = Object.assign(compute, {
  checks: CHECKS,
  buildSourceSql,
  buildFlushSql,
  runClassifyPass,
  computePostPhase,
  buildMeta,
  passes,
  PROJECT_TYPES,
  COA_TYPE_CLASSES,
});
