import { useFrame } from '@react-three/fiber';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAuth } from '../providers/AuthProvider';
import { db } from '../services/firebaseConfig';
import { useCovidStore } from '../stores/covidStore';

const PRESENCE_COLLECTION = 'playerPresence';
const PRESENCE_TTL_MS = 18_000;
const WRITE_INTERVAL_MS = 2_500;
const HEARTBEAT_INTERVAL_MS = 12_000;
const MAX_REMOTE_PLAYERS = 80;
const POSITION_DELTA_EPSILON_SQ = 0.04;
const DATE_INDEX_DELTA_EPSILON = 1;
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

type PresenceVector = {
  x: number;
  y: number;
  z: number;
};

type PresenceDoc = {
  sessionId?: string;
  userId?: string | null;
  displayName?: string | null;
  color?: string;
  position?: PresenceVector;
  target?: PresenceVector;
  currentDateIndex?: number;
  updatedAtMs?: number;
};

type FlamePresence = {
  id: string;
  color: string;
  position: [number, number, number];
  isLocal: boolean;
};

const palette = ['#4cc9ff', '#3a86ff', '#5ee7ff', '#7dd3fc', '#60a5fa', '#a5f3fc'];

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

const distanceSq = (a: [number, number, number], b: [number, number, number]) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

const isPresenceFresh = (presence: PresenceDoc, now: number) =>
  typeof presence.updatedAtMs === 'number' && now - presence.updatedAtMs <= PRESENCE_TTL_MS;

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
  flamePosition.y = cameraPosition[1] - 1.35;

  return flamePosition.toArray() as [number, number, number];
};

export const PlayerPresence3D = ({ quality }: { quality: 'desktop' | 'mobile' }) => {
  const { user } = useAuth();
  const isPresenceEnabled = import.meta.env.VITE_ENABLE_PRESENCE !== 'false';
  const sessionId = useMemo(getSessionId, []);
  const color = useMemo(() => palette[hashString(sessionId) % palette.length], [sessionId]);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const cameraTarget = useCovidStore((state) => state.cameraTarget);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const latestStateRef = useRef({ cameraPosition, cameraTarget, currentDateIndex });
  const lastPublishedRef = useRef<{
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    currentDateIndex: number;
    atMs: number;
  } | null>(null);
  const [remotePresences, setRemotePresences] = useState<FlamePresence[]>([]);
  const localPresence = useMemo<FlamePresence>(
    () => ({
      id: `${sessionId}-local`,
      color,
      position: getLocalFlamePosition(cameraPosition, cameraTarget),
      isLocal: true,
    }),
    [cameraPosition, cameraTarget, color, sessionId]
  );

  useEffect(() => {
    latestStateRef.current = { cameraPosition, cameraTarget, currentDateIndex };
  }, [cameraPosition, cameraTarget, currentDateIndex]);

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
          distanceSq(latest.cameraPosition, previous.cameraPosition) > POSITION_DELTA_EPSILON_SQ ||
          distanceSq(latest.cameraTarget, previous.cameraTarget) > POSITION_DELTA_EPSILON_SQ;
        const dateChangedEnough =
          Math.abs(latest.currentDateIndex - previous.currentDateIndex) >= DATE_INDEX_DELTA_EPSILON;
        const heartbeatDue = now - previous.atMs >= HEARTBEAT_INTERVAL_MS;

        if (!movedEnough && !dateChangedEnough && !heartbeatDue) return;
      }

      try {
        await setDoc(
          ref,
          {
            sessionId,
            userId: user?.uid ?? null,
            displayName: user?.displayName ?? null,
            color,
            position: vectorFromArray(latest.cameraPosition),
            target: vectorFromArray(latest.cameraTarget),
            currentDateIndex: latest.currentDateIndex,
            updatedAtMs: now,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        lastPublishedRef.current = {
          cameraPosition: [...latest.cameraPosition] as [number, number, number],
          cameraTarget: [...latest.cameraTarget] as [number, number, number],
          currentDateIndex: latest.currentDateIndex,
          atMs: now,
        };
      } catch {
        // Presence is optional; Firestore rules may not be deployed yet.
      }
    };

    void publish(true);
    const interval = window.setInterval(() => {
      void publish();
    }, WRITE_INTERVAL_MS);

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
  }, [color, isPresenceEnabled, sessionId, user?.displayName, user?.uid]);

  useEffect(() => {
    if (!isPresenceEnabled) {
      setRemotePresences([]);
      return;
    }

    const presenceQuery = query(collection(db, PRESENCE_COLLECTION), orderBy('updatedAtMs', 'desc'), limit(MAX_REMOTE_PLAYERS));
    const unsubscribe = onSnapshot(
      presenceQuery,
      (snapshot) => {
        const now = Date.now();
        const next = snapshot.docs
          .map((entry) => {
            const payload = entry.data() as PresenceDoc;
            if (payload.sessionId === sessionId || !isPresenceFresh(payload, now) || !payload.position) return null;
            return {
              id: entry.id,
              color: payload.color ?? palette[hashString(entry.id) % palette.length],
              position: [payload.position.x, payload.position.y - 1.35, payload.position.z] as [number, number, number],
              isLocal: false,
            };
          })
          .filter((entry): entry is FlamePresence => entry !== null);
        setRemotePresences(next);
      },
      () => {
        setRemotePresences([]);
      }
    );

    return () => unsubscribe();
  }, [isPresenceEnabled, sessionId]);

  return (
    <group name="player-presence-flames">
      <PlayerSoulFlame presence={localPresence} quality={quality} />
      {remotePresences.map((presence) => (
        <PlayerSoulFlame key={presence.id} presence={presence} quality={quality} />
      ))}
    </group>
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
