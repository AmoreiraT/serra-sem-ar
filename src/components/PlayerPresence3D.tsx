import { useFrame } from '@react-three/fiber';
import { Timestamp, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAuth } from '../providers/AuthProvider';
import { db } from '../services/firebaseConfig';
import { useCovidStore } from '../stores/covidStore';

const PRESENCE_COLLECTION = 'playerPresence';
const CONFIG_COLLECTION = 'config';
const PRESENCE_SETTINGS_DOC = 'presenceSettings';
const PRESENCE_TTL_MS = 18_000;
const MAX_REMOTE_PLAYERS = 80;
const POSITION_DELTA_EPSILON_SQ = 0.04;
const FOOTPRINT_STEP_DISTANCE = 0.9;
const FOOTPRINT_POSITION_DELTA_EPSILON_SQ = FOOTPRINT_STEP_DISTANCE * FOOTPRINT_STEP_DISTANCE;
const MAX_FOOTPRINTS = 10;
const DATE_INDEX_DELTA_EPSILON = 1;
const STALE_FILTER_REFRESH_MS = 5_000;
const DEFAULT_WRITE_INTERVAL_MS = 2_500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 12_000;
const DEFAULT_FOOTPRINT_WRITE_INTERVAL_MS = 5_000;
const DEFAULT_FOOTPRINT_HEARTBEAT_INTERVAL_MS = 10_000;
const CAMERA_TO_GROUND_OFFSET = 1.35;
const FOOTPRINT_GROUND_LIFT = 0.012;
const FOOTPRINT_WIDTH = 0.74;
const FOOTPRINT_LENGTH = 0.68;
const LOCAL_SESSION_KEY = 'serra-sem-ar-presence-id';

// Flame simulation constants matching the reference implementation
// https://g7495x.gitlab.io/webgl-particle-flame-three.js/
const SPHERE_RADIUS = 0.62;
const PARTICLE_LIFETIME = 2.55;  // longer life for an extended veil/plume
const PARTICLE_SPEED = 0.55;
const CURLINESS = 0.88;
const REACTIVENESS = 0.85;
const PARTICLE_OPACITY_SCALE = 1.45;
const WIND_Y = 0.65;

type PresenceMode = 'flame' | 'footprint';

interface PresenceVector {
  x: number;
  y: number;
  z: number;
}

interface Footprint extends PresenceVector {}

type PresenceDoc = {
  sessionId?: string;
  userId?: string | null;
  displayName?: string | null;
  color?: string;
  position?: PresenceVector;
  target?: PresenceVector;
  footprints?: Footprint[];
  currentDateIndex?: number;
  updatedAtMs?: number;
  expiresAt?: Timestamp;
};

type PresenceSettings = {
  enabled: boolean;
  writeIntervalMs: number;
};

interface MarkerPresence {
  id: string;
  color: string;
  position: [number, number, number];
  isLocal: boolean;
  heading?: number;
  footprintIndex?: number;
  footprintCount?: number;
}

type FlamePresence = MarkerPresence;

type PublishedPresence = {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  currentDateIndex: number;
  atMs: number;
  footprints: Footprint[];
};

const palette = ['#4cc9ff', '#3a86ff', '#5ee7ff', '#7dd3fc', '#60a5fa', '#a5f3fc'];
const footprintInkPalette = ['#4a0508', '#5f070b', '#741015', '#86171b', '#3c0407', '#69090d'];
const DEFAULT_PRESENCE_SETTINGS: PresenceSettings = {
  enabled: true,
  writeIntervalMs: DEFAULT_WRITE_INTERVAL_MS,
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getSessionId = () => {
  if (typeof window === 'undefined') return `server-${Math.random().toString(36).slice(2)}`;

  try {
    const current = window.sessionStorage.getItem(LOCAL_SESSION_KEY);
    if (current) return current;
  } catch {
    // Private browsing can make sessionStorage unavailable.
  }

  const randomId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = `presence-${randomId}`;

  try {
    window.sessionStorage.setItem(LOCAL_SESSION_KEY, next);
  } catch {
    // A non-persistent session id is still enough for the current visit.
  }

  return next;
};

const vectorFromArray = ([x, y, z]: [number, number, number]): PresenceVector => ({ x, y, z });

const vectorToArray = ({ x, y, z }: PresenceVector): [number, number, number] => [x, y, z];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const distanceSq = (a: [number, number, number], b: [number, number, number]) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

const isPresenceFresh = (presence: PresenceDoc, now: number) =>
  typeof presence.updatedAtMs === 'number' && now - presence.updatedAtMs <= PRESENCE_TTL_MS;

const isPresenceVector = (value: unknown): value is PresenceVector => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PresenceVector>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y) &&
    typeof candidate.z === 'number' &&
    Number.isFinite(candidate.z)
  );
};

