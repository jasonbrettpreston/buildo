// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-AZ — execution.invocation is the per-chain argv PIN); 122_pipeline_step_optimization.md (step.schema.json execution.invocation)
//
// WF3 2026-10-02 — `scripts/link-parcels.descriptor.json` declares
// `execution.invocation.sources.argv = ["--full"]`, but `scripts/manifest.json`'s `scripts.link_parcels`
// never carried `chain_args`, and `scripts/run-chain.js` passes only `chain_args[chain]`, so FULL was
// unreachable from a chain run. This generator makes the descriptor the ONE source of truth for every
// CONVERTED step's manifest `chain_args` (Spec 124 R-AZ: "a per-chain argv PIN for manifest↔descriptor
// drift"): `--check` is a drift gate (wired into pre-commit by the orchestrator), `--write` regenerates
// the manifest SURGICALLY — exactly the drifted entry lines change, and everything else stays
// byte-identical. Unconverted slugs' hand-written `chain_args` are never touched, and a membership or
// PIPELINE_CHAIN violation (not regenerable) refuses the whole write.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The repository root, derived from this module's own location (`scripts/analysis/`). */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** `scripts/manifest.json`, repo-relative — the ONE file the write half touches. */
const MANIFEST_REL = 'scripts/manifest.json';

/** The schema-adjacent list of CONVERTED step files, repo-relative. */
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

/**
 * `scripts/foo.js` ⇒ `scripts/foo.descriptor.json` — the seam.js rule, applied to a repo-relative
 * converted file. The trailing `.js` alone is stripped: a descriptor is named for its step module.
 * @param {string} file
 * @returns {string}
 */
export function descriptorPathFor(file) {
  return file.replace(/\.js$/, '') + '.descriptor.json';
}

/**
 * The R-AZ derivation: a chain appears in `chain_args` iff the descriptor's `execution.invocation`
 * gives it a NON-EMPTY `argv` array. Entries keep their declared order; a missing `execution`, a
 * missing `invocation`, or no non-empty argv at all ⇒ `null` (no `chain_args` belongs on the entry).
 * @param {object} descriptor
 * @returns {Record<string, string[]>|null}
 */
