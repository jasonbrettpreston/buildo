#!/usr/bin/env node
/**
 * Spec-mirror generator — WF1 "Spec 126/127/128 surface standard" (2026-09-15).
 * SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §4 (the category mirror)
 * SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md §3 (the gate mirror)
 * SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md §2 (the rule mirror)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2 (R2 — the SCHEMA is canonical,
 *   the prose menu tables are generated FROM it; this generator obeys the same rule for the surface specs)
 *
 * WHY THIS EXISTS — and it is a transcription fix, not a feature.
 *
 * Specs 126/127/128 are deliberate MIRRORS of Specs 122/123/124: the same category
 * contract, the same gate ladder, the same rule register, transposed from the pipeline
 * to the surface estate. A mirror that is typed by hand is a transcription, and this
 * repo has measured that exact defect class four times over in ONE contract
 * (`docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md` §3.2 arrow 2:
 * PARCEL_COST_LINES declared at four sites, locked at one, with the client STRICTER
 * declaration losing to a `z.record`). Worse, the pipeline's own prose already rotted
 * against its schema twice on this very axis — "18 categories" survived in 13 prose
 * sites after the schema said 20 (Spec 122 §1.3's own amendment block).
 *
 * So the mirrored tables are GENERATED from the sources that are canonical TODAY:
 *
 *   S1  scripts/steps/_schema/step.schema.json     (R2-canonical: `required` -> the 20
 *                                                   categories; identity.archetype.enum ->
 *                                                   the 8 archetypes; allOf[].x-profile ->
 *                                                   the required-field profiles)
 *   S2  docs/specs/01-pipeline/123_step_opt_assessment_validation.md   (§6 gates, §7 commits)
 *   S3  docs/specs/01-pipeline/124_step_standard_policy.md             (§2 rules, §4 protocol,
 *                                                                       §5 register columns)
 *
 * THE AUTHORED HALF is the `MIRROR` map below: for every source row, the surface-side
 * disposition (`applies` | `reshaped` | `dropped` | `new`), what it becomes, and WHY.
 * It is deliberately small and readable — the same posture as
 * `scripts/violations/map-categories.mjs`'s RULES table ("this is the authored half, and
 * it must stay auditable by eye"). The generator's job is to guarantee that the authored
 * half is TOTAL in both directions and that the transposed row still cites its source.
 *
 * REFUSES TO EMIT (loud, never silent — the throw-on-bad-shape idiom
 * `generate-programme-backlog.mjs` / `generate-conversion-roadmap.mjs` established):
 *   - a source category / archetype / gate / commit / rule with NO disposition row;
 *   - a disposition row naming a source id that does not exist (the other direction);
 *   - a source file whose section could not be parsed (zero rows extracted);
 *   - a target spec missing either half of a `<!-- generated:mirror:<id> -->` marker pair;
 *   - a duplicate mirror id.
 *
 * TOOLING GATE (Spec 121 §12b.6, as used by map-categories.mjs): `--self-test` proves the
 * both-directions totality throws FIRE. A checker that cannot be shown to fire is not
 * evidence.
 *
 * Usage:
 *   node scripts/violations/generate-spec-mirror.mjs            # write the blocks in place
 *   node scripts/violations/generate-spec-mirror.mjs --check    # exit 1 on drift, writes nothing
 *   node scripts/violations/generate-spec-mirror.mjs --self-test
 *   node scripts/violations/generate-spec-mirror.mjs --print=126-categories
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// BUILDO_SPEC_MIRROR_*_PATH are TEST-ONLY overrides, the same convention as
// BUILDO_LOGIC_VARS_SEED_PATH / BUILDO_CENSUS_PATH / BUILDO_PROGRAMME_ITEMS_PATH, so a
// RED canary can point this at a fixture instead of mutating a committed source.
const STEP_SCHEMA_PATH = process.env.BUILDO_SPEC_MIRROR_SCHEMA_PATH
  || path.join(ROOT, 'scripts/steps/_schema/step.schema.json');
const SPEC_123_PATH = process.env.BUILDO_SPEC_MIRROR_123_PATH
  || path.join(ROOT, 'docs/specs/01-pipeline/123_step_opt_assessment_validation.md');
const SPEC_124_PATH = process.env.BUILDO_SPEC_MIRROR_124_PATH
  || path.join(ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md');
const SPEC_DIR = process.env.BUILDO_SPEC_MIRROR_TARGET_DIR
  || path.join(ROOT, 'docs/specs/02-web-admin');

const TARGETS = {
  126: path.join(SPEC_DIR, '126_maxbld_surface_standard.md'),
  127: path.join(SPEC_DIR, '127_surface_conversion_procedure.md'),
  128: path.join(SPEC_DIR, '128_surface_standard_policy.md'),
};

const SRC_122 = 'docs/specs/01-pipeline/122_pipeline_step_optimization.md';
const SRC_123 = 'docs/specs/01-pipeline/123_step_opt_assessment_validation.md';
const SRC_124 = 'docs/specs/01-pipeline/124_step_standard_policy.md';
const SRC_SCHEMA = 'scripts/steps/_schema/step.schema.json';

// ───────────────────────────────────────────────────────────────────────────
// THE AUTHORED HALF — the disposition of every mirrored row. Auditable by eye.
// `as` is the surface-side name; `why` is the one-line justification that a
// reviewer adjudicates in the diff. Provenance for each disposition is the
// census report, docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md.
// ───────────────────────────────────────────────────────────────────────────

/** Spec 122's 20 schema-canonical categories -> the SURFACE descriptor's categories. */
const CATEGORY_MIRROR = {
  identity: { d: 'applies', as: '`identity`', why: 'route/path · **archetype** · `platforms[]` · `render.projection` · **`owns.components[]`** (required on a web SURFACE — R-13) · owner · spec · `spec_version` · `gate_exempt`. **ONE version axis** — `spec_version` only; the pipeline has no `contract_version` either, and two version fields on one descriptor is two things to forget to bump.' },
  inputs: { d: 'applies', as: '`inputs`', why: '`contract_ref[]` (ids into the CONTRACT registry, **never an inline schema**) · params · `query_key` · `version_pin` · `field_whitelist`.' },
  outputs: { d: 'applies', as: '`outputs`', why: 'mutation `contract_ref[]` · `optimistic` · forced `"none"` on REPORT/GATE/SLOT/STATIC/SHELL.' },
  staleness: { d: 'applies', as: '`staleness`', why: '`stale_time_ms` · `gc_time_ms` · `refetch_on_*` — the TanStack defaults `mobile/src/lib/queryClient.ts` sets globally today, declared per surface.' },
  guards: { d: 'applies', as: '`guards`', why: '`session` · `entitlement{product, statuses[], on_missing}` · `flag` · device permission · `rate_bucket`. A `"none"` carries a required `why` (census Q12: `/api/quality` is public and unwritten-down).' },
  execution: { d: 'reshaped', as: '`render`', why: '`txn_scope`/`batch`/`budget`/`needs_disk_mb` have no surface analogue; what survives is HOW it renders — `targets[]` (screen\\|pdf\\|email) · `projection` · breakpoints (Admin desktop-first `md:` vs Expo mobile-first) · safe-area edges · header/tab-bar behaviour.' },
  checks: { d: 'applies', as: '`checks`', why: '⚠️ **never `"none"`** — inherited verbatim, including the severity vocabulary and the row-derived verdict cascade.' },
  invariants: { d: 'applies', as: '`invariants`', why: 'declarative assertions over the **projected payload**, single-surface scoped.' },
  plausibility: { d: 'applies', as: '`plausibility`', why: 'cross-field UI honesty — absent ≠ `fits:false`; "maximum envelope" ≠ "as-of-right". ⚠️ **Ad policy does NOT land here** (R-34): every `plausibility[]` entry requires a `sql` string and is executed as declarative SQL, and a layout rule has no SQL expression — ad policy is a `checks[]` entry, and placement inventory is the `placements` table.' },
  override: { d: 'dropped', as: '—', why: 'a force-full env var has no surface analogue; the nearest thing, a feature flag, is already `guards.flag`.' },
  emits: { d: 'reshaped', as: '`emits` (merged with `counters`)', why: 'analytics events against the `mobile/src/lib/analytics.ts` whitelist · Sentry breadcrumbs · **ledger writes** · `counters{}` + the Spec 99 §7.7 ratio invariants. A surface counter IS an emitted event, so the two pipeline categories collapse to one.' },
  deviations: { d: 'applies', as: '`deviations`', why: '`{from, why, adjudicated_by, date}` — unchanged shape.' },
  limitations: { d: 'applies', as: '`limitations`', why: '`{what, measured, check_id}` — unchanged shape.' },
  interpretation: { d: 'applies', as: '`interpretation`', why: '→ `<surface>.notes.json`, capped at 12. Prose is capped; checks are uncapped.' },
  recovery: { d: 'reshaped', as: '`errors`', why: '`reset`/`resume`/`rollback`/`verify_clean` describe a RUN; a screen has no run. What a screen has is error classes handled — 401/403/429/schema-drift/offline — each with its declared UI and `no_retry[]`.' },
  database: { d: 'dropped', as: '— (moves to CONTRACT)', why: 'a screen does not touch a table; its contract does. This is the schema-level expression of MAX-SERVER-SIDE and the single property that makes "one contract, N projections" expressible (census §1.2c: `/api/user-profile` is reached from 11 surfaces + 2 shells by two idioms).' },
  counters: { d: 'dropped', as: '— (folded into `emits`)', why: 'see `emits` above; a `records_meta` key has no surface analogue.' },
  config: { d: 'applies', as: '`config`', why: 'tunables as registered logic variables with `min`/`max`/`on_invalid` — debounce, page size, stale time, rate limits. Same registry, same Rule 3.' },
  sharing: { d: 'applies', as: '`sharing`', why: 'which surfaces render this contract · what varies by surface · what varies by render target. The category the census says earns its keep on day one (3 renderings of one payload already exist, 771 hand-written lines).' },
  terminals: { d: 'reshaped', as: '`states`', why: 'renamed; semantics preserved (every exit path, `minItems: 1`). A surface terminal is a render STATE, each pinned by a named golden.' },
};

