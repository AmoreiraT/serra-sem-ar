import { ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { PointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCovidEventDatePtBr,
  getCovidEventForTimelineIndex,
  getCovidEventTimelinePoints,
} from '../../../data/covidEvents';
import { isKeyboardNavigationBlocked } from '../../../lib/navigationLock';
import { useCovidStore } from '../../../stores/covidStore';
import { serraPassages } from '../data/serraPassages';
import type { SerraPassage } from '../types/serraPassage';
import { DataMemorialPanel } from './DataMemorialPanel';
import { MobileTimeline } from './MobileTimeline';
import { PassageLayer } from './PassageLayer';
import './mobile-serra-25d.css';

interface MobileSerra25DProps {
  readonly reducedMotion?: boolean;
  readonly showExperimental3D?: boolean;
  readonly onOpenExperimental3D?: () => void;
}

interface VisiblePassage {
  readonly passage: SerraPassage;
  readonly passageIndex: number;
  readonly opacity: number;
  readonly progress: number;
}

interface DragState {
  readonly active: boolean;
  readonly pointerId: number | null;
  readonly y: number;
}

const PASSAGE_TRANSITION_PROGRESS = 0.045;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const smoothstep = (value: number): number => {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const getCurrentPassageIndex = (passages: readonly SerraPassage[], progress: number): number => {
  const foundIndex = passages.findIndex(
    (passage) => progress >= passage.progressStart && progress <= passage.progressEnd
  );

  return foundIndex >= 0 ? foundIndex : Math.max(0, passages.length - 1);
};

const getPassageProgress = (passage: SerraPassage, progress: number): number => {
  const range = Math.max(0.001, passage.progressEnd - passage.progressStart);
  return clamp((progress - passage.progressStart) / range, 0, 1);
};

const getVisiblePassages = (
  passages: readonly SerraPassage[],
  progress: number,
  currentPassageIndex: number,
  reducedMotion: boolean
): readonly VisiblePassage[] => {
  const currentPassage = passages[currentPassageIndex] ?? passages[0];

  if (!currentPassage || reducedMotion) {
    return currentPassage
      ? [
        {
          passage: currentPassage,
          passageIndex: currentPassageIndex,
          opacity: 1,
          progress: getPassageProgress(currentPassage, progress),
        },
      ]
      : [];
  }

  const visiblePassages: VisiblePassage[] = [];
  let currentOpacity = 1;
  const previousPassage = passages[currentPassageIndex - 1];
  const nextPassage = passages[currentPassageIndex + 1];
  const distanceFromStart = progress - currentPassage.progressStart;
  const distanceToEnd = currentPassage.progressEnd - progress;

  if (previousPassage && distanceFromStart < PASSAGE_TRANSITION_PROGRESS) {
    const blend = smoothstep(distanceFromStart / PASSAGE_TRANSITION_PROGRESS);
    currentOpacity = Math.min(currentOpacity, blend);
    visiblePassages.push({
      passage: previousPassage,
      passageIndex: currentPassageIndex - 1,
      opacity: 1 - blend,
      progress: getPassageProgress(previousPassage, progress),
    });
  }

  if (nextPassage && distanceToEnd < PASSAGE_TRANSITION_PROGRESS) {
    const blend = smoothstep(distanceToEnd / PASSAGE_TRANSITION_PROGRESS);
    currentOpacity = Math.min(currentOpacity, blend);
    visiblePassages.push({
      passage: nextPassage,
      passageIndex: currentPassageIndex + 1,
      opacity: 1 - blend,
      progress: getPassageProgress(nextPassage, progress),
    });
  }

  visiblePassages.push({
    passage: currentPassage,
    passageIndex: currentPassageIndex,
    opacity: currentOpacity,
    progress: getPassageProgress(currentPassage, progress),
  });

  return visiblePassages.sort((a, b) => a.passageIndex - b.passageIndex);
};

const getScrollableHeight = (): number => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 0;
  }

  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
};

