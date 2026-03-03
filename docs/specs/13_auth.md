# Feature: Authentication

**Status:** In Progress
**Last Updated:** 2026-03-03

## 1. User Story
"As a user, I want to sign up and log in with Google or email so I can save my preferences and track leads."

## 2. Technical Logic

### Authentication Flow
* **Provider:** Firebase Authentication with two providers: Google OAuth 2.0 and email/password.
* **Token Flow:** Firebase issues an ID token (JWT) on successful auth. The client sends this token to a Next.js API route (`/api/auth/session`), which verifies the token server-side using the Firebase Admin SDK, then sets an `httpOnly` secure cookie (`__session`) containing the verified token. All subsequent API requests read this cookie for authentication.
* **Session Management:** The `__session` cookie has a 14-day expiry. A background token refresh occurs client-side via Firebase SDK's `onIdTokenChanged` listener, which POSTs the refreshed token to `/api/auth/session` to update the cookie. On logout, the cookie is cleared via `/api/auth/logout`.

### Account Types
Three account types, stored in the user's Firestore document:
| Type | Value | Description |
|------|-------|-------------|
| Individual | `tradesperson` | A solo tradesperson (plumber, electrician, etc.) |
| Company | `company` | A construction company with multiple team members |
| Supplier | `supplier` | A material supplier (concrete, lumber, etc.) |

### User Profile (Firestore)
Document path: `/users/{uid}`
```typescript
interface UserProfile {
  uid: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  account_type: 'tradesperson' | 'company' | 'supplier';
  onboarding_completed: boolean;
  created_at: Timestamp;
  last_login_at: Timestamp;
}
```

### Route Protection
* **Middleware:** `src/middleware.ts` intercepts all requests to protected routes (`/dashboard/*`, `/permits/*`, `/map/*`, `/search/*`, `/onboarding/*`).
* **Logic:** Middleware reads the `__session` cookie, verifies the JWT signature and expiry using Firebase Admin SDK, and extracts the `uid`. If invalid or missing, redirects to `/login`. If valid but `onboarding_completed === false`, redirects to `/onboarding`.
* **Public routes:** `/`, `/login`, `/signup`, `/api/auth/*` are always accessible.

### State Machine: Auth States
```
UNAUTHENTICATED -> AUTHENTICATING -> AUTHENTICATED -> ONBOARDING -> ACTIVE
                                  -> AUTH_ERROR -> UNAUTHENTICATED
AUTHENTICATED -> LOGGING_OUT -> UNAUTHENTICATED
```

## 3. Associated Files

