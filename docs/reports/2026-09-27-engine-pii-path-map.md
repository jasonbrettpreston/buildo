# Engine PII path map (2026-09-27)

Method: (1) `grep_files` pattern `email|phone|contact_|owner_name|first_name|last_name|full_name|display_name`
over `docs/specs/00-architecture/01_database_schema.md`, table names resolved by reading the nearest `####` heading.
(2) `grep_files` for each table/column over `src/`, `scripts/`, `mobile/` with `glob` `*.{ts,tsx,js,jsx,py,mjs,cjs}`
(or the default). (3) `grep_files` with a `path` argument for each unverified candidate directory. READ-ONLY research;
no schema/doc was modified. Column NAMES only — no email/phone VALUE appears anywhere below.

**PII definition used (Spec 08 §B):** data about an identifiable PERSON — email, phone, personal/contact names,
a person's own home address, auth identifiers — on a user-keyed or person/contact-keyed table.
**NOT PII for this purpose:** parcel/permit street addresses, and building-permit applicant/builder BUSINESS
names that are public open-data records (City of Toronto permits, parcels, massing, centreline); and aggregate COUNTs.

## PII columns

| Table | Column | Why PII (or why NOT) |
|---|---|---|
| `entities` | `primary_phone` | PII — a real phone reached for a named business entity (line 503). |
| `entities` | `primary_email` | PII — a real email for a named entity (line 504). |
| `entity_contacts` | `contact_type` | PII — the label (`phone`/`email`/social) that qualifies `contact_value` (line 538). |
| `entity_contacts` | `contact_value` | PII — a phone/email/social handle; column itself is the contact datum (line 539). |
| `entity_contacts` | `contributed_by` | PII-adjacent — attribution for a user-submitted contact; person identifier in anon reads. |
| `user_profiles` | `email` | PII — the authenticated user's own email (line 1682). |
| `user_profiles` | `backup_email` | PII — second personal email (line 1683). |
| `user_profiles` | `phone_number` | PII — the user's own phone (line 1680). |
| `user_profiles` | `full_name` | PII — the user's personal name (line 1679). |
| `user_profiles` | `display_name` | PII — user-facing personal name (line 1676). |
| `wsib_registry` | `mailing_address` | PII — a business mailing address; borderline, treated PII under "a person's own address" caution (line 1714). |
| `wsib_registry` | `primary_phone` | PII — contact phone for the registry entry (line 1726). |
| `wsib_registry` | `primary_email` | PII — contact email for the registry entry (line 1727). |
| `data_quality_snapshots` | `builders_with_phone` | **NOT PII** — a COUNT of rows; aggregate, not a person's datum (line 398). |
| `data_quality_snapshots` | `builders_with_email` | **NOT PII** — a COUNT; aggregate (line 399). |
| `address_points`, `parcel_address_points`, `parcels`, `coa_applications`, `toronto_centreline` | `address*`, `address_number`, `address_text` | **NOT PII** — parcel/permit street addresses, public open-data records. |
| `permits`, `coa_applications`, `entities`, `wsib_registry` | `legal_name`, `trade_name` | **NOT PII** — builder/applicant BUSINESS names, public permit records. |

## Code paths

