# Surface research brief — how to fill in one census row

**Date:** 2026-09-15 · **Audience:** anyone researching a row of the surface census · **Governs:** `scripts/surfaces/_schema/census/*.json`
**Produces:** `docs/reports/generated/127-surface-registry.md` (never edit that file — edit the census and regenerate)
**Specs:** `docs/specs/02-web-admin/126_maxbld_surface_standard.md` §3–§4 (the 21 categories) · `127_surface_conversion_procedure.md` §8 (the registry) · `128_surface_standard_policy.md` §5 (the rulings the vocabularies encode)

---

## 0. The job, in one paragraph

The registry currently renders **137 rows and 3,668 `UNRESEARCHED` fields**. Your job is to turn those fields into closed-vocabulary answers, each with a one-line `why` and at least one citation. You are not designing anything and you are not proposing anything: you are recording **what is true in the tree today**, in a vocabulary someone else fixed, with a pointer to the line that proves it.

**The single rule that matters:** if you did not read the line, you do not write the answer. Leave it `UNRESEARCHED`. An unresearched field is a countable, honest state that the registry renders in its summary. A plausible-looking guess is a defect that survives review — this estate has already paid for that four times in one contract, and once for 486,000 parcels.

---

## 1. Where to work

The census is **sharded** so researchers do not collide:

| Shard | Rows | What is in it |
|---|---:|---|
| `census/mobile-product.json` | 34 | Every Expo screen, navigation shell and full-screen overlay |
| `census/web-product.json` | 10 | The public and signed-in web pages, plus the root layout |
| `census/admin-existing.json` | 15 | The admin pages that exist today |
| `census/admin-new.json` | 11 | The admin pages Spec 126 specifies and nobody has built |
| `census/contracts.json` | 61 | Every API route file |
| `census/jobs.json` | 6 | The four `pg_cron` jobs and two scheduled workflows |

Take **one shard at a time** and say which one you have. The generator merges them in that fixed order, so output is stable regardless of who finished first.

After editing: `node scripts/violations/generate-surface-registry.mjs` then `node scripts/violations/generate-surface-registry.mjs --check`. The drift lock (`src/tests/surface-registry.infra.test.ts`) fails if the committed report is stale.

---

## 2. The reading order — follow it, do not skip

Read **in this order**, because each step tells you what to look for in the next. Skipping to the schema or the spec first is how a plausible answer gets written before anyone looks at the code.

| # | Source | What you take from it |
|---:|---|---|
| **1** | **The page / screen file** (`files[]`) | What renders, which branches exist (these become `states`), which components it imports from `src/components/**` or `mobile/src/components/**` (these become `identity.owns.components[]`), whether it holds a store. |
| **2** | **Its hooks and queries** | Which contracts it reaches and **by which idiom** — a named hook or a bare `fetchWithAuth`. Both count. Five onboarding screens in this repo call an API with no hook at all; a hook-only sweep returns the wrong answer. |
| **3** | **The API route** (`src/app/api/**/route.ts`) | Which HTTP methods are actually exported, the response projection (is it an explicit pick-by-name whitelist, or a row spread?), and which `src/lib` modules it delegates to. **Follow the lib** — most table reads are one level down. |
| **4** | **The SQL** in the route and its libs | The real table names. Resolve CTE and subquery aliases out: an alias is not a table. Note the columns actually selected — that is `lineage.reads[].columns`. |
| **5** | **`src/lib/db/generated/schema.ts`** | Confirm each table and column exists, and its type. This file is produced by `npm run db:generate` (`drizzle-kit introspect`) from the live database, so it is the truth about what is there. |
| **6** | **`migrations/`** | Where the table was created, its constraints and its CHECK vocabularies. Cite `migrations/NNN_name.sql:line`. This is also where you find the RLS class. |
| **7** | **`docs/reference/data-lineage-map.md`** | Which pipeline step **writes** each table (`lineage.*.producing_steps`). Already pre-filled for 133 of 301 table references — **verify it, do not trust it**; the map is column-level and a table can have several producers. |
| **8** | **The step descriptor** (`scripts/**/*.descriptor.json`, `outputs.writes`) and **`scripts/manifest.json`** | Confirm the producing step, and get its chain slot for `chain_position` (e.g. `sources[8]`). The descriptor is authoritative; the lineage map is derived. |
| **9** | **The owning spec** | `identity.spec` and `spec_refs[]`. Cite the **section**, not just the file: `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2`. If there is no SPEC LINK header and the System Map has no row, the honest answer is `UNRESEARCHED`, not a guess at the nearest spec. |

