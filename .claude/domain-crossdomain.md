# Cross-Domain Mode — Full Rules

Read this file when declaring **Domain Mode: Cross-Domain**.
Read both `domain-admin.md` and `scripts/CLAUDE.md` before generating the active task.

---

## Scenario A — Admin UI + API Route (Same Admin-Only Feature)

1. Read both domain rule files before proceeding.
2. Build the API route first (Backend/Pipeline rules), then the admin UI consumer (Admin rules).
   Both phases can happen in the same session.
3. Write a **handoff note** in the active task between phases — document the JSON contract established.
4. Both pre-commit gauntlets apply to their respective files.

---

## Scenario B — API Route Consumed by the Expo App (Strict Contract Boundary)

The Expo app is a separate client. Breaking changes to response shape will silently break
mobile users.

1. Before implementing: define the TypeScript interface in `src/app/api/[route]/types.ts`.
2. After implementing: document the change in the relevant spec.
   If `npm run openapi:generate` is wired, run it.
3. Write a **contract note** in the active task:
   - Endpoint path and method
   - Request params (added/removed/changed)
   - Response shape diff (before → after)
4. Coordinate with the Expo mobile repo — it consumes these types.
