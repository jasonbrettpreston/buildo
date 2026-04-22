// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.10
import { describe, expect, it } from 'vitest';
import { isLeadActive } from '@/features/leads/lib/marker-state';

describe('isLeadActive — selection-sticky precedence', () => {
  it('returns false when both hover and selection are null', () => {
    expect(isLeadActive('lead-1', null, null)).toBe(false);
  });

  it('returns true when hovered and no selection', () => {
    expect(isLeadActive('lead-1', 'lead-1', null)).toBe(true);
  });

  it('returns false when hovered but a DIFFERENT lead is selected (selection wins)', () => {
    // The race condition resolution from §4.10: selection is sticky,
    // hover only matters when nothing is selected. Hovering lead-1
    // while lead-2 is selected must NOT light up lead-1.
    expect(isLeadActive('lead-1', 'lead-1', 'lead-2')).toBe(false);
  });

  it('returns true when this lead is the selected one (regardless of hover)', () => {
    expect(isLeadActive('lead-1', null, 'lead-1')).toBe(true);
    expect(isLeadActive('lead-1', 'lead-2', 'lead-1')).toBe(true);
  });

  it('returns false when neither hovered nor selected, even if other ids exist', () => {
    expect(isLeadActive('lead-1', 'lead-2', null)).toBe(false);
    expect(isLeadActive('lead-1', null, 'lead-2')).toBe(false);
    expect(isLeadActive('lead-1', 'lead-2', 'lead-3')).toBe(false);
  });

  it('treats hover-only state correctly across multiple leads', () => {
    // Mouse moves from lead-1 to lead-2 with no selection set.
    expect(isLeadActive('lead-1', 'lead-1', null)).toBe(true);
    expect(isLeadActive('lead-2', 'lead-1', null)).toBe(false);
    expect(isLeadActive('lead-1', 'lead-2', null)).toBe(false);
    expect(isLeadActive('lead-2', 'lead-2', null)).toBe(true);
  });
});
