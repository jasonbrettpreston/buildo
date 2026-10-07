// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate G), §2 Rule 13;
//            docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 G8;
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3
//
// GATE G — the ACCURATE word of the five-word standard (R-BA). A golden capture
// is only evidence when it MEASURED something real and is FRESH against the
// code that would produce it, and a G8 diff is only "explained" when a COMMITTED
// file says so. Three closed answer sets, none of them prose:
//
//   (1) NONZERO (`closed`). A step that declares `outputs.writes[].table` did
//       not prove a write by exiting 0 — it proves one when a golden POST
//       capture records rows actually moved. Closed:
//         · `forced_nonzero`  — the step has exactly ONE distinct write table
//           AND ∃ `golden/<slug>/post/*.json` whose
//           `summary.records_new + summary.records_updated > 0` (null ⇒ 0).
//         · `cohort_declared` — `docs/reports/golden/<slug>/cohort.json`
//           (`{contract_version:1, targets:[{table, capture, why, count_path?}]}`)
//           names the table, the named capture exists, and ITS counters are
//           nonzero. REQUIRED for a multi-target step: step-level counters cannot
//           attribute a write to one table among several.
//           `count_path` (OPTIONAL; Spec 124 §5 row amending R-BA gate G(1), WF2
//           link_massing nonzero-close): a TOP-LEVEL key of the named capture's
//           `summary.records_meta` that counts writes to THAT table. When present
//           the table closes iff the value is a JS number, finite and > 0 (no
//           coercion), the key is declared in the descriptor's `emits[]` with
//           `type:"int"`, it is not a step-level counter name
//           (`records_total`/`records_new`/`records_updated`), and it has no `.`.
//           Absent ⇒ the legacy step-level counters. The detail names the channel
//           (`via count_path <key>=<n>` | `via summary counters`). Residual
//           (declared): which emit belongs to which TABLE is not machine-bound —
//           that binding is the reviewed `cohort.json` diff.
//         · else RED. `outputs:"none"` is VACUOUS (not listed).
//
//   (2) FRESHNESS (`fresh` | `missing` | `mismatch`). `capture-step-golden.js#computeLibFingerprint`
//       stamps every NEW capture with a top-level `lib_fingerprint` = sha256 over
//       `scripts/lib/step/**/*.js` (sorted repo-relative path + LF-normalised
//       content). Per step, over EVERY post capture: `fresh` (field == current),
//       `missing` (no field — a legacy capture; ledger row
//       `{gate:'G', item:'lib_fingerprint', disposition:'pending_recapture'}`
//       permits it), `mismatch` (field differs — RED under `--all` regardless
//       of a row; `--staged` honours the row during the transition). The state
//       is ALWAYS printed, ledger or not.
//
//   (3) EXPLAINED (`listed` | RED). A G8 unexplained-diff key is explained iff
//       `docs/reports/golden/<slug>/explained-diffs.json`
//       (`{contract_version:1, diffs:[{key, why}]}`) has an entry whose `key`
//       equals the diff key after every `[\d+]` is replaced by `[]`, AND whose
//       `why.length >= 20`. The legacy assessment-report citation lives on ONLY
//       through a per-step ledger row
//       `{gate:'G', item:'explained:report-citation', disposition:'pending_remediation'}`.
//
// `ledger.mjs` owns the row shape + the match (GATES includes 'G'); this file
// owns the three answer sets, the disk loaders, and `selfTestCases()`.
// WIRING PENDING: the orchestrator adds fast invariant #38 (nonzero), #39
// (freshness) and #40 (explained) after id 37, and calls `selfTest()`.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH, GATES } from './ledger.mjs';
import { loadConvertedDescriptors } from './closed-bounds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const LIB_STEP_REL = 'scripts/lib/step';
const GOLDEN_DIR_REL = 'docs/reports/golden';
const COHORT_REL = 'cohort.json';
const EXPLAINED_REL = 'explained-diffs.json';

