import { Grid, Sky, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore, WalkwaySample } from '../stores/covidStore';
import { EventMarkers3D } from './EventMarkers3D';
import { MemorialPins3D } from './MemorialPins3D';
import { MonthlyPlaques3D } from './MonthlyPlaques3D';
import { Mountain3D } from './Mountain3D';

interface Scene3DProps {
  enableControls?: boolean;
  showStats?: boolean;
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

export const Scene3D = ({ enableControls = true, showStats = false }: Scene3DProps) => {
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const cameraTarget = useCovidStore((state) => state.cameraTarget);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
  const mountainRef = useRef<THREE.Mesh>(null) as React.RefObject<THREE.Mesh>;
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  }, []);

  const dpr = useMemo(() => {
    if (typeof window === 'undefined') return [1, 1.4] as [number, number];
    return window.innerWidth < 768 ? ([0.9, 1.15] as [number, number]) : ([1, 1.45] as [number, number]);
  }, []);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{
          position: cameraPosition,
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        shadows={!isMobile}
        dpr={dpr}
        className="bg-gradient-to-b from-orange-900 to-amber-700"
      >
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
        <CameraSync
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          onSync={(pos, tgt) => {
            setCameraPosition(pos);
            setCameraTarget(tgt);
          }}
        />
        <CameraGroundClamp enabled={enableControls} clearance={1.2} />

        <hemisphereLight color="#fcc884" groundColor="#4c331e" intensity={0.6} />
        <directionalLight
          position={[80, 100, 50]}
          intensity={1.1}
          color="#ffd6a3"
          castShadow={!isMobile}
          shadow-mapSize-width={isMobile ? 512 : 1024}
          shadow-mapSize-height={isMobile ? 512 : 1024}
          shadow-camera-far={240}
          shadow-camera-left={-110}
          shadow-camera-right={110}
          shadow-camera-top={110}
          shadow-camera-bottom={-110}
        />
        <pointLight position={[-60, 40, -40]} intensity={isMobile ? 0.4 : 0.6} color="#ff7a59" />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow={!isMobile}>
          <planeGeometry args={[1600, 1600, 1, 1]} />
          <meshStandardMaterial color="#27170d" roughness={0.95} metalness={0.02} />
        </mesh>

        {!isMobile && (
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
        )}

        <Physics gravity={[0, -9.81, 0]} colliders="trimesh">
          <Suspense fallback={null}>
            <Mountain3D ref={mountainRef} quality={isMobile ? 'mobile' : 'desktop'} />
          </Suspense>
          <EventMarkers3D />
          <MonthlyPlaques3D />
          <MemorialPins3D />

          <Suspense fallback={null}>
            <FirstPersonWalker eyeHeight={1.6} isMobile={isMobile} />
          </Suspense>
        </Physics>

        {showStats && <Stats />}
      </Canvas>
    </div>
  );
};

function CameraSync({
  cameraPosition,
  cameraTarget,
  onSync,
}: {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  onSync?: (pos: [number, number, number], tgt: [number, number, number]) => void;
}) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls?: any };

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
  const yawRef = useRef(Math.PI * 0.5);
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
    if (distanceStep > 0 && Math.abs(startDistance - targetDistanceRef.current) <= distanceStep * 0.55) {
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
    const requestPointerLock = () => {
      canvas.requestPointerLock?.();
    };

    const handlePointerLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === canvas;
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
    document.addEventListener('mousemove', handlePointerMove);

    return () => {
      canvas.removeEventListener('click', requestPointerLock);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handlePointerMove);
      if (pointerLockedRef.current) document.exitPointerLock?.();
    };
  }, [gl]);

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
      canvas.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
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
      if (touchState.pointerId !== event.pointerId) return;
      touchState.active = false;
      touchState.pointerId = null;
    };

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
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
    const joystickForward = THREE.MathUtils.clamp(-(mobileMoveInput[1] ?? 0), -1, 1);
    const joystickStrafe = THREE.MathUtils.clamp(mobileMoveInput[0] ?? 0, -1, 1);

    const keyboardForward = (keyState.forward ? 1 : 0) - (keyState.backward ? 1 : 0);
    const keyboardStrafe = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
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
    const sampledHeight = Number.isFinite(sampledHeightRaw) ? sampledHeightRaw : smoothedSample.position.y;
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
    const cameraSurfaceY = Number.isFinite(cameraSurfaceRaw) ? cameraSurfaceRaw : desiredGroundY;
    const cameraMinY = cameraSurfaceY + Math.max(0.9, eyeHeight * 0.62);
    if (desiredCameraPos.y < cameraMinY) desiredCameraPos.y = cameraMinY;

    camera.position.lerp(desiredCameraPos, 1 - Math.exp(-8.5 * delta));
    const lookDir = lookDirRef.current.lerp(forwardAligned, 1 - Math.exp(-10 * delta)).normalize();
    const lookTarget = lookTargetRef.current.copy(camera.position).add(lookDir);
    camera.up.copy(up);
    camera.lookAt(lookTarget);

    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
    setCameraTarget([lookTarget.x, lookTarget.y, lookTarget.z]);

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