---

## 3. What counts as evidence

A citation is one of:

- **`path/to/file.ts:123`** — a specific line you read. A file path with no line is weak; use it only when the whole file is the evidence (a 7-line stub, say).
- **`migrations/228_entitlements.sql:32-33`** — a line range in a migration.
- **`docs/specs/.../NN_name.md §3.2`** — a spec section anchor.
- **`docs/reference/data-lineage-map.md:4213`** — a line of a generated reference artifact.
- **A command and its output**, when the claim is a count: write the command in the `why`.

**Not evidence:** a comment that asserts something without doing it; a spec sentence describing intent; another report; your recollection; a filename. Four workflow files in this repo carried a header saying a schedule was commented out while all four schedules were live — a comment is a claim, not a citation.

**If two sources disagree, the TREE wins**, and you record the disagreement in `notes`. That is a finding, not an inconvenience.

---

## 4. Filling a row

Every answered category takes the same shape:

```jsonc
"staleness": {
  "answer": "query_cache",              // from the CLOSED vocabulary — see §5
  "why": "TanStack default staleTime of 60s set globally in queryClient.ts; this screen overrides nothing.",
  "evidence": ["mobile/src/lib/queryClient.ts:18", "mobile/app/(app)/parcel-tool/[parcelId].tsx:34"],
  "stale_time_ms": 60000
}
```

Three rules:

1. **`answer` must be a value the schema declares.** If none fits, do not invent one — leave the field `UNRESEARCHED` and raise it. A value the menu lacks is an escalation (Spec 128 §4), never a per-row invention.
2. **`why` is one line, in your own words**, saying why *this* answer. `"none"` always needs a why — that is the rule an unwritten `"none"` exists to break.
3. **`evidence` is never empty** on an answered field. An answer with no citation is `UNRESEARCHED` whatever it says.

**Lineage entries** carry their own evidence:

```jsonc
{ "table": "parcel_address_points",
  "columns": ["parcel_id", "address_point_id"],
  "producing_steps": ["link_parcel_addresses"],
  "chain_position": "sources[8]",
  "owner_spec": "docs/specs/01-pipeline/54_source_address_points.md",
  "evidence": ["src/lib/parcels/consumer-lookup.ts:88", "docs/reference/data-lineage-map.md:5120", "scripts/manifest.json#chains.sources"] }
```

---

## 5. Closed vocabulary cheat-sheet

Every value below is declared in `scripts/surfaces/_schema/surface.schema.json`, each with its own one-line meaning. **That file is authoritative; this is the quick reference.**

