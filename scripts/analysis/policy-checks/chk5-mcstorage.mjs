// SPEC LINK: McStorage policy P3 (every stored record carries its stamp), P4 (a stale stamp is never served and is recomputed), P6 (one record per (parcel, option); idempotent writes);
//            MORNING-DECISIONS.md:704 ("no all-lot headline fill": a lot's numbers are computed on first open, track or owner input, then stored with their stamp), :725 (McStorage writer/stamp is one of the eight automatic checks);
//            the sanctioned writer is the step (mcbylaws/MB-26/runbook-increment1.md:298: a hand upsert outside the step is an exception path); TRK-1 a (background refresh) and PRG-1 a (90-day purge) are writers too (:738).
// CHK.5 (static; no DB). Data, not code: docs/reports/policy/policy-config.json chk5_tables = [{ name, producers:[globs], stamp_columns:[], read_guard:[], verified, verified_source }].
//   (a) a write statement on the table outside its producers; (b) a non-test reader of the table must contain every stamp column name and every read-guard name in code (comments stripped);
//   (c) with the whole tree in view (--all), a stale-stamp test exists: a test titled with "stale" that names the table.
// STATES: chk5_tables empty = WAITS (no record table is named yet: the all-lot table the earlier design wrote was replaced by :704); an entry with verified:false or no verified_source, or naming a table in
// chk5_replaced_tables, = a finding (never guessed, never the replaced table); a verified entry = enforced. A missing config is the driver's FAIL.
import { stripComments, finding, matchAny, isSource, isTest } from './lib.mjs';

export const RULES = ['chk5-producer', 'chk5-reader', 'chk5-config'];
export const TREE_RULES = RULES;
const [R_PROD, R_READ, R_CFG] = RULES;
const CONFIG_PATH = 'docs/reports/policy/policy-config.json';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
const WAITS = 'WAITS CHK.5 chk5_tables is empty: no record table is named yet (owner: the McStorage opened-lot record table, which replaces the all-lot headline fill; ruling MORNING-DECISIONS.md:704 "no all-lot headline fill"); CHK.5 enforces writes, stamp and the stale test once a table entry is verified';

/** @returns {{findings: object[], waits: string[]}} */
export function check({ files, allFiles, config }) {
  const tables = config.chk5_tables;
  if (!Array.isArray(tables)) return { findings: [{ rule: R_CFG, file: CONFIG_PATH, line: 0, item: 'chk5_tables', msg: 'chk5_tables must be an array (fail closed)' }], waits: [] };
  if (tables.length === 0) return { findings: [], waits: [WAITS] };
  const findings = [];
  const replaced = new Set(config.chk5_replaced_tables || []);
  for (const t of tables) {
    const cfg = (msg) => findings.push({ rule: R_CFG, file: CONFIG_PATH, line: 0, item: String(t.name), msg });
    if (replaced.has(t.name)) { cfg(`table ${t.name} is a replaced table (MORNING-DECISIONS.md:704 "no all-lot headline fill"): it cannot be an enforced record table`); continue; }
    if (!t.verified || !String(t.verified_source || '').trim()) { cfg(`table ${t.name}: the table and stamp column names are not verified (verified:true with a verified_source read from the schema is required); CHK.5 never guesses a name`); continue; }
    const write = new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?|COPY|MERGE\\s+INTO)\\s+(?:ONLY\\s+)?(?:public\\.)?"?${esc(t.name)}\\b`, 'i');
    const read = new RegExp(`\\b(?:FROM|JOIN)\\s+(?:ONLY\\s+)?(?:public\\.)?"?${esc(t.name)}\\b`, 'i');
    for (const f of files) {
      if (!(isSource(f.path) || /\.sql$/.test(f.path)) || isTest(f.path) || /(^|\/)(migrations|fixtures)\//.test(f.path)) continue;
      const code = stripComments(f.content);
      const producer = matchAny(t.producers, f.path);
      const lineOf = (m) => code.slice(0, m.index).split('\n').length;
      const w = write.exec(code);
      if (w && !producer) findings.push(finding(R_PROD, f.path, lineOf(w), `write to ${t.name} outside its declared producers (P6; the step is the one writer)`, f.content));
      const r = read.exec(code);
      if (r && !producer) {
        const missing = [...(t.stamp_columns || []), ...(t.read_guard || [])].filter((n) => !code.includes(n));
        if (missing.length) findings.push(finding(R_READ, f.path, lineOf(r), `reader of ${t.name} does not name ${missing.join(', ')} (P3/P4: a stale stamp is never served)`, f.content));
      }
    }
    if (allFiles && !allFiles.some((f) => isTest(f.path) && f.content.includes(t.name) && /\b(?:it|test)\(\s*['"`][^'"`]*stale/i.test(f.content))) {
      findings.push({ rule: R_READ, file: '(tests)', line: 0, item: `stale-stamp-test@${t.name}`, msg: `no stale-stamp test names ${t.name} (a test titled with "stale")` });
    }
  }
  return { findings, waits: [] };
}
