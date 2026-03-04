# Spec NN -- [Feature Name]

**Status:** Planned
**Last Updated:** YYYY-MM-DD
**Depends On:** (list spec files this depends on)

## 1. Goals
*What does this feature accomplish? Write as behavioral contracts, not implementation details.*

- Goal 1
- Goal 2

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated User | Read |
| Admin | Read/Write |

## 3. Behavioral Contract
*Define inputs, outputs, and edge cases as testable assertions.*

| Input | Expected Output | Edge Case |
|-------|----------------|-----------|
| Valid permit_num | Permit detail JSON | Missing permit → 404 |

## 4. Testing Triad
| Pattern | File | What It Tests |
|---------|------|---------------|
| `*.logic.test.ts` | `src/tests/[feature].logic.test.ts` | Pure function behavior |
| `*.ui.test.tsx` | `src/tests/[feature].ui.test.tsx` | Component rendering |
| `*.infra.test.ts` | `src/tests/[feature].infra.test.ts` | API routes, DB queries |

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/api/[feature]/route.ts`
- `src/components/[Feature].tsx`
- `src/lib/[feature]/helpers.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: (Governed by Spec 08. Do not modify trade logic.)
- **`migrations/`**: (Schema locked. Raise a query if schema must change.)

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: May import and read interfaces, but may not alter them.
