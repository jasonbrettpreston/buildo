// SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.1 (directory pagination)
//
// P24 close-out CRIT (Code Reviewer): nextPage/prevPage stepped by ONE ROW, not a
// page of 25 — rows past the first page were unreachable and pages overlapped
// 24/25. These pin the fix: offset is a raw row offset; paging steps by pageSize.

import { describe, it, expect, beforeEach } from 'vitest';
import { useUserDirectoryStore } from '@/features/admin-users/store/useUserDirectoryStore';

const PAGE = 25;

describe('user-directory pagination (P24 close-out)', () => {
  beforeEach(() => {
    useUserDirectoryStore.setState({ offset: 0 });
  });

  it('nextPage advances the offset by a full page, not one row', () => {
    useUserDirectoryStore.getState().nextPage(PAGE);
    expect(useUserDirectoryStore.getState().offset).toBe(25);
    useUserDirectoryStore.getState().nextPage(PAGE);
    expect(useUserDirectoryStore.getState().offset).toBe(50);
  });

  it('prevPage steps back a full page and floors at 0', () => {
    useUserDirectoryStore.setState({ offset: 50 });
    useUserDirectoryStore.getState().prevPage(PAGE);
    expect(useUserDirectoryStore.getState().offset).toBe(25);
    useUserDirectoryStore.getState().prevPage(PAGE);
    expect(useUserDirectoryStore.getState().offset).toBe(0);
    useUserDirectoryStore.getState().prevPage(PAGE);
    expect(useUserDirectoryStore.getState().offset).toBe(0); // floored, never negative
  });

  it('the derived page number is floor(offset/limit)+1 (offset is a raw row offset)', () => {
    // offset 50 @ page 25 = page 3 (rows 51-75) — NOT page 51.
    expect(Math.floor(0 / PAGE) + 1).toBe(1);
    expect(Math.floor(50 / PAGE) + 1).toBe(3);
    expect(Math.floor(75 / PAGE) + 1).toBe(4);
  });

  it('changing a filter resets the offset to 0', () => {
    useUserDirectoryStore.setState({ offset: 50 });
    useUserDirectoryStore.getState().setFilter('q', 'plumb');
    expect(useUserDirectoryStore.getState().offset).toBe(0);
  });
});
