// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-UNIVERSE (census arm), §10 (--refresh-census,
//            determinism rules), §11 Inputs (one BEGIN TRANSACTION READ ONLY session), §8 rule 9 (reuse the
//            sql-witness resolver); docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (direct-lot census, R -1
//            sentinel, ≥ 100 threshold), M-42 (R-ZV: dominant label, never parcels.bylaw_*)
//
// S11 census module. `refreshCensus` runs the witness-checked, SELECT-only `census.sql` in one read-only
// session and writes `census.json`; `checkCensus` is the G-UNIVERSE census arm (offline). No clock: the
// census is keyed to the SQL blob sha and the adoption id, never to a time.
//
// Reason codes (closed set):
//   census_sql_missing             scripts/seeds/bylaw/census.sql absent
//   census_sql_parse_error         census.sql does not parse (libpg-query)
//   census_sql_not_select_only     not exactly one SELECT statement, or the resolver sees a write
//   census_sql_shape               a set operation outside the top level, or a catalog table read outside a CTE
//                                  (the resolver does not descend UNION arms, so arms may read CTEs only)
//   census_sql_uncatalogued_table  a read table the witness catalog does not carry
//   census_sql_unknown_column      a read column the catalog does not list for its table
//   census_reads_bylaw_column      any column reference named bylaw_* (R-ZV, Spec 69 M-42)
//   census_json_missing            scripts/seeds/bylaw/census.json absent
//   census_sql_sha_mismatch        census.json's sql.blob_sha != the working-tree census.sql blob sha
//   census_counts_missing          database / source-table / count fields absent or not integers
//   census_arithmetic              a derived field differs from its re-derivation from the row-level data,
//                                  the partition does not sum, or the threshold / version is not the ruling's
//   census_reads_mismatch          census.json's reads differ from the witness reads of the working-tree SQL
//   census_input_unreadable        the witness catalog or adoptions.json is missing, unparseable or empty
//   census_unknown_row             (build only) a row kind census.mjs does not know
//   census_session_not_read_only   (refresh only) the session did not report transaction_read_only = on
//   census_stale                   census.json ran against an older adoption -> arm status not_run

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stableStringify, writeAtomic } from './snapshot.mjs';

const require = createRequire(import.meta.url);

export const CENSUS_SQL_REL = 'scripts/seeds/bylaw/census.sql';
export const CENSUS_JSON_REL = 'scripts/seeds/bylaw/census.json';
export const ADOPTIONS_REL = 'scripts/seeds/bylaw/adoptions.json';
export const CATALOG_REL = 'docs/reports/witness/_catalog.json';
/** Spec 69 M-15: an exception binding ≥ 100 residential lots is in scope (direct lots in Phase 1). */
export const MIN_DIRECT_LOTS = 100;
export const CENSUS_VERSION = 1;

const ROW_KINDS = new Set(['database', 'source_rows', 'residential', 'exception', 'sentinel', 'exception_invalid', 'no_exception', 'unzoned', 'coverage_null']);

export class CensusError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'CensusError';
    this.code = code;
  }

  /** One error carrying every violation string (each already 'code: detail'); code = the first one's. */
  static fromViolations(violations) {
    if (!violations.length) throw new Error('CensusError.fromViolations: no violations');
    const err = new CensusError(violations[0].split(':')[0], '');
    err.message = violations.join('; ');
    return err;
  }
}

/** git's blob sha1 (`git hash-object`) of a buffer. PURE. */
export function gitBlobSha(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/** Deep walk over a parse tree; `visit(node, inCte)`; `inCte` is true below a CTE's ctequery. */
function walk(node, visit, inCte = false) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit, inCte);
    return;
  }
  visit(node, inCte);
  for (const k of Object.keys(node)) {
    const child = node[k];
    if (child !== null && typeof child === 'object') walk(child, visit, inCte || k === 'ctequery');
  }
}

/**
 * Witness check of census.sql against a catalog ({table: columns[]}). Returns {pass, violations, reads}.
 * Uses the shared sql-witness resolver for reads/writes plus a closed shape check (see reason codes).
 */
