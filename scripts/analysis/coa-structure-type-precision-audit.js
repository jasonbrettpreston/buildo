#!/usr/bin/env node
/**
 * coa-structure-type-precision-audit — correctness audit for the CoA structure_type classifier.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D (description classifier)
 *            docs/specs/01-pipeline/83_lead_cost_model.md §3.A (structure_type vocab owner)
 *            docs/specs/01-pipeline/49_data_completeness_profiling.md (the 3 verification dimensions)
 *
 * WHY: field coverage (assert_global_coverage) proves structure_type is POPULATED; the vocab triple
 * proves it's DIVERSE (not collapsed). Neither proves it's CORRECT. This audit cross-validates the
 * description-classified `coa_applications.structure_type` against the authoritative CKAN
 * `permits.structure_type` of the LINKED permit (ground truth), and emits a confusion report for
 * human adjudication. REPEATABLE + DETERMINISTIC — re-run for drift after classifier changes.
 *
 * NOTE on the metric: raw agreement UNDERSTATES precision — many disagreements are LEGITIMATE
 * CoA≠permit differences (a laneway-suite CoA vs its parent-house permit; a pre-conversion proposal
 * vs the as-built permit). So agreement is reported at three altitudes (exact / family-collapsed /
 * new-construction-only) and the gated row uses a CATASTROPHE floor (PASS≥45 / WARN≥30) — far below
 * the legitimate-difference floor (~60% family-level) so it only fires on a real classifier collapse,
 * never on the expected semantic divergence. It is NOT a tight quality gate.
 *
 * Latest-revision join: permits PK is (permit_num, revision_num); coa.linked_permit_num carries no
 * revision, so we collapse to the latest revision per permit_num (DISTINCT ON … ORDER BY revision_num DESC)
 * before comparing — a bare permit_num join would fan out and double-count multi-revision permits.
 *
 * Usage: node -r dotenv/config scripts/analysis/coa-structure-type-precision-audit.js
 *   Standalone run prints PIPELINE_SUMMARY; run via run-chain to persist to pipeline_runs.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const pipeline = require('../lib/pipeline');

const SAMPLE_SEED = 'coa-structure-type-audit-v1'; // change to re-roll the deterministic sample
const SAMPLE_N = 400; // ~±4.9% CI at the observed agreement rate
const REPORT_PATH = path.resolve(__dirname, '../../docs/reports/coa-structure-type-precision-audit.md');

// Collapse archetypes to a "family" so unit-count / sub-type variants (which CoA proposal vs as-built
// permit legitimately differ on) don't read as errors. Order matters: Semi before Detached.
function fam(st) {
  if (!st) return st;
  if (/Semi/i.test(st)) return 'SEMI';
  if (/Detached/.test(st)) return 'DETACHED';       // SFD / 2 Unit / 3+ Unit - Detached
  if (/Townhouse|Stacked/i.test(st)) return 'TOWNHOUSE';
  if (/Apartment|Multiple Unit/i.test(st)) return 'APARTMENT';
  return st; // Office / Retail / Industrial / institutional / Mixed → themselves
}

function pct(n, d) {
  return d > 0 ? (100 * n) / d : 0;
}

pipeline.run('coa-structure-type-precision-audit', async (pool) => {
  const t0 = Date.now();

  // Latest-revision permit per permit_num, then join CoA → its linked permit. Both structure_type
  // populated. Grouped to (coa_st, permit_st, project_type) for compact corpus-wide aggregation.
  const grouped = await pool.query(
    `WITH latest_permits AS (
       SELECT DISTINCT ON (permit_num) permit_num, structure_type
         FROM permits
        WHERE structure_type IS NOT NULL
        ORDER BY permit_num, revision_num DESC
     )
     SELECT ca.structure_type AS coa_st, lp.structure_type AS permit_st,
            ca.project_type AS project_type, COUNT(*)::int AS n
       FROM coa_applications ca
       JOIN latest_permits lp ON lp.permit_num = ca.linked_permit_num
      WHERE ca.structure_type IS NOT NULL
      GROUP BY 1, 2, 3`,
  );

  let pairs = 0, exact = 0, family = 0, ncPairs = 0, ncExact = 0;
  const confusion = new Map(); // "coa ≠ permit" → count (disagreements only)
  for (const r of grouped.rows) {
    pairs += r.n;
    const ex = r.coa_st === r.permit_st;
    if (ex) exact += r.n; else { const k = `${r.coa_st}  ≠  ${r.permit_st}`; confusion.set(k, (confusion.get(k) || 0) + r.n); }
    if (fam(r.coa_st) === fam(r.permit_st)) family += r.n;
    if (r.project_type === 'NewConstruction') { ncPairs += r.n; if (ex) ncExact += r.n; }
  }

  const exactPct = pct(exact, pairs);
  const familyPct = pct(family, pairs);
  const ncPct = pct(ncExact, ncPairs);

  // Deterministic human-adjudication sample (seeded, reproducible across runs for the same data).
  const sample = await pool.query(
    `SELECT ca.id, LEFT(ca.description, 140) AS description, ca.structure_type AS coa_st,
            ca.project_type, lp.structure_type AS permit_st
       FROM coa_applications ca
       JOIN (
         SELECT DISTINCT ON (permit_num) permit_num, structure_type
           FROM permits WHERE structure_type IS NOT NULL
           ORDER BY permit_num, revision_num DESC
       ) lp ON lp.permit_num = ca.linked_permit_num
      WHERE ca.structure_type IS NOT NULL
      ORDER BY md5(ca.id::text || $1)
      LIMIT $2`,
    [SAMPLE_SEED, SAMPLE_N],
  );

  // ─── Confusion report (markdown) for human adjudication ───
  const topConf = [...confusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const lines = [];
  lines.push('# CoA structure_type — precision audit', '');
  lines.push(`_Repeatable correctness audit. Seed \`${SAMPLE_SEED}\`, N=${SAMPLE_N}. Generated by \`scripts/analysis/coa-structure-type-precision-audit.js\`._`, '');
  lines.push('## Corpus agreement vs linked-permit CKAN ground truth', '');
  lines.push(`- pairs (both structure_type populated): **${pairs.toLocaleString()}**`);
  lines.push(`- exact agreement: **${exactPct.toFixed(1)}%** (${exact.toLocaleString()})`);
  lines.push(`- family-level agreement (detached/semi/TH/apt collapsed): **${familyPct.toFixed(1)}%** (${family.toLocaleString()})`);
  lines.push(`- new-construction-only exact agreement: **${ncPct.toFixed(1)}%** (${ncExact.toLocaleString()}/${ncPairs.toLocaleString()})`, '');
  lines.push('> Disagreement ≠ error: a laneway-suite CoA legitimately differs from its parent-house permit; a pre-conversion proposal differs from the as-built. Family-level + new-construction altitudes filter most of that out. Human-adjudicate the sample below to estimate true precision.', '');
  lines.push('## Top disagreements (coa_classified ≠ permit_ckan)', '');
  topConf.forEach(([k, v]) => lines.push(`- ${String(v).padStart(5)}  ${k}`));
  lines.push('', '## Adjudication sample (label each: classifier correct? Y/N)', '');
  lines.push('| coa_id | classified | permit_ckan | project_type | correct? | description |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of sample.rows) {
    const d = (r.description || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|');
    lines.push(`| ${r.id} | ${r.coa_st} | ${r.permit_st} | ${r.project_type ?? ''} |  | ${d} |`);
  }
  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n', 'utf-8');

  const elapsedMs = Date.now() - t0;
  const familyStatus = familyPct >= 45 ? 'PASS' : familyPct >= 30 ? 'WARN' : 'FAIL';
  const auditRows = [
    { metric: 'pairs_evaluated', value: pairs, threshold: null, status: 'INFO' },
    // CATASTROPHE floor only — legitimate CoA≠permit differences keep family agreement ~60-69%, so
    // 45/30 fires solely on a real classifier collapse, never on expected semantic divergence.
    { metric: 'agreement_family_pct', value: familyPct.toFixed(1) + '%', threshold: 'PASS >= 45% / WARN >= 30% (catastrophe floor)', status: familyStatus },
    { metric: 'agreement_exact_pct', value: exactPct.toFixed(1) + '%', threshold: null, status: 'INFO' },
    { metric: 'agreement_newconstruction_pct', value: ncPct.toFixed(1) + '%', threshold: null, status: 'INFO' },
    { metric: 'sample_written', value: sample.rows.length, threshold: null, status: 'INFO' },
    { metric: 'sys_duration_ms', value: elapsedMs, threshold: null, status: 'INFO' },
  ];
  const verdict = auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                : auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  pipeline.log.info('[coa-structure-type-precision-audit]',
    `pairs ${pairs} | exact ${exactPct.toFixed(1)}% | family ${familyPct.toFixed(1)}% | new-construction ${ncPct.toFixed(1)}% | report → ${REPORT_PATH}`);

  pipeline.emitSummary({
    records_total: pairs,
    records_new: null,
    records_updated: null,
    records_meta: {
      duration_ms: elapsedMs,
      agreement_exact_pct: exactPct,
      agreement_family_pct: familyPct,
      agreement_newconstruction_pct: ncPct,
      sample_n: sample.rows.length,
      audit_table: { phase: 42, name: 'CoA structure_type precision audit', verdict, rows: auditRows },
    },
  });

  pipeline.emitMeta(
    { coa_applications: ['id', 'description', 'structure_type', 'project_type', 'linked_permit_num'], permits: ['permit_num', 'revision_num', 'structure_type'] },
    {},
  );
});
