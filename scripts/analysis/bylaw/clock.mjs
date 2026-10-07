// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (snapshot_age_days), §10 (determinism rules)
//
// The ONE module under scripts/analysis/bylaw/ allowed to read the clock (Spec 68 §10: the
// determinism grep lock names clock.mjs as its only exemption). Fetch times are recorded here
// at fetch, never taken from file mtimes (Spec 68 §6.4 rule 10).

/** Current UTC time as an ISO-8601 string. */
export function nowIso() {
  return new Date().toISOString();
}

/** Resolve after `ms` milliseconds (polite pacing between page fetches). */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
