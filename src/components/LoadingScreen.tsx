import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen = ({ message = 'Carregando dados da COVID-19...' }: LoadingScreenProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-blue-600 text-white">
      <div className="text-center space-y-6">
        <Loader2 className="w-16 h-16 animate-spin mx-auto" />
        <h2 className="text-2xl font-bold">SERRA SEM AR</h2>
        <p className="text-lg opacity-80">{message}</p>
        <div className="w-64 h-2 bg-blue-800 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