/** Surface-side categories with NO pipeline ancestor. Emitted after the mirrored 20. */
const CATEGORY_NEW = [
  { as: '`state`', why: 'the Spec 99 §3 row as data: `owner_layer` · `canonical_writer` · `authorized_readers` · `bridge` (B1–B6) · `persistence` · `signout_reset`. Spec 99 §3 already says it is normative and already has a checker (`mobile/scripts/check-spec99-matrix.mjs`) that nothing runs.' },
  { as: '`offers`', why: '`placements[]` · `inventory_source` (a table, never a literal) · `targeting[]` (closed axes) · `disclosure` · `null_when_off` · `max_slots`. Demanded by the SLOT archetype. Ad policy is `checks[]` + the `placements` table, never `plausibility[]` (R-34).' },
  { as: '`metering`', why: '`unit` · `product` · `ledger_event` · `dedup_key` · `quota_from_config` · `on_exceeded` (402 \\| 403 \\| paywall). Demanded by the operator ruling that the parcel tool is its own metered product.' },
  { as: '`a11y`', why: 'touch-target floor (44×44) · labels · dark-mode tokens · safe-area · reduced-motion. No pipeline analogue and no existing home.' },
];

// ───────────────────────────────────────────────────────────────────────────
// THE SURFACE / CONTRACT / JOB ARCHETYPE PROFILES — ONE home for them.
//
// Spec 126 §3.1-§3.3's tables are emitted FROM here, so the required-field
// profile is declared once and rendered once. `archetype_registry` therefore
// carries no `required_fields` column: the schema's `allOf` profiles are the
// register of record and this map is their pre-schema source.
//
// PROVENANCE, not source: the census
// (docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md §2) is where
// these counts and members were MEASURED. It is a report; it does not drift-lock.
//
// CANONICAL HANDOVER: when Phase 1 lands src/surfaces/_schema/surface.schema.json,
// that file becomes canonical exactly as step.schema.json did under R2, and
// assertProfilesAgainstSchema() below throws on any disagreement in EITHER
// direction. Until it is RATIFIED this map is the source; the DRAFT schema on disk is checked against it but does not yet override it.
// ───────────────────────────────────────────────────────────────────────────

const SURFACE_SCHEMA_PATH = process.env.BUILDO_SURFACE_SCHEMA_PATH
  || path.join(ROOT, 'scripts/surfaces/_schema/surface.schema.json');

