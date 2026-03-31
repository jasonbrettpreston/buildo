# Spec 16 -- Company Dashboard

## 1. Goal & User Story
A construction company needs a team-oriented dashboard with multi-trade filtering across all team members, bid pipeline tracking, lead assignment, and company-wide analytics.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Write (own company data: owner has full access, manager can invite/assign, member can view assigned leads only) |
| Admin | None |

## 3. Behavioral Contract
- **Inputs:** Company profile from Firestore `/companies/{companyId}`; union of all team members' `selected_trade_slugs`; permit data via multi-trade API calls; team member roles (owner/manager/member)
- **Core Logic:**
  - Extends tradesperson dashboard (Spec 15) with team and bid features. Shared components: PermitCard, PermitFeed, DashboardFilters
  - Multi-trade aggregated feed: union of all team members' trade slugs, single API call per slug, client-side merge/dedup. Multi-trade relevance boost: `max(lead_score) + 5 * (matching_trades - 1)`. See `src/lib/company/aggregation.ts` (planned)
  - Team management: owner invites via email link (7-day expiry), invited user added on sign-up/login. Roles: owner (full), manager (invite + assign), member (view assigned only). Max 50 members. See `src/lib/company/permissions.ts` (planned)
  - Bid pipeline: identified -> contacted -> quoted -> negotiating -> won|lost; any state -> archived. Each bid tracks assigned member, estimated/actual bid amounts, notes, status history timeline. Stored at `/companies/{companyId}/bids/{bidId}`
  - Lead assignment: owner/manager assigns saved leads to team members with optional notes and due date. Unassigned leads visible only to owner/manager
  - Company stats: total leads, active bids, won this month, conversion rate (`won / (won + lost)`, "N/A" if zero denominator), total pipeline value, top performer this quarter
- **Outputs:** Team-aggregated permit feed with multi-trade relevance scoring; company-scoped bid pipeline in Firestore; team sidebar with member roles and trade specialties; company-wide analytics
- **Edge Cases:**
  - Solo company (no team members): functions identically to tradesperson dashboard with extra bid pipeline
  - Team member leaves: their assigned leads become unassigned, saved permits stay with company
  - Owner deletes account: must transfer ownership first; block deletion if sole owner
  - Overlapping trades across team members: feed dedup handles; permit shown once with all matching trades
  - Two members save same permit: company-level dedup merges into one bid, both shown as interested

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI** (`dashboard.ui.test.tsx`): Dashboard StatCard Logic; Dashboard Navigation Links; Dashboard Filter State; Dashboard Stats Row; Dashboard Account Type Variants
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/dashboard/page.tsx` (company view extension)
- `src/tests/dashboard.ui.test.tsx`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.
- **`src/components/permits/PermitCard.tsx`**: Governed by Spec 15. Shared component — do not modify without running UI regression tests.

### Cross-Spec Dependencies
- Extends **Spec 15 (Tradesperson Dashboard)**: Builds on the same dashboard page and permit feed.
- Relies on **Spec 22 (Team Management)**: Uses team data for multi-user aggregation.
- Relies on **Spec 13 (Auth)**: Reads company profile and team member data.
