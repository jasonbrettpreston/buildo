#!/usr/bin/env node
/**
 * Mechanical PRE (legacy) vs POST (converted) key-set diff for
 * compute_parcel_cost_estimates — records_meta top-level keys AND
 * audit_table.rows[].metric keys. One-off script for batch2 row 2.4's O3
 * peel (output-panel finding CPCE-D4 + the broader "account for every
 * difference" instruction). Not a generic tool — the golden file paths and
 * field names are specific to this step.
 *
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md
 *
 * Usage: node scripts/analysis/compute-parcel-cost-keyset-diff.mjs [--arm=sources|standalone]
 */
'use strict';

import fs from 'fs';

const arm = (process.argv.find((a) => a.startsWith('--arm=')) || '--arm=sources').split('=')[1];

const preFile = `docs/reports/golden/compute_parcel_cost_estimates/pre/${arm}.json`;
const postFile = `docs/reports/golden/compute_parcel_cost_estimates/post/${arm}.json`;

function loadSummary(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.summary[0] || j.summary;
}

function diffSets(preSet, postSet) {
  const onlyPre = [...preSet].filter((k) => !postSet.has(k)).sort();
  const onlyPost = [...postSet].filter((k) => !preSet.has(k)).sort();
  const both = [...preSet].filter((k) => postSet.has(k)).sort();
  return { onlyPre, onlyPost, both };
}

const pre = loadSummary(preFile);
const post = loadSummary(postFile);

const preMetaKeys = new Set(Object.keys(pre.records_meta || {}));
const postMetaKeys = new Set(Object.keys(post.records_meta || {}));
const metaDiff = diffSets(preMetaKeys, postMetaKeys);

const preRowMetrics = new Set((pre.records_meta.audit_table?.rows || []).map((r) => r.metric));
const postRowMetrics = new Set((post.records_meta.audit_table?.rows || []).map((r) => r.metric));
const rowDiff = diffSets(preRowMetrics, postRowMetrics);

const report = {
  arm,
  records_meta: {
    only_in_pre_legacy: metaDiff.onlyPre,
    only_in_post_converted: metaDiff.onlyPost,
    in_both: metaDiff.both,
  },
  audit_table_rows: {
    only_in_pre_legacy: rowDiff.onlyPre,
    only_in_post_converted: rowDiff.onlyPost,
    in_both: rowDiff.both,
  },
};

console.log(JSON.stringify(report, null, 2));
