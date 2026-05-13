import type {PerformanceDeviceClass, PerformanceProfile} from "../types/performance";

const profiles: Record<PerformanceDeviceClass, PerformanceProfile> = {
  desktop: {
    version: 1,
    deviceClass: "desktop",
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
    deviceClass: "tablet",
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
    deviceClass: "phone",
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

const normalizeDeviceClass = (value: unknown): PerformanceDeviceClass => {
  if (value === "tablet" || value === "phone" || value === "desktop") return value;
  return "desktop";
};

export const getPerformanceProfile = (device: unknown): PerformanceProfile => {
  const deviceClass = normalizeDeviceClass(device);
  return profiles[deviceClass];
};
