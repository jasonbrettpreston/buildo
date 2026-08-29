// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (Condition 2 — the conformance suite)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (Condition 1 — the A2 shape rule)
// SPEC LINK: docs/specs/01-pipeline/121_*.md §12b.6 (a checker that never fires proves nothing)
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
 * `pending` (Spec 123 §3.1 pin-then-add ordering): a file that has already landed
 * the frozen shape (§5.1) but registers in `converted` only at its cutover commit.
 * Declared data, not a code skip — "nothing hidden" (Spec 122/123 policy) means the
 * stage gap is named in the fixture the tests read, not silently exempted in test
 * logic. Each entry is `{file, registers_at, reason, declared}` — all strings.
 */
interface PendingEntry {
  file: string;
  registers_at: string;
  reason: string;
  declared: string;
}
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
  const REQUIRED_KEYS = ['file', 'registers_at', 'reason', 'declared'] as const;

  it('every pending entry is well-formed: exactly the 4 required string keys, no extras', () => {
    for (const raw of PENDING_RAW) {
      const entry = raw as Record<string, unknown>;
      const keys = Object.keys(entry).sort();
      expect(keys, `pending entry ${JSON.stringify(raw)} has an unexpected key set`).toEqual([...REQUIRED_KEYS].sort());
      for (const k of REQUIRED_KEYS) {
        expect(typeof entry[k], `pending entry ${JSON.stringify(raw)}.${k} must be a non-empty string`).toBe('string');
        expect((entry[k] as string).length, `pending entry ${JSON.stringify(raw)}.${k} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('pending entries and converted are mutually exclusive (a file cannot be both staged and registered)', () => {
    const overlap = PENDING_FILES.filter((f) => CONVERTED.includes(f));
    expect(overlap, 'a file in both `pending` and `converted` is either a stale pending entry or a double-registration').toEqual([]);
  });

  it('every pending file is shape-clean AND not yet registered (a dirty or already-registered pending entry is a stale declaration)', () => {
    for (const f of PENDING_FILES) {
      expect(CONVERTED, `pending file ${f} is already in converted.json — the pending entry is stale and must be deleted`).not.toContain(f);
      const findings = conformanceFindings(f);
      expect(findings, `pending file ${f} is declared shape-clean but conformanceFindings() disagrees (stale pending entry)`).toEqual([]);
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
function ctxBuilderKeys(source: string): string[] {
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
  if (!found) throw new Error('no "const ctx = { ... }" object-literal initializer found');
  return found;
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
    expect(keys).toContain('fanin');
    const bogus = keys.filter((k) => !STEP_CTX_KEYS.includes(k));
    expect(bogus, 'the synthetic fixture is supposed to trip the checker').toEqual(['fanin']);
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
    it(`${relFile} — ctx-builder sets only STEP_CTX_KEYS`, () => {
      const source = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8');
      const keys = ctxBuilderKeys(source);
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

/** The admin surface: every numeric key GlobalConfigCard actually renders. */
function groupKeys(): Set<string> {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'src/features/admin-controls/components/GlobalConfigCard.tsx'),
    'utf8',
  );
  const block = /export const GROUPS[\s\S]*?\n\];/.exec(src);
  if (!block) throw new Error('GROUPS block not found in GlobalConfigCard.tsx');
  return new Set([...block[0]!.matchAll(/'([a-z][a-z0-9_]*)'/g)].map((m) => m[1]!));
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

/** Every `ctx.config.<name>` (or bare `config.<name>`, see `CONFIG_READ_RE`) read in already-in-memory source text, comments stripped first. */
function configReadsFromSource(src: string): string[] {
  const stripped = stripComments(src);
  return [...new Set([...stripped.matchAll(CONFIG_READ_RE)].map((m) => m[1]!))];
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
  // The two consumption paths, unioned: what the COMPUTE reads by name, and what the
  // RUNNER resolves out of the descriptor. A variable reached by either is live.
  const runnerConsumed = runnerConsumedVars(relFile);
  const consumed = [...new Set([...computeConsumed, ...runnerConsumed])];

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
      expect(findings.some((f) => f.includes(`ctx.config.${declared[0]}`)), findings.join('\n')).toBe(true);
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
