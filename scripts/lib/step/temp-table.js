// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-BZ G4, CP-S2 ctx.tempTable)
'use strict';

/**
 * ctx.tempTable — the DDL half of a temp-table build, behind a seam (Spec 124 R-BZ G4).
 *
 * WHY THIS SEAM EXISTS. A compute pass owns a SELECT and NOTHING ELSE: it must not hold DDL
 * text. The four statements that make a temp table useful —
 *
 *   DROP TABLE IF EXISTS <name>
 *   CREATE TEMP TABLE <name> ON COMMIT DROP AS <select>
 *   CREATE INDEX <index> ON <name> USING <using> (<column>)   (optional)
 *   ANALYZE <name>                                            (optional)
 *
 * — are harness policy, so they live here and the compute hands over only the SELECT. The
 * pre-DROP is not redundant with the transaction: a stale temp table of the SAME name can
 * survive from an earlier pass in the SAME shared transaction (plan Q3), and `DROP TABLE IF
 * EXISTS` is what clears it. `ON COMMIT DROP` then scopes the new table to that transaction —
 * it disappears when the shared txn ends, so nothing leaks between runs.
 *
 * The admitted values (identifier regex, `using` in {gist, btree}) are a GRAMMAR, not tunables:
 * this seam is the one place identifiers reach DDL text, so it refuses anything that is not a
 * bare lowercase SQL identifier BEFORE issuing any query.
 */

/** A bare lowercase SQL identifier. Anchored, so injection (`t; DROP TABLE x`) cannot pass. */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/** The closed set of index access methods this seam admits. Grammar, not configuration. */
const INDEX_METHODS = ['gist', 'btree'];

/**
 * Strip leading whitespace and leading `--` line comments, then report whether `sql` opens
 * with WITH or SELECT (case-insensitive). This is the shape every compute temp-table builder
 * returns: a bare query, never a statement frame.
 *
 * @param {string} sql
 * @returns {boolean}
 */
function opensWithQuery(sql) {
  let s = sql;
  for (;;) {
    s = s.replace(/^\s+/, '');
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      if (nl === -1) return false;
      s = s.slice(nl + 1);
      continue;
    }
    break;
  }
  return /^(WITH|SELECT)\b/i.test(s);
}

/**
 * Build the ctx.tempTable seam bound to one client (one transaction) and one log tag.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<unknown> }} client
 * @param {string} tag  the run's log/error tag; every refusal message is tagged with it.
 * @returns {(opts: {
 *   name: string,
 *   selectSql: string,
 *   params?: unknown[],
 *   index?: { name: string, using: string, column: string },
 *   analyze?: boolean,
 * }) => Promise<void>}
 */
function makeTempTable(client, tag) {
  return async function tempTable(opts) {
    const where = `${tag} ctx.tempTable(...)`;
    const fail = (msg) => { throw new Error(`${where}: ${msg}`); };

    const o = opts || {};

    // --- Validate EVERYTHING first: a refusal must never reach the database, not even the
    // --- DROP. Order matters, so all checks run before the first query below.
    if (typeof o.name !== 'string' || !IDENT_RE.test(o.name)) {
      fail(`refusing table name ${JSON.stringify(o.name)} — must match ${IDENT_RE}`);
    }
    if (typeof o.selectSql !== 'string' || !opensWithQuery(o.selectSql)) {
      fail(`refusing selectSql that is not a WITH/SELECT query: ${JSON.stringify(o.selectSql)}`);
    }
    if (o.params !== undefined && !Array.isArray(o.params)) {
      fail('params must be an array when supplied');
    }
    if (o.index !== undefined) {
      if (o.index === null || typeof o.index !== 'object') {
        fail('index must be an object { name, using, column }');
      }
      if (typeof o.index.name !== 'string' || !IDENT_RE.test(o.index.name)) {
        fail(`refusing index name ${JSON.stringify(o.index.name)} — must match ${IDENT_RE}`);
      }
      if (typeof o.index.using !== 'string' || !INDEX_METHODS.includes(o.index.using)) {
        fail(`refusing index method ${JSON.stringify(o.index.using)} — admitted: ${INDEX_METHODS.join(', ')}`);
      }
      if (typeof o.index.column !== 'string' || !IDENT_RE.test(o.index.column)) {
        fail(`refusing index column ${JSON.stringify(o.index.column)} — must match ${IDENT_RE}`);
      }
    }

    const name = o.name;

    // 1. Clear any stale temp table of the same name from an earlier pass in this same txn.
    await client.query(`DROP TABLE IF EXISTS ${name}`);

    // 2. Materialise the compute's SELECT. Pass `params` ONLY when it is an array: with no
    //    values array the CREATE keeps pg's SIMPLE protocol (one argument ⇒ params undefined),
    //    which is exactly what the legacy multi-statement DDL relied on.
    const createSql = 'CREATE TEMP TABLE ' + name + ' ON COMMIT DROP AS' + (o.selectSql.startsWith('\n') ? '' : '\n') + o.selectSql;
    if (Array.isArray(o.params)) {
      await client.query(createSql, o.params);
    } else {
      await client.query(createSql);
    }

    // 3. Optional index — one parameterless statement.
    if (o.index !== undefined) {
      await client.query(`CREATE INDEX ${o.index.name} ON ${name} USING ${o.index.using} (${o.index.column})`);
    }

    // 4. Optional stats — one parameterless statement.
    if (o.analyze === true) {
      await client.query(`ANALYZE ${name}`);
    }
  };
}

module.exports = { makeTempTable };
