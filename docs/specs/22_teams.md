# 22 - Team Management

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `13_auth.md`, `25_subscription.md`
**Blocks:** None

---

## 1. User Story

> "As a company owner, I want to invite team members, assign roles, and share leads across my organization."

**Acceptance Criteria:**
- Team owners can invite members via email with a specific role assignment
- Three roles exist: owner (full access), manager (assign leads, view all), member (view assigned only)
- Invited recipients who sign up are automatically joined to the team
- Saved permits can be shared and visible to all team members
- Members can leave a team; owners can remove members
- Ownership can be transferred to another team member
- Team features are gated to the Enterprise subscription plan

---

## 2. Technical Logic

### Invitation Flow

```
1. Owner enters email + role in invite modal
2. System creates invite record in Firestore /invites/{code}
3. SendGrid sends invite email with link: https://app.buildo.ca/invite/{code}
4. Recipient clicks link:
   a. If already a Buildo user -> auto-joins team with assigned role
   b. If new user -> redirected to signup, after signup auto-joins team
5. Invite code is single-use, marked as claimed after join
6. Invites expire after 7 days
```

### Role Permissions Matrix

| Permission | Owner | Manager | Member |
|------------|-------|---------|--------|
| View all team permits | Yes | Yes | No (assigned only) |
| Save/unsave permits | Yes | Yes | Yes (own only) |
| Assign permits to members | Yes | Yes | No |
| Invite new members | Yes | Yes | No |
| Remove members | Yes | No | No |
| Change member roles | Yes | No | No |
| Transfer ownership | Yes | No | No |
| Edit team name | Yes | No | No |
| Delete team | Yes | No | No |
| View team analytics | Yes | Yes | No |
| Export team data | Yes | Yes | No |

### Team Operations

```
createTeam(ownerUid, teamName):
  1. Check user does not already own a team
  2. Create /teams/{teamId} document with owner_uid, name, members: [{uid, role: 'owner', joined_at}]
  3. Update user profile with team_id reference

inviteMember(teamId, email, role, inviterUid):
  1. Verify inviter has permission (owner or manager)
  2. Check email is not already a team member
  3. Check team has not exceeded member limit (Enterprise: 25 members)
  4. Generate unique invite code (nanoid, 12 chars)
  5. Create /invites/{code} with team_id, email, role, invited_by, expires_at (now + 7 days)
  6. Send invite email via SendGrid

acceptInvite(code, uid):
  1. Load invite by code
  2. Validate: not expired, not claimed, email matches user's email
  3. Add user to /teams/{teamId}/members array
  4. Mark invite as claimed (claimed_at, claimed_by)
  5. Update user profile with team_id

removeMember(teamId, targetUid, requesterUid):
  1. Verify requester is owner
  2. Verify target is not the owner (cannot remove self as owner)
  3. Remove target from members array
  4. Clear target's team_id from profile
  5. Unassign any permits assigned to removed member

transferOwnership(teamId, newOwnerUid, currentOwnerUid):
  1. Verify requester is current owner
  2. Verify newOwnerUid is a current team member
  3. Update current owner's role to 'manager'
  4. Update new owner's role to 'owner'
  5. Update team's owner_uid field

leaveTeam(teamId, uid):
  1. Verify user is not the owner (owner must transfer first)
  2. Remove user from members array
  3. Clear user's team_id from profile
  4. Unassign any permits assigned to departing member
```

### Shared Saved Permits

