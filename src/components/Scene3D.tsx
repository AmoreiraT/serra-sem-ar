import { Grid, Sky, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore, WalkwaySample } from '../stores/covidStore';
import { EventMarkers3D } from './EventMarkers3D';
import { MonthlyPlaques3D } from './MonthlyPlaques3D';
import { Mountain3D } from './Mountain3D';



interface Scene3DProps {
  enableControls?: boolean;
  showStats?: boolean;
}

export const Scene3D = ({ enableControls = true, showStats = false }: Scene3DProps) => {
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const cameraTarget = useCovidStore((state) => state.cameraTarget);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
  const mountainRef = useRef<THREE.Mesh>(null) as React.RefObject<THREE.Mesh>;

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{
          position: cameraPosition,
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        shadows
        dpr={[1, 1.5]}
        className="bg-gradient-to-b from-orange-900 to-amber-700"
      >
        {/* Sky and atmosphere */}
        <color attach="background" args={['#130a05']} />
        <Sky
          distance={450000}
          inclination={0.47}
          azimuth={0.25}
          turbidity={12}
          rayleigh={1.8}
          mieCoefficient={0.015}
          mieDirectionalG={0.85}
        />
        <fog attach="fog" args={['#5f3c26', 60, 320]} />
        {/* Sync store updates into the actual three.js camera */}
        <CameraSync cameraPosition={cameraPosition} cameraTarget={cameraTarget} onSync={(pos, tgt) => {
          // make sure store and controls target stay coherent if needed
          setCameraPosition(pos);
          setCameraTarget(tgt);
        }} />
        <CameraGroundClamp enabled={enableControls} clearance={1.2} />
        {/* Lighting */}
        <hemisphereLight color={"#fcc884"} groundColor={"#4c331e"} intensity={0.6} />
        <directionalLight
          position={[80, 100, 50]}
          intensity={1.1}
          color="#ffd6a3"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={240}
          shadow-camera-left={-110}
          shadow-camera-right={110}
          shadow-camera-top={110}
          shadow-camera-bottom={-110}
        />
        <pointLight position={[-60, 40, -40]} intensity={0.6} color="#ff7a59" />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
          <planeGeometry args={[1600, 1600, 1, 1]} />
          <meshStandardMaterial color="#27170d" roughness={0.95} metalness={0.02} />
        </mesh>

        {/* Grid for reference */}
        <Grid
          position={[0, -2.19, 0]}
          args={[400, 400]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#ffffff"
          sectionSize={25}
          sectionThickness={1}
          sectionColor="#ffffff"
          fadeDistance={100}
          fadeStrength={1}
          infiniteGrid
        />

        <Physics gravity={[0, -9.81, 0]} colliders="trimesh">
          {/* Main mountain */}
          <Suspense fallback={null}>
            <Mountain3D ref={mountainRef} />
          </Suspense>
          <EventMarkers3D />
          <MonthlyPlaques3D />

          {/* First-person camera walker (no model to keep it light) */}
          <Suspense fallback={null}>
            <FirstPersonWalker eyeHeight={1.6} />
          </Suspense>
        </Physics>

        {/* Performance stats */}
        {showStats && <Stats />}
      </Canvas>
    </div>
  );
};

function CameraSync({ cameraPosition, cameraTarget, onSync }: { cameraPosition: [number, number, number]; cameraTarget: [number, number, number]; onSync?: (pos: [number, number, number], tgt: [number, number, number]) => void; }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera, controls?: any };
  const controlsRef = useRef<any>(null);

  // Try to get OrbitControls instance if present
  useEffect(() => {
    // three fiber injects default controls differently; we attempt to read from state
    // but we can still set camera position/target directly
  }, []);

  useEffect(() => {
    camera.position.set(...cameraPosition);
    if (controls && controls.target) {
      controls.target.set(...cameraTarget);
      controls.update();
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

// Helper replicated from Player to sample along the walkway
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

function FirstPersonWalker({ eyeHeight = 1.6 }: { eyeHeight?: number }) {
  const { camera, gl } = useThree();
  const walkwayProfile = useCovidStore((state) => state.walkwayProfile);
  const dataLength = useCovidStore((state) => state.data.length);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);
  const keyStateRef = useRef({ forward: false, backward: false, left: false, right: false, run: false });
  const pointerLockedRef = useRef(false);
  const yawRef = useRef(Math.PI * 0.5);
  const pitchRef = useRef(THREE.MathUtils.degToRad(0));
  const distanceRef = useRef(0);
  const targetDistanceRef = useRef(0);
  const lateralOffsetRef = useRef(0);
  const lateralTargetRef = useRef(0);
  const cameraCollisionRayRef = useRef(new THREE.Raycaster());

  const walkwayLength = useMemo(() => {
    if (!walkwayProfile.length) return 0;
    return walkwayProfile[walkwayProfile.length - 1].distance;
  }, [walkwayProfile]);

  const distanceFromDataIndex = useMemo(() => {
    if (!walkwayLength || dataLength <= 1) return (idx: number) => 0;
    return (idx: number) => walkwayLength * (idx / (dataLength - 1));
  }, [walkwayLength, dataLength]);

  useEffect(() => {
    if (!walkwayLength) return;
    const startDistance = distanceFromDataIndex(currentDateIndex);
    distanceRef.current = startDistance;
    targetDistanceRef.current = startDistance;
  }, [currentDateIndex, distanceFromDataIndex, walkwayLength]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'w' || key === 'W' || key === 'ArrowUp') keyStateRef.current.forward = true;
      if (key === 's' || key === 'S' || key === 'ArrowDown') keyStateRef.current.backward = true;
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') keyStateRef.current.left = true;
      if (key === 'd' || key === 'D' || key === 'ArrowRight') keyStateRef.current.right = true;
      if (key === 'Shift') keyStateRef.current.run = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
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
    const canvas = gl.domElement;
    const requestPointerLock = () => canvas.requestPointerLock?.();
    const handlePointerLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === canvas;
    };
    const handlePointerMove = (event: MouseEvent) => {
      if (!pointerLockedRef.current) return;
      yawRef.current -= event.movementX * 0.0018;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - event.movementY * 0.0013,
        THREE.MathUtils.degToRad(-60),
        THREE.MathUtils.degToRad(70)
      );
    };
    canvas.addEventListener('click', requestPointerLock);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handlePointerMove);
    return () => {
      canvas.removeEventListener('click', requestPointerLock);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handlePointerMove);
      if (pointerLockedRef.current) document.exitPointerLock?.();
    };
  }, [gl]);

  useEffect(() => {
    if (!walkwayLength) return;
    const step = (walkwayLength / Math.max(dataLength - 1, 1)) * 1.2;
    const onWheel = (event: WheelEvent) => {
      if (!walkwayLength) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? -1 : 1;
      targetDistanceRef.current = THREE.MathUtils.clamp(
        targetDistanceRef.current + direction * step,
        0,
        walkwayLength
      );
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [walkwayLength, dataLength]);

  const sampleGroundNormal = (x: number, z: number) => {
    if (!terrainSampler) return new THREE.Vector3(0, 1, 0);
    const h = 0.6;
    const hx1 = terrainSampler.sampleHeight(x + h, z);
    const hx0 = terrainSampler.sampleHeight(x - h, z);
    const hz1 = terrainSampler.sampleHeight(x, z + h);
    const hz0 = terrainSampler.sampleHeight(x, z - h);
    const normal = new THREE.Vector3(hx0 - hx1, 2 * h, hz0 - hz1);
    if (normal.lengthSq() < 1e-6) return new THREE.Vector3(0, 1, 0);
    return normal.normalize();
  };

  useFrame((_, delta) => {
    if (!walkwayLength || !walkwayProfile.length) return;
    const MOVE_SPEED = 20;
    const RUN_MULTIPLIER = 1.6;
    const STRAFE_SPEED = 12;
    const POSITION_SMOOTH = 9;
    const LATERAL_MARGIN = 0.6;
    const CAMERA_COLLISION_CLEARANCE = 0.25;

    const keyState = keyStateRef.current;
    const moveIntent = (keyState.forward ? 1 : 0) - (keyState.backward ? 1 : 0);
    const strafeIntent = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);

    const appliedSpeed = keyState.run ? MOVE_SPEED * RUN_MULTIPLIER : MOVE_SPEED;
    const speed = appliedSpeed * delta;
    const strafeSpeed = STRAFE_SPEED * delta;

    targetDistanceRef.current = THREE.MathUtils.clamp(
      targetDistanceRef.current + moveIntent * speed,
      0,
      walkwayLength
    );

    const sample = findWalkwaySample(walkwayProfile, distanceRef.current);
    const maxLateral = Math.max(sample.halfWidth - LATERAL_MARGIN, 0.3);

    lateralTargetRef.current = THREE.MathUtils.clamp(
      lateralTargetRef.current + strafeIntent * strafeSpeed,
      -maxLateral,
      maxLateral
    );

    distanceRef.current = THREE.MathUtils.damp(
      distanceRef.current,
      targetDistanceRef.current,
      POSITION_SMOOTH,
      delta
    );

    const smoothedSample = findWalkwaySample(walkwayProfile, distanceRef.current);
    const lateral = THREE.MathUtils.damp(
      lateralOffsetRef.current,
      THREE.MathUtils.clamp(lateralTargetRef.current, -maxLateral, maxLateral),
      POSITION_SMOOTH,
      delta
    );
    lateralOffsetRef.current = lateral;

    const aheadSample = findWalkwaySample(walkwayProfile, distanceRef.current + 1.2);
    const forwardVec = aheadSample.position.clone().sub(smoothedSample.position);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() < 1e-4) forwardVec.set(1, 0, 0);
    forwardVec.normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forwardVec).normalize();
    const lateralClamped = THREE.MathUtils.clamp(lateral, -smoothedSample.outerWidth, smoothedSample.outerWidth);
    const playerPos = smoothedSample.position.clone().add(right.clone().multiplyScalar(lateralClamped));
    const sampledHeight = terrainSampler?.sampleHeight(playerPos.x, playerPos.z);
    playerPos.y = (sampledHeight ?? smoothedSample.baseY) + 0.05;

    // Camera orientation aligned to surface normal (simulated gravity)
    const groundNormal = sampleGroundNormal(playerPos.x, playerPos.z);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), groundNormal);
    const up = groundNormal.clone();
    const rightAligned = new THREE.Vector3(1, 0, 0).applyQuaternion(alignQuat).applyAxisAngle(up, yawRef.current);
    const forwardAligned = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(alignQuat)
      .applyAxisAngle(up, yawRef.current)
      .applyAxisAngle(rightAligned, pitchRef.current)
      .normalize();

    const desiredCameraPos = playerPos.clone().add(up.clone().multiplyScalar(eyeHeight));
    camera.position.lerp(desiredCameraPos, 1 - Math.exp(-12 * delta));
    const lookTarget = camera.position.clone().add(forwardAligned);
    camera.up.copy(up);
    camera.lookAt(lookTarget);
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
    setCameraTarget([lookTarget.x, lookTarget.y, lookTarget.z]);

    const newIndex = (() => {
      if (!walkwayLength || dataLength <= 1) return 0;
      const t = THREE.MathUtils.clamp(distanceRef.current / walkwayLength, 0, 1);
      return Math.round(t * (dataLength - 1));
    })();
    if (newIndex !== currentDateIndex) {
      setCurrentDateIndex(newIndex);
    }
  });

  return null;
}
