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
// L-A (plan Fold 14): `chainOrderViolations` derives chain order from the same predicate and reports every producer-after-reader edge. A same-statement write guard witnessed by the #44 trace is the one exclusion (fold 17 #5).
//
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6 (the cross-step ledger)

const fs = require('fs');
const path = require('path');

/** The committed snapshot `generate-lineage-docs.mjs --refresh` writes. */
const DEFAULT_SNAPSHOT_PATH = path.resolve(__dirname, '../seeds/lineage-meta-snapshot.json');

/**
 * The committed src/ static SQL ledger `scripts/analysis/src-sql-ledger.mjs
 * --write` writes. STATIC-PARSED: each row records SQL the src/ code TEXT
 * declares, not a statement observed running.
 */
const SRC_SQL_LEDGER_PATH = path.resolve(__dirname, '../steps/_schema/src-sql-ledger.json');

/** The committed #44 witness traces `docs/reports/witness/<slug>/post/*.trace.json`. */
const DEFAULT_WITNESS_ROOT = path.resolve(__dirname, '../../docs/reports/witness');

/**
 * The `src` section of the effective ledger — the static-parsed src/ SQL
 * readers/writers, keyed by repo-relative file, sorted. `not_postgres` files
 * carry no reads/writes and never enter the section.
 *
 * @param {{files?: Record<string, object>}} [srcLedger]
 * @returns {Record<string, {class: string, reads: object, writes: object, source: string}>}
 */
