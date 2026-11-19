#!/usr/bin/env node
// SPEC LINK: MORNING-DECISIONS.md:725 (the eight automatic checks; Increment 1·A, built in the repo under its hooks: :744); scripts/analysis/mcbylaws/gate.mjs (the same fail-closed shape: no flag, word or environment variable turns a check off).
// POLICY CHECKS driver (CHK.3 and CHK.5 here; CHK.6 is gate RS-12 inside report-schema.mjs and runs through the existing pre-commit `report-schema.mjs --check`).
//   node scripts/analysis/policy-checks.mjs --commit-msg <file>   the hook (.husky/commit-msg): the staged checks, then every ledger row ADDED by the commit needs its ruling id in an Operator-Ruling: trailer
//   node scripts/analysis/policy-checks.mjs --staged               the staged checks alone (reads the index, git show :path)
//   node scripts/analysis/policy-checks.mjs --all                  every tracked file, plus the stale-stamp test (the suite and CI backstop)
// Exit 0 = clean (a WAITS line names an input that does not exist yet and is not a pass); 1 = a finding, an invalid ledger or anything it could not decide (unreadable input, unknown mode, any thrown error).
// The only escape is a row in docs/reports/policy/policy-ledger.json (lib.mjs); there is no skip mode.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { applyLedger, validateLedger, trailerCheck, isSource } from './policy-checks/lib.mjs';
import * as chk5 from './policy-checks/chk5-mcstorage.mjs';

export const CONFIG_PATH = 'docs/reports/policy/policy-config.json';
export const LEDGER_PATH = 'docs/reports/policy/policy-ledger.json';
const CHECKS = [{ id: 'CHK.5', mod: chk5 }];
export const TREE_RULES = CHECKS.flatMap((c) => c.mod.TREE_RULES || []);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const fail = (msg) => { console.error(`FAIL:policy-checks:cannot-decide ${msg}`); process.exit(1); };

/** Pure core: runs every registered check and applies the ledger. Returns { findings, errors, waits, orphans }. */
export function runChecks({ files, allFiles = null, changes = [], pkgBefore = '', pkgAfter = '', config, ledger, all = false }) {
  const errors = validateLedger(ledger);
  if (errors.length) return { findings: [], errors, waits: [], orphans: [] };
  const raw = [];
  const waits = [];
  for (const c of CHECKS) {
    const r = c.mod.check({ files, allFiles, changes, pkgBefore, pkgAfter, config });
    raw.push(...r.findings);
    waits.push(...r.waits);
  }
  const { unallowed, orphans } = applyLedger(raw, ledger, { all, treeRules: TREE_RULES });
  return { findings: unallowed, errors: [], waits, orphans };
}

const rowsOf = (text) => { try { const rows = JSON.parse(text || '{}').rows; return Array.isArray(rows) ? rows : []; } catch { return fail(`${LEDGER_PATH} is not valid JSON`); } };

function main(argv) {
  const [mode, arg] = argv;
  if (!['--staged', '--all', '--commit-msg'].includes(mode)) fail(`unknown mode ${mode}`);
  const staged = mode !== '--all';
  const fromIndex = (p) => { try { return git('show', `:${p}`); } catch { return null; } };
  const fromHead = (p) => { try { return git('show', `HEAD:${p}`); } catch { return ''; } };
  const read = staged ? fromIndex : (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
  const changes = staged
    ? git('diff', '--cached', '--name-status', '--diff-filter=ACMR', '-z').split('\0').reduce((acc, v, i, all) => (i % 2 === 0 && v ? (acc.push({ status: v[0], path: all[i + 1] }), acc) : acc), [])
    : git('ls-files', '-z').split('\0').filter(Boolean).map((p) => ({ status: 'M', path: p }));
  const configText = read(CONFIG_PATH);
  if (configText === null) fail(`cannot read ${CONFIG_PATH}`);
  let config;
  try { config = JSON.parse(configText); } catch { return fail(`${CONFIG_PATH} is not valid JSON`); }
  const ledgerText = read(LEDGER_PATH);
  if (ledgerText === null) fail(`cannot read ${LEDGER_PATH}`);
  const ledger = rowsOf(ledgerText);

  const errors = [];
  if (mode === '--commit-msg') {
    const before = new Set(rowsOf(fromHead(LEDGER_PATH)).map((r) => `${r.rule}\u0000${r.item}`));
    const added = ledger.filter((r) => !before.has(`${r.rule}\u0000${r.item}`));
    errors.push(...trailerCheck(added, readFileSync(arg, 'utf8')));
  }
  const files = changes.filter((c) => isSource(c.path) || /\.sql$/.test(c.path)).map((c) => ({ path: c.path, content: read(c.path) ?? '' }));
  const r = runChecks({ files, allFiles: mode === '--all' ? files : null, changes: staged ? changes : [], config, ledger, all: mode === '--all' });
  errors.push(...r.errors);
  for (const w of r.waits) console.log(w);
  if (errors.length || r.findings.length || r.orphans.length) {
    for (const e of errors) console.error(`FAIL:LEDGER ${e}`);
    for (const f of r.findings) console.error(`FAIL:${f.rule}:${f.file}:${f.line} ${f.msg} [ledger row: rule ${f.rule}, item ${JSON.stringify(f.item)}]`);
    for (const o of r.orphans) console.error(`FAIL:ORPHAN ledger row ${o.rule}@${o.item}: its violation no longer exists, delete the row`);
    console.error(`POLICY CHECKS FAIL: ${r.findings.length} finding(s), ${errors.length} ledger error(s), ${r.orphans.length} orphan row(s)`);
    process.exit(1);
  }
  console.log(`POLICY CHECKS OK (${mode.slice(2)}): ${files.length} file(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) { fail(String((e && e.message) || e).slice(0, 200)); }
}
