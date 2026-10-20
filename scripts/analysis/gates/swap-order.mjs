// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EQ (P4-SWAP; codifies W4A-R6 "runner_wired at
//            the shell swap before P4"), R-EF (stageAwaitsCaptures), R-K (the closed stage vocabulary)
//
import fs from 'node:fs';
import path from 'node:path';

// FAST INVARIANT #54 SWAP-ORDER. A pending step may swap its frozen shell onto the runner before ③ — declared stage
// `runner_wired` (and the later shape_clean* stages) — only after every upstream step it declares
// (`inputs.reads.steps[]`) has itself swapped or been captured: the upstream is CONVERTED, or PENDING at a stage that
// is past ② and enforces its POST captures (not red_suite, and not stageAwaitsCaptures). So no step swaps before its
// producers, the coa root first (R-EQ: "no earlier than the coa root ②"). The swapped step's own POST captures the
// same night are enforced by G8, which runner_wired does not exclude (stageExclusions). Converted[] registration and
// the legacy-name retirement migration stay ③'s (EP-PIN-D17); nothing here touches them.
//
// PURE over declared files: converted.json stages, the manifest slug → file map and each descriptor's
// inputs.reads.steps. Exact zero-tolerance; no allowlist, no literal. A slug the manifest does not know is a FAIL
// (never a silent pass).

/** The stages at which a pending step's shell is swapped onto the runner (R-K vocabulary; the R-EQ subject set). */
export const SWAPPED_STAGES = Object.freeze(['runner_wired', 'shape_clean', 'shape_clean_pending_recapture']);

/**
 * @param {{converted: string[], pending: Array<{file: string, stage: string}>, scripts: Record<string, {file: string}>,
 *   descriptorOf: (relFile: string) => object|null}} input
 * @param {(stage: string) => boolean} awaitsCaptures step-validate's stageAwaitsCaptures (R-EF), injected
 * @returns {{pass: boolean, violations: string[], blockedSlugs: string[], detail: string}}
 */
export function checkSwapOrder(input, awaitsCaptures) {
  const converted = new Set(Array.isArray(input.converted) ? input.converted : []);
  const pendingStage = new Map((Array.isArray(input.pending) ? input.pending : [])
    .filter((p) => p && typeof p === 'object').map((p) => [p.file, p.stage]));
  const fileOf = (slug) => (input.scripts && input.scripts[slug] && input.scripts[slug].file) || null;
  const slugOf = new Map(Object.entries(input.scripts || {}).map(([slug, v]) => [v && v.file, slug]));
  const ready = (stage) => typeof stage === 'string' && stage !== 'red_suite' && !awaitsCaptures(stage);
  const violations = [];
  const blocked = new Set();
  for (const [file, stage] of pendingStage) {
    if (!SWAPPED_STAGES.includes(stage)) continue;
    const slug = slugOf.get(file) || file;
    const d = input.descriptorOf(file);
    const ups = d && d.inputs && d.inputs.reads && Array.isArray(d.inputs.reads.steps) ? d.inputs.reads.steps : [];
    for (const u of ups) {
      const up = u && typeof u === 'object' ? u.step : u;
      if (typeof up !== 'string' || up === slug) continue;
      const upFile = fileOf(up);
      let why = null;
      if (!upFile) why = 'not a manifest step';
      else if (converted.has(upFile)) why = null;
      else if (!pendingStage.has(upFile)) why = 'unconverted, not in pending[] (neither swapped nor captured)';
      else if (!ready(pendingStage.get(upFile))) why = `pending at ${pendingStage.get(upFile)} (not swapped, POST not enforced)`;
      if (why) {
        violations.push(`${slug} (${stage}) ← ${up}: ${why}`);
        blocked.add(slug);
      }
    }
  }
  return {
    pass: violations.length === 0,
    violations,
    blockedSlugs: [...blocked].sort(),
    detail: violations.length === 0
      ? 'every swapped pending step\'s declared upstreams are converted or swapped (R-EQ)'
      : `${violations.length} swap-order violation(s) (R-EQ): ${violations.join('; ')}`,
  };
}

/** In-memory fixtures. Throws on the first failure. */
export function selfTest() {
  const awaits = (s) => ['descriptor_only', 'compute_ported', 'shape_clean_pending_recapture'].includes(s);
  const scripts = { coa: { file: 'c.js' }, scope: { file: 's.js' }, legacy: { file: 'l.js' } };
  const desc = { 's.js': { inputs: { reads: { steps: [{ step: 'coa' }] } } }, 'c.js': { inputs: { reads: { steps: [] } } } };
  const run = (pending, converted = []) => checkSwapOrder({ converted, pending, scripts, descriptorOf: (f) => desc[f] || null }, awaits);
  const want = (got, pass, msg) => { if (got.pass !== pass) throw new Error(`swap-order self-test FAILED (${msg}): ${got.detail}`); };
  want(run([{ file: 's.js', stage: 'runner_wired' }, { file: 'c.js', stage: 'compute_ported' }]), false, 'upstream still in its copy window');
  want(run([{ file: 's.js', stage: 'runner_wired' }, { file: 'c.js', stage: 'red_suite' }]), false, 'upstream before ②');
  want(run([{ file: 's.js', stage: 'runner_wired' }]), false, 'upstream neither pending nor converted');
  want(run([{ file: 's.js', stage: 'runner_wired' }, { file: 'c.js', stage: 'runner_wired' }]), true, 'upstream swapped');
  want(run([{ file: 's.js', stage: 'runner_wired' }], ['c.js']), true, 'upstream converted');
  want(run([{ file: 's.js', stage: 'compute_ported' }, { file: 'c.js', stage: 'red_suite' }]), true, 'a copy-window step is not a subject');
  return { ok: true, detail: 'swap-order self-test ok' };
}

/**
 * The file reader for #54 (R-DJ (2): file-only). converted.json (raw: the declared stages), the manifest's slug →
 * file map, and each pending descriptor (null when absent: a red_suite entry has none).
 * @param {string} repoRoot
 */
export function loadSwapOrderInput(repoRoot) {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const c = read('scripts/steps/_schema/converted.json');
  const m = read('scripts/manifest.json');
  return {
    converted: Array.isArray(c.converted) ? c.converted : [],
    pending: (Array.isArray(c.pending) ? c.pending : []).filter((p) => p && typeof p === 'object'),
    scripts: m.scripts || {},
    descriptorOf: (relFile) => {
      const rel = String(relFile).replace(/\.(js|py)$/, '') + '.descriptor.json';
      return fs.existsSync(path.join(repoRoot, rel)) ? read(rel) : null;
    },
  };
}
