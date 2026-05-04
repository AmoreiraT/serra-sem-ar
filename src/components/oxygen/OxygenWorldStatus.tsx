import { cn } from '@/lib/utils';
import { useOxygenStore } from '../../stores/oxygenStore';

const labelByStatus = {
  stable: 'ar compartilhado',
  critical: 'ar rarefeito',
  collapsed: 'colapso de ar',
} as const;

const dotByStatus = {
  stable: 'bg-cyan-200',
  critical: 'bg-amber-300',
  collapsed: 'bg-red-300',
} as const;

export const OxygenWorldStatus = () => {
  const status = useOxygenStore((state) => state.status);
  const collectiveOxygen = useOxygenStore((state) => state.collectiveOxygen);

  return (
    <div className="hud-oxygen-status pointer-events-none absolute left-3 top-[8.75rem] z-20 sm:left-4 sm:top-[8.4rem] xl:top-[10.4rem]">
      <div className="inline-flex max-w-[78vw] items-center gap-2 rounded-md border border-white/12 bg-black/55 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-white/72 shadow-lg backdrop-blur-md">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotByStatus[status])} />
        <span>{labelByStatus[status]}</span>
        <span className="tabular-nums text-white/48">{Math.round(collectiveOxygen)}%</span>
      </div>
    </div>
  );
};

export default OxygenWorldStatus;
