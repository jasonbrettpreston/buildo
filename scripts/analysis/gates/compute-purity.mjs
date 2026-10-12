// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ, compute purity G1–G4);
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
//            plan: .cursor/wf1_compute_purity_active_task.md Phase 1 (the G1–G8 table)
//
// GATE G1..G4 — PURE (the SQL half). `compute-closure.mjs` proved WHAT a compute
// module can REACH (G0); this module proves what the SQL it carries may TOUCH.
// A "just compute" file that never requires the runner can still read the ledger
// through a raw pool, introspect a catalog, read a relation nobody declared, or
// run a transaction/DDL/session verb — four ways for a measurement to become a
// decision. Each is a closed code over one scan set:
//
//   scan set = `computeEntries()` ∪ `computeClosure().modules`, `.js`/`.cjs` only.
//
//   Literal extraction — every StringLiteral, NoSubstitutionTemplateLiteral and
//   TemplateExpression is rendered STATICALLY (a template joins its text parts
//   with `1` for each `${}` span; an unparseable render is retried with `''`), so
//   an interpolation is never read as SQL text and no JS is executed. SQL-shaped =
//   the trimmed text starts (case-insensitively) with one of the verbs in SQL_START.
//
//   · A parsed literal is fingerprinted (`fingerprintSync`) and its relations come
//     from the shared sql-witness resolver (`reads`/`writes`/`excluded`).
//   · An unparsed SQL-shaped literal is still a site (`fp = 'unparsed:' + the
//     trimmed source line`), judged only by the lexical regexes below — a text the
//     grammar rejects must not be a hole in the gate.
//
// The four codes (the `rule` id is what a Spec 124 §5 R-BA ledger row keys on):
//   G1 `compute-ledger-sql`        — reads/writes/excludes pipeline_runs, sync_runs,
//                                    logic_variables, schema_migrations or
//                                    trade_configurations (compute gets NO exemption).
//   G2 `compute-undeclared-relation` — a non-catalog relation not in the step's
//                                    declared set (compute ENTRIES only). The declared
//                                    set is the sibling `scripts/**/<basename>.descriptor.json`'s
//                                    inputs.reads.tables ∪ checks[].reads (a string
//                                    `"table.column"` or a `{table, columns}` object)
//                                    ∪ outputs.writes (schema keys read from
//                                    `scripts/steps/_schema/step.schema.json`); with no
//                                    descriptor (or one that declares nothing), an
//                                    exported `DECLARED` object literal read from the AST
//                                    — a top-level `const DECLARED = {…}` OR a literal
//                                    assigned to `module.exports.DECLARED` /
//                                    `exports.DECLARED`; with neither, G2 is skipped for
//                                    that file. G1/G3 relations never also count as G2.
//   G3 `compute-catalog`           — an `information_schema` relation, a `pg_catalog`
//                                    relation, a `pg_*` relation, or a `find_srid(...)`
//                                    call — unless that relation IS declared (AEH
//                                    declares pg_stat_user_tables). The catalog test runs
//                                    on the SCHEMA-QUALIFIED name (CP-B2b: stripping the
//                                    schema before the test turned every
//                                    `information_schema.columns` read into a G2 site).
//   G4 `compute-ddl-txn`           — a TransactionStmt / VacuumStmt / VariableSetStmt /
//                                    LockStmt / any Create*/Alter*/Drop*/Truncate*/
//                                    Index*/Reindex* statement, a `pg_advisory*`/
//                                    `pg_try_advisory*` function, or (AST, no SQL at
//                                    all) a `<x>.connect(` / `<x>.release(` call in a
//                                    compute or closure file.
//
// Each site is `{code, rule, file, line, fp, key, relation?}` and `key = <rule>@<fp>#<ordinal>`,
// ordinal counting the same `rule@fp` in source order WITHIN that file from 1 — a
// text key, so it survives line drift. Sites are sorted by file then line. A G1/G2/G3
// site also carries `relation` — the qualified name that was JUDGED (CP-B2b: a site a
// reviewer cannot name is a site a reviewer cannot check) — so a `--list` line shows
// WHAT was judged, not just where. G4 has no single relation and omits the field.
//
// `// B3:` markers below are the G5 (def-use) / G7 (alias table) / G8 (call graph)
// extension points, added in the NEXT brief, same file.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { computeEntries, computeClosure, requireClosure } from './compute-closure.mjs';
import { BAD_FIXTURE, BAD_HELPER, CLEAN_FIXTURE, CODES, REPO_ROOT, initSql, libpg, resolver } from './compute-purity-base.mjs';
import { ADVISORY_RE, CATALOG_RE, FIND_SRID_RE, G4_STMT_RE, LEDGER_TABLES, PG_REL_RE, UNPARSED_FP_RE, UTILITY_START, bareRelationName, baseTableName, catalogRefs, collectFileTemps, declaredFor, hasStmtKey, isCatalogName, lexicalMatch, literalSites, scanDiagnostics, statementRelations } from './compute-purity-sql.mjs';
import { G5Sites, G7Sites, G8Sites, finalizeSites } from './compute-purity-js.mjs';
export { BAD_FIXTURE, BAD_HELPER, CLEAN_FIXTURE, CODES, initSql, libpg } from './compute-purity-base.mjs';
export { LEDGER_TABLES, scanDiagnostics } from './compute-purity-sql.mjs';

