// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (LW-D11 harness-fidelity; wave-4 W4A-R5,
//            operator y 2026-10-18 — follows LW-D11, no new rule)
//
// LW-D11: STEP_CTX_KEYS is "exactly the `stepCtx = { ... }` object's own key set". The harness-fidelity lock in
// step-conformance.infra lets a red-suite ctx-builder set ONLY these keys, so a key the runner assigns but the list
// omits (W4A-R5: `contextRow`) makes a real runner channel unreachable from every red suite. This lock derives the
// literal's key set from the runner source and requires equality, so the list can never drift from the literal again.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const runner = require(join(process.cwd(), 'scripts/lib/step/index.js')) as { STEP_CTX_KEYS: readonly string[] };
/* eslint-enable @typescript-eslint/no-require-imports */

/** The property names of the one `const stepCtx = { ... }` object literal in the runner, read with the TypeScript AST. */
function stepCtxLiteralKeys(): string[] {
  const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
  const sf = ts.createSourceFile('index.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: string[][] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'stepCtx' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      found.push(n.initializer.properties.map((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : '?')));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  expect(found, 'the runner builds exactly one stepCtx literal').toHaveLength(1);
  return [...new Set(found[0]!)].sort();
}

describe('LW-D11 — STEP_CTX_KEYS equals the stepCtx literal (W4A-R5)', () => {
  it('every key the runner assigns onto stepCtx is in STEP_CTX_KEYS, and nothing else is', () => {
    const literal = stepCtxLiteralKeys();
    expect(literal).toContain('report');
    expect([...runner.STEP_CTX_KEYS].sort()).toEqual(literal);
  });
});
