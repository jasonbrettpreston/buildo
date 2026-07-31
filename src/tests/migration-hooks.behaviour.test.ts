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

  it('validate-migrations.sh rejects when the node validator cannot run', (ctx) => {
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

    // Build a PATH that still has bash AND git but NOT node. Getting this
    // wrong is how this test has already failed twice: a PATH without bash
    // means execFileSync cannot spawn bash itself (ENOENT, status null), and a
    // `?? 1` fallback scored that as a pass while the hook never ran. If node
    // cannot actually be excluded on this platform, SKIP loudly — a test that
    // cannot exercise its subject must not report success.
    const dirOf = (cmd: string): string | null => {
      try {
        const p = execFileSync('bash', ['-lc', `command -v ${cmd}`], { stdio: 'pipe' })
          .toString().trim();
        return p ? p.replace(/\/[^/]+$/, '') : null;
      } catch {
        return null;
      }
    };
    const bashDir = dirOf('bash');
    const gitDir = dirOf('git');
    if (!bashDir || !gitDir) {
      ctx.skip();
      return;
    }
    const leanPath = [bashDir, gitDir].join(':');
    let nodeStillFound = true;
    try {
      execFileSync('bash', ['-c', 'command -v node'], {
        stdio: 'pipe',
        env: { ...process.env, PATH: leanPath },
      });
    } catch {
      nodeStillFound = false;
    }
    if (nodeStillFound) {
      ctx.skip(); // cannot exclude node here; refuse to fake a pass
      return;
    }

    // Spawn bash by ABSOLUTE path. On Windows, Node resolves the executable
    // through the WINDOWS PATH, so handing it a POSIX PATH breaks the spawn
    // rather than the hook — the failure mode this test keeps hitting.
    let bashExe: string;
    try {
      bashExe = execFileSync('bash', ['-lc', 'cygpath -w "$(command -v bash)" 2>/dev/null || command -v bash'], {
        stdio: 'pipe',
      }).toString().trim();
    } catch {
      ctx.skip();
      return;
    }
    if (!bashExe) {
      ctx.skip();
      return;
    }

    const stripped = { ...process.env, PATH: leanPath, MSYS_NO_PATHCONV: '1' };
    let code = 0;
    let stderr = '';
    let spawnCode: string | undefined;
    try {
      execFileSync(bashExe, [join(ROOT, 'scripts', 'hooks', 'validate-migrations.sh')], {
        cwd: repo,
        stdio: 'pipe',
        env: stripped,
      });
    } catch (err) {
      const e = err as { status?: number | null; code?: string; stderr?: Buffer };
      spawnCode = e.code;
      code = typeof e.status === 'number' ? e.status : -1;
      stderr = e.stderr?.toString() ?? '';
    }

    // If bash could not be spawned, this test proves nothing — say so loudly
    // rather than passing.
    expect(spawnCode, 'bash itself failed to spawn — the hook never ran').not.toBe('ENOENT');
    expect(code).toBe(1);
    expect(stderr).toContain('node is required');
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

  it('marker matching stays case-insensitive and whitespace-tolerant', () => {
    // `grep -qiE` and the `[[:space:]]*` allowances were a deliberate choice
    // (fe5080c3) pinned ONLY by a deleted source-string test. The behavioural
    // suite used exclusively uppercase `-- UP`, so dropping -i would have gone
    // unnoticed — the one marker property this WF actually touched (anchoring)
    // was the one with no behavioural lock.
    const file = join(repo, 'migrations', '907_probe.sql');
    writeFileSync(file, '  --   up\nSELECT 1;\n\n\t-- Down\n--   DROP TABLE x;\n');
    git(['add', 'migrations/907_probe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(0);
  });

  it('anchored markers still reject a near-miss like -- UPDATE / -- DOWNGRADE', () => {
    // The anchoring this WF added: these words must NOT satisfy the markers.
    const file = join(repo, 'migrations', '908_probe.sql');
    writeFileSync(file, '-- UPDATE the widgets\nSELECT 1;\n-- DOWNGRADE notes\n');
    git(['add', 'migrations/908_probe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(1);
  });

  it('catches INDENTED DDL under DOWN, and a hyphen-banner DOWN marker', () => {
    // Both hardenings came from an adversarial review (e5a9a67e) and were
    // verified only by a manual integration test — never locked.
    const indented = join(repo, 'migrations', '909_probe.sql');
    writeFileSync(indented, '-- UP\nSELECT 1;\n\n-- DOWN\n    DROP TABLE permits;\n');
    git(['add', 'migrations/909_probe.sql']);
    expect(runHook('check-migration-down-comments.sh')).toBe(1);

    const banner = join(repo, 'migrations', '910_probe.sql');
    writeFileSync(banner, '-- UP\nSELECT 1;\n\n-- ==== DOWN ====\nDROP TABLE permits;\n');
    git(['add', 'migrations/910_probe.sql']);
    expect(runHook('check-migration-down-comments.sh')).toBe(1);
  });

  it('a NON-ASCII filename cannot skip validation (core.quotePath)', () => {
    // Reproduced by the Regression Guardian: git renders a non-ASCII path as
    // "migrations/\303\251probe.sql" in non -z output, `grep -E '^migrations/'`
    // misses the leading quote, the early-exit guard saw an empty list, and
    // BOTH hooks exited 0 on an unsafe migration. The comment claimed this was
    // closed while only the loop was NUL-safe — a stated-but-absent fence,
    // which is the exact defect class this WF exists to remove.
    const file = join(repo, 'migrations', '911_éprobe.sql');
    writeFileSync(file, UNSAFE);
    git(['add', 'migrations/911_éprobe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(1);
  });

  it('rejects a missing -- UP marker IN ISOLATION', () => {
    // The UNSAFE fixture trips the node validator at the same time, so the
    // marker check was never exercised on its own. This content is otherwise
    // valid: only the UP marker is absent.
    const file = join(repo, 'migrations', '912_probe.sql');
    writeFileSync(file, 'SELECT 1;\n\n-- DOWN\n--   SELECT 2;\n');
    git(['add', 'migrations/912_probe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(1);
  });

  it('a filename containing a space is still validated', () => {
    // The loop handles spaces; the unquoted node invocation did not.
    const file = join(repo, 'migrations', '905 probe.sql');
    writeFileSync(file, UNSAFE);
    git(['add', 'migrations/905 probe.sql']);

    expect(runHook('validate-migrations.sh')).toBe(1);
  });
});
