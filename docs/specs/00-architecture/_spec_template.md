# [Feature/Component Name]

<requirements>
## 1. Goal & User Story
[1-2 sentences: what this accomplishes and its business value.]
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema
[Relevant tables, PKs, constraints. Omit if no DB impact.]

### API Endpoints
[Request/Response shapes. Omit if no API.]

### Implementation
[Key files, functions, data flow. Reference source files — no inline code.]
</architecture>

---

<security>
## 3. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | — |
| Authenticated | — |
| Admin | — |

[Omit section entirely for backend-only/pipeline specs.]
</security>

---

<behavior>
## 4. Behavioral Contract
- **Inputs:** [What triggers this? HTTP request, cron, pipeline step, user action?]
- **Core Logic:** [Business rules as numbered steps. Reference source files.]
- **Outputs:** [What is returned/rendered/mutated?]
- **Edge Cases:** [3-5 failure modes and fallbacks.]
</behavior>

---

<failure_modes>
## 4a. Known Failure Modes
[Add this section after the first CRITICAL/HIGH bug fix touches the spec's surface,
per docs/specs/00-architecture/05_knowledge_operating_model.md §4. Each entry: short
title, the class of failure, the guard now in place (test / lint / code change), and
the commit SHA that introduced the guard. Omit section entirely until the first guard
is added — empty placeholders rot.]

<!-- Example entry (delete when adding real ones):
- **Out-of-order webhook events** — Stripe does not guarantee delivery order; late
  `customer.subscription.updated` could overwrite `expired` back to `active`.
  Guard: `last_stripe_event_at` timestamp gate in webhook UPDATE (migration 116, commit 7dfe1a1).
-->
</failure_modes>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** [`*.logic.test.ts` — what functions/edges are tested]
- **UI:** [`*.ui.test.tsx` — what DOM interactions. Omit if backend-only.]
- **Infra:** [`*.infra.test.ts` — what DB/API state is asserted. Omit if pure logic.]
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/...`

### Out-of-Scope Files
- `src/...` — [why this is off-limits]

### Cross-Spec Dependencies
- **Relies on:** [upstream spec]
- **Consumed by:** [downstream spec]
</constraints>
