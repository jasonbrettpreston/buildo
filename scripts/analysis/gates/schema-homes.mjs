// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (#44 witness — registry-truth plan fold 9 C7-1 checks[] SQL reads home, C7-2 per-mode write_inventory; REPORT-ONLY until FLEET-2)
//
// THE TWO FOLD-9 SCHEMA HOMES — the runner contract's two missing declaration
// sites — and the ONE gate that witnesses them. Nothing here BLOCKS.
//
//   C7-1 `checks[i].reads` — an array of `{ table, columns? }`: the SQL reads
//   the check's own measurement executes. It is declared OUTSIDE
//   `inputs.reads`, because a check's measurement read is NOT an acquisition
//   edge: nothing downstream derives an ordering from it, and folding it into
//   inputs.reads would silently promise an upstream dependency the step does
//   not have. Before this home the reads a check ran lived only in its SQL
//   string — invisible to the validator, invisible to the trace.
//
//   C7-2 `outputs.write_inventory.by_mode` — `{ full?: {statements, why?},
//   incremental?: {statements, why?} }` beside the mode-agnostic `statements`.
//   A step whose write count depends on the resolved mode (link_wsib's
//   full-mode statement shapes are a NAMED OPEN GAP, fold 9 C7-2) cannot
//   state a single honest integer today; `statements` remains the mode-agnostic default and
//   `by_mode[mode].statements` is the exact per-mode value when declared.
//
// POSTURE. REPORT-ONLY until the FLEET-2 landing commit populates the homes:
// `pass` is ALWAYS true, every unresolvable row is PRINTED as an
// `R:check-reads:<slug>:<table>.<column>` row, and there is NO exception list
// (a hand-kept allowlist is exactly the drift this plan deletes). The gate's
// job today is to measure adoption and name the gap, not to redden a fleet
// that has not been given the home yet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConvertedJson } from './converted-set.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** The closed set of `staleness.mode_select` resolutions `by_mode` may key on. */
export const WRITE_INVENTORY_MODES = Object.freeze(['full', 'incremental']);

/** Descriptor path convention — `<step>.descriptor.json` beside the script (notes-cap.mjs's rule). */
const descriptorPathFor = (relFile) => String(relFile).replace(/\.(js|py)$/, '') + '.descriptor.json';

const slugOf = (descriptor) =>
  descriptor && descriptor.identity && typeof descriptor.identity.name === 'string'
    ? descriptor.identity.name
    : '(unknown-step)';

/** `table.column`, or `table.*` for an entry declaring no columns. */
const readKey = (table, column) => `${table}.${column || '*'}`;

/**
 * `table.column` (or `table.*`) over ONE `read` entry. `null` when the entry is
 * not an object or carries no usable `table` string. An entry with no
 * `columns` — or an empty array — covers every column of that table and yields
 * the single `table.*` key.
 * @param {unknown} entry
 * @returns {string|null}
 */
function entryKeys(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const table = entry.table;
  if (typeof table !== 'string' || !table) return null;
  const columns = Array.isArray(entry.columns)
    ? entry.columns.filter((c) => typeof c === 'string' && c)
    : [];
  if (!columns.length) return readKey(table, null);
  return columns.map((c) => readKey(table, c));
}

const sortedUnique = (iterable) => [...new Set(iterable)].sort();

/**
 * Every read the step's checks DECLARE (`checks[i].reads[j]`), as sorted unique
 * `table.column` / `table.*` keys. `[]` when `checks` is `"none"`, absent, or
 * when no check declares `reads` — never an edge for upstream derivation.
 * @param {any} descriptor
 * @returns {string[]}
 */
export function declaredCheckReads(descriptor) {
  const checks = descriptor && descriptor.checks;
  if (!Array.isArray(checks)) return [];
  const keys = [];
  for (const check of checks) {
    if (!check || typeof check !== 'object' || !Array.isArray(check.reads)) continue;
    for (const entry of check.reads) {
      const raw = entryKeys(entry);
      if (raw === null) continue;
      if (Array.isArray(raw)) keys.push(...raw);
      else keys.push(raw);
    }
  }
  return sortedUnique(keys);
}

