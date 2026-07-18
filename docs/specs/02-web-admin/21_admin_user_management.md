# Spec 21 — Admin User Management

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 1** of `.cursor/active_task.md`.

**Status:** IMPLEMENTED (P24-24B, 2026-07-11)
**Spec version:** 2.0 (full rewrite — the Config Hub half was superseded by the built Spec 86 Control Panel; §5 deleted, see §9)
**Cross-references:** Spec 95 (User Profiles — the data model + the selected-trade axis), Spec 96 (Mobile Subscription), Spec 20 (Stripe Web Checkout — subscription-ops routes), Spec 33 (admin engineering protocol), Spec 35 (admin state architecture), Spec 86 (Control Panel — the former Config Hub), Spec 89 (Parcel Cost Tool — the recent admin-tool convention exemplar).

## 1. Goal & Context

The Buildo Admin portal (`/admin`) is an internal, desktop-first Customer-Success and operations tool. This spec defines the **User Management** section: a searchable user directory, a per-account detail view, an audited mutation set, and supplier/enterprise account provisioning.

It is the surface for the account model defined in Spec 95: an account holds a **trade SET** (`trade_slug` = primary ∪ `trade_slugs_override`) and a **persona** (`account_preset` ∈ `tradesperson | realtor | supplier | manufacturer`). The `account_preset` axis is UX/billing only — it never feeds the lead algorithm (Spec 95 §2.5.1). The admin here can view and edit any account's trade set (the **JOIN EDITOR**), persona, subscription state, and lifecycle.

## 2. Authentication & Authorization

- **Per-route guard, NOT middleware.** Every handler under `/api/admin/users/**` calls `verifyAdminAuth(request)` as its first line (Spec 33 §5/§8). Middleware is defense-in-depth only.
- **Three auth modes** (`verify-admin.ts`): `session` (real per-admin Firebase uid, checked against the `ADMIN_USER_IDS` allowlist), `admin_key` (shared CI sentinel), `dev_bypass` (local dev).
- **Mutations require an attributable admin.** POST/PATCH reject `admin_key` with 403 (a shared sentinel cannot own an audit trail). `session` and `dev_bypass` are permitted. Reads are allowed on all three modes.
- **`is_admin` column:** NOT built. The env-var `ADMIN_USER_IDS` allowlist is the pragmatic interim (enforced at `verify-admin.ts:104-105` via `parseAdminAllowlist`). When a future migration adds `user_profiles.is_admin`, `verifyAdminAuth` is a one-line swap; call sites are unaffected.

## 3. User Directory (`/admin/users`)

### 3.1 Directory (`GET /api/admin/users`)
Paginated (`USER_DIRECTORY_PAGE_SIZE = 25`, offset in `meta`).
- **Search (`q`):** substring ILIKE across `email`, `phone_number`, `full_name`, `company_name`.
- **Filters:** `preset`, `subscription_status`, `trade_slug` (matches the primary `trade_slug` OR membership in `trade_slugs_override` — historic rows have NULL preset, so filtering by trade is the reliable path until the §Migration backfill lands everywhere).
- **Row columns:** user_id, email, phone, name, company, primary trade, override, preset, subscription_status, onboarding_complete, account_deleted_at, created_at.
- All predicates are parameterized (no value interpolation).

### 3.2 Detail (`GET /api/admin/users/[uid]`)
Full profile + activity counts (`saved_count`, `view_events`). Admin sees more than the mobile client (`stripe_customer_id` for the Stripe dashboard link-out; `trade_slugs_override` for the JOIN editor) — this is an admin-only surface behind `verifyAdminAuth`.

- **Card 1 — Identity & Profile:** name, company, email, phone, primary trade + override set, `location_mode`.
- **Card 2 — Subscription & State:** `subscription_status`, `trial_started_at`, Stripe Customer ID as a **link-out** to the Stripe Dashboard (never a rebuilt billing UI), plus the **Subscription-Ops** section (§6).
- **Card 3 — Persona & Trades:** `account_preset` + the JOIN EDITOR (§4).
- **Deletion-window accounts are SHOWN, not hidden.** Admins legitimately service the 30-day recovery window. A detail view of an account with `account_deleted_at` set is annotated (`meta.deleted = true`) AND writes a `view_deleted_account` audit row (the access is attributable, never silent).