export async function witnessCheck(sqlText, catalogTables) {
  const R = require('../../lib/sql-witness/resolve.cjs');
  await R.init();
  const { parseSync } = require('libpg-query');
  const catalog = catalogTables || {};
  const violations = [];
  let tree;
  try {
    tree = parseSync(sqlText);
  } catch (err) {
    return { pass: false, violations: [`census_sql_parse_error: ${err && err.message ? err.message : String(err)}`], reads: {} };
  }
  const stmts = tree && Array.isArray(tree.stmts) ? tree.stmts : [];
  const top = stmts.length === 1 && stmts[0].stmt ? stmts[0].stmt.SelectStmt : null;
  if (!top) {
    const kinds = stmts.map((s) => Object.keys(s.stmt || {})[0] || 'empty').join(', ');
    return { pass: false, violations: [`census_sql_not_select_only: expected exactly one SelectStmt, got [${kinds}]`], reads: {} };
  }
  const r = R.resolveStatement(sqlText, catalog);
  if (r.error) violations.push(`census_sql_parse_error: ${r.error}`);
  if (r.kind !== 'read' || Object.keys(r.writes).length > 0) violations.push(`census_sql_not_select_only: resolver kind ${r.kind}, writes [${Object.keys(r.writes).join(', ')}]`);

  const cteNames = new Set(((top.withClause && top.withClause.ctes) || []).map((c) => c.CommonTableExpr && c.CommonTableExpr.ctename).filter(Boolean));
  const topArms = new Set();
  const collectArms = (n) => {
    topArms.add(n);
    if (n.larg) collectArms(n.larg);
    if (n.rarg) collectArms(n.rarg);
  };
  collectArms(top);
  const shape = new Set();
  const bylawCols = new Set();
  const catalogRanges = new Set(); // names (alias or relname) that bind a catalog table — a bare one is a whole-row read
  const columnRefs = [];
  walk(tree.stmts[0].stmt, (node, inCte) => {
    if (!topArms.has(node) && typeof node.op === 'string' && node.op !== 'SETOP_NONE') shape.add(`census_sql_shape: set operation ${node.op} outside the top-level UNION chain`);
    for (const k of Object.keys(node)) if (/Stmt$/.test(k) && k !== 'SelectStmt') shape.add(`census_sql_not_select_only: nested ${k} (data-modifying CTE)`);
    if (node.intoClause) shape.add('census_sql_not_select_only: SELECT ... INTO');
    if (Array.isArray(node.lockingClause) && node.lockingClause.length) shape.add('census_sql_not_select_only: FOR UPDATE / FOR SHARE');
    if (node.RangeVar && !cteNames.has(node.RangeVar.relname)) {
      if (!inCte) shape.add(`census_sql_shape: table ${node.RangeVar.relname} read outside a CTE`);
      catalogRanges.add(node.RangeVar.alias ? node.RangeVar.alias.aliasname : node.RangeVar.relname);
    }
    if (node.ColumnRef && Array.isArray(node.ColumnRef.fields)) {
      columnRefs.push(node.ColumnRef.fields);
      for (const f of node.ColumnRef.fields) if (f.String && /^bylaw_/i.test(f.String.sval)) bylawCols.add(f.String.sval);
    }
  });
  for (const fields of columnRefs) {
    // `p.*` or a bare `p` (row_to_json(p)) reads every column, bylaw_* included (R-ZV): name columns explicitly.
    const star = fields.some((f) => f.A_Star);
    const wholeRow = fields.length === 1 && fields[0].String && catalogRanges.has(fields[0].String.sval);
    if (star || wholeRow) shape.add('census_sql_shape: star or whole-row reference (name every column)');
  }
  violations.push(...[...shape].sort());
  for (const t of Object.keys(r.reads)) for (const c of r.reads[t]) if (/^bylaw_/i.test(c)) bylawCols.add(c);
  for (const c of [...bylawCols].sort()) violations.push(`census_reads_bylaw_column: ${c} (R-ZV, Spec 69 M-42: read the dominant label, never bylaw_*)`);
  for (const t of Object.keys(r.reads)) {
    if (!Array.isArray(catalog[t])) {
      violations.push(`census_sql_uncatalogued_table: ${t}`);
      continue;
    }
    for (const c of r.reads[t]) if (!catalog[t].includes(c)) violations.push(`census_sql_unknown_column: ${t}.${c}`);
  }
  return { pass: violations.length === 0, violations, reads: r.reads };
}

