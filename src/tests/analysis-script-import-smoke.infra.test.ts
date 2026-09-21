// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen step shape —
//   the file-shape rule that RETIRES a compute module's old surface on conversion)
//
// WF3 C6 (`.cursor/wf3_test_db_suite_red_active_task.md`, 2026-09-21) — `scripts/analysis/*.js`
// scripts are exempt from Spec 47's R1-R12 skeleton (not a pipeline step; no descriptor, no
// advisory lock, not in `manifest.json` or `docs/runbook/`), so nothing in `npm run test`,
// `step:validate`, or a chain run notices when one of them `require()`s a converted step's old
// function-export surface after a conversion retires it. `scripts/analysis/wf3-cost-coherence-
// sanity.js` did exactly that — it called 4 retired `scripts/enrich-parcels.js` exports
// (`enrichParcels`/`enrichMaxBuild`/`enrichExistingStructure`/`enrichOptimalConfig`) and threw
// `TypeError` on first use, untouched since the ENRICHER conversion (commit `d79191cf`) despite
// being touched IN that same commit (its `buildParcelCostMenu` call site was updated to pass
// `config:`, but its enrich-parcels calls were not swept). Zero test coverage caught it.
//
// This lock is generic, not single-use: add a REGISTRY entry for the next analysis script that
// `require()`s a converted compute module, so the NEXT conversion's non-test callers get swept
// automatically instead of discovered the same way this one was (by hand, reading the file).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
// REAL AST parse, matches the step-conformance.infra.test.ts LW-D11 convention (a regex/lexer
// breaks on this repo's apostrophe-and-brace-dense prose comments)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require('typescript') as typeof import('typescript');

/**
 * One entry per standalone (non-test) script whose call sites against a converted step's
 * compute module are worth smoke-testing. `localName` is the script's own top-level `require()`
 * binding name; `modulePath` is the repo-relative file it actually resolves to at runtime.
 */
const REGISTRY: Array<{ script: string; localName: string; modulePath: string }> = [
  {
    script: 'scripts/analysis/wf3-cost-coherence-sanity.js',
    localName: 'compute',
    modulePath: 'scripts/lib/compute/enrich-parcels.js',
  },
];

/** Every `<localName>.<method>(...)` CALL SITE (not a bare property read) in `source`, via the real TS AST. */
function callSitesOn(source: string, localName: string): string[] {
  const sf = ts.createSourceFile('probe.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = new Set<string>();
  const visit = (node: import('typescript').Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === localName
    ) {
      found.add(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...found];
}

describe('analysis-script import smoke (WF3 C6) — every symbol a registered script CALLS on a required module actually exists there', () => {
  it(`the registry is not empty (found ${REGISTRY.length} entr${REGISTRY.length === 1 ? 'y' : 'ies'} — a zero-length registry would make every assertion below vacuous)`, () => {
    expect(REGISTRY.length).toBeGreaterThan(0);
  });

  it('RED half — a call site on a symbol the target module does not export IS caught (proves the checker fires, not merely agrees)', () => {
    const fakeSource = `const ep = require('./x'); ep.enrichParcels(client, {});`;
    const sites = callSitesOn(fakeSource, 'ep');
    expect(sites).toEqual(['enrichParcels']);
    const fakeModule: Record<string, unknown> = { descriptor: {}, compute: () => {}, run: () => {} };
    const missing = sites.filter((name) => typeof fakeModule[name] !== 'function');
    expect(missing, 'the fixture is supposed to trip the checker').toEqual(['enrichParcels']);
  });

  it('GREEN half — a call site on a symbol the target module DOES export is NOT flagged (the checker does not over-fire)', () => {
    const fakeSource = `const ep = require('./x'); ep.enrichParcels(client, {});`;
    const sites = callSitesOn(fakeSource, 'ep');
    const realModule: Record<string, unknown> = { enrichParcels: () => {} };
    const missing = sites.filter((name) => typeof realModule[name] !== 'function');
    expect(missing).toEqual([]);
  });

  for (const { script, localName, modulePath } of REGISTRY) {
    it(`${script} — every "${localName}.<method>(...)" call site resolves to a real function on ${modulePath}`, () => {
      const scriptSrc = fs.readFileSync(path.join(REPO_ROOT, script), 'utf8');
      const sites = callSitesOn(scriptSrc, localName);
      expect(sites.length, `no "${localName}.<method>(...)" call sites found — the probe stopped matching this script (retarget it, don't delete the check)`).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module this script requires
      const mod = require(path.join(REPO_ROOT, modulePath)) as Record<string, unknown>;
      const missing = sites.filter((name) => typeof mod[name] !== 'function');
      expect(
        missing,
        `${script} calls ${localName}.${missing.join(', ')}(...), which ${modulePath} does not export as a function ` +
          '(a step conversion retired this symbol without sweeping this script\'s call sites)',
      ).toEqual([]);
    });
  }
});
