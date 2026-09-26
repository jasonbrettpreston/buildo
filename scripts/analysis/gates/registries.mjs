// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 9, §5 R-X, R-AO, R-BA (gate I);
//            docs/specs/01-pipeline/123_step_opt_assessment_validation.md §3.1
//
// GATE I — REGISTRY COVERAGE: four independent predicates, each RED-by-default
// and each closed (R-X: a declaration nobody adjudicated is the defect).
//
//   (1) #33 `bannedCoverage` — every key in `step.schema.json`'s
//       `x-banned-for-new.values` is ENFORCED by `scripts/lib/step/validate.js`
//       (Rule 9: a banned value needs an adjudicated allowlist entry, never
//       merely a descriptor-authored `*_why`). Measured 2026-09-27: `values`
//       names 4 paths, `GRANDFATHERED_VALUE_PATHS` covered 2.
//   (2) #34 `checkStalenessDisposition` — every `staleness.fingerprint_inputs`
//       entry has an `executed | descriptive | retire` row in
//       `staleness-disposition.json` (R-X); an ABSENT registry is RED, and an
//       `executed` row's `executor.symbol` must resolve in its own file.
//   (3) #35 `censusParity` — every `converted.json.converted` slug has a
//       `step-archetype-census.json` `entries[]` row or an `exemptions[]` row.
//       This is #25 ARCHETYPE-PARITY's missing-row arm: #25 answers "does the
//       retained row AGREE", this answers "does a row EXIST to agree with".
//   (4) #36 `checkDefectIdUniqueness` — a KNOWN-DEFECT id is DEFINED by a table
//       row whose FIRST cell is exactly that id (a prose mention is a
//       CITATION). A cross-file MIRROR is legal (measured 2026-09-27: the
//       ledger mirrors every pilot report's row) only when the statuses are
//       IDENTICAL; a drifted mirror is RED, naming both rows.
//
// PURE predicates (`(repoRoot|inputs) -> {pass, violations[]}`); `ledger.mjs`
// owns the row shape and the match. NOT WIRED YET: the orchestrator adds fast
// invariants #33-#36 (after id 32) and calls `selfTest()`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const CONVERTED_REL_PATH = 'scripts/steps/_schema/converted.json';
export const CENSUS_REL_PATH = 'scripts/steps/_schema/step-archetype-census.json';
export const STALENESS_DISPOSITION_REL_PATH = 'scripts/steps/_schema/staleness-disposition.json';
export const SCHEMA_REL_PATH = 'scripts/steps/_schema/step.schema.json';
export const VALIDATE_REL_PATH = 'scripts/lib/step/validate.js';
export const MANIFEST_REL_PATH = 'scripts/manifest.json';
export const DEFECT_LEDGER_REL_PATH = 'docs/reports/defect-ledger.md';

/** Spec 124 §5 R-X — the closed disposition menu; one vocabulary, never two. */
export const STALENESS_MENU = ['executed', 'descriptive', 'retire'];

/** A KNOWN-DEFECT id: step prefix + `-D` + ordinal (optionally a letter suffix). */
export const DEFECT_ID_RE = /^([A-Z]{2,5}-D\d+[a-z]?)$/;

const kebab = (slug) => String(slug).replace(/_/g, '-');
const readJson = (repoRoot, rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));

// ---------------------------------------------------------------------------
// #33 — banned-value coverage (Rule 9)
// ---------------------------------------------------------------------------

/**
 * The paths `validate.js` ACTUALLY enforces — parsed from the `path:` literals
 * of its `GRANDFATHERED_VALUE_PATHS` array, never copied (a hardcoded list here
 * would be a second copy of the enforcer's own answer set). A `path:` naming a
 * constant is resolved against that constant's own declaration, so a rename
 * still resolves instead of silently reporting 0.
 * @param {string} validateSource
 * @returns {Set<string>}
 */
