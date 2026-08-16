import { create } from 'zustand';
import { fetchGuests } from '../services/guests.service';
import { showLocalGuestAlert } from '../services/push.service';
import type { GuestVisit } from '../types';

interface GuestsAlertState {
  pendingCount: number;
  pendingIds: string[];
  hydrated: boolean;
  sync: (visits: GuestVisit[], notify: boolean) => void;
  refresh: () => Promise<void>;
  reset: () => void;
}

function pendingVisits(visits: GuestVisit[]) {
  return visits.filter((item) => item.status === 'pending');
}

export const useGuestsStore = create<GuestsAlertState>((set, get) => ({
  pendingCount: 0,
  pendingIds: [],
  hydrated: false,

  sync: (visits, notify) => {
    const pending = pendingVisits(visits);
    const ids = pending.map((item) => item.id);
    const previous = get().pendingIds;
    const wasHydrated = get().hydrated;
    if (notify && wasHydrated) {
      const fresh = pending.find((item) => !previous.includes(item.id));
      if (fresh) {
        void showLocalGuestAlert(
          'Guest at the gate',
          `${fresh.visitorName} is here for ${fresh.purpose}`,
        );
      }
    }
    set({ pendingCount: pending.length, pendingIds: ids, hydrated: true });
  },

  refresh: async () => {
    try {
      const data = await fetchGuests();
      get().sync(data.visits, Boolean(data.canDecide));
    } catch {
      // Keep the last badge state if the network blips.
    }
  },

  reset: () => set({ pendingCount: 0, pendingIds: [], hydrated: false }),
}));
