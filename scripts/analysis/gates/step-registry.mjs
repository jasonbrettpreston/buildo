// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29); 122_pipeline_step_optimization.md §4.1, §6
//
// THE ONE derivation shared by the generator (`scripts/analysis/generate-target-files.mjs`),
// `npm run step:registry` and the PreToolUse hook (`scripts/hooks/step-registry-context.mjs`):
// every fact it answers — a step's declared files, its tests, its ledger edges, its data tables,
// its consumer contracts — is READ from an existing registered source, never re-scanned, so a
// generator and a hook cannot disagree about what a step owns.
//
// Three sources, three readers, no fourth: `capture-step-golden.js` owns the file derivation
// (`descriptorPathFor` / `notesPathFor` + the compute-basename rule — the SAME inputs `computeSourceFingerprint`
// hashes, so the registry can never invent a candidate the lockfile does not), `ledger.js` owns
// every edge (`loadLedger` / `stepUpstreams` — never a hand-kept upstream array), and
// `step-archetype-census.json` owns the ownership/archetype/status row. There is deliberately no
// shell guessing (no `stepFileCandidates`) and no new scan of `scripts/` for tables.
//
// Requiring the golden module has no side effects (its `require.main === module` guard keeps the
// capture CLI inert), so this wrapper reuses its exports through `createRequire` rather than
// copying a single line of the derivation it locks. Every returned path is forward-slash and
// repo-relative; existence is always asked of the tree through `path.join(root, rel)`.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repository root — three levels above this file (`scripts/analysis/gates/`). */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const require = createRequire(import.meta.url);
// ONE DERIVATION (Spec 122 §10): the golden harness is imported, never mirrored.
const { descriptorPathFor, notesPathFor } = require('../capture-step-golden.js');
const { loadLedger, stepUpstreams } = require('../../lib/ledger.js');

const MANIFEST_REL_PATH = 'scripts/manifest.json';
const CENSUS_REL_PATH = 'scripts/steps/_schema/step-archetype-census.json';
const CONSUMER_REGISTRY_REL_PATH = 'scripts/steps/_schema/consumer-registry.json';
const MIGRATIONS_REL_DIR = 'migrations';
const STEPS_TEST_DIR = 'src/tests/steps';
const COMPUTE_REL_DIR = 'scripts/lib/compute';

const toPosix = (rel) => String(rel).split(path.sep).join('/');
const readJson = (abs) => JSON.parse(fs.readFileSync(abs, 'utf8'));

/**
 * Every migration in `migrations/`, sorted by filename, as `{ file, text }` with a
 * forward-slash repo-relative `file` — the ONE home of "which migration creates this table".
 * @param {string} root
 * @returns {Array<{file: string, text: string}>}
 */