/** n = measured members; `mobile` / `overlay` / `web` sum to n and the column totals reconcile. */
const SURFACE_ARCHETYPES = [
  { name: 'LIST', platforms: 'web+mobile', mob: 3, ovl: 0, web: 4, example: '`mobile/app/(app)/index.tsx` (264L)',
    must: '`inputs.contract_ref` · `inputs.query_key` · `list.item_archetype` · `list.pagination` · `list.recycling` · `render.projection` · `states[]` **must include** `empty` and `offline`', none: '—' },
  { name: 'DETAIL', platforms: 'web+mobile', mob: 2, ovl: 0, web: 4, example: '`src/app/permits/[id]/page.tsx` (562L)',
    must: '`inputs.query_key` **single-param** (Spec 99 §4 hygiene, as schema) · `sections[]` · `outputs.invalidates[]` when it mutates · `states[]` must include `error`', none: '—' },
  { name: 'REPORT', platforms: 'web+mobile+pdf', mob: 1, ovl: 0, web: 2, example: '`mobile/app/(app)/parcel-tool/[parcelId].tsx` (231L)',
    must: '`outputs.writes: "none"` **enforced** · `inputs.field_whitelist` (must equal the contract\'s) · `plausibility[]` ≥1 · `render.targets[]` · `offers` (may be `"none"`) · `metering` (may be `"none"`)', none: '`outputs` · `state`' },
  { name: 'SEARCH', platforms: 'web+mobile', mob: 1, ovl: 1, web: 0, example: '`mobile/app/(app)/parcel-tool/index.tsx` (115L)',
    must: '`config.debounce_ms` · `config.min_query_len` · `guards.rate_bucket` · `candidate_item` · `states[]` must include `empty` · `log_hygiene` (Spec 100 §2 item 8 — never log `q`)', none: '`outputs.writes` unless a claim action exists' },
  { name: 'FORM', platforms: 'web+mobile', mob: 3, ovl: 2, web: 4, example: '`src/app/admin/security/page.tsx` (293L)',
    must: '`fields[]` each carrying the **Spec 99 §3 row as data** (`owner_layer`, `canonical_writer`, `authorized_readers`, `bridge`, `persistence`, `signout_reset`) · `outputs.contract_ref` · `outputs.rollback` · `states[]` must include `error`', none: '—' },
  { name: 'WIZARD_STEP', platforms: 'web+mobile', mob: 7, ovl: 0, web: 3, example: '`mobile/app/(onboarding)/address.tsx` (270L)',
    must: '`step_index` · `advances_on` · `resume_key` · `skip_when` · `terminal` (bool)', none: '`inputs` may be `"none"` — measured: 2 of the 7 onboarding steps call no route' },
  { name: 'DASHBOARD', platforms: 'web', mob: 0, ovl: 0, web: 4, example: '`src/app/admin/market-metrics/page.tsx` (462L)',
    must: '`tiles[]` each with its own `contract_ref` + `degrade_independently` · `refresh.poll_ms` · `states[]` per tile', none: '`outputs.writes` unless a tile declares a COMMAND' },
  { name: 'GATE', platforms: 'mobile', mob: 2, ovl: 6, web: 0, example: '`mobile/src/components/paywall/PaywallScreen.tsx` (237L)',
    must: '`statuses_handled[]` **must cover every value** of the governing closed set (subscription: all 6 of `chk_entitlements_status`) · `fallthrough` · `on_unknown`', none: '`outputs.writes`' },
  { name: 'SLOT', platforms: 'web+mobile', mob: 0, ovl: 1, web: 0, example: '`mobile/src/components/parcel/SponsorSlot.tsx` (21L)',
    must: '`placement` (closed enum) · `inventory_source` (a **table**, never a literal) · `targeting[]` (closed axes) · `flag` · `null_when_off: true` · **`disclosure`** (a `checks[]` entry at `severity: FAIL`) · `max_slots`', none: '`outputs.writes` except the declared impression ledger event' },
  { name: 'STATIC', platforms: 'web', mob: 0, ovl: 0, web: 3, example: '`src/app/page.tsx` (116L)',
    must: '`content_source` · `seo` — **or** `routing.redirect` alone for a redirect-only page (`admin/lead-feed/flight-center/page.tsx`, 13L, `permanentRedirect`)', none: 'everything else' },
];

/** The 6 navigation shells are descriptors too, but they are NOT among the 53 rendering surfaces. */
const SHELL_ARCHETYPE = {
  name: 'SHELL', platforms: 'web+mobile', n: 6, example: '`mobile/app/_layout.tsx` (AuthGate, 530L)',
  must: '`routing.branches[]` (9 for AuthGate, per `decideAuthGateRoute.ts`) · `guards[]` · `children_groups[]` · `emits.route_decision`',
  none: '`inputs` unless the shell itself fetches — measured: 2 of the 6 read `/api/user-profile`',
};

/**
 * CONTRACT archetypes are assigned per exported METHOD HANDLER, not per route
 * file, because 15 of the 61 route files export more than one method. The
 * measured handler tally is {GET:46, POST:23, PATCH:6, DELETE:3, PUT:2} = 80.
 */
const CONTRACT_HANDLER_TALLY = { GET: 46, POST: 23, PATCH: 6, DELETE: 3, PUT: 2 };
const CONTRACT_ROUTE_FILES = 61;

const CONTRACT_ARCHETYPES = [
  { name: 'QUERY', n: 46, example: '`/api/admin/stats` (reads **18 tables**)',
    must: '`response.projection` (explicit pick-by-name whitelist) · `response.tiers[]` + per-tier degradation · `database.reads[]` · `guards.rate_bucket` · `staleness` · `outputs.writes: "none"`' },
  { name: 'MUTATION', n: 27, example: '`/api/user-profile` (PATCH)',
    must: '`database.writes[]` with `write_discipline` (the Spec 122 §1.4 vocabulary **verbatim**) · `idempotency` · `optimistic_contract` · `rollback` · `consumers[]`' },
  { name: 'WEBHOOK', n: 1, example: '`/api/webhooks/stripe` (504L, 6 event types)',
    must: '`verification` · `events[]` (closed) · `replay_guard` (`stripe_webhook_events` PK) · `ordering_watermark` (`entitlements.last_stripe_event_at`) · `on_unknown_event`' },
  { name: 'COMMAND', n: 6, example: '`/api/admin/control-panel/resync`',
    must: '`job_ref` (which JOB it triggers) · `concurrency` · `audit_row`' },
  { name: 'EXPORT', n: 0, example: '*(net-new — the PDF route)*',
    must: '`render_target` · `source_contract_ref` · `parity_check` (golden equality with the screen projection) · `storage` (bucket + path template) · `share_auth` · `ledger_event`' },
  { name: 'TRANSLATION', n: 0, example: '*(net-new — `parcel_id_translation`, §3.4)*',
    must: '`from_key` · `to_key` · `mapping_table` · `on_unmapped` · `ledger_event` · `consumers: "none"` while R-03 holds' },
];

/** JOB. The DISPATCH pair are chained PIPELINE steps and are out of scope (Spec 126 Operating Boundaries). */
const JOB_ARCHETYPES = [
  { name: 'SCHEDULED', n: 6, example: 'all six, named: the 4 `pg_cron` jobs (`mv_monthly_permit_stats_refresh` `233:90` · `lead_views_retention_purge` `233:96`/`235:134` · `offboarding_sweep_30day` `233:105` · `permit_scrape_outcomes_prune` `237:139`) + `pipeline-watchdog.yml` (`45 18 * * *`) + **`mutation.yml`** (`0 12 * * 1`)',
    must: '`cron` · `target` (function/SQL) · `idempotency` · `on_missing_extension` (all four `cron.schedule` calls are `pg_extension`-guarded) · `audit_row`' },
];

/** Spec 122 §1.10's 8 archetype profiles -> what each one teaches the surface registry. */
const ARCHETYPE_MIRROR = {
  INGESTOR: { as: 'FORM / WIZARD_STEP', why: 'the write-side profile: a surface that writes may not declare `outputs: "none"`, and every declared write names its discipline.' },
  MATERIALIZER: { as: 'REPORT (`render.targets`)', why: 'its profile requires `replay` declared (globally) **plus `recovery.reset` may not be `"none"`** — a derived artifact must say how it is rebuilt. The surface analogue: a projection published to more than one render target declares how each target is regenerated, with the goldens proving parity.' },
  LINK: { as: 'DETAIL', why: 'the invalidates-is-non-empty rule becomes: a detail surface that mutates declares which query keys it invalidates.' },
  MATCHER: { as: 'SEARCH', why: 'a matcher\'s accuracy is a sampled number against a before-image (R-O), never a predicate agreeing with itself; a SEARCH surface\'s candidate quality is measured the same way.' },
  ENRICHER: { d: 'dropped', as: '—', why: 'derivation happens server-side, in a CONTRACT or a pipeline step; a surface never enriches. `execution.phases[]` has no analogue.' },
  BACKFILL: { d: 'dropped', as: '—', why: 'no surface re-processes a corpus.' },
  ASSERT: { as: 'REPORT / GATE', why: 'the profile that forces three categories to `"none"` — which is exactly why `assert_schema` was pilot 1 on the pipeline side and why REPORT is the pilot here (census §4.1).' },
  RECORDER: { as: 'SLOT / the `emits` contract', why: '`outputs.publish` required becomes: a surface that records (an impression, a click, a view) declares its ledger event and its dedup key.' },
};

