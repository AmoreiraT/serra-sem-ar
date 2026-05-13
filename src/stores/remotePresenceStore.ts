import { create } from 'zustand';
import type { PresenceVector } from '../types/realtimePresence';

export type RemotePresenceAudioEntry = {
  sessionId: string;
  dayIndex: number;
  position: PresenceVector;
  isMobile: boolean;
  lastSeenAt: number;
  source: 'multiplayer' | 'rtdb';
};

type RemotePresenceState = {
  entries: RemotePresenceAudioEntry[];
  setEntries: (entries: RemotePresenceAudioEntry[]) => void;
  clear: () => void;
};

const sortByFreshness = (entries: RemotePresenceAudioEntry[]) =>
  [...entries].sort((a, b) => b.lastSeenAt - a.lastSeenAt);

export const useRemotePresenceStore = create<RemotePresenceState>((set) => ({
  entries: [],
  setEntries: (entries) => set({ entries: sortByFreshness(entries) }),
  clear: () => set({ entries: [] }),
}));
