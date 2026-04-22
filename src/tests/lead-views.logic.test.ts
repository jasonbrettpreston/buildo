// Logic Layer Tests — createMockLeadView factory (migration 070 shape)
// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md
import { describe, it, expect } from 'vitest';
import { createMockLeadView } from './factories';

describe('createMockLeadView factory', () => {
  it('returns sensible defaults matching the corrected lead_views schema', () => {
    const v = createMockLeadView();
    expect(v.id).toBeTypeOf('number');
    expect(v.user_id).toBeTypeOf('string');
    expect(v.lead_key).toBeTypeOf('string');
    expect(v.lead_type).toBe('permit');
    expect(v.permit_num).toBeTypeOf('string');
    expect(v.revision_num).toBeTypeOf('string');
    expect(v.entity_id).toBeNull();
    expect(v.trade_slug).toBeTypeOf('string');
    expect(v.viewed_at).toBeInstanceOf(Date);
    expect(v.saved).toBe(false);
  });

  it('respects overrides', () => {
    const v = createMockLeadView({ user_id: 'other-uid', saved: true });
    expect(v.user_id).toBe('other-uid');
    expect(v.saved).toBe(true);
  });

  it('supports builder lead shape via overrides', () => {
    const v = createMockLeadView({
      lead_type: 'builder',
      lead_key: 'builder:42',
      permit_num: null,
      revision_num: null,
      entity_id: 42,
    });
    expect(v.lead_type).toBe('builder');
    expect(v.entity_id).toBe(42);
    expect(v.permit_num).toBeNull();
  });
});
