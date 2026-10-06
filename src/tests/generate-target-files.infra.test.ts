// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §6
//
// Infra locks for `scripts/analysis/generate-target-files.mjs` (brief gtf-13) and the
// `npm run step:registry` CLI `scripts/analysis/step-registry.mjs` (brief gtf-12), whose shared
// derivation is `scripts/analysis/gates/step-registry.mjs` (contract §B, locked by
// src/tests/step-registry.logic.test.ts).
//
// Written red-first (neither module existed); test 1 stays RED until the specs are generated.
//
// What is locked:
//   1. the live tree is CLEAN under `--check` — the generated blocks match the census/ledger/
//      consumer-registry derivation (this one goes RED until the specs are generated).
//   2/3. a drifted cross-step ledger snapshot, and a drifted consumer registry, each make `--check`
//      exit 1 naming the STALE spec — drift is never silently written.
//   4. `--self-test` proves insertion/idempotency/refusals in memory.
//   5. the generator REFUSES an unclosed marker, a forbidden heading, and a spec with no Target
//      Files heading (exit 2, never a partial write).
//   6/7. insertion + idempotency + the one-home rule (a path the generator owns may not be
//      hand-listed a second time in the same section).
//   8/9/10. the CLI's DECLARED half is byte-identical to the generated block; a non-step path prints
//      nothing; `--print=<slug>` is exactly `renderStepEntry` with no extra newline.
import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as gen from '../../scripts/analysis/generate-target-files.mjs';
import * as reg from '../../scripts/analysis/gates/step-registry.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');

/** Temp files written by the drift fixtures, removed in `afterAll`. */
const tmpRoots: string[] = [];

/**
 * Run a repo script through the real Node binary in a real child process, exactly as
 * `npm run step:registry` / `npm run target-files` do — never an in-process import (the exit code
 * and the stdout/stderr split are the contract). `extraEnv` overrides the TEST-ONLY registry
 * fixtures without mutating the committed files.
 */
function cli(script: string, args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    timeout: 60_000,
  });
}

