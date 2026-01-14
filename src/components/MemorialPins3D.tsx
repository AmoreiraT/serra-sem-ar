import { Billboard, Html } from '@react-three/drei';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import crossSpriteUrl from '../assets/png/cruz-serra.png';
import { db } from '../services/firebaseConfig';
import { useCovidStore, type WalkwaySample } from '../stores/covidStore';
import type { MemorialEntry } from '../types/memorial';

const LABEL_MAX = 80;
const SPRITE_HEIGHT = 1.7;
const SPRITE_BASE_OFFSET = 0.18;
const LABEL_Y_OFFSET = SPRITE_HEIGHT + SPRITE_BASE_OFFSET + 0.90;
const LABEL_DISTANCE_FACTOR = 6;
const PROXIMITY_RADIUS = 7;
const SHADOW_RADIUS = 0.65;
const SHADOW_OPACITY = 0.5;
const SHADOW_Y_OFFSET = 0.01;

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

const sampleGroundNormal = (
  sampler: { sampleHeight: (x: number, z: number) => number } | null,
  x: number,
  z: number
) => {
  if (!sampler) return new THREE.Vector3(0, 1, 0);
  const h = 0.5;
  const hx1 = sampler.sampleHeight(x + h, z);
  const hx0 = sampler.sampleHeight(x - h, z);
  const hz1 = sampler.sampleHeight(x, z + h);
  const hz0 = sampler.sampleHeight(x, z - h);
  const normal = new THREE.Vector3(hx0 - hx1, 2 * h, hz0 - hz1);
  if (normal.lengthSq() < 1e-6) return new THREE.Vector3(0, 1, 0);
  return normal.normalize();
};

export const MemorialPins3D = () => {
  const data = useCovidStore((state) => state.data);
  const walkwayProfile = useCovidStore((state) => state.walkwayProfile);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
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

  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const memorialTexture = useMemo(
    () => textureLoader.load(crossSpriteUrl),
    [textureLoader, crossSpriteUrl]
  );
  const spriteScale = useMemo(() => {
    const image = memorialTexture.image as HTMLImageElement | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 1;
    return [SPRITE_HEIGHT * aspect, SPRITE_HEIGHT, 1] as const;
  }, [memorialTexture]);
  const memorialSpriteMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: memorialTexture,
        transparent: true,
        depthWrite: false,
        alphaTest: 0.35,
      }),
    [memorialTexture]
  );
  const shadowTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, size * 0.15, center, center, center);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }, []);
  const shadowMaterial = useMemo(() => {
    if (!shadowTexture) return null;
    return new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: SHADOW_OPACITY,
      color: new THREE.Color('#000000'),
    });
  }, [shadowTexture]);
  const shadowGeometry = useMemo(() => new THREE.CircleGeometry(SHADOW_RADIUS, 32), []);

  useEffect(() => {
    memorialTexture.anisotropy = 8;
    memorialTexture.colorSpace = THREE.SRGBColorSpace;
    memorialTexture.needsUpdate = true;
  }, [memorialTexture]);

  useEffect(() => {
    return () => {
      memorialSpriteMaterial.dispose();
      memorialTexture.dispose();
      shadowMaterial?.dispose();
      shadowTexture?.dispose();
    };
  }, [memorialSpriteMaterial, memorialTexture, shadowMaterial, shadowTexture]);
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
        position.y = sampledHeight ?? sample.position.y;
        const rotationY = Math.atan2(sample.forward.x, sample.forward.z);
        const groundNormal = sampleGroundNormal(terrainSampler, position.x, position.z);
        const shadowQuaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          groundNormal
        );
        return {
          ...entry,
          position,
          rotationY,
          shadowQuaternion,
        };
      })
      .filter(Boolean) as Array<MemorialEntry & { position: THREE.Vector3; rotationY: number; shadowQuaternion: THREE.Quaternion }>;
  }, [memorials, walkwayProfile, data, terrainSampler]);

  if (!mappedMemorials.length) return null;

  return (
    <group>
      {mappedMemorials.map((entry) => {
        const dx = cameraPosition[0] - entry.position.x;
        const dz = cameraPosition[2] - entry.position.z;
        const isNearby = Math.hypot(dx, dz) <= PROXIMITY_RADIUS;
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
            {shadowMaterial && (
              <mesh
                geometry={shadowGeometry}
                material={shadowMaterial}
                position={[0, SHADOW_Y_OFFSET, 0]}
                quaternion={entry.shadowQuaternion}
                renderOrder={0}
                raycast={() => null}
              />
            )}
            <Billboard position={[0, SPRITE_BASE_OFFSET, 0]} follow>
              <sprite
                material={memorialSpriteMaterial}
                scale={spriteScale}
                center={[0.5, 0]}
                renderOrder={1}
                onPointerOver={() => setHoveredId(entry.id)}
                onPointerOut={() => setHoveredId((prev) => (prev === entry.id ? null : prev))}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setLockedId((prev) => (prev === entry.id ? null : entry.id));
                }}
              />
            </Billboard>

            {(isActive || isNearby) && (
              <Billboard position={[0, LABEL_Y_OFFSET, 0.02]} follow>
                <Html
                  transform
                  center
                  distanceFactor={LABEL_DISTANCE_FACTOR}
                  className="pointer-events-none"
                >
                  <div className="relative w-[124px] space-y-0.5 rounded-lg border border-white/15 bg-black/88 px-2 py-[6px] text-[8px] text-white/80 shadow-2xl backdrop-blur-lg">
                    <div className="absolute left-1/2 top-full h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-black/88" />
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-200/85" />
                      <span className="flex-1 whitespace-normal break-words text-[7.25px] font-semibold uppercase leading-tight tracking-[0.18em] text-amber-200">
                        {label}
                      </span>
                    </div>
                    {dateLabel && (
                      <div className="break-words text-[7px] leading-tight text-white/60">{dateLabel}</div>
                    )}
                    <p className="whitespace-pre-line break-words text-[8px] leading-tight text-white/90">
                      {clampLabel(entry.message)}
                    </p>
                  </div>
                </Html>
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
};

export default MemorialPins3D;
