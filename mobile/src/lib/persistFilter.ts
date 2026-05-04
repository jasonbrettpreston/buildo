// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §2.1 (PII layer boundary)
//
// `dehydrateOptions.shouldDehydrateQuery` predicate for the
// `PersistQueryClientProvider` in `mobile/app/_layout.tsx`.
//
// WF3 follow-up amendment (code-reviewer HIGH 1): extracted from
// `_layout.tsx` to its own module so `mobile/__tests__/offline.test.ts`
// can import the ACTUAL production predicate (not a local mirror that
// could silently drift). Importing `_layout.tsx` from a node-environment
// test is also impractical — it pulls in React, expo-router, and a tree
// of native-only modules.
//
// Why exclude `['user-profile']` specifically:
//   - The user-profile query payload carries 5 PII identity fields
//     (full_name / phone_number / company_name / email / backup_email).
//   - MMKV is Layer 4a (UNENCRYPTED on disk per `mmkvPersister.ts:11` —
//     no `encryptionKey` passed to createMMKV).
//   - Spec 99 §2.1 mandates Layer 4b (SecureStore/Keychain) for PII.
// Other queries (`['lead-feed']`, `['flight-board']`,
// `['notification-prefs']`) carry only public permit data or non-PII
// toggles and continue to persist normally.

export interface QueryShape {
  queryKey: readonly unknown[];
}

export const shouldDehydrateQueryFn = (query: QueryShape): boolean =>
  query.queryKey[0] !== 'user-profile';
