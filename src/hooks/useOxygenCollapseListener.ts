import { useEffect, useRef } from 'react';
import { listenForCollapseEvents, listenToWorldOxygen } from '../services/firebaseRealtime';
import { useOxygenStore } from '../stores/oxygenStore';

export const useOxygenCollapseListener = (sessionId: string | null): void => {
  const triggerCollapse = useOxygenStore((state) => state.triggerCollapse);
  const setOxygenState = useOxygenStore((state) => state.setOxygenState);
  const seenEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = listenToWorldOxygen((world) => {
      setOxygenState({
        oxygen: useOxygenStore.getState().oxygen,
        collectiveOxygen: world.collectiveOxygen,
        status: world.status,
      });
    });
    return () => unsubscribe();
  }, [setOxygenState]);

  useEffect(() => {
    if (!sessionId || sessionId.startsWith('local_')) return undefined;

    const unsubscribe = listenForCollapseEvents(sessionId, (event) => {
      if (seenEventsRef.current.has(event.eventId)) return;
      seenEventsRef.current.add(event.eventId);
      triggerCollapse(event.message);
    });

    return () => unsubscribe();
  }, [sessionId, triggerCollapse]);
};

