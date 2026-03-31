# Spec 22 -- Team Management

> **Status: PARTIAL** — Only `ROLE_PERMISSIONS` enum and TypeScript interfaces defined in `src/lib/teams/types.ts`. **Deferred:** Permissions enforcement logic, invite flow, team API routes, Firestore team linking. Tests cover type definitions only.

## 1. Goal & User Story
As a company owner, I want to invite team members, assign roles, and share leads across my organization so we can collaborate on construction opportunities.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Write (own team) |
| Admin | Read/Write (all) |

## 3. Behavioral Contract
- **Inputs:** Team creation (owner UID + name), member invitations (email + role), invite acceptance (code + UID), member removal, ownership transfer, leave-team requests. Team features gated to Enterprise subscription plan (Spec 25).
- **Core Logic:**
  - Three intra-team roles with cascading permissions: **Owner** (full access: CRUD team, invite/remove members, change roles, transfer ownership), **Manager** (invite members, assign leads, view all team permits, export), **Member** (view assigned permits + own saves only). See `src/lib/teams/permissions.ts`.
  - Invitation flow (see `src/lib/teams/invites.ts`): owner/manager enters email + role, system creates invite in Firestore `/invites/{code}` (nanoid 12-char code), SendGrid sends email with link. Recipient clicks link: existing user auto-joins; new user redirected to signup then auto-joins. Invite is single-use, expires after 7 days. Duplicate invite for same email+team resends existing.
  - One team per user. Owner cannot leave without transferring ownership first. Ownership transfer demotes old owner to manager. Member limit: 25 (Enterprise plan).
  - Shared saved permits: team members with Owner/Manager role see all team saves; Members see only assigned permits + own saves. Permit assignment creates `assigned_to` field. Removing a member unassigns their permits.
  - All member array mutations use Firestore transactions to prevent race conditions.
  - Team data stored in Firestore: `/teams/{teamId}` (see types in `src/lib/teams/types.ts`) and `/invites/{code}`.
- **Outputs:** Team settings page (`src/app/settings/team/page.tsx`), invite acceptance page (`src/app/invite/[code]/page.tsx`), team member list with role badges, pending invites list.
- **Edge Cases:**
  - Invite email mismatch: error explaining invite was sent to a different address.
  - Expired invite: clear message prompting user to request a new one.
  - Owner tries to leave: error requiring ownership transfer first.
  - Member limit reached (25): clear error on invite attempt.
  - Plan downgrade from Enterprise: existing members remain but no new invites allowed; upgrade prompt shown.
  - Deleted user: Cloud Function on user deletion removes them from any team.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`teams.logic.test.ts`): Team Role Permissions; Team Type Structure; Permission Check Helper
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/teams/types.ts`
- `src/tests/teams.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/auth/`**: Governed by Spec 13. Auth logic is read-only.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/subscription/`**: Governed by Spec 25. Subscription gating is read-only.

### Cross-Spec Dependencies
- Relies on **Spec 13 (Auth)**: Uses user profiles for team membership.
- Relies on **Spec 25 (Subscription)**: Team features gated to Enterprise plan.
- Consumed by **Spec 16 (Company Dashboard)**: Company dashboard uses team data.
