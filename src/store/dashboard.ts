import { create } from 'zustand';
import type { TriageSession } from '@/types/api';

interface EmergencyAlert {
  sessionId: string;
  reason: string;
  redFlags: string[];
}

interface DashboardState {
  queue: TriageSession[];
  selectedCase: TriageSession | null;
  emergencyAlert: EmergencyAlert | null;
  setQueue: (queue: TriageSession[]) => void;
  updateQueueItem: (sessionId: string, data: Partial<TriageSession>) => void;
  setSelectedCase: (session: TriageSession | null) => void;
  setEmergencyAlert: (alert: EmergencyAlert) => void;
  clearEmergencyAlert: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  queue: [],
  selectedCase: null,
  emergencyAlert: null,
  setQueue: (queue) => set({ queue }),
  updateQueueItem: (sessionId, data) =>
    set((state) => ({
      queue: state.queue.map((s) => (s.id === sessionId ? { ...s, ...data } : s)),
    })),
  setSelectedCase: (session) => set({ selectedCase: session }),
  setEmergencyAlert: (alert) => set({ emergencyAlert: alert }),
  clearEmergencyAlert: () => set({ emergencyAlert: null }),
}));