export function deriveChainArgs(descriptor) {
  const execution =
    descriptor && typeof descriptor === 'object' ? descriptor.execution : undefined;
  if (!execution || typeof execution !== 'object') return null;
  const invocation = /** @type {{invocation?: unknown}} */ (execution).invocation;
  if (!invocation || typeof invocation !== 'object') return null;
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [chain, entry] of Object.entries(
    /** @type {Record<string, unknown>} */ (invocation),
  )) {
    const argv =
      entry && typeof entry === 'object'
        ? /** @type {{argv?: unknown}} */ (entry).argv
        : undefined;
    if (Array.isArray(argv) && argv.length > 0) out[chain] = [...argv];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Every manifest slug whose `file` is exactly `file`, sorted (one converted file may serve several
 * slugs — `scripts/enrich-permits.js` serves `enrich_permits` and `enrich_coa_zoning` today).
 * @param {object} manifest
 * @param {string} file
 * @returns {string[]}
 */
export function slugsForFile(manifest, file) {
  const scripts = /** @type {{scripts?: Record<string, {file?: string|null}>}} */ (manifest).scripts || {};
  return Object.entries(scripts)
    .filter(([, entry]) => entry && entry.file === file)
    .map(([slug]) => slug)
    .sort();
}

/**
 * Compare every converted step against the manifest: argv drift in BOTH directions (per slug, per
 * chain) plus the violations that a write must never paper over (a converted file with no slug, a
 * chain-membership disagreement in either direction, and a `PIPELINE_CHAIN` that run-chain's
 * injected value would not match).
 * @param {{manifest: object, converted: string[], descriptors: Record<string, object>}} input
 * @returns {{drift: Array<{slug: string, chain: string, expected: string[]|null, actual: string[]|null}>, violations: string[]}}
 */
export function findings({ manifest, converted, descriptors }) {
  /** @type {Array<{slug: string, chain: string, expected: string[]|null, actual: string[]|null}>} */
  const drift = [];
  /** @type {string[]} */
  const violations = [];
  const m = /** @type {{chains?: Record<string, string[]>, scripts?: Record<string, {chain_args?: Record<string,string[]>|null, env?: Record<string,string>}>}} */ (
    manifest
  );
  const chains = m.chains || {};
  const scripts = m.scripts || {};

  for (const file of converted) {
    const slugs = slugsForFile(manifest, file);
    if (slugs.length === 0) {
      violations.push(`${file}: converted step file maps to no manifest.scripts slug`);
      continue;
    }
    const descriptor = /** @type {object} */ (descriptors[file]);
    const expectedRaw = deriveChainArgs(descriptor);
    const execution =
      descriptor && typeof descriptor === 'object'
        ? /** @type {{execution?: {invocation?: Record<string, {argv?: unknown, env?: Record<string, string>}>}}} */ (
            descriptor
          ).execution
        : undefined;
    const invocation =
      (execution && typeof execution === 'object' && execution.invocation) || undefined;
    const invChains = invocation ? Object.keys(invocation) : [];

    for (const slug of slugs) {
      const entry = scripts[slug] || {};
      const actual = entry.chain_args || null;
      const memberChains = Object.keys(chains).filter((chain) => (chains[chain] || []).includes(slug));

      const expected = expectedRaw;

      // argv drift: union of both key sets, expected keys in declared order first.
      /** @type {string[]} */
      const union = [];
      for (const chain of Object.keys(expected || {})) union.push(chain);
      for (const chain of Object.keys(actual || {})) {
        if (!union.includes(chain)) union.push(chain);
      }
      for (const chain of union) {
        const e = expected ? expected[chain] ?? null : null;
        const a = actual ? actual[chain] ?? null : null;
        if (JSON.stringify(e) !== JSON.stringify(a)) drift.push({ slug, chain, expected: e, actual: a });
      }

      // membership drift. A chain LIST that names the slug forces the descriptor to pin that very
      // chain — run-chain would otherwise spawn the step with no argv pin at all.
      for (const chain of memberChains) {
        if (!invChains.includes(chain)) {
          violations.push(
            `${slug}: manifest chain "${chain}" contains ${slug} but execution.invocation has no "${chain}" entry`,
          );
        }
      }
      // The other direction: the invocation names a chain that does not contain the slug.
      for (const chain of invChains) {
        if (!memberChains.includes(chain)) {
          violations.push(
            `${slug}: execution.invocation names chain "${chain}", which is not a manifest chain containing ${slug}`,
          );
        }
      }
      for (const chain of invChains) {
        const v = invocation ? invocation[chain]?.env?.PIPELINE_CHAIN : undefined;
        if (v !== undefined && v !== chain) {
          violations.push(
            `${slug}/${chain}: execution.invocation.${chain}.env.PIPELINE_CHAIN is "${v}" — must be absent (run-chain injects it) or "${chain}"`,
          );
        }
      }

      // PIPELINE_CHAIN, manifest side: run-chain spreads scriptEntry.env AFTER the injected value.
      const scriptEnv = entry.env;
      if (scriptEnv && Object.prototype.hasOwnProperty.call(scriptEnv, 'PIPELINE_CHAIN')) {
        const v = scriptEnv.PIPELINE_CHAIN;
        for (const chain of memberChains) {
          if (chain !== v) {
            violations.push(
              `${slug}/${chain}: manifest scripts.${slug}.env.PIPELINE_CHAIN is "${v}" — run-chain spreads scriptEntry.env after the injected PIPELINE_CHAIN, so it would override "${chain}"`,
            );
          }
        }
      }
    }
  }

  return { drift, violations };
}

/**
 * The one-line rendering of a drift pair, as `--check` prints it.
 * @param {{slug: string, chain: string, expected: string[]|null, actual: string[]|null}} d
 * @returns {string}
 */
export function formatDrift(d) {
  return `${d.slug}/${d.chain}: expected ${JSON.stringify(d.expected)} actual ${JSON.stringify(d.actual)}`;
}

/**
 * `{ sources: ["--full"], permits: ["--a","--b"] }` ⇒ `{ "sources": ["--full"], "permits": ["--a", "--b"] }`
 * — the exact inline shape the manifest's neighbouring entries already use.
 * @param {Record<string, string[]>} chainArgs
 * @returns {string}
 */
export function serializeChainArgs(chainArgs) {
  return (
    '{ ' +
    Object.entries(chainArgs)
      .map(([k, v]) => `${JSON.stringify(k)}: [${v.map((s) => JSON.stringify(s)).join(', ')}]`)
      .join(', ') +
    ' }'
  );
}

/** Escape a slug so it can be embedded in a `RegExp` source. @param {string} s @returns {string} */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite exactly the ONE manifest line whose object is `"<slug>": { … }`: insert `chain_args` after
 * `"supports_dry_run"` (or after `"file"`), replace an existing value in place, or — for a `null`
 * derivation — remove the property. Every other line is returned byte-identical, and CRLF endings
 * survive. A missing (or non-one-line) entry throws rather than silently no-op.
 * @param {string} text
 * @param {string} slug
 * @param {Record<string, string[]>|null} chainArgs
 * @returns {string}
 */
// TODO(P2-C2): generalise beyond the hard-coded "chain_args" property to also write step_timeout_minutes — .cursor/wf2_registry_truth_active_task.md fold 8b, item 16.
export function rewriteEntry(text, slug, chainArgs) {
  const lines = text.split('\n');
  const entryRe = new RegExp(`^\\s*"${escapeRegExp(slug)}"\\s*:\\s*\\{`);
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (entryRe.test(line)) matches.push(i);
  }
  if (matches.length !== 1) {
    throw new Error(
      `rewriteEntry: expected exactly one one-line manifest entry for "${slug}", found ${matches.length}`,
    );
  }

  const i = matches[0];
  const raw = lines[i];
  const cr = raw.endsWith('\r');
  const core = cr ? raw.slice(0, -1) : raw;
  const trimmed = core.trim();
  if (!(trimmed.endsWith('}') || trimmed.endsWith('},'))) {
    throw new Error(`rewriteEntry: manifest entry for "${slug}" is not on one line`);
  }

  const chainArgsPropRe = /"chain_args"\s*:\s*\{[^{}]*\}/;
  let next = core;

  if (chainArgsPropRe.test(core)) {
    if (chainArgs === null) {
      // Remove the property outright — with the trailing comma, else the leading one.
      const withTrailing = core.replace(/"chain_args"\s*:\s*\{[^{}]*\},\s*/, '');
      next =
        withTrailing === core
          ? core.replace(/,\s*"chain_args"\s*:\s*\{[^{}]*\}/, '')
          : withTrailing;
    } else {
      next = core.replace(chainArgsPropRe, `"chain_args": ${serializeChainArgs(chainArgs)}`);
    }
  } else if (chainArgs !== null) {
    const serialized = `"chain_args": ${serializeChainArgs(chainArgs)}, `;
    const anchor = /"supports_dry_run"\s*:\s*(?:true|false),\s*/;
    const fileAnchor = /"file"\s*:\s*(?:"[^"]*"|null),\s*/;
    if (anchor.test(core)) {
      next = core.replace(anchor, (match) => match + serialized);
    } else if (fileAnchor.test(core)) {
      next = core.replace(fileAnchor, (match) => match + serialized);
    } else {
      throw new Error(
        `rewriteEntry: manifest entry for "${slug}" has no "supports_dry_run" or "file" anchor to insert "chain_args" after`,
      );
    }
  }

  lines[i] = cr ? `${next}\r` : next;
  return lines.join('\n');
}

