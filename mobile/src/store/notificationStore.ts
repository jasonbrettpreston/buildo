// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.4
// Zustand store tracking unread notification state for the Flight Board
// tab badge. Cleared when the Flight Board tab receives focus.
import { create } from 'zustand';

interface NotificationState {
  unreadFlightBoard: number;
  incrementUnread: () => void;
  clearUnread: () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  unreadFlightBoard: 0,
  incrementUnread: () => set((s) => ({ unreadFlightBoard: s.unreadFlightBoard + 1 })),
  clearUnread: () => set({ unreadFlightBoard: 0 }),
  reset: () => set({ unreadFlightBoard: 0 }),
}));
