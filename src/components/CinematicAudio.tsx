import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCovidStore } from '../stores/covidStore';
import { Button } from './ui/button';

const AUDIO_SOURCES = {
  thunder: '/pandemic-assets/audios/doente.mp3',
  crowd: '/pandemic-assets/audios/fora-bozo.mp3',
} as const;

const CUE_SAMPLE_SOURCES = {
  cough: '/pandemic-assets/audios/doente.mp3',
  sneeze: '/pandemic-assets/audios/coracao_hospital.mp3',
} as const;

type CueKey = keyof typeof CUE_SAMPLE_SOURCES;
type CueBuffers = Partial<Record<CueKey, AudioBuffer>>;

type Runtime = {
  context: AudioContext;
  master: GainNode;
  highAltitudeTimer: number;
  cueBuffers: CueBuffers;
  teardown: () => void;
};

type WindowWithAudioFallback = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

const createLoopingMedia = (
  context: AudioContext,
  master: GainNode,
  url: string,
  gainValue: number,
  filterFrequency: number,
  pan: number
) => {
  const element = new Audio(url);
  element.loop = true;
  element.setAttribute('playsinline', 'true');
  element.preload = 'metadata';

  const source = context.createMediaElementSource(element);
  const filter = context.createBiquadFilter();
  const panner = context.createStereoPanner();
  const gain = context.createGain();

  filter.type = 'lowpass';
  filter.frequency.value = filterFrequency;
  panner.pan.value = pan;
  gain.gain.value = gainValue;

  source.connect(filter);
  filter.connect(panner);
  panner.connect(gain);
  gain.connect(master);

  return element;
};

const loadAudioBuffer = async (context: AudioContext, url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load audio sample: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return context.decodeAudioData(arrayBuffer);
};

const playSpatialCueSample = (
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  intensity: number,
  panValue: number,
  options: { rateMin: number; rateMax: number; gain: number; maxDuration: number }
) => {
  const startAt = context.currentTime;
  const source = context.createBufferSource();
  const panner = context.createStereoPanner();
  const gain = context.createGain();

  source.buffer = buffer;
  source.playbackRate.value = lerp(options.rateMin, options.rateMax, Math.random());
  panner.pan.value = clamp(panValue, -1, 1);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(options.gain * intensity, startAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + options.maxDuration);

  source.connect(panner);
  panner.connect(gain);
  gain.connect(destination);

  const duration = Math.min(options.maxDuration + 0.04, Math.max(0.18, buffer.duration));
  const maxOffset = Math.max(0, buffer.duration - duration);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

  source.start(startAt, offset, duration);
  source.stop(startAt + duration + 0.02);
};

const getHighAltitudeIntensity = (
  mountainPoints: Array<{ y: number }>,
  currentDateIndex: number,
  cameraY: number
) => {
  if (!mountainPoints.length) return 0;
  const current = mountainPoints[Math.min(Math.max(currentDateIndex, 0), mountainPoints.length - 1)];
  if (!current) return 0;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of mountainPoints) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const range = Math.max(1, maxY - minY);
  const pathAltitude = (current.y - minY) / range;
  const cameraAltitude = (cameraY - minY) / range;
  const altitude = Math.max(pathAltitude, cameraAltitude * 0.75);
  if (altitude < 0.56) return 0;
  return Math.min(1, (altitude - 0.56) / 0.38);
};

