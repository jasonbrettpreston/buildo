// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-T, Rule 10, §5 R-BA (gate D);
//            122_pipeline_step_optimization.md §6.1-§6.2
//
// GATE D — OBSERVABLE-only half of the five-word standard (GC-3, no ACCURATE
// double-count): a GENERATED consumer registry, built from EXISTING structured
// data (never a hand-typed inventory, Rule 10/R-T's own "declared data,
// generated, and gated" posture), records every (consumer, producer, key)
// contract a converted step's `records_meta`/`audit_table` participates in, and
// checks each one against the producer's own golden POST captures.
//
// FIVE generation sources (`buildRegistry` — deterministic, sorted):
//   1. `funnel`   — `src/lib/admin/funnel.ts` `FUNNEL_SOURCES`: an entry with a
//      declared `auditMetric` becomes one row (consumer = FreshnessTimeline.tsx,
//      producer = its `statusSlug`, kind `audit_metric`, value `percent`,
//      `value_path` = its `auditValuePath` when declared).
//   2. `emits`    — each descriptor `emits[]` item with a non-empty `consumers[]`
//      becomes one row PER consumer (kind `records_meta`, value `any`).
//   3. `counters` — a `counters.<slot>.source` of the form `records_meta.<key>`
//      becomes a SELF-consumed row (the step reads its own emitted key back).
//   4. `trigger`  — a `staleness.trigger[].emit_key` becomes a SELF-consumed row
//      (the B3 class: a baseline the compute must persist for staleness to see).
//   5. `src_sql`  — every static-parsed src/ SQL read (`scripts/analysis/src-sql-ledger.mjs`)
//      × the effective ledger's column writers: one row per writer (kind `table`, key
//      `<table>.<column>`). A read with no declared writer is an `unproduced` read
//      (UNPRODUCED_POSTURE).
//
// The closed answer set, per registry row whose PRODUCER is a converted step:
//   present — `records_meta` kind: the key is a top-level key of >=1 POST golden
//     `summary.records_meta`; `audit_metric` kind: the key is a `metric` in >=1
//     POST golden's `summary.records_meta.audit_table.rows[]`.
//   typed   — `value:'any'` needs no check; `value:'number'` demands a finite
//     number (at `value[value_path]` when `value_path` is declared, else `value`
//     itself); `value:'percent'` demands the same OR a `"-?\d+(\.\d+)?%"` string
//     (LM-D7/LW-D18: several producers carry the readable rate as an OBJECT row
//     detail, not a scalar — `value_path` is what makes it typed at all).
//   A row failing either is RED (`item: "<consumer>-><producer>.<key>"`), unless
//   a `{gate:'D'}` ledger row allows it. A producer NOT in `converted.json` is
//   `unconverted_producer` — listed, never checked (its contract is unmeasurable
//   until it converts).
//
// The COMPLETENESS half (the static half, never the source of rows — `scanConsumers`):
// every `records_meta` read in the closed corpus resolves to a known key — the
// reference shapes are `records_meta(?:\?\.|\.|->>?'|\[')<key>` plus the five
// extra FORMS (paren `(r.records_meta || {}).key`, cast `... as Record<...>)?.key`,
// alias `const meta = ...records_meta...; meta.key`, two-level alias
// `const l = meta.key.leaf` (FIRST level only), and SQL `-> 'key'` / `#>> '{key,..}'`).
// Concretely, every such read in the closed corpus
// (`src/lib/admin/**`, `src/components/**`, `src/app/**`, plus every
// `scripts/**` .js/.mjs/.ts/.cjs file except the schema fixtures — LDG-10)
// A slug consumer row covers that step's §4.1 files (stepFileOwners); a key no converted
// producer emits is LISTED unconverted_producer:<file>:<key> only when found in an
// unconverted producer's source (O3), else RED.
// Every such read on a line that is not a comment must resolve to RUNNER_META_KEYS
// (gate C's export), CHAIN_META_KEYS (below — a step-independent key stamped by
// the RUNNER/CHAIN layer, each entry citing its WRITER by greppable anchor,
// verified by grep, 2026-09-26), or a registry row whose `consumer` is that same
// file. Anything else is RED `undeclared-consumer:<file>:<key>` — a real reader
// this registry does not yet know about (the `tables_checked` case:
// `step-validate.mjs` reads `assert_engine_health`'s counter with no row).
//
// `ledger.mjs` owns the row shape + the match; this file owns the five
// generation sources, the closed-set checks, and the completeness scan.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH } from './ledger.mjs';
import { loadConvertedDescriptors } from './closed-bounds.mjs';
import { asConvertedFiles, withCommittedSet, readConvertedJson } from './converted-set.mjs';
import { stepFiles } from './step-registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
/** The runner-owned `records_meta` keys, declared ONCE in the step library (gate C). */
// ONE RESOLVER (Spec 122 §10): the gate imports the runtime's own functions, never a mirror.
const { RUNNER_META_KEYS, resolveCounterSource } = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));
const RUNNER_META_KEYS_SET = new Set(RUNNER_META_KEYS);
// The src/ SQL-ledger half (consumer source #5): the effective ledger (converted
// descriptors over the committed snapshot, column-granular writers) is read from
// `scripts/lib/ledger.js` — the ONE derivation of `writes`, never a mirror.
const { effectiveLedger } = require(path.join(REPO_ROOT, 'scripts/lib/ledger.js'));

/**
 * The `unproduced` src read posture. Every unproduced read is printed and
 * COUNTED on every run — no exception file, no silent skip. The FLEET-2 landing
 * commit set `mode: 'hard'` (the ONLY flip; registry-truth fold 14 P1-C6): each
 * unproduced read is now a gate-D violation, closed only by declaring the column
 * in its producer descriptor (written: step | insert_only | db_default) or
 * dropping the read.
 * @type {Readonly<{mode: 'report-only' | 'hard', flips_hard_at: string, closes_by: string}>}
 */
export const UNPRODUCED_POSTURE = Object.freeze({
  mode: 'hard',
  flips_hard_at: 'the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)',
  closes_by: 'declare the column in its producer descriptor (written: step | insert_only | db_default), or drop the read',
});

/**
 * MQ-A5 (plan fold 19 row 5; Spec 124 §5 row + Operator-Ruling at landing): the write MECHANICS that
 * INSERT rows into their declared target (Spec 122 §1 class table, Pattern column), and the ones that
 * never do. Together they partition the frozen `write_discipline.class` enum (locked by the gate-D
 * suite), so a new class can never default silently.
 */
export const ROW_INSERTING_CLASSES = Object.freeze([
  'guarded_upsert', 'upsert_scoped_departure_delete', 'staging_full_replace',
  'insert_only_no_retraction', 'link_full_retraction', 'snapshot_append',
]);
export const NON_INSERTING_CLASSES = Object.freeze([
  'write_once_backfill', 'set_based_scoped', 'set_based_unscoped', 'temp_materialize', 'multi_pass_defer',
  'derived_recompute', 'verdict_only', 'set_based_join_update', 'set_based_null_retract',
]);