export const MobileSerra25D = ({
  reducedMotion = false,
  showExperimental3D = false,
  onOpenExperimental3D,
}: MobileSerra25DProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const dragStateRef = useRef<DragState>({ active: false, pointerId: null, y: 0 });
  const [progress, setProgress] = useState<number>(0);
  const [isAutoTravelling, setIsAutoTravelling] = useState(false);
  const data = useCovidStore((state) => state.data);
  const dataLength = useCovidStore((state) => state.data.length);
  const setCurrentDateIndex = useCovidStore((state) => state.setCurrentDateIndex);

  const currentPassageIndex = useMemo(() => getCurrentPassageIndex(serraPassages, progress), [progress]);
  const currentPassage = serraPassages[currentPassageIndex] ?? serraPassages[0];
  const visiblePassages = useMemo(
    () => getVisiblePassages(serraPassages, progress, currentPassageIndex, reducedMotion),
    [currentPassageIndex, progress, reducedMotion]
  );
  const timelineIndex = useMemo(
    () => (data.length > 1 ? Math.round(progress * (data.length - 1)) : 0),
    [data.length, progress]
  );
  const timelinePoints = useMemo(() => getCovidEventTimelinePoints(data), [data]);
  const currentEvent = useMemo(() => getCovidEventForTimelineIndex(data, timelineIndex), [data, timelineIndex]);
  const currentEventDateLabel = useMemo(
    () => (currentEvent ? formatCovidEventDatePtBr(currentEvent.date) : ''),
    [currentEvent]
  );

  const syncProgress = useCallback((): void => {
    const scrollableHeight = getScrollableHeight();
    const nextProgress = scrollableHeight <= 0 ? 0 : window.scrollY / scrollableHeight;
    const clampedProgress = clamp(nextProgress, 0, 1);
    const diff = Math.abs(clampedProgress - progressRef.current);

    if (diff < 0.002 && clampedProgress !== 0 && clampedProgress !== 1) {
      return;
    }

    progressRef.current = clampedProgress;
    setProgress(clampedProgress);
  }, []);

  const seekToProgress = useCallback(
    (nextProgress: number): void => {
      const scrollableHeight = getScrollableHeight();
      window.scrollTo({
        top: scrollableHeight * clamp(nextProgress, 0, 1),
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [reducedMotion]
  );

  const stepThroughSerra = useCallback(
    (direction: 1 | -1): void => {
      const step = Math.max(window.innerHeight * 0.14, 72);
      window.scrollBy({
        top: step * direction,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [reducedMotion]
  );

  const seekToPassage = useCallback(
    (direction: 1 | -1): void => {
      const nextIndex = clamp(currentPassageIndex + direction, 0, serraPassages.length - 1);
      const nextPassage = serraPassages[nextIndex] ?? currentPassage;
      seekToProgress(nextPassage.progressStart + (nextPassage.progressEnd - nextPassage.progressStart) * 0.5);
    },
    [currentPassage, currentPassageIndex, seekToProgress]
  );

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('button, a, input, textarea, select')) {
      return;
    }

    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      y: event.clientY,
    };
    setIsAutoTravelling(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState.active || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaY = dragState.y - event.clientY;
    dragStateRef.current = {
      ...dragState,
      y: event.clientY,
    };
    window.scrollBy({ top: deltaY * 1.18, behavior: 'auto' });
  }, []);

  const handlePointerRelease = useCallback((event: PointerEvent<HTMLElement>): void => {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = { active: false, pointerId: null, y: 0 };

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    const onScroll = (): void => {
      if (animationFrameRef.current !== null) {
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        syncProgress();
      });
    };

    syncProgress();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('scroll', onScroll);
    };
  }, [syncProgress]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isKeyboardNavigationBlocked(event)) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
        stepThroughSerra(1);
      }

      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        stepThroughSerra(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [stepThroughSerra]);

  useEffect(() => {
    if (dataLength <= 1) {
      return;
    }

    setCurrentDateIndex(Math.round(progress * (dataLength - 1)));
  }, [dataLength, progress, setCurrentDateIndex]);

  useEffect(() => {
    const preloadPassages = serraPassages.slice(currentPassageIndex, currentPassageIndex + 2);
    preloadPassages.flatMap((passage) => passage.layers).forEach((layer) => {
      [layer.avifSrc, layer.src, layer.fallbackAvifSrc, layer.fallbackSrc]
        .filter((src): src is string => Boolean(src))
        .forEach((src) => {
          const image = new Image();
          image.decoding = 'async';
          image.src = src;
        });
    });
  }, [currentPassageIndex]);

  useEffect(() => {
    if (!isAutoTravelling || reducedMotion) {
      return undefined;
    }

    let frame = 0;
    let lastTimestamp = performance.now();

    const tick = (timestamp: number): void => {
      const scrollableHeight = getScrollableHeight();
      if (scrollableHeight <= 0 || window.scrollY >= scrollableHeight - 2) {
        setIsAutoTravelling(false);
        return;
      }

      const delta = clamp((timestamp - lastTimestamp) / 16.7, 0.25, 2);
      lastTimestamp = timestamp;
      window.scrollBy({ top: Math.max(10, window.innerHeight * 0.0065) * delta, behavior: 'auto' });
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isAutoTravelling, reducedMotion]);

  return (
    <main
      ref={rootRef}
      className="serra25d"
      data-reduced-motion={reducedMotion}
      data-passage={currentPassage.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
    >
      <section className="serra25d__stage" aria-label="Travessia 2.5D da Serra Sem Ar">
        <div className="serra25d__sky" aria-hidden="true" />
        <div className="serra25d__horizon" aria-hidden="true" />
        <div className="serra25d__ridge serra25d__ridge--far" aria-hidden="true" />
        <div className="serra25d__ridge serra25d__ridge--mid" aria-hidden="true" />
        <div className="serra25d__ridge serra25d__ridge--near" aria-hidden="true" />
        <div className="serra25d__aerial-perspective" aria-hidden="true" />

        {visiblePassages.map((visiblePassage) =>
          visiblePassage.passage.layers.map((layer, layerIndex) => (
            <PassageLayer
              key={`${visiblePassage.passage.id}-${layer.id}`}
              layer={layer}
              progress={visiblePassage.progress}
              passageOpacity={visiblePassage.opacity}
              reducedMotion={reducedMotion}
              eager={visiblePassage.passageIndex === 0 && layerIndex === 0}
            />
          ))
        )}

        <div className="serra25d__floor" aria-hidden="true" />
        <div className="serra25d__topography" aria-hidden="true" />
        <div className="serra25d__fog" aria-hidden="true" />

        <MobileTimeline
          points={timelinePoints}
          progress={progress}
          activeEventDate={currentEvent?.date ?? ''}
          onSeek={seekToProgress}
        />

        <div className="serra25d__nav" aria-label="Navegação da serra">
          <button type="button" onClick={() => stepThroughSerra(-1)} title="Subir na linha do tempo">
            <ChevronUp aria-hidden="true" />
            <span className="sr-only">Subir na linha do tempo</span>
          </button>
          <button type="button" onClick={() => stepThroughSerra(1)} title="Descer na linha do tempo">
            <ChevronDown aria-hidden="true" />
            <span className="sr-only">Descer na linha do tempo</span>
          </button>
        </div>

        <div className="serra25d__travel-controls" aria-label="Controles da travessia">
          <button type="button" onClick={() => seekToPassage(-1)} title="Passagem anterior">
            <SkipBack aria-hidden="true" />
            <span>Voltar</span>
          </button>
          <button
            type="button"
            className="serra25d__travel-primary"
            onClick={() => setIsAutoTravelling((current) => !current)}
            title={isAutoTravelling ? 'Pausar travessia' : 'Iniciar travessia'}
          >
            {isAutoTravelling ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{isAutoTravelling ? 'Pausar' : 'Auto'}</span>
          </button>
          <button type="button" onClick={() => seekToPassage(1)} title="Próxima passagem">
            <SkipForward aria-hidden="true" />
            <span>Avançar</span>
          </button>
        </div>

        <DataMemorialPanel
          passage={currentPassage}
          currentEvent={currentEvent}
          currentEventDateLabel={currentEventDateLabel}
          showExperimental3D={showExperimental3D}
          onOpenExperimental3D={onOpenExperimental3D}
        />
      </section>

      <div className="serra25d__scroll-space" aria-hidden="true" />
    </main>
  );
};
