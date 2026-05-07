import type {
  JoinPresenceRequest,
  LeavePresenceRequest,
  PresenceVector,
  RealtimePresence,
  UpdatePresenceRequest,
} from "../types/presence";
import type {RecalculateOxygenRequest, WorldOxygenState} from "../types/oxygen";
import {HttpError} from "./http";

const MAX_USER_AGENT_LENGTH = 240;
const MAX_CLIENT_ID_LENGTH = 96;
const MAX_COORDINATE_ABS = 20_000;
const MAX_DAY_INDEX = 50_000;
const MAX_TIMESTAMP_DRIFT_MS = 1000 * 60 * 60 * 24;
const SESSION_ID_REGEX = /^presence_[0-9a-fA-F-]{36}$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonString = (value: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    throw new HttpError(400, "invalid_json_body");
  }
  throw new HttpError(400, "invalid_json_body");
};

export const requireJsonObject = (body: unknown): Record<string, unknown> => {
  if (isRecord(body)) return body;
  if (typeof body === "string") return parseJsonString(body);
  throw new HttpError(400, "invalid_json_body");
};

const requireFiniteNumber = (
  value: unknown,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `invalid_${field}`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new HttpError(400, `invalid_${field}`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new HttpError(400, `invalid_${field}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new HttpError(400, `invalid_${field}`);
  }
  return value;
};

const optionalTrimmedString = (value: unknown, field: string, maxLength: number): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new HttpError(400, `invalid_${field}`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > maxLength) throw new HttpError(400, `invalid_${field}`);
  return trimmed;
};

export const isSessionId = (value: unknown): value is string =>
  typeof value === "string" && SESSION_ID_REGEX.test(value);

export const requireSessionId = (value: unknown): string => {
  if (!isSessionId(value)) throw new HttpError(400, "invalid_sessionId");
  return value;
};

export const requirePresenceVector = (value: unknown, field = "position"): PresenceVector => {
  if (!isRecord(value)) throw new HttpError(400, `invalid_${field}`);
  const x = requireFiniteNumber(value.x, `${field}_x`, {min: -MAX_COORDINATE_ABS, max: MAX_COORDINATE_ABS});
  const y = requireFiniteNumber(value.y, `${field}_y`, {min: -MAX_COORDINATE_ABS, max: MAX_COORDINATE_ABS});
  const z = requireFiniteNumber(value.z, `${field}_z`, {min: -MAX_COORDINATE_ABS, max: MAX_COORDINATE_ABS});
  return {x, y, z};
};

export const validateJoinPresenceRequest = (body: unknown): JoinPresenceRequest => {
  const payload = requireJsonObject(body);
  if (typeof payload.isMobile !== "boolean") {
    throw new HttpError(400, "invalid_isMobile");
  }

  return {
    clientId: optionalTrimmedString(payload.clientId, "clientId", MAX_CLIENT_ID_LENGTH),
    isMobile: payload.isMobile,
    userAgent: optionalTrimmedString(payload.userAgent, "userAgent", MAX_USER_AGENT_LENGTH),
  };
};

export const validateUpdatePresenceRequest = (body: unknown): UpdatePresenceRequest => {
  const payload = requireJsonObject(body);
  const now = Date.now();
  const clientTimestamp = requireFiniteNumber(payload.clientTimestamp, "clientTimestamp", {
    min: now - MAX_TIMESTAMP_DRIFT_MS,
    max: now + MAX_TIMESTAMP_DRIFT_MS,
  });

  return {
    sessionId: requireSessionId(payload.sessionId),
    dayIndex: requireFiniteNumber(payload.dayIndex, "dayIndex", {
      min: 0,
      max: MAX_DAY_INDEX,
      integer: true,
    }),
    cases: payload.cases === undefined ? undefined : requireFiniteNumber(payload.cases, "cases", {
      min: 0,
      max: 2_000_000,
    }),
    deaths: payload.deaths === undefined ? undefined : requireFiniteNumber(payload.deaths, "deaths", {
      min: 0,
      max: 50_000,
    }),
    position: requirePresenceVector(payload.position),
    clientTimestamp,
  };
};

export const validateLeavePresenceRequest = (body: unknown): LeavePresenceRequest => {
  const payload = requireJsonObject(body);
  return {
    sessionId: requireSessionId(payload.sessionId),
  };
};

export const validateRecalculateOxygenRequest = (body: unknown): RecalculateOxygenRequest => {
  const payload = requireJsonObject(body);
  return {
    dayIndex: requireFiniteNumber(payload.dayIndex, "dayIndex", {
      min: 0,
      max: MAX_DAY_INDEX,
      integer: true,
    }),
    cases: requireFiniteNumber(payload.cases, "cases", {min: 0, max: 2_000_000}),
    deaths: requireFiniteNumber(payload.deaths, "deaths", {min: 0, max: 50_000}),
  };
};

export const parseRealtimePresence = (value: unknown, fallbackSessionId?: string): RealtimePresence | null => {
  if (!isRecord(value)) return null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : fallbackSessionId;
  let position: PresenceVector | null = null;
  if (isRecord(value.position)) {
    try {
      position = requirePresenceVector(value.position);
    } catch {
      return null;
    }
  }
  const status = value.status;

  if (
    !isSessionId(sessionId) ||
    !position ||
    typeof value.joinedAt !== "number" ||
    !Number.isFinite(value.joinedAt) ||
    typeof value.lastSeenAt !== "number" ||
    !Number.isFinite(value.lastSeenAt) ||
    typeof value.oxygen !== "number" ||
    !Number.isFinite(value.oxygen) ||
    typeof value.dayIndex !== "number" ||
    !Number.isInteger(value.dayIndex) ||
    typeof value.isMobile !== "boolean" ||
    typeof value.updateIntervalMs !== "number" ||
    !Number.isFinite(value.updateIntervalMs) ||
    (status !== "alive" && status !== "asphyxiated" && status !== "memorialized" && status !== "disconnected")
  ) {
    return null;
  }

  return {
    sessionId,
    joinedAt: value.joinedAt,
    lastSeenAt: value.lastSeenAt,
    oxygen: value.oxygen,
    dayIndex: value.dayIndex,
    cases: typeof value.cases === "number" && Number.isFinite(value.cases) ? value.cases : undefined,
    deaths: typeof value.deaths === "number" && Number.isFinite(value.deaths) ? value.deaths : undefined,
    position,
    status,
    isMobile: value.isMobile,
    updateIntervalMs: value.updateIntervalMs,
    userAgent: typeof value.userAgent === "string" ? value.userAgent : undefined,
    clientId: typeof value.clientId === "string" ? value.clientId : undefined,
    asphyxiatedAt: typeof value.asphyxiatedAt === "number" ? value.asphyxiatedAt : undefined,
    memorializedAt: typeof value.memorializedAt === "number" ? value.memorializedAt : undefined,
  };
};

export const parseWorldOxygenState = (value: unknown): WorldOxygenState | null => {
  if (!isRecord(value)) return null;
  const status = value.status;
  const lastCollapse =
    isRecord(value.lastCollapse) &&
    typeof value.lastCollapse.eventId === "string" &&
    typeof value.lastCollapse.targetSessionId === "string" &&
    typeof value.lastCollapse.createdAt === "number" &&
    Number.isFinite(value.lastCollapse.createdAt) &&
    typeof value.lastCollapse.message === "string" ?
      {
        eventId: value.lastCollapse.eventId,
        targetSessionId: value.lastCollapse.targetSessionId,
        createdAt: value.lastCollapse.createdAt,
        message: value.lastCollapse.message,
      } :
      null;

  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    typeof value.onlineUsersCount !== "number" ||
    !Number.isFinite(value.onlineUsersCount) ||
    typeof value.collectiveOxygen !== "number" ||
    !Number.isFinite(value.collectiveOxygen) ||
    typeof value.currentDayIndex !== "number" ||
    !Number.isInteger(value.currentDayIndex) ||
    typeof value.normalizedCases !== "number" ||
    !Number.isFinite(value.normalizedCases) ||
    typeof value.normalizedDeaths !== "number" ||
    !Number.isFinite(value.normalizedDeaths) ||
    typeof value.pressure !== "number" ||
    !Number.isFinite(value.pressure) ||
    (status !== "stable" && status !== "critical" && status !== "collapsed")
  ) {
    return null;
  }

  return {
    updatedAt: value.updatedAt,
    onlineUsersCount: value.onlineUsersCount,
    collectiveOxygen: value.collectiveOxygen,
    currentDayIndex: value.currentDayIndex,
    normalizedCases: value.normalizedCases,
    normalizedDeaths: value.normalizedDeaths,
    pressure: value.pressure,
    status,
    lastCollapse,
  };
};