function count(v, what) {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (!Number.isSafeInteger(n) || n < 0) throw new CensusError('census_counts_missing', `${what}: ${JSON.stringify(v)} is not a non-negative integer`);
  return n;
}

const ratio = (num, den) => (den > 0 ? Math.round((num / den) * 1e6) / 1e6 : null);
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpEntry = (a, b) => cmpStr(a.zone, b.zone) || a.exception_number - b.exception_number;

/** A zone key from the DB: upper-case letters only (never `__proto__`), unique within its list. */
function zoneKey(zone, seen, what) {
  if (typeof zone !== 'string' || !/^[A-Z]+$/.test(zone)) throw new CensusError('census_unknown_row', `${what}: zone ${JSON.stringify(zone)}`);
  if (seen.has(zone)) throw new CensusError('census_unknown_row', `${what}: duplicate zone ${zone}`);
  seen.add(zone);
  return zone;
}

/**
 * Build census.json from the census.sql rows. PURE. Throws CensusError on a malformed answer.
 * @param {{rows: object[], sqlBlobSha: string, adoptionId: string, reads: object, minDirectLots?: number}} input
 */
export function buildCensus({ rows, sqlBlobSha, adoptionId, reads, minDirectLots = MIN_DIRECT_LOTS }) {
  const by = new Map([...ROW_KINDS].map((k) => [k, []]));
  for (const row of rows) {
    if (!ROW_KINDS.has(row.kind)) throw new CensusError('census_unknown_row', `kind ${JSON.stringify(row.kind)}`);
    by.get(row.kind).push(row);
  }
  const dbRows = by.get('database');
  if (dbRows.length !== 1 || typeof dbRows[0].label !== 'string' || dbRows[0].label === '') throw new CensusError('census_counts_missing', 'exactly one database row with a name is required');

  const sourceTables = {};
  for (const r of [...by.get('source_rows')].sort((a, b) => cmpStr(a.label, b.label))) {
    if (!Object.hasOwn(reads, r.label)) throw new CensusError('census_unknown_row', `source_rows ${JSON.stringify(r.label)} is not a table census.sql reads`);
    if (Object.hasOwn(sourceTables, r.label)) throw new CensusError('census_unknown_row', `duplicate source_rows ${r.label}`);
    sourceTables[r.label] = count(r.n, `source_rows ${r.label}`);
  }
  for (const t of Object.keys(reads)) if (!Object.hasOwn(sourceTables, t)) throw new CensusError('census_counts_missing', `no source_rows line for read table ${t}`);

  const zoneMap = (list, what) => {
    const out = {};
    const seen = new Set();
    let total = 0;
    for (const r of [...list].sort((a, b) => cmpStr(a.zone, b.zone))) {
      const z = zoneKey(r.zone, seen, what);
      out[z] = count(r.n, `${what} ${z}`);
      total += out[z];
    }
    return { by_zone: out, lots: total };
  };
  const entries = (list, what) => {
    const seen = new Set();
    return list
      .map((r) => {
        if (!Number.isSafeInteger(r.exception_number)) throw new CensusError('census_counts_missing', `${what} ${r.zone}: exception_number ${JSON.stringify(r.exception_number)} is not an integer`);
        zoneKey(r.zone, new Set(), what);
        const key = `${r.zone} x${r.exception_number}`;
        if (seen.has(key)) throw new CensusError('census_unknown_row', `${what}: duplicate ${key}`);
        seen.add(key);
        return { exception_number: r.exception_number, lots: count(r.n, `${what} ${key}`), zone: r.zone };
      })
      .sort(cmpEntry);
  };

  const backlog = entries(by.get('exception'), 'exception').sort((a, b) => b.lots - a.lots || cmpEntry(a, b));
  const exceptedByZone = {};
  for (const e of [...backlog].sort(cmpEntry)) {
    if (!Object.hasOwn(exceptedByZone, e.zone)) exceptedByZone[e.zone] = { exceptions: 0, lots: 0 };
    exceptedByZone[e.zone].exceptions += 1;
    exceptedByZone[e.zone].lots += e.lots;
  }
  const exceptedLots = backlog.reduce((s, e) => s + e.lots, 0);
  const above = backlog.filter((e) => e.lots >= minDirectLots);
  const aboveLots = above.reduce((s, e) => s + e.lots, 0);
  const residential = zoneMap(by.get('residential'), 'residential');
  const coverage = zoneMap(by.get('coverage_null'), 'coverage_null');
  const unzoned = by.get('unzoned');
  if (unzoned.length !== 1) throw new CensusError('census_counts_missing', 'exactly one unzoned row is required');

  return {
    adoption_id: adoptionId,
    at_or_above_threshold: { exceptions: above.length, lots: aboveLots, share_of_excepted: ratio(aboveLots, exceptedLots) },
    backlog,
    below_threshold: { exceptions: backlog.length - above.length, lots: exceptedLots - aboveLots },
    census_version: CENSUS_VERSION,
    coverage_null: { by_zone: coverage.by_zone, lots: coverage.lots, of_residential: residential.lots, share: ratio(coverage.lots, residential.lots) },
    database: dbRows[0].label,
    exception_invalid: entries(by.get('exception_invalid'), 'exception_invalid'),
    excepted: { by_zone: exceptedByZone, exceptions: backlog.length, lots: exceptedLots },
    min_direct_lots: minDirectLots,
    no_exception: zoneMap(by.get('no_exception'), 'no_exception'),
    reads,
    residential,
    sentinel: entries(by.get('sentinel'), 'sentinel'),
    source_tables: sourceTables,
    sql: { blob_sha: sqlBlobSha, path: CENSUS_SQL_REL },
    unzoned_parcels: count(unzoned[0].n, 'unzoned'),
  };
}

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sumLots = (list) => list.reduce((s, e) => s + e.lots, 0);

