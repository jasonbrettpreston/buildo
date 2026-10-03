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
// P1-C5 (plan Fold 9): `effectiveLedger` overlays converted descriptors on the
// snapshot for the registry and gate #44 (e); `stepUpstreams` accepts an
// injected ledger and is unchanged without one; `derivedReadsSteps` is (e)'s
// derived set — the same `stepUpstreams` predicate, one derivation, two inputs.
//
// L-A (plan Fold 14): `chainOrderViolations` derives chain order from the same predicate and reports every producer-after-reader edge.
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
 * @param {{chain: string, env?: Record<string,string|undefined>, ledger?: {inchain: Record<string, object>}}} opts -
 *   `chain` REQUIRED. `ledger` is an injected ledger (P1-C5, plan Fold 9 D-C):
 *   `effectiveLedger()` for the registry and gate #44 (e); absent → the committed
 *   snapshot, byte-identical to before (D1 parity lock).
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
  const { inchain } = o.ledger || loadLedger(o);
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

/**
 * The invocation chains a converted descriptor declares — `execution.invocation`
 * is keyed by chain id, so its keys ARE the chains this step runs for. A
 * non-object (absent, `'none'`, or a malformed string) declares no chains here;
 * `[]` is the honest answer and the caller falls back to the snapshot's row.
 *
 * @param {object} descriptor
 * @returns {string[]}
 */
function invocationChains(descriptor) {
  const invocation = descriptor && descriptor.execution && descriptor.execution.invocation;
  if (!invocation || typeof invocation !== 'object' || Array.isArray(invocation)) return [];
  return Object.keys(invocation);
}

/**
 * The EFFECTIVE ledger — the registry and gate #44 (e) read this, never the
 * bare snapshot. Each row is the converted descriptor's `deriveMeta(descriptor)`
 * (reads/writes) overlaid on the lineage snapshot, and EVERY row is
 * source-tagged (plan Fold 9 D-A).
 *
 * A `source: 'snapshot'` row is DECLARED lineage, NOT witnessed — it says what
 * the lineage registry claims, and must never be described as accurate
 * (Spec 122 §6.6.1(c)). A `source: 'descriptor'` row's reads/writes come from
 * the one derivation `deriveMeta` performs; `chains` falls back to the
 * descriptor's invocation chains when the snapshot carries none for that name.
 *
 * `o.descriptors` is a TEST-ONLY injection (mirrors `BUILDO_LEDGER_SNAPSHOT_PATH`)
 * so a unit can supply descriptors WITHOUT touching the committed registry.
 *
 * @param {{env?: Record<string,string|undefined>, descriptors?: Record<string, object>}} [opts]
 * @returns {{inchain: Record<string, object>, static: Record<string, object>}}
 */
function effectiveLedger(opts) {
  const o = opts || {};
  const base = loadLedger(o);
  const descriptors =
    o.descriptors ||
    Object.fromEntries(
      Object.entries(require('./step/seam.js').loadConvertedDescriptors()).map(([n, v]) => [n, v.descriptor]),
    );
  const { deriveMeta } = require('./step/index.js');

  const inchain = {};
  for (const [name, row] of Object.entries(base.inchain)) {
    inchain[name] = { ...row, source: 'snapshot' };
  }
  for (const [name, descriptor] of Object.entries(descriptors)) {
    const meta = deriveMeta(descriptor);
    const prior = base.inchain[name] || {};
    inchain[name] = {
      ...prior,
      chains: (base.inchain[name] && base.inchain[name].chains) || invocationChains(descriptor),
      reads: meta.reads,
      writes: meta.writes,
      source: 'descriptor',
    };
  }
  return { inchain, static: base.static };
}

/**
 * Gate #44 (e)'s derived `inputs.reads.steps` (plan Fold 9 D-B): the steps whose
 * writes intersect the descriptor's DECLARED reads at COLUMN granularity,
 * chain-scoped — the union across the descriptor's invocation chains (as LDG-4
 * does), via the ONE `stepUpstreams` predicate.
 *
 * The consumer side is the descriptor's DECLARED reads (the ones #44 (a)
 * witnesses), overlaid onto the ledger row before deriving; the descriptor's own
 * slug is excluded. The producers are every writer in the given ledger —
 * including unconverted, `source: 'snapshot'` rows — unless `producers`
 * restricts them to a known set.
 *
 * The TABLE-level reading is REJECTED: it would make every `parcels` writer
 * upstream of every other table-sharing step, a gating cycle. Check-SQL
 * (`checks[]`) reads are not `inputs.reads.tables` and so never enter this
 * derivation.
 *
 * Requires an injected ledger — the effective ledger for #44 (e); there is no
 * snapshot default because the derived set is only meaningful against the
 * ledger it was derived over.
 *
 * @param {string} slug - `identity.name`
 * @param {object} descriptor - the converted descriptor (its declared reads)
 * @param {{ledger: {inchain: Record<string, object>}, producers?: string[]}} opts - `ledger` REQUIRED
 * @returns {string[]} producer step names, deduplicated, sorted ascending
 */
