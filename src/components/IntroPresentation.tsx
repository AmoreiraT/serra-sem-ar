import { Activity, CalendarDays, Mountain, Play, Skull } from 'lucide-react';
import { useMemo } from 'react';
import capaUrl from '../assets/jpg/docs/capa.png';
import { useCovidStore } from '../stores/covidStore';
import { Button } from './ui/button';

interface IntroPresentationProps {
  onEnter: () => void;
}

export const IntroPresentation = ({ onEnter }: IntroPresentationProps) => {
  const data = useCovidStore((state) => state.data);

  const summary = useMemo(() => {
    const first = data[0]?.date;
    const last = data[data.length - 1]?.date;
    const totalCases = data.reduce((sum, item) => sum + item.cases, 0);
    const totalDeaths = data.reduce((sum, item) => sum + item.deaths, 0);

    return {
      dateRange:
        first && last
          ? `${first.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })} - ${last.toLocaleDateString(
              'pt-BR',
              { month: 'short', year: 'numeric' }
            )}`
          : 'Linha do tempo',
      days: data.length,
      totalCases,
      totalDeaths,
    };
  }, [data]);

  return (
    <main className="intro-presentation relative min-h-screen overflow-hidden bg-[#120d0a] text-white">
      <img
        src={capaUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-45"
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,6,5,0.96)_0%,rgba(8,6,5,0.78)_42%,rgba(8,6,5,0.28)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#120d0a] to-transparent" />

      <section className="relative z-10 flex min-h-screen items-end px-5 py-7 sm:px-8 sm:py-10 lg:items-center lg:px-14">
        <div className="w-full max-w-5xl">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-black/35 px-3 py-1.5 text-[11px] uppercase tracking-[0.28em] text-amber-200 backdrop-blur-md">
              <Mountain className="h-3.5 w-3.5" />
              Web art generativa
            </div>
            <h1 className="max-w-2xl text-[clamp(3rem,8vw,7.4rem)] font-semibold leading-[0.88] text-white">
              Serra Sem Ar
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/78 sm:text-lg">
              Uma travessia pela paisagem da COVID-19 no Brasil, onde largura, altura e distância transformam dados
              em corpo, memória e tempo.
            </p>
          </div>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-2.5 sm:grid-cols-4">
            <IntroMetric icon={CalendarDays} label="Período" value={summary.dateRange} />
            <IntroMetric icon={Activity} label="Dias" value={summary.days.toLocaleString('pt-BR')} />
            <IntroMetric icon={Activity} label="Casos" value={summary.totalCases.toLocaleString('pt-BR')} />
            <IntroMetric icon={Skull} label="Mortes" value={summary.totalDeaths.toLocaleString('pt-BR')} />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              onClick={onEnter}
              className="h-12 w-full rounded-lg bg-amber-400 px-6 text-sm font-semibold text-black shadow-2xl shadow-black/30 hover:bg-amber-300 sm:w-auto"
            >
              <Play className="h-4 w-4" />
              Entrar na serra
            </Button>
            <p className="max-w-sm text-xs leading-relaxed text-white/55">
              Dados historicos do Ministerio da Saude atravessados por registros, memoriais e fragmentos visuais.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

const IntroMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) => (
  <div className="min-h-[88px] rounded-lg border border-white/12 bg-black/42 p-3 text-white shadow-xl backdrop-blur-md">
    <div className="mb-3 flex items-center gap-2 text-amber-200/90">
      <Icon className="h-4 w-4" />
      <span className="text-[10px] uppercase tracking-[0.22em]">{label}</span>
    </div>
    <p className="text-sm font-semibold leading-snug text-white sm:text-base">{value}</p>
  </div>
);

export default IntroPresentation;
