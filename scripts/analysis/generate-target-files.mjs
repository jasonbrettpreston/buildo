// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29); 122_pipeline_step_optimization.md §4.1, §6
//
// The ONE writer of the generated Target Files blocks: `npm run target-files` (write) and the
// `--check` half the fast invariant (#43) and the commit hooks run. It never derives a step fact
// itself — `planBlocks` reads the census owner_specs, the chain lists and `renderStepEntry` through
// `scripts/analysis/gates/step-registry.mjs`, so the specs and `npm run step:registry` can never
// disagree; `helpers` from `scripts/analysis/gates/generated-blocks.mjs` are the ONE marker syntax.
//
// The generator is REFUSING BY DESIGN: a converted/pending census row with no owner_specs, an
// owner/chain spec missing on disk, a body that would smuggle a markdown heading into a section, or
// a body that cannot be placed, each throws (CLI exit 2) before a single byte is written. `--check`
// never writes; a write mode run replaces exactly the blocks it planned and reports what changed.
//
// A path the generator owns is listed ONCE: `oneHomeViolations` fails an owned path hand-listed a
// second time inside a spec's Target Files section (the generated block is its one home).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  TF_ID,
  chainId,
  openMarker,
  closeMarker,
  findBlocks,
  stripGeneratedBlocks,
  replaceBlockBody,
} from './gates/generated-blocks.mjs';
import {
  REPO_ROOT,
  loadRegistryInputs,
  registryRows,
  renderStepEntry,
  renderTargetFilesBlock,
  renderChainMembersBlock,
  derivedPaths,
} from './gates/step-registry.mjs';

/** `docs/specs/01-pipeline/<stem>` — the directory every owner/chain spec lives in. */
const SPEC_DIR_REL = 'docs/specs/01-pipeline';

/** Every spec under here is scanned (drift + one home), except the two basenames below and archive/. */
const SPECS_ROOT_REL = 'docs/specs';

/** The generated map and the spec template are never handed a generated block nor scanned. */
const SKIP_BASENAMES = new Set(['00_system_map.md', '_spec_template.md']);

/** Archived specs are history: they are never rewritten, so they are not held to the one-home rule. */
const ARCHIVE_PREFIX = 'docs/specs/archive/';

/**
 * The unique chain→spec mapping (contract §C): a chain is documented by exactly one
 * `NN_chain_<chain>.md` spec.
 * @type {Record<string, string>}
 */
export const CHAIN_SPECS = {
  permits: `${SPEC_DIR_REL}/41_chain_permits.md`,
  coa: `${SPEC_DIR_REL}/42_chain_coa.md`,
  sources: `${SPEC_DIR_REL}/43_chain_sources.md`,
  deep_scrapes: `${SPEC_DIR_REL}/44_chain_deep_scrapes.md`,
};

/** A markdown heading line — forbidden inside any generated body. */
const HEADING_RE = /^#{1,6} /m;

/** The exact map regex `targetFilesSpan` must use (mirrors `generate-system-map.mjs:58`). */
const TARGET_FILES_SPAN_RE = /### Target Files[\s\S]*?(?=###|## |$)/;

/** Backticked refs of a text fragment: `` `scripts/x.js` `` → `scripts/x.js`. */
const BACKTICK_RE = /`([^`]+)`/g;

/** Normalise a relative spec path to forward slashes (specs are always slug-relative). */
const toPosix = (rel) => String(rel).split(path.sep).join('/');

/**
 * Refuse a body that would introduce a heading of any level: a generated block must never split
 * its enclosing `### Target Files` / `### Chain Members` section.
 * @param {string} id
 * @param {string} body
 * @throws {Error} when `body` carries a heading line or the `'## '` sequence.
 */
function assertNoHeading(id, body) {
  if (typeof body !== 'string' || HEADING_RE.test(body) || body.includes('## ')) {
    throw new Error(`forbidden heading in generated block "${id}"`);
  }
}