// ------------------------------------------------------------------ the scan

/**
 * Scan the compute text for G1–G4 sites.
 *
 * @param {{repoRoot?: string, files?: string[], entries?: string[]}} opts — `files`
 *   overrides the scan set (the self-test passes the fixtures); the default is
 *   `computeEntries ∪ computeClosure().modules`, `.js`/`.cjs` only. `entries` is an
 *   optional list of repo-relative files — normalised the same way as `files` — that is
 *   ADDED to the entry set, so a caller can treat a file that is not a real compute entry
 *   (e.g. a self-test fixture) as one and have G2 apply to it. The entry set always
 *   includes `computeEntries(repoRoot)`.
 * @returns {Promise<Array<{code, rule, file, line, fp, key, relation?}>>} sorted by file,
 *   line; `relation` (the qualified name judged) is present on every G1/G2/G3 site.
 */
export async function scanPurity({ repoRoot = REPO_ROOT, files, entries } = {}) {
  await initSql();

  const explicit = !!(files && files.length);
  const norm = (f) => path.relative(repoRoot, path.isAbsolute(f) ? f : path.resolve(repoRoot, f)).split(path.sep).join('/');
  const scanFiles = (explicit
    ? files.map(norm)
    : [...computeEntries(repoRoot), ...computeClosure({ repoRoot }).modules])
    .filter((f) => f.endsWith('.js') || f.endsWith('.cjs'))
    .filter((f, i, a) => a.indexOf(f) === i)
    .sort();
  const entrySet = new Set(computeEntries(repoRoot).map(norm));
  // CP-B2d: an explicit `entries` list is ADDED, never substituted — a caller (the
  // self-test) can point G2 at a file that is not a real compute entry, e.g. a fixture.
  for (const e of entries || []) entrySet.add(norm(e));

  /** raw `{code, file, line, fp, ruleKey}` sites, per file, in push order. */
  const byFile = new Map();
  const declaredCache = new Map();

  for (const file of scanFiles) {
    let text;
    try {
      text = fs.readFileSync(path.resolve(repoRoot, file), 'utf8');
    } catch {
      continue;
    }
    // B3: G7 (the ctx.config alias table) and G8 (the export call graph) read this
    // same `sf` — the file is parsed exactly once, here. G5 (def-use) walks it too.
    const sf = ts.createSourceFile(path.resolve(repoRoot, file), text, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.JS);

    // G2 applies to compute ENTRIES only — never to a closure module, and never to
    // an explicit override that is not one of the compute entries.
    const isEntry = explicit ? entrySet.has(file) : true;
    if (!declaredCache.has(file)) declaredCache.set(file, declaredFor(repoRoot, file, sf));
    const declared = isEntry ? declaredCache.get(file) : null;

    const sites = [];
    const literals = literalSites(sf, text);
    // CP-B2c defect 2 — what THIS file creates for its own session, across every literal,
    // before any literal is judged: a temp's name is never a G2 site below.
    const fileTemps = collectFileTemps(sf, literals.map((l) => l.sql));
    for (const lit of literals) {
      const { line, sql, lineText } = lit;
      let parsed = null;
      let res = null;
      let fp = null;
      try {
        parsed = libpg().parseSync(sql);
        res = resolver.resolveStatement(sql, {});
        fp = res && typeof res.fingerprint === 'string' && res.fingerprint
          ? res.fingerprint
          : libpg().fingerprintSync(sql);
      } catch {
        parsed = null;
        res = null;
        fp = `unparsed:${lineText}`;
      }

      if (parsed) {
        const rels = statementRelations(parsed, res);
        const refs = catalogRefs(parsed);
        // CATALOG FIRST (CP-B2b): judge the QUALIFIED name, and decide G3 before G1/G2 so
        // one relation is exactly ONE site. A catalog relation is allowed only if the step
        // declares it (AEH declares pg_stat_user_tables).
        const catalog = [];
        for (const r of [...rels, ...refs.names]) {
          if (!isCatalogName(r)) continue;
          if (catalog.includes(r)) continue;
          if (declared && declared.has(baseTableName(r))) continue;
          catalog.push(r);
        }
        // CP-B2c defect 1 — a catalog relation's name is spent: a resolver relation whose BARE
        // name is one of them (`columns` from `information_schema.columns`, `pg_stat_user_tables `
        // with its trailing space) is the SAME relation, already judged G3, and must not also be
        // G1/G2. The judgement is per (bare) name, so neither the resolver's spelling nor a second
        // RangeVar walk can re-report it.
        const catalogBare = new Set(catalog.map(bareRelationName));
        // CP-B2c defect 2 — same treatment for this file's own session temps: a name the file
        // CREATEs as a TEMP is never an undeclared relation (and never a ledger read).
        const localTemps = new Set(fileTemps);
        const judgedG1 = new Set();
        const judgedG2 = new Set();
        for (const r of catalog) {
          sites.push({ code: 'G3', file, line, fp, ruleKey: `${CODES.G3.rule}@${fp}`, relation: r });
        }
        if (refs.findSrid) {
          sites.push({ code: 'G3', file, line, fp, ruleKey: `${CODES.G3.rule}@${fp}`, relation: 'find_srid' });
        }
        // G1 — a ledger relation named by a NON-catalog site (a catalog one is already G3).
        for (const r of rels) {
          const bare = bareRelationName(r);
          if (catalogBare.has(bare) || localTemps.has(bare)) continue;
          if (!LEDGER_TABLES.includes(bare)) continue;
          if (judgedG1.has(bare)) continue;
          judgedG1.add(bare);
          sites.push({ code: 'G1', file, line, fp, ruleKey: `${CODES.G1.rule}@${fp}`, relation: r });
        }
        // G2 — a non-catalog relation not declared, one site per (statement, bare name).
        // G1/G3 relations never count as G2, and neither does a temp this file created.
        if (isEntry && declared) {
          for (const r of rels) {
            const bare = bareRelationName(r);
            if (!bare || isCatalogName(r) || catalogBare.has(bare) || localTemps.has(bare)) continue;
            if (LEDGER_TABLES.includes(bare)) continue;
            if (declared.has(bare)) continue;
            if (judgedG2.has(bare)) continue;
            judgedG2.add(bare);
            sites.push({ code: 'G2', file, line, fp, ruleKey: `${CODES.G2.rule}@${fp}`, relation: r });
          }
        }
        // G4 — the statement KIND (checked on every parsed literal, ledger or not).
        if (hasStmtKey(parsed, (k) => G4_STMT_RE.test(k))
          || ADVISORY_RE.test(sql)) {
          sites.push({ code: 'G4', file, line, fp, ruleKey: `${CODES.G4.rule}@${fp}` });
        }
      } else {
        // Lexical arms — the grammar rejected this text, so only word/shape rules apply.
        // A name this file creates as a TEMP is its own, so neither arm below fires on it
        // (CP-B2c defect 2; `fileTemps` is collected lexically too, so it sees this text).
        const ledger = lexicalMatch(sql, LEDGER_TABLES).filter((t) => !fileTemps.has(bareRelationName(t)));
        const judgedLex = new Set();
        for (const t of ledger) {
          const bare = bareRelationName(t);
          if (judgedLex.has(bare)) continue;
          judgedLex.add(bare);
          sites.push({ code: 'G1', file, line, fp, ruleKey: `${CODES.G1.rule}@${fp}`, relation: t });
        }
        const catalogHit = CATALOG_RE.test(sql) || PG_REL_RE.test(sql) || FIND_SRID_RE.test(sql);
        if (catalogHit && !ledger.length) {
          const name = (sql.match(PG_REL_RE) || ['information_schema'])[0].toLowerCase();
          if (!(declared && declared.has(baseTableName(name))) && !fileTemps.has(bareRelationName(name))) {
            sites.push({ code: 'G3', file, line, fp, ruleKey: `${CODES.G3.rule}@${fp}`, relation: name });
          }
        }
        if (UTILITY_START.test(sql.trim()) || ADVISORY_RE.test(sql)) {
          sites.push({ code: 'G4', file, line, fp, ruleKey: `${CODES.G4.rule}@${fp}` });
        }
      }
    }

    // ── G4's AST-only arm: `<x>.connect(` / `<x>.release(` anywhere in the file ──
    const astG4 = connectReleaseSites(sf, text);
    for (const s of astG4) {
      sites.push({ code: 'G4', file, line: s.line, fp: s.fp, ruleKey: `${CODES.G4.rule}@${s.fp}` });
    }

    // ── B3: G5/G7/G8 — the three AST halves. All three are judged over compute ENTRIES
    // only, so a closure module's own `throw` or `ctx.config` read is never a site here
    // (the same scope G2 uses). ──
    let g5len = 0;
    if (isEntry) {
      for (const s of G5Sites(file, sf, text)) {
        sites.push({ code: 'G5', file, line: s.line, fp: s.fp, ruleKey: `${CODES.G5.rule}@${s.fp}` });
      }
      g5len = sites.filter((x) => x.code === 'G5').length;
      for (const s of G7Sites(sf, text)) {
        sites.push({ code: 'G7', file, line: s.line, fp: s.fp, ruleKey: `${CODES.G7.rule}@${s.fp}` });
      }
      for (const s of G8Sites(repoRoot, file, sf, text)) {
        sites.push({ code: 'G8', file, line: s.line, fp: s.fp, ruleKey: `${CODES.G8.rule}@${s.fp}` });
      }
    }

    // What this file's judgement depended on — a reader asking "why no G2 line here?"
    // (`scanDiagnostics`) gets the answer without re-running the gate by hand.
    const diagnostics = {
      isEntry,
      declared: declared ? [...declared].sort() : null,
      temps: [...fileTemps].sort(),
      skipped: 0,
      // CP-B3: a G5 site whose fingerprint is NOT the `call:` skeleton was a RESOLVED
      // DML literal; the rest are unresolved `<x>.query(...)` calls. Counted, so the
      // `--diagnostics` line shows how much of the G5 verdict is literal evidence.
      g5: g5len,
    };
    for (const s of sites) {
      // An UNPARSED literal is the only judgement that can hide a relation: its
      // fingerprint is a skeleton of the source line, and its relations come from the
      // lexical arms alone. Counted, so a caller can say how big the shadow is.
      if (typeof s.fp === 'string' && UNPARSED_FP_RE.test(s.fp)) diagnostics.skipped += 1;
    }
    scanDiagnostics.set(file, diagnostics);

    if (sites.length) byFile.set(file, sites);
  }

  return finalizeSites(byFile);
}

