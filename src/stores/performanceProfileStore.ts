import { create } from 'zustand';
import { detectClientDeviceClass } from '../core/device/clientDeviceClass';
import type { PerformanceDeviceClass, PerformanceProfile } from '../types/performanceProfile';

export const DEFAULT_PERFORMANCE_PROFILES: Record<PerformanceDeviceClass, PerformanceProfile> = {
  desktop: {
    version: 1,
    deviceClass: 'desktop',
    presence: {
      roomRadius: 1,
      staleMs: 60_000,
      maxRemoteUsers: 12,
      maxRemoteFootprintsPerUser: 10,
      activeRoomWriteIntervalMs: 750,
      idleRoomWriteIntervalMs: 4_500,
      positionDeltaMeters: 0.55,
    },
    audio: {
      maxPeers: 8,
      staleMs: 15_000,
      nearRadius: 22,
      fullRadius: 2.8,
    },
  },
  tablet: {
    version: 1,
    deviceClass: 'tablet',
    presence: {
      roomRadius: 1,
      staleMs: 45_000,
      maxRemoteUsers: 8,
      maxRemoteFootprintsPerUser: 6,
      activeRoomWriteIntervalMs: 1_000,
      idleRoomWriteIntervalMs: 4_500,
      positionDeltaMeters: 0.75,
    },
    audio: {
      maxPeers: 4,
      staleMs: 15_000,
      nearRadius: 22,
      fullRadius: 2.8,
    },
  },
  phone: {
    version: 1,
    deviceClass: 'phone',
    presence: {
      roomRadius: 0,
      staleMs: 45_000,
      maxRemoteUsers: 4,
      maxRemoteFootprintsPerUser: 4,
      activeRoomWriteIntervalMs: 1_250,
      idleRoomWriteIntervalMs: 4_500,
      positionDeltaMeters: 1,
    },
    audio: {
      maxPeers: 2,
      staleMs: 12_000,
      nearRadius: 16,
      fullRadius: 2.8,
    },
  },
};

export const getDefaultPerformanceProfile = (deviceClass: PerformanceDeviceClass): PerformanceProfile =>
  DEFAULT_PERFORMANCE_PROFILES[deviceClass];

type PerformanceProfileStatus = 'idle' | 'ready' | 'error';

type PerformanceProfileState = {
  deviceClass: PerformanceDeviceClass;
  profile: PerformanceProfile;
  status: PerformanceProfileStatus;
  setDeviceClass: (deviceClass: PerformanceDeviceClass) => void;
  setProfile: (profile: PerformanceProfile) => void;
  markProfileError: (deviceClass: PerformanceDeviceClass) => void;
};

const initialDeviceClass = detectClientDeviceClass();

export const usePerformanceProfileStore = create<PerformanceProfileState>((set) => ({
  deviceClass: initialDeviceClass,
  profile: getDefaultPerformanceProfile(initialDeviceClass),
  status: 'idle',
  setDeviceClass: (deviceClass) =>
    set((state) => {
      if (state.deviceClass === deviceClass && state.profile.deviceClass === deviceClass) return state;
      return {
        deviceClass,
        profile: getDefaultPerformanceProfile(deviceClass),
        status: 'idle',
      };
    }),
  setProfile: (profile) =>
    set({
      deviceClass: profile.deviceClass,
      profile,
      status: 'ready',
    }),
  markProfileError: (deviceClass) =>
    set({
      deviceClass,
      profile: getDefaultPerformanceProfile(deviceClass),
      status: 'error',
    }),
}));
