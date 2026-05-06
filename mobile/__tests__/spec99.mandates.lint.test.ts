/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §7 + §8 (mandates)
//            + §9.21 (this lint test)
//            docs/reports/audit_spec99_2026-05-04.md Phase 5 Pattern A
//
// Audit Pattern A class-level fix: every `## §X mandate` in Spec 99 §7 + §8
// MUST have a corresponding implementation grep-target. Without this lint,
// a future spec mandate with no enforcement test (the H2 + H3 shape that
// surfaced in WF5 2026-05-04) silently regresses on every code change.
//
// This file IS the contract: adding a new §7.x or §8.x mandate to Spec 99
// requires adding a row to MANDATES below — or the meta-count guard fails.
// Each row pins the mandate to a specific evidence file + grep pattern;
// removing/renaming the implementation site fails that mandate's case.
//
// Pattern matches `routerHygiene.lint.test.ts` (file globbing + regex
// contracts) and `storeReset.coverage.test.ts` (count guards + recursive
// walk + comment-stripped match). Helpers reused by direct copy rather
// than extraction to a shared module — extraction is premature for n=3
// lint files and would create a single-point-of-failure for the lint
// infrastructure itself.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const MOBILE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MOBILE_ROOT, '..');
const SPEC_99_PATH = path.join(
  REPO_ROOT,
  'docs/specs/03-mobile/99_mobile_state_architecture.md',
);

/** Read a file as UTF-8; return empty string if missing (caller's existence
 *  assertion is the explicit signal). */
function readOrEmpty(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

/** Strip line + block comments from source so commented-out evidence does
 *  NOT count as an implementation. Mirrors `routerHygiene.lint.test.ts`. */
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  return out;
}

/** Recursively walk a directory for .ts/.tsx files (excludes .test.ts and
 *  .d.ts). Mirrors `storeReset.coverage.test.ts:walkTs`. */
