// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §P0 (resolve-db, the database-target fence)
// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.9 (real-DB integration tests)
//
// LW-D16 anti-regression lock (WF3, 2026-09-21) — DB-FREE, so it runs in the
// ordinary `npm run test` suite, where the db-test harness itself never does.
//
// LW-D16 was a NAME DISAGREEMENT that nothing checked: every converted step
// declares `database.assert_current_database: "postgres"` (refused by
// `scripts/lib/resolve-db.js#assertDbTarget` otherwise — the Spec 122 §P0
// production fence), while the db-test harness provisioned `buildo_test`. The
// consequence was invisible in the normal suite: 13 committed live-DB locks
// refused on contact and had never once executed, and the failure looked like a
// property of the tests rather than of the harness.
//
// Three things must stay in agreement, and this file is what notices when they
// stop:
//   (a) `src/tests/db/setup-testcontainer.ts` (local testcontainer path)
//   (b) `.github/workflows/db-tests.yml`      (CI service-container path)
//   (c) every committed step descriptor's `database.assert_current_database`
//
// Plus the reason the fix is safe at all: the guard itself was NOT changed.
// (d) asserts `resolve-db.js` and `assertDatabaseTarget` still carry no
// test-context escape hatch — no `BUILDO_TEST_DB`/vitest-aware leniency, no
// swallowed assertion. The harness satisfies the fence; it does not disarm it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const HARNESS_PATH = path.join(REPO_ROOT, 'src/tests/db/setup-testcontainer.ts');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/db-tests.yml');
const RESOLVE_DB_PATH = path.join(REPO_ROOT, 'scripts/lib/resolve-db.js');
const STEP_INDEX_PATH = path.join(REPO_ROOT, 'scripts/lib/step/index.js');

const HARNESS = fs.readFileSync(HARNESS_PATH, 'utf8');
const WORKFLOW = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const RESOLVE_DB = fs.readFileSync(RESOLVE_DB_PATH, 'utf8');
const STEP_INDEX = fs.readFileSync(STEP_INDEX_PATH, 'utf8');

/**
 * Strip `//` and block comments so a prose mention of the OLD name (the
 * harness's own header explains what LW-D16 was) never satisfies — or trips —
 * a predicate that is about executable text. Same discipline as
 * `hooks-composition.infra.test.ts`'s `stripComments`.
 */
function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n');
}

/** The single declared name, read from the harness's own exported constant. */
function harnessDatabaseName(source: string): string | null {
  const m = source.match(/export const TEST_DATABASE_NAME\s*=\s*'([^']+)'/);
  return m && m[1] ? m[1] : null;
}

/** Every committed step descriptor, excluding the schema's deliberate fixtures. */
function descriptorFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'fixtures') continue;
      descriptorFiles(full, acc);
    } else if (entry.name.endsWith('.descriptor.json')) {
      acc.push(full);
    }
  }
  return acc;
}

const HARNESS_DB = harnessDatabaseName(HARNESS);

describe('LW-D16 — the db-test harness provisions the database the step guard demands', () => {
  it('the harness declares its database name once, as an exported constant', () => {
    expect(HARNESS_DB).toBe('postgres');
    // and USES it — no second, hardcoded spelling that could drift from the constant
    expect(HARNESS).toMatch(/POSTGRES_DB:\s*TEST_DATABASE_NAME/);
    expect(HARNESS).toMatch(/\$\{host\}:\$\{port\}\/\$\{TEST_DATABASE_NAME\}/);
    // …and nothing executable still spells the old name (the header's prose may)
    expect(stripTsComments(HARNESS)).not.toMatch(/buildo_test/);
  });

  it('the CI service container provisions the SAME name (three call sites + the health check)', () => {
    expect(WORKFLOW).toMatch(new RegExp(`POSTGRES_DB:\\s*${HARNESS_DB}\\b`));
    expect(WORKFLOW).toMatch(new RegExp(`PG_DATABASE:\\s*${HARNESS_DB}\\b`));
    expect(WORKFLOW).toMatch(new RegExp(`DATABASE_URL:\\s*postgres://[^\\s]*/${HARNESS_DB}\\b`));
    expect(WORKFLOW).toMatch(new RegExp(`pg_isready[^"]*-d ${HARNESS_DB}\\b`));
    expect(WORKFLOW).not.toMatch(/buildo_test/);
  });

  it('every committed descriptor that asserts a database name asserts THIS one', () => {
    const files = descriptorFiles(path.join(REPO_ROOT, 'scripts'));
    expect(files.length).toBeGreaterThan(5); // the walk found the fleet, not nothing

    const declared = files
      .map((f) => {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        return { file: path.relative(REPO_ROOT, f), name: d?.database?.assert_current_database };
      })
      .filter((r) => typeof r.name === 'string' && r.name !== 'none');

    expect(declared.length).toBeGreaterThan(5);
    const mismatched = declared.filter((r) => r.name !== HARNESS_DB);
    expect(
      mismatched.map((r) => `${r.file} → ${r.name}`),
      'a descriptor asserting a database the db-test harness cannot provision can never run live',
    ).toEqual([]);
  });
});

describe('LW-D16 — the fence was satisfied, NOT weakened', () => {
  it('resolve-db.js carries no test-context escape hatch', () => {
    expect(RESOLVE_DB).not.toMatch(/BUILDO_TEST_DB|VITEST|JEST_WORKER_ID/);
    expect(RESOLVE_DB).not.toMatch(/NODE_ENV\s*===\s*['"]test['"]/);
    // the two refusals are still unconditional throws, not warnings
    expect(RESOLVE_DB).toMatch(/throw new Error\(\s*\n?\s*`\[\$\{label\}\] REFUSING: connected to database/);
    expect(RESOLVE_DB).toMatch(/REFUSING to run against a below-floor database/);
  });

  it('the step SDK still forwards the descriptor\'s declaration verbatim', () => {
    const fn = STEP_INDEX.match(
      /async function assertDatabaseTarget\(pool, descriptor\)\s*\{[\s\S]*?\n\}/,
    );
    expect(fn, 'assertDatabaseTarget not found in scripts/lib/step/index.js').toBeTruthy();
    const body = fn![0];
    expect(body).toMatch(/expectDatabase:\s*db\.assert_current_database === 'none' \? undefined : db\.assert_current_database/);
    expect(body).not.toMatch(/BUILDO_TEST_DB|VITEST|NODE_ENV/);
    expect(body).not.toMatch(/catch\s*\(/); // never swallowed
  });
});
