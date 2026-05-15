# Deferred WF3: @sentry/react-native v7→v8 upgrade for RN 0.81 + New Architecture
**Status:** Deferred — awaiting pickup
**Workflow:** WF3 — Fix
**Domain Mode:** Admin (mobile/ Expo source)
**Filed:** 2026-05-15
**Rollback Anchor:** 4605a6e0f7032d06a20c09cd82f58426c1cd3a91
**Source:** docs/reports/review_followups.md → "WF2 Spec 93 RNFirebase migration — Round 2 review" → WF3 candidates table

## Bug
`mobile/package.json` pins `@sentry/react-native` at `~7.2.0`. GitHub issue sentry/sentry-react-native#5161 documents that v7.0.x and v7.2.x fail to compile on React Native 0.81 with `newArchEnabled: true` due to a missing/relocated `sentry-xcode.sh` path. The Buildo project runs RN 0.81.5 with `newArchEnabled: true` (per `mobile/app.json`), which means any iOS EAS build will fail at the Xcode compile step. Android is unaffected today (the Android build path does not hit this script). The first iOS production build attempt will surface this as an EAS failure — better to bump preemptively.

## Reproduction Test
N/A in unit tests (this is a build-toolchain issue). Reproduction is an actual `eas build --platform ios` (or `npx expo run:ios` on a Mac) — confirm it fails with the documented Xcode error from sentry/sentry-react-native#5161, then re-run after the bump and confirm success.

## Fix Sketch
- Bump `@sentry/react-native` from `~7.2.0` to `^8.0.0` in `mobile/package.json`
- Run the v7→v8 migration guide — primary changes are around `Sentry.init` options shape and source-map upload config
- Check `mobile/app.json` plugin entry: currently `@sentry/react-native/app-plugin` per Spec 93 §5 Step 0; v8 may change the plugin export path — confirm the v8 exports map preserves that name or update accordingly
- Validate: `npm install --legacy-peer-deps`, `npx expo prebuild --clean`, `npx expo run:android` (Android still works), then iOS dev build if available

## WF3 Execution Checklist
- [ ] Rollback Anchor (this file's SHA above)
- [ ] State Verification: confirm the bug still reproduces against current main (check `mobile/package.json` still at `~7.2.0` and `mobile/app.json` still has `newArchEnabled: true`)
- [ ] Spec Review: re-read the cited spec sections (90 §11 Observability, 93 §5 Step 0 plugin entry)
- [ ] Reproduction: attempt `eas build --platform ios` or `npx expo run:ios` to confirm Xcode build failure
- [ ] Red Light: confirm build fails with the expected Xcode error
- [ ] Fix: apply the change per Fix Sketch
- [ ] Pre-Review Self-Checklist: 3-5 sibling concerns (e.g., Sentry.init options shape changed in v8 — check `mobile/src/lib/sentry.ts` or wherever Sentry is initialized; source-map upload config in `app.json` plugin entry; Android build regression; `transformIgnorePatterns` in `mobile/package.json` still covers `@sentry/react-native` after the bump)
- [ ] Independent Review: one code-reviewer agent (isolation: worktree)
- [ ] Green Light: `cd mobile && npx jest && npx tsc --noEmit && npm run lint -- --fix`
- [ ] WF6 commit per Spec 05 §5 footer schema

## Cross-references
- Original migration commits: 77cbf18, 42fa9e0, 1bc42c2
- Round-2 review surface: docs/reports/review_followups.md
- Spec: 90_mobile_engineering_protocol §11 (Observability) + 93_mobile_auth §5 Step 0 (plugin entry)
