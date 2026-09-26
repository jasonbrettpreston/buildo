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
// FOUR generation sources (`buildRegistry` — deterministic, sorted):
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
// every `records_meta(?:\?\.|\.|->>?'|\[')<key>` reference in the closed corpus
// (`src/lib/admin/**`, `src/components/**`, `src/app/**`, plus the four named
// chain scripts) on a line that is not a comment must resolve to RUNNER_META_KEYS
// (gate C's export), CHAIN_META_KEYS (below — a step-independent key stamped by
// the RUNNER/CHAIN layer, each entry citing its WRITER by greppable anchor,
// verified by grep, 2026-09-26), or a registry row whose `consumer` is that same
// file. Anything else is RED `undeclared-consumer:<file>:<key>` — a real reader
// this registry does not yet know about (the `tables_checked` case:
// `step-validate.mjs` reads `assert_engine_health`'s counter with no row).
//
// `ledger.mjs` owns the row shape + the match; this file owns the four
// generation sources, the closed-set checks, and the completeness scan.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH } from './ledger.mjs';
import { loadConvertedDescriptors } from './closed-bounds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
/** The runner-owned `records_meta` keys, declared ONCE in the step library (gate C). */
const RUNNER_META_KEYS = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')).RUNNER_META_KEYS;
const RUNNER_META_KEYS_SET = new Set(RUNNER_META_KEYS);

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
});

