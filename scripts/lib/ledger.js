'use strict';
// scripts/lib/ledger.js
//
// The cross-step ledger — a `stepUpstreams(slug, {chain})` reader over the
// already tier-2 committed column-lineage ledger (Spec 122 §6, LDG-4). An
// EXTRACTION, not an invention (§6.0): `scripts/lib/step/staleness.js`'s
// `deriveLedgerSlugs` already derives a converted step's upstream slug set
// from its OWN descriptor; the 19 still-unconverted `sources`-chain steps had
// no equivalent path, and every hand-maintained upstream array (the LAST
// survivor: `scripts/compute-parcel-cost-estimates.js`'s `UPSTREAM_SLUGS`)
// was a manually-kept copy of exactly what this file computes.
//
// `slugForms` is the SAME three-form expansion `deriveLedgerSlugs`'s private
// `forms` closure already computed — extracted here (Fold A, Integration
// 2026-09-03: the original closure captured `chains` from descriptor scope,
// so extraction PARAMETERISES `chains`, it is not a verbatim lift) and
// re-imported by `staleness.js` so exactly one expansion exists (§11 dual
// path).
//
// `loadLedger` reads the COMMITTED, DB-free `lineage-meta-snapshot.json` —
// the same discipline `generate-lineage-docs.mjs`'s `--check`/render path
// already relies on (deterministic, no live DB touch outside `--refresh`).
//
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6 (the cross-step ledger)

const fs = require('fs');
const path = require('path');

/** The committed snapshot `generate-lineage-docs.mjs --refresh` writes. */
const DEFAULT_SNAPSHOT_PATH = path.resolve(__dirname, '../seeds/lineage-meta-snapshot.json');

/**
 * `BUILDO_LEDGER_SNAPSHOT_PATH` is a TEST-ONLY override (same shape as
 * `step-validate.mjs`'s `BUILDO_PROGRAMME_ITEMS_PATH`) so the unit suite can
 * point `loadLedger`/`stepUpstreams` at a fixture snapshot without mutating
 * the committed one. Resolved relative to the repo root (matches the
 * programme-items precedent), never relative to `process.cwd()` at call time.
 *
 * @param {{env?: Record<string,string|undefined>}} [opts]
 * @returns {string}
 */
function snapshotPath(opts) {
  const env = (opts && opts.env) || process.env;
  if (!env.BUILDO_LEDGER_SNAPSHOT_PATH) return DEFAULT_SNAPSHOT_PATH;
  const repoRoot = path.resolve(__dirname, '../..');
  return path.resolve(repoRoot, env.BUILDO_LEDGER_SNAPSHOT_PATH);
}

/**
 * The committed column-lineage ledger. Throws on a missing or malformed
 * snapshot — a broken registry is not something to skip past (mirrors
 * `seam.js`'s `loadConvertedDescriptors()` rule of throwing rather than
 * silently skipping).
 *
 * @param {{env?: Record<string,string|undefined>}} [opts]
 * @returns {{inchain: Record<string, object>, static: Record<string, object>}}
 */
function loadLedger(opts) {
  const p = snapshotPath(opts);
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { inchain: parsed.inchain || {}, static: parsed.static || {} };
}

/**
 * The three-form slug expansion `deriveLedgerSlugs` already computed as a
 * private closure: `${chain}:${name}` for every declared chain, the bare
 * name, and the hyphenated form (a standalone run, or a legacy writer, may
 * use either). Parameterized on `chains` — the original closure captured it
 * from descriptor scope (Fold A).
 *
 * @param {string} name
 * @param {string[]} chains
 * @returns {string[]}
 */
function slugForms(name, chains) {
  return [
    ...(chains || []).map((c) => `${c}:${name}`),
    name,
    name.replace(/_/g, '-'),
  ];
}

/**
 * The set of steps whose `writes` intersect `slug`'s `reads` at COLUMN
 * granularity — the derived answer to "what does this step depend on?"
 * (Spec 122 §6, LDG-4). Restricted to producers sharing `chain` with the
 * consumer (Fold C, DeepSeek #3: chain-unaware derivation is measured safe
 * for the cost step today but unproven for the other 19 unconverted steps)
 * — `chain` is REQUIRED, never optional (Fold D).
 *
 * Throws on an unknown slug — an empty upstream set is a legal answer for a
 * KNOWN step with no upstream producers, and must never be confusable with
 * "step not found". A `null`/absent `reads` on a KNOWN step returns `[]`,
 * not a throw.
 *
 * @param {string} slug - `identity.name` / the snapshot's `inchain` key
 * @param {{chain: string, env?: Record<string,string|undefined>}} opts - `chain` REQUIRED
 * @returns {string[]} producer step names, deduplicated, sorted ascending
 */
function stepUpstreams(slug, opts) {
  const o = opts || {};
  if (!o.chain) {
    throw new Error(
      `[ledger] stepUpstreams('${slug}') requires a 'chain' option — chain-unaware derivation is unproven ` +
        '(Fold C, DeepSeek #3); pass the chain this step is being evaluated for.',
    );
  }
  const { inchain } = loadLedger(o);
  const target = inchain[slug];
  if (!target) {
    throw new Error(
      `[ledger] stepUpstreams: unknown slug '${slug}' — not a key in ${snapshotPath(o)}'s "inchain" section. ` +
        'An empty upstream set is a legal answer for a KNOWN step; this is not that.',
    );
  }
  const reads = target.reads || {};
  const producers = new Set();
  for (const [table, cols] of Object.entries(reads)) {
    for (const col of cols) {
      for (const [step, info] of Object.entries(inchain)) {
        if (step === slug) continue;
        const chains = info.chains || [];
        if (!chains.includes(o.chain)) continue;
        const writtenCols = (info.writes && info.writes[table]) || [];
        if (writtenCols.includes(col)) producers.add(step);
      }
    }
  }
  return [...producers].sort();
}

module.exports = {
  DEFAULT_SNAPSHOT_PATH,
  snapshotPath,
  loadLedger,
  slugForms,
  stepUpstreams,
};