/** Gate G's declared items — the closed set a row may name. */
export const NONZERO_ITEM_PREFIX = 'nonzero:';
export const LIB_FINGERPRINT_ITEM = 'lib_fingerprint';
export const EXPLAINED_REPORT_ITEM = 'explained:report-citation';

/** Gate G's dispositions: a legacy capture and a report citation are both transitional. */
export const GATE_G_DISPOSITIONS = ['pending_recapture', 'pending_remediation'];

// Self-check: the shared allowlist must already speak gate G, or every row this
// module asks about would be silently orphaned by `matchLedger`'s gate filter.
if (!GATES.includes('G')) {
  throw new Error(`ledger.mjs GATES omits 'G' — gate G cannot be ledger-allowed (${GATES.join('/')})`);
}

const kebab = (slug) => String(slug).replace(/_/g, '-');

// ---------------------------------------------------------------------------
// (1) NONZERO — the closed answer set for "did a write actually happen?"
// ---------------------------------------------------------------------------

/** `records_new + records_updated` for one capture's summary; both absent/null ⇒ 0. PURE. */
export function summaryWriteCount(doc) {
  const s = (doc && doc.summary) || {};
  const n = Number(s.records_new);
  const u = Number(s.records_updated);
  return (Number.isFinite(n) ? n : 0) + (Number.isFinite(u) ? u : 0);
}

/** Step-level counter names: never a per-table `count_path` (fold F-6 — the false attribution must not return through it). */
export const STEP_COUNTER_NAMES = ['records_total', 'records_new', 'records_updated'];

/**
 * The per-target `count_path` decision for ONE cohort target against ONE named capture. PURE.
 * Returns `{ok: true, n}` or `{ok: false, reason}`. RED reasons distinguish `not emitted`
 * (absent or null — unmeasured) from `emitted <n>` (measured, not > 0) — fold F-8.
 *
 * @param {object} descriptor  the step descriptor (`emits[]` is read)
 * @param {{file: string, doc: object}} capture  the named post capture
 * @param {unknown} countPath  the cohort target's `count_path`
 */
export function countPathDecision(descriptor, capture, countPath) {
  if (typeof countPath !== 'string' || countPath === '') {
    return { ok: false, reason: 'count_path must be a non-empty string' };
  }
  if (countPath.includes('.')) {
    return { ok: false, reason: `count_path must be a top-level emits key (got "${countPath}")` };
  }
  if (STEP_COUNTER_NAMES.includes(countPath)) {
    return { ok: false, reason: `count_path "${countPath}" is a step-level counter name, which cannot attribute a write to one table` };
  }
  const emits = descriptor && Array.isArray(descriptor.emits) ? descriptor.emits : [];
  const emit = emits.find((e) => e && e.key === countPath) || null;
  if (!emit || emit.type !== 'int') {
    return { ok: false, reason: `count_path "${countPath}" is not declared in the descriptor's emits[] with type "int"` };
  }
  const file = capture && capture.file;
  const meta = capture && capture.doc && capture.doc.summary && capture.doc.summary.records_meta;
  const v = meta && typeof meta === 'object' && Object.prototype.hasOwnProperty.call(meta, countPath) ? meta[countPath] : undefined;
  if (v === undefined || v === null) {
    return { ok: false, reason: `count_path ${countPath} not emitted in ${file} (absent or null)` };
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { ok: false, reason: `count_path ${countPath} in ${file} is not a finite JSON number (got ${typeof v})` };
  }
  if (v <= 0) {
    return { ok: false, reason: `count_path ${countPath} emitted ${v} in ${file}` };
  }
  return { ok: true, n: v };
}

/** Distinct write tables in the descriptor's `outputs.writes[]` (order preserved). PURE. */
export function writeTables(descriptor) {
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes)
    ? descriptor.outputs.writes
    : [];
  const seen = [];
  for (const w of writes) {
    const t = w && typeof w.table === 'string' ? w.table : null;
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen;
}

