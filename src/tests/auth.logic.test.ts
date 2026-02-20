// 🔗 SPEC LINK: docs/specs/13_auth.md
import { describe, it, expect } from 'vitest';
import type { UserProfile, UserPreferences, SavedPermit } from '@/lib/auth/types';
import { DEFAULT_PREFERENCES } from '@/lib/auth/types';

describe('Auth Types', () => {
  it('DEFAULT_PREFERENCES has correct defaults', () => {
    expect(DEFAULT_PREFERENCES.trade_filters).toEqual([]);
    expect(DEFAULT_PREFERENCES.postal_codes).toEqual([]);
    expect(DEFAULT_PREFERENCES.wards).toEqual([]);
    expect(DEFAULT_PREFERENCES.alert_frequency).toBe('daily_digest');
    expect(DEFAULT_PREFERENCES.email_notifications).toBe(true);
    expect(DEFAULT_PREFERENCES.push_notifications).toBe(false);
  });

  it('UserProfile interface can be constructed', () => {
    const profile: UserProfile = {
      uid: 'test-uid',
      email: 'test@example.com',
      display_name: 'Test User',
      account_type: 'individual',
      created_at: new Date(),
      onboarding_completed: false,
    };
    expect(profile.uid).toBe('test-uid');
    expect(profile.account_type).toBe('individual');
    expect(profile.onboarding_completed).toBe(false);
  });

  it('UserPreferences with custom trade filters', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing', 'electrical', 'hvac'],
      postal_codes: ['M5V', 'M4K'],
      wards: ['10', '14'],
      alert_frequency: 'instant',
    };
    expect(prefs.trade_filters).toHaveLength(3);
    expect(prefs.postal_codes).toHaveLength(2);
    expect(prefs.alert_frequency).toBe('instant');
  });

  it('SavedPermit tracks status transitions', () => {
    const saved: SavedPermit = {
      permit_num: '24 101234',
      revision_num: '01',
      status: 'new',
      notes: '',
      saved_at: new Date(),
      updated_at: new Date(),
    };
    expect(saved.status).toBe('new');

    // Simulate status transition
    const contacted: SavedPermit = { ...saved, status: 'contacted' };
    expect(contacted.status).toBe('contacted');

    const quoted: SavedPermit = { ...contacted, status: 'quoted' };
    expect(quoted.status).toBe('quoted');

    const won: SavedPermit = { ...quoted, status: 'won' };
    expect(won.status).toBe('won');
  });

  it('AccountType supports all three roles', () => {
    const roles: UserProfile['account_type'][] = ['individual', 'company', 'supplier'];
    expect(roles).toHaveLength(3);
  });
});
