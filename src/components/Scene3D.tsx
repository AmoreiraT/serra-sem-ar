import { Sky, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { EnvironmentQuality } from '../environment/UrbanVoidEnvironment';
import { UrbanVoidEnvironment } from '../environment/UrbanVoidEnvironment';
import { RENDER_PROFILE_CHANGE_EVENT, WEBGL_FALLBACK_STORAGE_KEY } from '../hooks/useRenderProfile';
import { isKeyboardNavigationBlocked, isKeyboardNavigationLocked } from '../lib/navigationLock';
import { startPerformanceTrace, type PerformanceTraceHandle } from '../services/performanceMonitoring';
import { useCovidStore, WalkwaySample } from '../stores/covidStore';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import type { MountainPoint } from '../types/covid';
import type { PerformanceProfile } from '../types/performanceProfile';
import { EventMarkers3D } from './EventMarkers3D';
import { MemorialPins3D } from './MemorialPins3D';
import { MonthlyPlaques3D } from './MonthlyPlaques3D';
import { Mountain3D } from './Mountain3D';
import { PeakAudio3D } from './PeakAudio3D';
import { PlayerPresence3D } from './PlayerPresence3D';
import { MemorialMarkers } from './memorials/MemorialMarkers';

export type Scene3DBakePassageId = 'inicio' | 'primeira-escalada' | 'colapso' | 'ecos';
export type Scene3DBakeLayer = 'back' | 'front';

export interface Scene3DBakeOptions {
  readonly passageId: Scene3DBakePassageId;
  readonly layer: Scene3DBakeLayer;
  readonly transparent?: boolean;
}

export interface Scene3DProps {
  readonly enableControls?: boolean;
  readonly showStats?: boolean;
  readonly bake?: Scene3DBakeOptions;
}

type MovementState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
};

const defaultMoveState: MovementState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
};

type SceneProfile = {
  isMobile: boolean;
  isConstrained: boolean;
  dpr: [number, number];
  shadows: boolean;
  mountainQuality: 'desktop' | 'mobile';
  environmentQuality: EnvironmentQuality;
};

const environmentQualityRank: Record<EnvironmentQuality, number> = {
  lean: 0,
  balanced: 1,
  full: 2,
};

const lowerEnvironmentQuality = (localQuality: EnvironmentQuality, profileQuality: EnvironmentQuality): EnvironmentQuality =>
  environmentQualityRank[profileQuality] < environmentQualityRank[localQuality] ? profileQuality : localQuality;

const applyRenderProfile = (
  sceneProfile: SceneProfile,
  renderProfile: PerformanceProfile['render']
): SceneProfile => {
  const maxDpr = Number.isFinite(renderProfile.maxDpr) && renderProfile.maxDpr > 0 ? renderProfile.maxDpr : sceneProfile.dpr[1];
  const dprMin = Math.min(sceneProfile.dpr[0], maxDpr);
  const dprMax = Math.min(sceneProfile.dpr[1], maxDpr);

  return {
    ...sceneProfile,
    dpr: [dprMin, Math.max(dprMin, dprMax)],
    mountainQuality: renderProfile.mountainQuality === 'mobile' ? 'mobile' : sceneProfile.mountainQuality,
    environmentQuality: lowerEnvironmentQuality(sceneProfile.environmentQuality, renderProfile.environmentQuality),
  };
};

type CameraPreset = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

const bakeCameraProgressByPassage: Record<Scene3DBakePassageId, number> = {
  inicio: 0.08,
  'primeira-escalada': 0.25,
  colapso: 0.46,
  ecos: 0.78,
};

const bakeRevealProgressByPassage: Record<Scene3DBakePassageId, number> = {
  inicio: 0.16,
  'primeira-escalada': 0.34,
  colapso: 0.58,
  ecos: 1,
};

const bakeClipProgressByPassage: Record<Scene3DBakePassageId, readonly [number, number]> = {
  inicio: [0, 0.18],
  'primeira-escalada': [0.14, 0.36],
  colapso: [0.32, 0.6],
  ecos: [0.58, 1],
};

const getBakeCameraPreset = (
  bakeOptions: Scene3DBakeOptions | undefined,
  mountainPoints: readonly MountainPoint[]
): CameraPreset | null => {
  if (!bakeOptions) return null;

  const first = mountainPoints[0];
  const last = mountainPoints[mountainPoints.length - 1] ?? first;
  const minX = first?.x ?? -320;
  const maxX = last?.x ?? 320;
  const progress = bakeCameraProgressByPassage[bakeOptions.passageId];
  const x = THREE.MathUtils.lerp(minX, maxX, progress);
  const isFront = bakeOptions.layer === 'front';

  return {
    position: isFront ? [x, 18, 150] : [x - 56, 30, 216],
    target: isFront ? [x, 10, -24] : [x + 22, 14, -22],
    fov: isFront ? 30 : 32,
  };
};

const getBakeRevealX = (
  bakeOptions: Scene3DBakeOptions | undefined,
  mountainPoints: readonly MountainPoint[]
): number | null => {
  if (!bakeOptions || mountainPoints.length === 0) return null;

  const first = mountainPoints[0];
  const last = mountainPoints[mountainPoints.length - 1] ?? first;
  const minX = first?.x ?? 0;
  const maxX = last?.x ?? minX;
  const progress = bakeRevealProgressByPassage[bakeOptions.passageId];

  return THREE.MathUtils.lerp(minX, maxX, progress);
};