/**
 * Tables some converted descriptor declares an INSERTING write target on (its row producer is
 * converted). Sorted, unique.
 * @param {object[]} descriptors converted descriptors
 * @returns {string[]}
 */
export function convertedInserterTables(descriptors) {
  const out = new Set();
  for (const d of descriptors || []) {
    const writes = d && d.outputs && Array.isArray(d.outputs.writes) ? d.outputs.writes : [];
    for (const w of writes) {
      if (w && w.table && w.write_discipline && ROW_INSERTING_CLASSES.includes(w.write_discipline.class)) out.add(w.table);
    }
  }
  return [...out].sort();
}

/**
 * MQ-A5 predicate: an `unproduced:<file>:<table>.<column>` read is HARD when its table has a converted
 * inserter; otherwise its row producer is unconverted — no descriptor exists to carry the declaration —
 * and it is reported as `UNPRODUCED-UNWITNESSED:<file>:<table>.<column>` (printed, counted every run,
 * ceiling-locked, report-only). It goes hard by itself when the inserter converts. Never a column list.
 * Order preserved.
 * @param {string[]} unproduced
 * @param {Iterable<string>} inserterTables
 * @returns {{hard: string[], unwitnessed: string[]}}
 */
export function splitUnproduced(unproduced, inserterTables) {
  const tables = new Set(inserterTables || []);
  const hard = [];
  const unwitnessed = [];
  for (const item of unproduced || []) {
    const rest = item.slice('unproduced:'.length);
    const idx = rest.lastIndexOf(':');
    const tableColumn = rest.slice(idx + 1);
    const table = tableColumn.slice(0, tableColumn.indexOf('.'));
    if (tables.has(table)) hard.push(item);
    else unwitnessed.push(`UNPRODUCED-UNWITNESSED:${rest}`);
  }
  return { hard, unwitnessed };
}

export const CONSUMER_REGISTRY_REL_PATH = 'scripts/steps/_schema/consumer-registry.json';
export const FUNNEL_REL_PATH = 'src/lib/admin/funnel.ts';
export const FUNNEL_CONSUMER = 'src/components/FreshnessTimeline.tsx';
const GOLDEN_DIR_REL = 'docs/reports/golden';
const kebab = (slug) => String(slug).replace(/_/g, '-');

/**
 * A step-independent `records_meta` key stamped by the RUNNER/CHAIN layer,
 * outside any per-step `emits[]` declaration — the CHAIN-level counterpart of
 * gate C's `RUNNER_META_KEYS`. Every entry's citation was grep-verified
 * 2026-09-26 (`grep -n "<key>" <file>`) before being listed — an unverified
 * guess belongs in a ledger row, never in this set.
 */
export const CHAIN_META_KEYS = Object.freeze({
  step_verdicts: 'scripts/run-chain.js:1101 (metaObj.step_verdicts = stepVerdicts)',
  step_completeness: 'scripts/run-chain.js:1143 (metaObj.step_completeness = {...})',
  last_heartbeat_at: "scripts/lib/step/index.js:2866 ('last_heartbeat_at', now() — heartbeat ticker SQL)",
  failed_sample: 'scripts/lib/pipeline.js:443 (payload.failed_sample = stats.failed_sample.slice(0, 20))',
  gated_skip: 'scripts/lib/source-version.js:471 (buildSkipGateRecordsMeta: gated_skip: true)',
  pipeline_meta: 'scripts/run-chain.js:946 (recordsMeta = { ...(recordsMeta || {}), pipeline_meta: pipelineMeta })',
  telemetry: 'scripts/run-chain.js:956 (recordsMeta = { ...(recordsMeta || {}), telemetry })',
  skipped: "scripts/lib/pipeline.js:1068 (records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' } — the advisory-lock SKIP summary)",
  reason: "scripts/lib/pipeline.js:1068 (records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' } — the advisory-lock SKIP summary)",
  capture: 'scripts/analysis/capture-ledger.js:191 (records_meta: { ...child records_meta, capture: stamp } — the golden-capture harness recorder, Spec 120 §3.2b `captured`)',
});

/** Corpus roots the completeness scan walks (Rule 10/R-T closed corpus). */
const CORPUS_DIRS = ['src/lib/admin', 'src/components', 'src/app'];
/**
 * LDG-10 class-2 residual (WF1 LDG-10, 2026-10-03): EVERY source file under scripts/ — the four
 * previously-named chain scripts are inside it. The schema fixtures are excluded: they are
 * known-bad descriptor/compute fixtures, never readers.
 */
const SCRIPTS_CORPUS_ROOT = 'scripts';
const SCRIPTS_CORPUS_EXCLUDE = ['scripts/steps/_schema/fixtures/'];
const SCAN_EXT_RE = /\.(ts|tsx|js|mjs|cjs)$/;
const SCAN_RE = /records_meta(?:\?\.|\.|->>?'|\[')([a-z_]+)/g;

// The COMPLETENESS scan's extra read FORMS, alongside the regex above — a single
// line may carry several, so their keys are unioned per line (never double-counted).
//   PAREN — `(r.records_meta || {}).key` / `(r.records_meta ?? {}).key`
//   CAST  — `(s?.records_meta as Record<string, unknown>)?.key`
//   SQL   — `records_meta -> 'key'` and `records_meta #>> '{key,...}'`
const PAREN_RE = /records_meta\s*(?:\|\||\?\?)\s*\{\}\s*\)\s*(?:\?\.|\.)\s*([a-z_]+)/g;
const CAST_RE = /records_meta\s+as\s+[^)]*\)\s*(?:\?\.|\.)\s*([a-z_]+)/g;
const SQL_RE = /records_meta\s*->>?\s*'([a-z_]+)'|records_meta\s*#>>?\s*'\{([a-z_]+)/g;
// The ALIAS declaration forms (the initializer must END at `records_meta`,
// optionally `|| {}` / `?? {}` / `as T` / `)`); a later line's `X.key`/`X['key']`
// then reads a key too, until `X` is redeclared on a line of its own.
const ALIAS_DECL_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*[^;]*?\brecords_meta\s*(?:(?:\|\||\?\?)\s*\{\}\s*\)?\s*|as\s+[^;()?.\[\]{}]*?)?;?\s*$/;
const aliasRedecl = (name) => new RegExp(
  `(?:const|let|var)\\s+${name}\\b`
  + `|\\bfunction\\b[^(]*\\([^)]*(?<![\\w$])${name}(?![\\w$])[^)]*\\)`
  + `|\\(([^()]*,\\s*)?${name}\\s*(,[^()]*)?\\)\\s*=>`
  + `|(?<![\\w$.])${name}\\s*=>`,
);
const aliasDotUse = (name) => new RegExp(`(?<![\\w$.])${name}(?:\\?\\.|\\.)([a-z_]+)`, 'g');
const aliasIdxUse = (name) => new RegExp(`(?<![\\w$.])${name}\\[['"]([a-z_]+)['"]\\]`, 'g');

