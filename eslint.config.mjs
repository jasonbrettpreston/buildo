import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'next-env.d.ts',
      'node_modules/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message: 'process.exit() is banned in src/. Use error logging and graceful recovery instead.',
        },
        {
          selector: "NewExpression[callee.name='Pool']",
          message: 'new Pool() is banned in src/. Use the Pipeline SDK (scripts/lib/pipeline.js) or the shared pool from scripts/lib/db.js instead (§9.4).',
        },
      ],
    },
  },
  // §9.4 — Exempt src/lib/db/client.ts from Pool ban (it IS the centralized pool)
  {
    files: ['src/lib/db/client.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message: 'process.exit() is banned in src/. Use error logging and graceful recovery instead.',
        },
        // Pool ban intentionally omitted — this file is the centralized pool provider
      ],
    },
  },
  // §6.2 — Ban console.log/debug/info in src/ committed code (Admin rule 5).
  // console.warn is allowed for dev-time warnings (nav guard, SDK fallbacks).
  // API routes additionally ban console.error in the block below — handled there separately.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/tests/**'],
    rules: {
      'no-console': ['error', { allow: ['warn'] }],
    },
  },
  // src/lib/logger.ts IS the console abstraction — exempt from no-console rule
  {
    files: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // §6.1 — Ban console.error in API routes; use logError() from src/lib/logger.ts instead
  {
    files: ['src/app/api/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message: 'process.exit() is banned in src/. Use error logging and graceful recovery instead.',
        },
        {
          selector: "NewExpression[callee.name='Pool']",
          message: 'new Pool() is banned in src/. Use the Pipeline SDK or shared pool instead (§9.4).',
        },
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='error']",
          message: 'console.error() is banned in API routes. Use logError(tag, err, context) from src/lib/logger.ts instead (§6.1).',
        },
      ],
    },
  },
  // ---------------------------------------------------------------------------
  // Pipeline scripts (scripts/**/*.js) — CommonJS, not TypeScript
  // Enforce pipeline-specific architectural rules (§9)
  // ---------------------------------------------------------------------------
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      // Disable TypeScript rules — scripts are CommonJS .js
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Pipeline architectural guards
      'no-restricted-syntax': [
        'warn',
        {
          selector: "NewExpression[callee.name='Pool']",
          message: 'new Pool() is banned in pipeline scripts. Use pipeline.createPool() via the SDK (§9.4).',
        },
        {
          selector: "NewExpression[callee.property.name='Pool']",
          message: 'new pg.Pool() is banned in pipeline scripts. Use pipeline.createPool() via the SDK (§9.4).',
        },
        {
          selector: "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message: 'process.exit() is banned in pipeline scripts. Let pipeline.run() handle lifecycle (§9.4).',
        },
        // Phase 7 B3 — Time Cop: ban new Date() for DB timestamp generation.
        // Use pipeline.getDbTimestamp(pool) to capture the DB clock once at script start.
        // Date.now() for elapsed-time measurement is NOT banned (no selector added for it).
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() is banned in pipeline scripts. Use pipeline.getDbTimestamp(pool) to capture the DB clock once at script start (§47 §R3.5, Phase 7 B3).',
        },
        // Phase 7 B5 — Safe Integer: ban raw parseInt/parseFloat (NaN propagation risk).
        // Use safeParsePositiveInt / safeParseFloat / safeParseIntOrNull from scripts/lib/safe-math.
        {
          selector: "CallExpression[callee.name='parseInt']",
          message: 'Raw parseInt() is banned in pipeline scripts. Use safeParsePositiveInt() or safeParseIntOrNull() from ./lib/safe-math (§47, Phase 7 B5).',
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'Raw parseFloat() is banned in pipeline scripts. Use safeParseFloat() from ./lib/safe-math (§47, Phase 7 B5).',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
  },
  // Pipeline SDK internals — exempt from Pool ban (it IS the pool provider)
  {
    files: ['scripts/lib/**/*.js', 'scripts/lib/**/*.mjs'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Surgical Valuation Brain — shared CommonJS module (spec 83 §6).
  // Lives in src/ for co-location with cost-model.ts but requires CommonJS
  // because it is require()-d by the pipeline script (Node.js, no ts-node).
  {
    files: ['src/features/leads/lib/cost-model-shared.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
  // Tests that require()-import the Brain JS module directly.
  // require() is intentional here — the Brain is CommonJS; TS import
  // would need a .d.ts shim which is Phase 2 work.
  {
    files: ['src/tests/cost-model-shared.logic.test.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // P25 notification tests that require()-import CommonJS pipeline modules
  // (dispatch-notifications.js + scripts/lib/{push-dispatch,notification-types}.js
  // are CommonJS; a TS import would need .d.ts shims). Mirrors the
  // cost-model-shared override above. (Pays the 25A --no-verify lint debt.)
  {
    files: [
      'src/tests/notification-dispatch-contract.logic.test.ts',
      'src/tests/notification-types.logic.test.ts',
      'src/tests/push-dispatch.logic.test.ts',
      'src/tests/db/dispatch-notifications.db.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Pipeline utility/seed/legacy scripts — exempt from strict rules (one-off tooling)
  {
    files: [
      'scripts/seed-*.js',
      'scripts/seed-*.ts',
      'scripts/migrate.js',
      'scripts/poc-*.js',
      'scripts/backfill/**',
      'scripts/analysis/**',
      // Spec 112 §4.3 — standalone operator CLIs, deliberately outside the
      // pipeline.run/§R1-R12 skeleton (same rationale as scripts/migrate.js
      // above: destructive, human-gated, not chain-registered).
      'scripts/restore-db.js',
      'scripts/validation/supabase-load-gates.js',
      // Spec 115 §4 — scripts/check-chain-running.js is a GitHub-Actions-
      // invoked standalone CLI guard step, not a chain step: no
      // pipeline.run()/§R1-R12 wrapper, same rationale as restore-db.js
      // above (it connects directly via SUPABASE_DATABASE_URL before any
      // chain has started).
      'scripts/check-chain-running.js',
      // Supabase migration Phase 1 (phase1_plan.md Item 3, P1-F3a/Item 7) —
      // one-off operator CLIs: provisions/promotes the first admin via the
      // service-role Admin API, and wipes local Supabase auth state on an
      // aborted migration attempt. Same rationale as restore-db.js above.
      'scripts/bootstrap-first-admin.js',
      'scripts/wipe-supabase-auth-state.js',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Phase 7 — Inert tooling: exempt from new-Date/parseInt/parseFloat bans.
  // These files are documented in scripts/amnesty.json (new-date-ban, raw-parseint).
  // Active pipeline scripts are NOT in this list — they must comply.
  {
    files: [
      'scripts/run-chain.js',           // Orchestrator — parseInt for config (bounded, validated); Date for logging only
      'scripts/reclassify-all.js',      // One-off maintenance — not in active chain
      'scripts/load-parcels.js',        // new Date() used for date string comparison (expiry), not DB write
      'scripts/audit_all_specs.mjs',    // Spec audit tool — new Date() for report headers
      'scripts/generate-script.mjs',   // Generator tool — new Date() for template comments
      'scripts/task-init.mjs',          // Task scaffolder — new Date() for date stamps
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Ignore files ESLint cannot parse or shouldn't lint
  {
    ignores: ['scripts/**/*.py', 'scripts/seed-trades.ts'],
  },
];

export default eslintConfig;
