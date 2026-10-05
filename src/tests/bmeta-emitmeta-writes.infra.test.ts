// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (SQL witness resolver; consumer-registry unproduced reads, class b-meta)
//
// RED-FIRST (b-meta class, FLEET-2 unproduced reads). An unconverted step's PIPELINE_META `writes`
// list (its `pipeline.emitMeta(reads, writes)` call) is what the lineage snapshot records, and the
// consumer registry resolves every src/ read against it. So it must declare every column the
// script's OWN SQL writes. This lock parses each script with the TypeScript compiler API, resolves
// every statically-parseable write statement with scripts/lib/sql-witness/resolve.cjs against
// docs/reports/witness/_catalog.json, and requires SQL-written columns ⊆ the union of the script's
// emitMeta write lists. Statements whose text is built from interpolated identifiers (a dynamic
// SET list) cannot be resolved statically and are counted, never guessed.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type * as TS from 'typescript';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the TS compiler API, loaded as step-conformance.infra.test.ts loads it
const ts = require('typescript') as typeof import('typescript');

interface ResolveResult { kind: string; writes: Record<string, string[]>; error: string | null }
interface Resolver {
  init: () => Promise<void>;
  resolveStatement: (sql: string, catalog: unknown) => ResolveResult;
}

const ROOT = process.cwd();
const SCRIPTS = [
  'scripts/classify-lifecycle-phase.js',
  'scripts/classify-permits.js',
  'scripts/compute-trade-forecasts.js',
  'scripts/dispatch-notifications.js',
  'scripts/enrich-wsib.js',
];
const WRITE_RE = /\b(INSERT\s+INTO|UPDATE\s+[a-z_]+(\s+[a-z_]+)?\s+SET|DELETE\s+FROM)\b/i;

/** Every string / template literal in the file; a template's `${…}` becomes a bind placeholder. */
function sqlLiterals(sf: TS.SourceFile): Array<{ text: string; line: number; interpolated: boolean }> {
  const out: Array<{ text: string; line: number; interpolated: boolean }> = [];
  const visit = (n: TS.Node): void => {
    const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      out.push({ text: n.text, line, interpolated: false });
    } else if (ts.isTemplateExpression(n)) {
      let t = n.head.text;
      for (const span of n.templateSpans) {
        // `$${i}` is a bind ordinal, `VALUES ${tuples}` a tuple list, anything else one value.
        t += (t.endsWith('$') ? '1' : /VALUES\s*$/i.test(t) ? '($1)' : '$1') + span.literal.text;
      }
      out.push({ text: t, line, interpolated: true });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The union of every `pipeline.emitMeta(reads, writes)` call's writes object (string-literal arrays). */
function emitMetaWrites(sf: TS.SourceFile): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const visit = (n: TS.Node): void => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'pipeline.emitMeta' && n.arguments.length >= 2) {
      const w = n.arguments[1];
      if (w && ts.isObjectLiteralExpression(w)) {
        for (const p of w.properties) {
          if (!ts.isPropertyAssignment(p) || !ts.isArrayLiteralExpression(p.initializer)) continue;
          const table = ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf);
          const set = out[table] ?? new Set<string>();
          for (const e of p.initializer.elements) if (ts.isStringLiteral(e)) set.add(e.text);
          out[table] = set;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

let R: Resolver;
let catalog: unknown;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS resolver under use
  R = require(path.join(ROOT, 'scripts/lib/sql-witness/resolve.cjs')) as Resolver;
  await R.init();
  catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/witness/_catalog.json'), 'utf8'));
});

describe('b-meta — an unconverted script\'s emitMeta writes declare every column its own SQL writes', () => {
  for (const rel of SCRIPTS) {
    it(`${rel}: SQL-written columns ⊆ emitMeta writes`, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const declared = emitMetaWrites(sf);
      expect(Object.keys(declared).length, `${rel}: no emitMeta writes object found`).toBeGreaterThan(0);
      const missing: string[] = [];
      const unresolved: string[] = [];
      let resolvedWrites = 0;
      for (const lit of sqlLiterals(sf)) {
        if (!WRITE_RE.test(lit.text)) continue;
        const r = R.resolveStatement(lit.text, catalog);
        if (r.error && r.error.startsWith('FAIL:INPUT:parse:')) {
          // Only a statement assembled from interpolated text may be unparseable statically.
          expect(lit.interpolated, `${rel}:${lit.line} a literal write statement failed to parse: ${r.error}`).toBe(true);
          unresolved.push(`${rel}:${lit.line}`);
          continue;
        }
        for (const [table, cols] of Object.entries(r.writes)) {
          for (const c of cols) {
            resolvedWrites += 1;
            if (!declared[table]?.has(c)) missing.push(`${table}.${c} (:${lit.line})`);
          }
        }
      }
      expect(resolvedWrites, `${rel}: no write statement resolved — the lock would be vacuous`).toBeGreaterThan(0);
      expect(missing, `${rel}: written by its SQL but absent from emitMeta writes (unresolved dynamic statements: ${unresolved.join(', ') || 'none'})`).toEqual([]);
    });
  }
});