function srcSection(srcLedger) {
  const files = (srcLedger && srcLedger.files) || {};
  const section = {};
  for (const [file, e] of Object.entries(files)) {
    if (e.class !== 'static' && e.class !== 'interpolated') continue;
    section[file] = { class: e.class, reads: e.reads || {}, writes: e.writes || {}, source: 'src_static' };
  }
  return Object.fromEntries(Object.entries(section).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

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
 * `o.srcLedger` is likewise a TEST-ONLY injection for the `src` section.
 *
 * The returned `src` section's rows are STATIC-PARSED src/ SQL — reads/writes
 * the code TEXT declares, NOT witnessed. Runtime confirmation is partial; a
 * `src` row must never be described as witnessed lineage.
 *
 * A snapshot row whose slug has no manifest.scripts entry is retired: dropped from inchain and listed in `retired` as ORDER-RETIRED:<slug> (MQ-C1, fold 19).
 *
 * @param {{env?: Record<string,string|undefined>, descriptors?: Record<string, object>, srcLedger?: unknown, scripts?: Record<string, unknown>}} [opts]
 * @returns {{inchain: Record<string, object>, static: Record<string, object>, src: Record<string, object>, retired: string[]}}
 */
function effectiveLedger(opts) {
  const o = opts || {};
  const base = loadLedger(o);
  const srcLedger =
    o.srcLedger !== undefined
      ? o.srcLedger
      : fs.existsSync(SRC_SQL_LEDGER_PATH)
        ? JSON.parse(fs.readFileSync(SRC_SQL_LEDGER_PATH, 'utf8'))
        : { files: {} };
  const descriptors =
    o.descriptors ||
    Object.fromEntries(
      Object.entries(require('./step/seam.js').loadConvertedDescriptors()).map(([n, v]) => [n, v.descriptor]),
    );
  const { deriveMeta } = require('./step/index.js');

  // MQ-C1 (a) (plan fold 19 + compliance amendment C1): a snapshot row whose slug has no
  // manifest.scripts entry is a RETIRED producer (e.g. a slug kept alive only by old pipeline_runs
  // rows). It is dropped HERE so ORDER, #44 (e) and unproducedReads all see one truth, and each is
  // reported as ORDER-RETIRED:<slug>. Derived from the manifest, never a list. Descriptor rows are
  // never dropped. opts.scripts injects a manifest.scripts-shaped object (tests).
  const scripts = o.scripts || JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8')).scripts || {};
  const isLive = (slug) => Object.prototype.hasOwnProperty.call(scripts, slug);

  const inchain = {};
  const retired = [];
  for (const [name, row] of Object.entries(base.inchain)) {
    if (!isLive(name) && !Object.prototype.hasOwnProperty.call(descriptors, name)) {
      retired.push(`ORDER-RETIRED:${name}`);
      continue;
    }
    inchain[name] = { ...row, source: 'snapshot' };
  }
  for (const [name, descriptor] of Object.entries(descriptors)) {
    const meta = deriveMeta(descriptor);
    const prior = base.inchain[name] || {};
    inchain[name] = {
      ...prior,
      // FLEET-2 assembly 2026-10-05: the DECLARED invocation is the truth (R-AZ generates manifest chain_args
      // from it; generate-chain-args --check keeps it equal to manifest membership). A stale lineage-snapshot
      // membership (e.g. link_massing after it left the permits chain, §2 item 2.1) must not keep a producer in
      // a chain it no longer runs in. Snapshot chains only when the descriptor declares no invocation.
      chains: invocationChains(descriptor).length > 0
        ? invocationChains(descriptor)
        : (base.inchain[name] && base.inchain[name].chains) || [],
      reads: meta.reads,
      writes: meta.writes,
      source: 'descriptor',
    };
  }
  return { inchain, static: base.static, src: srcSection(srcLedger), retired: retired.sort() };
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
 * LDG-10: every `staleness.pins[].step` (self excluded) joins the result — a pin is a declared producer edge.
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
  // LDG-10 (WF1 Step 2 rider, Panel fold 1 item 10): every staleness.pins[].step is a declared
  // producer edge (the reader halts on / compares that producer's stamp), so it JOINS the derived
  // set — L-A ordering and #44 (e) see every pin edge. Self-pins are excluded like self-writes.
  const pins = (descriptor && descriptor.staleness && Array.isArray(descriptor.staleness.pins)) ? descriptor.staleness.pins : [];
  for (const pin of pins) {
    if (pin && typeof pin.step === 'string' && pin.step && pin.step !== slug) producers.add(pin.step);
  }
  const allowed = Array.isArray(o.producers) ? new Set(o.producers) : null;
  const result = [...producers].filter((step) => !allowed || allowed.has(step));
  return result.sort();
}

/**
 * Every step's #44 trace statements (`docs/reports/witness/<slug>/post/*.trace.json`),
 * keyed by the witness directory name (= the step slug; `trace.step` is a file path and is not used), all invocations concatenated.
 * Read-only, file-only (no DB). An unreadable or unparsable trace file is skipped — the
 * reader is then simply unwitnessed for the L-A guard, which keeps its ORDER row.
 * @param {string} [witnessRoot]
 * @returns {Record<string, Array<{reads?: Record<string,string[]>, writes?: Record<string,string[]>}>>}
 */
function loadTraceStatements(witnessRoot) {
  const root = witnessRoot || DEFAULT_WITNESS_ROOT;
  const out = {};
  let dirs = [];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const dir of dirs) {
    const post = path.join(root, dir, 'post');
    let files = [];
    try { files = fs.readdirSync(post).filter((f) => f.endsWith('.trace.json')); } catch { continue; }
    for (const f of files) {
      let trace;
      try { trace = JSON.parse(fs.readFileSync(path.join(post, f), 'utf8')); } catch { continue; }
      if (!trace || !Array.isArray(trace.statements)) continue;
      const slug = dir;
      (out[slug] = out[slug] || []).push(...trace.statements);
    }
  }
  return out;
}

/**
 * L-A same-statement write guard (plan fold 14 L-A, fold 17 #5; register row R-id assigned at
 * landing). TRUE only when the reader declares `table.col` as BOTH a read and a write, its trace
 * has at least one statement reading it, and EVERY traced statement reading it also writes it.
 * No trace ⇒ false (unwitnessed). Computed from the trace only — no list, no allowlist.
 */
function isSameStatementGuard(row, statements, table, col) {
  const has = (m) => Boolean(m && Array.isArray(m[table]) && m[table].includes(col));
  if (!has(row && row.reads) || !has(row && row.writes)) return false;
  if (!Array.isArray(statements) || statements.length === 0) return false;
  const readers = statements.filter((s) => s && has(s.reads));
  return readers.length > 0 && readers.every((s) => has(s.writes));
}

/**
 * The converted step slugs: every manifest.scripts slug whose `file` is listed in
 * scripts/steps/_schema/converted.json `converted` (MQ-C3, plan fold 19 row 3). Read from disk, never
 * a list. `opts.converted` (file paths) / `opts.scripts` (manifest.scripts shape) inject the inputs.
 * @param {{converted?: string[], scripts?: Record<string, {file?: string}>}} [opts]
 * @returns {string[]} sorted slugs
 */
function convertedSlugs(opts) {
  const o = opts || {};
  const files = new Set(
    o.converted || JSON.parse(fs.readFileSync(path.resolve(__dirname, '../steps/_schema/converted.json'), 'utf8')).converted || [],
  );
  const scripts = o.scripts || JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8')).scripts || {};
  return Object.keys(scripts).filter((slug) => scripts[slug] && files.has(scripts[slug].file)).sort();
}

/**
 * MQ-C1 guard (compliance amendment C1 (iii)): every chain slug with no manifest.scripts entry,
 * as sorted `CHAIN-UNSCRIPTED:<chain>:<slug>`. Must be empty — otherwise effectiveLedger's retired
 * predicate could hide a live producer.
 * @param {Record<string, string[]>} chains - `manifest.chains` shape
 * @param {Record<string, unknown>} scripts - `manifest.scripts` shape
 * @returns {string[]}
 */
function unscriptedChainSlugs(chains, scripts) {
  const out = [];
  for (const [chain, steps] of Object.entries(chains || {})) {
    for (const slug of steps || []) {
      if (!Object.prototype.hasOwnProperty.call(scripts || {}, slug)) out.push(`CHAIN-UNSCRIPTED:${chain}:${slug}`);
    }
  }
  return out.sort();
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
 * Every chain is HARD since the FLEET-2 landing commit (RE-FREEZE, plan fold 14 L-A): the caller fails on any ORDER / ORDER-UNPLACED row.
 *
 * ONE exclusion, computed from the trace (opts.traces, see loadTraceStatements): a same-statement write guard (isSameStatementGuard) is not an edge; each one is returned in `guarded` as ORDER-GUARD:<chain>:<p>><reader>:<table.col> so it is printed, never silent. Without a trace the reader is unwitnessed and the row stays. No list, no last-writer-wins (e.g. permits.status stays ordered).
 * MQ-C3 derived arm (fold 19 row 3): with opts.converted (see convertedSlugs), an ORDER row whose producer AND reader are both unconverted goes to `unwitnessed` as ORDER-UNWITNESSED:<chain>:<p>><reader>:<cols> — report-only, printed and counted by the caller, ceiling-locked; it is hard again the moment either side is in converted.json. ORDER-UNPLACED rows never move.
 *
 * Iteration order is `Object.keys(chains)` for chains and array order within a
 * chain (reader position ascending); everything is REPORTED, never thrown.
 *
 * @param {Record<string, string[]>} chains - `manifest.chains` shape
 * @param {{inchain: Record<string, object>}} ledger - `{ inchain }` REQUIRED
 * @param {{traces?: Record<string, Array<object>>, converted?: Iterable<string>}} [opts]
 * @returns {{rows: string[], blind: string[], unledgered: string[], guarded: string[], unwitnessed: string[]}} five string arrays
 */
function chainOrderViolations(chains, ledger, opts) {
  if (!ledger) {
    throw new Error('[ledger] chainOrderViolations requires an injected ledger (effectiveLedger())');
  }
  const inchain = ledger.inchain || {};
  const cfg = chains || {};
  const traces = (opts && opts.traces) || {};
  // MQ-C3 compliant variant (plan fold 19 row 3; Spec 124 §5 row + Operator-Ruling at landing): with
  // opts.converted, an ORDER row whose producer AND reader are BOTH unconverted has no trace to verify
  // or fix it — it is reported as ORDER-UNWITNESSED (printed, counted, report-only) and goes hard
  // automatically when either side converts. Without opts.converted every row stays hard (fail-safe).
  const converted = opts && opts.converted ? new Set(opts.converted) : null;
  const unwitnessed = [];
  const rows = [];
  const blind = [];
  const unledgered = [];
  const guarded = [];

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
        const producerIndex = steps.indexOf(p);
        for (const [table, cols] of Object.entries(reads)) {
          const written = pWrites[table] || [];
          for (const col of cols || []) {
            if (!written.includes(col)) continue;
            if (
              (producerIndex === -1 || producerIndex > readerIndex) &&
              isSameStatementGuard(row, traces[reader], table, col)
            ) {
              guarded.push(`ORDER-GUARD:${chain}:${p}>${reader}:${table}.${col}`);
              continue;
            }
            producerCols.add(`${table}.${col}`);
          }
        }
        if (producerCols.size === 0) continue;
        const cols = [...producerCols].sort().join(',');
        if (producerIndex === -1) rows.push(`ORDER-UNPLACED:${chain}:${p}>${reader}:${cols}`);
        else if (producerIndex > readerIndex) {
          if (converted && !converted.has(p) && !converted.has(reader)) unwitnessed.push(`ORDER-UNWITNESSED:${chain}:${p}>${reader}:${cols}`);
          else rows.push(`ORDER:${chain}:${p}>${reader}:${cols}`);
        }
      }
    }
  }
  return { rows, blind, unledgered, guarded, unwitnessed };
}

module.exports = {
  DEFAULT_SNAPSHOT_PATH,
  SRC_SQL_LEDGER_PATH,
  snapshotPath,
  loadLedger,
  slugForms,
  stepUpstreams,
  effectiveLedger,
  derivedReadsSteps,
  chainOrderViolations,
  unscriptedChainSlugs,
  convertedSlugs,
  loadTraceStatements,
};