**Architecture note:** Auth is client-side Firebase SDK. Middleware exists and classifies routes
as public/authenticated/admin. Admin API routes require `__session` cookie (JWT) or `X-Admin-Key`
header. Full JWT verification via Firebase Admin SDK is planned but not yet connected.

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/auth/config.ts` | Firebase client SDK initialization (replaces planned `firebase.ts`) | Implemented |
| `src/lib/auth/types.ts` | Auth TypeScript interfaces | Implemented |
| `src/lib/auth/session.ts` | Client-side auth logic (signUp, signIn, Google, signOut, preferences) | Implemented |
| `src/lib/auth/route-guard.ts` | Route classification (public/authenticated/admin) and session cookie validation | Implemented |
| `src/middleware.ts` | Next.js middleware — blocks unauthenticated admin/mutation API access, redirects protected pages to /login | Implemented |
| `src/app/login/page.tsx` | Login page (no auth route group) | Implemented |
| `src/components/auth/LoginForm.tsx` | Combined login/signup form with Google auth (replaces planned separate components) | Implemented |
| `src/tests/auth.logic.test.ts` | Basic auth type tests | Implemented |
| `src/tests/middleware.logic.test.ts` | Route classification, session cookie validation, file existence tests (30 tests) | Implemented |
| `src/lib/auth/firebase-admin.ts` | Firebase Admin SDK (server-side token verification) | Planned |
| `src/app/api/auth/session/route.ts` | Server-side session cookie management | Planned |
| `src/components/auth/AuthGuard.tsx` | Client-side auth state wrapper | Planned |
| `src/tests/auth.ui.test.tsx` | Auth component tests | Planned |
| `src/tests/auth.infra.test.ts` | Auth integration tests | Planned |

## 4. Constraints & Edge Cases

### Constraints
* Firebase Auth free tier: 10K phone auths/month (not applicable here), unlimited email/Google.
* JWT tokens expire after 1 hour; cookie must be refreshed before expiry.
* `httpOnly` cookies cannot be read by client-side JavaScript (security requirement).
* Firestore user document must be created atomically on first login (use `setDoc` with `merge: true`).

### Edge Cases
* **User signs up with email, then tries Google with same email:** Firebase links accounts automatically if email is verified. Handle `auth/account-exists-with-different-credential` error and prompt user to link.
* **Cookie expired but Firebase token still valid:** Middleware rejects; client-side listener should have refreshed. Fallback: redirect to login.
* **Concurrent tab sessions:** All tabs share the same cookie; token refresh in one tab updates for all.
* **User deletes account:** Firebase Auth deletion triggers cleanup Cloud Function to delete Firestore `/users/{uid}` document and all subcollections.
* **Network failure during OAuth popup:** Firebase SDK handles retry; display error toast if popup closed without completing.
* **Middleware on static assets:** Exclude `/_next/*`, `/favicon.ico`, `/public/*` from middleware matcher.

## 5. Data Schema

### Firestore: `/users/{uid}`
```
{
  uid:                   string       // Firebase Auth UID
  email:                 string       // User email
  display_name:          string       // Display name
  photo_url:             string|null  // Profile photo URL (from Google or uploaded)
  account_type:          string       // "tradesperson" | "company" | "supplier"
  onboarding_completed:  boolean      // false until onboarding wizard finishes
  created_at:            timestamp    // First login timestamp
  last_login_at:         timestamp    // Most recent login timestamp
}
```

### Session Cookie: `__session`
```
{
  value:     string   // Firebase ID token (JWT)
  httpOnly:  true
  secure:    true
  sameSite:  "lax"
  path:      "/"
  maxAge:    1209600  // 14 days in seconds
}
```

## 6. Integrations

### Internal
* **Onboarding (Spec 14):** After first login with `onboarding_completed === false`, middleware redirects to `/onboarding`.
* **All Dashboard specs (15, 16, 17):** Dashboard API routes require authenticated `uid` from session cookie to load user-specific data.
* **Firestore user document:** Shared by all features that need user preferences, saved permits, saved searches.

### External
* **Firebase Authentication:** Google OAuth 2.0 provider, email/password provider.
* **Firebase Admin SDK:** Server-side token verification via `verifyIdToken()`.
* **Cloud Firestore:** User profile storage at `/users/{uid}`.
* **Google OAuth 2.0:** For Google sign-in flow (consent screen, redirect URI configuration).

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`auth.logic.test.ts`)
* [ ] **Rule 1:** Verify JWT token validation accepts valid tokens and rejects expired/malformed tokens.
* [ ] **Rule 2:** Verify role/account_type extraction from Firestore user document returns correct type.
* [ ] **Rule 3:** Verify session expiry logic: cookie older than 14 days is rejected.
* [ ] **Rule 4:** Verify auth state machine transitions: UNAUTHENTICATED -> AUTHENTICATED -> ACTIVE.
* [ ] **Rule 5:** Verify `onboarding_completed` flag correctly gates redirect to onboarding.
* [ ] **Rule 6:** Verify account linking logic when email matches existing account with different provider.

### B. UI Layer (`auth.ui.test.tsx`)
* [ ] **Rule 1:** Login form renders email and password inputs with validation (required, email format).
* [ ] **Rule 2:** Signup form renders email, password, confirm password, and account type selector.
* [ ] **Rule 3:** Google OAuth button renders and triggers `signInWithPopup` on click.
* [ ] **Rule 4:** Error states display correctly: invalid credentials, network error, account-exists.
* [ ] **Rule 5:** Loading state shown during authentication (spinner/disabled button).
* [ ] **Rule 6:** Successful login redirects to `/dashboard` (or `/onboarding` for new users).

### C. Infra Layer (`auth.infra.test.ts`)
* [ ] **Rule 1:** Firebase Auth integration: `createUserWithEmailAndPassword` creates user.
* [ ] **Rule 2:** Firestore user document created at `/users/{uid}` on first login.
* [ ] **Rule 3:** Session cookie set correctly with `httpOnly`, `secure`, `sameSite` attributes.
* [ ] **Rule 4:** Middleware correctly blocks unauthenticated access to protected routes.
* [ ] **Rule 5:** Middleware allows access to public routes without authentication.
* [ ] **Rule 6:** Token refresh endpoint updates session cookie with new token.
