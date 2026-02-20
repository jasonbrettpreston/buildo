// ---------------------------------------------------------------------------
// Team collaboration types
// ---------------------------------------------------------------------------

/**
 * Roles available within a team.
 *
 * - `owner`   Full control: billing, member management, deletion.
 * - `manager` Can invite/remove members, manage saved permits.
 * - `member`  Read access to team resources, can save and export.
 */
export type TeamRole = 'owner' | 'manager' | 'member';

// ---------------------------------------------------------------------------
// Database models
// ---------------------------------------------------------------------------

export interface Team {
  id: string;
  name: string;
  owner_uid: string;
  created_at: Date;
}

export interface TeamMember {
  uid: string;
  team_id: string;
  role: TeamRole;
  joined_at: Date;
}

export interface TeamInvite {
  code: string;
  team_id: string;
  email: string;
  role: TeamRole;
  expires_at: Date;
  accepted: boolean;
}

// ---------------------------------------------------------------------------
// Role permissions
// ---------------------------------------------------------------------------

/**
 * Mapping of team roles to their granted permission strings.
 *
 * Permission strings are intentionally flat and use dot-notation so they
 * can be checked with a simple `includes()` lookup.
 */
export const ROLE_PERMISSIONS: Record<TeamRole, string[]> = {
  owner: [
    'team.read',
    'team.update',
    'team.delete',
    'team.billing',
    'members.invite',
    'members.remove',
    'members.update_role',
    'permits.read',
    'permits.save',
    'permits.export',
    'analytics.read',
    'rules.read',
    'rules.write',
  ],
  manager: [
    'team.read',
    'team.update',
    'members.invite',
    'members.remove',
    'permits.read',
    'permits.save',
    'permits.export',
    'analytics.read',
    'rules.read',
  ],
  member: [
    'team.read',
    'permits.read',
    'permits.save',
    'permits.export',
    'analytics.read',
  ],
};
