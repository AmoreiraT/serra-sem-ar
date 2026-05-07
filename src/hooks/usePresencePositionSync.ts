import { useEffect, useRef } from 'react';
import {
  configurePresenceRoomOnDisconnect,
  getPresenceRoomId,
  removeRealtimePresenceRoom,
  writeRealtimePresence,
} from '../services/firebaseRealtime';
import { useCovidStore } from '../stores/covidStore';
import { useOxygenStore } from '../stores/oxygenStore';
import type { PresenceVector } from '../types/realtimePresence';

export type UsePresencePositionSyncInput = {
  sessionId: string | null;
  dayIndex: number;
  getPosition: () => PresenceVector;
  enabled: boolean;
};

const DESKTOP_MIN_WRITE_INTERVAL_MS = 5_000;
const MOBILE_MIN_WRITE_INTERVAL_MS = 8_000;
const HEARTBEAT_INTERVAL_MS = 45_000;
const POSITION_DELTA_METERS = 2;
const POSITION_DELTA_SQ = POSITION_DELTA_METERS * POSITION_DELTA_METERS;
const DAY_INDEX_DELTA = 7;

type PublishedPresence = {
  position: PresenceVector;
  dayIndex: number;
  atMs: number;
  roomId: number;
};

const isFinitePosition = (position: PresenceVector): boolean =>
  Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);

const distanceSq = (a: PresenceVector, b: PresenceVector): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

const quantizeCoordinate = (value: number): number => Math.round(value * 10) / 10;

const quantizePosition = ({ x, y, z }: PresenceVector): PresenceVector => ({
  x: quantizeCoordinate(x),
  y: quantizeCoordinate(y),
  z: quantizeCoordinate(z),
});

const detectMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return width < 768 || (width <= 1100 && height <= 540) || (coarsePointer && width < 1180);
};

export const usePresencePositionSync = ({
  sessionId,
  dayIndex,
  getPosition,
  enabled,
}: UsePresencePositionSyncInput): void => {
  const isOfflineFallback = useOxygenStore((state) => state.isOfflineFallback);
  const latestInputRef = useRef({ dayIndex, getPosition });
  const lastPublishedRef = useRef<PublishedPresence | null>(null);
  const cancelRoomDisconnectRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    latestInputRef.current = { dayIndex, getPosition };
  }, [dayIndex, getPosition]);

  useEffect(() => {
    if (!enabled || !sessionId || sessionId.startsWith('local_') || isOfflineFallback) return undefined;

    let cancelled = false;
    const isMobile = detectMobile();
    const minWriteIntervalMs = isMobile ? MOBILE_MIN_WRITE_INTERVAL_MS : DESKTOP_MIN_WRITE_INTERVAL_MS;

    const sync = async (force = false) => {
      if (cancelled) return;

      const latest = latestInputRef.current;
      const rawPosition = latest.getPosition();
      if (!isFinitePosition(rawPosition)) return;

      const data = useCovidStore.getState().data[latest.dayIndex];
      const position = quantizePosition(rawPosition);
      const now = Date.now();
      const roomId = getPresenceRoomId(latest.dayIndex);
      const previous = lastPublishedRef.current;

      if (!force && previous) {
        const movedEnough = distanceSq(position, previous.position) >= POSITION_DELTA_SQ;
        const dayChangedEnough = Math.abs(latest.dayIndex - previous.dayIndex) >= DAY_INDEX_DELTA;
        const heartbeatDue = now - previous.atMs >= HEARTBEAT_INTERVAL_MS;
        const minIntervalPassed = now - previous.atMs >= minWriteIntervalMs;

        if (!minIntervalPassed || (!movedEnough && !dayChangedEnough && !heartbeatDue)) return;
      }

      try {
        await writeRealtimePresence({
          sessionId,
          roomId,
          previousRoomId: previous?.roomId,
          lastSeenAt: now,
          dayIndex: latest.dayIndex,
          cases: data?.cases ?? 0,
          deaths: data?.deaths ?? 0,
          position,
          isMobile,
        });

        if (!previous || previous.roomId !== roomId) {
          const cancelCurrent = cancelRoomDisconnectRef.current;
          cancelRoomDisconnectRef.current = null;
          if (cancelCurrent) void cancelCurrent().catch(() => undefined);
          cancelRoomDisconnectRef.current = await configurePresenceRoomOnDisconnect(sessionId, roomId);
        }

        lastPublishedRef.current = {
          position,
          dayIndex: latest.dayIndex,
          atMs: now,
          roomId,
        };
      } catch {
        // Presenca remota e opcional; se regras/RTDB falharem, a obra segue localmente.
      }
    };

    void sync(true);
    const interval = window.setInterval(() => {
      void sync();
    }, minWriteIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);

      const currentRoomId = lastPublishedRef.current?.roomId;
      lastPublishedRef.current = null;

      const cancelRoomDisconnect = cancelRoomDisconnectRef.current;
      cancelRoomDisconnectRef.current = null;
      if (cancelRoomDisconnect) void cancelRoomDisconnect().catch(() => undefined);
      if (currentRoomId !== undefined) void removeRealtimePresenceRoom(sessionId, currentRoomId).catch(() => undefined);
    };
  }, [enabled, isOfflineFallback, sessionId]);
};