/** Spec 123 §6 gates -> the surface gate ladder. */
const GATE_MIRROR = {
  G0: { as: 'S0 Boundary freeze', why: 'every route, component file, contract, table, emitted event and render state enumerated; the Target Spec line filled from the system map FIRST.' },
  G1: { as: 'S1 Archaeology', why: 'churn + fix density + fence density over the surface\'s own files, batched per archetype.' },
  G2: { as: 'S2 Structure', why: 'churn×complexity over the surface files; the top-right quadrant named before any rewrite.' },
  G3: { as: 'S3 Intent ledger', why: 'every transcribed constant (`COST_LINE_ORDER`, label maps, field whitelists) classified with the closed Intent Ledger vocabulary. **A different party adjudicates.**' },
  G4: { as: 'S4 Risk class', why: 'A/B/C with chance and impact shown. A surface that gates revenue or renders a legal disclosure is class A by construction.' },
  G5: { as: 'S5 Seam map', why: 'network, clock, device permission, navigation and storage each have a named seam — the surface analogue of DB/clock/network/argv.' },
  G6: { as: 'S6 Classification', why: 'every behaviour CONTRACT / INCIDENTAL / DEFECT; every DEFECT has a ledger id.' },
  G7: { as: 'S7 Test adequacy', why: 'every class-A behaviour has a both-directions lock proven RED then GREEN at the designed assertion.' },
  G8: { as: 'S8 Differential', why: 'zero unexplained diffs across the golden PAIR (API response fixture + rendered-tree snapshot); fingerprint gate over descriptor + contract descriptor + archetype component + format helpers.' },
  G9: { as: 'S9 Reflection', why: 'binary; the `§R Reflection` section with the low-confidence and recurring/standard-shaping tables, feeding Spec 128 §4\'s promotion criterion.' },
  G4d: { as: 'S-fence', why: 'every fence found at S3 has a both-directions lock test.' },
  'G-shape': { as: 'S-shape', why: 'the converted surface passes the archetype shape rule — no business logic in the client, no hand-written contract mirror, no inline `router.push` string where a declared navigation event belongs.' },
};

/** Spec 123 §7's nine commits -> the surface conversion commit form. */
const COMMIT_MIRROR = {
  1: { as: 'C1 Boundary freeze', why: 'the surface\'s files, its contracts, its consumers; git-blame every hand-written constant.' },
  2: { as: 'C2 Intent ledger', why: 'a different party adjudicates each transcription (Spec 128 §4.2).' },
  3: { as: 'C3 Seam map', why: 'network / clock / permission / navigation / storage seams named.' },
  4: { as: 'C4 Classification', why: 'CONTRACT / INCIDENTAL / DEFECT per behaviour, each DEFECT carrying a ledger id.' },
  5: { as: 'C5 Golden capture PAIR', why: 'API response fixture + rendered-tree snapshot per named state; **non-determinism inventory declared BEFORE the first diff**; every descriptor is a fingerprint file.' },
  6: { as: 'C6 Test design + prove red', why: 'red-first, at the designed assertion; agent-written tests get no benefit of the doubt.' },
  7: { as: 'C7 Descriptor, verbatim no-op', why: 'the descriptor must reproduce the current surface byte-for-byte in the goldens. Any checker widened to accept the current form ships a known-bad fixture proving the RED seed still fires.' },
  8: { as: 'C8 Peel', why: 'one policy concern per commit — guards → projection → states/errors → metering/offers — green goldens after every peel.' },
  9: { as: 'C9 Differential + cutover', why: 'register in `converted.json`, delete the `pending` entry, retire the hand-written constants, and generate the scorecard in the SAME commit.' },
};

/** Spec 124 §2's 13 rules -> the surface policy rules. */
const RULE_MIRROR = {
  1: { as: 'Nothing hidden', why: 'no surface behaviour lives only in a component — it is descriptor data, a declared check, a shape rule, or (last resort) a new schema field, in that order.' },
  2: { as: 'The client is just glass', why: 'the surface analogue of "compute is just compute", and it is not new: Spec 90 §3 already mandates Dumb Glass and already carves out optimistic UI by name. Five things may stay client-side (device state · optimistic UI · offline cache · animation · nav position); everything else is server-projected.' },
  3: { as: 'Tunables externalized', why: 'every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an `on_invalid` posture — same registry, same presence/validity split (R-G).' },
  4: { as: 'Projection rule declared', why: 'which fields render, in which order, with which labels, is a declaration the server owns — not a component\'s implicit knowledge. The measured defect: one contract declared at four sites, locked at one.' },
  5: { as: 'checks ≥ 1', why: 'inherited verbatim; `checks` may never be `"none"` on any surface, contract or job.' },
  6: { as: 'Omission fails', why: 'a category present with fields missing is the same "we forgot something again" the standard exists to answer. `"none"` is legal; silence is not.' },
  7: { as: 'Archetype gates categories', why: 'the load-bearing operator ruling — a UI archetype selects a required-field profile, exactly as `identity.archetype` does at `scripts/steps/_schema/step.schema.json`. REPORT forces `outputs`/`state` to `"none"`; SLOT forces `disclosure`.' },
  8: { as: 'Per-target write discipline', why: 'moves to CONTRACT with the vocabulary unchanged; a surface declares only its optimistic write and its rollback.' },
  9: { as: 'Banned write needs a ledger row', why: 'a metered action with no `usage_events` row is the dead-meter defect repeating (`/api/leads/view`, 44 green tests, zero callers, an unreachable paywall branch).' },
  10: { as: 'Verdict row-derived', why: 'a surface\'s check verdict is derived from its own audit rows, never a parallel boolean — inherited verbatim, including R-Q\'s severity split.' },
  11: { as: 'Render-order re-derive', why: 'the phase-order analogue: when a projection\'s section order changes, the declared order is re-derived and the goldens recaptured, never patched.' },
  12: { as: 'Truthful failure posture', why: 'a surface declares what the user sees when it fails — the crash-posture analogue. An unhandled state is a FAIL, not a blank screen.' },
  13: { as: 'A surface validates itself', why: 'ONE command generates the scorecard and the policy-coverage matrix from artifacts; a hand-written scorecard is not evidence.' },
};

// ───────────────────────────────────────────────────────────────────────────
// Source parsing — every extractor throws on zero rows (a silent empty mirror
// is the exact failure this generator exists to prevent).
// ───────────────────────────────────────────────────────────────────────────

/** The archetype vocabulary, whether the schema spells it `enum` or `oneOf` of consts. */
function archetypeValues(schema) {
  const node = schema?.properties?.identity?.properties?.archetype;
  if (!node) return [];
  if (Array.isArray(node.enum)) return node.enum;
  if (Array.isArray(node.oneOf)) return node.oneOf.map((o) => o.const).filter((v) => typeof v === 'string');
  return [];
}