export const CinematicAudio = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const runtimeRef = useRef<Runtime | null>(null);
  const currentDateIndexRef = useRef(0);
  const cameraYRef = useRef(0);
  const mountainPointsRef = useRef<Array<{ y: number }>>([]);
  const lastHighAltitudeCueAtRef = useRef(0);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);

  const cueBuffersRef = useRef<CueBuffers>({});

  useEffect(() => {
    currentDateIndexRef.current = currentDateIndex;
    cameraYRef.current = cameraPosition[1];
    mountainPointsRef.current = mountainPoints;
  }, [cameraPosition, currentDateIndex, mountainPoints]);

  const stopAudio = useCallback(() => {
    runtimeRef.current?.teardown();
    runtimeRef.current = null;
    setIsEnabled(false);
    setIsBooting(false);
  }, []);

  const startAudio = useCallback(async () => {
    if (runtimeRef.current || isBooting) return;

    setIsBooting(true);

    try {
      const AudioContextConstructor = window.AudioContext ?? (window as WindowWithAudioFallback).webkitAudioContext;
      if (!AudioContextConstructor) return;

      const context = new AudioContextConstructor();
      const master = context.createGain();
      master.gain.value = 0.56;
      master.connect(context.destination);

      const thunder = createLoopingMedia(context, master, AUDIO_SOURCES.thunder, 0.16, 1700, -0.36);
      const crowd = createLoopingMedia(context, master, AUDIO_SOURCES.crowd, 0.055, 900, 0.32);

      await context.resume();
      void thunder.play().catch(() => undefined);
      // void crowd.play().catch(() => undefined);

      void Promise.all(
        (Object.keys(CUE_SAMPLE_SOURCES) as CueKey[]).map(async (key) => {
          try {
            const buffer = await loadAudioBuffer(context, CUE_SAMPLE_SOURCES[key]);
            cueBuffersRef.current[key] = buffer;
          } catch {
            // Sem fallback sintetico: a paisagem sonora usa apenas arquivos de audios.
          }
        })
      );

      const highAltitudeTimer = window.setInterval(() => {
        const runtime = runtimeRef.current;
        if (!runtime) return;

        const intensity = getHighAltitudeIntensity(
          mountainPointsRef.current,
          currentDateIndexRef.current,
          cameraYRef.current
        );
        if (intensity <= 0) return;

        const now = runtime.context.currentTime;
        const cooldown = 7.5 - intensity * 3.2;
        if (now - lastHighAltitudeCueAtRef.current < cooldown) return;
        if (Math.random() > 0.28 + intensity * 0.42) return;

        lastHighAltitudeCueAtRef.current = now;
        const pan = Math.sin(now * 1.73) * 0.72;
        const cueIntensity = 0.58 + intensity * 0.72;
        const roll = Math.random();
        const coughSample = cueBuffersRef.current.cough;
        const sneezeSample = cueBuffersRef.current.sneeze;

        if (roll < 0.38) {
          if (coughSample) {
            playSpatialCueSample(runtime.context, runtime.master, coughSample, cueIntensity, pan, {
              rateMin: 0.9,
              rateMax: 1.05,
              gain: 0.1,
              maxDuration: 0.42,
            });
          }
        } else if (roll < 0.68) {
          if (sneezeSample) {
            playSpatialCueSample(runtime.context, runtime.master, sneezeSample, cueIntensity, -pan, {
              rateMin: 1.1,
              rateMax: 1.25,
              gain: 0.09,
              maxDuration: 0.36,
            });
          }
        }
      }, 950);

      const teardown = () => {
        window.clearInterval(highAltitudeTimer);
        thunder.pause();
        crowd.pause();
        thunder.removeAttribute('src');
        crowd.removeAttribute('src');
        thunder.load();
        crowd.load();
        void context.close();
        cueBuffersRef.current = {};
      };

      runtimeRef.current = {
        context,
        master,
        highAltitudeTimer,
        cueBuffers: cueBuffersRef.current,
        teardown,
      };

      setIsEnabled(true);
    } catch {
      stopAudio();
    } finally {
      setIsBooting(false);
    }
  }, [isBooting, stopAudio]);

  useEffect(() => {
    const fadeDown = () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.master.gain.setTargetAtTime(0.08, runtime.context.currentTime, 0.45);
    };

    const fadeBack = () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.master.gain.setTargetAtTime(0.56, runtime.context.currentTime, 0.9);
    };

    window.addEventListener('serra:oxygen-collapse', fadeDown);
    window.addEventListener('serra:oxygen-reset', fadeBack);
    return () => {
      window.removeEventListener('serra:oxygen-collapse', fadeDown);
      window.removeEventListener('serra:oxygen-reset', fadeBack);
    };
  }, []);

  useEffect(() => stopAudio, [stopAudio]);

  return (
    <div className="hud-audio-toggle pointer-events-auto absolute right-3 top-24 z-20 sm:right-4 sm:top-28 xl:top-40">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-pressed={isEnabled}
        title={isEnabled ? 'Desativar paisagem sonora' : 'Ativar paisagem sonora'}
        onClick={() => {
          if (isEnabled) {
            stopAudio();
            return;
          }
          void startAudio();
        }}
        className={cn(
          'h-10 rounded-full border-white/20 bg-black/75 px-3 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/10 sm:h-11',
          isEnabled && 'border-amber-300 bg-amber-500 text-black hover:bg-amber-400',
          isBooting && 'cursor-wait opacity-75'
        )}
      >
        {isEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        <span className="audio-toggle-label text-xs uppercase tracking-[0.22em]">Som</span>
        <span className="sr-only">{isEnabled ? 'Desativar paisagem sonora' : 'Ativar paisagem sonora'}</span>
      </Button>
    </div>
  );
};