## 4. Mutations (`PATCH /api/admin/users/[uid]`)

A discriminated union on `action`. **Every mutation requires a mandatory `reason` (3–500 chars) and writes exactly one `admin_audit_log` row.**

| action | effect |
|---|---|
| `set_trades` | THE JOIN EDITOR — multi-select from the 35 trades. Writes `trade_slug = trade_slugs[0]` (primary) + `trade_slugs_override = rest`. |
| `set_preset` | Sets `account_preset` (`tradesperson | realtor | supplier | manufacturer`). |
| `extend_trial` | `subscription_status='trial'`, `trial_started_at` set so the trial expires in exactly `days` days (default 14). |
| `revoke` | Revoke subscription → `subscription_status='expired'`. |
| `suspend` | Suspend access → `subscription_status='expired'` (audit action distinguishes intent; a dedicated `'suspended'` status is a future enum addition — see §Known Failure Modes). |
| `delete` | Firebase `deleteUser` (best-effort) + **inline Stripe cancel** (`cancelAllStripeSubscriptions`, loud-non-fatal → `stripe_cancel_failed_at` marker on failure) + PII nullify + `account_deleted_at=NOW()` + `cancelled_pending_deletion`, then the RTBF audit scrub (§3.4). The PII-nullify UPDATE + the audit row are written in ONE transaction (network calls stay outside it). |
| `admin_managed`/comp | via `set_preset`/subscription mutation (§6). |

**Mutation guards:**
- Targeting an `ADMIN_USER_IDS` allowlist member → 403 (ALL actions — an admin account is never mutable through this tool).
- Self-target on a **destructive** action (`revoke`, `suspend`, `delete`) → 403.
- **Rate-limiting: NOT YET WIRED** (P24 close-out — Ground-truth/Security/Code-Reviewer). No limiter is invoked on the `/api/admin/users/**` routes today; this is a systemic gap across the whole admin surface (admins are `ADMIN_USER_IDS`-allowlisted, so the exposure is low), filed as a follow-up in `review_followups.md`. The prior "rate-bucketed per admin" claim was aspirational.

### 3.4 Audit Logging & PII

Every mutation writes to `admin_audit_log(admin_uid, action, target_uid, old_value JSONB, new_value JSONB, reason, created_at)` (migration 217).

**PII-FACT convention (non-negotiable):** for a PII field (`full_name`, `phone_number`, `email`, `backup_email`, `company_name`) the log records the FACT that the field changed — the value is replaced with `'<redacted>'` by `redactPii` before the row is written. A compliance reader learns *who changed what field, when, and why* without the log itself becoming a PII store.

**Right-to-be-forgotten:** on a hard delete, `scrub_admin_audit_for_target(target_uid)` (migration 217) NULLs `old_value`/`new_value` on every audit row for that target — the fact-of-action rows remain; the payloads go.

## 5. Supplier & Enterprise Provisioning (`POST /api/admin/users`)

Suppliers may self-serve (Spec 94 onboarding) OR be admin-provisioned here; enterprise/manufacturer accounts are admin-only.

**Execution:**
1. Firebase `createUser({ email })` → new uid. **Idempotent re-create:** an existing email adopts its uid (`auth/email-already-exists` → `getUserByEmail`) instead of failing.
2. `generatePasswordResetLink(email)` so the user sets their own password (email delivery via the email service is a follow-up; the link is returned/logged for now).
3. Insert `user_profiles`: `account_preset` (`supplier` | `manufacturer`), `trade_slug = trade_slugs[0]`, `trade_slugs_override = rest`, `radius_cap_km`, `subscription_status = 'admin_managed'`, `onboarding_complete = false`. `ON CONFLICT (user_id) DO UPDATE` (idempotent).
4. **Rollback:** if the DB insert fails after WE created the Firebase user this call, delete the Firebase user (no orphaned login that lands nowhere).
5. Audit row (`create_account`).

## 6. Subscription-Ops (P26 alignment)

