# Spec 114 — RLS Policy Catalog

**Status:** ACTIVE
**SPEC LINK:** `docs/specs/00-architecture/114_rls_policy_catalog.md`

<requirements>
## 1. Goal & Scope

This spec is the single normative catalog of every Row Level Security (RLS) policy Buildo's
Supabase Postgres host carries, per the authorized 2026-07-18 program plan
(`.cursor/active_task.md`, v2.1, Phase S4). It classifies every table into one of three RLS
postures, states the policy template for each posture, and defines the pgTAP test contract that
locks every policy written here.

**Scope statement — RLS is defense-in-depth, not the live authorization path.** Per **Decision
D1 (2026-07-18 program plan)**, Buildo runs **Philosophy A**: the Next.js API layer is the single
gateway for all application data access; `supabase-js` is used for auth (and, later, Storage)
only; the pipeline and the admin app keep raw `pg` connections (`docs/specs/00-architecture/113_supabase_infrastructure.md`
§3, §5). Authorization for every read/write Buildo's users and admins perform today **lives in
Next.js API route handlers** (`verifyAdminAuth`, `getUserIdFromSession`, per-route checks) — not
in Postgres RLS. Per **Decision D10**, the Data API (PostgREST) is disabled on both the local
stack and the cloud project, and stays disabled through Phase 5. Given that, the policies in this
catalog **do not currently gate any live request path** — they exist so that:

1. A future Data API re-enable (D10's documented "explicit-grant + dedicated `api` schema"
   posture) does not expose a single row it shouldn't, on day one of that re-enable, because the
   policies were already correct.
2. A leaked `anon` or `authenticated` key does not expose rows beyond what its role is
   RLS-permitted to see — today that is nothing, because no table outside `auth`/`storage`
   grants either role anything.
3. Supabase Storage (once any bucket-backed feature exists) inherits the same posture from day
   one instead of being bolted on reactively.

This is the same "compliant now, positioned for the platform's own enforcement timeline" framing
Spec 113 §10 uses for the Data API itself (Supabase auto-exposure is off-by-default for new
projects since 2026-05-30, enforced platform-wide 2026-10-30) — this spec is that same posture
applied one layer down, at the row level.

**Non-goals:** this spec does not define application-level authorization logic (Spec 13 owns
`getClaims()`/`getUser()` criteria and route-level checks), does not define the `profiles`+
`is_admin` migration's full column list (Phase 1.3 implementation owns that; this spec defines
only the RLS-relevant shape), and does not implement anything — it is the catalog implementers
read before writing `CREATE POLICY` statements.
</requirements>

---

<architecture>
## 2. Table Classification

Every table in the schema falls into exactly one of three classes. The classification rule is
**definitional, not enumerated**: a table is Class A only if it is one of the 10 named tables
below; Class C only if it is `profiles`; **everything else is Class B by default** — including
tables added after this spec is written. This is deliberate: `docs/specs/00-architecture/01_database_schema.md`'s
table inventory is known-stale (Spec 113 G1 — missing `lead_view_events`, `subscribe_nonces` at
minimum), and an enumerated Class B catalog would inherit that staleness as a live RLS gap. A
definitional default-deny rule cannot go stale the same way (§6).

| Class | Definition | Count | RLS posture |
|---|---|---|---|
| **A — UID tables** | The 10 tables carrying a Firebase-uid-derived identity column, per **Decision D6** / Ground truth G9 | 10 | Owner-scoped (`auth.uid()`), two subtypes — see §3 |
| **B — Pipeline/enrichment** | Every table not in Class A or C | all others | Default-deny for `anon`/`authenticated` — see §4 |
| **C — `profiles`** | The new table Phase 1.3 creates to carry `is_admin` | 1 | Self-read/self-update minus `is_admin` — see §5 |