/** The census.sql row set a census object was built from (inverse of buildCensus's grouping). PURE. */
function rowsFromCensus(c) {
  const row = (kind, zone, exception_number, label, n) => ({ kind, zone, exception_number, label, n });
  return [
    row('database', null, null, c.database, null),
    ...Object.entries(c.source_tables).map(([t, n]) => row('source_rows', null, null, t, n)),
    ...Object.entries(c.residential.by_zone).map(([z, n]) => row('residential', z, null, null, n)),
    ...c.backlog.map((e) => row('exception', e.zone, e.exception_number, null, e.lots)),
    ...c.sentinel.map((e) => row('sentinel', e.zone, e.exception_number, null, e.lots)),
    ...c.exception_invalid.map((e) => row('exception_invalid', e.zone, e.exception_number, null, e.lots)),
    ...Object.entries(c.no_exception.by_zone).map(([z, n]) => row('no_exception', z, null, null, n)),
    row('unzoned', null, null, null, c.unzoned_parcels),
    ...Object.entries(c.coverage_null.by_zone).map(([z, n]) => row('coverage_null', z, null, null, n)),
  ];
}

/**
 * Presence + arithmetic violations of a census object. PURE. census.json is excluded from G-DRIFT's
 * byte-compare (Spec 68 §9), so every derived field is re-derived here from the row-level data
 * (backlog, sentinel, by_zone maps) and the threshold is bound to the ruling constant, not the file.
 */