The Subscription card carries an OPS section backed by the P26 subscription routes under `/api/admin/users/[uid]/subscription/*` (reconcile / retry-cancel / events — see Spec 20). This spec owns the SURFACE:
1. **Reconcile:** shows stored-vs-Stripe drift and offers an admin-confirmed "apply Stripe truth" action (reason-fielded + audit-logged like every other mutation).
2. **Failed-cancel badge + retry:** visible when `stripe_cancel_failed_at` is set (column arrives via the P26 26D migration; the UI guards on column presence if it lands first).
3. **Webhook-events history:** a compact list on the card.
4. `admin_managed` / comp status changes join the §4 mutation set.

The directory (§3.1) gains a `stripe_cancel_failed` filter. If the P26 routes are absent when the surface renders, it degrades gracefully (route-404 handled).

## 7. Out of Scope

Impersonation (magic-link login as user); invites; self-serve role management; password resets (owned by Firebase); Stripe billing UI (link out to the Stripe Dashboard); the former Config Hub (§9). (Note — corrected P24 close-out: the admin `delete` action DOES cancel Stripe inline (§4 delete row), reaching the same terminal state as the self-serve delete route; it is not deferred to a separate lane.)

## 8. Operating Boundaries

**Target files:**
- `src/app/api/admin/users/route.ts` (directory GET + creation POST)
- `src/app/api/admin/users/[uid]/route.ts` (detail GET + mutation PATCH)
- `src/lib/admin/user-management-schemas.ts`, `src/lib/admin/admin-audit.ts`
- `src/app/admin/users/**` (directory + detail pages, store, hooks)
- `migrations/217_account_preset_supplier_admin_audit_log.sql`

**Out-of-scope files:** the consumer lead endpoints (`/api/leads/**`) — the selected-trade plumbing is P24-24A, not this tool; the Stripe subscription routes (`/api/admin/users/[uid]/subscription/*`) — owned by the P26 lane.

**Cross-spec dependencies:** Spec 95 (data model), Spec 96 (subscription), Spec 20 (Stripe ops), Spec 33/35/89 (admin conventions), Spec 86 (Control Panel).

## 9. §5 Config Hub — DELETED

The v1 Configuration Hub (`/admin/config`, a GUI over `logic_variables`) is **superseded by the built Spec 86 Control Panel** (`/admin/control-panel`, `useAdminControlsStore`), which shipped the logic-variable / trade-multiplier / scope-matrix editor with its own audit trail. The Config Hub section is removed to prevent a phantom-spec plan against a surface that already exists elsewhere. Any config-editing work belongs to Spec 86.

## 10. Known Failure Modes

- **`suspend` shares the `expired` status.** There is no dedicated `'suspended'` subscription_status in the enum; `revoke` and `suspend` both write `'expired'` and are distinguished only by the audit action. A true suspended state is a future enum addition (migration + `chk_subscription_status` widen).
- **`supplier` is EXPLICIT-ONLY (v2 ruling, 2026-07-11).** `deriveAccountPreset` (account-preset.ts) maps realtor → `realtor`, everything else → `tradesperson`. It NEVER derives `supplier` — a trade slug cannot distinguish a self-serve plumber from a plumbing-supply manufacturer, and the majority self-serve persona must not be mislabeled (preset drives the admin directory + future billing). `supplier` is set only by an explicit signal: admin provisioning (§5) or the join-editor `set_preset` (§4, one audited click) — until a future onboarding persona step exists. (The v1 trade_products-partition derivation was overruled; migration 217's backfill matches v2 on the load-bearing claim — supplier is never inferred — with one backfill-only divergence: the migration maps a NULL-trade row with a non-empty `trade_slugs_override` to `manufacturer`, a branch `deriveAccountPreset` does not have. Inert today, `user_profiles` = 0 rows; the two never contend on the same row since both fire only on NULL.)
- **Password-reset email delivery is not wired.** Creation generates the reset link; actually emailing it needs the email service (deferred).
- **Full-suite husky gate + multi-lane commits.** When a concurrent lane leaves the shared test suite transiently red, a User-Management commit that is independently green (typecheck/lint/footgun/own tests) may bypass the full-suite step — documented in the commit.
