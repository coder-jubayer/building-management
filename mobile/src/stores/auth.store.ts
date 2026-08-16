import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { setAuthToken } from '../services/api.client';
import { loginRequest, fetchMe, signupBuildingAdmin } from '../services/auth.service';
import { unregisterPushToken } from '../services/push.service';
import type { User } from '../types';
import { useGuestsStore } from './guests.store';

const TOKEN_KEY = 'bm_auth_token';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: {
    name: string;
    email: string;
    password: string;
    buildingName: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

async function persistSession(token: string, user: User) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
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
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        set({ isHydrated: true, isAuthenticated: false });
        return;
      }

      setAuthToken(token);
      const user = await fetchMe();
      set({
        token,
        user,
        isAuthenticated: true,
        isHydrated: true,
      });
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setAuthToken(null);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isHydrated: true,
      });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { token, user } = await loginRequest(email, password);
      set(await persistSession(token, user));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signup: async (payload) => {
    set({ isLoading: true });
    try {
      const { token, user } = await signupBuildingAdmin(payload);
      set(await persistSession(token, user));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await unregisterPushToken();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    useGuestsStore.getState().reset();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  setUser: (user: User) => set({ user }),
}));