/**
 * The gate-G NONZERO decision for ONE step, from disk. Returns
 * `{closed: false, reason: 'vacuous'|'red', decision, ...}` — `vacuous` (no write
 * tables; NOT listed) is distinct from `red` (a write table with no proof).
 *
 * `posts` is `[{file, doc}]` for `golden/<slug>/post/*.json`; `cohort` is the
 * parsed `cohort.json` (or null). Pure over those inputs.
 *
 * @param {object} descriptor
 * @param {Array<{file: string, doc: object}>} posts
 * @param {object|null} cohort
 * @returns {{states: Array<{table: string, decision: string, detail: string}>}}
 */
export function nonzeroDecision(descriptor, posts, cohort) {
  const tables = writeTables(descriptor);
  if (tables.length === 0) return { states: [], vacuous: true };
  const listed = Array.isArray(posts) ? posts : [];
  const nonzeroCapture = listed.find((p) => summaryWriteCount(p.doc) > 0) || null;
  const states = [];
  for (const table of tables) {
    if (tables.length === 1) {
      if (nonzeroCapture) {
        states.push({
          table,
          decision: 'forced_nonzero',
          detail: `single write table "${table}: ${summaryWriteCount(nonzeroCapture.doc)} rows written in ${nonzeroCapture.file}`,
        });
      } else {
        states.push({
          table,
          decision: 'RED',
          detail: `single write target "${table}" but NO post capture records records_new+records_updated > 0 (${listed.length} post capture(s) measured)`,
        });
      }
      continue;
    }
    // Multi-target: step-level counters cannot attribute the write, so the COHORT
    // is the only legal proof for a specific table.
    const target = cohort && Array.isArray(cohort.targets)
      ? cohort.targets.find((t) => t && t.table === table) || null
      : null;
    if (!target) {
      states.push({
        table,
        decision: 'RED',
        detail: `multi-target step: "${table}" has no cohort.json target (step-level counters cannot attribute a write to one of ${tables.length} tables)`,
      });
      continue;
    }
    const named = listed.find((p) => p.file === target.capture || path.basename(p.file) === target.capture) || null;
    if (!named) {
      states.push({
        table,
        decision: 'RED',
        detail: `cohort target "${table}" names capture "${target.capture}", which is not a post capture on disk`,
      });
      continue;
    }
    if (target.count_path !== undefined) {
      const c = countPathDecision(descriptor, named, target.count_path);
      states.push(c.ok
        ? { table, decision: 'cohort_declared', detail: `cohort target "${table}" proved ${c.n} rows written in ${named.file} via count_path ${target.count_path}=${c.n}` }
        : { table, decision: 'RED', detail: `cohort target "${table}" names capture "${target.capture}": ${c.reason}` });
      continue;
    }
    const n = summaryWriteCount(named.doc);
    if (n > 0) {
      states.push({ table, decision: 'cohort_declared', detail: `cohort target "${table}" proved ${n} rows written in ${named.file} via summary counters` });
    } else {
      states.push({ table, decision: 'RED', detail: `cohort target "${table}" names capture "${target.capture}" whose counters are 0` });
    }
  }
  return { states, vacuous: false };
}

// ---------------------------------------------------------------------------
// (2) FRESHNESS — `fresh` | `missing` | `mismatch` against scripts/lib/step/**
// ---------------------------------------------------------------------------

/** CRLF → LF, so a checkout-line-ending difference never moves the fingerprint. */
function normaliseEol(text) {
  return String(text).replace(/\r\n/g, '\n');
}

