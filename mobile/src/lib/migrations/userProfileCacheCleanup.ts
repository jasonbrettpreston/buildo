// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §9.1
//
// One-time MMKV cleanup for the legacy `user-profile-cache` blob that was
// removed in Spec 99 §9.1 (the parallel hand-rolled cache that pre-dated the
// TanStack Query persister wiring). Existing installs may have stale profile
// data in this orphaned MMKV file — without cleanup, signOut() leaves the
// previous user's profile readable on disk (PIPEDA risk on shared devices).
//
// Idempotency: a module-scoped flag makes the call cheap on subsequent
// invocations within the same process. Across cold boots, the actual MMKV
// `clearAll()` is also cheap on an already-empty blob (no-op write).
//
// Called from authStore module load so it runs exactly once per process,
// before any auth flow can race with the cleanup.

import { createMMKV } from 'react-native-mmkv';
import * as Sentry from '@sentry/react-native';

let cleaned = false;

export function cleanupLegacyUserProfileCache(): void {
  if (cleaned) return;
  cleaned = true;
  try {
    // The legacy blob was created with id 'user-profile-cache'.
    const legacyStorage = createMMKV({ id: 'user-profile-cache' });
    // Gemini WF3-§9.1 review F2: createMMKV lazily allocates the underlying
    // mmap file on first ACCESS. Calling clearAll() unconditionally would
    // materialize an empty file on fresh installs that never had the legacy
    // blob — leaving an orphan that violates Spec 99 §2.1 (no direct MMKV
    // access outside persist middleware) for the lifetime of the install.
    // `contains()` reads the existing keyspace without forcing a write —
    // safe on a fresh install AND a no-op on subsequent boots after cleanup.
    if (legacyStorage.contains('profile')) {
      legacyStorage.clearAll();
      Sentry.addBreadcrumb({
        category: 'storage',
        message: 'legacy_user_profile_cache_cleanup',
        level: 'info',
        data: { result: 'cleared' },
      });
    }
    // No breadcrumb on the no-op path — would emit on every cold boot for
    // every install indefinitely, drowning the actually-cleared signal.
  } catch (err) {
    // MMKV not initialized in tests OR storage layer error — non-fatal.
    Sentry.addBreadcrumb({
      category: 'storage',
      message: 'legacy_user_profile_cache_cleanup',
      level: 'warning',
      data: { result: 'error', error: err instanceof Error ? err.message : String(err) },
    });
  }
}