/** `inputs.reads.tables` as `{ table, columns: string[]|null }` (null = every column). */
function inputTableCovers(descriptor) {
  const reads = descriptor && descriptor.inputs && descriptor.inputs.reads;
  const tables = reads && Array.isArray(reads.tables) ? reads.tables : [];
  const covers = [];
  for (const entry of tables) {
    if (!entry || typeof entry !== 'object' || typeof entry.table !== 'string' || !entry.table) continue;
    const columns = Array.isArray(entry.columns)
      ? entry.columns.filter((c) => typeof c === 'string' && c)
      : [];
    covers.push({ table: entry.table, columns: columns.length ? columns : null });
  }
  return covers;
}

/**
 * C7-1 coverage. PURE — no disk, no fleet. `traced` is what the trace
 * ATTRIBUTES to this step's checks (`{ table, column }`); a traced read is
 * COVERED when `inputs.reads.tables` has that table with no `columns` or with
 * that column, OR when `declaredCheckReads` carries `table.column`/`table.*`.
 *
 * `pass` is ALWAYS true: this is REPORT-ONLY until the FLEET-2 landing commit
 * populates `checks[].reads`, so every uncovered read is reported and nothing
 * blocks.
 * @param {any} descriptor
 * @param {Array<{table: string, column?: string}>} traced
 * @returns {{reportOnly: true, pass: true, uncovered: string[], rows: string[], detail: string}}
 */