function walkDir(absDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) walkDir(abs, out);
    else if (SCAN_EXT_RE.test(entry.name)) out.push(abs);
  }
}

/** Every file in the closed completeness-scan corpus, absolute paths. */
export function collectCorpusFiles(repoRoot = REPO_ROOT) {
  const out = [];
  for (const rel of CORPUS_DIRS) walkDir(path.join(repoRoot, rel), out);
  const scripts = [];
  walkDir(path.join(repoRoot, SCRIPTS_CORPUS_ROOT), scripts);
  for (const abs of scripts) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    if (SCRIPTS_CORPUS_EXCLUDE.some((prefix) => rel.startsWith(prefix))) continue;
    out.push(abs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source 1 — funnel
// ---------------------------------------------------------------------------

/**
 * Parse `FUNNEL_SOURCES` out of `funnel.ts` by REGEX over its own array block —
 * never `require`d (it is a `.ts` ES module with no build step here). One
 * object literal per line (the file's own convention). The lock: parsed entry
 * count must equal the count of `{ id:` occurrences in that block, or a line's
 * shape drifted from "one literal per line" and a silent skip would under-count.
 * @param {string} [repoRoot]
 * @returns {Array<{id:string, statusSlug:string|null, auditMetric?:string, auditValuePath?:string}>}
 */
export function parseFunnelSources(repoRoot = REPO_ROOT) {
  const text = fs.readFileSync(path.join(repoRoot, FUNNEL_REL_PATH), 'utf8');
  const start = text.indexOf('export const FUNNEL_SOURCES');
  if (start === -1) throw new Error(`FUNNEL_SOURCES not found in ${FUNNEL_REL_PATH}`);
  const closeRel = text.indexOf('\n];', start);
  if (closeRel === -1) throw new Error(`FUNNEL_SOURCES array has no closing "];" in ${FUNNEL_REL_PATH}`);
  const block = text.slice(start, closeRel);
  const idHits = block.match(/\{\s*id:/g) || [];
  const entries = [];
  for (const line of block.split(/\r?\n/)) {
    const idMatch = line.match(/\{\s*id:\s*'([^']+)'/);
    if (!idMatch) continue;
    const statusSlugMatch = line.match(/statusSlug:\s*'([^']+)'/);
    const auditMetricMatch = line.match(/auditMetric:\s*'([^']+)'/);
    const auditValuePathMatch = line.match(/auditValuePath:\s*'([^']+)'/);
    entries.push({
      id: idMatch[1],
      statusSlug: statusSlugMatch ? statusSlugMatch[1] : null,
      ...(auditMetricMatch ? { auditMetric: auditMetricMatch[1] } : {}),
      ...(auditValuePathMatch ? { auditValuePath: auditValuePathMatch[1] } : {}),
    });
  }
  if (entries.length !== idHits.length) {
    throw new Error(`FUNNEL_SOURCES parse count mismatch: ${entries.length} parsed vs ${idHits.length} "{ id:" occurrences — a line's shape drifted from one-literal-per-line`);
  }
  return entries;
}

/** One `funnel` row per entry that declares an `auditMetric`. */
export function buildFunnelRows(entries) {
  return entries
    .filter((e) => e.auditMetric)
    .map((e) => ({
      consumer: FUNNEL_CONSUMER,
      producer: e.statusSlug,
      kind: 'audit_metric',
      key: e.auditMetric,
      value: 'percent',
      ...(e.auditValuePath ? { value_path: e.auditValuePath } : {}),
      source: 'funnel',
    }));
}

// ---------------------------------------------------------------------------
// Sources 2-4 — emits[].consumers / counters[].source / staleness.trigger
// ---------------------------------------------------------------------------

/** One `emits` row per (declared emit key, declared consumer) pair. */
export function buildEmitsRows(descriptors) {
  const rows = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) {
    const slug = d && d.identity && d.identity.name;
    if (!slug || !Array.isArray(d.emits)) continue;
    for (const e of d.emits) {
      if (!e || typeof e.key !== 'string' || !Array.isArray(e.consumers)) continue;
      for (const consumer of e.consumers) {
        if (typeof consumer === 'string' && consumer) {
          rows.push({ consumer, producer: slug, kind: 'records_meta', key: e.key, value: 'any', source: 'emits' });
        }
      }
    }
  }
  return rows;
}

/** One self-consumed `counters` row per `counters.<slot>.source === "records_meta.<key>"`. */
export function buildCountersRows(descriptors) {
  const rows = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) {
    const slug = d && d.identity && d.identity.name;
    const counters = d && d.counters;
    if (!slug || !counters || typeof counters !== 'object') continue;
    for (const cfg of Object.values(counters)) {
      const src = cfg && cfg.source;
      if (typeof src !== 'string') continue;
      // 0x fold (library counter defect): a DECLARED SUM source contributes one row per
      // records_meta.<key> TERM; each is resolved by the runtime's resolveCounterSource below.
      for (const term of src.split('+').map((t) => t.trim())) {
        if (!term.startsWith('records_meta.')) continue;
        const key = term.slice('records_meta.'.length);
        if (key) rows.push({ consumer: slug, producer: slug, kind: 'records_meta', key, value: 'any', source: 'counters' });
      }
    }
  }
  return rows;
}

/** One self-consumed `trigger` row per `staleness.trigger[].emit_key` (the B3 class). */
export function buildTriggerRows(descriptors) {
  const rows = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) {
    const slug = d && d.identity && d.identity.name;
    const triggers = d && d.staleness && d.staleness.trigger;
    if (!slug || !Array.isArray(triggers)) continue;
    for (const t of triggers) {
      if (t && typeof t.emit_key === 'string' && t.emit_key) {
        rows.push({ consumer: slug, producer: slug, kind: 'records_meta', key: t.emit_key, value: 'any', source: 'trigger' });
      }
    }
  }
  return rows;
}

const rowSortKey = (r) => `${r.consumer}\u0000${r.producer}\u0000${r.kind}\u0000${r.key}\u0000${r.source}`;

// ---------------------------------------------------------------------------
// Source 5 — src/ SQL readers (`src_sql`)
// ---------------------------------------------------------------------------

/** `true` iff every declared writer row is usable (an object with a `writes` map). */
const writersOf = (step) => (step && typeof step.writes === 'object' && step.writes) || {};

