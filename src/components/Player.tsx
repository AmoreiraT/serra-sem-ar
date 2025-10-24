import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';

interface PlayerProps {
  terrainRef: React.RefObject<THREE.Object3D>;
  eyeHeight?: number;
}

const FORWARD_KEYS = new Set(['w', 'W', 'ArrowUp', 'd', 'D', 'ArrowRight']);
const BACKWARD_KEYS = new Set(['s', 'S', 'ArrowDown', 'a', 'A', 'ArrowLeft']);

export const Player = ({ terrainRef, eyeHeight = 2.2 }: PlayerProps) => {
  const { camera } = useThree();
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const raycaster = useRef(new THREE.Raycaster()).current;
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const exactIndexRef = useRef(0);
  const targetIndexRef = useRef(0);

  const spawn = useMemo(() => {
    if (!mountainPoints.length) return new THREE.Vector3(0, 10, 0);
    const minX = Math.min(...mountainPoints.map((p) => p.x));
    return new THREE.Vector3(minX, 10, 0);
  }, [mountainPoints]);

  const clampLinearIndex = useCallback(
    (index: number) => THREE.MathUtils.clamp(index, 0, Math.max(0, mountainPoints.length - 1)),
    [mountainPoints.length]
  );

  useEffect(() => {
    camera.position.copy(spawn);
    camera.lookAt(spawn.x + 1, spawn.y, spawn.z);
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
    if (mountainPoints.length) {
      setCurrentDateIndex(0);
      exactIndexRef.current = 0;
      targetIndexRef.current = 0;
    }
  }, [camera, mountainPoints.length, setCameraPosition, setCurrentDateIndex, spawn]);

  useEffect(() => {
    if (!mountainPoints.length) return;
    const clamped = clampLinearIndex(currentDateIndex);
    targetIndexRef.current = clamped;
    if (!Number.isFinite(exactIndexRef.current)) {
      exactIndexRef.current = clamped;
    }
  }, [clampLinearIndex, currentDateIndex, mountainPoints.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1;
      if (FORWARD_KEYS.has(event.key)) {
        event.preventDefault();
        const next = clampLinearIndex(targetIndexRef.current + step);
        targetIndexRef.current = next;
        setCurrentDateIndex(Math.round(next));
      }
      if (BACKWARD_KEYS.has(event.key)) {
        event.preventDefault();
        const next = clampLinearIndex(targetIndexRef.current - step);
        targetIndexRef.current = next;
        setCurrentDateIndex(Math.round(next));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clampLinearIndex, setCurrentDateIndex]);

  useFrame((_, delta) => {
    if (!mountainPoints.length) return;

    const damped = THREE.MathUtils.damp(exactIndexRef.current, targetIndexRef.current, 12, delta);
    exactIndexRef.current = clampLinearIndex(damped);

    const lower = Math.floor(exactIndexRef.current);
    const upper = Math.min(lower + 1, mountainPoints.length - 1);
    const t = THREE.MathUtils.clamp(exactIndexRef.current - lower, 0, 1);
    const pointA = mountainPoints[lower];
    const pointB = mountainPoints[upper];
    const targetX = THREE.MathUtils.lerp(pointA.x, pointB.x, t);
    camera.position.x = targetX;
    camera.position.z = 0;

    if (terrainRef.current) {
      const origin = new THREE.Vector3(camera.position.x, 250, camera.position.z);
      raycaster.set(origin, new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(terrainRef.current, true);
      if (hits.length > 0) {
        const groundY = hits[0].point.y;
        camera.position.y = groundY + eyeHeight;
      }
    }

    camera.position.z = THREE.MathUtils.damp(camera.position.z, 0, 12, delta);
    setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);

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
      <PointerLockControls />
      <primitive object={targetRef.current} />
      <spotLight
        ref={spotRef}
        color="#261D0AFF"
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
