// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §8 rule 1 (no per-row code; G-EXC-LIT), §9 G-EXC-LIT row
//            ("no regulation id or exception number as an executable literal in `scripts/` or `src/`"), §9 (`--check`
//            statically imports check() / selfTest()); docs/specs/01-pipeline/69_mcbylaw_policy.md M-25 (legacy compute
//            report-only until Phase 3); .cursor/mcbylaw/phase2-plan-v2.md row L8
//
// G-EXC-LIT on the real tree: the blocking scope (McBylaw modules + new compute) is clean, the committed allow-list
// has no orphan, every explicit scope path exists, and the report-only findings are rendered (counted, never failing).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const X = await load('scripts/analysis/bylaw/exc-lit.mjs');
const TREE: Json = X.importError ? { violations: [X.importError], counts: { files: {} } } : X.checkTree({ root: process.cwd() }); // one scan, shared

describe('G-EXC-LIT — current tree', () => {
  it('module loads', () => expect(X.importError).toBeUndefined());

  it('passes: 0 blocking violations, 0 allow-list or scope structural violations', () => {
    const r = TREE;
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBeGreaterThan(500); // scripts/ + src/ code files (not vacuous)
    expect(r.counts.files.blocking).toBeGreaterThan(20); // the McBylaw modules are actually scanned
    expect(r.counts.allowed).toBeGreaterThan(0); // the allow-list is exercised on the real tree, not only in fixtures
  });

  it('the report renders the blocking / report-only split and every finding (LF, sorted, deterministic)', () => {
    const a = X.renderReport(TREE);
    const b = X.renderReport(X.checkExcLit({ sources: X.loadSources(process.cwd()) }));
    expect(a).toBe(b);
    expect(a).not.toMatch(/\r/);
    expect(a).toMatch(/^G-EXC-LIT: (PASS|FAIL) · blocking \d+ · report_only \d+ · allowed \d+ · files \d+/);
  });
});
