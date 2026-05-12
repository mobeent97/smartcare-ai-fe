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

export type AvatarStatus = 'idle' | 'connecting' | 'live';
export type BoothMode = 'avatar' | 'manual';

interface BoothState {
  sessionId: string | null;
  currentStep: BoothStep;
  mode: BoothMode;
  avatarSpeechText: string;
  akoolSessionId: string | null;
  avatarStatus: AvatarStatus;
  measurementResult: DeviceMeasurement | null;
  setSessionId: (id: string) => void;
  setCurrentStep: (step: BoothStep) => void;
  setMode: (mode: BoothMode) => void;
  setAvatarSpeechText: (text: string) => void;
  setAkoolSessionId: (id: string) => void;
  setAvatarStatus: (status: AvatarStatus) => void;
  setMeasurementResult: (result: DeviceMeasurement) => void;
  reset: () => void;
}

export const useBoothStore = create<BoothState>((set) => ({
  sessionId: null,
  currentStep: 'welcome',
  mode: 'avatar',
  avatarSpeechText: '',
  akoolSessionId: null,
  avatarStatus: 'idle',
  measurementResult: null,
  setSessionId: (id) => set({ sessionId: id }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setMode: (mode) => set({ mode }),
  setAvatarSpeechText: (text) => set({ avatarSpeechText: text }),
  setAkoolSessionId: (id) => set({ akoolSessionId: id }),
  setAvatarStatus: (status) => set({ avatarStatus: status }),
  setMeasurementResult: (result) => set({ measurementResult: result }),
  reset: () => set({
    sessionId: null,
    currentStep: 'welcome',
    mode: 'avatar',
    akoolSessionId: null,
    avatarStatus: 'idle',
    measurementResult: null,
    avatarSpeechText: '',
  }),
}));
