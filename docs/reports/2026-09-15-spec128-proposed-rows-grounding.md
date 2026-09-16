# Grounding the 12 PROPOSED rows in Spec 128 §5

**Date:** 2026-09-15 · **Subject:** `docs/specs/02-web-admin/128_surface_standard_policy.md` §5 rows R-04, R-09, R-10, R-11, R-12, R-13, R-14, R-16, R-17, R-18, R-20, R-23 · **Mode:** report only, no code or spec edited.

**Method.** The batch-2 Ask discipline, applied to a ruling register: a row is *self-evident* when something **outside the pass that wrote it** already decides it — a ratified spec, an executed code fact, or a prior operator ruling. For each row: (1) the row as written; (2) the search for a deciding precedent; (3) execution of its factual claims; (4) the best-in-class external practice where one bears; (5) a verdict — **SELF-EVIDENT** (cite the decider → recommend ACCEPTED), **NEEDS RULING** (name the genuine choice + a recommended default), or **WRONG** (state the correction).

---

## §0. Two structural findings that condition every row below

**§0.1 Specs 126, 127 and 128 cannot ground each other.** All three are **untracked** (`git status --porcelain docs/specs/02-web-admin/12[678]*.md` → `??` on all three), all headed `Status: DRAFT — authored 2026-09-15`, all produced by the same WF1 pass (`.cursor/wf1_spec126_128_active_task.md`). Spec 124 §4.2 — *"a different party adjudicates — never the pass that discovered it"* — is a **policy rule**, restated per R-I.3, and Spec 128 §4 mirrors it verbatim as step 2 of its own protocol. A §5 row whose `Amends` cell points only at Spec 126 is therefore citing its own author. Six of the twelve rows (R-13, R-16, R-17, R-18, R-20, R-23) are verbatim or near-verbatim lifts from Spec 126 or the census; that is not disqualifying, but it means the register's value for those rows is **the lock, not the rule**, and §5's own preamble concedes no row has one (`128:126`: *"No row reads `BUILT` … every `Lock` cell is still empty"*).

**§0.2 The genuine deciders, when they exist, are all outside the pass.** Where a row *is* self-evident, the decider is a ratified artifact: Spec 116 §5's dated operator amendment (R-09), `migrations/011_parcels.sql` (R-04), `migrations/226` (R-11), executed `classifyRoute()` (R-18), Spec 114 §8 (R-20), Spec 26 §3.4 (R-16), Spec 124 rule 9 / R-X (R-23 / R-14), and a 48-test vitest run (R-23). Those are the citations the ratification step should carry.

---

## §1. R-04 — the two `parcel_id`s

> **R-04** **The two `parcel_id`s are named distinctly:** `parcel_ref` = `parcels.parcel_id` `VARCHAR(20)` (municipal); `parcel_pk` = `parcels.id` `SERIAL`. `usage_events.subject_kind` is required and closed so a ledger row can never blend them.

**Precedent.** None in prose — but the naming collision is a schema fact, not a judgment.

**Executed.** `migrations/011_parcels.sql:5-7` declares `id SERIAL PRIMARY KEY` **and** `parcel_id VARCHAR(20) UNIQUE NOT NULL` on the same table. The drizzle mirror agrees (`src/lib/db/generated/schema.ts:733-735`). The hazard is live, not hypothetical: `migrations/125_create_lead_parcels.sql:22` declares `lead_parcels.parcel_id INTEGER NOT NULL REFERENCES parcels(id)` — a column *named* `parcel_id` that holds the **SERIAL**, with its own header (`:8-11`) recording the DeepSeek catch that BIGINT would have broken the FK. `permit_parcels.parcel_id` (`012:9`) and `parcel_buildings.parcel_id` (`024:4`) do the same. **Nine** migration files use the bare name. `usage_events` and `subject_kind` have **zero hits** across `migrations/`, `src/` and `scripts/` — the table is net-new, so the closed CHECK costs nothing to add now and a migration later.

**External practice.** Fowler, *PoEAA*, **Identity Field** — a surrogate key and a natural/business key are different columns with different lifetimes, and overloading one name across both is the canonical identity-mapping defect.

**Verdict: SELF-EVIDENT → recommend ACCEPTED.** Decided by `migrations/011_parcels.sql:6-7` + `125:22`. One strengthening correction: the row (and Spec 126 §3.4) names `lead_parcels` as the collision site; measured, the name is overloaded across **`parcels`, `lead_parcels`, `permit_parcels` and `parcel_buildings`**. State the wider blast radius in the ratified row — it is the argument for a closed `subject_kind`, not a footnote.

---

## §2. R-09 — `agent` is an entitlement product

> **R-09** **`agent` is an entitlement product (`agent_reports`), not a DB role.** Zero new policies; the same three grep-locked sites as R-01. A DB role for a billing distinction is a category error.

