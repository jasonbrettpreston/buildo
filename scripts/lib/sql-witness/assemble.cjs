// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3b trace assembly)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 (WITNESS)
//
// Trace assembly harness (P1-C3b1). Consumes the per-pid NDJSON files written by
// the tracer (scripts/lib/sql-witness/trace-preload.cjs, see p1c3a-contract.md),
// resolves each distinct SQL text with the libpg-query resolver (resolve.cjs) and
// emits one trace document per p1c3-trace-format.md.
//
// CommonJS, 'use strict', no fs, no DB, no stdout. The only dependencies are
// `path` and `./resolve.cjs`. Statement text is dropped from the output EXCEPT
// for statements whose resolved `excluded` includes `pipeline_runs`, where the
// text and the tracer's recorded `params` are kept verbatim for the PRODUCER
// check.
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolve = require('./resolve.cjs');

// Text forms that open / close an explicit transaction block.
const BEGIN_RE = /^\s*(BEGIN|START\s+TRANSACTION)\b/i;
const END_RE = /^\s*(COMMIT|ROLLBACK|END)\b/i;
// A statement is a PRODUCER-check carrier when its exclusion list names the
// runner's own ledger relation.
const PRODUCER_TABLE = 'pipeline_runs';
// Params kept per merged statement (contract: never more than 5).
const MAX_PARAMS = 5;

const sortedUnique = (xs) => Array.from(new Set(xs)).sort();

/** Sorted unique keys of a table -> columns map, with each column list sorted. */
function sortColumns(map) {
  const out = {};
  for (const table of Object.keys(map).sort()) {
    out[table] = sortedUnique(map[table]);
  }
  return out;
}

/** Parse one NDJSON file body into its header / statements / clients. */
function parseFile(text) {
  const out = { header: null, statements: [], clients: [] };
  const lines = String(text).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue; // no fs/stdout: a malformed line is dropped, never fatal
    }
    if (!obj || typeof obj !== 'object') continue;
    if (obj.type === 'header') out.header = obj;
    else if (obj.type === 'statement') out.statements.push(obj);
    else if (obj.type === 'client') out.clients.push(obj);
  }
  return out;
}

/**
 * Reconstruct, per client, the explicit transaction blocks from the run-length
 * `seq`. A block opens at a BEGIN/START TRANSACTION statement and closes at a
 * COMMIT/ROLLBACK/END statement; a write outside any block is autocommit. A block
 * is only recorded when it contains at least one write fingerprint.
 */
function deriveTransactions(clients, pid, textOf, kindOf, writeFpOf) {
  const transactions = [];
  const autocommit = [];
  for (const c of clients) {
    const seq = Array.isArray(c.seq) ? c.seq : [];
    let block = null;
    let open = false;
    const closeBlock = () => {
      if (block && block.writes.length > 0) {
        transactions.push({ client: `${pid}:${c.id}`, write_fingerprints: sortedUnique(block.writes) });
      }
      block = null;
      open = false;
    };
    for (const run of seq) {
      const idx = run[0];
      const repeat = run[1];
      for (let n = 0; n < repeat; n += 1) {
        const text = textOf(idx);
        if (BEGIN_RE.test(text)) {
          if (open) closeBlock(); // defensive: a nested BEGIN closes the prior block
          block = { writes: [] };
          open = true;
          continue;
        }
        if (END_RE.test(text)) {
          if (open) closeBlock();
          continue;
        }
        if (kindOf(idx) !== 'write') continue;
        const fp = writeFpOf(idx);
        if (!fp) continue;
        if (open && block) block.writes.push(fp);
        else autocommit.push(fp);
      }
    }
    if (open) closeBlock(); // unterminated block at process exit
  }
  return { transactions, autocommit };
}

/** Union two table -> columns maps into a single sorted, unique map. */
function unionColumns(...maps) {
  const out = {};
  for (const map of maps) {
    for (const table of Object.keys(map || {})) {
      if (!out[table]) out[table] = [];
      for (const col of map[table]) out[table].push(col);
    }
  }
  return sortColumns(out);
}

/** The sibling trace path of a golden JSON path (same directory). */
function tracePathFor(goldenOutPath) {
  const dir = path.dirname(goldenOutPath);
  const base = path.basename(goldenOutPath, '.json');
  return path.join(dir, `${base}.trace.json`);
}

/** Tables written by the trace, sorted (table-level dependencies). */
function preTablesFromTrace(trace) {
  return Object.keys((trace && trace.touched && trace.touched.writes) || {}).sort();
}

/**
 * Assemble a trace document from the per-pid NDJSON bodies.
 *
 * @param {{ndjsonTexts: string[], catalog: Record<string,string[]>, meta: {step:string, chain:string, source_fingerprint:string|null, git_head:string, wall_ms:number}}} input
 * @returns {Promise<object>} the trace doc per p1c3-trace-format.md
 */
