# Spec [XX] -- [Feature Name]

## 1. Goal & User Story
[1-2 sentences describing what this feature accomplishes.]

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read |
| Admin | Read/Write |

## 3. Behavioral Contract
- **Inputs:** [What triggers this?]
- **Core Logic:** [Business rules in plain English. NO code — reference source files.]
- **Outputs:** [What is returned/rendered? Describe shape, not exact JSON.]
- **Edge Cases:** [3-5 failure modes and fallbacks]

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** [What pure functions/algorithms must be proven?]
- **UI:** [What components must render correctly? Or N/A]
- **Infra:** [What DB/API integrations must be verified?]
<!-- TEST_INJECT_END -->

## 5. Mobile & Responsive Behavior
- **Mobile Layout:** [How does this feature stack/reflow on screens < 768px? Or N/A if backend-only.]
- **Touch Targets:** [All interactive elements must be >= 44px. List any buttons/links and their sizing.]
- **Breakpoints Used:** [e.g., base (mobile) / `md:` (tablet) / `lg:` (desktop)]

## 6. Operating Boundaries

### Target Files (Modify / Create)
- `src/...`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: (Governed by Spec 08.)

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**.