**Flagged, not classified — `spatial_ref_sys`:** this is a PostGIS extension-owned system table
(SRID reference data), not a Buildo application table. It is out of scope for this catalog: it is
enabled by the `postgis` extension install (migration `039`), not by any Buildo migration, its
contents are non-sensitive (public coordinate-system definitions), and the Data API being
disabled (D10) means it has no exposure surface regardless. **No policy is proposed for it** —
flagged per this spec's review instruction rather than assigned a default-deny policy that would
be one more thing to maintain for zero benefit. If a future Data API re-enable ever exposes
`public` broadly, `spatial_ref_sys`'s read-only, non-sensitive content makes it a reasonable
explicit-grant candidate at that time (D10's `api`-schema model), not a gap to close now.

`schema_migrations` (migrate.js's own bookkeeping table) is Class B like any other pipeline
table — no special-casing needed, the default-deny rule already covers it correctly.
</architecture>

---

<architecture>
## 3. Class A — The 10 UID Tables

Per **Decision D6** and Ground truth G9 (`.cursor/active_task.md`), exactly 10 tables carry a
Firebase-uid identity column today, converting to `uuid` FK'd to `auth.users(id)`. D6 splits
their `ON DELETE` behavior by whether the row is user-owned content or an admin-identity audit
trail — this catalog follows the same split for RLS policy shape, because the two subtypes need
materially different policies, not just different FK actions.

### 3.1 Subtype 1 — user-owned rows (CASCADE, owner-only template)

| Table | Identity column | FK target | `ON DELETE` | RLS template |
|---|---|---|---|---|
| `user_profiles` | `user_id` (PK) | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `lead_views` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `lead_view_events` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `device_tokens` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `subscribe_nonces` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `tracked_projects` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `notifications` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |
| `notification_dispatches` | `user_id` | `auth.users(id)` | CASCADE | `auth.uid() = user_id` |

**Template** (one `CREATE POLICY` per operation, per table — no blanket `FOR ALL` policy, so a
future operation-specific tightening does not require rewriting an existing grant):

```sql
CREATE POLICY <table>_select_own ON <table>
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY <table>_insert_own ON <table>
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY <table>_update_own ON <table>
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY <table>_delete_own ON <table>
  FOR DELETE USING (auth.uid() = user_id);
```

Not every table needs all four (e.g. `notification_dispatches` is a server-written ledger — no
`authenticated` client should ever `INSERT`/`UPDATE`/`DELETE` it; only `SELECT` is appropriate).
The per-table operation set is an implementation-time decision that follows the table's actual
write pattern (checked against the route handlers that touch it today) — this spec fixes the
`auth.uid() = user_id` predicate as the owner scope, not which operations get a policy.

`notification_dispatches` note: this table is currently **FK-EXEMPT** (migration `218` — no FK to
`user_profiles`, `user_id VARCHAR(100)`, rationale recorded there: "the same FK-free curation
pattern as `admin_watchlist`"). D6 adds the FK as part of the uuid conversion (G9 lists it among
the 8 CASCADE tables) — its current FK-exempt status does not block or change the RLS policy
shape above; RLS predicates do not require a FK to exist, only a column to compare against
`auth.uid()`.

### 3.2 Subtype 2 — admin-identity audit tables (SET NULL/RESTRICT, `profiles.is_admin`-gated)

| Table | Identity column | FK target | `ON DELETE` (D6, decided per-table at 1.4) | RLS template |
|---|---|---|---|---|
| `admin_watchlist` | `admin_uid` | `auth.users(id)` | SET NULL or RESTRICT | is_admin + own-row |
| `admin_audit_log` | `admin_uid` | `auth.users(id)` | SET NULL or RESTRICT | is_admin, read-only |

D6's rationale for the non-CASCADE `ON DELETE` (audit trails must survive account deletion,
aligned with the P24 RTBF scrub pattern — migration `217`'s `scrub_admin_audit_for_target`)
carries directly into the RLS shape: these are not "a user's own rows" in the Class-A-subtype-1
sense, they are **admin action records**, so a plain `auth.uid() = admin_uid` owner policy would
be both wrong (it would let a leaked `authenticated` key read only its own admin's audit rows,
which is not a meaningful boundary — the entire audit log is admin-sensitive, not per-admin
sensitive) and, for `admin_audit_log`, insufficient (never-mutable by `authenticated` at all is
the correct posture).

```sql
-- admin_watchlist: an admin sees/manages only their own saved list, and only if they are
-- currently an admin (is_admin can be revoked; a revoked admin's stale watchlist stays private).
CREATE POLICY admin_watchlist_select_own_admin ON admin_watchlist
  FOR SELECT USING (
    auth.uid() = admin_uid
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
-- INSERT/UPDATE/DELETE mirror the same USING/WITH CHECK shape.

-- admin_audit_log: read-only for admins, scoped to no one via authenticated for writes.
-- Every row is written via the raw-pg / route-handler path (§7), never via a policy-bound role.
CREATE POLICY admin_audit_log_select_admin ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
-- No INSERT/UPDATE/DELETE policy is created for admin_audit_log — absence of a policy for an
-- operation is itself the deny (§4's default-deny mechanic applies per-operation, not just
-- per-table).
```

**`admin_audit_log.target_uid` is explicitly out of this catalog's scope.** Migration `217`
declares it `FK-EXEMPT` on purpose (TEXT, no FK to `user_profiles`/`auth.users`) precisely so an
audit row survives the *target* user's hard delete — it is descriptive audit content (who was
acted on), not a live identity relationship, and it is not one of the 10 tables/columns G9 names
for D6 conversion. It does not get a `uuid` conversion and does not get an `auth.uid()`-based
policy; the PII-FACT redaction convention (migration `217`) already governs what it may contain
post-scrub, and that is Spec 21/§217's domain, not this spec's.
</architecture>

---

<architecture>
## 4. Class B — Pipeline/Enrichment Tables (Default Deny)

**Rule:** every table that is not Class A or Class C gets exactly one statement and nothing else:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
```

No `CREATE POLICY` statement follows. In Postgres, `ENABLE ROW LEVEL SECURITY` with zero policies
denies **all** access — every operation, every row — to any role the policy engine applies to.
This is why Class B needs no per-table catalog entry beyond "it's Class B": the deny is total and
uniform by construction, not by enumerating what to deny.

Representative Class B tables (illustrative, not exhaustive — the rule in §2 is what's
authoritative): `permits`, `parcels`, `coa_applications`, `building_footprints`,
`permit_parcels`, `parcel_buildings`, `permit_trades`, `permit_products`, `cost_estimates`,
`trade_forecasts`, `phase_calibration`, `entities`, `entity_contacts`, `entity_projects`,
`pipeline_runs`, `pipeline_schedules`, `data_quality_snapshots`, `engine_health_snapshots`,
`sync_runs`, `scraper_queue`, `wsib_registry`, `neighbourhoods`, `address_points`,
`inspection_stage_map`, `trade_configurations`, `trade_mapping_rules`, `trade_sqft_rates`,
`trades`, `product_groups`, `logic_variables`, `scope_intensity_matrix`, `permit_history`,
`permit_inspections`, `permit_phase_transitions`, `lead_analytics`, `schema_migrations`.

**Who this deny does *not* apply to, and why that's correct (Decision D1):** Postgres RLS applies
only to roles that are neither the table's **owner** nor a **superuser**, unless the table is
also marked `FORCE ROW LEVEL SECURITY` (which nothing in this catalog uses — see §7). Buildo's
raw `pg` connections — the pipeline (`scripts/`) and the Next.js admin API routes (`src/app/api/`)
per D1 — authenticate as the Postgres role that owns these tables (the role `migrate.js` runs the
schema-creating DDL as, per `docs/specs/00-architecture/113_supabase_infrastructure.md` §3's key
contract). That ownership relationship is what makes those connections RLS-exempt — not a grant,
not a bypass flag, just ordinary Postgres owner semantics. `service_role` (the Postgres role
PostgREST maps the `service_role` JWT claim to) is separately and explicitly granted
`BYPASSRLS`, which is Supabase's own convention, not something this spec configures. **Both facts
point at the same conclusion Decision D1 states directly: pipeline and admin connections bypass
RLS by design, because they were never meant to be inside its enforcement boundary — this is not
a hole being papered over, it's the reason RLS is additive defense-in-depth here rather than the
primary control.** `anon` and `authenticated` are never the table owner and never carry
`BYPASSRLS`, so they are fully bound by the deny above.
</architecture>

---

<architecture>
## 5. Class C — `profiles` (New, Phase 1.3)

**`profiles` is a new table, distinct from the existing `user_profiles` (Class A).** Per
**Decision D7** and `.cursor/active_task.md` Phase 1.3, admin authorization moves to a
server-side `profiles.is_admin` check inside `verify-admin.ts`, created by a Phase-1.3 migration
alongside a bootstrap seed marking the operator's account `is_admin = true`. This is the standard
Supabase convention of a lightweight `public.profiles` row per `auth.users` row, carrying
auth-adjacent flags — **it is not a rename or merge of `user_profiles`**, which remains the
existing app-domain table (trade preferences, notification prefs, `account_preset` — Class A,
§3.1) and is converted in place by D6, not replaced.

**Historical note (not a contradiction, a superseded plan):** `verify-admin.ts`'s current comment
(pre-migration) anticipated the admin flag landing on `user_profiles.is_admin` ("a one-line swap
... `userProfile.is_admin === true`"). D7/Phase 1.3 instead names a separate `profiles` table.
Phase 1.3's implementation updates that comment when it lands; this spec records the naming as
`.cursor/active_task.md` states it, since that document is the binding authority per program
Prime Directive.

**Minimum required shape for this catalog's RLS to apply** (Phase 1.3 may add more columns; the
rule below generalizes to any of them automatically):

```sql
CREATE TABLE profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin  BOOLEAN NOT NULL DEFAULT false
  -- Phase 1.3 may add more columns here; the self-read/self-update-minus-is_admin
  -- rule below covers any additional column without needing a spec update.
);
```

**Self-read / self-update minus `is_admin`:**

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

RLS is row-level, not column-level — the `UPDATE` policy above cannot by itself stop a
self-service caller from flipping their own `is_admin` to `true` (the row is still "their own
row"). The column-level guard is a **trigger**, not a second RLS policy, following the same
`IS DISTINCT FROM` mutation-guard convention this codebase already uses for state changes
(`docs/specs/00-architecture/08_agents.md`'s adversarial-review checklist calls out unguarded
state mutations by name):

```sql
CREATE OR REPLACE FUNCTION prevent_is_admin_self_escalation()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND current_setting('request.jwt.claims', true)::json ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'is_admin may only be changed via the service-role admin path';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prevent_is_admin_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_is_admin_self_escalation();
```

Because the trigger checks the **JWT claim**, not the connecting Postgres role, it correctly lets
the raw-pg admin path (which never carries a `request.jwt.claims` setting at all — that setting
is a PostgREST-only convention) through unaffected, while still gating any future PostgREST/
`authenticated`-role write. `current_setting(..., true)` (the `missing_ok` form) returns `NULL`
rather than erroring when the setting is absent, so the raw-pg path evaluates the `<>` comparison
against `NULL` — which is not `true`, so the `RAISE EXCEPTION` branch is skipped, matching intent
without needing a raw-pg-specific carve-out.
</architecture>

---

<architecture>
## 6. Storage Buckets

**No Buildo feature uses Supabase Storage — or GCS signed URLs for user-facing file storage —
today.** A repo-wide search for signed-URL/upload/avatar patterns turned up nothing beyond the
unrelated `backup_db` pipeline step's logical `pg_dump` to GCS (Spec 113 §9.1, Layer 2 — an
operator-facing backup artifact, not a user-facing file). This section is **forward-looking
readiness**, matching D10's framing for the Data API: the posture to adopt on day one of the
first bucket-backed feature (e.g. a permit photo, a user avatar), not a migration step being
executed now.

**Template, once a bucket exists:** every bucket is created **private** (never `public: true`).
Object paths are namespaced by owner: `<bucket>/<auth.uid()>/<filename>`. Policies key off
`storage.objects`'s `bucket_id` and the first path segment via `storage.foldername(name)`:

```sql
CREATE POLICY <bucket>_select_own ON storage.objects
  FOR SELECT USING (
    bucket_id = '<bucket>'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY <bucket>_insert_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = '<bucket>'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- UPDATE/DELETE mirror the same predicate.
```

This directly replaces the "GCS signed-URL sprawl" pattern (a per-object signed URL minted
server-side, time-limited, unenforceable at the object-store level beyond expiry) with policy
enforcement at the storage layer itself — the client can address its own objects directly via
`supabase-js`, with no server-minted URL in the loop, and no other `authenticated` user's uid
prefix is readable regardless of what the client requests. Admin-only buckets (if any) follow the
same `profiles.is_admin`-gated shape as §3.2's `admin_watchlist`, substituting the bucket
predicate for the table.
</architecture>

---

<architecture>
## 7. RLS Enablement Ordering

**Class A is strictly gated on Decision D6 completing (`.cursor/active_task.md` Phase 1.4).**
Every Class A policy predicate is `auth.uid() = <column>`, which requires `<column>` to already
be `uuid` — `auth.uid()` returns `uuid`, and comparing it against the current `VARCHAR(128)`/
`TEXT`/`VARCHAR(100)` Firebase-uid columns (Ground truth G9) does not type-check. **Enabling RLS
and writing Class A policies before D6's uuid conversion lands is a guaranteed failure at
migration-apply time** (§8, Known Failure Modes) — not a subtle bug, a `CREATE POLICY` that
cannot execute.

**Class B has no such dependency.** `ENABLE ROW LEVEL SECURITY` with no policies references no
column and no `auth.uid()` call — it can land at any point after this spec, independent of D6,
Phase 1.3, or Phase 1.4. Because Data API is disabled (D10) and no `anon`/`authenticated`
Postgres role is granted anything on these tables today, enabling RLS here is a zero-behavior-
change, zero-risk migration — there is no reason to sequence it late.

**Class C (`profiles`) is created by Phase 1.3 itself** — its RLS (§5) is naturally authored in
the same migration that creates the table (or the immediately following one), since there is no
table to enable RLS on before that point.

**Where these land in the Execution Plan:** `.cursor/active_task.md`'s current Execution Plan
does not name a dedicated implementation phase for applying the migrations this catalog
describes — Phase S4 (this spec) is scoped to *authoring the catalog*, per D10's "RLS Policy
Catalog still authored ... Storage policies + future re-enable" framing (readiness, not an
execution step). Implementers have three natural carriers rather than a fourth invented phase:
Class B's default-deny migration is independent and can land any time post-S4 (e.g. bundled into
Phase 0 or Phase 3 pipeline work); Class C's policies are the natural tail of Phase 1.3's
`profiles` migration; Class A's policies are the natural tail of Phase 1.4's D6 migration, since
both touch the identical 10 tables in the identical window. If none of those carriers are judged
sufficient at implementation time, amending the Execution Plan with an explicit phase step is the
correct move — not silently deferring RLS indefinitely because no step named it.
</architecture>

---

<architecture>
## 8. Policy Naming Convention & Migration Mechanics

**Naming:** `<table>_<operation>_<scope>`, lowercase, `snake_case`, operation one of
`select`/`insert`/`update`/`delete`, scope one of `own` (owner-only), `own_admin` (owner-only +
`is_admin`-gated), or `admin` (is_admin-gated, not owner-scoped — e.g.
`admin_audit_log_select_admin`). Trigger functions follow existing repo convention
(`snake_case`, verb-first: `prevent_is_admin_self_escalation`, matching
`scrub_admin_audit_for_target` from migration `217`).

**Migration mechanics — Decision D5 governs, no exception for RLS:** `scripts/migrate.js` is the
only schema authority for every Buildo Postgres instance (Spec 113 §7). RLS-enabling and
policy-creating statements are ordinary DDL and land via `migrations/NNN_*.sql` files like any
other schema change — **no `supabase db push`, no dashboard-authored policy, no CLI-driven
drift.** Each migration:

- Carries a `SPEC LINK` header pointing to `docs/specs/00-architecture/114_rls_policy_catalog.md`
  (plus the relevant `§` for the class it implements).
- Groups by class, not by table — one migration for "Class B default-deny, batch 1", not one
  migration per table (35+ tables would be 35+ migrations for an identical statement shape).
- Follows the `ALLOW-DESTRUCTIVE` comment-only `DOWN` convention already used for structural
  changes (migrations `215`, `217`) — `DROP POLICY`/`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
  are destructive to the security posture even though not to data, so they get the same
  human-gated rollback treatment as a `DROP TABLE`.
- Runs through the existing `validate-migration.js`/fresh-staging-replay gate (D12, §9) before
  being considered landed — no separate RLS-specific validation pipeline is introduced.
</architecture>

---

<security>
## 9. Role / Class Matrix

| Role | Class A (own row) | Class A (admin subtype) | Class B | Class C (own row) | Class C (`is_admin`) |
|---|---|---|---|---|---|
| `anon` | deny | deny | deny | deny | deny |
| `authenticated` (not owner) | deny (RLS `USING` fails) | deny unless `is_admin=true` | deny | deny (not own `id`) | n/a — column-level, not role-level |
| `authenticated` (owner) | allow (per §3.1 op set) | allow only if `is_admin=true` (§3.2) | deny | allow SELECT/UPDATE, `is_admin` column blocked by trigger (§5) | — |
| `service_role` (PostgREST, future) | `BYPASSRLS` — full access | `BYPASSRLS` — full access | `BYPASSRLS` — full access | `BYPASSRLS` — full access | `BYPASSRLS`, including `is_admin` (trigger explicitly allows `service_role` JWT claim) |
| Table owner (raw `pg` — pipeline, Next.js admin routes, `migrate.js`) | owner-exempt from RLS entirely | owner-exempt | owner-exempt | owner-exempt | owner-exempt |

The bottom row is the D1 fact restated as a matrix row rather than prose: it is uniform across
every class because it is a property of the **connection**, not of any policy written above.
</security>

---

<testing>
## 10. Testing Mandate — pgTAP Contract (Decision D12)

**pgTAP locks every policy this catalog describes.** Per `.cursor/active_task.md` D12, `supabase
test db` runs pgTAP suites against the local stack as part of the release-gating migration
validation (not per-commit — matching D12's "release-gating not per-commit" cadence already
established for `migrate.js` fresh-replay). **For every `CREATE POLICY` this spec's migrations
add, the pgTAP suite carries at least one positive test and one negative test** — a policy with
only a positive test is unverified on the axis that matters most (does it correctly *deny*).

| Test class | Positive case | Negative case |
|---|---|---|
| Class A owner-only | Row's own `auth.uid()` can `SELECT`/mutate its row | A different `auth.uid()` gets zero rows / a rejected mutation on the same row |
| Class A admin subtype | An `is_admin=true` uid can perform the granted operation | An `is_admin=false` (or no `profiles` row) uid is denied, even if it owns the row (`admin_watchlist`) |
| Class B default-deny | Table owner / `service_role` reads/writes normally (sanity — RLS enablement did not break the pipeline) | `anon` and `authenticated` both get zero rows on `SELECT` and a rejected `INSERT` |
| Class C self-update | Owner updates a non-`is_admin` column | Owner's attempt to change `is_admin` via a direct `UPDATE` raises the trigger exception; a `service_role`-attributed session succeeds |
| Storage (once a bucket exists) | Owner reads/writes its own `<uid>/` prefix | A different `authenticated` uid is denied on the same object path |

**File location convention:** pgTAP suites live under `supabase/tests/` (Supabase CLI's own
convention for `supabase test db`), one file per table class (`rls_class_a.test.sql`,
`rls_class_b.test.sql`, `rls_class_c.test.sql`), each carrying the same `SPEC LINK` header
convention as every other Buildo test file (Prime Directive #3).
</testing>

---

<failure_modes>
## 11. Known Failure Modes

- **RLS enabled before D6's uuid conversion** — writing `auth.uid() = user_id` against a still-
  `VARCHAR`/`TEXT` identity column is a type mismatch at `CREATE POLICY` (or, worse, at query
  time if Postgres coerces rather than rejects). Guard: §7's ordering rule — Class A migrations
  are sequenced strictly after Phase 1.4; `validate-migration.js`/fresh-staging-replay (D12)
  catches a type mismatch at apply time regardless, but the ordering rule prevents ever authoring
  the broken migration in the first place.
- **A table added without a default-deny policy** — a future migration creates a new table and
  the author simply forgets the `ENABLE ROW LEVEL SECURITY` line. Guard: §2's classification rule
  is definitional (Class B is "everything not named Class A/C"), not enumerated, so there is
  nothing to keep in sync — but the enablement statement itself is still a per-migration action a
  human can skip. The pgTAP Class B suite (§10) MUST include a schema-introspection test (e.g.
  `SELECT relname FROM pg_class WHERE relrowsecurity = false AND relkind = 'r' AND relnamespace =
  'public'::regnamespace` minus the small explicit allowlist of `auth`/`storage`-adjacent or
  extension-owned exceptions) rather than one test per named table — a table that slips through
  is caught by the introspection query without anyone having remembered to add a row for it.
- **`is_admin` self-escalation via UPDATE** — an `authenticated` user with a valid `profiles` row
  issues `UPDATE profiles SET is_admin = true WHERE id = auth.uid()`; the row-level policy alone
  (`auth.uid() = id`) permits it because it *is* their own row. Guard: §5's
  `prevent_is_admin_self_escalation` trigger, tested by the Class C negative case (§10) —
  column-level intent enforced by a `BEFORE UPDATE` trigger, not by RLS (which cannot express
  column-level restrictions natively).
- **Storage bucket left public** — a bucket created with `public: true` (or the dashboard toggle
  flipped for convenience during development) bypasses every policy in §6 entirely; public
  buckets serve objects over a plain URL with no `auth.uid()` check in the loop. Guard: bucket
  creation MUST happen via a tracked migration (D5, §8) specifying `public: false` explicitly,
  never via the dashboard; the pgTAP Storage suite (§10) includes a check against
  `storage.buckets.public = false` for every Buildo-created bucket.
- **Policy referencing a `VARCHAR`/`TEXT` uid post-conversion** — the inverse of the first failure
  mode: a policy authored *before* D6 (impossible per §7's ordering, but a copy-pasted template
  used elsewhere, or a manually-added policy outside `migrate.js`, could reintroduce it) compares
  `auth.uid()` (uuid) against a column that was never converted, or was converted in one table
  but the policy was copy-pasted against a different, not-yet-converted table. Guard: §8's
  migration-grouped-by-class convention means every Class A policy in a given migration references
  columns converted in the *same* D6 migration batch, eliminating the cross-table copy-paste risk
  by construction; `validate-migration.js` type-checks the resulting DDL regardless.
</failure_modes>

---

<constraints>
## 12. Operating Boundaries

### Target Files
- `migrations/` (new: Class A/B/C `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` migrations, per
  §8's grouping convention; the `prevent_is_admin_self_escalation` trigger function)
- `supabase/tests/rls_class_a.test.sql`, `rls_class_b.test.sql`, `rls_class_c.test.sql` (new —
  pgTAP suites, §10)
- `src/lib/auth/verify-admin.ts` — comment update only, reflecting `profiles.is_admin` (Phase
  1.3's domain to implement; this spec documents the target shape, §5)

### Out-of-Scope Files
- `src/app/api/**/route.ts` — no route-handler authorization logic is defined or changed by this
  spec; Spec 13 and each route's own logic remain the live authorization path (§1 scope
  statement).
- `docs/specs/00-architecture/13_authentication.md` — `getClaims()`/`getUser()` criteria,
  DEV_MODE preservation, MFA/break-glass are Spec 13's domain; this spec only consumes Spec 113
  §3's key contract to know which Postgres role each connection surface uses.
- `docs/specs/00-architecture/113_supabase_infrastructure.md` — Data API enable/disable
  mechanics, connection routing, and the future re-enable *model* (explicit-grant + `api` schema)
  are owned there (§10); this spec is the policy content that model would grant, not the
  mechanism deciding when to grant it.
- `scripts/backup-db.js`, `scripts/restore-db.js` — the `backup_db` GCS pg_dump path (§6's "not a
  user-facing file" note) is Spec 112's domain.
- `mobile/src/lib/supabase.ts`, `src/lib/supabase/` — client factory construction is Spec 93 /
  Spec 113's domain; this spec assumes whatever key those factories use (`anon`/`authenticated`
  via a signed-in session) and defines what that key is permitted to see.
- Any bucket-specific application code (upload UI, image-picker wiring) — §6 is a template for
  when such a feature exists; authoring it is out of scope until a feature spec introduces one.

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/00-architecture/113_supabase_infrastructure.md` §3 (key/role
  contract per environment), §7 (D5 migration-engine authority), §10 (D10 Data API posture this
  spec's "not a live path today" framing depends on); `.cursor/active_task.md` D1, D6, D7, D10,
  D12 (binding decisions this spec encodes); `docs/specs/00-architecture/01_database_schema.md`
  (table inventory context — known-stale per G1, which is exactly why §2's classification rule is
  definitional rather than an enumerated copy of that inventory).
- **Consumed by:** `docs/specs/00-architecture/13_authentication.md` (Phase S3 rewrite —
  `profiles.is_admin` is the authorization primitive Spec 13's route-level checks read); the new
  Storage-backed feature spec, whenever one is authored (reads §6 as the required policy
  template); the ADR superseding `006-firebase-uid-not-fk.md` (Phase S4 — records that `user_id`/
  `admin_uid` become real FKs under D6, which is also why Class A's policies are simple
  column-equality predicates rather than needing a lookup).
</constraints>