/** Every `<x>.connect(` / `<x>.release(` call in a parsed file, as a raw G4 site (`fp = 'call:' + trimmed line`). */
function connectReleaseSites(sf, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && (node.expression.name.text === 'connect' || node.expression.name.text === 'release')) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const lineText = (lines[line - 1] || '').trim();
      out.push({ line, fp: `call:${lineText}` });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}
export function codesSummary(sites) {
  const out = {};
  for (const code of Object.keys(CODES)) out[code] = 0;
  for (const s of sites) out[s.code] = (out[s.code] || 0) + 1;
  return out;
}

// ------------------------------------------------------------------ self-test

/** Every `// expect: G<n>` code per line (1-based), from the raw text. */
function expectations(text) {
  const map = new Map();
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/expect:\s*(G\d+)/g)) {
      if (!map.has(i + 1)) map.set(i + 1, new Set());
      map.get(i + 1).add(m[1]);
    }
  });
  return map;
}

/**
 * `selfTest()` — the fixtures prove every code fires and the clean twin is silent.
 * Scans `bad-compute-purity.js` PLUS its `require()` closure (the helper's own G1
 * site is the proof the closure is followed) and `clean-compute-purity.js`; throws
 * naming the miss.
 */
export async function selfTest() {
  const repoRoot = REPO_ROOT;
  const helperOnly = requireClosure([BAD_FIXTURE], { repoRoot }).modules;

  // 1. The bad fixture + its closure: every `// expect: G<n>` line has that code on it.
  // CP-B2d: `entries` names ONLY the fixture — the helper stays a non-entry (closure module),
  // so the helper's own sites are judged under closure semantics, not as an entry's G2.
  const bad = await scanPurity({ repoRoot, files: [BAD_FIXTURE, BAD_HELPER], entries: [BAD_FIXTURE] });
  for (const file of [BAD_FIXTURE, BAD_HELPER]) {
    const text = fs.readFileSync(path.resolve(repoRoot, file), 'utf8');
    for (const [line, codes] of expectations(text)) {
      for (const code of codes) {
        if (!bad.some((s) => s.code === code && s.file === file && s.line === line)) {
          throw new Error(`self-test FAILED (compute-purity): ${file}:${line} expects ${code} but no ${code} site was found`);
        }
      }
    }
  }
  // 1b. The closure walk itself is non-empty (the helper IS a module of that graph).
  if (!helperOnly.includes(BAD_HELPER)) {
    throw new Error(`self-test FAILED (compute-purity): ${BAD_HELPER} is not in the bad fixture's require closure`);
  }

  // 2. Every code in CODES is proven by at least one fixture site.
  for (const code of Object.keys(CODES)) {
    if (!bad.some((s) => s.code === code)) {
      throw new Error(`self-test FAILED (compute-purity): code ${code} (${CODES[code].rule}) did not fire on the known-bad fixture`);
    }
  }

  // 3. The clean twin is SILENT — zero G1–G8 sites.
  const clean = await scanPurity({ repoRoot, files: [CLEAN_FIXTURE], entries: [CLEAN_FIXTURE] });
  if (clean.length !== 0) {
    throw new Error(`self-test FAILED (compute-purity): ${CLEAN_FIXTURE} (clean) unexpectedly matched ${JSON.stringify(clean)}`);
  }

  // 4. Keys are unique within the run (Spec 124 R-BZ C2: one row allows exactly ONE site).
  const keys = [...bad, ...clean].map((s) => s.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`self-test FAILED (compute-purity): duplicate site keys ${JSON.stringify(keys)}`);
  }

  // 5. CP-B2b: every G1/G2/G3 site NAMES the relation it judged (the `--list` 3rd column),
  //    and no (statement, relation) pair is reported twice — G2 = "this statement touched a
  //    relation the step never declared", so the relation is the unit, not the literal.
  //    CP-B3: G4/G5/G7/G8 carry no relation (they judge a statement KIND or a line).
  const NO_RELATION = new Set(['G4', 'G5', 'G7', 'G8']);
  for (const s of bad) {
    if (!NO_RELATION.has(s.code) && !s.relation) {
      throw new Error(`self-test FAILED (compute-purity): ${s.code} site ${s.file}:${s.line} carries no relation`);
    }
    if ((s.code === 'G1' || s.code === 'G2' || s.code === 'G3') && /^information_schema|^pg_/.test(s.relation)
      && s.code !== 'G3') {
      throw new Error(`self-test FAILED (compute-purity): catalog relation ${s.relation} judged as ${s.code} at ${s.file}:${s.line}`);
    }
  }

  // 5b. CP-B3: the G8 site is the THROW, never the `enrich_hooks` wiring line (the fixture
  //     tag lives on the throw). The wiring line of the bad fixture must not carry G8.
  const wiring = [...fs.readFileSync(path.resolve(repoRoot, BAD_FIXTURE), 'utf8').split(/\r?\n/)]
    .findIndex((l) => /module\.exports\.enrich_hooks\s*=/.test(l)) + 1;
  if (wiring > 0 && bad.some((s) => s.code === 'G8' && s.line === wiring)) {
    throw new Error(`self-test FAILED (compute-purity): G8 reported on the enrich_hooks wiring line ${BAD_FIXTURE}:${wiring}`);
  }

  const pairs = bad.map((s) => `${s.file}\t${s.code}\t${s.relation || ''}\t${s.fp}`);
  if (new Set(pairs).size !== pairs.length) {
    throw new Error(`self-test FAILED (compute-purity): a (file, code, relation, fp) site is reported twice`);
  }
  return { bad, clean };
}

