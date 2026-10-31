// SPEC LINK: MB-73 plan section 5 (W:literal, W:held, W:dirty-worktree), G11, G13, O-6; R-KQ, R-KU, MB-67 arm L/K/N.
// The promises check CALLS MB-67's readers and judges nothing itself: literal lines and counts are MB-67's, verbatim
// (G13); an unreadable fact is `FAIL:R:cannot-decide:<what>` (never a pass); any uncommitted change, untracked
// included, in a McBylaws worktree is `FAIL:W:dirty-worktree` (G11).

import { scanScope } from '../mcbylaws/literal-scan.mjs';
import { heldCount, worktreeScan } from '../mcbylaws/summary-collect.mjs';

/** The scan's per-file verdicts, flattened to MB-67's own `FAIL:L:...` lines, unchanged; a throw is cannot-decide. */
export function literalLines(args) {
  try {
    const out = scanScope(args);
    if (!Array.isArray(out)) return ['FAIL:R:cannot-decide:literal-scan'];
    return out.flatMap((v) => (v && Array.isArray(v.verdicts) ? v.verdicts.filter((l) => typeof l === 'string') : []));
  } catch {
    return ['FAIL:R:cannot-decide:literal-scan'];
  }
}

/** Held patches over `held_limit` (a positive integer) -> `FAIL:W:held:<count>:<limit>`; else fail closed. */
export function heldLines(policy) {
  try {
    const limit = policy?.held_limit;
    if (!Number.isInteger(limit) || limit <= 0) return ['FAIL:R:cannot-decide:held'];
    const res = heldCount(policy);
    if (!res || typeof res.count !== 'number') return ['FAIL:R:cannot-decide:held'];
    return res.count <= limit ? [] : [`FAIL:W:held:${res.count}:${limit}`];
  } catch {
    return ['FAIL:R:cannot-decide:held'];
  }
}

/** Any dirty McBylaws worktree (untracked included) -> `FAIL:W:dirty-worktree:<dirty>`; an error is fail closed. */
export function dirtyLines(policy, home) {
  try {
    const res = worktreeScan(policy, home);
    if (!res || res.error !== undefined || typeof res.dirty !== 'number') return ['FAIL:R:cannot-decide:worktree'];
    return res.dirty > 0 ? [`FAIL:W:dirty-worktree:${res.dirty}`] : [];
  } catch {
    return ['FAIL:R:cannot-decide:worktree'];
  }
}