function derivedReadsSteps(slug, descriptor, opts) {
  const o = opts || {};
  if (!o.ledger) {
    throw new Error(
      `[ledger] derivedReadsSteps('${slug}') requires an injected ledger (effectiveLedger() or loadLedger())`,
    );
  }
  const { deriveMeta } = require('./step/index.js');
  const own = o.ledger.inchain[slug];
  const chains = invocationChains(descriptor);
  const inchain = {
    ...o.ledger.inchain,
    [slug]: {
      ...(own || {}),
      chains: (own && own.chains) || chains,
      reads: deriveMeta(descriptor).reads,
    },
  };

  const producers = new Set();
  for (const chain of chains) {
    for (const step of stepUpstreams(slug, { chain, ledger: { inchain } })) {
      if (step === slug) continue;
      producers.add(step);
    }
  }
  const allowed = Array.isArray(o.producers) ? new Set(o.producers) : null;
  const result = [...producers].filter((step) => !allowed || allowed.has(step));
  return result.sort();
}

/**
 * Chain order DERIVED from the effective cross-step ledger and checked against
 * `manifest.chains` (plan Fold 9 D-B + Fold 14) — LDG-10 class 5, replacing the
 * hand-written `indexOf` assertions in `chain.logic.test.ts`.
 *
 * SPEC LINK Spec 122 §6.5 / §6.6 (c) (LDG-10 class 5, plan Fold 9 D-B + Fold 14):
 * for every chain, a producer `p` of a column the reader reads (`stepUpstreams`,
 * column-level, chain-scoped) must sit BEFORE the reader at the same
 * granularity. A producer AFTER its reader is an
 * `ORDER:<chain>:<p>><reader>:<cols>` row; an in-chain ledger producer absent
 * from the manifest chain is `ORDER-UNPLACED:<chain>:<p>><reader>:<cols>`
 * (never silently dropped).
 *
 * rows on `permits`/`coa`/`entities`/`deep_scrapes` are REPORT-ONLY until the
 * FLEET-2 landing commit (RE-FREEZE) flips them HARD; `sources` + `wsib` are
 * HARD now.
 *
 * NO exemption of any kind: a reader that also writes the shared column is NOT
 * excluded — that rule needs a Spec 124 §5 register row + Operator-Ruling first
 * (FLEET-2 work); there is no allowlist and no skip list here, and those edges
 * stay visible as report-only `ORDER:` rows until then.
 *
 * Iteration order is `Object.keys(chains)` for chains and array order within a
 * chain (reader position ascending); everything is REPORTED, never thrown.
 *
 * @param {Record<string, string[]>} chains - `manifest.chains` shape
 * @param {{inchain: Record<string, object>}} ledger - `{ inchain }` REQUIRED
 * @returns {{rows: string[], blind: string[], unledgered: string[]}} three string arrays
 */
function chainOrderViolations(chains, ledger) {
  if (!ledger) {
    throw new Error('[ledger] chainOrderViolations requires an injected ledger (effectiveLedger())');
  }
  const inchain = ledger.inchain || {};
  const cfg = chains || {};
  const rows = [];
  const blind = [];
  const unledgered = [];

  for (const chain of Object.keys(cfg)) {
    const steps = cfg[chain] || [];
    for (let readerIndex = 0; readerIndex < steps.length; readerIndex += 1) {
      const reader = steps[readerIndex];
      const row = inchain[reader];
      if (!row) {
        unledgered.push(`ORDER-UNLEDGERED:${chain}:${reader}`);
        continue;
      }
      const reads = row.reads || {};
      for (const [table, cols] of Object.entries(reads)) {
        if (!cols || cols.length === 0) blind.push(`ORDER-BLIND:${chain}:${reader}:${table}`);
      }
      for (const p of stepUpstreams(reader, { chain, ledger })) {
        if (p === reader) continue;
        const pWrites = (inchain[p] && inchain[p].writes) || {};
        const producerCols = new Set();
        for (const [table, cols] of Object.entries(reads)) {
          const written = pWrites[table] || [];
          for (const col of cols || []) {
            if (written.includes(col)) producerCols.add(`${table}.${col}`);
          }
        }
        const cols = [...producerCols].sort().join(',');
        const producerIndex = steps.indexOf(p);
        if (producerIndex === -1) rows.push(`ORDER-UNPLACED:${chain}:${p}>${reader}:${cols}`);
        else if (producerIndex > readerIndex) rows.push(`ORDER:${chain}:${p}>${reader}:${cols}`);
      }
    }
  }
  return { rows, blind, unledgered };
}

module.exports = {
  DEFAULT_SNAPSHOT_PATH,
  snapshotPath,
  loadLedger,
  slugForms,
  stepUpstreams,
  effectiveLedger,
  derivedReadsSteps,
  chainOrderViolations,
};
