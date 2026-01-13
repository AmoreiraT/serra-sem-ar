import { AlertCircle } from 'lucide-react';
import './App.css';
import { ControlsHelp } from './components/ControlsHelp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EventCard } from './components/EventCard';
import { InfoPanel } from './components/InfoPanel';
import { LoadingScreen } from './components/LoadingScreen';
import { MemorialPanel } from './components/MemorialPanel';
import { Scene3D } from './components/Scene3D';
import { TimelineControls } from './components/TimelineControls';
import { useCovidData } from './hooks/useCovidData';
// import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useTemporalNavigation } from './hooks/useTemporalNavigation';
import { AuthProvider } from './providers/AuthProvider';
import { QueryProvider } from './providers/QueryProvider';

function AppContent() {
  const { isLoading, error } = useCovidData();

  // Movement now handled by Player (PointerLockControls)
  // Temporal navigation via keyboard (comma/period or [ / ])
  useTemporalNavigation();

  if (isLoading) {
    return <LoadingScreen message="Carregando dados da COVID-19 no Brasil..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-red-900 to-red-600 text-white">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-red-300" />
          <h2 className="text-2xl font-bold">Erro ao Carregar Dados</h2>
          <p className="text-lg opacity-80">
            Não foi possível carregar os dados da COVID-19.
          </p>
          <p className="text-sm opacity-60">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-b-2xl bg-black/55 px-4 py-2 text-white shadow-xl backdrop-blur-md ring-1 ring-white/10 sm:gap-4 sm:px-6 sm:py-3">
          <InfoPanel variant="compact" />
          <ControlsHelp variant="header" />
        </div>
      </header>
      {/* 3D Scene with Error Boundary */}
      <ErrorBoundary>
        <div className="relative h-full">
          <Scene3D enableControls showStats={false} />
          <EventCard />
          <MemorialPanel />
          <div className="md:hidden">
            <TimelineControls />
          </div>
          {/* Footer */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 transform rounded-lg bg-black/70 px-3 py-2 text-white backdrop-blur-sm sm:px-4">
            <p className="text-xs text-center sm:text-sm">
              Web Art • AmoreiraT • Three.js - saude.gov.br
            </p>
          </div>
        </div>
      </ErrorBoundary>

    </div>
  );
}

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
