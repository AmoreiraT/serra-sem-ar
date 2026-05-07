import geckos, { type ClientChannel } from '@geckos.io/client';
import { useEffect, useRef, useState } from 'react';
import type { PresenceVector } from '../types/realtimePresence';

export type MultiplayerPeerState = {
  sessionId: string;
  roomId: number;
  dayIndex: number;
  position: PresenceVector;
  isMobile: boolean;
  lastSeenAt: number;
};

type ServerSnapshotMessage = {
  serverTime: number;
  peers: MultiplayerPeerState[];
};

type UseMultiplayerPresenceInput = {
  sessionId: string | null;
  dayIndex: number;
  enabled: boolean;
  getPosition: () => PresenceVector;
};

type MultiplayerPresenceState = {
  connected: boolean;
  peers: MultiplayerPeerState[];
};

const DESKTOP_SEND_INTERVAL_MS = 160;
const MOBILE_SEND_INTERVAL_MS = 320;
const POSITION_DELTA_SQ = 0.1 * 0.1;
const MAX_STALE_PEER_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const parseVector = (value: unknown): PresenceVector | null => {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
};

const parsePeer = (value: unknown): MultiplayerPeerState | null => {
  if (!isRecord(value)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : null;
  const roomId = finiteNumber(value.roomId);
  const dayIndex = finiteNumber(value.dayIndex);
  const position = parseVector(value.position);
  const lastSeenAt = finiteNumber(value.lastSeenAt);
  if (
    !sessionId ||
    roomId === null ||
    dayIndex === null ||
    !position ||
    lastSeenAt === null ||
    typeof value.isMobile !== 'boolean'
  ) {
    return null;
  }

  return {
    sessionId,
    roomId,
    dayIndex,
    position,
    isMobile: value.isMobile,
    lastSeenAt,
  };
};

const parseSnapshot = (value: unknown): ServerSnapshotMessage | null => {
  if (!isRecord(value) || !Array.isArray(value.peers)) return null;
  const serverTime = finiteNumber(value.serverTime);
  if (serverTime === null) return null;
  return {
    serverTime,
    peers: value.peers
      .map(parsePeer)
      .filter((peer): peer is MultiplayerPeerState => Boolean(peer)),
  };
};

const detectMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return width < 768 || (width <= 1100 && height <= 540) || (coarsePointer && width < 1180);
};

const quantizeCoordinate = (value: number): number => Math.round(value * 10) / 10;

const quantizePosition = ({ x, y, z }: PresenceVector): PresenceVector => ({
  x: quantizeCoordinate(x),
  y: quantizeCoordinate(y),
  z: quantizeCoordinate(z),
});

const distanceSq = (a: PresenceVector, b: PresenceVector): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

const createChannel = (rawUrl: string): ClientChannel => {
  const parsed = new URL(rawUrl);
  return geckos({
    url: `${parsed.protocol}//${parsed.hostname}`,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : undefined,
    label: 'serra-sem-ar',
  });
};

export const useMultiplayerPresence = ({
  sessionId,
  dayIndex,
  enabled,
  getPosition,
}: UseMultiplayerPresenceInput): MultiplayerPresenceState => {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<MultiplayerPeerState[]>([]);
  const latestRef = useRef({ dayIndex, getPosition });

  useEffect(() => {
    latestRef.current = { dayIndex, getPosition };
  }, [dayIndex, getPosition]);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_MULTIPLAYER_URL;
    const shouldConnect =
      enabled &&
      import.meta.env.VITE_ENABLE_MULTIPLAYER === 'true' &&
      typeof serverUrl === 'string' &&
      serverUrl.length > 0 &&
      Boolean(sessionId) &&
      !sessionId?.startsWith('local_');

    if (!shouldConnect || !sessionId || !serverUrl) {
      setConnected(false);
      setPeers([]);
      return undefined;
    }

    let cancelled = false;
    const isMobile = detectMobile();
    const channel = createChannel(serverUrl);
    const intervalMs = isMobile ? MOBILE_SEND_INTERVAL_MS : DESKTOP_SEND_INTERVAL_MS;
    let lastSentPosition: PresenceVector | null = null;

    channel.onConnect((error) => {
      if (cancelled) return;
      if (error) {
        setConnected(false);
        return;
      }

      setConnected(true);
      channel.emit('hello', {
        sessionId,
        dayIndex: latestRef.current.dayIndex,
        isMobile,
      });
    });

    channel.onDisconnect(() => {
      if (cancelled) return;
      setConnected(false);
      setPeers([]);
    });

    channel.on('snapshot', (data) => {
      const snapshot = parseSnapshot(data);
      if (!snapshot || cancelled) return;
      const now = Date.now();
      setPeers(snapshot.peers.filter((peer) => now - peer.lastSeenAt <= MAX_STALE_PEER_MS));
    });

    const sendState = () => {
      if (cancelled) return;
      const latest = latestRef.current;
      const position = quantizePosition(latest.getPosition());
      if (lastSentPosition && distanceSq(position, lastSentPosition) < POSITION_DELTA_SQ) return;

      channel.emit('state', {
        dayIndex: latest.dayIndex,
        position,
        isMobile,
      });
      lastSentPosition = position;
    };

    const interval = window.setInterval(sendState, intervalMs);
    sendState();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      setConnected(false);
      setPeers([]);
      channel.close();
    };
  }, [enabled, sessionId]);

  return { connected, peers };
};
