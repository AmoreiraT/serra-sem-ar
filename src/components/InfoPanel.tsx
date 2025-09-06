import { Calendar, Skull, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useCovidStore } from '../stores/covidStore';

export const InfoPanel = () => {
  const { data, currentDateIndex, mountainPoints } = useCovidStore();

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

  return (
    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white p-6 rounded-lg max-w-sm">
      <h3 className="text-xl font-bold mb-4 text-center">SERRA SEM AR</h3>

      <div className="space-y-4">
        {/* Current Date */}
        <div className="flex items-center space-x-3">
          <Calendar className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-sm opacity-80">Data Atual</p>
            <p className="font-semibold">
              {currentData.date.toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Daily Cases */}
        <div className="flex items-center space-x-3">
          <TrendingUp className="w-5 h-5 text-orange-400" />
          <div>
            <p className="text-sm opacity-80">Novos Casos</p>
            <p className="font-semibold text-orange-400">
              {currentData.cases.toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Daily Deaths */}
        <div className="flex items-center space-x-3">
          <Skull className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-sm opacity-80">Novas Mortes</p>
            <p className="font-semibold text-red-400">
              {currentData.deaths.toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Totals */}
        <div className="border-t border-white/20 pt-4 mt-4">
          <p className="text-sm opacity-80 mb-2">Totais Acumulados</p>
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

      {/* Legend */}
      <div className="border-t border-white/20 pt-4 mt-4">
        <p className="text-sm font-semibold mb-2">Legenda da Montanha</p>
        <div className="space-y-1 text-xs">
          <p><span className="text-orange-400">●</span> Largura = Casos</p>
          <p><span className="text-red-400">●</span> Altura = Mortes</p>
          <p><span className="text-blue-400">●</span> Distância = Tempo</p>
        </div>
      </div>
    </div>
  );
};

