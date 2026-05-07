import http from 'node:http';
import geckos, { type Data, type ServerChannel } from '@geckos.io/server';
import type {
  ClientHelloMessage,
  ClientStateMessage,
  PresenceVector,
  ServerPeerState,
  ServerSnapshotMessage,
} from './protocol.js';

const PORT = Number.parseInt(process.env.PORT ?? '9208', 10);
const ROOM_SIZE_DAYS = 14;
const STALE_PEER_MS = 20_000;
const DESKTOP_SNAPSHOT_MS = 160;
const MOBILE_SNAPSHOT_MS = 300;
const MAX_PEERS_PER_PACKET = 18;
const MAX_SYNC_DISTANCE_SQ = 42 * 42;
const MAX_ABS_COORDINATE = 20_000;
const MAX_DAY_INDEX = 50_000;

type Peer = ServerPeerState & {
  channel: ServerChannel;
  channelId: string;
  connectedAt: number;
  lastSnapshotAt: number;
};

const peersByChannel = new Map<string, Peer>();
const peersBySession = new Map<string, Peer>();

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify({
      ok: true,
      peers: peersByChannel.size,
      uptime: Math.round(process.uptime()),
    }));
    return;
  }

  response.writeHead(404, {'content-type': 'application/json'});
  response.end(JSON.stringify({error: 'not_found'}));
});

const io = geckos({
  label: 'serra-sem-ar',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const sanitizeCoordinate = (value: unknown): number | null => {
  const parsed = finiteNumber(value);
  if (parsed === null || Math.abs(parsed) > MAX_ABS_COORDINATE) return null;
  return Math.round(parsed * 10) / 10;
};

const sanitizePosition = (value: unknown): PresenceVector | null => {
  if (!isRecord(value)) return null;
  const x = sanitizeCoordinate(value.x);
  const y = sanitizeCoordinate(value.y);
  const z = sanitizeCoordinate(value.z);
  if (x === null || y === null || z === null) return null;
  return {x, y, z};
};

const sanitizeDayIndex = (value: unknown): number | null => {
  const parsed = finiteNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > MAX_DAY_INDEX) return null;
  return parsed;
};

const roomIdForDay = (dayIndex: number): number => Math.floor(dayIndex / ROOM_SIZE_DAYS);

const parseHello = (value: Data): ClientHelloMessage | null => {
  if (!isRecord(value)) return null;
  if (typeof value.sessionId !== 'string' || !/^presence_[0-9a-fA-F-]{36}$/.test(value.sessionId)) return null;
  const dayIndex = sanitizeDayIndex(value.dayIndex);
  if (dayIndex === null || typeof value.isMobile !== 'boolean') return null;
  return {
    sessionId: value.sessionId,
    dayIndex,
    isMobile: value.isMobile,
  };
};

const parseClientState = (value: Data): ClientStateMessage | null => {
  if (!isRecord(value)) return null;
  const dayIndex = sanitizeDayIndex(value.dayIndex);
  const position = sanitizePosition(value.position);
  if (dayIndex === null || !position || typeof value.isMobile !== 'boolean') return null;
  return {
    dayIndex,
    position,
    isMobile: value.isMobile,
  };
};

const distanceSq = (a: PresenceVector, b: PresenceVector): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

const removePeer = (channelId: string): void => {
  const peer = peersByChannel.get(channelId);
  if (!peer) return;
  peersByChannel.delete(channelId);
  if (peersBySession.get(peer.sessionId)?.channelId === channelId) {
    peersBySession.delete(peer.sessionId);
  }
};

const currentPeersNear = (peer: Peer, now: number): ServerPeerState[] => {
  const nearbyRooms = new Set([peer.roomId - 1, peer.roomId, peer.roomId + 1]);
  const peers: ServerPeerState[] = [];

  peersByChannel.forEach((candidate) => {
    if (
      candidate.channelId === peer.channelId ||
      now - candidate.lastSeenAt > STALE_PEER_MS ||
      !nearbyRooms.has(candidate.roomId) ||
      distanceSq(peer.position, candidate.position) > MAX_SYNC_DISTANCE_SQ
    ) {
      return;
    }

    peers.push({
      sessionId: candidate.sessionId,
      roomId: candidate.roomId,
      dayIndex: candidate.dayIndex,
      position: candidate.position,
      isMobile: candidate.isMobile,
      lastSeenAt: candidate.lastSeenAt,
    });
  });

  return peers
    .sort((a, b) => distanceSq(peer.position, a.position) - distanceSq(peer.position, b.position))
    .slice(0, MAX_PEERS_PER_PACKET);
};

io.onConnection((channel) => {
  const channelId = channel.id;
  if (!channelId) {
    channel.close();
    return;
  }

  channel.on('hello', (data) => {
    const hello = parseHello(data);
    if (!hello) {
      channel.close();
      return;
    }

    const existingPeer = peersBySession.get(hello.sessionId);
    if (existingPeer && existingPeer.channelId !== channelId) {
      removePeer(existingPeer.channelId);
      existingPeer.channel.close();
    }

    const now = Date.now();
    const peer: Peer = {
      channel,
      channelId,
      sessionId: hello.sessionId,
      roomId: roomIdForDay(hello.dayIndex),
      dayIndex: hello.dayIndex,
      position: {x: 50, y: 30, z: 50},
      isMobile: hello.isMobile,
      lastSeenAt: now,
      connectedAt: now,
      lastSnapshotAt: 0,
    };

    peersByChannel.set(channelId, peer);
    peersBySession.set(peer.sessionId, peer);
    channel.emit('ready', {serverTime: now});
  });

  channel.on('state', (data) => {
    const peer = peersByChannel.get(channelId);
    const state = parseClientState(data);
    if (!peer || !state) return;

    peer.dayIndex = state.dayIndex;
    peer.roomId = roomIdForDay(state.dayIndex);
    peer.position = state.position;
    peer.isMobile = state.isMobile;
    peer.lastSeenAt = Date.now();
  });

  channel.onDisconnect(() => {
    removePeer(channelId);
  });
});

setInterval(() => {
  const now = Date.now();
  peersByChannel.forEach((peer, channelId) => {
    if (now - peer.lastSeenAt > STALE_PEER_MS) {
      removePeer(channelId);
      peer.channel.close();
      return;
    }

    const interval = peer.isMobile ? MOBILE_SNAPSHOT_MS : DESKTOP_SNAPSHOT_MS;
    if (now - peer.lastSnapshotAt < interval) return;

    const snapshot: ServerSnapshotMessage = {
      serverTime: now,
      peers: currentPeersNear(peer, now),
    };
    peer.channel.emit('snapshot', snapshot);
    peer.lastSnapshotAt = now;
  });
}, 80);

io.addServer(server);
server.listen(PORT, () => {
  console.log(`serra multiplayer server listening on ${PORT}`);
});