- When a team member saves a permit, it is visible to all team members with appropriate access
- Permits can be assigned to specific members by owners/managers
- Assignment creates an `assigned_to` field on the saved permit record
- Members with 'member' role only see permits assigned to them plus their own saves
- Managers and owners see all team saved permits

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/components/teams/TeamMemberList.tsx` | Display team members with roles and actions | Planned |
| `src/components/teams/InviteModal.tsx` | Email + role invite form | Planned |
| `src/components/teams/RoleSelector.tsx` | Role dropdown component | Planned |
| `src/components/teams/RemoveConfirmation.tsx` | Confirmation dialog for member removal | Planned |
| `src/components/teams/TransferOwnership.tsx` | Ownership transfer confirmation flow | Planned |
| `src/app/settings/team/page.tsx` | Team settings page | Planned |
| `src/app/invite/[code]/page.tsx` | Invite acceptance landing page | Planned |
| `src/lib/teams/permissions.ts` | Role permission checking functions | Planned |
| `src/lib/teams/invites.ts` | Invite generation and validation logic | Planned |
| `src/app/api/teams/route.ts` | Team CRUD API endpoints | Planned |
| `src/app/api/teams/invite/route.ts` | Invite creation and acceptance endpoints | Planned |

---

## 4. Constraints & Edge Cases

- **One team per user:** A user can only belong to one team at a time. Must leave current team before joining another.
- **Owner cannot leave:** The owner must transfer ownership to another member before leaving or deleting the team.
- **Invite email mismatch:** If a logged-in user's email does not match the invite email, show an error explaining the invite was sent to a different address.
- **Expired invite:** Display a clear message that the invite has expired and instruct the user to request a new one from the team owner.
- **Duplicate invite:** If an invite already exists for the same email and team (and is not expired), resend the existing invite rather than creating a new one.
- **Member limit:** Enterprise plan allows up to 25 team members. Attempting to invite beyond this limit returns a clear error.
- **Last member removal:** If removing a member leaves only the owner, the team continues to function as a single-person team.
- **Concurrent modifications:** Use Firestore transactions for all member array mutations to prevent race conditions.
- **Deleted user cleanup:** If a user deletes their account, they must be removed from any team they belong to. Use a Cloud Function triggered on user deletion.
- **Plan downgrade:** If a team's subscription downgrades from Enterprise, existing team members remain but no new invites can be created. Display an upgrade prompt.

---

## 5. Data Schema

### Firestore: `/teams/{teamId}`

```typescript
interface Team {
  id: string;                       // auto-generated document ID
  name: string;                     // team/company name
  owner_uid: string;                // UID of the team owner
  members: TeamMember[];
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface TeamMember {
  uid: string;
  role: 'owner' | 'manager' | 'member';
  joined_at: Timestamp;
}
```

### Firestore: `/invites/{code}`

```typescript
interface Invite {
  code: string;                     // nanoid, 12 chars, used as document ID
  team_id: string;
  email: string;                    // recipient email (lowercase)
  role: 'manager' | 'member';      // owner role cannot be invited, only transferred
  invited_by: string;               // UID of inviter
  expires_at: Timestamp;            // created_at + 7 days
  claimed_at: Timestamp | null;
  claimed_by: string | null;        // UID of user who accepted
  created_at: Timestamp;
}
```

### Firestore Security Rules (Relevant Subset)

```
match /teams/{teamId} {
  allow read: if isTeamMember(teamId);
  allow create: if isAuthenticated() && isEnterprisePlan();
  allow update: if isTeamOwner(teamId);
  allow delete: if isTeamOwner(teamId);
}

match /invites/{code} {
  allow read: if isAuthenticated();
  allow create: if isTeamOwnerOrManager(resource.data.team_id);
  allow update: if isAuthenticated() && resource.data.email == request.auth.token.email;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Authentication (`13`) | Upstream | Provides user identity, email for invite matching |
| Onboarding (`14`) | Upstream | Option to create or join a team during onboarding |
| Subscription (`25`) | Reference | Enterprise plan check gates team creation and invites |
| Notifications (`21`) | Downstream | Team invite emails sent via SendGrid |
| Search & Filter (`19`) | Downstream | Team-scoped saved permits appear in search results |
| Dashboard (`15`, `16`) | Downstream | Team context affects dashboard data visibility |
| Export (`24`) | Downstream | Team members can export shared saved permits |
| SendGrid | External | Invite email delivery |
| Firebase Auth | External | User identity and email verification |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Owner full permissions | Owner attempts any team action | All actions permitted |
| Manager invite permission | Manager invites a member | Invite created successfully |
| Manager cannot remove | Manager attempts to remove a member | Permission denied |
| Member cannot invite | Member attempts to invite | Permission denied |
| Invite code generation | `inviteMember(teamId, email, 'member', ownerUid)` | 12-char unique code created |
| Invite expiration check | Invite created 8 days ago | Expired, cannot be accepted |
| Invite valid within window | Invite created 3 days ago | Valid, can be accepted |
| Email mismatch rejection | User email 'a@b.com' accepts invite for 'x@y.com' | Rejected with mismatch error |
| Duplicate invite handling | Invite already exists for same email+team | Resend existing invite |
| Ownership transfer | Owner transfers to manager | Old owner becomes manager, new member becomes owner |
| Owner cannot leave | Owner calls leaveTeam | Error: must transfer ownership first |
| Member limit enforcement | Team has 25 members, invite attempted | Error: member limit reached |
| Remove member cleanup | Owner removes member | Member removed, assigned permits unassigned |
| Accept invite auto-join | New user signs up via invite link | Automatically added to team with correct role |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Team member list | All members displayed with name, email, role, and joined date |
| Role badges | Owner, manager, member roles shown as distinct colored badges |
| Invite modal | Modal captures email and role, validates email format |
| Invite sent confirmation | Success toast displayed after invite is sent |
| Remove confirmation | Confirmation dialog shows member name before removal |
| Transfer ownership flow | Two-step confirmation: select new owner, then confirm |
| Role selector | Dropdown shows manager and member options (not owner) |
| Empty team state | New team with only owner shows invite prompt |
| Pending invites list | Pending invites shown with email, role, expiry, and resend/cancel actions |
| Plan gate message | Non-Enterprise users see upgrade prompt when accessing team features |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Firestore security rules - member read | Team member can read team document |
| Firestore security rules - non-member read | Non-team user cannot read team document |
| Firestore security rules - owner update | Only owner can update team document |
| Invite email delivery | SendGrid sends invite email with correct link and team name |
| Invite code uniqueness | Generated codes are unique across all invites |
| Transaction safety | Concurrent member additions do not corrupt members array |
| User deletion cleanup | Deleting a user's Firebase Auth account triggers removal from their team |
| Invite link routing | `/invite/{code}` correctly routes to acceptance page or signup |
| Enterprise plan check | Firestore rule validates user's subscription plan before team creation |
| Rate limiting | Maximum 20 invites per team per hour to prevent abuse |