/**
 * Key-order-insensitive JSON rendering, so a rewrite that inserts `chain_args` mid-entry compares
 * equal to the intended object. @param {unknown} value @returns {string}
 */
function canonical(value) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

/** @param {unknown} err @returns {string} */
function messageOf(err) {
  return err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
}

/**
 * Read `<root>/scripts/manifest.json` + `converted.json` + every converted descriptor, or throw a
 * message that names the repo-relative path that failed.
 * @param {string} root
 * @returns {{manifest: object, converted: string[], descriptors: Record<string, object>}}
 */
function loadInputs(root) {
  /** @param {string} rel @returns {unknown} */
  const readJson = (rel) => {
    const abs = path.join(root, rel);
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      throw new Error(`generate-chain-args: cannot read ${rel}: ${messageOf(err)}`);
    }
  };

  const manifest = readJson(MANIFEST_REL);
  const convertedFile = /** @type {{converted?: string[]}} */ (readJson(CONVERTED_REL));
  const converted = convertedFile.converted || [];
  /** @type {Record<string, object>} */
  const descriptors = {};
  for (const file of converted) {
    descriptors[file] = /** @type {object} */ (readJson(descriptorPathFor(file)));
  }
  return { manifest, converted, descriptors };
}

/**
 * Check or regenerate the manifest's generated `chain_args`.
 *
 * `check: true` never writes and never throws on drift — it reports it. In write mode a violation
 * (membership, PIPELINE_CHAIN, or an orphaned converted file) writes NOTHING and reports the
 * violations, because none of those are derivable; only genuine argv drift is rewritten, and the
 * surgical result is verified to be exactly the intended edit before it touches the disk.
 * @param {{root?: string, check?: boolean}} [options]
 * @returns {{changed: string[], drift: string[], violations: string[]}}
 */