/**
 * One `table` row per (static-parsed src/ SQL read column, effective-ledger
 * column writer). Every `effective.src[file].reads[table]` column that >=1
 * `effective.inchain` step declares writing becomes one row PER such writer;
 * the write declaration is COLUMN-granular — for a converted step
 * `deriveMeta(descriptor).writes` already lists every declared write column,
 * INCLUDING a `written: "db_default"` one (the ruled channel an id-like
 * DB-default column resolves through). Sorted file -> table -> column -> slug.
 * @param {{inchain?: object, src?: object}} effective the effective ledger
 * @returns {Array<{consumer:string, producer:string, kind:string, key:string, value:string, source:string}>}
 */
export function buildSrcTableRows(effective) {
  const inchain = (effective && effective.inchain) || {};
  const src = (effective && effective.src) || {};
  const writers = Object.entries(inchain).map(([slug, row]) => [slug, writersOf(row)]);
  const rows = [];
  for (const file of Object.keys(src).sort()) {
    const reads = src[file] && typeof src[file].reads === 'object' ? src[file].reads || {} : {};
    for (const table of Object.keys(reads).sort()) {
      const cols = Array.isArray(reads[table]) ? reads[table] : [];
      for (const column of [...cols].sort()) {
        for (const [slug, writes] of writers) {
          if (Array.isArray(writes[table]) && writes[table].includes(column)) {
            rows.push({ consumer: file, producer: slug, kind: 'table', key: `${table}.${column}`, value: 'any', source: 'src_sql' });
          }
        }
      }
    }
  }
  return rows;
}

/**
 * Every src/ SQL read whose TABLE is written by >=1 `effective.inchain` step but
 * whose COLUMN no step declares writing — sorted, unique
 * `unproduced:<file>:<table>.<column>`. A read of a table NO step writes is not
 * a step table at all and is never counted here (it belongs to the completeness
 * scan, not to this posture).
 * @param {{inchain?: object, src?: object}} effective the effective ledger
 * @returns {string[]}
 */
export function unproducedReads(effective) {
  const inchain = (effective && effective.inchain) || {};
  const src = (effective && effective.src) || {};
  const writerWrites = Object.values(inchain).map((row) => writersOf(row));
  const out = new Set();
  for (const file of Object.keys(src).sort()) {
    const reads = src[file] && typeof src[file].reads === 'object' ? src[file].reads || {} : {};
    for (const table of Object.keys(reads).sort()) {
      const cols = Array.isArray(reads[table]) ? reads[table] : [];
      const tableIsWritten = writerWrites.some((writes) => Object.prototype.hasOwnProperty.call(writes, table));
      if (!tableIsWritten) continue;
      for (const column of cols) {
        const columnIsWritten = writerWrites.some((writes) => Array.isArray(writes[table]) && writes[table].includes(column));
        if (!columnIsWritten) out.add(`unproduced:${file}:${table}.${column}`);
      }
    }
  }
  return [...out].sort();
}

/** Build the whole registry, deterministic order, from the five sources. DISK. */
export function buildRegistry(repoRoot = REPO_ROOT) {
  const descriptors = loadConvertedDescriptors(repoRoot);
  const funnelEntries = parseFunnelSources(repoRoot);
  const rows = [
    ...buildFunnelRows(funnelEntries),
    ...buildEmitsRows(descriptors),
    ...buildCountersRows(descriptors),
    ...buildTriggerRows(descriptors),
    ...buildSrcTableRows(effectiveLedger()),
  ].sort((a, b) => (rowSortKey(a) < rowSortKey(b) ? -1 : rowSortKey(a) > rowSortKey(b) ? 1 : 0));
  return {
    contract_version: 1,
    generated_from: [
      FUNNEL_REL_PATH,
      "<converted descriptor>.emits[].consumers",
      '<converted descriptor>.counters[].source',
      '<converted descriptor>.staleness.trigger[]',
      'scripts/steps/_schema/src-sql-ledger.json × effectiveLedger() column writers',
    ],
    rows,
  };
}

