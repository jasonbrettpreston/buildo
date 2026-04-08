// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.13 Mutation testing
//
// Stryker mutation testing — manual / weekly run, NOT pre-commit. Catches the
// "snapshot-style change-detector test" symptom from Phase 1b-i where a test
// asserts a value (`expect(rate).toBe(20)`) but doesn't actually exercise the
// rate in any meaningful behavior assertion. Mutation testing flips operators
// and constants and watches for surviving mutants — every survivor is a test
// gap.
//
// Scope: 4 high-stakes pure modules from the Phase 0/1/2 review attention
// hotspots. Whole-src/ mutation would take 30-60 min and surface hundreds
// of mutants we can't triage in one sitting; the targeted scope is
// aggressive enough to surface real test gaps.
//
// Usage:
//   npm run test:mutation:dry  # first-time setup verification
//   npm run test:mutation      # full run, ~3-5 min
//
// Threshold: 50% break (script fails if mutation score drops below 50%).
// First-run baseline is expected to be lower; track in review_followups.md.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  reporters: ['clear-text', 'progress', 'html'],

  // Targeted file list — high-stakes pure modules with the most prior
  // review attention. Expand after the first weekly run delivers value.
  mutate: [
    'src/features/leads/lib/cost-model.ts',
    'src/features/leads/lib/distance.ts',
    'src/features/leads/lib/record-lead-view.ts',
    'src/features/leads/lib/builder-query.ts',
  ],

  // Note: NOT excluding SQL via `ignorePatterns` — that would also exclude
  // the migration files from Stryker's sandbox copy, breaking the existing
  // infra tests that read migration SQL via fs.readFileSync. The targeted
  // `mutate` allowlist above already prevents Stryker from mutating SQL
  // string literals in TS files (only the 4 listed lib files are mutated).

  vitest: {
    configFile: 'vitest.config.ts',
  },

  // Mutation score thresholds — see Stryker docs for semantics.
  //   high: aspirational target
  //   low:  warning band
  //   break: hard fail (script exits non-zero)
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },

  // Per-test timeout. Pure functions only — no DB tests in scope.
  timeoutMS: 60_000,

  // Concurrency: leave at the Stryker default (CPU count). The targeted
  // scope keeps each run small enough that parallelism is the bottleneck.

  // Disable plugins we don't use to keep startup fast.
  disableTypeChecks: false,
};
