import { useCallback, useEffect, useRef } from 'react';
import { useCovidStore } from '../../stores/covidStore';
import { useOxygenStore } from '../../stores/oxygenStore';
import { Button } from '../ui/button';

type OxygenCollapseOverlayProps = {
  onResetComplete: () => void;
};

const RESET_DELAY_MS = 5_600;
const INITIAL_CAMERA_POSITION: [number, number, number] = [50, 30, 50];
const INITIAL_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

const dispatchAudioEvent = (name: 'serra:oxygen-collapse' | 'serra:oxygen-reset') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
};

export const OxygenCollapseOverlay = ({ onResetComplete }: OxygenCollapseOverlayProps) => {
  const shouldReset = useOxygenStore((state) => state.shouldReset);
  const collapseMessage = useOxygenStore((state) => state.collapseMessage);
  const clearCollapse = useOxygenStore((state) => state.clearCollapse);
  const completedRef = useRef(false);

  const completeReset = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;

    const covidStore = useCovidStore.getState();
    covidStore.setCurrentDateIndex(0);
    covidStore.setCameraPosition(INITIAL_CAMERA_POSITION);
    covidStore.setCameraTarget(INITIAL_CAMERA_TARGET);
    clearCollapse();
    dispatchAudioEvent('serra:oxygen-reset');
    onResetComplete();
  }, [clearCollapse, onResetComplete]);

  useEffect(() => {
    if (!shouldReset) {
      completedRef.current = false;
      return undefined;
    }

    dispatchAudioEvent('serra:oxygen-collapse');
    const timer = window.setTimeout(completeReset, RESET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [completeReset, shouldReset]);

  if (!shouldReset) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/88 px-6 text-white backdrop-blur-sm">
      <div className="max-w-md text-center">
        <p className="text-[11px] uppercase tracking-[0.36em] text-white/48">oxygen_depleted</p>
        <h2 className="mt-4 text-2xl font-light leading-tight text-white sm:text-3xl">
          A serra ficou sem ar.
        </h2>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/72 sm:text-base">
          {collapseMessage ?? 'Sua presença foi removida da paisagem. A montanha continuou.'}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/54">
          Um corpo a menos no grafico. Uma marca a mais na montanha.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={completeReset}
          className="mt-7 border-white/24 bg-white/8 px-5 text-white hover:bg-white/14"
        >
          respirar novamente
        </Button>
      </div>
    </div>
  );
};

export default OxygenCollapseOverlay;