export function writeRegistry(repoRoot = REPO_ROOT) {
  const registry = buildRegistry(repoRoot);
  fs.writeFileSync(path.join(repoRoot, CONSUMER_REGISTRY_REL_PATH), `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

export function readRegistry(repoRoot = REPO_ROOT) {
  const abs = path.join(repoRoot, CONSUMER_REGISTRY_REL_PATH);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    throw new Error(`consumer-registry.json unreadable at ${CONSUMER_REGISTRY_REL_PATH}: ${e.message}`);
  }
  return JSON.parse(text);
}

/** `--check`: regenerate in memory, deep-compare to disk. Returns the first differing row, if any. */
export function checkRegistryFresh(repoRoot = REPO_ROOT) {
  const fresh = buildRegistry(repoRoot);
  const onDisk = readRegistry(repoRoot);
  const freshText = JSON.stringify(fresh.rows);
  const diskText = JSON.stringify(onDisk.rows);
  if (freshText === diskText && onDisk.contract_version === fresh.contract_version) {
    return { fresh: true, firstDiff: null };
  }
  const n = Math.max(fresh.rows.length, onDisk.rows.length);
  for (let i = 0; i < n; i += 1) {
    if (JSON.stringify(fresh.rows[i]) !== JSON.stringify(onDisk.rows[i])) {
      return { fresh: false, firstDiff: { index: i, generated: fresh.rows[i] || null, onDisk: onDisk.rows[i] || null } };
    }
  }
  return { fresh: false, firstDiff: null };
}

// ---------------------------------------------------------------------------
// Closed-set checks — present + typed (producer side)
// ---------------------------------------------------------------------------

/** `true` iff `v` is a finite number, or a string matching `-?\d+(\.\d+)?%`. */
export function isFiniteNumberOrPercent(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return /^-?\d+(\.\d+)?%$/.test(v);
  return false;
}

/**
 * Union, across every `*.json` in a step's golden `post/` dir, of its top-level
 * `records_meta` keys and its `audit_table.rows[].metric -> value[]` (every
 * VALUE seen for that metric across captures, since "≥1 capture" may need to be
 * a specific one — e.g. `link_wsib`'s `link_rate_warn` only appears in the
 * force-full capture). Returns `null` when the dir does not exist (unmeasurable).
 * Also collects each capture's raw `records_meta` OBJECT into `metas`, so a DOTTED
 * key (a `counters.<slot>.source`) can be resolved like the runtime does.
 * @param {string} dir
 * @returns {{metaKeys:Set<string>, metrics:Map<string,unknown[]>, metas:object[]}|null}
 */
export function loadGoldenAuditIndex(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const metaKeys = new Set();
  const metrics = new Map();
  const metas = [];
  for (const name of entries.filter((f) => f.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    const meta = parsed && parsed.summary && parsed.summary.records_meta;
    if (!meta || typeof meta !== 'object') continue;
    metas.push(meta);
    for (const k of Object.keys(meta)) metaKeys.add(k);
    const at = meta.audit_table;
    const rows = at && Array.isArray(at.rows) ? at.rows : [];
    for (const r of rows) {
      if (!r || typeof r.metric !== 'string') continue;
      if (!metrics.has(r.metric)) metrics.set(r.metric, []);
      metrics.get(r.metric).push(r.value);
    }
  }
  return { metaKeys, metrics, metas };
}

/**
 * Present + typed, for ONE registry row, against ONE step's already-loaded
 * golden index (`loadGoldenAuditIndex`'s return, or `null`). PURE.
 * @param {object} row a registry row
 * @param {{metaKeys:Set<string>, metrics:Map<string,unknown[]>, metas?:object[]}|null} index
 */
export function rowPresentTyped(row, index) {
  // A `table` row exists only where a declared writer exists, so its closed
  // check is the registry freshness `--check` (a dropped write or a changed read
  // regenerates the rows) — there is no per-step golden to consult.
  if (row.kind === 'table') return { ok: true };
  if (!index) return { ok: false, reason: `no golden POST captures for "${row.producer}"` };
  if (row.kind === 'records_meta') {
    // A DOTTED key is a `counters.<slot>.source` path, not a top-level key — resolved
    // by the runtime's OWN `resolveCounterSource` (imported, never mirrored) against
    // each capture's raw `records_meta`. The top-level path below stays byte-identical.
    if (row.key.includes('.')) {
      const metas = Array.isArray(index.metas) ? index.metas : [];
      const slot = { source: `records_meta.${row.key}` };
      if (!metas.some((m) => resolveCounterSource(slot, { records_meta: m }) !== null)) {
        return { ok: false, reason: `records_meta.${row.key} does not resolve to a finite number (the runtime counter resolution, resolveCounterSource) in any POST golden of "${row.producer}"` };
      }
      return { ok: true };
    }
    if (!index.metaKeys.has(row.key)) {
      return { ok: false, reason: `records_meta.${row.key} absent from every POST golden of "${row.producer}"` };
    }
    return { ok: true };
  }
  const values = index.metrics.get(row.key);
  if (!values || values.length === 0) {
    return { ok: false, reason: `audit_table metric "${row.key}" absent from every POST golden of "${row.producer}"` };
  }
  const typedOk = values.some((v) => {
    const target = row.value_path ? (v && typeof v === 'object' ? v[row.value_path] : undefined) : v;
    if (row.value === 'percent') return isFiniteNumberOrPercent(target);
    if (row.value === 'number') return typeof target === 'number' && Number.isFinite(target);
    return target !== undefined;
  });
  if (!typedOk) {
    return {
      ok: false,
      reason: `audit_table metric "${row.key}" present but not typed as ${row.value}`
        + (row.value_path ? ` at value.${row.value_path}` : '') + ` for "${row.producer}"`,
    };
  }
  return { ok: true };
}

/**
 * Every producer-side gate-D violation, over registry rows whose producer IS a
 * converted step (`convertedSlugs`); a row whose producer is NOT converted is
 * `unconverted_producer` and is never checked. PURE.
 * @param {{rows: object[]}} registry
 * @param {Map<string, object|null>} indexes producer slug -> `loadGoldenAuditIndex` result
 * @param {Set<string>} convertedSlugs
 */
export function registryViolations(registry, indexes, convertedSlugs) {
  const violations = [];
  for (const row of Array.isArray(registry && registry.rows) ? registry.rows : []) {
    if (!convertedSlugs.has(row.producer)) continue;
    const status = rowPresentTyped(row, indexes.get(row.producer) || null);
    if (!status.ok) {
      violations.push({ step: row.producer, item: `${row.consumer}->${row.producer}.${row.key}`, detail: status.reason });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Completeness scan (consumer side) — never the source of rows
// ---------------------------------------------------------------------------

/** Every gate-D completeness violation in ONE file's text. PURE. */
export function scanText(relPath, text, declaredKeysForFile) {
  const violations = [];
  const lines = String(text).split(/\r?\n/);
  // The alias names a live declaration has established so far (cleared by their
  // own redeclaration line). A `const X = ...records_meta...` declares one.
  const liveAliases = new Set();
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
    // ONE Set per line: a key named by several forms on one line is reported once.
    const keys = new Set();
    const add = (re) => {
      const scan = new RegExp(re.source, re.flags);
      let m;
      while ((m = scan.exec(line))) keys.add(m[1] || m[2]);
    };
    add(SCAN_RE);
    add(PAREN_RE);
    add(CAST_RE);
    add(SQL_RE);
    for (const name of liveAliases) {
      add(aliasDotUse(name));
      add(aliasIdxUse(name));
    }
    // A redeclaration of a live alias name ends it, whether or not this line is
    // itself a new records_meta alias declaration.
    for (const name of [...liveAliases]) if (aliasRedecl(name).test(line)) liveAliases.delete(name);
    const decl = line.match(ALIAS_DECL_RE);
    if (decl) liveAliases.add(decl[1].replace(/\$/g, '\\$')); // stored regex-escaped (`$` is legal in a JS name)
    for (const key of keys) {
      if (RUNNER_META_KEYS_SET.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(CHAIN_META_KEYS, key)) continue;
      if (declaredKeysForFile && declaredKeysForFile.has(key)) continue;
      violations.push({
        step: '(registry)',
        item: `scan.${relPath}.${key}`,
        file: relPath,
        key,
        line: i + 1,
        detail: `${relPath}:${i + 1} reads records_meta.${key} — not in RUNNER_META_KEYS, CHAIN_META_KEYS, or a registry row whose consumer is this file (undeclared-consumer)`,
      });
    }
  });
  return violations;
}

/**
 * file (repo-relative) → Set of manifest slugs whose §4.1 files include it (`stepFiles`: step file,
 * descriptor, notes sidecar, compute module — the SAME set the step registry derives). A registry row
 * whose consumer is a SLUG covers every one of these files (LDG-10: `enrich_heritage` covers
 * `scripts/lib/compute/enrich-heritage.js`). DISK.
 * @param {string} [repoRoot]
 * @returns {Map<string, Set<string>>}
 */
export function stepFileOwners(repoRoot = REPO_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/manifest.json'), 'utf8'));
  const owners = new Map();
  for (const [slug, entry] of Object.entries(manifest.scripts || {})) {
    if (!entry || typeof entry.file !== 'string') continue;
    for (const f of stepFiles({ slug, file: entry.file }, repoRoot).files) {
      if (!owners.has(f)) owners.set(f, new Set());
      owners.get(f).add(slug);
    }
  }
  return owners;
}

/**
 * O3 (operator 2026-10-03) — split raw completeness hits. PURE.
 *   - key emitted by a CONVERTED producer (`convertedEmitKeys`) → RED (declare the consumer on that producer).
 *   - else key FOUND in an unconverted producer's source on a non-comment line that is NOT itself a
 *     read of that key → LISTED `unconverted_producer:<reader file>:<key>` (counted every run).
 *   - else → RED (no producer is known to stamp it).
 * The listing closes itself: once the producer converts, its key is in `convertedEmitKeys` (RED until
 * the consumer is declared) or is no longer found in an unconverted source (RED).
 * @param {Array<{step:string,item:string,detail:string,file:string,key:string,line:number}>} violations
 * @param {{convertedEmitKeys: Set<string>, producerSources: Array<{file:string,text:string}>}} ctx
 * @returns {{red: Array<{step:string,item:string,detail:string,file:string,key:string,line:number}>, listed: Array<{step:string,item:string,detail:string,file:string,key:string,line:number}>}}
 */
export function classifyUndeclared(violations, { convertedEmitKeys, producerSources }) {
  const red = [];
  const listed = [];
  const foundIn = new Map();
  const producersOf = (key) => {
    if (foundIn.has(key)) return foundIn.get(key);
    const word = new RegExp(`(?<![\\w$])${key}(?![\\w$])`);
    const hits = [];
    for (const src of producerSources) {
      const readLines = new Set(scanText(src.file, src.text, new Set()).filter((v) => v.key === key).map((v) => v.line));
      const lines = String(src.text).split(/\r?\n/);
      const found = lines.some((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('#')) return false;
        return !readLines.has(i + 1) && word.test(line);
      });
      if (found) hits.push(src.file);
    }
    foundIn.set(key, hits);
    return hits;
  };
  for (const v of violations) {
    if (!v.key) { red.push(v); continue; }
    if (convertedEmitKeys.has(v.key)) { red.push(v); continue; }
    const producers = producersOf(v.key);
    if (producers.length > 0) {
      listed.push({ ...v, item: `unconverted_producer:${v.file}:${v.key}`, detail: `${v.detail.split(' — ')[0]} — key found in unconverted producer source ${producers.join(', ')} (O3: listed until that producer converts)` });
    } else {
      red.push({ ...v, detail: `${v.detail} — no converted producer emits it and no unconverted producer source stamps it` });
    }
  }
  return { red, listed };
}

/** The O3 inputs, from disk: converted emit keys + every unconverted manifest step's non-JSON §4.1 file text. */
function undeclaredContext(repoRoot) {
  const convertedEmitKeys = new Set();
  for (const d of loadConvertedDescriptors(repoRoot)) {
    for (const e of Array.isArray(d && d.emits) ? d.emits : []) if (e && typeof e.key === 'string') convertedEmitKeys.add(e.key);
  }
  const convertedFiles = new Set((readConvertedJson(repoRoot).converted || []).map((f) => String(f).split(path.sep).join('/')));
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/manifest.json'), 'utf8'));
  const producerSources = [];
  const seen = new Set();
  for (const [slug, entry] of Object.entries(manifest.scripts || {})) {
    if (!entry || typeof entry.file !== 'string' || convertedFiles.has(entry.file)) continue;
    for (const f of stepFiles({ slug, file: entry.file }, repoRoot).files) {
      if (f.endsWith('.json') || seen.has(f)) continue;
      seen.add(f);
      try {
        producerSources.push({ file: f, text: fs.readFileSync(path.join(repoRoot, f), 'utf8') });
      } catch {
        // stepFiles only lists files that exist; an unreadable one contributes no source.
      }
    }
  }
  return { convertedEmitKeys, producerSources };
}

/**
 * The completeness scan split into RED + LISTED (O3). DISK.
 * @returns {{red: Array<{step:string,item:string,detail:string,file:string,key:string,line:number}>, listed: Array<{step:string,item:string,detail:string,file:string,key:string,line:number}>}}
 */
export function scanConsumersDetailed(registry, repoRoot = REPO_ROOT) {
  const consumerKeys = new Map();
  for (const row of Array.isArray(registry && registry.rows) ? registry.rows : []) {
    if (!consumerKeys.has(row.consumer)) consumerKeys.set(row.consumer, new Set());
    consumerKeys.get(row.consumer).add(row.key);
  }
  const owners = stepFileOwners(repoRoot);
  const raw = [];
  for (const abs of collectCorpusFiles(repoRoot)) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const declared = new Set(consumerKeys.get(rel) || []);
    for (const slug of owners.get(rel) || []) for (const k of consumerKeys.get(slug) || []) declared.add(k);
    raw.push(...scanText(rel, text, declared));
  }
  return classifyUndeclared(raw, undeclaredContext(repoRoot));
}

/** Every LISTED `unconverted_producer:<file>:<key>` item (O3), sorted. DISK. */
export function unconvertedProducerReads(registry, repoRoot = REPO_ROOT) {
  return [...new Set(scanConsumersDetailed(registry, repoRoot).listed.map((v) => v.item))].sort();
}

/**
 * The completeness scan over the whole corpus. DISK for the file walk + reads.
 * RED half only — LISTED (O3) items are counted by unconvertedProducerReads.
 * @returns {Array<{step:string,item:string,detail:string,file:string,key:string,line:number}>}
 */
export function scanConsumers(registry, repoRoot = REPO_ROOT) {
  return scanConsumersDetailed(registry, repoRoot).red;
}

/**
 * Gate D over the whole registry + corpus. An ORPHAN makes `pass` false (R-X).
 * @param {{rows: object[]}} registry
 * @param {string} [repoRoot]
 * @param {{effective?: {inchain?: object, src?: object}, posture?: {mode: string, flips_hard_at: string}, inserterTables?: Iterable<string>}} [opts]
 */
export function allConsumerViolations(registry, repoRoot = REPO_ROOT, { effective, posture = UNPRODUCED_POSTURE, inserterTables } = {}) {
  const convertedSlugs = new Set(loadConvertedDescriptors(repoRoot).map((d) => d.identity && d.identity.name));
  const indexes = new Map();
  for (const slug of convertedSlugs) indexes.set(slug, loadGoldenAuditIndex(path.join(repoRoot, GOLDEN_DIR_REL, slug, 'post')));
  const violations = [
    ...registryViolations(registry, indexes, convertedSlugs),
    ...scanConsumers(registry, repoRoot),
  ];
  if (posture && posture.mode === 'hard') {
    for (const item of splitUnproduced(unproducedReads(effective || effectiveLedger()), inserterTables || convertedInserterTables(loadConvertedDescriptors(repoRoot))).hard) {
      const rest = item.slice('unproduced:'.length);
      const idx = rest.lastIndexOf(':');
      const file = rest.slice(0, idx);
      const tableColumn = rest.slice(idx + 1);
      violations.push({
        step: '(registry)',
        item: `unproduced.${file}.${tableColumn}`,
        detail: `${file} reads ${tableColumn} — no step declares writing it (UNPRODUCED_POSTURE hard)`,
      });
    }
  }
  return violations;
}

/**
 * @param {{rows: object[]}} registry
 * @param {object[]} ledgerRows
 * @param {string} [repoRoot]
 * @param {{effective?: {inchain?: object, src?: object}, posture?: {mode: string, flips_hard_at: string}, inserterTables?: Iterable<string>}} [opts]
 */
export function checkConsumerContracts(registry, ledgerRows, repoRoot = REPO_ROOT, { effective, posture = UNPRODUCED_POSTURE, inserterTables } = {}) {
  const violations = allConsumerViolations(registry, repoRoot, { effective, posture, inserterTables });
  const unproduced = unproducedReads(effective || effectiveLedger());
  const split = splitUnproduced(unproduced, inserterTables || convertedInserterTables(loadConvertedDescriptors(repoRoot)));
  const { unallowed, orphans, allowed } = matchLedger('D', violations, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const where = (v) => `${v.step} ${v.item}`;
  const unproducedLine = `; ${unproduced.length} unproduced src read(s) (${posture.mode} until ${posture.flips_hard_at}) [${unproduced.join('; ')}]`
    + `; UNPRODUCED-UNWITNESSED: ${split.unwitnessed.length} (report-only until the table's inserter converts) [${split.unwitnessed.join('; ')}]`;
  const listed = unconvertedProducerReads(registry, repoRoot);
  const listedLine = `; ${listed.length} unconverted-producer read(s) listed (O3, red once the producer converts) [${listed.join('; ')}]`;
  const detail = (unallowed.length || orphans.length)
    ? `CONSUMER-REGISTRY (gate D): ${unallowed.length} unallowed contract violation(s)`
      + (unallowed.length ? ` [${unallowed.map(where).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)` + (orphans.length ? ` [${orphans.map(where).join('; ')}]` : '')
      + unproducedLine
      + listedLine
    : `CONSUMER-REGISTRY (gate D): ${violations.length} contract(s) checked, all closed `
      + `(${allowed.length} ledger-allowed, ${violations.length - allowed.length} present+typed/excluded)`
      + unproducedLine
      + listedLine;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed, unproduced, unproducedHard: split.hard, unproducedUnwitnessed: split.unwitnessed, listed };
}

/** Both halves, disk-backed — what `step-validate.mjs` calls. Also verifies the registry is fresh (`--check`). */
export function checkConsumerRegistry(repoRoot, ledgerRows) {
  // Item 1 (gates from ①): with a pending step evaluated as-converted, the COMMITTED
  // registry is still checked fresh against the committed set, and the contracts are
  // checked on the registry the cutover will generate (built in memory, overlay on).
  const overlay = asConvertedFiles().length > 0;
  const fresh = withCommittedSet(() => checkRegistryFresh(repoRoot));
  if (!fresh.fresh) {
    return {
      pass: false,
      blockedSlugs: ['(registry)'],
      detail: `CONSUMER-REGISTRY (gate D): ${CONSUMER_REGISTRY_REL_PATH} is stale against its four generation sources`
        + (fresh.firstDiff ? ` (first diff at row ${fresh.firstDiff.index}: ${JSON.stringify(fresh.firstDiff.generated)} vs on-disk ${JSON.stringify(fresh.firstDiff.onDisk)})` : ' (row count differs)')
        + ' — run `node scripts/analysis/gates/consumer-registry.mjs --write`.',
      unallowed: [],
      orphans: [],
      allowed: [],
    };
  }
  return checkConsumerContracts(overlay ? buildRegistry(repoRoot) : readRegistry(repoRoot), ledgerRows, repoRoot);
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const idx = (metaKeys, metricsObj, metas = []) => ({
    metaKeys: new Set(metaKeys),
    metrics: new Map(Object.entries(metricsObj).map(([k, arr]) => [k, arr])),
    metas,
  });
  const funnelRow = (over = {}) => ({ consumer: FUNNEL_CONSUMER, producer: 'link_wsib', kind: 'audit_metric', key: 'link_rate_warn', value: 'percent', source: 'funnel', ...over });

  // (1/B1 shape) metric absent from every capture -> RED.
  const r1 = rowPresentTyped(funnelRow(), idx([], {}));
  if (r1.ok) throw new Error('self-test FAILED (1): absent metric reported present');

  // (2/B2 shape) metric present as an object, NO value_path declared -> RED (the
  // object itself is neither a finite number nor a percent string).
  const r2 = rowPresentTyped(funnelRow(), idx([], { link_rate_warn: [{ link_rate_pct: 94.4 }] }));
  if (r2.ok) throw new Error('self-test FAILED (2): un-pathed object value reported typed');

  // (3) same data, WITH value_path -> GREEN.
  const r3 = rowPresentTyped(funnelRow({ value_path: 'link_rate_pct' }), idx([], { link_rate_warn: [{ link_rate_pct: 94.4 }] }));
  if (!r3.ok) throw new Error(`self-test FAILED (3): pathed object value not typed (${JSON.stringify(r3)})`);

  // (4) a raw percent STRING (no value_path) -> GREEN.
  const r4 = rowPresentTyped(funnelRow(), idx([], { link_rate_warn: ['99.7%'] }));
  if (!r4.ok) throw new Error(`self-test FAILED (4): percent string not typed (${JSON.stringify(r4)})`);

  // (5) records_meta kind: key present -> GREEN, absent -> RED.
  const mRow = { consumer: 'link_massing', producer: 'link_massing', kind: 'records_meta', key: 'code_version', value: 'any', source: 'trigger' };
  if (!rowPresentTyped(mRow, idx(['code_version'], {})).ok) throw new Error('self-test FAILED (5a): present records_meta key reported absent');
  if (rowPresentTyped(mRow, idx([], {})).ok) throw new Error('self-test FAILED (5b): absent records_meta key reported present');

  // (5c-5f) dotted records_meta key (a counters source) resolves like the runtime's resolveCounterSource.
  const dRow = { consumer: 'load_centreline', producer: 'load_centreline', kind: 'records_meta', key: 'centreline_load.features_updated', value: 'any', source: 'counters' };
  if (!rowPresentTyped(dRow, idx(['centreline_load'], {}, [{ centreline_load: { features_updated: 0 } }])).ok) throw new Error('self-test FAILED (5c): nested finite counter reported absent');
  if (rowPresentTyped(dRow, idx(['centreline_load'], {}, [{ centreline_load: {} }])).ok) throw new Error('self-test FAILED (5d): nested leaf absent reported present');
  if (rowPresentTyped(dRow, idx(['centreline_load'], {}, [{ centreline_load: { features_updated: '0' } }])).ok) throw new Error('self-test FAILED (5e): nested non-number leaf reported typed');
  if (rowPresentTyped(dRow, idx([], {}, [{}])).ok) throw new Error('self-test FAILED (5f): top-level miss on a dotted key reported present');
  if (rowPresentTyped(mRow, idx([], {}, [{ code_version: 'x' }])).ok) throw new Error('self-test FAILED (5g): top-level path loosened by metas');

  // (6) unconverted producer -> not checked (registryViolations skips it).
  const registry = { rows: [{ ...funnelRow(), producer: 'classify_scope', key: 'tags_coverage_rate' }] };
  const skipped = registryViolations(registry, new Map(), new Set(['link_wsib']));
  if (skipped.length !== 0) throw new Error(`self-test FAILED (6): unconverted producer was checked (${JSON.stringify(skipped)})`);

  // (7) scan: a hit on an UNKNOWN key -> RED (undeclared-consumer).
  const RM = 'records' + '_meta';
  const s7 = scanText('fixture.ts', `  x.${RM}?.mystery_key;\n`, new Set());
  if (s7.length !== 1 || !s7[0].item.includes('mystery_key')) throw new Error(`self-test FAILED (7): unknown-key scan hit not RED (${JSON.stringify(s7)})`);

  // (8) scan: a hit on a RUNNER key -> GREEN (excluded).
  const s8 = scanText('fixture.ts', `  x.${RM}.checks_failed;\n`, new Set());
  if (s8.length !== 0) throw new Error(`self-test FAILED (8): runner-key scan hit not excluded (${JSON.stringify(s8)})`);

  // (9) scan: a hit on a CHAIN key -> GREEN (excluded).
  const s9 = scanText('fixture.ts', `  x.${RM}.step_completeness;\n`, new Set());
  if (s9.length !== 0) throw new Error(`self-test FAILED (9): chain-key scan hit not excluded (${JSON.stringify(s9)})`);

  // (10) scan: a hit declared for THIS file's own registry rows -> GREEN.
  const s10 = scanText('fixture.ts', `  x.${RM}.tables_checked;\n`, new Set(['tables_checked']));
  if (s10.length !== 0) throw new Error(`self-test FAILED (10): registry-declared scan hit not excluded (${JSON.stringify(s10)})`);

  // (11) scan: a comment line is never scanned, even naming an unknown key.
  const s11 = scanText('fixture.ts', `  // ${RM}.mystery_key is read below\n`, new Set());
  if (s11.length !== 0) throw new Error(`self-test FAILED (11): comment line scanned (${JSON.stringify(s11)})`);

  // (11b) a function PARAMETER re-binding an alias name ends the alias (LDG-10 widening).
  const s11b = scanText('fixture.js', `const m7 = r.${RM};\nm7.real_key;\nfunction f(a, m7) {\n  m7.log;\n}\n`, new Set());
  if (s11b.length !== 1 || s11b[0].key !== 'real_key') throw new Error(`self-test FAILED (11b): a parameter did not end the alias (${JSON.stringify(s11b)})`);

  // (11c) O3: converted key -> RED; found outside a read in an unconverted source -> LISTED; read-only/nowhere -> RED.
  const hit = scanText('fixture.js', `x.${RM}.one_key;\n`, new Set());
  if (classifyUndeclared(hit, { convertedEmitKeys: new Set(['one_key']), producerSources: [] }).red.length !== 1) throw new Error('self-test FAILED (11c-1): converted key not RED');
  const l = classifyUndeclared(hit, { convertedEmitKeys: new Set(), producerSources: [{ file: 'p.js', text: 'out.one_key = 1;\n' }] });
  if (l.listed.length !== 1 || l.red.length !== 0) throw new Error(`self-test FAILED (11c-2): found key not LISTED (${JSON.stringify(l)})`);
  const r = classifyUndeclared(hit, { convertedEmitKeys: new Set(), producerSources: [{ file: 'p.js', text: `y.${RM}.one_key;\n` }] });
  if (r.red.length !== 1) throw new Error('self-test FAILED (11c-3): a read-only occurrence was taken as a producer');

  // (12) orphan ledger row (no live violation) -> RED. Exercises the SAME
  // `registryViolations` + `matchLedger` pairing `checkConsumerContracts` calls,
  // over an in-memory registry/index (never touching disk — that half is
  // `checkRegistryFresh`/`checkConsumerRegistry`'s job, proven live in T3/T4).
  const orphanRow = { gate: 'D', step: 'link_wsib', item: 'src/components/FreshnessTimeline.tsx->link_wsib.link_rate_warn', disposition: 'pending_remediation', why: 'w', closing_brief: '.cursor/plan.md row D', filed: '2026-09-26', adjudicated_by: 'operator' };
  const cleanReg = { rows: [funnelRow({ value_path: 'link_rate_pct' })] };
  const idxMap = new Map([['link_wsib', idx([], { link_rate_warn: [{ link_rate_pct: 94.4 }] })]]);
  const producerViol = registryViolations(cleanReg, idxMap, new Set(['link_wsib']));
  const { unallowed, orphans } = matchLedger('D', producerViol, [orphanRow]);
  if (unallowed.length !== 0 || orphans.length !== 1) {
    throw new Error(`self-test FAILED (12): orphan row not RED (${JSON.stringify({ unallowed, orphans })})`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('consumer-registry self-test OK\n');
    return;
  }
  if (argv.includes('--write')) {
    const registry = writeRegistry(REPO_ROOT);
    process.stdout.write(`wrote ${registry.rows.length} row(s) to ${CONSUMER_REGISTRY_REL_PATH}\n`);
    return;
  }
  if (argv.includes('--check')) {
    const fresh = checkRegistryFresh(REPO_ROOT);
    if (fresh.fresh) {
      process.stdout.write(`${CONSUMER_REGISTRY_REL_PATH} is fresh\n`);
      return;
    }
    process.stderr.write(`${CONSUMER_REGISTRY_REL_PATH} is STALE: ${JSON.stringify(fresh.firstDiff)}\n`);
    process.exitCode = 1;
    return;
  }
  if (argv.includes('--list')) {
    const registry = readRegistry(REPO_ROOT);
    const violations = allConsumerViolations(registry, REPO_ROOT);
    const { unallowed } = matchLedger('D', violations, loadLedger(REPO_ROOT).rows);
    const rows = unallowed.map((u) => {
      const src = violations.find((x) => x.step === u.step && x.item === u.item) || {};
      return {
        gate: 'D', step: u.step, item: u.item, disposition: 'pending_remediation',
        why: src.detail || '',
        closing_brief: u.step === '(registry)' ? 'wf2-remediate-consumer-registry' : `wf2-remediate-${kebab(u.step)}`,
        filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator',
      };
    });
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: consumer-registry.mjs --write | --check | --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH, loadConvertedDescriptors };