/**
 * The generated blocks each spec must carry, keyed by repo-relative spec path and ORDERED
 * deterministically.
 *
 * Every row of `registryRows(inputs)` that declares an owner spec gets a `target-files` block
 * (there, `renderTargetFilesBlock` renders every row who shares that spec); every chain of
 * `CHAIN_SPECS` gets a `chain-members:<chain>` block. Per spec the `target-files` entry is ALWAYS
 * first and the chain entry second — the insertion order `expectedText` relies on.
 *
 * REFUSES (throws) before returning anything: a census row with `status === 'converted'` or
 * `batch === 'pending'` that names no `owner_specs`; a `manifest.chains.sources` slug with no
 * `owner_specs` (a converted chain step must be owned by a spec); an owner/chain spec that is not
 * on disk; a body that carries a heading.
 *
 * @param {object} inputs the `loadRegistryInputs` result
 * @returns {Map<string, Array<{id: string, body: string}>>} keys sorted by spec path
 */
export function planBlocks(inputs) {
  const rows = registryRows(inputs);
  const bySpec = new Map();

  // A converted/pending census entry MUST name its owner spec(s) — the brief's refusal. Asked of
  // the census itself (every chain), not only of the sources-scoped registry rows.
  for (const entry of (inputs.census && inputs.census.entries) || []) {
    const owned = Array.isArray(entry.owner_specs) && entry.owner_specs.length > 0;
    if (!owned && (entry.status === 'converted' || entry.batch === 'pending')) {
      throw new Error(`${entry.slug}: converted/pending census row has no owner_specs`);
    }
  }

  // The chain array is the ownership authority for the sources chain (contract §B): a slug without
  // owner_specs there is a refusal, not silence.
  const chainSlugs = Array.isArray(inputs.manifest.chains && inputs.manifest.chains.sources)
    ? inputs.manifest.chains.sources
    : [];
  const ownedSlug = (slug) => rows.some((row) => row.slug === slug && row.owner_specs.length > 0);

  for (const slug of chainSlugs) {
    if (!ownedSlug(slug)) throw new Error(`${slug}: sources-chain slug has no owner_specs`);
  }

  // `renderTargetFilesBlock(specRel, inputs)` is asked for its own spec: the renderer scans every
  // row whose owner_specs includes specRel, so the block body is spec-complete by construction.
  const assign = (specRel, entry) => {
    const key = toPosix(specRel);
    if (!bySpec.has(key)) bySpec.set(key, []);
    bySpec.get(key).push(entry);
  };

  // One target-files entry per distinct owner spec, filled by the renderer itself.
  const ownerSpecs = new Set();
  for (const row of rows) for (const spec of row.owner_specs) ownerSpecs.add(toPosix(spec));

  for (const specRel of [...ownerSpecs].sort()) {
    assertSpecExists(inputs, specRel);
    const body = renderTargetFilesBlock(specRel, inputs);
    assertNoHeading(TF_ID, body);
    assign(specRel, { id: TF_ID, body });
  }

  for (const [chain, specRel] of Object.entries(CHAIN_SPECS)) {
    assertSpecExists(inputs, specRel);
    const body = renderChainMembersBlock(chain, inputs);
    assertNoHeading(chainId(chain), body);
    assign(specRel, { id: chainId(chain), body });
  }

  // Keys sorted; per-key order is target-files first (assigned above), chain entry second.
  const out = new Map();
  for (const key of [...bySpec.keys()].sort()) {
    const entries = bySpec.get(key);
    const tf = entries.filter((entry) => entry.id === TF_ID);
    const chains = entries.filter((entry) => entry.id !== TF_ID);
    out.set(key, [...tf, ...chains]);
  }
  return out;
}

/** Refuse an owner/chain spec that is not on disk before a byte is planned. */
function assertSpecExists(inputs, specRel) {
  if (!fs.existsSync(path.join(inputs.root, specRel))) {
    throw new Error(`${specRel}: owner spec not found on disk`);
  }
}

