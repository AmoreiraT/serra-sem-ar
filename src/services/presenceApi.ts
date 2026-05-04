import axios from 'axios';
import type {
  RecalculateOxygenRequest,
  RecalculateOxygenResponse,
} from '../types/oxygen';
import type {
  JoinPresenceRequest,
  JoinPresenceResponse,
  LeavePresenceRequest,
  LeavePresenceResponse,
  UpdatePresenceRequest,
  UpdatePresenceResponse,
} from '../types/realtimePresence';

const API_BASE_URL = import.meta.env.VITE_PRESENCE_API_BASE_URL ?? '/api';

const presenceHttp = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const requireOxygenStatus = (value: unknown): UpdatePresenceResponse['worldStatus'] => {
  if (value === 'stable' || value === 'critical' || value === 'collapsed') return value;
  throw new Error('Resposta de oxigenio invalida');
};

const requireResetReason = (value: unknown): UpdatePresenceResponse['resetReason'] => {
  if (value === undefined) return undefined;
  if (value === 'asphyxiated' || value === 'presence_removed' || value === 'stale_session') return value;
  throw new Error('Motivo de reset invalido');
};

const parseJoinPresenceResponse = (value: unknown): JoinPresenceResponse => {
  if (!isRecord(value)) throw new Error('Resposta de entrada invalida');
  const sessionId = optionalString(value.sessionId);
  const joinedAt = finiteNumber(value.joinedAt);
  const initialOxygen = finiteNumber(value.initialOxygen);
  const updateIntervalMs = finiteNumber(value.updateIntervalMs);
  const maxOnlineUsersSoftLimit = finiteNumber(value.maxOnlineUsersSoftLimit);
  if (!sessionId || joinedAt === null || initialOxygen === null || updateIntervalMs === null || maxOnlineUsersSoftLimit === null) {
    throw new Error('Resposta de entrada incompleta');
  }
  return { sessionId, joinedAt, initialOxygen, updateIntervalMs, maxOnlineUsersSoftLimit };
};

const parseUpdatePresenceResponse = (value: unknown): UpdatePresenceResponse => {
  if (!isRecord(value)) throw new Error('Resposta de presenca invalida');
  const serverTimestamp = finiteNumber(value.serverTimestamp);
  const oxygen = finiteNumber(value.oxygen);
  const collectiveOxygen = finiteNumber(value.collectiveOxygen);
  if (
    typeof value.accepted !== 'boolean' ||
    typeof value.shouldReset !== 'boolean' ||
    serverTimestamp === null ||
    oxygen === null ||
    collectiveOxygen === null
  ) {
    throw new Error('Resposta de presenca incompleta');
  }

  return {
    accepted: value.accepted,
    serverTimestamp,
    oxygen,
    collectiveOxygen,
    worldStatus: requireOxygenStatus(value.worldStatus),
    shouldReset: value.shouldReset,
    resetReason: requireResetReason(value.resetReason),
    message: optionalString(value.message),
  };
};

const parseLeavePresenceResponse = (value: unknown): LeavePresenceResponse => {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    throw new Error('Resposta de saida invalida');
  }
  return { success: value.success };
};

const parseRecalculateOxygenResponse = (value: unknown): RecalculateOxygenResponse => {
  if (!isRecord(value)) throw new Error('Resposta de recalculo invalida');
  const onlineUsersCount = finiteNumber(value.onlineUsersCount);
  const collectiveOxygen = finiteNumber(value.collectiveOxygen);
  const pressure = finiteNumber(value.pressure);
  if (
    onlineUsersCount === null ||
    collectiveOxygen === null ||
    pressure === null ||
    typeof value.collapsed !== 'boolean'
  ) {
    throw new Error('Resposta de recalculo incompleta');
  }

  return {
    onlineUsersCount,
    collectiveOxygen,
    pressure,
    collapsed: value.collapsed,
    collapsedSessionId: optionalString(value.collapsedSessionId),
  };
};

export const joinPresence = async (payload: JoinPresenceRequest): Promise<JoinPresenceResponse> => {
  const response = await presenceHttp.post<unknown>('/presence/join', payload);
  return parseJoinPresenceResponse(response.data);
};

export const updatePresence = async (payload: UpdatePresenceRequest): Promise<UpdatePresenceResponse> => {
  const response = await presenceHttp.post<unknown>('/presence/update', payload);
  return parseUpdatePresenceResponse(response.data);
};

export const leavePresence = async (payload: LeavePresenceRequest): Promise<LeavePresenceResponse> => {
  const response = await presenceHttp.post<unknown>('/presence/leave', payload);
  return parseLeavePresenceResponse(response.data);
};

export const recalculateOxygen = async (
  payload: RecalculateOxygenRequest
): Promise<RecalculateOxygenResponse> => {
  const response = await presenceHttp.post<unknown>('/oxygen/recalculate', payload);
  return parseRecalculateOxygenResponse(response.data);
};

export const sendLeavePresenceBeacon = (payload: LeavePresenceRequest): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  return navigator.sendBeacon(`${base}/presence/leave`, blob);
};