export function censusViolations(c, { minDirectLots = MIN_DIRECT_LOTS } = {}) {
  const v = [];
  if (!isMap(c)) return ['census_counts_missing: census.json is not an object'];
  if (typeof c.database !== 'string' || c.database === '') v.push('census_counts_missing: database');
  if (typeof c.adoption_id !== 'string' || c.adoption_id === '') v.push('census_counts_missing: adoption_id');
  if (!isMap(c.sql) || typeof c.sql.blob_sha !== 'string') v.push('census_counts_missing: sql.blob_sha');
  const readTables = isMap(c.reads) ? Object.keys(c.reads) : [];
  if (readTables.length === 0) v.push('census_counts_missing: reads');
  const st = isMap(c.source_tables) ? c.source_tables : {};
  for (const t of readTables) if (!isCount(st[t]) || st[t] === 0) v.push(`census_counts_missing: source_tables.${t}`);
  for (const k of ['residential', 'no_exception', 'coverage_null', 'excepted']) if (!isMap(c[k]) || !isMap(c[k].by_zone)) v.push(`census_counts_missing: ${k}.by_zone`);
  for (const k of ['backlog', 'sentinel', 'exception_invalid']) if (!Array.isArray(c[k])) v.push(`census_counts_missing: ${k}`);
  if (!isCount(c.unzoned_parcels)) v.push('census_counts_missing: unzoned_parcels');
  if (v.length) return v;
  if (c.census_version !== CENSUS_VERSION) v.push(`census_arithmetic: census_version ${c.census_version} != ${CENSUS_VERSION}`);
  if (c.min_direct_lots !== minDirectLots) v.push(`census_arithmetic: min_direct_lots ${c.min_direct_lots} != ruling ${minDirectLots} (Spec 69 M-15)`);

  let rebuilt;
  try {
    rebuilt = buildCensus({ rows: rowsFromCensus(c), sqlBlobSha: c.sql.blob_sha, adoptionId: c.adoption_id, reads: c.reads, minDirectLots });
  } catch (err) {
    if (!(err instanceof CensusError)) throw err;
    return [...v, err.message];
  }
  if (rebuilt.residential.lots === 0) v.push('census_counts_missing: residential.lots is 0');
  for (const k of Object.keys(rebuilt).sort()) {
    if (k === 'census_version' || k === 'min_direct_lots') continue;
    if (stableStringify(rebuilt[k]) !== stableStringify(c[k])) v.push(`census_arithmetic: ${k} differs from its re-derivation from the row-level data`);
  }
  for (const k of Object.keys(c).sort()) if (!Object.hasOwn(rebuilt, k)) v.push(`census_arithmetic: unexpected field ${k}`);
  const partition = rebuilt.excepted.lots + sumLots(rebuilt.sentinel) + sumLots(rebuilt.exception_invalid) + rebuilt.no_exception.lots;
  if (partition !== rebuilt.residential.lots) v.push(`census_arithmetic: excepted + sentinel + invalid + no_exception = ${partition} != residential ${rebuilt.residential.lots}`);
  if (rebuilt.coverage_null.lots > rebuilt.residential.lots) v.push('census_arithmetic: coverage_null.lots > residential.lots');
  return v;
}