/** The stdout+stderr of a spawnSync result, as the CLI writes them. */
function io(result: { stdout?: string | null; stderr?: string | null }): string {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

/** A fresh temp directory, registered for cleanup in `afterAll`. */
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtf-'));
  tmpRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

describe('generate-target-files — the CLI and the generator (gtf-02)', () => {
  it(
    'the live tree is CLEAN: `--check` exits 0',
    { timeout: 60_000 },
    () => {
      const r = cli('scripts/analysis/generate-target-files.mjs', ['--check']);
      expect(r.status, io(r)).toBe(0);
    },
  );

  it(
    'ledger-edge drift is RED: an extra writer makes `--check` exit 1, STALE, naming the owner spec',
    { timeout: 60_000 },
    () => {
      const snapshot = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'seeds', 'lineage-meta-snapshot.json'), 'utf8'),
      );
      const inputs = reg.loadRegistryInputs(REPO_ROOT);
      const inchain = snapshot.inchain as Record<string, { chains: string[]; reads?: Record<string, unknown> }>;
      // P1-C5: the registry reads the EFFECTIVE ledger (converted descriptors overlaid on the
      // snapshot), so the row, table and column the drift targets are chosen from what the registry
      // actually derives edges from — a snapshot-only read of a converted step is no longer an edge.
      const effective = inputs.ledger.inchain as Record<string, { chains: string[]; reads?: Record<string, string[]> }>;
      const firstReadColumn = (slug: string): [string, string] | null => {
        for (const [t, cols] of Object.entries(effective[slug]?.reads || {})) {
          if (Array.isArray(cols) && cols.length > 0) return [t, cols[0]!];
        }
        return null;
      };

      // The first registry row that is an inchain key with at least one read column — stable, because
      // registryRows order is manifest.chains.sources order.
      const row = reg
        .registryRows(inputs)
        .find(
          (candidate: { slug: string }) =>
            Object.prototype.hasOwnProperty.call(inchain, candidate.slug) && firstReadColumn(candidate.slug) !== null,
        );
      expect(row, 'no registry row with a ledger read column').toBeTruthy();

      const slug = row!.slug;
      const spec = String(row!.owner_specs[0]);
      const entry = effective[slug]!;
      const [table, column] = firstReadColumn(slug)!;

      // FLEET-2 MQ-C1 (a): effectiveLedger DROPS a snapshot row with no manifest.scripts entry (ORDER-RETIRED), so an
      // invented slug is no longer an edge. The extra write goes on an EXISTING live, snapshot-only producer that shares
      // a chain with the chosen row and does not already write the column, so the drift is a real new upstream edge.
      type SnapRow = { chains?: string[]; writes?: Record<string, string[]>; [k: string]: unknown };
      const effAll = inputs.ledger.inchain as Record<string, SnapRow & { source?: string }>;
      const writerSlug = Object.keys(effAll).find((n) => {
        const e = effAll[n]!;
        const snapRow = (inchain as Record<string, SnapRow>)[n];
        return e.source === 'snapshot' && n !== slug && snapRow !== undefined
          && (e.chains || []).some((c) => entry.chains.includes(c))
          && !((snapRow.writes || {})[table] || []).includes(column);
      });
      expect(writerSlug, 'no live snapshot-only producer shares a chain with the chosen row').toBeTruthy();
      const writerRow = (inchain as Record<string, SnapRow>)[writerSlug!]!;
      const drifted = {
        ...snapshot,
        inchain: {
          ...inchain,
          [writerSlug!]: {
            ...writerRow,
            writes: { ...(writerRow.writes || {}), [table]: [...((writerRow.writes || {})[table] || []), column] },
          },
        },
      };
      const file = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(file, `${JSON.stringify(drifted, null, 2)}\n`);

      const r = cli('scripts/analysis/generate-target-files.mjs', ['--check'], {
        BUILDO_LEDGER_SNAPSHOT_PATH: file,
      });
      expect(r.status, io(r)).toBe(1);
      expect(io(r)).toContain('STALE');
      expect(io(r)).toContain(spec);
    },
  );

  it(
    'consumer-registry drift is RED: a new consumer row makes `--check` exit 1 naming its owner spec',
    { timeout: 60_000 },
    () => {
      const registry = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'consumer-registry.json'), 'utf8'),
      );
      registry.rows = [
        ...registry.rows,
        {
          consumer: 'src/zz-fixture.ts',
          producer: 'parcels',
          kind: 'records_meta',
          key: 'zz_fixture',
          value: 'any',
          source: 'emits',
        },
      ];
      const file = path.join(tmpDir(), 'consumer-registry.json');
      fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);

      const r = cli('scripts/analysis/generate-target-files.mjs', ['--check'], {
        BUILDO_CONSUMER_REGISTRY_PATH: file,
      });
      expect(r.status, io(r)).toBe(1);
      expect(io(r)).toContain('docs/specs/01-pipeline/55_source_parcels.md');
    },
  );

  it(
    '`--self-test` exits 0 and reports every check PASS',
    { timeout: 60_000 },
    () => {
      const r = cli('scripts/analysis/generate-target-files.mjs', ['--self-test']);
      expect(r.status, io(r)).toBe(0);
      expect(String(r.stdout)).toMatch(/self-test: (\d+)\/\1 PASS/);
    },
  );

  it(
    'refusals: an unclosed marker, a forbidden heading and a missing Target Files heading all throw',
    { timeout: 60_000 },
    () => {
      // An open marker with no close — the marker half of the block editor's own refusal.
      expect(() =>
        gen.expectedText('### Target Files\n<!-- generated:target-files -->\n- x\n', [
          { id: 'target-files', body: '' },
        ]),
      ).toThrow(/without a close/);

      // A body that would introduce a second heading inside the section.
      expect(() =>
        gen.expectedText('### Target Files\n- x\n', [{ id: 'target-files', body: '### bad\n' }]),
      ).toThrow(/forbidden heading/);

      // A spec with no `### Target Files` heading at all is refused, never guessed at.
      expect(() =>
        gen.expectedText('# t\n\nno heading\n', [{ id: 'target-files', body: '' }]),
      ).toThrow(/### Target Files/);
    },
  );

  it(
    'insertion is bracketed by the markers and the result is idempotent',
    { timeout: 60_000 },
    () => {
      const blocks = [{ id: 'target-files', body: '- a\n' }];
      const once = gen.expectedText(
        '# t\n### Target Files\n- `scripts/other.js`\n### Out-of-Scope Files\n',
        blocks,
      );
      expect(once).toContain(
        '### Target Files\n<!-- generated:target-files -->\n- a\n<!-- /generated:target-files -->\n- ',
      );
      // Regenerating the already-generated text is a no-op — the block is replaced in place, not
      // appended a second time.
      expect(gen.expectedText(once, blocks)).toBe(once);
    },
  );

  it(
    'one home: a generated path hand-listed in the section is a violation, the same path inside the block is not',
    { timeout: 60_000 },
    () => {
      const derived = new Set(['scripts/load-parcels.js']);
      const slugs = ['parcels'];

      const violations = gen.oneHomeViolations(
        's.md',
        '### Target Files\n<!-- generated:target-files -->\n- `scripts/load-parcels.js`\n<!-- /generated:target-files -->\n- `scripts/load-parcels.js` — hand\n- `src/tests/steps/parcels/**`\n### Next\n',
        derived,
        slugs,
      );
      expect(violations).toHaveLength(2);

      const clean = gen.oneHomeViolations(
        's.md',
        '### Target Files\n<!-- generated:target-files -->\n- `scripts/load-parcels.js`\n<!-- /generated:target-files -->\n### Next\n',
        derived,
        slugs,
      );
      expect(clean).toHaveLength(0);
    },
  );

  it(
    'the CLI DECLARED half is byte-identical to the spec block it is derived from',
    { timeout: 60_000 },
    () => {
      // A single-owner step: its DECLARED body lives verbatim in exactly one spec.
      const parcels = cli('scripts/analysis/step-registry.mjs', ['parcels']);
      expect(parcels.status, io(parcels)).toBe(0);
      const parcelsDeclared = between(String(parcels.stdout), '== DECLARED ==', '== ADVISORY ==');
      expect(parcelsDeclared.length).toBeGreaterThan(0);
      expect(
        fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/01-pipeline/55_source_parcels.md'), 'utf8'),
      ).toContain(parcelsDeclared);

      // A multi-owner step: the SAME DECLARED body is present in every spec that owns it.
      const linkWsib = cli('scripts/analysis/step-registry.mjs', ['link_wsib']);
      expect(linkWsib.status, io(linkWsib)).toBe(0);
      const linkWsibDeclared = between(String(linkWsib.stdout), '== DECLARED ==', '== ADVISORY ==');
      expect(linkWsibDeclared.length).toBeGreaterThan(0);
      for (const spec of ['60_shared_steps.md', '46_wsib_enrichment.md']) {
        expect(
          fs.readFileSync(path.join(REPO_ROOT, `docs/specs/01-pipeline/${spec}`), 'utf8'),
          spec,
        ).toContain(linkWsibDeclared);
      }
    },
  );

  it(
    'a path that resolves to no step prints nothing and exits 0',
    { timeout: 60_000 },
    () => {
      const r = cli('scripts/analysis/step-registry.mjs', ['src/components/X.tsx']);
      expect(r.status, io(r)).toBe(0);
      expect(String(r.stdout)).toBe('');
    },
  );

  it(
    '`--step=<slug>` is an alias for the positional argument (F4)',
    { timeout: 60_000 },
    () => {
      const aliased = cli('scripts/analysis/step-registry.mjs', ['--step=load_wsib']);
      expect(aliased.status, io(aliased)).toBe(0);
      expect(String(aliased.stdout)).toContain('== DECLARED ==');
      expect(String(aliased.stdout)).toContain('`load_wsib`');

      const positional = cli('scripts/analysis/step-registry.mjs', ['load_wsib']);
      expect(positional.status, io(positional)).toBe(0);

      // `--step=` is a true alias: the DECLARED half is byte-identical to the positional form.
      expect(between(String(aliased.stdout), '== DECLARED ==', '== ADVISORY ==')).toBe(
        between(String(positional.stdout), '== DECLARED ==', '== ADVISORY =='),
      );
    },
  );

  it(
    'an unknown flag exits 1 with a usage line (F4)',
    { timeout: 60_000 },
    () => {
      const r = cli('scripts/analysis/step-registry.mjs', ['--bogus']);
      expect(r.status, io(r)).toBe(1);
      expect(String(r.stderr)).toMatch(/usage: npm run step:registry -- <slug\|path>/);
      expect(String(r.stdout)).toBe('');
    },
  );

  it(
    '`--print=<slug>` is exactly renderStepEntry, no extra newline',
    { timeout: 60_000 },
    () => {
      const inputs = reg.loadRegistryInputs(REPO_ROOT);
      const row = reg.registryRows(inputs).find((candidate: { slug: string }) => candidate.slug === 'parcels');
      expect(row).toBeTruthy();

      const r = cli('scripts/analysis/generate-target-files.mjs', ['--print=parcels']);
      expect(r.status, io(r)).toBe(0);
      expect(String(r.stdout)).toBe(reg.renderStepEntry(row!, inputs));
    },
  );
});

/** The text strictly between the `open` and `close` delimiter lines, delimiters excluded. */
function between(text: string, open: string, close: string): string {
  const lines = String(text).split('\n');
  const start = lines.indexOf(open);
  const end = lines.indexOf(close);
  if (start < 0 || end < start) return '';
  return lines.slice(start + 1, end).join('\n');
}
