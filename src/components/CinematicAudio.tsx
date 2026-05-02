import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { covidEventsByDate } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';
import { Button } from './ui/button';

const AUDIO_SOURCES = {
  thunder: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Rain_and_thunder.ogg',
  crowd: 'https://upload.wikimedia.org/wikipedia/commons/5/54/Cafe_ambiance.ogg',
} as const;

type Runtime = {
  context: AudioContext;
  master: GainNode;
  movementTimer: number;
  highAltitudeTimer: number;
  windSource: AudioBufferSourceNode;
  teardown: () => void;
};

type WindowWithAudioFallback = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const createNoiseBuffer = (context: AudioContext, seconds: number, amplitude: number) => {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, sampleRate * seconds, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * amplitude;
  }

  return buffer;
};

const createLoopingMedia = (
  context: AudioContext,
  master: GainNode,
  url: string,
  gainValue: number,
  filterFrequency: number,
  pan: number
) => {
  const element = new Audio(url);
  element.crossOrigin = 'anonymous';
  element.loop = true;
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

const playFootstep = (context: AudioContext, destination: AudioNode, intensity: number) => {
  const startAt = context.currentTime;
  const stepTone = context.createOscillator();
  const stepGain = context.createGain();
  const filter = context.createBiquadFilter();

  stepTone.type = 'triangle';
  stepTone.frequency.setValueAtTime(72 + Math.random() * 28, startAt);
  filter.type = 'lowpass';
  filter.frequency.value = 190;

  stepGain.gain.setValueAtTime(0.0001, startAt);
  stepGain.gain.exponentialRampToValueAtTime(0.055 * intensity, startAt + 0.014);
  stepGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14);

  stepTone.connect(filter);
  filter.connect(stepGain);
  stepGain.connect(destination);
  stepTone.start(startAt);
  stepTone.stop(startAt + 0.16);
};

const playEventAccent = (context: AudioContext, destination: AudioNode) => {
  const startAt = context.currentTime;
  const lowTone = context.createOscillator();
  const highTone = context.createOscillator();
  const gain = context.createGain();

  lowTone.type = 'sine';
  highTone.type = 'triangle';
  lowTone.frequency.setValueAtTime(58, startAt);
  lowTone.frequency.exponentialRampToValueAtTime(34, startAt + 1.4);
  highTone.frequency.setValueAtTime(136, startAt);
  highTone.frequency.exponentialRampToValueAtTime(82, startAt + 0.9);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.45);

  lowTone.connect(gain);
  highTone.connect(gain);
  gain.connect(destination);
  lowTone.start(startAt);
  highTone.start(startAt);
  lowTone.stop(startAt + 1.5);
  highTone.stop(startAt + 1.05);
};

const playCough = (context: AudioContext, destination: AudioNode, intensity: number, panValue: number) => {
  const startAt = context.currentTime;
  const panner = context.createStereoPanner();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const noise = context.createBufferSource();

  noise.buffer = createNoiseBuffer(context, 0.42, 0.95);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(520 + intensity * 220, startAt);
  filter.Q.value = 1.8;
  panner.pan.value = panValue;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.11 * intensity, startAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.018 * intensity, startAt + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.08 * intensity, startAt + 0.19);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.36);

  noise.connect(filter);
  filter.connect(panner);
  panner.connect(gain);
  gain.connect(destination);
  noise.start(startAt);
  noise.stop(startAt + 0.42);
};

const playSneeze = (context: AudioContext, destination: AudioNode, intensity: number, panValue: number) => {
  const startAt = context.currentTime;
  const panner = context.createStereoPanner();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const noise = context.createBufferSource();

  noise.buffer = createNoiseBuffer(context, 0.65, 0.85);
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1050 + intensity * 650, startAt);
  filter.Q.value = 0.85;
  panner.pan.value = panValue;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.02 * intensity, startAt + 0.045);
  gain.gain.exponentialRampToValueAtTime(0.13 * intensity, startAt + 0.11);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.58);

  noise.connect(filter);
  filter.connect(panner);
  panner.connect(gain);
  gain.connect(destination);
  noise.start(startAt);
  noise.stop(startAt + 0.65);
};

const playAmbulanceSiren = (context: AudioContext, destination: AudioNode, intensity: number, panValue: number) => {
  const startAt = context.currentTime;
  const panner = context.createStereoPanner();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const siren = context.createOscillator();
  const overtone = context.createOscillator();

  siren.type = 'sine';
  overtone.type = 'triangle';
  filter.type = 'bandpass';
  filter.frequency.value = 1450;
  filter.Q.value = 2.2;
  panner.pan.setValueAtTime(panValue, startAt);
  panner.pan.linearRampToValueAtTime(-panValue * 0.65, startAt + 2.6);

  for (let i = 0; i < 5; i += 1) {
    const t = startAt + i * 0.48;
    const high = 940 + intensity * 180;
    const low = 620 + intensity * 120;
    siren.frequency.setValueAtTime(i % 2 === 0 ? high : low, t);
    siren.frequency.linearRampToValueAtTime(i % 2 === 0 ? low : high, t + 0.42);
    overtone.frequency.setValueAtTime((i % 2 === 0 ? high : low) * 1.52, t);
    overtone.frequency.linearRampToValueAtTime((i % 2 === 0 ? low : high) * 1.52, t + 0.42);
  }

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.095 * intensity, startAt + 0.18);
  gain.gain.setValueAtTime(0.095 * intensity, startAt + 1.9);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 2.8);

  siren.connect(filter);
  overtone.connect(filter);
  filter.connect(panner);
  panner.connect(gain);
  gain.connect(destination);
  siren.start(startAt);
  overtone.start(startAt);
  siren.stop(startAt + 2.9);
  overtone.stop(startAt + 2.9);
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

