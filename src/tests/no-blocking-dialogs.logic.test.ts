// SPEC LINK: docs/specs/00_engineering_standards.md §12.7 (:342-345)
//
// task-441 FINAL.6 (RR-0385 item 6, tests that mirror the engineering standards). The rule, :344:
//   "**Never:** Build custom alert banners. Never use `alert()`, `confirm()`, or `prompt()` (they freeze the entire mobile browser)."
// TESTED: the `alert()`, `confirm()`, `prompt()` sentence, as a call in tracked web code.
// NOT TESTED (a scan cannot tell a notification or a banner from other UI): "for all success/error/info notifications" (:343) and
// "Build custom alert banners" (:344).
// SCOPE: tracked src/**/*.ts(x), minus src/tests/**, *.test.* and *.d.ts. Mobile is out: section 12 is web front end (:304-306) and the
// phone app has its own never-do list (Spec 90 §5, scripts/analysis/gates/mobile-never-do.mjs).
// LIMITS (stated, not widened): the finder matches by name only. It misses `window['alert']()` and aliased calls; a local function,
// an import or a destructured name called alert, confirm or prompt gives a false red and is renamed (none exists in src today).
// ESLint core `no-alert` and Biome `noAlert` exist but are not turned on; turning one on is a config change the card does not name.
// Files come from `git ls-files` (the src/tests/script-source-scan.ts pattern), so a staged file is seen. No DB, no network.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const NAMES = new Set(['alert', 'confirm', 'prompt']);
const GLOBALS = new Set(['window', 'globalThis', 'self']);

export interface Hit { file: string; line: number; what: string }

/** Every call of alert, confirm or prompt, bare or on window, globalThis or self. Pure: path and text in, hits out. */
export function findBlockingDialogs(rel: string, text: string): Hit[] {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const hits: Hit[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      let what: string | null = null;
      if (ts.isIdentifier(c) && NAMES.has(c.text)) what = `${c.text}()`;
      else if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && GLOBALS.has(c.expression.text) && NAMES.has(c.name.text)) {
        what = `${c.expression.text}.${c.name.text}()`;
      }
      if (what) hits.push({ file: rel, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, what });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

function scannedFiles(): string[] {
  return execFileSync('git', ['ls-files', '--', 'src/'], { cwd: ROOT, stdio: 'pipe' })
    .toString()
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => /\.tsx?$/.test(f) && !f.startsWith('src/tests/') && !/\.test\./.test(f) && !f.endsWith('.d.ts'));
}

describe('§12.7: no alert(), confirm() or prompt() in web code', () => {
  it('A. the real tree has no call of alert, confirm or prompt', () => {
    const files = scannedFiles();
    const hits = files.flatMap((f) => findBlockingDialogs(f, readFileSync(join(ROOT, f), 'utf8')));
    const report = hits.map((h) => `  ${h.file}:${h.line} ${h.what}`).join('\n');
    console.log(`§12.7: scanned ${files.length} files, ${hits.length} hits`);
    expect(hits, `§12.7 (00_engineering_standards.md:344) blocking dialog calls in src:\n${report}`).toEqual([]);
    // 400 files today; a listing that silently shrinks turns this red (vacuous-pass guard).
    expect(files.length).toBeGreaterThan(300);
  });

  it('B. RED planted (KNOWN_BAD): each blocking call form gives exactly one hit with its name', () => {
    const cases: Array<[string, string]> = [
      ["alert('x');", 'alert()'],
      ["window.confirm('y');", 'window.confirm()'],
      ["globalThis.prompt('z');", 'globalThis.prompt()'],
    ];
    for (const [code, what] of cases) {
      const hits = findBlockingDialogs('planted.tsx', code);
      expect(hits, code).toHaveLength(1);
      expect(hits[0]?.what, code).toBe(what);
    }
  });

  it('C. controls: toasts, methods, comments, strings and JSX text give 0 hits', () => {
    const controls = [
      "toast.error('x');",
      'form.confirm();',
      "// alert('x')",
      "const s = 'please confirm (now)';",
      'const e = <p>alert(1)</p>;',
    ];
    for (const code of controls) expect(findBlockingDialogs('control.tsx', code), code).toEqual([]);
  });
});
