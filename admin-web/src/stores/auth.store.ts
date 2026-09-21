import { create } from 'zustand';
import { setAuthToken } from '../services/api.client';
import { fetchMe, loginRequest } from '../services/auth.service';
import { isAppAdmin, type User } from '../types';

const TOKEN_KEY = 'bm_admin_web_auth_token';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

function persistSession(token: string, user: User) {
  if (!isAppAdmin(user.role)) {
    throw new Error('Only app admins can sign in to Barighorr Admin');
  }
  localStorage.setItem(TOKEN_KEY, token);
  setAuthToken(token);
  return { token, user, isAuthenticated: true, isLoading: false };
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,

  hydrate: async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        set({ isHydrated: true, isAuthenticated: false });
        return;
      }

      setAuthToken(token);
      const user = await fetchMe();
      if (!isAppAdmin(user.role)) {
        localStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
        set({ user: null, token: null, isAuthenticated: false, isHydrated: true });
        return;
      }

      set({ token, user, isAuthenticated: true, isHydrated: true });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      set({ user: null, token: null, isAuthenticated: false, isHydrated: true });
    }
  },

  login: async (identifier: string, password: string) => {
    set({ isLoading: true });
    try {
      const { token, user } = await loginRequest(identifier, password);
      set(persistSession(token, user));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },
}));
