import { useEffect, useRef } from 'react';
import { recalculateOxygen, updatePresence } from '../services/presenceApi';
import { useCovidStore } from '../stores/covidStore';
import { useOxygenStore } from '../stores/oxygenStore';
import type { OxygenStatus } from '../types/oxygen';
import type { PresenceVector } from '../types/realtimePresence';

export type UsePresencePositionSyncInput = {
  sessionId: string | null;
  dayIndex: number;
  getPosition: () => PresenceVector;
  enabled: boolean;
};

const RECALCULATE_LEASE_KEY = 'serra-sem-ar-oxygen-recalculate-lease';
const RECALCULATE_DESKTOP_INTERVAL_MS = 15_000;
const RECALCULATE_MOBILE_INTERVAL_MS = 25_000;

const isFinitePosition = (position: PresenceVector): boolean =>
  Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);

const oxygenStatusFromCollective = (collectiveOxygen: number): OxygenStatus => {
  if (collectiveOxygen <= 0) return 'collapsed';
  if (collectiveOxygen <= 25) return 'critical';
  return 'stable';
};

const tryAcquireRecalculationLease = (now: number, leaseMs: number): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const current = Number(window.localStorage.getItem(RECALCULATE_LEASE_KEY) ?? 0);
    if (Number.isFinite(current) && now - current < leaseMs) return false;
    window.localStorage.setItem(RECALCULATE_LEASE_KEY, String(now));
    return true;
  } catch {
    return true;
  }
};

export const usePresencePositionSync = ({
  sessionId,
  dayIndex,
  getPosition,
  enabled,
}: UsePresencePositionSyncInput): void => {
  const updateIntervalMs = useOxygenStore((state) => state.updateIntervalMs);
  const isOfflineFallback = useOxygenStore((state) => state.isOfflineFallback);
  const setOxygenState = useOxygenStore((state) => state.setOxygenState);
  const triggerCollapse = useOxygenStore((state) => state.triggerCollapse);
  const latestInputRef = useRef({ dayIndex, getPosition });
  const lastRecalculateAtRef = useRef(0);
  const lastRecalculateDayRef = useRef<number | null>(null);

  useEffect(() => {
    latestInputRef.current = { dayIndex, getPosition };
  }, [dayIndex, getPosition]);

  useEffect(() => {
    if (!enabled || !sessionId || sessionId.startsWith('local_') || isOfflineFallback) return undefined;

    let cancelled = false;
    const recalculateIntervalMs =
      updateIntervalMs >= 3_000 ? RECALCULATE_MOBILE_INTERVAL_MS : RECALCULATE_DESKTOP_INTERVAL_MS;

    const tick = async () => {
      if (cancelled) return;
      const latest = latestInputRef.current;
      const position = latest.getPosition();
      if (!isFinitePosition(position)) return;

      try {
        const response = await updatePresence({
          sessionId,
          dayIndex: latest.dayIndex,
          position,
          clientTimestamp: Date.now(),
        });

        setOxygenState({
          oxygen: response.oxygen,
          collectiveOxygen: response.collectiveOxygen,
          status: response.worldStatus,
        });

        if (response.shouldReset) {
          triggerCollapse(response.message ?? 'Sua presença foi removida da paisagem.');
          return;
        }
      } catch {
        return;
      }

      const now = Date.now();
      const shouldRecalculateByTime = now - lastRecalculateAtRef.current >= recalculateIntervalMs;
      const shouldRecalculateByDay =
        lastRecalculateDayRef.current === null || Math.abs(latest.dayIndex - lastRecalculateDayRef.current) >= 4;
      if (!shouldRecalculateByTime && !shouldRecalculateByDay) return;
      if (!tryAcquireRecalculationLease(now, 6_000)) return;

      const currentData = useCovidStore.getState().data[latest.dayIndex];
      if (!currentData) return;

      try {
        const recalculated = await recalculateOxygen({
          dayIndex: latest.dayIndex,
          cases: currentData.cases,
          deaths: currentData.deaths,
        });
        lastRecalculateAtRef.current = now;
        lastRecalculateDayRef.current = latest.dayIndex;
        setOxygenState({
          oxygen: useOxygenStore.getState().oxygen,
          collectiveOxygen: recalculated.collectiveOxygen,
          status: oxygenStatusFromCollective(recalculated.collectiveOxygen),
        });
        if (recalculated.collapsed && recalculated.collapsedSessionId === sessionId) {
          triggerCollapse('A serra ficou sem ar. Sua presença foi removida da paisagem.');
        }
      } catch {
        lastRecalculateAtRef.current = now;
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, updateIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    enabled,
    isOfflineFallback,
    sessionId,
    setOxygenState,
    triggerCollapse,
    updateIntervalMs,
  ]);
};

