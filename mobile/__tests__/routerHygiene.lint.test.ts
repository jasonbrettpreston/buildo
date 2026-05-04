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
 * Find every `useEffect(() => { ... }, [DEPS])` block. Returns the body string
 * + the deps string. Brace-depth tracker so nested `{}` (if-blocks, switches,
 * literals) inside the effect body don't truncate the match.
 */
interface EffectBlock {
  body: string;
  deps: string;
  startLine: number;
}
function extractUseEffects(src: string): EffectBlock[] {
  const out: EffectBlock[] = [];
  const re = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const bodyStart = m.index + m[0].length;
    // Walk forward tracking `{` `}` depth (start at depth 1 — we already
    // consumed the opening brace via the regex).
    let depth = 1;
    let i = bodyStart;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth !== 0) continue; // unbalanced — skip
    const bodyEnd = i - 1; // index of the `}` we just consumed
    const body = src.slice(bodyStart, bodyEnd);
    // After the `}` we expect `, [DEPS])`. Find the next `[` and matching `]`.
    const tail = src.slice(i);
    const depsOpen = tail.indexOf('[');
    if (depsOpen === -1) continue;
    const depsClose = tail.indexOf(']', depsOpen + 1);
    if (depsClose === -1) continue;
    const deps = tail.slice(depsOpen + 1, depsClose);
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
