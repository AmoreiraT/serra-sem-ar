export type PerformanceDeviceClass = 'desktop' | 'tablet' | 'phone';

export type PerformanceProfile = {
  version: 1;
  deviceClass: PerformanceDeviceClass;
  presence: {
    roomRadius: number;
    staleMs: number;
    maxRemoteUsers: number;
    maxRemoteFootprintsPerUser: number;
    activeRoomWriteIntervalMs: number;
    idleRoomWriteIntervalMs: number;
    positionDeltaMeters: number;
  };
  audio: {
    maxPeers: number;
    staleMs: number;
    nearRadius: number;
    fullRadius: number;
  };
};
