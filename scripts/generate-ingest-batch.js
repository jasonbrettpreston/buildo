#!/usr/bin/env node
'use strict';
/**
 * #37 generator (Spec 122 Phase 3 #37 `execution.batch`, FLEET-2 B-3; MQ-B1 (a), registry-truth
 * plan fold 19, operator 2026-10-04 — PASS as written):
 *
 *   For an INGESTOR (scripts/lib/step/index.js isIngestStep) the effective write stride is
 *   pipeline.maxRowsPerInsert(plan.columnsPerRow) PER write target (scripts/lib/step/write.js
 *   executeWrite); no ingest runner reads execution.batch. So the declared value is GENERATED:
 *     - one write target   → execution.batch = maxRowsPerInsert(buildWritePlan(target).columnsPerRow)
 *     - several targets    → execution.batch = "none" (one number cannot state per-target strides;
 *                            the why rides the pending execution.batch why field, MQ-B1 (a))
 *     - the step's own compute reads execution.batch (massing) → skipped: the value is a real
 *       input there ("stays G"), never overwritten by this generator.
 *   Non-ingest steps are out of scope (enrich / cost are gated == their tunable default).
 *
 *   node scripts/generate-ingest-batch.js --check   (drift lock; exitCode 1 on drift)
 *   node scripts/generate-ingest-batch.js --write   (rewrite the drifted values)
 *
 * Format-preserving: only the `"batch": <value>` member of the descriptor's `execution`
 * object changes.
 */
const fs = require('fs');
const path = require('path');
const { isIngestStep } = require('./lib/step/index.js');
const { buildWritePlan } = require('./lib/step/write.js');
const { maxRowsPerInsert } = require('./lib/pipeline.js');

const ROOT = path.join(__dirname, '..');
const DESCRIPTOR_DIRS = ['scripts', 'scripts/quality'];

/** True when the step's own compute module reads execution.batch (its value is an input, not a label). */
function computeReadsBatch(rel) {
  const computeRel = path.join('scripts', 'lib', 'compute', path.basename(rel).replace(/\.descriptor\.json$/, '.js'));
  const abs = path.join(ROOT, computeRel);
  return fs.existsSync(abs) && /execution\.batch\b/.test(fs.readFileSync(abs, 'utf8'));
}

/** The generated execution.batch for an ingestor descriptor, or null when out of scope. */
function expectedBatch(descriptor, rel) {
  if (!isIngestStep(descriptor)) return null;
  if (computeReadsBatch(rel)) return null;
  const writes = descriptor.outputs.writes;
  if (writes.length !== 1) return 'none';
  return maxRowsPerInsert(buildWritePlan(writes[0], descriptor).columnsPerRow);
}

/** Locate the `"batch": <value>` member of the execution object. Throws (fail loud) on ambiguity. */
function locateBatch(text, rel) {
  const anchor = '"execution"';
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + 1) >= 0) {
    throw new Error(`generate-ingest-batch: ${rel} must contain exactly one "execution" key`);
  }
  const re = /"batch"\s*:\s*("none"|\d+)/g;
  re.lastIndex = at;
  const m = re.exec(text);
  if (!m) throw new Error(`generate-ingest-batch: ${rel} has no "batch" member after "execution"`);
  const start = m.index + m[0].length - m[1].length;
  return { start, end: start + m[1].length };
}

/** Returns null when out of scope; else { rel, slug, declared, expected, drift, newText }. */
function planDescriptor(rel, text) {
  const d = JSON.parse(text);
  const expected = expectedBatch(d, rel);
  if (expected === null) return null;
  const declared = d.execution.batch;
  const drift = declared !== expected;
  let newText = text;
  if (drift) {
    const { start, end } = locateBatch(text, rel);
    newText = text.slice(0, start) + JSON.stringify(expected) + text.slice(end);
    if (JSON.parse(newText).execution.batch !== expected) {
      throw new Error(`generate-ingest-batch: ${rel} self-check failed (the located "batch" is not execution.batch)`);
    }
  }
  return { rel, slug: d.identity.name, declared, expected, drift, newText };
}

function descriptorFiles() {
  return DESCRIPTOR_DIRS.flatMap((dir) => fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.descriptor.json'))
    .sort()
    .map((f) => `${dir}/${f}`));
}

function main(argv) {
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  if (check === write) {
    console.error('usage: node scripts/generate-ingest-batch.js --check | --write');
    process.exitCode = 2;
    return;
  }
  const plans = descriptorFiles()
    .map((rel) => planDescriptor(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')))
    .filter(Boolean);
  const drifted = plans.filter((p) => p.drift);
  for (const p of drifted) {
    console.log(`${check ? 'DRIFT' : 'WROTE'} ${p.rel} (${p.slug}): execution.batch ${JSON.stringify(p.declared)} -> ${JSON.stringify(p.expected)}`);
    if (write) fs.writeFileSync(path.join(ROOT, p.rel), p.newText, 'utf8');
  }
  console.log(`generate-ingest-batch: ${plans.length} ingestor batch values, ${drifted.length} ${check ? 'drifted' : 'rewritten'}`);
  if (check && drifted.length > 0) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { expectedBatch, computeReadsBatch, locateBatch, planDescriptor };
