/**
 * SPEC LINK: docs/specs/00_engineering_standards.md
 *
 * Tests that automated enforcement gates are properly configured:
 * - ESLint bans console.error in API routes (§6.1)
 * - ESLint bans new Pool() in src/ (§9.4)
 * - commit-msg hook enforces spec traceability
 * - migration validator enforces UP/DOWN blocks (§3.2)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

describe('ESLint enforcement gates', () => {
  const eslintSource = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf-8');

  it('bans console.error in src/app/api/ files (§6.1)', () => {
    // Must have a file-scoped override targeting API route files
    expect(eslintSource).toContain('console.error');
    expect(eslintSource).toContain('src/app/api');
  });

  it('bans new Pool() instantiation in src/ (§9.4)', () => {
    expect(eslintSource).toContain('NewExpression');
    expect(eslintSource).toContain('Pool');
  });

  it('preserves existing process.exit ban', () => {
    expect(eslintSource).toContain('process.exit');
  });
});

describe('commit-msg hook', () => {
  const hookPath = join(ROOT, '.husky', 'commit-msg');
  const scriptPath = join(ROOT, 'scripts', 'hooks', 'validate-commit-msg.sh');

  it('hook file exists', () => {
    expect(existsSync(hookPath)).toBe(true);
  });

  it('validation script exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('validation script enforces conventional commit with spec ID', () => {
    const source = readFileSync(scriptPath, 'utf-8');
    // Must check for type(NN_spec) pattern
    expect(source).toMatch(/feat|fix|refactor|test|docs|chore/);
    expect(source).toMatch(/[0-9]{2}_/);
  });

  it('allows merge commits', () => {
    const source = readFileSync(scriptPath, 'utf-8');
    expect(source).toContain('Merge');
  });
});

describe('migration validator', () => {
  const scriptPath = join(ROOT, 'scripts', 'hooks', 'validate-migrations.sh');

  it('validation script exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('checks for DOWN block in migration files', () => {
    const source = readFileSync(scriptPath, 'utf-8');
    expect(source).toContain('-- DOWN');
  });

  it('scans only staged migration files', () => {
    const source = readFileSync(scriptPath, 'utf-8');
    expect(source).toContain('git diff');
    expect(source).toContain('migrations/');
  });
});
