import { useCallback, useEffect, useRef, useState } from 'react';
import { detectClientDeviceClass } from '../core/device/clientDeviceClass';
import { configurePresenceOnDisconnect } from '../services/firebaseRealtime';
import { joinPresence, leavePresence, sendLeavePresenceBeacon } from '../services/presenceApi';
import { useOxygenStore } from '../stores/oxygenStore';

type UsePresenceSessionInput = {
  enabled?: boolean;
};

type PresenceSessionHookState = {
  sessionId: string | null;
  isJoining: boolean;
  isOfflineFallback: boolean;
  rejoin: () => void;
};

const CLIENT_ID_KEY = 'serra-sem-ar-client-id';

const isOxygenEnabled = () => import.meta.env.VITE_ENABLE_OXYGEN !== 'false';

const createUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getClientId = (): string => {
  if (typeof window === 'undefined') return `client_${createUuid()}`;

  try {
    const current = window.localStorage.getItem(CLIENT_ID_KEY);
    if (current) return current;
    const next = `client_${createUuid()}`;
    window.localStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return `client_${createUuid()}`;
  }
};

const createLocalFallbackSessionId = (): string => `local_presence_${createUuid()}`;

export const usePresenceSession = ({ enabled = true }: UsePresenceSessionInput = {}): PresenceSessionHookState => {
  const sessionId = useOxygenStore((state) => state.sessionId);
  const isOfflineFallback = useOxygenStore((state) => state.isOfflineFallback);
  const setSession = useOxygenStore((state) => state.setSession);
  const setUpdateInterval = useOxygenStore((state) => state.setUpdateInterval);
  const setOxygenState = useOxygenStore((state) => state.setOxygenState);
  const setOfflineFallback = useOxygenStore((state) => state.setOfflineFallback);
  const resetOxygenStore = useOxygenStore((state) => state.reset);
  const [isJoining, setIsJoining] = useState(false);
  const [generation, setGeneration] = useState(0);
  const activeSessionRef = useRef<string | null>(null);
  const cancelDisconnectRef = useRef<(() => Promise<void>) | null>(null);

  const leaveCurrentSession = useCallback((preferBeacon: boolean) => {
    const currentSessionId = activeSessionRef.current;
    activeSessionRef.current = null;

    const cancelDisconnect = cancelDisconnectRef.current;
    cancelDisconnectRef.current = null;
    if (cancelDisconnect) void cancelDisconnect().catch(() => undefined);

    if (!currentSessionId || currentSessionId.startsWith('local_')) return;
    if (preferBeacon && sendLeavePresenceBeacon({ sessionId: currentSessionId })) return;
    void leavePresence({ sessionId: currentSessionId }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled || !isOxygenEnabled()) {
      return undefined;
    }

    let cancelled = false;
    setIsJoining(true);

    const start = async () => {
      const isMobile = detectClientDeviceClass() === 'phone';
      try {
        const response = await joinPresence({
          clientId: getClientId(),
          isMobile,
          userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
        });
        if (cancelled) {
          void leavePresence({ sessionId: response.sessionId }).catch(() => undefined);
          return;
        }

        activeSessionRef.current = response.sessionId;
        setSession(response.sessionId, response.joinedAt);
        setUpdateInterval(response.updateIntervalMs);
        setOxygenState({
          oxygen: response.initialOxygen,
          collectiveOxygen: 100,
          status: 'stable',
        });
        setOfflineFallback(false);
        cancelDisconnectRef.current = await configurePresenceOnDisconnect(response.sessionId);
      } catch {
        if (cancelled) return;
        const fallbackInterval = detectClientDeviceClass() === 'phone' ? 5_000 : 3_000;
        const fallbackSessionId = createLocalFallbackSessionId();
        activeSessionRef.current = fallbackSessionId;
        setSession(fallbackSessionId, Date.now());
        setUpdateInterval(fallbackInterval);
        setOxygenState({ oxygen: 100, collectiveOxygen: 100, status: 'stable' });
        setOfflineFallback(true);
      } finally {
        if (!cancelled) setIsJoining(false);
      }
    };

    void start();

    const handlePageHide = () => leaveCurrentSession(true);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', handlePageHide);
      leaveCurrentSession(true);
      setIsJoining(false);
    };
  }, [
    enabled,
    generation,
    leaveCurrentSession,
    setOfflineFallback,
    setOxygenState,
    setSession,
    setUpdateInterval,
  ]);

  const rejoin = useCallback(() => {
    leaveCurrentSession(false);
    resetOxygenStore();
    setGeneration((current) => current + 1);
  }, [leaveCurrentSession, resetOxygenStore]);

  return {
    sessionId,
    isJoining,
    isOfflineFallback,
    rejoin,
  };
};
