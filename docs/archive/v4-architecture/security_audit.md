# Security & Authorization Audit Report

## 1. Executive Summary
This report evaluates the current security posture of the Buildo application, focusing on authentication implementation, API protections, database safety, and third-party dependency vulnerabilities.

Currently, the application faces **Critical** security risks due to the architectural gap between the planned authentication specification (`13_auth.md`) and the actual physical codebase.

---

## 2. Identified Vulnerabilities

### **A. Unimplemented Authentication (Critical)**
- **Finding:** The application currently runs entirely unauthenticated. 
- **Detail:** Specification `13_auth.md` thoroughly defines a secure architecture using Firebase Auth JWTs, HTTP-only session cookies (`__session`), and a Next.js `middleware.ts` to protect all API endpoints. However, a codebase scan reveals that **none of this is implemented**. There is no `middleware.ts` file, and the `/api/auth` endpoints do not exist.
- **Risk:** All active Next.js API routes residing in `src/app/api` (including `/admin`, `/sync`, and user data endpoints) are publicly exposed to the open internet. Anyone with the URL can trigger data mutations or run costly database sync scripts.

### **B. Dependency Vulnerabilities (High)**
An `npm audit` returned **10 known vulnerabilities** (3 High, 6 Moderate, 1 Low).
- **`rollup` (High):** Arbitrary File Write via Path Traversal. 
- **`xlsx` (High):** Prototype Pollution and Regular Expression Denial of Service (ReDoS) in the `sheetJS` engine.
- **`minimatch` & `fast-xml-parser` (Moderate):** Multiple ReDoS vulnerabilities.
- **Risk:** While some of these (like `rollup`) only affect the build pipeline, the `xlsx` vulnerability is particularly dangerous if the application ever accepts spreadsheet uploads from unauthenticated or malicious users.

### **C. Database Connection Permissions (Moderate)**
- **Finding:** The schema (`01_database_schema.md`) uses a raw `pg` connection string to connect to PostgreSQL. 
- **Detail:** The database does not utilize Row Level Security (RLS) policies. This architectural choice pushes 100% of the authorization burden onto the API layer.
- **Risk:** Because the API layer is currently unauthenticated (Finding A), an attacker finding an injection flaw or simply calling an administrative endpoint has full `SELECT/INSERT/UPDATE/DELETE` access to the entire 240,000+ permit dataset.

---

## 3. Strategic Action Plan

To secure the application for production, the engineering team must immediately execute the following steps in order:

### **Phase 1: Lock Down the Perimeter**
1. **Implement `src/middleware.ts`:** Do not build the complex UI login forms yet. Simply build the Next.js middleware router to globally block all requests to `/api/*` (except public data feeds if necessary). Hardcode the rejection to return `401 Unauthorized` for now to stop bleeding.
2. **Implement API Route Guards:** Inside critical mutating endpoints (e.g., `src/app/api/admin`), add manual verification checks to ensure the caller has administrative privileges. 

### **Phase 2: Patch the Package Supply Chain**
1. **Run `npm audit fix`:** This will automatically resolve the `minimatch`, `rollup`, and `fast-xml-parser` vulnerabilities by bumping their semantic versions.
2. **Isolate `xlsx`:** The `xlsx` package has no automated fix available for its ReDoS vulnerability. Ensure that the codebase *only* uses this library to parse strictly internal, trusted files (e.g., administrator-provided seed files). NEVER pass a user-uploaded file into `xlsx.read()`.

### **Phase 3: Complete Spec 13 (Authentication)**
1. **Wire Firebase Admin:** Build the server-side JWT verification engine.
2. **Create the Session Endpoints:** Implement POST `/api/auth/session` to generate the secure, 14-day `httpOnly` cookie.
3. **Connect the UI:** Once the backend is secure, build the `LoginForm.tsx` and `SignupForm.tsx` to allow legitimate tradespeople to access the system safely.
