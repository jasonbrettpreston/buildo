// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §3
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7.2 A5
//
// WF2 hygiene H7 (2026-09-27) — THE CHAIN PRE-DISPATCH STEP, LOCKED STRUCTURALLY.
//
// Each of the five `chain-*.yml` workflows now runs
//   node scripts/analysis/cloud-pre-dispatch.mjs --dry \
//     --only=seed_rows_present,migrations_missing,declared_guards_present,ci_green_for_sha
// as the step IMMEDIATELY AFTER `node scripts/migrate.js --verify`, with
// `permissions: { contents: read, actions: read }` declared for the step's `gh run list`.
//
// Why structural (parsed YAML) and not a regex over the file text: the two things that
// make this step worth having are ORDER (it must run before any chain step, i.e. exactly
// migrate.js --verify + 1) and SET MEMBERSHIP (the four operator-D2 ids, and nothing
// else). A text lock can be satisfied by a commented-out copy, a second step, or a step
// that moved five steps down the file. `js-yaml` + index arithmetic cannot.
//
// RED-PROOF (below): `predispatchIndex(steps)` is pure, and is asserted to return -1 on a
// tampered `steps` array with the step removed — the exact tamper the adjacency assertion
// exists to catch. `onlyIds` and `envKeys`/`envValue` are, the same way, the functions the
// real assertions read through, so a mutation of the parsing helper reddens the suite.
//
// ONE OWNER PER CONCERN. `stranded_running_rows` and `sharing_chain_running` are
// deliberately NOT in `--only`: scripts/reconcile-runs.js and the chain concurrency guard
// (scripts/check-chain-running.js) own those two failures. Asserted in both directions —
// the four required ids present AND the two forbidden ids absent — so re-adding either
// to this step fails the lock rather than silently double-blocking a dispatch.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml') as { load: (src: string) => unknown };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cloudPre = require('../../scripts/analysis/cloud-pre-dispatch.mjs') as unknown as {
  CHECK_IDS: string[];
};

const FILES = [
  'chain-coa-permits',
  'chain-deep-scrapes',
  'chain-entities',
  'chain-sources',
  'chain-wsib',
] as const;

/** The migrated-check step this predispatch step must immediately follow. */
const MIGRATE_VERIFY_RUN = 'node scripts/migrate.js --verify';
/** The step this file is about. */
const PREDISPATCH_SCRIPT = 'cloud-pre-dispatch.mjs';
/** Operator D2's --only set (Spec 123 §7.2 A5), in the order the workflow declares it. */
const EXPECTED_ONLY = ['seed_rows_present', 'migrations_missing', 'declared_guards_present', 'ci_green_for_sha'];
/** Owned elsewhere — reconcile-runs.js / scripts/check-chain-running.js. Never here. */
const FORBIDDEN_ONLY = ['stranded_running_rows', 'sharing_chain_running'];

/** One step as js-yaml parses it. GitHub Actions steps are `{name?, uses?, run?, env?, …}`. */
interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, unknown>;
}

