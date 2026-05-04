import { create } from 'zustand';
import type { OxygenStatus } from '../types/oxygen';

type SetOxygenInput = {
  oxygen: number;
  collectiveOxygen: number;
  status: OxygenStatus;
};

export type OxygenStoreState = {
  sessionId: string | null;
  oxygen: number;
  collectiveOxygen: number;
  status: OxygenStatus;
  shouldReset: boolean;
  collapseMessage: string | null;
  joinedAt: number | null;
  updateIntervalMs: number;
  isOfflineFallback: boolean;
  setSession: (sessionId: string, joinedAt: number) => void;
  setUpdateInterval: (updateIntervalMs: number) => void;
  setOfflineFallback: (enabled: boolean) => void;
  setOxygenState: (input: SetOxygenInput) => void;
  triggerCollapse: (message: string) => void;
  clearCollapse: () => void;
  reset: () => void;
};

const DEFAULT_UPDATE_INTERVAL_MS = 2_000;

export const useOxygenStore = create<OxygenStoreState>((set) => ({
  sessionId: null,
  oxygen: 100,
  collectiveOxygen: 100,
  status: 'stable',
  shouldReset: false,
  collapseMessage: null,
  joinedAt: null,
  updateIntervalMs: DEFAULT_UPDATE_INTERVAL_MS,
  isOfflineFallback: false,
  setSession: (sessionId, joinedAt) =>
    set({
      sessionId,
      joinedAt,
      shouldReset: false,
      collapseMessage: null,
    }),
  setUpdateInterval: (updateIntervalMs) =>
    set({
      updateIntervalMs: Math.max(1_000, Math.min(60_000, updateIntervalMs)),
    }),
  setOfflineFallback: (enabled) => set({ isOfflineFallback: enabled }),
  setOxygenState: ({ oxygen, collectiveOxygen, status }) =>
    set({
      oxygen: Math.max(0, Math.min(100, oxygen)),
      collectiveOxygen,
      status,
    }),
  triggerCollapse: (message) =>
    set({
      shouldReset: true,
      collapseMessage: message,
      oxygen: 0,
      status: 'collapsed',
    }),
  clearCollapse: () =>
    set({
      shouldReset: false,
      collapseMessage: null,
    }),
  reset: () =>
    set({
      sessionId: null,
      oxygen: 100,
      collectiveOxygen: 100,
      status: 'stable',
      shouldReset: false,
      collapseMessage: null,
      joinedAt: null,
      updateIntervalMs: DEFAULT_UPDATE_INTERVAL_MS,
      isOfflineFallback: false,
    }),
}));

