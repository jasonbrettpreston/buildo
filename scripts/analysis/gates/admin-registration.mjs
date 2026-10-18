// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DL, R-DV, R-DW, R-DU
//
// ADMIN-REGISTRATION (fast invariant #51; Spec 124 R-DL, McDonald's Airtight V3). Operator 2026-10-17:
// "when we are adding new steps we need to be aware of the admin as well — this is how we verify the
// output." Operator y 2026-10-18 moved this check from the suite to pre-commit. It is ONE definition:
// `step-validate --staged --fast` (pre-commit) and `--all --fast` (pre-push) run it as #51, and
// src/tests/admin-step-registration.logic.test.ts imports the same pure functions. That test also
// proves the source parsers below against the live TypeScript modules.
//
// For every converted or pending step (the expected set, derived from converted.json, never a hand list):
//   - PIPELINE_REGISTRY (FreshnessTimeline.tsx) and STEP_DESCRIPTIONS (funnel.ts) carry its slug;
//   - PIPELINE_TABLE_MAP names one of its declared outputs.writes tables (an ASSERT with outputs
//     "none" maps to pipeline_runs, its audit home);
//   - manifest telemetry_tables contains every declared write table;
//   - R-DW: no STEP_EXPECTED_RANGES entry (its badge is its audit_table check row), and every
//     checks[].limit_from_config / warn_limit_from_config names a registered seed variable.
// R-DV: a pending entry whose descriptor FILE is absent keeps only the slug-keyed arms (the registry
// row and the description). Keyed on the file, never the stage label. A converted entry with no
// descriptor throws (ENOENT), never skipped.
// R-DU: blockedSlugs names the violating slugs, so step-validate gates a slug only when that slug's
// row blocks. A pending row with no descriptor never blocks, so its violation prints as
// informational. The suite lock still enforces it.
// File-only (R-DJ (2)): no DB, no network, no TypeScript import. The admin maps are read from source.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const ASSERT_AUDIT_TABLE = 'pipeline_runs';
const FUNNEL_REL = 'src/lib/admin/funnel.ts';
const TIMELINE_REL = 'src/components/FreshnessTimeline.tsx';

const descriptorRel = (file) => String(file).replace(/\.(js|py)$/, '') + '.descriptor.json';

/**
 * PURE over source text: the body of one `export const <name> ... = { … }` object literal, with
 * line comments and string contents blanked so that a brace inside a string or comment cannot move
 * the depth count. Returns the original text slice and its blanked twin (same offsets).
 */
function objectBody(source, name) {
  const at = source.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`admin-registration: ${name} not found`);
  const open = source.indexOf('{', source.indexOf('=', at));
  let blank = '';
  let depth = 0;
  let quote = null;
  let i = open;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { blank += '  '; i++; continue; }
      if (ch === quote) { quote = null; blank += ch; continue; }
      blank += ' ';
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      blank += ' '.repeat((end < 0 ? source.length : end) - i);
      i = (end < 0 ? source.length : end) - 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; blank += ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { blank += ch; break; } }
    blank += ch;
  }
  return { text: source.slice(open, i + 1), blank };
}

