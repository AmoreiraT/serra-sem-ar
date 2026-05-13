import { useEffect, useRef } from 'react';
import {
  configurePresenceRoomOnDisconnect,
  getPresenceRoomId,
  removeRealtimePresenceRoom,
  writeRealtimePresence,
  writeRealtimePresenceRoom,
} from '../services/firebaseRealtime';
import { useCovidStore } from '../stores/covidStore';
import { useOxygenStore } from '../stores/oxygenStore';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import type { PresenceVector } from '../types/realtimePresence';

export type UsePresencePositionSyncInput = {
  sessionId: string | null;
  dayIndex: number;
  getPosition: () => PresenceVector;
  enabled: boolean;
};

const FULL_HEARTBEAT_FLOOR_MS = 5_000;
const FULL_HEARTBEAT_CEILING_MS = 12_000;
const HEARTBEAT_INTERVAL_MS = 28_000;
const DAY_INDEX_DELTA = 2;

type PublishedPresence = {
  position: PresenceVector;
  dayIndex: number;
  atMs: number;
  fullAtMs: number;
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

export const usePresencePositionSync = ({
  sessionId,
  dayIndex,
  getPosition,
  enabled,
}: UsePresencePositionSyncInput): void => {
  const isOfflineFallback = useOxygenStore((state) => state.isOfflineFallback);
  const updateIntervalMs = useOxygenStore((state) => state.updateIntervalMs);
  const runtimeDeviceClass = usePerformanceProfileStore((state) => state.deviceClass);
  const activeRoomWriteIntervalMs = usePerformanceProfileStore(
    (state) => state.profile.presence.activeRoomWriteIntervalMs
  );
  const idleRoomWriteIntervalMs = usePerformanceProfileStore((state) => state.profile.presence.idleRoomWriteIntervalMs);
  const positionDeltaMeters = usePerformanceProfileStore((state) => state.profile.presence.positionDeltaMeters);
  const latestInputRef = useRef({ dayIndex, getPosition });
  const lastPublishedRef = useRef<PublishedPresence | null>(null);
  const cancelRoomDisconnectRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    latestInputRef.current = { dayIndex, getPosition };
  }, [dayIndex, getPosition]);

  useEffect(() => {
    if (!enabled || !sessionId || sessionId.startsWith('local_') || isOfflineFallback) return undefined;

    let cancelled = false;
    const isMobile = runtimeDeviceClass === 'phone';
    const positionDeltaSq = positionDeltaMeters * positionDeltaMeters;
    const fullHeartbeatMs = Math.max(
      FULL_HEARTBEAT_FLOOR_MS,
      Math.min(FULL_HEARTBEAT_CEILING_MS, updateIntervalMs)
    );

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
      const previousFullAt = previous?.fullAtMs ?? 0;

      let shouldWriteRoom = force || !previous;
      let shouldWriteFullPresence = force || !previous;
      if (!force && previous) {
        const movedEnough = distanceSq(position, previous.position) >= positionDeltaSq;
        const dayChangedEnough = Math.abs(latest.dayIndex - previous.dayIndex) >= DAY_INDEX_DELTA;
        const roomChanged = roomId !== previous.roomId;
        const heartbeatDue = now - previousFullAt >= HEARTBEAT_INTERVAL_MS;
        const fullPresenceDue = now - previousFullAt >= fullHeartbeatMs;
        const activeRoomIntervalPassed = now - previous.atMs >= activeRoomWriteIntervalMs;
        const idleRoomIntervalPassed = now - previous.atMs >= idleRoomWriteIntervalMs;

        shouldWriteRoom =
          roomChanged ||
          (activeRoomIntervalPassed && (movedEnough || dayChangedEnough)) ||
          (idleRoomIntervalPassed && heartbeatDue);
        shouldWriteFullPresence = roomChanged || dayChangedEnough || (fullPresenceDue && (movedEnough || heartbeatDue));

        if (!shouldWriteRoom && !shouldWriteFullPresence) return;
      }

      try {
        const payload = {
          sessionId,
          roomId,
          previousRoomId: previous?.roomId,
          lastSeenAt: now,
          dayIndex: latest.dayIndex,
          cases: data?.cases ?? 0,
          deaths: data?.deaths ?? 0,
          position,
          isMobile,
        };

        if (shouldWriteFullPresence) {
          await writeRealtimePresence(payload);
        } else {
          await writeRealtimePresenceRoom(payload);
        }

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
          fullAtMs: shouldWriteFullPresence ? now : previousFullAt,
          roomId,
        };
      } catch {
        // Presenca remota e opcional; se regras/RTDB falharem, a obra segue localmente.
      }
    };

    void sync(true);
    const interval = window.setInterval(() => {
      void sync();
    }, activeRoomWriteIntervalMs);

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
  }, [
    activeRoomWriteIntervalMs,
    enabled,
    idleRoomWriteIntervalMs,
    isOfflineFallback,
    positionDeltaMeters,
    runtimeDeviceClass,
    sessionId,
    updateIntervalMs,
  ]);
};
