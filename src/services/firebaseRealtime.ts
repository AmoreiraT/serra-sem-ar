import {
  onDisconnect,
  onValue,
  ref,
  remove,
  update as updateRealtime,
  type Unsubscribe,
} from 'firebase/database';
import { realtimeDb } from './firebaseConfig';
import type { WorldOxygenState } from '../types/oxygen';
import type { PresenceRoomEntry, PresenceVector } from '../types/realtimePresence';

const PRESENCE_ROOM_SIZE_DAYS = 14;
const PRESENCE_ROOM_STALE_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const parsePresenceVector = (value: unknown): PresenceVector | null => {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
};

const parsePresenceRoomEntry = (value: unknown): PresenceRoomEntry | null => {
  if (!isRecord(value)) return null;
  const sessionId = optionalString(value.sessionId);
  const lastSeenAt = finiteNumber(value.lastSeenAt);
  const dayIndex = finiteNumber(value.dayIndex);
  const position = parsePresenceVector(value.position);
  if (
    !sessionId ||
    lastSeenAt === null ||
    dayIndex === null ||
    !position ||
    value.status !== 'alive' ||
    typeof value.isMobile !== 'boolean'
  ) {
    return null;
  }

  return {
    sessionId,
    lastSeenAt,
    dayIndex,
    cases: finiteNumber(value.cases) ?? undefined,
    deaths: finiteNumber(value.deaths) ?? undefined,
    position,
    status: 'alive',
    isMobile: value.isMobile,
  };
};

const parsePresenceRoomEntries = (value: unknown): PresenceRoomEntry[] => {
  if (!isRecord(value)) return [];
  return Object.values(value)
    .map(parsePresenceRoomEntry)
    .filter((entry): entry is PresenceRoomEntry => Boolean(entry));
};

export const getPresenceRoomId = (dayIndex: number): number =>
  Math.floor(Math.max(0, dayIndex) / PRESENCE_ROOM_SIZE_DAYS);

export const getPresenceRoomIdsForDay = (dayIndex: number): number[] => {
  const current = getPresenceRoomId(dayIndex);
  return [current - 1, current, current + 1].filter((roomId) => roomId >= 0);
};

const parseWorldStatus = (value: unknown): WorldOxygenState['status'] | null => {
  if (value === 'stable' || value === 'critical' || value === 'collapsed') return value;
  return null;
};

const parseWorldCollapse = (value: unknown): WorldOxygenState['lastCollapse'] => {
  if (!isRecord(value)) return null;
  const eventId = optionalString(value.eventId);
  const targetSessionId = optionalString(value.targetSessionId);
  const createdAt = finiteNumber(value.createdAt);
  const message = optionalString(value.message);

  if (!eventId || !targetSessionId || createdAt === null || !message) return null;
  return {
    eventId,
    targetSessionId,
    createdAt,
    message,
  };
};

const parseWorldOxygenState = (value: unknown): WorldOxygenState | null => {
  if (!isRecord(value)) return null;
  const updatedAt = finiteNumber(value.updatedAt);
  const onlineUsersCount = finiteNumber(value.onlineUsersCount);
  const collectiveOxygen = finiteNumber(value.collectiveOxygen);
  const currentDayIndex = finiteNumber(value.currentDayIndex);
  const normalizedCases = finiteNumber(value.normalizedCases);
  const normalizedDeaths = finiteNumber(value.normalizedDeaths);
  const pressure = finiteNumber(value.pressure);
  const status = parseWorldStatus(value.status);

  if (
    updatedAt === null ||
    onlineUsersCount === null ||
    collectiveOxygen === null ||
    currentDayIndex === null ||
    normalizedCases === null ||
    normalizedDeaths === null ||
    pressure === null ||
    !status
  ) {
    return null;
  }

  return {
    updatedAt,
    onlineUsersCount,
    collectiveOxygen,
    currentDayIndex,
    normalizedCases,
    normalizedDeaths,
    pressure,
    status,
    lastCollapse: parseWorldCollapse(value.lastCollapse),
  };
};

