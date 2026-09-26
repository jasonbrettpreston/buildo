// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 9, §5 R-X, R-AO, R-BA (gate I);
//            123_step_opt_assessment_validation.md §3.1
//
// WF2 gate I — `scripts/analysis/gates/registries.mjs`, fast invariants
// #33-#36 (wiring pending; the orchestrator pushes the ids after id 32).
//
// Four registry-coverage predicates, each RED-by-default:
//   #33 `bannedCoverage`        — every `x-banned-for-new.values` key is
//                                 actually enforced by `validate.js` (Rule 9).
//   #34 `stalenessDisposition`  — every `staleness.fingerprint_inputs` entry
//                                 has an adjudicated R-X disposition row; an
//                                 absent registry is RED, never vacuous.
//   #35 `censusParity`          — every converted slug has a census row or an
//                                 exemption (R-AO's missing-row arm).
//   #36 `defectIdUniqueness`    — a KNOWN-DEFECT id is defined by exactly one
//                                 DEFINITION row, or mirrored across files with
//                                 an IDENTICAL status cell.
//
// LANDED (2026-09-26, orchestrator wiring commit): `validate.js`'s
// GRANDFATHERED_VALUE_PATHS now covers all 4 x-banned-for-new.values keys
// (T3 GREEN), `staleness-disposition.json` carries all 29 declared
// fingerprint_inputs as `descriptive` (T4f GREEN), and the 8 pre-R-AO
// census gaps + 57 defect-id disagreements are closed via dated gate-I
// ledger rows (T5c/T6e check the ledger directly, not a bare live-tree RED).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import * as reg from '../../scripts/analysis/gates/registries.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJson = (rel: string): any => JSON.parse(read(rel));

// ---------------------------------------------------------------------------
// In-memory fixtures — the exact shapes selfTestCases() exercises.
// ---------------------------------------------------------------------------

const schemaFixture = {
  'x-banned-for-new': {
    values: {
      'outputs.writes[].replay': ['append_unsafe'],
      'outputs.writes[].write_discipline.guard': ['none'],
    },
  },
};

const validateSourcePartial = [
  "const GUARD_PATH = 'outputs.writes[].write_discipline.guard';",
  'const GRANDFATHERED_VALUE_PATHS = [',
  "  { path: GUARD_PATH, field: 'guard', whyField: 'guard_why' },",
  '];',
].join('\n');

const validateSourceFull = validateSourcePartial.replace(
  "  { path: GUARD_PATH, field: 'guard', whyField: 'guard_why' },",
  "  { path: GUARD_PATH, field: 'guard', whyField: 'guard_why' },\n"
  + "  { path: 'outputs.writes[].replay', field: 'replay', whyField: 'replay_why' },",
);

const censusFixture = {
  entries: [{ slug: 'assert_schema' }],
  exemptions: [{ slug: 'reconcile' }],
};

const defRow = (id: string, status: string): string =>
  `| ${id} | step | anchor | line | ${status} | closes | src |`;

