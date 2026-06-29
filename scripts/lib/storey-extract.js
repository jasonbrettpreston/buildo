/**
 * storey-extract.js — storey-count extraction from permit descriptions (WF3-C1, Spec 65 §8).
 *
 * Single-sourced mirror of the storey regexes in src/lib/classification/scope.ts (numericStorey +
 * cardinalStorey + single-storey). The JS pipeline can't import the TS classifier, so a parity test
 * (storey-extract.logic.test.ts) pins these patterns === scope.ts. Pure — no DB, no side effects.
 *
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §8 (permit-pocket storey norms)
 */
'use strict';

// Model constants (NOT operator-tunable logic-vars — structural, like SETBACK_DEFAULTS).
// >CLAMP storeys in a description is almost always unit-count / address noise ("120 King St" →
// "120 storey"), not a real building. 15 admits genuine residential mid-rise (RM/CR pockets) while
// rejecting noise. Pockets with < MIN_SAMPLE deduped observations are flagged low_sample (citywide fallback).
const STOREY_CLAMP_MAX = 15;
const STOREY_NORM_MIN_SAMPLE = 10;

const CARDINAL_MAP = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Extract a storey count from a permit description. Mirrors scope.ts:
 *   "N storey"/"N-storey"/"N story" → N ; "one|two|three|four|five storey" → 1..5 ; "single storey" → 1.
 * Returns the integer storey count, or null when none found or out of the sane band (1..STOREY_CLAMP_MAX).
 */
function extractStoreys(description) {
  if (!description || typeof description !== 'string') return null;
  const d = description.toLowerCase();
  let n = 0;

  // (?:\.\d+)? consumes a decimal so "2.5 storey" reads the INTEGER part (2), not the post-decimal
  // digit (the old /\b(\d+)…/ matched the "5" in "2.5" because \b falls between '.' and '5').
  // A genuine "5 storey" still → 5; we correct a mis-read, we do NOT clamp.
  const numeric = d.match(/\b(\d+)(?:\.\d+)?\s*[-]?\s*(storey|story|stories)\b/);
  if (numeric && numeric[1]) n = parseInt(numeric[1], 10);

  if (n === 0) {
    const cardinal = d.match(/\b(one|two|three|four|five)\s*[-]?\s*(storey|story|stories)\b/);
    if (cardinal && cardinal[1]) n = CARDINAL_MAP[cardinal[1]] || 0;
  }

  if (n === 0 && /\bsingle\s*[-]?\s*(storey|story)\b/.test(d)) n = 1;

  if (!Number.isFinite(n) || n < 1 || n > STOREY_CLAMP_MAX) return null;
  return n;
}

module.exports = { extractStoreys, STOREY_CLAMP_MAX, STOREY_NORM_MIN_SAMPLE, CARDINAL_MAP };
