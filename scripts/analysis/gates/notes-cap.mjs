// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (Phase 3 RE-FREEZE: interpretation.entries deleted; the <=12 prose cap is one notes-file check — registry-truth plan fold 8c item 1)
//
// THE <=12 PROSE CAP as ONE fleet check. This REPLACES, for the converted
// fleet, the descriptor `interpretation.entries` count (DELETED — a hand-kept
// integer that could silently drift from the notes file it claimed to
// describe) and the per-suite `#30` assertions that re-derived the same count
// in each step's `violations.test.ts`. The RULE is unchanged and is defined
// ONCE, here, in `NOTES_PROSE_BLOCKS` + `NOTES_CAP` — the same 12 block names,
// in the same order, the retired per-suite lists carried: an entry counts only
// when it is an element of one of those arrays in the notes JSON; every other
// key (`$comment`, `fences`, `counts`, `constants`, `contract_version`, …) does
// NOT count toward the cap.
//
// Scope is the CONVERTED fleet, read ONLY through `readConvertedJson(repoRoot)`
// (converted-set.mjs's one read, so a pending step evaluated as-converted meets
// this gate exactly as it will at ③). A step DECLARES its notes file as
// `interpretation: { file: "<name>.notes.json" }` (resolved relative to the
// DESCRIPTOR's own directory); `interpretation: "none"` declares no notes file
// and is out of scope. A row is RED when its notes file is missing/unparsable
// OR when it counts MORE than `NOTES_CAP` prose entries — the fix is to PROMOTE
// an entry to a check or DELETE it, never to add a "notes overflow" file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConvertedJson } from './converted-set.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** Spec 120 §3.4 / Spec 122 §8 — the prose blocks that count against the cap, in the retired per-suite order. */
export const NOTES_PROSE_BLOCKS = Object.freeze([
  'expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes',
  'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations',
]);

export const NOTES_CAP = 12;

/**
 * Prose entries in ONE parsed notes object: the sum of `.length` of each
 * `NOTES_PROSE_BLOCKS` key whose value is an array. Every other key — and a
 * non-object input — contributes 0.
 * @param {unknown} notes a parsed `*.notes.json`, or anything else
 * @returns {number}
 */
export function countProseEntries(notes) {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return 0;
  let count = 0;
  for (const block of NOTES_PROSE_BLOCKS) {
    const value = notes[block];
    if (Array.isArray(value)) count += value.length;
  }
  return count;
}

/**
 * The cap over every declaring notes file. PURE — no disk. A row is RED when
 * `notes === null` (missing/unparsable) or when its count exceeds `NOTES_CAP`.
 * @param {Array<{slug: string, notesRel: string, notes: object|null}>} rows
 * @returns {{pass: boolean, blockedSlugs: string[], detail: string}}
 */
export function checkNotesCap(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const red = [];
  for (const row of list) {
    const slug = row && typeof row.slug === 'string' ? row.slug : '(unknown-step)';
    const notesRel = row && typeof row.notesRel === 'string' ? row.notesRel : '(unknown-notes-file)';
    if (!row || row.notes === null || row.notes === undefined) {
      red.push({ slug, notesRel, detail: `${slug}: ${notesRel} missing or unparsable` });
      continue;
    }
    const n = countProseEntries(row.notes);
    if (n > NOTES_CAP) {
      red.push({ slug, notesRel, detail: `${slug}: ${notesRel} has ${n} prose entries > ${NOTES_CAP} — promote to a check or delete (no overflow file)` });
    }
  }
  const blockedSlugs = [...new Set(red.map((r) => r.slug))].sort();
  const detail = red.length
    ? `NOTES-CAP: ${red.length} over/missing: ${red.map((r) => r.detail).join('; ')}`
    : `NOTES-CAP: ${list.length} declaring notes file(s), every one <= ${NOTES_CAP} prose entries`;
  return { pass: red.length === 0, blockedSlugs, detail };
}