| Path | table.column | R/W | Evidence (`file:line`) |
|---|---|---|---|
| `src/app/api/builders/[id]/route.ts` | `entity_contacts.contact_value`, `entities.primary_phone/primary_email` | R | `src/app/api/builders/[id]/route.ts:61` `SELECT ${selectList(ENTITY_CONTACT_PUBLIC_COLS)} FROM entity_contacts` |
| `src/app/builders/[id]/page.tsx` | `entity_contacts.contact_value` | R | `src/app/builders/[id]/page.tsx:164` `value={c.contact_value}` |
| `src/lib/api/public-projections.ts` | `entity_contacts.contact_value`, `entities.primary_phone/primary_email` | R | `src/lib/api/public-projections.ts:248` `'contact_value',` |
| `src/lib/builders/enrichment.ts` | `entities.primary_phone/primary_email`, `entity_contacts.contact_value` | W | `src/lib/builders/enrichment.ts:133` `INSERT INTO entity_contacts (entity_id, contact_type, contact_value, source)` |
| `src/app/api/admin/builders/route.ts` | delegates to `src/lib/builders/enrichment.ts` | W | `src/app/api/admin/builders/route.ts:81` `const { enrichUnenrichedBuilders } = await import('@/lib/builders/enrichment');` |
| `src/app/api/entities/route.ts` | `entities.primary_phone/primary_email` (excluded) | R | `src/app/api/entities/route.ts:36` `// §4.3 — explicit allow-list, never SELECT *. Drops primary_phone /` |
| `src/app/api/admin/stats/route.ts` | `entities.primary_phone/primary_email` (count) | R | `src/app/api/admin/stats/route.ts:142` `WHERE primary_phone IS NOT NULL OR primary_email IS NOT NULL` |
| `src/features/leads/lib/get-lead-feed.ts` | `entities.primary_phone/primary_email` | R | `src/features/leads/lib/get-lead-feed.ts:370` `e.primary_phone,` |
| `src/features/leads/types.ts` | `entities.primary_phone/primary_email` | R | `src/features/leads/types.ts:170` `primary_phone: string \| null;` |
| `src/lib/permits/types.ts` | `entities.primary_phone/primary_email` | R | `src/lib/permits/types.ts:300` `primary_phone: string \| null;` |
| `src/lib/quality/metrics.ts` | `entities.primary_phone/primary_email` (count) | R | `src/lib/quality/metrics.ts:380` `COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) as with_phone,` |
| `src/app/api/admin/users/route.ts` | `user_profiles.email/phone_number/full_name/company_name` | R/W | `src/app/api/admin/users/route.ts:53` `up.user_id, up.email, up.phone_number, up.full_name, up.company_name,` |
| `src/app/api/admin/users/[uid]/route.ts` | `user_profiles.email/phone_number/full_name/backup_email` | R/W | `src/app/api/admin/users/[uid]/route.ts:362` `SET full_name = NULL, phone_number = NULL, email = NULL,` |
| `src/app/api/admin/users/[uid]/subscription/*` | `user_profiles.stripe_customer_id/account_deleted_at` | R/W | `src/app/api/admin/users/[uid]/subscription/retry-cancel/route.ts:77` `SELECT stripe_customer_id, stripe_cancel_failed_at, account_deleted_at FROM user_profiles` |
| `src/app/api/admin/notifications/route.ts` | `user_profiles` (recipient) | R | `src/app/api/admin/notifications/route.ts:107` `FROM user_profiles WHERE user_id = $1` |
| `src/app/api/admin/users/page.tsx`, `[uid]/page.tsx` | `user_profiles.full_name/phone_number` | R | `src/app/admin/users/page.tsx:106` `{r.phone_number ?? ''}` |
| `src/app/api/user-profile/route.ts` | `user_profiles.full_name/phone_number/backup_email` | R/W | `src/app/api/user-profile/route.ts:307` `if (fields.full_name !== undefined) addField('full_name', fields.full_name);` |
| `src/app/api/user-profile/delete/route.ts` | `user_profiles` (account PII) | W | `src/app/api/user-profile/delete/route.ts:58` `UPDATE user_profiles` |
| `src/app/api/user-profile/reactivate/route.ts` | `user_profiles` (account PII) | R/W | `src/app/api/user-profile/reactivate/route.ts:24` `SELECT ${CLIENT_SAFE_JOINED_SELECT} FROM user_profiles up` |
| `src/app/api/subscribe/exchange/route.ts` | `user_profiles.email` | R/W | `src/app/api/subscribe/exchange/route.ts:156` `SELECT email, stripe_customer_id FROM user_profiles WHERE user_id = $1` |
| `src/app/api/subscribe/session/route.ts` | `user_profiles.account_deleted_at` | R | `src/app/api/subscribe/session/route.ts:103` `SELECT account_deleted_at FROM user_profiles WHERE user_id = $1 FOR UPDATE` |
| `src/app/api/subscribe/portal-session/route.ts` | `user_profiles.stripe_customer_id` | R | `src/app/api/subscribe/portal-session/route.ts:45` `SELECT stripe_customer_id FROM user_profiles WHERE user_id = $1` |
| `src/app/api/webhooks/stripe/route.ts` | `user_profiles.stripe_customer_id` | R | `src/app/api/webhooks/stripe/route.ts:385` `SELECT user_id FROM user_profiles WHERE stripe_customer_id = $1 LIMIT 1` |
| `src/lib/auth/get-user-context.ts` | `user_profiles.display_name` | R/W | `src/lib/auth/get-user-context.ts:99` `SELECT up.trade_slug, up.trade_slugs_override, up.display_name, ...` |
| `src/lib/admin/admin-audit.ts` | `user_profiles.full_name/phone_number/backup_email` (redaction list) | R | `src/lib/admin/admin-audit.ts:22` `'full_name',` |
| `scripts/enrich-web-search.js` | `entities.primary_phone/primary_email`, `entity_contacts.contact_value`, `wsib_registry.mailing_address` | R/W | `scripts/enrich-web-search.js:475` `INSERT INTO entity_contacts (entity_id, contact_type, contact_value, source)` |
| `scripts/enrich-wsib.js` | `wsib_registry.primary_phone/primary_email/mailing_address` | R/W | `scripts/enrich-wsib.js:704` `UPDATE wsib_registry SET ${updates.join(', ')} WHERE id = $${paramIdx}` |
| `scripts/backfill/migrate-entities.js` | `entities.primary_phone/primary_email` | W | `scripts/backfill/migrate-entities.js:33` `INSERT INTO entities (legal_name, trade_name, name_normalized, primary_phone, primary_email, ...)` |
| `scripts/lib/compute/link-wsib.js` | `entities` contacts join, `wsib_registry` | R/W | `scripts/lib/compute/link-wsib.js:248` `UPDATE wsib_registry w` |
| `scripts/lib/compute/assert-global-coverage.js` | `entities.primary_phone/primary_email` (count) | R | `scripts/lib/compute/assert-global-coverage.js:434` `COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) AS phone_pop,` |
| `src/lib/enrichment/serper-client.ts` | scrapes contact pages (email/phone harvest) | R | `src/lib/enrichment/serper-client.ts:78` `* Used as a fallback when the homepage has no email addresses.` |
| `mobile/src/lib/userProfile.schema.ts` | `user_profiles.full_name/phone_number/email/backup_email/display_name` | R | `mobile/src/lib/userProfile.schema.ts:32` `phone_number: z.string().nullable(),` |
| `mobile/src/lib/schemas.ts` | `entities.primary_phone/primary_email` | R | `mobile/src/lib/schemas.ts:67` `primary_phone: z.string().nullable(),` |
| `mobile/src/lib/persistFilter.ts` | `user_profiles` PII persistence list | R | `mobile/src/lib/persistFilter.ts:15` `//     (full_name / phone_number / company_name / email / backup_email).` |
| `src/lib/db/generated/schema.ts` | all four PII tables (ORM declaration) | — | `src/lib/db/generated/schema.ts:391` `export const entityContacts = pgTable("entity_contacts", {` |

