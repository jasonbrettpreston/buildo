// GENERATED FROM scripts/surfaces/_schema/surface.schema.json — DO NOT EDIT.
// Regenerate: node scripts/violations/generate-surface-registry.mjs --emit-descriptors
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §5 (the one-source rule:
//   schema -> descriptor -> { types, validator, migration assertions, contracts, projections, registry, seed }).
// There is no second hand-written type for a descriptor. If this file is wrong, the SCHEMA is wrong.

/** The literal a draft descriptor carries where a field is `x-draft-optional` and nobody has researched it yet. */
export type Unresearched = 'UNRESEARCHED';

/** One SURFACE, CONTRACT or JOB descriptor. */
export type SurfaceDescriptor = {
  identity: {
  id: string;
  route?: string;
  /** LOAD-BEARING (R-02): selects the allOf required-field profile. Not a renderer label. */
  archetype: "LIST" | "DETAIL" | "REPORT" | "SEARCH" | "FORM" | "WIZARD_STEP" | "DASHBOARD" | "GATE" | "SLOT" | "STATIC" | "SHELL" | "QUERY" | "MUTATION" | "WEBHOOK" | "COMMAND" | "EXPORT" | "TRANSLATION" | "SCHEDULED";
  platforms: Array<"web" | "mobile" | "pdf">;
  owns: {
  /** R-13: the component files this surface and ONLY this surface renders. Totality both directions — every file in src/components/** and mobile/src/components/** appears exactly once. An independently routable or independently gated component i */
  components: Array<string>;
};
  owner: string;
  /** The governing spec path, or UNRESEARCHED. */
  spec: string;
  /** Spec section anchors this row is grounded in, e.g. `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2`. */
  spec_refs?: Array<string>;
  spec_version: string;
  versioning: {
  answer: "UNRESEARCHED" | "additive_only" | "breaking_allowed" | "frozen" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
};
  /** The stable short handle a human uses in conversation and in the legend — S-001 for a surface, C-001 for a contract, J-001 for a job. `identity.id` stays the readable slug because it is load-bearing across filenames, cross-references and the */
  ref: string;
};
  inputs: {
  answer: "UNRESEARCHED" | "contract" | "app_outputs" | "device" | "props" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  /** Ids or route paths into the CONTRACT registry. NEVER an inline schema. An entry may point at a contract whose own `status` is `designed`; the registry renders that edge DASHED rather than refusing it, so a surface can declare the contract i */
  contract_ref?: Array<string>;
  query_key?: Array<string>;
  field_whitelist?: "UNRESEARCHED" | Array<string>;
  /** Full lineage for every table reached, including the producing pipeline step. */
  tables?: Array<{
  table: string;
  columns: "UNRESEARCHED" | "all" | Array<string>;
  producing_steps: "UNRESEARCHED" | "none" | Array<string>;
  chain_position?: "UNRESEARCHED" | "n/a" | string;
  /** The spec that owns this table, or UNRESEARCHED. */
  owner_spec?: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: Array<string>;
}>;
};
  outputs: {
  answer: "UNRESEARCHED" | "none" | "contract_only" | "optimistic_then_contract" | "device_only" | "direct_db";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  contract_ref?: Array<string>;
  rollback?: string;
  invalidates?: Array<string>;
  tables?: Array<{
  table: string;
  columns: "UNRESEARCHED" | "all" | Array<string>;
  producing_steps: "UNRESEARCHED" | "none" | Array<string>;
  chain_position?: "UNRESEARCHED" | "n/a" | string;
  /** The spec that owns this table, or UNRESEARCHED. */
  owner_spec?: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: Array<string>;
}>;
};
  state: {
  answer: "UNRESEARCHED" | "server_only" | "query_cache" | "zustand" | "mmkv" | "securestore" | "shared_value" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  /** Spec 99 §3's normative matrix as data — one row per field. */
  fields?: Array<{
  name: string;
  owner_layer: "1_server" | "2_query_cache" | "3_zustand" | "4a_mmkv" | "4b_securestore" | "5_shared_value";
  canonical_writer: string;
  authorized_readers: Array<string>;
  bridge: "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "none";
  persistence: "mmkv" | "securestore" | "none";
  signout_reset: boolean;
}>;
};
  staleness: {
  answer: "UNRESEARCHED" | "live" | "query_cache" | "snapshot" | "static" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  stale_time_ms?: number;
  gc_time_ms?: number;
  /** For `snapshot`: the step slug whose run defines freshness. */
  producing_step?: string;
  offline?: "UNRESEARCHED" | "cached_projection" | "degraded" | "blocked" | "none";
};
  guards: {
  session: {
  answer: "UNRESEARCHED" | "anon" | "authenticated" | "entitled" | "admin" | "role" | "system";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
};
  rls_class: {
  answer: "UNRESEARCHED" | "A" | "B" | "C" | "D" | "none" | "E" | "system";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
};
  disclosure?: "UNRESEARCHED" | "none" | {
  fields: Array<string>;
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
};
  entitlement: "UNRESEARCHED" | "none" | {
  product: "lead_gen" | "flight_center" | "parcel_tool" | "agent_reports";
  statuses: Array<"trial" | "active" | "past_due" | "expired" | "cancelled_pending_deletion" | "admin_managed">;
  on_missing: "402" | "403" | "paywall";
};
  flag: "UNRESEARCHED" | "none" | string;
  permission: "UNRESEARCHED" | "location" | "notification" | "none";
  rate_bucket: "UNRESEARCHED" | "none" | string;
  role_name?: "UNRESEARCHED" | string;
  statuses_handled?: "UNRESEARCHED" | Array<string>;
};
  render: {
  targets: "none" | Array<"screen" | "pdf" | "csv" | "email">;
  projection: "UNRESEARCHED" | "list" | "map" | "grid" | "detail" | "none";
  breakpoints: "UNRESEARCHED" | "desktop_first_md" | "mobile_first" | "none";
  export: "UNRESEARCHED" | "pdf" | "csv" | "none";
  list?: "UNRESEARCHED" | {
  item_archetype: "UNRESEARCHED" | string;
  pagination: "UNRESEARCHED" | "cursor" | "offset" | "none";
  recycling: "UNRESEARCHED" | string;
};
  tiles?: "UNRESEARCHED" | Array<{
  id: string;
  contract_ref: string;
  degrade_independently: boolean;
}>;
  refresh?: "UNRESEARCHED" | {
  poll_ms: "UNRESEARCHED" | number;
};
  wizard?: "UNRESEARCHED" | {
  step_index: "UNRESEARCHED" | number;
  advances_on: "UNRESEARCHED" | string;
  resume_key: "UNRESEARCHED" | string;
  skip_when: "UNRESEARCHED" | string;
  terminal: "UNRESEARCHED" | boolean;
};
  redirect?: "UNRESEARCHED" | string;
  routing?: "UNRESEARCHED" | {
  branches: "UNRESEARCHED" | Array<string>;
};
};
  /** THE ONE CATEGORY THAT MAY NEVER BE "none" (Spec 128 rule 5). */
  checks: Array<{
  id: string;
  kind: "contract_parse" | "query_key_hygiene" | "empty_state" | "error_state" | "offline_state" | "touch_target" | "a11y_label" | "selector_atomicity" | "field_whitelist_parity" | "auth_class_parity" | "disclosure" | "ledger_row_present" | "render_target_parity" | "schema_declared" | "components_owned" | "freshness";
  severity: "FAIL" | "WARN" | "INFO";
  /** ORTHOGONAL to severity. blocking:true forces when:"pre" — a pre-render gate rather than a post-render assertion. */
  blocking: boolean;
  when?: "pre" | "post";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
}>;
  invariants: "UNRESEARCHED" | "none" | Array<{
  id: string;
  /** Declarative SQL. This is why ad/layout policy can never live here (R-34) — a layout rule has no SQL expression. */
  sql: string;
  severity: "FAIL" | "WARN" | "INFO";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  duration_ms?: {
  ceiling: number;
  /** Spec 128 rule B3: stated against production scale and production heap state, never a local single sample. */
  measured_against: string;
};
}>;
  /** Declarative SQL only. Ad/layout policy is a checks[] entry and the placements table, never here (R-34). */
  plausibility: "UNRESEARCHED" | "none" | Array<{
  id: string;
  /** Declarative SQL. This is why ad/layout policy can never live here (R-34) — a layout rule has no SQL expression. */
  sql: string;
  severity: "FAIL" | "WARN" | "INFO";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  duration_ms?: {
  ceiling: number;
  /** Spec 128 rule B3: stated against production scale and production heap state, never a local single sample. */
  measured_against: string;
};
}>;
  states: "UNRESEARCHED" | Array<{
  name: "loading" | "empty" | "hit" | "miss" | "ambiguous" | "partial" | "degraded" | "error" | "offline" | "schema_drift" | "unauthorized" | "rate_limited" | "redirect" | "static";
  golden: "UNRESEARCHED" | "none" | string;
}>;
  errors: {
  answer: "UNRESEARCHED" | "envelope" | "redirect" | "toast" | "inline" | "boundary" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  classes?: Array<{
  class: "400" | "401" | "403" | "429" | "500" | "schema_drift" | "offline" | "404";
  ui: string;
}>;
  no_retry?: Array<string>;
};
  emits: {
  answer: "UNRESEARCHED" | "events" | "ledger" | "both" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  analytics?: Array<string>;
  ledger_events?: Array<"property_view" | "pdf_send" | "offer_impression" | "offer_click" | "export" | "parcel_id_translated">;
  breadcrumbs?: Array<string>;
};
  offers: {
  answer: "UNRESEARCHED" | "slots" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  placement?: string;
  /** A TABLE name, never a literal list. */
  inventory_source?: string;
  targeting?: Array<"neighbourhood" | "zone" | "work_type" | "cost_band">;
  /** R-17/R-34, ruled by the operator 2026-09-15. FAIL and blocking are SEPARATE fields because they are orthogonal; blocking true forces when:"pre". Legal basis: Competition Act s.74.01 and the Competition Bureau native-advertising guidance; FT */
  disclosure?: {
  check_id: string;
  severity: "FAIL";
  blocking: unknown;
};
  null_when_off?: unknown;
  max_slots?: number;
};
  metering: {
  answer: "UNRESEARCHED" | "metered" | "observed" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  unit?: string;
  product?: "lead_gen" | "flight_center" | "parcel_tool" | "agent_reports";
  ledger_event?: string;
  subject_kind?: "parcel_ref" | "parcel_pk" | "permit_rev" | "offer_id";
  quota_from_config?: string;
  on_exceeded?: "402" | "403" | "paywall";
};
  config: {
  answer: "UNRESEARCHED" | "logic_variables" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  logic_variables?: Array<{
  name: string;
  min?: number;
  max?: number;
  on_invalid: "fail" | "default" | "clamp";
  why?: string;
}>;
  retired?: Array<string>;
  debounce_ms?: "UNRESEARCHED" | number;
  min_query_len?: "UNRESEARCHED" | number;
};
  sharing: {
  answer: "UNRESEARCHED" | "sole" | "shared" | "none";
  /** One line saying WHY this answer, in the author's own words. Required on every answer that is not self-evident, and always required on "none". */
  why: string;
  /** Citations for this answer: `path:line`, `migrations/NNN_x.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED, whatever it says. */
  evidence: "UNRESEARCHED" | Array<string>;
  surfaces?: Array<string>;
  varies_by_surface?: string;
  varies_by_target?: string;
};
  a11y: {
  /** The smallest interactive target, in px. The floor is 44 (WCAG 2.5.5 / the platform HIGs). `n/a` is legal for a CONTRACT, a JOB, and a desktop-only admin page — and REQUIRES a why, because "nothing here is tapped" is a claim. */
  touch_target_min_px: "UNRESEARCHED" | "n/a" | number;
  labels: "UNRESEARCHED" | "complete" | "partial" | "none";
  dark_mode: "UNRESEARCHED" | "tokens" | "hardcoded" | "none";
  reduced_motion: "UNRESEARCHED" | "honoured" | "ignored" | "none";
  i18n: "UNRESEARCHED" | "none" | "locale_aware" | "translated";
  safe_area?: "UNRESEARCHED" | "none" | Array<"top" | "bottom" | "left" | "right">;
  touch_target_why?: "UNRESEARCHED" | string;
};
  deviations: "UNRESEARCHED" | "none" | Array<{
  from: string;
  why: string;
  adjudicated_by: string;
  date: string;
}>;
  limitations: "UNRESEARCHED" | "none" | Array<{
  what: string;
  measured: string;
  check_id: string;
}>;
  interpretation: "UNRESEARCHED" | "none" | {
  notes_file: string;
  cap?: unknown;
};
  kind: "SURFACE" | "CONTRACT" | "JOB";
  status: "exists" | "new" | "generated" | "designed";
  /** The human half of the descriptor. It is part of the contract, not a comment on it: a descriptor nobody can read is a descriptor nobody reviews. */
  docs: {
  /** What it does, for whom, in language a non-engineer reads. */
  purpose: string;
  /** What it reads and writes, and why. */
  data_story: string;
  /** What changes under this standard: RE-PROJECT / REBUILD / NEW / LEAVE ALONE, which archetype renderer, which contracts. */
  under_126: string;
};
  /** Citations for the claims this descriptor makes. `path:line`, `migrations/NNN.sql:line`, or a spec §anchor. A claim with no citation is UNRESEARCHED whatever it says. */
  evidence: {
  files: "UNRESEARCHED" | Array<string>;
  contracts: "UNRESEARCHED" | Array<string>;
  tables: "UNRESEARCHED" | Array<string>;
  gate: "UNRESEARCHED" | Array<string>;
  states: "UNRESEARCHED" | Array<string>;
  emits: "UNRESEARCHED" | Array<string>;
};
  /** Anything measured that a reviewer should know — a defect, a stub, a disagreement between a document and the tree. */
  notes?: string;
  /** DRAFT-ONLY carrier for measured facts that have not yet been folded into a category (raw file list, line counts, the shard a row came from). Retired with the shards; nothing downstream may read it. */
  "x-draft"?: Record<string, unknown>;
  /** WHICH PROGRAMME this entry belongs to. Without it the registry is an undifferentiated list of 137 things and a reader cannot tell the parcel cost tool from the lead-gen estate it happens to share a repository with. */
  programme: {
  scope: "parcel_product" | "parcel_admin" | "platform_shared" | "estate_other";
  phase: "UNRESEARCHED" | "not_scheduled" | string;
  /** True on exactly ONE surface — the property preview, the pilot of the whole programme (Spec 126 §11). */
  pilot?: boolean;
  /** One line saying why this scope, measured: the screen path, the product key, the entitlement, or the Spec 100 §1 fence. */
  why: string;
  /** The FEATURE MODULE this belongs to. Spec 125 §2's recommendation, made mechanical: descriptors are grouped by feature so a feature is a unit of REMOVAL — deleting it deletes a known set of surfaces, contracts and tables, and the registry sa */
  feature: "F01" | "F02" | "F03" | "F04" | "F05" | "F06" | "F07" | "F08" | "F09" | "F10" | "F11" | "F12" | "F13" | "F14" | "F15" | "F16" | "F90" | "F91" | "F92" | "F93";
  /** DERIVED, not chosen: scope rank (A<B<C<D) × 1000 + feature rank × 10 + kind rank, where kind rank orders tables-before-contracts-before-surfaces-before-admin. It answers "what must exist before this can be built", and it is the order the re */
  build_order: number;
  /** Behaviour inside this row that belongs to the OTHER product and merely lives here today. Recorded, NEVER deleted: a behaviour nobody wrote down is a behaviour nobody can knowingly retire (Spec 124 §4, the Chesterton's-Fence rule). */
  leakage?: "none" | "UNRESEARCHED" | Array<{
  behaviour: string;
  evidence: Array<string>;
  owning_product: "lead_gen" | "flight_center" | "platform";
  disposition: "move-to-owner" | "duplicate-locally" | "keep-and-declare" | "needs-ruling";
}>;
  /** Where the MEASURED behaviour contradicts what a MaxBLD user would reasonably expect. Not a defect (the code may match its spec exactly) and not a proposal — a question for the operator, with the evidence attached. */
  product_questions?: "none" | "UNRESEARCHED" | Array<{
  question: string;
  measured: string;
  evidence: Array<string>;
  spec_says?: string;
}>;
  /** The fine-tooth-comb pass. Every A/B/C row gets a review card in docs/reports/generated/127-surface-review-queue.md, rendered in build order. */
  review: {
  status: "unreviewed" | "reviewed" | "needs_change";
  reviewer?: string;
  date?: string;
  notes?: string;
};
};
};

export type Archetype = "LIST" | "DETAIL" | "REPORT" | "SEARCH" | "FORM" | "WIZARD_STEP" | "DASHBOARD" | "GATE" | "SLOT" | "STATIC" | "SHELL" | "QUERY" | "MUTATION" | "WEBHOOK" | "COMMAND" | "EXPORT" | "TRANSLATION" | "SCHEDULED";
export type DescriptorKind = "SURFACE" | "CONTRACT" | "JOB";
export type DescriptorStatus = "exists" | "new" | "generated" | "designed";
export const CATEGORIES = ["identity","inputs","outputs","state","staleness","guards","render","checks","invariants","plausibility","states","errors","emits","offers","metering","config","sharing","a11y","deviations","limitations","interpretation"] as const;
export type Category = (typeof CATEGORIES)[number];