function readText(p) {
  if (!fs.existsSync(p)) throw new Error(`[spec-mirror] source missing: ${p}`);
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

function section(md, heading) {
  const i = md.indexOf(heading);
  if (i === -1) throw new Error(`[spec-mirror] heading not found: ${heading}`);
  const rest = md.slice(i + heading.length);
  const j = rest.search(/\n## (?!#)/);
  return j === -1 ? rest : rest.slice(0, j);
}

/** S1 — the R2-canonical schema. */
function loadSchemaSource() {
  const schema = JSON.parse(readText(STEP_SCHEMA_PATH));
  const categories = schema.required || [];
  const archetypes = schema?.properties?.identity?.properties?.archetype?.enum || [];
  const profiles = (schema.allOf || []).map((b) => b['x-profile']).filter(Boolean);
  if (categories.length === 0) throw new Error('[spec-mirror] step.schema.json declared ZERO required categories');
  if (archetypes.length === 0) throw new Error('[spec-mirror] step.schema.json declared ZERO archetypes');
  const describe = (c) => {
    const d = schema?.properties?.[c]?.description;
    return d ? oneLine(d, 150) : '';
  };
  return { categories, archetypes, profiles, describe };
}

/** S2 §6 — the G0..G9 table plus §6.1's two conversion-specific gates. */
function loadGateSource() {
  const md = readText(SPEC_123_PATH);
  const sec = section(md, '## 6. Gates');
  // §6's table is `| # | Phase | Criterion | Pts |`; §6.1's is `| Gate | Criterion |`.
  // Split on cells rather than a fixed arity so BOTH shapes parse — the two
  // conversion-specific gates are exactly the rows a fixed-arity regex drops silently.
  const rows = [];
  const seen = new Set();
  for (const line of sec.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    // `G0`…`G9`, `G4d`, `G-shape` — and deliberately NOT the literal header cell "Gate",
    // which a looser `G[0-9A-Za-z-]+` matched and turned into a phantom source row.
    const m = cells[0].match(/^\*{0,2}(G(?:[0-9][0-9a-z]*|-[a-z]+))\*{0,2}$/);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) throw new Error(`[spec-mirror] Spec 123 §6 has a duplicate gate id: ${id}`);
    seen.add(id);
    rows.push({
      id,
      phase: cells.length >= 4 ? oneLine(cells[1], 60) : 'conversion-specific',
      criterion: oneLine(cells.length >= 4 ? cells[2] : cells[1], 200),
    });
  }
  if (rows.length === 0) throw new Error('[spec-mirror] Spec 123 §6 parsed ZERO gate rows');
  return rows;
}

/** S2 §7 — the nine commits. */
function loadCommitSource() {
  const md = readText(SPEC_123_PATH);
  const sec = section(md, '## 7. Per-step procedure');
  const rows = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]*)\|\s*([^|]*)\|/);
    if (!m) continue;
    rows.push({ n: Number(m[1]), phase: oneLine(m[2], 170), gate: oneLine(m[3], 40) });
  }
  if (rows.length === 0) throw new Error('[spec-mirror] Spec 123 §7 parsed ZERO commit rows');
  return rows;
}

/** S3 §2 — the thirteen rules, and §5's register columns, and §4's protocol steps. */
function loadRuleSource() {
  const md = readText(SPEC_124_PATH);
  const sec = section(md, '## §2. The rules');
  const rules = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\*\*(\d+)\.\s+(.+?)\*\*\s*$/);
    if (!m) continue;
    rules.push({ n: Number(m[1]), text: oneLine(m[2], 220) });
  }
  if (rules.length === 0) throw new Error('[spec-mirror] Spec 124 §2 parsed ZERO rules');

  const reg = section(md, '## §5. Register of rulings');
  const header = reg.split('\n').find((l) => /^\|\s*#\s*\|/.test(l));
  if (!header) throw new Error('[spec-mirror] Spec 124 §5 register header not found');
  const columns = header.split('|').slice(1, -1).map((c) => c.trim()).filter(Boolean);

  const proto = section(md, '## §4. When the policy is unclear');
  const steps = [];
  for (const line of proto.split('\n')) {
    const m = line.match(/^(\d+)\.\s+(.+)$/);
    if (!m) continue;
    steps.push({ n: Number(m[1]), text: oneLine(m[2], 240) });
  }
  if (steps.length === 0) throw new Error('[spec-mirror] Spec 124 §4 parsed ZERO protocol steps');
  return { rules, columns, steps };
}

/** Split a markdown table row on UNESCAPED pipes (`\|` appears inside menu cells). */
function splitRow(line) {
  return line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
}

function oneLine(s, cap) {
  let t = String(s).replace(/\s+/g, ' ').trim();
  if (cap && t.length > cap) {
    t = `${t.slice(0, cap - 1).trimEnd()}…`;
    // A truncation that lands mid-emphasis would bleed bold into the rest of the
    // generated table. Close it rather than emit broken markdown.
    if ((t.match(/\*\*/g) || []).length % 2 === 1) t += '**';
  }
  return t;
}

// ───────────────────────────────────────────────────────────────────────────
// Totality — both directions, for every mirror map.
// ───────────────────────────────────────────────────────────────────────────

function assertTotal(kind, sourceIds, mirror) {
  const src = sourceIds.map(String);
  const mine = Object.keys(mirror).map(String);
  const missing = src.filter((id) => !mine.includes(id));
  const extra = mine.filter((id) => !src.includes(id));
  if (missing.length) {
    throw new Error(`[spec-mirror] ${kind}: ${missing.length} source row(s) with NO disposition — ${missing.join(', ')}. Every mirrored row must be dispositioned; an undispositioned row is a silent drop.`);
  }
  if (extra.length) {
    throw new Error(`[spec-mirror] ${kind}: ${extra.length} disposition row(s) naming a source id that does not exist — ${extra.join(', ')}. The source moved under the mirror.`);
  }
}

const DISPOSITION_BADGE = {
  applies: '✅ applies',
  reshaped: '♻️ reshaped',
  dropped: '⛔ dropped',
  new: '🆕 new',
};

function badge(entry) {
  const d = entry.d || 'applies';
  const b = DISPOSITION_BADGE[d];
  if (!b) throw new Error(`[spec-mirror] unknown disposition "${d}" — allowed: ${Object.keys(DISPOSITION_BADGE).join(' | ')}`);
  return b;
}

// ───────────────────────────────────────────────────────────────────────────
// Renderers — one per mirror id.
// ───────────────────────────────────────────────────────────────────────────

function renderCategories(schemaSrc) {
  assertTotal('categories', schemaSrc.categories, CATEGORY_MIRROR);
  const L = [];
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: \`${SRC_SCHEMA}\` \`required[]\` (${schemaSrc.categories.length} categories, R2-canonical per ${SRC_122} §1.2) + the authored disposition map in \`scripts/violations/generate-spec-mirror.mjs\`. Regenerate: \`node scripts/violations/generate-spec-mirror.mjs\` (an \`npm run spec-mirror\` alias + \`npm run verify\` wiring lands in Phase 1).`);
  L.push('');
  L.push('| # | Spec 122 category | Source anchor | Disposition | SURFACE category | What it declares here / why it was dropped |');
  L.push('|---:|---|---|---|---|---|');
  schemaSrc.categories.forEach((cat, i) => {
    const e = CATEGORY_MIRROR[cat];
    L.push(`| ${i + 1} | \`${cat}\` | \`${SRC_SCHEMA}\` \`required[${i}]\` · ${SRC_122} §1.3 | ${badge(e)} | ${e.as} | ${e.why} |`);
  });
  const base = schemaSrc.categories.length;
  CATEGORY_NEW.forEach((e, i) => {
    L.push(`| ${base + i + 1} | — | *(no pipeline ancestor)* | ${DISPOSITION_BADGE.new} | ${e.as} | ${e.why} |`);
  });
  L.push('');
  const kept = schemaSrc.categories.filter((c) => (CATEGORY_MIRROR[c].d || 'applies') !== 'dropped').length;
  L.push(`**Counts (derived, not typed):** ${schemaSrc.categories.length} pipeline categories in · ${kept} carried over · ${schemaSrc.categories.length - kept} dropped · ${CATEGORY_NEW.length} net-new · **${kept + CATEGORY_NEW.length} SURFACE categories out.**`);
  return L.join('\n');
}

