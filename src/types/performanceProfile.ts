export type PerformanceDeviceClass = 'desktop' | 'tablet' | 'phone';

export type PerformanceRenderExperience = '3d' | '2.5d';
export type PerformanceMountainQuality = 'desktop' | 'mobile';
export type PerformanceEnvironmentQuality = 'full' | 'balanced' | 'lean';

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
  render: {
    experience: PerformanceRenderExperience;
    assetVariant: string;
    preferCompressedTextures: boolean;
    maxDpr: number;
    textureMaxAnisotropy: number;
    mountainQuality: PerformanceMountainQuality;
    environmentQuality: PerformanceEnvironmentQuality;
  };
};