/** Corpus roots the completeness scan walks (Rule 10/R-T closed corpus). */
const CORPUS_DIRS = ['src/lib/admin', 'src/components', 'src/app'];
const CORPUS_FILES = [
  'scripts/run-chain.js',
  'scripts/observe-chain.js',
  'scripts/check-chain-verdict.js',
  'scripts/analysis/step-validate.mjs',
];
const SCAN_EXT_RE = /\.(ts|tsx|js|mjs)$/;
const SCAN_RE = /records_meta(?:\?\.|\.|->>?'|\[')([a-z_]+)/g;

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
  for (const rel of CORPUS_FILES) out.push(path.join(repoRoot, rel));
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
      if (typeof src === 'string' && src.startsWith('records_meta.')) {
        const key = src.slice('records_meta.'.length);
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

/** Build the whole registry, deterministic order, from the four sources. DISK. */
export function buildRegistry(repoRoot = REPO_ROOT) {
  const descriptors = loadConvertedDescriptors(repoRoot);
  const funnelEntries = parseFunnelSources(repoRoot);
  const rows = [
    ...buildFunnelRows(funnelEntries),
    ...buildEmitsRows(descriptors),
    ...buildCountersRows(descriptors),
    ...buildTriggerRows(descriptors),
  ].sort((a, b) => (rowSortKey(a) < rowSortKey(b) ? -1 : rowSortKey(a) > rowSortKey(b) ? 1 : 0));
  return {
    contract_version: 1,
    generated_from: [
      FUNNEL_REL_PATH,
      "<converted descriptor>.emits[].consumers",
      '<converted descriptor>.counters[].source',
      '<converted descriptor>.staleness.trigger[]',
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
 * @param {string} dir
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
  for (const name of entries.filter((f) => f.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    const meta = parsed && parsed.summary && parsed.summary.records_meta;
    if (!meta || typeof meta !== 'object') continue;
    for (const k of Object.keys(meta)) metaKeys.add(k);
    const at = meta.audit_table;
    const rows = at && Array.isArray(at.rows) ? at.rows : [];
    for (const r of rows) {
      if (!r || typeof r.metric !== 'string') continue;
      if (!metrics.has(r.metric)) metrics.set(r.metric, []);
      metrics.get(r.metric).push(r.value);
    }
  }
  return { metaKeys, metrics };
}

/**
 * Present + typed, for ONE registry row, against ONE step's already-loaded
 * golden index (`loadGoldenAuditIndex`'s return, or `null`). PURE.
 * @param {object} row a registry row
 * @param {{metaKeys:Set<string>, metrics:Map<string,unknown[]>}|null} index
 */
export function rowPresentTyped(row, index) {
  if (!index) return { ok: false, reason: `no golden POST captures for "${row.producer}"` };
  if (row.kind === 'records_meta') {
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
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
    const re = new RegExp(SCAN_RE);
    let m;
    while ((m = re.exec(line))) {
      const key = m[1];
      if (RUNNER_META_KEYS_SET.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(CHAIN_META_KEYS, key)) continue;
      if (declaredKeysForFile && declaredKeysForFile.has(key)) continue;
      violations.push({
        step: '(registry)',
        item: `scan.${relPath}.${key}`,
        detail: `${relPath}:${i + 1} reads records_meta.${key} — not in RUNNER_META_KEYS, CHAIN_META_KEYS, or a registry row whose consumer is this file (undeclared-consumer)`,
      });
    }
  });
  return violations;
}

/** The completeness scan over the whole corpus. DISK for the file walk + reads. */
export function scanConsumers(registry, repoRoot = REPO_ROOT) {
  const consumerKeys = new Map();
  for (const row of Array.isArray(registry && registry.rows) ? registry.rows : []) {
    if (!consumerKeys.has(row.consumer)) consumerKeys.set(row.consumer, new Set());
    consumerKeys.get(row.consumer).add(row.key);
  }
  const violations = [];
  for (const abs of collectCorpusFiles(repoRoot)) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    violations.push(...scanText(rel, text, consumerKeys.get(rel)));
  }
  return violations;
}

/** Gate D over the whole registry + corpus. An ORPHAN makes `pass` false (R-X). */
export function allConsumerViolations(registry, repoRoot = REPO_ROOT) {
  const convertedSlugs = new Set(loadConvertedDescriptors(repoRoot).map((d) => d.identity && d.identity.name));
  const indexes = new Map();
  for (const slug of convertedSlugs) indexes.set(slug, loadGoldenAuditIndex(path.join(repoRoot, GOLDEN_DIR_REL, slug, 'post')));
  return [
    ...registryViolations(registry, indexes, convertedSlugs),
    ...scanConsumers(registry, repoRoot),
  ];
}

export function checkConsumerContracts(registry, ledgerRows, repoRoot = REPO_ROOT) {
  const violations = allConsumerViolations(registry, repoRoot);
  const { unallowed, orphans, allowed } = matchLedger('D', violations, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const where = (v) => `${v.step} ${v.item}`;
  const detail = (unallowed.length || orphans.length)
    ? `CONSUMER-REGISTRY (gate D): ${unallowed.length} unallowed contract violation(s)`
      + (unallowed.length ? ` [${unallowed.map(where).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)` + (orphans.length ? ` [${orphans.map(where).join('; ')}]` : '')
    : `CONSUMER-REGISTRY (gate D): ${violations.length} contract(s) checked, all closed `
      + `(${allowed.length} ledger-allowed, ${violations.length - allowed.length} present+typed/excluded)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed };
}

/** Both halves, disk-backed — what `step-validate.mjs` calls. Also verifies the registry is fresh (`--check`). */
export function checkConsumerRegistry(repoRoot, ledgerRows) {
  const fresh = checkRegistryFresh(repoRoot);
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
  return checkConsumerContracts(readRegistry(repoRoot), ledgerRows, repoRoot);
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const idx = (metaKeys, metricsObj) => ({
    metaKeys: new Set(metaKeys),
    metrics: new Map(Object.entries(metricsObj).map(([k, arr]) => [k, arr])),
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

  // (6) unconverted producer -> not checked (registryViolations skips it).
  const registry = { rows: [{ ...funnelRow(), producer: 'classify_scope', key: 'tags_coverage_rate' }] };
  const skipped = registryViolations(registry, new Map(), new Set(['link_wsib']));
  if (skipped.length !== 0) throw new Error(`self-test FAILED (6): unconverted producer was checked (${JSON.stringify(skipped)})`);

  // (7) scan: a hit on an UNKNOWN key -> RED (undeclared-consumer).
  const s7 = scanText('fixture.ts', "  x.records_meta?.mystery_key;\n", new Set());
  if (s7.length !== 1 || !s7[0].item.includes('mystery_key')) throw new Error(`self-test FAILED (7): unknown-key scan hit not RED (${JSON.stringify(s7)})`);

  // (8) scan: a hit on a RUNNER key -> GREEN (excluded).
  const s8 = scanText('fixture.ts', "  x.records_meta.checks_failed;\n", new Set());
  if (s8.length !== 0) throw new Error(`self-test FAILED (8): runner-key scan hit not excluded (${JSON.stringify(s8)})`);

  // (9) scan: a hit on a CHAIN key -> GREEN (excluded).
  const s9 = scanText('fixture.ts', "  x.records_meta.step_completeness;\n", new Set());
  if (s9.length !== 0) throw new Error(`self-test FAILED (9): chain-key scan hit not excluded (${JSON.stringify(s9)})`);

  // (10) scan: a hit declared for THIS file's own registry rows -> GREEN.
  const s10 = scanText('fixture.ts', "  x.records_meta.tables_checked;\n", new Set(['tables_checked']));
  if (s10.length !== 0) throw new Error(`self-test FAILED (10): registry-declared scan hit not excluded (${JSON.stringify(s10)})`);

  // (11) scan: a comment line is never scanned, even naming an unknown key.
  const s11 = scanText('fixture.ts', "  // records_meta.mystery_key is read below\n", new Set());
  if (s11.length !== 0) throw new Error(`self-test FAILED (11): comment line scanned (${JSON.stringify(s11)})`);

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