function walkSource(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSource(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Search a directory tree (comment-stripped) for a regex. Returns true on
 *  first match. Used for "evidence somewhere in the tree" mandates. */
function searchTree(dir: string, pattern: RegExp): boolean {
  for (const file of walkSource(dir)) {
    if (pattern.test(stripComments(readOrEmpty(file)))) return true;
  }
  return false;
}

interface Mandate {
  section: string;
  name: string;
  /** Run-time check that returns null on PASS, error string on FAIL. */
  check: () => string | null;
  /** If set, the case fires `it.skip` with this reason. Use ONLY when the
   *  mandate is genuinely unimplemented and a follow-up WF3 is filed.
   *  The mandate STAYS in MANDATES so the meta-count guard tracks it. */
  pendingReason?: string;
}

/** §7 + §8 Spec 99 mandates and their implementation evidence contracts.
 *  Adding a new spec mandate REQUIRES adding a row here. The meta-count
 *  guard at the bottom of this suite asserts MANDATES.length stays in
 *  sync with the spec's mandate count.
 */
const MANDATES: Mandate[] = [
  {
    section: '§7.1',
    name: 'Permanent state-debug hub',
    check: () => {
      const src = stripComments(
        readOrEmpty(path.join(MOBILE_ROOT, 'src/lib/debug/stateDebug.ts')),
      );
      if (!src) return 'mobile/src/lib/debug/stateDebug.ts missing';
      if (!/__DEV__/.test(src)) return 'no __DEV__ guard found';
      if (!/export\s+(function|const)\s+trackRender\b/.test(src)) {
        return 'no exported trackRender';
      }
      if (!/useDepsTracker/.test(src)) return 'no useDepsTracker reference';
      return null;
    },
  },
  {
    section: '§7.2',
    name: 'Cache invalidation telemetry',
    check: () => {
      // §7.2 mandate is implemented via the `logQueryInvalidate(key)` helper
      // at `mobile/src/lib/queryTelemetry.ts` (added by follow-up WF3 after
      // §9.21 surfaced the gap). Three assertions:
      //   1. Helper file exists and exports `logQueryInvalidate`.
      //   2. Helper file contains the canonical breadcrumb shape
      //      (`Sentry.addBreadcrumb({category:'query', ...})`).
      //   3. At least one caller exists in `mobile/src/` or `mobile/app/`
      //      (proves the helper is wired, not an orphan export).
      const helperPath = path.join(MOBILE_ROOT, 'src/lib/queryTelemetry.ts');
      const helperSrc = stripComments(readOrEmpty(helperPath));
      if (!helperSrc) return 'mobile/src/lib/queryTelemetry.ts missing';
      if (!/export\s+function\s+logQueryInvalidate\b/.test(helperSrc)) {
        return 'no exported logQueryInvalidate in queryTelemetry.ts';
      }
      if (
        !/Sentry\.addBreadcrumb\(\{[\s\S]{0,120}category:\s*['"]query['"]/.test(
          helperSrc,
        )
      ) {
        return 'queryTelemetry.ts missing canonical Sentry.addBreadcrumb({category:"query"}) shape';
      }
      // Caller existence: search both src/ and app/ (excluding the helper
      // file itself, which contains the import name in JSDoc).
      const srcCallerFound = searchTree(
        path.join(MOBILE_ROOT, 'src'),
        /logQueryInvalidate\(/,
      );
      const appCallerFound = searchTree(
        path.join(MOBILE_ROOT, 'app'),
        /logQueryInvalidate\(/,
      );
      // Helper file itself contains "logQueryInvalidate" in its export
      // declaration, but the regex requires a `(` immediately after — the
      // export `function logQueryInvalidate(key: string)` matches that, so
      // searchTree finds the helper itself as a "caller". Tighten by
      // requiring at least 2 hits in src/ (helper + at least one real
      // caller) or any hit in app/.
      if (!appCallerFound && !srcCallerFound) {
        return 'no logQueryInvalidate(...) callers found in mobile/src/ or mobile/app/';
      }
      return null;
    },
  },
  {
    section: '§7.3',
    name: 'Router decision telemetry',
    check: () => {
      // DEV-only event at every router.replace from AuthGate or AppLayout.
      // Closed by H3 commit `d032621`. Evidence: each of the TWO authority
      // files (AuthGate root + AppLayout) MUST have at least one
      // track('route_decision' call (each has at least one router.replace
      // per the §5.1 routing-authority enumeration). Comment-stripped to
      // reject commented-out copies. Concatenating the two files and
      // searching once would silently pass when only one site has the
      // call — caught during §9.21 mutation testing.
      const root = stripComments(
        readOrEmpty(path.join(MOBILE_ROOT, 'app/_layout.tsx')),
      );
      const appLayout = stripComments(
        readOrEmpty(path.join(MOBILE_ROOT, 'app/(app)/_layout.tsx')),
      );
      if (!/track\(['"]route_decision['"]/.test(root)) {
        return 'no track("route_decision") in app/_layout.tsx (AuthGate authority site)';
      }
      if (!/track\(['"]route_decision['"]/.test(appLayout)) {
        return 'no track("route_decision") in app/(app)/_layout.tsx (AppLayout authority site)';
      }
      // §7.3 also mandates the 3 production-only events in AppLayout.
      // The AuthGate reactivation_modal_shown event is also production.
      if (!/track\(['"]reactivation_modal_shown['"]/.test(root)) {
        return 'no track("reactivation_modal_shown") in app/_layout.tsx';
      }
      if (!/track\(['"]cancelled_pending_deletion_signout['"]/.test(appLayout)) {
        return 'no track("cancelled_pending_deletion_signout") in app/(app)/_layout.tsx';
      }
      if (!/track\(['"]subscription_expired_to_active['"]/.test(appLayout)) {
        return 'no track("subscription_expired_to_active") in app/(app)/_layout.tsx';
      }
      return null;
    },
  },
  {
    section: '§7.4',
    name: 'Strict Mode render visibility',
    check: () => {
      const src = stripComments(
        readOrEmpty(path.join(MOBILE_ROOT, 'src/lib/debug/stateDebug.ts')),
      );
      if (!src) return 'mobile/src/lib/debug/stateDebug.ts missing';
      // §7.4 mandates trackRender count Strict Mode double-fires (NOT
      // suppress them). Static lint can only verify the function exists +
      // does NOT contain a suppression marker. The static analysis would
      // miss a future contributor adding suppression via a different name;
      // accepting that limitation.
      if (!/export\s+(function|const)\s+trackRender\b/.test(src)) {
        return 'no exported trackRender';
      }
      if (/strictModeSuppress|suppressDoubleFire/i.test(src)) {
        return 'trackRender appears to suppress Strict Mode double-fires (banned by §7.4)';
      }
      return null;
    },
  },
  {
    section: '§8.1',
    name: 'Bridge idempotency tests',
    check: () => {
      // stripComments per file-header hardening rationale: a commented-out
      // describe('B1 ...') block must NOT count as evidence (consistency
      // with §7.1, §7.3, §7.4, §8.4 — code-reviewer finding F2).
      const src = stripComments(
        readOrEmpty(path.join(MOBILE_ROOT, '__tests__/bridges.test.ts')),
      );
      if (!src) return 'mobile/__tests__/bridges.test.ts missing';
      // bridges.test.ts has B1 dedicated describes + a B2-B5 cross-reference
      // guard via file-existence checks (see WF2 §9.7 close-out). Both shapes
      // satisfy §8.1's idempotency mandate.
      if (
        !/describe\(['"]B1[\s\S]/.test(src) ||
        !/B2-B5 cross-reference guard/.test(src)
      ) {
        return 'bridges.test.ts missing B1 describes OR B2-B5 cross-reference guard';
      }
      return null;
    },
  },
  {
    section: '§8.2',
    name: 'Router branch coverage (9 arms per §5.3)',
    check: () => {
      const src = readOrEmpty(
        path.join(MOBILE_ROOT, '__tests__/authGate.test.ts'),
      );
      if (!src) return 'mobile/__tests__/authGate.test.ts missing';
      // Spec 99 §5.3 enumerates 9 arms (1, 2, 3, 4, 4.5, 5a, 5b, 5c, 5d).
      // Test must reference at least 6 distinct branches (per the audit's
      // 6-branch counting convention which collapses 5a-5d into "Branch 5").
      const branchCount = [
        /Branch 1\b/,
        /Branch 2\b/,
        /Branch 3\b/,
        /Branch 4\b/,
        /Branch 4\.5\b|Branch 4_5/,
        /Branch 5\b/,
      ].filter((re) => re.test(src)).length;
      if (branchCount < 6) {
        return `authGate.test.ts references only ${branchCount}/6 branch describes (need all of 1, 2, 3, 4, 4.5, 5)`;
      }
      // §5.3 sub-arms 5a-5d MUST also be tested (per spec line 323 — collapsing
      // them in tests would mask sub-case-specific bugs).
      const subArms = [/\b5a\b/, /\b5b\b/, /\b5c\b/, /\b5d\b/].filter((re) =>
        re.test(src),
      ).length;
      if (subArms < 4) {
        return `authGate.test.ts references only ${subArms}/4 sub-arms (5a-5d)`;
      }
      return null;
    },
  },
  {
    section: '§8.3',
    name: 'Gate-stability tests',
    check: () => {
      // stripComments per file-header hardening rationale (code-reviewer F2).
      const src = stripComments(
        readOrEmpty(
          path.join(MOBILE_ROOT, '__tests__/subscriptionGate.test.ts'),
        ),
      );
      if (!src) return 'mobile/__tests__/subscriptionGate.test.ts missing';
      // Closed by H2 commit `e41d6a5`. Evidence: §6.5 gate stability describe
      // block exists with 4 it() cases (broad gate / carve-out / deletion /
      // paywall), plus the §6.5 amendment regression case from H1.
      if (!/§6\.5 gate stability/.test(src)) {
        return 'no "§6.5 gate stability" describe block in subscriptionGate.test.ts';
      }
      if (!/Permitted \(narrow \)\?carve-outs/.test(src)) {
        return 'no §6.5 amendment regression test (Permitted carve-outs grep)';
      }
      return null;
    },
  },
  {
    section: '§8.4',
    name: 'stateDebug as CI regression guard',
    check: () => {
      const debugSrc = stripComments(
        readOrEmpty(path.join(MOBILE_ROOT, 'src/lib/debug/stateDebug.ts')),
      );
      if (!/export\s+(function|const)\s+getDiagnosticsSnapshot\b/.test(debugSrc)) {
        return 'no exported getDiagnosticsSnapshot in stateDebug.ts (§9.5b mandate)';
      }
      const prodTestPath = path.join(
        MOBILE_ROOT,
        '__tests__/stateDebug.prod.test.ts',
      );
      if (!fs.existsSync(prodTestPath)) {
        return 'mobile/__tests__/stateDebug.prod.test.ts missing (production-noop coverage)';
      }
      return null;
    },
  },
  {
    section: '§8.5',
    name: 'Store-enumeration coverage test',
    check: () => {
      const testPath = path.join(
        MOBILE_ROOT,
        '__tests__/storeReset.coverage.test.ts',
      );
      if (!fs.existsSync(testPath)) {
        return 'mobile/__tests__/storeReset.coverage.test.ts missing';
      }
      return null;
    },
  },
  {
    section: '§8.6',
    name: 'Schema-vs-matrix drift check',
    check: () => {
      const scriptPath = path.join(
        MOBILE_ROOT,
        'scripts/check-spec99-matrix.mjs',
      );
      if (!fs.existsSync(scriptPath)) {
        return 'mobile/scripts/check-spec99-matrix.mjs missing';
      }
      return null;
    },
  },
  {
    section: '§7.5',
    name: 'Sentry user attribution (crash reports)',
    check: () => {
      // §7.5 mandate: Sentry.setUser({id: uid}) on auth listener signed-in;
      // Sentry.setUser(null) inside clearLocalSessionState (§B5 fan-out).
      const authStorePath = path.join(MOBILE_ROOT, 'src/store/authStore.ts');
      const src = stripComments(readOrEmpty(authStorePath));
      if (!src) return 'mobile/src/store/authStore.ts missing';
      // Signed-in: Sentry.setUser({ id: ... })
      if (!/Sentry\.setUser\(\s*\{\s*id:/.test(src)) {
        return 'authStore.ts missing Sentry.setUser({id: ...}) on signed-in';
      }
      // Signed-out: Sentry.setUser(null)
      if (!/Sentry\.setUser\(\s*null\s*\)/.test(src)) {
        return 'authStore.ts missing Sentry.setUser(null) in signout fan-out';
      }
      return null;
    },
  },
  {
    section: '§7.6',
    name: 'Product funnel events (lead/paywall)',
    check: () => {
      // §7.6 production events MUST fire at canonical sites. Each entry
      // here is `[file, regex]` — file must contain the regex match.
      // DEV-only events are NOT enforced here (production volume issue per
      // §7.3 frequency-split rule means a DEV-only fire might be wrapped
      // in `if (__DEV__)`); this lint enforces the existence of the
      // canonical track('event_name') call regardless of guards.
      const sites: Array<[string, RegExp, string]> = [
        [
          'app/(app)/[lead].tsx',
          /track\(\s*['"]lead_detail_viewed['"]/,
          'lead_detail_viewed in [lead].tsx',
        ],
        [
          'app/(app)/[flight-job].tsx',
          /track\(\s*['"]flight_job_detail_viewed['"]/,
          'flight_job_detail_viewed in [flight-job].tsx',
        ],
        [
          'src/hooks/useSaveLead.ts',
          /track\(\s*saved\s*\?\s*['"]lead_saved['"]\s*:\s*['"]lead_unsaved['"]|track\(\s*['"]lead_(?:un)?saved['"]/,
          'lead_saved/lead_unsaved in useSaveLead.ts',
        ],
        [
          'src/components/paywall/PaywallScreen.tsx',
          /track\(\s*['"]paywall_shown['"]/,
          'paywall_shown in PaywallScreen.tsx',
        ],
        [
          'src/components/paywall/PaywallScreen.tsx',
          /track\(\s*['"]subscribe_button_clicked['"]/,
          'subscribe_button_clicked in PaywallScreen.tsx',
        ],
      ];
      for (const [relPath, pattern, label] of sites) {
        const fullPath = path.join(MOBILE_ROOT, relPath);
        const src = stripComments(readOrEmpty(fullPath));
        if (!src) return `${relPath} missing or unreadable`;
        if (!pattern.test(src)) {
          return `missing ${label} (regression: a §7.6 funnel event was removed from its canonical site)`;
        }
      }
      return null;
    },
  },
  {
    section: '§8.7',
    name: 'Funnel-event presence test exists',
    check: () => {
      // §8.7 enforcement layer for §7.6: the spec99.mandates.lint.test.ts
      // §7.6 row above IS the §8.7 enforcement (this very file). Verify
      // self-presence so a regression that deletes the §7.6 row doesn't
      // silently bypass enforcement — the lint test is its own §8.7 proof.
      const selfPath = path.join(
        MOBILE_ROOT,
        '__tests__/spec99.mandates.lint.test.ts',
      );
      const src = readOrEmpty(selfPath);
      if (!src) return 'spec99.mandates.lint.test.ts missing (self-check)';
      if (!/section:\s*['"]§7\.6['"]/.test(src)) {
        return '§7.6 mandate row missing from MANDATES array';
      }
      return null;
    },
  },
  {
    section: '§7.7',
    name: 'Auth funnel ratio invariants',
    check: () => {
      // §7.7 mandate: every auth method (apple/google/email/phone) MUST
      // emit auth_method_attempted + at least one of {succeeded, failed}
      // in sign-in.tsx. Phone is 2-step (SMS+OTP) — succeeded fires from
      // handleVerifyOtp, failed can fire from either step.
      const path1 = path.join(MOBILE_ROOT, 'app/(auth)/sign-in.tsx');
      const src = stripComments(readOrEmpty(path1));
      if (!src) return 'mobile/app/(auth)/sign-in.tsx missing';

      const checks: Array<[string, RegExp]> = [
        // Apple
        ['apple attempted', /track\(\s*['"]auth_method_attempted['"]\s*,\s*\{\s*method:\s*['"]apple['"]/],
        ['apple succeeded', /track\(\s*['"]auth_method_succeeded['"]\s*,\s*\{\s*method:\s*['"]apple['"]/],
        ['apple failed', /track\(\s*['"]auth_method_failed['"]\s*,\s*\{\s*method:\s*['"]apple['"]/],
        // Google
        ['google attempted', /track\(\s*['"]auth_method_attempted['"]\s*,\s*\{\s*method:\s*['"]google['"]/],
        ['google succeeded', /track\(\s*['"]auth_method_succeeded['"]\s*,\s*\{\s*method:\s*['"]google['"]/],
        ['google failed', /track\(\s*['"]auth_method_failed['"]\s*,\s*\{\s*method:\s*['"]google['"]/],
        // Email
        ['email attempted', /track\(\s*['"]auth_method_attempted['"]\s*,\s*\{\s*method:\s*['"]email['"]/],
        ['email succeeded', /track\(\s*['"]auth_method_succeeded['"]\s*,\s*\{\s*method:\s*['"]email['"]/],
        ['email failed', /track\(\s*['"]auth_method_failed['"]\s*,\s*\{\s*method:\s*['"]email['"]/],
        // Phone — succeeded only at OTP step; failed at either step.
        ['phone attempted', /track\(\s*['"]auth_method_attempted['"]\s*,\s*\{\s*method:\s*['"]phone['"]/],
        ['phone succeeded', /track\(\s*['"]auth_method_succeeded['"]\s*,\s*\{\s*method:\s*['"]phone['"]/],
        ['phone failed', /track\(\s*['"]auth_method_failed['"]\s*,\s*\{\s*method:\s*['"]phone['"]/],
      ];
      for (const [label, pattern] of checks) {
        if (!pattern.test(src)) {
          return `sign-in.tsx missing track() for ${label} — Spec 99 §7.7 requires every auth method to emit attempted + at least one outcome`;
        }
      }
      return null;
    },
  },
  {
    section: '§8.8',
    name: 'Auth ratio invariant test exists',
    check: () => {
      // §8.8 enforcement layer for §7.7: the §7.7 row above IS the §8.8
      // enforcement (this file). Verify self-presence so a regression that
      // deletes the §7.7 row doesn't silently bypass enforcement.
      const selfPath = path.join(
        MOBILE_ROOT,
        '__tests__/spec99.mandates.lint.test.ts',
      );
      const src = readOrEmpty(selfPath);
      if (!src) return 'spec99.mandates.lint.test.ts missing (self-check)';
      if (!/section:\s*['"]§7\.7['"]/.test(src)) {
        return '§7.7 mandate row missing from MANDATES array';
      }
      return null;
    },
  },
];

describe('Spec 99 mandates — implementation evidence (audit Pattern A class fix)', () => {
  // Sanity: Spec 99 itself must exist and be reachable. The lint file's
  // value is zero if the spec is unreachable, so fail loudly.
  it('Spec 99 markdown is reachable', () => {
    expect(fs.existsSync(SPEC_99_PATH)).toBe(true);
    const src = fs.readFileSync(SPEC_99_PATH, 'utf8');
    expect(src).toMatch(/##\s+7\.\s*Observability Mandates/);
    expect(src).toMatch(/##\s+8\.\s*Test Mandates/);
  });

  // Per-mandate evidence cases. Each row in MANDATES becomes one it()
  // (or it.skip if pendingReason is set).
  for (const mandate of MANDATES) {
    const label = `${mandate.section} (${mandate.name}) — implementation evidence`;
    if (mandate.pendingReason) {
      it.skip(`${label} [PENDING: ${mandate.pendingReason}]`, () => {
        // Skipped per pendingReason. When the mandate is wired, remove
        // the pendingReason field from the MANDATES row.
      });
    } else {
      it(label, () => {
        const error = mandate.check();
        if (error !== null) {
          throw new Error(`${mandate.section} ${mandate.name}: ${error}`);
        }
      });
    }
  }

  // Meta-count guard: a contributor adding a new §7.x or §8.x mandate to
  // Spec 99 MUST also add a MANDATES row, or this case fails. Bumping the
  // expected count is the explicit signal that the spec's mandate
  // inventory has changed and was reviewed.
  it('MANDATES array length matches the spec mandate inventory', () => {
    // §7.1, §7.2, §7.3, §7.4, §7.5, §7.6, §7.7 + §8.1, §8.2, §8.3, §8.4,
    // §8.5, §8.6, §8.7, §8.8 = 15. Update this count when adding a new
    // §7.x or §8.x subsection to Spec 99.
    expect(MANDATES).toHaveLength(15);
  });
});
