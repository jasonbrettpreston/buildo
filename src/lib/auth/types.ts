export type AccountType = 'individual' | 'company' | 'supplier';

export interface UserProfile {
  uid: string;
  email: string;
  display_name: string;
  account_type: AccountType;
  company_name?: string;
  phone?: string;
  created_at: Date;
  onboarding_completed: boolean;
}

export interface UserPreferences {
  trade_filters: string[];    // trade slugs
  postal_codes: string[];     // e.g. ["M5V", "M4K"]
  wards: string[];            // e.g. ["10", "14"]
  min_cost?: number;
  max_cost?: number;
  alert_frequency: 'instant' | 'daily_digest' | 'weekly';
  email_notifications: boolean;
  push_notifications: boolean;
}

export interface SavedPermit {
  permit_num: string;
  revision_num: string;
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
  notes: string;
  saved_at: Date;
  updated_at: Date;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trade_filters: [],
  postal_codes: [],
  wards: [],
  alert_frequency: 'daily_digest',
  email_notifications: true,
  push_notifications: false,
};
