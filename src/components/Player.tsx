import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';

interface PlayerProps {
  /** Terrain mesh to collide/ground against */
  terrainRef: React.RefObject<THREE.Object3D>;
  /** Eye height above ground */
  eyeHeight?: number;
  /** Base walk speed (units/second) */
  speed?: number;
}

export const Player = ({ terrainRef, eyeHeight = 2.0, speed = 5 }: PlayerProps) => {
  const { camera } = useThree();
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const data = useCovidStore((state) => state.data);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);
  const revealedX = useCovidStore((state) => state.revealedX);
  const [locked, setLocked] = useState(false);
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false });
  const raycaster = useRef(new THREE.Raycaster()).current;
  const lastTimelineIndex = useRef<number | null>(null);

  // Determine starting X (beginning of the mountain) and center Z
  const spawn = useMemo(() => {
    if (!mountainPoints.length) return new THREE.Vector3(0, 10, 0);
    const minX = Math.min(...mountainPoints.map(p => p.x));
    return new THREE.Vector3(minX, 10, 0);
  }, [mountainPoints]);

  const xBounds = useMemo(() => {
    if (!mountainPoints.length) {
      return { minX: 0, maxX: 0, range: 1 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    for (const point of mountainPoints) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
    }
    const range = Math.max(1, maxX - minX);
    return { minX, maxX, range };
  }, [mountainPoints]);

  const timelineLength = data.length;

  const updateTimelineIndex = useCallback((xPos: number) => {
    if (!timelineLength) return;
    const { minX, range } = xBounds;
    const normalized = THREE.MathUtils.clamp((xPos - minX) / range, 0, 1);
    const index = Math.min(
      timelineLength - 1,
      Math.max(0, Math.round(normalized * (timelineLength - 1)))
    );
    if (lastTimelineIndex.current !== index) {
      lastTimelineIndex.current = index;
      setCurrentDateIndex(index);
    }
  }, [timelineLength, xBounds, setCurrentDateIndex]);

  // Place camera at spawn on mount or when data ready
  useEffect(() => {
    camera.position.copy(spawn);
    // Face towards +X (along the mountain timeline)
    camera.lookAt(spawn.x + 1, spawn.y, spawn.z);
    // Y will be adjusted to ground in the first frames
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
    if (timelineLength > 0) {
      updateTimelineIndex(camera.position.x);
    }
  }, [camera, spawn, setCameraPosition, updateTimelineIndex, timelineLength]);

  // Keyboard listeners
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') keys.current.w = true;
      if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A') keys.current.a = true;
      if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') keys.current.s = true;
      if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') keys.current.d = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.current.shift = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') keys.current.w = false;
      if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A') keys.current.a = false;
      if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') keys.current.s = false;
      if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') keys.current.d = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.current.shift = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Flashlight/spotlight attached to camera
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());

  // Per-frame movement + collision + ground clamping + light follow
  useFrame((state, delta) => {
    // Calculate intended horizontal movement based on camera orientation
    if (locked) {
      const moveDir = (keys.current.w || keys.current.d ? 1 : 0) - (keys.current.s || keys.current.a ? 1 : 0);
      if (moveDir !== 0) {
        const actualSpeed = (keys.current.shift ? 1.8 : 1.0) * speed * delta;
        camera.position.x += moveDir * actualSpeed;
      }

      const maxAllowedX = Math.max(
        xBounds.minX,
        Math.min(xBounds.maxX, revealedX + 1.5)
      );
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, xBounds.minX, maxAllowedX);
    }

    // Ground clamp via raycast from above
    if (terrainRef.current) {
      const origin = new THREE.Vector3(camera.position.x, 200, camera.position.z);
      raycaster.set(origin, new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(terrainRef.current, true);
      if (hits.length > 0) {
        const groundY = hits[0].point.y;
        camera.position.y = groundY + eyeHeight;
      }
    }

    // Keep player aligned with ridge centerline
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 0, 12, delta);

    // Update store camera position for external consumers
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);

    // Map current X position to timeline day while in walk mode
    if (locked) {
      updateTimelineIndex(camera.position.x);
    }

    // Keep spotlight attached to camera and aiming forward
    if (spotRef.current) {
      spotRef.current.position.copy(camera.position);
      const ahead = new THREE.Vector3();
      camera.getWorldDirection(ahead);
      ahead.normalize().multiplyScalar(5).add(camera.position);
      targetRef.current.position.copy(ahead);
      spotRef.current.target = targetRef.current as unknown as THREE.Object3D & { matrixWorld: THREE.Matrix4 };
    }
  });

  return (
    <>
      <PointerLockControls
        onLock={() => setLocked(true)}
        onUnlock={() => setLocked(false)}
      />
      {/* Flashlight */}
      <primitive object={targetRef.current} />
      <spotLight
        ref={spotRef}
        color="#fff7e6"
        intensity={2.2}
        distance={40}
        angle={Math.PI / 8}
        penumbra={0.5}
        castShadow
      />
    </>
  );
};

export default Player;
