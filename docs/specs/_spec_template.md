# [Feature Name] Technical Specification

## 1. Goal & User Story

## 2. Technical Architecture
### Database Schema
### API Payload (Inputs / Outputs)

## 3. Auth Matrix (RBAC)

## 4. Behavioral Contract
- **Inputs:** [What triggers this?]
- **Core Logic:** [Business rules in plain English. NO code — reference source files.]
- **Outputs:** [What is returned/rendered? Describe shape, not exact JSON.]
- **Edge Cases:** [3-5 failure modes and fallbacks]

## 5. Testing Mandate
- **Logic Tests:**
- **UI Tests:**
- **Infra Tests:**

## 6. Operating Boundaries
### Target Files (Modify / Create)
- `src/...`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: (Governed by Spec 08.)

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**.


---
<br><br>
<div align="center">
  <h2>-- NEW AI-OPTIMIZED APPROACH BELOW (FOR COMPARISON) --</h2>
</div>
<br><br>

# [Feature/Component Name] Technical Specification

<requirements>
## 1. Goal & User Story
[1-2 sentences describing what this feature accomplishes and its downstream business value. Keep this incredibly concise so AI agents understand the 'intent' over 'implementation'.]
</requirements>

<architecture>
## 2. Technical Architecture
### Database Schema
[Relevant Postgres tables, foreign keys, constraints, and indexes. Provide exact table names that this component mutates.]

### API Payload (Inputs / Outputs)
[Concrete JSON Request/Response examples. Explicitly define expected schema. Do not describe these conceptually, show the raw shapes.]
</architecture>

<security>
## 3. Auth Matrix (RBAC)
- **Public:** [Yes/No]
- **User Roles:** [Business roles that can access]
- **System Roles:** [Required service accounts or cron contexts]
</security>

<behavior>
## 4. Behavioral Contract
- **Inputs:** [What triggers this? Cron? HTTP? Event?]
- **Core Logic:** [Business rules in plain English structured as a numbered sequence. NO code definitions here — reference source files.]
- **Outputs:** [What is returned/rendered/mutated? Describe final shape.]
- **Edge Cases:** [3-5 failure modes, rate limits, and fallbacks. What breaks first?]
</behavior>

<testing>
## 5. Testing Mandate
- **Logic Tests:** [Which `logic.test.ts` file? What edge cases and functions are explicitly mocked?]
- **UI Tests:** [Which `ui.test.tsx` file? What DOM interactions?]
- **Infra Tests:** [Which `infra.test.ts` file? What physical DB state is asserted in Docker?]
</testing>

<constraints>
## 6. Operating Boundaries
### Target Files (Modify / Create)
- [List of exact file paths this specification governs. (e.g., `src/lib/auth.ts`)]

### Out-of-Scope Files (DO NOT TOUCH)
- [CRITICAL: List of exact paths strictly forbidden from modification during this task. Setting negative boundaries prevents LLM hallucinations.]

### Cross-Spec Dependencies
- **Relies on:** [Dependency Spec X]
- **Consumed by:** [Dependency Spec Y]
</constraints>
