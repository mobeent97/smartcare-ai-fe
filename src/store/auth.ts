import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
  userRole: string | null;
  userFullName: string | null;
  /** True once localStorage has been read on mount — prevents flash-redirect to /login */
  _hasHydrated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUserEmail: (email: string) => void;
  setUserRole: (role: string) => void;
  setUserFullName: (name: string) => void;
  logout: () => void;
  _setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userEmail: null,
      userRole: null,
      userFullName: null,
      _hasHydrated: false,
      setTokens: (access, refresh) => {
        api.setAccessToken(access);
        set({ accessToken: access, refreshToken: refresh });
      },
      setUserEmail: (email) => set({ userEmail: email }),
      setUserRole: (role) => set({ userRole: role }),
      setUserFullName: (name) => set({ userFullName: name }),
      logout: () => {
        api.clearTokens();
        set({ accessToken: null, refreshToken: null, userEmail: null, userRole: null, userFullName: null });
      },
      _setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'smartcare-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userEmail: state.userEmail,
        userRole: state.userRole,
        userFullName: state.userFullName,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          api.setAccessToken(state.accessToken);
        }
        state?._setHasHydrated(true);
      },
    },
  ),
);
