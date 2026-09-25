// SPEC LINK: docs/specs/00-architecture/08_agents.md §C; docs/specs/01-pipeline/124_step_standard_policy.md Rule 9; docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4
//
// WF3 (2026-09-24) "class-C anti-bypass hardening" — Commit 2 of
// .cursor/wf3_class_c_retract_all_guard_active_task.md. Commit 1 exempted the
// declared class C (`staging_full_replace`) from `buildWritePlan`'s
// retract-all/no-scope throw; that exemption is itself a hole an engine brief
// could exploit ("declare class C, skip the whole-table guard, no adjudication
// required") unless three things are ALSO true:
//   (A) the Rule 9 adjudication ledger (`grandfathered.json`) and the policy
//       file that reserves it (`exec-policy.json`) are both orchestrator-only
//       registries — an engine brief that named them in its write_scope still
//       cannot touch them (PATH_RESERVED, mirroring the existing
//       `scripts/manifest.json` fence in deepseek-exec-fences.infra.test.ts).
//   (B) declaring `write_discipline.class: "staging_full_replace"` is now
//       `x-banned-for-new` in `step.schema.json`, enforced by the SAME
//       construction-time mechanism (`assertGrandfathered`) the `guard` axis
//       already uses — a step is REFUSED at `pipeline.step()` unless its own
//       `grandfathered.json` entry names this exact path+value.
//   (C) `load_centreline` — the one step the operator adjudicated on
//       2026-09-24 — carries that entry and constructs; any other slug
//       declaring the same shape does not.
//
// Every lock below either reads the REAL repo files directly (no throwaway
// fixture needed — the point is to prove the SHIPPED registries/schema/code
// say what this WF3 claims) or drives the real DeepSeek execution engine's
// tool layer against a throwaway repo, the same harness
// deepseek-exec-fences.infra.test.ts uses for every other PATH_RESERVED lock.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT, makeRepo, runEngine, toolTurn, writeBrief, ledgerRecords, cleanupTempDir,
} from './helpers/deepseek-exec-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS step library directly
const pipeline = require(path.join(REPO_ROOT, 'scripts/lib/pipeline.js'));
/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS descriptor + registry files */
const LOAD_RAVINES = require(path.join(REPO_ROOT, 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

const GRANDFATHERED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/grandfathered.json');
const EXEC_POLICY_PATH = path.join(REPO_ROOT, 'scripts/lib/exec-policy.json');
const CLASS_PATH = 'outputs.writes[].write_discipline.class';
const GUARD_PATH = 'outputs.writes[].write_discipline.guard';

function toolCallOf(records: Array<Record<string, unknown>>, tool: string, index = 0) {
  return records.filter((r) => r.kind === 'tool_call' && r.tool === tool)[index] as
    { status?: string; error?: { code: string } } | undefined;
}

/** Builds a class-C descriptor (retract:"all"/scope:"none") under a given `identity.name`. */
function classCDescriptor(slug: string) {
  const d = clone(LOAD_RAVINES) as {
    identity: { name: string; [k: string]: unknown };
    outputs: { writes: Array<Record<string, unknown>> };
    recovery?: Record<string, unknown>;
  };
  const w = d.outputs.writes[0]!;
  (w.write_discipline as Record<string, unknown>).class = 'staging_full_replace';
  (w.write_discipline as Record<string, unknown>).scope = 'none';
  w.retract = 'all';
  d.recovery = { ...(d.recovery ?? {}), interrupted: 'force_full_on_next_run' };
  d.identity.name = slug;
  return d;
}

describe('WF3 class-C anti-bypass hardening (Commit 2, 2026-09-24)', () => {
  describe('item B/D — x-banned-for-new.values names the class path, enforced by assertGrandfathered', () => {
    it('a class-C descriptor WITHOUT a grandfathered.json entry is REFUSED at pipeline.step() construction, naming the path', () => {
      // "fixture_never_grandfathered" is a real, valid slug shape but appears
      // nowhere in scripts/steps/_schema/grandfathered.json.
      const d = classCDescriptor('fixture_never_grandfathered');
      let thrown: Error | undefined;
      try {
        pipeline.step(d, async () => {});
      } catch (err) {
        thrown = err as Error;
      }
      expect(thrown, 'an un-adjudicated class-C declaration must be refused, not silently accepted').toBeDefined();
      expect(thrown!.message).toContain('x-banned-for-new');
      expect(thrown!.message).toContain(CLASS_PATH);
      expect(thrown!.message).toContain('fixture_never_grandfathered');
    });

    it('the SAME shape WITH a grandfathered.json entry (load_centreline, the operator-adjudicated slug) constructs without throwing', () => {
      const d = classCDescriptor('load_centreline');
      expect(() => pipeline.step(d, async () => {})).not.toThrow();
    });

    it('the guard axis (GUARD_PATH) stays independently enforced — a class-C descriptor that ALSO declares guard:"none" with no grandfathered guard-path entry is still refused, even under the adjudicated class-C slug', () => {
      // load_centreline's grandfathered.json entry (Commit 2 item C) covers
      // ONLY the class path — the guard-path entry is explicitly deferred to
      // load_centreline's own descriptor-authoring commit (Spec 122 §8
      // RE-FREEZE #20 record). Declaring guard:"none" under this slug today
      // must still be refused on the GUARD_PATH, proving the two axes are
      // adjudicated independently, not as one blanket allowance per slug.
      const d = classCDescriptor('load_centreline');
      const w = d.outputs.writes[0]!;
      (w.write_discipline as Record<string, unknown>).guard = 'none';
      (w.write_discipline as Record<string, unknown>).guard_why = { text: 'test-only', liveness: { kind: 'table', ref: 'toronto_centreline' } };
      let thrown: Error | undefined;
      try {
        pipeline.step(d, async () => {});
      } catch (err) {
        thrown = err as Error;
      }
      expect(thrown, 'load_centreline has no guard-path grandfathered entry yet').toBeDefined();
      expect(thrown!.message).toContain(GUARD_PATH);
    });
  });

  describe('item A — exec-policy.json registry_reserved names both new orchestrator-only registries', () => {
    it('grandfathered.json and exec-policy.json are both listed', () => {
      const policy = JSON.parse(fs.readFileSync(EXEC_POLICY_PATH, 'utf8')) as { registry_reserved: string[] };
      expect(policy.registry_reserved).toContain('scripts/steps/_schema/grandfathered.json');
      expect(policy.registry_reserved).toContain('scripts/lib/exec-policy.json');
    });

    it('the real grandfathered.json parses and carries the load_centreline class-path entry this commit adds', () => {
      const g = JSON.parse(fs.readFileSync(GRANDFATHERED_PATH, 'utf8')) as { steps: Record<string, { paths?: Record<string, string> }> };
      expect(g.steps.load_centreline?.paths?.[CLASS_PATH]).toBe('staging_full_replace');
    });
  });

  describe('item D — a DeepSeek engine write attempt to either reserved registry is refused (PATH_RESERVED), mirroring deepseek-exec-fences.infra.test.ts\'s scripts/manifest.json lock', () => {
    it('write_file("scripts/steps/_schema/grandfathered.json") ⇒ PATH_RESERVED, even with a write_scope naming it', async () => {
      const repo = makeRepo();
      const ledgerDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'wf3-antibypass-ledger-'));
      try {
        const briefPath = writeBrief(repo, { writeScope: ['scripts/**'] });
        const summary = await runEngine({
          repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'write_file', { path: 'scripts/steps/_schema/grandfathered.json', content: '{}', reason: 'r' })],
        });
        const records = ledgerRecords(ledgerDir, summary.run_id);
        expect(toolCallOf(records, 'write_file')).toMatchObject({ status: 'blocked', error: { code: 'PATH_RESERVED' } });
        expect(fs.existsSync(path.join(repo, 'scripts', 'steps', '_schema', 'grandfathered.json'))).toBe(false);
      } finally {
        cleanupTempDir(repo);
        cleanupTempDir(ledgerDir);
      }
    });

    it('write_file("scripts/lib/exec-policy.json") is refused (PATH_DENIED — self-protection fires before the C.6.2 reserved check, per exec-tools.js\'s own evaluation order; registry_reserved is a second, independent fence over the same path)', async () => {
      const repo = makeRepo();
      const ledgerDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'wf3-antibypass-ledger-'));
      try {
        const briefPath = writeBrief(repo, { writeScope: ['scripts/**'] });
        const summary = await runEngine({
          repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir,
          transcriptTurns: [toolTurn('c1', 'write_file', { path: 'scripts/lib/exec-policy.json', content: '{}', reason: 'r' })],
        });
        const records = ledgerRecords(ledgerDir, summary.run_id);
        const call = toolCallOf(records, 'write_file');
        expect(call?.status).toBe('blocked');
        expect(['PATH_DENIED', 'PATH_RESERVED']).toContain(call?.error?.code);
        expect(fs.existsSync(path.join(repo, 'scripts', 'lib', 'exec-policy.json'))).toBe(false);
      } finally {
        cleanupTempDir(repo);
        cleanupTempDir(ledgerDir);
      }
    });
  });
});
