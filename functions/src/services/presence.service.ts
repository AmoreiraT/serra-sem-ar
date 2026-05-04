import {randomUUID} from "crypto";
import {getDatabase} from "firebase-admin/database";
import type {
  JoinPresenceRequest,
  JoinPresenceResponse,
  LeavePresenceResponse,
  RealtimePresence,
  UpdatePresenceRequest,
  UpdatePresenceResponse,
} from "../types/presence";
import type {OxygenStatus} from "../types/oxygen";
import {oxygenConfig} from "./oxygen.config";
import {clamp} from "../utils/clamp";
import {HttpError} from "../utils/http";
import {isRecord, parseRealtimePresence} from "../utils/validation";
import {recordDailySessionJoined} from "./memorial.service";

const PRESENCE_PATH = "realtimePresence";
const WORLD_OXYGEN_PATH = "worldState/oxygen";
const STALE_PRESENCE_MS = 45_000;
const INITIAL_OXYGEN = 100;
const DESKTOP_UPDATE_INTERVAL_MS = 2_000;
const MOBILE_UPDATE_INTERVAL_MS = 3_500;
const MIN_UPDATE_FLOOR_MS = 1_000;
const RESET_MESSAGE = "A serra ficou sem ar. Sua presença foi removida da paisagem.";
const STALE_MESSAGE = "A sessão perdeu o fôlego da rede e voltou ao início da serra.";

export const getPresenceStaleCutoff = (now = Date.now()): number => now - STALE_PRESENCE_MS;

const database = () => getDatabase();

const presenceRef = (sessionId: string) => database().ref(`${PRESENCE_PATH}/${sessionId}`);

export const recommendedUpdateIntervalMs = (isMobile: boolean): number =>
  isMobile ? MOBILE_UPDATE_INTERVAL_MS : DESKTOP_UPDATE_INTERVAL_MS;

const defaultPosition = {x: 50, y: 30, z: 50};

export const joinPresence = async (input: JoinPresenceRequest): Promise<JoinPresenceResponse> => {
  const now = Date.now();
  const sessionId = `presence_${randomUUID()}`;
  const updateIntervalMs = recommendedUpdateIntervalMs(input.isMobile);
  const presence: RealtimePresence = {
    sessionId,
    joinedAt: now,
    lastSeenAt: now,
    oxygen: INITIAL_OXYGEN,
    dayIndex: 0,
    position: defaultPosition,
    status: "alive",
    isMobile: input.isMobile,
    updateIntervalMs,
    userAgent: input.userAgent,
    clientId: input.clientId,
  };

  await presenceRef(sessionId).set(presence);
  await recordDailySessionJoined().catch((error: unknown) => {
    console.warn("recordDailySessionJoined failed", error instanceof Error ? error.message : "unknown_error");
  });

  return {
    sessionId,
    joinedAt: now,
    initialOxygen: INITIAL_OXYGEN,
    updateIntervalMs,
    maxOnlineUsersSoftLimit: oxygenConfig.maxOnlineUsersSoftLimit,
  };
};

export const getPresence = async (sessionId: string): Promise<RealtimePresence | null> => {
  const snapshot = await presenceRef(sessionId).get();
  return parseRealtimePresence(snapshot.val(), sessionId);
};

export const leavePresence = async (sessionId: string): Promise<LeavePresenceResponse> => {
  await presenceRef(sessionId).remove();
  return {success: true};
};

export const listAlivePresences = async (now = Date.now()): Promise<RealtimePresence[]> => {
  const cutoff = getPresenceStaleCutoff(now);
  const snapshot = await database().ref(PRESENCE_PATH).orderByChild("lastSeenAt").startAt(cutoff).get();
  const raw: unknown = snapshot.val();
  if (!isRecord(raw)) return [];

  return Object.entries(raw)
    .map(([sessionId, value]) => parseRealtimePresence(value, sessionId))
    .filter((presence): presence is RealtimePresence => Boolean(presence))
    .filter((presence) => presence.status === "alive" && presence.lastSeenAt >= cutoff);
};

export const findOldestAlivePresence = async (now = Date.now()): Promise<RealtimePresence | null> => {
  const presences = await listAlivePresences(now);
  if (!presences.length) return null;
  return presences.reduce((oldest, presence) =>
    presence.joinedAt < oldest.joinedAt ? presence : oldest
  );
};

