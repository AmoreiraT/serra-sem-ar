import { Loader2 } from 'lucide-react';

interface SerraLoadingProps {
  readonly message?: string;
}

export const SerraLoading = ({ message = 'Carregando dados da COVID-19 no Brasil...' }: SerraLoadingProps) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-5 text-center text-[#f2f2e8]">
    <Loader2 className="mb-5 h-10 w-10 animate-spin text-[#f2c94c]" />
    <h2 className="text-2xl font-semibold uppercase">Serra Sem Ar</h2>
    <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">{message}</p>
  </div>
);
