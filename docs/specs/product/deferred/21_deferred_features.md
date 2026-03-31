# Deferred Features

> **Status: PARTIAL** — These features have type definitions and/or basic API routes but are not fully implemented. Each section notes what exists vs what is deferred.

---

<requirements>
## 1. Goal & User Story
Three product features at varying stages of completion, deferred pending business priority decisions.
</requirements>

---

<behavior>
## 2. Notifications (Spec 21)

> **Exists:** In-app notification API route + `notifications` table (migration 010). Bell icon, unread badge, `GET /api/notifications` with pagination.
> **Deferred:** Pub/Sub fan-out, email digests (SendGrid), push notifications (FCM), `src/lib/notifications/matcher.ts`, digest batching via Cloud Scheduler.
> **File path corrections:** `UserPreferences` lives in `src/lib/auth/types.ts`, not `notifications/types.ts`.

**Planned logic:** Pub/Sub `permit-changes` topic → Cloud Function matches against user preferences (trade filters, postal codes, wards, cost range) → routes to in-app/email/push channels. Deduplication via `(user_id, permit_num, type, DATE(created_at))` unique constraint.

**Target files:** `src/lib/notifications/`, `src/app/api/notifications/route.ts`
**Testing:** `notifications.logic.test.ts` (matching logic, email templates, alert frequency)

---

## 3. Team Management (Spec 22)

> **Exists:** `ROLE_PERMISSIONS` enum + TypeScript interfaces in `src/lib/teams/types.ts`. Tests cover type definitions only.
> **Deferred:** Permissions enforcement, invite flow (nanoid codes, SendGrid emails, 7-day expiry), team API routes, Firestore team linking. Gated to Enterprise plan.

**Planned logic:** 3 roles (Owner/Manager/Member) with cascading permissions. One team per user. 25-member limit. Firestore `/teams/{teamId}` + `/invites/{code}`.

**Target files:** `src/lib/teams/types.ts`, `src/lib/teams/permissions.ts` (planned), `src/lib/teams/invites.ts` (planned)
**Testing:** `teams.logic.test.ts` (role permissions, type structure)

---

## 4. Stripe Subscription (Spec 25)

> **Exists:** 3-tier plan definitions (Free/Pro $29/mo/Enterprise $99/mo) and feature gating constants in `src/lib/subscription/plans.ts`. Tests validate plan definitions.
> **Deferred:** Stripe Checkout integration, Customer Portal, webhook handler (`checkout.session.completed`, `subscription.updated`, etc.), subscription middleware enforcement. Prices in CAD + HST 13%.

**Planned logic:** Create Stripe Customer → Checkout Session → webhook updates Firestore `/users/{uid}`. Feature gating middleware returns 403 + `upgrade_required`. Pro: 14-day trial (once per email). Downgrade: features retained until billing period end.

**Target files:** `src/lib/subscription/plans.ts`
**Testing:** `subscription.logic.test.ts` (plan catalog, canAccess, isWithinLimit)
</behavior>

---

<constraints>
## 5. Operating Boundaries

### Cross-Spec Dependencies
- **Notifications** relies on: `13_authentication.md`, `80_taxonomies.md` (trade matching)
- **Teams** relies on: `13_authentication.md`, `25_stripe_subscription` (Enterprise gating)
- **Subscription** consumed by: notifications (channel gating), teams (Enterprise gating), analytics (Pro gating), export (Pro gating)
</constraints>
