import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';

interface PlayerProps {
  terrainRef: React.RefObject<THREE.Object3D>;
  eyeHeight?: number;
}

const FORWARD_KEYS = new Set(['w', 'W', 'ArrowUp', 'd', 'D', 'ArrowRight']);
const BACKWARD_KEYS = new Set(['s', 'S', 'ArrowDown', 'a', 'A', 'ArrowLeft']);
const WHEEL_SENSITIVITY_STEP = 1;
const TOUCH_SCROLL_THRESHOLD = 45;
const TOUCH_YAW_SENSITIVITY = 0.003;

export const Player = ({ terrainRef, eyeHeight = 2.2 }: PlayerProps) => {
  const { camera } = useThree();
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const raycaster = useRef(new THREE.Raycaster()).current;
  const exactIndexRef = useRef(0);
  const targetIndexRef = useRef(0);
  const touchScrollAccumulatorRef = useRef(0);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const touchActiveRef = useRef(false);
  const yawRef = useRef(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const spawn = useMemo(() => {
    if (!mountainPoints.length) return new THREE.Vector3(0, 10, 0);
    const minX = Math.min(...mountainPoints.map((p) => p.x));
    return new THREE.Vector3(minX, 10, 0);
  }, [mountainPoints]);

  const clampLinearIndex = useCallback(
    (index: number) => THREE.MathUtils.clamp(index, 0, Math.max(0, mountainPoints.length - 1)),
    [mountainPoints.length]
  );

  const updateTimeline = useCallback(
    (delta: number) => {
      if (!mountainPoints.length || delta === 0) return;
      const next = clampLinearIndex(targetIndexRef.current + delta);
      targetIndexRef.current = next;
      setCurrentDateIndex(Math.round(next));
    },
    [clampLinearIndex, mountainPoints.length, setCurrentDateIndex]
  );

  useEffect(() => {
    camera.position.copy(spawn);
    camera.lookAt(spawn.x + 1, spawn.y, spawn.z);
    yawRef.current = camera.rotation.y;
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
    if (typeof window === 'undefined') return;
    const detectTouch = () =>
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 ||
        // @ts-expect-error older Safari
        navigator.msMaxTouchPoints > 0 ||
        'ontouchstart' in window ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    const isTouch = detectTouch();
    setIsTouchDevice(isTouch);
    yawRef.current = camera.rotation.y;
  }, [camera]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!mountainPoints.length) return;
      const step = event.shiftKey ? 10 : 1;
      if (FORWARD_KEYS.has(event.key)) {
        event.preventDefault();
        updateTimeline(step);
      }
      if (BACKWARD_KEYS.has(event.key)) {
        event.preventDefault();
        updateTimeline(-step);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mountainPoints.length, updateTimeline]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!mountainPoints.length) return;
      event.preventDefault();
      const direction = event.deltaY === 0 ? 0 : event.deltaY < 0 ? 1 : -1;
      if (direction === 0) return;

      const stepMultiplier = event.shiftKey ? 10 : WHEEL_SENSITIVITY_STEP;
      const delta = direction * stepMultiplier;
      updateTimeline(delta);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [mountainPoints.length, updateTimeline]);

  useEffect(() => {
    if (!isTouchDevice) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      touchActiveRef.current = true;
      const touch = event.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      touchScrollAccumulatorRef.current = 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchActiveRef.current || event.touches.length !== 1) return;
      event.preventDefault();
      const touch = event.touches[0];
      const last = lastTouchRef.current;
      if (!last) {
        lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
        return;
      }

      const dx = touch.clientX - last.x;
      const dy = touch.clientY - last.y;
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };

      yawRef.current -= dx * TOUCH_YAW_SENSITIVITY;
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yawRef.current;

      touchScrollAccumulatorRef.current += dy;
      while (touchScrollAccumulatorRef.current <= -TOUCH_SCROLL_THRESHOLD) {
        updateTimeline(1);
        touchScrollAccumulatorRef.current += TOUCH_SCROLL_THRESHOLD;
      }
      while (touchScrollAccumulatorRef.current >= TOUCH_SCROLL_THRESHOLD) {
        updateTimeline(-1);
        touchScrollAccumulatorRef.current -= TOUCH_SCROLL_THRESHOLD;
      }
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      lastTouchRef.current = null;
      touchScrollAccumulatorRef.current = 0;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [camera, isTouchDevice, updateTimeline]);

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

    let groundY = THREE.MathUtils.lerp(pointA.y, pointB.y, t);

    if (terrainRef.current) {
      const origin = new THREE.Vector3(targetX, groundY + 150, 0);
      raycaster.set(origin, new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(terrainRef.current, true);
      if (hits.length > 0) {
        groundY = hits[0].point.y;
      }
    }

    camera.position.y = THREE.MathUtils.damp(camera.position.y, groundY + eyeHeight, 14, delta);
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
      {!isTouchDevice && <PointerLockControls />}
      <primitive object={targetRef.current} />
      <spotLight
        ref={spotRef}
        color="#261d0a"
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
