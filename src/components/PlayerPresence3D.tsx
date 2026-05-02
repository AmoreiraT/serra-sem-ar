import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAuth } from '../providers/AuthProvider';
import { db } from '../services/firebaseConfig';
import { useCovidStore } from '../stores/covidStore';

const PRESENCE_COLLECTION = 'playerPresence';
const PRESENCE_TTL_MS = 12_000;
const WRITE_INTERVAL_MS = 1_600;
const MAX_REMOTE_PLAYERS = 28;
const LOCAL_SESSION_KEY = 'serra-sem-ar-presence-id';

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
    const current = window.localStorage.getItem(LOCAL_SESSION_KEY);
    if (current) return current;
  } catch {
    // Private browsing can make localStorage unavailable.
  }

  const randomId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = `presence-${randomId}`;

  try {
    window.localStorage.setItem(LOCAL_SESSION_KEY, next);
  } catch {
    // A non-persistent session id is still enough for the current visit.
  }

  return next;
};

const vectorFromArray = ([x, y, z]: [number, number, number]): PresenceVector => ({ x, y, z });

const isPresenceFresh = (presence: PresenceDoc, now: number) =>
  typeof presence.updatedAtMs === 'number' && now - presence.updatedAtMs <= PRESENCE_TTL_MS;

export const PlayerPresence3D = ({ quality }: { quality: 'desktop' | 'mobile' }) => {
  const { user } = useAuth();
  const sessionId = useMemo(getSessionId, []);
  const color = useMemo(() => palette[hashString(sessionId) % palette.length], [sessionId]);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const cameraTarget = useCovidStore((state) => state.cameraTarget);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const latestStateRef = useRef({ cameraPosition, cameraTarget, currentDateIndex });
  const [remotePresences, setRemotePresences] = useState<FlamePresence[]>([]);

  useEffect(() => {
    latestStateRef.current = { cameraPosition, cameraTarget, currentDateIndex };
  }, [cameraPosition, cameraTarget, currentDateIndex]);

  useEffect(() => {
    const ref = doc(db, PRESENCE_COLLECTION, sessionId);
    let cancelled = false;

    const publish = async () => {
      if (cancelled) return;
      const latest = latestStateRef.current;
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
            updatedAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Presence is optional; Firestore rules may not be deployed yet.
      }
    };

    void publish();
    const interval = window.setInterval(() => {
      void publish();
    }, WRITE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void deleteDoc(ref).catch(() => undefined);
    };
  }, [color, sessionId, user?.displayName, user?.uid]);

  useEffect(() => {
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
  }, [sessionId]);

  return (
    <group name="player-presence-flames">
      {remotePresences.map((presence) => (
        <PlayerSoulFlame key={presence.id} presence={presence} quality={quality} />
      ))}
    </group>
  );
};

const PlayerSoulFlame = ({ presence, quality }: { presence: FlamePresence; quality: 'desktop' | 'mobile' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const targetRef = useRef(new THREE.Vector3(...presence.position));
  const color = useMemo(() => new THREE.Color(presence.color), [presence.color]);
  const particleCount = quality === 'mobile' ? 360 : 720;

  const seeds = useMemo(() => {
    const values = new Float32Array(particleCount * 4);
    const base = hashString(presence.id);
    let state = base || 1;
    const random = () => {
      state = Math.imul(1664525, state) + 1013904223;
      return ((state >>> 0) / 4294967296);
    };

    for (let i = 0; i < particleCount; i += 1) {
      values[i * 4] = random();
      values[i * 4 + 1] = random();
      values[i * 4 + 2] = random();
      values[i * 4 + 3] = random();
    }

    return values;
  }, [particleCount, presence.id]);

  const geometry = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
      sizes[i] = 1;
    }

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    nextGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return nextGeometry;
  }, [particleCount]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color,
        size: presence.isLocal ? 0.065 : 0.09,
        transparent: true,
        opacity: presence.isLocal ? 0.55 : 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
      }),
    [color, presence.isLocal]
  );

  useEffect(() => {
    targetRef.current.set(...presence.position);
  }, [presence.position]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    const points = pointsRef.current;
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!group || !points || !positionAttribute) return;

    group.position.lerp(targetRef.current, 1 - Math.exp(-5.5 * delta));

    const elapsed = clock.getElapsedTime();
    const positions = positionAttribute.array as Float32Array;
    for (let i = 0; i < particleCount; i += 1) {
      const a = seeds[i * 4];
      const b = seeds[i * 4 + 1];
      const c = seeds[i * 4 + 2];
      const d = seeds[i * 4 + 3];
      const isCore = a < 0.42;
      const phase = elapsed * (1.15 + d * 0.65) + b * Math.PI * 2;
      const angle = b * Math.PI * 2 + elapsed * (0.45 + c * 0.55);

      if (isCore) {
        const radius = 0.25 + c * 0.42;
        const y = 0.2 + Math.sin(phase) * 0.08 + d * 0.42;
        positions[i * 3] = Math.cos(angle) * radius * Math.sin(a * Math.PI);
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = Math.sin(angle) * radius * Math.sin(a * Math.PI);
      } else {
        const plume = (a - 0.42) / 0.58;
        const lift = plume * 1.95;
        const radius = (1 - plume) ** 1.7 * (0.72 + c * 0.32) + 0.035;
        const twist = Math.sin(phase * 0.8) * 0.22 * plume;
        positions[i * 3] = Math.cos(angle + twist) * radius + Math.sin(phase * 1.7) * 0.1 * plume;
        positions[i * 3 + 1] = 0.42 + lift + Math.sin(phase) * 0.14;
        positions[i * 3 + 2] = Math.sin(angle + twist) * radius + Math.cos(phase * 1.35) * 0.1 * plume;
      }
    }

    positionAttribute.needsUpdate = true;
    points.rotation.y = elapsed * 0.18;
  });

  return (
    <group ref={groupRef} position={presence.position} renderOrder={18}>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      {!presence.isLocal && (
        <mesh position={[0, 0.45, 0]} renderOrder={17}>
          <sphereGeometry args={[0.26, 20, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
      {!presence.isLocal && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={16}>
          <circleGeometry args={[0.68, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

export default PlayerPresence3D;