/** PURE: the top-level keys of one exported object literal (identifier or quoted keys at depth 1). */
export function objectKeys(source, name) {
  const { text, blank } = objectBody(source, name);
  const keys = [];
  let d = 0;
  for (let j = 0; j < blank.length; j++) {
    const ch = blank[j];
    if (ch === '{') { d++; continue; }
    if (ch === '}') { d--; continue; }
    if (d !== 1 || !/[{,\s]/.test(blank[j - 1] || '')) continue;
    const m = /^(?:([A-Za-z_$][A-Za-z0-9_$]*)|(['"])([^'"]+)\2)\s*:/.exec(text.slice(j));
    if (m && /^\s*:/.test(blank.slice(j + m[0].length - 1))) {
      keys.push(m[1] || m[3]);
      j += m[0].length - 1;
    }
  }
  return keys;
}

/** PURE: the top-level `key: 'string'` entries of one exported flat object literal. */
export function objectStringEntries(source, name) {
  const { text, blank } = objectBody(source, name);
  const out = {};
  const re = /(?:^|[{,\s])(?:([A-Za-z_$][A-Za-z0-9_$]*)|(['"])([^'"]+)\2)\s*:\s*(['"])([^'"]*)\4/g;
  let m;
  while ((m = re.exec(text))) {
    const keyAt = m.index + m[0].search(/[A-Za-z_$'"]/);
    if (blank[keyAt] === ' ') continue; // inside a comment or string
    out[m[1] || m[3]] = m[5];
  }
  return out;
}

/**
 * The expected set: every converted and pending step with its descriptor (null for a pending entry
 * whose descriptor file is absent, R-DV). PURE over the injected readers.
 * @returns {Array<{slug: string, descriptor: object|null}>}
 */
export function convertedAndPendingSteps(scripts, converted, exists, read) {
  const pending = (converted.pending || []).map((p) => (typeof p === 'string' ? p : p.file));
  const isPending = new Set(pending);
  return [...(converted.converted || []), ...pending].map((file) => {
    const slug = Object.entries(scripts).find(([, e]) => e.file === file)?.[0];
    if (!slug) throw new Error(`no manifest.scripts entry points at ${file}`);
    const rel = descriptorRel(file);
    if (isPending.has(file) && !exists(rel)) return { slug, descriptor: null };
    return { slug, descriptor: read(rel) };
  });
}

function declaredWriteTables(d) {
  return d.outputs === 'none' ? [] : [...new Set(((d.outputs && d.outputs.writes) || []).map((w) => w.table))];
}

/** The R-DL violations, each `<slug>: <datum>` (pure). */
export function adminRegistrationViolations(steps, reg) {
  const out = [];
  for (const { slug, descriptor } of steps) {
    if (!(slug in reg.registry)) out.push(`${slug}: PIPELINE_REGISTRY`);
    if (!(slug in reg.descriptions)) out.push(`${slug}: STEP_DESCRIPTIONS`);
    if (descriptor === null) continue; // R-DV: the descriptor-derived arms wait for ②
    const writes = declaredWriteTables(descriptor);
    const mapped = reg.tableMap[slug];
    const allowed = writes.length === 0 && descriptor.identity.archetype === 'ASSERT' ? [ASSERT_AUDIT_TABLE] : writes;
    if (mapped === undefined) out.push(`${slug}: PIPELINE_TABLE_MAP (expected one of ${allowed.join(', ')})`);
    else if (!allowed.includes(mapped)) out.push(`${slug}: PIPELINE_TABLE_MAP "${mapped}" is not a declared write table (${allowed.join(', ')})`);
    const telemetry = new Set((reg.scripts[slug] && reg.scripts[slug].telemetry_tables) || []);
    for (const t of writes) if (!telemetry.has(t)) out.push(`${slug}: telemetry_tables missing ${t}`);
  }
  return out;
}

/**
 * The R-DW badge violations for descriptor-bearing steps (pure): a hand-written STEP_EXPECTED_RANGES
 * entry, or a check whose badge bound names an unregistered variable. A pending step with no
 * descriptor (R-DV) has no checks to derive from yet.
 */
export function rangeBadgeViolations(steps, rangeKeys, seedKeys) {
  const out = [];
  const ranged = new Set(rangeKeys);
  for (const { slug, descriptor } of steps) {
    if (descriptor === null) continue;
    if (ranged.has(slug)) out.push(`${slug}: STEP_EXPECTED_RANGES hand-written bound — its badge is its audit_table check row (checks[].limit_from_config)`);
    for (const c of descriptor.checks || []) {
      for (const v of [c.limit_from_config, c.warn_limit_from_config]) {
        if (v !== undefined && !seedKeys.has(v)) out.push(`${slug}: check ${c.id} badge bound reads ${v}, not a registered logic variable`);
      }
    }
  }
  return out;
}

/** #51 over a loaded input (pure): `{pass, blockedSlugs, detail}`, the registry-invariant shape. */
export function checkAdminRegistration({ steps, reg, rangeKeys, seedKeys }) {
  const violations = [...adminRegistrationViolations(steps, reg), ...rangeBadgeViolations(steps, rangeKeys, seedKeys)];
  const blockedSlugs = [...new Set(violations.map((v) => v.slice(0, v.indexOf(':'))))].sort();
  const detail = violations.length
    ? `ADMIN-REGISTRATION (R-DL/R-DW): ${violations.length} violation(s): ${violations.join('; ')}`
    : `ADMIN-REGISTRATION (R-DL/R-DW): ${steps.length} converted/pending step(s) admin-verifiable (${steps.filter((s) => s.descriptor === null).length} without a descriptor: slug arms only, R-DV); no hand-written range on a converted step`;
  return { pass: violations.length === 0, blockedSlugs, detail };
}

/** Reads every input from disk (file-only). */
export function loadAdminRegistration(repoRoot = REPO_ROOT) {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const scripts = read('scripts/manifest.json').scripts;
  const converted = read('scripts/steps/_schema/converted.json');
  const steps = convertedAndPendingSteps(scripts, converted, (rel) => fs.existsSync(path.join(repoRoot, rel)), read);
  const funnel = fs.readFileSync(path.join(repoRoot, FUNNEL_REL), 'utf8');
  const timeline = fs.readFileSync(path.join(repoRoot, TIMELINE_REL), 'utf8');
  const asSet = (keys) => Object.fromEntries(keys.map((k) => [k, true]));
  return {
    steps,
    reg: {
      registry: asSet(objectKeys(timeline, 'PIPELINE_REGISTRY')),
      descriptions: asSet(objectKeys(funnel, 'STEP_DESCRIPTIONS')),
      tableMap: objectStringEntries(funnel, 'PIPELINE_TABLE_MAP'),
      scripts,
    },
    rangeKeys: objectKeys(funnel, 'STEP_EXPECTED_RANGES'),
    seedKeys: new Set(Object.keys(read('scripts/seeds/logic_variables.json'))),
  };
}

/** Both directions on in-memory fixtures (the step-validate --self-test-only hook). */
export function selfTest() {
  const fail = (m) => { throw new Error(`admin-registration self-test FAILED: ${m}`); };
  const writer = { identity: { archetype: 'INGESTOR' }, outputs: { writes: [{ table: 't1' }] }, checks: [{ id: 'c', limit_from_config: 'x_conv_c_max' }] };
  const steps = [{ slug: 'x_conv', descriptor: writer }, { slug: 'x_red', descriptor: null }];
  const ok = {
    steps,
    reg: { registry: { x_conv: 1, x_red: 1 }, descriptions: { x_conv: 1, x_red: 1 }, tableMap: { x_conv: 't1' }, scripts: { x_conv: { telemetry_tables: ['t1'] } } },
    rangeKeys: ['x_red'],
    seedKeys: new Set(['x_conv_c_max']),
  };
  const green = checkAdminRegistration(ok);
  if (!green.pass) fail(`GREEN fixture red: ${green.detail}`);
  const red = checkAdminRegistration({ ...ok, reg: { ...ok.reg, registry: { x_conv: 1 }, tableMap: {} }, rangeKeys: ['x_red', 'x_conv'] });
  if (red.pass || red.blockedSlugs.join(',') !== 'x_conv,x_red') fail(`RED fixture: ${red.detail}`);
  if (!/x_red: PIPELINE_REGISTRY/.test(red.detail) || !/x_conv: PIPELINE_TABLE_MAP/.test(red.detail) || !/x_conv: STEP_EXPECTED_RANGES/.test(red.detail)) fail(`RED detail: ${red.detail}`);
  const src = "export const M: Record<string, X> = {\n  a: 'ta', // b: 'no'\n  'c': \"tc\", d: { e: 'x' },\n  f: 'has { brace',\n};";
  if (objectKeys(src, 'M').join(',') !== 'a,c,d,f') fail(`objectKeys: ${objectKeys(src, 'M')}`);
  const e = objectStringEntries(src, 'M');
  if (e.a !== 'ta' || e.c !== 'tc' || e.f !== 'has { brace' || 'b' in e) fail(`objectStringEntries: ${JSON.stringify(e)}`);
  return 'admin-registration self-test PASSED';
}