const getBakeClipXRange = (
  bakeOptions: Scene3DBakeOptions | undefined,
  mountainPoints: readonly MountainPoint[]
): readonly [number, number] | null => {
  if (!bakeOptions || mountainPoints.length === 0) return null;

  const first = mountainPoints[0];
  const last = mountainPoints[mountainPoints.length - 1] ?? first;
  const minX = first?.x ?? 0;
  const maxX = last?.x ?? minX;
  const [startProgress, endProgress] = bakeClipProgressByPassage[bakeOptions.passageId];

  return [
    THREE.MathUtils.lerp(minX, maxX, startProgress),
    THREE.MathUtils.lerp(minX, maxX, endProgress),
  ];
};

const useDocumentVisible = (): boolean => {
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleVisibilityChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return visible;
};

const getSceneProfile = (): SceneProfile => {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isConstrained: false,
      dpr: [1, 1.5],
      shadows: true,
      mountainQuality: 'desktop',
      environmentQuality: 'full',
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const isTabletViewport =
    hasCoarsePointer &&
    shortSide >= 680 &&
    longSide >= 900 &&
    longSide <= 1440;
  const isTouchViewport = width < 768 || (hasCoarsePointer && (width < 1180 || isTabletViewport));
  const isMobile = isTouchViewport;
  const isTabletOrShort = width < 1100 || height < 760;
  const isConstrained = isTouchViewport || memory <= 4 || pixelRatio > 2 || height < 680;

  if (isTouchViewport) {
    return {
      isMobile,
      isConstrained: true,
      dpr: isTabletViewport ? [0.82, 1] : [0.75, 1],
      shadows: false,
      mountainQuality: 'mobile',
      environmentQuality: isTabletViewport && !reducedMotion && memory > 4 ? 'balanced' : 'lean',
    };
  }

  if (isConstrained) {
    return {
      isMobile: false,
      isConstrained: true,
      dpr: [0.85, 1],
      shadows: false,
      mountainQuality: 'mobile',
      environmentQuality: reducedMotion || memory <= 3 ? 'lean' : 'balanced',
    };
  }

  if (isTabletOrShort) {
    return {
      isMobile,
      isConstrained: false,
      dpr: [0.9, 1.2],
      shadows: false,
      mountainQuality: 'mobile',
      environmentQuality: 'balanced',
    };
  }

  return {
    isMobile,
    isConstrained: false,
    dpr: [1, 1.5],
    shadows: true,
    mountainQuality: 'desktop',
    environmentQuality: 'full',
  };
};

const activateWebGLFallback = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WEBGL_FALLBACK_STORAGE_KEY, '2d');
  } catch {
    // Session storage can be unavailable in stricter browser modes.
  }
  window.dispatchEvent(new Event(RENDER_PROFILE_CHANGE_EVENT));
};

