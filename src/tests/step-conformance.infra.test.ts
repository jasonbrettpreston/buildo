// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (Condition 2 — the conformance suite)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (Condition 1 — the A2 shape rule)
// SPEC LINK: docs/specs/01-pipeline/121_*.md §12b.6 (a checker that never fires proves nothing)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6 (tier 3 — descriptor <-> ledger cross-check, LDG-4)
//
// ⚠️ ZERO STEPS ARE CONVERTED TODAY, AND THIS SUITE MUST NOT READ AS GREEN FOR IT.
//
// §5.2 specifies "one test file iterating manifest.chains[*].file". Every one of
// those files is an unconverted island today, so iterating it now would be a wall
// of permanent failures (the count is asserted below, not hardcoded here). The
// enforcement scope is instead the committed scripts/steps/_schema/converted.json
// list, which each C1 pilot appends to — and an empty list makes the per-step loop
// produce ZERO tests, which is the classic vacuous pass.
//
// Four things stop that, and they are the reason this file is longer than its
// per-step battery:
//
//   1. LIST-VALIDITY runs unconditionally — the list parses, has no duplicates,
//      and every entry is a real manifest step file. A typo'd path would
//      otherwise silently narrow the blocking scope to nothing.
//   2. THE FLEET ASSERTION runs unconditionally — loaded.length === the list
//      length (the silent-import-death guard, §5.2's NEW claim: under islands a
//      step whose module throws at import becomes unloadable and drops out of
//      every generated artifact rather than erroring). It ARMS toward the full
//      manifest count as pilots land, and the distance is asserted and printed.
//   3. THE PROVE-RED runs unconditionally — every manifest step file NOT in the
//      list must actually FAIL the shape rule. If a file ever comes back clean,
//      either its conversion landed and nobody added it to the list, or the rule
//      stopped firing. Both are findings.
//   4. THE CANARIES run unconditionally — the whole per-step battery is executed
//      against committed fixtures, green on the frozen shape and red on each
//      known-bad one. This is what proves the battery WORKS while the real loop
//      is empty.
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { stripComments } from './script-source-scan';

const REPO_ROOT = path.resolve(__dirname, '../../');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const SHAPE_DRIVER = path.join(REPO_ROOT, 'scripts/hooks/check-step-shape.mjs');
const ADVISORY_LOCK_TEST = path.join(REPO_ROOT, 'src/tests/pipeline-advisory-lock.infra.test.ts');
const SHAPE_FIXTURES = 'scripts/steps/_schema/fixtures/shape';

