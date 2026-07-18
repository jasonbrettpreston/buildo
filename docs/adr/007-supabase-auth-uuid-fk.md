# ADR 007: `user_id`/`admin_uid` columns become `uuid` FKs to `auth.users(id)`

**Status:** Accepted — Supersedes [ADR-006](006-firebase-uid-not-fk.md)
**Date:** 2026-07-18
**Decision-makers:** core team (`.cursor/active_task.md` v2.1, Decision D6, panel-verified
2026-07-18 — 6-reviewer plan panel + Round-2 Gemini/DeepSeek/fold-verifier)

## Context

ADR-006 (2026-04-08) declared `user_id` a free-floating `VARCHAR(128)` with no FK, because
Firebase Authentication owned the canonical user record **externally** — no `users` table
existed in Postgres for a FK to reference, and mirroring Firebase into one would have
required a bidirectional sync with its own eventual-consistency and reconciliation-webhook
failure modes (ADR-006 §Rationale).

That premise is dissolved. Buildo is migrating auth off Firebase onto Supabase Auth
(`docs/specs/00-architecture/113_supabase_infrastructure.md`), whose `auth.users` table
lives in the **same Postgres instance** as every other Buildo table — not behind an
external API, not subject to webhook-delivery eventual consistency. A real FK is now not
just possible but the natural default; continuing to hand-roll what a FK constraint would
enforce for free is the thing that now needs justifying, not the FK itself. ADR-006's own
**Re-evaluation Triggers** anticipated exactly this: *"A second authentication provider is
added... at that point a `users` table abstraction may pay for itself."* Supabase Auth
is that trigger, one step further — not a second provider bolted alongside Firebase, but
Firebase's outright replacement, with the "users table" already built in as `auth.users`.

Ground truth `G9` (`.cursor/active_task.md`) found **10 tables** carrying a Firebase-UID-
shaped identity column — more than the "~8" the initial investigation report estimated —
and the types are **not uniform**, an inconsistency ADR-006 never fully closed even under
its own model:

| # | Table.column | Current type | Introducing migration |
|---|---|---|---|
| 1 | `user_profiles.user_id` (PK) | `VARCHAR(128)` | 075 |
| 2 | `lead_views.user_id` | `VARCHAR(128)` | 070 → widened 076 |
| 3 | `lead_view_events.user_id` | **`TEXT`** | 114 |
| 4 | `subscribe_nonces.user_id` | **`TEXT`** | 114 |
| 5 | `device_tokens.user_id` | `VARCHAR(128)` | 107 |
| 6 | `tracked_projects.user_id` | `VARCHAR(128)` | 089 |
| 7 | `notifications.user_id` | **`VARCHAR(100)`** — never widened to 128 | 010 |
| 8 | `notification_dispatches.user_id` | **`VARCHAR(100)`** | 218 |
| 9 | `admin_watchlist.admin_uid` | `VARCHAR(128)` | 215 |
| 10 | `admin_audit_log.admin_uid` | `VARCHAR(128)` | 217 |

All 10 tables were verified **0 rows** on the dev database as of 2026-07-18 (`G10`) — this
migration is executed against tables that hold no production data yet, not a backfill of
live rows.

## Decision

