/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §5.4 + §6.1 + §9.15
//
// Two static-analysis lint rules per Spec 99:
//
// (1) §5.4 Router-effect hygiene — useEffect bodies whose deps array contains
//     `router` MUST NOT call Zustand store hooks (`useXStore(...)`). Hooks at
//     non-component scope are an illegal React pattern in the first place, but
//     they're also the exact shape that caused the §9.6 dual-router loop:
//     subscribing to a fast-changing store inside a router effect re-runs the
//     effect on every store mutation. Lazy reads via `useXStore.getState()` are
//     PERMITTED — that's a store accessor, not a hook subscription.
//
// (2) §6.1 Atomic-selector mandate — `useXStore()` (zero-arg / no selector) is
//     BANNED in `mobile/app/**/*.tsx` + `mobile/src/components/**/*.tsx`.
//     Whole-store reads re-render the component on EVERY field mutation.
//     Atomic primitive selectors (`useXStore((s) => s.field)`) or `useShallow`
//     for object/array selectors are required.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ROUTER_EFFECT_FILES = [
  path.join(REPO_ROOT, 'app/_layout.tsx'),
  path.join(REPO_ROOT, 'app/(app)/_layout.tsx'),
];

/** Recursively walk a directory for .tsx files. */
function walkTsx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip line comments, block comments, and string-literal contents from
 * source so the brace-depth walker in `extractUseEffects()` is not
 * desynced by `{` or `}` inside strings/templates/comments. Replaces
 * string contents with spaces of equal length so character indices and
 * line numbers stay stable. Per WF2 P2 review #5 (Gemini + DeepSeek
 * consensus on brace-walker comment/string blindness).
 */
function stripStringsAndComments(src: string): string {
  // Block comments first (greedy non-nested).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Line comments.
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  // String literals: single-quoted, double-quoted, template-literal. Crude
  // (does not handle escaped quotes inside strings perfectly), but the
  // sole purpose is to neutralize stray `{` / `}` chars inside string
  // contents — false positives where we strip too much only weaken the
  // STORE_HOOK_CALL search, not produce false test failures.
  out = out.replace(/'([^'\\\n]|\\.)*'/g, (m) => `'${' '.repeat(m.length - 2)}'`);
  out = out.replace(/"([^"\\\n]|\\.)*"/g, (m) => `"${' '.repeat(m.length - 2)}"`);
  out = out.replace(/`([^`\\]|\\.)*`/g, (m) => `\`${' '.repeat(m.length - 2)}\``);
  return out;
}

/**
 * Find every `useEffect(() => { ... }, [DEPS])` block (including async
 * variant `useEffect(async () => { ... })`). Returns the body string +
 * the deps string. Brace-depth tracker on a comment/string-stripped
 * variant of the source so nested `{}` inside if-blocks/switches DO
 * count, but `{}` inside string literals or comments do NOT (per WF2 P2
 * review #5+#8: handle the `useEffect(async ...)` variant DeepSeek
 * flagged AND the comment/string blindness all three reviewers flagged).
 */
