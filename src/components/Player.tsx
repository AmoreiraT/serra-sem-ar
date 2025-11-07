import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RapierRigidBody, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore, WalkwaySample } from '../stores/covidStore';

interface PlayerProps {
  eyeHeight?: number;
}

const FORWARD_KEYS = new Set(['w', 'W', 'ArrowUp']);
const BACKWARD_KEYS = new Set(['s', 'S', 'ArrowDown']);
const LEFT_KEYS = new Set(['a', 'A', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['d', 'D', 'ArrowRight']);
const RUN_KEYS = new Set(['Shift']);

const MOVE_SPEED = 24;
const RUN_MULTIPLIER = 1.6;
const STRAFE_SPEED = 12;
const FOLLOW_RADIUS = 10.5;
const BASE_CAMERA_HEIGHT = 3.4;
const CAMERA_SMOOTH = 6;
const POSITION_SMOOTH = 9;
const LATERAL_MARGIN = 0.4;
const ROTATION_SMOOTH = 8;
const SCROLL_MULTIPLIER = 1.2;
const MIN_PITCH = THREE.MathUtils.degToRad(-20);
const MAX_PITCH = THREE.MathUtils.degToRad(15);
const YAW_SENSITIVITY = 0.0018;
const PITCH_SENSITIVITY = 0.0013;
const CAMERA_COLLISION_CLEARANCE = 0.45;
const PLAYER_FOOT_OFFSET = 0.05;
const PLAYER_CAPSULE_RADIUS = 0.45;
const PLAYER_CAPSULE_HALF_HEIGHT = 0.95;
const PLAYER_MODEL_URL = new URL('../assets/glb/player/source/player.glb', import.meta.url).href;
const PLAYER_CLIPS = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
};

type KeyState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
};

const defaultKeyState: KeyState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
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

