// SPEC LINK: M-368 (69a_mcbylaw_register.md), R-KM
// Pure builders for the night-restore trigger guard (task MB-30 stage 7).

const nrtNameRe = /^[a-z_][a-z0-9_]*$/;

// Validates the table list and returns it deduped, keeping first-seen order.
function nrtTables(tables) {
  if (!Array.isArray(tables) || tables.length === 0) throw new Error('no tables');
  const nrtSeen = [];
  for (const nrtName of tables) {
    if (typeof nrtName !== 'string' || !nrtNameRe.test(nrtName)) {
      throw new Error('identifier ' + JSON.stringify(nrtName) + ' is not a plain table name');
    }
    if (nrtSeen.indexOf(nrtName) === -1) nrtSeen.push(nrtName);
  }
  return nrtSeen;
}

// Returns the "ALTER TABLE public.<t> <verb>;" line for one table.
function nrtAlterLine(nrtName, nrtVerb) {
  return 'ALTER TABLE public."' + nrtName + '" ' + nrtVerb + ';';
}

// Returns the regclass array literal for the (already validated) table names.
function nrtRegclassArray(nrtNames) {
  return 'ARRAY[' + nrtNames.map((n) => "'public." + n + "'").join(',') + ']::regclass[]';
}

// Builds one DISABLE TRIGGER USER statement per table.
function buildDisableSql(tables) {
  return nrtTables(tables).map((n) => nrtAlterLine(n, 'DISABLE TRIGGER USER')).join('\n');
}

// Builds one ENABLE TRIGGER USER statement per table.
function buildEnableSql(tables) {
  return nrtTables(tables).map((n) => nrtAlterLine(n, 'ENABLE TRIGGER USER')).join('\n');
}

// Returns the tgenabled predicate text for a mode.
function nrtPredicate(mode) {
  if (mode === 'all_default') return "tgenabled <> 'O'";
  if (mode === 'all_disabled') return "tgenabled <> 'D'";
  throw new Error('unknown mode ' + JSON.stringify(mode));
}

// Builds the DO block that asserts every user trigger of the tables is in the expected state.
function buildStateCheckSql(tables, mode) {
  const nrtNames = nrtTables(tables);
  const nrtPred = nrtPredicate(mode);
  return [
    'DO $$',
    'DECLARE n bigint;',
    'BEGIN',
    '  SELECT count(*) INTO n FROM pg_trigger',
    '   WHERE NOT tgisinternal',
    '     AND tgrelid = ANY (' + nrtRegclassArray(nrtNames) + ')',
    '     AND ' + nrtPred + ';',
    "  IF n <> 0 THEN RAISE EXCEPTION 'night-restore: % trigger(s) not in mode %', n, '" + mode + "'; END IF;",
    'END $$;',
  ].join('\n');
}

// Builds the DO block that asserts current_user owns every listed table.
function buildOwnerCheckSql(tables) {
  const nrtNames = nrtTables(tables);
  return [
    'DO $$',
    'DECLARE n bigint;',
    'BEGIN',
    '  SELECT count(*) INTO n FROM pg_class',
    '   WHERE relname = ANY (ARRAY[' + nrtNames.map((n) => "'" + n + "'").join(',') + '])',
    "     AND relnamespace = 'public'::regnamespace",
    "     AND NOT pg_has_role(current_user, relowner, 'USAGE');",
    "  IF n <> 0 THEN RAISE EXCEPTION 'night-restore: % table(s) not owned by %', n, current_user; END IF;",
    'END $$;',
  ].join('\n');
}

// Returns the psql echo line announcing that user triggers are disabled.
function disabledEcho(tables) {
  return '\\echo night-restore: triggers DISABLED (USER) on ' + nrtTables(tables).length + ' table(s)';
}

// Returns the psql echo line announcing that user triggers are re-enabled.
function reenabledEcho(tables) {
  return '\\echo night-restore: triggers RE-ENABLED (USER) on ' + nrtTables(tables).length + ' table(s) before COMMIT';
}

// Asserts the restore script is safe to wrap and returns its split lines.
function nrtScriptLines(script) {
  if (typeof script !== 'string') throw new Error('script must be a string');
  const nrtLines = script.split('\n');
  const nrtBegins = nrtLines.filter((l) => l === 'BEGIN;').length;
  if (nrtBegins !== 1) throw new Error('expected exactly one BEGIN; line, found ' + nrtBegins);
  const nrtCommits = nrtLines.filter((l) => l === 'COMMIT;').length;
  if (nrtCommits === 0) throw new Error('no final COMMIT');
  if (nrtCommits > 1) throw new Error('expected exactly one COMMIT; line, found ' + nrtCommits);
  if (/\b(ROLLBACK|ABORT)\b/i.test(script)) throw new Error('script contains ROLLBACK or ABORT');
  if (/transaction_read_only|READ ONLY/i.test(script)) throw new Error('script sets READ ONLY');
  if (/DISABLE TRIGGER|ENABLE TRIGGER|session_replication_role/i.test(script)) {
    throw new Error('script already contains DISABLE TRIGGER, ENABLE TRIGGER or session_replication_role');
  }
  const nrtLock = nrtLines.findIndex((l) => l.startsWith('SET LOCAL lock_timeout'));
  if (nrtLock === -1) throw new Error('script has no SET LOCAL lock_timeout line');
  const nrtDelete = nrtLines.findIndex((l) => l.startsWith('DELETE FROM '));
  if (nrtDelete === -1) throw new Error('script has no DELETE FROM line');
  const nrtCommit = nrtLines.findIndex((l) => l === 'COMMIT;');
  if (nrtLock > nrtDelete) throw new Error('SET LOCAL lock_timeout must come before the first DELETE FROM line');
  if (nrtDelete > nrtCommit) throw new Error('the first DELETE FROM line must come before COMMIT;');
  return nrtLines;
}

// Splices a multi-line SQL/echo piece into the result as its own lines.
function nrtPush(nrtOut, nrtPiece) {
  for (const l of nrtPiece.split('\n')) nrtOut.push(l);
}

// Wraps a restore script with the owner check, the disable guard and the re-enable guard.
function wrapRestoreScript(script, tables) {
  const nrtNames = nrtTables(tables);
  const nrtLines = nrtScriptLines(script);
  const nrtDelete = nrtLines.findIndex((l) => l.startsWith('DELETE FROM '));
  const nrtCommit = nrtLines.findIndex((l) => l === 'COMMIT;');
  const nrtOut = [];
  for (const l of nrtLines.slice(0, nrtDelete)) nrtOut.push(l);
  nrtPush(nrtOut, buildOwnerCheckSql(nrtNames));
  nrtPush(nrtOut, buildStateCheckSql(nrtNames, 'all_default'));
  nrtPush(nrtOut, buildDisableSql(nrtNames));
  nrtPush(nrtOut, buildStateCheckSql(nrtNames, 'all_disabled'));
  nrtOut.push(disabledEcho(nrtNames));
  for (const l of nrtLines.slice(nrtDelete, nrtCommit)) nrtOut.push(l);
  nrtPush(nrtOut, buildEnableSql(nrtNames));
  nrtPush(nrtOut, buildStateCheckSql(nrtNames, 'all_default'));
  nrtOut.push(reenabledEcho(nrtNames));
  nrtOut.push('COMMIT;');
  return nrtOut.join('\n');
}

module.exports = { buildDisableSql, buildEnableSql, buildStateCheckSql, buildOwnerCheckSql, disabledEcho, reenabledEcho, wrapRestoreScript };
