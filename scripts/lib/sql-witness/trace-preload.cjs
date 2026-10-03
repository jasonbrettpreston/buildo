// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 1 (tracer, D5)
//
// P1-C3a tracer preload. Loaded in the traced child via `NODE_OPTIONS=--require`
// together with `BUILDO_SQL_TRACE=<dir>`. It wraps `pg.Client.prototype.query`
// exactly once (symbol-guarded) and buffers a per-process, deduplicated view of
// the SQL the process actually issued. It prints nothing to stdout/stderr (no
// console.* at all), never calls process.exit, and never changes the wrapped
// call's return value or resolution; resolution into table facts happens later.
// `flush()` uses fs.writeFileSync on purpose: it runs from the 'exit' handler,
// where async writes would not survive process teardown. Every module instance
// (re-require) shares ONE global state object, so `_state()`/`_reset()`/`flush()`
// are instance-independent. The optional caller tag is set only by
// src/lib/db/sql-trace-caller.ts in test mode; pipeline traces never carry it.
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require('pg');

const WRAP_GUARD = Symbol.for('buildo.sql-witness.wrapped');
const STATE_KEY = Symbol.for('buildo.sql-witness.state');
const CALLER_KEY = Symbol.for('buildo.sql-witness.caller');
const NO_TEXT = '\u0000NO_TEXT';
const NO_TEXT_ERROR = 'FAIL:INPUT:no-text';
const PIPELINE_RUNS_RE = /pipeline_runs/i;
const MAX_PARAMS = 5;

// One shared state per process: `texts` maps text → statement index (stable
// indexes), `seqs` maps client id → run-length text-index sequence, `clientIds`
// hands out ids. `_reset()` clears counters but keeps the identity maps.
if (!globalThis[STATE_KEY]) {
  globalThis[STATE_KEY] = {
    texts: new Map(),
    statements: [],
    seqs: new Map(),
    nextClient: 1,
    clientIds: new WeakMap(),
    calls: 0,
    selfNs: 0n,
  };
}
const state = globalThis[STATE_KEY];

function indexOf(text) {
  let idx = state.texts.get(text);
  if (idx === undefined) {
    idx = state.texts.size;
    state.texts.set(text, idx);
  }
  return idx;
}

function entryFor(text) {
  const idx = indexOf(text);
  if (!state.statements[idx]) state.statements[idx] = { text, count: 0, rowCount: 0, clients: [] };
  return state.statements[idx];
}

function clientIdFor(client) {
  let id = state.clientIds.get(client);
  if (id === undefined) {
    id = state.nextClient;
    state.nextClient += 1;
    state.clientIds.set(client, id);
  }
  return id;
}

function seqFor(id) {
  if (!state.seqs.has(id)) state.seqs.set(id, []);
  return state.seqs.get(id);
}

function noteCall(entry, id) {
  entry.count += 1;
  state.calls += 1;
  if (entry.clients.indexOf(id) === -1) entry.clients.push(id);
  const seq = seqFor(id);
  const last = seq[seq.length - 1];
  const textIdx = indexOf(entry.text);
  if (last && last[0] === textIdx) last[1] += 1;
  else seq.push([textIdx, 1]);
}

// Only `pipeline_runs` reads keep bind values (EC-D10 witness), up to
// MAX_PARAMS distinct shapes.
function paramsOf(arg0, arg1, entry) {
  let values;
  if (Array.isArray(arg1)) values = arg1;
  else if (arg0 && typeof arg0 === 'object' && Array.isArray(arg0.values)) values = arg0.values;
  else return;
  let json;
  try {
    json = JSON.parse(JSON.stringify(values));
  } catch {
    return;
  }
  if (json === undefined) return;
  if (!entry.params) entry.params = [];
  if (entry.params.length >= MAX_PARAMS) return;
  if (!entry.params.some((p) => JSON.stringify(p) === JSON.stringify(json))) entry.params.push(json);
}

function textOf(arg0) {
  if (typeof arg0 === 'string') return arg0;
  if (arg0 && typeof arg0 === 'object') {
    if (typeof arg0.text === 'string') return arg0.text;
    if (arg0.cursor && typeof arg0.cursor.text === 'string') return arg0.cursor.text;
  }
  return undefined;
}

function record(arg0, arg1, thisArg) {
  const id = clientIdFor(thisArg);
  const text = textOf(arg0);
  const entry = entryFor(text === undefined ? NO_TEXT : text);
  noteCall(entry, id);
  const als = globalThis[CALLER_KEY];
  const caller = als && typeof als.getStore === 'function' ? als.getStore() : undefined;
  if (typeof caller === 'string' && caller.length > 0) {
    if (!entry.callers) entry.callers = [];
    if (entry.callers.indexOf(caller) === -1) entry.callers.push(caller);
  }
  if (text === undefined) entry.error = NO_TEXT_ERROR;
  else if (PIPELINE_RUNS_RE.test(text)) paramsOf(arg0, arg1, entry);
  return entry;
}

