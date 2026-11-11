# WF3 account delete: OUTPUT panel record (2026-11-11)

Fix: MF-52 D-1 (a) and D-3, MF-47 D-4. Operator ruling 2026-11-11, verbatim:
"D-1 a, D-3 y, D-4 y as long as they are complaint and we have grounded the claims".
Prepared under pre-approved sequencing D-37. Source findings: MF-52 plan panel
security F1, F2, F6.

Evidence: `red.json` (34 cases, 5 red on the old code: delete 404 with no row; no
marker for a subscription with no stored customer; portal opened for a deleted
account; exchange no row created; exchange opened Stripe with an unstored
customer) and `green.json` (34/34, after the folds below).

## Seats

| Seat | Verdict |
| --- | --- |
| Regression Guardian (`regression-guardian`) | PASS-WITH-FOLDS (0 HIGH, 1 MED, 2 LOW) |
| Code Reviewer (`code-reviewer-grounded`) | PASS-WITH-FOLDS (1 MED, 2 LOW) |
| Security (`general-purpose` acting as Security) | PASS-WITH-FOLDS (F1, F2, F6 closed; 2 LOW folds; 4 items for a ruling) |

Each fence on the deleted lines is kept or retired on purpose. The 404 on a missing
row is retired by D-1 (a), and a missing row after the insert is now a logged 500.
The idempotent 200 moved inside the transaction, under FOR UPDATE. The race-loser
adoption stays in the COALESCE store and its test passes unchanged. Only the 0-row
fallback (`?? created.id`) is retired, by D-4.

## Folded

- RG MED: the portal 403 now returns the same body as `user-profile/route.ts`
  (`account_deleted_at`, `days_remaining`). The mobile `AccountDeletedError` reads
  those two fields.
- RG LOW: the portal 403 now sends `Cache-Control: no-store`, as user-profile does.
- CR MED: the new exchange tests leaked queued once-values, so they failed under
  shuffle. The checkout mock is now queued only in the success case, and `afterEach`
  resets every stub. Shuffled seeds 1-5 pass, 34/34.
- CR LOW: the `isUuid` guard in delete was dead code, because `user_profiles.user_id`
  has been a UUID with an FK since migration 229:56-57 and the insert runs first.
  The guard is removed.
- CR LOW: an extra blank line in the test file is removed.
- SEC LOW: the delete comment said "GET"; it now says "PATCH". The row is created
  by PATCH (`user-profile/route.ts:141`), not GET.

## Not folded, with reasons

- CR LOW, weak red on the portal test (old code 500, not 200). Queueing a portal URL
  would leave an unconsumed once-value for the later Stripe-throw test after the
  fix. The red still shows that the old code called Stripe for a deleted account.
- RG LOW, no lock for an email-less row in exchange. It is a note only, and the
  behaviour is unchanged.
- SEC LOW, mobile `usePortalSession` has no `AccountDeletedError` branch (Sentry
  noise, wrong copy). It fails closed and mobile is outside this fix's scope.

## For an operator ruling (not built here)

- A. Exchange has no `account_deleted_at` check, and a webhook event blocked by the
  deletion fence sets no marker. A subscription paid after the delete is not
  cancelled. This is already on the MF-47 D-7(b) follow-up card.
- B. Admin retry-cancel clears the marker without calling Stripe when
  `stripe_customer_id` is null (`retry-cancel/route.ts:120-124`). That is exactly
  the rows this fix marks. Today the only guard is the runbook warning added here.
- C. Admin delete hard-deletes `auth.users` before its own UPDATE, so its marker
  cannot persist and it has no orphan-subscription check. This needs its own card,
  checked against a live DB.
- D. Before buyers ship, a one-time read-only check for legacy buyers whose Stripe
  customer was never stored.
