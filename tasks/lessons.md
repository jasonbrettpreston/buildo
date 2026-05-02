# Project Lessons — Buildo
*Read this at session start. One-line gotchas that have already cost us time.*

---

## TypeScript
- `process.env.NODE_ENV = 'test'` fails — use `(process.env as Record<string, string>).NODE_ENV`
- Literal type narrowing: `const step = 1; step === 0` fails — use `const step: number = 1`
- `typeof globalThis.google` breaks in Next.js client — use `(window as any).google`
- tsconfig targets ES2017 — regex `s` flag (dotAll) requires ES2018+, use `[\s\S]` instead
- Next.js API routes cannot export non-handler functions — extract helpers to `src/lib/`
- `functions/` must be excluded from root tsconfig.json (it has separate deps)

## Database
- Composite PK is `(permit_num, revision_num)` — both required in ALL queries
- `CREATE INDEX` on tables >100K rows MUST use `CONCURRENTLY` or it locks production
- Notifications table columns are `is_read`/`is_sent` (not `read`/`sent`) — mapped in TS interfaces
- CoA column is `application_number`, aliased to `application_num` in SQL queries
- CoA column is `linked_confidence`, aliased to `link_confidence` in queries
- **Migration runner does NOT respect `-- UP` / `-- DOWN` markers** — they're SQL comments, not section directives. `scripts/migrate.js` runs the entire `.sql` file as one transaction. Any uncommented DROP/REVERT statement under `-- DOWN` will execute immediately after the UP section, silently undoing the migration. The migration is recorded as "applied" but the schema is unchanged. ALWAYS comment out every line of the DOWN section (match migration 114's convention). Discovered 2026-05-01 in migrations 113/115/116; backup → fix files → delete bogus `schema_migrations` rows → re-run was the recovery path.
- **`schema_migrations` row presence does NOT prove the schema changed** — it proves the file ran without erroring. Always verify with `\d table_name` after applying migrations that touch important tables.
- **`trigger_set_timestamp()` function from migration 100 may be missing** even when `schema_migrations` says 100 was applied (likely from a `pg_dump`/`pg_restore` cycle that didn't preserve the function). If a later migration fails with `function trigger_set_timestamp() does not exist`, recreate via `CREATE OR REPLACE FUNCTION trigger_set_timestamp() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;`

## Pipeline
- `new Date()` is banned for timestamps written to DB — use `pipeline.getDbTimestamp(pool)`
- `pool.query` for advisory lock acquire/release is wrong — locks are session-bound, use a pinned client
- MAX_ROWS_PER_INSERT for permit_trades = 4000 (10 columns × 4000 = 40K params, under 65535 limit)

## API / Auth
- The feed API validates `params.trade_slug === ctx.trade_slug` — both client and DB must match
- PostGIS `::geography` casts cause opaque 500s in local dev without the extension — use `isPostgisAvailable()` guard
- `X-Admin-Key` header is the CI/script fallback for admin APIs (no session cookie in scripts)

## Mobile / Expo
- `tradeSlug` in filterStore defaults to `''` (empty string = falsy) — feed query won't fire until set
- `radius_km` is now server-side (added to `user_profiles` in migration 114) — MMKV is cache only; `user_profiles` is authoritative. `useUserProfile` hydrates filterStore from server on launch.
- Maestro `assertVisible` on Android reads rendered text, not raw source — `uppercase` CSS → assert "LEAD FEED" not "Lead Feed"
- `useRootNavigationState().key` is undefined until the navigation container mounts — guard `router.replace()` behind it
- Deprecated/archived Expo packages can ship native code that breaks silently on Gradle toolchain bumps. `expo-firebase-recaptcha` (transitively `expo-firebase-core@6.0.0`) used the legacy `classifier` Jar property which Gradle 8 removed — `expo run:android` failed with "Could not set unknown property 'classifier'". Audit `package.json` against Expo's deprecation list before any Expo SDK / Gradle bump.
- Apple Sign-In with `@react-native-firebase/auth` requires nonce round-trip: SHA-256 hash to `AppleAuthentication.signInAsync({ nonce: hashedNonce })`, raw value to `auth.AppleAuthProvider.credential(idToken, rawNonce)`. Reversing them produces `auth/invalid-credential`.
- Phone-auth on RNFirebase uses confirmation-style API: `auth().signInWithPhoneNumber(num)` returns a `ConfirmationResult` whose `.confirm(code)` resolves the credential. No JS-side reCAPTCHA — Play Integrity (Android) / APN silent-push (iOS) handle bot prevention natively.
- `transformIgnorePatterns` in `mobile/package.json` jest config must explicitly include `@react-native-firebase` (the existing `@react-native(-community)?` regex matches the prefix but the lookahead won't extend to `-firebase`).
- **Android emulator default GPS is Mountain View, CA** (37.4, -122.08) — Buildo's permits are Toronto-only, so a user choosing "Live Feed" (`location_mode='gps_live'`) on a stock emulator gets ZERO matches and an empty feed. Set the emulator location to Toronto before testing the feed: Android Studio Extended Controls (`...` button) → Location → enter `43.6532` (lat), `-79.3832` (lng) → "Send"; OR `adb emu geo fix -79.3832 43.6532` (note: ADB takes longitude THEN latitude, opposite of every other API).
- **Before adding a new Zustand store, MMKV blob, hydration bridge, or routing useEffect on mobile — check `docs/specs/03-mobile/99_mobile_state_architecture.md` §3-§5.** The field may already be owned elsewhere; the bridge may not be allowed; the routing decision may belong to AuthGate or AppLayout (Spec 99 §5.1). Spec 99 was authored 2026-05-02 after three render-loop incidents in one session traced to undeclared dual-source-of-truth state. Adding state without a Spec 99 row is a §10 compliance failure.
- **Two layout-level `router.replace` effects reading DIFFERENT sources of truth for the same routing decision will ping-pong** — `mobile/app/_layout.tsx` AuthGate read SERVER `profile.onboarding_complete`; `mobile/app/(onboarding)/_layout.tsx` read LOCAL `useOnboardingStore.isComplete`. When server cache held a stale `dev-user` profile (`onboarding_complete=false`) but local store was `isComplete=true` (from a prior `markComplete()` bridge), AuthGate routed `(app)→(onboarding)` while OnboardingLayout routed `(onboarding)→(app)`, alternating ~36 times before Maximum update depth exceeded. Rule: ONE routing authority per gate boundary, reading ONE source of truth (prefer the server profile — Spec 95 §6 makes server-side fields canonical). Discovered 2026-05-02 via `mobile/src/lib/debug/loopDetector.ts` instrumentation; fix in same-session WF3 stripped OnboardingLayout's effect + added UID-change cache invalidation in `initFirebaseAuthListener` to keep `react-query` MMKV cache from leaking across users.
- **Subscribing to Zustand store inside `RootLayout`/`AuthGate` causes render loops if combined with `router.replace` in the effect** — `useStore((s) => s.field)` re-renders the component on every store mutation, so if the effect deps include the subscribed value AND the effect calls `router.replace`, the chain `setStore → re-render → effect fires → router.replace → segments change → re-render → ...` can ping-pong with `(onboarding)/_layout.tsx`'s competing redirect. Use lazy `useStore.getState().field` inside the effect closure when you only need the value at the moment the effect actually runs (not on every change). Discovered 2026-05-02 post-WF2 `3727ceb`; fixed in same-session WF3.

## ESLint / Tooling
- `scripts/CLAUDE.md` must NOT use `@` auto-imports — they load into every session including Admin/WF7
- `scripts/*.js` are CommonJS — not linted for `no-require-imports`
- ESLint flat config (`eslint.config.mjs`) must ignore: `.next/`, `next-env.d.ts`, `scripts/`, `functions/`
