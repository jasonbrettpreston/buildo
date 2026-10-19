// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gates F, G, I), §7 rung ladder (LM-D14)
//
// Did a live `node scripts/analysis/step-validate.mjs --all --fast` run actually LOOK?
//
// step-validate prints its per-step summary only at the END of the run. A spawn
// that was killed (timeout, maxBuffer) or crashed leaves an empty or partial
// stdout, and a test that only asserts "stdout does not mention a FAIL" is then
// green because it never looked (Spec 124 §7 LM-D14). Measured 2026-10-14 (WF3
// lane D4): a direct run takes 214 s; the tests' spawn timeout was 180 s; a
// timed-out spawn returns status null, signal SIGTERM, error ETIMEDOUT, 0 rows.
//
// Replaces: score-floor T6's inline row regex + `> 0` guard, and the absent
// guard in gate-captures T6e and gate-registries T8b.

/** One summary row of a `--all` run: `  <slug>: <n>/17 hard-stop=...`. */
const SCORE_ROW = /^\s*(\S+): (\d+)\/17 hard-stop=/gm;
const SUMMARY_HEADER = '[step-validate] summary:';

export interface StepValidateRun {
  status: number | null;
  signal: string | null;
  error?: { code?: string } | Error | null;
  stdout?: string | null;
}

/** The summary's score rows, in print order. */
export function parseSummaryScores(stdout: string): Array<{ slug: string, total: number, maxTotal: number }> {
  return [...String(stdout).matchAll(SCORE_ROW)].map((m) => ({ slug: m[1] as string, total: Number(m[2]), maxTotal: 17 }));
}

/**
 * Why this run did NOT look; `[]` means it completed and printed a score row for
 * at least every converted step. Exit 1 is a completed run (a hard stop still
 * prints the summary); any other non-zero exit is not.
 */
export function notLookedReasons(run: StepValidateRun, convertedCount: number): string[] {
  const reasons: string[] = [];
  const stdout = `${run.stdout || ''}`;
  const code = run.error && (run.error as { code?: string }).code;
  if (run.error) reasons.push(`spawn error ${code || String(run.error)}`);
  if (run.signal) reasons.push(`killed by ${run.signal}`);
  if (run.status !== 0 && run.status !== 1) reasons.push(`exit ${run.status}`);
  if (!stdout.includes(SUMMARY_HEADER)) reasons.push('no summary header');
  const n = parseSummaryScores(stdout).length;
  if (n < convertedCount) reasons.push(`${n} score rows < ${convertedCount} converted`);
  return reasons;
}

/** A summary row step-validate labels non-blocking (`--all`: only the R-DU no-descriptor pending row). */
const NON_BLOCKING_ROW = /^\s*(\S+): \d+\/17 hard-stop=\S+ \(non-blocking:/gm;

/** The slugs the summary labels non-blocking, in print order. */
export function parseNonBlockingSlugs(stdout: string): string[] {
  return [...String(stdout).matchAll(NON_BLOCKING_ROW)].map((m) => m[1] as string);
}

/**
 * Spec 124 R-DU: the manifest slugs of the pending[] entries whose descriptor FILE is absent (an
 * early ①). Keyed on the file, never the stage label; a converted entry is never returned.
 * Pure over the injected `exists(relPath)`.
 */
export function pendingNoDescriptorSlugs(
  converted: { pending?: Array<string | { file: string }> },
  scripts: Record<string, { file?: string }>,
  exists: (rel: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const p of converted.pending || []) {
    const file = typeof p === 'string' ? p : p.file;
    if (exists(file.replace(/\.(js|py)$/, '') + '.descriptor.json')) continue;
    const slug = Object.entries(scripts).find(([, e]) => e.file === file)?.[0];
    if (!slug) throw new Error(`no manifest.scripts entry points at ${file}`);
    out.push(slug);
  }
  return out;
}

/**
 * Each pending slug's DECLARED stage (converted.json pending[].stage), by manifest slug: the input gate F T6 hands
 * to step-validate's stageAwaitsCaptures (W4A-R6 amended, Spec 124 R-EF). A converted step has no entry.
 */
export function pendingStageBySlug(
  converted: { pending?: Array<string | { file: string; stage?: string }> },
  scripts: Record<string, { file?: string }>,
): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const p of converted.pending || []) {
    const file = typeof p === 'string' ? p : p.file;
    const slug = Object.entries(scripts).find(([, e]) => e.file === file)?.[0];
    if (!slug) throw new Error(`no manifest.scripts entry points at ${file}`);
    out.set(slug, typeof p === 'string' ? undefined : p.stage);
  }
  return out;
}

/** Split summary scores into the gated rows and the R-DU no-descriptor pending rows, by slug. */
export function rduScoreScope<T extends { slug: string }>(scores: T[], noDescriptorSlugs: string[]): { gated: T[], skipped: string[] } {
  const skip = new Set(noDescriptorSlugs);
  return { gated: scores.filter((s) => !skip.has(s.slug)), skipped: scores.filter((s) => skip.has(s.slug)).map((s) => s.slug) };
}
