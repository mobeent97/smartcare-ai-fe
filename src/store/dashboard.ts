import { create } from 'zustand';
import type { TriageSession, DeteriorationAlert } from '@/types/api';
import type { HelpRequest } from '@/components/dashboard/HelpRequestModal';

interface EmergencyAlert {
  sessionId: string;
  reason: string;
  redFlags: string[];
}

interface DashboardState {
  queue: TriageSession[];
  selectedCase: TriageSession | null;
  emergencyAlert: EmergencyAlert | null;
  deteriorationAlert: DeteriorationAlert | null;
  helpRequest: HelpRequest | null;
  setQueue: (queue: TriageSession[]) => void;
  updateQueueItem: (sessionId: string, data: Partial<TriageSession>) => void;
  addOrUpdateQueueItem: (session: TriageSession) => void;
  removeFromQueue: (sessionId: string) => void;
  setSelectedCase: (session: TriageSession | null) => void;
  setEmergencyAlert: (alert: EmergencyAlert) => void;
  clearEmergencyAlert: () => void;
  setDeteriorationAlert: (alert: DeteriorationAlert) => void;
  clearDeteriorationAlert: () => void;
  setHelpRequest: (alert: HelpRequest) => void;
  clearHelpRequest: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  queue: [],
  selectedCase: null,
  emergencyAlert: null,
  deteriorationAlert: null,
  helpRequest: null,
  setQueue: (queue) => set({ queue }),
  updateQueueItem: (sessionId, data) =>
    set((state) => ({
      queue: state.queue.map((s) => (s.id === sessionId ? { ...s, ...data } : s)),
    })),
  // Adds session if not in queue, updates it if already present
  addOrUpdateQueueItem: (session) =>
    set((state) => {
      const exists = state.queue.some((s) => s.id === session.id);
      return {
        queue: exists
          ? state.queue.map((s) => (s.id === session.id ? { ...s, ...session } : s))
          : [session, ...state.queue],
      };
    }),
  removeFromQueue: (sessionId) =>
    set((state) => ({
      queue: state.queue.filter((s) => s.id !== sessionId),
      selectedCase: state.selectedCase?.id === sessionId ? null : state.selectedCase,
    })),
  setSelectedCase: (session) => set({ selectedCase: session }),
  setEmergencyAlert: (alert) => set({ emergencyAlert: alert }),
  clearEmergencyAlert: () => set({ emergencyAlert: null }),
  setDeteriorationAlert: (alert) => set({ deteriorationAlert: alert }),
  clearDeteriorationAlert: () => set({ deteriorationAlert: null }),
  setHelpRequest: (alert) => set({ helpRequest: alert }),
  clearHelpRequest: () => set({ helpRequest: null }),
}));
