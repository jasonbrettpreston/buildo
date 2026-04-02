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
      'functions/**',
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
          selector: "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message: 'process.exit() is banned in pipeline scripts. Let pipeline.run() handle lifecycle (§9.4).',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
  },
  // Pipeline SDK internals — exempt from Pool ban (it IS the pool provider)
  {
    files: ['scripts/lib/**/*.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Pipeline utility/seed/legacy scripts — exempt from strict rules (one-off tooling)
  {
    files: ['scripts/seed-*.js', 'scripts/seed-*.ts', 'scripts/migrate.js', 'scripts/poc-*.js', 'scripts/backfill/**', 'scripts/analysis/**'],
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