/**
 * The LF text a spec SHOULD have: `text` with each planned block present-and-replaced, or, when
 * absent, inserted right after the previously handled block (or, for the first block, right after
 * the `### Target Files` line's `\n`).
 *
 * `findBlocks` runs first so a half-open marker refuses (its error propagates) before anything is
 * attempted. A present block whose start is outside the `### Target Files` span — i.e. it drifted
 * into another section — throws `outside ### Target Files`. Every body is refused if it carries a
 * heading. A spec with no `### Target Files` heading throws.
 *
 * @param {string} text the spec's current text
 * @param {Array<{id: string, body: string}>} blocks the planned blocks, in order
 * @returns {string} the expected text
 */
export function expectedText(text, blocks) {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const found = findBlocks(src); // marker-half refusals propagate

  const span = targetFilesSpan(src);
  if (!span) throw new Error('generated block: no ### Target Files heading in the spec');

  let out = src;
  let anchor = span.insertAt;
  for (const block of blocks) {
    assertNoHeading(block.id, block.body);
    const present = findBlocks(out).find((b) => b.id === block.id);

    if (present) {
      const currentSpan = targetFilesSpan(out);
      if (!currentSpan || present.start < currentSpan.start || present.start > currentSpan.end) {
        throw new Error(`generated block "${block.id}": present outside ### Target Files`);
      }
      out = replaceBlockBody(out, block.id, block.body);
      const after = findBlocks(out).find((b) => b.id === block.id);
      // The next block (if absent) goes on the line AFTER this close marker, never glued to it.
      anchor = out[after.end] === '\n' ? after.end + 1 : after.end;
    } else {
      const insertion = `${openMarker(block.id)}\n${block.body}${closeMarker(block.id)}\n`;
      out = out.slice(0, anchor) + insertion + out.slice(anchor);
      anchor += insertion.length;
    }
  }
  return out;
}

/**
 * The `{ start, end, insertAt }` of the `### Target Files` section, or `null`. `start`/`end` bound
 * the matched region using EXACTLY the map generator's regex
 * (`/### Target Files[\s\S]*?(?=###|## |$)/`); `insertAt` is the index just after that heading's
 * line — where a first block is inserted.
 * @param {string} text
 * @returns {{start: number, end: number, insertAt: number}|null}
 */
export function targetFilesSpan(text) {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const m = TARGET_FILES_SPAN_RE.exec(src);
  if (!m) return null;
  const nl = src.indexOf('\n', m.index);
  const insertAt = nl === -1 ? src.length : nl + 1;
  return { start: m.index, end: m.index + m[0].length, insertAt };
}

/**
 * One-home violations for a spec's Target Files section: every backticked ref in the section of
 * `stripGeneratedBlocks(text)` that the generator owns — it is in `derived`, or it lives under
 * `src/tests/steps/<slug>/` for one of `slugs` — is a SECOND home and must be removed from the
 * hand-written prose.
 * @param {string} specRel
 * @param {string} text the spec's text (expected or actual)
 * @param {Set<string>} derived the generator's owned paths (`derivedPaths`)
 * @param {string[]} slugs the registry's slugs
 * @returns {string[]}
 */
export function oneHomeViolations(specRel, text, derived, slugs) {
  const stripped = stripGeneratedBlocks(text);
  const span = targetFilesSpan(stripped);
  if (!span) return [];
  const section = stripped.slice(span.start, span.end);
  const prefix = 'src/tests/steps/';

  const out = [];
  for (const m of section.matchAll(BACKTICK_RE)) {
    const ref = m[1];
    const ownedBySlug = ref.startsWith(prefix) && slugs.includes(ref.slice(prefix.length).split('/')[0]);
    if (derived.has(ref) || ownedBySlug) {
      out.push(`${specRel}: ${ref} — generated; remove it from the hand-written Target Files (one home)`);
    }
  }
  return out;
}

/** Every `*.md` under `dir` recursively, forward-slash repo-relative, sorted. */
function walkSpecs(absDir, relDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkSpecs(path.join(absDir, entry.name), rel, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(rel);
  }
}