// ONE compiler (S2, 2026-08-24): compileStepSchema is what `pipeline.step()`
// itself validates with, so this suite and production cannot drift into two
// different AJV configurations. Same require as step-schema.logic.test.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { compileStepSchema, SCHEMA_PATH } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
const validateDescriptor = compileStepSchema() as ((d: unknown) => boolean) & {
  errors?: Array<{ instancePath?: string; message?: string }> | null;
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface Manifest {
  scripts: Record<string, { file: string | null }>;
  chains: Record<string, string[]>;
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

/** Every distinct .js step file reachable from manifest.chains — the §5.2 corpus. */
function manifestStepFiles(chainId?: string): string[] {
  const chains = chainId ? { [chainId]: manifest.chains[chainId] ?? [] } : manifest.chains;
  const files = new Set<string>();
  for (const slugs of Object.values(chains)) {
    for (const slug of slugs) {
      const file = manifest.scripts[slug]?.file;
      if (typeof file === 'string' && file.endsWith('.js')) files.add(file);
    }
  }
  return [...files];
}

const ALL_STEP_FILES = manifestStepFiles();
const SOURCES_STEP_FILES = manifestStepFiles('sources');

const convertedRaw = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8')) as { converted?: unknown; pending?: unknown };
const CONVERTED: string[] = Array.isArray(convertedRaw.converted)
  ? (convertedRaw.converted as unknown[]).map((f) => String(f).replace(/\\/g, '/'))
  : [];

/**
 * `pending` (Spec 123 §3.1 pin-then-add ordering; R-K.1, 2026-08-29): a file staged
 * out of the "must violate the shape rule" corpus ahead of its cutover commit.
 * Declared data, not a code skip — "nothing hidden" (Spec 122/123 policy) means the
 * stage gap is named in the fixture the tests read, not silently exempted in test
 * logic. Each entry is `{file, registers_at, reason, declared, stage}` — all
 * strings, `stage` closed-vocabulary `"red_suite" | "shape_clean"` (R-K.1): a
 * `red_suite` entry's per-step `violations.test.ts` (with `it.fails()` call sites)
 * has landed but the sibling `<slug>.descriptor.json` does NOT exist yet — the file
 * MAY still be shape-dirty; a `shape_clean` entry's descriptor exists and the file
 * genuinely passes `conformanceFindings()`. R-K.1's own worked example: pilot 6
 * (`compute_centroids`) declares `red_suite` at ITS commit 6 (the red-suite landing
 * commit, not commit 7 as pilots 4/5 did before `step-validate.mjs`'s fast
 * invariant #5 existed — that invariant requires every `it.fails(` call site to sit
 * under a DECLARED pending slug, of either stage, so the declaration must be
 * contemporaneous with the red suite, not deferred past it).
 */
interface PendingEntry {
  file: string;
  registers_at: string;
  reason: string;
  declared: string;
  stage: 'red_suite' | 'shape_clean';
}
const PENDING_STAGES = ['red_suite', 'shape_clean'] as const;
const PENDING_RAW: unknown[] = Array.isArray(convertedRaw.pending) ? (convertedRaw.pending as unknown[]) : [];
const PENDING: PendingEntry[] = PENDING_RAW as PendingEntry[];
const PENDING_FILES: string[] = PENDING.map((p) => String(p?.file ?? '').replace(/\\/g, '/'));

/**
 * The Bundle-G lock registry, parsed out of its owning test file.
 *
 * ⚠️ Parsed, not imported: importing a *.test.ts registers ITS describes into
 * THIS file, so the advisory-lock suite would run twice with duplicate names. The
 * parse is anchored by a sentinel assertion below — a regex that quietly matched
 * nothing would turn every lock check into a vacuous skip, which is the exact
 * failure class this suite exists to prevent.
 */
function readLockRegistry(): Record<string, number> {
  const src = fs.readFileSync(ADVISORY_LOCK_TEST, 'utf8');
  const block = /const LOCK_ID_REGISTRY: Record<string, number> = \{([\s\S]*?)\n\};/.exec(src);
  if (!block) throw new Error('LOCK_ID_REGISTRY block not found in pipeline-advisory-lock.infra.test.ts');
  const out: Record<string, number> = {};
  for (const m of block[1]!.matchAll(/'([^']+)':\s*(\d+)/g)) out[m[1]!] = Number(m[2]);
  return out;
}
const LOCK_ID_REGISTRY = readLockRegistry();

// ---------------------------------------------------------------------------
// The per-step battery — ONE function, used by the converted loop AND the canaries
// ---------------------------------------------------------------------------

interface ProbeResult {
  pools: number;
  clients: number;
  pg_load_error: string | null;
  require_error: string | null;
  has_descriptor: boolean;
  compute_type: string;
  identity_name: string | null;
  identity_lock: number | null;
  checks_length: number | null;
}

function probe(relFile: string): ProbeResult {
  const raw = execFileSync('node', [PROBE, relFile], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return JSON.parse(raw) as ProbeResult;
}

/** Files a step is allowed to have as `<basename>.*` siblings (Spec 122 §4.1). */
const ALLOWED_SIBLING_SUFFIXES = ['.js', '.descriptor.json', '.notes.json'];

/**
 * Every §5.2 assertion for one step file, as a list of human-readable findings.
 * Empty array = conformant. Returning findings rather than throwing lets the
 * canary tests assert WHICH assertion fired, not merely that something did.
 */
function conformanceFindings(
  relFile: string,
  opts: { registry?: Record<string, number>; expectSlug?: string | undefined } = {},
): string[] {
  const findings: string[] = [];
  const abs = path.join(REPO_ROOT, relFile);
  const dir = path.dirname(abs);
  const base = path.basename(relFile, '.js');
  const registry = opts.registry ?? LOCK_ID_REGISTRY;

  // (#2, #31) exactly one sibling descriptor, and no unknown `<slug>.*` file.
  const descriptorRel = `${relFile.slice(0, -3)}.descriptor.json`;
  if (!fs.existsSync(path.join(REPO_ROOT, descriptorRel))) {
    findings.push(`missing sibling descriptor ${descriptorRel}`);
    return findings; // nothing below is evaluable without it
  }
  const strays = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${base}.`))
    .filter((f) => !ALLOWED_SIBLING_SUFFIXES.some((s) => f === `${base}${s}`));
  if (strays.length > 0) findings.push(`unknown <slug>.* siblings: ${strays.join(', ')}`);

  // (#3-#20) the descriptor validates against the canonical schema.
  const descriptor = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, descriptorRel), 'utf8')) as {
    identity?: { name?: string; lock?: number };
    checks?: unknown[];
  };
  if (!validateDescriptor(descriptor)) {
    const errs = (validateDescriptor.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`);
    findings.push(`descriptor fails step.schema.json — ${errs.join('; ')}`);
  }

  // (#126) `checks` is the one category that may never be empty.
  if (!Array.isArray(descriptor.checks) || descriptor.checks.length === 0) {
    findings.push('descriptor.checks is empty — checks may never be "none" (claim #7/#126)');
  }

  // (#86) requiring the file opens no pool — and throws nothing.
  const p = probe(relFile);
  if (p.pg_load_error) findings.push(`probe could not load pg: ${p.pg_load_error}`);
  if (p.require_error) findings.push(`require() threw: ${p.require_error}`);
  if (p.pools !== 0) findings.push(`require() constructed ${p.pools} pg.Pool(s) — pipeline.step() is a factory (claim #86)`);
  if (p.clients !== 0) findings.push(`require() constructed ${p.clients} pg.Client(s) (claim #86)`);

  // (#163 / SH3′) named exports descriptor + compute, compute is callable.
  if (!p.has_descriptor) findings.push('module.exports.descriptor is missing (claim #163)');
  if (p.compute_type !== 'function') {
    findings.push(`module.exports.compute is ${p.compute_type}, expected function (claim #163)`);
  }

  // (§5.4) the textual constant stays, and it agrees with identity.lock...
  const source = fs.readFileSync(abs, 'utf8');
  const textual = /const ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(source);
  if (!textual) {
    findings.push('no textual `const ADVISORY_LOCK_ID = <number>` — §5.4 keeps three source-text loops green');
  } else if (descriptor.identity?.lock !== Number(textual[1])) {
    findings.push(
      `identity.lock ${descriptor.identity?.lock} disagrees with the textual ADVISORY_LOCK_ID ${textual[1]}`,
    );
  }

  // ...and with the Bundle-G registry (#9).
  const registered = registry[relFile];
  if (registered === undefined) {
    findings.push(`${relFile} has no LOCK_ID_REGISTRY entry (Spec 47 §A.5)`);
  } else if (registered !== descriptor.identity?.lock) {
    findings.push(`identity.lock ${descriptor.identity?.lock} disagrees with LOCK_ID_REGISTRY ${registered}`);
  }

  if (opts.expectSlug && p.identity_name !== opts.expectSlug) {
    findings.push(`identity.name "${p.identity_name}" is not the manifest slug "${opts.expectSlug}"`);
  }

  return findings;
}

/** slug for a manifest step file (first slug that points at it). */
function slugFor(relFile: string): string | undefined {
  return Object.entries(manifest.scripts).find(([, e]) => e.file === relFile)?.[0];
}

// ---------------------------------------------------------------------------
// 1. List validity — runs whether or not anything is converted
// ---------------------------------------------------------------------------

describe('converted.json — the A2/§5.2 enforcement scope', () => {
  it('parses and declares a `converted` array', () => {
    const raw = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8')) as Record<string, unknown>;
    expect(Array.isArray(raw.converted), 'converted.json must declare an array — a missing scope is a dead gate').toBe(true);
    expect(raw.contract_version).toBe(1);
  });

  it('has no duplicate entries', () => {
    expect(new Set(CONVERTED).size).toBe(CONVERTED.length);
  });

  it('every entry is a real manifest step file (converted ⊆ manifest)', () => {
    const strays = CONVERTED.filter((f) => !ALL_STEP_FILES.includes(f));
    expect(strays, 'a path not in manifest.chains silently narrows the blocking scope to nothing').toEqual([]);
  });

  it('every entry exists on disk', () => {
    const missing = CONVERTED.filter((f) => !fs.existsSync(path.join(REPO_ROOT, f)));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1b. `pending` — the declared stage-gap (Spec 123 §3.1 pin-then-add ordering)
// ---------------------------------------------------------------------------

describe('converted.json — `pending` (declared data, not a code skip)', () => {
  const REQUIRED_KEYS = ['file', 'registers_at', 'reason', 'declared', 'stage'] as const;

  it('every pending entry is well-formed: exactly the 5 required string keys, no extras, `stage` is closed-vocabulary (R-K.1)', () => {
    for (const raw of PENDING_RAW) {
      const entry = raw as Record<string, unknown>;
      const keys = Object.keys(entry).sort();
      expect(keys, `pending entry ${JSON.stringify(raw)} has an unexpected key set`).toEqual([...REQUIRED_KEYS].sort());
      for (const k of REQUIRED_KEYS) {
        expect(typeof entry[k], `pending entry ${JSON.stringify(raw)}.${k} must be a non-empty string`).toBe('string');
        expect((entry[k] as string).length, `pending entry ${JSON.stringify(raw)}.${k} is empty`).toBeGreaterThan(0);
      }
      expect(
        PENDING_STAGES as readonly string[],
        `pending entry ${entry.file}.stage "${String(entry.stage)}" is not in the closed vocabulary (red_suite | shape_clean)`,
      ).toContain(entry.stage);
    }
  });

  it('pending entries and converted are mutually exclusive (a file cannot be both staged and registered)', () => {
    const overlap = PENDING_FILES.filter((f) => CONVERTED.includes(f));
    expect(overlap, 'a file in both `pending` and `converted` is either a stale pending entry or a double-registration').toEqual([]);
  });

  it('a `red_suite` pending file has NOT yet landed its sibling descriptor — a descriptor appearing while stage stays "red_suite" is a stale, un-advanced stage (R-K.1)', () => {
    for (const p of PENDING) {
      if (p.stage !== 'red_suite') continue;
      expect(CONVERTED, `pending file ${p.file} is already in converted.json — the pending entry is stale and must be deleted`).not.toContain(p.file);
      const descriptorRel = `${p.file.slice(0, -3)}.descriptor.json`;
      expect(
        fs.existsSync(path.join(REPO_ROOT, descriptorRel)),
        `pending file ${p.file} is stage "red_suite" but its descriptor ${descriptorRel} already exists — ` +
          'the stage must advance to "shape_clean" in the same commit that lands the descriptor (R-K.1); ' +
          '"stage not advanced" is itself a defect this lock exists to catch',
      ).toBe(false);
    }
  });

  it('a `shape_clean` pending file is genuinely shape-clean AND not yet registered (a dirty or already-registered pending entry is a stale declaration)', () => {
    for (const p of PENDING) {
      if (p.stage !== 'shape_clean') continue;
      expect(CONVERTED, `pending file ${p.file} is already in converted.json — the pending entry is stale and must be deleted`).not.toContain(p.file);
      const findings = conformanceFindings(p.file);
      expect(findings, `pending file ${p.file} is declared shape-clean but conformanceFindings() disagrees (stale pending entry)`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The fleet assertion — §5.2's NEW claim (silent import death)
// ---------------------------------------------------------------------------

describe('the fleet assertion — loaded.length === scope length (silent-import-death guard)', () => {
  it('every converted step LOADS; none silently drops out', () => {
    // Under Spec 120 a step.json that fails to parse fails loudly. Under islands
    // a step whose MODULE throws at import becomes unloadable and disappears from
    // every generated artifact instead of erroring. So the count is the assertion.
    const loaded = CONVERTED.filter((f) => {
      const p = probe(f);
      return p.require_error === null && p.has_descriptor && p.compute_type === 'function';
    });
    expect(loaded.length, `loaded ${loaded.length} of ${CONVERTED.length} converted step files`).toBe(CONVERTED.length);
  });

  it('records how far the scope is from the full manifest corpus (arms as pilots land)', () => {
    // NOT `toBe(ALL_STEP_FILES.length)` yet — that equality is the C5/C6 exit
    // criterion, and asserting it today would be a permanently red test rather
    // than a guard. What IS asserted: the scope never exceeds the corpus, and the
    // remaining distance is printed so it cannot quietly stop shrinking.
    expect(CONVERTED.length).toBeLessThanOrEqual(ALL_STEP_FILES.length);
    const remaining = ALL_STEP_FILES.length - CONVERTED.length;
    expect(
      remaining,
      `${CONVERTED.length}/${ALL_STEP_FILES.length} manifest step files converted; ${remaining} remain. ` +
        'When this reaches 0, replace this test with loaded.length === ALL_STEP_FILES.length.',
    ).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 3. The prove-red — the rule FIRES on everything not yet converted
// ---------------------------------------------------------------------------

describe('prove-red — the shape rule fires on the unconverted corpus', () => {
  const report = JSON.parse(
    execFileSync('node', [SHAPE_DRIVER, '--json'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 }),
  ) as {
    converted: string[];
    blocking: Array<{ file: string; violations: Array<{ rule: string; line: number }> }>;
    report_only: Array<{ file: string; violations: Array<{ rule: string; line: number }> }>;
  };

  it('the driver agrees with this file about the enforcement scope', () => {
    expect(report.converted).toEqual(CONVERTED);
  });

  it('every unconverted manifest step file violates the frozen shape, except a DECLARED pending file (converted.json.pending)', () => {
    // `pending` is declared data (Spec 122/123 "nothing hidden" — the exception is
    // declared data, not a code skip): a file that already landed the frozen shape
    // but registers in `converted` only at its cutover commit. It is carved out of
    // the "must violate" corpus here, and pinned shape-clean-and-unregistered by
    // the `pending` describe block above — so this exclusion cannot silently widen.
    const clean = report.report_only.filter((f) => f.violations.length === 0 && !PENDING_FILES.includes(f.file)).map((f) => f.file);
    expect(
      clean,
      'a shape-clean file outside converted.json AND outside pending means either a landed conversion nobody ' +
        'registered, or a rule that stopped firing. Both are findings.',
    ).toEqual([]);
  });

  it('every UNCONVERTED sources-chain step file is among them, and every one still calls pipeline.run() (27 minus converted.json, minus declared pending)', () => {
    // The sources chain is the C-track corpus. `reconcile` (A3) is a 28th entry
    // in the chain but is deliberately NOT a pipeline.step() file — it is the
    // Step-0 reaper, written to the Spec 47 skeleton — so the count below is
    // asserted against the chain minus that head step.
    const convertedSet = new Set((convertedRaw.converted ?? []) as string[]);
    const pendingSet = new Set(PENDING_FILES);
    const conversionCorpus = SOURCES_STEP_FILES.filter(
      (f) => f !== 'scripts/reconcile-runs.js' && !convertedSet.has(f) && !pendingSet.has(f),
    );
    // 27 = the C-track corpus; each landed pilot removes exactly one (Spec 122 §5.2 — the prove-red is
    // over files NOT in converted.json), and each declared-pending file is staged out ahead of its cutover.
    const pendingInScope = SOURCES_STEP_FILES.filter((f) => pendingSet.has(f) && !convertedSet.has(f)).length;
    expect(conversionCorpus).toHaveLength(27 - convertedSet.size - pendingInScope);
    const byFile = new Map(report.report_only.map((f) => [f.file, f.violations]));
    for (const f of conversionCorpus) {
      const violations = byFile.get(f) ?? [];
      expect(violations.length, `${f} produced no shape violations`).toBeGreaterThan(0);
      expect(
        violations.some((v) => v.rule === 'step-no-pipeline-run'),
        `${f} does not call pipeline.run() — has it already been converted?`,
      ).toBe(true);
    }
  });

  it('nothing in the blocking scope violates the shape', () => {
    const bad = report.blocking.filter((f) => f.violations.length > 0);
    expect(bad.map((f) => `${f.file}: ${f.violations.map((v) => `${v.rule}@${v.line}`).join(',')}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. The canaries — the battery is proven in BOTH directions while the loop is empty
// ---------------------------------------------------------------------------

describe('the per-step battery is armed (canary fixtures, Spec 121 §12b.6)', () => {
  const GOOD = `${SHAPE_FIXTURES}/good-frozen-shape.js`;

  it('every shape fixture descriptor is byte-identical to the committed assert_schema exemplar', () => {
    // Two copies of a descriptor is two contracts. Pinning them equal means the
    // canaries can never drift into passing against a schema the real exemplar
    // fails — and, more importantly, it makes each bad fixture differ from the
    // good one by EXACTLY ONE thing: the shape of its .js file. A finding then
    // names the rule, not a fixture typo.
    const exemplar = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/steps/_schema/fixtures/valid/assert_schema.descriptor.json'),
      'utf8',
    );
    const dir = path.join(REPO_ROOT, SHAPE_FIXTURES);
    const descriptors = fs.readdirSync(dir).filter((f) => f.endsWith('.descriptor.json'));
    expect(descriptors.length).toBeGreaterThanOrEqual(4);
    for (const d of descriptors) {
      expect(fs.readFileSync(path.join(dir, d), 'utf8'), `${d} has drifted from the exemplar`).toBe(exemplar);
    }
  });

  it('GREEN — the frozen shape passes every §5.2 assertion', () => {
    // The fixture is not in LOCK_ID_REGISTRY (it is not a manifest step), so the
    // registry is supplied rather than skipped: the assertion still EXECUTES.
    const findings = conformanceFindings(GOOD, {
      registry: { [GOOD]: 102 },
      expectSlug: 'assert_schema',
    });
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('GREEN — and the shape rule is silent on it', () => {
    const out = runShapeRule([GOOD]);
    expect(out).toEqual([]);
  });

  it('RED — a top-level env assertion is caught by the require probe AND the shape rule', () => {
    const file = `${SHAPE_FIXTURES}/bad-extra-executable.js`;
    const findings = conformanceFindings(file, { registry: { [file]: 102 } });
    expect(findings.some((f) => f.includes('require() threw'))).toBe(true);
    expect(runShapeRule([file]).some((v) => v.rule === 'step-shape')).toBe(true);
  });

  it('RED — a spread descriptor is caught by the shape rule and by NOTHING ELSE', () => {
    // ⚠️ THE MEASUREMENT THAT JUSTIFIES A2's EXISTENCE. bad-spread-descriptor.js
    // passes the whole runtime battery: it opens no pool, exports a descriptor and
    // a compute, and its re-exported `descriptor` still reads lock 102 — while what
    // actually RAN was a forked object with lock 999. The on-disk JSON is no longer
    // what ran, and only the static rule can see it. Without A2, §4 is a style guide.
    const file = `${SHAPE_FIXTURES}/bad-spread-descriptor.js`;
    const findings = conformanceFindings(file, { registry: { [file]: 102 } });
    expect(findings, `the runtime battery cannot see the fork: ${findings.join('; ')}`).toEqual([]);
    expect(runShapeRule([file]).some((v) => v.rule === 'step-shape')).toBe(true);
  });

  it('RED — pipeline.run() is banned outright', () => {
    const file = `${SHAPE_FIXTURES}/bad-pipeline-run.js`;
    expect(runShapeRule([file]).some((v) => v.rule === 'step-no-pipeline-run')).toBe(true);
  });
});

/** Run the A2 rules over explicit paths and return the flat violation list. */
function runShapeRule(files: string[], rule = 'scripts/ast-grep-rules/step-shape.yml'): Array<{ file: string; rule: string; line: number }> {
  const bin =
    process.platform === 'win32'
      ? path.join(REPO_ROOT, 'node_modules/@ast-grep/cli-win32-x64-msvc/ast-grep.exe')
      : path.join(REPO_ROOT, 'node_modules/.bin/ast-grep');
  let stdout = '';
  try {
    stdout = execFileSync(
      bin,
      ['scan', '--rule', rule, '--report-style=short', '--color=never', ...files],
      // stderr ignored: ast-grep prints "N error(s) found in code" there on every
      // match, which is the EXPECTED path for the red canaries and would otherwise
      // spray the reporter output.
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (err) {
    // ast-grep exits non-zero when an error-severity rule matches — the expected path.
    stdout = (err as { stdout?: string }).stdout ?? '';
  }
  const LINE = /^(.+?):(\d+):(\d+): (?:error|warning|note|info)\[([\w-]+)\]:/;
  const out: Array<{ file: string; rule: string; line: number }> = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (m) out.push({ file: m[1]!.replace(/\\/g, '/'), rule: m[4]!, line: Number(m[2]) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. §5.5 — the COMPUTE shape (PROPOSED 2026-08-25, pilot 1 peel 8c; ratify at C3)
// ---------------------------------------------------------------------------
//
// Scope is the compute DIRECTORY, not converted.json: a module under
// scripts/lib/compute/ exists only because a conversion produced it, so the corpus
// is self-arming. The descriptor for `scripts/lib/compute/<base>.js` is found by
// BASENAME against the manifest step files (§4.1 "three files, one slug"), which is
// also the pairing scripts/hooks/step-require-probe.cjs and the sibling-descriptor
// rule use.

const COMPUTE_DIR = 'scripts/lib/compute';
const COMPUTE_RULE = 'scripts/ast-grep-rules/compute-shape.yml';
const BAD_COMPUTE_FIXTURE = 'scripts/steps/_schema/fixtures/compute/bad-compute-shape.js';
const COMPUTE_RULE_IDS = [
  'compute-no-console',
  'compute-no-bare-fetch',
  'compute-no-wall-clock',
  'compute-no-process-env',
  'compute-forbidden-require',
  // §1.2a P4 (Pilot 1 remediation) — the hidden-tunable rules. The fixture carries
  // the exact three literals assert_schema hard-coded before externalization
  // (`&limit=20`, `Range: bytes=0-2048`) plus a bare violation threshold, so this
  // set IS the prove-red for the retired literals.
  'compute-no-literal-url-tunable',
  'compute-no-literal-byte-window',
  'compute-no-literal-threshold',
  // Spec 124 §2 Rule 2 addendum (R-W, 2026-08-30) — compute must not branch on
  // PostGIS availability; `guards.requires` is the only legal form. Three
  // precedents: link_massing A-8, compute_centroids A-1(a), link_parcels A-1
  // (planned). The fixture's `ctx.hasPostGIS` branch is this rule's prove-red.
  'compute-no-postgis-branch',
  // Spec 124 §2 Rule 10 (WF2 "Rules 10/11/12 mechanical checkers", C1) — a
  // compute may not assign anything named `verdict`; the cascade is
  // scripts/lib/step/verdict.js's deriveVerdict's one job. The fixture's
  // `const verdict = … ? 'FAIL' : 'PASS'` is this rule's prove-red.
  'compute-no-verdict-derivation',
];

interface ComputePair {
  compute: string;
  step: string;
  descriptor: string;
}

/** Every compute module paired with the manifest step file (and descriptor) of the same basename. */
function computePairs(): ComputePair[] {
  const dir = path.join(REPO_ROOT, COMPUTE_DIR);
  if (!fs.existsSync(dir)) return [];
  const out: ComputePair[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const step = ALL_STEP_FILES.find((s) => path.basename(s) === f);
    if (!step) continue;
    out.push({ compute: `${COMPUTE_DIR}/${f}`, step, descriptor: `${step.slice(0, -3)}.descriptor.json` });
  }
  return out;
}

const COMPUTE_PAIRS = computePairs();

describe('§5.5 compute shape — dispatch table ≡ declared checks', () => {
  it('the compute corpus is not empty (a vacuous loop proves nothing)', () => {
    const modules = fs.existsSync(path.join(REPO_ROOT, COMPUTE_DIR))
      ? fs.readdirSync(path.join(REPO_ROOT, COMPUTE_DIR)).filter((f) => f.endsWith('.js'))
      : [];
    expect(modules.length, `${COMPUTE_DIR} holds no compute modules`).toBeGreaterThan(0);
    expect(
      COMPUTE_PAIRS.length,
      `${modules.length} compute module(s) but ${COMPUTE_PAIRS.length} paired to a manifest step file by basename`,
    ).toBe(modules.length);
  });

  for (const pair of COMPUTE_PAIRS) {
    it(`${pair.compute} — dispatch keys are exactly the descriptor's check ids, in order`, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS compute
      const mod = require(path.join(REPO_ROOT, pair.compute)) as { checks?: Record<string, unknown> };
      expect(typeof mod.checks, `${pair.compute} exports no \`checks\` dispatch table (§5.5 (1))`).toBe('object');
      const dispatch = Object.keys(mod.checks as Record<string, unknown>);
      const declared = (
        JSON.parse(fs.readFileSync(path.join(REPO_ROOT, pair.descriptor), 'utf8')) as { checks: Array<{ id: string }> }
      ).checks.map((c) => c.id);

      // BOTH directions, plus order: a set comparison would let a compute silently
      // carry a function for a check the descriptor retired, or vice versa.
      expect(dispatch.filter((k) => !declared.includes(k)), 'dispatch entries with no declared check').toEqual([]);
      expect(declared.filter((k) => !dispatch.includes(k)), 'declared checks with no dispatch entry').toEqual([]);
      expect(dispatch, '§5.5 (4) — dispatch order must be descriptor order').toEqual(declared);

      // (1) name === check id: a renamed function is a renamed audit row.
      for (const [id, fn] of Object.entries(mod.checks as Record<string, unknown>)) {
        expect(typeof fn, `dispatch entry ${id} is not a function`).toBe('function');
        expect((fn as { name: string }).name, `dispatch entry ${id} is a function named "${(fn as { name: string }).name}"`).toBe(id);
      }
    });

    it(`${pair.compute} — the compute-shape rule is silent (no console.* / bare fetch / clock / env / banned require)`, () => {
      expect(runShapeRule([pair.compute], COMPUTE_RULE)).toEqual([]);
    });
  }

  it('RED — every compute-shape rule FIRES on the known-bad fixture (Spec 121 §12b.6)', () => {
    const fired = new Set(runShapeRule([BAD_COMPUTE_FIXTURE], COMPUTE_RULE).map((v) => v.rule));
    expect([...fired].sort(), `${BAD_COMPUTE_FIXTURE} did not trip every rule`).toEqual([...COMPUTE_RULE_IDS].sort());
  });

  it('RED — the driver EXITS 1 (no --json) when the compute corpus violates the shape (blocking half, both directions)', () => {
    // Point the corpus at the known-bad fixture dir via the TEST-ONLY env override and run the
    // real gating path (no --json: that branch returns before the blocking loop).
    const run = spawnSync('node', [SHAPE_DRIVER], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, BUILDO_COMPUTE_DIR: 'scripts/steps/_schema/fixtures/compute' },
    });
    expect(run.status, `driver exit code; stdout=${run.stdout}
stderr=${run.stderr}`).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toMatch(/footgun\[compute-no-/);
    // and the real corpus passes the same gating path
    const clean = spawnSync('node', [SHAPE_DRIVER], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 });
    expect(clean.status, `clean run; stdout=${clean.stdout}
stderr=${clean.stderr}`).toBe(0);
  });

  it('the driver REPORTS the compute corpus under --json (report shape only — gating is proven above)', () => {
    const report = JSON.parse(
      execFileSync('node', [SHAPE_DRIVER, '--json'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 }),
    ) as { compute_rule?: string; compute?: Array<{ file: string; violations: unknown[] }> };
    expect(report.compute_rule).toBe(COMPUTE_RULE);
    expect((report.compute ?? []).map((f) => f.file).sort()).toEqual(COMPUTE_PAIRS.map((p) => p.compute).sort());
    expect((report.compute ?? []).filter((f) => f.violations.length > 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5a. LW-D11 — harness-fidelity lock: a ctx-builder may only set real stepCtx keys
// ---------------------------------------------------------------------------
//
// scripts/lib/compute/link-wsib.js's `entity_fanin_warn` read a top-level `ctx.fanin`
// that scripts/lib/step/index.js's `stepCtx` literal NEVER assigns — the check
// evaluated `{}`/0 against every real run (docs/reports/golden/link_wsib/post-8-forced/
// sources-full-forced-2.json: `entity_fanin_warn` reported 0 while the SAME capture's
// invariant `wsib_entity_fanin_max` measured 439), while
// src/tests/steps/link_wsib/violations.test.ts's `runCompute` ctx-builder injected
// `fanin` directly, so the unit suite stayed green off a fixture the runtime could
// never produce. `STEP_CTX_KEYS` (scripts/lib/step/index.js) is now the closed,
// exported list of keys the library actually assigns; this lock statically extracts
// every top-level key each `src/tests/steps/*/violations.test.ts` ctx-builder sets
// and asserts it is a subset — generic, not link_wsib-specific, so the next step to
// grow a synthetic ctx field the runner never plumbs fails here instead of shipping
// a permanently-wrong check.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { STEP_CTX_KEYS } = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')) as { STEP_CTX_KEYS: string[] };
// eslint-disable-next-line @typescript-eslint/no-require-imports -- REAL AST parse, not a punctuation-fragile regex/lexer over prose-heavy source
const ts = require('typescript') as typeof import('typescript');

/**
 * Every top-level property/method name of the FIRST `const ctx = { ... }` object-literal
 * initializer in `source` — via the real TypeScript AST (`ts.createSourceFile`), not a
 * hand-rolled lexer. This file's fixtures are dense with prose containing unbalanced
 * apostrophes/braces inside string literals (e.g. "the compute must not fetch — this
 * step's..."), which breaks any regex/brace-counting approach that does not fully
 * tokenize strings; the compiler's own tokenizer does not have that failure mode.
 */
/**
 * Returns `null` (not a throw) when no `const ctx = { ... }` initializer exists —
 * R-K.1 (2026-08-29): a per-step test file with no ctx-builder is LEGAL. Not every
 * archetype's must-fail battery needs a synthetic ctx object (a BACKFILL with one
 * conditional UPDATE and no per-row/per-tier compute dispatch may have nothing to
 * build); the lock asserts key-fidelity ONLY when a builder actually exists.
 */
function ctxBuilderKeys(source: string): string[] | null {
  const sf = ts.createSourceFile('ctx-builder.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: string[] | null = null;
  const visit = (node: import('typescript').Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'ctx' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found = node.initializer.properties
        .map((p) => {
          if (ts.isIdentifier(p.name as import('typescript').PropertyName)) return (p.name as import('typescript').Identifier).text;
          if (p.name && ts.isStringLiteral(p.name as import('typescript').PropertyName)) return (p.name as import('typescript').StringLiteral).text;
          return null;
        })
        .filter((k): k is string => k !== null);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found; // null is a legal, no-op result (R-K.1) — the caller decides what that means
}

describe('LW-D11 — harness-fidelity lock: a runCompute ctx-builder may only set real stepCtx keys', () => {
  it('RED half — the extractor FIRES on a synthetic ctx block that injects an undeclared key (proves the checker catches the class of bug it exists for)', () => {
    const fake = `
      function runCompute() {
        const ctx = {
          pool: {},
          matched: {},
          fanin: { max: 12 }, // NOT a real stepCtx key — this is the pre-LW-D11 bug shape
          report(id, obs) { void id; void obs; },
        };
      }
    `;
    const keys = ctxBuilderKeys(fake);
    expect(keys, 'the synthetic fixture genuinely has a ctx-builder — null would mean the extractor itself is broken').not.toBeNull();
    expect(keys).toContain('fanin');
    const bogus = (keys as string[]).filter((k) => !STEP_CTX_KEYS.includes(k));
    expect(bogus, 'the synthetic fixture is supposed to trip the checker').toEqual(['fanin']);
  });

  it('R-K.1 GREEN half — absence is legal: a file with NO ctx-builder returns null, not a throw', () => {
    expect(ctxBuilderKeys('function noCtxHere() { return 1; }')).toBeNull();
  });

  it('sanity: STEP_CTX_KEYS is non-empty and names the keys every violations.test.ts ctx-builder is known to use', () => {
    expect(STEP_CTX_KEYS.length).toBeGreaterThan(0);
    for (const k of ['pool', 'chainId', 'runId', 'descriptor', 'checks', 'log', 'fetch', 'clock', 'config', 'report']) {
      expect(STEP_CTX_KEYS, `STEP_CTX_KEYS is missing "${k}"`).toContain(k);
    }
  });

  const STEPS_DIR = path.join(REPO_ROOT, 'src/tests/steps');
  const VIOLATION_FILES = fs.existsSync(STEPS_DIR)
    ? fs.readdirSync(STEPS_DIR)
        .map((d) => path.join('src/tests/steps', d, 'violations.test.ts'))
        .filter((f) => fs.existsSync(path.join(REPO_ROOT, f)))
    : [];

  it(`the corpus is not empty (found ${VIOLATION_FILES.length} violations.test.ts file(s))`, () => {
    expect(VIOLATION_FILES.length).toBeGreaterThan(0);
  });

  for (const relFile of VIOLATION_FILES) {
    it(`${relFile} — ctx-builder sets only STEP_CTX_KEYS, or has none (R-K.1: absence is legal — assert only when a builder exists)`, () => {
      const source = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8');
      const keys = ctxBuilderKeys(source);
      if (keys === null) return; // no `const ctx = {...}` in this file — nothing to assert (R-K.1)
      const bogus = keys.filter((k) => !STEP_CTX_KEYS.includes(k));
      expect(
        bogus,
        `${relFile}'s ctx-builder sets key(s) [${bogus.join(', ')}] the library never assigns onto stepCtx ` +
          `(STEP_CTX_KEYS, scripts/lib/step/index.js) — a compute reading it will always see a value the ` +
          `real runner never provides (LW-D11)`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 5b. §1.2a P4 — every tunable is externalized, and BOTH directions are proven
// ---------------------------------------------------------------------------
//
// "a hard-coded knob with `config: \"none\"` is a hidden variable = P1 violation."
// The compute-shape rules above catch the LITERAL; this battery catches everything
// a static literal-hunt cannot see — a declared name no registry knows, a seeded
// variable no operator can find in the admin UI, a declaration nothing reads, and a
// read nothing declared (which is `undefined` at runtime, i.e. `limit=undefined`).
//
// FOUR SURFACES, and each must agree with the others:
//   seed JSON / migrations  →  the descriptor's `config.logic_variables[]`
//   the descriptor          →  GlobalConfigCard GROUPS (operator visibility)
//   the descriptor          →  the compute's `ctx.config.<name>` reads
// The registry doc is the union surface (seed + migration-only) and is itself
// drift-guarded by logic-vars-registry.infra.test.ts, so parsing it here cannot rot.

const SEED_PATH = path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json');
const REGISTRY_DOC = path.join(REPO_ROOT, 'docs/reference/logic-variables-registry.md');

const SEED = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as Record<string, { description?: string }>;

/** Every registered logic-variable key: the seed JSON ∪ the migration-only vars. */
function registryKeys(): Set<string> {
  const keys = new Set(Object.keys(SEED));
  const doc = fs.readFileSync(REGISTRY_DOC, 'utf8');
  for (const m of doc.matchAll(/^\| `([a-z][a-z0-9_]*)` \|/gm)) keys.add(m[1]!);
  return keys;
}
const REGISTRY_KEYS = registryKeys();

/**
 * The admin surface: every numeric key GlobalConfigCard actually renders.
 *
 * WF2 "Admin Tunable Coverage" commit 3 (Fold A item 4) — GROUPS stopped
 * being a hand-authored literal in GlobalConfigCard.tsx (it now imports
 * src/features/admin-controls/generated/logic-variable-groups.json, itself
 * generated FROM the seed's declared `admin.group` field). The old regex
 * parse of `export const GROUPS[\s\S]*?\n\];` in the .tsx source would find
 * nothing once that array literal is gone — this reads the SAME structural
 * source GlobalConfigCard.tsx now imports, so the check still measures the
 * real admin-visible surface, not a stale text pattern.
 */
/** Pure parse, exported-by-closure for the RED-fixture test right below. */
function parseGroupKeys(parsed: unknown): Set<string> {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('logic-variable-groups.json parsed empty — GROUPS block not found');
  }
  const groups = parsed as Array<{ label: string; keys: string[] }>;
  return new Set(groups.flatMap((g) => g.keys));
}
function groupKeys(): Set<string> {
  const generatedPath = path.join(
    REPO_ROOT,
    'src/features/admin-controls/generated/logic-variable-groups.json',
  );
  const raw = fs.readFileSync(generatedPath, 'utf8');
  return parseGroupKeys(JSON.parse(raw));
}
const GROUP_KEYS = groupKeys();

/** Registry keys whose seeded description TAGS them to this step (the `CONSUMED by` annotation). */
function taggedToStep(slug: string, computeRel: string | null): string[] {
  const needles = [slug, path.basename(computeRel ?? ''), `${slug.replace(/_/g, '-')}.js`].filter(Boolean);
  return Object.entries(SEED)
    .filter(([, v]) => {
      const d = v.description ?? '';
      const i = d.indexOf('CONSUMED by');
      if (i === -1) return false;
      const tail = d.slice(i);
      return needles.some((n) => tail.includes(n));
    })
    .map(([k]) => k);
}

interface ConfigDescriptor {
  identity: { name: string };
  config: 'none' | { logic_variables: Array<{ name: string }> };
}

/**
 * A compute's genuine `ctx.config.<name>` read — widened at LW-D10 (commit 8b,
 * 2026-08-28) to ALSO match a bare `config.<name>` where `config` starts a fresh
 * identifier (not `myconfig.` or `obj.config.`), because a compute function that
 * receives `config` as a positional parameter (link-wsib's `buildTierSql(descriptor,
 * config, tier, runAt)` convention, documented `@param config - ctx.config`) never
 * spells the `ctx.` prefix textually. Shared by both `configFindings` (P4 — declared
 * ≡ consumed) and `retiredFindings` (R-A — a retired var must not still be read).
 *
 * ⚠️ MUST run over `stripComments`-cleaned source, not the raw file: the bare-`config.`
 * half over-matches PROSE too easily — `scripts/lib/step/config.js` (a file-path mention)
 * parses as `config.js`, and `descriptor.config.probe_presence` (a field-path mention)
 * parses as `config.probe_presence`. Both are genuine comment text in
 * `scripts/lib/compute/assert-schema.js`, found by this widening's own first run
 * (caught immediately, not shipped) — proof the strip is load-bearing, not decorative.
 */
const CONFIG_READ_RE = /(?:ctx\.config|(?<![\w.])config)\.([a-z][a-z0-9_]*)/g;

/**
 * LP-D-conformance-gap (pilot 7 cutover, commit 9, 2026-08-30) — a SECOND indirection
 * pattern the original `CONFIG_READ_RE` never covered: `config[CONFIG_KEYS.propName]`
 * bracket access through a local `CONFIG_KEYS` map (`link-parcels.js`'s own T1-T4
 * convention, avoiding repeating the registered var-name string literal at every call
 * site). Found by executing — the moment `link_parcels` actually joined `converted[]`
 * (this cutover) and this suite's `§1.2a P4` check ran against it for the FIRST time
 * (it never had before: `converted.json`'s own `pending[]` entry excluded it from every
 * prior `converted`-scoped iteration), all 4 T1-T4 vars read RED as dead declarations.
 * Resolves any `const <NAME> = { prop: 'string-literal', ... }` object-literal mapping
 * in source, then treats `config[<NAME>.prop]` as consuming whatever string that
 * property resolves to — the SAME "declared reachable, however indirectly" spirit
 * `fromConfigRefs` already applies to `*_from_config` descriptor fields.
 */
function configKeysMap(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const objRe = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([\s\S]*?)\n\};/g;
  for (const m of src.matchAll(objRe)) {
    const [, objName, body] = m;
    const propRe = /([a-zA-Z_][\w]*)\s*:\s*'([^']+)'/g;
    for (const p of body!.matchAll(propRe)) {
      map.set(`${objName}.${p[1]}`, p[2]!);
    }
  }
  return map;
}

/**
 * RS-conformance-gap (pilot 8 cutover, commit 9, 2026-09-03) — a THIRD indirection
 * pattern neither `CONFIG_READ_RE` nor `configKeysMap`'s object-literal form covers:
 * `config[SIMPLE_VAR]` bracket access through a bare single-const alias (
 * `refresh-snapshot.js`'s own `T1_VAR`/`T2_VAR` convention — `const T1_VAR =
 * 'snapshot_coa_conf_high';` then `config[T1_VAR]`), not an object-literal map. Same
 * class of blind spot as LP-D-conformance-gap above (found by executing — the moment
 * `refresh_snapshot` actually joined `converted[]` this cutover and `§1.2a P4` ran
 * against it for the first time, both T1/T2 vars read RED as dead declarations despite
 * being genuinely read). Resolves any top-level `const <NAME> = 'string-literal';` in
 * source, then treats a bare `config[<NAME>]` as consuming whatever string that const
 * resolves to.
 */
function configSimpleConstMap(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const constRe = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)';/g;
  for (const m of src.matchAll(constRe)) {
    map.set(m[1]!, m[2]!);
  }
  return map;
}

/** Every `ctx.config.<name>` (or bare `config.<name>`, see `CONFIG_READ_RE`), PLUS any
 * `config[<CONFIG_KEYS_MAP_NAME>.<prop>]` bracket read resolved through a local
 * object-literal map (see `configKeysMap`), PLUS any `config[<SIMPLE_CONST>]` bracket
 * read resolved through a bare single-const alias (see `configSimpleConstMap`) — read
 * in already-in-memory source text, comments stripped first. */
function configReadsFromSource(src: string): string[] {
  const stripped = stripComments(src);
  const dotReads = [...stripped.matchAll(CONFIG_READ_RE)].map((m) => m[1]!);
  const keysMap = configKeysMap(stripped);
  const bracketRe = /config\[([A-Z][A-Z0-9_]*\.[a-zA-Z_]\w*)\]/g;
  const bracketReads = [...stripped.matchAll(bracketRe)]
    .map((m) => keysMap.get(m[1]!))
    .filter((v): v is string => Boolean(v));
  const simpleConstMap = configSimpleConstMap(stripped);
  const simpleBracketRe = /config\[([A-Z][A-Z0-9_]*)\]/g;
  const simpleBracketReads = [...stripped.matchAll(simpleBracketRe)]
    .map((m) => simpleConstMap.get(m[1]!))
    .filter((v): v is string => Boolean(v));
  return [...new Set([...dotReads, ...bracketReads, ...simpleBracketReads])];
}

/** Same, from a file on disk. */
function configReadsIn(computeAbsPath: string): string[] {
  return configReadsFromSource(fs.readFileSync(computeAbsPath, 'utf8'));
}

/** The declared config-var names for a converted step, from its sibling descriptor. */
function declaredConfigVars(relFile: string): { slug: string; declared: string[] } {
  const d = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, `${relFile.slice(0, -3)}.descriptor.json`), 'utf8'),
  ) as ConfigDescriptor;
  return { slug: d.identity.name, declared: d.config === 'none' ? [] : d.config.logic_variables.map((v) => v.name) };
}

/**
 * Every DECLARED variable name the RUNNER consumes on the compute's behalf, read off
 * the descriptor: any `*_from_config` field whose value names a logic variable.
 *
 * ⚠️ WHY THIS EXISTS (peel-8 prerequisite). `ctx.config.<name>` is not the only
 * consumption path. Ruling A-4's `checks[].limit_from_config` is resolved by
 * `scripts/lib/step/verdict.js resolveLimit`, and the acquisition timeout is resolved
 * by the runner — in both cases the value in force reaches its consumer WITHOUT the
 * compute ever spelling `ctx.config.<name>`. Counting the compute alone reads exactly
 * those variables as DEAD declarations, i.e. it reddens a step for externalizing a
 * threshold the right way. Matched on the `_from_config` SUFFIX rather than a fixed
 * list of keys, so a later resolution point inherits the predicate instead of
 * silently re-opening the hole.
 *
 * Scoped to that suffix on purpose: `config.logic_variables[].name` also carries the
 * name, and counting THAT would make every declaration self-justifying — a predicate
 * that can never fail.
 */
function fromConfigRefs(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const v of node) fromConfigRefs(v, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/_from_config$/.test(k) && typeof v === 'string' && v !== 'none') out.add(v);
      fromConfigRefs(v, out);
    }
  }
  return out;
}

/** The `*_from_config` references in a step's sibling descriptor, or [] when there is none. */
function runnerConsumedVars(relFile: string): string[] {
  const descriptorPath = path.join(REPO_ROOT, `${relFile.slice(0, -3)}.descriptor.json`);
  if (!fs.existsSync(descriptorPath)) return [];
  return [...fromConfigRefs(JSON.parse(fs.readFileSync(descriptorPath, 'utf8')))];
}

/**
 * A THIRD consumption path (LP-D-conformance-gap, commit 9, 2026-08-30), kept separate
 * from `runnerConsumedVars` on purpose — that function's return value is also consumed
 * elsewhere to check the OPPOSITE direction ("every `*_from_config` reference is itself
 * declared"), and conflating "read in the shared runner" with "named in a
 * `*_from_config` field" broke that check when first tried. A var can be read directly
 * in the SHARED runner (`scripts/lib/step/index.js`) rather than in a step's own
 * compute file — `link_parcels`'s own `runLinkKeyedPhase` binds
 * `config.spatial_match_max_distance_m`/`config.spatial_match_confidence` straight into
 * the spatial-fallback SQL's params ($5/$6), never routing them through compute.js at
 * all (a deliberate param-bind, not interpolation, per that field's own descriptor
 * `why`). The runner has no per-step namespacing, so this scan is whole-file/all-steps
 * — safe by construction for `configFindings`'s own dead-declaration check: widening
 * the consumed set only turns a false-RED finding green there, never masks a real one
 * (the undeclared-read direction is checked off `computeConsumed` alone, not this).
 */
function sharedRunnerConsumedVars(): string[] {
  const runnerPath = path.join(REPO_ROOT, 'scripts/lib/step/index.js');
  return fs.existsSync(runnerPath) ? configReadsIn(runnerPath) : [];
}

/**
 * Every §1.2a P4 finding for one step. Empty array = conformant.
 *
 * `declared` is a PARAMETER, not read from disk, so the canaries below can drive the
 * exact same predicates with a var removed (the seed direction) or an unregistered
 * name added (the registry direction) without mutating a committed file.
 */
function configFindings(relFile: string, slug: string, declared: string[]): string[] {
  const findings: string[] = [];

  // The paired compute, by basename (§4.1 "three files, one slug").
  const computeRel = `${COMPUTE_DIR}/${path.basename(relFile)}`;
  const hasCompute = fs.existsSync(path.join(REPO_ROOT, computeRel));
  // Widened LW-D10 (commit 8b, 2026-08-28): a compute function that receives `config`
  // as a bare positional parameter (documented `@param config - ctx.config`, link-wsib's
  // own buildTierSql convention) never spells the `ctx.` prefix — the un-widened pattern
  // read every one of its config reads as dead declarations the moment this file joined
  // CONVERTED. `(?<![\w.])config\.` requires "config" to start a new identifier (not
  // "myconfig." or "obj.config." — the latter is intentionally NOT matched, since no
  // converted compute today accesses config through a nested property, and matching it
  // blindly would risk crediting an unrelated object literally named "config").
  const computeConsumed = hasCompute ? configReadsIn(path.join(REPO_ROOT, computeRel)) : [];
  // The three consumption paths, unioned for the DEAD-DECLARATION check only: what the
  // COMPUTE reads by name, what the RUNNER resolves out of the descriptor's own
  // `*_from_config` fields, and what the SHARED runner reads directly by name
  // (`sharedRunnerConsumedVars`, LP-D-conformance-gap, commit 9 — kept OUT of
  // `runnerConsumed` itself since that value is also used below to check the opposite
  // direction, "every `*_from_config` reference is itself declared," which must stay
  // scoped to genuine `*_from_config` fields only). A variable reached by any of the
  // three is live.
  const runnerConsumed = runnerConsumedVars(relFile);
  const consumed = [...new Set([...computeConsumed, ...runnerConsumed, ...sharedRunnerConsumedVars()])];

  for (const name of declared) {
    if (!REGISTRY_KEYS.has(name)) {
      findings.push(`declared config var "${name}" is in NO registry (seed JSON or a migration) — nothing to edit`);
    }
    if (!GROUP_KEYS.has(name)) {
      findings.push(`declared config var "${name}" is absent from GlobalConfigCard GROUPS — invisible to operators`);
    }
    if (hasCompute && !consumed.includes(name)) {
      findings.push(`declared config var "${name}" is read neither as ctx.config.${name} in ${computeRel} nor through a *_from_config field in the descriptor — a dead declaration`);
    }
  }
  for (const name of computeConsumed) {
    if (!declared.includes(name)) {
      findings.push(`${computeRel} reads ctx.config.${name}, which the descriptor does not declare — strict projection makes it undefined at runtime`);
    }
  }
  for (const name of runnerConsumed) {
    if (!declared.includes(name)) {
      findings.push(`the descriptor names "${name}" in a *_from_config field, which its config does not declare — the runner silently falls back to the literal`);
    }
  }
  // The reverse-direction check for `sharedRunnerConsumedVars` (LP-D-conformance-gap,
  // commit 9) — deliberately scoped to `link_parcels` ONLY. The shared runner has no
  // per-step namespacing, so a step-agnostic version of this loop (tried first, reverted)
  // flagged link_massing/compute_centroids/link_wsib as "not declaring" link_parcels'
  // OWN spatial_match_max_distance_m/spatial_match_confidence reads — true in a narrow
  // textual sense (their descriptors genuinely don't declare those names) but wrong in
  // spirit (the runner only reads them on link_parcels' own `isLinkKeyedStep` branch).
  // Scoping to the one step that actually owns this pathway keeps the check sound;
  // widening it to a general per-step attribution mechanism is future work, not this
  // commit's problem to solve.
  if (slug === 'link_parcels') {
    for (const name of sharedRunnerConsumedVars()) {
      if (!declared.includes(name) && !computeConsumed.includes(name)) {
        findings.push(`scripts/lib/step/index.js reads ctx.config.${name} (shared runner), which the descriptor does not declare — strict projection makes it undefined at runtime`);
      }
    }
  }
  for (const name of taggedToStep(slug, hasCompute ? computeRel : null)) {
    if (!declared.includes(name)) {
      findings.push(`seed "${name}" is annotated CONSUMED by ${slug} but the descriptor's config does not declare it`);
    }
  }
  if (declared.length === 0 && consumed.length > 0) {
    findings.push(`config is "none" while ${consumed.length} tunable(s) are consumed (${computeRel} ctx.config reads + descriptor *_from_config refs) — a hidden variable (§1.2a P4)`);
  }
  return findings;
}

describe('§1.2a P4 — every tunable is externalized (declared ≡ registry ≡ GROUPS ≡ ctx.config)', () => {
  it('the registry and GROUPS parses are non-empty (a silent parse miss would vacuously pass everything)', () => {
    expect(REGISTRY_KEYS.size, 'the logic-variable registry parsed empty').toBeGreaterThan(300);
    expect(GROUP_KEYS.size, 'GlobalConfigCard GROUPS parsed empty').toBeGreaterThan(50);
    expect([...Object.keys(SEED)].every((k) => REGISTRY_KEYS.has(k)), 'registry ⊉ seed — the doc parse missed rows').toBe(true);
  });

  // WF2 "Admin Tunable Coverage" commit 3 (Fold A item 4) — groupKeys() was
  // retargeted from a regex over GlobalConfigCard.tsx's literal GROUPS array
  // (gone as of this commit — GROUPS is now imported from generated JSON) to
  // parsing that generated JSON directly. Prove the NEW parse path actually
  // catches an empty/stale fixture, not just that today's real file happens
  // to be non-empty (the assertion above alone wouldn't prove the retargeted
  // parser itself still reddens on a genuine miss).
  it('RED — an empty generated-groups fixture reddens the vacuous-pass guard (parseGroupKeys)', () => {
    expect(() => parseGroupKeys([])).toThrow(/parsed empty/);
    expect(() => parseGroupKeys(null)).toThrow(/parsed empty/);
    expect(() => parseGroupKeys({})).toThrow(/parsed empty/);
  });

  it('GREEN — a well-formed generated-groups fixture parses to its key set (parseGroupKeys)', () => {
    const fixture = [
      { label: 'Fixture Group', keys: ['fixture_key_a', 'fixture_key_b'] },
      { label: 'Second Fixture Group', keys: ['fixture_key_c'] },
    ];
    expect(parseGroupKeys(fixture)).toEqual(new Set(['fixture_key_a', 'fixture_key_b', 'fixture_key_c']));
  });

  it('at least one converted step actually DECLARES a config var (else every check below is vacuous)', () => {
    const totals = CONVERTED.map((f) => declaredConfigVars(f).declared.length);
    expect(
      totals.reduce((a, b) => a + b, 0),
      'no converted step declares a single logic variable — the whole battery would be a vacuous pass',
    ).toBeGreaterThan(0);
  });

  for (const relFile of CONVERTED) {
    it(`${relFile} — declared ⊆ registry, declared ⊆ GROUPS, consumed ≡ declared`, () => {
      const { slug, declared } = declaredConfigVars(relFile);
      const findings = configFindings(relFile, slug, declared);
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }

  // ── BOTH DIRECTIONS, on the SAME predicates the green loop above runs ──────
  const WITH_CONFIG = CONVERTED.filter((f) => declaredConfigVars(f).declared.length > 0);

  for (const relFile of WITH_CONFIG) {
    it(`RED — ${relFile}: DROPPING a declared var reddens conformance (the seed direction)`, () => {
      const { slug, declared } = declaredConfigVars(relFile);
      const findings = configFindings(relFile, slug, declared.slice(1));
      // The dropped var reddens via ONE of two shapes depending on HOW it's consumed:
      // a compute `ctx.config.<name>` read reads as a "dead declaration" once undeclared;
      // a runner-only `*_from_config` reference (Ruling A-4 / LW-D10 class — no compute
      // read at all, e.g. link_parcel_addresses's T1 batch_size_from_config, peel 8-cutover)
      // instead reads as "the runner silently falls back to the literal". Either is a
      // genuine red; this claim only needs SOME "no longer consumed" finding to fire.
      expect(
        findings.some((f) => f.includes(`ctx.config.${declared[0]}`) || (f.includes(`"${declared[0]}"`) && f.includes('which its config does not declare'))),
        findings.join('\n'),
      ).toBe(true);
      expect(findings.some((f) => f.includes('annotated CONSUMED by')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: declaring config "none" reddens as a HIDDEN VARIABLE`, () => {
      const { slug } = declaredConfigVars(relFile);
      const findings = configFindings(relFile, slug, []);
      expect(findings.some((f) => f.includes('a hidden variable (§1.2a P4)')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: an unregistered / admin-invisible name reddens (the registry + GROUPS directions)`, () => {
      const { slug, declared } = declaredConfigVars(relFile);
      const ghost = 'a_var_no_registry_will_ever_have';
      expect(REGISTRY_KEYS.has(ghost) || GROUP_KEYS.has(ghost)).toBe(false);
      const findings = configFindings(relFile, slug, [...declared, ghost]);
      expect(findings.some((f) => f.includes('is in NO registry')), findings.join('\n')).toBe(true);
      expect(findings.some((f) => f.includes('absent from GlobalConfigCard GROUPS')), findings.join('\n')).toBe(true);
      expect(findings.some((f) => f.includes('a dead declaration')), findings.join('\n')).toBe(true);
    });
  }

  // ── THE SECOND CONSUMPTION PATH (ruling A-4) ───────────────────────────────
  // A verdict bound is an operator knob AND the number rendered in the audit row's
  // `threshold` column. It reaches its consumer through `checks[].limit_from_config`,
  // resolved by scripts/lib/step/verdict.js, so the compute never spells
  // `ctx.config.<name>` for it. Driven off load_ravines — the first descriptor to
  // carry the field, and NOT in converted.json yet, so nothing else exercises the
  // predicate until its cutover lands. Two directions, on the same predicate.
  const A4_STEP = 'scripts/load-ravines.js';
  const A4_DESCRIPTOR = path.join(REPO_ROOT, 'scripts/load-ravines.descriptor.json');

  describe('a bound consumed through a *_from_config field is NOT a dead declaration (A-4)', () => {
    it('the fixture is non-vacuous — the descriptor really carries *_from_config references', () => {
      expect(fs.existsSync(A4_DESCRIPTOR), `${A4_DESCRIPTOR} is missing`).toBe(true);
      const refs = runnerConsumedVars(A4_STEP);
      expect(refs.length, 'no *_from_config reference in the descriptor — both directions below would be vacuous').toBeGreaterThan(0);
      // At least one of them is reached ONLY this way: if the compute also read every
      // one as ctx.config.<name>, the green direction would prove nothing new.
      const computeSrc = fs.readFileSync(path.join(REPO_ROOT, `${COMPUTE_DIR}/load-ravines.js`), 'utf8');
      expect(
        refs.some((r) => !computeSrc.includes(`ctx.config.${r}`)),
        'every *_from_config name is also a ctx.config read — the new path is untested',
      ).toBe(true);
    });

    it('GREEN — a var reached only by limit_from_config reads as CONSUMED', () => {
      const computeSrc = fs.readFileSync(path.join(REPO_ROOT, `${COMPUTE_DIR}/load-ravines.js`), 'utf8');
      const onlyViaLimit = runnerConsumedVars(A4_STEP).filter((r) => !computeSrc.includes(`ctx.config.${r}`));
      const findings = configFindings(A4_STEP, 'load_ravines', onlyViaLimit);
      for (const name of onlyViaLimit) {
        expect(
          findings.some((f) => f.includes(`"${name}"`) && f.includes('a dead declaration')),
          `${name} still reads as dead: ${findings.join('\n')}`,
        ).toBe(false);
      }
    });

    it('RED — a declared var referenced by NEITHER path is still dead', () => {
      const ghost = 'a_var_no_compute_and_no_descriptor_field_names';
      expect(runnerConsumedVars(A4_STEP)).not.toContain(ghost);
      const findings = configFindings(A4_STEP, 'load_ravines', [ghost]);
      expect(
        findings.some((f) => f.includes(`"${ghost}"`) && f.includes('a dead declaration')),
        findings.join('\n'),
      ).toBe(true);
    });

    it('RED — a *_from_config name the config does not declare reddens (the reverse direction)', () => {
      const refs = runnerConsumedVars(A4_STEP);
      const findings = configFindings(A4_STEP, 'load_ravines', []);
      for (const name of refs) {
        expect(
          findings.some((f) => f.includes(`"${name}"`) && f.includes('*_from_config field, which its config does not declare')),
          findings.join('\n'),
        ).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 5b. LW-D10 (commit 8b, 2026-08-28) — "consumed" means a RUNTIME READ, never a
// text mention. T7 (link_wsib_tier3_full_max_iterations) was declared in
// config.logic_variables[], described in checks[].why prose and in
// link-wsib.notes.json's decisions[], and the whole §1.2a P4 battery stayed
// green throughout commits 7/8a/8b/8c — not because T7 was genuinely consumed
// (it was not; scripts/lib/step/index.js hardcoded iterations: 1 the entire
// time) but because link_wsib.js is not yet in converted.json, so the battery's
// CONVERTED loop never generated a test case for it at all. This section
// exercises link_wsib.js's REAL descriptor/compute pair directly (the same
// bypass-CONVERTED technique §5b's own A-4 block above already uses for
// load-ravines.js), and proves the blind spot against the ACTUAL pre-fix
// commit (344e9452) rather than a synthesized fixture, so "battery green" can
// never again mean "never actually checked."
// ---------------------------------------------------------------------------

const LWD10_STEP = 'scripts/link-wsib.js';
const LWD10_VAR = 'link_wsib_tier3_full_max_iterations';

describe('LW-D10 — a declared tunable consumed ONLY via a library *_from_config field (no compute ctx.config read) is NOT a dead declaration; a tunable named ONLY in prose IS', () => {
  it('the fixture is non-vacuous — T7 is declared, and the descriptor really carries a *_from_config reference for it that is NOT also a compute ctx.config read', () => {
    const { declared } = declaredConfigVars(LWD10_STEP);
    expect(declared, 'link-wsib.descriptor.json no longer declares T7 — fixture stale').toContain(LWD10_VAR);
    const refs = runnerConsumedVars(LWD10_STEP);
    expect(refs, 'no *_from_config reference names T7 — the tiers[].max_iterations_from_config fix regressed').toContain(LWD10_VAR);
    const computeAbs = path.join(REPO_ROOT, `${COMPUTE_DIR}/link-wsib.js`);
    expect(
      configReadsIn(computeAbs).includes(LWD10_VAR),
      'T7 is ALSO read as ctx.config in the compute — the "library-only" half of this fixture is untested',
    ).toBe(false);
  });

  it('GREEN, on the CURRENT tree — T7 reads as CONSUMED (declared ⊆ registry, ⊆ GROUPS, consumed ≡ declared), exercised directly against link-wsib.js even though it is not yet in converted.json', () => {
    const { slug, declared } = declaredConfigVars(LWD10_STEP);
    const findings = configFindings(LWD10_STEP, slug, declared);
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('RED — a text mention alone (checks[].why prose) does NOT satisfy consumption: that surface is not a scanned input of configFindings', () => {
    // Confirms the RISK is real, not hypothetical: T7's name genuinely appears in prose
    // today, on the CURRENT (fixed) tree — the kind of mention that could look like
    // "documentation of consumption" to an un-grounded reviewer. (notes.json's decisions[]
    // entry for T7 — commit 7's own — describes the loop WITHOUT quoting the variable name
    // literally, per §3.4's own "may reference a check id but may NEVER quote a number"
    // discipline; checks[].why prose carries no such restriction, and does quote it.)
    const descriptorText = fs.readFileSync(path.join(REPO_ROOT, `${LWD10_STEP.slice(0, -3)}.descriptor.json`), 'utf8');
    expect(descriptorText, 'checks[].why no longer names T7 in prose — the fixture premise (a coexisting text mention) is stale').toContain(LWD10_VAR);
    // The actual proof: configFindings/runnerConsumedVars/configReadsIn never read
    // checks[].why AT ALL — grep the source of THIS test file's own detectors for that
    // field name; it does not appear, so the prose site above is structurally incapable
    // of satisfying "consumed" on its own, which is exactly why the pre-fix RED case
    // below is possible in the first place.
    const thisFile = fs.readFileSync(__filename, 'utf8');
    const detectorSpan = thisFile.slice(thisFile.indexOf('function runnerConsumedVars'), thisFile.indexOf('describe(\'§1.2a P4'));
    expect(detectorSpan, 'the consumption detectors now read checks[].why text — re-derive this proof').not.toMatch(/checks\[\]\.why|\.why\.text/);
    expect(detectorSpan, 'the consumption detectors now read notes.json — re-derive this proof').not.toMatch(/notes\.json|loadNotes/);
  });

  it('RED, against the ACTUAL pre-fix commit (344e9452) — T7 was declared and NOT consumed by either path: the same battery that is green today would have caught this, had it ever run', () => {
    const oldDescriptorRaw = execFileSync('git', ['show', '344e9452:scripts/link-wsib.descriptor.json'], { cwd: REPO_ROOT, encoding: 'utf8' });
    const oldComputeSrc = execFileSync('git', ['show', '344e9452:scripts/lib/compute/link-wsib.js'], { cwd: REPO_ROOT, encoding: 'utf8' });
    const oldDescriptor = JSON.parse(oldDescriptorRaw) as { config: { logic_variables: Array<{ name: string }> } };
    const oldDeclared = oldDescriptor.config.logic_variables.map((v) => v.name);
    expect(oldDeclared, 'T7 was not declared on the pre-fix commit — wrong commit for this fixture').toContain(LWD10_VAR);

    const oldRunnerConsumed = [...fromConfigRefs(oldDescriptor)];
    expect(oldRunnerConsumed, 'T7 was already *_from_config-reachable on the pre-fix commit — nothing to prove').not.toContain(LWD10_VAR);

    const oldComputeConsumed = configReadsFromSource(oldComputeSrc);
    expect(oldComputeConsumed, 'T7 was already a compute ctx.config read on the pre-fix commit — nothing to prove').not.toContain(LWD10_VAR);

    // Reproduce configFindings' own predicate inline (it reads live files by path;
    // the pre-fix source lives only in git history for this one test) — same rule:
    // declared, consumed by neither path ⇒ dead declaration.
    const consumed = new Set([...oldComputeConsumed, ...oldRunnerConsumed]);
    expect(consumed.has(LWD10_VAR), 'T7 was consumed on the pre-fix commit by some path this test missed').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pilot 6 peel 8c (2026-08-29) — compute_centroids's T1/T2, exercised directly
// against scripts/compute-centroids.js even though it is not yet in
// converted.json (the same bypass-CONVERTED technique the load-ravines/LW-D10
// blocks above already use). T1/T2 are consumed EXCLUSIVELY through
// checks[].limit_from_config (verdict.js resolveLimit) — compute.js's check
// functions report the raw observation only, never a ctx.config read — so this
// is the SAME shape as LW-D10's own T7 fixture: "consumed ONLY via a
// *_from_config field" is a real, provable, non-vacuous case, not merely "no
// finding because nothing was checked."
//
// CC-D3 (2026-08-30 follow-on WF3) adds T3
// (compute_centroids_full_recompute_batch_size), consumed via a DIFFERENT
// *_from_config field (execution.batch_size_from_config, not
// checks[].limit_from_config) — fromConfigRefs scans EVERY `*_from_config` key
// generically, so T3 joins CC_VARS below rather than needing a second fixture.
// ---------------------------------------------------------------------------

const CC_STEP = 'scripts/compute-centroids.js';
const CC_VARS = [
  'compute_centroids_failed_geometries_warn',
  'compute_centroids_compute_rate_warn_pct',
  'compute_centroids_full_recompute_batch_size',
];

describe('pilot 6 peel 8c — compute_centroids T1/T2/T3: declared ⊆ registry, ⊆ GROUPS, consumed ≡ declared (exercised directly, not yet in converted.json)', () => {
  it('the fixture is non-vacuous — all of T1/T2/T3 are declared, all are *_from_config-reachable, and NONE is also read as ctx.config in compute.js (the library-only consumption path is genuinely exercised, not vacuously true)', () => {
    const { declared } = declaredConfigVars(CC_STEP);
    expect(declared.sort()).toEqual([...CC_VARS].sort());
    const refs = runnerConsumedVars(CC_STEP);
    for (const v of CC_VARS) expect(refs, `no *_from_config reference names ${v}`).toContain(v);
    const computeAbs = path.join(REPO_ROOT, `${COMPUTE_DIR}/compute-centroids.js`);
    const computeReads = configReadsIn(computeAbs);
    for (const v of CC_VARS) {
      expect(computeReads.includes(v), `${v} is ALSO read as ctx.config in compute.js — the "library-only" half of this fixture is untested`).toBe(false);
    }
  });

  it('GREEN — declared ⊆ registry, ⊆ GROUPS (the "Centroid Computation" group), consumed ≡ declared', () => {
    const { slug, declared } = declaredConfigVars(CC_STEP);
    expect(slug).toBe('compute_centroids');
    const findings = configFindings(CC_STEP, slug, declared);
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('RED canary — an unregistered 3rd name added to `declared` (never mutating the committed descriptor) reddens on the registry AND GROUPS surfaces, proving the battery is not vacuously green', () => {
    const { slug, declared } = declaredConfigVars(CC_STEP);
    const findings = configFindings(CC_STEP, slug, [...declared, 'compute_centroids_totally_unregistered_var']);
    expect(findings.some((f) => f.includes('is in NO registry')), findings.join('\n')).toBe(true);
    expect(findings.some((f) => f.includes('absent from GlobalConfigCard GROUPS')), findings.join('\n')).toBe(true);
  });

  it('RED canary — dropping T2 from `declared` (never mutating the committed descriptor) reddens the "runner names it, config does not declare it" direction — proves the *_from_config-consumed direction is genuinely checked, not skipped because a compute ctx.config read already satisfied it', () => {
    const { slug, declared } = declaredConfigVars(CC_STEP);
    const withoutT2 = declared.filter((n) => n !== 'compute_centroids_compute_rate_warn_pct');
    const findings = configFindings(CC_STEP, slug, withoutT2);
    expect(findings.some((f) => f.includes('the descriptor names "compute_centroids_compute_rate_warn_pct" in a *_from_config field, which its config does not declare')), findings.join('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5c. R-A (2026-08-28, ADVERSARY DELTA) — retirement of a tunable is a
// declaration, never a live registry row: retired ∩ logic_variables = ∅, and a
// retired name is absent from the seed, GlobalConfigCard GROUPS, and any
// ctx.config read in the compute.
// ---------------------------------------------------------------------------

interface RetiredConfigDescriptor {
  identity: { name: string };
  config: 'none' | { logic_variables: Array<{ name: string }>; retired?: Array<{ name: string }> };
}

/** The declared live + retired config-var names for a converted step. */
function declaredRetired(relFile: string): { slug: string; declared: string[]; retired: string[] } {
  const d = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, `${relFile.slice(0, -3)}.descriptor.json`), 'utf8'),
  ) as RetiredConfigDescriptor;
  if (d.config === 'none') return { slug: d.identity.name, declared: [], retired: [] };
  return {
    slug: d.identity.name,
    declared: d.config.logic_variables.map((v) => v.name),
    retired: (d.config.retired ?? []).map((v) => v.name),
  };
}

/**
 * Every R-A finding for one step. `declared`/`retired` are PARAMETERS (not read
 * from disk) so the RED canaries below can drive the exact predicates with a
 * synthesized overlap/leak, mirroring `configFindings` above.
 */
function retiredFindings(relFile: string, declared: string[], retired: string[]): string[] {
  const findings: string[] = [];
  const overlap = retired.filter((n) => declared.includes(n));
  if (overlap.length > 0) {
    findings.push(`retired ∩ logic_variables is non-empty: ${overlap.join(', ')} — a name may not be both live and retired (R-A)`);
  }

  const computeRel = `${COMPUTE_DIR}/${path.basename(relFile)}`;
  const hasCompute = fs.existsSync(path.join(REPO_ROOT, computeRel));
  const computeConsumed = hasCompute ? configReadsIn(path.join(REPO_ROOT, computeRel)) : [];

  for (const name of retired) {
    if (Object.prototype.hasOwnProperty.call(SEED, name)) {
      findings.push(`retired var "${name}" is still present in scripts/seeds/logic_variables.json — a false affordance (R-A)`);
    }
    if (GROUP_KEYS.has(name)) {
      findings.push(`retired var "${name}" is still present in GlobalConfigCard GROUPS — invisible-retirement is not the concern, VISIBLE-but-dead is (R-A)`);
    }
    if (computeConsumed.includes(name)) {
      findings.push(`retired var "${name}" is still read as ctx.config.${name} in ${computeRel} — retirement is a lie (R-A)`);
    }
  }
  return findings;
}

describe('R-A — retirement of a tunable is a declaration, never a live registry row', () => {
  it('at least one converted step declares a retired var (else the whole battery is vacuous)', () => {
    const totals = CONVERTED.map((f) => declaredRetired(f).retired.length);
    expect(
      totals.reduce((a, b) => a + b, 0),
      'no converted step declares config.retired — the battery below would be a vacuous pass',
    ).toBeGreaterThan(0);
  });

  for (const relFile of CONVERTED) {
    it(`${relFile} — retired ∩ logic_variables = ∅; retired names absent from seed / GROUPS / ctx.config`, () => {
      const { declared, retired } = declaredRetired(relFile);
      const findings = retiredFindings(relFile, declared, retired);
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }

  const WITH_RETIRED = CONVERTED.filter((f) => declaredRetired(f).retired.length > 0);

  for (const relFile of WITH_RETIRED) {
    it(`RED — ${relFile}: a name declared BOTH live and retired reddens (retired ∩ logic_variables ≠ ∅)`, () => {
      const { declared, retired } = declaredRetired(relFile);
      const findings = retiredFindings(relFile, [...declared, retired[0]!], retired);
      expect(findings.some((f) => f.includes('retired ∩ logic_variables')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: a retired name still present in the seed reddens`, () => {
      const { declared, retired } = declaredRetired(relFile);
      const seededName = declared.find((n) => Object.prototype.hasOwnProperty.call(SEED, n));
      expect(seededName, 'no declared var of this step is seeded — the seed-direction canary is vacuous').toBeTruthy();
      const findings = retiredFindings(relFile, declared.filter((n) => n !== seededName), [...retired, seededName!]);
      expect(findings.some((f) => f.includes('still present in scripts/seeds/logic_variables.json')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: a retired name still present in GlobalConfigCard GROUPS reddens`, () => {
      const { declared, retired } = declaredRetired(relFile);
      const groupedName = declared.find((n) => GROUP_KEYS.has(n));
      expect(groupedName, 'no declared var of this step is admin-visible — the GROUPS-direction canary is vacuous').toBeTruthy();
      const findings = retiredFindings(relFile, declared.filter((n) => n !== groupedName), [...retired, groupedName!]);
      expect(findings.some((f) => f.includes('still present in GlobalConfigCard GROUPS')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: a retired name still read as ctx.config in the compute reddens`, () => {
      const { declared, retired } = declaredRetired(relFile);
      const computeRel = `${COMPUTE_DIR}/${path.basename(relFile)}`;
      const computeSrc = fs.existsSync(path.join(REPO_ROOT, computeRel))
        ? fs.readFileSync(path.join(REPO_ROOT, computeRel), 'utf8')
        : '';
      const readName = declared.find((n) => computeSrc.includes(`ctx.config.${n}`));
      expect(readName, 'no declared var of this step is read as ctx.config — the compute-direction canary is vacuous').toBeTruthy();
      const findings = retiredFindings(relFile, declared.filter((n) => n !== readName), [...retired, readName!]);
      expect(findings.some((f) => f.includes('still read as ctx.config')), findings.join('\n')).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 5d. R-B (2026-08-28, ADVERSARY DELTA) — a destructive full retraction target
// (retract_when full_only, or retract "all") REQUIRES recovery.interrupted =
// "force_full_on_next_run": a crashed retraction on that target leaves a hole
// no incremental run's staleness gate can see (measured 2026-08-28 —
// link_massing forced FULL killed mid-rebuild left parcel_buildings at
// 29,330/520,492 and the next run went incremental).
// ---------------------------------------------------------------------------

interface RecoveryDescriptor {
  identity: { name: string };
  outputs: 'none' | { writes: Array<{ table: string; retract: string; retract_when?: string }> };
}

/** Does at least one write target retract destructively (the R-B trigger predicate)? */
function hasDestructiveRetraction(writes: Array<{ retract: string; retract_when?: string }>): boolean {
  return writes.some((w) => w.retract === 'all' || w.retract_when === 'full_only');
}

/** Every R-B finding for one step. `writes`/`interrupted` are PARAMETERS for the RED canary below. */
function interruptedFindings(relFile: string, writes: Array<{ retract: string; retract_when?: string }>, interrupted: string | undefined): string[] {
  if (!hasDestructiveRetraction(writes)) return [];
  if (interrupted !== 'force_full_on_next_run') {
    return [
      `${relFile}: a destructive retraction target (retract "all" or retract_when "full_only") requires ` +
        `recovery.interrupted = "force_full_on_next_run" (R-B), got ${JSON.stringify(interrupted ?? null)}`,
    ];
  }
  return [];
}

function recoveryFor(relFile: string): { writes: Array<{ table: string; retract: string; retract_when?: string }>; interrupted: string | undefined } {
  const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, `${relFile.slice(0, -3)}.descriptor.json`), 'utf8')) as
    RecoveryDescriptor & { recovery: 'none' | { interrupted?: string } };
  const writes = d.outputs === 'none' ? [] : d.outputs.writes;
  const interrupted = d.recovery === 'none' ? undefined : d.recovery.interrupted;
  return { writes, interrupted };
}

describe('R-B — a destructive full retraction target requires a truthful crash-recovery posture', () => {
  it('at least one converted step has a destructive retraction target (else the battery is vacuous)', () => {
    const any = CONVERTED.some((f) => hasDestructiveRetraction(recoveryFor(f).writes));
    expect(any, 'no converted step declares a destructive retraction target — the battery below would be vacuous').toBe(true);
  });

  for (const relFile of CONVERTED) {
    it(`${relFile} — recovery.interrupted is truthfully declared for any destructive retraction target`, () => {
      const { writes, interrupted } = recoveryFor(relFile);
      const findings = interruptedFindings(relFile, writes, interrupted);
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }

  const WITH_DESTRUCTIVE = CONVERTED.filter((f) => hasDestructiveRetraction(recoveryFor(f).writes));

  for (const relFile of WITH_DESTRUCTIVE) {
    it(`RED — ${relFile}: recovery.interrupted "none" reddens against its destructive retraction target`, () => {
      const { writes } = recoveryFor(relFile);
      const findings = interruptedFindings(relFile, writes, 'none');
      expect(findings.some((f) => f.includes('requires recovery.interrupted')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: a MISSING recovery.interrupted (undefined) reddens too`, () => {
      const { writes } = recoveryFor(relFile);
      const findings = interruptedFindings(relFile, writes, undefined);
      expect(findings.some((f) => f.includes('requires recovery.interrupted')), findings.join('\n')).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// R-M / LG-17 — a destructive retraction target the generic before-image mechanism
// CAN cover (write_discipline.scope truthy) requires recovery.before_image:"generated".
// Narrower than R-B's `hasDestructiveRetraction`: a scope-less retraction (e.g.
// load_ravines' retract:"departed", keyed by a surviving-ids array rather than a WHERE
// predicate) is a declared, out-of-mechanism limitation — "none"+why is legal there,
// same shape R-B itself already allows for a non-destructive target.
// ---------------------------------------------------------------------------

interface BeforeImageWriteTarget { table: string; retract: string; retract_when?: string; write_discipline: { class: string; scope: string } }

/** Does at least one write target retract destructively AND carry a scope the generic before-image mechanism can mirror? */
function hasBeforeImageableRetraction(writes: BeforeImageWriteTarget[]): boolean {
  return writes.some((w) =>
    (w.write_discipline.class === 'set_based_null_retract' || w.retract === 'all' || w.retract === 'departed') &&
    w.write_discipline.scope !== 'none');
}

/** Every R-M finding for one step. `writes`/`beforeImage` are PARAMETERS for the RED canary below. */
function beforeImageFindings(relFile: string, writes: BeforeImageWriteTarget[], beforeImage: string | undefined): string[] {
  if (!hasBeforeImageableRetraction(writes)) return [];
  if (beforeImage !== 'generated') {
    return [
      `${relFile}: a scope-bearing destructive retraction target (set_based_null_retract, or retract "all"/"departed" ` +
        `with write_discipline.scope declared) requires recovery.before_image = "generated" (R-M), got ${JSON.stringify(beforeImage ?? null)}`,
    ];
  }
  return [];
}

function beforeImageRecoveryFor(relFile: string): { writes: BeforeImageWriteTarget[]; beforeImage: string | undefined } {
  const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, `${relFile.slice(0, -3)}.descriptor.json`), 'utf8')) as
    { identity: { name: string }; outputs: 'none' | { writes: BeforeImageWriteTarget[] }; recovery: 'none' | { before_image?: string } };
  const writes = d.outputs === 'none' ? [] : d.outputs.writes;
  const beforeImage = d.recovery === 'none' ? undefined : d.recovery.before_image;
  return { writes, beforeImage };
}

describe('R-M / LG-17 — a scope-bearing destructive retraction target requires a generated before-image', () => {
  it('at least one converted step has a scope-bearing destructive retraction target (else the battery is vacuous)', () => {
    const any = CONVERTED.some((f) => hasBeforeImageableRetraction(beforeImageRecoveryFor(f).writes));
    expect(any, 'no converted step declares a scope-bearing destructive retraction target — the battery below would be vacuous').toBe(true);
  });

  for (const relFile of CONVERTED) {
    it(`${relFile} — recovery.before_image is truthfully declared for any scope-bearing destructive retraction target`, () => {
      const { writes, beforeImage } = beforeImageRecoveryFor(relFile);
      const findings = beforeImageFindings(relFile, writes, beforeImage);
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }

  const WITH_BEFORE_IMAGEABLE = CONVERTED.filter((f) => hasBeforeImageableRetraction(beforeImageRecoveryFor(f).writes));

  for (const relFile of WITH_BEFORE_IMAGEABLE) {
    it(`RED — ${relFile}: recovery.before_image "none" reddens against its scope-bearing destructive retraction target`, () => {
      const { writes } = beforeImageRecoveryFor(relFile);
      const findings = beforeImageFindings(relFile, writes, 'none');
      expect(findings.some((f) => f.includes('requires recovery.before_image')), findings.join('\n')).toBe(true);
    });

    it(`RED — ${relFile}: a MISSING recovery.before_image (undefined) reddens too`, () => {
      const { writes } = beforeImageRecoveryFor(relFile);
      const findings = beforeImageFindings(relFile, writes, undefined);
      expect(findings.some((f) => f.includes('requires recovery.before_image')), findings.join('\n')).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// LPA-D4 (2026-08-29) — a step whose staleness can gated-skip must say WHY it skipped.
// `runCascadePhase`/`runMaterializePhase` (scripts/lib/step/index.js) narrow
// `stepCtx.checks` to `when:"pre"` ids only on a gated SKIP (LG-15) — a descriptor with
// no `when:"pre"` check at all narrows to ZERO rows, and `gatedSkip.reason` was only
// `log.info`'d, never persisted. "Can gated-skip" is a descriptor-level FACT, not an
// archetype guess: a converted step declares it by carrying a `terminals[]` entry of
// kind `"skip_gated"` (`link_wsib`/`link_parcel_addresses` both do; `link_massing` does
// NOT — LINK drives `selectMode`'s tri-state full/incremental decision, which never
// skips, and correctly carries no such terminal).
// ---------------------------------------------------------------------------

interface GateDecisionDescriptor {
  identity: { name: string };
  checks: Array<{ id: string; when: string }>;
  terminals: Array<{ id: string; kind: string }>;
}

function gateDecisionFor(relFile: string): { hasSkipGatedTerminal: boolean; preCheckCount: number } {
  const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, `${relFile.slice(0, -3)}.descriptor.json`), 'utf8')) as GateDecisionDescriptor;
  const hasSkipGatedTerminal = (d.terminals || []).some((t) => t.kind === 'skip_gated');
  const preCheckCount = (d.checks || []).filter((c) => c.when === 'pre').length;
  return { hasSkipGatedTerminal, preCheckCount };
}

/** The LPA-D4 finding, as a pure predicate over {hasSkipGatedTerminal, preCheckCount} (RED canary parameters, below). */
function gateDecisionFindings(relFile: string, subject: { hasSkipGatedTerminal: boolean; preCheckCount: number }): string[] {
  if (!subject.hasSkipGatedTerminal) return [];
  if (subject.preCheckCount === 0) {
    return [
      `${relFile}: declares a terminals[] entry of kind "skip_gated" but zero checks[].when === "pre" — a gated ` +
        'SKIP narrows the audit table to sys_* rows only, and the skip reason is never persisted (LPA-D4)',
    ];
  }
  return [];
}

describe('LPA-D4 — any step that can gated-skip declares at least one when:"pre" check', () => {
  it('at least one converted step declares a skip_gated terminal (else the battery is vacuous)', () => {
    const any = CONVERTED.some((f) => gateDecisionFor(f).hasSkipGatedTerminal);
    expect(any, 'no converted step declares a terminals[] "skip_gated" entry — the battery below would be vacuous').toBe(true);
  });

  for (const relFile of CONVERTED) {
    it(`${relFile} — declares >=1 when:"pre" check if it can gated-skip`, () => {
      const findings = gateDecisionFindings(relFile, gateDecisionFor(relFile));
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }

  const WITH_SKIP_GATED = CONVERTED.filter((f) => gateDecisionFor(f).hasSkipGatedTerminal);

  for (const relFile of WITH_SKIP_GATED) {
    it(`RED — ${relFile}: zero when:"pre" checks reddens against its skip_gated terminal`, () => {
      const findings = gateDecisionFindings(relFile, { hasSkipGatedTerminal: true, preCheckCount: 0 });
      expect(findings.some((f) => f.includes('zero checks[].when === "pre"')), findings.join('\n')).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. The real loop — empty today, one entry per landed pilot
// ---------------------------------------------------------------------------

describe('§5.2 conformance — every converted step', () => {
  it(`the enforcement scope is ${CONVERTED.length} of ${ALL_STEP_FILES.length} manifest step files`, () => {
    // A named, always-present test so the scope is visible in the reporter output
    // even at zero — an empty describe block just disappears.
    expect(CONVERTED.length).toBeGreaterThanOrEqual(0);
  });

  for (const relFile of CONVERTED) {
    it(`${relFile}`, () => {
      const findings = conformanceFindings(relFile, { expectSlug: slugFor(relFile) });
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 6b. Commit 5 (WF1 cross-step ledger, Spec 122 §6, LDG-4) — tier 3 for
//     converted steps: does the descriptor's OWN `inputs.reads.steps[]`
//     agree with what the column-lineage ledger derives?
//
// R-V's seam pass (scripts/lib/step/seam.js) already derives converted<->
// converted EDGES from this same `inputs.reads.steps[]` array — but it
// TRUSTS the array; it has no independent way to tell whether the array
// itself is complete. This cross-check is the independent check: it derives
// upstream producers from COLUMN OVERLAP (scripts/lib/ledger.js#stepUpstreams)
// and compares that against what's actually declared.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledger = require(path.join(REPO_ROOT, 'scripts/lib/ledger.js')) as {
  stepUpstreams: (slug: string, opts: { chain: string; env?: Record<string, string | undefined> }) => string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seam = require(path.join(REPO_ROOT, 'scripts/lib/step/seam.js')) as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadConvertedDescriptors: () => Record<string, { descriptor: any; slug: string; relFile: string }>;
};

interface LdgDescriptorLite {
  identity: { name: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execution?: any;
  inputs: { reads: { steps: { step: string }[] } };
}

/** The chains a descriptor runs in — Object.keys(execution.invocation), mirroring staleness.js#deriveLedgerSlugs (never hand-copied). */
function ldgDerivedChains(descriptor: LdgDescriptorLite): string[] {
  const inv = descriptor.execution && descriptor.execution.invocation;
  return inv && inv !== 'none' ? Object.keys(inv) : [];
}

/**
 * The UNION, across every chain a descriptor runs in, of `stepUpstreams`'
 * derived producers, restricted to `convertedNames` (excluding self).
 * `inputs.reads.steps[]` is declared ONCE per descriptor — flat, chain-
 * agnostic — so it must be compared against the UNION of what's derivable
 * across every chain, not chain-by-chain: a chain-by-chain compare produces
 * a FALSE positive on link_massing/permits (measured 2026-09-03) —
 * compute_centroids never RUNS in the 'permits' chain, so a strict per-chain
 * restriction wrongly excludes it there even though link_massing's permits
 * invocation still reads the SAME parcels.centroid_lat/centroid_lng column
 * compute_centroids wrote during a 'sources' run (chains are scheduling
 * contexts, not table partitions — a column written in one chain is real
 * data every other chain's queries can see).
 */
function ldgDerivedConvertedUnion(
  name: string,
  chains: string[],
  convertedNames: Set<string>,
  opts?: { env?: Record<string, string | undefined> },
): string[] {
  const union = new Set<string>();
  for (const chain of chains) {
    const stepUpstreamsOpts = opts?.env ? { chain, env: opts.env } : { chain };
    for (const p of ledger.stepUpstreams(name, stepUpstreamsOpts)) union.add(p);
  }
  return [...union].filter((p) => convertedNames.has(p) && p !== name);
}

/**
 * SUPERSET + EQUALITY (Fold C, DeepSeek #6) for one descriptor: SUPERSET
 * alone is structurally blind to a LEDGER-side omission (shrinking the
 * derived set only makes SUPERSET easier to pass), so EQUALITY on the SAME
 * converted-producer-restricted sets closes that gap.
 */
function ldgConformance(
  name: string,
  descriptor: LdgDescriptorLite,
  convertedNames: Set<string>,
  opts?: { env?: Record<string, string | undefined> },
): { missing: string[]; extra: string[] } {
  const chains = ldgDerivedChains(descriptor);
  const declaredSteps = new Set((descriptor.inputs.reads.steps || []).map((s) => s.step));
  const declaredConverted = [...declaredSteps].filter((p) => convertedNames.has(p));
  const derivedConverted = ldgDerivedConvertedUnion(name, chains, convertedNames, opts);
  const missing = derivedConverted.filter((p) => !declaredSteps.has(p)); // SUPERSET violations
  const extra = declaredConverted.filter((p) => !derivedConverted.includes(p)); // EQUALITY-only violations
  return { missing, extra };
}

describe('LDG-4 — descriptor <-> ledger cross-check (SUPERSET + EQUALITY, converted-producer-restricted)', () => {
  const byName = seam.loadConvertedDescriptors();
  const convertedNames = new Set(Object.keys(byName));

  /**
   * Two genuine, MEASURED findings on the real 8 (2026-09-03), each filed in
   * `docs/reports/review_followups.md` and asserted EXACTLY here — never a
   * silent skip. A WIDENING of either gap still REDs (a new undeclared
   * dependency); a fix that shrinks a gap to `[]` ALSO reds (forcing this
   * allowlist to be updated, not left stale — same discipline LM-D6/LM-D11
   * exists to enforce for programme-item promises).
   *
   *   · `link_parcels` (HIGH, split disposition LDG-D1, WF3
   *     `wf3_link_parcels_declared_reads`, 2026-09-03) — was `steps: []`
   *     omitting BOTH ledger-derived producers; now DECLARES
   *     `link_parcel_addresses` (genuine, load-bearing —
   *     `scripts/lib/compute/link-parcels.js:120` JOINs
   *     `parcel_address_points`, Strategy 1a's entire bridge — G5/G12) and
   *     narrows the remaining gap to `compute_centroids` alone.
   *     `compute_centroids`'s shared columns (`parcels.centroid_lat`/
   *     `centroid_lng`) are a STALE-LEDGER artifact, not a live dependency:
   *     `grep -c "centroid_lat\|centroid_lng" scripts/lib/compute/link-parcels.js`
   *     is 0 (G3) — Strategy 3 Step 2's KNN fix (`b37087f3`) replaced the
   *     centroid-nearest join with `pa.geom <-> …` entirely, and
   *     `lineage-meta-snapshot.json`'s `inchain.link_parcels.reads.parcels`
   *     still lists those two columns only because no post-fix run has
   *     completed anywhere to refresh it (G4) — re-verified live this WF
   *     (2026-09-03): the snapshot still lists them, so this row stays
   *     narrowed, not deleted, per the plan's own S1 abort condition.
   *     Routed to the standing snapshot-freshness followup
   *     (`review_followups.md:17`, filed 2026-09-03) — a completed post-fix
   *     run + `generate-lineage-docs.mjs --refresh` is what finally drops
   *     the columns and lets this row go to `[]`. Declaring
   *     `link_parcel_addresses` changes live `ledgerGatedSkip`
   *     staleness-gating behavior for a converted LINK step (`version_pin:
   *     "gte"`, matching all 4 sibling descriptors) — reviewed and landed
   *     under this WF, not a drive-by.
   *   · `refresh_snapshot` (LOW, documented limitation, not a defect) —
   *     declares 3 converted upstream steps the ledger's column-overlap
   *     derivation does not find, because a RECORDER's dependency on them is
   *     an ORDERING/lifecycle wait ("snapshot after these complete"), not a
   *     shared-COLUMN data read — the ledger can only derive the latter.
   *
   * **This is NOT a Spec 124 Rule 9 / R-I.2 grandfather.** R-I.2 governs a
   * BANNED write shape shipped with a dated, SHA-anchored, named-approver
   * ledger entry (`scripts/steps/_schema/grandfathered.json`, read by
   * `assertGrandfathered`) — an exception to a policy rule. `KNOWN_GAPS` is a
   * MEASURED-GAP allowlist: both rows are pre-existing descriptor/ledger
   * mismatches found by this WF's own Execution Plan Step 5 (commit 5, the
   * LDG-4 cross-check, `.cursor/wf1_cross_step_ledger_active_task.md`), each
   * filed in `review_followups.md` (measured 2026-09-03) rather than fixed
   * here (fixing either changes live `ledgerGatedSkip` staleness-gating
   * behavior for a converted step, out of scope for a plumbing-only WF).
   * `toEqual` below locks it EXACT — both a widening (a new undeclared
   * dependency) and a narrowing (a fix landing) RED, so neither can drift
   * silently. Defect Ledger (`docs/reports/defect-ledger.md`): `link_parcels`
   * = `LDG-D1`, `refresh_snapshot` = `LDG-D2`.
   */
  const KNOWN_GAPS: Record<string, { missing: string[]; extra: string[] }> = {
    link_parcels: { missing: ['compute_centroids'], extra: [] }, // LDG-D1 (narrowed, split disposition, 2026-09-03: link_parcel_addresses now declared)
    refresh_snapshot: { missing: [], extra: ['link_massing', 'link_parcels', 'link_wsib'] }, // LDG-D2
  };

  for (const [name, { descriptor }] of Object.entries(byName)) {
    it(`${name} — declared inputs.reads.steps[] vs the ledger-derived converted-producer set`, () => {
      const { missing, extra } = ldgConformance(name, descriptor, convertedNames);
      const known = KNOWN_GAPS[name] || { missing: [], extra: [] };
      expect(
        missing.slice().sort(),
        `${name}: SUPERSET — declared inputs.reads.steps[] is missing ${missing.join(', ') || '(none)'} (known gap: ${known.missing.join(', ') || '(none)'})`,
      ).toEqual(known.missing.slice().sort());
      expect(
        extra.slice().sort(),
        `${name}: EQUALITY — declared ${extra.join(', ') || '(none)'} that the ledger does not derive (known gap: ${known.extra.join(', ') || '(none)'})`,
      ).toEqual(known.extra.slice().sort());
    });
  }
});

describe('LDG-4 fixture proofs (the cross-check genuinely detects a regression, not vacuous)', () => {
  const FIXTURE_ENV = { BUILDO_LEDGER_SNAPSHOT_PATH: 'src/tests/fixtures/ledger-snapshot.fixture.json' };
  const MISSING_PRODUCER_ENV = { BUILDO_LEDGER_SNAPSHOT_PATH: 'src/tests/fixtures/ledger-snapshot-missing-producer.fixture.json' };
  const FIXTURE_CONVERTED = new Set(['fixture_consumer', 'fixture_producer_a', 'fixture_producer_b']);
  const fixtureDescriptor = (steps: string[]): LdgDescriptorLite => ({
    identity: { name: 'fixture_consumer' },
    execution: { invocation: { sources: {} } },
    inputs: { reads: { steps: steps.map((step) => ({ step })) } },
  });

  it('SUPERSET fails when a real converted producer is dropped from inputs.reads.steps[] (mirrors: dropping compute_centroids from link_massing\'s reads)', () => {
    const { missing } = ldgConformance('fixture_consumer', fixtureDescriptor(['fixture_producer_a']), FIXTURE_CONVERTED, { env: FIXTURE_ENV });
    expect(missing).toEqual(['fixture_producer_b']);
  });

  it('SUPERSET passes when both real producers are declared', () => {
    const { missing } = ldgConformance('fixture_consumer', fixtureDescriptor(['fixture_producer_a', 'fixture_producer_b']), FIXTURE_CONVERTED, { env: FIXTURE_ENV });
    expect(missing).toEqual([]);
  });

  it('EQUALITY (DeepSeek #6) catches a LEDGER-side omission that SUPERSET alone cannot: a fixture snapshot with a producer\'s write removed', () => {
    const { missing, extra } = ldgConformance('fixture_consumer', fixtureDescriptor(['fixture_producer_a', 'fixture_producer_b']), FIXTURE_CONVERTED, { env: MISSING_PRODUCER_ENV });
    // SUPERSET is structurally blind here: the SHRUNK derived set is
    // [fixture_producer_a] only, a subset of the still-fully-declared pair,
    // so superset trivially passes.
    expect(missing).toEqual([]);
    // EQUALITY catches it: declared still names fixture_producer_b, the
    // (shrunk) derived set no longer does.
    expect(extra).toEqual(['fixture_producer_b']);
  });

  it('EQUALITY passes on the matched pair (both directions proven; the real GREEN case)', () => {
    const { missing, extra } = ldgConformance('fixture_consumer', fixtureDescriptor(['fixture_producer_a', 'fixture_producer_b']), FIXTURE_CONVERTED, { env: FIXTURE_ENV });
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. LW-D8 — database.min_migration is a COUNT floor, never a filename number
// ---------------------------------------------------------------------------
//
// scripts/lib/resolve-db.js assertDbTarget compares min_migration against
// COUNT(*) FROM schema_migrations (operator ruling P0, 9e2da7b1) — never a
// migration file's filename number. The migrations/ sequence carries historical
// filename gaps (43, 49, 50, 158 among them), so a min_migration written as a
// filename is structurally >= its true COUNT position and the floor can become
// permanently unreachable (link-wsib.descriptor.json:448 shipped exactly this:
// 243, the filename of 243_wsib_unlinked_partial_index.sql, instead of 240, that
// migration's position in the sorted migrations/ listing — the step refused to
// run against a fully-migrated database forever). This is a static, no-DB check:
// it bounds every declared min_migration by the number of *.sql files that
// exist, which can only ever be >= the live COUNT.

describe('database.min_migration — COUNT floor, never a filename number (LW-D8)', () => {
  const MIGRATIONS_DIR = path.join(REPO_ROOT, 'migrations');
  const MIGRATION_FILE_COUNT = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;

  it(`sanity: migrations/ holds at least one *.sql file (found ${MIGRATION_FILE_COUNT})`, () => {
    expect(MIGRATION_FILE_COUNT).toBeGreaterThan(0);
  });

  it('the schema declares the COUNT semantics by name, not tribal knowledge', () => {
    const schemaObj = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as {
      properties?: { database?: { properties?: { min_migration?: { description?: string } } } };
    };
    const desc = schemaObj.properties?.database?.properties?.min_migration?.description;
    expect(desc, 'no properties.database.properties.min_migration.description found in step.schema.json').toBeTruthy();
    expect(desc ?? '', 'min_migration description must name the COUNT semantics').toContain('COUNT');
  });

  const IN_SCOPE = [...CONVERTED, ...PENDING_FILES];

  it('at least one descriptor is in scope (else the per-file loop below is vacuous)', () => {
    expect(IN_SCOPE.length).toBeGreaterThan(0);
  });

  for (const relFile of IN_SCOPE) {
    it(`${relFile} — database.min_migration <= migrations/ file count (${MIGRATION_FILE_COUNT})`, () => {
      const descriptorRel = `${relFile.slice(0, -3)}.descriptor.json`;
      // R-K.1: a `red_suite`-stage pending file has no descriptor yet by design —
      // nothing to check here until the stage advances to `shape_clean`.
      if (!fs.existsSync(path.join(REPO_ROOT, descriptorRel))) return;
      const descriptor = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, descriptorRel), 'utf8')) as {
        database?: 'none' | { min_migration?: number | 'none' };
      };
      const db = descriptor.database;
      if (db === 'none' || db === undefined) return; // no DB floor declared — nothing to check
      const floor = db.min_migration;
      if (floor === 'none' || floor === undefined) return;
      expect(
        floor,
        `${relFile}: min_migration ${floor} exceeds the ${MIGRATION_FILE_COUNT} *.sql files in migrations/ — ` +
          `it is a COUNT floor, not a filename number (LW-D8)`,
      ).toBeLessThanOrEqual(MIGRATION_FILE_COUNT);
    });
  }
});

// ---------------------------------------------------------------------------
// R-R (2026-08-29) / Rule 13 — "a step validates itself": the generated
// scorecard block committed in each assessment report must not be stale.
//
// ⚠️ WHY THIS SPAWNS `step:validate --fast`, NEVER THE FULL (non-fast) MODE.
// The full mode spawns `npx vitest run src/tests/step-conformance.infra.test.ts
// ...` — this VERY FILE. Calling that from INSIDE a describe block that is
// itself running as part of an outer `npx vitest run` of this same file is an
// unbounded recursion (the nested process re-executes this describe block,
// which spawns another nested process, forever) — measured, not theoretical:
// the first draft of this lock did exactly that. `--fast` never touches
// vitest, so it cannot recurse.
//
// SCOPE, stated precisely rather than pretended away: G0-G8's scores, G9,
// G4d, G-shape, and the Fast Invariants + Captures sections are proven
// vitest-INDEPENDENT (every scoring function reads the report/ledger/notes/
// captures/descriptor, never a vitest result) — `--fast` output for THOSE
// sections is asserted byte-identical to the committed block. The "Test
// suite" line and the "Policy coverage matrix" table DO depend on real
// vitest results (Rules 2/3/11/12) and are deliberately NOT compared here —
// their currency is `--all --write`'s job (Spec 123 §7 commit 9), not a
// vitest-internal lock that would have to recurse into itself to check them.
describe('R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections)', () => {
  const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');
  const MARKER = '## Validation scorecard (generated)';
  const TEST_SUITE_HEADING = '### Test suite (item iii)';

  /** The vitest-independent slice: from the marker up to (not including) the Test-suite section. */
  function vitestIndependentSlice(block: string): string {
    const idx = block.indexOf(TEST_SUITE_HEADING);
    return idx === -1 ? block : block.slice(0, idx);
  }

  function reportPathFor(slug: string): string | null {
    const dashSlug = slug.replace(/_/g, '-');
    const dir = path.join(REPO_ROOT, 'docs/reports');
    const hit = fs
      .readdirSync(dir)
      .find((f) => /^\d{4}-\d{2}-\d{2}-pilot\d+-.*-assessment\.md$/.test(f) && f.includes(`-${dashSlug}-assessment.md`));
    return hit ? path.join(dir, hit) : null;
  }

  it('CONVERTED is non-empty (else this whole lock is a vacuous pass)', () => {
    expect(CONVERTED.length).toBeGreaterThan(0);
  });

  for (const relFile of CONVERTED) {
    const slug = slugFor(relFile);
    if (!slug) continue;

    describe(`${relFile} (slug "${slug}")`, () => {
      const reportPath = reportPathFor(slug);

      it('has an assessment report', () => {
        expect(reportPath, `no docs/reports/*-${slug.replace(/_/g, '-')}-assessment.md found`).not.toBeNull();
      });

      it('report carries exactly one generated scorecard block', () => {
        if (!reportPath) return;
        const text = fs.readFileSync(reportPath, 'utf8');
        const count = text.split(MARKER).length - 1;
        expect(count, `${slug}: expected exactly one "${MARKER}" block, found ${count}`).toBe(1);
      });

      it('the committed block\'s vitest-independent sections equal a fresh `step:validate --fast` run', () => {
        if (!reportPath) return;
        const committed = fs.readFileSync(reportPath, 'utf8');
        const committedIdx = committed.indexOf(MARKER);
        expect(committedIdx, `${slug}: no "${MARKER}" block found`).toBeGreaterThanOrEqual(0);
        const committedBlock = committed.slice(committedIdx);

        const run = spawnSync('node', [STEP_VALIDATE, `--step=${slug}`, '--fast'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        const stdout = run.stdout || '';
        const freshIdx = stdout.indexOf(MARKER);
        expect(freshIdx, `${slug}: step:validate --fast produced no scorecard block; stderr=${run.stderr}`).toBeGreaterThanOrEqual(0);
        const freshBlock = stdout.slice(freshIdx);

        expect(
          vitestIndependentSlice(freshBlock).trim(),
          `${slug}: the committed scorecard's vitest-independent sections (score, G0-G8, G9/G4d/G-shape, ` +
            `fast invariants, captures) drifted from a fresh --fast run — regenerate with ` +
            `\`node scripts/analysis/step-validate.mjs --step=${slug} --write\``,
        ).toBe(vitestIndependentSlice(committedBlock).trim());
      });

      it('the committed block also carries a Test-suite line and a 14-row Policy coverage matrix (presence only — content is `--all --write`\'s job, not this lock\'s)', () => {
        if (!reportPath) return;
        const committed = fs.readFileSync(reportPath, 'utf8');
        expect(committed).toContain(TEST_SUITE_HEADING);
        expect(committed).toContain('### Policy coverage matrix (item vi)');
        const matrixSection = committed.slice(committed.indexOf('### Policy coverage matrix (item vi)'));
        const rows = matrixSection.split('\n').filter((l) => /^\|\s*(?:\d+|P3)\s*\|/.test(l.trim()));
        expect(rows.length, `${slug}: expected 14 policy-matrix rows (Rules 1-13 + P3), found ${rows.length}`).toBe(14);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Rule 10 (Spec 124 §2 Rule 10, WF2 "Rules 10/11/12 mechanical checkers", C1)
// — checkVerdictSingleSource, exercised two ways per the file's own testing
// convention (step-validate.mjs runs its own CLI unconditionally at import
// time, so it cannot be `import`ed directly — see programme-backlog.infra.
// test.ts's own note on this): (1) `--self-test-only` spawns the REAL tool,
// which runs `selfTest()` unconditionally BEFORE anything else — a failing
// RED/GREEN assertion there throws and exits 2, so a passing spawn IS the
// both-directions proof (Spec 121 §12b.6); (2) a real `--step` run's
// stdout is asserted to carry the KNOWN-DEFECT-pinned enforced-red row,
// end-to-end against the live corpus (not a fixture).
// ---------------------------------------------------------------------------
describe('Rule 10 — verdict is row-derived from exactly one place (checkVerdictSingleSource)', () => {
  const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');

  it('`--self-test-only` passes — the RED/GREEN in-memory proofs for findVerdictDerivationSites and checkSelfSkipNeverPass all fire correctly', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--self-test-only'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `self-test did not pass; stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('self-test PASSED');
  });

  it('a real `--step` run reports Rule 10 as enforced-red, KNOWN-DEFECT-pinned, with zero unsanctioned second derivations across the live VERDICT_LIBRARY_CORPUS', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--step=assert_schema', '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*10\s*\|/.test(l.trim())) || '');
    expect(row, `no Rule 10 matrix row found; stdout=${run.stdout}`).not.toBe('');
    expect(row).toContain('enforced-red');
    expect(row).toContain('0 unsanctioned second derivations');
    expect(row).toContain('KNOWN-DEFECT');
    expect(row).toContain('review_followups.md');
    expect(row).toContain('VRD-SKIP');
  });

  // WF3 "Rules 10-12 output panel remediation" commit 3 — Rule 10's own
  // checker (checkNoSecondDerivation, above) has NEVER been proven to fire on
  // a genuine unsanctioned site (Spec 121 §12b.6) — the assertion above only
  // proves the live corpus reads CLEAN, which is also what a checker that
  // never looks would report. `BUILDO_VERDICT_CORPUS_EXTRA` (the same
  // additive, test-only env-override convention as
  // `BUILDO_PROGRAMME_ITEMS_PATH`/`BUILDO_CHURN_TABLE_PATH`) fixtures a
  // committed, never-`require()`'d known-bad file into the SCANNED corpus —
  // no live corpus file is ever edited. Both directions: the fixture reds
  // with an exact `file:line` citation; the SAME run's 2 sanctioned hits
  // (pipeline.js's escalate-only recompute + source-version.js's routed
  // call) still pass, proving the override is additive, not a replacement
  // that silently narrows what the real 11-file corpus is scored against.
  it('BUILDO_VERDICT_CORPUS_EXTRA fixtures an unsanctioned verdict cascade — checkNoSecondDerivation reds it with an exact file:line citation, and the sanctioned sites in the real corpus still pass', () => {
    const FIXTURE_REL = 'scripts/steps/_schema/fixtures/verdict-corpus/unsanctioned-cascade.js';
    const run = spawnSync('node', [STEP_VALIDATE, '--step=assert_schema', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, BUILDO_VERDICT_CORPUS_EXTRA: FIXTURE_REL },
    });
    // Status is 0 OR 1 here, never 2 (a crash): once Rule 13's hard-stop
    // wiring (WF3 commit 4, computeMatrixHardStop) lands, THIS fixture's own
    // injected unsanctioned cascade is exactly the unpinned enforced-red case
    // that wiring exists to catch, so a hard-stop exit (1) here is a CORRECT
    // side effect proving the two mechanisms compose, not a failure of
    // either — the assertions below check the Rule 10 row's own content,
    // which is what this test is actually about.
    expect(run.status, `crashed; stdout=${run.stdout}\nstderr=${run.stderr}`).not.toBe(2);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*10\s*\|/.test(l.trim())) || '');
    expect(row, `no Rule 10 matrix row found; stdout=${run.stdout}`).not.toBe('');
    expect(row).toContain('enforced-red');
    expect(row).toContain('FAILED');
    // The exact fixture file + line — a checker that reports SOME violation
    // but not THIS one, or that reports it without a line number, has not
    // actually been proven to fire correctly.
    expect(row).toContain(`${FIXTURE_REL}:31`);
  });

  it('the SAME sanctioned sites still pass with no override at all — the fixture above is additive, never a narrowing of the real corpus', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--step=assert_schema', '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*10\s*\|/.test(l.trim())) || '');
    expect(row).toContain('0 unsanctioned second derivations');
    expect(row).toContain('2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES');
  });
});

// ---------------------------------------------------------------------------
// Rule 11 (Spec 124 §2 Rule 11, WF2 "Rules 10/11/12 mechanical checkers", C2)
// — checkOrderGuaranteesCited, exercised the same two ways as Rule 10 above
// (step-validate.mjs cannot be `import`ed directly). The `--self-test-only`
// spawn proves the RED/GREEN in-memory halves; the real `--step` runs prove
// the disk-reading path against all three real descriptors that carry a
// when:"pre_write" check.
// ---------------------------------------------------------------------------
describe('Rule 11 — phase-order re-derivation, declared half (checkOrderGuaranteesCited)', () => {
  const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');

  it('`--self-test-only` passes — the RED/GREEN in-memory proofs for checkOrderGuaranteesCited all fire correctly', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--self-test-only'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `self-test did not pass; stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('self-test PASSED');
  });

  it('a step with NO when:"pre_write" checks reports Rule 11 enforced-green, vacuously', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--step=assert_schema', '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*11\s*\|/.test(l.trim())) || '');
    expect(row, `no Rule 11 matrix row found; stdout=${run.stdout}`).not.toBe('');
    expect(row).toContain('enforced-green');
    expect(row).toContain('vacuously nothing to cite');
  });

  it.each([
    ['load_ravines', 2],
    ['link_massing', 1],
    ['link_wsib', 1],
  ])('%s: %d real when:"pre_write" check(s) each carry a live, non-rotted order_guarantee — Rule 11 enforced-green', (slug, count) => {
    const run = spawnSync('node', [STEP_VALIDATE, `--step=${slug}`, '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    // Exit status is 0 (clean) OR 1 (Rule 13 hard-stop, WF3 commit 4) — NEVER
    // 2 (an uncaught exception/crash). `link_wsib` is expected to exit 1
    // here: its own Rule 4 row is a genuine, unpinned enforced-red (LW-D21,
    // pending operator ruling) UNRELATED to Rule 11, which this test scopes
    // to by asserting the Rule 11 row's own content below, not the process's
    // overall exit code.
    expect(run.status, `crashed; stdout=${run.stdout}\nstderr=${run.stderr}`).not.toBe(2);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*11\s*\|/.test(l.trim())) || '');
    expect(row, `no Rule 11 matrix row found; stdout=${run.stdout}`).not.toBe('');
    expect(row).toContain('enforced-green');
    expect(row).toContain(`${count} when:"pre_write" check(s), 0 order_guarantee violation(s)`);
  });
});

// ---------------------------------------------------------------------------
// Rule 12 (Spec 124 §2 Rule 12, WF2 "Rules 10/11/12 mechanical checkers", C3)
// — checkInterruptedPostureTruthful + runnerReachability, exercised the same
// two ways as Rules 10/11 above. The BEHAVIOURAL half (a real SIGTERM against
// a real link_wsib process) lives separately in
// src/tests/db/step-crash-posture.db.test.ts (BUILDO_TEST_DB=1) — this suite
// covers the STATIC half only.
// ---------------------------------------------------------------------------
describe('Rule 12 — truthful crash posture, static half (checkInterruptedPostureTruthful)', () => {
  const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');

  it('`--self-test-only` passes — the RED/GREEN in-memory proofs for checkInterruptedPostureTruthful and runnerReachability all fire correctly', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--self-test-only'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `self-test did not pass; stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('self-test PASSED');
  });

  it('a step with recovery.interrupted "none" reports Rule 12 enforced-green, with no reachability claim to verify', () => {
    const run = spawnSync('node', [STEP_VALIDATE, '--step=load_ravines', '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `stdout=${run.stdout}\nstderr=${run.stderr}`).toBe(0);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*12\s*\|/.test(l.trim())) || '');
    expect(row, `no Rule 12 matrix row found; stdout=${run.stdout}`).not.toBe('');
    expect(row).toContain('enforced-green');
    expect(row).toContain('no reachability claim to verify');
  });

  it.each([
    ['link_massing', 'link', 'runLinkPhase'],
    ['link_wsib', 'cascade', 'runCascadePhase'],
    ['link_parcels', 'link_keyed', 'runLinkKeyedPhase'],
  ])('%s: shape=%s declares force_full_on_next_run and its runner (%s) is measured REACHABLE against the live scripts/lib/step/index.js', (slug, shape, fnName) => {
    const run = spawnSync('node', [STEP_VALIDATE, `--step=${slug}`, '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    // See the Rule 11 it.each above (same file, same reason) — `link_wsib`
    // legitimately exits 1 (Rule 13 hard-stop, WF3 commit 4) on its own
    // unrelated Rule 4 red; only a crash (status 2) is disallowed here.
    expect(run.status, `crashed; stdout=${run.stdout}\nstderr=${run.stderr}`).not.toBe(2);
    const row = (run.stdout.split('\n').find((l) => /^\|\s*12\s*\|/.test(l.trim())) || '');
    expect(row, `no Rule 12 matrix row found; stdout=${run.stdout}`).not.toBe('');
    expect(row).toContain('enforced-green');
    expect(row).toContain(`shape=${shape} runner=${fnName}`);
  });
});

// ---------------------------------------------------------------------------
// GAP G-1 (Spec 124 SS2 Rule 1) — a new schema field requires a declared
// x-ruling, checked by shelling generate-schema-baseline.mjs --check (the
// "shell the generator's own --check" pattern, Spec 123 SS4.5).
// ---------------------------------------------------------------------------
describe('G-1 — new schema fields require x-ruling (schema-baseline ratchet)', () => {
  const GENERATOR = path.join(REPO_ROOT, 'scripts/steps/_schema/generate-schema-baseline.mjs');
  const REAL_SCHEMA = path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json');
  const REAL_BASELINE = path.join(REPO_ROOT, 'scripts/steps/_schema/schema-baseline.json');

  it('the generator\'s own self-test passes (proves the checker fires before trusting it, Spec 121 SS12b.6)', () => {
    const run = spawnSync('node', [GENERATOR, '--self-test'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `stdout=${run.stdout} stderr=${run.stderr}`).toBe(0);
  });

  it('the REAL schema passes --check clean (every new field since the baseline carries x-ruling)', () => {
    const run = spawnSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `G-1 violation; stdout=${run.stdout} stderr=${run.stderr}`).toBe(0);
  });

  it('RED — a new field with NO x-ruling fires (known-bad fixture, real CLI, not just the exported function)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-schema-fixture-'));
    const schema = JSON.parse(fs.readFileSync(REAL_SCHEMA, 'utf8'));
    // config's object branch is index 1 of its anyOf ({const:"none"} is index 0) —
    // add a field with no x-ruling at all.
    const configObjectBranch = schema.properties.config.anyOf.find((b: { type?: string }) => b.type === 'object');
    configObjectBranch.properties.__g1_fixture_field_no_ruling = { type: 'string' };
    const badSchemaPath = path.join(dir, 'bad-schema.json');
    fs.writeFileSync(badSchemaPath, JSON.stringify(schema));
    const run = spawnSync('node', [GENERATOR, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, BUILDO_SCHEMA_PATH: badSchemaPath, BUILDO_SCHEMA_BASELINE_PATH: REAL_BASELINE },
    });
    expect(run.status, `the checker did not fire; stdout=${run.stdout}`).toBe(1);
    expect(run.stderr + run.stdout).toContain('config.__g1_fixture_field_no_ruling');
  });

  it('GREEN — the SAME new field WITH a well-formed x-ruling passes (proves the RED case above is about the ruling, not the fixture mechanics)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-schema-fixture-'));
    const schema = JSON.parse(fs.readFileSync(REAL_SCHEMA, 'utf8'));
    const configObjectBranch = schema.properties.config.anyOf.find((b: { type?: string }) => b.type === 'object');
    configObjectBranch.properties.__g1_fixture_field_ruled = {
      type: 'string',
      'x-ruling': { rungs_tried: ['descriptor', 'declared check'], why: 'fixture proving the GREEN path' },
    };
    const goodSchemaPath = path.join(dir, 'good-schema.json');
    fs.writeFileSync(goodSchemaPath, JSON.stringify(schema));
    const run = spawnSync('node', [GENERATOR, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, BUILDO_SCHEMA_PATH: goodSchemaPath, BUILDO_SCHEMA_BASELINE_PATH: REAL_BASELINE },
    });
    expect(run.status, `stdout=${run.stdout} stderr=${run.stderr}`).toBe(0);
  });

  it('the baseline is non-empty and every entry looks like "category.field" (sanity, not a vacuous ratchet)', () => {
    const baseline = JSON.parse(fs.readFileSync(REAL_BASELINE, 'utf8')) as { fields: string[] };
    expect(baseline.fields.length).toBeGreaterThan(0);
    for (const f of baseline.fields) expect(f, `malformed baseline entry: ${f}`).toMatch(/^[a-z_]+\.[a-zA-Z_]+$/);
  });
});

// ---------------------------------------------------------------------------
// PH-2 churn×complexity BATCH artifact (Spec 123 §2/§6, G2, S6b) — the guard
// against the table rotting into a decoration: it must cover every
// manifest.chains.sources slug, its window_end must still be a real ancestor
// of HEAD, and a fresh `--check` (which recomputes every column AT that SHA)
// must exit clean.
// ---------------------------------------------------------------------------
describe('PH-2 churn×complexity BATCH artifact (G2) — coverage + drift', () => {
  const GENERATOR = path.join(REPO_ROOT, 'scripts/analysis/step-churn-complexity.mjs');
  const TABLE_PATH = path.join(REPO_ROOT, 'docs/reports/generated/122-churn-complexity.md');

  /** Local, test-owned parse — deliberately not importing the generator's own
   * parseChurnTable, so a bug shared between generator and consumer can still
   * be caught independently. */
  function parseSlugs(text: string): string[] {
    const slugs: string[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line.startsWith('|') || /^\|[-\s|:]+\|$/.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim());
      const slug = cells[1];
      if (slug && slug !== 'slug') slugs.push(slug);
    }
    return slugs;
  }

  it('the generator\'s own self-test passes (proves the checker fires before trusting it, Spec 121 §12b.6)', () => {
    const run = spawnSync('node', [GENERATOR, '--self-test'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status, `stdout=${run.stdout} stderr=${run.stderr}`).toBe(0);
  });

  it('the REAL table passes --check clean (deterministic re-derivation at its own window_end matches the committed file)', () => {
    const run = spawnSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
    expect(run.status, `G2 artifact drift; stdout=${run.stdout} stderr=${run.stderr}`).toBe(0);
  });

  it('covers every manifest.chains.sources slug — no missing, no extras', () => {
    const text = fs.readFileSync(TABLE_PATH, 'utf8');
    const tableSlugs = new Set(parseSlugs(text));
    const manifestSlugs = new Set<string>(manifest.chains.sources ?? []);
    const missing = [...manifestSlugs].filter((s) => !tableSlugs.has(s));
    const extra = [...tableSlugs].filter((s) => !manifestSlugs.has(s));
    expect(missing, `slugs in manifest.chains.sources with no table row: ${missing.join(', ')}`).toEqual([]);
    expect(extra, `table rows with no manifest.chains.sources slug: ${extra.join(', ')}`).toEqual([]);
  });

  it('window_end is a real ancestor of HEAD (not a rebased/dangling window)', () => {
    const text = fs.readFileSync(TABLE_PATH, 'utf8');
    const m = /window_end:\s*`([0-9a-f]{40})`/.exec(text);
    expect(m, 'no parseable window_end header in the committed table').not.toBeNull();
    const sha = m![1]!;
    const res = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(res.status, `window_end ${sha} is not an ancestor of HEAD`).toBe(0);
  });

  it('RED — a hand-edited row fires --check (known-bad fixture, real CLI, not just the exported function)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-churn-fixture-'));
    const original = fs.readFileSync(TABLE_PATH, 'utf8');
    const tampered = original.replace(/\|\s*bottom-right\s*\|/, '| top-right |');
    expect(tampered, 'fixture setup: no "bottom-right" cell found to tamper with').not.toBe(original);
    const badTablePath = path.join(dir, 'bad-122-churn-complexity.md');
    fs.writeFileSync(badTablePath, tampered);
    const run = spawnSync('node', [GENERATOR, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, BUILDO_CHURN_TABLE_PATH: path.relative(REPO_ROOT, badTablePath) },
    });
    expect(run.status, `the checker did not fire on a hand-edited row; stdout=${run.stdout}`).toBe(1);
    expect(run.stderr + run.stdout).toContain('DRIFT');
  });
});
