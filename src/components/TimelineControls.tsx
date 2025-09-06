import { Slider } from '@/components/ui/slider';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCovidStore } from '../stores/covidStore';
import { Button } from './ui/button';

export const TimelineControls = () => {
  const {
    data,
    currentDateIndex,
    setCurrentDateIndex
  } = useCovidStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(100); // milliseconds per day

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || data.length === 0) return;

    const interval = setInterval(() => {
      if (currentDateIndex >= data.length - 1) {
        setIsPlaying(false);
        setCurrentDateIndex(0); // Reset to beginning
      } else {
        setCurrentDateIndex(currentDateIndex + 1);
      }
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, data.length, setCurrentDateIndex]);

  const handlePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentDateIndex(0);
  };

  const handlePrevious = () => {
    setIsPlaying(false);
    setCurrentDateIndex(Math.max(0, currentDateIndex - 1));
  };

  const handleNext = () => {
    setIsPlaying(false);
    setCurrentDateIndex(Math.min(data.length - 1, currentDateIndex + 1));
  };

  const handleSliderChange = (value: number[]) => {
    setIsPlaying(false);
    setCurrentDateIndex(value[0]);
  };

  const currentDate = data[currentDateIndex]?.date;
  const progress = data.length > 0 ? (currentDateIndex / (data.length - 1)) * 100 : 0;

  if (data.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white p-4 rounded-lg min-w-96">
      <div className="space-y-4">
        {/* Current Date Display */}
        <div className="text-center">
          <p className="text-sm opacity-80">Data Atual</p>
          <p className="text-lg font-semibold">
            {currentDate?.toLocaleDateString('pt-BR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>

        {/* Timeline Slider */}
        <div className="space-y-2">
          <Slider
            value={[currentDateIndex]}
            onValueChange={handleSliderChange}
            max={data.length - 1}
            min={0}
            step={1}
            className="w-full" defaultValue={undefined} />
          <div className="flex justify-between text-xs opacity-60">
            <span>{data[0]?.date.toLocaleDateString('pt-BR')}</span>
            <span>{progress.toFixed(1)}%</span>
            <span>{data[data.length - 1]?.date.toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="bg-transparent border-white/30 text-white hover:bg-white/10"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentDateIndex === 0}
            className="bg-transparent border-white/30 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePlay}
            className="bg-transparent border-white/30 text-white hover:bg-white/10"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentDateIndex === data.length - 1}
            className="bg-transparent border-white/30 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Playback Speed Control */}
        <div className="space-y-2">
          <p className="text-xs opacity-80 text-center">Velocidade de Reprodução</p>
          <Slider
            value={[500 - playbackSpeed]}
            onValueChange={(value: number[]) => setPlaybackSpeed(500 - value[0])}
            max={450}
            min={50}
            step={50}
            className="w-full" defaultValue={undefined} />
          <div className="flex justify-between text-xs opacity-60">
            <span>Lento</span>
            <span>Rápido</span>
          </div>
        </div>
      </div>
    </div>
  );
};

