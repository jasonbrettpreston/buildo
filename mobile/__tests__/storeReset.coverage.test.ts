/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §B5 + §8.5 + §9.12
//
// Store-enumeration coverage test (Spec 99 §8.5 mandate, implementation per
// §9.12). Asserts that for every Zustand store created under
// `mobile/src/store/` (recursively — see WF2 P2 review #7), the sign-out
// fan-out in `authStore.signOut()` calls `use<Name>Store.getState().reset()`
// — OR the store file declares an explicit exemption via
// `// signOut-exempt: <reason>` near its export.
//
// Catches the silent-leak bug where adding a new user-scoped store and
// forgetting to add a `.reset()` call to signOut leaves stale data for the
// next user signing in on a shared device (a class of PIPEDA leak).
//
// Hardening notes from WF2 P2 adversarial review:
//  - Recursive walk (#7 code-reviewer): a future store added under e.g.
//    `mobile/src/store/feed/` must NOT silently escape coverage.
//  - Comment-stripped match (#6 Gemini): a commented-out `.reset()` call
//    must NOT pass — `signOutSrc` is normalized before substring check.
//  - Discovery regex broadened (#4 Gemini+DeepSeek): also matches
//    `createWithEqualityFn` (zustand/traditional), the documented opt-in
//    for shallow-equality selectors.
//  - Hardcoded sanity list dropped (#4): replaced with a count guard so a
//    discovery-regex regression surfaces as a count delta, not a hardcoded-
//    list maintenance burden.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const STORE_DIR = path.resolve(__dirname, '../src/store');
const SIGNOUT_FILE = path.resolve(__dirname, '../src/store/authStore.ts');

interface StoreInfo {
  filePath: string;
  storeName: string; // e.g. 'useFilterStore'
  isZustand: boolean;
  exempt: boolean;
  exemptReason: string | null;
}

/** Recursive walk for .ts files (excludes .test.ts and .d.ts). */
function walkTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip line comments (`//`) and block comments (`/* *​/`) from source so
 * that a commented-out `useFooStore.getState().reset()` does NOT register
 * as coverage. Naive regex (does not understand string literals containing
 * `//`), but adequate for the authStore.signOut() body which contains no
 * such strings.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function discoverStores(): StoreInfo[] {
  const files = walkTs(STORE_DIR);
  const infos: StoreInfo[] = [];
  for (const filePath of files) {
    const src = fs.readFileSync(filePath, 'utf-8');
    // Match `export const useXStore = create<...>(` OR `createWithEqualityFn(`
    // — the latter is zustand's documented opt-in for shallow-equality
    // selector subscriptions; missing it would silently skip the store.
    const zustandMatch = /export\s+const\s+(use\w+Store)\s*=\s*create(?:With\w+)?\b/.exec(src);
    const exemptMatch = /\/\/\s*signOut-exempt:\s*(.+)/.exec(src);
    if (zustandMatch) {
      infos.push({
        filePath,
        storeName: zustandMatch[1],
        isZustand: true,
        exempt: !!exemptMatch,
        exemptReason: exemptMatch ? exemptMatch[1].trim() : null,
      });
    } else {
      // Non-Zustand modules in this dir (e.g., tabBarStore.ts uses
      // makeMutable from Reanimated). Skip in the coverage assertion but
      // record for visibility.
      infos.push({
        filePath,
        storeName: '(not a Zustand store)',
        isZustand: false,
        exempt: false,
        exemptReason: null,
      });
    }
  }
  return infos;
}

describe('storeReset coverage — Spec 99 §B5 + §8.5', () => {
  const stores = discoverStores();
  // Comment-stripped: a commented-out `.reset()` call MUST NOT register as
  // coverage. The signOut() body contains no string literals with `//`.
  const signOutSrc = stripComments(fs.readFileSync(SIGNOUT_FILE, 'utf-8'));

  it('discovers Zustand stores via recursive walk (count guard, not hardcoded names)', () => {
    const zustandCount = stores.filter((s) => s.isZustand).length;
    // Count guard catches discovery-regex drift (e.g., a future zustand
    // factory rename) without the maintenance burden of a hardcoded
    // name list. Today the project has 6 stores; bumping this floor when
    // a new store lands is part of the §B5 wiring task.
    expect(zustandCount).toBeGreaterThanOrEqual(6);
  });

  // For EACH discovered Zustand store: assert signOut covers it OR exemption.
  // Exemption: `useAuthStore` itself doesn't call its own .reset() — it does
  // the equivalent via `set({ user: null, idToken: null, ... })` inline.
  // That counts as covered for the purpose of this test.
  describe.each(
    discoverStores().filter((s) => s.isZustand && s.storeName !== 'useAuthStore'),
  )('$storeName', (store) => {
    it('is reset by authStore.signOut() OR is signOut-exempt', () => {
      const callPattern = `${store.storeName}.getState().reset()`;
      const isCalled = signOutSrc.includes(callPattern);
      const explanation = store.exempt
        ? `EXEMPT — ${store.exemptReason}`
        : `MUST call ${callPattern} in signOut() (Spec 99 §B5). Add the call OR document an exemption with: // signOut-exempt: <reason>`;
      if (!store.exempt) {
        if (!isCalled) {
          throw new Error(explanation);
        }
        expect(isCalled).toBe(true);
      } else {
        // Exempt stores still pass — the exemption itself is the contract.
        expect(store.exempt).toBe(true);
      }
    });
  });

  it('authStore is self-resetting via inline `set({ user: null, ... })` in signOut', () => {
    // authStore doesn't call .reset() on itself; it inlines the reset.
    expect(signOutSrc).toMatch(/set\s*\(\s*\{\s*user:\s*null,\s*idToken:\s*null/);
  });
});