export const Scene3D = ({ enableControls = true, showStats = false, bake }: Scene3DProps) => {
  const mountainMesh = useCovidStore((state) => state.mountainMesh);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
  const mountainRef = useRef<THREE.Mesh>(null) as React.RefObject<THREE.Mesh>;
  const [sceneProfile, setSceneProfile] = useState<SceneProfile>(() => getSceneProfile());
  const performanceProfile = usePerformanceProfileStore((state) => state.profile);
  const documentVisible = useDocumentVisible();
  const bakeCameraPreset = useMemo(() => getBakeCameraPreset(bake, mountainPoints), [bake, mountainPoints]);
  const bakeRevealX = useMemo(() => getBakeRevealX(bake, mountainPoints), [bake, mountainPoints]);
  const bakeClipXRange = useMemo(() => getBakeClipXRange(bake, mountainPoints), [bake, mountainPoints]);
  const initialCameraPosition = useMemo(
    () => bakeCameraPreset?.position ?? useCovidStore.getState().cameraPosition,
    [bakeCameraPreset]
  );
  const initialCameraTarget = useMemo(
    () => bakeCameraPreset?.target ?? useCovidStore.getState().cameraTarget,
    [bakeCameraPreset]
  );
  const initialCameraFov = bakeCameraPreset?.fov ?? 60;
  const bakeMode = Boolean(bake);
  const controlsEnabled = enableControls && !bakeMode;
  const transparentBake = Boolean(bake?.transparent);

  const handleCameraSync = useCallback(
    (position: [number, number, number], target: [number, number, number]) => {
      if (!bakeMode) return;
      setCameraPosition(position);
      setCameraTarget(target);
    },
    [bakeMode, setCameraPosition, setCameraTarget]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    const updateProfile = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setSceneProfile((current) => {
          const next = getSceneProfile();
          if (
            current.isMobile === next.isMobile &&
            current.isConstrained === next.isConstrained &&
            current.shadows === next.shadows &&
            current.mountainQuality === next.mountainQuality &&
            current.environmentQuality === next.environmentQuality &&
            current.dpr[0] === next.dpr[0] &&
            current.dpr[1] === next.dpr[1]
          ) {
            return current;
          }
          return next;
        });
      });
    };

    window.addEventListener('resize', updateProfile);
    window.addEventListener('orientationchange', updateProfile);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateProfile);
      window.removeEventListener('orientationchange', updateProfile);
    };
  }, []);

  const effectiveSceneProfile = useMemo(
    () => applyRenderProfile(sceneProfile, performanceProfile.render),
    [performanceProfile.render, sceneProfile]
  );
  const { dpr, isMobile, shadows, mountainQuality, environmentQuality } = effectiveSceneProfile;
  const oxygenMemorialsEnabled = import.meta.env.VITE_ENABLE_OXYGEN_MEMORIALS !== 'false';

  const calculatedRadius = useMemo(() => {
    if (!mountainMesh) return 90;
    const box = new THREE.Box3().setFromObject(mountainMesh);
    if (box.isEmpty()) return 90;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return Number.isFinite(sphere.radius) && sphere.radius > 1 ? sphere.radius : 90;
  }, [mountainMesh]);

  const mountainCenter = useMemo<[number, number, number]>(() => {
    if (!mountainMesh) return [0, 0, 0];
    const box = new THREE.Box3().setFromObject(mountainMesh);
    if (box.isEmpty()) return [0, 0, 0];
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return [sphere.center.x, sphere.center.y, sphere.center.z];
  }, [mountainMesh]);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{
          position: initialCameraPosition,
          fov: initialCameraFov,
          near: 0.1,
          far: 1000,
        }}
        shadows={shadows && !bakeMode}
        dpr={bakeMode ? [1, 1.5] : dpr}
        frameloop={bakeMode || documentVisible ? 'always' : 'never'}
        gl={{
          antialias: false,
          alpha: transparentBake,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: bakeMode,
        }}
        className={bakeMode ? 'bg-transparent' : 'bg-gradient-to-b from-orange-900 to-amber-700'}
      >
        {!bakeMode && (
          <ScenePerformanceReporter
            deviceClass={performanceProfile.deviceClass}
            renderProfile={performanceProfile.render}
            profileVersion={performanceProfile.version}
          />
        )}
        {!transparentBake && <color attach="background" args={['#130a05']} />}
        {!transparentBake && (
          <Sky
            distance={450000}
            inclination={0.47}
            azimuth={0.25}
            turbidity={12}
            rayleigh={1.8}
            mieCoefficient={0.015}
            mieDirectionalG={0.85}
          />
        )}
        <fogExp2 attach="fog" args={['#5f3c26', 0.0035]} />
        <CameraSync
          cameraPosition={initialCameraPosition}
          cameraTarget={initialCameraTarget}
          onSync={handleCameraSync}
        />
        <CameraGroundClamp enabled={controlsEnabled} clearance={1.2} />
        <MobileWebGLFallbackGuard enabled={!bakeMode && isMobile} />

        <hemisphereLight color="#fcc884" groundColor="#4c331e" intensity={0.6} />
        <directionalLight
          position={[80, 100, 50]}
          intensity={1.1}
          color="#ffd6a3"
          castShadow={shadows}
          shadow-mapSize-width={isMobile ? 512 : 1024}
          shadow-mapSize-height={isMobile ? 512 : 1024}
          shadow-camera-far={240}
          shadow-camera-left={-110}
          shadow-camera-right={110}
          shadow-camera-top={110}
          shadow-camera-bottom={-110}
        />
        <pointLight position={[-60, 40, -40]} intensity={isMobile ? 0.4 : 0.6} color="#ff7a59" />

        {!bakeMode && (
          <>
            <UrbanVoidEnvironment
              mountainRadius={calculatedRadius}
              mountainCenter={mountainCenter}
              seed={2020}
              quality={environmentQuality}
            />

            <SurroundingTerrain
              mountainRadius={calculatedRadius}
              mountainCenter={mountainCenter}
              quality={mountainQuality}
            />
          </>
        )}
        {!bakeMode && <PeakAudio3D />}

        <Physics gravity={[0, -9.81, 0]} colliders="trimesh">
          <Suspense fallback={null}>
            <Mountain3D
              ref={mountainRef}
              quality={bakeMode ? 'desktop' : mountainQuality}
              revealMode={bakeMode ? 'baked' : 'progressive'}
              bakedRevealX={bakeRevealX ?? undefined}
              bakedClipStartX={bakeClipXRange?.[0]}
              bakedClipEndX={bakeClipXRange?.[1]}
            />
          </Suspense>
          {!bakeMode && (
            <>
              <EventMarkers3D />
              <MonthlyPlaques3D quality={mountainQuality} />
              <MemorialPins3D />
              <MemorialMarkers
                enabled={oxygenMemorialsEnabled}
                maxMarkers={isMobile ? 60 : 140}
              />
              <PlayerPresence3D quality={mountainQuality} />
            </>
          )}

          {!bakeMode && (
            <Suspense fallback={null}>
              <FirstPersonWalker eyeHeight={1.6} isMobile={isMobile} />
            </Suspense>
          )}
        </Physics>

        {showStats && import.meta.env.DEV && <Stats />}
      </Canvas>
    </div>
  );
};