const dateToIso = (date: Date | undefined) => date?.toISOString().slice(0, 10) ?? '';

export const CinematicAudio = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const runtimeRef = useRef<Runtime | null>(null);
  const pressedKeysRef = useRef(new Set<string>());
  const mobileMoveInputRef = useRef<[number, number]>([0, 0]);
  const currentDateIndexRef = useRef(0);
  const cameraYRef = useRef(0);
  const mountainPointsRef = useRef<Array<{ y: number }>>([]);
  const lastStepAtRef = useRef(0);
  const lastHighAltitudeCueAtRef = useRef(0);
  const lastEventIndexRef = useRef<number | null>(null);
  const mobileMoveInput = useCovidStore((state) => state.mobileMoveInput);
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);

  useEffect(() => {
    mobileMoveInputRef.current = mobileMoveInput;
  }, [mobileMoveInput]);

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
      master.gain.value = 0.86;
      master.connect(context.destination);

      const thunder = createLoopingMedia(context, master, AUDIO_SOURCES.thunder, 0.16, 1700, -0.36);
      const crowd = createLoopingMedia(context, master, AUDIO_SOURCES.crowd, 0.055, 900, 0.32);

      const windSource = context.createBufferSource();
      const windFilter = context.createBiquadFilter();
      const windGain = context.createGain();
      windSource.buffer = createNoiseBuffer(context, 2, 0.22);
      windSource.loop = true;
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.42;
      windGain.gain.value = 0.032;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();

      await context.resume();
      void thunder.play().catch(() => undefined);
      void crowd.play().catch(() => undefined);

      const movementTimer = window.setInterval(() => {
        const runtime = runtimeRef.current;
        if (!runtime) return;

        const keys = pressedKeysRef.current;
        const keyboardMoving =
          keys.has('w') ||
          keys.has('a') ||
          keys.has('s') ||
          keys.has('d') ||
          keys.has('arrowup') ||
          keys.has('arrowdown') ||
          keys.has('arrowleft') ||
          keys.has('arrowright');
        const joystickMagnitude = Math.hypot(mobileMoveInputRef.current[0], mobileMoveInputRef.current[1]);
        if (!keyboardMoving && joystickMagnitude < 0.08) return;

        const now = runtime.context.currentTime;
        const isRunning = keys.has('shift');
        const interval = isRunning ? 0.28 : 0.43;
        if (now - lastStepAtRef.current < interval) return;

        lastStepAtRef.current = now;
        playFootstep(runtime.context, runtime.master, Math.max(0.65, Math.min(1, joystickMagnitude || 0.8)));
      }, 80);

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

        if (roll < 0.38) {
          playCough(runtime.context, runtime.master, cueIntensity, pan);
        } else if (roll < 0.68) {
          playSneeze(runtime.context, runtime.master, cueIntensity, -pan);
        } else {
          playAmbulanceSiren(runtime.context, runtime.master, cueIntensity, pan);
        }
      }, 950);

      const teardown = () => {
        window.clearInterval(movementTimer);
        window.clearInterval(highAltitudeTimer);
        thunder.pause();
        crowd.pause();
        thunder.removeAttribute('src');
        crowd.removeAttribute('src');
        thunder.load();
        crowd.load();
        try {
          windSource.stop();
        } catch {
          // Already stopped.
        }
        void context.close();
      };

      runtimeRef.current = {
        context,
        master,
        movementTimer,
        highAltitudeTimer,
        windSource,
        teardown,
      };

      setIsEnabled(true);
      playEventAccent(context, master);
    } catch {
      stopAudio();
    } finally {
      setIsBooting(false);
    }
  }, [isBooting, stopAudio]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      pressedKeysRef.current.add(event.key.toLowerCase());
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => stopAudio, [stopAudio]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !data.length) return;
    if (lastEventIndexRef.current === currentDateIndex) return;

    const isoDate = dateToIso(data[currentDateIndex]?.date);
    if (!covidEventsByDate.has(isoDate)) return;

    lastEventIndexRef.current = currentDateIndex;
    playEventAccent(runtime.context, runtime.master);
  }, [currentDateIndex, data]);

  return (
    <div className="pointer-events-auto absolute right-3 top-24 z-20 sm:right-4 sm:top-28 xl:top-40">
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
        <span className="text-xs uppercase tracking-[0.22em]">Som</span>
        <span className="sr-only">{isEnabled ? 'Desativar paisagem sonora' : 'Ativar paisagem sonora'}</span>
      </Button>
    </div>
  );
};
