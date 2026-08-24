#!/usr/bin/env node
/**
 * The pg.Pool construction spy (claim #86), as a CHILD PROCESS.
 *
 * `pipeline.step()` is a FACTORY: requiring a step file must open no pool and
 * issue no query (Spec 122 §4.2). Proving that needs the spy installed BEFORE the
 * target module is loaded, and `pg` mutated in place so `const { Pool } =
 * require('pg')` inside scripts/lib/pipeline.js resolves to the spy.
 *
 * ⚠️ IT LIVES IN scripts/hooks/, NOT src/tests/. Two ESLint rules that are right
 * for application code are wrong for this file: `no-require-imports` (the whole
 * point is CJS require semantics) and the `process.exit()` ban scoped to src/
 * (the probe MUST exit deterministically after writeSync). Rather than stack
 * five disable comments on a 90-line harness, it sits beside its sibling driver
 * scripts/hooks/check-step-shape.mjs, where both rules correctly do not apply.
 *
 * ⚠️ WHY A CHILD PROCESS AND NOT vi.mock. Doing this inside the vitest worker
 * means mutating a module the whole worker shares, and a restore that misses on a
 * throw poisons every later test file in that worker. A child process is hermetic,
 * and it is also FAITHFUL — it catches the things a Pool spy alone cannot: a
 * top-level `fs.readFileSync`, a `dotenv` load, an env assertion that throws. Those
 * surface here as a non-null `error`, which is exactly the second half of #86 that
 * §5.1 assigns to ast-grep.
 *
 * Usage:   node scripts/hooks/step-require-probe.cjs <path-to-step-file>
 * Output:  one JSON object on stdout. Never throws — a require failure is DATA.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.2, §5.2
 */
'use strict';

const fs = require('fs');
const path = require('path');

const target = process.argv[2];

let pools = 0;
let clients = 0;

// Install the spy first: `pg` must already be in require.cache when the target
// (and, through it, scripts/lib/pipeline.js) destructures Pool off it.
let pgLoadError = null;
try {
  const pg = require('pg');
  const RealPool = pg.Pool;
  const RealClient = pg.Client;

  function SpyPool(...args) {
    pools++;
    return new RealPool(...args);
  }
  SpyPool.prototype = RealPool.prototype;

  function SpyClient(...args) {
    clients++;
    return new RealClient(...args);
  }
  SpyClient.prototype = RealClient.prototype;

  pg.Pool = SpyPool;
  pg.Client = SpyClient;
} catch (err) {
  pgLoadError = err && err.message ? err.message : String(err);
}

let exported = null;
let requireError = null;
try {
  exported = require(path.resolve(target));
} catch (err) {
  requireError = err && err.message ? err.message : String(err);
}

const descriptor = exported && exported.descriptor ? exported.descriptor : null;
const identity = descriptor && descriptor.identity ? descriptor.identity : null;

const out = {
  target,
  pools,
  clients,
  pg_load_error: pgLoadError,
  require_error: requireError,
  has_descriptor: Boolean(descriptor),
  compute_type: exported ? typeof exported.compute : 'undefined',
  identity_name: identity ? identity.name : null,
  identity_lock: identity ? identity.lock : null,
  checks_length: descriptor && Array.isArray(descriptor.checks) ? descriptor.checks.length : null,
};

// writeSync + explicit exit: a step file that constructed a pool would otherwise
// keep the event loop alive, and an async stdout write can be truncated on a
// Windows pipe when the process exits underneath it.
fs.writeSync(1, JSON.stringify(out));
process.exit(0);