| Category | Allowed answers |
|---|---|
| `identity.archetype` | `LIST` · `DETAIL` · `REPORT` · `SEARCH` · `FORM` · `WIZARD_STEP` · `DASHBOARD` · `GATE` · `SLOT` · `STATIC` · `SHELL` |
| `identity.platforms` | `web` · `mobile` · `pdf` |
| `identity.versioning` | `additive_only` · `breaking_allowed` · `frozen` · `none` |
| `inputs` | `contract` · `app_outputs` · `device` · `props` · `none` |
| `outputs` | `none` · `contract_only` · `optimistic_then_contract` · `device_only` |
| `state` | `server_only` · `query_cache` · `zustand` · `mmkv` · `securestore` · `shared_value` · `none` |
| `staleness` | `live` · `query_cache` · `snapshot` · `static` · `none` |
| `staleness.offline` | `cached_projection` · `degraded` · `blocked` · `none` |
| `guards.session` | `anon` · `authenticated` · `entitled` · `admin` |
| `guards.rls_class` | `A` · `B` · `C` · `D` · `none` |
| `guards.entitlement.product` | `lead_gen` · `flight_center` · `parcel_tool` · `agent_reports` |
| `guards.permission` | `location` · `notification` · `none` |
| `render.targets` | `screen` · `pdf` · `csv` · `email` |
| `render.projection` | `list` · `map` · `grid` · `detail` · `none` |
| `render.breakpoints` | `desktop_first_md` · `mobile_first` · `none` |
| `render.export` | `pdf` · `csv` · `none` |
| `checks[].kind` | `contract_parse` · `query_key_hygiene` · `empty_state` · `error_state` · `offline_state` · `touch_target` · `a11y_label` · `selector_atomicity` · `field_whitelist_parity` · `auth_class_parity` · `disclosure` · `ledger_row_present` · `render_target_parity` · `schema_declared` · `components_owned` · `freshness` |
| `checks[].severity` | `FAIL` · `WARN` · `INFO` — **orthogonal to** `blocking` (true/false) |
| `states[].name` | `loading` · `empty` · `hit` · `miss` · `ambiguous` · `partial` · `degraded` · `error` · `offline` · `schema_drift` · `unauthorized` · `rate_limited` · `redirect` · `static` |
| `errors` | `envelope` · `redirect` · `toast` · `inline` · `boundary` · `none` |
| `emits` | `events` · `ledger` · `both` · `none` |
| `emits.ledger_events[]` | `property_view` · `pdf_send` · `offer_impression` · `offer_click` · `export` · `parcel_id_translated` |
| `offers` | `slots` · `none` |
| `offers.targeting[]` | `neighbourhood` · `zone` · `work_type` · `cost_band` |
| `metering` | `metered` · `observed` · `none` |
| `metering.subject_kind` | `parcel_ref` · `parcel_pk` · `permit_rev` · `offer_id` |
| `config` | `logic_variables` · `none` |
| `config.logic_variables[].on_invalid` | `fail` · `default` · `clamp` |
| `sharing` | `sole` · `shared` · `none` |
| `a11y.labels` | `complete` · `partial` · `none` |
| `a11y.dark_mode` | `tokens` · `hardcoded` · `none` |
| `a11y.reduced_motion` | `honoured` · `ignored` · `none` |
| `a11y.i18n` | `none` · `locale_aware` · `translated` |
| `lineage.*.producing_steps` | a list of chain step slugs · `none` · `UNRESEARCHED` |
| **every category** | `UNRESEARCHED` — always legal, always counted |

---

## 6. Four traps this estate has already fallen into

1. **The hook-only sweep.** Tracing hooks and stopping there missed five screens that call an API directly. Grep for the literal `/api/` string **as well as** the hook imports.
2. **The CTE alias.** A regex over `FROM|JOIN` returns alias names that are not tables. Read the query.
3. **The comment that lies.** Headers, TODOs and doc-comments are claims. Cite the code, not the comment about the code.
4. **The plausible zero.** An empty list means *"I looked and there are none"*. If you did not look, the value is `UNRESEARCHED`. A zero in a usage column is indistinguishable from a dead meter — which is exactly how a live 153-line metered route with 44 passing tests and no callers survived for months.

---

## 7. Definition of done, per row

- [ ] Every one of the 21 categories carries either a closed answer with a `why` and `evidence`, or the literal `UNRESEARCHED`.
- [ ] `lineage.reads[]` and `lineage.writes[]` name every table, with the columns actually touched, its producing step (or `none`), its chain position, and its owning spec.
- [ ] `evidence.files`, `.contracts`, `.tables`, `.gate`, `.states`, `.emits` each carry a real citation.
- [ ] `spec_refs[]` cites sections, not just files.
- [ ] For a web surface, `identity.owns.components[]` is complete — and no component file is claimed by two surfaces.
- [ ] `notes` records every disagreement you found between a document and the tree.
- [ ] `node scripts/violations/generate-surface-registry.mjs --check` is clean and the vitest lock is green.

When a row's `unresearched fields` badge reads **0**, it is done.
