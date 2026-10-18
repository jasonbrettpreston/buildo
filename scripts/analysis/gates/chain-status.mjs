// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BC (chain completion), R-DJ (CHAIN-TOOLING)
//
// CHAIN-TOOLING part 3 (Spec 124 R-DJ, McDonald's Airtight V3, 2026-10-17; R-BC (e)(3)): one status line
// per chain, derived from the registries only — never hand-kept, never a DB read. A chain is complete
// only when R-BC's gates all hold:
//   (a) CONVERTED — every manifest.chains.<chain> slug's file is in converted.json converted[], except a
//       step-archetype-census.json exemptions[] row;
//   (b) NO LEDGER — zero standard-gates-ledger.json rows whose step is a chain step;
//   (c)–(e) the chain's acceptance programme items are BUILT (cross-step ledger, cloud proof, tooling).
// Only the sources chain has registered acceptance items today (LDG-10, EP-PIN-D17, CHAIN-TOOLING);
// a chain with none prints "acceptance items: none registered" and cannot read as complete.
//
// Admin visibility (operator 2026-10-17: "when we are adding new steps we need to be aware of the admin as
// well — this is how we verify the output"): the line also counts converted steps the admin data-quality
// surface cannot verify — no `STEP_DESCRIPTIONS` entry in src/lib/admin/funnel.ts (the drill-down the
// dashboard renders per step). Spec 124 R-DW (amends R-DJ (3)): `STEP_EXPECTED_RANGES` is no longer an
// arm — a converted step's badges are its own audit_table check rows, and a converted step carrying a
// hand-written range entry is an R-DL violation (admin-step-registration.logic), not a registration.
// REPORT-ONLY: it never decides `complete` (no Spec 124 rule makes it a gate yet).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

/** R-BC (c)–(e) programme items per chain — a closed map; a chain absent here has none registered. */
export const ACCEPTANCE_ITEMS = Object.freeze({
  sources: Object.freeze({ ledger: 'LDG-10', cloud: 'EP-PIN-D17', tooling: 'CHAIN-TOOLING' }),
});

const norm = (f) => String(f || '').replace(/\\/g, '/');

/** A ledger row's step names a chain step by slug, by hyphenated slug, or by a leading slug annotation. */
function rowStepSlug(step, slugs) {
  const s = String(step || '');
  for (const slug of slugs) {
    const hy = slug.replace(/_/g, '-');
    if (s === slug || s === hy || s.startsWith(`${slug} `) || s.startsWith(`${hy} `)) return slug;
  }
  return null;
}

/**
 * PURE — R-BC (a)–(e) per chain.
 * @param {{manifest: object, converted: object, census: object, ledgerRows: object[], programmeItems: object[], adminRegistered?: Set<string>}} reg
 * @returns {Array<{chain: string, steps: number, exempt: number, converted: number, pending: string[], unconverted: string[],
 *   ledger: number, items: Record<string, {id: string, status: string}> | null, adminUnregistered: string[] | null, complete: boolean}>}
 */
export function computeChainStatus({ manifest, converted, census, ledgerRows, programmeItems, adminRegistered }) {
  const convertedFiles = new Set((converted.converted || []).map(norm));
  const pendingFiles = new Set((converted.pending || []).map((p) => norm(typeof p === 'string' ? p : p && p.file)));
  const exemptSlugs = new Set((census.exemptions || []).map((e) => e.slug));
  const itemStatus = new Map((programmeItems || []).map((it) => [it.id, it.status]));
  const out = [];
  for (const [chain, slugs] of Object.entries(manifest.chains || {})) {
    const unique = [...new Set(slugs)];
    const exempt = unique.filter((s) => exemptSlugs.has(s));
    const counted = unique.filter((s) => !exemptSlugs.has(s));
    const fileOf = (s) => norm(manifest.scripts && manifest.scripts[s] && manifest.scripts[s].file);
    const done = counted.filter((s) => convertedFiles.has(fileOf(s)));
    const pending = counted.filter((s) => !convertedFiles.has(fileOf(s)) && pendingFiles.has(fileOf(s)));
    const unconverted = counted.filter((s) => !convertedFiles.has(fileOf(s)) && !pendingFiles.has(fileOf(s)));
    const ledger = (ledgerRows || []).filter((r) => rowStepSlug(r.step, unique)).length;
    const map = ACCEPTANCE_ITEMS[chain] || null;
    const items = map
      ? Object.fromEntries(Object.entries(map).map(([k, id]) => [k, { id, status: itemStatus.get(id) || 'MISSING' }]))
      : null;
    const itemsBuilt = Boolean(items) && Object.values(items).every((i) => i.status === 'BUILT');
    const adminUnregistered = adminRegistered ? done.filter((s) => !adminRegistered.has(s)) : null;
    out.push({
      chain, steps: counted.length, exempt: exempt.length, converted: done.length, pending, unconverted, ledger, items, adminUnregistered,
      complete: done.length === counted.length && ledger === 0 && itemsBuilt,
    });
  }
  return out;
}