export function run({ root = REPO_ROOT, check = false } = {}) {
  const { manifest, converted, descriptors } = loadInputs(root);
  const abs = path.join(root, MANIFEST_REL);
  const oldText = fs.readFileSync(abs, 'utf8');

  const found = findings({ manifest, converted, descriptors });

  if (check) {
    return { changed: [], drift: found.drift.map(formatDrift), violations: found.violations };
  }

  // Membership / PIPELINE_CHAIN / orphan violations are not derivable: write NOTHING.
  if (found.violations.length) {
    return { changed: [], drift: found.drift.map(formatDrift), violations: found.violations };
  }

  /** @type {Map<string, Record<string, string[]>|null>} */
  const derivedBySlug = new Map();
  for (const file of converted) {
    for (const slug of slugsForFile(manifest, file)) derivedBySlug.set(slug, deriveChainArgs(descriptors[file]));
  }

  let newText = oldText;
  const rewritten = new Set();
  for (const { slug } of found.drift) {
    if (rewritten.has(slug)) continue;
    rewritten.add(slug);
    newText = rewriteEntry(newText, slug, derivedBySlug.get(slug) ?? null);
  }

  // VERIFY before writing: (1) the parsed result equals the old parse with ONLY the rewritten slugs'
  // chain_args replaced (key order ignored), and (2) the same check now finds zero drift.
  const newParsed = JSON.parse(newText);
  const intended = JSON.parse(oldText);
  for (const slug of rewritten) {
    const derived = derivedBySlug.get(slug) ?? null;
    if (derived === null) delete intended.scripts[slug].chain_args;
    else intended.scripts[slug].chain_args = derived;
  }
  const after = findings({ manifest: newParsed, converted, descriptors });
  if (canonical(newParsed) !== canonical(intended) || after.drift.length > 0 || after.violations.length > 0) {
    throw new Error('generate-chain-args: surgical rewrite verification failed — nothing written');
  }

  if (newText !== oldText) fs.writeFileSync(abs, newText, 'utf8');
  return {
    changed: [...rewritten].map((slug) => `scripts/manifest.json scripts.${slug}.chain_args`),
    drift: [],
    violations: [],
  };
}

/**
 * The CLI. Returns the exit code; NEVER calls `process.exit()`.
 *
 * Flags: `--check` or `--write` (exactly one, else usage + exit 2) and `--root=<dir>`. `changed` goes
 * to stdout; `drift` and `violation` go to stdout AND stderr.
 * @param {string[]} [argv]
 * @param {{stdout?: {write(s: string): unknown}, stderr?: {write(s: string): unknown}}} [streams]
 * @returns {number} 0 ok · 1 drift/violation · 2 usage or thrown error
 */
export function main(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  try {
    const check = argv.includes('--check');
    const write = argv.includes('--write');
    const rootArg = argv.find((arg) => arg.startsWith('--root='));
    const root = rootArg ? path.resolve(rootArg.slice('--root='.length)) : REPO_ROOT;

    if (check === write) {
      stderr.write('usage: generate-chain-args (--check | --write) [--root=<dir>]\n');
      return 2;
    }

    const { changed, drift, violations } = run({ root, check });

    for (const line of changed) stdout.write(`changed ${line}\n`);
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
    stderr.write(`${messageOf(error)}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