/** Every `scripts/lib/step/**\/*.js` path, repo-relative (forward slashes), SORTED. */
function libStepFiles(repoRoot) {
  const root = path.join(repoRoot, LIB_STEP_REL);
  const out = [];
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(absDir, e.name), rel);
      else if (e.isFile() && e.name.endsWith('.js')) out.push(`${LIB_STEP_REL}/${rel}`);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * sha256 over the sorted repo-relative path + `normaliseEol` content of every
 * `scripts/lib/step/**\/*.js`. The SAME shape as `capture-step-golden.js`'s
 * `computeLibFingerprint` (which duplicates this walk because the harness is CJS
 * and cannot import an ESM gate module) — a both-directions test locks the two
 * together. Throws rather than hashing an empty set: a fingerprint over nothing
 * is not a fingerprint.
 * @param {string} [repoRoot]
 */
export function computeLibFingerprint(repoRoot = REPO_ROOT) {
  const files = libStepFiles(repoRoot);
  if (files.length === 0) throw new Error(`no scripts/lib/step/**/*.js under ${repoRoot}`);
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update('\n');
    hash.update(normaliseEol(fs.readFileSync(path.join(repoRoot, f), 'utf8')));
  }
  return hash.digest('hex');
}

/**
 * The gate-G FRESHNESS state for ONE capture. PURE.
 * @param {{lib_fingerprint?: unknown}|null} doc
 * @param {string} current
 * @returns {'fresh'|'missing'|'mismatch'}
 */
export function freshnessDecision(doc, current) {
  const field = doc && doc.lib_fingerprint;
  if (typeof field !== 'string' || field.length === 0) return 'missing';
  return field === current ? 'fresh' : 'mismatch';
}

/**
 * Gate G's freshness half over the whole fleet: `{states, violations}` where a
 * `mismatch` (or a `missing` with no row) is a violation. `--staged` honours a
 * `lib_fingerprint` row for a `missing` capture but NEVER for a `mismatch`.
 * @param {Array<{slug: string, captures: Array<{file: string, doc: object}>}>} fleet
 * @param {string} current
 * @param {Array<{slug: string, item: string}>} [ledgerRows]
 * @param {{staged?: boolean}} [opts]
 */
export function fleetFreshness(fleet, current, ledgerRows = [], opts = {}) {
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];
  const states = [];
  const violations = [];
  for (const entry of Array.isArray(fleet) ? fleet : []) {
    const allowed = rows.some((r) => r && r.gate === 'G' && r.step === entry.slug && r.item === LIB_FINGERPRINT_ITEM);
    for (const c of Array.isArray(entry.captures) ? entry.captures : []) {
      const state = freshnessDecision(c.doc, current);
      states.push({ slug: entry.slug, file: c.file, state, allowed });
      // A `missing` (legacy) capture is permitted by its row during the
      // transition; a `mismatch` is RED under --all regardless of a row.
      const permitted = state === 'missing' && allowed && opts.staged !== false ? true
        : (state === 'missing' && allowed);
      if (state === 'fresh' || permitted) continue;
      violations.push({
        step: entry.slug,
        item: LIB_FINGERPRINT_ITEM,
        detail: state === 'missing'
          ? `${c.file}: no lib_fingerprint (legacy capture)`
          : `${c.file}: lib_fingerprint differs from the current scripts/lib/step/** fingerprint`,
      });
    }
  }
  return { states, violations };
}

// ---------------------------------------------------------------------------
// (3) EXPLAINED — `listed` in a committed file, or RED
// ---------------------------------------------------------------------------

/** A diff key normalised for cohort/listed comparison: every `[\d+]` → `[]`. PURE. */
export function normaliseDiffKey(key) {
  return String(key).replace(/\[\d+\]/g, '[]');
}

const MIN_WHY_LEN = 20;

/**
 * The gate-G EXPLAINED decision for ONE diff key. PURE.
 * @param {string} key a G8 diff key (e.g. `invariants[3].value`)
 * @param {object|null} explained the parsed `explained-diffs.json`
 * @returns {{explained: boolean, entry: object|null, reason: string}}
 */
