// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §6
//
// Logic locks for the step-edit PreToolUse hook (`scripts/hooks/step-registry-context.sh` +
// `scripts/hooks/step-registry-context.mjs`, brief gtf-14; the hook contract is the same brief,
// the derivation it renders is .cursor/engine-briefs/gtf-00-contract.md §B).
//
// Written red-first (the hook files did not exist).
//
// What is locked:
//   1. a relative step path, through the node hook, emits hookSpecificOutput/additionalContext
//      carrying exactly renderStepEntry's text — and NEVER a permissionDecision (this hook
//      informs; it never allows or denies).
//   2/6. the bash prefilter's RAW stdin is what the node hook must parse: an absolute
//      backslash-escaped path (JSON-escaped `\\`) and a step-test path both reach the
//      same renderStepEntry context.
//   3. a frontend component path is NOT a step: both entry points print nothing, exit 0.
//   4. malformed / empty stdin is swallowed: nothing printed, exit 0 (a hook bug must never
//      block a read).
//   5. the per-session dedupe marker: the FIRST touch renders the full entry, the SECOND is one
//      short line pointing back at `npm run step:registry`.
import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as reg from '../../scripts/analysis/gates/step-registry.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const inputs = reg.loadRegistryInputs(REPO_ROOT);

/**
 * The entry the hook must render for the `parcels` row — computed through the same derivation the
 * hook uses, so the assertion is parity with the registry, not a hard-coded snapshot.
 */
const parcelsRow = reg.registryRows(inputs).find((r: { slug: string }) => r.slug === 'parcels');
const entry: string = reg.renderStepEntry(parcelsRow!, inputs);

/** Temp marker root (`BUILDO_STEP_REGISTRY_TMP` is TEST-ONLY), removed in `afterAll`. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srh-'));

/**
 * A throwaway PATH directory holding a fake `node` that only touches `$NODE_PROBE_MARKER` (F5). The
 * bash prefilter must consult the path BEFORE it decides to spawn node at all, so the marker is a
 * witness that the spawn happened. Created in the prefilter describe's `beforeAll`.
 */
let probeDir = '';

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (probeDir) fs.rmSync(probeDir, { recursive: true, force: true });
});

/**
 * Run the node half of the hook in a real child process, feeding it one raw stdin payload.
 * `BUILDO_STEP_REGISTRY_TMP` redirects the dedupe markers into this suite's temp dir.
 */
function runMjs(payload: string) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/hooks/step-registry-context.mjs')], {
    cwd: REPO_ROOT,
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, BUILDO_STEP_REGISTRY_TMP: tmp },
  });
}

/** Run the bash prefilter exactly as `.claude/settings.json` wires it — same raw stdin. */
function runSh(payload: string) {
  return spawnSync('bash', ['scripts/hooks/step-registry-context.sh'], {
    cwd: REPO_ROOT,
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, BUILDO_STEP_REGISTRY_TMP: tmp },
  });
}

/** A PreToolUse Read payload for one file path and session. */
function payload(file: string, session: string): string {
  return JSON.stringify({
    session_id: session,
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: file },
  });
}

/** The `hookSpecificOutput` block of a hook stdout payload. */
function ctx(stdout: string): { hookEventName: string; additionalContext: string } {
  return JSON.parse(stdout).hookSpecificOutput;
}

describe('step-registry hook — the node half (gtf-14)', () => {
  it(
    'a relative step path renders the registry entry and never a permission decision',
    { timeout: 30_000 },
    () => {
      const r = runMjs(payload('scripts/load-parcels.js', 's1'));

      expect(r.status, r.stderr).toBe(0);
      const out = ctx(r.stdout);
      expect(out.hookEventName).toBe('PreToolUse');
      expect(out.additionalContext).toContain(entry);
      expect(r.stdout).not.toContain('permissionDecision');
    },
  );

  it(
    'a frontend component is not a step: nothing printed, exit 0',
    { timeout: 30_000 },
    () => {
      const mjs = runMjs(payload('src\\components\\X.tsx', 's3'));
      expect(mjs.status, mjs.stderr).toBe(0);
      expect(mjs.stdout).toBe('');

      const sh = runSh(payload('src\\components\\X.tsx', 's3'));
      expect(sh.status, sh.stderr).toBe(0);
      expect(sh.stdout).toBe('');
    },
  );

  it(
    'malformed or empty stdin is swallowed: nothing printed, exit 0',
    { timeout: 30_000 },
    () => {
      for (const bad of [runMjs('not json'), runMjs('{}'), runSh('')]) {
        expect(bad.status, bad.stderr).toBe(0);
        expect(bad.stdout).toBe('');
      }
    },
  );

  it(
    'the second touch of the same step in one session is a one-line "already shown" reminder',
    { timeout: 30_000 },
    () => {
      const first = runMjs(payload('scripts/load-parcels.js', 's5'));
      expect(first.status, first.stderr).toBe(0);
      expect(ctx(first.stdout).additionalContext).toContain(entry);

      const second = runMjs(payload('scripts/load-parcels.js', 's5'));
      expect(second.status, second.stderr).toBe(0);
      const reminder = ctx(second.stdout).additionalContext;

      expect(reminder).not.toContain('\n');
      expect(reminder).toContain('already shown');
      expect(reminder).toContain('npm run step:registry -- parcels');
      expect(reminder.length).toBeLessThan(300);
    },
  );
});

