// 🔗 SPEC LINK: docs/specs/22_teams.md
// Team role permissions and type validation
import { describe, it, expect } from 'vitest';
import {
  ROLE_PERMISSIONS,
  type TeamRole,
  type Team,
  type TeamMember,
  type TeamInvite,
} from '@/lib/teams/types';

describe('Team Role Permissions', () => {
  const ALL_ROLES: TeamRole[] = ['owner', 'manager', 'member'];

  it('defines permissions for all 3 roles', () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(3);
    ALL_ROLES.forEach((role) => {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    });
  });

  it('owner has all permissions', () => {
    const ownerPerms = ROLE_PERMISSIONS.owner;
    expect(ownerPerms).toContain('team.read');
    expect(ownerPerms).toContain('team.update');
    expect(ownerPerms).toContain('team.delete');
    expect(ownerPerms).toContain('team.billing');
    expect(ownerPerms).toContain('members.invite');
    expect(ownerPerms).toContain('members.remove');
    expect(ownerPerms).toContain('members.update_role');
    expect(ownerPerms).toContain('permits.read');
    expect(ownerPerms).toContain('permits.save');
    expect(ownerPerms).toContain('permits.export');
    expect(ownerPerms).toContain('analytics.read');
    expect(ownerPerms).toContain('rules.read');
    expect(ownerPerms).toContain('rules.write');
  });

  it('manager cannot delete team or manage billing', () => {
    const managerPerms = ROLE_PERMISSIONS.manager;
    expect(managerPerms).not.toContain('team.delete');
    expect(managerPerms).not.toContain('team.billing');
    expect(managerPerms).not.toContain('members.update_role');
    expect(managerPerms).not.toContain('rules.write');
  });

  it('manager can invite and remove members', () => {
    const managerPerms = ROLE_PERMISSIONS.manager;
    expect(managerPerms).toContain('members.invite');
    expect(managerPerms).toContain('members.remove');
  });

  it('member has read-only + save + export access', () => {
    const memberPerms = ROLE_PERMISSIONS.member;
    expect(memberPerms).toContain('team.read');
    expect(memberPerms).toContain('permits.read');
    expect(memberPerms).toContain('permits.save');
    expect(memberPerms).toContain('permits.export');
    expect(memberPerms).toContain('analytics.read');
  });

  it('member cannot invite, remove, update, or write rules', () => {
    const memberPerms = ROLE_PERMISSIONS.member;
    expect(memberPerms).not.toContain('members.invite');
    expect(memberPerms).not.toContain('members.remove');
    expect(memberPerms).not.toContain('members.update_role');
    expect(memberPerms).not.toContain('team.update');
    expect(memberPerms).not.toContain('team.delete');
    expect(memberPerms).not.toContain('team.billing');
    expect(memberPerms).not.toContain('rules.write');
  });

  it('all roles can read team and permits', () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_PERMISSIONS[role]).toContain('team.read');
      expect(ROLE_PERMISSIONS[role]).toContain('permits.read');
    });
  });

  it('permissions are hierarchical (owner > manager > member)', () => {
    const memberPerms = new Set(ROLE_PERMISSIONS.member);
    const managerPerms = new Set(ROLE_PERMISSIONS.manager);
    const ownerPerms = new Set(ROLE_PERMISSIONS.owner);

    // Every member permission is in manager
    memberPerms.forEach((p) => expect(managerPerms.has(p)).toBe(true));
    // Every manager permission is in owner
    managerPerms.forEach((p) => expect(ownerPerms.has(p)).toBe(true));
  });

  it('owner has strictly more permissions than manager', () => {
    expect(ROLE_PERMISSIONS.owner.length).toBeGreaterThan(
      ROLE_PERMISSIONS.manager.length
    );
  });

  it('manager has strictly more permissions than member', () => {
    expect(ROLE_PERMISSIONS.manager.length).toBeGreaterThan(
      ROLE_PERMISSIONS.member.length
    );
  });
});

describe('Team Type Structure', () => {
  it('Team interface has required fields', () => {
    const team: Team = {
      id: 'team-1',
      name: 'Test Team',
      owner_uid: 'user-1',
      created_at: new Date(),
    };
    expect(team.id).toBe('team-1');
    expect(team.name).toBe('Test Team');
    expect(team.owner_uid).toBe('user-1');
    expect(team.created_at).toBeInstanceOf(Date);
  });

  it('TeamMember interface has required fields', () => {
    const member: TeamMember = {
      uid: 'user-2',
      team_id: 'team-1',
      role: 'member',
      joined_at: new Date(),
    };
    expect(member.uid).toBe('user-2');
    expect(member.role).toBe('member');
  });

  it('TeamInvite interface has required fields', () => {
    const invite: TeamInvite = {
      code: 'abc123',
      team_id: 'team-1',
      email: 'test@example.com',
      role: 'manager',
      expires_at: new Date(),
      accepted: false,
    };
    expect(invite.code).toBe('abc123');
    expect(invite.role).toBe('manager');
    expect(invite.accepted).toBe(false);
  });
});

describe('Permission Check Helper', () => {
  function hasPermission(role: TeamRole, permission: string): boolean {
    return ROLE_PERMISSIONS[role].includes(permission);
  }

  it('owner can access billing', () => {
    expect(hasPermission('owner', 'team.billing')).toBe(true);
  });

  it('manager cannot access billing', () => {
    expect(hasPermission('manager', 'team.billing')).toBe(false);
  });

  it('member cannot invite', () => {
    expect(hasPermission('member', 'members.invite')).toBe(false);
  });

  it('unknown permission returns false for all roles', () => {
    expect(hasPermission('owner', 'nonexistent.permission')).toBe(false);
    expect(hasPermission('manager', 'nonexistent.permission')).toBe(false);
    expect(hasPermission('member', 'nonexistent.permission')).toBe(false);
  });
});