/** PURE — the one printed line per chain. */
export function formatChainStatusLine(s) {
  const exempt = s.exempt ? ` (${s.exempt} exempt)` : '';
  const pending = s.pending.length ? ` · pending ${s.pending.join(',')}` : '';
  const items = s.items
    ? Object.entries(s.items).map(([k, i]) => `${k === 'ledger' ? i.id : k === 'cloud' ? `cloud ${i.id}` : 'tooling'} ${i.status}`).join(' · ')
    : 'acceptance items: none registered';
  const admin = s.adminUnregistered ? ` · admin unregistered ${s.adminUnregistered.length}` : '';
  return `${s.complete ? '✔' : '✘'} chain ${s.chain}: converted ${s.converted}/${s.steps}${exempt}${pending} · ledger ${s.ledger} · ${items}${admin}`;
}

/**
 * PURE over source text — the top-level keys of one `export const <name> = { … }` object literal. The
 * admin maps are TypeScript (not importable from .mjs), so their keys are read structurally: a key is an
 * identifier or quoted string at the object's first nesting level.
 */
export function objectLiteralKeys(source, name) {
  const at = source.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`chain-status: ${name} not found in the admin funnel module`);
  const open = source.indexOf('{', source.indexOf('=', at));
  const keys = new Set();
  let depth = 0;
  let i = open;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) break; }
    else if (depth === 1 && /[A-Za-z_']/.test(ch) && /[{,\s]/.test(source[i - 1])) {
      const m = /^(?:([A-Za-z_][A-Za-z0-9_]*)|'([^']+)')\s*:/.exec(source.slice(i));
      if (m) { keys.add(m[1] || m[2]); i += m[0].length - 1; }
    }
  }
  return keys;
}

/** The converted-step slugs the admin surface can verify: a description (R-DW: badges come from audit_table). */
export function adminRegisteredSlugs(repoRoot = REPO_ROOT) {
  const src = fs.readFileSync(path.join(repoRoot, 'src/lib/admin/funnel.ts'), 'utf8');
  return objectLiteralKeys(src, 'STEP_DESCRIPTIONS');
}

/** Reads the five registries from disk (file-only). */
export function loadRegistries(repoRoot = REPO_ROOT) {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const programme = read('scripts/steps/_schema/programme-items.json');
  return {
    manifest: read('scripts/manifest.json'),
    converted: read('scripts/steps/_schema/converted.json'),
    census: read('scripts/steps/_schema/step-archetype-census.json'),
    ledgerRows: read('scripts/steps/_schema/standard-gates-ledger.json').rows || [],
    programmeItems: Array.isArray(programme.items) ? programme.items : Object.values(programme.items || programme),
    adminRegistered: adminRegisteredSlugs(repoRoot),
  };
}

export function chainStatusLines(repoRoot = REPO_ROOT) {
  return computeChainStatus(loadRegistries(repoRoot)).map(formatChainStatusLine);
}

/** Both directions on in-memory fixtures. */
export function selfTest() {
  const base = {
    manifest: { chains: { sources: ['a', 'b', 'r'], other: ['c'] }, scripts: { a: { file: 'scripts/a.js' }, b: { file: 'scripts/b.js' }, r: { file: 'scripts/r.js' }, c: { file: 'scripts/c.js' } } },
    converted: { converted: ['scripts/a.js', 'scripts/b.js', 'scripts/c.js'], pending: [] },
    census: { exemptions: [{ slug: 'r' }] },
    ledgerRows: [],
    programmeItems: [{ id: 'LDG-10', status: 'BUILT' }, { id: 'EP-PIN-D17', status: 'BUILT' }, { id: 'CHAIN-TOOLING', status: 'BUILT' }],
  };
  const green = computeChainStatus(base);
  if (!green.find((s) => s.chain === 'sources').complete) throw new Error('chain-status selfTest: all gates held must read complete');
  if (green.find((s) => s.chain === 'other').complete) throw new Error('chain-status selfTest: a chain with no acceptance items must not read complete');
  const pendingB = computeChainStatus({ ...base, converted: { converted: ['scripts/a.js'], pending: [{ file: 'scripts/b.js' }] } }).find((s) => s.chain === 'sources');
  if (pendingB.complete || pendingB.converted !== 1 || pendingB.pending[0] !== 'b') throw new Error('chain-status selfTest: a pending step blocks (a)');
  const ledgered = computeChainStatus({ ...base, ledgerRows: [{ step: 'a-step-hyphen' }, { step: 'b' }] }).find((s) => s.chain === 'sources');
  if (ledgered.complete || ledgered.ledger !== 1) throw new Error('chain-status selfTest: a chain-step ledger row blocks (b), a foreign row does not count');
  const open = computeChainStatus({ ...base, programmeItems: [{ id: 'LDG-10', status: 'NOT_STARTED' }] }).find((s) => s.chain === 'sources');
  if (open.complete || open.items.cloud.status !== 'MISSING') throw new Error('chain-status selfTest: an unbuilt or missing item blocks (c)–(e)');
  const withAdmin = computeChainStatus({ ...base, adminRegistered: new Set(['a']) }).find((s) => s.chain === 'sources');
  if (!withAdmin.complete || withAdmin.adminUnregistered.join() !== 'b') throw new Error('chain-status selfTest: admin visibility is counted, report-only (never decides complete)');
  const keys = objectLiteralKeys("export const M: Record<string, X> = {\n  a: { n: { deep: 1 } },\n  'b:c': 2, d: 'x',\n};", 'M');
  if ([...keys].join() !== 'a,b:c,d') throw new Error('chain-status selfTest: objectLiteralKeys reads first-level keys only');
  return 'chain-status self-test PASSED';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) console.log(selfTest());
  else for (const line of chainStatusLines()) console.log(line);
}