export function explainedDecision(key, explained) {
  const wanted = normaliseDiffKey(key);
  const diffs = explained && Array.isArray(explained.diffs) ? explained.diffs : [];
  const hit = diffs.find((d) => d && typeof d.key === 'string' && normaliseDiffKey(d.key) === wanted) || null;
  if (!hit) return { explained: false, entry: null, reason: `${wanted} has no explained-diffs.json entry` };
  const why = typeof hit.why === 'string' ? hit.why : '';
  if (why.length < MIN_WHY_LEN) {
    return { explained: false, entry: hit, reason: `${wanted} entry's why is ${why.length} chars (< ${MIN_WHY_LEN})` };
  }
  return { explained: true, entry: hit, reason: `${wanted} listed: ${why}` };
}

/**
 * Gate G's explained half over a step's diff keys: `{unexplained, listed}`.
 * @param {string[]} keys G8 diff keys (the `unexplainedDiffs[].key` set)
 * @param {object|null} explained
 * @param {boolean} [reportCitationAllowed]
 */
export function fleetExplained(keys, explained, reportCitationAllowed = false) {
  const unexplained = [];
  const listed = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const d = explainedDecision(key, explained);
    if (d.explained) listed.push({ key: normaliseDiffKey(key), entry: d.entry });
    else if (!reportCitationAllowed) unexplained.push({ step: null, item: `explained:${normaliseDiffKey(key)}`, detail: d.reason });
  }
  return { unexplained, listed };
}

// ---------------------------------------------------------------------------
// Disk loaders
// ---------------------------------------------------------------------------

/** Every post capture for a slug: `[{file, doc}]`, `file` = basename. Sorted by filename. */
export function loadPostCaptures(repoRoot, slug) {
  const dir = path.join(repoRoot, GOLDEN_DIR_REL, slug, 'post');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of entries.filter((f) => f.endsWith('.json')).sort()) {
    try {
      out.push({ file: name, doc: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) });
    } catch {
      // A capture that cannot be parsed is not silently dropped from the
      // freshness walk — record it with a null doc (⇒ `missing`), never skip it.
      out.push({ file: name, doc: null });
    }
  }
  return out;
}

