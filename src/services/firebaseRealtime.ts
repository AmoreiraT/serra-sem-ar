import {
  equalTo,
  limitToLast,
  onDisconnect,
  onValue,
  orderByChild,
  query,
  ref,
  type Unsubscribe,
} from 'firebase/database';
import { realtimeDb } from './firebaseConfig';
import type { WorldOxygenState } from '../types/oxygen';
import type { CollapseEvent } from '../types/realtimePresence';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const parseCollapseReason = (value: unknown): CollapseEvent['reason'] | null => {
  if (
    value === 'collective_oxygen_below_zero' ||
    value === 'too_many_users' ||
    value === 'stale_presence_cleanup'
  ) {
    return value;
  }
  return null;
};

const parseCollapseEvent = (value: unknown): CollapseEvent | null => {
  if (!isRecord(value)) return null;
  const eventId = optionalString(value.eventId);
  const targetSessionId = optionalString(value.targetSessionId);
  const reason = parseCollapseReason(value.reason);
  const dayIndex = finiteNumber(value.dayIndex);
  const cases = finiteNumber(value.cases);
  const deaths = finiteNumber(value.deaths);
  const createdAt = finiteNumber(value.createdAt);
  const message = optionalString(value.message);

  if (
    !eventId ||
    !targetSessionId ||
    !reason ||
    dayIndex === null ||
    cases === null ||
    deaths === null ||
    createdAt === null ||
    !message
  ) {
    return null;
  }

  return {
    eventId,
    targetSessionId,
    reason,
    dayIndex,
    cases,
    deaths,
    createdAt,
    message,
  };
};

const parseCollapseEvents = (value: unknown): CollapseEvent[] => {
  if (!isRecord(value)) return [];
  return Object.values(value)
    .map(parseCollapseEvent)
    .filter((event): event is CollapseEvent => Boolean(event));
};

const parseWorldStatus = (value: unknown): WorldOxygenState['status'] | null => {
  if (value === 'stable' || value === 'critical' || value === 'collapsed') return value;
  return null;
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

export const listenForCollapseEvents = (
  sessionId: string,
  onEvent: (event: CollapseEvent) => void,
  onError?: () => void
): Unsubscribe => {
  const eventsRef = query(
    ref(realtimeDb, 'collapseEvents'),
    orderByChild('targetSessionId'),
    equalTo(sessionId),
    limitToLast(1)
  );

  return onValue(
    eventsRef,
    (snapshot) => {
      const events = parseCollapseEvents(snapshot.val())
        .filter((event) => event.targetSessionId === sessionId)
        .sort((a, b) => b.createdAt - a.createdAt);
      const newest = events[0];
      if (newest) onEvent(newest);
    },
    () => {
      onError?.();
    }
  );
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

