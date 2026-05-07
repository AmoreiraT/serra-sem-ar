import { useEffect, useRef } from 'react';
import { listenToWorldOxygen } from '../services/firebaseRealtime';
import { useOxygenStore } from '../stores/oxygenStore';

const MOBILE_DRAIN_MULTIPLIER = 0.85;

const detectMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return width < 768 || (width <= 1100 && height <= 540) || (coarsePointer && width < 1180);
};

const calculateIndividualOxygen = (collectiveOxygen: number): number => {
  const drain = (100 - collectiveOxygen) * (detectMobile() ? MOBILE_DRAIN_MULTIPLIER : 1);
  return Math.max(0, Math.min(100, 100 - drain));
};

export const useOxygenCollapseListener = (sessionId: string | null): void => {
  const triggerCollapse = useOxygenStore((state) => state.triggerCollapse);
  const setOxygenState = useOxygenStore((state) => state.setOxygenState);
  const seenEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = listenToWorldOxygen((world) => {
      setOxygenState({
        oxygen: calculateIndividualOxygen(world.collectiveOxygen),
        collectiveOxygen: world.collectiveOxygen,
        status: world.status,
      });

      const collapse = world.lastCollapse;
      if (
        !sessionId ||
        sessionId.startsWith('local_') ||
        !collapse ||
        collapse.targetSessionId !== sessionId ||
        seenEventsRef.current.has(collapse.eventId)
      ) {
        return;
      }

      seenEventsRef.current.add(collapse.eventId);
      triggerCollapse(collapse.message);
    });
    return () => unsubscribe();
  }, [sessionId, setOxygenState, triggerCollapse]);
};
