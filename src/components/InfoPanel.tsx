import { Calendar, Skull, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useCovidStore } from '../stores/covidStore';

interface InfoPanelProps {
  variant?: 'floating' | 'compact' | 'mini';
}

export const InfoPanel = ({ variant = 'floating' }: InfoPanelProps = {}) => {
  const data = useCovidStore((state) => state.data);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);

  const currentData = useMemo(() => {
    if (data.length === 0 || currentDateIndex >= data.length) return null;
    return data[currentDateIndex];
  }, [data, currentDateIndex]);

  const totalStats = useMemo(() => {
    if (data.length === 0) return { totalCases: 0, totalDeaths: 0 };

    const totalCases = data.reduce((sum, item) => sum + item.cases, 0);
    const totalDeaths = data.reduce((sum, item) => sum + item.deaths, 0);

    return { totalCases, totalDeaths };
  }, [data]);

  if (!currentData) return null;

  if (variant === 'mini') {
    return (
      <div className="flex min-w-0 flex-col">
        <span className="text-[10px] uppercase tracking-[0.32em] text-amber-200">Serra Sem Ar</span>
        <span className="text-[12px] text-white/70">
          {currentData.date.toLocaleDateString('pt-BR')}
        </span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex w-full flex-wrap items-center gap-4 rounded-xl border border-white/20 bg-black/80 px-4 py-3 text-white backdrop-blur-md shadow-lg sm:px-5">
        <div className="flex max-w-xs flex-col gap-1">
          <span className="text-[13px] uppercase tracking-[0.32em] text-amber-200 sm:text-[14px]">Serra Sem Ar</span>
          <span className="text-[12px] leading-relaxed text-white/75 sm:text-[11px]">
            Serra generativa da COVID-19 no Brasil. Onde largura é o número de casos e altura é o número de mortes e a distância representa o tempo.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[11px] sm:text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-300" />
            <div className="flex flex-col">
              <span className="uppercase text-[9px] tracking-[0.26em] text-white/60 sm:text-[10px]">Data</span>
              <span className="text-[13px] font-semibold sm:text-sm">
                {currentData.date.toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-300" />
            <div className="flex flex-col">
              <span className="uppercase text-[9px] tracking-[0.26em] text-white/60 sm:text-[10px]">Casos (dia)</span>
              <span className="text-[13px] font-semibold text-orange-300 sm:text-sm">
                {currentData.cases.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skull className="h-4 w-4 text-red-300" />
            <div className="flex flex-col">
              <span className="uppercase text-[9px] tracking-[0.26em] text-white/60 sm:text-[10px]">Mortes (dia)</span>
              <span className="text-[13px] font-semibold text-red-300 sm:text-sm">
                {currentData.deaths.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col text-[9px] tracking-[0.22em] text-white/60 sm:text-[10px]">
              <span>Total Casos</span>
              <span className="text-[13px] font-semibold text-orange-200 sm:text-sm">
                {totalStats.totalCases.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col text-[9px] tracking-[0.22em] text-white/60 sm:text-[10px]">
              <span>Total Mortes</span>
              <span className="text-[13px] font-semibold text-red-200 sm:text-sm">
                {totalStats.totalDeaths.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-4 top-4 w-55 max-w-sm rounded-xl border border-white/15 bg-black/85 p-6 text-white shadow-xl backdrop-blur-sm">
      <h3 className="mb-4 text-center text-2xl font-bold">SERRA SEM AR</h3>
      <div className="space-y-4">
        <p className="mb-4 text-sm leading-relaxed text-white/80">
          Uma representação artística dos dados da COVID-19 no Brasil como uma serra generativa com interações.
        </p>
        <div className="flex items-center space-x-3">
          <Calendar className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-sm opacity-80">Data Atual</p>
            <p className="font-semibold">{currentData.date.toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <TrendingUp className="h-5 w-5 text-orange-400" />
          <div>
            <p className="text-sm opacity-80">Novos Casos</p>
            <p className="font-semibold text-orange-400">
              {currentData.cases.toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Skull className="h-5 w-5 text-red-400" />
          <div>
            <p className="text-sm opacity-80">Novas Mortes</p>
            <p className="font-semibold text-red-400">
              {currentData.deaths.toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="mt-4 border-t border-white/20 pt-4">
          <p className="mb-2 text-sm opacity-80">Totais Acumulados</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="opacity-80">Casos</p>
              <p className="font-semibold text-orange-400">
                {totalStats.totalCases.toLocaleString('pt-BR')}
              </p>
            </div>
            <div>
              <p className="opacity-80">Mortes</p>
              <p className="font-semibold text-red-400">
                {totalStats.totalDeaths.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-white/20 pt-4">
        <p className="mb-2 text-sm font-semibold">Legenda da Montanha</p>
        <div className="space-y-1 text-xs">
          <p>
            <span className="text-orange-400">●</span> Largura = Casos
          </p>
          <p>
            <span className="text-red-400">●</span> Altura = Mortes
          </p>
          <p>
            <span className="text-blue-400">●</span> Distância = Tempo
          </p>
        </div>
      </div>
    </div>
  );
};