describe('step-registry hook — the bash prefilter (gtf-14)', () => {
  beforeAll(() => {
    probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srh-probe-'));
    const node = path.join(probeDir, 'node');
    fs.writeFileSync(node, '#!/bin/sh\ntouch "$NODE_PROBE_MARKER"\n');
    fs.chmodSync(node, 0o755);
  });

  /**
   * Run the prefilter with OUR `node` first on PATH: the fake binary only touches the marker, so
   * whether the marker exists tells us whether the prefilter bothered to spawn node at all.
   */
  function runShProbe(payload: string, marker: string) {
    return spawnSync('bash', ['scripts/hooks/step-registry-context.sh'], {
      cwd: REPO_ROOT,
      input: payload,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: probeDir + path.delimiter + (process.env.PATH ?? ''),
        NODE_PROBE_MARKER: marker,
      },
    });
  }

  it(
    'an absolute backslash path survives the prefilter and the JSON escaping',
    { timeout: 30_000 },
    () => {
      const file = path.join(REPO_ROOT, 'scripts', 'load-parcels.descriptor.json').split('/').join('\\');
      const r = runSh(payload(file, 's2'));

      expect(r.status, r.stderr).toBe(0);
      expect(ctx(r.stdout).additionalContext).toContain(entry);
    },
  );

  it(
    'a step test path is a step path too',
    { timeout: 30_000 },
    () => {
      const r = runSh(payload('src/tests/steps/parcels/violations.test.ts', 's6'));

      expect(r.status, r.stderr).toBe(0);
      expect(ctx(r.stdout).additionalContext).toContain(entry);
    },
  );

  it(
    'probe control: a step file_path DOES spawn node',
    { timeout: 30_000 },
    () => {
      const m1 = path.join(tmp, 'm1');
      const r = runShProbe(payload('scripts/load-parcels.js', 'p1'), m1);

      // Control for the F5 tests below: the prefilter DOES hand a step path to node, so a missing
      // marker there is evidence about the prefilter, not about the probe harness itself.
      expect(r.status, r.stderr).toBe(0);
      expect(fs.existsSync(m1), 'the prefilter spawned node for a step path').toBe(true);
    },
  );

  it(
    'an Edit whose CONTENT mentions scripts/ but whose file_path is a component spawns no node and prints nothing (F5)',
    { timeout: 30_000 },
    () => {
      const m2 = path.join(tmp, 'm2');
      const editPayload = JSON.stringify({
        session_id: 'p2',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'src/components/X.tsx',
          old_string: 'a',
          new_string: 'see scripts/load-parcels.js and src/tests/steps/parcels/x',
        },
      });
      const r = runShProbe(editPayload, m2);

      expect(r.status, r.stderr).toBe(0);
      expect(String(r.stdout)).toBe('');
      expect(fs.existsSync(m2), 'no node spawn for a component Edit').toBe(false);
    },
  );

  it(
    'the prefilter spawns node with stderr discarded (F5)',
    { timeout: 30_000 },
    () => {
      // A PATH holding no node at all is not portable across Git Bash/CI, so lock the SOURCE
      // contract instead: the only spawn redirects stderr to /dev/null, so a hook crash can never
      // leak noise into the harness's output.
      const script = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/hooks/step-registry-context.sh'),
        'utf8',
      );
      expect(script).toMatch(/node scripts\/hooks\/step-registry-context\.mjs 2>\/dev\/null/);
    },
  );
});
