// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (Phase 3 RE-FREEZE: interpretation.entries deleted; the <=12 prose cap is one notes-file check — registry-truth plan fold 8c item 1)
//
// WF2 gate — `scripts/analysis/gates/notes-cap.mjs`.
//
// The <=12-prose cap on a step's `*.notes.json` is defined ONCE, in the gate
// module's `NOTES_PROSE_BLOCKS` + `NOTES_CAP`. This REPLACES the per-descriptor
// `interpretation.entries` count (DELETED) and the per-suite `#30` assertions
// that re-derived it. The gate walks the CONVERTED fleet through
// `loadDeclaringNotes`, resolving each declaring descriptor's notes file
// relative to the DESCRIPTOR's own directory.
//
// RED-FIRST: `scripts/load-centreline.notes.json` counts 21 prose entries
// measured 2026-10-03 — OVER the cap. Every other declaring notes file is
// <= 12. The LIVE fleet test below is therefore EXPECTED RED today: the fix is
// to promote an entry to a check or DELETE it in the notes file, NOT to raise
// the cap and NOT to change a notes file to force this test green.

import { describe, it, expect } from 'vitest';
import * as notesCap from '../../scripts/analysis/gates/notes-cap.mjs';

const REPO_ROOT = process.cwd();

const entries = (n: number): Array<{ n: number }> =>
  Array.from({ length: n }, (_, i) => ({ n: i + 1 }));

const row = (
  notes: Record<string, unknown> | null,
  slug = 'fixture_step',
): { slug: string; notesRel: string; notes: Record<string, unknown> | null } => ({
  slug,
  notesRel: 'fixture.notes.json',
  notes,
});

describe('notes-cap — the <=12 prose cap is ONE notes-file check', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => notesCap.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — countProseEntries counts ONLY the 12 prose blocks.
  // -------------------------------------------------------------------------
  it('T2: counts only NOTES_PROSE_BLOCKS (fences/constants/$comment exempt)', () => {
    const fixture = {
      expected_shape: entries(5),
      review_notes: entries(7),
      fences: entries(5),
      constants: entries(3),
      $comment: entries(4),
    };
    expect(notesCap.NOTES_PROSE_BLOCKS).toHaveLength(12);
    expect(notesCap.NOTES_CAP).toBe(12);
    expect(notesCap.countProseEntries(fixture)).toBe(12);
    expect(notesCap.countProseEntries(null)).toBe(0);
    expect(notesCap.countProseEntries('nope')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // T3 — RED/GREEN directions, asserted DIRECTLY.
  // -------------------------------------------------------------------------
  it('T3a: RED — 13 prose entries fail, scoped to the slug', () => {
    const out = notesCap.checkNotesCap([row({ expected_shape: entries(5), review_notes: entries(8) })]);
    expect(out.pass).toBe(false);
    expect(out.blockedSlugs).toEqual(['fixture_step']);
    expect(out.detail).toContain('13 prose entries > 12');
  });

  it('T3b: GREEN — exactly 12 prose entries pass', () => {
    const out = notesCap.checkNotesCap([row({ expected_shape: entries(6), review_notes: entries(6) })]);
    expect(out.pass).toBe(true);
    expect(out.blockedSlugs).toEqual([]);
    expect(out.detail).toContain('every one <= 12 prose entries');
  });

  it('T3c: RED — a null (missing/unparsable) notes row fails', () => {
    const out = notesCap.checkNotesCap([row(null)]);
    expect(out.pass).toBe(false);
    expect(out.blockedSlugs).toEqual(['fixture_step']);
    expect(out.detail).toContain('missing or unparsable');
  });

  // -------------------------------------------------------------------------
  // T4 — the LIVE fleet. EXPECTED RED today on load_centreline's 21 entries.
  // -------------------------------------------------------------------------
  it('T4: live — every declaring notes file is <= 12 prose entries', () => {
    const rows = notesCap.loadDeclaringNotes(REPO_ROOT);
    const out = notesCap.checkNotesCap(rows);
    expect(out.pass, out.detail).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T5 — the live fleet walk is not vacuous.
  // -------------------------------------------------------------------------
  it('T5: live — loadDeclaringNotes walks more than 10 declaring files', () => {
    expect(notesCap.loadDeclaringNotes(REPO_ROOT).length).toBeGreaterThan(10);
  });
});
