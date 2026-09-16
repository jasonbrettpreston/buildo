# Spec 125 — Schema-Driven Metadata UI Engine (admin + web)

> **Status: SUPERSEDED (2026-09-15) by Specs 126 / 127 / 128.**
>
> ⚠️ **AMENDMENT 2026-09-15 (WF1 "Spec 126/127/128 surface standard") — additive, nothing below is rewritten.** This document is retained as the origin record of the schema-driven-UI idea and as the provenance for §0's review notes. It is **no longer the spec to implement**, and §1–§13's mechanisms must not be planned from directly.
>
> | Where it goes | Spec |
> |---|---|
> | The contract — units, archetypes, the 20-category mirror, the seven arrows, the Supabase build-out, the usage ledger | **`docs/specs/02-web-admin/126_maxbld_surface_standard.md`** |
> | The procedure — assessment, gates, the commit form, batching, the review panel | **`docs/specs/02-web-admin/127_surface_conversion_procedure.md`** |
> | The policy — the rule set, the ruling register, the open asks | **`docs/specs/02-web-admin/128_surface_standard_policy.md`** |
>
> **What was carried over and what was DROPPED is enumerated in Spec 126 §0.1/§0.2**, each drop with its measured reason, rather than abandoned silently. The twelve drops in summary: the "18 categories" count (the schema requires **20**) · FlutterFlow (the client is Expo/React Native) · *"the database record **is** the specification"* (git is the source, Supabase holds a projection) · generating migrations from descriptors (`db:generate` is `drizzle-kit introspect` — the arrow already runs DB→TS) · the `FORM_INPUT`/`DATA_GRID` placeholder archetypes · the name `StepEngine` (→ `SurfaceEngine`; "step" stays the pipeline's unit) · the single `/workflow/[stepId]` dynamic route · the React Flow node-graph (deferred) · `dependency-cruiser` · `supagen` · §7 as engine scope (split into a product spec) · and *"treat the engine as a one-time core infrastructure build"* as a risk mitigation.
>
> **One finding §0 did not carry, added here because it invalidates a §1 mechanism:** **React Native has no Server Components.** §1's "Server-Side Rendering … Next.js Server Components" is true on web and **false on mobile**; the mobile half is a *fetched projection* plus build-time generation. See Spec 126 §5.3.
>
> *(Original status line, retained verbatim:)* **Status: Draft** — operator-supplied blueprint, filed 2026-09-14 as the NEXT programme after the Spec 122 step conversion completes (see `.cursor/active_task.md`). Not authorized for implementation; a WF1 plan with PLAN LOCKED gates it. §0 (review notes) is grounded against the repo as of `fcdc58ba`; §1–§13 are the operator's document verbatim.

## 0. Review notes (orchestrator, 2026-09-14 — measured, not inferred)

**Fit with what exists.** The blueprint is the frontend half of the Spec 122 idea (*every step is the same step except its compute; the descriptor is the contract*), and the repo already has one working instance of it: `src/features/admin-controls/generated/logic-variable-groups.json` is generated from the step descriptors' `config.logic_variables` by `scripts/generate-logic-variable-groups.mjs`, consumed by `GlobalConfigCard.tsx`, and drift-locked by `src/tests/logic-variable-groups.infra.test.ts`. That is a metadata-driven admin surface in miniature and the pattern to generalise.

**Corrections to carry into the plan (the document says 18 categories throughout):**
1. **20 categories, not 18.** `scripts/steps/_schema/step.schema.json` requires 20 top-level sections (`x-categories`, re-measured 2026-09-14); the "18" was a stale count already corrected in Spec 122 §1.3 and in programme item STD-1. Every "18-category" reference below reads as 20.
2. **Git stays the source of truth; Supabase holds a projection.** §6 proposes "the database record *is* the specification". Today the descriptors are files (`scripts/**/*.descriptor.json`) validated by AJV, drift-locked by the pre-commit hook, fingerprinted into golden captures, and reviewed in diffs. Moving the source into a table would lose all of that. Recommended shape: a `step_descriptors` table seeded from git on deploy (the same mechanism as `scripts/seeds/logic_variables.json` → `logic_variables`), with a drift check that the table equals the committed files. The admin engine reads the table; nobody edits it by hand.
3. **Archetype vocabulary is already fixed.** The registry keys must be the schema-canonical step archetypes (ASSERT, RECORDER, ENRICHER, LINK, INGESTOR, MATCHER, MATERIALIZER, BACKFILL …) plus UI-only archetypes for pages that are not steps (REPORT, AD_SLOT). Do not invent a second vocabulary (`FORM_INPUT`/`DATA_GRID` in §12 are placeholders).
4. **Mobile is Expo/React Native (Spec 90), not FlutterFlow.** §6 Phase 3 reads as "a matching RN archetype registry consuming the same descriptors".
5. **Validation rules come from `checks[]`/`invariants[]`/`plausibility[]` + `config.logic_variables[].min/max`,** which are already declared per step; the Zod resolver in §5 Rule 4 is a projection of those, never a second declaration.
6. **The cross-step ledger visualiser (§4) already has its data:** `inputs.reads.steps[].version_pin` per descriptor + `pipeline_runs`; the Step Registry (POST-B1-12) is the in-repo generator to extend with a React Flow graph rather than a new reader.
7. **§7 (address lookup, ad slots, PDF export, subscriptions, `app_outputs`) is product scope,** not engine scope. It becomes its own spec after the engine exists, per CLAUDE.md WF1; keeping it inside this spec would make the engine plan un-lockable.
8. **Guardrails that map 1:1 onto existing repo mechanisms:** `eslint-plugin-boundaries` ↔ the existing ESLint gates in the hook; contract tests against live descriptors ↔ `step-conformance.infra.test.ts`; Sentry telemetry ↔ Spec 48 §3.6 observability rows (the admin side has none today — a real gap).

**Where it lands in the programme.** After batch conversion (C4→C6 in `docs/reports/generated/122-conversion-roadmap.md`) and the BEFORE-B2 rows of `.cursor/wf1_post_batch1_followups_active_task.md`. Prerequisite decisions for the WF1 plan: the seeded-projection ruling (item 2), the archetype vocabulary ruling (item 3), and which admin surfaces convert first (the data-quality dashboard's engine-health view is the obvious first, since POST-B1-2 already requires it to read the pipeline's declared write).

---

## 1. Core Architecture Principles
UI as a Projection: Frontend pages contain zero hard-coded business logic or bespoke forms. They act as generic rendering containers that project backend step descriptors into UI blocks.
Archetype Registry: A centralized mapping of database step archetypes to pre-built, isolated Shadcn UI components.
Server-Side Rendering (SSR): Heavy lifting (parsing descriptors, mapping archetypes, resolving validation rules) happens on the server using Next.js Server Components to maintain optimal performance.

## 2. Best-in-Class Design Rules for Metadata UIs
Strict Schema Immutability: Treat the database step descriptor as read-only on the client side. The frontend never mutates descriptor rules locally; it only submits user state matching the remote contract.
Decoupled Renderer vs. Data Hooks: The engine component handles layout projection, while dedicated atomic hooks handle local state submission and server action bindings.
Fail-Safe Fallbacks: If an unknown or legacy archetype key is received from the database, the engine must gracefully render a generic fallback card instead of throwing a hard client-side crash.
Contract Versioning: Include a schema_version property in every descriptor to gracefully handle backward compatibility if your 18-category data points evolve over time.

## 3. Advanced Error Reduction & Reliability Engineering
End-to-End Type Safety via Code Generation: Use tools like supagen or Supabase's native TypeScript type generation combined with runtime Zod parsing to guarantee that the database descriptor types match frontend expectations precisely at build time.
Strict Linting and Architecture Boundaries: Integrate eslint-plugin-boundaries into your CI/CD pipeline to physically prevent UI components from bypassing the engine registry or querying Supabase directly.
Client-Side Error Boundaries: Wrap the StepEngine in React Error Boundaries (`react-error-boundary`) so that if a corrupted step descriptor or unexpected payload causes a render failure, it is safely isolated without crashing the entire application shell.
Automated Contract Testing: Implement automated integration tests (using Playwright or Vitest) that fetch live step descriptors from staging databases and verify that every registered archetype can successfully render its mock payload without throwing runtime exceptions.
Centralized Telemetry & Sentry Tracing: Instrument the metadata rendering pipeline to capture invalid archetype keys, parsing exceptions, or validation mismatches instantly in Sentry, providing immediate visibility into backend-frontend contract breaks.

## 4. Visualizing the Pipeline, 18 Categories, and Cross-Step Ledger
To inspect the unified system in its totality, the architecture incorporates visualization layers:
React Flow Admin Visualizer: An internal inspector node-graph that reads live Supabase step configurations, maps the 18 categories, and displays the cross-step ledger dependencies as interactive edges.
Code Architecture Mapping: Automated dependency graphs using dependency-cruiser to verify that UI components remain isolated from direct data mutations.

```ts
// Example React Flow node mapper structure for the Step Pipeline
export function mapStepsToNodes(steps: StepDescriptor[]) {
  return steps.map((step, index) => ({
    id: step.id,
    type: 'default',
    data: { label: `Step ${index + 1}: ${step.archetype}` },
    position: { x: index * 250, y: 100 },
  }));
}
```

## 5. AI Decision-Making Policy for Standardization & Step Building
When an AI coding assistant or autonomous agent builds, modifies, or extends steps and categories within this architecture, it must strictly adhere to the following decision policy:
Rule 1: Zero Bespoke UI Code (No Hard-Coding). The AI is explicitly forbidden from creating custom page files, hard-coded form layouts, or bespoke UI components for individual workflow steps. All UI outputs must map to an existing entry in the archetypeRegistry.
Rule 2: Descriptor-First Modification. If a new feature, input field, or data category is required, the AI must modify the database schema definition or step descriptor metadata payload *before* touching any frontend code.
Rule 3: Enforce the 18-Category Contract. Any generated step payload must structurally account for the standardized 18-category descriptors and cross-step ledger bindings. Omitting categories without a explicit version migration flag violates the build contract.
Rule 4: Automated Validation Inheritance. The AI must never write manual, inline client-side validation logic. Validation rules must be declared within the step descriptor schema and parsed dynamically via runtime Zod resolvers.
Rule 5: Fail-Safe & Fallback Compliance. Any newly added archetype must include a corresponding TypeScript type definition, fallback rendering state, and unit test verifying that malformed payloads fail gracefully without crashing the engine.

## 6. Phased Build Order & Spec-to-Schema Transition
To scale this architecture efficiently across both web and mobile clients while transitioning from traditional unstructured prose to machine-readable rules, execution follows a strict pattern:
The Spec-to-Schema Mechanics: Unstructured prose documents are replaced entirely by machine-readable JSON descriptors stored directly in Supabase. The database record *is* the specification. The dynamic route fetches this descriptor, the StepEngine parses and hydrates runtime Zod validation rules, and the UI projects it instantly without custom component files.
Phase 1: Database & Contract Foundation: Finalize Supabase tables for step descriptors, the 18 categories, and cross-step ledgers using structured JSON descriptor templates.
Phase 2: Core Web Engine & Registry: Implement the universal StepEngine, archetypeRegistry, and single dynamic route (`/workflow/[stepId]/page.tsx`) in Next.js on Vercel.
Phase 3: Multi-Platform Mobile Scaling: Extend the architecture to companion mobile apps (via FlutterFlow or React Native) by implementing a matching mobile archetype registry consuming the exact same JSON descriptors.
Phase 4: Guardrails & Visualization: Deploy eslint-plugin-boundaries and the React Flow admin visualizer to guarantee architectural compliance.

## 7. Prop-Tech Application Features, Commercial Layer, & Admin Operations
To support real estate address lookups, reports, monetization, agent exports, and unified administrative control using the shared app_outputs table and metadata engine:
Address Lookup & Report View: A streamlined search workflow querying the materialized app_outputs table and projecting results via a universal Report Archetype.
Advertiser Layer (Ad Slots): Dynamic ad units governed by regional metadata rules and rendered via an AD_SLOT archetype without disrupting clean component boundaries.
Agent PDF Export: Server-side PDF generation via Next.js Server Actions that query the exact same app_outputs record to ensure 100% data parity between the web view and exported documents.
Subscription & Usage Limits: Secure server-side validation gating report access by comparing user request counters (user_usage) against active Supabase subscription tiers.
Unified Admin Operations: Leveraging the same app_outputs and step descriptor tables, the admin portal utilizes role-based Supabase RLS policies to inspect live user pipelines, monitor usage metrics, trigger manual or automated pipeline re-computes, manage active advertiser slots, and review the React Flow cross-step ledger visualization.

## 8. Downsides, Trade-offs, & Risk Mitigation
High Upfront Complexity: Building a universal rendering engine and Zod parser requires greater initial engineering investment than hard-coding individual React pages. Mitigation: Treat the engine as a one-time core infrastructure build.
Single Point of Failure: An unhandled bug in the core engine can impact all workflow steps simultaneously. Mitigation: Strict automated contract testing and isolated React Error Boundaries.
Rigidity Friction: Highly bespoke UI requirements that fall outside standard archetypes can feel awkward to shoehorn. Mitigation: Define extensible configuration schemas or generic raw HTML/Markdown block archetypes for edge cases.
Steeper Onboarding Curve: Developers and AI agents must understand the metadata schema and registry pattern rather than reading standard component trees. Mitigation: Maintain this comprehensive architecture document as the single source of truth.

## 9. Real-World Project References & Industry Patterns
This architectural model is widely used in high-complexity enterprise and open-source tooling:
Salesforce Lightning Platform: The pioneer of metadata-driven UI rendering, where page layouts, fields, and actions are rendered dynamically from backend metadata objects rather than hard-coded templates.
Meshery UI (Layer5): Utilizes a strict schema-driven approach where JSON schemas and OpenAPI definitions auto-generate frontend types and dynamic form widgets without manual component rewriting.
ObjectStack / ObjectUI: An open-source ecosystem specifically built for schema-driven, AI-writable UI engines that dynamically map data models to frontend blocks.

## 10. System Data Flow

| Layer | Responsibility | Technology |
|---|---|---|
| Data & Validation | Stores standardized step descriptors, 18-category configurations, and built-in rules. | Supabase (PostgreSQL) |
| Edge Routing | Single dynamic route handling all workflow steps universally. | Next.js App Router (`[stepId]/page.tsx`) |
| Engine & Registry | Reads descriptors, parses runtime Zod schemas, and maps to UI archetypes. | TypeScript Engine + Zod + React Hook Form |
| Presentation | Renders clean, stateless UI building blocks. | Shadcn UI + Tailwind CSS |

## 11. Project File Structure

```
src/
├── core/
│   ├── engine/           # Universal Step Renderer (reads descriptors)
│   └── registry/         # Maps DB archetypes to Shadcn components
├── components/
│   ├── archetypes/       # Reusable, standardized blocks
│   │   ├── FormArchetype.tsx
│   │   ├── TableArchetype.tsx
│   │   └── ReviewArchetype.tsx
└── app/
    └── workflow/
        └── [stepId]/     # Single dynamic route for ALL steps
            └── page.tsx  # Server component feeding descriptor into engine
```

## 12. Implementation Code Blueprints

### Step 1: The Archetype Registry
The registry binds backend-defined archetypes directly to your standardized Shadcn UI components.

```ts
import { FormArchetype } from '@/components/archetypes/FormArchetype';
import { TableArchetype } from '@/components/archetypes/TableArchetype';

export const archetypeRegistry = {
  FORM_INPUT: FormArchetype,
  DATA_GRID: TableArchetype,
} as const;

export type ArchetypeKey = keyof typeof archetypeRegistry;
```

### Step 2: The Universal Step Engine
This engine consumes the step descriptor, dynamically generates client-side validation, and mounts the proper UI component with a fail-safe fallback.

```tsx
import { archetypeRegistry, ArchetypeKey } from '@/core/registry/archetypeRegistry';

interface StepDescriptor {
  id: string;
  schema_version: string;
  archetype: ArchetypeKey;
  schemaRules: Record<string, any>;
  config: Record<string, any>;
}

export function StepEngine({ descriptor }: { descriptor: StepDescriptor }) {
  const Component = archetypeRegistry[descriptor.archetype];

  if (!Component) {
    return <div className="p-4 border border-yellow-500 rounded bg-yellow-50">Unsupported step configuration archetype.</div>;
  }

  return <Component config={descriptor.config} rules={descriptor.schemaRules} />;
}
```

### Step 3: The Single Dynamic Route
The entire application runs through a single predictable server route that fetches the descriptor and hands it off to the engine.

```tsx
import { StepEngine } from '@/core/engine/StepEngine';
import { createClient } from '@/utils/supabase/server';

export default async function WorkflowStepPage({ params }: { params: { stepId: string } }) {
  const supabase = createClient();

  // Fetch the standardized step descriptor from Supabase
  const { data: stepDescriptor, error } = await supabase
    .from('step_descriptors')
    .select('*')
    .eq('id', params.stepId)
    .single();

  if (error || !stepDescriptor) {
    return <div>Step not found.</div>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <StepEngine descriptor={stepDescriptor} />
    </main>
  );
}
```

## 13. Benefits & Risk Mitigation
Zero Drift: When backend requirements or categories change, the database descriptor updates, instantly synchronizing the frontend without touching component files.
Speed & Performance: Heavy parsing and descriptor assembly execute on the server via Next.js Server Components, ensuring lightning-fast client page loads.
Enforceability: Developers and AI agents cannot introduce custom component spaghetti because only registered archetypes are permitted to render.

---

## 14. Operating Boundaries (draft — filled at WF1 plan time)

### Target Files
- none yet — the WF1 plan names them (expected: `src/core/engine/`, `src/core/registry/`, `src/components/archetypes/`, `src/app/workflow/[stepId]/page.tsx`, a `step_descriptors` seed + drift check under `scripts/seeds/`)

### Out-of-Scope Files
- `scripts/**/*.descriptor.json` — the step descriptors stay git-sourced and Spec 122-governed; this spec only projects them
- §7 product features (`app_outputs`, ad slots, PDF export, subscriptions) — their own spec

### Cross-Spec Dependencies
- Spec 122 §1.2/§5 (the 20-category descriptor contract this engine renders) · Spec 124 (policy register) · Spec 86 (control panel — the existing generated logic-variable groups are the precedent) · Spec 90 (mobile engineering protocol — Expo/RN, not FlutterFlow) · Spec 48 §3.6 (observability rows the admin side lacks)