export function enforcedBannedPaths(validateSource) {
  const src = String(validateSource || '');
  const block = /const GRANDFATHERED_VALUE_PATHS = \[([\s\S]*?)\n\];/.exec(src);
  if (!block) return new Set();
  const paths = new Set();
  const re = /path:\s*([A-Z_][A-Z0-9_]*|'(?:[^']*)')/g;
  let m;
  while ((m = re.exec(block[1])) !== null) paths.add(/^'/.test(m[1]) ? m[1].slice(1, -1) : m[1]);
  for (const ident of [...paths]) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(ident)) continue;
    const hit = new RegExp(`const ${ident} = '([^']*)'`).exec(src);
    paths.delete(ident);
    if (hit) paths.add(hit[1]);
  }
  return paths;
}

/**
 * #33 over a schema + the enforcer's source. A banned path with no enforcer is
 * a violation — Rule 9 is not satisfied by a comment.
 * @param {{schema: object, validateSource: string}} inputs
 */
export function bannedCoverage({ schema, validateSource }) {
  const values = (schema && schema['x-banned-for-new'] && schema['x-banned-for-new'].values) || {};
  const bannedPaths = Object.keys(values).sort();
  const enforced = enforcedBannedPaths(validateSource);
  const violations = [];
  for (const banned of bannedPaths) {
    if (enforced.has(banned)) continue;
    violations.push({
      path: banned,
      why: `is x-banned-for-new (${JSON.stringify(values[banned])}) but no GRANDFATHERED_VALUE_PATHS entry in ${VALIDATE_REL_PATH} enforces it — a descriptor carrying this value would ship with no adjudication`,
    });
  }
  return { pass: violations.length === 0, violations, bannedPaths, enforcedPaths: [...enforced].sort() };
}

// ---------------------------------------------------------------------------
// #34 — staleness.fingerprint_inputs disposition (R-X)
// ---------------------------------------------------------------------------

/** Every fingerprint input a converted descriptor declares. `"none"` declares nothing. */
export function declaredFingerprintInputs(repoRoot = REPO_ROOT) {
  const out = [];
  for (const relFile of readJson(repoRoot, CONVERTED_REL_PATH).converted || []) {
    const rel = String(relFile).replace(/\.(js|py)$/, '') + '.descriptor.json';
    let descriptor;
    try {
      descriptor = readJson(repoRoot, rel);
    } catch (e) {
      throw new Error(`converted step ${relFile} has no readable descriptor at ${rel}: ${e.message}`);
    }
    const fingerprint = descriptor.staleness && descriptor.staleness.fingerprint_inputs;
    if (!Array.isArray(fingerprint)) continue;
    const slug = (descriptor.identity && descriptor.identity.name) || kebab(path.basename(rel, '.descriptor.json'));
    for (const entry of fingerprint) {
      if (typeof entry === 'string' && entry.length > 0) out.push({ slug, entry });
    }
  }
  return out;
}

/** The registry, or `null` when absent — an absent registry is RED for the caller. */
export function loadStalenessDisposition(repoRoot = REPO_ROOT) {
  const abs = path.join(repoRoot, STALENESS_DISPOSITION_REL_PATH);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`staleness-disposition.json is not valid JSON at ${STALENESS_DISPOSITION_REL_PATH}: ${e.message}`);
  }
}

/**
 * Findings for ONE disposition row, against injected `exists`/`read` — PURE, so
 * the answer set is testable with no filesystem.
 * @param {object} row
 * @param {{exists: (rel: string) => boolean, read: (rel: string) => string|null}} deps
 * @param {string} [declPath]
 */
