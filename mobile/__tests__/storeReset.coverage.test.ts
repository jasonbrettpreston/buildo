/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §B5 + §8.5 + §9.12
//
// Store-enumeration coverage test (Spec 99 §8.5 mandate, implementation per
// §9.12). Asserts that for every Zustand store created in `mobile/src/store/`,
// the sign-out fan-out in `authStore.signOut()` calls
// `use<Name>Store.getState().reset()` — OR the store file declares an
// explicit exemption via `// signOut-exempt: <reason>` near its export.
//
// Catches the silent-leak bug where adding a new user-scoped store and
// forgetting to add a `.reset()` call to signOut leaves stale data for the
// next user signing in on a shared device (a class of PIPEDA leak).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const STORE_DIR = path.resolve(__dirname, '../src/store');
const SIGNOUT_FILE = path.resolve(__dirname, '../src/store/authStore.ts');

interface StoreInfo {
  fileName: string;
  storeName: string; // e.g. 'useFilterStore'
  isZustand: boolean;
  exempt: boolean;
  exemptReason: string | null;
}

function discoverStores(): StoreInfo[] {
  const files = fs.readdirSync(STORE_DIR).filter((f) => f.endsWith('.ts'));
  const infos: StoreInfo[] = [];
  for (const fileName of files) {
    const src = fs.readFileSync(path.join(STORE_DIR, fileName), 'utf-8');
    // Match `export const useXStore = create<...>(`
    const zustandMatch = /export\s+const\s+(use\w+Store)\s*=\s*create\b/.exec(src);
    const exemptMatch = /\/\/\s*signOut-exempt:\s*(.+)/.exec(src);
    if (zustandMatch) {
      infos.push({
        fileName,
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
        fileName,
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
  const signOutSrc = fs.readFileSync(SIGNOUT_FILE, 'utf-8');

  it('discovers at least the 6 known Zustand stores in mobile/src/store/', () => {
    const zustand = stores.filter((s) => s.isZustand).map((s) => s.storeName).sort();
    // Sanity check that the discovery isn't silently broken (e.g., regex drift).
    expect(zustand).toEqual(
      [
        'useAuthStore',
        'useFilterStore',
        'useNotificationStore',
        'useOnboardingStore',
        'usePaywallStore',
        'useUserProfileStore',
      ].sort(),
    );
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
      expect({ store: store.storeName, isCalled, exempt: store.exempt }).toEqual({
        store: store.storeName,
        isCalled: store.exempt ? isCalled : true,
        exempt: store.exempt,
      });
      // The above structural assertion is a bit awkward; the simpler check:
      if (!store.exempt) {
        expect(isCalled).toBe(true);
        if (!isCalled) console.error(explanation);
      }
    });
  });

  it('authStore is self-resetting via inline `set({ user: null, ... })` in signOut', () => {
    // authStore doesn't call .reset() on itself; it inlines the reset.
    expect(signOutSrc).toMatch(/set\s*\(\s*\{\s*user:\s*null,\s*idToken:\s*null/);
  });
});