export const configurePresenceOnDisconnect = async (sessionId: string): Promise<(() => Promise<void>) | null> => {
  try {
    const presenceRef = ref(realtimeDb, `realtimePresence/${sessionId}`);
    const disconnect = onDisconnect(presenceRef);
    await disconnect.remove();
    return () => disconnect.cancel();
  } catch {
    return null;
  }
};

export const configurePresenceRoomOnDisconnect = async (
  sessionId: string,
  roomId: number
): Promise<(() => Promise<void>) | null> => {
  try {
    const roomRef = ref(realtimeDb, `presenceRooms/${roomId}/${sessionId}`);
    const disconnect = onDisconnect(roomRef);
    await disconnect.remove();
    return () => disconnect.cancel();
  } catch {
    return null;
  }
};

export type WriteRealtimePresenceInput = {
  sessionId: string;
  roomId: number;
  previousRoomId?: number | null;
  lastSeenAt: number;
  dayIndex: number;
  cases: number;
  deaths: number;
  position: PresenceVector;
  isMobile: boolean;
};

export const writeRealtimePresence = async ({
  sessionId,
  roomId,
  previousRoomId,
  lastSeenAt,
  dayIndex,
  cases,
  deaths,
  position,
  isMobile,
}: WriteRealtimePresenceInput): Promise<void> => {
  const roomEntry: PresenceRoomEntry = {
    sessionId,
    lastSeenAt,
    dayIndex,
    cases,
    deaths,
    position,
    status: 'alive',
    isMobile,
  };

  const updates: Record<string, unknown> = {
    [`realtimePresence/${sessionId}/lastSeenAt`]: lastSeenAt,
    [`realtimePresence/${sessionId}/dayIndex`]: dayIndex,
    [`realtimePresence/${sessionId}/cases`]: cases,
    [`realtimePresence/${sessionId}/deaths`]: deaths,
    [`realtimePresence/${sessionId}/position`]: position,
    [`realtimePresence/${sessionId}/status`]: 'alive',
    [`realtimePresence/${sessionId}/isMobile`]: isMobile,
    [`presenceRooms/${roomId}/${sessionId}`]: roomEntry,
  };

  if (previousRoomId !== undefined && previousRoomId !== null && previousRoomId !== roomId) {
    updates[`presenceRooms/${previousRoomId}/${sessionId}`] = null;
  }

  await updateRealtime(ref(realtimeDb), updates);
};

export const removeRealtimePresenceRoom = async (sessionId: string, roomId: number): Promise<void> => {
  await remove(ref(realtimeDb, `presenceRooms/${roomId}/${sessionId}`));
};

export const listenToPresenceRooms = (
  roomIds: number[],
  onEntries: (entries: PresenceRoomEntry[]) => void,
  onError?: () => void
): Unsubscribe => {
  const roomSnapshots = new Map<number, PresenceRoomEntry[]>();
  const emit = () => {
    const now = Date.now();
    const bySession = new Map<string, PresenceRoomEntry>();

    roomSnapshots.forEach((entries) => {
      entries.forEach((entry) => {
        if (now - entry.lastSeenAt > PRESENCE_ROOM_STALE_MS) return;
        const current = bySession.get(entry.sessionId);
        if (!current || entry.lastSeenAt > current.lastSeenAt) {
          bySession.set(entry.sessionId, entry);
        }
      });
    });

    onEntries([...bySession.values()]);
  };

  const unsubscribes = roomIds.map((roomId) =>
    onValue(
      ref(realtimeDb, `presenceRooms/${roomId}`),
      (snapshot) => {
        roomSnapshots.set(roomId, parsePresenceRoomEntries(snapshot.val()));
        emit();
      },
      () => {
        onError?.();
      }
    )
  );

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};

export const listenToWorldOxygen = (
  onState: (state: WorldOxygenState) => void,
  onError?: () => void
): Unsubscribe => {
  const worldRef = ref(realtimeDb, 'worldState/oxygen');
  return onValue(
    worldRef,
    (snapshot) => {
      const world = parseWorldOxygenState(snapshot.val());
      if (world) onState(world);
    },
    () => {
      onError?.();
    }
  );
};