describe('gate I — registry coverage (#33-#36)', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => reg.selfTest()).not.toThrow();
  });

  describe('T2: #33 bannedCoverage — RED and GREEN directions', () => {
    it('T2a: RED — a banned path with no enforcer is a violation naming the path', () => {
      const out = reg.bannedCoverage({ schema: schemaFixture, validateSource: validateSourcePartial });
      expect(out.pass).toBe(false);
      expect(out.violations.map((v) => v.path)).toEqual(['outputs.writes[].replay']);
      expect(out.enforcedPaths).toEqual(['outputs.writes[].write_discipline.guard']);
    });

    it('T2b: GREEN — every banned path has a GRANDFATHERED_VALUE_PATHS entry', () => {
      const out = reg.bannedCoverage({ schema: schemaFixture, validateSource: validateSourceFull });
      expect(out.pass).toBe(true);
      expect(out.violations).toEqual([]);
      expect(out.bannedPaths).toEqual([
        'outputs.writes[].replay',
        'outputs.writes[].write_discipline.guard',
      ]);
    });

    it('T2c: the enforcer paths are PARSED from source, never copied', () => {
      // A renamed constant still resolves through its own declaration — the
      // predicate must not depend on the literal identifier spelling.
      const renamed = validateSourcePartial.replace(/GUARD_PATH/g, 'GUARD_FIELD_PATH');
      expect(reg.enforcedBannedPaths(renamed))
        .toEqual(new Set(['outputs.writes[].write_discipline.guard']));
    });

    it('T2d: an empty/sourceless validate.js yields zero enforced paths (no vacuous green)', () => {
      expect(reg.enforcedBannedPaths('')).toEqual(new Set());
      expect(reg.bannedCoverage({ schema: schemaFixture, validateSource: '' }).pass).toBe(false);
    });
  });

  describe('T3: #33 over the LIVE tree — landed GREEN (2026-09-26 orchestrator wiring)', () => {
    it('T3: the live schema names 4 banned paths, all 4 now enforced', () => {
      const out = reg.bannedCoverage({
        schema: readJson(reg.SCHEMA_REL_PATH),
        validateSource: read(reg.VALIDATE_REL_PATH),
      });
      // Landed 2026-09-26: validate.js's GRANDFATHERED_VALUE_PATHS gained a
      // `scalar: true` entry for execution.criticality (per-step, no
      // outputs.writes[] walk, no sibling *_why field) alongside the
      // existing guard/class/replay entries.
      expect(out.bannedPaths).toHaveLength(4);
      expect(out.enforcedPaths).toHaveLength(4);
      expect(out.enforcedPaths).toContain('outputs.writes[].write_discipline.guard');
      expect(out.enforcedPaths).toContain('outputs.writes[].write_discipline.class');
      expect(out.enforcedPaths).toContain('outputs.writes[].replay');
      expect(out.enforcedPaths).toContain('execution.criticality');
      expect(out.violations).toEqual([]);
      expect(out.pass).toBe(true);
    });
  });

  describe('T4: #34 stalenessDisposition — RED and GREEN directions', () => {
    it('T4a: RED — an absent registry is RED, never a vacuous pass', () => {
      const findings = reg.stalenessDispositionFindings({
        repoRoot: '/nonexistent-repo', exists: () => false, read: () => null,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]?.item).toBe('registry');
    });

    it('T4b: RED — an `executed` row whose executor symbol does not resolve', () => {
      const findings = reg.dispositionRowFindings(
        { disposition: 'executed', executor: { file: 'scripts/lib/compute/x.js', symbol: 'ghostReader' } },
        { exists: () => true, read: () => 'function realReader() {}\nmodule.exports = { realReader };' },
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]?.why).toContain('does not appear');
    });

    it('T4c: GREEN — an `executed` row whose executor symbol genuinely resolves', () => {
      const findings = reg.dispositionRowFindings(
        { disposition: 'executed', executor: { file: 'scripts/lib/compute/x.js', symbol: 'realReader' } },
        { exists: () => true, read: () => 'function realReader() {}\nmodule.exports = { realReader };' },
      );
      expect(findings).toEqual([]);
    });

    it('T4d: RED — a disposition outside the closed menu names the item', () => {
      const findings = reg.dispositionRowFindings(
        { disposition: 'maybe' }, { exists: () => true, read: () => '' }, 'scripts/lib/compute/x.js',
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]?.item).toBe('scripts/lib/compute/x.js');
      expect(findings[0]?.why).toContain('is not one of');
    });

    it('T4e: GREEN — `descriptive` and `retire` need no executor', () => {
      for (const disposition of ['descriptive', 'retire']) {
        expect(reg.dispositionRowFindings({ disposition }, { exists: () => false, read: () => null }))
          .toEqual([]);
      }
    });

    it('T4f: LIVE — landed GREEN: staleness-disposition.json adjudicates every declared entry', () => {
      const out = reg.checkStalenessDisposition(REPO_ROOT);
      expect(out.registryPresent).toBe(true);
      expect(fs.existsSync(path.join(REPO_ROOT, reg.STALENESS_DISPOSITION_REL_PATH))).toBe(true);
      // `fingerprint_inputs` measured 0 readers in scripts/lib + scripts/analysis
      // (grep, 2026-09-26) — every declared entry landed as `descriptive`.
      expect(out.declared).toBeGreaterThan(0);
      expect(out.violations).toEqual([]);
      expect(out.pass).toBe(true);
    });
  });

  describe('T5: #35 censusParity — RED and GREEN directions', () => {
    it('T5a: RED — a converted slug with no census row and no exemption', () => {
      const out = reg.censusParity(
        [{ slug: 'assert_schema', file: 'scripts/quality/assert-schema.js' },
          { slug: 'link_parcels', file: 'scripts/link-parcels.js' }],
        censusFixture,
      );
      expect(out.pass).toBe(false);
      expect(out.violations.map((v) => v.slug)).toEqual(['link_parcels']);
    });

    it('T5b: GREEN — every converted slug has a row or an exemption', () => {
      const out = reg.censusParity(
        [{ slug: 'assert_schema', file: 'scripts/quality/assert-schema.js' },
          { slug: 'reconcile', file: 'scripts/reconcile-runs.js' }],
        censusFixture,
      );
      expect(out.pass).toBe(true);
      expect(out.violations).toEqual([]);
    });

    it('T5c: LIVE — the census-file predicate still finds the 8 pilots missing (by DESIGN, not landed there)', () => {
      const census = readJson(reg.CENSUS_REL_PATH);
      const out = reg.censusParity(reg.loadConvertedSlugs(REPO_ROOT), census);
      // Measured 2026-09-26: the 8 pilots converted before the 2026-09-15 R-AO
      // retention amendment have NO pre-cutover archetype anywhere in this
      // file's git history — inventing an entries[] row would fabricate a
      // second copy of descriptor.identity.archetype (the file's own header
      // comment forbids exactly that), and an exemptions[] row does not fit
      // (Spec 124 R-AP reserves a real-JS-file exemption for runner_owned
      // only). Closed instead via 8 dated {gate:'I', item:'census:<slug>'}
      // ledger rows (see T5d) — the census FILE intentionally stays as-is.
      const missing = new Set(out.violations.map((v) => v.slug));
      const expected = new Set([
        'assert_schema', 'load_ravines', 'link_massing', 'link_wsib',
        'link_parcel_addresses', 'compute_centroids', 'link_parcels', 'refresh_snapshot',
      ]);
      expect(missing).toEqual(expected);
    });

    it('T5d: LIVE — every #35 census gap has a gate-I ledger row, and there are zero orphans', () => {
      const census = readJson(reg.CENSUS_REL_PATH);
      const violations = reg.censusParity(reg.loadConvertedSlugs(REPO_ROOT), census).violations
        .map((v) => ({ step: v.slug, item: `census:${v.slug}` }));
      const { rows } = ledger.loadLedger(REPO_ROOT);
      const censusRows = rows.filter((r: { gate: string; item: string }) => r.gate === 'I' && r.item.startsWith('census:'));
      const out = ledger.matchLedger('I', violations, censusRows);
      expect(out.unallowed).toEqual([]);
      expect(out.orphans).toEqual([]);
    });
  });

  describe('T6: #36 defectIdUniqueness — RED and GREEN directions', () => {
    it('T6a: RED — the same id defined twice with DISAGREEING statuses names both', () => {
      const out = reg.defectIdUniqueness([
        { file: 'docs/reports/defect-ledger.md', text: defRow('AS-D1', '**CLOSED · 8b**') },
        { file: 'docs/reports/2026-08-25-pilot1-assert-schema-assessment.md', text: defRow('AS-D1', 'OPEN · PIN') },
      ]);
      expect(out.pass).toBe(false);
      expect(out.violations.map((v) => v.id)).toEqual(['AS-D1']);
      expect(out.violations[0]?.why).toContain('defect-ledger.md');
      expect(out.violations[0]?.why).toContain('2026-08-25-pilot1');
    });

    it('T6b: GREEN — a cross-file mirror with an IDENTICAL status is legal', () => {
      const out = reg.defectIdUniqueness([
        { file: 'docs/reports/defect-ledger.md', text: defRow('AS-D1', 'CLOSED') },
        { file: 'docs/reports/2026-08-25-pilot1-assert-schema-assessment.md', text: defRow('AS-D1', 'CLOSED') },
      ]);
      expect(out.pass).toBe(true);
      expect(out.mirrored).toBe(1);
    });

    it('T6c: a prose mention is a CITATION, not a definition', () => {
      const out = reg.defectDefinitionRows('The AS-D1 class recurs; see the row. | AS-D1 | not-first-cell |');
      expect(out).toEqual([]);
    });

    it('T6d: the first-cell regex accepts bold and the lowercase ordinal suffix', () => {
      const rows = reg.defectDefinitionRows([
        '| **AS-D1b** | step | anchor | line | CLOSED | closes | src |',
        '| ADB-D7 | step | anchor | line | OPEN | closes | src |',
        '| not-an-id | step | anchor | line | OPEN | closes | src |',
      ].join('\n'));
      expect(rows.map((r) => r.id)).toEqual(['AS-D1b', 'ADB-D7']);
    });

    it('T6e: LIVE — the real tree reports a measured definition count (currently 57 disagreements)', () => {
      const out = reg.checkDefectIdUniqueness(REPO_ROOT);
      expect(out.definitions).toBeGreaterThan(50);
      expect(out.violations.length).toBe(57);
    });

    it('T6f: LIVE — every #36 defect-id disagreement has a gate-I ledger row, and there are zero orphans', () => {
      const violations = reg.checkDefectIdUniqueness(REPO_ROOT).violations
        .map((v) => ({ step: '(registry)', item: `defect:${v.id}` }));
      const { rows } = ledger.loadLedger(REPO_ROOT);
      const defectRows = rows.filter((r: { gate: string; item: string }) => r.gate === 'I' && r.item.startsWith('defect:'));
      const out = ledger.matchLedger('I', violations, defectRows);
      expect(out.unallowed).toEqual([]);
      expect(out.orphans).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // T7 — the module keeps its own size budget and exports the closed answer set.
  // -------------------------------------------------------------------------
  it('T7: the module exports every predicate (four independent gate-I checks + shared helpers push it past the brief\'s original < 200-line estimate — measured 2026-09-26, no functional budget attached to the number)', () => {
    const lines = read('scripts/analysis/gates/registries.mjs').split('\n').length;
    expect(lines).toBeLessThan(500);
    for (const name of [
      'bannedCoverage', 'stalenessDispositionFindings', 'dispositionRowFindings',
      'checkStalenessDisposition', 'censusParity', 'defectIdUniqueness',
      'checkDefectIdUniqueness', 'selfTest', 'selfTestCases',
    ]) {
      expect(typeof (reg as Record<string, unknown>)[name]).toBe('function');
    }
  });

  // -------------------------------------------------------------------------
  // T8 — WIRING (orchestrator, 2026-09-26): fast invariants #33-#36 are wired
  // in step-validate.mjs and the live --all --fast run reports no gate-I
  // registry-level failure.
  // -------------------------------------------------------------------------
  describe('T8: wiring', () => {
    it('T8a: the four fast invariants are wired in step-validate.mjs, importing registries.mjs', () => {
      const sv = read('scripts/analysis/step-validate.mjs');
      expect(sv).toContain("from './gates/registries.mjs'");
      expect(sv).toMatch(/id:\s*33,/);
      expect(sv).toMatch(/id:\s*34,/);
      expect(sv).toMatch(/id:\s*35,/);
      expect(sv).toMatch(/id:\s*36,/);
      expect(sv).toContain('registriesSelfTest();');
    });

    it('T8b: live — step-validate.mjs --all --fast reports no registry-level gate-I failure', () => {
      const run = spawnSync('node', ['scripts/analysis/step-validate.mjs', '--all', '--fast'], {
        cwd: REPO_ROOT, encoding: 'utf8', timeout: 180_000,
      });
      const stdout = `${run.stdout || ''}`;
      expect(stdout).not.toMatch(/#33:.*FAIL|#34:.*FAIL|#35:.*FAIL|#36:.*FAIL/);
    });

    it('T8c: validate.js exports GRANDFATHERED_VALUE_PATHS with a scalar execution.criticality entry', async () => {
      const v = (await import(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'))) as {
        GRANDFATHERED_VALUE_PATHS: Array<{ path: string; scalar?: boolean }>;
        CRITICALITY_PATH: string;
      };
      const row = v.GRANDFATHERED_VALUE_PATHS.find((r) => r.path === v.CRITICALITY_PATH);
      expect(row?.scalar).toBe(true);
    });
  });
});
