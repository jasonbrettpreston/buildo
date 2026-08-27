/**
 * Descriptor validation — the LOADER PROPERTY of `pipeline.step()`.
 *
 * Spec 122 §4.2: "pipeline.step() runs before compute does, so it AJV-validates
 * the descriptor against the canonical schema and throws." That is strictly
 * stronger than a build-time loader, which cannot fire on a hotfix that skipped
 * CI — so validation happens at CONSTRUCTION, not at run, and it opens no pool
 * (claim #86).
 *
 * The canonical vocabulary is the SCHEMA, not prose (operator ruling R2).
 *
 * ⚠️ AJV CONFIGURATION IS LOAD-BEARING, not incidental:
 *   - `ajv@8` is a REAL dependency (S2). Before this it resolved transitively to
 *     ajv 6 via eslint — a compiler nobody declared and nobody pinned.
 *   - `strict: true` (the ajv 8 default) is KEPT, so a typo'd real keyword
 *     (`requred`) is a compile error rather than a rule that silently never
 *     fires — the Spec 121 §12b.6 "green because it never looked" class.
 *   - the schema's own `x-*` annotation keywords are registered explicitly,
 *     enumerated FROM the schema, so strict mode survives. A blanket
 *     `strict: false` would have bought the same compile at the cost of the
 *     typo detection above.
 *   - `strictTypes: false` only silences the `if/then` type-inference chatter
 *     from the archetype profiles; it does not weaken any assertion.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.2, §7.1
 */
'use strict';

const path = require('path');
const Ajv = require('ajv');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'steps', '_schema', 'step.schema.json');
const GRANDFATHERED_PATH = path.join(__dirname, '..', '..', 'steps', '_schema', 'grandfathered.json');

/** The descriptor path `x-banned-for-new` names for the guard axis. */
const GUARD_PATH = 'outputs.writes[].write_discipline.guard';
/** `columns[].source` value marking a column bound to the run clock (Spec 47 §R3.5). */
const RUN_CLOCK_SOURCE = 'run_at';
/** `guard_columns` shorthand the generator expands to every step-written non-key column. */
const ALL_DECLARED = 'all_declared';

/** Walk a schema and collect every `x-`-prefixed annotation keyword it uses. */
function collectExtensionKeywords(node, into = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectExtensionKeywords(item, into);
    return into;
  }
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (key.startsWith('x-')) into.add(key);
      collectExtensionKeywords(node[key], into);
    }
  }
  return into;
}

/**
 * Compile the step schema (or any schema shaped like it) under the house AJV
 * configuration. Exported so the schema's own tier-0 test and the library use
 * ONE compiler — two compilers with different options is two contracts.
 *
 * @param {object} [schema] - defaults to the canonical step schema
 * @returns {import('ajv').ValidateFunction}
 */
function compileStepSchema(schema) {
  const target = schema || loadSchema();
  const ajv = new Ajv({ allErrors: true, strictTypes: false });
  for (const keyword of collectExtensionKeywords(target)) {
    ajv.addKeyword({ keyword, valid: true });
  }
  return ajv.compile(target);
}

/** The canonical schema object. */
function loadSchema() {
  return require(SCHEMA_PATH);
}

let _validate = null;
/** Lazily compiled singleton — compiling is ~30ms and every step pays it once. */
function stepValidator() {
  if (!_validate) _validate = compileStepSchema(loadSchema());
  return _validate;
}

/** One AJV error rendered as `path: keyword message` — path first, because that is what a human greps. */
function formatError(err) {
  const at = err.instancePath || '(root)';
  const extra = err.params && Object.keys(err.params).length > 0 ? ` ${JSON.stringify(err.params)}` : '';
  return `  ${at}: ${err.message}${extra}`;
}

/** The committed `x-banned-for-new` allowlist. */
function loadGrandfathered() {
  return require(GRANDFATHERED_PATH);
}

/** Every write target's declared step-written column names, in declaration order. */
function stepWrittenColumns(writeSpec) {
  return (writeSpec.columns || [])
    .filter((c) => (c.written || 'step') === 'step')
    .map((c) => c.name);
}

/** The guard set as the GENERATOR will resolve it — `all_declared` expanded, exactly as write.js does. */
function effectiveGuardColumns(writeSpec) {
  const declared = writeSpec.write_discipline && writeSpec.write_discipline.guard_columns;
  if (declared !== ALL_DECLARED) return Array.isArray(declared) ? declared : [];
  const keys = new Set(Array.isArray(writeSpec.key) ? writeSpec.key : [writeSpec.key]);
  return stepWrittenColumns(writeSpec).filter((c) => !keys.has(c));
}

/**
 * LG-9 / D-5 — A RUN-CLOCK COLUMN MAY NOT BE A CHANGE GUARD.
 *
 * THE MEASURED DEFECT THIS CLOSES. `write.js resolveGuardColumns` expands
 * `guard_columns: "all_declared"` to every step-written column except the key. On
 * `parcel_buildings` that set INCLUDES `linked_at`, whose value is `RUN_AT` — so
 * `parcel_buildings.linked_at IS DISTINCT FROM EXCLUDED.linked_at` is TRUE on every
 * run, every row updates every run, and `enrich-parcels.js buildMassingScopeWhere`
 * (which re-scopes on `pb.linked_at > p.massing_enriched_at`) goes from 1,395 parcels
 * to 485,135. One descriptor word, 520,492 rewritten rows and a ~46-53 min downstream
 * re-enrichment, with every check still green: the write really did happen, the guard
 * really did fire, and nothing in the audit table says the run was pointless.
 *
 * AJV cannot express it — the rule cross-references `columns[].source` against
 * `write_discipline.guard_columns` in the same target and has to expand a shorthand
 * first. So it lives here, where `pipeline.step()` runs it at construction.
 *
 * The escape hatch is `guard_columns_why`, deliberately narrow: a step that genuinely
 * needs the clock in its guard may say so, and the sentence is then in the diff.
 */