**Precedent — decisive, and it predates Spec 128 §5's own row.** `docs/specs/00-architecture/116_multi_product_architecture.md:65-76` carries a dated **operator amendment**: *"**Ruling (operator, 2026-09-15):** … A **second** product, **`agent_reports`**, is ruled at the same time: an agent who sends a PDF report to a client is a `user` holding one more entitlement, **not** a new database role."* The same block enumerates the identical three landing sites and closes with *"**N5 still holds:** product access is gated at the app/API layer by entitlement, **not** via RLS policies"* — N5 itself being Spec 116 §5's own standing decision (`116:59`).

**Executed.** `migrations/228_entitlements.sql:32-33` → `CHECK (product IN ('lead_gen', 'flight_center'))`. The three sites are real and already mechanically locked: `docs/specs/_contracts.json:33` (`["lead_gen","flight_center"]`), `src/lib/entitlements/index.ts:39` `PRODUCTS`, pinned against the migration literal by `src/tests/contracts.infra.test.ts:620-623`. `stripe_price_product_map` is a JSONB **logic variable** seeded `'{}'` (`228:45-49`), not a table. And the negative half is absolute: **this repo creates no Postgres roles at all** — `grep "CREATE ROLE\|CREATE USER" migrations/` returns zero; only the Supabase built-ins `anon`/`authenticated`/`service_role`/`PUBLIC` are referenced. There is no `agent` role to prefer.

**External practice.** Stripe's **Entitlements** API (2024) models product access as a subscription-derived entitlement checked in the application, explicitly separate from datastore permissions; the general principle is OWASP's — authorization decisions belong in the app layer, database roles exist for data isolation, and conflating a billing tier with a DB principal makes every pricing change a migration.

**Verdict: SELF-EVIDENT → recommend ACCEPTED.** Decided by the Spec 116 §5 operator amendment (2026-09-15) + N5.

**⚠️ Status inconsistency to fix in the same edit.** R-01 and R-09 were ruled **in one sentence, by one operator, on one date, landing in one CHECK-widening statement** — Spec 116's amendment says splitting them *"would mean two migrations against one CHECK."* Yet Spec 128 §5 reads R-01 **ACCEPTED** and R-09 **PROPOSED**. R-09 is not open; it is an ACCEPTED row mis-typed as PROPOSED, and putting it to the operator a second time re-litigates a ruling §5's own preamble says is *"not re-litigated."*

---

## §3. R-10 — `advertiser` and RLS class D

> **R-10** **`advertiser` IS a new role, and it is RLS class D** — *owner-scoped by a non-user key* (`advertiser_id`, not `auth.uid()`). It is the first principal that must read rows it does not own on the `user_id` axis, and the reason class D has to exist at all.

**Precedent — searched and absent, and the absence is affirmative.** `docs/specs/00-architecture/114_rls_policy_catalog.md` §2 (`:49-64`) is **definitionally closed**: *"Every table in the schema falls into **exactly one of three classes**… a table is Class A only if it is one of the 10 named tables below; Class C only if it is `profiles`; **everything else is Class B by default — including tables added after this spec is written.**"* §9's matrix (`:416-430`) is four role rows × three class columns. There is **no class D, and no reserved slot for one**. Every scoping predicate in §5 is `auth.uid()`.

**Executed.** `grep -rni advertiser migrations/ src/ scripts/` → **zero hits**. `advertiser_id` and `current_advertiser_id()` appear in exactly three files repo-wide — Specs 126 and 128 and the admin best-in-class report, i.e. this pass's own output. `scripts/seeds/roles.json` does not exist (no `seeds/roles.json` anywhere); `rls-matrix.db.test.ts` does not exist. The live RLS locks are pgTAP files `supabase/tests/rls_class_{a,b,c}.test.sql` — one per existing class, no D. The `advertisers`/`offers`/`placements` tables do not exist. Under Spec 114 §2 as written **today**, creating them lands them in **Class B default-deny**.

**External practice.** The pattern itself is standard and sound: Supabase's own multi-tenant RLS guidance scopes tenant tables by an `org_id`/membership claim resolved through a `SECURITY DEFINER` helper rather than by `auth.uid()`, precisely because the owning principal is not the authenticated user. So `USING (advertiser_id = current_advertiser_id())` is best-in-class *shape*. What is non-standard is introducing it as a register row in a different spec from the catalog that defines the taxonomy.

**Verdict: NEEDS RULING.** The genuine choice is not "is class D the right shape" — it is **where the amendment lands and when**. R-10 rewrites Spec 114 §2's definitional sentence and adds a row *and* a column to §9, but Spec 114 is listed in Spec 128 §8 only under *Cross-Spec Dependencies → Relies on*. Spec 124 §4.5, mirrored into Spec 128 §4 step 5, requires that a ruling changing what a spec says generically amend that spec **in the same commit as the lock**; the estate already has the worked pattern — Spec 116's dated OD5 amendment block.

**Recommended default: ACCEPT the class-D concept, but land it as a dated amendment to Spec 114 §2 + §9 (the Spec 116 OD5 pattern), and gate the row on the offers/EXPORT/metering product spec that Spec 128 §8 itself lists as not yet written.** Reversing a role after policies ship is expensive; there is no cost to ruling the taxonomy now and deferring the policies until the tables they guard are specified. Until then, note in the row that Spec 114 §2 would classify `advertisers`/`offers` **Class B default-deny**, which is a safe interim posture, not a gap.

