◇ injected env (16) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
🔍 Adversarial review of docs/reports/phase0-3-comprehensive-review/bundle-phase0.txt

## Issues Found

### Migration Files

- **[CRITICAL]** (line 126-127 in migration 070): Foreign key constraint uses `VARCHAR(10)` for `revision_num` but `permits.revision_num` is `INTEGER`. This type mismatch will cause the foreign key to fail or silently cast incorrectly. Foreign keys require identical types. Fix: Change `revision_num VARCHAR(10)` to `INTEGER` to match the permits table.
- **[CRITICAL]** (line 139 in migration 071): Foreign key references `permits(permit_num, revision_num)` but uses `VARCHAR(10)` for `revision_num` while permits table uses `INTEGER`. This will break referential integrity. Fix: Change `revision_num VARCHAR(10)` to `INTEGER` to match permits table.
- **[HIGH]** (line 40-46 in migration 067): Trigger function uses `EXECUTE` for dynamic SQL but doesn't validate latitude/longitude ranges. Invalid coordinates (e.g., latitude > 90) will create invalid geometry that could crash spatial queries. Fix: Add validation checks in trigger: `IF NEW.latitude BETWEEN -90 AND 90 AND NEW.longitude BETWEEN -180 AND 180 THEN`.
- **[HIGH]** (line 168-170 in migration 074): HTTPS CHECK constraint only validates prefix, not URL structure. Malformed URLs like `https://` or `https://example.com/../etc/passwd` pass validation but could cause SSRF or injection later. Fix: Add stronger validation using `photo_url ~ '^https://[a-zA-Z0-9.-]+/'` or handle in application layer.
- **[MEDIUM]** (line 82-83 in migration 072): CHECK constraint `stage_sequence IN (10, 20, ...)` is brittle. Adding new sequence values requires schema migration. Fix: Use range check `stage_sequence >= 10 AND stage_sequence <= 70 AND stage_sequence % 10 = 0` or reference table.
- **[MEDIUM]** (line 122 in migration 070): `lead_key VARCHAR(100)` has no explicit index for lookups by `lead_key` alone. The covering index `(lead_key, trade_slug, viewed_at)` helps but queries filtering only on `lead_key` won't use it optimally. Fix: Add `CREATE INDEX idx_lead_views_lead_key ON lead_views(lead_key)`.
- **[MEDIUM]** (line 57 in migration 067): If PostGIS is missing, migration silently skips adding column/trigger/index. This creates inconsistent schemas across environments. Fix: Make conditional installation explicit with `RAISE EXCEPTION` in production or ensure PostGIS is a deployment prerequisite.
- **[LOW]** (line 93 in migration 071): `premium_factor DECIMAL(3,2)` constraint allows values up to 9.99, but the spec likely expects `>= 1.0 AND <= 5.0` or similar. Unbounded premium could cause UI/calculation issues. Fix: Add upper bound `premium_factor <= 5.0`.
- **[NIT]** (line 18 in migration 070): `id SERIAL PRIMARY KEY` is redundant with composite UNIQUE `(user_id, lead_key, trade_slug)`. Wastes space and index overhead. Fix: Remove `id` column, make `(user_id, lead_key, trade_slug)` the primary key.

### Source Files

- **[HIGH]** (line 46-53 in route-guard.ts): `isValidSessionCookie` only checks JWT format (3 dots), not expiration or signature. An attacker could forge a structurally valid but expired/invalid token and bypass auth in dev mode. Fix: Implement proper verification with Firebase Admin SDK or at least check expiration if present in payload.
- **[HIGH]** (line 35-40 in rate-limit.ts): In-memory fallback used in production when Upstash misconfigured. Race condition in `memoryRateLimit` allows exceeding limits under concurrent requests. Fix: Use atomic operations or a proper in-memory store (like `node-cache`) with locks for production fallback.
- **[MEDIUM]** (line 82-87 in rate-limit.ts): Upstash client cached per `(limit, windowSec)` but never cleaned up. Over time, this leaks memory with many different rate limit configurations. Fix: Implement LRU cache or clear entries periodically.
- **[MEDIUM]** (line 30-33 in route-guard.ts): `isDevMode()` uses `NEXT_PUBLIC_DEV_MODE` environment variable. This is baked at build time, not runtime, making environment-specific toggles impossible. Fix: Use server-side runtime env var or separate build for dev/prod.
- **[MEDIUM]** (line 58-61 in logger.ts): Sentry lazy loading uses `/* webpackIgnore: true */` which may not work in all bundling scenarios. If import fails, errors go unreported silently. Fix: Use try-catch with explicit fallback and log warning.
- **[LOW]** (line 17-20 in config.ts): Firebase config filters `undefined` values but doesn't validate required keys. Missing `apiKey` will cause cryptic Firebase errors later. Fix: Validate all required keys exist and throw explicit error.
- **[LOW]** (line 52-55 in session.ts): `savePermit` uses `--` as separator in `permitId`. If `permitNum` contains `--`, it will cause collisions. Fix: Use a safer separator like `|` or encode components.
- **[NIT]** (line 42-45 in client.ts): `pool.on('error', ...)` logs but doesn't emit or handle the error. Connection pool errors may go unnoticed by application logic. Fix: Emit error via application-specific event bus or metric.

### Overall Verdict

This bundle contains critical data integrity issues in migrations (foreign key type mismatches) that will break production. The authentication stack has significant security gaps in session validation and rate-limiting fallbacks. While the PostGIS integration and schema design show thoughtful planning, the implementation details reveal insufficient validation, error handling, and security hardening. The migrations must be corrected before deployment, and the auth module requires substantial reinforcement to prevent bypass and abuse.

---
⏱  129441ms (129.4s)
📊 Tokens — total: 16055, input: 10513, output: 5542, reasoning: 4202
