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
  const validate = stepValidator();
  if (validate(descriptor)) return descriptor;
  const slug = descriptor.identity && descriptor.identity.name ? descriptor.identity.name : '(no identity.name)';
  const errors = (validate.errors || []).map(formatError).join('\n');
  const err = new Error(
    `pipeline.step: descriptor for "${slug}" does not satisfy step.schema.json:\n${errors}`,
  );
  err.validationErrors = validate.errors || [];
  throw err;
}

module.exports = {
  SCHEMA_PATH,
  loadSchema,
  compileStepSchema,
  collectExtensionKeywords,
  validateDescriptor,
};