function addRowCount(entry, result) {
  if (entry && result && typeof result.rowCount === 'number') entry.rowCount += result.rowCount;
}

// Bracket one piece of the wrapper's OWN bookkeeping (never the query) and add
// its duration to the shared self-time accumulator.
function book(fn) {
  const t0 = process.hrtime.bigint();
  try {
    return fn();
  } finally {
    state.selfNs += process.hrtime.bigint() - t0;
  }
}

// Pass-through wrapper: same `this`, same args, same return value. Only a
// promise's resolution is observed (rowCount on the side).
function wrapQuery(original) {
  return function tracedQuery(...args) {
    return book(() => {
      // Find the FIRST function argument — the callback slot. Its index is into
      // the CALLER's own argument list (0 = text/config), never into a shifted
      // copy: an off-by-one here silently drops `values` (→ Postgres 42P02) or
      // drops `text` entirely.
      let cbIndex = -1;
      for (let i = 1; i < args.length; i += 1) {
        if (typeof args[i] === 'function') {
          cbIndex = i;
          break;
        }
      }
      const cb = cbIndex === -1 ? undefined : args[cbIndex];
      const promiseStyle = cb === undefined;
      const entry = record(args[0], promiseStyle ? args[1] : cbIndex >= 2 ? args[1] : undefined, this);

      // Copy the caller's argument list verbatim; replace ONLY the callback with
      // a delegating shim. Every other argument keeps its slot and identity.
      const out = args.slice();
      if (!promiseStyle) {
        out[cbIndex] = function tracedCallback(err, result) {
          if (!err) addRowCount(entry, result);
          return cb.apply(this, arguments);
        };
      }
      const ret = original.apply(this, out);

      if (promiseStyle && ret && typeof ret.then === 'function' && typeof ret.catch === 'function') {
        return ret.then(
          (result) => Promise.resolve(book(() => addRowCount(entry, result))).then(() => result),
          (err) => Promise.reject(err),
        );
      }
      return ret;
    });
  };
}

function wrapOnce() {
  const proto = pg && pg.Client && pg.Client.prototype;
  if (!proto || typeof proto.query !== 'function') return;
  if (proto.query[WRAP_GUARD]) return;
  const wrapped = wrapQuery(proto.query);
  wrapped[WRAP_GUARD] = true;
  proto.query = wrapped;
}

function selfMs() {
  return Math.round((Number(state.selfNs) / 1e6) * 1000) / 1000;
}

function flush() {
  const dir = process.env.BUILDO_SQL_TRACE;
  if (!dir) return;

  const lines = [
    JSON.stringify({
      type: 'header',
      pid: process.pid,
      tracer_self_ms: selfMs(),
      distinct: state.statements.length,
      calls: state.calls,
    }),
  ];
  for (let i = 0; i < state.statements.length; i += 1) {
    const entry = state.statements[i];
    if (entry) lines.push(JSON.stringify(Object.assign({ type: 'statement', i }, entry)));
  }
  const ids = Array.from(state.seqs.keys()).sort((a, b) => a - b);
  for (const id of ids) lines.push(JSON.stringify({ type: 'client', id, seq: state.seqs.get(id) }));

  const file = path.join(String(dir), String(process.pid) + '.ndjson');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

function _state() {
  const statements = [];
  for (const e of state.statements) {
    if (!e) continue;
    const copy = { text: e.text, count: e.count, rowCount: e.rowCount, clients: e.clients.slice() };
    if (e.params) copy.params = e.params;
    if (e.callers) copy.callers = e.callers.slice();
    if (e.error) copy.error = e.error;
    statements.push(copy);
  }
  const clients = {};
  const ids = Array.from(state.seqs.keys()).sort((a, b) => a - b);
  for (const id of ids) clients[String(id)] = state.seqs.get(id).map((p) => [p[0], p[1]]);
  return { statements, clients, tracer_self_ms: selfMs() };
}

function _reset() {
  state.texts = new Map();
  state.statements = [];
  state.seqs = new Map();
  state.calls = 0;
  state.selfNs = 0n;
}

// Wrap once (per process, symbol-guarded). Without `BUILDO_SQL_TRACE` there is
// nothing to write to, so no wrapping and no exit handler are installed.
if (process.env.BUILDO_SQL_TRACE) {
  wrapOnce();
  process.on('exit', flush);
}
module.exports = { flush, _reset, _state, CALLER_KEY };
