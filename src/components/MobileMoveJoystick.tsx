import { cn } from '@/lib/utils';
import { type PointerEventHandler, useEffect, useRef, useState } from 'react';
import { useCovidStore } from '../stores/covidStore';
import './MobileMoveJoystick.css';

const JOYSTICK_RADIUS = 42;
const DEAD_ZONE = 0.12;

export const MobileMoveJoystick = () => {
  const setMobileMoveInput = useCovidStore((state) => state.setMobileMoveInput);
  const [active, setActive] = useState(false);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      setMobileMoveInput([0, 0]);
    };
  }, [setMobileMoveInput]);

  const clampPoint = (x: number, y: number) => {
    const magnitude = Math.hypot(x, y);
    if (magnitude <= JOYSTICK_RADIUS) {
      return { x, y, magnitude: magnitude / JOYSTICK_RADIUS };
    }
    const inv = JOYSTICK_RADIUS / magnitude;
    return {
      x: x * inv,
      y: y * inv,
      magnitude: 1,
    };
  };

  const updateByPointer = (clientX: number, clientY: number) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const next = clampPoint(dx, dy);

    setThumb({ x: next.x, y: next.y });

    const nx = next.x / JOYSTICK_RADIUS;
    const ny = next.y / JOYSTICK_RADIUS;
    const magnitude = Math.hypot(nx, ny);

    if (magnitude < DEAD_ZONE) {
      setMobileMoveInput([0, 0]);
      return;
    }

    setMobileMoveInput([nx, ny]);
  };

  const reset = () => {
    const activePointerId = pointerIdRef.current;
    if (activePointerId !== null && baseRef.current) {
      try {
        if (baseRef.current.hasPointerCapture?.(activePointerId)) {
          baseRef.current.releasePointerCapture?.(activePointerId);
        }
      } catch {
        // Ignore release races on mobile browsers.
      }
    }
    pointerIdRef.current = null;
    setActive(false);
    setThumb({ x: 0, y: 0 });
    setMobileMoveInput([0, 0]);
  };

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerIdRef.current = event.pointerId;
    setActive(true);
    event.preventDefault();
    try {
      if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    } catch {
      // Some mobile webviews throw InvalidStateError if pointer state changes mid-frame.
    }
    updateByPointer(event.clientX, event.clientY);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      updateByPointer(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      reset();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  useEffect(() => {
    if (!thumbRef.current) return;
    thumbRef.current.style.transform = `translate(calc(-50% + ${thumb.x}px), calc(-50% + ${thumb.y}px))`;
  }, [thumb.x, thumb.y]);

  return (
    <div
      data-joystick-control="true"
      className="pointer-events-auto select-none touch-none"
      onPointerDown={onPointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={baseRef}
        className={cn(
          'relative h-28 w-28 rounded-full border border-white/30 bg-black/35 backdrop-blur-md transition-colors',
          active && 'border-amber-300/80 bg-black/55'
        )}
      >
        <div className="pointer-events-none absolute inset-4 rounded-full border border-dashed border-white/20" />
        <div
          ref={thumbRef}
          className={cn(
            'mobile-joystick-thumb pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-white/60 bg-white/15 shadow-lg transition-transform',
            active ? 'duration-75' : 'duration-200'
          )}
        />
      </div>
    </div>
  );
};

export default MobileMoveJoystick;