const resolvePresenceMode = (): PresenceMode => {
  const forcedMode = import.meta.env.VITE_PRESENCE_MODE;
  if (forcedMode === 'flame' || forcedMode === 'footprint') return forcedMode;

  // Pegadas sao o modo padrao em mobile e desktop: viram um registro leve do percurso.
  // As chamas ficam disponiveis por env, mas criam milhares de particulas por visitante.
  return 'footprint';
};

const getFootprintGroundPosition = (point: PresenceVector): [number, number, number] => [
  point.x,
  point.y - CAMERA_TO_GROUND_OFFSET + FOOTPRINT_GROUND_LIFT,
  point.z,
];

const appendFootprint = (footprints: Footprint[], next: Footprint, force = false): Footprint[] => {
  const last = footprints[footprints.length - 1];
  if (!force && last && distanceSq(vectorToArray(last), vectorToArray(next)) <= FOOTPRINT_POSITION_DELTA_EPSILON_SQ) {
    return footprints;
  }

  return [...footprints, next].slice(-MAX_FOOTPRINTS);
};

const getPresenceFootprints = (presence: PresenceDoc): Footprint[] => {
  const footprints = Array.isArray(presence.footprints)
    ? presence.footprints.filter(isPresenceVector).slice(-MAX_FOOTPRINTS)
    : [];

  if (footprints.length > 0) return footprints;
  return presence.position && isPresenceVector(presence.position) ? [presence.position] : [];
};

const getFootprintHeading = (footprints: Footprint[], idx: number, fallbackId: string) => {
  const current = footprints[idx];
  const next = footprints[idx + 1];
  const previous = footprints[idx - 1];
  const reference = next ?? previous;
  if (!current || !reference) return (hashString(fallbackId) % 628) / 100;

  const dx = next ? next.x - current.x : current.x - reference.x;
  const dz = next ? next.z - current.z : current.z - reference.z;
  if (dx * dx + dz * dz < 0.0001) return (hashString(fallbackId) % 628) / 100;
  return Math.atan2(dx, dz);
};

const createFootprintMarkers = (
  ownerId: string,
  color: string,
  footprints: Footprint[],
  isLocal: boolean
): MarkerPresence[] =>
  footprints.map((point, idx) => ({
    id: `${ownerId}-step-${idx}`,
    color,
    position: getFootprintGroundPosition(point),
    isLocal,
    heading: getFootprintHeading(footprints, idx, `${ownerId}-${idx}`),
    footprintIndex: idx,
    footprintCount: footprints.length,
  }));

