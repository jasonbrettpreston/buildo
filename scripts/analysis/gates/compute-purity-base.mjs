// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ, compute purity)
//            plan: .cursor/wf1_compute_purity_active_task.md Phase 1
//
// Split out of compute-purity.mjs (2026-10-11, mechanical move, no behaviour change): the shared constants, fixtures, SQL loader and closed code table.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { computeEntries, computeClosure, requireClosure } from './compute-closure.mjs';

const require = createRequire(import.meta.url);
export const resolver = require('../../lib/sql-witness/resolve.cjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** The two fixtures the self-test proves the rules against. */
export const BAD_FIXTURE = 'scripts/steps/_schema/fixtures/compute/bad-compute-purity.js';
export const CLEAN_FIXTURE = 'scripts/steps/_schema/fixtures/compute/clean-compute-purity.js';
/** The bad fixture's `require()`d helper — the closure module that must be scanned too. */
export const BAD_HELPER = 'scripts/steps/_schema/fixtures/compute/helpers/purity-helper.js';

let lq = null;

/** Load libpg-query through the witness resolver, exactly like `report-fields/sql-lineage.mjs` `initSql()`. */
export async function initSql() {
  await resolver.init();
  if (!lq) lq = require('libpg-query');
  return { resolver, lq };
}

export function libpg() {
  if (!lq) throw new Error('compute-purity: initSql() was not awaited');
  return lq;
}

// ------------------------------------------------------------------ codes (closed)
// B3: G5/G7/G8 appended — `codesSummary` and the `--list` summary line iterate
// this object, so an added code reports automatically.
//
// The three AST halves (CP-B3), all judged over compute ENTRIES only, never a
// closure module (the same scope G2 uses):
//   G5 `compute-direct-write` — a `<x>.query(<arg>)` call where `<arg>` IS a DML
//                               literal (INSERT|UPDATE|DELETE|MERGE, or a WITH
//                               containing one), or an identifier whose single
//                               const/let initializer in the SAME function is one.
//                               CLOSED seam set: NOT a violation when the literal
//                               flows into `ctx.joinUpdate` / `ctx.flushBatch` /
//                               `ctx.retract` / `ctx.stream`, or is the value of an
//                               object property whose name ends with `_sql`. An
//                               UNRESOLVED arg (a parameter, a call result, a
//                               wrapper such as `flushClient.query`) whose receiver
//                               is not a `ctx.*` seam is ALSO a site. A resolved
//                               literal's fp is its libpg fingerprint (the same
//                               helper G1–G4 use); an unresolved one's fp is
//                               `call:` + the trimmed line.
//   G7 `compute-decides`      — a `<`/`<=`/`>`/`>=` comparison where either operand
//                               is a property access rooted at `ctx.config`, or at a
//                               local alias bound by `const|let <a> = ctx.config`,
//                               `= ctx.config || {}`, `= ctx.config ?? {}`, or the
//                               destructuring `const { x } = ctx.config` (then `x`
//                               is an alias). fp = `js:` + the trimmed line.
//   G8 `compute-halt`         — a `throw` reachable, by same-file call graph
//                               (function declarations, const arrows, method
//                               shorthand; depth-first, cycle-safe), from an export
//                               named by the step's descriptor
//                               `execution.enrich_hooks.contract_read` or
//                               `execution.enrich_hooks.defer_scope.export`. A
//                               fixture with no descriptor uses the functions named
//                               in an exported `enrich_hooks` object literal. fp =
//                               `js:` + the trimmed line.

/** `code → {rule}` — the closed code set this gate emits. */
export const CODES = {
  G1: { rule: 'compute-ledger-sql' },
  G2: { rule: 'compute-undeclared-relation' },
  G3: { rule: 'compute-catalog' },
  G4: { rule: 'compute-ddl-txn' },
  G5: { rule: 'compute-direct-write' },
  G7: { rule: 'compute-decides' },
  G8: { rule: 'compute-halt' },
};

/** The `ctx.*` methods that ARE the semantic seam for a DML literal (G5's closed exempt set). */
export const SEAM_METHODS = new Set(['joinUpdate', 'flushBatch', 'retract', 'stream']);
/** The comparison operators G7 judges. */
export const COMPARE_OPS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);