function MobileWebGLFallbackGuard({ enabled }: { enabled: boolean }) {
  const { gl } = useThree();
  const monitorRef = useRef({
    startedAt: 0,
    samples: 0,
    averageFrameMs: 16.7,
    fallbackActivated: false,
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      monitorRef.current.fallbackActivated = true;
      activateWebGLFallback();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
    };
  }, [enabled, gl]);

  useFrame((_, delta) => {
    if (!enabled) return;

    const monitor = monitorRef.current;
    if (monitor.fallbackActivated) return;

    const now = performance.now();
    if (!monitor.startedAt) {
      monitor.startedAt = now;
      return;
    }

    if (now - monitor.startedAt < 1800) return;

    const frameMs = Math.min(delta * 1000, 120);
    monitor.samples += 1;
    monitor.averageFrameMs =
      monitor.samples === 1 ? frameMs : monitor.averageFrameMs * 0.92 + frameMs * 0.08;

    if (monitor.samples < 90) return;

    const averageFps = 1000 / Math.max(monitor.averageFrameMs, 1);
    if (averageFps < 24 || monitor.averageFrameMs > 42) {
      monitor.fallbackActivated = true;
      activateWebGLFallback();
    }
  });

  return null;
}

function ScenePerformanceReporter({
  deviceClass,
  renderProfile,
  profileVersion,
}: {
  deviceClass: PerformanceProfile['deviceClass'];
  renderProfile: PerformanceProfile['render'];
  profileVersion: PerformanceProfile['version'];
}) {
  const traceRef = useRef<PerformanceTraceHandle | null>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    reportedRef.current = false;
    const traceHandle = startPerformanceTrace('scene3d_start_to_first_frame', {
      device_class: deviceClass,
      asset_variant: renderProfile.assetVariant,
      render_mode: renderProfile.experience,
      profile_version: profileVersion,
    });
    traceRef.current = traceHandle;

    return () => {
      traceHandle.stop({ status: reportedRef.current ? 'complete' : 'cancelled' });
      if (traceRef.current === traceHandle) traceRef.current = null;
    };
  }, [deviceClass, profileVersion, renderProfile.assetVariant, renderProfile.experience]);

  useFrame(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    traceRef.current?.stop({ status: 'first_frame' });
  });

  return null;
}

function SurroundingTerrain({
  mountainRadius,
  mountainCenter,
  quality,
}: {
  mountainRadius: number;
  mountainCenter: [number, number, number];
  quality: 'desktop' | 'mobile';
}) {
  const geometry = useMemo(() => {
    const segments = quality === 'mobile' ? 88 : 144;
    const size = Math.max(1300, mountainRadius * 2.55);
    const half = size / 2;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const low = new THREE.Color('#120904');
    const mid = new THREE.Color('#2a1409');
    const high = new THREE.Color('#5a321c');
    const color = new THREE.Color();

    for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
      const zT = zIndex / segments;
      const localZ = THREE.MathUtils.lerp(-half, half, zT);

      for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
        const xT = xIndex / segments;
        const localX = THREE.MathUtils.lerp(-half, half, xT);
        const radial = Math.sqrt(localX * localX + localZ * localZ) / half;
        const centralValley = Math.exp(-Math.abs(localZ) / Math.max(28, mountainRadius * 0.06));
        const wave =
          Math.sin(localX * 0.018 + localZ * 0.01) * 0.72 +
          Math.cos(localX * 0.009 - localZ * 0.024) * 0.52 +
          Math.sin((localX + localZ) * 0.006) * 0.9;
        const y = -2.55 + wave * (0.55 + radial * 1.15) - centralValley * 0.42;

        positions.push(mountainCenter[0] + localX, y, mountainCenter[2] + localZ);

        const colorMix = THREE.MathUtils.clamp(0.26 + radial * 0.28 + wave * 0.08, 0, 1);
        color.copy(low).lerp(mid, colorMix).lerp(high, Math.max(0, colorMix - 0.58) * 0.55);
        colors.push(color.r, color.g, color.b);
      }
    }

    const row = segments + 1;
    for (let zIndex = 0; zIndex < segments; zIndex += 1) {
      for (let xIndex = 0; xIndex < segments; xIndex += 1) {
        const a = zIndex * row + xIndex;
        const b = a + 1;
        const c = (zIndex + 1) * row + xIndex;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const terrainGeometry = new THREE.BufferGeometry();
    terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeometry.setIndex(indices);
    terrainGeometry.computeVertexNormals();
    return terrainGeometry;
  }, [mountainCenter, mountainRadius, quality]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow={quality === 'desktop'} renderOrder={-20}>
      <meshStandardMaterial
        vertexColors
        roughness={0.96}
        metalness={0.02}
        side={THREE.DoubleSide}
        fog
      />
    </mesh>
  );
}