export function dispositionRowFindings(row, deps, declPath = '(row)') {
  if (!row || typeof row !== 'object') return [{ item: declPath, why: 'declaration row is not an object' }];
  if (!STALENESS_MENU.includes(row.disposition)) {
    return [{ item: declPath, why: `disposition ${JSON.stringify(row.disposition)} is not one of ${STALENESS_MENU.join('/')}` }];
  }
  if (row.disposition !== 'executed') return [];
  const ex = row.executor;
  if (!ex || typeof ex.file !== 'string' || !deps.exists(ex.file)) {
    return [{ item: declPath, why: `disposition "executed" cites executor file ${JSON.stringify(ex && ex.file)} which does not exist — the claim is unverifiable` }];
  }
  if (typeof ex.symbol !== 'string' || ex.symbol.length === 0) {
    return [{ item: declPath, why: 'disposition "executed" requires an executor.symbol naming the exported symbol that reads it' }];
  }
  const text = deps.read(ex.file);
  if (text === null || !new RegExp(`\\b${ex.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) {
    return [{ item: declPath, why: `disposition "executed" cites executor symbol "${ex.symbol}" which does not appear in ${ex.file} — a citation that does not resolve is a rotted citation` }];
  }
  return [];
}

/** The registry's own findings: absent file, out-of-menu row, unresolvable executor (R-X). */
export function stalenessDispositionFindings(deps = {}) {
  const repoRoot = deps.repoRoot || REPO_ROOT;
  const exists = deps.exists || ((rel) => fs.existsSync(path.join(repoRoot, rel)));
  const read = deps.read || ((rel) => {
    const abs = path.join(repoRoot, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  });
  const registry = loadStalenessDisposition(repoRoot);
  if (registry === null) {
    return [{ item: 'registry', why: `${STALENESS_DISPOSITION_REL_PATH} does not exist — every staleness.fingerprint_inputs entry is unadjudicated (R-X), a RED, never a vacuous pass` }];
  }
  const declarations = (registry.declarations && typeof registry.declarations === 'object') ? registry.declarations : {};
  return Object.entries(declarations)
    .flatMap(([declPath, row]) => dispositionRowFindings(row, { exists, read }, declPath));
}

/** #34 over the live tree: registry well-formed AND every declared entry adjudicated. */
export function checkStalenessDisposition(repoRoot = REPO_ROOT) {
  const violations = stalenessDispositionFindings({ repoRoot });
  const registry = loadStalenessDisposition(repoRoot);
  const declarations = (registry && registry.declarations) || {};
  const declared = declaredFingerprintInputs(repoRoot);
  for (const { slug, entry } of declared) {
    if (Object.prototype.hasOwnProperty.call(declarations, entry)) continue;
    violations.push({
      item: entry,
      why: `declared by converted step "${slug}" but has no row in ${STALENESS_DISPOSITION_REL_PATH} — an unadjudicated declaration (R-X)`,
    });
  }
  return { pass: violations.length === 0, violations, declared: declared.length, registryPresent: registry !== null };
}

// ---------------------------------------------------------------------------
// #35 — census parity (R-AO)
// ---------------------------------------------------------------------------

/** #35: every converted slug has a census row or an exemption. */
export function censusParity(converted, census) {
  const slugs = (list) => new Set((Array.isArray(list) ? list : [])
    .map((e) => e && e.slug).filter((s) => typeof s === 'string'));
  const rowSlugs = slugs(census && census.entries);
  const exemptSlugs = slugs(census && census.exemptions);
  const violations = [];
  for (const c of Array.isArray(converted) ? converted : []) {
    if (!c || typeof c.slug !== 'string' || rowSlugs.has(c.slug) || exemptSlugs.has(c.slug)) continue;
    violations.push({
      slug: c.slug,
      file: c.file,
      why: 'is registered in converted.json but has no step-archetype-census.json entries[] row and no exemptions[] row — R-AO cannot compare a row that does not exist, and fast invariant #25 reads that absence as not-applicable',
    });
  }
  return { pass: violations.length === 0, violations };
}

/** The converted fleet, slug resolved from the manifest (never name-mangled). */
export function loadConvertedSlugs(repoRoot = REPO_ROOT) {
  const byFile = new Map(Object.entries(readJson(repoRoot, MANIFEST_REL_PATH).scripts || {})
    .map(([slug, e]) => [e.file, slug]));
  return (readJson(repoRoot, CONVERTED_REL_PATH).converted || []).map((relFile) => ({
    file: relFile,
    slug: byFile.get(relFile) || kebab(path.basename(String(relFile)).replace(/\.(js|py)$/, '')),
  }));
}

// ---------------------------------------------------------------------------
// #36 — defect / KNOWN-DEFECT id uniqueness (Spec 123 §3.1)
// ---------------------------------------------------------------------------

/**
 * Every DEFINITION row in one markdown document: a table row whose FIRST cell
 * is EXACTLY a defect id. Column 5 (1-based) is the STATUS cell a mirror must
 * repeat. PURE.
 */
export function defectDefinitionRows(text) {
  const rows = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('|')) continue;
    const cells = lines[i].split('|');
    const m = DEFECT_ID_RE.exec((cells[1] || '').trim().replace(/^\*\*|\*\*$/g, ''));
    if (m) rows.push({ id: m[1], status: (cells[5] || '').trim(), line: i + 1 });
  }
  return rows;
}

/**
 * #36 over `{file, text}` docs. Two definitions of one id are RED, unless every
 * definition carries an IDENTICAL status cell — the cross-file mirror the
 * ledger is by design. A drifted mirror is the defect.
 */
export function defectIdUniqueness(docs) {
  const byId = new Map();
  let definitions = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    for (const row of defectDefinitionRows(doc.text)) {
      definitions += 1;
      if (!byId.has(row.id)) byId.set(row.id, []);
      byId.get(row.id).push({ ...row, file: doc.file });
    }
  }
  const violations = [];
  let mirrored = 0;
  for (const [id, rows] of byId) {
    if (rows.length <= 1) continue;
    if (new Set(rows.map((r) => r.status)).size === 1) { mirrored += 1; continue; }
    violations.push({
      id,
      why: `defined in ${rows.length} rows with DISAGREEING status cells: ${rows.map((r) => `${r.file}:${r.line} -> ${JSON.stringify(r.status)}`).join('; ')} — a mirror is legal only when it repeats the same status; a drifted mirror leaves no reader able to tell which copy is true`,
    });
  }
  return { pass: violations.length === 0, violations, definitions, mirrored };
}

/** #36 over the live tree: the register plus every `*-assessment.md` report. */
export function checkDefectIdUniqueness(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, 'docs/reports');
  const docs = fs.readdirSync(dir)
    .filter((f) => f === 'defect-ledger.md' || (f.endsWith('-assessment.md') && !f.startsWith('.')))
    .sort()
    .map((name) => ({ file: `docs/reports/${name}`, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
  return defectIdUniqueness(docs);
}

// ---------------------------------------------------------------------------
// selfTestCases() — one RED + one GREEN fixture per predicate. A checker never
// proven to fire is not a check (Spec 121 §12b.6).
// ---------------------------------------------------------------------------

export function selfTestCases() {
  const schema = { 'x-banned-for-new': { values: {
    'outputs.writes[].replay': ['append_unsafe'],
    'outputs.writes[].write_discipline.guard': ['none'],
  } } };
  const guardEntry = "  { path: GUARD_PATH, field: 'guard', whyField: 'guard_why' },";
  const src = ["const GUARD_PATH = 'outputs.writes[].write_discipline.guard';",
    'const GRANDFATHERED_VALUE_PATHS = [', guardEntry, '];'].join('\n');
  const census = { entries: [{ slug: 'assert_schema' }], exemptions: [{ slug: 'reconcile' }] };
  const defRow = (id, status) => `| ${id} | step | anchor | line | ${status} | closes | src |`;
  const ex = { exists: () => true, read: () => 'function realReader() {}\nmodule.exports = { realReader };' };
  const execRow = (symbol) => ({ disposition: 'executed', executor: { file: 'scripts/lib/compute/x.js', symbol } });
  const X = 'scripts/lib/compute/x.js';
  const ledger = { file: 'docs/reports/defect-ledger.md' };
  const assessment = { file: 'docs/reports/2026-08-25-pilot1-assert-schema-assessment.md' };

  return [
    { name: '#33 RED — a banned path with no enforcer', run: () => bannedCoverage({ schema, validateSource: src }), expect: { pass: false, violations: 1, path: 'outputs.writes[].replay' } },
    { name: '#33 GREEN — every banned path enforced', expect: { pass: true, violations: 0 },
      run: () => bannedCoverage({ schema, validateSource: src.replace(guardEntry, `${guardEntry}\n  { path: 'outputs.writes[].replay', field: 'replay', whyField: 'replay_why' },`) }) },
    { name: '#34 RED — an absent registry is RED, never vacuous', expect: { violations: 1, item: 'registry' },
      run: () => stalenessDispositionFindings({ repoRoot: '/nonexistent-repo', exists: () => false, read: () => null }) },
    { name: '#34 RED — an executed row whose executor symbol does not resolve', expect: { violations: 1, item: X },
      run: () => dispositionRowFindings(execRow('ghostReader'), ex, X) },
    { name: '#34 GREEN — an executed row whose executor symbol genuinely resolves', expect: { violations: 0 },
      run: () => dispositionRowFindings(execRow('realReader'), ex, X) },
    { name: '#34 RED — a disposition outside the closed menu', expect: { violations: 1, item: '(row)' },
      run: () => dispositionRowFindings({ disposition: 'maybe' }, ex) },
    { name: '#35 RED — a converted slug with no census row and no exemption', expect: { pass: false, violations: 1, slug: 'link_parcels' },
      run: () => censusParity([{ slug: 'assert_schema' }, { slug: 'link_parcels', file: 'scripts/link-parcels.js' }], census) },
    { name: '#35 GREEN — every converted slug has a row or an exemption', expect: { pass: true, violations: 0 },
      run: () => censusParity([{ slug: 'assert_schema' }, { slug: 'reconcile' }], census) },
    { name: '#36 RED — the same id defined twice with disagreeing statuses', expect: { pass: false, violations: 1, id: 'AS-D1' },
      run: () => defectIdUniqueness([{ ...ledger, text: defRow('AS-D1', '**CLOSED · 8b**') }, { ...assessment, text: defRow('AS-D1', 'OPEN · PIN') }]) },
    { name: '#36 GREEN — an identical-status cross-file mirror is legal; a prose mention is not a definition', expect: { pass: true, violations: 0, mirrored: 1 },
      run: () => defectIdUniqueness([{ ...ledger, text: `${defRow('AS-D1', 'CLOSED')}\nThe AS-D1 class recurs.` }, { ...assessment, text: defRow('AS-D1', 'CLOSED') }]) },
  ];
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const fail = (c, detail) => { throw new Error(`self-test FAILED (${c.name}): ${detail}`); };
  for (const c of selfTestCases()) {
    const got = c.run();
    const e = c.expect;
    if (Array.isArray(got)) {
      if (e.violations !== undefined && got.length !== e.violations) fail(c, `got ${got.length} finding(s) ${JSON.stringify(got)}`);
      continue;
    }
    if (e.pass !== undefined && got.pass !== e.pass) fail(c, `pass ${got.pass}`);
    if (e.violations !== undefined && (got.violations || []).length !== e.violations) fail(c, `violations ${JSON.stringify(got.violations)}`);
    if (e.mirrored !== undefined && got.mirrored !== e.mirrored) fail(c, `mirrored ${got.mirrored}`);
    if (e.id !== undefined && (got.violations || [])[0]?.id !== e.id) fail(c, `id ${JSON.stringify(got.violations)}`);
    if (e.path !== undefined && (got.violations || [])[0]?.path !== e.path) fail(c, `path ${JSON.stringify(got.violations)}`);
    if (e.slug !== undefined && (got.violations || [])[0]?.slug !== e.slug) fail(c, `slug ${JSON.stringify(got.violations)}`);
    if (e.item !== undefined && (got.violations || [])[0]?.item !== e.item) fail(c, `item ${JSON.stringify(got.violations)}`);
  }
}

/** CLI — `--list` prints every CURRENT violation (the orchestrator's landing worklist). */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('registries self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const out = {
      banned: bannedCoverage({ schema: readJson(REPO_ROOT, SCHEMA_REL_PATH), validateSource: fs.readFileSync(path.join(REPO_ROOT, VALIDATE_REL_PATH), 'utf8') }).violations,
      staleness: checkStalenessDisposition(REPO_ROOT).violations,
      census: censusParity(loadConvertedSlugs(REPO_ROOT), readJson(REPO_ROOT, CENSUS_REL_PATH)).violations
        .map((v) => ({ slug: v.slug, file: v.file })),
      defects: checkDefectIdUniqueness(REPO_ROOT).violations,
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: registries.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
