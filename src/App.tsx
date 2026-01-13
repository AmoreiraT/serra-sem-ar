import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bell, Pin, X } from 'lucide-react';
import { useState } from 'react';
import './App.css';
import { ControlsHelp } from './components/ControlsHelp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EventCard } from './components/EventCard';
import { InfoPanel } from './components/InfoPanel';
import { LoadingScreen } from './components/LoadingScreen';
import { MemorialPanel } from './components/MemorialPanel';
import { Scene3D } from './components/Scene3D';
import { TimelineControls } from './components/TimelineControls';
import { Button } from './components/ui/button';
import { cn } from '@/lib/utils';
import { useCovidData } from './hooks/useCovidData';
// import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useTemporalNavigation } from './hooks/useTemporalNavigation';
import { AuthProvider } from './providers/AuthProvider';
import { QueryProvider } from './providers/QueryProvider';

function AppContent() {
  const { isLoading, error } = useCovidData();
  const [mobilePanel, setMobilePanel] = useState<'event' | 'memorial' | null>(null);

  // Movement now handled by Player (PointerLockControls)
  // Temporal navigation via keyboard (comma/period or [ / ])
  useTemporalNavigation();
  const toggleMobilePanel = (panel: 'event' | 'memorial') => {
    setMobilePanel((current) => (current === panel ? null : panel));
  };
  const closeMobilePanel = () => setMobilePanel(null);

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
          <div className="hidden sm:block">
            <EventCard />
          </div>
          <div className="hidden sm:block">
            <MemorialPanel />
          </div>
          <div className="md:hidden">
            <TimelineControls />
          </div>
          <div
            className="sm:hidden absolute bottom-28 right-4 z-20 flex flex-col gap-2"
            style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <Button
              size="icon"
              variant="outline"
              aria-pressed={mobilePanel === 'event'}
              onClick={() => toggleMobilePanel('event')}
              title="Registro histórico"
              className={cn(
                'h-11 w-11 rounded-full border border-white/20 bg-black/75 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/10',
                mobilePanel === 'event' && 'border-amber-300 bg-amber-500 text-black hover:bg-amber-400'
              )}
            >
              <Bell className="h-4 w-4" />
              <span className="sr-only">Registro histórico</span>
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-pressed={mobilePanel === 'memorial'}
              onClick={() => toggleMobilePanel('memorial')}
              title="Memorial"
              className={cn(
                'h-11 w-11 rounded-full border border-white/20 bg-black/75 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/10',
                mobilePanel === 'memorial' && 'border-amber-300 bg-amber-500 text-black hover:bg-amber-400'
              )}
            >
              <Pin className="h-4 w-4" />
              <span className="sr-only">Memorial</span>
            </Button>
          </div>
          <AnimatePresence>
            {mobilePanel && (
              <motion.div
                className="sm:hidden fixed inset-0 z-30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <button
                  type="button"
                  aria-label="Fechar painel"
                  onClick={closeMobilePanel}
                  className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                />
                <motion.div
                  className="absolute inset-x-0 bottom-0 px-4 pb-5"
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
                >
                  <div className="flex justify-end pb-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={closeMobilePanel}
                      className="h-9 w-9 rounded-full border-white/20 bg-black/80 text-white shadow-lg hover:bg-white/10"
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Fechar painel</span>
                    </Button>
                  </div>
                  {mobilePanel === 'event' ? (
                    <EventCard layout="sheet" />
                  ) : (
                    <MemorialPanel layout="sheet" />
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
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