function CameraSync({
  cameraPosition,
  cameraTarget,
  onSync,
}: {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  onSync?: (pos: [number, number, number], tgt: [number, number, number]) => void;
}) {
  type OptionalControls = {
    target?: THREE.Vector3;
    update?: () => void;
  };
  const state = useThree((rootState) => rootState);
  const camera = state.camera;
  const controls = (state as typeof state & { controls?: OptionalControls }).controls;

  useEffect(() => {
    camera.position.set(...cameraPosition);
    if (controls?.target instanceof THREE.Vector3) {
      controls.target.set(...cameraTarget);
      controls.update?.();
    } else {
      camera.lookAt(new THREE.Vector3(...cameraTarget));
      camera.updateProjectionMatrix();
    }
    onSync?.(cameraPosition, cameraTarget);
  }, [camera, controls, cameraPosition, cameraTarget, onSync]);

  return null;
}

function CameraGroundClamp({ enabled = true, clearance = 1.0 }: { enabled?: boolean; clearance?: number }) {
  const sampler = useCovidStore((state) => state.terrainSampler);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const { camera } = useThree();

  useFrame((_, delta) => {
    if (!enabled || !sampler) return;
    const surfaceY = sampler.sampleHeight(camera.position.x, camera.position.z);
    const minY = surfaceY + clearance;
    if (camera.position.y + 0.01 >= minY) return;
    camera.position.y = THREE.MathUtils.damp(camera.position.y, minY, 10, delta);
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
  });

  return null;
}

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

