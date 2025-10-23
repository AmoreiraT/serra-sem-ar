import { useEffect, useMemo, useState } from 'react';
import { useCovidStore } from '../stores/covidStore';

export const ActiveDayHUD = () => {
  const data = useCovidStore((state) => state.data);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const handlePointerLockChange = () => {
      setLocked(!!document.pointerLockElement);
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    handlePointerLockChange();

    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  const current = useMemo(() => {
    if (!data.length || currentDateIndex < 0 || currentDateIndex >= data.length) {
      return null;
    }
    const item = data[currentDateIndex];
    return {
      date: item.date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      cases: item.cases.toLocaleString('pt-BR'),
      deaths: item.deaths.toLocaleString('pt-BR'),
    };
  }, [data, currentDateIndex]);

  if (!current) return null;

  return (
    <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 text-white text-sm">
      <div
        className={`flex items-center gap-4 rounded-full px-5 py-2 border border-white/30 shadow-lg backdrop-blur ${
          locked ? 'bg-white/15' : 'bg-black/70'
        }`}
      >
        <span className="uppercase tracking-[0.3em] text-xs text-white/80">Linha do Tempo</span>
        <span className="font-semibold text-white">
          Dia {currentDateIndex + 1} / {data.length}
        </span>
        <span className="font-mono text-xs text-amber-300">{current.date}</span>
        <span className="text-xs text-orange-200">Casos: {current.cases}</span>
        <span className="text-xs text-red-300">Mortes: {current.deaths}</span>
      </div>
    </div>
  );
};

export default ActiveDayHUD;