const createFootprintTexture = (id: string, isLocal: boolean) => {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 176;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let seed = hashString(id);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };
  const traceSole = () => {
    ctx.beginPath();
    ctx.moveTo(0, -70);
    ctx.bezierCurveTo(20, -69, 29, -51, 26, -31);
    ctx.bezierCurveTo(24, -16, 17, -6, 19, 8);
    ctx.bezierCurveTo(22, 33, 20, 55, 9, 67);
    ctx.bezierCurveTo(5, 72, -5, 72, -9, 67);
    ctx.bezierCurveTo(-20, 55, -22, 33, -19, 8);
    ctx.bezierCurveTo(-17, -6, -24, -16, -26, -31);
    ctx.bezierCurveTo(-29, -51, -20, -69, 0, -70);
    ctx.closePath();
  };
  const drawSole = (offsetX: number, offsetY: number, toeOut: number, footId: string) => {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.rotate(toeOut);

    ctx.save();
    traceSole();
    ctx.clip();
    ctx.fillStyle = ink;

    for (let i = 0; i < 7; i += 1) {
      const x = -23 + i * 7.7;
      const height = 19 - Math.abs(i - 3) * 1.7;
      ctx.save();
      ctx.translate(x + 3.2, -58);
      ctx.rotate((i - 3) * 0.09);
      roundedRect(-3.2, 0, 6.4, height, 2.2);
      ctx.fill();
      ctx.restore();
    }

    for (let y = -33; y <= 18; y += 14) {
      roundedRect(-25, y, 10, 7, 2);
      ctx.fill();
      roundedRect(15, y, 10, 7, 2);
      ctx.fill();
    }

    for (let y = -29; y <= 7; y += 12) {
      ctx.beginPath();
      ctx.moveTo(-11, y);
      ctx.lineTo(0, y + 7);
      ctx.lineTo(11, y);
      ctx.lineTo(8, y + 7);
      ctx.lineTo(0, y + 12);
      ctx.lineTo(-8, y + 7);
      ctx.closePath();
      ctx.fill();
    }

    roundedRect(-19, 27, 12, 8, 2.5);
    ctx.fill();
    roundedRect(-5, 29, 10, 8, 2.5);
    ctx.fill();
    roundedRect(7, 27, 12, 8, 2.5);
    ctx.fill();
    roundedRect(-18, 43, 36, 11, 3);
    ctx.fill();
    roundedRect(-16, 58, 32, 9, 3);
    ctx.fill();
    ctx.restore();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.save();
    traceSole();
    ctx.clip();
    ctx.lineCap = 'round';
    for (let i = 0; i < 28; i += 1) {
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.24 + rand() * 0.42})`;
      ctx.lineWidth = 0.8 + rand() * 2.2;
      const x = -24 + rand() * 48;
      const y = -64 + rand() * 132;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 28, y + (rand() - 0.5) * 10);
      ctx.stroke();
    }
    for (let i = 0; i < 44; i += 1) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.22 + rand() * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(-23 + rand() * 46, -66 + rand() * 134, 0.6 + rand() * 2.4, 0.5 + rand() * 2, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    const dropSeed = hashString(footId);
    const dropX = (dropSeed % 11) - 5;
    const dropY = 39 + ((dropSeed / 13) % 18);
    ctx.fillStyle = bloodSmear;
    ctx.beginPath();
    ctx.ellipse(dropX, dropY, 4 + rand() * 5, 1.6 + rand() * 2.8, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const tint = new THREE.Color(footprintInkPalette[hashString(id) % footprintInkPalette.length]);
  if (isLocal) tint.offsetHSL(0, 0.08, 0.03);
  const ink = `rgba(${Math.round(tint.r * 255)}, ${Math.round(tint.g * 255)}, ${Math.round(tint.b * 255)}, 0.96)`;
  const bloodSmear = `rgba(${Math.round(tint.r * 255)}, 0, ${Math.round(tint.b * 85)}, 0.42)`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  drawSole(-32, -8, -0.1, `${id}-left`);
  drawSole(32, 10, 0.1, `${id}-right`);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const useRollingPresenceCutoffMs = (ttlMs: number, refreshMs: number) => {
  const [cutoffMs, setCutoffMs] = useState(() => Date.now() - ttlMs);

  useEffect(() => {
    const updateCutoff = () => setCutoffMs(Date.now() - ttlMs);
    updateCutoff();
    const interval = window.setInterval(updateCutoff, refreshMs);
    return () => window.clearInterval(interval);
  }, [refreshMs, ttlMs]);

  return cutoffMs;
};

// Evenly distributed points on unit sphere surface (Fibonacci sphere algorithm).
// Matches the reference implementation's fibonacciSpherePoints().
const fibonacciSphere = (count: number): Float32Array => {
  const points = new Float32Array(count * 3);
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = i * offset - 1 + offset / 2;
    const dist = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = ((i + 1) % count) * increment;
    points[i * 3] = Math.cos(phi) * dist;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = Math.sin(phi) * dist;
  }
  return points;
};

// Reusable output buffer — safe because JS is single-threaded and we consume
// the result immediately before the next call in the same frame loop.
const _dirBuf = new Float32Array(3);

// Trig-based approximation of 4-D curl noise (matches reference gpuComputeDirection.glsl).
// Returns a non-normalized vector: curl_direction (unit) + wind (0, WIND_Y, 0).
const flameDirection = (px: number, py: number, pz: number, t: number): Float32Array => {
  const cx = px * CURLINESS;
  const cy = py * CURLINESS;
  const cz = pz * CURLINESS;

  // Six trig samples arranged as cross-partial derivatives of a smooth potential field,
  // producing a divergence-free swirling field similar to the reference curl noise.
  const s1 = Math.sin(cy * 2.5 + cz * 1.7 + t);
  const c1 = Math.cos(cz * 2.3 + cx * 1.4 + t * 1.1);
  const s2 = Math.sin(cx * 2.1 + cy * 1.8 + t * 0.9);
  const c2 = Math.cos(cy * 2.6 + cz * 1.3 + t * 0.8);
  const s3 = Math.sin(cz * 2.4 + cx * 1.6 + t * 1.2);
  const c3 = Math.cos(cx * 2.2 + cy * 2.0 + t * 0.7);

  const vx = s1 - c2;
  const vy = s2 - c3;
  const vz = s3 - c1;
  const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

  _dirBuf[0] = vx / len;
  _dirBuf[1] = vy / len + WIND_Y; // dominant upward wind added after normalisation
  _dirBuf[2] = vz / len;
  return _dirBuf;
};

const createSoulParticleTexture = () => {
  if (typeof document === 'undefined') return null;

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const center = size / 2;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  glow.addColorStop(0.28, 'rgba(255, 255, 255, 0.65)');
  glow.addColorStop(0.58, 'rgba(200, 240, 255, 0.18)');
  glow.addColorStop(1, 'rgba(128, 225, 255, 0)');

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const getLocalFlamePosition = (
  cameraPosition: [number, number, number],
  cameraTarget: [number, number, number]
): [number, number, number] => {
  const position = new THREE.Vector3(...cameraPosition);
  const target = new THREE.Vector3(...cameraTarget);
  const forward = target.sub(position);
  forward.y *= 0.24;

  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }

  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);
  if (side.lengthSq() > 0.0001) side.normalize();

  const flamePosition = position
    .add(forward.multiplyScalar(1.35))
    .add(side.multiplyScalar(-0.42));
  flamePosition.y = cameraPosition[1] - CAMERA_TO_GROUND_OFFSET;

  return flamePosition.toArray() as [number, number, number];
};

export const PlayerPresence3D = ({ quality }: { quality: 'desktop' | 'mobile' }) => {
  const { user } = useAuth();
  const [presenceSettings, setPresenceSettings] = useState<PresenceSettings>(DEFAULT_PRESENCE_SETTINGS);
  const presenceMode = useMemo(resolvePresenceMode, []);
  const sessionId = useMemo(getSessionId, []);
  const color = useMemo(() => palette[hashString(sessionId) % palette.length], [sessionId]);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const cameraTarget = useCovidStore((state) => state.cameraTarget);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const latestStateRef = useRef({ cameraPosition, cameraTarget, currentDateIndex });
  const lastPublishedRef = useRef<PublishedPresence | null>(null);
  const [localFootprints, setLocalFootprints] = useState<Footprint[]>(() => [vectorFromArray(cameraPosition)]);
  const [remotePresences, setRemotePresences] = useState<MarkerPresence[]>([]);
  const [remotePlayerCount, setRemotePlayerCount] = useState(0);
  const rollingCutoffMs = useRollingPresenceCutoffMs(PRESENCE_TTL_MS, STALE_FILTER_REFRESH_MS);

  const isPresenceEnabled =
    import.meta.env.VITE_ENABLE_PRESENCE !== 'false' && presenceSettings.enabled;

  const effectiveWriteIntervalMs = useMemo(() => {
    const base = clamp(presenceSettings.writeIntervalMs, 1_200, 60_000);
    if (presenceMode === 'footprint') return Math.max(base, DEFAULT_FOOTPRINT_WRITE_INTERVAL_MS);

    if (remotePlayerCount > 30) return base * 3;
    if (remotePlayerCount > 10) return base * 2;
    return base;
  }, [presenceMode, presenceSettings.writeIntervalMs, remotePlayerCount]);

  const effectiveHeartbeatIntervalMs = useMemo(() => {
    if (presenceMode === 'flame' && remotePlayerCount > 30) return Number.POSITIVE_INFINITY;

    const minHeartbeat =
      presenceMode === 'footprint'
        ? DEFAULT_FOOTPRINT_HEARTBEAT_INTERVAL_MS
        : DEFAULT_HEARTBEAT_INTERVAL_MS;
    const multiplier = presenceMode === 'footprint' ? 2 : 4;
    return Math.max(minHeartbeat, effectiveWriteIntervalMs * multiplier);
  }, [effectiveWriteIntervalMs, presenceMode, remotePlayerCount]);
  const localFlamePresence = useMemo<FlamePresence>(
    () => ({
      id: `${sessionId}-local`,
      color,
      position: getLocalFlamePosition(cameraPosition, cameraTarget),
      isLocal: true,
    }),
    [cameraPosition, cameraTarget, color, sessionId]
  );
  const localFootprintMarkers = useMemo<MarkerPresence[]>(
    () => createFootprintMarkers(`${sessionId}-local`, color, localFootprints, true),
    [color, localFootprints, sessionId]
  );

  useEffect(() => {
    latestStateRef.current = { cameraPosition, cameraTarget, currentDateIndex };
  }, [cameraPosition, cameraTarget, currentDateIndex]);

  useEffect(() => {
    if (presenceMode !== 'footprint') return;
    setLocalFootprints((current) => appendFootprint(current, vectorFromArray(cameraPosition)));
  }, [cameraPosition, presenceMode]);

  useEffect(() => {
    const settingsRef = doc(db, CONFIG_COLLECTION, PRESENCE_SETTINGS_DOC);
    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        const data = snapshot.data() as Partial<PresenceSettings> | undefined;
        setPresenceSettings({
          enabled:
            typeof data?.enabled === 'boolean'
              ? data.enabled
              : DEFAULT_PRESENCE_SETTINGS.enabled,
          writeIntervalMs:
            typeof data?.writeIntervalMs === 'number' && Number.isFinite(data.writeIntervalMs)
              ? clamp(data.writeIntervalMs, 1_200, 60_000)
              : DEFAULT_PRESENCE_SETTINGS.writeIntervalMs,
        });
      },
      () => {
        setPresenceSettings(DEFAULT_PRESENCE_SETTINGS);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isPresenceEnabled) {
      lastPublishedRef.current = null;
      return;
    }

    const ref = doc(db, PRESENCE_COLLECTION, sessionId);
    let cancelled = false;

    const removePresence = async () => {
      await deleteDoc(ref).catch(() => undefined);
    };

    const publish = async (force = false) => {
      if (cancelled) return;
      const latest = latestStateRef.current;
      const now = Date.now();
      const previous = lastPublishedRef.current;

      if (!force && previous) {
        const movedEnough =
          presenceMode === 'footprint'
            ? distanceSq(latest.cameraPosition, previous.cameraPosition) > FOOTPRINT_POSITION_DELTA_EPSILON_SQ
            : distanceSq(latest.cameraPosition, previous.cameraPosition) > POSITION_DELTA_EPSILON_SQ ||
              distanceSq(latest.cameraTarget, previous.cameraTarget) > POSITION_DELTA_EPSILON_SQ;
        const dateChangedEnough =
          presenceMode === 'flame' &&
          Math.abs(latest.currentDateIndex - previous.currentDateIndex) >= DATE_INDEX_DELTA_EPSILON;
        const heartbeatDue =
          Number.isFinite(effectiveHeartbeatIntervalMs) &&
          now - previous.atMs >= effectiveHeartbeatIntervalMs;

        if (!movedEnough && !dateChangedEnough && !heartbeatDue) return;
      }

      try {
        const nextFootprint = vectorFromArray(latest.cameraPosition);
        const previousFootprints = previous?.footprints ?? [];
        const shouldAppendFootprint =
          !previous ||
          previousFootprints.length === 0 ||
          distanceSq(vectorToArray(previousFootprints[previousFootprints.length - 1]), latest.cameraPosition) >
            FOOTPRINT_POSITION_DELTA_EPSILON_SQ;
        const footprints =
          presenceMode === 'footprint' && shouldAppendFootprint
            ? appendFootprint(previousFootprints, nextFootprint, true)
            : presenceMode === 'footprint'
              ? previousFootprints.slice(-MAX_FOOTPRINTS)
              : [nextFootprint];

        await setDoc(
          ref,
          {
            sessionId,
            userId: user?.uid ?? null,
            displayName: user?.displayName ?? null,
            color,
            position: vectorFromArray(latest.cameraPosition),
            target: vectorFromArray(latest.cameraTarget),
            footprints,
            currentDateIndex: latest.currentDateIndex,
            updatedAtMs: now,
            updatedAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(now + PRESENCE_TTL_MS),
          },
          { merge: true }
        );
        lastPublishedRef.current = {
          cameraPosition: [...latest.cameraPosition] as [number, number, number],
          cameraTarget: [...latest.cameraTarget] as [number, number, number],
          currentDateIndex: latest.currentDateIndex,
          atMs: now,
          footprints,
        };
      } catch {
        // Presence is optional; Firestore rules may not be deployed yet.
      }
    };

    void publish(true);
    const interval = window.setInterval(() => {
      void publish();
    }, effectiveWriteIntervalMs);

    const handlePageExit = () => {
      void removePresence();
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
      void removePresence();
    };
  }, [
    color,
    effectiveHeartbeatIntervalMs,
    effectiveWriteIntervalMs,
    isPresenceEnabled,
    presenceMode,
    sessionId,
    user?.displayName,
    user?.uid,
  ]);

  useEffect(() => {
    if (!isPresenceEnabled) {
      setRemotePresences([]);
      setRemotePlayerCount(0);
      return;
    }

    const presenceQuery = query(
      collection(db, PRESENCE_COLLECTION),
      where('updatedAtMs', '>=', rollingCutoffMs),
      orderBy('updatedAtMs', 'desc'),
      limit(MAX_REMOTE_PLAYERS)
    );
    const unsubscribe = onSnapshot(
      presenceQuery,
      (snapshot) => {
        const now = Date.now();
        let nextPlayerCount = 0;
        const next = snapshot.docs.flatMap((entry) => {
          const payload = entry.data() as PresenceDoc;
          if (
            payload.sessionId === sessionId ||
            entry.id === sessionId ||
            !isPresenceFresh(payload, now) ||
            !payload.position ||
            !isPresenceVector(payload.position)
          ) {
            return [];
          }

          nextPlayerCount += 1;
          const markerColor = payload.color ?? palette[hashString(entry.id) % palette.length];

          if (presenceMode === 'footprint') {
            return createFootprintMarkers(entry.id, markerColor, getPresenceFootprints(payload), false);
          }

          return [
            {
              id: entry.id,
              color: markerColor,
              position: getFootprintGroundPosition(payload.position),
              isLocal: false,
              heading: getFootprintHeading([payload.position], 0, entry.id),
            },
          ];
        });
        setRemotePresences(next);
        setRemotePlayerCount(nextPlayerCount);
      },
      () => {
        setRemotePresences([]);
        setRemotePlayerCount(0);
      }
    );

    return () => unsubscribe();
  }, [isPresenceEnabled, presenceMode, rollingCutoffMs, sessionId]);

  return (
    <group name={`player-presence-${presenceMode}`}>
      {presenceMode === 'flame' ? (
        <>
          <PlayerSoulFlame presence={localFlamePresence} quality={quality} />
          {remotePresences.map((presence) => (
            <PlayerSoulFlame key={presence.id} presence={presence} quality={quality} />
          ))}
        </>
      ) : (
        <>
          {localFootprintMarkers.map((presence) => (
            <PlayerFootprint key={presence.id} presence={presence} />
          ))}
          {remotePresences.map((presence) => (
            <PlayerFootprint key={presence.id} presence={presence} />
          ))}
        </>
      )}
    </group>
  );
};

const PlayerFootprint = ({ presence }: { presence: MarkerPresence }) => {
  const headingJitter = useMemo(() => ((hashString(presence.id) % 100) / 100 - 0.5) * 0.12, [presence.id]);
  const ageScale = useMemo(() => {
    if (!presence.footprintCount || presence.footprintCount <= 1) return 1;
    return 0.68 + (((presence.footprintIndex ?? 0) + 1) / presence.footprintCount) * 0.32;
  }, [presence.footprintCount, presence.footprintIndex]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(FOOTPRINT_WIDTH, FOOTPRINT_LENGTH), []);
  const footprintTexture = useMemo(() => createFootprintTexture(presence.id, presence.isLocal), [presence.id, presence.isLocal]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        map: footprintTexture ?? undefined,
        alphaTest: footprintTexture ? 0.08 : 0,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: false,
        fog: false,
      }),
    [footprintTexture]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => footprintTexture?.dispose(), [footprintTexture]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={presence.position}
      rotation={[-Math.PI / 2, 0, (presence.heading ?? 0) + headingJitter]}
      scale={[
        presence.isLocal ? ageScale * 1.08 : ageScale,
        presence.isLocal ? ageScale * 1.12 : ageScale,
        1,
      ]}
      renderOrder={16}
    />
  );
};

const PlayerSoulFlame = ({ presence, quality }: { presence: FlamePresence; quality: 'desktop' | 'mobile' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const ghostPointsRef = useRef<THREE.Points>(null);
  const targetRef = useRef(new THREE.Vector3(...presence.position));

  // Total particles: equivalent to spherePointCount × batchCount (lifetime × emitFrequency).
  // Staggering ages across [0, PARTICLE_LIFETIME) gives the same steady-state distribution
  // as the reference GPGPU batch system.
  const particleCount = presence.isLocal
    ? quality === 'mobile'
      ? 1408
      : 2688
    : quality === 'mobile'
      ? 896
      : 1792;

  // One unique Fibonacci sphere spawn position per particle.
  const spherePoints = useMemo(() => fibonacciSphere(particleCount), [particleCount]);

  // Simulation state stored outside React rendering — updated every frame.
  const particlePos = useRef<Float32Array | null>(null);
  const particleAge = useRef<Float32Array | null>(null);

  // Pre-extract linear RGB so per-frame math avoids Color object allocation.
  const [baseR, baseG, baseB] = useMemo(() => {
    const c = new THREE.Color(presence.color);
    return [c.r, c.g, c.b];
  }, [presence.color]);

  const particleTexture = useMemo(createSoulParticleTexture, []);

  // BufferGeometry with position + per-vertex colour (opacity encoded as brightness).
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    return g;
  }, [particleCount]);

  // vertexColors + additive blending: encoding opacity as colour brightness fades
  // particles to black (invisible) while the glow texture provides the soft disc shape.
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        vertexColors: true,
        map: particleTexture ?? undefined,
        alphaTest: 0.01,
        size: presence.isLocal ? 0.019 : 0.027,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
      }),
    [particleTexture, presence.isLocal]
  );

  // Subtle ghost layer for volumetric depth using the same simulation buffer.
  const ghostMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        vertexColors: true,
        map: particleTexture ?? undefined,
        alphaTest: 0.006,
        size: presence.isLocal ? 0.026 : 0.036,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
      }),
    [particleTexture, presence.isLocal]
  );

  // Initialise particles at sphere surface with uniformly staggered ages so the
  // full lifecycle (dense sphere → rising plume → fade-out) is visible from frame 1.
  useEffect(() => {
    const count = particleCount;
    const pos = new Float32Array(count * 3);
    const age = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = spherePoints[i * 3] * SPHERE_RADIUS;
      pos[i * 3 + 1] = spherePoints[i * 3 + 1] * SPHERE_RADIUS;
      pos[i * 3 + 2] = spherePoints[i * 3 + 2] * SPHERE_RADIUS;
      age[i] = (i / count) * PARTICLE_LIFETIME;
    }
    particlePos.current = pos;
    particleAge.current = age;
  }, [particleCount, spherePoints]);

  useEffect(() => {
    targetRef.current.set(...presence.position);
  }, [presence.position]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      ghostMaterial.dispose();
      particleTexture?.dispose();
    };
  }, [geometry, ghostMaterial, material, particleTexture]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const pos = particlePos.current;
    const age = particleAge.current;
    if (!pos || !age) return;

    group.position.lerp(targetRef.current, 1 - Math.exp(-5.5 * delta));

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;

    const elapsed = clock.getElapsedTime();
    // Mirror reference oscillating noise-time: uTime = 168.5 + 1.5·sin(t/5)
    const noiseT = (168.5 + 1.5 * Math.sin(elapsed / 5)) * REACTIVENESS;
    const dt = Math.min(delta, 0.05);
    const fadeAge = PARTICLE_LIFETIME * 0.8;

    const count = particleCount;
    for (let i = 0; i < count; i++) {
      let a = age[i] + dt;

      // Respawn at fibonacci sphere surface when lifetime expires.
      if (a >= PARTICLE_LIFETIME) {
        a -= PARTICLE_LIFETIME;
        pos[i * 3] = spherePoints[i * 3] * SPHERE_RADIUS;
        pos[i * 3 + 1] = spherePoints[i * 3 + 1] * SPHERE_RADIUS;
        pos[i * 3 + 2] = spherePoints[i * 3 + 2] * SPHERE_RADIUS;
      }
      age[i] = a;

      const px = pos[i * 3];
      const py = pos[i * 3 + 1];
      const pz = pos[i * 3 + 2];

      const lifeN = a / PARTICLE_LIFETIME;
      // Hold young particles close to the sphere before they peel into the plume.
      const launch = THREE.MathUtils.smoothstep(lifeN, 0.06, 0.42);

      // Advance position along curl-noise + wind direction.
      const dir = flameDirection(px, py, pz, noiseT);
      const swirl = Math.sin(elapsed * 0.55 + lifeN * Math.PI * 3) * 0.18;
      const npx = px + (dir[0] * (0.52 + launch * 0.86) + dir[2] * swirl * launch * 0.22) * dt * PARTICLE_SPEED;
      const npy = py + dir[1] * (0.6 + launch * 0.9) * dt * PARTICLE_SPEED;
      const npz = pz + (dir[2] * (0.52 + launch * 0.86) - dir[0] * swirl * launch * 0.22) * dt * PARTICLE_SPEED;

      pos[i * 3] = npx;
      pos[i * 3 + 1] = npy;
      pos[i * 3 + 2] = npz;

      positions[i * 3] = npx;
      positions[i * 3 + 1] = npy;
      positions[i * 3 + 2] = npz;

      // Linear fade: full brightness at birth → 0 at fadeAge.
      const bodyBoost = 1 - THREE.MathUtils.smoothstep(lifeN, 0.22, 0.48) * 0.18;
      const opacity = Math.max(0, 1 - a / fadeAge) * PARTICLE_OPACITY_SCALE * bodyBoost;
      colors[i * 3] = baseR * opacity;
      colors[i * 3 + 1] = baseG * opacity;
      colors[i * 3 + 2] = baseB * opacity;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    if (ghostPointsRef.current) {
      ghostPointsRef.current.rotation.y = -elapsed * 0.11;
      ghostPointsRef.current.rotation.x = Math.sin(elapsed * 0.2) * 0.04;
    }
  });

  return (
    <group ref={groupRef} position={presence.position} scale={presence.isLocal ? 0.36 : 0.52} renderOrder={18}>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      <group position={[0, 0.07, 0]} scale={1.08}>
        <points ref={ghostPointsRef} geometry={geometry} material={ghostMaterial} frustumCulled={false} />
      </group>
    </group>
  );
};

export default PlayerPresence3D;
