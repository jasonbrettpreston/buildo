// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
//
// Parse-smoke guard for scripts/load-parcels.js.
//
// Why this exists (WF3 2026-05-30): load-parcels.js was committed in 10db268
// (2026-05-23) with a backtick inside its multi-line SQL template literal
// (an SQL comment `passes `null` for ...` at line ~314). That backtick
// terminated the template early, so the file threw
// `SyntaxError: missing ) after argument list` and NEVER parsed — the sources
// chain hard-failed at step 4 (`parcels`) for a week. The pre-commit hook
// (typecheck = tsc on TS only; eslint; tests) never node --check'd the loader,
// and no test exercised its parse, so a non-parsing loader passed CI.
//
// This test closes that gap: `node --check` runs Node's syntax checker over the
// file and exits non-zero on a parse error WITHOUT executing it. We deliberately
// do NOT `require()` the loader — load-parcels.js calls `pipeline.run(...)`
// unconditionally at module scope (no `require.main === module` guard), so
// require()-ing it would fire a real DB-connecting pipeline run as a background
// side-effect inside the test process. `node --check` parses with zero side
// effects, which is exactly the property we want to lock.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const LOADER = resolve(process.cwd(), 'scripts/load-parcels.js');

describe('load-parcels.js — parse-smoke guard', () => {
  it('passes `node --check` (file parses without a SyntaxError)', () => {
    // execFileSync throws if node exits non-zero (i.e. a parse error). stdio
    // 'pipe' keeps the checker's stderr off the test console on success.
    expect(() => execFileSync('node', ['--check', LOADER], { stdio: 'pipe' })).not.toThrow();
  });
});
