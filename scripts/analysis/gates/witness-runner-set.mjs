// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ (amends R-BG); 122a §A26 "Witness attribution"
// Plan: .cursor/wf1_compute_purity_active_task.md "Witness attribution (A3, R-BZ, amends R-BG)"
//
// The CALLER-side builder of gate #44's `runnerFingerprints` (witness.mjs stays pure ESM with no fs).
// A statement whose fingerprint is in this map is RUNNER-authored (the step runner's own SQL, outside
// the step's declared reads/writes). Everything else carrying `excluded[]` is compute-attributed.
//   1. every plain SQL literal in the RUNNER closure (compute-closure.mjs `runnerClosure`), fingerprinted
//      with libpg-query `fingerprintSync` (the helper compute-purity-base.mjs `libpg()` loads);
//   2. every SQL shape THE ONE run-history reader can emit (`readRunHistory`, scripts/lib/step/ledger.js):
//      its text is an interpolated template over a closed option space, so the reader itself is called
//      with a capturing fake pool over that whole space (Spec 124 R-BG; #44 G1, McDonald's Airtight V3);
//   3. CLOSED_RUNNER_TEMPLATES: the trace fingerprints no plain literal can produce (an interpolated
//      template, or descriptor-authored SQL the runner executes), each with a file:line cite. Measured
//      2026-10-11 (.cursor/b6-attribution.md).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { initSql } from './compute-purity-base.mjs';
import { runnerClosure } from './compute-closure.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SQL_WORD = /\b(select|insert|update|delete|with|begin|commit|rollback|set|show|vacuum|analyze|create|drop|alter|truncate)\b/i;

export const CLOSED_RUNNER_TEMPLATES = Object.freeze([
  Object.freeze({ fingerprint: '4253520a71996e5c', cite: 'scripts/lib/step/index.js:6632', why: 'countTables `SELECT COUNT(*)::bigint AS n FROM ${t}`, t = pg_stat_user_tables (inputs.expect_nonempty)' }),
  Object.freeze({ fingerprint: 'caf69de66af279fa', cite: 'scripts/lib/step/index.js:6632', why: 'countTables, t = logic_variables (inputs.expect_nonempty)' }),
  Object.freeze({ fingerprint: 'aeeb008ed29d0e15', cite: 'scripts/lib/step/plausibility.js:169', why: 'executes scripts/enrich-parcels.descriptor.json:2319 plausibility[3].sql (descriptor-authored)' }),
]);

/**
 * Stats for the most recent `buildRunnerFingerprints` call. `scanned` counts fingerprints derived from
 * the runner closure's SQL literals (before CLOSED_RUNNER_TEMPLATES are merged); `skippedUnparseable`
 * counts literals that looked like SQL but whose fingerprint threw a parse error.
 * @type {{ scanned: number, skippedUnparseable: number }}
 */
export let lastRunnerSetStats = { scanned: 0, skippedUnparseable: 0 };

/**
 * The libpg fingerprint function the traces use (the witness stays pure, so the caller hands it in).
 * @returns {Promise<(sql: string) => string>}
 */
export async function sqlFingerprinter() {
  const { lq: pg } = await initSql();
  return (sql) => pg.fingerprintSync(sql);
}

/**
 * Every fingerprint `readRunHistory` can produce, derived by calling it. The option space is closed by
 * the reader's own whitelists: `columns` ⊆ RUN_HISTORY_COLUMNS (libpg sorts the target list, so a subset
 * covers every order), `orderBy` ∈ RUN_HISTORY_ORDER_BY, and the three optional predicates on/off. Values
 * (slug, statuses, limit, the bound instant and key) never reach the text.
 * @returns {Promise<{ fingerprints: Set<string>, cite: string }>}
 */
export async function runHistoryFingerprints(pg, repoRoot = REPO_ROOT) {
  const rel = 'scripts/lib/step/ledger.js';
  const abs = path.join(repoRoot, rel);
  const ledger = createRequire(import.meta.url)(abs);
  const cite = `${rel}:${fs.readFileSync(abs, 'utf8').split(/\r?\n/).findIndex((l) => l.startsWith('async function readRunHistory(')) + 1}`;
  const columns = ledger.RUN_HISTORY_COLUMNS;
  const orderBys = ledger.RUN_HISTORY_ORDER_BY;
  if (!Array.isArray(columns) || columns.length === 0 || !Array.isArray(orderBys) || orderBys.length === 0) {
    throw new Error(`${rel} must export RUN_HISTORY_COLUMNS and RUN_HISTORY_ORDER_BY (the reader's closed option space)`);
  }
  let seen = null;
  const pool = { query: (sql) => { seen = sql; return Promise.resolve({ rows: [] }); } };
  const fingerprints = new Set();
  for (let mask = 1; mask < (1 << columns.length); mask += 1) {
    const cols = columns.filter((_, i) => mask & (1 << i));
    for (const orderBy of orderBys) for (const excludeWarnSkip of [true, false]) {
      for (const since of [false, true]) for (const meta of [false, true]) {
        const opts = { slug: 'x', columns: cols, orderBy, excludeWarnSkip };
        if (since) opts.completedSince = 0;
        if (meta) opts.metaObject = 'k';
        seen = null;
        await ledger.readRunHistory(pool, opts);
        if (seen === null) throw new Error('readRunHistory issued no statement for a closed option');
        fingerprints.add(pg.fingerprintSync(seen));
      }
    }
  }
  return { fingerprints, cite };
}

/** The SQL text of a string / no-substitution template literal, or null (templates with `${}` are never guessed). */
function plainText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * @param {{repoRoot?: string}} [opts]
 * @returns {Promise<Map<string, string>>} fingerprint -> `file:line` cite. Throws when the closure is empty
 *   or when the closure yields no fingerprint (an empty scan is RED, never a fallback: the closed
 *   templates are merged only after that check, so they cannot mask a dead scan).
 */
export async function buildRunnerFingerprints({ repoRoot = REPO_ROOT } = {}) {
  const closure = runnerClosure({ repoRoot });
  const files = [...new Set(closure.modules)].filter((f) => /\.(c|m)?js$/.test(f));
  if (files.length === 0) throw new Error('runner closure is empty');
  const { lq: pg } = await initSql();
  const out = new Map();
  let scanned = 0;
  let skippedUnparseable = 0;
  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    const sf = ts.createSourceFile(abs, fs.readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      const text = plainText(node);
      if (text !== null && SQL_WORD.test(text)) {
        try {
          const fp = pg.fingerprintSync(text);
          scanned += 1;
          if (!out.has(fp)) out.set(fp, `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        } catch (err) {
          if (!/syntax|parse/i.test(String(err && err.message))) throw err;
          skippedUnparseable += 1; /* not parseable SQL: not a fingerprint source */
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  lastRunnerSetStats = { scanned, skippedUnparseable };
  if (scanned === 0) throw new Error('runner closure produced 0 fingerprints (scanned 0 literals)');
  const history = await runHistoryFingerprints(pg, repoRoot);
  for (const fp of history.fingerprints) if (!out.has(fp)) out.set(fp, history.cite);
  for (const e of CLOSED_RUNNER_TEMPLATES) if (!out.has(e.fingerprint)) out.set(e.fingerprint, e.cite);
  return out;
}