/** Read a committed JSON input; a missing or unparseable file is a violation, never a throw. */
function readJsonInput(root, rel, violations, code) {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) {
    violations.push(`${code}: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (err) {
    violations.push(`census_input_unreadable: ${rel}: ${err.message}`);
    return null;
  }
}

/** The witness catalog's tables + the latest adoption id (adoptions.json is append-only, snapshot.mjs adopt()). */
function readInputs(root, violations) {
  const cat = readJsonInput(root, CATALOG_REL, violations, 'census_input_unreadable');
  const tables = cat && isMap(cat.tables) ? cat.tables : null;
  if (cat && !tables) violations.push(`census_input_unreadable: ${CATALOG_REL} has no tables map`);
  const ad = readJsonInput(root, ADOPTIONS_REL, violations, 'census_input_unreadable');
  const list = ad && Array.isArray(ad.adoptions) ? ad.adoptions : [];
  const latest = list.length && typeof list[list.length - 1].adoption_id === 'string' ? list[list.length - 1].adoption_id : null;
  if (ad && !latest) violations.push(`census_input_unreadable: ${ADOPTIONS_REL} has no adoption`);
  return { catalog: tables, latest };
}

/**
 * G-UNIVERSE census arm (offline). Returns {status: 'pass'|'fail'|'not_run', pass, violations, checked}.
 * Any file defect FAILs; otherwise a census run against an older adoption is not_run (Spec 68 §9) —
 * callers branch on `status`, never on `pass` alone.
 */
export async function checkCensus({ root, minDirectLots = MIN_DIRECT_LOTS }) {
  const violations = [];
  const { catalog, latest } = readInputs(root, violations);
  const sqlPath = path.join(root, CENSUS_SQL_REL);
  const sqlBuf = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath) : null;
  let w = null;
  if (!sqlBuf) violations.push(`census_sql_missing: ${CENSUS_SQL_REL}`);
  else if (catalog) {
    w = await witnessCheck(sqlBuf.toString('utf8'), catalog);
    violations.push(...w.violations);
  }
  const census = readJsonInput(root, CENSUS_JSON_REL, violations, 'census_json_missing');
  if (census) {
    const recorded = isMap(census.sql) ? census.sql.blob_sha : undefined;
    const actual = sqlBuf ? gitBlobSha(sqlBuf) : null;
    if (actual && recorded !== actual) violations.push(`census_sql_sha_mismatch: census.json records ${recorded}, working tree census.sql is ${actual}`);
    violations.push(...censusViolations(census, { minDirectLots }));
    if (w && w.pass && stableStringify(census.reads) !== stableStringify(w.reads)) violations.push('census_reads_mismatch: census.json reads differ from the witness reads of census.sql');
  }
  const checked = (sqlBuf ? 1 : 0) + (census ? 1 : 0);
  if (violations.length) return { status: 'fail', pass: false, violations, checked };
  if (census.adoption_id !== latest) return { status: 'not_run', pass: false, violations: [`census_stale: census.json ran against ${census.adoption_id}, latest adoption is ${latest}`], checked };
  return { status: 'pass', pass: true, violations: [], checked };
}

/** Default connection: the ONE resolved pool (resolve-db.js), single client; the pool never leaks. */
async function defaultConnect() {
  const { createResolvedPool } = require('../../lib/resolve-db.js');
  const pool = createResolvedPool({ label: 'bylaw-census', poolOverrides: { max: 1 } });
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    await pool.end();
    throw err;
  }
  return {
    client,
    close: async () => {
      try {
        client.release();
      } finally {
        await pool.end();
      }
    },
  };
}

/** Run a teardown step without letting its failure replace the error already in flight. */
async function teardown(step, log, what) {
  try {
    await step();
  } catch (err) {
    log(`[bylaw-census] ${what} failed (logged; the primary outcome stands): ${err.message}`);
  }
}

/**
 * --refresh-census: witness-check census.sql, run it in ONE `BEGIN TRANSACTION READ ONLY` session
 * (server-enforced; refused unless the session reports transaction_read_only = on), roll back,
 * and write census.json (sorted keys, LF). Nothing is written on any failure.
 */
export async function refreshCensus({ root, connect = defaultConnect, minDirectLots = MIN_DIRECT_LOTS, log = () => {} }) {
  const pre = [];
  const { catalog, latest } = readInputs(root, pre);
  const sqlPath = path.join(root, CENSUS_SQL_REL);
  if (!fs.existsSync(sqlPath)) pre.push(`census_sql_missing: ${CENSUS_SQL_REL}`);
  if (pre.length) throw CensusError.fromViolations(pre);
  const sqlBuf = fs.readFileSync(sqlPath);
  const sqlText = sqlBuf.toString('utf8');
  const w = await witnessCheck(sqlText, catalog);
  if (!w.pass) throw CensusError.fromViolations(w.violations);

  const { client, close } = await connect();
  let rows;
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    try {
      const ro = await client.query('SHOW transaction_read_only');
      const flag = ro.rows && ro.rows[0] ? ro.rows[0].transaction_read_only : undefined;
      if (flag !== 'on') throw new CensusError('census_session_not_read_only', `transaction_read_only = ${flag}`);
      rows = (await client.query(sqlText)).rows;
    } finally {
      await teardown(() => client.query('ROLLBACK'), log, 'ROLLBACK');
    }
  } finally {
    await teardown(close, log, 'close');
  }
  const census = buildCensus({ rows, sqlBlobSha: gitBlobSha(sqlBuf), adoptionId: latest, reads: w.reads, minDirectLots });
  const v = censusViolations(census, { minDirectLots });
  if (v.length) throw CensusError.fromViolations(v);
  writeAtomic(path.join(root, CENSUS_JSON_REL), stableStringify(census));
  log(`census.json written: ${census.database}, ${census.residential.lots} residential lots, ${census.excepted.exceptions} exceptions`);
  return { census };
}
