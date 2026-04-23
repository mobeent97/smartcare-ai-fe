import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
  /** True once localStorage has been read on mount — prevents flash-redirect to /login */
  _hasHydrated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUserEmail: (email: string) => void;
  logout: () => void;
  _setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userEmail: null,
      _hasHydrated: false,
      setTokens: (access, refresh) => {
        api.setAccessToken(access);
        set({ accessToken: access, refreshToken: refresh });
      },
      setUserEmail: (email) => set({ userEmail: email }),
      logout: () => {
        api.clearTokens();
        set({ accessToken: null, refreshToken: null, userEmail: null });
      },
      _setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'smartcare-auth',
      // Only persist the tokens and email, not the hydration flag
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userEmail: state.userEmail,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-sync the axios instance with the restored token
        if (state?.accessToken) {
          api.setAccessToken(state.accessToken);
        }
        state?._setHasHydrated(true);
      },
    },
  ),
);