/** A parsed workflow, to the depth this file reads it. */
interface Workflow {
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

function loadWorkflow(name: string): Workflow {
  return yaml.load(
    readFileSync(join(process.cwd(), '.github/workflows', `${name}.yml`), 'utf8'),
  ) as Workflow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — the real assertions read through these, so the RED proof below
// reddens the same code path the GREEN assertions exercise.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Index of the step whose `run` invokes the pre-dispatch script, or -1 when the step
 * is absent. Uses the FIRST match: the step is singular by design, and a second copy
 * is caught by the `--only`/env locks (which read the same step) rather than silently
 * satisfied here.
 */
function predispatchIndex(steps: WorkflowStep[]): number {
  return steps.findIndex((s) => typeof s.run === 'string' && s.run.includes(PREDISPATCH_SCRIPT));
}

/** Index of the `node scripts/migrate.js --verify` step, or -1 when absent. */
function migrateVerifyIndex(steps: WorkflowStep[]): number {
  return steps.findIndex((s) => typeof s.run === 'string' && s.run.includes(MIGRATE_VERIFY_RUN));
}

/** The single job of a chain workflow — these workflows have exactly one, asserted below. */
function soleJob(wf: Workflow): { steps?: WorkflowStep[] } {
  const names = Object.keys(wf.jobs ?? {});
  const name = names[0];
  if (name === undefined) throw new Error('workflow declares no jobs');
  const job = (wf.jobs ?? {})[name];
  if (job === undefined) throw new Error(`job ${name} is not an object`);
  return job;
}

/**
 * The pre-dispatch step itself, by name. Throws when absent — every caller asserts its
 * presence first via `predispatchIndex`, and a silently-undefined read would make every
 * downstream assertion vacuous (the "green because it never looked" failure).
 */
function predispatchStep(steps: WorkflowStep[]): WorkflowStep {
  const step = steps[predispatchIndex(steps)];
  if (step === undefined) throw new Error('the cloud-pre-dispatch step is absent');
  return step;
}

/**
 * The ids selected by the step's `--only=` flag, split on `,`. Empty when the flag is
 * absent — a step with no `--only` resolves to "all seven checks" in the script, which
 * is a different (and here forbidden) contract, so this must return `[]` rather than
 * throw.
 */
function onlyIds(step: WorkflowStep): string[] {
  const value = step.run?.match(/--only=([^\s]*)/)?.[1];
  return value ? value.split(',') : [];
}

/** Whether the step's command line carries the bare `--dry` flag. */
function hasDryFlag(step: WorkflowStep): boolean {
  return /(^|\s)--dry(\s|$)/.test(step.run ?? '');
}

/** The step's env keys, in declaration order. */
function envKeys(step: WorkflowStep): string[] {
  return Object.keys(step.env ?? {});
}

/** One env value as a string (js-yaml may hand back a non-string scalar). */
function envValue(step: WorkflowStep, key: string): unknown {
  return (step.env ?? {})[key];
}

// ─────────────────────────────────────────────────────────────────────────────
// RED PROOF — the helper that the adjacency lock depends on, against a tampered
// `steps` array. Pure function, no file I/O, no fixtures.
// ─────────────────────────────────────────────────────────────────────────────

describe('predispatchIndex — the RED proof (a removed step is not found, and adjacency fails)', () => {
  const realSteps: WorkflowStep[] = [
    { name: 'Guard — environment', run: 'if [ -z "$SUPABASE_DATABASE_URL" ]; then echo fail; fi' },
    { name: 'Pre-flight — migrate.js --verify (runbook rule 2)', run: MIGRATE_VERIFY_RUN },
    {
      name: 'Pre-flight — cloud-pre-dispatch (seeds, migrations, guards, CI green for this SHA)',
      run: `node scripts/analysis/${PREDISPATCH_SCRIPT} --dry --only=${EXPECTED_ONLY.join(',')}`,
    },
    { name: 'Run sources chain', run: 'node scripts/run-chain.js sources' },
  ];

  it('finds the step in the intact array, at migrate --verify + 1', () => {
    expect(predispatchIndex(realSteps)).toBe(2);
    expect(migrateVerifyIndex(realSteps)).toBe(1);
    expect(predispatchIndex(realSteps)).toBe(migrateVerifyIndex(realSteps) + 1);
  });

  it('returns -1 when the step is removed — and THEN the adjacency assertion fails', () => {
    const tampered = realSteps.filter((s) => predispatchIndex([s]) === -1);
    expect(tampered).toHaveLength(3);
    expect(predispatchIndex(tampered)).toBe(-1);
    // The adjacency lock is exactly this comparison: `-1 !== 1 + 1` reddens it.
    expect(() => {
      expect(predispatchIndex(tampered)).toBe(migrateVerifyIndex(tampered) + 1);
    }).toThrow();
  });

  it('is not fooled by a COMMENTED-OUT copy — only `run` is read, never the raw file text', () => {
    // The whole point of parsing: a line `# run: node scripts/analysis/cloud-pre-dispatch.mjs`
    // is not a step and must never satisfy the lock.
    const commented: WorkflowStep[] = [
      { name: 'Pre-flight — migrate.js --verify (runbook rule 2)', run: MIGRATE_VERIFY_RUN },
      { name: 'Pre-flight — cloud-pre-dispatch (DISABLED)', run: 'echo "removed for now"' },
    ];
    expect(predispatchIndex(commented)).toBe(-1);
  });

  it('onlyIds reads the flag it means and yields [] when it is absent', () => {
    expect(onlyIds(realSteps[2] as WorkflowStep)).toEqual(EXPECTED_ONLY);
    expect(onlyIds({ run: `node x.mjs --dry` })).toEqual([]);
  });

  it('hasDryFlag requires the bare flag — `--dry-run` is a different flag and must not satisfy it', () => {
    expect(hasDryFlag(realSteps[2] as WorkflowStep)).toBe(true);
    expect(hasDryFlag({ run: `node x.mjs --dry-run` })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN — the five workflows, one `it.each` row each.
// ─────────────────────────────────────────────────────────────────────────────

describe.each(FILES)('%s.yml — the chain pre-dispatch step (WF2 hygiene H7)', (name) => {
  const wf = loadWorkflow(name);
  const job = soleJob(wf);
  const steps = job.steps ?? [];

  it('declares `permissions: { contents: read, actions: read }` for the step’s `gh run list`', () => {
    expect(wf.permissions).toEqual({ contents: 'read', actions: 'read' });
  });

  it('has exactly one job (the adjacency lock below is only meaningful for a single step list)', () => {
    expect(Object.keys(wf.jobs ?? {})).toHaveLength(1);
  });

  it('runs `cloud-pre-dispatch.mjs` EXACTLY ONE STEP AFTER `migrate.js --verify`', () => {
    const migrateIdx = migrateVerifyIndex(steps);
    const preIdx = predispatchIndex(steps);
    expect(migrateIdx, 'the migrate.js --verify step this one must follow was not found').toBeGreaterThan(-1);
    expect(preIdx, 'the cloud-pre-dispatch step is absent (or only present as a comment)').toBeGreaterThan(-1);
    expect(preIdx, 'the pre-dispatch step drifted away from migrate.js --verify + 1').toBe(migrateIdx + 1);
  });

  it('invokes the script with `--dry` and the operator-D2 `--only` set, deep-equal and ordered', () => {
    const step = predispatchStep(steps);
    expect(hasDryFlag(step)).toBe(true);
    expect(onlyIds(step)).toEqual(EXPECTED_ONLY);
  });

  it('never selects the two checks another mechanism owns (one owner per concern)', () => {
    const ids = onlyIds(predispatchStep(steps));
    for (const forbidden of FORBIDDEN_ONLY) {
      expect(ids, `${forbidden} is owned by reconcile-runs.js / check-chain-running.js, not by this step`).not.toContain(forbidden);
    }
  });

  it('declares the four anchor env keys, with GH_TOKEN reading the workflow token (never a PAT)', () => {
    const step = predispatchStep(steps);
    const keys = envKeys(step);
    for (const key of ['PIPELINE_CHAIN', 'SUPABASE_DATABASE_URL', 'SUPABASE_CA_CERT_PATH', 'GH_TOKEN']) {
      expect(keys, `${key} is missing from the pre-dispatch step's env`).toContain(key);
    }
    expect(envValue(step, 'GH_TOKEN')).toBe('${{ github.token }}');
  });

  it('every selected `--only` id is a real CHECK_IDS id in the script (the lock cannot name a phantom check)', () => {
    for (const id of onlyIds(predispatchStep(steps))) {
      expect(cloudPre.CHECK_IDS).toContain(id);
    }
  });

  it('does not run the pre-dispatch step on `always()`/`continue-on-error` — a FAIL must stop the job', () => {
    // The step's entire value is the exit code: a FAIL must refuse the dispatch before
    // any chain step runs. `continue-on-error: true` would render the FAIL green.
    const step = predispatchStep(steps) as WorkflowStep & { 'continue-on-error'?: unknown; if?: string };
    expect(step['continue-on-error']).toBeUndefined();
    expect(step.if).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The set is exhaustive — a SIXTH chain workflow may not silently ship without it.
// ─────────────────────────────────────────────────────────────────────────────

describe('the five chain workflows are all covered (a new one must not ship unwired)', () => {
  it('FILES is exactly the set of .github/workflows/chain-*.yml on disk', () => {
    const onDisk = readdirSync(join(process.cwd(), '.github/workflows'))
      .filter((f) => /^chain-.*\.yml$/.test(f))
      .map((f) => f.replace(/\.yml$/, ''))
      .sort();
    expect(onDisk).toEqual([...FILES].sort());
  });

  it('each covered file exists, parses, and its step is found', () => {
    for (const name of FILES) {
      const wf = loadWorkflow(name);
      expect(predispatchIndex(soleJob(wf).steps ?? []), `${name}.yml is not wired`).toBeGreaterThan(-1);
    }
  });
});
