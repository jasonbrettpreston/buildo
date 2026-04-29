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

## ESLint / Tooling
- `scripts/CLAUDE.md` must NOT use `@` auto-imports — they load into every session including Admin/WF7
- `scripts/*.js` are CommonJS — not linted for `no-require-imports`
- ESLint flat config (`eslint.config.mjs`) must ignore: `.next/`, `next-env.d.ts`, `scripts/`, `functions/`
