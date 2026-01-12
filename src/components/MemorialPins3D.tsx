import { Html } from '@react-three/drei';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { db } from '../services/firebaseConfig';
import { useCovidStore, type WalkwaySample } from '../stores/covidStore';
import type { MemorialEntry } from '../types/memorial';

const CROSS_HEIGHT = 0.7;
const CROSS_THICKNESS = 0.12;
const CROSS_ARM = 0.48;
const CROSS_Y_OFFSET = 0.06;
const LABEL_MAX = 160;

const clampLabel = (value: string) => {
  if (value.length <= LABEL_MAX) return value;
  return `${value.slice(0, Math.max(0, LABEL_MAX - 3)).trim()}...`;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const findWalkwaySample = (profile: WalkwaySample[], distance: number) => {
  if (!profile.length) {
    return {
      position: new THREE.Vector3(distance, 0, 0),
      baseY: 0,
      halfWidth: 6,
      outerWidth: 8,
      forward: new THREE.Vector3(1, 0, 0),
    };
  }

  const clamped = THREE.MathUtils.clamp(distance, 0, profile[profile.length - 1].distance);
  let low = 0;
  let high = profile.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (profile[mid].distance < clamped) low = mid + 1;
    else high = mid;
  }

  const upper = low;
  const lower = Math.max(upper - 1, 0);
  const start = profile[lower];
  const end = profile[upper];
  const span = Math.max(end.distance - start.distance, 1e-4);
  const t = THREE.MathUtils.clamp((clamped - start.distance) / span, 0, 1);

  const x = THREE.MathUtils.lerp(start.x, end.x, t);
  const y = THREE.MathUtils.lerp(start.y, end.y, t);
  const baseY = THREE.MathUtils.lerp(start.baseY, end.baseY, t);
  const halfWidth = THREE.MathUtils.lerp(start.halfWidth, end.halfWidth, t);
  const outerWidth = THREE.MathUtils.lerp(start.outerWidth, end.outerWidth, t);

  const forward = new THREE.Vector3(end.x - start.x || 1, 0, 0).normalize();

  return {
    position: new THREE.Vector3(x, y, 0),
    baseY,
    halfWidth,
    outerWidth,
    forward,
  };
};

export const MemorialPins3D = () => {
  const data = useCovidStore((state) => state.data);
  const walkwayProfile = useCovidStore((state) => state.walkwayProfile);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);
  const [memorials, setMemorials] = useState<MemorialEntry[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);

  useEffect(() => {
    const memorialQuery = query(collection(db, 'memorials'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(memorialQuery, (snapshot) => {
      const items = snapshot.docs.map((doc) => {
        const payload = doc.data();
        return {
          id: doc.id,
          date: payload.date,
          dateIndex: payload.dateIndex ?? null,
          name: payload.name ?? null,
          message: payload.message ?? '',
          uid: payload.uid ?? '',
          userName: payload.userName ?? null,
          userPhoto: payload.userPhoto ?? null,
          createdAt: payload.createdAt ?? null,
        } as MemorialEntry;
      });
      setMemorials(items);
    });
    return () => unsubscribe();
  }, []);

  const crossGeometry = useMemo(() => new THREE.BoxGeometry(CROSS_THICKNESS, CROSS_HEIGHT, CROSS_THICKNESS), []);
  const armGeometry = useMemo(() => new THREE.BoxGeometry(CROSS_ARM, CROSS_THICKNESS, CROSS_THICKNESS), []);
  const activeId = lockedId ?? hoveredId;

  const mappedMemorials = useMemo(() => {
    if (!memorials.length || !walkwayProfile.length || data.length <= 1) return [];
    const walkwayLength = walkwayProfile[walkwayProfile.length - 1].distance;
    return memorials
      .map((entry) => {
        const directIndex =
          typeof entry.dateIndex === 'number'
            ? entry.dateIndex
            : data.findIndex((item) => item.date.toISOString().slice(0, 10) === entry.date);
        if (directIndex < 0) return null;
        const distance = walkwayLength * (directIndex / (data.length - 1));
        const sample = findWalkwaySample(walkwayProfile, distance);
        const lateralMax = Math.min(sample.halfWidth * 0.45, 3.2);
        const sideSeed = `${entry.uid || entry.id}-${directIndex}`;
        const side = (hashString(sideSeed) % 2 === 0 ? -1 : 1) * lateralMax;
        const position = sample.position.clone();
        position.z += side;
        const sampledHeight = terrainSampler?.sampleHeight(position.x, position.z);
        position.y = (sampledHeight ?? sample.y) + CROSS_Y_OFFSET;
        const rotationY = Math.atan2(sample.forward.x, sample.forward.z);
        return {
          ...entry,
          position,
          rotationY,
        };
      })
      .filter(Boolean) as Array<MemorialEntry & { position: THREE.Vector3; rotationY: number }>;
  }, [memorials, walkwayProfile, data, terrainSampler]);

  if (!mappedMemorials.length) return null;

  return (
    <group>
      {mappedMemorials.map((entry) => {
        const isActive = activeId === entry.id;
        const label = entry.name ? `Em memoria de ${entry.name}` : 'Memorial';
        const dateLabel = entry.date
          ? new Date(`${entry.date}T00:00:00`).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '';
        return (
          <group key={entry.id} position={entry.position.toArray()} rotation={[0, entry.rotationY, 0]}>
            <mesh
              geometry={crossGeometry}
              castShadow
              receiveShadow
              onPointerOver={() => setHoveredId(entry.id)}
              onPointerOut={() => setHoveredId((prev) => (prev === entry.id ? null : prev))}
              onPointerDown={(event) => {
                event.stopPropagation();
                setLockedId((prev) => (prev === entry.id ? null : entry.id));
              }}
            >
              <meshStandardMaterial color="#f1d8b5" emissive="#b98c5a" emissiveIntensity={0.25} />
            </mesh>
            <mesh geometry={armGeometry} position={[0, 0.16, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#f1d8b5" emissive="#b98c5a" emissiveIntensity={0.25} />
            </mesh>

            {isActive && (
              <Html
                transform
                position={[0, 0.55, 0.02]}
                distanceFactor={18}
                style={{ pointerEvents: 'auto' }}
              >
                <div className="w-[220px] space-y-1 rounded-lg border border-white/15 bg-black/85 p-2 text-[10px] text-white shadow-xl">
                  <div className="text-[9px] uppercase tracking-[0.3em] text-amber-200">
                    {label}
                  </div>
                  {dateLabel && <div className="text-[9px] text-white/60">{dateLabel}</div>}
                  <p className="text-[11px] font-semibold">{clampLabel(entry.message)}</p>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};

export default MemorialPins3D;