/**
 * Run the generator for the whole tree.
 *
 * Loads the registry inputs, plans the blocks, and walks every spec. A planned spec whose expected
 * text differs from disk is STALE: `--check` records it in `drift`, write mode `writeFileSync`s the
 * expected text (LF) and records it in `changed`. An UNPLANNED spec that nonetheless carries a
 * `target-files` or `chain-members:*` block is also drift (it does not own what it holds). Finally
 * the one-home rule is checked against every spec's expected-or-actual text.
 *
 * @param {{root?: string, check?: boolean, env?: Record<string,string|undefined>}} [opts]
 * @returns {{changed: string[], drift: string[], violations: string[]}}
 */
export function run({ root = REPO_ROOT, check = false, env = process.env } = {}) {
  const inputs = loadRegistryInputs(root, { env });
  const plan = planBlocks(inputs);
  const derived = derivedPaths(inputs);
  const slugs = registryRows(inputs).map((row) => row.slug);

  const specs = [];
  walkSpecs(path.join(root, SPECS_ROOT_REL), SPECS_ROOT_REL, specs);
  specs.sort();

  const changed = [];
  const drift = [];
  const violations = [];

  for (const specRel of specs) {
    if (SKIP_BASENAMES.has(path.posix.basename(specRel)) || specRel.startsWith(ARCHIVE_PREFIX)) continue;
    const abs = path.join(root, specRel);
    const raw = fs.readFileSync(abs, 'utf8');
    // Compare LF-normalised (a CRLF checkout is never drift), but write back in the file's own
    // line-ending style: a handful of specs are committed CRLF, and re-ending every line of them
    // would bury the one block that changed.
    const crlf = raw.includes('\r\n');
    const actual = raw.replace(/\r\n/g, '\n');
    const blocks = plan.get(specRel);

    let finalText = actual;
    if (blocks) {
      finalText = expectedText(actual, blocks);
      if (finalText !== actual) {
        if (check) {
          drift.push(`${specRel} is STALE — run npm run target-files`);
        } else {
          fs.writeFileSync(abs, crlf ? finalText.replace(/\n/g, '\r\n') : finalText, 'utf8');
          changed.push(specRel);
        }
      }
    } else {
      const carries = findBlocks(actual).some(
        (b) => b.id === TF_ID || b.id.startsWith('chain-members:'),
      );
      if (carries) drift.push(`${specRel} carries a generated block it does not own`);
    }

    for (const violation of oneHomeViolations(specRel, finalText, derived, slugs)) {
      violations.push(violation);
    }
  }

  return { changed, drift, violations };
}

/** A minimal marker-less spec used by `selfTest` — never touches the tree. */
const SELF_TEST_SPEC = '# t\n### Target Files\n- `scripts/other.js`\n### Out-of-Scope Files\n';

/**
 * In-memory proof that insertion, idempotency, the marker-half refusal, the heading refusal and the
 * one-home rule behave as the lock expects — no filesystem, no registry.
 * @returns {{passed: number, total: number, failures: string[]}}
 */
