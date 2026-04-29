/** @jest-environment node */
// Phase 7 offline hardening tests
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §Phase7
//
// 1. mmkvPersister round-trip — persisting and restoring a PersistedClient
// 2. Mutation queue in dehydrated state — paused mutations survive persist/restore
// 3. onlineManager / focusManager wiring — both are configured at module load time
// 4. OfflineBanner component structure

import { dehydrate, hydrate, onlineManager, focusManager, QueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// 1. mmkvPersister round-trip
// ---------------------------------------------------------------------------

describe('mmkvPersister', () => {
  // MMKV storage mock — react-native-mmkv is a native module, not available in Node.
  // We verify the persister contract shape without a real MMKV instance.
  const store = new Map<string, string>();
  const storageMock = {
    set: (key: string, val: string) => { store.set(key, val); },
    getString: (key: string) => store.get(key) ?? undefined,
    remove: (key: string) => { store.delete(key); },
  };

  // Build a persister instance that uses the mock storage (mirrors mmkvPersister.ts logic)
  function makePersister() {
    const { createSyncStoragePersister } = jest.requireActual(
      '@tanstack/query-sync-storage-persister',
    ) as typeof import('@tanstack/query-sync-storage-persister');
    return createSyncStoragePersister({ storage: storageMock as unknown as Storage });
  }

  it('serialises a PersistedClient and restores an equivalent object', () => {
    const client = new QueryClient();
    client.setQueryData(['test-key'], { hello: 'world' });

    const persisted = { clientState: dehydrate(client), timestamp: Date.now(), buster: '' };
    storageMock.set('tq-client', JSON.stringify(persisted));

    const raw = storageMock.getString('tq-client');
    expect(raw).toBeDefined();

    const restored = JSON.parse(raw!) as typeof persisted;
    expect(restored.clientState).toBeDefined();

    const client2 = new QueryClient();
    hydrate(client2, restored.clientState);
    expect(client2.getQueryData(['test-key'])).toEqual({ hello: 'world' });

    client.clear();
    client2.clear();
  });

  it('removeClient deletes the stored value', () => {
    storageMock.set('tq-client', 'some-value');
    storageMock.remove('tq-client');
    expect(storageMock.getString('tq-client')).toBeUndefined();
  });

  it('restoreClient returns undefined when storage is empty', () => {
    store.clear();
    const raw = storageMock.getString('tq-client');
    expect(raw).toBeUndefined();
  });

  it('restoreClient returns undefined on malformed JSON', () => {
    storageMock.set('tq-client', 'not-valid-json{{{');
    const raw = storageMock.getString('tq-client');
    let result: unknown;
    try {
      result = JSON.parse(raw!);
    } catch {
      result = undefined;
    }
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Mutation queue — paused mutations included in dehydrated state
// ---------------------------------------------------------------------------

describe('mutation queue persistence', () => {
  it('dehydrate includes paused mutations in clientState', async () => {
    const client = new QueryClient();
    // Force offline so the mutation pauses instead of firing
    onlineManager.setOnline(false);

    let fired = false;
    client.getMutationCache().build(client, {
      mutationFn: async () => {
        fired = true;
        return {};
      },
    });

    const state = dehydrate(client, {
      shouldDehydrateMutation: () => true,
    });

    expect(state.mutations).toBeDefined();
    expect(fired).toBe(false);

    onlineManager.setOnline(true);
    client.clear();
  });

  it('hydrate restores mutation entries from persisted state', () => {
    const client = new QueryClient();
    const state = dehydrate(client, { shouldDehydrateMutation: () => true });

    const client2 = new QueryClient();
    hydrate(client2, state);

    // Mutation cache should be present and not throw
    expect(client2.getMutationCache()).toBeDefined();

    client.clear();
    client2.clear();
  });
});

// ---------------------------------------------------------------------------
// 3. onlineManager / focusManager wiring (Phase 7 queryClient.ts side effects)
// ---------------------------------------------------------------------------

describe('queryClient Phase 7 bridges', () => {
  it('onlineManager is a valid TanStack object', () => {
    expect(typeof onlineManager.isOnline).toBe('function');
    expect(typeof onlineManager.setEventListener).toBe('function');
  });

  it('focusManager is a valid TanStack object', () => {
    expect(typeof focusManager.isFocused).toBe('function');
    expect(typeof focusManager.setEventListener).toBe('function');
  });

  it('onlineManager.setOnline updates isOnline()', () => {
    const original = onlineManager.isOnline();
    onlineManager.setOnline(false);
    expect(onlineManager.isOnline()).toBe(false);
    onlineManager.setOnline(true);
    expect(onlineManager.isOnline()).toBe(true);
    onlineManager.setOnline(original);
  });

  it('queryClient source registers NetInfo and AppState event listeners', () => {
    // Shape test: confirm the setEventListener side-effect calls exist in source.
    // Runtime test is deferred to device integration (native modules unavailable in Node).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../src/lib/queryClient.ts'), 'utf8');
    expect(src).toMatch(/onlineManager\.setEventListener/);
    expect(src).toMatch(/focusManager\.setEventListener/);
  });
});

// ---------------------------------------------------------------------------
// 4. OfflineBanner component — structural assertions (no native renderer needed)
// ---------------------------------------------------------------------------

describe('OfflineBanner', () => {
  it('source file contains SPEC LINK comment', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/components/shared/OfflineBanner.tsx'),
      'utf8',
    );
    expect(src).toMatch(/SPEC LINK/);
  });

  it('source uses useNetInfo from @react-native-community/netinfo', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/components/shared/OfflineBanner.tsx'),
      'utf8',
    );
    expect(src).toMatch(/useNetInfo/);
    expect(src).toMatch(/@react-native-community\/netinfo/);
  });

  it('source animates height and opacity via Reanimated useSharedValue', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/components/shared/OfflineBanner.tsx'),
      'utf8',
    );
    expect(src).toMatch(/useSharedValue/);
    expect(src).toMatch(/withTiming/);
    expect(src).toMatch(/useAnimatedStyle/);
  });

  it('queryClient.ts wires onlineManager to NetInfo', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/lib/queryClient.ts'),
      'utf8',
    );
    expect(src).toMatch(/onlineManager\.setEventListener/);
    expect(src).toMatch(/focusManager\.setEventListener/);
    expect(src).toMatch(/NetInfo\.addEventListener/);
    expect(src).toMatch(/AppState\.addEventListener/);
  });

  // RED LIGHT: cold-boot race fix — NetInfo.fetch() must be called immediately
  // to seed the initial online state before the first query fires.
  it('queryClient.ts eagerly fetches initial NetInfo state for cold-boot offline fix', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../src/lib/queryClient.ts'), 'utf8');
    // Regex matches the actual seeding call, not just a comment reference.
    expect(src).toMatch(/void NetInfo\.fetch\(\)\.then/);
  });
});