interface EffectBlock {
  body: string;
  deps: string;
  startLine: number;
}
function extractUseEffects(src: string): EffectBlock[] {
  const out: EffectBlock[] = [];
  // Walk on the comment/string-stripped clone so brace counts are correct,
  // but slice the ORIGINAL src for body text so the caller sees real code.
  const safe = stripStringsAndComments(src);
  // Allow optional `async` keyword (DeepSeek WF2 P2 review #8: the prior
  // regex silently skipped `useEffect(async () => …)` effects, letting
  // a developer bypass the lint by adding `async`).
  const re = /useEffect\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{/g;
  let m: RegExpExecArray | null;
  // Run the regex against `safe` so brace-shaped chars inside string/
  // comment content can never spuriously open an effect. Indices line up
  // with `src` because `stripStringsAndComments` preserves length.
  while ((m = re.exec(safe)) !== null) {
    const bodyStart = m.index + m[0].length;
    // Walk forward tracking `{` `}` depth on the SAFE source (so braces
    // inside strings/comments don't count) — start at depth 1 since the
    // regex consumed the opening brace.
    let depth = 1;
    let i = bodyStart;
    while (i < safe.length && depth > 0) {
      const ch = safe[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth !== 0) continue; // unbalanced — skip
    const bodyEnd = i - 1; // index of the `}` we just consumed
    const body = src.slice(bodyStart, bodyEnd);
    // After the `}` we expect `, [DEPS])`. Bracket search on `safe` so a
    // `[` inside a string literal in the dep arg's spread doesn't trip
    // us. Most deps arrays are simple identifier lists; we don't
    // currently have nested bracketed expressions like `items[0]`.
    const safeTail = safe.slice(i);
    const depsOpen = safeTail.indexOf('[');
    if (depsOpen === -1) continue;
    const depsClose = safeTail.indexOf(']', depsOpen + 1);
    if (depsClose === -1) continue;
    const deps = src.slice(i + depsOpen + 1, i + depsClose);
    const startLine = src.slice(0, m.index).split('\n').length;
    out.push({ body, deps, startLine });
  }
  return out;
}

const STORE_HOOK_CALL = /\buse[A-Z]\w*Store\s*\(/g;
/** A "hook call" is `useXStore(` NOT followed (after optional whitespace) by
 *  `.getState`. Lazy reads `useXStore.getState()` are permitted. We approximate
 *  by checking that the match is `useXStore(` and not `useXStore.getState(`. */
function findStoreHookCalls(body: string): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  STORE_HOOK_CALL.lastIndex = 0;
  while ((m = STORE_HOOK_CALL.exec(body)) !== null) {
    // Look back: was the previous non-whitespace char part of `.getState`?
    // Easier: check that the match starts with `useXStore(` (which it does by
    // construction) — `.getState()` would not match because of the `.` between
    // store name and `getState`. So any STORE_HOOK_CALL match IS a hook call.
    hits.push(m[0]);
  }
  return hits;
}

describe('§5.4 Router-effect hygiene — Spec 99 §9.15 (rule 1)', () => {
  for (const file of ROUTER_EFFECT_FILES) {
    const rel = path.relative(REPO_ROOT, file);
    it(`${rel}: no Zustand hook calls inside useEffect blocks whose deps include 'router'`, () => {
      expect(fs.existsSync(file)).toBe(true);
      const src = fs.readFileSync(file, 'utf-8');
      const effects = extractUseEffects(src);
      const violations: { startLine: number; deps: string; calls: string[] }[] = [];
      for (const eff of effects) {
        const depsList = eff.deps.split(',').map((s) => s.trim());
        if (!depsList.includes('router')) continue;
        const calls = findStoreHookCalls(eff.body);
        if (calls.length > 0) {
          violations.push({ startLine: eff.startLine, deps: eff.deps, calls });
        }
      }
      if (violations.length > 0) {
        const msg = violations
          .map(
            (v) =>
              `  - ${rel}:${v.startLine} (deps: [${v.deps}])\n    forbidden: ${v.calls.join(', ')}`,
          )
          .join('\n');
        throw new Error(
          `Router-effect hygiene violation(s) — use \`useXStore.getState().<field>\` for lazy reads:\n${msg}`,
        );
      }
    });
  }
});

describe('§6.1 Atomic-selector mandate — Spec 99 §9.15 (rule 2)', () => {
  // Glob `mobile/app/**/*.tsx` + `mobile/src/components/**/*.tsx`.
  const APP_DIR = path.join(REPO_ROOT, 'app');
  const COMPONENTS_DIR = path.join(REPO_ROOT, 'src/components');
  const files = [...walkTsx(APP_DIR), ...walkTsx(COMPONENTS_DIR)];
  // Self-test: discovery isn't silently broken.
  it('discovers .tsx files in app/ and src/components/', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  // Whole-store read: `useXStore()` with empty parens. Captures the store
  // name so the failure message is actionable.
  const WHOLE_STORE_READ = /\b(use[A-Z]\w*Store)\s*\(\s*\)/g;

  it.each(files)('%s: no whole-store reads (`useXStore()` with no selector)', (file) => {
    const src = fs.readFileSync(file, 'utf-8');
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    WHOLE_STORE_READ.lastIndex = 0;
    while ((m = WHOLE_STORE_READ.exec(src)) !== null) {
      const lineNo = src.slice(0, m.index).split('\n').length;
      matches.push(`${m[1]}() at line ${lineNo}`);
    }
    if (matches.length > 0) {
      const rel = path.relative(REPO_ROOT, file);
      throw new Error(
        `Whole-store read(s) in ${rel} — replace with atomic primitive selectors (Spec 99 §6.1):\n` +
          matches.map((s) => `  - ${s}`).join('\n'),
      );
    }
  });
});