---

## §4. R-11 — migration 226's D5

> **R-11** **Migration 226's post-launch D5** (`REVOKE UPDATE(is_admin) FROM app_role`) does not block the role matrix, **but it renders as a declared `OPEN` row on `/admin/roles`, never as an omission.** A matrix page that renders a guarantee the DB does not enforce is worse than no page.

**Precedent.** The migration adjudicates itself.

**Executed.** `migrations/226_profiles_admin_bootstrap.sql:55-67` is the **entire** D5 reference and it is **prose inside a comment block** — there is no commented-out `REVOKE` statement, nothing to uncomment, and no D5 tracking artifact. The comment argues its own irrelevance: *"The proper DB-side fix (a dedicated non-owner elevated role with `REVOKE UPDATE(is_admin) FROM app_role`) is recorded as the post-launch D5 hardening item — **adding it today would be meaningless, since the app connects as owner and bypasses column-level GRANT/REVOKE trivially**."* `app_role` appears exactly once repo-wide — in that comment. The `prevent_is_admin_self_escalation()` trigger is declared **INERT BY DESIGN** under D1/raw-pg (`226:55-58`): `request.jwt.claims` is never set on a direct `pg` connection, so the `IS DISTINCT FROM` check never raises for any caller. `/admin/roles` does not exist (`src/app/admin/` holds 12 entries; no `roles`).

**External practice.** NIST SP 800-53's **POA&M** (Plan of Action and Milestones) discipline: a control matrix must render *open* items as open with an owner and a date. A compliance view that silently omits an unimplemented control is the documented failure mode — precisely R-11's second clause.

**Verdict: SELF-EVIDENT → recommend ACCEPTED.** Decided by `migrations/226:55-67`, which states in its own text that the REVOKE is a no-op today and therefore cannot block anything.

**One correction to the row's wording.** "Post-launch D5" reads as *deferred SQL awaiting a launch*; it is prose in a comment with no artifact behind it. And the row understates the case it is making: the trigger that *does* ship is itself **inert under D1** — so `/admin/roles` has **two** unenforced guarantees to render OPEN, not one. Say both, or the page will render the trigger as enforced.

---

## §5. R-12 — an unaudited admin mutation blocks conversion

> **R-12** **An unaudited admin mutation blocks conversion of the surface that calls it** (§3 rule B6). Phase 0 closes all nine in one WF3 before any Spec 126 work.

**Precedent.** None needed for the principle; the file that implements the mechanism already states the policy.

**Executed — the count is exact.** Enumerating `export const (POST|PUT|PATCH|DELETE)` across all 29 `route.ts` files under `src/app/api/admin/**`: **15 mutating route files, 20 mutating handlers, 9 files with no audit write, 6 audited.** The nine: `builders`, `control-panel/configs`, `control-panel/resync`, `leads/watchlist`, `notifications/test-send`, `pipelines/[slug]`, `pipelines/schedules`, `rules`, `sync`. The six audited all import `writeAdminAudit` from `@/lib/admin/admin-audit`. `control-panel/configs` **PUT** (`:55`) → `applyConfigUpdate` (`src/lib/admin/control-panel.ts:284`) writes exactly four tables: `logic_variables` (`:298`), `trade_configurations` (`:336`), `trade_sqft_rates` (`:359`), `scope_intensity_matrix` (`:374`) — "plus three more tunable tables", confirmed. That route's own header (`:5`) adds a second finding: *"Both routes are admin-gated by src/middleware.ts (no per-route check needed)"* — no per-route auth **and** no audit.

**The "compliance hole" quote is real but mis-located.** It is not in the file header (lines 1–14). It is in the `writeAdminAudit` JSDoc, `src/lib/admin/admin-audit.ts:53-58`: *"Throws on DB error so the mutation handler can decide whether the audit failure should fail the request (it should — **an unaudited admin mutation is a compliance hole**)."* A second instance at `:60-63` reinforces it for the transactional path.

**External practice.** OWASP **ASVS V7 (Error Handling & Logging)** and SOC 2 **CC7.2** both require that every privileged/administrative state change emit an audit record attributable to a principal. The estate's own mechanism is already centralised and already PII-redacts — the marginal cost per route is one call.

**Verdict: SELF-EVIDENT → recommend ACCEPTED.** Decided by the measured 9/15 plus `admin-audit.ts:53-58`, which is the codebase declaring the rule against itself. Fix the citation to *"`admin-audit.ts`'s `writeAdminAudit` doc comment"*.

**Duplicate flag.** R-12 and §3 **rule B6** are the same rule written twice, in the same spec, at full length — B6 even ends *"Status: PROPOSED — R-12 below is the row to ratify."* Per Spec 128's own §0.2-style discipline, one should be the rule and the other a cross-reference. Keep B6 as the budget-section pointer; let R-12 carry the text and the lock.

---

## §6. R-13 — web surface granularity is the PAGE

> **R-13** **Web surface granularity is the PAGE**, with a `sections[]`/`tiles[]` array naming its components — *except* where a component is independently routable or independently gated, which promotes it to its own surface. **Requires ratification.**