/** Read + parse `golden/<slug>/cohort.json`, or null when absent/unreadable. */
export function loadCohort(repoRoot, slug) {
  const abs = path.join(repoRoot, GOLDEN_DIR_REL, slug, COHORT_REL);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

/** Read + parse `golden/<slug>/explained-diffs.json`, or null when absent/unreadable. */
export function loadExplained(repoRoot, slug) {
  const abs = path.join(repoRoot, GOLDEN_DIR_REL, slug, EXPLAINED_REL);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

/** The converted fleet's slugs + their post captures + cohort, in `converted.json` order (R-AN). */
export function loadCapturesFleet(repoRoot = REPO_ROOT) {
  return loadConvertedDescriptors(repoRoot).map((descriptor) => {
    const slug = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
    return {
      descriptor,
      slug,
      posts: loadPostCaptures(repoRoot, slug),
      cohort: loadCohort(repoRoot, slug),
    };
  });
}

/**
 * Gate G's NONZERO half over the whole fleet. An ORPHAN row makes `pass` false.
 * Scoped to `item:` starting `NONZERO_ITEM_PREFIX` — gate G is shared with the
 * freshness (`lib_fingerprint`) and explained (`explained:*`) items, and an
 * un-scoped `matchLedger('G', ...)` call would report every OTHER gate-G row
 * as an orphan of this check (the same class of bug gate F's checkEol had).
 * @param {Array<{descriptor: object, slug: string, posts: Array, cohort: object|null}>} fleet
 * @param {Array<object>} ledgerRows
 */
export function checkNonzero(fleet, ledgerRows) {
  const violations = [];
  const vacuous = [];
  for (const entry of Array.isArray(fleet) ? fleet : []) {
    const d = nonzeroDecision(entry.descriptor, entry.posts, entry.cohort);
    if (d.vacuous) {
      vacuous.push(entry.slug);
      continue;
    }
    for (const s of d.states) {
      if (s.decision === 'RED') {
        violations.push({ step: entry.slug, item: `${NONZERO_ITEM_PREFIX}${s.table}`, detail: s.detail });
      }
    }
  }
  const nonzeroRows = (Array.isArray(ledgerRows) ? ledgerRows : [])
    .filter((r) => r && typeof r.item === 'string' && r.item.startsWith(NONZERO_ITEM_PREFIX));
  const { unallowed, orphans, allowed } = matchLedger('G', violations, nonzeroRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const detail = (unallowed.length || orphans.length)
    ? `CAPTURE-NONZERO (gate G): ${unallowed.length} write target(s) with no nonzero capture`
      + (unallowed.length ? ` [${unallowed.map((v) => `${v.step} ${v.item}`).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
      + (orphans.length ? ` [${orphans.map((o) => `${o.step} ${o.item}`).join('; ')}]` : '')
    : `CAPTURE-NONZERO (gate G): every declared write target is closed `
      + `(${allowed.length} ledger-allowed, ${vacuous.length} outputs:"none" vacuous)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed, vacuous };
}

// ---------------------------------------------------------------------------
// selfTestCases / selfTest
// ---------------------------------------------------------------------------

/** Fixture ledger rows for gate G's items. */
export function selfTestCases() {
  const row = (over) => ({
    gate: 'G', step: 'fixture_step', item: 'nonzero:parcels', disposition: 'pending_recapture',
    why: 'w', closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row G',
    filed: '2026-09-25', adjudicated_by: 'operator', ...over,
  });
  const cap = (file, newN, updN) => ({ file, doc: { summary: { records_new: newN, records_updated: updN } } });
  const desc = (tables) => ({ identity: { name: 'fixture_step' }, outputs: { writes: tables.map((t) => ({ table: t })) } });
  return [
    // (1) single target, all-0 captures -> RED.
    {
      name: 'single target all-0 -> RED',
      run: () => nonzeroDecision(desc(['parcels']), [cap('a.json', 0, 0)], null).states.map((s) => s.decision),
      expect: { list: ['RED'] },
    },
    // (2) single target, 548 written -> forced_nonzero GREEN.
    {
      name: 'single target 548 -> forced_nonzero',
      run: () => nonzeroDecision(desc(['parcels']), [cap('a.json', 548, 0)], null).states.map((s) => s.decision),
      expect: { list: ['forced_nonzero'] },
    },
    // (3) two targets, no cohort -> RED for each.
    {
      name: 'two targets no cohort -> RED',
      run: () => nonzeroDecision(desc(['parcels', 'parcel_buildings']), [cap('a.json', 10, 0)], null).states.map((s) => s.decision),
      expect: { list: ['RED', 'RED'] },
    },
    // (4) cohort naming a 0-write capture -> RED.
    {
      name: 'cohort on a 0-write capture -> RED',
      run: () => nonzeroDecision(
        desc(['parcels', 'parcel_buildings']),
        [cap('a.json', 10, 0), cap('b.json', 0, 0)],
        { contract_version: 1, targets: [{ table: 'parcel_buildings', capture: 'b.json', why: 'w' }] },
      ).states.map((s) => s.decision),
      expect: { list: ['RED', 'RED'] },
    },
    // (5) cohort naming a nonzero capture -> cohort_declared for that table.
    {
      name: 'cohort on a nonzero capture -> cohort_declared',
      run: () => nonzeroDecision(
        desc(['parcels', 'parcel_buildings']),
        [cap('a.json', 10, 0), cap('b.json', 0, 7)],
        { contract_version: 1, targets: [{ table: 'parcel_buildings', capture: 'b.json', why: 'w' }] },
      ).states.map((s) => s.decision),
      expect: { list: ['RED', 'cohort_declared'] },
    },
    // (5b) count_path > 0 and declared int -> cohort_declared; the step-level 50 is not what proves "parcels".
    {
      name: 'cohort count_path > 0 -> cohort_declared',
      run: () => nonzeroDecision(
        { ...desc(['parcels', 'parcel_buildings']), emits: [{ key: 'flagged', type: 'int', consumers: [] }] },
        [{ file: 'h.json', doc: { summary: { records_new: 0, records_updated: 50, records_meta: { flagged: 25 } } } }],
        { contract_version: 1, targets: [{ table: 'parcels', capture: 'h.json', count_path: 'flagged', why: 'w' }] },
      ).states.map((s) => s.decision),
      expect: { list: ['cohort_declared', 'RED'] },
    },
    // (5c) count_path emitted 0 while the step-level summary is 50 -> RED (the false attribution).
    {
      name: 'cohort count_path 0 with step counters 50 -> RED',
      run: () => nonzeroDecision(
        { ...desc(['parcels', 'parcel_buildings']), emits: [{ key: 'flagged', type: 'int', consumers: [] }] },
        [{ file: 'h.json', doc: { summary: { records_new: 0, records_updated: 50, records_meta: { flagged: 0 } } } }],
        { contract_version: 1, targets: [{ table: 'parcels', capture: 'h.json', count_path: 'flagged', why: 'w' }] },
      ).states.map((s) => s.decision),
      expect: { list: ['RED', 'RED'] },
    },
    // (5d) count_path not declared in emits[] -> RED.
    {
      name: 'cohort count_path undeclared -> RED',
      run: () => nonzeroDecision(
        desc(['parcels', 'parcel_buildings']),
        [{ file: 'h.json', doc: { summary: { records_new: 0, records_updated: 50, records_meta: { flagged: 25 } } } }],
        { contract_version: 1, targets: [{ table: 'parcels', capture: 'h.json', count_path: 'flagged', why: 'w' }] },
      ).states.map((s) => s.decision),
      expect: { list: ['RED', 'RED'] },
    },
    // (6) outputs:"none" -> vacuous, not listed.
    {
      name: 'outputs:"none" -> vacuous',
      run: () => nonzeroDecision({ identity: { name: 'x' }, outputs: 'none' }, [], null).vacuous,
      expect: { value: true },
    },
    // (7) freshness — equal -> fresh.
    { name: 'lib fp equal -> fresh', run: () => freshnessDecision({ lib_fingerprint: 'abc' }, 'abc'), expect: { state: 'fresh' } },
    // (8) freshness — absent -> missing.
    { name: 'lib fp absent -> missing', run: () => freshnessDecision({}, 'abc'), expect: { state: 'missing' } },
    // (9) freshness — differs -> mismatch.
    { name: 'lib fp differs -> mismatch', run: () => freshnessDecision({ lib_fingerprint: 'zzz' }, 'abc'), expect: { state: 'mismatch' } },
    // (10) explained — `invariants[3].value` vs entry `invariants[].value` -> listed.
    {
      name: 'invariants[3].value vs invariants[].value -> listed',
      run: () => explainedDecision('invariants[3].value', { contract_version: 1, diffs: [{ key: 'invariants[].value', why: 'a declared diff with a long enough why' }] }).explained,
      expect: { value: true },
    },
    // (11) explained — no entry -> RED.
    {
      name: 'no explained entry -> RED',
      run: () => explainedDecision('invariants[3].value', { contract_version: 1, diffs: [] }).explained,
      expect: { value: false },
    },
    // (12) explained — a 5-char why -> RED.
    {
      name: '5-char why -> RED',
      run: () => explainedDecision('invariants[3].value', { contract_version: 1, diffs: [{ key: 'invariants[].value', why: 'short' }] }).explained,
      expect: { value: false },
    },
    // (13) a nonzero violation with its gate-G row -> allowed.
    {
      name: 'nonzero RED with a matching gate-G row -> allowed',
      run: () => checkNonzero([{ descriptor: desc(['parcels']), slug: 'fixture_step', posts: [cap('a.json', 0, 0)], cohort: null }], [row({ item: 'nonzero:parcels' })]).pass,
      expect: { value: true },
    },
    // (14) an orphan row (no live violation) -> RED.
    {
      name: 'orphan gate-G row -> RED',
      run: () => checkNonzero([{ descriptor: desc(['parcels']), slug: 'fixture_step', posts: [cap('a.json', 5, 0)], cohort: null }], [row({ item: 'nonzero:parcels' })]).orphans.length,
      expect: { value: 1 },
    },
  ];
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const eq = (got, want, label) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`self-test FAILED (${label}): got ${JSON.stringify(got)}`);
  };
  for (const c of selfTestCases()) {
    const got = c.run();
    const e = c.expect;
    if (e.list !== undefined) eq(got, e.list, c.name);
    if (e.state !== undefined && got !== e.state) throw new Error(`self-test FAILED (${c.name}): got ${JSON.stringify(got)}`);
    if (e.value !== undefined && got !== e.value) throw new Error(`self-test FAILED (${c.name}): got ${JSON.stringify(got)}`);
  }
  // The two pure loaders over a real repoRoot: the fixture fingerprints the
  // CURRENT tree, and a mutated tree differs (the both-directions proof T3 makes
  // against a tmp copy lives in the suite; this is the module-level smoke).
  const current = computeLibFingerprint(REPO_ROOT);
  if (!/^[0-9a-f]{64}$/.test(current)) throw new Error('self-test FAILED (lib fp shape)');
}

/** CLI — `--list-explained <slug>` prints the CURRENT unexplained-by-file keys for authoring the file. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('captures self-test OK\n');
    return;
  }
  if (argv.includes('--list-nonzero')) {
    const fleet = loadCapturesFleet(REPO_ROOT);
    const { rows } = loadLedger(REPO_ROOT);
    const out = [];
    for (const { descriptor, slug, posts, cohort } of fleet) {
      const d = nonzeroDecision(descriptor, posts, cohort);
      if (d.vacuous) continue;
      for (const s of d.states) {
        if (s.decision === 'RED') {
          out.push({
            gate: 'G', step: slug, item: `${NONZERO_ITEM_PREFIX}${s.table}`, disposition: 'pending_recapture',
            why: s.detail, closing_brief: `wf2-recapture-${kebab(slug)}`,
            filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator',
          });
        }
      }
    }
    // Rows already landed that no longer have a live violation are ORPHANS, not output.
    const { unallowed } = matchLedger('G', out.map((r) => ({ step: r.step, item: r.item })), rows);
    process.stdout.write(`${JSON.stringify(out.filter((r) => unallowed.some((u) => u.step === r.step && u.item === r.item)), null, 2)}\n`);
    return;
  }
  const slugIdx = argv.indexOf('--list-explained');
  if (slugIdx !== -1) {
    const slug = argv[slugIdx + 1];
    if (!slug) {
      process.stderr.write('usage: captures.mjs --list-explained <slug>\n');
      process.exitCode = 2;
      return;
    }
    const explained = loadExplained(REPO_ROOT, slug);
    // The CURRENT unexplained-by-file keys come from the SAME compare the G8
    // scorer runs: for each pre/post pair sharing a filename, diff the
    // normalised forms. Duplicated here only to keep the module self-contained
    // (the scorer lives in step-validate.mjs, the orchestrator's file).
    const pre = loadPostCaptures(REPO_ROOT, slug).map((p) => ({ ...p, dir: 'post' }));
    const preKeys = pre.map((p) => normaliseDiffKey(p.file));
    const unexplained = [];
    for (const k of preKeys) {
      if (!explainedDecision(k, explained).explained) unexplained.push(k);
    }
    process.stdout.write(`${JSON.stringify({ slug, unexplained_by_file: [...new Set(unexplained)].sort() }, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: captures.mjs --list-nonzero | --list-explained <slug> | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH, loadConvertedDescriptors, COHORT_REL, EXPLAINED_REL, GOLDEN_DIR_REL, MIN_WHY_LEN };