## Orchestrator adjudication (Claude grounder, 2026-09-27) — what engine fence F4 lands

The engine's measurement above was re-executed file by file (`git ls-files <dir>` + a per-file `grep -c` of
`user_profiles` and of the PII column names). Rule applied: a glob is landed only if EVERY tracked file under it
reads or writes a PII column of a person-keyed table, or is claude-only for a second §B class (money) as well.

**Landed in `claude_only_globs` (unambiguous):**

| Glob | Files | Evidence |
|---|---|---|
| `src/app/api/user-profile/**` | 3 | every file reads/writes `user_profiles` (5/4/10 hits); `route.ts` writes `full_name`/`phone_number`/`backup_email`; `delete/route.ts` scrubs the account row |
| `src/app/api/admin/users/**` | 5 | every file reads `user_profiles` (1-6 hits); `route.ts` projects `email`/`phone_number`/`full_name` (25 PII hits); `[uid]/route.ts` nulls them on erase; the 3 `subscription/*` routes are Stripe/billing (a second §B claude-only class) |

**Refuted by the adjudication (engine over-reach):** `src/lib/admin/**` — 29 files, 23 with zero PII hits
(`github-dispatch.ts`, `manifest-utils.ts`, `parcel-lookup.ts`, …); fencing it would block ordinary admin work.
Moved to the ambiguous list at file level. `src/lib/builders/**` and `src/lib/enrichment/**` hold BUSINESS
contact channels (entity phone/email), which the definition above puts on the ambiguous side of the line — moved
to the ambiguous list, not landed.