async function assembleTrace({ ndjsonTexts, catalog, meta }) {
  await resolve.init();
  const cat = catalog || {};
  const files = Array.isArray(ndjsonTexts) ? ndjsonTexts : [];

  const parsed = files.map(parseFile);
  const processes = parsed.length;
  let tracerSelfMs = 0;
  for (const file of parsed) {
    const v = file.header && file.header.tracer_self_ms;
    if (typeof v === 'number') tracerSelfMs += v;
  }
  tracerSelfMs = Math.round(tracerSelfMs * 1000) / 1000;

  // Resolve every distinct text ONCE, keyed by `pid\u0000text`.
  const perFileEntries = parsed.map((file) => {
    const pid = file.header && file.header.pid != null ? file.header.pid : 0;
    const byIndex = new Map();
    const entries = file.statements.map((st) => {
      const text = typeof st.text === 'string' ? st.text : String(st.text == null ? '' : st.text);
      const r = resolve.resolveStatement(text, cat);
      const entry = {
        pid,
        text,
        st,
        fingerprint: r.fingerprint,
        kind: r.kind,
        reads: r.reads || {},
        writes: r.writes || {},
        excluded: r.excluded || [],
        error: r.error || null,
        tracerError: typeof st.error === 'string' ? st.error : null,
      };
      byIndex.set(st.i, entry);
      return entry;
    });
    return { pid, byIndex, entries, clients: file.clients };
  });

  // Merge by fingerprint: counts/rowCount summed, reads/writes/excluded unioned,
  // error = first non-null, params concatenated (max 5), text kept only for the
  // pipeline_runs PRODUCER carrier.
  const merged = new Map();
  const errors = [];
  for (const file of perFileEntries) {
    for (const entry of file.entries) {
      const fp = entry.fingerprint;
      if (!merged.has(fp)) {
        merged.set(fp, {
          fingerprint: fp,
          kinds: new Set(),
          count: 0,
          rowCount: 0,
          readsList: [],
          writesList: [],
          excluded: [],
          error: null,
          params: [],
          text: null,
        });
      }
      const m = merged.get(fp);
      m.kinds.add(entry.kind);
      m.count += typeof entry.st.count === 'number' ? entry.st.count : 0;
      m.rowCount += typeof entry.st.rowCount === 'number' ? entry.st.rowCount : 0;
      m.readsList.push(entry.reads);
      m.writesList.push(entry.writes);
      for (const e of entry.excluded) m.excluded.push(e);
      if (entry.error && !m.error) m.error = entry.error;
      if (entry.error) errors.push(entry.error);
      if (entry.tracerError) errors.push(entry.tracerError);
      if (m.text == null && entry.excluded.indexOf(PRODUCER_TABLE) !== -1) m.text = entry.text;
      if (Array.isArray(entry.st.params) && m.params.length < MAX_PARAMS) {
        for (const p of entry.st.params) {
          if (m.params.length < MAX_PARAMS) m.params.push(p);
        }
      }
    }
  }

  const statements = [];
  let utility = 0;
  for (const m of merged.values()) {
    const reads = unionColumns(...m.readsList);
    const writes = unionColumns(...m.writesList);
    const excluded = sortedUnique(m.excluded);
    const hasTableTouch = Object.keys(writes).length > 0 || Object.keys(reads).length > 0;
    const kind = !hasTableTouch && m.kinds.has('utility') ? 'utility' : Array.from(m.kinds)[0];
    if (kind === 'utility') utility += m.count;

    const out = {
      fingerprint: m.fingerprint,
      kind,
      count: m.count,
      rowCount: m.rowCount,
      reads,
      writes,
      excluded,
      error: m.error || null,
    };
    if (excluded.indexOf(PRODUCER_TABLE) !== -1) {
      out.text = m.text;
      out.params = m.params;
    }
    statements.push(out);
  }
  statements.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));
  errors.sort();

  // Reconstruct transactions from the clients' run-length sequences.
  let transactions = [];
  let autocommit = [];
  for (const file of perFileEntries) {
    const textOf = (idx) => {
      const e = file.byIndex.get(idx);
      return e ? e.text : '';
    };
    const kindOf = (idx) => {
      const e = file.byIndex.get(idx);
      return e ? e.kind : 'utility';
    };
    const writeFpOf = (idx) => {
      const e = file.byIndex.get(idx);
      return e ? e.fingerprint : null;
    };
    const derived = deriveTransactions(file.clients, file.pid, textOf, kindOf, writeFpOf);
    transactions = transactions.concat(derived.transactions);
    autocommit = autocommit.concat(derived.autocommit);
  }
  autocommit = sortedUnique(autocommit);
  transactions.sort((a, b) => (a.client < b.client ? -1 : a.client > b.client ? 1 : 0));

  // "touched" lists every column dependency: the union of all statements' reads
  // and writes for the read side, and the union of writes for the write side.
  const allReads = unionColumns(...statements.map((s) => s.reads));
  const allWrites = unionColumns(...statements.map((s) => s.writes));
  const touched = {
    reads: unionColumns(allReads, allWrites),
    writes: allWrites,
  };

  const theMeta = meta || {};
  return {
    trace_version: 1,
    step: theMeta.step,
    chain: theMeta.chain,
    source_fingerprint: theMeta.source_fingerprint == null ? null : theMeta.source_fingerprint,
    git_head: theMeta.git_head,
    header: {
      processes,
      calls: statements.reduce((sum, s) => sum + s.count, 0),
      distinct: statements.length,
      utility,
      tracer_self_ms: tracerSelfMs,
      wall_ms: theMeta.wall_ms,
    },
    statements,
    transactions,
    autocommit_writes: autocommit,
    touched,
    errors,
  };
}

module.exports = { assembleTrace, tracePathFor, preTablesFromTrace };
