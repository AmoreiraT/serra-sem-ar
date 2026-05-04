import { cn } from '@/lib/utils';
import { useOxygenStore } from '../../stores/oxygenStore';

const toneByStatus = {
  stable: 'bg-cyan-200',
  critical: 'bg-amber-300',
  collapsed: 'bg-red-300',
} as const;

export const OxygenBar = () => {
  const oxygen = useOxygenStore((state) => state.oxygen);
  const status = useOxygenStore((state) => state.status);
  const isOfflineFallback = useOxygenStore((state) => state.isOfflineFallback);
  const width = `${Math.max(0, Math.min(100, oxygen))}%`;

  return (
    <div className="pointer-events-none absolute left-3 top-[5.2rem] z-20 w-[min(72vw,280px)] sm:left-4 sm:top-24 xl:top-32">
      <div className="rounded-md border border-white/15 bg-black/62 px-3 py-2 text-white shadow-xl backdrop-blur-md">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.26em] text-white/68">Oxigenio</span>
          <span className="text-[11px] tabular-nums text-white/78">
            {Math.round(oxygen)}%
            {isOfflineFallback ? ' local' : ''}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/12"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(oxygen)}
        >
          <div
            className={cn('h-full rounded-full transition-[width,background-color] duration-700', toneByStatus[status])}
            style={{ width }}
          />
        </div>
      </div>
    </div>
  );
};

export default OxygenBar;

