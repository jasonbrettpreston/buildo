#!/usr/bin/env node
/**
 * schema-baseline generator — closes GAP G-1 (Spec 124 §2 Rule 1).
 *
 * "Nothing about a step's behaviour may live only in code — it is descriptor
 * data, a declared check, a shape rule, or (last resort) a new schema field."
 * G-1's own text: "the PREFERENCE ORDER ITSELF is applied by human adjudication
 * in the Intent Ledger, not machine-checked. Nothing stops a future disposition
 * from reaching for 'new schema field' before trying 'declared check.'"
 *
 * A preference ORDER cannot be verified after the fact — there is no artifact
 * that proves someone tried rung (b) before reaching for rung (last resort).
 * What CAN be verified: that reaching for rung (last resort) was DECLARED, in
 * writing, at the moment it happened — the same "adjudication is a reviewed
 * diff, not something a descriptor grants itself" mechanism `grandfathered.json`
 * already uses for V7's banned write-discipline values (Spec 122 V7,
 * `assertGrandfathered`). This generator is that mechanism for schema fields:
 *
 *   1. `schema-baseline.json` is a committed snapshot of every `category.field`
 *      pair the schema declares TODAY (18 categories x their direct object-shape
 *      properties — the "new schema field" unit Rule 1's own text uses).
 *   2. Every field NOT in the baseline is a field added AFTER this ratchet
 *      armed, and its OWN schema node must carry `x-ruling: {rungs_tried, why}`
 *      — a sibling annotation naming which cheaper rungs were tried and why
 *      none of them fit. AJV already auto-registers every `x-`-prefixed keyword
 *      the schema uses (`validate.js collectExtensionKeywords`), so `x-ruling`
 *      needs no schema-library change — it is valid the moment a field uses it.
 *   3. `--check` (no `--write`): diff current fields against the baseline,
 *      require x-ruling on every new one, exit 1 on a violation. This is what
 *      `src/tests/step-conformance.infra.test.ts`'s G-1 lock shells out to
 *      (the "shell the generator's own --check" pattern, Spec 123 §4.5).
 *   4. `--write`: regenerate the baseline to match the CURRENT schema — the
 *      adjudicated-and-accepted new fields (their x-ruling already reviewed in
 *      the diff) become the new floor. Run this ONLY after a human has reviewed
 *      the new field's x-ruling in the PR/commit diff — exactly the same
 *      "adding an entry is the expensive path on purpose" posture
 *      `grandfathered.json`'s own header states.
 *
 * The 18-category, direct-field grain (not a full recursive walk into every
 * nested array-item shape) matches what Rule 1's own evidence table calls "a
 * new schema field": R-B's `recovery.interrupted`, R-M's `recovery.before_image`,
 * V7's `outputs.writes[].write_discipline.guard` axis-split are all top-level
 * additions under a category, never a change three levels deep inside an
 * existing array item's own shape (that is covered by the categories' existing
 * `required`/`additionalProperties:false` AJV enforcement already).
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 1, GAP G-1
 * SPEC LINK: docs/specs/01-pipeline/121_*.md §12b.6 (a checker ships a known-bad fixture)
 *
 * Usage:
 *   node scripts/steps/_schema/generate-schema-baseline.mjs --check
 *   node scripts/steps/_schema/generate-schema-baseline.mjs --write
 *   node scripts/steps/_schema/generate-schema-baseline.mjs --self-test
 */
'use strict';

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// TEST-ONLY overrides (mirrors check-step-shape.mjs's BUILDO_COMPUTE_DIR pattern) so the
// conformance suite can point --check at a known-bad fixture and prove the CLI itself
// exits 1 — not just the exported checkAgainstBaseline function in isolation.
const SCHEMA_PATH = process.env.BUILDO_SCHEMA_PATH ? path.resolve(process.env.BUILDO_SCHEMA_PATH) : path.join(HERE, 'step.schema.json');
const BASELINE_PATH = process.env.BUILDO_SCHEMA_BASELINE_PATH
  ? path.resolve(process.env.BUILDO_SCHEMA_BASELINE_PATH)
  : path.join(HERE, 'schema-baseline.json');

/** Every branch of `node` that is (or resolves to, through anyOf/oneOf) a plain object-with-properties shape. */
function objectBranches(node) {
  if (!node || typeof node !== 'object') return [];
  const branches = [];
  if (node.type === 'object' && node.properties && typeof node.properties === 'object') branches.push(node);
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(node[key])) {
      for (const sub of node[key]) branches.push(...objectBranches(sub));
    }
  }
  return branches;
}

