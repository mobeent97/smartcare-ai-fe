import { create } from 'zustand';
import { api } from '@/lib/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUserEmail: (email: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  userEmail: null,
  setTokens: (access, refresh) => {
    api.setAccessToken(access);
    set({ accessToken: access, refreshToken: refresh });
  },
  setUserEmail: (email) => set({ userEmail: email }),
  logout: () => {
    api.clearTokens();
    set({ accessToken: null, refreshToken: null, userEmail: null });
  },
}));
