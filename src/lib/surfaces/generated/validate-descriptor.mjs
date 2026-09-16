// GENERATED — DO NOT EDIT. Regenerate with `--emit-descriptors`.
// The ONE runtime validator. The SurfaceEngine, the checkers, the Supabase seeder and
// the tests all import this; nobody re-implements descriptor validation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(HERE, '../../../../scripts/surfaces/_schema/surface.schema.json');
export const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const Ajv = require_('ajv');
const ajv = new (Ajv.default || Ajv)({ strict: false, allErrors: true });
const _validate = ajv.compile(schema);

/** Validate one descriptor. Returns { valid, errors }. Throws nothing — callers decide. */
export function validateDescriptor(descriptor) {
  const valid = _validate(descriptor);
  return { valid, errors: valid ? [] : (_validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`) };
}

/** Validate, or throw with every error named. Used where a bad descriptor must refuse. */
export function assertDescriptor(descriptor) {
  const { valid, errors } = validateDescriptor(descriptor);
  if (!valid) throw new Error(`invalid descriptor ${descriptor?.identity?.id ?? '(no id)'}: ${errors.join('; ')}`);
  return descriptor;
}

/** The fields a draft descriptor may leave as the UNRESEARCHED sentinel. */
export const DRAFT_SENTINEL = 'UNRESEARCHED';

/** How many fields of this descriptor are still unresearched. */
export function unresearchedCount(descriptor) {
  let n = 0;
  const walk = (v) => {
    if (v === DRAFT_SENTINEL) { n += 1; return; }
    if (typeof v === 'string') { if (v.startsWith(DRAFT_SENTINEL)) n += 1; return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k === 'x-draft') continue; walk(v[k]); }
  };
  walk(descriptor);
  return n;
}