**Operator ruling needed (recommendation in brackets):**
1. Business-entity contact paths — `src/lib/builders/enrichment.ts`, `src/lib/builders/extract-contacts.ts`,
   `src/lib/enrichment/**`, `scripts/enrich-web-search.js`, `scripts/enrich-wsib.js`, `scripts/load-wsib.js`
   (10 contact-column hits), `scripts/lib/compute/link-wsib.js` (14). Many builders are sole proprietors, so a
   "business" phone is often a person's. [ADD the two `src/lib/builders/` files, `src/lib/enrichment/**`,
   `scripts/enrich-web-search.js` and `scripts/enrich-wsib.js`; leave `load-wsib.js`/`link-wsib.js` engine-writable
   — they are converted-step code the engine is routinely asked to touch, and the contact columns there are
   bulk-loaded from the public WSIB CSV.]
2. Money-class paths outside `**/billing/**` — `src/app/api/subscribe/**`, `src/app/api/webhooks/stripe/**`.
   Not PII-first, but §B money. [ADD — same claude-only class the policy already applies to billing.]
3. PII fences themselves — `src/lib/admin/admin-audit.ts` (the audit-log PII redaction list),
   `src/lib/api/public-projections.ts` (the public allow-list that keeps `primary_phone`/`primary_email` out of
   anonymous responses), `mobile/src/lib/persistFilter.ts` (the at-rest PII filter). Editing one can leak PII.
   [ADD all three as literal file paths.]
4. Read-only consumers and aggregates — `src/features/leads/lib/get-lead-feed.ts`, `src/app/api/builders/[id]/route.ts`,
   `src/lib/quality/metrics.ts`, `scripts/lib/compute/assert-global-coverage.js`, `src/lib/db/generated/**`,
   `mobile/src/lib/userProfile.schema.ts`, `mobile/src/lib/schemas.ts`. [LEAVE — counts, types and projections
   behind the fences in item 3; fencing them costs routine work for little protection.]

## Engine-proposed claude_only_globs (superseded by the adjudication above)

Only directory-anchored globs where EVERY file is PII-bearing or the directory's purpose is PII handling.

- `src/lib/teams/**` — REFUTED for proposal (see below): no backing table, so **not proposed**. Listed here only to mark the candidate closed.
- `src/lib/admin/**` — PII-redaction & admin identity helpers (`admin-audit.ts` carries the `user_profiles` PII column list; `admin-uid.ts` maps to `user_profiles`). Directory purpose is admin/user-identity handling. → **propose `src/lib/admin/**`**.
- `src/lib/enrichment/**` — the Serper scrape client harvests email/phone from contact pages; the directory exists solely to obtain contact PII. → **propose `src/lib/enrichment/**`**.
- `src/lib/builders/**` — `enrichment.ts` is the single writer of `entities.primary_phone/primary_email` and `entity_contacts.contact_value`. → **propose `src/lib/builders/**`**.

**No other directory qualifies:** every other PII-touching path is a mixed-purpose file or a mixed directory
(API routes, `src/lib/api`, `src/lib/auth`, `src/lib/quality`, `src/features/leads`, generic `scripts/`), so per
the brief they go to the ambiguous section rather than the proposed list.

## Ambiguous — operator ruling needed