**Precedent — the cited one does not resolve.** The row's `Amends` cell reads *"Spec 126 §2 · census Q14."* **Spec 126 §2 contains no granularity rule**; its unit table counts surfaces and §2.2 names the admin components without promoting them. The real source is the census, `docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md:444` (**Q14**), of which R-13 is a word-for-word lift of the *recommended default* column — and the census declares the question **unresolved**: `:170` (*"Settling this is **Q14**; until it is settled the web surface count is a floor, not a total"*), `:412`, `:480`, and `:404` (the lead-feed inspector row is *"blocked on Q14"*).

**Executed.** 24 non-`api` `page.tsx` under `src/app` — matching the census exactly. `src/components/admin/` is **13 files / 4,322 lines** recursively — the census figure, exact. **Zero pages carry an individual route guard**: all gating is prefix-based in `src/lib/auth/route-guard.ts::classifyRoute` (`:142`), called once from `src/middleware.ts:38` under a catch-all matcher; one rule (`route-guard.ts:162`) covers all 15 admin pages; `/builders` and `/builders/[id]` are `authenticated` only by the fail-closed default (`:186`).

**External practice.** Next.js **App Router** makes `page.tsx` the unique unit that maps a route segment to UI; authorization is conventionally applied at the segment/middleware boundary, not per component. That is precisely the estate's shape.

**Verdict: NEEDS RULING — with a correction to the rule's text.** The choice is genuine (it roughly doubles the estate and the descriptor budget either way, and Rule B1 makes the budget a kill criterion), and the census left it open.

**Recommended default: ratify "the page, with `sections[]`/`tiles[]`", and strike the "independently routable" half of the exception.** In the App Router an independently routable thing **is** a `page.tsx` — the clause names the empty set and will read, to a future author, as licence to promote a component on a judgment call. Keep *"independently gated"* as the sole promoter, noting that it promotes **nothing today** (0 per-page guards) and is therefore a forward-looking hook, not a live carve-out. Also repoint the `Amends` cell from "Spec 126 §2" to census Q14, which is what actually says this.

---

## §7. R-14 — JOB gets its own descriptor schema

> **R-14** **JOB gets its own descriptor schema**, not two new `x-frozen` archetype values inside `step.schema.json`. **Must be ratified BEFORE the pipeline programme's C3 contract freeze** — after C3 it is expensive.

**Precedent.** The census recommended the **opposite**: `census:437` (**Q7**) answers *"**Reuse `step.schema.json`.** … A third schema is a third vocabulary to keep in sync. Cost: two new `x-frozen` archetype values in a schema that freezes at C3 — so this must be decided **before** C3."* Spec 126 §3.3 (`:233`) reverses it. The deadline in R-14 is inherited from the census's *reuse* answer — which is the answer R-14 rejects.

**Executed — the premise is refuted.** **C3 has already fired.** `.cursor/c4_batching_entry_active_task.md:8` records the C-TRACK as *"C1 → C2 → **C3 (LANDED 2026-09-04)** → C4 → C3b → C5 → C6"*, and `:62` states *"**C3 has already landed**"*. The freeze artifact is on disk: `scripts/steps/_schema/template-freeze.json` (`frozen_after_pilot: 9`, `schema_sha256: e7111e41…`, 20 categories, 8 archetype profiles, 7 phase runners), locked by `src/tests/template-freeze.infra.test.ts`. FREEZE-1 reads **BUILT** since 2026-09-11 (Spec 122 `:1155`). The live programme position is **C5 / batch 2, authorized 2026-09-15**. The deadline expired eleven days ago — and under R-14's own answer (a separate `job.schema.json`) it never applied, because that answer touches `step.schema.json` not at all.

"After C3 it is expensive" is also overstated: **seven re-freezes have already been paid**, the most recent four days ago (`122a_step_optimization_appendix.md` §A9).

**The conclusion is nonetheless right, for a stronger reason the row does not give.** `identity.archetype` is `x-frozen: true` over 8 values (`step.schema.json:895-899`, verified by loading the schema). Spec 124 §5 **R-X** (`124:204`) — ratified — holds that *"a frozen enum value that has no live executor is a declaration, not a deletion — it must carry a disposition row."* Two JOB archetype values with no converted member and no runner in `scripts/lib/step/index.js` are exactly that defect class. Worse, it is already mechanically fatal: `generate-template-freeze.mjs:229-233` (**arm E**, live and non-vacuous since 2026-09-11) hard-stops `--check` — and therefore every commit through `.husky/pre-commit` — while an unproven archetype stands in the frozen artifact.

**External practice.** One schema per resource kind is the settled convention where lifecycles differ — Kubernetes gives each **Kind** its own OpenAPI schema rather than overloading one Kind with a `type` discriminator, exactly because shared vocabulary across divergent lifecycles produces required fields that half the members must answer `"none"`.