/** Descriptor path convention — `<step>.descriptor.json` beside the script (closed-bounds.mjs's rule). */
const descriptorPathFor = (relFile) => String(relFile).replace(/\.(js|py)$/, '') + '.descriptor.json';

/**
 * Every CONVERTED step that DECLARES a notes file, as `checkNotesCap` rows
 * (R-AN — derived from converted.json, never a retyped list). A converted
 * entry with no readable descriptor THROWS (a broken registry is never
 * something to skip); a notes file that is missing/unparsable does NOT throw —
 * it becomes a RED row (`notes: null`).
 * @param {string} [repoRoot]
 * @returns {Array<{slug: string, notesRel: string, notes: object|null}>}
 */
export function loadDeclaringNotes(repoRoot = REPO_ROOT) {
  const parsed = readConvertedJson(repoRoot);
  const readDescriptor = (rel, from) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    } catch (e) {
      throw new Error(`${from} has no readable descriptor at ${rel}: ${e.message}`);
    }
  };
  const readNotes = (rel) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    } catch {
      return null;
    }
  };
  const rows = [];
  for (const relFile of Array.isArray(parsed.converted) ? parsed.converted : []) {
    const descriptorRel = descriptorPathFor(relFile);
    const descriptor = readDescriptor(descriptorRel, `converted step ${relFile}`);
    const interp = descriptor && descriptor.interpretation;
    if (!interp || typeof interp !== 'object' || Array.isArray(interp) || typeof interp.file !== 'string') continue;
    const slug = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
    const notesRel = path.posix.join(path.posix.dirname(descriptorRel), interp.file);
    rows.push({ slug, notesRel, notes: readNotes(notesRel) });
  }
  return rows;
}

/** In-memory fixtures + assertions (no disk). Throws on the first failure. */
export function selfTest() {
  const arr = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1 }));
  // 12 entries spread over TWO prose blocks → GREEN.
  const twelve = { expected_shape: arr(5), review_notes: arr(7) };
  const ok = checkNotesCap([{ slug: 'fixture_step', notesRel: 'fixture.notes.json', notes: twelve }]);
  if (!ok.pass || ok.blockedSlugs.length || countProseEntries(twelve) !== 12) {
    throw new Error(`self-test FAILED (NOTES-CAP): 12 prose entries not GREEN (${JSON.stringify(ok)})`);
  }
  // 13 entries → RED, blocked on the slug.
  const thirteen = { expected_shape: arr(5), review_notes: arr(8) };
  const over = checkNotesCap([{ slug: 'fixture_step', notesRel: 'fixture.notes.json', notes: thirteen }]);
  if (over.pass || !over.blockedSlugs.includes('fixture_step') || !over.detail.includes('13 prose entries > 12')) {
    throw new Error(`self-test FAILED (NOTES-CAP): 13 prose entries not RED (${JSON.stringify(over)})`);
  }
  // `notes: null` → RED (missing/unparsable is the row's own red, never a throw).
  const missing = checkNotesCap([{ slug: 'fixture_step', notesRel: 'fixture.notes.json', notes: null }]);
  if (missing.pass || !missing.blockedSlugs.includes('fixture_step') || !missing.detail.includes('missing or unparsable')) {
    throw new Error(`self-test FAILED (NOTES-CAP): a null notes row is not RED (${JSON.stringify(missing)})`);
  }
  // Non-prose keys never count: 12 prose + 5 fences → GREEN (fences are exempt).
  const exempt = { expected_shape: arr(6), suspicious_if: arr(6), fences: arr(5), constants: arr(3), $comment: arr(4) };
  if (countProseEntries(exempt) !== 12) {
    throw new Error(`self-test FAILED (NOTES-CAP): non-prose keys counted (${countProseEntries(exempt)})`);
  }
  if (!checkNotesCap([{ slug: 'fixture_step', notesRel: 'fixture.notes.json', notes: exempt }]).pass) {
    throw new Error('self-test FAILED (NOTES-CAP): 12 prose + 5 fences not GREEN');
  }
}

export { descriptorPathFor };