/**
 * Every `category.field` pair the schema declares right now, plus the field's
 * own schema node (so a caller can check for `x-ruling`). A field appearing in
 * more than one object branch of the same category (rare) is recorded once,
 * keeping the FIRST node encountered.
 */
export function currentFields(schema) {
  const out = new Map(); // "category.field" -> node
  for (const [category, catNode] of Object.entries(schema.properties || {})) {
    for (const branch of objectBranches(catNode)) {
      for (const [field, fieldNode] of Object.entries(branch.properties)) {
        const key = `${category}.${field}`;
        if (!out.has(key)) out.set(key, fieldNode);
      }
    }
  }
  return out;
}

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

export function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { fields: [] };
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

/**
 * The G-1 check itself: every field NOT in the baseline must carry `x-ruling`
 * on its OWN schema node, shaped `{rungs_tried: string[], why: string}`
 * (non-empty). Returns `{ok, violations, newFields}` — never throws, so both
 * the CLI and the vitest lock can render their own message.
 */
export function checkAgainstBaseline(schema, baseline) {
  const fields = currentFields(schema);
  const known = new Set(baseline.fields || []);
  const newFields = [...fields.keys()].filter((k) => !known.has(k));
  const violations = [];
  for (const key of newFields) {
    const node = fields.get(key);
    const ruling = node && node['x-ruling'];
    const ok =
      ruling &&
      typeof ruling === 'object' &&
      Array.isArray(ruling.rungs_tried) &&
      ruling.rungs_tried.length > 0 &&
      typeof ruling.why === 'string' &&
      ruling.why.trim().length > 0;
    if (!ok) violations.push(key);
  }
  return { ok: violations.length === 0, violations, newFields };
}

function selfTest() {
  const goodSchema = {
    properties: {
      config: {
        anyOf: [
          { const: 'none' },
          { type: 'object', properties: { retired: { type: 'array' }, io_budget: { type: 'object', 'x-ruling': { rungs_tried: ['descriptor', 'check'], why: 'measured need' } } } },
        ],
      },
    },
  };
  const baseline = { fields: ['config.retired'] };
  const good = checkAgainstBaseline(goodSchema, baseline);
  if (!good.ok || good.newFields.length !== 1 || good.newFields[0] !== 'config.io_budget') {
    throw new Error(`self-test FAILED (good case): ${JSON.stringify(good)}`);
  }
  const badSchema = JSON.parse(JSON.stringify(goodSchema));
  delete badSchema.properties.config.anyOf[1].properties.io_budget['x-ruling'];
  const bad = checkAgainstBaseline(badSchema, baseline);
  if (bad.ok || bad.violations.length !== 1) {
    throw new Error(`self-test FAILED (bad case did not fire): ${JSON.stringify(bad)}`);
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  selfTest();
  if (args.has('--self-test')) {
    console.log('[generate-schema-baseline] self-test PASSED');
    return;
  }
  const schema = loadSchema();
  if (args.has('--write')) {
    const fields = [...currentFields(schema).keys()].sort();
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          $comment: [
            'THE G-1 RATCHET (Spec 124 §2 Rule 1, GAP G-1). Every category.field pair the schema',
            'declared as of the commit that wrote this file. A field NOT in this list, found in the',
            'live schema, must carry x-ruling:{rungs_tried,why} on its own node or',
            'generate-schema-baseline.mjs --check (shelled by step-conformance.infra.test.ts) fails.',
            'Regenerate with --write ONLY after a human has reviewed the new field\'s x-ruling in the',
            'same diff — adding an entry here is the expensive, reviewed path on purpose, mirroring',
            'grandfathered.json\'s own posture.',
          ],
          contract_version: 1,
          fields,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`[generate-schema-baseline] wrote ${fields.length} fields to ${path.relative(process.cwd(), BASELINE_PATH)}`);
    return;
  }
  // --check (default)
  const baseline = loadBaseline();
  const result = checkAgainstBaseline(schema, baseline);
  if (!result.ok) {
    console.error(
      `[generate-schema-baseline] G-1 VIOLATION: ${result.violations.length} new schema field(s) with no x-ruling:\n` +
        result.violations.map((v) => `  - ${v}`).join('\n') +
        `\nEach new field needs {rungs_tried:[...], why:"..."} on its own schema node (adjudicating why` +
        ' cheaper rungs — descriptor data, a declared check, a shape rule — did not fit), then run' +
        ' `node scripts/steps/_schema/generate-schema-baseline.mjs --write` to accept it into the ratchet.',
    );
    process.exit(1);
  }
  console.log(`[generate-schema-baseline] clean — ${result.newFields.length} new field(s), all carry x-ruling.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