export function selfTest() {
  const failures = [];
  let passed = 0;
  const check = (name, fn) => {
    try {
      fn();
      passed++;
    } catch (error) {
      failures.push(`${name}: ${error && error.message ? error.message : String(error)}`);
    }
  };

  const blocks = [{ id: TF_ID, body: '- a\n' }];

  check('insertion into a marker-less spec', () => {
    const once = expectedText(SELF_TEST_SPEC, blocks);
    if (!once.includes(`### Target Files\n${openMarker(TF_ID)}\n- a\n${closeMarker(TF_ID)}\n- `)) {
      throw new Error('block was not bracketed by the markers right after the heading');
    }
  });
  check('idempotency — expectedText twice', () => {
    const once = expectedText(SELF_TEST_SPEC, blocks);
    if (expectedText(once, blocks) !== once) throw new Error('regeneration was not a no-op');
  });
  check('two blocks: the second goes on its own line after the first, idempotent', () => {
    const two = [...blocks, { id: chainId('x'), body: '- m\n' }];
    const withFirst = expectedText(SELF_TEST_SPEC, blocks);
    const once = expectedText(withFirst, two);
    if (!once.includes(`${closeMarker(TF_ID)}\n${openMarker(chainId('x'))}\n- m\n${closeMarker(chainId('x'))}\n- `)) {
      throw new Error('the second block was not placed on the line after the first');
    }
    if (expectedText(once, two) !== once || expectedText(SELF_TEST_SPEC, two) !== once) {
      throw new Error('two-block regeneration was not a no-op');
    }
  });
  check('marker-half throws', () => {
    let threw = false;
    try {
      expectedText(`### Target Files\n${openMarker(TF_ID)}\n- x\n`, [{ id: TF_ID, body: '' }]);
    } catch (error) {
      threw = /without a close/.test(error.message);
    }
    if (!threw) throw new Error('an unclosed marker did not throw');
  });
  check('### body throws', () => {
    let threw = false;
    try {
      expectedText('### Target Files\n- x\n', [{ id: TF_ID, body: '### bad\n' }]);
    } catch (error) {
      threw = /forbidden heading/.test(error.message);
    }
    if (!threw) throw new Error('a heading body did not throw');
  });
  check('oneHomeViolations — outside found, inside ignored', () => {
    const derived = new Set(['scripts/load-parcels.js']);
    const violations = oneHomeViolations(
      's.md',
      `### Target Files\n${openMarker(TF_ID)}\n- \`scripts/load-parcels.js\`\n${closeMarker(TF_ID)}\n- \`scripts/load-parcels.js\` — hand\n- \`src/tests/steps/parcels/**\`\n### Next\n`,
      derived,
      ['parcels'],
    );
    if (violations.length !== 2) throw new Error(`expected 2 violations, got ${violations.length}`);
  });

  return { passed, total: passed + failures.length, failures };
}

/**
 * The CLI. Returns the exit code; NEVER calls `process.exit()`.
 *
 * Flags: none = write; `--check`; `--self-test`; `--print=<slug>` (stdout is exactly
 * `renderStepEntry` of that registry row, no extra newline; an unknown slug throws). `changed`,
 * `drift` and `violations` lines go to stdout (drift/violations also to stderr).
 * @param {string[]} [argv]
 * @param {{stdout?: {write(s: string): unknown}, stderr?: {write(s: string): unknown}}} [streams]
 * @returns {number} 0 ok · 1 drift/violation/self-test failure · 2 thrown error
 */
export function main(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  try {
    const check = argv.includes('--check');
    const selfTestFlag = argv.includes('--self-test');
    const print = argv.find((arg) => arg.startsWith('--print='));

    if (print) {
      const slug = print.slice('--print='.length);
      const inputs = loadRegistryInputs(REPO_ROOT);
      const row = registryRows(inputs).find((candidate) => candidate.slug === slug);
      if (!row) throw new Error(`unknown slug: ${slug}`);
      stdout.write(renderStepEntry(row, inputs));
      return 0;
    }

    if (selfTestFlag) {
      const result = selfTest();
      const lines = [`self-test: ${result.passed}/${result.total} ${result.failures.length ? 'FAIL' : 'PASS'}`];
      for (const failure of result.failures) lines.push(failure);
      stdout.write(`${lines.join('\n')}\n`);
      return result.failures.length ? 1 : 0;
    }

    const { changed, drift, violations } = run({ check });
    for (const spec of changed) stdout.write(`changed ${spec}\n`);
    for (const line of drift) {
      stdout.write(`drift ${line}\n`);
      stderr.write(`drift ${line}\n`);
    }
    for (const line of violations) {
      stdout.write(`violation ${line}\n`);
      stderr.write(`violation ${line}\n`);
    }
    if (drift.length || violations.length) return 1;
    return 0;
  } catch (error) {
    stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