Convert `user_id`/`admin_uid` on all 10 tables above from their current
`VARCHAR(128)`/`VARCHAR(100)`/`TEXT` types to `uuid`, and add a real foreign key to
`auth.users(id)` (Supabase's built-in `uuid` primary key) on every one of them — closing
both the "no FK" gap ADR-006 accepted and the type-width inconsistency (`VARCHAR(100)` on
2 tables, bare `TEXT` on 2 tables) that was never a deliberate decision, just accreted
drift `uuid` sidesteps entirely (a `uuid` column has no meaningful "width" argument to have
in the first place).

**`ON DELETE` behavior is split by table role, not applied as a blanket `CASCADE`:**

- **`CASCADE`** — the 8 tables representing an end-user's own data, where the row has no
  meaning once its owner is gone: `lead_views`, `lead_view_events`, `device_tokens`,
  `subscribe_nonces`, `tracked_projects`, `notifications`, `notification_dispatches`, and
  `user_profiles` itself (its PK is the FK target column — deleting the `auth.users` row
  deletes the profile row).
- **`SET NULL` — `admin_watchlist.admin_uid`.** This table is a personal curation list
  (Spec 36 §2/§4), not a fact-of-record audit trail. If an admin account is deleted, the
  watchlist rows it curated have no integrity requirement to survive attached to that
  identity — `SET NULL` leaves them as orphaned-but-harmless rows rather than forcing a
  blocking check the table's low stakes don't warrant.
- **`RESTRICT` — `admin_audit_log.admin_uid`.** This table IS the fact-of-record: "which
  admin did what, when" (§21 admin user management spec, migration 217's PII-FACT
  convention). `RESTRICT` refuses to silently drop or null that attribution as a side
  effect of an unrelated account-deletion flow — it forces the deletion path to pass
  through an explicit scrub step first, the same shape the P24 right-to-be-forgotten
  pattern already established: `scrub_admin_audit_for_target(target_uid)` (migration 217)
  nulls `old_value`/`new_value` JSONB **but keeps the row** — the fact of the action
  survives, only the payload is redacted. `admin_uid` attribution gets the same treatment
  in principle (redact-in-place, never a silent structural CASCADE) rather than the FK
  quietly making the audit trail's own author field disappear.

Both `admin_watchlist` and `admin_audit_log` still reference `auth.users(id)` — they are
not exempted from the FK, only from `CASCADE` — because both key off **admin** accounts
(`verifyAdminAuth`), which under this migration's unified identity model (Decision D7:
`profiles.is_admin`, no separate admin identity system) are still rows in the same
`auth.users` table as every regular end user, just flagged.

**Execution is gated, not assumed safe.** Because this is a type change plus a new FK, not
an additive column, it runs against a **pre-condition: re-verify all 10 tables are 0 rows
on the actual target database at execution time (Phase 1.4)** — G10's 2026-07-18 count is
the planning baseline, not a standing guarantee for whenever Phase 1.4 actually executes.
**Any row count > 0 HALTS the migration** — the halt procedure is: dump the offending rows,
a human signs off on delete-or-keep, then re-run the gate. A blind `--force` past a nonzero
count is explicitly disallowed; this is a pre-launch, zero-real-user cutover specifically
*because* it can rely on an enforced-empty precondition instead of a backfill/reconciliation
strategy.

## Rationale

ADR-006's cost/benefit calculation weighed "a `users` mirror table requiring constant sync"
against "no FK." That calculation assumed the sync target was external (Firebase). With
Supabase Auth, `auth.users` is not a mirror to keep in sync — it is the same database,
same transaction boundary, same backup/restore lifecycle as every table it would FK to.
The three costs ADR-006 listed against adding a FK (bidirectional webhook sync,
eventual-consistency orphan window, reconciliation-job maintenance) do not exist in this
architecture: there is no webhook, no consistency window, and no reconciliation job to
maintain — a Postgres `FOREIGN KEY ... ON DELETE CASCADE` *is* the reconciliation,
enforced synchronously by the database instead of batched by a script that has to remember
to run.

The per-FK split (rather than reverting to the "just CASCADE everything" pattern ADR-003
already established elsewhere) follows this migration program's explicit panel finding
(`.cursor/active_task.md` D6 adjudication log: *"panel: no blanket CASCADE"*) — an
audit-trail table silently losing its own attribution column to an unrelated user's account
deletion is a materially different risk than a `lead_views` row losing meaning once its
viewer is gone, and the FK's `ON DELETE` clause is the right place to encode that
difference rather than relying on application code to remember it every time it runs a
delete.

## Consequences

**Accepted:**
- `scripts/purge-lead-views.js` is **deleted outright**, same commit as the D6 migration.
  Its `--reconcile` half (Firebase Admin SDK orphan cleanup by UID, ADR-006's own mitigation
  for the "no FK" gap) is now structurally impossible to need — `CASCADE` performs the same
  cleanup synchronously and for free. Its plain nightly retention-sweep half (`lead_views`
  rows older than the retention window, unrelated to Firebase) is **not lost** — it is
  absorbed into a pg_cron job (`lead_views_retention_purge`,
  `docs/specs/00-architecture/115_scheduling.md` §5), which is a more appropriate home for
  a pure-SQL, missable-without-incident maintenance task than a script nothing was
  currently even scheduling reliably.
