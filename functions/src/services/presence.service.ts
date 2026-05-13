import {randomUUID} from "crypto";
import {getDatabase} from "firebase-admin/database";
import type {OxygenStatus} from "../types/oxygen";
import type {
  JoinPresenceRequest,
  JoinPresenceResponse,
  LeavePresenceResponse,
  RealtimePresence,
  UpdatePresenceRequest,
  UpdatePresenceResponse,
} from "../types/presence";
import {clamp} from "../utils/clamp";
import {HttpError} from "../utils/http";
import {isRecord, parseRealtimePresence} from "../utils/validation";
import {recordDailySessionJoined} from "./memorial.service";
import {oxygenConfig} from "./oxygen.config";

const PRESENCE_PATH = "realtimePresence";
const PRESENCE_ROOMS_PATH = "presenceRooms";
const PRESENCE_ROOM_SIZE_DAYS = 14;
const WORLD_OXYGEN_PATH = "worldState/oxygen";
const STALE_PRESENCE_MS = 90_000;
const INITIAL_OXYGEN = 100;
const DESKTOP_UPDATE_INTERVAL_MS = 5_000;
const MOBILE_UPDATE_INTERVAL_MS = 8_000;
const MIN_UPDATE_FLOOR_MS = 4_000;
const RESET_MESSAGE = "A serra ficou sem ar. Sua presença foi removida da paisagem.";
const STALE_MESSAGE = "A sessão perdeu o fôlego da rede e voltou ao início da serra.";

type CleanupStalePresenceOptions = {
  includePresenceRooms?: boolean;
};

export type CleanupStalePresenceResult = {
  removedPresenceSessions: number;
  removedPresenceRoomEntries: number;
  removedTotal: number;
};

export const getPresenceStaleCutoff = (now = Date.now()): number => now - STALE_PRESENCE_MS;

const database = () => getDatabase();

const presenceRef = (sessionId: string) => database().ref(`${PRESENCE_PATH}/${sessionId}`);

const presenceRoomPath = (dayIndex: number, sessionId: string): string =>
  `${PRESENCE_ROOMS_PATH}/${Math.floor(Math.max(0, dayIndex) / PRESENCE_ROOM_SIZE_DAYS)}/${sessionId}`;

const parsePresenceRoomEntry = (
  value: unknown,
  fallbackSessionId: string
): {sessionId: string; lastSeenAt: number} | null => {
  if (!isRecord(value)) return null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : fallbackSessionId;
  if (typeof sessionId !== "string" || !sessionId.startsWith("presence_")) return null;
  if (value.status !== "alive") return null;
  if (typeof value.lastSeenAt !== "number" || !Number.isFinite(value.lastSeenAt)) return null;
  return {sessionId, lastSeenAt: value.lastSeenAt};
};

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
  };

  // Realtime Database rejects undefined values; include optional fields only when present.
  if (input.userAgent) {
    presence.userAgent = input.userAgent;
  }
  if (input.clientId) {
    presence.clientId = input.clientId;
  }

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
  const presence = await getPresence(sessionId);
  const updates: Record<string, null> = {
    [`${PRESENCE_PATH}/${sessionId}`]: null,
  };

  if (presence) {
    updates[presenceRoomPath(presence.dayIndex, sessionId)] = null;
  }

  await database().ref().update(updates);
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
  await database().ref().update({
    [`${PRESENCE_PATH}/${presence.sessionId}/status`]: "asphyxiated",
    [`${PRESENCE_PATH}/${presence.sessionId}/oxygen`]: 0,
    [`${PRESENCE_PATH}/${presence.sessionId}/asphyxiatedAt`]: at,
    [`${PRESENCE_PATH}/${presence.sessionId}/memorializedAt`]: at,
    [`${PRESENCE_PATH}/${presence.sessionId}/lastSeenAt`]: at,
    [presenceRoomPath(presence.dayIndex, presence.sessionId)]: null,
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
  const updates: Record<string, unknown> = {
    lastSeenAt: now,
    dayIndex: input.dayIndex,
    position: input.position,
    oxygen,
  };

  if (input.cases !== undefined) updates.cases = input.cases;
  if (input.deaths !== undefined) updates.deaths = input.deaths;

  await presenceRef(input.sessionId).update(updates);

  return {
    accepted: true,
    serverTimestamp: now,
    oxygen,
    collectiveOxygen: world.collectiveOxygen,
    worldStatus: world.status,
    shouldReset: false,
  };
};

export const cleanupStalePresenceRecords = async (
  now = Date.now(),
  options: CleanupStalePresenceOptions = {}
): Promise<CleanupStalePresenceResult> => {
  const cutoff = getPresenceStaleCutoff(now);
  const snapshot = await database().ref(PRESENCE_PATH).orderByChild("lastSeenAt").endAt(cutoff).get();
  const raw: unknown = snapshot.val();

  const updates: Record<string, null> = {};
  let removedSessions = 0;

  if (isRecord(raw)) {
    Object.entries(raw).forEach(([sessionId, value]) => {
      const presence = parseRealtimePresence(value, sessionId);
      if (!presence || presence.lastSeenAt <= cutoff) {
        removedSessions += 1;
        updates[`${PRESENCE_PATH}/${sessionId}`] = null;
        if (presence) {
          updates[presenceRoomPath(presence.dayIndex, sessionId)] = null;
        }
      }
    });
  }

  let removedRoomEntries = 0;
  if (options.includePresenceRooms) {
    const roomsSnapshot = await database().ref(PRESENCE_ROOMS_PATH).get();
    const roomsRaw: unknown = roomsSnapshot.val();

    if (isRecord(roomsRaw)) {
      Object.entries(roomsRaw).forEach(([roomId, roomValue]) => {
        const roomPath = `${PRESENCE_ROOMS_PATH}/${roomId}`;
        if (!isRecord(roomValue)) {
          updates[roomPath] = null;
          removedRoomEntries += 1;
          return;
        }

        Object.entries(roomValue).forEach(([sessionId, entryValue]) => {
          const entry = parsePresenceRoomEntry(entryValue, sessionId);
          if (!entry || entry.lastSeenAt <= cutoff) {
            updates[`${roomPath}/${sessionId}`] = null;
            removedRoomEntries += 1;
          }
        });
      });
    }
  }

  const paths = Object.keys(updates);
  if (paths.length) {
    await database().ref().update(updates);
  }

  return {
    removedPresenceSessions: removedSessions,
    removedPresenceRoomEntries: removedRoomEntries,
    removedTotal: removedSessions + removedRoomEntries,
  };
};
