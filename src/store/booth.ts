import { create } from 'zustand';
import type { DeviceMeasurement } from '@/types/api';

export type BoothStep =
  | 'welcome'
  | 'first_look'
  | 'complaint'
  | 'pain'
  | 'vitals'
  | 'results'
  | 'emergency';

interface BoothState {
  sessionId: string | null;
  currentStep: BoothStep;
  avatarSpeechText: string;
  akoolSessionId: string | null;
  isAvatarConnected: boolean;
  measurementResult: DeviceMeasurement | null;
  setSessionId: (id: string) => void;
  setCurrentStep: (step: BoothStep) => void;
  setAvatarSpeechText: (text: string) => void;
  setAkoolSessionId: (id: string) => void;
  setAvatarConnected: (connected: boolean) => void;
  setMeasurementResult: (result: DeviceMeasurement) => void;
  reset: () => void;
}

export const useBoothStore = create<BoothState>((set) => ({
  sessionId: null,
  currentStep: 'welcome',
  avatarSpeechText: '',
  akoolSessionId: null,
  isAvatarConnected: false,
  measurementResult: null,
  setSessionId: (id) => set({ sessionId: id }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setAvatarSpeechText: (text) => set({ avatarSpeechText: text }),
  setAkoolSessionId: (id) => set({ akoolSessionId: id }),
  setAvatarConnected: (connected) => set({ isAvatarConnected: connected }),
  setMeasurementResult: (result) => set({ measurementResult: result }),
  reset: () => set({
    sessionId: null,
    currentStep: 'welcome',
    akoolSessionId: null,
    isAvatarConnected: false,
    measurementResult: null,
    avatarSpeechText: '',
  }),
}));
