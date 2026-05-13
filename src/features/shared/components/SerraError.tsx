import { AlertCircle } from 'lucide-react';

interface SerraErrorProps {
  readonly title?: string;
  readonly message: string;
}

export const SerraError = ({ title = 'Erro ao carregar dados', message }: SerraErrorProps) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-[#120806] px-5 text-center text-[#f2f2e8]">
    <AlertCircle className="mb-5 h-12 w-12 text-[#d9230f]" />
    <h2 className="text-2xl font-semibold">{title}</h2>
    <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">{message}</p>
  </div>
);
