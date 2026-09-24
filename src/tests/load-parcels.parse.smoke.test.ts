// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
//
// Parse-smoke guard for scripts/load-parcels.js.
//
// Why this exists (WF3 2026-05-30): load-parcels.js was committed in 10db268
// (2026-05-23) with a backtick inside its multi-line SQL template literal (an SQL
// comment `passes `null` for ...`, then at line ~314). That backtick terminated the
// template early, so the file threw `SyntaxError: missing ) after argument list` and
// NEVER parsed — the sources chain hard-failed at step 4 (`parcels`) for a week. The
// pre-commit hook (typecheck = tsc on TS only; eslint; tests) never node --check'd the
// loader, and no test exercised its parse, so a non-parsing loader passed CI.
//
// Why it STILL exists after the batch-2 row 3.7 conversion (plan D5 — the in-place
// re-point rule): the shape of the file changed, the failure mode did not. The 585-line
// island became the §5.1 frozen shell — `pipeline.step(descriptor, compute)` plus three
// requires and the §5.4 `ADVISORY_LOCK_ID` source-text constant — and the domain logic
// that once carried the fatal backtick now lives in the COMPUTE
// (scripts/lib/compute/load-parcels.js). Plan D1 REVISED (operator ruling
// 2026-09-24) means the compute no longer authors any SQL text at all — the guarded
// upsert is DEFAULT codegen driven by declared `columns[].on_empty` +
// `outputs.invalidates[].set_null_on_change_of` axes (scripts/lib/step/write.js) — but
// the compute still carries real parse/compute logic (shapeRecord's CSV→column
// mapping, the MBR/shoelace geometry math) that a stray syntax error could break the
// same way. `node --check` over the shell still runs WITHOUT executing it, which is
// exactly the property worth locking: it is the same zero-side-effect parse gate the
// old test was, pointed at the same path.
//
// We deliberately do NOT `require()` the shell. Before the conversion, requiring it
// fired `pipeline.run('load-parcels', …)` unconditionally at module scope. After it,
// requiring it constructs a real `pipeline.step()` (and through it a pool ladder) as a
// side-effect inside the test process — so the probe stays a CHILD PROCESS (the same
// posture src/tests/steps/parcels/violations.test.ts uses via
// scripts/hooks/step-require-probe.cjs), never an import.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const LOADER = resolve(process.cwd(), 'scripts/load-parcels.js');
const COMPUTE = resolve(process.cwd(), 'scripts/lib/compute/load-parcels.js');

describe('load-parcels.js — parse-smoke guard', () => {
  it('passes `node --check` (file parses without a SyntaxError)', () => {
    // execFileSync throws if node exits non-zero (i.e. a parse error). stdio
    // 'pipe' keeps the checker's stderr off the test console on success.
    expect(() => execFileSync('node', ['--check', LOADER], { stdio: 'pipe' })).not.toThrow();
  });

  it('the compute the shell now delegates to also passes `node --check`', () => {
    // The domain logic moved here at the conversion (plan D5 / §5.1). The 2026-05-23
    // incident was a template-literal parse error in the loader; the same class of
    // error anywhere in the compute's parse/compute functions (shapeRecord, the
    // MBR/shoelace geometry math) would now take the step down the same way, so the
    // guard follows the logic rather than the file name. (Plan D1 REVISED: the compute
    // no longer authors the write SQL itself — that risk moved to the shared codegen,
    // proven by step-library.logic.test.ts T5/T7 — but this guard still covers every
    // other line here.)
    expect(() => execFileSync('node', ['--check', COMPUTE], { stdio: 'pipe' })).not.toThrow();
  });

  it('the shell no longer calls `pipeline.run(...)` at module scope (frozen shape, §5.1)', () => {
    const src = execFileSync('node', ['-e', 'process.stdout.write(require("fs").readFileSync(process.argv[1], "utf8"))', LOADER], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    expect(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/.test(src)).toBe(true);
    expect(/pipeline\.run\s*\(/.test(src)).toBe(false);
  });
});