// ------------------------------------------------------------------ CLI

async function main(argv) {
  if (argv.includes('--self-test')) {
    await selfTest();
    process.stdout.write('PASS\n');
    return;
  }
  if (argv.includes('--list')) {
    const sites = await scanPurity({});
    for (const s of sites) {
      // 3rd tab column = the relation JUDGED (CP-B2b), so a reviewer sees WHAT, not only where.
      process.stdout.write(`FAIL:${s.code}:${s.file}:${s.line}\t${s.key}\t${s.relation || '-'}\n`);
    }
    const summary = codesSummary(sites);
    process.stdout.write(`G1..G8 sites=${sites.length} ${Object.keys(CODES).map((c) => `${c}=${summary[c]}`).join(' ')}\n`);
    if (argv.includes('--diagnostics')) {
      // CP-B2c: why the G2 count is what it is, per file — the declared set (or `none`),
      // the session temps the file owns, and how many literals the parser could not read.
      const files = [...scanDiagnostics.keys()].sort();
      for (const f of files) {
        const d = scanDiagnostics.get(f);
        const declared = d.declared ? `[${d.declared.join(',')}]` : 'none';
        process.stdout.write(`diag:${f}\tentry=${d.isEntry ? 'yes' : 'no'}\tdeclared=${declared}\ttemps=${d.temps.length ? `[${d.temps.join(',')}]` : '[]'}\tunparsed=${d.skipped}\tg5=${d.g5}\n`);
      }
    }
    return;
  }
  process.stderr.write('usage: compute-purity.mjs --list [--diagnostics] | --self-test\n');
  process.exitCode = 2;
}

if (!!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 1;
  });
}