export const Player = ({ eyeHeight = 1.6 }: PlayerProps) => {
  const { camera, gl } = useThree();
  const { scene, animations } = useGLTF(PLAYER_MODEL_URL);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    clone.scale.setScalar(1.05);
    clone.position.set(0, -1.55, 0);
    return clone;
  }, [scene]);

  const playerRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const { actions } = useAnimations(animations, playerRef);
  const defaultActionName = animations[0]?.name;
  const cameraTargetRef = useRef(new THREE.Vector3());
  const pointerLockedRef = useRef(false);
  const yawRef = useRef(Math.PI * 0.5);
  const pitchRef = useRef(THREE.MathUtils.degToRad(8));

  const keyStateRef = useRef<KeyState>({ ...defaultKeyState });
  const distanceRef = useRef(0);
  const targetDistanceRef = useRef(0);
  const lateralOffsetRef = useRef(0);
  const lateralTargetRef = useRef(0);
  const lastSpeedRef = useRef(0);
  const cameraCollisionRayRef = useRef(new THREE.Raycaster());
  const playerHeightRef = useRef(0);

  const walkwayProfile = useCovidStore((state) => state.walkwayProfile);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const dataLength = useCovidStore((state) => state.data.length);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
  const mountainMesh = useCovidStore((state) => state.mountainMesh);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);

  const walkwayLength = useMemo(() => {
    if (!walkwayProfile.length) return 0;
    return walkwayProfile[walkwayProfile.length - 1].distance;
  }, [walkwayProfile]);

  const distanceFromDataIndex = useMemo(() => {
    if (!walkwayLength || dataLength <= 1) return (idx: number) => 0;
    return (idx: number) => walkwayLength * (idx / (dataLength - 1));
  }, [walkwayLength, dataLength]);

  useEffect(() => {
    if (!playerRef.current || !model) return;
    playerRef.current.add(model);
    return () => {
      playerRef.current?.remove(model);
    };
  }, [model]);

  useEffect(() => {
    if (!actions || !defaultActionName) return;
    const action = actions[defaultActionName];
    if (!action) return;
    action.reset().play();
    return () => {
      action.stop();
    };
  }, [actions, defaultActionName]);

  const dataIndexFromDistance = useMemo(() => {
    if (!walkwayLength || dataLength <= 1) return (distance: number) => 0;
    return (distance: number) => {
      const t = THREE.MathUtils.clamp(distance / walkwayLength, 0, 1);
      return Math.round(t * (dataLength - 1));
    };
  }, [walkwayLength, dataLength]);

  useEffect(() => {
    if (!walkwayLength) return;
    const startDistance = distanceFromDataIndex(currentDateIndex);
    distanceRef.current = startDistance;
    targetDistanceRef.current = startDistance;

    const forwardSample = findWalkwaySample(walkwayProfile, startDistance + 2);
    const currentSample = findWalkwaySample(walkwayProfile, startDistance);
    const dir = forwardSample.position.clone().sub(currentSample.position);
    dir.y = 0;
    if (dir.lengthSq() > 1e-5) {
      dir.normalize();
      yawRef.current = Math.atan2(dir.x, dir.z === 0 ? 1e-4 : dir.z);
    }
  }, [currentDateIndex, distanceFromDataIndex, walkwayLength, walkwayProfile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (FORWARD_KEYS.has(key)) keyStateRef.current.forward = true;
      if (BACKWARD_KEYS.has(key)) keyStateRef.current.backward = true;
      if (LEFT_KEYS.has(key)) keyStateRef.current.left = true;
      if (RIGHT_KEYS.has(key)) keyStateRef.current.right = true;
      if (RUN_KEYS.has(key)) keyStateRef.current.run = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key;
      if (FORWARD_KEYS.has(key)) keyStateRef.current.forward = false;
      if (BACKWARD_KEYS.has(key)) keyStateRef.current.backward = false;
      if (LEFT_KEYS.has(key)) keyStateRef.current.left = false;
      if (RIGHT_KEYS.has(key)) keyStateRef.current.right = false;
      if (RUN_KEYS.has(key)) keyStateRef.current.run = false;
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
      if (!pointerLockedRef.current) {
        pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, THREE.MathUtils.degToRad(8), 0.4);
      }
    };
    const handlePointerMove = (event: MouseEvent) => {
      if (!pointerLockedRef.current) return;
      yawRef.current -= event.movementX * YAW_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - event.movementY * PITCH_SENSITIVITY,
        MIN_PITCH,
        MAX_PITCH
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
    const step = walkwayLength / Math.max(dataLength - 1, 1) * SCROLL_MULTIPLIER;
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

  useFrame((_, delta) => {
    if (!walkwayLength || !walkwayProfile.length || !playerRef.current) return;

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
    const desiredYaw = Math.atan2(forwardVec.x, forwardVec.z === 0 ? 1e-4 : forwardVec.z);
    if (!pointerLockedRef.current) {
      const diff = THREE.MathUtils.euclideanModulo(desiredYaw - yawRef.current + Math.PI, Math.PI * 2) - Math.PI;
      yawRef.current += diff * (1 - Math.exp(-ROTATION_SMOOTH * delta));
    }

    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forwardVec).normalize();
    const lateralClamped = THREE.MathUtils.clamp(lateral, -smoothedSample.outerWidth, smoothedSample.outerWidth);
    const lateralRatio = smoothedSample.halfWidth > 1e-4 ? Math.min(Math.abs(lateralClamped) / smoothedSample.halfWidth, 1) : 0;
    const crossFalloff = lateralRatio ** 1.35;
    const walkwaySurfaceY = THREE.MathUtils.lerp(smoothedSample.y, smoothedSample.baseY, crossFalloff);
    const playerPos = smoothedSample.position.clone().add(right.clone().multiplyScalar(lateralClamped));
    const sampledHeight = terrainSampler?.sampleHeight(playerPos.x, playerPos.z);
    const targetHeight = (sampledHeight ?? walkwaySurfaceY) + PLAYER_FOOT_OFFSET;
    const smoothedHeight = THREE.MathUtils.damp(playerHeightRef.current, targetHeight, POSITION_SMOOTH, delta);
    playerHeightRef.current = smoothedHeight;
    playerPos.y = smoothedHeight;

    const lookMatrix = new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0, 0),
      forwardVec,
      new THREE.Vector3(0, 1, 0)
    );
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    if (bodyRef.current) {
      bodyRef.current.setNextKinematicTranslation({
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
      });
      bodyRef.current.setNextKinematicRotation({
        x: targetQuat.x,
        y: targetQuat.y,
        z: targetQuat.z,
        w: targetQuat.w,
      });
    }

    lastSpeedRef.current = THREE.MathUtils.lerp(lastSpeedRef.current, Math.abs(moveIntent) + Math.abs(strafeIntent), 1 - Math.exp(-6 * delta));
    if (actions && defaultActionName) {
      const action = actions[defaultActionName];
      if (action) {
        action.timeScale = THREE.MathUtils.lerp(action.timeScale, 0.4 + lastSpeedRef.current * (keyState.run ? 2.4 : 1.4), 1 - Math.exp(-5 * delta));
      }
    }

    const radius = FOLLOW_RADIUS * (keyState.run ? 0.92 : 1);
    const effectivePitch = pointerLockedRef.current ? pitchRef.current : THREE.MathUtils.lerp(pitchRef.current, THREE.MathUtils.degToRad(6), 1 - Math.exp(-3 * delta));
    const cosPitch = Math.cos(effectivePitch);
    const yaw = yawRef.current;
    const offset = new THREE.Vector3(
      -Math.sin(yaw) * cosPitch,
      Math.sin(effectivePitch),
      -Math.cos(yaw) * cosPitch
    ).multiplyScalar(radius);

    const cameraTarget = cameraTargetRef.current.copy(playerPos).add(new THREE.Vector3(0, eyeHeight, 0));
    const desiredCameraPos = cameraTarget.clone().add(offset).add(new THREE.Vector3(0, BASE_CAMERA_HEIGHT, 0));
    desiredCameraPos.y = Math.max(desiredCameraPos.y, smoothedSample.position.y + eyeHeight + 1.2);

    if (mountainMesh) {
      const dirToCamera = desiredCameraPos.clone().sub(cameraTarget);
      const distance = dirToCamera.length();
      if (distance > 0.1) {
        dirToCamera.normalize();
        cameraCollisionRayRef.current.set(cameraTarget.clone(), dirToCamera);
        cameraCollisionRayRef.current.far = distance;
        const cameraHits = cameraCollisionRayRef.current.intersectObject(mountainMesh, true);
        if (cameraHits.length) {
          const hit = cameraHits[0];
          const normal = hit.face?.normal ? hit.face.normal.clone() : dirToCamera.clone().multiplyScalar(-1);
          desiredCameraPos.copy(hit.point.clone().add(normal.multiplyScalar(CAMERA_COLLISION_CLEARANCE)));
        }
      }
    }

    camera.position.lerp(desiredCameraPos, 1 - Math.exp(-CAMERA_SMOOTH * delta));
    camera.lookAt(cameraTarget);
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
    setCameraTarget([cameraTarget.x, cameraTarget.y, cameraTarget.z]);

    const newIndex = dataIndexFromDistance(distanceRef.current);
    if (newIndex !== currentDateIndex) {
      setCurrentDateIndex(newIndex);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      enabledRotations={[false, true, false]}
      friction={0.9}
      linearDamping={2.5}
      angularDamping={2.5}
      userData={{ id: 'player' }}
    >
      <CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
      <group ref={playerRef}>
        <primitive object={model} dispose={null} />
      </group>
    </RigidBody>
  );
};

useGLTF.preload(PLAYER_MODEL_URL);

export default Player;
