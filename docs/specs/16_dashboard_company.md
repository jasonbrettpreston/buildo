# Feature: Company Dashboard

## 1. User Story
"As a construction company, I want a team-oriented dashboard with multi-trade filtering, bid tracking, and team assignment for leads."

## 2. Technical Logic

### Overview
The company dashboard extends the tradesperson dashboard (Spec 15) with team management, multi-trade aggregation, bid pipeline tracking, and company-wide analytics. A company account has one owner (the user who created it) and multiple team members (invited by email).

### Multi-Trade Aggregated Feed
Unlike a tradesperson who filters by their own 1-3 trades, a company typically covers 5-15 trades across team members. The feed aggregates permits across all team members' trade selections.

* **Trade aggregation:** Union of all `selected_trade_slugs` across the company owner and all team members.
* **API calls:** Single API call per trade slug, results merged client-side (same dedup logic as Spec 15).
* **Feed prioritization:** Permits matching multiple company trades are boosted to the top (multi-trade relevance score = `max(lead_score) + 5 * (number_of_matching_trades - 1)`).

### Team Management
* **Company profile:** Stored in Firestore at `/companies/{companyId}`.
* **Team members:** Array of UIDs in company document. Each team member's `/users/{uid}` document has `company_id` field linking to the company.
* **Roles:** `owner` (full access), `manager` (can assign leads, view all), `member` (can view assigned leads only).
* **Invitation:** Owner sends invite link via email. Invited user signs up/logs in and is added to the company.

### Bid Pipeline Tracking
Extends the saved permit status tracking from Spec 15 with company-level bid management:

```
identified -> contacted -> quoted -> negotiating -> won
                                                -> lost
Any state -> archived
```

Each bid record stores:
* Which team member is assigned
* Estimated bid amount
* Actual bid amount (after quoting)
* Notes and activity log
* Timeline of status changes

### Lead Assignment
* Company owner or manager assigns a saved permit (lead) to a specific team member.
* Assigned member sees the lead in their personal view with the assignment indicator.
* Unassigned leads are visible to owner/manager but not to regular members.
* Assignment includes optional notes and due date.

### Company-Wide Stats
Displayed at the top of the company dashboard:

| Stat | Calculation |
|------|-------------|
| Total Leads | Count of all saved permits for the company |
| Active Bids | Count of permits in `contacted`, `quoted`, or `negotiating` status |
| Won This Month | Count of `won` status changes in current month |
| Conversion Rate | `won / (won + lost)` as percentage |
| Total Pipeline Value | Sum of `estimated_bid_amount` for active bids |
| Top Performer | Team member with most `won` bids this quarter |