**Verdict: WRONG as written (the premise is refuted) — ratify the conclusion, rewrite the rationale, delete the deadline.** Corrected row: *JOB gets its own `job.schema.json` because a `pg_cron` purge and a chain step share a posture but not a lifecycle, and because R-X plus `generate-template-freeze.mjs`'s arm E make an unproven `x-frozen` archetype value a commit-blocking defect, not merely an expensive one. C3 landed 2026-09-04; this row has no deadline and never depended on one.* This also moots the identical "before C3" clause on `ASK-12` (the stale-run reaper) and on AQ8 in the admin report.

---

## §8. R-16 — `"none"` is a required answer

> **R-16** **`"none"` is a required answer, never an omission — and a `guards.session: "none"` additionally carries a `why` and a `disclosure` block.** A public data surface is exactly where an unwritten `"none"` is most dangerous.

**Precedent — both halves are already settled doctrine.** The first clause is **Spec 124 §2 rule 6** verbatim (`124:86`: *"Every category is present, and every field inside it is answered — `"none"` is legal but must be written, never omitted"*), already mirrored into **Spec 128 §2 as rule 6, "Omission fails"** (`128:33`) by the generator. The "`none` + a required `why`" idiom is equally established: **rule 12** (`124:127`, *"`"none"` is legal only with a stated why"*), register row **R-M** (`124:193`), and the schema's own `anyOf: [{const:"none"}, {$ref:"#/definitions/why"}]` shape at `step.schema.json:889-892`.

**Executed — the one novel clause is grounded outside the pass.** The `disclosure` requirement's worked example is real and ratified elsewhere: **Spec 26 §3.4** (landed at `a8492c9b`) records that `/api/quality` is *"classified **`public`** — unauthenticated"*, serves a curated **11-table** list, and that *"**Scope is a disclosure decision** … Widening 11 → 87 is therefore **blocked on an auth/disclosure ruling for `/api/quality`**."* That is an independent, ratified spec stating the exact condition R-16's `disclosure` block is designed to make visible.

**External practice.** The "explicit deny is written, not inferred" posture is standard in policy-as-code (OPA/Terraform Sentinel): an absent rule and a deliberate allow-none must be distinguishable in the artifact, because a reviewer cannot tell silence from intent.

**Verdict: SELF-EVIDENT → recommend ACCEPTED, but the row should be NARROWED, not ratified as written.** Its first clause is rule 6 restated — and rule 6 is already in this same spec, generated, two sections above. A register row that duplicates a mirrored rule is the drift source the mirror exists to prevent.