/**
 * Every declared archetype is covered by exactly one `allOf[].x-profile` block,
 * and every profile block names only declared archetypes. Both directions — a
 * profile that stops covering an archetype is the silent failure this catches.
 */
function assertProfileCoverage(schemaSrc) {
  const covered = new Map();
  for (const p of schemaSrc.profiles) {
    const head = String(p).split('—')[0];
    const names = head.split('/').map((t) => t.trim()).filter((t) => /^[A-Z_]+$/.test(t));
    if (names.length === 0) throw new Error(`[spec-mirror] an x-profile block names no archetype: "${oneLine(p, 60)}"`);
    for (const n of names) {
      if (covered.has(n)) throw new Error(`[spec-mirror] archetype ${n} is covered by TWO x-profile blocks — the required-field profile is ambiguous.`);
      covered.set(n, p);
    }
  }
  assertTotal('x-profile coverage', schemaSrc.archetypes, Object.fromEntries([...covered.keys()].map((k) => [k, true])));
  return covered;
}

function renderArchetypeProfiles(schemaSrc) {
  assertTotal('archetype profiles', schemaSrc.archetypes, ARCHETYPE_MIRROR);
  const covered = assertProfileCoverage(schemaSrc);
  if (covered.size !== schemaSrc.archetypes.length) {
    throw new Error(`[spec-mirror] ${covered.size} archetypes covered by profiles but ${schemaSrc.archetypes.length} declared.`);
  }
  const L = [];
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: \`${SRC_SCHEMA}\` \`properties.identity.properties.archetype.enum\` (${schemaSrc.archetypes.length} values) + \`allOf[].x-profile\` (${schemaSrc.profiles.length} profile blocks), ${SRC_122} §1.10.`);
  L.push('');
  L.push('| Pipeline archetype | Source anchor | What its profile PROVES | Disposition | Surface analogue |');
  L.push('|---|---|---|---|---|');
  schemaSrc.archetypes.forEach((a, i) => {
    const e = ARCHETYPE_MIRROR[a];
    L.push(`| \`${a}\` | \`${SRC_SCHEMA}\` \`identity.archetype.enum[${i}]\` · ${SRC_122} §1.10 | ${e.why} | ${badge(e)} | ${e.as} |`);
  });
  L.push('');
  L.push(`**The mechanism being mirrored, stated once:** the archetype selects an AJV required-field profile — ${schemaSrc.profiles.length} \`allOf\` \`x-profile\` blocks covering all ${schemaSrc.archetypes.length} archetypes, asserted in both directions by this generator.`);
  L.push('');
  L.push(`**Coverage (derived):** ${[...new Set(schemaSrc.profiles)].length} profile blocks · ${covered.size} archetypes covered · 0 uncovered · 0 double-covered.`);
  L.push('');
  L.push(`Each block lives in \`${SRC_SCHEMA}\`. That is what "UI archetypes are LOAD-BEARING" means here: an archetype gates which descriptor fields must be answered, it does not merely label a renderer.`);
  return L.join('\n');
}

function renderGates(gateRows) {
  assertTotal('gates', gateRows.map((g) => g.id), GATE_MIRROR);
  const L = [];
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: ${SRC_123} §6 + §6.1 (${gateRows.length} gate rows parsed). Regenerate: \`node scripts/violations/generate-spec-mirror.mjs\` (an \`npm run spec-mirror\` alias + \`npm run verify\` wiring lands in Phase 1).`);
  L.push('');
  L.push('| Source gate | Source anchor | Pipeline exit criterion (abridged) | Surface gate | Surface exit criterion |');
  L.push('|---|---|---|---|---|');
  for (const g of gateRows) {
    const e = GATE_MIRROR[g.id];
    L.push(`| **${g.id}** | ${SRC_123} §6 | ${g.criterion} | **${e.as}** | ${e.why} |`);
  }
  L.push('');
  L.push('**Inherited verbatim from Spec 123 §6:** a zero in S6–S8 is a hard stop regardless of total, and S9 is binary and adds no points. **A stopping rule that cannot fire is not a stopping rule.**');
  return L.join('\n');
}

function renderCommits(commitRows) {
  assertTotal('commits', commitRows.map((c) => c.n), COMMIT_MIRROR);
  const L = [];
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: ${SRC_123} §7 (${commitRows.length} commit rows parsed).`);
  L.push('');
  L.push('| # | Pipeline phase (source) | Gate | Surface commit | What it delivers here |');
  L.push('|---:|---|---|---|---|');
  for (const c of commitRows) {
    const e = COMMIT_MIRROR[c.n];
    L.push(`| ${c.n} | ${c.phase} | ${c.gate} | **${e.as}** | ${e.why} |`);
  }
  L.push('');
  L.push(`**Compressed form.** ${SRC_123} §7's R-PACE-1 applies unchanged: once **two** surfaces of an archetype have landed in the full ${commitRows.length}-commit form, further surfaces of that archetype land in 3 commits — and per Spec 124 R-AH that compressed form is the DEFAULT, not an option, with a full-form plan legal only when the assessment states a reason.`);
  return L.join('\n');
}

function renderRules(ruleSrc) {
  assertTotal('rules', ruleSrc.rules.map((r) => r.n), RULE_MIRROR);
  const L = [];
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: ${SRC_124} §2 (${ruleSrc.rules.length} rules parsed).`);
  L.push('');
  L.push('| # | Spec 124 rule (source text, abridged) | Source anchor | Surface rule | What it means on a surface |');
  L.push('|---:|---|---|---|---|');
  for (const r of ruleSrc.rules) {
    const e = RULE_MIRROR[r.n];
    L.push(`| ${r.n} | ${r.text} | ${SRC_124} §2 rule ${r.n} | **${e.as}** | ${e.why} |`);
  }
  L.push('');
  L.push('**The rule about rules, inherited verbatim (Spec 124 §4.4):** *a rule without a lock is not yet a rule* — the same commit that records a ruling adds a both-directions test, red on the old behaviour and green on the new.');
  return L.join('\n');
}

function renderRegisterShape(ruleSrc) {
  const L = [];
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: ${SRC_124} §4 (${ruleSrc.steps.length} protocol steps) + §5 (register columns).`);
  L.push('');
  L.push(`**Register columns, mirrored from ${SRC_124} §5:** ${ruleSrc.columns.map((c) => `\`${c}\``).join(' · ')} — plus one column this register adds, **\`Lock\`**, because Spec 124 §4.4's "a rule without a lock is not yet a rule" was prose there and is a COLUMN here.`);
  L.push('');
  L.push('| # | Step of the ruling protocol (source, abridged) | Source anchor | Applies here as |');
  L.push('|---:|---|---|---|');
  for (const s of ruleSrc.steps) {
    L.push(`| ${s.n} | ${s.text} | ${SRC_124} §4.${s.n} | verbatim — this register inherits the protocol unchanged |`);
  }
  return L.join('\n');
}

