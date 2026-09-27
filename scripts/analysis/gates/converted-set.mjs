// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (scope: gates from ①)
//
// THE ONE READ of `scripts/steps/_schema/converted.json` for the R-BA registry
// gates (#28-#41). Every gate that walks "the converted fleet" reads it through
// `readConvertedJson`, so a PENDING step can be evaluated EXACTLY as if it were
// converted: `step-validate.mjs` calls `setAsConverted([<pending relFile>...])`
// when the run's targets include pending steps, and every gate then sees those
// files in `converted[]` (and not in `pending[]`) — the same view the ③ cutover
// commit will produce. Nothing else changes: no gate, answer set or ledger rule.
//
// Replaces: gates that fired only after registration, so an in-development step
// met them at ③, after its goldens were captured (WF2 "conversion
// simplification" item 1). With no overlay set this returns converted.json
// byte-for-byte as parsed, so every existing converted-only caller is unchanged.

import fs from 'node:fs';
import path from 'node:path';

export const CONVERTED_REL_PATH = 'scripts/steps/_schema/converted.json';

const norm = (f) => String(f).replace(/\\/g, '/');
const pendingFile = (p) => norm(typeof p === 'string' ? p : p && p.file);

let overlay = [];

/**
 * Evaluate these pending step files as converted for the rest of this process.
 * Every file must be a CURRENT `pending[]` entry — naming anything else is a
 * caller bug and throws (the overlay can add an in-development step, never
 * invent one).
 * @param {string[]} files repo-relative step files (e.g. `scripts/load-centreline.js`)
 * @param {string} [repoRoot]
 */
export function setAsConverted(files, repoRoot) {
  const wanted = [...new Set((Array.isArray(files) ? files : []).map(norm))];
  if (wanted.length && repoRoot) {
    const parsed = readRaw(repoRoot);
    const pending = new Set((parsed.pending || []).map(pendingFile));
    const stray = wanted.filter((f) => !pending.has(f));
    if (stray.length) throw new Error(`setAsConverted: not a pending[] entry in ${CONVERTED_REL_PATH}: ${stray.join(', ')}`);
  }
  overlay = wanted;
}

/** The files currently evaluated as converted (empty = no overlay). */
export function asConvertedFiles() {
  return [...overlay];
}

/** Run `fn` against the COMMITTED set (overlay suspended), e.g. a generated-file freshness check. */
export function withCommittedSet(fn) {
  const saved = overlay;
  overlay = [];
  try {
    return fn();
  } finally {
    overlay = saved;
  }
}

function readRaw(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, CONVERTED_REL_PATH), 'utf8'));
  } catch (e) {
    throw new Error(`converted.json unreadable at ${CONVERTED_REL_PATH}: ${e.message}`);
  }
}

/**
 * converted.json as the registry gates must see it: parsed, with any overlaid
 * pending file appended to `converted[]` (in overlay order, after the committed
 * entries — the position the ③ cutover appends it at) and removed from `pending[]`.
 * @param {string} repoRoot
 */
export function readConvertedJson(repoRoot) {
  const parsed = readRaw(repoRoot);
  if (overlay.length === 0) return parsed;
  const converted = Array.isArray(parsed.converted) ? parsed.converted.map(norm) : [];
  const add = overlay.filter((f) => !converted.includes(f));
  return {
    ...parsed,
    converted: [...(parsed.converted || []), ...add],
    pending: (parsed.pending || []).filter((p) => !overlay.includes(pendingFile(p))),
  };
}
