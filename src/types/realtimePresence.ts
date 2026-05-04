import type { CollapseReason, OxygenStatus, ResetReason } from './oxygen';

export type PresenceVector = {
  x: number;
  y: number;
  z: number;
};

export type PresenceStatus = 'alive' | 'asphyxiated' | 'memorialized' | 'disconnected';

export type RealtimePresence = {
  sessionId: string;
  joinedAt: number;
  lastSeenAt: number;
  oxygen: number;
  dayIndex: number;
  position: PresenceVector;
  status: PresenceStatus;
  userAgent?: string;
  isMobile: boolean;
  updateIntervalMs: number;
};

export type JoinPresenceRequest = {
  clientId?: string;
  isMobile: boolean;
  userAgent?: string;
};

export type JoinPresenceResponse = {
  sessionId: string;
  joinedAt: number;
  initialOxygen: number;
  updateIntervalMs: number;
  maxOnlineUsersSoftLimit: number;
};

export type UpdatePresenceRequest = {
  sessionId: string;
  dayIndex: number;
  position: PresenceVector;
  clientTimestamp: number;
};

export type UpdatePresenceResponse = {
  accepted: boolean;
  serverTimestamp: number;
  oxygen: number;
  collectiveOxygen: number;
  worldStatus: OxygenStatus;
  shouldReset: boolean;
  resetReason?: ResetReason;
  message?: string;
};

export type LeavePresenceRequest = {
  sessionId: string;
};

export type LeavePresenceResponse = {
  success: boolean;
};

export type CollapseEvent = {
  eventId: string;
  targetSessionId: string;
  reason: CollapseReason;
  dayIndex: number;
  cases: number;
  deaths: number;
  createdAt: number;
  message: string;
};

