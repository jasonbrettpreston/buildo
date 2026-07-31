/**
 * Migration pre-commit hooks — BEHAVIOURAL locks (WF3 2026-07-31).
 *
 * SPEC LINK: docs/specs/00_engineering_standards.md §3
 * PLAN: .cursor/wf3_migration_gates.md
 *
 * WHY THIS FILE EXISTS. `src/tests/enforcement.logic.test.ts` "covered" these
 * hooks with six assertions on their SOURCE STRINGS — one literally named
 * `it('scans only staged migration files')` that asserted `source.toContain('git diff')`.
 * The hooks do not scan staged files; they scan the WORKTREE. A test that
 * checks for a substring cannot notice that, which is precisely why the bug
 * survived a test claiming to cover it.
 *
 * Every test here RUNS the hook against a real temporary git repository and
 * asserts its exit code. The guiding invariant, and the whole point of the WF:
 *
 *     A safety gate whose validator is missing, whose input list is empty, or
 *     whose git command failed must REJECT, never pass.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const UNSAFE = [
  '-- 900_probe.sql',
  '-- UP',
  // Two violations at once: `permits` is in validate-migration.js's
  // LARGE_TABLES so a bare CREATE INDEX is rejected, and there is no -- DOWN.
  'CREATE INDEX idx_probe ON permits (id);',
  '',
].join('\n');
const SAFE = [
  '-- 900_probe.sql',
  '-- UP',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_probe ON permits (id);',
  '',
  '-- DOWN',
  '--   DROP INDEX IF EXISTS idx_probe;',
  '',
].join('\n');

let repo: string;

/** Run a hook inside the temp repo. Returns its exit code, never throws. */
function runHook(hook: string): number {
  try {
    execFileSync('bash', [join(ROOT, 'scripts', 'hooks', hook)], {
      cwd: repo,
      stdio: 'pipe',
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? 1;
  }
}

/** Argument array, not a shell string — no quoting games for paths with spaces. */
function git(args: string[], cwd = repo): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'mighook-'));
  git(['init', '-q'], repo);
  git(['config', 'user.email', 't@t.t']);
  git(['config', 'user.name', 't']);
  mkdirSync(join(repo, 'migrations'), { recursive: true });
  // The hooks shell out to scripts/validate-migration.js by relative path.
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'scripts', 'validate-migration.js'), join(repo, 'scripts', 'validate-migration.js'));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('migration hooks validate the STAGED blob, not the worktree', () => {
  it('validate-migrations.sh REJECTS an unsafe staged blob hidden by a safe worktree copy', () => {
    // The reproduction. `git status` shows AM: the index holds the unsafe
    // version, the worktree holds a fixed one. A plain `git commit` records
    // the UNSAFE blob — so validating the worktree passes the wrong bytes.
    const file = join(repo, 'migrations', '900_probe.sql');
    writeFileSync(file, UNSAFE);
    git(['add', 'migrations/900_probe.sql']);
    writeFileSync(file, SAFE); // fix ONLY the worktree

    expect(git(['status', '--short']).trim()).toMatch(/^AM/);
    expect(runHook('validate-migrations.sh')).toBe(1);
  });

  it('check-migration-down-comments.sh REJECTS uncommented DDL in the staged blob', () => {
    // Same class, sibling invariant (the mig-118 bug-of-record): DDL under
    // -- DOWN executes and silently undoes the migration.
    const file = join(repo, 'migrations', '901_probe.sql');
    writeFileSync(file, '-- UP\nSELECT 1;\n\n-- DOWN\nDROP TABLE permits;\n');
    git(['add', 'migrations/901_probe.sql']);
    writeFileSync(file, '-- UP\nSELECT 1;\n\n-- DOWN\n--   DROP TABLE permits;\n');

    expect(runHook('check-migration-down-comments.sh')).toBe(1);
  });
});

describe('the hooks fail CLOSED, never open', () => {
  it('validate-migrations.sh still validates when the worktree copy is gone (AD)', () => {
    // --diff-filter=ACM does NOT exclude AD, so the blob is still committable.
    // This used to exit 1 only BY ACCIDENT (grep erroring on a missing file);
    // now it exits 1 because it read the staged blob and found no -- DOWN.
    const file = join(repo, 'migrations', '902_probe.sql');
    writeFileSync(file, UNSAFE);
    git(['add', 'migrations/902_probe.sql']);
    rmSync(file);

    expect(git(['status', '--short']).trim()).toMatch(/^AD/);
    expect(runHook('validate-migrations.sh')).toBe(1);
  });

  it('check-migration-down-comments.sh still catches DDL under DOWN when the worktree copy is gone (AD)', () => {
    // THE silent fail-open: awk was pointed at a file that no longer existed,
    // errored to stderr, left HIT empty, and the hook exited 0 having
    // validated nothing. Each hook is asserted against ITS OWN invariant —
    // a file with no `-- DOWN` at all is not this hook's violation to report.
    const file = join(repo, 'migrations', '906_probe.sql');
    writeFileSync(file, '-- UP\nSELECT 1;\n\n-- DOWN\nDROP TABLE permits;\n');
    git(['add', 'migrations/906_probe.sql']);
    rmSync(file);

    expect(git(['status', '--short']).trim()).toMatch(/^AD/);
    expect(runHook('check-migration-down-comments.sh')).toBe(1);
  });

  it('validate-migrations.sh rejects when the node validator cannot run', () => {
    // `if command -v node` made the DROP guards, the NOT-NULL-DEFAULT check
    // and the CONCURRENTLY check OPTIONAL — the last is what catches an
    // ACCESS EXCLUSIVE lock on a large table. An unavailable validator is not
    // a reason to pass.
    //
    // The staged content is SAFE on purpose. An earlier version of this test
    // staged UNSAFE content and "passed" before the fix existed — the hook was
    // failing on the content, not on the missing validator, so the test could
    // not tell the two apart. With safe content the ONLY reason to reject is
    // the guard under test.
    const file = join(repo, 'migrations', '903_probe.sql');
    writeFileSync(file, SAFE);
    git(['add', 'migrations/903_probe.sql']);

    // Sanity: with node available this same input is accepted.
    expect(runHook('validate-migrations.sh')).toBe(0);

    const stripped = { ...process.env, PATH: '/nonexistent-bin', MSYS_NO_PATHCONV: '1' };
    let code = 0;
    try {
      execFileSync('bash', [join(ROOT, 'scripts', 'hooks', 'validate-migrations.sh')], {
        cwd: repo,
        stdio: 'pipe',
        env: stripped,
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
    }
    expect(code).toBe(1);
  });
});

describe('the hooks keep passing what they should pass', () => {
  it('a safe staged migration is accepted by both hooks', () => {
    const file = join(repo, 'migrations', '904_probe.sql');
    writeFileSync(file, SAFE);
    git(['add', 'migrations/904_probe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(0);
    expect(runHook('check-migration-down-comments.sh')).toBe(0);
  });

  it('no staged migrations is a clean pass, not an error', () => {
    writeFileSync(join(repo, 'README.md'), 'hi\n');
    git(['add', 'README.md']);

    expect(runHook('validate-migrations.sh')).toBe(0);
    expect(runHook('check-migration-down-comments.sh')).toBe(0);
  });

  it('a filename containing a space is still validated', () => {
    // The loop handles spaces; the unquoted node invocation did not.
    const file = join(repo, 'migrations', '905 probe.sql');
    writeFileSync(file, UNSAFE);
    git(['add', 'migrations/905 probe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(1);
  });
});