export function checkReadsCoverage(descriptor, traced) {
  const slug = slugOf(descriptor);
  const declared = new Set(declaredCheckReads(descriptor));
  const covers = inputTableCovers(descriptor);
  const uncovered = [];
  for (const read of Array.isArray(traced) ? traced : []) {
    if (!read || typeof read !== 'object' || typeof read.table !== 'string' || !read.table) continue;
    const column = typeof read.column === 'string' && read.column ? read.column : null;
    const key = readKey(read.table, column);
    if (column === null ? declared.has(readKey(read.table, null)) : declared.has(key)) continue;
    if (declared.has(readKey(read.table, null))) continue;
    const coveredByInputs = covers.some(
      (t) => t.table === read.table && (t.columns === null || (column !== null && t.columns.includes(column))),
    );
    if (coveredByInputs) continue;
    uncovered.push(key);
  }
  const sorted = sortedUnique(uncovered);
  const rowSlug = slug.replace(/\//g, '_');
  const rows = sorted.map((c) => `R:check-reads:${rowSlug}:${c}`);
  return {
    reportOnly: true,
    pass: true,
    uncovered: sorted,
    rows,
    detail: `REPORT-ONLY (fold 9 C7-1): ${sorted.length} traced check read(s) outside inputs.reads ∪ checks[].reads`,
  };
}

/**
 * C7-2 — the write-statement count for ONE resolved mode: the exact
 * `outputs.write_inventory.by_mode[mode].statements` when that is an integer,
 * else the mode-agnostic `outputs.write_inventory.statements` when that is an
 * integer, else `null` (undeclared — never a guessed 0).
 * @param {any} descriptor
 * @param {'full'|'incremental'} mode
 * @returns {number|null}
 */
export function writeInventoryForMode(descriptor, mode) {
  const inventory = descriptor && descriptor.outputs && descriptor.outputs.write_inventory;
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return null;
  const byMode = inventory.by_mode;
  if (typeof mode === 'string' && byMode && typeof byMode === 'object' && !Array.isArray(byMode)) {
    const entry = byMode[mode];
    if (entry && typeof entry === 'object' && Number.isInteger(entry.statements)) return entry.statements;
  }
  return Number.isInteger(inventory.statements) ? inventory.statements : null;
}

/** True when this step declares at least one `checks[].reads` entry. */
export function declaresCheckReads(descriptor) {
  const checks = descriptor && descriptor.checks;
  if (!Array.isArray(checks)) return false;
  return checks.some((c) => c && typeof c === 'object' && Array.isArray(c.reads) && c.reads.length > 0);
}

/** True when this step declares an `outputs.write_inventory.by_mode` object. */
export function declaresWriteInventoryByMode(descriptor) {
  const byMode = descriptor && descriptor.outputs && descriptor.outputs.write_inventory && descriptor.outputs.write_inventory.by_mode;
  return !!byMode && typeof byMode === 'object' && !Array.isArray(byMode);
}

/**
 * C7-1/C7-2 adoption over a descriptor list. PURE — no disk. REPORT-ONLY:
 * `pass` is ALWAYS true; the value is the two declarer lists and the count.
 * @param {Array<any>} descriptors
 * @returns {{reportOnly: true, pass: true, checkReadsDeclarers: string[], byModeDeclarers: string[], detail: string}}
 */
export function homesReport(descriptors) {
  const list = Array.isArray(descriptors) ? descriptors : [];
  const checkReadsDeclarers = [];
  const byModeDeclarers = [];
  for (const descriptor of list) {
    const slug = slugOf(descriptor);
    if (declaresCheckReads(descriptor)) checkReadsDeclarers.push(slug);
    if (declaresWriteInventoryByMode(descriptor)) byModeDeclarers.push(slug);
  }
  return {
    reportOnly: true,
    pass: true,
    checkReadsDeclarers: sortedUnique(checkReadsDeclarers),
    byModeDeclarers: sortedUnique(byModeDeclarers),
    detail:
      `REPORT-ONLY until FLEET-2 (fold 9 C7-1/C7-2): checks[].reads declared by ` +
      `${checkReadsDeclarers.length}/${list.length} step(s); write_inventory.by_mode declared by ` +
      `${byModeDeclarers.length}/${list.length}`,
  };
}

/**
 * Every descriptor the CONVERTED fleet names, in converted.json order (R-AN —
 * derived, never a retyped list). A converted entry with no readable/parsable
 * descriptor THROWS — a broken registry is never something to skip.
 * @param {string} [repoRoot]
 * @returns {Array<any>}
 */
export function loadConvertedFleetDescriptors(repoRoot = REPO_ROOT) {
  const parsed = readConvertedJson(repoRoot);
  const descriptors = [];
  for (const relFile of Array.isArray(parsed.converted) ? parsed.converted : []) {
    const descriptorRel = descriptorPathFor(relFile);
    let descriptor;
    try {
      descriptor = JSON.parse(fs.readFileSync(path.join(repoRoot, descriptorRel), 'utf8'));
    } catch (e) {
      throw new Error(`SCHEMA-HOMES: converted step ${relFile} has no readable descriptor at ${descriptorRel}: ${e.message}`);
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}

/** In-memory fixtures + assertions (no disk). Throws on the first failure. */
export function selfTest() {
  // RED DIRECTION — an uncovered traced read IS reported: exactly one row.
  const bare = { identity: { name: 'fixture_step' }, checks: [{ id: 'c1' }] };
  const red = checkReadsCoverage(bare, [{ table: 'wsib_registry', column: 'linked_entity_id' }]);
  if (red.pass !== true || red.reportOnly !== true) {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): check-reads coverage must be report-only pass:true (${JSON.stringify(red)})`);
  }
  if (red.uncovered.length !== 1 || red.uncovered[0] !== 'wsib_registry.linked_entity_id') {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): an uncovered traced read is not reported (${JSON.stringify(red)})`);
  }
  if (red.rows.length !== 1 || red.rows[0] !== 'R:check-reads:fixture_step:wsib_registry.linked_entity_id') {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): uncovered read did not yield exactly one R:check-reads row (${JSON.stringify(red.rows)})`);
  }

  // GREEN CONTROL 1 — covered by inputs.reads.tables WITH the column listed.
  const byColumn = checkReadsCoverage(
    { ...bare, inputs: { reads: { tables: [{ table: 'wsib_registry', columns: ['linked_entity_id'] }] } } },
    [{ table: 'wsib_registry', column: 'linked_entity_id' }],
  );
  if (byColumn.uncovered.length !== 0 || byColumn.rows.length !== 0) {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): a column-listed inputs.reads.tables entry did not cover (${JSON.stringify(byColumn)})`);
  }

  // GREEN CONTROL 2 — covered by a WHOLE-TABLE inputs.reads.tables entry (no columns).
  const byWholeTable = checkReadsCoverage(
    { ...bare, inputs: { reads: { tables: [{ table: 'wsib_registry' }] } } },
    [{ table: 'wsib_registry', column: 'match_confidence' }],
  );
  if (byWholeTable.uncovered.length !== 0 || byWholeTable.rows.length !== 0) {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): a whole-table inputs.reads.tables entry did not cover (${JSON.stringify(byWholeTable)})`);
  }

  // GREEN CONTROL 3 — covered by checks[].reads (the C7-1 home itself).
  const byCheckReads = checkReadsCoverage(
    { ...bare, checks: [{ id: 'c1', reads: [{ table: 'wsib_registry', columns: ['linked_entity_id'] }] }] },
    [{ table: 'wsib_registry', column: 'linked_entity_id' }],
  );
  if (byCheckReads.uncovered.length !== 0 || byCheckReads.rows.length !== 0) {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): a checks[].reads declaration did not cover (${JSON.stringify(byCheckReads)})`);
  }
  if (!declaredCheckReads({ ...bare, checks: [{ reads: [{ table: 'wsib_registry' }] }] }).includes('wsib_registry.*')) {
    throw new Error('self-test FAILED (SCHEMA-HOMES): a columns-less checks[].reads entry did not yield table.*');
  }
  if (declaredCheckReads({ checks: 'none' }).length !== 0 || declaredCheckReads({}).length !== 0) {
    throw new Error('self-test FAILED (SCHEMA-HOMES): checks:"none"/absent must declare no reads');
  }

  // C7-2 — by_mode wins, then the mode-agnostic integer, then null.
  const both = { outputs: { write_inventory: { statements: 10, by_mode: { full: { statements: 13 }, incremental: { statements: 10 } } } } };
  if (writeInventoryForMode(both, 'full') !== 13 || writeInventoryForMode(both, 'incremental') !== 10) {
    throw new Error('self-test FAILED (SCHEMA-HOMES): by_mode[mode].statements did not win');
  }
  if (writeInventoryForMode({ outputs: { write_inventory: { statements: 7 } } }, 'full') !== 7) {
    throw new Error('self-test FAILED (SCHEMA-HOMES): did not fall back to write_inventory.statements');
  }
  if (writeInventoryForMode({ outputs: { write_inventory: { by_mode: { full: { statements: 3 } } } } }, 'incremental') !== null) {
    throw new Error('self-test FAILED (SCHEMA-HOMES): an absent mode key must fall back to null, never a guessed value');
  }
  if (writeInventoryForMode({ outputs: { write_inventory: { by_mode: {} } } }, 'full') !== null || writeInventoryForMode({}, 'full') !== null) {
    throw new Error('self-test FAILED (SCHEMA-HOMES): no integer anywhere must return null');
  }

  // homesReport — report-only, counts declarers, never blocks.
  const report = homesReport([
    { identity: { name: 'a' }, checks: [{ reads: [{ table: 'wsib_registry' }] }], outputs: { write_inventory: { statements: 1, by_mode: { full: { statements: 2 } } } } },
    { identity: { name: 'b' }, checks: [{ id: 'c' }], outputs: { write_inventory: { statements: 3 } } },
  ]);
  if (report.pass !== true || report.reportOnly !== true) {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): homesReport must be report-only pass:true (${JSON.stringify(report)})`);
  }
  if (report.checkReadsDeclarers.join(',') !== 'a' || report.byModeDeclarers.join(',') !== 'a') {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): homesReport declarer lists wrong (${JSON.stringify(report)})`);
  }
  if (!report.detail.includes('checks[].reads declared by 1/2 step(s); write_inventory.by_mode declared by 1/2')) {
    throw new Error(`self-test FAILED (SCHEMA-HOMES): homesReport detail wrong (${report.detail})`);
  }
}

export { descriptorPathFor };