**Duplicate flag.** Beyond rule 6, the `guards.session: "none"` ⇒ `why` + `disclosure` sentence is written **four times in Spec 126** (§4.2 `:304`, §6.2 rule 2 `:456`, §8's auth matrix `:580`, and the §3.1 archetype table) — a ratified R-16 would be the fifth. **Recommended edit: cut the first clause to a cross-reference to rule 6, and let R-16 carry only the narrow extension (`guards.session:"none"` ⇒ `disclosure`) plus its AJV lock and the `/api/quality` worked example — which is the only genuinely new artifact its Lock cell names.**

---

## §9. R-17 — ad disclosure is `severity: FAIL`, blocking

> **R-17** **Ad disclosure is `severity: FAIL`, blocking.** "Sponsored" labelling is a legal obligation, not a design preference; ad policy ("no slot above the cost menu", "one per screen", "never inside EXAMPLES") is `plausibility[]` data, not reviewer memory.

**Precedent.** The *disclosure-as-FAIL* half already exists inside this pass's own generated mirror: Spec 128 §2 **rule 7** reads *"REPORT forces `outputs`/`state` to `"none"`; **SLOT forces `disclosure`**"* (`128:34`, emitted from `generate-spec-mirror.mjs:257`), and Spec 126 §3.1's SLOT row (`:187`) already declares **`disclosure`** as *"a `checks[]` entry at `severity: FAIL`"*. The `plausibility[]` clause is likewise already in Spec 126 §4 category 22 (`:286`). Outside the pass: **nothing**. `grep -ri "sponsored\|advertiser\|ad slot" docs/specs/` returns no hits outside Specs 125–128; the only live artifact is `mobile/src/components/parcel/SponsorSlot.tsx` (21 lines, renders `null`), whose governing spec — **Spec 100 §8** (`:142`) — says explicitly *"**A future spec defines the slot inventory, targeting, and billing**."* That spec does not exist; Spec 128 §8 lists it under *Consumed by* as *"the product spec that will own offers + EXPORT + metering."*

**Executed — two shape problems.** (a) `plausibility[]` exists and is one of the 20 required categories (`step.schema.json:133`, `:151`), but **every entry requires a `sql` string** (`minLength: 1`) and the category is defined as *"cross-field/zone-aware **declarative-SQL** check"* executed by `scripts/lib/step/plausibility.js`. "No slot above the cost menu" and "one per screen" are layout rules with no SQL expression. Ad policy currently has **three competing declared homes** — `plausibility[]` (§4 cat. 22), the SLOT descriptor fields `placement`/`max_slots` (§3.1), and the `placements.disclosure_required BOOLEAN NOT NULL` column (§6.3 `:476`). (b) **`severity` and `blocking` are orthogonal, and R-17 conflates them**: `step.schema.json:679` — *"Orthogonal to severity: FAIL severity + blocking:false is 'report loudly, do not halt'"* — and Spec 124's failure-semantics table (`124:359-366`) gives FAIL/`blocking:false` and FAIL/`blocking:true` different chain effects. Further, `step.schema.json:733-737` makes **`blocking: true` force `when: "pre"`**, so a blocking disclosure check is a *pre-render gate*, not a post-render assertion — a real design consequence the row does not state. Choosing FAIL is well-founded under **R-H** (`124:188`): FAIL is right precisely because a missing disclosure is expected to be *zero*, not standingly non-zero.

**External practice.** The legal claim is correct and is the strongest thing in the row. The **FTC's Native Advertising: A Guide for Businesses** (2015) and the Endorsement Guides (16 CFR Part 255) require advertising to be identifiable as advertising, clearly and conspicuously, before the consumer engages; in Canada — the operative jurisdiction here — **Competition Act s. 74.01** (materially false or misleading representations) plus the Competition Bureau's influencer/native-advertising guidance impose the same duty, and the Bureau has enforced against undisclosed paid placement. A disclosure that a build can ship without is a compliance defect, not a style nit; `blocking` is the right posture.

**Verdict: NEEDS RULING — narrow, and mostly mechanical.** The *principle* is self-evident (law decides it, and R-H decides the severity). What is genuinely open, and cannot be answered by precedent, is three things the row currently elides: **(i)** which of the three homes owns ad-placement policy; **(ii)** whether `severity: FAIL` is paired with `blocking: true` — and if so, the acceptance that it forces `when: "pre"`; **(iii)** whether `plausibility[]` may carry a non-SQL arm at all, or whether reusing that inherited name for a layout rule is the vocabulary collision R-06 exists to prevent.

**Recommended default: ratify the legal half now — `disclosure` required on SLOT at `severity: FAIL`, `blocking: true`, `when: "pre"` — and defer the placement-policy clause to the offers product spec.** Put placement policy in the **`placements` table** (`disclosure_required` already lives there, and `inventory_source` is required to be a table, never a literal — Spec 126 §3.1), not in `plausibility[]`. Delete the three worked examples ("no slot above the cost menu", "one per screen", "never inside EXAMPLES") from the ratified row: they are unsourced, they belong to a spec that does not exist, and freezing them here makes a policy nobody has ruled look ratified.

---

## §10. R-18 — a surface's auth must match its contracts'

> **R-18** **A surface's declared auth must match its contracts' auth class**, as a `checks[]` entry at `severity: FAIL`. Measured live mismatch: `/builders` pages are `authenticated` by fail-closed while `/api/builders` is public.

**Precedent.** Census **Q15** (`census:445`) answers *"**Yes, as a `checks[]` entry at `severity: FAIL`**"* with the same measurement.

**Executed — the mismatch is real, confirmed by running the guard, not by reading it.** `classifyRoute()` executed directly against `src/lib/auth/route-guard.ts`:

```
/builders        => authenticated
/builders/12     => authenticated
/api/builders    => public
/api/builders/12 => public
```

`/api/builders` is public by **explicit whitelist** (`route-guard.ts:72`, inside `PUBLIC_PREFIXES`, commented *"Read-only data APIs — public (serve Expo mobile client)"*). `/builders` is `authenticated` only by the **fail-closed default** (`:182-191`), enforced as a redirect in `src/middleware.ts:133-146`. Neither side compensates: `src/app/builders/page.tsx` and `[id]/page.tsx` contain zero hits for `auth|session|redirect|requireUser|getUser`, and `src/app/api/builders/route.ts` contains zero hits for `auth|Bearer|session|uid` — it goes straight from `withApiEnvelope` to `query(...)`.

**External practice.** **OWASP API Security Top 10 — API5:2023 Broken Function Level Authorization**: authorization must be enforced at the API, never inferred from the UI that calls it. A login-walled page in front of an open API is the textbook instance.

**Verdict: SELF-EVIDENT → recommend ACCEPTED.** Decided by executed `classifyRoute()` output plus census Q15. Two improvements to the row: **(1) state the direction** — this is a *data-exposure* mismatch (the page is walled, the data is not), which is the consequential reading and the reason it is FAIL rather than WARN; **(2)** note that `classifyRoute` matches on **pathname only** — no method, role or handler awareness — so the cross-check compares two declarations, and the declaration is the only place the join can live.

**Duplicate flag.** This cross-check is already written **three times in Spec 126** (§4.2 `:304`, §6.2 rule 3's FAIL list `:459`, §8's closing paragraph `:592`) plus census Q15. R-18 should be the single home and the other three cross-references — otherwise §5's own Rule 4 defect ("one contract declared at four sites, locked at one") is reproduced by the spec that names it.

---

## §11. R-20 — the RLS generator emits, never applies

> **R-20** **The RLS policy generator EMITS a migration for human review; it never applies one.** The generated `.sql` passes the same `validate-migrations.sh` / down-comment gates as a hand-authored file; the *assertion* runs against live `pg_policies` under `npm run test:db`, which is the direction that cannot rot.

**Precedent — Spec 114 §8 already mandates every gate this row promises, and more.** `114:386-409`: *"**Migration mechanics — Decision D5 governs, no exception for RLS:** `scripts/migrate.js` is the only schema authority… RLS-enabling and policy-creating statements are ordinary DDL and land via `migrations/NNN_*.sql` files like any other schema change — **no `supabase db push`, no dashboard-authored policy, no CLI-driven drift**,"* each migration carrying a `SPEC LINK` header, grouped **by class not by table**, following the comment-only `DOWN` convention, and running *"through the existing `validate-migration.js`/fresh-staging-replay gate (D12, §9) before being considered landed — no separate RLS-specific validation pipeline is introduced."*

**Executed.** All three gates exist and are hook-wired at `.husky/pre-commit:20-21`: `scripts/hooks/validate-migrations.sh` (whose header declares *"VALIDATES THE STAGED BLOB, NOT THE WORKTREE"* and *"**FAIL CLOSED**"*, handing `git show ":$FILE"` to the node validator) and `scripts/hooks/check-migration-down-comments.sh`. `scripts/validate-migration.js:5-20` enumerates Rules 1–6; the down-comment invariant is **Rule 6**, erroring at `:311` with *"DOWN block contains executable SQL — scripts/migrate.js runs every line."* Crucially, because the bash driver validates the **staged blob**, a generator-emitted file gets no privileged path — it is gated exactly like a hand-authored one. And the estate already has the landed precedent: Spec 126 §6.2 (`:427`) records that migration **227**'s table list was *"**generated, not hand-authored** — 'Re-generate rather than hand-edit if the table list drifts'."*

**External practice.** This is the settled convention: Supabase's own workflow has `supabase db diff` **emit** a migration file into `supabase/migrations/` for review and commit, never apply it; Atlas and Flyway/Liquibase draw the same line between a planned/generated changeset and an applied one. Generation is a drafting aid; the migration is still a reviewed diff.

**Verdict: SELF-EVIDENT → recommend ACCEPTED, with one wording carve-out and two additions.** Decided by Spec 114 §8 + the live `.husky/pre-commit` gates + migration 227's precedent.

**Wording collision to resolve in the same edit.** R-19 (**ACCEPTED**) is headlined *"**No generated migrations.** Declare and assert."* R-20 describes a generator that generates a migration. They complement in substance — R-19 bans generation as the *schema authority*; R-20 permits generation as a *draft* subject to the very human diff review R-19 demands — but neither row states the distinction, and a future reader hitting R-19's unqualified sentence will read R-20 as a contradiction. **Ratify R-20 with an explicit clause naming R-19 (generated-as-draft ≠ generated-and-applied) and citing migration 227**, or narrow R-19's headline to *"no auto-applied generated migrations."* Additionally, R-20 omits two Spec 114 §8 requirements that bind it: the `SPEC LINK` header and **group-by-class, not by table**. Fold both in. Finally, disambiguate the gate names: `validate-migrations.sh` is the bash driver, `check-migration-down-comments.sh` the companion, and `validate-migration.js` Rule 6 a third overlapping enforcement.

---

## §12. R-23 — a metered action with no ledger row

> **R-23** **A metered action with no ledger row is a rule-9 violation.** The dead-meter defect class — a live route, green tests, zero callers, an unreachable UI branch — is closed by making the ledger row a declared, checked consequence of `metering`, and by the orphan panel rendering the join.

**Precedent — this *is* rule 9, already mirrored into this spec.** Spec 128 §2 row 9's surface column reads, verbatim: *"a metered action with no `usage_events` row is the dead-meter defect repeating (`/api/leads/view`, 44 green tests, zero callers, an unreachable paywall branch)"* (`128:36`, emitted from `generate-spec-mirror.mjs:259`). R-23 restates its own §2 rule in §5.

**Executed — every number in the row is true.** `src/app/api/leads/view/route.ts` exists, **152 lines**, `POST` at `:35`. `lead_view_events` exists (`migrations/114_user_profiles_mobile_columns.sql:75-86`, PK `(user_id, permit_num, revision_num)`). Tests **run, not grepped**: `npx vitest run src/tests/api-leads-view.infra.test.ts src/tests/useLeadView.logic.test.tsx` → `src/tests/api-leads-view.infra.test.ts` is **44 tests, all passing** (the exact "44 green tests" figure), 48/48 overall. **Zero callers, proven**: the only `fetch` to the endpoint is inside the hook itself (`src/features/leads/api/useLeadView.ts:25`), and repo-wide `useLeadView` resolves only to its own definition, two prose comments, `query-client.ts:10`, its test file, and an archived spec — no component, page or layout imports it; `mobile/` has zero hits for `leads/view`. The route is the **sole writer** of `user_profiles.lead_views_count` (`route.ts:104-110`), so the column can never leave `DEFAULT 0` — making `mobile/src/components/paywall/PaywallScreen.tsx:153` (`leadViewsCount > 0 ? …`) a **structurally unreachable branch**: every user in production sees the `:167` fallback, never *"N leads viewed in your 14-day trial."*

**External practice.** Event-based metering is the industry default for exactly this reason: **Stripe Billing Meters** (2024) record raw usage *events* and aggregate at query time rather than maintaining a denormalised counter, so the billable fact and the displayed number cannot diverge — which is R-30's `period`-derived-at-query-time rule and the `lead_views_count` lesson, one level up.

**Verdict: SELF-EVIDENT → recommend ACCEPTED, but as a *lock*, not a new rule.** Decided by Spec 124 rule 9 as already mirrored at `128:36`, plus the executed 44/0/dead-branch evidence.

**Duplicate flag.** R-23 and §2 rule 9's surface column are the same sentence with the same exemplar. Rule 9 is generated and cannot drift from Spec 124; R-23 is hand-written and can. Keep R-23 **only** for what rule 9 cannot carry — the `metering` ⇒ ledger-row `checks[]` entry and the orphan-panel join named in its Lock cell — and make its statement a cross-reference to rule 9.

**One reconciliation before ratification.** Rule 9's text says *"a metered action with no **`usage_events`** row"*, but the exemplar it cites writes **`lead_view_events`**. Under R-08 the old meter is knowingly retired in favour of `usage_events`, so the sentence is forward-looking — but as written the rule and its own worked example name different tables. Say so explicitly, or the first reader will file it as a defect.

---

## §13. Summary

| # | Verdict | Deciding source |
|---|---|---|
| **R-04** | SELF-EVIDENT → ACCEPTED | `migrations/011_parcels.sql:6-7` (`id SERIAL` + `parcel_id VARCHAR(20)`); `125_create_lead_parcels.sql:22` |
| **R-09** | SELF-EVIDENT → ACCEPTED | Spec 116 §5 operator amendment, 2026-09-15 (`116:65-76`) + N5 (`116:59`) |
| **R-10** | **NEEDS RULING** | Spec 114 §2 is definitionally closed ("exactly one of three classes", `114:49-64`); §9 matrix `:416-430`; zero `advertiser` hits in code |
| **R-11** | SELF-EVIDENT → ACCEPTED | `migrations/226_profiles_admin_bootstrap.sql:55-67` — D5 is prose; the REVOKE "would be meaningless" |
| **R-12** | SELF-EVIDENT → ACCEPTED | Measured 9 unaudited / 15 mutating routes; `src/lib/admin/admin-audit.ts:53-58` |
| **R-13** | **NEEDS RULING** | Census Q14 (`census:444`), declared unresolved; cited "Spec 126 §2" does not resolve |
| **R-14** | **WRONG (premise refuted)** | C3 **LANDED 2026-09-04** (`c4_batching_entry:8`); `template-freeze.json` on disk; conclusion survives on Spec 124 **R-X** + arm E |
| **R-16** | SELF-EVIDENT → ACCEPTED (narrow) | Spec 124 rule 6 (`124:86`, mirrored `128:33`) + rule 12 + Spec 26 §3.4 |
| **R-17** | **NEEDS RULING** (narrow) | Legal half: FTC Native Ad Guide / Competition Act s.74.01 + R-H. Open: policy home, `blocking`⇒`when:"pre"`, `plausibility.sql` |
| **R-18** | SELF-EVIDENT → ACCEPTED | Executed `classifyRoute()`: `/builders`→`authenticated`, `/api/builders`→`public`; census Q15 |
| **R-20** | SELF-EVIDENT → ACCEPTED (carve-out) | Spec 114 §8 (`114:386-409`); `.husky/pre-commit:20-21`; migration 227 precedent |
| **R-23** | SELF-EVIDENT → ACCEPTED (as a lock) | Spec 124 rule 9, mirrored `128:36`; executed 44/48 green, zero callers, dead `PaywallScreen.tsx:153` branch |

### Still needs the operator — three rows, not twelve

1. **R-10** — where the class-D amendment lands (Spec 114 §2 + §9, on the Spec 116 OD5 pattern) and whether it waits for the offers product spec.
2. **R-13** — page-vs-component granularity; genuinely open per census Q14, and it moves the descriptor budget that Rule B1 makes a kill criterion.
3. **R-17** — which of three homes owns ad-placement policy, and whether `severity: FAIL` is paired with `blocking: true` (which forces `when: "pre"`).

**R-14 needs a correction, not a ruling** — its deadline expired eleven days ago and never applied to its own answer.

### Rows that should be cross-references, not new rules

| Row | Duplicates | Recommended form |
|---|---|---|
| **R-12** | §3 rule B6 (same text, same spec) | B6 → pointer; R-12 carries the text + lock |
| **R-16** | §2 rule 6 (generated, `128:33`); the `disclosure` clause is written 4× in Spec 126 | Cut to the `disclosure` extension + its AJV lock |
| **R-18** | Spec 126 §4.2 / §6.2 rule 3 / §8, + census Q15 | R-18 is the single home; the other three cross-reference it |
| **R-23** | §2 rule 9's own surface column (`128:36`), same exemplar | Keep only the `metering`⇒ledger check + orphan-panel join |
| **R-09** | Already ruled by the operator with R-01 in one sentence | Re-type as **ACCEPTED**; do not put it to the operator again |

---

*Report only. No spec, migration or source file was modified in producing it.*
