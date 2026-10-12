// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ (amends R-BG); 122a §A26 "Witness attribution"
// Plan: .cursor/wf1_compute_purity_active_task.md "Witness attribution (A3, R-BZ, amends R-BG)"
//
// The CALLER-side builder of gate #44's `runnerFingerprints` (witness.mjs stays pure ESM with no fs).
// A statement whose fingerprint is in this map is RUNNER-authored (the step runner's own SQL, outside
// the step's declared reads/writes). Everything else carrying `excluded[]` is compute-attributed.
//   1. every plain SQL literal in the RUNNER closure (compute-closure.mjs `runnerClosure`), fingerprinted
//      with libpg-query `fingerprintSync` (the helper compute-purity-base.mjs `libpg()` loads);
//   2. CLOSED_RUNNER_TEMPLATES: the trace fingerprints no plain literal can produce (an interpolated
//      template, or descriptor-authored SQL the runner executes), each with a file:line cite. Measured
//      2026-10-11 (.cursor/b6-attribution.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { initSql } from './compute-purity-base.mjs';
import { runnerClosure } from './compute-closure.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SQL_WORD = /\b(select|insert|update|delete|with|begin|commit|rollback|set|show|vacuum|analyze|create|drop|alter|truncate)\b/i;

export const CLOSED_RUNNER_TEMPLATES = Object.freeze([
  Object.freeze({ fingerprint: '4253520a71996e5c', cite: 'scripts/lib/step/index.js:5886', why: 'countTables `SELECT COUNT(*)::bigint AS n FROM ${t}`, t = pg_stat_user_tables (inputs.expect_nonempty)' }),
  Object.freeze({ fingerprint: 'caf69de66af279fa', cite: 'scripts/lib/step/index.js:5886', why: 'countTables, t = logic_variables (inputs.expect_nonempty)' }),
  Object.freeze({ fingerprint: 'aeeb008ed29d0e15', cite: 'scripts/lib/step/plausibility.js:163', why: 'executes scripts/enrich-parcels.descriptor.json:2319 plausibility[3].sql (descriptor-authored)' }),
]);

/**
 * Stats for the most recent `buildRunnerFingerprints` call. `scanned` counts fingerprints derived from
 * the runner closure's SQL literals (before CLOSED_RUNNER_TEMPLATES are merged); `skippedUnparseable`
 * counts literals that looked like SQL but whose fingerprint threw a parse error.
 * @type {{ scanned: number, skippedUnparseable: number }}
 */
export let lastRunnerSetStats = { scanned: 0, skippedUnparseable: 0 };

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
  for (const e of CLOSED_RUNNER_TEMPLATES) if (!out.has(e.fingerprint)) out.set(e.fingerprint, e.cite);
  return out;
}
