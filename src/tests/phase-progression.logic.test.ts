// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3
//             docs/specs/01-pipeline/80_taxonomies.md §5 (permit_type_classifications)
//
// Parity test for src/lib/classification/phase-progression.ts —
// STANDARD_PHASE_PATH_BY_PERMIT_TYPE: the canonical happy-path progression
// per permit_type. Used by the inspector to compute the "remaining
// uncompleted stages" portion of lifecycle.timeline[].

import { describe, it, expect } from 'vitest';
import {
  STANDARD_PHASE_PATH_BY_PERMIT_TYPE,
  remainingPhases,
} from '@/lib/classification/phase-progression';

describe('STANDARD_PHASE_PATH_BY_PERMIT_TYPE — canonical happy paths (WF1 #B 2026-05-09)', () => {
  it('every value is a non-empty array of strings', () => {
    for (const [permitType, path] of Object.entries(STANDARD_PHASE_PATH_BY_PERMIT_TYPE)) {
      expect(Array.isArray(path), `${permitType} not an array`).toBe(true);
      expect(path.length, `${permitType} empty path`).toBeGreaterThan(0);
      for (const phase of path) {
        expect(typeof phase, `${permitType} path has non-string phase`).toBe('string');
      }
    }
  });

  it('no path references P1 or P2 (CoA-only — building permits never see those)', () => {
    for (const [permitType, path] of Object.entries(STANDARD_PHASE_PATH_BY_PERMIT_TYPE)) {
      expect(path, `${permitType} contains P1`).not.toContain('P1');
      expect(path, `${permitType} contains P2`).not.toContain('P2');
    }
  });

  it('no path references INTAKE_P3 / INTAKE_P4 / INTAKE_P5 (spec defines them but classify-lifecycle-phase still uses unprefixed P3/P4/P5 — Spec 84 §6 bug 84-W11)', () => {
    for (const [permitType, path] of Object.entries(STANDARD_PHASE_PATH_BY_PERMIT_TYPE)) {
      expect(path, `${permitType} contains INTAKE_P3`).not.toContain('INTAKE_P3');
      expect(path, `${permitType} contains INTAKE_P4`).not.toContain('INTAKE_P4');
      expect(path, `${permitType} contains INTAKE_P5`).not.toContain('INTAKE_P5');
    }
  });

  it('first phase of every path is P3 or P6 (Spec 84 §3.2 entry points; P3 used over INTAKE_P3 per current classify-lifecycle-phase impl, bug 84-W11)', () => {
    for (const [permitType, path] of Object.entries(STANDARD_PHASE_PATH_BY_PERMIT_TYPE)) {
      const first = path[0];
      expect(['P3', 'P6'], `${permitType} first phase is ${first}`).toContain(first);
    }
  });

  it('every path element is a known phase code (subset of Spec 84 §3 vocabulary)', () => {
    const KNOWN_PHASES = new Set([
      'P3', 'P4', 'P5',
      'P6', 'P7a', 'P7b', 'P7c', 'P7d', 'P8',
      'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
      'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
      'O1', 'O2', 'O3',
    ]);
    for (const [permitType, path] of Object.entries(STANDARD_PHASE_PATH_BY_PERMIT_TYPE)) {
      for (const phase of path) {
        expect(KNOWN_PHASES.has(phase), `${permitType} has unknown phase ${phase}`).toBe(true);
      }
    }
  });

  it('every path is in monotonic phase order (no backwards transitions in the canonical happy path)', () => {
    // Phase ordinals follow Spec 84's progression. INTAKE_P3 < INTAKE_P4 <
    // INTAKE_P5 < P6 < P7a < P7b < P7c < P7d < P8 < P9 < P10 < P11 < P12 <
    // P13 < P14 < P15 < P16 < P17 < P18. Orphan phases (O1-O3) are a
    // negative-ordinal track per Spec 84 §3.7 — checked separately.
    const ORDINAL: Record<string, number> = {
      P3: 1, P4: 2, P5: 3,
      P6: 4, P7a: 5, P7b: 6, P7c: 7, P7d: 8, P8: 9,
      P9: 10, P10: 11, P11: 12, P12: 13, P13: 14, P14: 15,
      P15: 16, P16: 17, P17: 18, P18: 19, P19: 20, P20: 21,
      O1: 100, O2: 101, O3: 102,
    };
    for (const [permitType, path] of Object.entries(STANDARD_PHASE_PATH_BY_PERMIT_TYPE)) {
      for (let i = 1; i < path.length; i++) {
        const prev = ORDINAL[path[i - 1]!]!;
        const next = ORDINAL[path[i]!]!;
        expect(next, `${permitType} backward transition ${path[i - 1]} → ${path[i]}`).toBeGreaterThan(prev);
      }
    }
  });
});

describe('remainingPhases — slicing the canonical path (WF1 #B 2026-05-09)', () => {
  it('returns phases AFTER currentPhase for a known permit_type', () => {
    // For New Houses: INTAKE_P3 → INTAKE_P4 → INTAKE_P5 → P6 → P7a → ... → P18
    const result = remainingPhases('New Houses', 'P7c');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).not.toBe('P7c'); // P7c excluded (it's the current)
    // Next entry should be P7d or P8 (depending on path)
    expect(['P7d', 'P8']).toContain(result[0]);
  });

  it('returns empty for a terminal phase (P18, P19, P20)', () => {
    expect(remainingPhases('New Houses', 'P18')).toEqual([]);
    expect(remainingPhases('New Houses', 'P19')).toEqual([]);
    expect(remainingPhases('New Houses', 'P20')).toEqual([]);
  });

  it('returns empty for orphan terminal (O3)', () => {
    expect(remainingPhases('Plumbing(PS)', 'O3')).toEqual([]);
  });

  it('returns empty when permit_type is unknown', () => {
    expect(remainingPhases('NonexistentPermitType', 'P7c')).toEqual([]);
  });

  it('returns empty when currentPhase is null/undefined', () => {
    expect(remainingPhases('New Houses', null)).toEqual([]);
    expect(remainingPhases('New Houses', undefined)).toEqual([]);
  });

  it('returns empty when currentPhase is not in the path (off-path permit)', () => {
    // A New House on the orphan track (shouldn't happen) — currentPhase O3
    // isn't in the residential-structural path, so we return empty rather
    // than predict a recovery sequence.
    expect(remainingPhases('New Houses', 'O3')).toEqual([]);
  });
});