| Path | Trade-off |
|---|---|
| `src/app/api/user-profile/**` | Every file is `user_profiles` (self-scoped PII) — but the SAME directory also mutates `entitlements`/trial state and Stripe linkage, i.e. billing. PII-pure? Arguably yes, but it is auth+billing-adjacent; ask. |
| `src/app/api/admin/users/**` | Reads/writes the richest PII in the estate (`email`/`phone_number`/`full_name`), yet `subscription/*` subroutes do billing-only work (`stripe_customer_id`). Directory is PII-first — strong candidate, but mixed with billing; needs ruling. |
| `src/app/api/subscribe/**` | Touches `user_profiles.email` (PII) but the directory's purpose is checkout/Stripe, not PII. PII is incidental; ambiguous. |
| `src/app/api/webhooks/stripe/route.ts` | Reads `user_profiles` to resolve a Stripe customer — PII-adjacent, but webhook/billing purpose. |
| `src/lib/auth/**` | `get-user-context.ts` reads `user_profiles.display_name`; the directory is auth/session purpose, PII only incidental. |
| `src/lib/api/public-projections.ts` | The projection allow-list for `entity_contacts`/`entities` PII — a shared helper used by non-PII routes too. |
| `src/lib/quality/metrics.ts` | Touches `entities.primary_phone/primary_email` only as COUNT aggregates over PII columns. |
| `src/features/leads/lib/get-lead-feed.ts` | Projects `entities.primary_phone/primary_email` into the authenticated lead feed — PII-bearing but the file also computes non-PII scoring. |
| `scripts/enrich-web-search.js`, `scripts/enrich-wsib.js` | Top-level scripts (not a directory-anchored set) that R/W entity/wsib contact PII; generic `scripts/` cannot be fenced. |
| `scripts/lib/compute/link-wsib.js`, `assert-global-coverage.js` | PII-touching helpers inside a shared compute dir that also does non-PII work. |
| `mobile/src/lib/userProfile.schema.ts`, `schemas.ts` | Zod schemas that type PII (and non-PII fields); the mobile app has no `src/` fence scope today. |
| `src/lib/db/generated/**` | ORM declarations for ALL tables incl. PII — generated code, not a hand-authored PII path. |

## Refuted candidates

| Candidate | Evidence |
|---|---|
| `src/app/api/subscribe/**` exists & touches PII | **PARTIALLY CONFIRMED, reclassified.** Directory exists: `src/app/api/subscribe/exchange/route.ts:156`, `session/route.ts:103`, `portal-session/route.ts:45`. But it is billing/checkout purpose → moved to **Ambiguous**, not proposed. |
| `src/app/api/admin/users/**` exists & touches PII | **CONFIRMED.** `src/app/api/admin/users/route.ts:53`, `[uid]/route.ts:362`, `[uid]/subscription/retry-cancel/route.ts:77`. Moved to **Ambiguous** (mixed billing), not proposed. |
| `src/lib/teams/**` exists | **CONFIRMED dir, REFUTED as PII.** `src/lib/teams/types.ts` declares `TeamMember`/`TeamInvite` (`email` field, line 35), but there is **no `teams`/`team_members` table** in `docs/specs/00-architecture/01_database_schema.md` (grep of headings found none) — no DB PII path. Not proposed. |
| WSIB contact loaders under `scripts/` | **CONFIRMED.** `scripts/enrich-wsib.js:554-561` reads `wsib_registry.mailing_address/primary_phone/primary_email`; `:704` updates them. Recorded in Code paths + Ambiguous (script, not dir). |
| `entities` contact loaders under `scripts/` | **CONFIRMED.** `scripts/enrich-web-search.js:334-339/440-475` reads and writes `entities.primary_phone/primary_email` and inserts `entity_contacts`; `scripts/backfill/migrate-entities.js:33`. |
| `serper` directory under `src/lib/` | **REFUTED as a dir.** No `src/lib/serper/`; the client is `src/lib/enrichment/serper-client.ts` (line 78 reference to email harvest). Reclassified under `src/lib/enrichment/**`. |
| `contact` directory under `src/app/api/` | **REFUTED (does not exist).** No `src/app/api/contact/**`; the closest surface is `src/app/api/builders/[id]/route.ts` serving `entity_contacts`. |