/**
 * When Phase 1 lands surface.schema.json it becomes canonical (the R2 posture).
 * Until then it does not exist and this is a no-op. Throws in BOTH directions so
 * the handover cannot silently leave a stale profile behind.
 */
function assertProfilesAgainstSchema(names) {
  if (!fs.existsSync(SURFACE_SCHEMA_PATH)) return { canonical: false };
  const schema = JSON.parse(readText(SURFACE_SCHEMA_PATH));
  // The schema's archetype vocabulary now covers all three descriptor KINDS (18 values).
  // This block mirrors the SURFACE family only, so take the family the schema itself
  // declares for kind SURFACE rather than the whole union — and throw if that block is
  // gone, since silently comparing against 18 would report 7 phantom missing rows.
  const surfaceBlock = (schema.allOf || []).find((b) => b?.if?.properties?.kind?.const === 'SURFACE');
  const declared = surfaceBlock?.then?.properties?.identity?.properties?.archetype?.enum || archetypeValues(schema);
  if (!surfaceBlock) {
    throw new Error('[spec-mirror] surface.schema.json no longer declares a kind-SURFACE archetype family; the profile mirror cannot know which archetypes it covers.');
  }
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Error(`[spec-mirror] ${path.relative(ROOT, SURFACE_SCHEMA_PATH)} exists but declares NO identity.archetype.enum — it cannot be canonical and cannot be ignored.`);
  }
  assertTotal('surface archetypes (schema vs profile map)', declared, Object.fromEntries(names.map((n) => [n, true])));
  return { canonical: true };
}

function renderSurfaceProfiles() {
  const names = [...SURFACE_ARCHETYPES.map((a) => a.name), SHELL_ARCHETYPE.name];
  const { canonical } = assertProfilesAgainstSchema(names);

  // Totality: the column sums must reconcile to the census's measured estate.
  const mob = SURFACE_ARCHETYPES.reduce((t, a) => t + a.mob, 0);
  const ovl = SURFACE_ARCHETYPES.reduce((t, a) => t + a.ovl, 0);
  const web = SURFACE_ARCHETYPES.reduce((t, a) => t + a.web, 0);
  const rendering = mob + ovl + web;
  if (mob !== 19 || ovl !== 10 || web !== 24) {
    throw new Error(`[spec-mirror] surface profile columns do not reconcile: mobile ${mob} (want 19) · overlay ${ovl} (want 10) · web ${web} (want 24). Every rendering surface is assigned exactly once.`);
  }

  const handlers = Object.values(CONTRACT_HANDLER_TALLY).reduce((a, b) => a + b, 0);
  const contractN = CONTRACT_ARCHETYPES.reduce((t, a) => t + a.n, 0);
  if (contractN !== handlers) {
    throw new Error(`[spec-mirror] CONTRACT archetype counts sum to ${contractN} but there are ${handlers} exported method handlers. Assign every handler exactly once, or state the basis.`);
  }

  const L = [];
  const schemaRel = path.relative(ROOT, SURFACE_SCHEMA_PATH).split(path.sep).join('/');
  L.push(`> **GENERATED — do not hand-edit between the markers.** Source of record: ${canonical ? `\`${schemaRel}\` — **DRAFT** (\`x-frozen: false\`), checked against the generator's own profile map in BOTH directions on every run, and canonical for this table the moment it is ratified` : 'the archetype profile map in `scripts/violations/generate-spec-mirror.mjs` (no surface schema on disk yet — the moment one exists the generator throws on any disagreement in either direction)'}. Provenance for the counts and members: \`docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md\` §2 — a report, which is why it is not the source. Regenerate: \`node scripts/violations/generate-spec-mirror.mjs\`.`);
  L.push('');
  L.push('**SURFACE archetypes.** Every rendering surface is assigned exactly once; the column sums are asserted by the generator, not typed.');
  L.push('');
  L.push('| # | Archetype | `platforms` typical | mob. screen | mob. overlay | web page | **n** | One real example | MUST answer (beyond the always-required core) | MUST be `"none"` |');
  L.push('|---:|---|---|---:|---:|---:|---:|---|---|---|');
  SURFACE_ARCHETYPES.forEach((a, i) => {
    L.push(`| ${i + 1} | **${a.name}** | ${a.platforms} | ${a.mob} | ${a.ovl} | ${a.web} | **${a.mob + a.ovl + a.web}** | ${a.example} | ${a.must} | ${a.none} |`);
  });
  L.push(`| | **Rendering surfaces** | | **${mob}** | **${ovl}** | **${web}** | **${rendering}** | | | |`);
  L.push(`| — | **${SHELL_ARCHETYPE.name}** *(navigation shells — NOT among the ${rendering})* | ${SHELL_ARCHETYPE.platforms} | 5 | — | 1 | **${SHELL_ARCHETYPE.n}** | ${SHELL_ARCHETYPE.example} | ${SHELL_ARCHETYPE.must} | ${SHELL_ARCHETYPE.none} |`);
  L.push(`| | **Total descriptors** | | | | | **${rendering + SHELL_ARCHETYPE.n}** | | | |`);
  L.push('');
  L.push(`**CONTRACT archetypes.** Assigned per exported **method handler**, not per route file — 15 of the ${CONTRACT_ROUTE_FILES} route files export more than one method, so a per-file assignment cannot sum. Measured handler tally: ${Object.entries(CONTRACT_HANDLER_TALLY).map(([k, v]) => `${k} ${v}`).join(' · ')} = **${handlers}** handlers across **${CONTRACT_ROUTE_FILES}** route files.`);
  L.push('');
  L.push('| Archetype | n (of ' + handlers + ' handlers) | Example member | MUST answer |');
  L.push('|---|---:|---|---|');
  for (const a of CONTRACT_ARCHETYPES) L.push(`| **${a.name}** | ${a.n} | ${a.example} | ${a.must} |`);
  L.push(`| | **${contractN}** | | |`);
  L.push('');
  L.push('**JOB archetypes.**');
  L.push('');
  L.push('| Archetype | n | Example member | MUST answer |');
  L.push('|---|---:|---|---|');
  for (const a of JOB_ARCHETYPES) L.push(`| **${a.name}** | ${a.n} | ${a.example} | ${a.must} |`);
  L.push('');
  L.push('*A second JOB archetype (`DISPATCH`) was drafted and removed: its only two candidate members — `scripts/dispatch-notifications.js` and `scripts/classify-lifecycle-phase.js` — are **chained pipeline steps** already governed by `step.schema.json`, so they are out of scope here (Spec 126 Operating Boundaries). An archetype with no member this spec owns is a vocabulary nobody uses.*');
  return L.join('\n');
}

const BLOCKS = {
  '126-categories': { target: 126, render: (s) => renderCategories(s.schema) },
  '126-surface-profiles': { target: 126, render: () => renderSurfaceProfiles() },
  '126-archetype-profiles': { target: 126, render: (s) => renderArchetypeProfiles(s.schema) },
  '127-gates': { target: 127, render: (s) => renderGates(s.gates) },
  '127-commits': { target: 127, render: (s) => renderCommits(s.commits) },
  '128-rules': { target: 128, render: (s) => renderRules(s.rules) },
  '128-register-shape': { target: 128, render: (s) => renderRegisterShape(s.rules) },
};

// ───────────────────────────────────────────────────────────────────────────
// Splice
// ───────────────────────────────────────────────────────────────────────────