function FirstPersonWalker({ eyeHeight = 1.6, isMobile = false }: { eyeHeight?: number; isMobile?: boolean }) {
  const { camera, gl } = useThree();
  const walkwayProfile = useCovidStore((state) => state.walkwayProfile);
  const dataLength = useCovidStore((state) => state.data.length);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);
  const mobileMoveInput = useCovidStore((state) => state.mobileMoveInput);

  const keyStateRef = useRef<MovementState>({ ...defaultMoveState });
  const pointerLockedRef = useRef(false);
  const pointerLockCooldownUntilRef = useRef(0);
  const yawRef = useRef(-Math.PI * 0.5);
  const pitchRef = useRef(THREE.MathUtils.degToRad(0));
  const distanceRef = useRef(0);
  const targetDistanceRef = useRef(0);
  const lateralOffsetRef = useRef(0);
  const lateralTargetRef = useRef(0);
  const hasInitialOrientationRef = useRef(false);
  const strideCycleRef = useRef(0);
  const forwardVelocityRef = useRef(0);
  const strafeVelocityRef = useRef(0);
  const skipNextIndexSyncRef = useRef(false);
  const playerGroundYRef = useRef<number | null>(null);
  const playerVerticalVelocityRef = useRef(0);
  const storeSyncTimerRef = useRef(0);

  const touchStateRef = useRef({
    active: false,
    pointerId: null as number | null,
    x: 0,
    y: 0,
  });

  const worldUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const alignQuatRef = useRef(new THREE.Quaternion());
  const moveDirRef = useRef(new THREE.Vector3());
  const forwardVecRef = useRef(new THREE.Vector3());
  const rightVecRef = useRef(new THREE.Vector3());
  const groundNormalRef = useRef(new THREE.Vector3(0, 1, 0));
  const planarForwardRef = useRef(new THREE.Vector3());
  const planarRightRef = useRef(new THREE.Vector3());
  const playerPosRef = useRef(new THREE.Vector3());
  const rightAlignedRef = useRef(new THREE.Vector3());
  const forwardAlignedRef = useRef(new THREE.Vector3());
  const desiredCameraPosRef = useRef(new THREE.Vector3());
  const lookTargetRef = useRef(new THREE.Vector3());
  const smoothedUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const lookDirRef = useRef(new THREE.Vector3(0, 0, -1));

  const walkwayLength = useMemo(() => {
    if (!walkwayProfile.length) return 0;
    return walkwayProfile[walkwayProfile.length - 1].distance;
  }, [walkwayProfile]);

  const distanceFromDataIndex = useMemo(() => {
    if (!walkwayLength || dataLength <= 1) return (_idx: number) => 0;
    return (idx: number) => walkwayLength * (idx / (dataLength - 1));
  }, [walkwayLength, dataLength]);

  const distanceStep = useMemo(() => {
    if (!walkwayLength || dataLength <= 1) return 0;
    return walkwayLength / (dataLength - 1);
  }, [walkwayLength, dataLength]);

  useEffect(() => {
    if (!walkwayLength) return;
    if (skipNextIndexSyncRef.current) {
      skipNextIndexSyncRef.current = false;
      return;
    }

    const startDistance = distanceFromDataIndex(currentDateIndex);
    if (
      hasInitialOrientationRef.current &&
      distanceStep > 0 &&
      Math.abs(startDistance - targetDistanceRef.current) <= distanceStep * 0.55
    ) {
      return;
    }

    distanceRef.current = startDistance;
    targetDistanceRef.current = startDistance;
    playerGroundYRef.current = null;
    playerVerticalVelocityRef.current = 0;
    smoothedUpRef.current.set(0, 1, 0);

    if (!hasInitialOrientationRef.current && walkwayProfile.length) {
      const baseSample = findWalkwaySample(walkwayProfile, startDistance);
      const aheadDistance = Math.min(startDistance + 1.4, walkwayLength);
      const aheadSample = findWalkwaySample(walkwayProfile, aheadDistance);
      const forwardVec = aheadSample.position.clone().sub(baseSample.position);
      forwardVec.y = 0;
      if (forwardVec.lengthSq() < 1e-4) forwardVec.set(1, 0, 0);
      forwardVec.normalize();
      yawRef.current = Math.atan2(-forwardVec.x, -forwardVec.z);
      pitchRef.current = THREE.MathUtils.degToRad(-6);
      hasInitialOrientationRef.current = true;
    }
  }, [currentDateIndex, distanceFromDataIndex, distanceStep, walkwayLength, walkwayProfile]);

  useEffect(() => {
    const resetKeyboardMovement = () => {
      keyStateRef.current = { ...defaultMoveState };
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isKeyboardNavigationBlocked(event)) {
        resetKeyboardMovement();
        return;
      }

      const key = event.key;
      if (key === 'w' || key === 'W' || key === 'ArrowUp') keyStateRef.current.forward = true;
      if (key === 's' || key === 'S' || key === 'ArrowDown') keyStateRef.current.backward = true;
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') keyStateRef.current.left = true;
      if (key === 'd' || key === 'D' || key === 'ArrowRight') keyStateRef.current.right = true;
      if (key === 'Shift') keyStateRef.current.run = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isKeyboardNavigationBlocked(event)) {
        resetKeyboardMovement();
        return;
      }

      const key = event.key;
      if (key === 'w' || key === 'W' || key === 'ArrowUp') keyStateRef.current.forward = false;
      if (key === 's' || key === 'S' || key === 'ArrowDown') keyStateRef.current.backward = false;
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') keyStateRef.current.left = false;
      if (key === 'd' || key === 'D' || key === 'ArrowRight') keyStateRef.current.right = false;
      if (key === 'Shift') keyStateRef.current.run = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;

    const canvas = gl.domElement;
    const requestPointerLock = () => {
      const now = performance.now();
      if (now < pointerLockCooldownUntilRef.current) return;
      if (document.pointerLockElement === canvas) return;

      try {
        const maybePromise = canvas.requestPointerLock?.();
        if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
          void (maybePromise as Promise<void>).catch(() => {
            pointerLockCooldownUntilRef.current = performance.now() + 700;
          });
        }
      } catch {
        pointerLockCooldownUntilRef.current = performance.now() + 700;
      }
    };

    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvas;
      pointerLockedRef.current = isLocked;
      if (!isLocked) {
        pointerLockCooldownUntilRef.current = performance.now() + 700;
      }
    };

    const handlePointerLockError = () => {
      pointerLockedRef.current = false;
      pointerLockCooldownUntilRef.current = performance.now() + 900;
    };

    const applyLookDelta = (dx: number, dy: number) => {
      yawRef.current -= dx * 0.0018;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - dy * 0.0013,
        THREE.MathUtils.degToRad(-60),
        THREE.MathUtils.degToRad(70)
      );
    };

    const handlePointerMove = (event: MouseEvent) => {
      if (pointerLockedRef.current) {
        applyLookDelta(event.movementX, event.movementY);
        return;
      }
      // Desktop fallback: keep orbital look while dragging mouse without pointer lock.
      if (event.buttons === 1) {
        applyLookDelta(event.movementX, event.movementY);
      }
    };

    canvas.addEventListener('click', requestPointerLock);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);
    document.addEventListener('mousemove', handlePointerMove);

    return () => {
      canvas.removeEventListener('click', requestPointerLock);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      document.removeEventListener('mousemove', handlePointerMove);
      if (pointerLockedRef.current) document.exitPointerLock?.();
    };
  }, [gl, isMobile]);

  useEffect(() => {
    const canvas = gl.domElement;
    const touchState = touchStateRef.current;
    const touchSensitivity = 0.0032;
    const previousTouchAction = canvas.style.touchAction;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-joystick-control="true"]')) return;
      touchState.active = true;
      touchState.pointerId = event.pointerId;
      touchState.x = event.clientX;
      touchState.y = event.clientY;
      try {
        if (!canvas.hasPointerCapture?.(event.pointerId)) {
          canvas.setPointerCapture?.(event.pointerId);
        }
      } catch {
        // Some mobile webviews can throw InvalidStateError during capture races.
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (!touchState.active || touchState.pointerId !== event.pointerId) return;
      const dx = event.clientX - touchState.x;
      const dy = event.clientY - touchState.y;
      touchState.x = event.clientX;
      touchState.y = event.clientY;
      yawRef.current -= dx * touchSensitivity;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - dy * touchSensitivity,
        THREE.MathUtils.degToRad(-60),
        THREE.MathUtils.degToRad(70)
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (touchState.pointerId !== event.pointerId) return;
      touchState.active = false;
      touchState.pointerId = null;
      try {
        if (canvas.hasPointerCapture?.(event.pointerId)) {
          canvas.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // Ignore release races on mobile browsers.
      }
    };

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [gl]);

  const sampleGroundNormal = (x: number, z: number, target: THREE.Vector3) => {
    if (!terrainSampler) return target.set(0, 1, 0);
    const h = 0.6;
    const hx1 = terrainSampler.sampleHeight(x + h, z);
    const hx0 = terrainSampler.sampleHeight(x - h, z);
    const hz1 = terrainSampler.sampleHeight(x, z + h);
    const hz0 = terrainSampler.sampleHeight(x, z - h);
    target.set(hx0 - hx1, 2 * h, hz0 - hz1);
    if (target.lengthSq() < 1e-6) return target.set(0, 1, 0);
    return target.normalize();
  };

  useFrame((_, delta) => {
    if (!walkwayLength || !walkwayProfile.length) return;

    const MOVE_SPEED = 18.5;
    const RUN_MULTIPLIER = 1.55;
    const STRAFE_SPEED = 10.5;
    const ACCELERATION = 9;
    const DECELERATION = 11;
    const POSITION_SMOOTH = 9;
    const LATERAL_MARGIN = 0.6;
    const GRAVITY = -24;
    const FLOOR_SNAP_UP = 0.26;
    const FLOOR_STICK_FORCE = 18;

    const keyState = keyStateRef.current;
    const keyboardLocked = isKeyboardNavigationLocked();
    if (keyboardLocked) {
      keyState.forward = false;
      keyState.backward = false;
      keyState.left = false;
      keyState.right = false;
      keyState.run = false;
    }

    const joystickForward = THREE.MathUtils.clamp(-(mobileMoveInput[1] ?? 0), -1, 1);
    const joystickStrafe = THREE.MathUtils.clamp(mobileMoveInput[0] ?? 0, -1, 1);

    const keyboardForward = keyboardLocked ? 0 : (keyState.forward ? 1 : 0) - (keyState.backward ? 1 : 0);
    const keyboardStrafe = keyboardLocked ? 0 : (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
    const inputForward = THREE.MathUtils.clamp(keyboardForward + joystickForward, -1, 1);
    const inputStrafe = THREE.MathUtils.clamp(keyboardStrafe + joystickStrafe, -1, 1);
    const isRunning = keyState.run || (Math.abs(joystickForward) > 0.92 && isMobile);

    const moveAccel = Math.abs(inputForward) > Math.abs(forwardVelocityRef.current) ? ACCELERATION : DECELERATION;
    const strafeAccel = Math.abs(inputStrafe) > Math.abs(strafeVelocityRef.current) ? ACCELERATION : DECELERATION;
    forwardVelocityRef.current = THREE.MathUtils.damp(forwardVelocityRef.current, inputForward, moveAccel, delta);
    strafeVelocityRef.current = THREE.MathUtils.damp(strafeVelocityRef.current, inputStrafe, strafeAccel, delta);

    const baseSample = findWalkwaySample(walkwayProfile, distanceRef.current);
    let maxLateral = Math.max(baseSample.halfWidth - LATERAL_MARGIN, 0.3);

    const aheadSample = findWalkwaySample(walkwayProfile, distanceRef.current + 1.2);
    const forwardVec = forwardVecRef.current.copy(aheadSample.position).sub(baseSample.position);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() < 1e-4) forwardVec.set(1, 0, 0);
    forwardVec.normalize();

    const right = rightVecRef.current.crossVectors(worldUpRef.current, forwardVec).normalize();

    const groundNormalForMove = sampleGroundNormal(baseSample.position.x, baseSample.position.z, groundNormalRef.current);
    const moveDir = moveDirRef.current.set(0, 0, 0);
    if (Math.abs(forwardVelocityRef.current) > 0.001 || Math.abs(strafeVelocityRef.current) > 0.001) {
      const alignQuat = alignQuatRef.current.setFromUnitVectors(worldUpRef.current, groundNormalForMove);
      const planarForward = planarForwardRef.current
        .set(0, 0, -1)
        .applyQuaternion(alignQuat)
        .applyAxisAngle(groundNormalForMove, yawRef.current)
        .normalize();
      const planarRight = planarRightRef.current.crossVectors(planarForward, groundNormalForMove).normalize();
      moveDir.addScaledVector(planarForward, forwardVelocityRef.current);
      moveDir.addScaledVector(planarRight, strafeVelocityRef.current);
      if (moveDir.lengthSq() > 1) moveDir.normalize();
    }
    const alongIntent = moveDir.dot(forwardVec);
    const lateralIntent = moveDir.dot(right);

    const appliedSpeed = (isRunning ? MOVE_SPEED * RUN_MULTIPLIER : MOVE_SPEED) * delta;
    const appliedStrafe = STRAFE_SPEED * delta;

    targetDistanceRef.current = THREE.MathUtils.clamp(targetDistanceRef.current + alongIntent * appliedSpeed, 0, walkwayLength);
    lateralTargetRef.current = THREE.MathUtils.clamp(
      lateralTargetRef.current + lateralIntent * appliedStrafe,
      -maxLateral,
      maxLateral
    );

    distanceRef.current = THREE.MathUtils.damp(distanceRef.current, targetDistanceRef.current, POSITION_SMOOTH, delta);

    const smoothedSample = findWalkwaySample(walkwayProfile, distanceRef.current);
    maxLateral = Math.max(smoothedSample.halfWidth - LATERAL_MARGIN, 0.3);
    const lateral = THREE.MathUtils.damp(
      lateralOffsetRef.current,
      THREE.MathUtils.clamp(lateralTargetRef.current, -maxLateral, maxLateral),
      POSITION_SMOOTH,
      delta
    );
    lateralOffsetRef.current = lateral;

    const lateralClamped = THREE.MathUtils.clamp(lateral, -smoothedSample.outerWidth, smoothedSample.outerWidth);
    const playerPos = playerPosRef.current.copy(smoothedSample.position).addScaledVector(right, lateralClamped);
    const sampledHeightRaw = terrainSampler?.sampleHeight(playerPos.x, playerPos.z);
    const sampledHeight = (sampledHeightRaw != null && Number.isFinite(sampledHeightRaw)) ? sampledHeightRaw : smoothedSample.position.y;
    const lateralRatio = smoothedSample.halfWidth > 1e-4
      ? Math.min(Math.abs(lateralClamped) / smoothedSample.halfWidth, 1)
      : 0;
    const desiredGroundY = THREE.MathUtils.lerp(smoothedSample.position.y, sampledHeight, lateralRatio * 0.35);
    if (playerGroundYRef.current === null || !Number.isFinite(playerGroundYRef.current)) {
      playerGroundYRef.current = desiredGroundY;
      playerVerticalVelocityRef.current = 0;
    }
    const currentGroundY = playerGroundYRef.current;
    const groundRise = desiredGroundY - currentGroundY;
    if (groundRise > 0 && groundRise <= FLOOR_SNAP_UP) {
      // Small upward steps are absorbed smoothly to keep the walk stable.
      playerGroundYRef.current = THREE.MathUtils.damp(currentGroundY, desiredGroundY, FLOOR_STICK_FORCE, delta);
      playerVerticalVelocityRef.current = Math.max(0, playerVerticalVelocityRef.current);
    } else {
      playerVerticalVelocityRef.current += GRAVITY * delta;
      playerGroundYRef.current += playerVerticalVelocityRef.current * delta;
      if (playerGroundYRef.current <= desiredGroundY) {
        playerGroundYRef.current = THREE.MathUtils.damp(
          playerGroundYRef.current,
          desiredGroundY,
          FLOOR_STICK_FORCE,
          delta
        );
        playerVerticalVelocityRef.current = 0;
      }
    }
    playerPos.y = playerGroundYRef.current + 0.05;

    const rawUp = sampleGroundNormal(playerPos.x, playerPos.z, groundNormalRef.current);
    const up = smoothedUpRef.current.lerp(rawUp, 1 - Math.exp(-5.5 * delta)).normalize();
    const alignQuat = alignQuatRef.current.setFromUnitVectors(worldUpRef.current, up);
    const rightAligned = rightAlignedRef.current.set(1, 0, 0).applyQuaternion(alignQuat).applyAxisAngle(up, yawRef.current);
    const forwardAligned = forwardAlignedRef.current
      .set(0, 0, -1)
      .applyQuaternion(alignQuat)
      .applyAxisAngle(up, yawRef.current)
      .applyAxisAngle(rightAligned, pitchRef.current)
      .normalize();

    const gaitSpeed = Math.min(1, Math.sqrt(forwardVelocityRef.current ** 2 + strafeVelocityRef.current ** 2));
    strideCycleRef.current += delta * (isRunning ? 8.8 : 6.1) * (0.35 + gaitSpeed * 0.9);
    const bobAmplitude = isRunning ? 0.022 : 0.012;
    const bobOffset = Math.sin(strideCycleRef.current) * bobAmplitude * gaitSpeed;
    const swayOffset = Math.cos(strideCycleRef.current * 0.5) * 0.007 * gaitSpeed;

    const desiredCameraPos = desiredCameraPosRef.current
      .copy(playerPos)
      .addScaledVector(up, eyeHeight + bobOffset)
      .addScaledVector(rightAligned, swayOffset);
    const cameraSurfaceRaw = terrainSampler?.sampleHeight(desiredCameraPos.x, desiredCameraPos.z);
    const cameraSurfaceY = (cameraSurfaceRaw != null && Number.isFinite(cameraSurfaceRaw)) ? cameraSurfaceRaw : desiredGroundY;
    const cameraMinY = cameraSurfaceY + Math.max(0.9, eyeHeight * 0.62);
    if (desiredCameraPos.y < cameraMinY) desiredCameraPos.y = cameraMinY;

    camera.position.lerp(desiredCameraPos, 1 - Math.exp(-8.5 * delta));
    const lookDir = lookDirRef.current.lerp(forwardAligned, 1 - Math.exp(-10 * delta)).normalize();
    const lookTarget = lookTargetRef.current.copy(camera.position).add(lookDir);
    camera.up.copy(up);
    camera.lookAt(lookTarget);

    storeSyncTimerRef.current += delta;
    const storeSyncInterval = isMobile ? 0.12 : 0.08;
    if (storeSyncTimerRef.current >= storeSyncInterval) {
      storeSyncTimerRef.current = 0;
      setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
      setCameraTarget([lookTarget.x, lookTarget.y, lookTarget.z]);
    }

    if (walkwayLength && dataLength > 1) {
      const t = THREE.MathUtils.clamp(distanceRef.current / walkwayLength, 0, 1);
      const newIndex = Math.round(t * (dataLength - 1));
      if (newIndex !== currentDateIndex) {
        skipNextIndexSyncRef.current = true;
        setCurrentDateIndex(newIndex);
      }
    }
  });

  return null;
}
