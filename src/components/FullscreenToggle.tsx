import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const getFullscreenElement = (): Element | null => {
  if (typeof document === 'undefined') return null;
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
};

const getFullscreenEnabled = (): boolean => {
  if (typeof document === 'undefined') return false;
  const fullscreenElement = document.documentElement as FullscreenElement;
  return Boolean(document.fullscreenEnabled || fullscreenElement.requestFullscreen || fullscreenElement.webkitRequestFullscreen);
};

const requestFullscreen = async () => {
  const fullscreenElement = document.documentElement as FullscreenElement;
  if (fullscreenElement.requestFullscreen) {
    await fullscreenElement.requestFullscreen({ navigationUI: 'hide' });
    return;
  }
  await fullscreenElement.webkitRequestFullscreen?.();
};

const exitFullscreen = async () => {
  const fullscreenDocument = document as FullscreenDocument;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  await fullscreenDocument.webkitExitFullscreen?.();
};

export const FullscreenToggle = ({ className }: { className?: string }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const sync = () => {
      setIsAvailable(getFullscreenEnabled());
      setIsFullscreen(Boolean(getFullscreenElement()));
    };

    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!isAvailable) return;
    void (isFullscreen ? exitFullscreen() : requestFullscreen()).catch(() => undefined);
  }, [isAvailable, isFullscreen]);

  const label = isFullscreen ? 'Sair da tela cheia' : 'Tela cheia';
  const Icon = isFullscreen ? Minimize2 : Maximize2;

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      disabled={!isAvailable}
      aria-pressed={isFullscreen}
      title={isAvailable ? label : 'Tela cheia indisponivel neste navegador'}
      onClick={toggleFullscreen}
      className={cn(
        'h-9 w-9 rounded-full border border-white/20 bg-black/75 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45',
        isFullscreen && 'border-amber-300 bg-amber-500 text-black hover:bg-amber-400',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
};

export default FullscreenToggle;
