import { AlertCircle } from 'lucide-react';
import './App.css';
import { ControlsHelp } from './components/ControlsHelp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EventCard } from './components/EventCard';
import { InfoPanel } from './components/InfoPanel';
import { LoadingScreen } from './components/LoadingScreen';
import { Scene3D } from './components/Scene3D';
import { TimelineControls } from './components/TimelineControls';
import { useCovidData } from './hooks/useCovidData';
// import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useTemporalNavigation } from './hooks/useTemporalNavigation';
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
    <div className="relative flex h-screen w-full flex-col overflow-hidden">
      <header className="z-10 flex flex-wrap items-center justify-between gap-3 bg-black/70 px-4 py-2 text-white backdrop-blur-md sm:gap-4 sm:px-6 sm:py-3">
        <InfoPanel variant="compact" />
        <ControlsHelp variant="header" />
      </header>
      {/* 3D Scene with Error Boundary */}
      <ErrorBoundary>
        <div className="relative flex-1">
          <Scene3D enableControls showStats={false} />
          <EventCard />
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
      <AppContent />
    </QueryProvider>
  );
}

export default App;
