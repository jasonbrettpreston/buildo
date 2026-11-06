// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-386 (R3-02 flags propagate) and its 2026-11-06 dated note (D-8,
//            OQ-1, OQ-2): Phase 2 base-row and permission disclosures reach Layer 3 flags as closed words (data), recomputed
//            on read by Layer 2's own functions, never re-derived here; a stale stamp carries the closed stale word.
// Pure: no file, env, clock or database. The caller hands it the sentences Layer 2 recomputed and the family map.
'use strict';

const toList = (x) => (Array.isArray(x) ? x : []);
const unique = (xs) => [...new Set(xs)].sort();

/** The family entry a sentence belongs to (first match by sentence start), or null. */
function familyOf(sentence, map) {
  const s = String(sentence);
  return toList(map && map.families).find((f) => toList(f.starts_with).some((p) => s.startsWith(p))) || null;
}

/** The closed words of one target's sentences: carried families give their word, held ones none, any other the unmapped word. */
function wordsOf(sentences, map) {
  const out = [];
  for (const s of toList(sentences)) {
    const f = familyOf(s, map);
    if (!f) out.push(map.unmapped_word);
    else if (typeof f.carry === 'string') out.push(f.carry);
  }
  return unique(out);
}

/** The closed words of the permission disclosures of one class. */
function permissionWordsOf(sentences, map) {
  const p = (map && map.permission) || {};
  return unique(toList(sentences).map((s) => (String(s).startsWith(p.closure_starts_with) ? p.closure_word : p.word)));
}

/**
 * The flag words a parcel's Layer 3 rows carry: `{ l2Flags: {target: words[]}, permFlags: words[] }`.
 * `base` maps each read target to its recomputed sentences; `stale` (the stored stamp is not this tree's) puts the stale
 * word on every read target and on the permission row instead, recomputing nothing.
 */
function carriedWords({ targets, base, permission, stale }, map) {
  if (!map || typeof map.stale_word !== 'string' || typeof map.unmapped_word !== 'string') throw new Error('disclosures: the family map is missing or malformed');
  const l2Flags = {};
  if (stale) {
    for (const t of toList(targets)) l2Flags[t] = [map.stale_word];
    return { l2Flags, permFlags: [map.stale_word] };
  }
  for (const t of toList(targets)) {
    const words = wordsOf(base && base[t], map);
    if (words.length) l2Flags[t] = words;
  }
  return { l2Flags, permFlags: permissionWordsOf(permission, map) };
}

module.exports = { familyOf, wordsOf, permissionWordsOf, carriedWords };