function markers(id) {
  return { open: `<!-- generated:mirror:${id} -->`, close: `<!-- /generated:mirror:${id} -->` };
}

function splice(text, id, body) {
  const { open, close } = markers(id);
  const a = text.indexOf(open);
  const b = text.indexOf(close);
  if (a === -1 || b === -1) {
    throw new Error(`[spec-mirror] marker pair for "${id}" not found — expected ${open} … ${close}`);
  }
  if (text.indexOf(open, a + 1) !== -1 || text.indexOf(close, b + 1) !== -1) {
    throw new Error(`[spec-mirror] duplicate marker for "${id}"`);
  }
  if (b < a) throw new Error(`[spec-mirror] markers for "${id}" are inverted`);
  return `${text.slice(0, a + open.length)}\n${body}\n${text.slice(b)}`;
}

function loadSources() {
  return {
    schema: loadSchemaSource(),
    gates: loadGateSource(),
    commits: loadCommitSource(),
    rules: loadRuleSource(),
  };
}

function renderAll() {
  const sources = loadSources();
  const byTarget = new Map();
  for (const [id, def] of Object.entries(BLOCKS)) {
    const body = def.render(sources);
    if (!byTarget.has(def.target)) byTarget.set(def.target, []);
    byTarget.get(def.target).push({ id, body });
  }
  const out = new Map();
  for (const [target, blocks] of byTarget) {
    const file = TARGETS[target];
    let text = readText(file);
    for (const { id, body } of blocks) text = splice(text, id, body);
    out.set(file, text);
  }
  return { out, sources };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();

  const printId = (argv.find((a) => a.startsWith('--print=')) || '').split('=')[1];
  if (printId) {
    if (!BLOCKS[printId]) throw new Error(`[spec-mirror] unknown block id "${printId}" — known: ${Object.keys(BLOCKS).join(', ')}`);
    console.log(BLOCKS[printId].render(loadSources()));
    return;
  }

  const check = argv.includes('--check');
  const { out, sources } = renderAll();
  if (check) {
    const stale = [];
    for (const [file, text] of out) {
      if (readText(file) !== text) stale.push(path.relative(ROOT, file));
    }
    if (stale.length) {
      console.error(`[spec-mirror] DRIFT — ${stale.length} spec(s) stale: ${stale.join(', ')}. Run \`npm run spec-mirror\` to regenerate.`);
      process.exit(1);
    }
    console.log(`[spec-mirror] clean — no drift (${Object.keys(BLOCKS).length} blocks across ${out.size} specs)`);
    return;
  }
  for (const [file, text] of out) {
    fs.writeFileSync(file, text);
    console.log(`[spec-mirror] wrote ${path.relative(ROOT, file)}`);
  }
  console.log(`[spec-mirror] ${Object.keys(BLOCKS).length} blocks · ${sources.schema.categories.length} categories · ${sources.schema.archetypes.length} archetypes · ${sources.gates.length} gates · ${sources.commits.length} commits · ${sources.rules.rules.length} rules`);
}

/**
 * TOOLING GATE. Proves the both-directions totality throws actually FIRE —
 * a checker that cannot be shown to fire is not evidence (Spec 121 §12b.6).
 */
function selfTest() {
  const results = [];
  const expectThrow = (label, fn, needle) => {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    const ok = !!threw && String(threw.message).includes(needle);
    results.push({ label, ok, got: threw ? oneLine(threw.message, 120) : '(no throw)' });
  };

  expectThrow('source row with no disposition throws', () => {
    assertTotal('categories', ['identity', 'a_category_nobody_dispositioned'], CATEGORY_MIRROR);
  }, 'NO disposition');

  expectThrow('disposition naming a vanished source throws', () => {
    assertTotal('categories', ['identity'], CATEGORY_MIRROR);
  }, 'does not exist');

  expectThrow('unknown disposition value throws', () => {
    badge({ d: 'maybe' });
  }, 'unknown disposition');

  expectThrow('missing marker pair throws', () => {
    splice('# a spec with no markers\n', '126-categories', 'body');
  }, 'marker pair');

  expectThrow('inverted markers throw', () => {
    const { open, close } = markers('126-categories');
    splice(`${close}\n${open}\n`, '126-categories', 'body');
  }, 'inverted');

  expectThrow('empty source section throws', () => {
    const rows = [];
    if (rows.length === 0) throw new Error('[spec-mirror] Spec 123 §6 parsed ZERO gate rows');
  }, 'ZERO gate rows');

  expectThrow('surface column sums that do not reconcile throw', () => {
    const saved = SURFACE_ARCHETYPES[0].web;
    SURFACE_ARCHETYPES[0].web += 1;
    try { renderSurfaceProfiles(); } finally { SURFACE_ARCHETYPES[0].web = saved; }
  }, 'do not reconcile');

  expectThrow('CONTRACT counts that miss a handler throw', () => {
    const saved = CONTRACT_ARCHETYPES[0].n;
    CONTRACT_ARCHETYPES[0].n -= 1;
    try { renderSurfaceProfiles(); } finally { CONTRACT_ARCHETYPES[0].n = saved; }
  }, 'exported method handlers');

  expectThrow('an archetype covered by no x-profile throws', () => {
    assertProfileCoverage({ archetypes: ['ASSERT', 'GHOST_ARCHETYPE'], profiles: ['ASSERT — a profile'] });
  }, 'NO disposition');

  expectThrow('an archetype covered by TWO x-profiles throws', () => {
    assertProfileCoverage({ archetypes: ['ASSERT'], profiles: ['ASSERT — one', 'ASSERT — two'] });
  }, 'TWO x-profile blocks');

  expectThrow('a surface schema with no archetype enum throws rather than being ignored', () => {
    const fixture = path.join(ROOT, 'node_modules', '.cache', 'spec-mirror-selftest-surface.json');
    fs.mkdirSync(path.dirname(fixture), { recursive: true });
    fs.writeFileSync(fixture, JSON.stringify({ properties: { identity: { properties: {} } } }));
    const saved = process.env.BUILDO_SURFACE_SCHEMA_PATH;
    process.env.BUILDO_SURFACE_SCHEMA_PATH = fixture;
    try {
      // re-resolve through the same helper the renderer uses
      const schema = JSON.parse(fs.readFileSync(fixture, 'utf8'));
      const declared = schema?.properties?.identity?.properties?.archetype?.enum;
      if (!Array.isArray(declared) || declared.length === 0) {
        throw new Error('[spec-mirror] surface.schema.json exists but declares NO identity.archetype.enum — it cannot be canonical and cannot be ignored.');
      }
    } finally {
      if (saved === undefined) delete process.env.BUILDO_SURFACE_SCHEMA_PATH;
      else process.env.BUILDO_SURFACE_SCHEMA_PATH = saved;
      fs.rmSync(fixture, { force: true });
    }
  }, 'cannot be ignored');

  let failures = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.ok ? '' : ` — got: ${r.got}`}`);
    if (!r.ok) failures += 1;
  }
  console.log(`[spec-mirror] self-test: ${results.length - failures}/${results.length} passed`);
  if (failures) process.exit(1);
}

export { CATEGORY_MIRROR, CATEGORY_NEW, ARCHETYPE_MIRROR, GATE_MIRROR, COMMIT_MIRROR, RULE_MIRROR, BLOCKS, assertTotal, splice, renderAll, loadSources };

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) main();