function assertNoRunClockGuard(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) return;
  outputs.writes.forEach((w, i) => {
    const wd = w.write_discipline || {};
    if (wd.guard_columns_why) return;
    const clockColumns = (w.columns || []).filter((c) => c.source === RUN_CLOCK_SOURCE).map((c) => c.name);
    if (clockColumns.length === 0) return;
    const guarded = effectiveGuardColumns(w);
    const trapped = clockColumns.filter((c) => guarded.includes(c));
    if (trapped.length === 0) return;
    const how = wd.guard_columns === ALL_DECLARED
      ? `guard_columns "${ALL_DECLARED}" expands over ${trapped.join(', ')}`
      : `guard_columns names ${trapped.join(', ')} explicitly`;
    findings.push(
      `  /outputs/writes/${i}/write_discipline/guard_columns: ${how}, and ${trapped.join(', ')} `
      + `${trapped.length === 1 ? 'is' : 'are'} declared columns[].source "${RUN_CLOCK_SOURCE}" — the run clock is `
      + 'DISTINCT FROM its stored value on EVERY run, so every row of '
      + `${w.table} would rewrite every run and every downstream consumer keyed on that watermark would re-scope. `
      + 'Name the guard columns explicitly without it, or declare write_discipline.guard_columns_why (LG-9 / D-5).',
    );
  });
}

/**
 * THE `x-banned-for-new` ENFORCER (Fold B item 2).
 *
 * `x-banned-for-new` sat in the schema with NO consumer: the ban existed as prose, so a
 * new step could carry a banned value, satisfy the schema's own `*_why` requirement and
 * ship. Two things are required now, and the second one is the point — a `why` is written
 * by whoever wants the exception, an allowlist entry is a reviewed diff naming a SHA.
 */
function assertGrandfathered(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) return;
  const banned = ((loadSchema()['x-banned-for-new'] || {}).values || {})[GUARD_PATH] || [];
  if (banned.length === 0) return;
  const slug = descriptor.identity && descriptor.identity.name;
  const entry = (loadGrandfathered().steps || {})[slug];
  const allowed = entry && entry.paths && banned.includes(entry.paths[GUARD_PATH]);
  outputs.writes.forEach((w, i) => {
    const wd = w.write_discipline || {};
    if (!banned.includes(wd.guard)) return;
    if (!wd.guard_why) return; // AJV already reports the missing why at this path
    if (allowed) return;
    findings.push(
      `  /outputs/writes/${i}/write_discipline/guard: "${wd.guard}" is x-banned-for-new at `
      + `${GUARD_PATH}, and "${slug}" has no entry in scripts/steps/_schema/grandfathered.json. `
      + 'A guard_why alone does not grandfather a banned value — the allowlist entry (step, path, value, '
      + 'why, commit) is the adjudication, and it is a reviewed diff rather than something a descriptor '
      + 'can grant itself.',
    );
  });
}

/**
 * The SEMANTIC rules — everything true of a descriptor that JSON Schema cannot say
 * because it needs a cross-reference between two fields, or a shorthand expanded first.
 * Run AFTER AJV, so a structurally broken descriptor reports its shape errors rather
 * than throwing here on a field that does not exist yet.
 */
function semanticFindings(descriptor) {
  const findings = [];
  assertNoRunClockGuard(descriptor, findings);
  assertGrandfathered(descriptor, findings);
  return findings;
}

/**
 * Validate a descriptor, or THROW. Never returns a boolean — a caller that can
 * ignore the result is a caller that will.
 *
 * @param {object} descriptor
 * @returns {object} the same descriptor, for chaining
 */
function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new Error('pipeline.step: descriptor must be an object (got ' + typeof descriptor + ')');
  }
  const slug = descriptor.identity && descriptor.identity.name ? descriptor.identity.name : '(no identity.name)';
  const validate = stepValidator();
  if (!validate(descriptor)) {
    const errors = (validate.errors || []).map(formatError).join('\n');
    const err = new Error(
      `pipeline.step: descriptor for "${slug}" does not satisfy step.schema.json:\n${errors}`,
    );
    err.validationErrors = validate.errors || [];
    throw err;
  }
  const findings = semanticFindings(descriptor);
  if (findings.length > 0) {
    const err = new Error(
      `pipeline.step: descriptor for "${slug}" satisfies step.schema.json but violates a semantic rule `
      + `AJV cannot express:\n${findings.join('\n')}`,
    );
    err.semanticFindings = findings;
    throw err;
  }
  return descriptor;
}

module.exports = {
  SCHEMA_PATH,
  GRANDFATHERED_PATH,
  loadSchema,
  loadGrandfathered,
  compileStepSchema,
  collectExtensionKeywords,
  effectiveGuardColumns,
  semanticFindings,
  validateDescriptor,
};