export const markPresenceAsphyxiated = async (presence: RealtimePresence, at: number): Promise<void> => {
  await presenceRef(presence.sessionId).update({
    status: "asphyxiated",
    oxygen: 0,
    asphyxiatedAt: at,
    memorializedAt: at,
    lastSeenAt: at,
  });
};

const readWorldStatus = (value: unknown): OxygenStatus => {
  if (value === "critical" || value === "collapsed") return value;
  return "stable";
};

const getWorldFallback = async (): Promise<{ collectiveOxygen: number; status: OxygenStatus }> => {
  const snapshot = await database().ref(WORLD_OXYGEN_PATH).get();
  const raw: unknown = snapshot.val();
  if (!isRecord(raw)) {
    return {
      collectiveOxygen: 100,
      status: "stable" as const,
    };
  }

  const collectiveOxygen =
    typeof raw.collectiveOxygen === "number" && Number.isFinite(raw.collectiveOxygen) ?
      raw.collectiveOxygen :
      100;
  const status = readWorldStatus(raw.status);

  return {collectiveOxygen, status};
};

const calculateIndividualOxygen = (collectiveOxygen: number, isMobile: boolean): number => {
  const drain = (100 - collectiveOxygen) * (isMobile ? oxygenConfig.mobileDrainMultiplier : 1);
  return clamp(100 - drain, 0, 100);
};

export const updatePresence = async (input: UpdatePresenceRequest): Promise<UpdatePresenceResponse> => {
  const now = Date.now();
  const presence = await getPresence(input.sessionId);
  const world = await getWorldFallback();

  if (!presence) {
    throw new HttpError(404, "stale_session");
  }

  if (presence.status === "asphyxiated" || presence.status === "memorialized") {
    return {
      accepted: false,
      serverTimestamp: now,
      oxygen: 0,
      collectiveOxygen: world.collectiveOxygen,
      worldStatus: world.status,
      shouldReset: true,
      resetReason: "asphyxiated",
      message: RESET_MESSAGE,
    };
  }

  if (presence.status === "disconnected") {
    return {
      accepted: false,
      serverTimestamp: now,
      oxygen: presence.oxygen,
      collectiveOxygen: world.collectiveOxygen,
      worldStatus: world.status,
      shouldReset: true,
      resetReason: "presence_removed",
      message: RESET_MESSAGE,
    };
  }

  if (presence.lastSeenAt < getPresenceStaleCutoff(now)) {
    await presenceRef(input.sessionId).remove();
    return {
      accepted: false,
      serverTimestamp: now,
      oxygen: 0,
      collectiveOxygen: world.collectiveOxygen,
      worldStatus: world.status,
      shouldReset: true,
      resetReason: "stale_session",
      message: STALE_MESSAGE,
    };
  }

  const minIntervalMs = Math.max(MIN_UPDATE_FLOOR_MS, Math.floor(presence.updateIntervalMs * 0.65));
  if (now - presence.lastSeenAt < minIntervalMs) {
    return {
      accepted: false,
      serverTimestamp: now,
      oxygen: presence.oxygen,
      collectiveOxygen: world.collectiveOxygen,
      worldStatus: world.status,
      shouldReset: false,
    };
  }

  const oxygen = calculateIndividualOxygen(world.collectiveOxygen, presence.isMobile);
  await presenceRef(input.sessionId).update({
    lastSeenAt: now,
    dayIndex: input.dayIndex,
    position: input.position,
    oxygen,
  });

  return {
    accepted: true,
    serverTimestamp: now,
    oxygen,
    collectiveOxygen: world.collectiveOxygen,
    worldStatus: world.status,
    shouldReset: false,
  };
};

export const cleanupStalePresenceRecords = async (now = Date.now()): Promise<number> => {
  const cutoff = getPresenceStaleCutoff(now);
  const snapshot = await database().ref(PRESENCE_PATH).orderByChild("lastSeenAt").endAt(cutoff).get();
  const raw: unknown = snapshot.val();
  if (!isRecord(raw)) return 0;

  const updates: Record<string, null> = {};
  Object.entries(raw).forEach(([sessionId, value]) => {
    const presence = parseRealtimePresence(value, sessionId);
    if (!presence || presence.lastSeenAt <= cutoff) {
      updates[`${PRESENCE_PATH}/${sessionId}`] = null;
    }
  });

  const paths = Object.keys(updates);
  if (!paths.length) return 0;
  await database().ref().update(updates);
  return paths.length;
};