- The `firebase_uid_max = 128` contract (`docs/specs/_contracts.json`,
  `mobile/src/constants/contracts.ts`, locked by `src/tests/contracts.infra.test.ts` L188-
  200 against `migrations/075_user_profiles.sql` and `migrations/076_lead_views_user_id_
  widen.sql`) is **retired same-commit** — a `uuid` column has no analogous "max width"
  concept, so the contract entry and its two migration-pattern locks are deleted, not
  updated to a new number.
- `src/tests/admin-lead-schemas.contract.test.ts` L34 and any other `firebase_uid_max`
  reader are updated in the same commit (D6's explicit "retire... same-commit" instruction).
- Test factories carrying Firebase-UID-shaped fixture strings (`factories.ts` L129/195:
  `'firebase-uid-abc123'`) are updated to `uuid`-shaped fixtures (e.g. via a fixed test
  UUID or `crypto.randomUUID()`), same commit — a stale string fixture would now fail the
  new FK/type constraint outright rather than silently passing as it did under the old
  unconstrained `VARCHAR`.
- `admin_audit_log`'s `RESTRICT` means an admin-account hard-delete flow must explicitly
  handle (scrub, per the P24 pattern) that admin's `admin_audit_log` rows before the delete
  can succeed — this is new operational surface area that did not exist when `admin_uid`
  was an unconstrained string, and the deletion flow (Spec 21) must account for it.
- All 10 conversions are irreversible in the "reasoned about ahead of time" sense once real
  data exists in these tables — the 0-row HALT gate is what makes doing this now, rather
  than later with real users attached, materially cheaper.

**Avoided:**
- The exact three sync-drift failure modes ADR-006 itself named as reasons to avoid a
  `users` table under the old (external-Firebase) architecture — moot here, not solved by
  extra code.
- The `VARCHAR(100)`/`VARCHAR(128)`/`TEXT` three-way width inconsistency across the 10
  tables persisting indefinitely as an unexamined accretion (it was never a decision;
  `uuid` removes the axis the inconsistency lived on).
- A silent structural loss of `admin_audit_log` attribution as a side effect of an
  unrelated account-deletion code path (the risk a blanket-`CASCADE` shortcut would have
  reintroduced).

## Status of ADR-006

ADR-006 is **superseded by this ADR**, not deleted — its Context/Rationale remain an
accurate historical record of why the no-FK decision was correct under the Firebase-
external architecture at the time it was made. ADR-006 itself is **not edited as part of
this change**: this document is authored under Phase S4 of the Supabase migration program
(`.cursor/active_task.md`, spec-authoring phase), which is explicitly out of scope for
touching files outside its own two deliverables. Adding ADR-006's `Status: Superseded by
ADR-007` header, and updating `docs/adr/README.md`'s index row, is flagged for **Phase S5
(the doc sweep)** — do not let this ADR's existence alone be mistaken for that header
having been applied; verify it was actually done before treating ADR-006 as closed.

## Re-evaluation Triggers

- A table is later found carrying a Firebase-UID-shaped or otherwise pre-Supabase identity
  column not in this ADR's 10-table inventory (i.e., G9 was incomplete) — extend this ADR's
  table rather than opening a new one for "the same decision, one more table."
- Supabase Auth is itself replaced or federated with an external identity provider in the
  future — at that point this ADR's premise (auth lives in the same Postgres instance)
  would need re-examination the same way this ADR re-examined ADR-006's.
- The `admin_audit_log` `RESTRICT` proves operationally painful in practice (e.g., admin
  offboarding becomes a recurring manual scrub-then-delete chore at a volume that argues
  for automating the scrub step) — the automation is a reasonable evolution; the underlying
  RESTRICT-not-CASCADE choice is not what would be wrong in that scenario.
- `admin_watchlist`'s `SET NULL` choice turns out to matter more than assumed here (e.g., a
  future feature makes "who curated this watchlist entry" load-bearing rather than
  incidental) — would argue for promoting it to `RESTRICT` to match `admin_audit_log`.
</content>