function readMigrations(root) {
  const dir = path.join(root, MIGRATIONS_REL_DIR);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({
      file: `${MIGRATIONS_REL_DIR}/${name}`,
      text: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

/**
 * Every fact this module derives, loaded ONCE per process: the manifest, the archetype census,
 * the generated consumer registry, the committed cross-step ledger snapshot and the migrations.
 * Nothing here scans `scripts/` for tables or guesses a shell — each field is one registered
 * source's own answer.
 *
 * `env.BUILDO_CONSUMER_REGISTRY_PATH` is a TEST-ONLY override (same shape as `ledger.js`'s
 * `BUILDO_LEDGER_SNAPSHOT_PATH`) resolved against `root`, so a suite can point the registry at a
 * fixture without mutating the committed one.
 *
 * @param {string} [root] repository root; defaults to `REPO_ROOT`
 * @param {{env?: Record<string,string|undefined>}} [opts]
 * @returns {{root: string, env: Record<string,string|undefined>, manifest: object, census: object, consumerRows: object[], ledger: {inchain: object, static: object}, migrations: Array<{file: string, text: string}>}}
 */
export function loadRegistryInputs(root = REPO_ROOT, { env = process.env } = {}) {
  const registryRel = env.BUILDO_CONSUMER_REGISTRY_PATH || CONSUMER_REGISTRY_REL_PATH;
  const registryAbs = path.isAbsolute(registryRel) ? registryRel : path.join(root, registryRel);
  return {
    root,
    env,
    manifest: readJson(path.join(root, MANIFEST_REL_PATH)),
    census: readJson(path.join(root, CENSUS_REL_PATH)),
    consumerRows: readJson(registryAbs).rows || [],
    ledger: loadLedger({ env }),
    migrations: readMigrations(root),
  };
}

/** A row as `registryRows` builds it: one census slug, its file, its declared owner specs. */
const rowSpecs = (ownerSpecs) => (Array.isArray(ownerSpecs) ? ownerSpecs.map(String) : []);

/** The status a census row contributes, per contract §B (first match wins). */
function statusFor(kind, entry) {
  if (kind === 'exemption') return entry.reason;
  if (entry.status === 'converted') return 'converted';
  if (entry.batch === 'pending') return 'pending';
  return 'unconverted';
}

/**
 * The registry rows: every census `entries[]` item plus every `exemptions[]` item that carries an
 * `owner_specs` array, RESTRICTED to the slugs `manifest.chains.sources` actually declares — the
 * registry covers the sources chain and nothing else. Ordered by the slug's index in that chain,
 * with rows outside it (there are none today, but the sort stays total) after, alphabetically.
 *
 * The chain array is the ORDER authority and the SCOPE authority both; the census is only ever
 * asked what it declares about a slug the manifest already owns, so a census row for a step in
 * another chain can never leak a generated block into the sources spec.
 *
 * `archetype` is the census's own declared value for an entry and `null` for an exemption (the
 * exemption classes have no descriptor to pick an archetype from). `status` is `runner_owned` for
 * an exemption (its `reason`), else `converted` / `pending` / `unconverted`.
 *
 * @param {{manifest: object, census: object}} inputs
 * @returns {Array<{slug: string, file: string|null, archetype: string|null, status: string, owner_specs: string[]}>}
 */
export function registryRows(inputs) {
  const manifest = (inputs && inputs.manifest) || {};
  const census = (inputs && inputs.census) || {};
  const chainOrder = Array.isArray(manifest.chains && manifest.chains.sources) ? manifest.chains.sources : [];
  const inChain = new Set(chainOrder);
  const index = new Map(chainOrder.map((slug, i) => [slug, i]));

  const rows = [];
  for (const entry of Array.isArray(census.entries) ? census.entries : []) {
    if (!entry || typeof entry.slug !== 'string' || !inChain.has(entry.slug)) continue;
    rows.push({
      slug: entry.slug,
      file: typeof entry.file === 'string' ? entry.file : null,
      archetype: entry.archetype == null ? null : String(entry.archetype),
      status: statusFor('entry', entry),
      owner_specs: rowSpecs(entry.owner_specs),
    });
  }
  for (const entry of Array.isArray(census.exemptions) ? census.exemptions : []) {
    if (!entry || typeof entry.slug !== 'string' || !Array.isArray(entry.owner_specs)) continue;
    if (!inChain.has(entry.slug)) continue;
    rows.push({
      slug: entry.slug,
      file: typeof entry.file === 'string' ? entry.file : null,
      archetype: null,
      status: statusFor('exemption', entry),
      owner_specs: rowSpecs(entry.owner_specs),
    });
  }

  rows.sort((a, b) => {
    const ai = index.has(a.slug) ? index.get(a.slug) : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.slug) ? index.get(b.slug) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  return rows;
}

/** Every `*.test.ts` under `dir` recursively, forward-slash repo-relative, sorted. Missing dir → `[]`. */
function walkTests(absDir, relDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkTests(path.join(absDir, entry.name), rel, out);
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) out.push(rel);
  }
}

const existsIn = (root, rel) => fs.existsSync(path.join(root, rel));

/**
 * A row's declared files and tests.
 *
 * `files` is EXACTLY `computeSourceFingerprint`'s input list — the step file, its descriptor, its
 * notes sidecar (only when the descriptor exists and declares one) and its compute module — each
 * kept only when it exists under `root`. The registry never invents a candidate the lockfile does
 * not hash, and never guesses a shell (`stepFileCandidates` is deliberately absent).
 *
 * `tests` is every `*.test.ts` under `src/tests/steps/<slug>/`, recursively.
 *
 * @param {{slug: string, file: string|null}} row
 * @param {string} [root]
 * @returns {{files: string[], tests: string[]}}
 */
export function stepFiles(row, root = REPO_ROOT) {
  const files = [];
  const stepRel = row && typeof row.file === 'string' && row.file.length > 0 ? toPosix(row.file) : null;
  if (stepRel) {
    files.push(stepRel);
    const descriptorRel = toPosix(descriptorPathFor(stepRel));
    if (existsIn(root, descriptorRel)) {
      files.push(descriptorRel);
      try {
        const notesRel = notesPathFor(readJson(path.join(root, descriptorRel)), descriptorRel);
        if (typeof notesRel === 'string' && notesRel.length > 0) files.push(toPosix(notesRel));
      } catch {
        // A malformed descriptor contributes no notes path — `computeSourceFingerprint` will throw
        // on it during a capture; the registry simply does not claim a sidecar it cannot name.
      }
    }
    const computeRel = toPosix(path.posix.join(COMPUTE_REL_DIR, path.basename(stepRel)));
    if (existsIn(root, computeRel)) files.push(computeRel);
  }

  const slug = row && typeof row.slug === 'string' ? row.slug : null;
  const tests = [];
  if (slug) {
    const relDir = `${STEPS_TEST_DIR}/${slug}`;
    walkTests(path.join(root, relDir), relDir, tests);
  }
  return { files, tests: tests.sort() };
}

/** The table-key regex contract §B closes the ledger's read/write maps to. */
const TABLE_KEY_RE = /^[a-z_][a-z0-9_]*$/;

/** The first migration whose body creates `table`, else `null` — one home: the migrations dir. */
function migrationFor(table, migrations) {
  const re = new RegExp(
    `^\\s*CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?"?${table}"?\\s*\\(`,
    'im',
  );
  for (const mig of migrations) if (re.test(mig.text)) return mig.file;
  return null;
}

/**
 * The step's data contract, sorted by table: for every key of `ledger.inchain[slug].reads` /
 * `.writes` matching the table-name grammar, `{ table, access, migration }` where `access` is
 * `reads` / `writes` / `reads+writes` and `migration` is the migration whose `CREATE TABLE`
 * statement creates it (else `null`).
 *
 * A slug that is not an `inchain` key has no cross-step data contract at all → `[]`.
 *
 * @param {string} slug
 * @param {{ledger: object, migrations: Array<{file: string, text: string}>}} inputs
 * @returns {Array<{table: string, access: 'reads'|'writes'|'reads+writes', migration: string|null}>}
 */
export function stepData(slug, inputs) {
  const inchain = (inputs && inputs.ledger && inputs.ledger.inchain) || {};
  const entry = inchain[slug];
  if (!entry) return [];
  const migrations = (inputs && inputs.migrations) || [];

  const reads = new Set(Object.keys(entry.reads || {}).filter((t) => TABLE_KEY_RE.test(t)));
  const writes = new Set(Object.keys(entry.writes || {}).filter((t) => TABLE_KEY_RE.test(t)));

  return [...new Set([...reads, ...writes])].sort().map((table) => {
    const access = reads.has(table) && writes.has(table) ? 'reads+writes' : reads.has(table) ? 'reads' : 'writes';
    return { table, access, migration: migrationFor(table, migrations) };
  });
}

/**
 * The per-(X, chain) upstream memo, created lazily on the inputs object under a NON-enumerable
 * property so it never joins a `JSON.stringify` of `inputs` and never collides with a caller key.
 */
function upstreamMemo(inputs) {
  if (Object.prototype.hasOwnProperty.call(inputs, '_upstreamMemo')) return inputs._upstreamMemo;
  const memo = new Map();
  Object.defineProperty(inputs, '_upstreamMemo', { value: memo, enumerable: false, configurable: true });
  return memo;
}

/** `stepUpstreams(X, {chain, env})`, memoised per `X|chain` — the ledger's own answer, asked once. */
function upstreamsOf(inputs, slug, chain) {
  const memo = upstreamMemo(inputs);
  const key = `${slug}|${chain}`;
  if (!memo.has(key)) memo.set(key, stepUpstreams(slug, { chain, env: inputs.env }).slice().sort());
  return memo.get(key);
}

/**
 * The step's cross-step edges, sorted and unique: `upstream` is the union of
 * `stepUpstreams(slug, {chain})` over the slug's own ledger chains; `downstream` is every other
 * `inchain` key X that lists `slug` among its upstreams for one of X's chains.
 *
 * There is no second graph here — both directions are `ledger.js`'s own answer. A slug that is not
 * an `inchain` key has no edges to report → both `[]`.
 *
 * @param {string} slug
 * @param {object} inputs
 * @returns {{upstream: string[], downstream: string[]}}
 */
export function stepEdges(slug, inputs) {
  const inchain = (inputs && inputs.ledger && inputs.ledger.inchain) || {};
  const entry = inchain[slug];
  if (!entry) return { upstream: [], downstream: [] };

  const upstream = new Set();
  for (const chain of entry.chains || []) {
    for (const up of upstreamsOf(inputs, slug, chain)) upstream.add(up);
  }

  const downstream = new Set();
  for (const [other, otherEntry] of Object.entries(inchain)) {
    if (other === slug) continue;
    for (const chain of otherEntry.chains || []) {
      if (upstreamsOf(inputs, other, chain).includes(slug)) {
        downstream.add(other);
        break;
      }
    }
  }
  return { upstream: [...upstream].sort(), downstream: [...downstream].sort() };
}

/**
 * Every declared consumer contract of this producer, sorted and unique, rendered as
 * `<consumer> (<kind> <key>)` over the generated consumer registry's rows.
 *
 * @param {string} slug
 * @param {{consumerRows: object[]}} inputs
 * @returns {string[]}
 */
export function stepConsumers(slug, inputs) {
  const rows = (inputs && inputs.consumerRows) || [];
  const out = new Set();
  for (const row of rows) {
    if (!row || row.producer !== slug) continue;
    out.add(`${row.consumer} (${row.kind} ${row.key})`);
  }
  return [...out].sort();
}

/** The owner spec's leading number — `65_enrich_parcels.md` → `65`; an unnumbered basename as-is. */
function specNumber(spec) {
  const m = path.basename(String(spec)).match(/^\d+[a-z]?/);
  return m ? m[0] : String(spec);
}

/** `a · b · c`, or `none` when the list is empty — never a backtick (see `renderStepEntry`). */
const joinOrNone = (xs) => (xs.length ? xs.join(' · ') : 'none');

/** One `data:` line's item: `` `table` access (migration) ``. */
const dataItem = (row) => `\`${row.table}\` ${row.access} (${row.migration || 'no CREATE migration'})`;

/**
 * The registry entry for ONE row, exactly as contract §B renders it: an LF-only block, two-space
 * sub-bullet indent, ` — ` between the slug and its summary, ` · ` between list items, `none` for
 * an empty list, and a trailing newline.
 *
 * Only FILE paths are backticked (the step file, each test, each data table) — and every one of
 * them comes from `stepFiles`, so the system map's "backticked `scripts/`/`src/` refs are owned
 * files" capture can never be fed a path this entry does not own. The ledger edges and the
 * consumer contracts are prose by design and are NEVER backticked, because they name slugs, not
 * files. A slug outside the ledger snapshot loses the four edge/data lines and gains the single
 * declared-files-only line instead.
 *
 * @param {{slug: string, file: string|null, archetype: string|null, status: string, owner_specs: string[]}} row
 * @param {object} inputs
 * @returns {string} the block, ending in `\n`
 */
export function renderStepEntry(row, inputs) {
  const { files, tests } = stepFiles(row, inputs.root);
  const lines = [];
  const specs = joinOrNone(row.owner_specs.map(specNumber));
  lines.push(`- \`${row.slug}\` — ${row.archetype || 'runner-owned'} · ${row.status} · owner specs: ${specs}`);
  for (const file of files) lines.push(`  - \`${file}\``);
  for (const test of tests) lines.push(`  - \`${test}\``);

  const inchain = (inputs && inputs.ledger && inputs.ledger.inchain) || {};
  if (Object.prototype.hasOwnProperty.call(inchain, row.slug)) {
    const data = stepData(row.slug, inputs).map(dataItem);
    lines.push(`  - data: ${data.length ? data.join('; ') : 'none in the cross-step ledger'}`);
    const { upstream, downstream } = stepEdges(row.slug, inputs);
    lines.push(`  - upstream: ${joinOrNone(upstream)}`);
    lines.push(`  - downstream: ${joinOrNone(downstream)}`);
    lines.push(`  - consumers: ${joinOrNone(stepConsumers(row.slug, inputs))}`);
  } else {
    lines.push('  - edges: not in the cross-step ledger snapshot (declared files only)');
  }
  return `${lines.join('\n')}\n`;
}

/** The one-line provenance banner every generated block opens with (never a markdown heading). */
const GENERATED_NOTE =
  '<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, ' +
  'the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->';

/**
 * The body of the `target-files` generated block for one spec: the provenance banner, then the
 * registry entry of every row that names `specRel` in `owner_specs`, in registry order.
 *
 * Ownership is the census's own `owner_specs` array — the generator never guesses which spec a
 * step belongs to. Always ends in `\n`; no line starts with `#`.
 *
 * @param {string} specRel repo-relative spec path, e.g. `docs/specs/01-pipeline/55_source_parcels.md`
 * @param {object} inputs
 * @returns {string}
 */
export function renderTargetFilesBlock(specRel, inputs) {
  let body = `${GENERATED_NOTE}\n`;
  for (const row of registryRows(inputs)) {
    if (!row.owner_specs.includes(specRel)) continue;
    body += renderStepEntry(row, inputs);
  }
  return body;
}

/**
 * The body of the `chain-members:<chain>` generated block: the same provenance banner (naming
 * `manifest.chains.<chain>`), then one line per slug of that chain — ``- `<slug>` — `<file>` ``
 * or ``- `<slug>` — no file`` when the manifest declares none.
 *
 * The chain membership is `manifest.json`'s own array; it is checked for real with
 * `Object.prototype.hasOwnProperty`, so a chain genuinely absent from the manifest renders as an
 * empty (banner-only) block rather than a silent misread. Always ends in `\n`; no line starts `#`.
 *
 * @param {string} chain chain id, e.g. `sources`
 * @param {{manifest: object}} inputs
 * @returns {string}
 */
export function renderChainMembersBlock(chain, inputs) {
  const manifest = (inputs && inputs.manifest) || {};
  const chains = manifest.chains || {};
  const scripts = manifest.scripts || {};
  const members = Object.prototype.hasOwnProperty.call(chains, chain) && Array.isArray(chains[chain]) ? chains[chain] : [];

  let body = `${GENERATED_NOTE.replace(
    'from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json',
    `from manifest.chains.${chain}`,
  )}\n`;
  for (const slug of members) {
    const file = scripts[slug] && typeof scripts[slug].file === 'string' ? scripts[slug].file : null;
    body += file ? `- \`${slug}\` — \`${file}\`\n` : `- \`${slug}\` — no file\n`;
  }
  return body;
}

/**
 * Every path the registry lets an entry backtick: every row's declared `files` plus its `tests`.
 * The renderer's own lock reads this — an entry that backticks a `scripts/`/`src/` ref outside
 * this set is claiming a file it does not own.
 *
 * @param {object} inputs
 * @returns {Set<string>}
 */
export function derivedPaths(inputs) {
  const out = new Set();
  for (const row of registryRows(inputs)) {
    const { files, tests } = stepFiles(row, inputs.root);
    for (const file of files) out.add(file);
    for (const test of tests) out.add(test);
  }
  return out;
}

/** `/^[A-Za-z]:\//` or a leading `/` — the two absolute-path shapes a hook can be handed. */
const ABSOLUTE_RE = /^(?:[A-Za-z]:\/|\/)/;

/**
 * The path→slug resolver the PreToolUse hook and the generator both use.
 *
 * A registry slug answers itself. Anything else is a path: backslashes are normalised, an absolute
 * path is made repo-relative with `path.relative(inputs.root, input)` (win32 semantics ARE the
 * platform default on Windows, which is the platform whose hooks send absolute paths), a result
 * escaping the repo (`..`) is refused, and what remains must match a row's declared file or test
 * EXACTLY, or live under `src/tests/steps/<slug>/` for exactly one row. No prefix heuristics, no
 * basename guessing.
 *
 * NEVER throws — any error (a non-string, an unreadable registry, anything at all) is `null`, so a
 * hook that cannot resolve a path simply says nothing instead of breaking the tool call.
 *
 * @param {string} input a slug, a repo-relative path, an absolute path, or garbage
 * @param {object} inputs
 * @returns {string|null}
 */
export function resolveStep(input, inputs) {
  try {
    if (typeof input !== 'string' || input.length === 0) return null;
    const rows = registryRows(inputs);
    if (rows.some((row) => row.slug === input)) return input;

    let rel = input.split('\\').join('/');
    if (ABSOLUTE_RE.test(rel)) rel = path.relative(inputs.root, input).split(path.sep).join('/');
    if (rel.length === 0 || rel.startsWith('..')) return null;

    let match = null;
    for (const row of rows) {
      const { files, tests } = stepFiles(row, inputs.root);
      if (files.includes(rel) || tests.includes(rel)) {
        if (match !== null) return null; // two owners for one path is a registry defect, not a guess
        match = row.slug;
      }
    }
    if (match !== null) return match;

    const prefix = `${STEPS_TEST_DIR}/`;
    if (rel.startsWith(prefix)) {
      const slug = rel.slice(prefix.length).split('/')[0];
      return rows.some((row) => row.slug === slug) ? slug : null;
    }
    return null;
  } catch {
    return null;
  }
}