### Team Sidebar
Left sidebar shows:
* Company name and logo
* Team member list with online status
* Quick filter: show all leads, or filter by assigned team member
* Team member's trade specialties shown as colored dots

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/dashboard/company/page.tsx` | Planned | Company dashboard page |
| `src/app/dashboard/company/team/page.tsx` | Planned | Team management page |
| `src/app/dashboard/company/pipeline/page.tsx` | Planned | Bid pipeline view |
| `src/components/company/CompanyStats.tsx` | Planned | Company-wide statistics cards |
| `src/components/company/TeamSidebar.tsx` | Planned | Team member sidebar list |
| `src/components/company/TeamMemberCard.tsx` | Planned | Individual team member card |
| `src/components/company/BidPipeline.tsx` | Planned | Kanban-style bid pipeline board |
| `src/components/company/BidCard.tsx` | Planned | Individual bid card in pipeline |
| `src/components/company/LeadAssignment.tsx` | Planned | Lead assignment dialog |
| `src/components/company/InviteMember.tsx` | Planned | Team member invitation form |
| `src/lib/company/aggregation.ts` | Planned | Multi-trade feed aggregation logic |
| `src/lib/company/permissions.ts` | Planned | Role-based permission checks |
| `src/app/api/company/route.ts` | Planned | Company CRUD API |
| `src/app/api/company/team/route.ts` | Planned | Team management API |
| `src/tests/company.logic.test.ts` | Planned | Company dashboard logic tests |
| `src/tests/company.ui.test.tsx` | Planned | Company dashboard component tests |
| `src/tests/company.infra.test.ts` | Planned | Company dashboard integration tests |

## 4. Constraints & Edge Cases

### Constraints
* Maximum team size: 50 members per company (Firestore document size limit for member array).
* Bid pipeline is company-scoped; team members cannot see other companies' bids.
* Only `owner` can delete the company or remove members. `manager` can invite and assign.
* Firestore security rules must enforce company membership for all reads/writes.

### Edge Cases
* **Solo company (no team members):** Dashboard functions identically to tradesperson dashboard with extra bid pipeline features.
* **Team member leaves company:** Their assigned leads become unassigned; their saved permits remain with the company.
* **Owner deletes account:** Must transfer ownership first; block deletion if sole owner.
* **Team member has overlapping trades with another member:** Feed dedup handles this; permit shown once with all matching trades listed.
* **Invited user already has a tradesperson account:** Account type changes to `company` member; existing saved permits remain in their personal collection.
* **Two team members save the same permit independently:** Company-level dedup merges them into one company bid; both members shown as interested.
* **Conversion rate with zero denominator:** Display "N/A" when `won + lost === 0`.
* **Large team (40+ members):** Paginate team sidebar; aggregate trade list may include all 20 trades.

## 5. Data Schema

### Firestore: `/companies/{companyId}`
```
{
  id:               string       // Auto-generated document ID
  name:             string       // Company name
  logo_url:         string|null  // Company logo URL
  owner_uid:        string       // UID of the company owner
  member_uids:      string[]     // UIDs of all team members (including owner)
  member_roles:     map          // { [uid]: "owner" | "manager" | "member" }
  aggregated_trades: string[]    // Union of all members' selected_trade_slugs
  created_at:       timestamp
  updated_at:       timestamp
}
```

### Firestore: `/companies/{companyId}/bids/{bidId}`
```
{
  permit_num:           string       // Permit number
  revision_num:         string       // Revision number
  permit_id:            string       // Composite: "permitNum--revisionNum"
  status:               string       // "identified"|"contacted"|"quoted"|"negotiating"|"won"|"lost"|"archived"
  assigned_to:          string|null  // UID of assigned team member
  assigned_by:          string|null  // UID of assigner
  assigned_at:          timestamp|null
  estimated_bid_amount: number|null  // Estimated bid in dollars
  actual_bid_amount:    number|null  // Actual quoted amount
  due_date:             timestamp|null
  notes:                string
  lead_score:           number       // Snapshot of lead_score at time of identification
  matching_trades:      string[]     // All company trades that match this permit
  status_history:       array        // [{status, changed_by, changed_at, notes}]
  created_at:           timestamp
  updated_at:           timestamp
}
```

### Firestore: `/users/{uid}` (additional fields for company members)
```
{
  company_id:      string|null  // Reference to /companies/{companyId}
  company_role:    string|null  // "owner" | "manager" | "member"
}
```

### Firestore: `/companies/{companyId}/invitations/{inviteId}`
```
{
  email:           string       // Invited email address
  role:            string       // "manager" | "member"
  invited_by:      string       // UID of inviter
  status:          string       // "pending" | "accepted" | "expired"
  created_at:      timestamp
  expires_at:      timestamp    // 7 days after creation
}
```

## 6. Integrations

### Internal
* **Tradesperson Dashboard (Spec 15):** Company dashboard extends all tradesperson features (permit feed, filters, permit card). Shared components: `PermitCard`, `PermitFeed`, `DashboardFilters`.
* **Auth (Spec 13):** Company owner's `account_type === "company"` determines dashboard routing. Team member UIDs validated against Firebase Auth.
* **Onboarding (Spec 14):** Company name collected in Step 1. Company document created on onboarding completion.
* **Permit Data API (Spec 06):** Multi-trade queries aggregate results from multiple `trade_slug` API calls.
* **Permit Detail (Spec 18):** Clicking bid card navigates to permit detail page.
* **Teams (Spec 22):** Advanced team management features (role changes, audit log) handled in separate spec.

### External
* **Cloud Firestore:** Company document, bids, invitations, and team member references.
* **Firebase Auth:** Team member UIDs reference Firebase Auth accounts.
* **SendGrid / Firebase Cloud Functions:** Invitation emails sent to invited team members (future integration).

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`company.logic.test.ts`)
* [ ] **Rule 1:** Multi-trade aggregation: union of team members' trade slugs produces correct aggregate trade list.
* [ ] **Rule 2:** Bid status transitions: `identified -> contacted -> quoted -> negotiating -> won` are valid; `won -> contacted` is invalid.
* [ ] **Rule 3:** Team assignment validation: only `owner` and `manager` roles can assign leads.
* [ ] **Rule 4:** Multi-trade relevance scoring: permits matching 3 company trades score higher than those matching 1.
* [ ] **Rule 5:** Conversion rate calculation: `won / (won + lost)` returns correct percentage; handles zero denominator.
* [ ] **Rule 6:** Permission checks: `member` role cannot invite, assign, or delete; `manager` can invite and assign; `owner` has full access.

### B. UI Layer (`company.ui.test.tsx`)
* [ ] **Rule 1:** Team sidebar renders list of team members with roles and trade dots.
* [ ] **Rule 2:** Bid pipeline view renders kanban columns for each status stage.
* [ ] **Rule 3:** Company stats cards render total leads, active bids, conversion rate, pipeline value.
* [ ] **Rule 4:** Lead assignment dialog renders team member dropdown and notes field.
* [ ] **Rule 5:** Invite member form renders email input and role selector.
* [ ] **Rule 6:** Filter by team member updates feed to show only that member's assigned leads.

### C. Infra Layer (`company.infra.test.ts`)
* [ ] **Rule 1:** Firestore read: company document loads with correct team member list and aggregated trades.
* [ ] **Rule 2:** Multi-trade API query: multiple `trade_slug` API calls execute and merge results correctly.
* [ ] **Rule 3:** Firestore write: creating a bid writes to `/companies/{companyId}/bids/{bidId}`.
* [ ] **Rule 4:** Firestore security rules: team member can only read/write within their company.
* [ ] **Rule 5:** Invitation flow: creating invitation writes to Firestore and updates company on acceptance.