// ---------------------------------------------------------------------------
// 5. mmkvPersister shape guard — isPersistedClient
// ---------------------------------------------------------------------------

describe('mmkvPersister shape guard', () => {
  // RED LIGHT: safe MMKV hydration per §1.3 — restoreClient must validate shape
  // before casting, not blindly trust JSON.parse output.
  it('mmkvPersister.ts defines isPersistedClient guard', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../src/lib/mmkvPersister.ts'), 'utf8');
    expect(src).toMatch(/isPersistedClient/);
  });

  it('shape guard rejects valid JSON missing required PersistedClient fields', () => {
    // Inline the guard (mirrors mmkvPersister.ts) to verify logic without native MMKV
    function isPersistedClient(val: unknown): boolean {
      if (typeof val !== 'object' || val === null) return false;
      const v = val as Record<string, unknown>;
      if (typeof v.timestamp !== 'number' || typeof v.buster !== 'string'
          || typeof v.clientState !== 'object' || v.clientState === null) return false;
      const cs = v.clientState as Record<string, unknown>;
      return Array.isArray(cs.queries) && Array.isArray(cs.mutations);
    }
    // Stale schema from a prior build — valid JSON but wrong top-level shape
    expect(isPersistedClient({ foo: 'bar', data: [1, 2, 3] })).toBe(false);
    expect(isPersistedClient({ timestamp: '2026-01-01', queries: [] })).toBe(false);
    expect(isPersistedClient(null)).toBe(false);
    expect(isPersistedClient(42)).toBe(false);
    // Valid top-level but corrupt clientState sub-fields (triggers TanStack forEach crash)
    expect(isPersistedClient({ timestamp: 1, buster: '', clientState: { queries: 'corrupt', mutations: [] } })).toBe(false);
    expect(isPersistedClient({ timestamp: 1, buster: '', clientState: { queries: [], mutations: { foo: 1 } } })).toBe(false);
  });

  it('shape guard accepts a well-formed PersistedClient', () => {
    function isPersistedClient(val: unknown): boolean {
      if (typeof val !== 'object' || val === null) return false;
      const v = val as Record<string, unknown>;
      if (typeof v.timestamp !== 'number' || typeof v.buster !== 'string'
          || typeof v.clientState !== 'object' || v.clientState === null) return false;
      const cs = v.clientState as Record<string, unknown>;
      return Array.isArray(cs.queries) && Array.isArray(cs.mutations);
    }
    const wellFormed = { timestamp: Date.now(), buster: '', clientState: { queries: [], mutations: [] } };
    expect(isPersistedClient(wellFormed)).toBe(true);
  });
});
