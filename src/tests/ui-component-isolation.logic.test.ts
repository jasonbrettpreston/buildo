// SPEC LINK: docs/specs/00_engineering_standards.md §1.2 (:17-18)
//
// task-441 FINAL.6 (RR-0385 item 6, tests that mirror the engineering standards). The rule, :18:
//   "Shared UI components (`src/components/ui/`) must remain pure and stateless where possible. They should not directly fetch data
//    via API calls or rely on global context unless explicitly engineered to do so."
// TESTED: the second sentence. "unless explicitly engineered to do so" is the ENGINEERED map below: one entry per file, with its reason
// (the FENCED form of src/tests/script-source-scan.ts). It is empty today.
// NOT TESTED: "stateless where possible" ("where possible" is a judgment).
// SCOPE: tracked src/components/ui/**/*.ts(x) (2 files today: Badge.tsx, ScoreBadge.tsx).
// FINDER: a call of fetch, useContext, use, useQuery, useMutation, useInfiniteQuery or useSuspenseQuery; React.useContext, React.use
// or window.fetch; an import from '@tanstack/react-query'.
// LIMITS (stated, not widened): a data read through a custom hook is not seen.
// Files come from `git ls-files` (the src/tests/script-source-scan.ts pattern), so a staged file is seen. No DB, no network.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const UI_DIR = 'src/components/ui/';

/**
 * Files under src/components/ui that are "explicitly engineered" to fetch or read context, each with its reason.
 * An entry here is a promise the exception was reasoned about, not a place to park a violation.
 */
export const ENGINEERED: Record<string, string> = {};

const CALLS = new Set(['fetch', 'useContext', 'use', 'useQuery', 'useMutation', 'useInfiniteQuery', 'useSuspenseQuery']);
const MEMBER_CALLS = new Set(['React.useContext', 'React.use', 'window.fetch']);
const QUERY_PACKAGE = '@tanstack/react-query';

export interface Hit { file: string; line: number; what: string }

/** Every data fetch or global context read in one file. Pure: path and text in, hits out. */
export function findUiImpurity(rel: string, text: string): Hit[] {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const hits: Hit[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (ts.isIdentifier(c) && CALLS.has(c.text)) hits.push({ file: rel, line: at(n), what: `${c.text}()` });
      else if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)) {
        const name = `${c.expression.text}.${c.name.text}`;
        if (MEMBER_CALLS.has(name)) hits.push({ file: rel, line: at(n), what: `${name}()` });
      }
    } else if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === QUERY_PACKAGE) {
      hits.push({ file: rel, line: at(n), what: `import from '${QUERY_PACKAGE}'` });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

function uiFiles(): string[] {
  return execFileSync('git', ['ls-files', '--', UI_DIR], { cwd: ROOT, stdio: 'pipe' })
    .toString()
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => /\.tsx?$/.test(f));
}

describe('§1.2: shared UI components do not fetch data or read global context', () => {
  it('A. the real tree, minus ENGINEERED, has no fetch or context read in src/components/ui', () => {
    const files = uiFiles();
    const hits = files.filter((f) => !(f in ENGINEERED)).flatMap((f) => findUiImpurity(f, readFileSync(join(ROOT, f), 'utf8')));
    const report = hits.map((h) => `  ${h.file}:${h.line} ${h.what}`).join('\n');
    console.log(`§1.2: scanned ${files.length} files, ${hits.length} hits`);
    expect(hits, `§1.2 (00_engineering_standards.md:18) data fetch or context read in a shared UI component:\n${report}`).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('B. every ENGINEERED key is a tracked file under src/components/ui (no stale entry)', () => {
    const files = new Set(uiFiles());
    expect(Object.keys(ENGINEERED).filter((k) => !files.has(k))).toEqual([]);
  });

  it('C. RED planted (KNOWN_BAD): each fetch or context form gives exactly one hit', () => {
    const cases = [
      "fetch('/api/x');",
      'useContext(Theme);',
      'React.useContext(T);',
      'use(Ctx);',
      "useQuery({ queryKey: ['k'] });",
      "import { useQueryClient } from '@tanstack/react-query';",
    ];
    for (const code of cases) expect(findUiImpurity('planted.tsx', code), code).toHaveLength(1);
  });

  it('D. controls: local state, helpers, methods, comments and strings give 0 hits', () => {
    const controls = ['useState(0);', "cn('a');", 'api.fetch();', "// fetch('/api')", "const s = 'fetch(';"];
    for (const code of controls) expect(findUiImpurity('control.tsx', code), code).toEqual([]);
  });
});
