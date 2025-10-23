import { AlertCircle } from 'lucide-react';
import './App.css';
import { ControlsHelp } from './components/ControlsHelp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InfoPanel } from './components/InfoPanel';
import { LoadingScreen } from './components/LoadingScreen';
import { Scene3D } from './components/Scene3D';
import { TimelineControls } from './components/TimelineControls';
import { useCovidData } from './hooks/useCovidData';
// import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useTemporalNavigation } from './hooks/useTemporalNavigation';
import { QueryProvider } from './providers/QueryProvider';
import { ActiveDayHUD } from './components/ActiveDayHUD';

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
    <div className="relative w-full h-screen overflow-hidden">
      {/* 3D Scene with Error Boundary */}
      <ErrorBoundary>
        <Scene3D enableControls showStats={false} />
      </ErrorBoundary>

      {/* Information Panel */}
      <InfoPanel />

      {/* Timeline HUD */}
      <ActiveDayHUD />

      {/* Controls Help */}
      <ControlsHelp />

      {/* Timeline Controls */}
      <TimelineControls />

      {/* Title and Description */}
      <div className="absolute top-4 right-20 bg-black/70 backdrop-blur-sm text-white p-6 rounded-lg max-w-md">
        <h1 className="text-2xl font-bold mb-2">SERRA SEM AR</h1>
        <p className="text-sm opacity-80 mb-4">
          Uma representação artística dos dados da COVID-19 no Brasil como uma montanha 3D navegável.
        </p>
        <div className="text-xs space-y-1 opacity-70">
          <p>• Clique na cena para capturar o cursor (ESC libera)</p>
          <p>• W/D avançam • S/A retornam • Mouse para olhar • Shift para correr</p>
          <p>• , / . ou [ / ] para navegar no tempo</p>
          <p>• Use a Timeline para reprodução automática</p>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-lg">
        <p className="text-sm text-center">
          Web Art • Dados: Our World in Data • Tecnologia: React + Three.js
        </p>
      </div>
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
