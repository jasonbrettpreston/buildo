// SPEC LINK: MB-73 stage 8 fix B5; R-KQ / R-KU (a row needs a real green, the audit pack shows the real run).
// The only difference between a pass and a fail here is the counts line of the file's own run: when the file did not
// run at all, or the report cannot be read, the answer is `FAIL:R:cannot-decide:audit-counts:<id>`, never a guess.
// Pure: no git, no fs, no env; the caller parses the vitest JSON and passes it in.

const SKIPPED = new Set(['pending', 'skipped', 'todo']);

/** True for a plain non-array object. */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** True when the vitest `name` names `artifact` (same path, or one path ending in `/` + the other). */
const names = (name, artifact) =>
  typeof name === 'string' &&
  (name === artifact || name.endsWith('/' + artifact) || artifact.endsWith('/' + name));

/** The summary line of one file run, two spaces after `Tests`; null in, null out. */
export function countsLineOf(counts) {
  if (!isObject(counts)) return null;
  const { passed, failed, skipped, total } = counts;
  const parts = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (passed > 0 || failed === 0) parts.push(`${passed} passed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `Tests  ${parts.join(' | ')} (${total})`;
}

/**
 * `{passed, failed, skipped, total}` summed over the assertionResults of the testResults entry for `artifact`;
 * a skipped/todo/pending test counts as skipped; null when the file is not in the report or the report is unusable.
 * @param {unknown} json parsed vitest JSON report
 * @param {string} artifact path of the test file
 * @returns {{passed: number, failed: number, skipped: number, total: number}|null}
 */
export function countsFor(json, artifact) {
  if (!isObject(json) || !Array.isArray(json.testResults) || typeof artifact !== 'string') return null;
  const file = json.testResults.find((r) => isObject(r) && names(r.name, artifact));
  if (!file) return null;
  if (!Array.isArray(file.assertionResults)) return { passed: 0, failed: 0, skipped: 0, total: 0 };
  const out = { passed: 0, failed: 0, skipped: 0, total: 0 };
  for (const a of file.assertionResults) {
    const status = isObject(a) ? a.status : undefined;
    out.total += 1;
    if (status === 'passed') out.passed += 1;
    else if (status === 'failed') out.failed += 1;
    else if (SKIPPED.has(status)) out.skipped += 1;
  }
  return out;
}

/**
 * The audit rows of the given artifacts: sorted by id, each `{id, command, counts}`; a row that did not run makes the
 * whole pack undecidable; a not-green row is listed with its real line and adds `FAIL:R:not-green:<id>`.
 * @param {{artifacts: Array<{id: string, artifact: string}>|unknown, json: unknown}} opts
 * @returns {{entries: Array<{id: string, command: string, counts: string|null}>, lines: string[]}}
 */
export function auditEntries({ artifacts, json } = {}) {
  if (!Array.isArray(artifacts)) return { entries: [], lines: ['FAIL:R:cannot-decide:audit-counts:artifacts'] };
  const rows = artifacts
    .filter((a) => isObject(a) && typeof a.id === 'string' && typeof a.artifact === 'string')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (rows.length !== artifacts.length) return { entries: [], lines: ['FAIL:R:cannot-decide:audit-counts:shape'] };
  const entries = [];
  const lines = [];
  const seen = new Set();
  for (const { id, artifact } of rows) {
    if (seen.has(id)) return { entries: [], lines: [`FAIL:R:cannot-decide:audit-counts:${id}`] };
    seen.add(id);
    const counts = countsFor(json, artifact);
    const text = countsLineOf(counts);
    if (text === null) return { entries: [], lines: [`FAIL:R:cannot-decide:audit-counts:${id}`] };
    entries.push({ id, command: `npx vitest run ${artifact} --run`, counts: text });
    if (counts.failed > 0 || counts.skipped > 0) lines.push(`FAIL:R:not-green:${id}`);
  }
  return { entries, lines };
}
