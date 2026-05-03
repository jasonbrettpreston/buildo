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

let cleaned = false;

export function cleanupLegacyUserProfileCache(): void {
  if (cleaned) return;
  cleaned = true;
  try {
    // The legacy blob was created with id 'user-profile-cache'.
    const legacyStorage = createMMKV({ id: 'user-profile-cache' });
    legacyStorage.clearAll();
  } catch {
    // MMKV not initialized in tests OR file already gone — non-fatal.
  }
}
