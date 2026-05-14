import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCovidStore } from '../stores/covidStore';
import { useOxygenStore } from '../stores/oxygenStore';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import { useRemotePresenceStore, type RemotePresenceAudioEntry } from '../stores/remotePresenceStore';
import { Button } from './ui/button';

const CUE_SAMPLE_SOURCES = {
  cough: '/pandemic-assets/audios/doente.mp3',
} as const;

const PRESENCE_SAMPLE_SOURCES = {
  breath: '/pandemic-assets/audios/respira.mp3',
} as const;

type CueKey = keyof typeof CUE_SAMPLE_SOURCES;
type CueBuffers = Partial<Record<CueKey, AudioBuffer>>;

type Runtime = {
  context: AudioContext;
  master: GainNode;
  highAltitudeTimer: number;
  presenceBreathTimer: number;
  breathBuffer: AudioBuffer;
  cueBuffers: CueBuffers;
  teardown: () => void;
};

type WindowWithAudioFallback = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

type PresenceAudioConfig = {
  maxPeers: number;
  staleMs: number;
  nearRadius: number;
  fullRadius: number;
};

type NearbyPresenceSignal = {
  intensity: number;
  pan: number;
  distance: number;
  nearbyCount: number;
  updatedAt: number;
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

const createBreathNoiseBuffer = (context: AudioContext) => {
  const duration = 1.55;
  const frameCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  let filtered = 0;

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / Math.max(1, frameCount - 1);
    const envelope = Math.sin(Math.PI * t);
    filtered = filtered * 0.86 + (Math.random() * 2 - 1) * 0.14;
    data[i] = filtered * envelope;
  }

  return buffer;
};

const playPresenceBreath = (
  context: AudioContext,
  destination: AudioNode,
  breathBuffer: AudioBuffer,
  signal: NearbyPresenceSignal
) => {
  const intensity = clamp(signal.intensity, 0, 1);
  if (intensity <= 0.02) return;

  const startAt = context.currentTime;
  const source = context.createBufferSource();
  const lowpass = context.createBiquadFilter();
  const body = context.createBiquadFilter();
  const panner = context.createStereoPanner();
  const gain = context.createGain();
  const duration = Math.min(breathBuffer.duration, lerp(1.05, 2.35, intensity));

  source.buffer = breathBuffer;
  source.playbackRate.value = lerp(0.78, 1.06, Math.random());
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(lerp(720, 1850, intensity), startAt);
  lowpass.Q.value = 0.8;
  body.type = 'peaking';
  body.frequency.value = lerp(180, 260, intensity);
  body.Q.value = 0.9;
  body.gain.value = lerp(3.2, 7.5, intensity);
  panner.pan.value = clamp(signal.pan, -0.9, 0.9);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(lerp(0.035, 0.28, intensity), startAt + 0.12);
  gain.gain.setTargetAtTime(0.0001, startAt + duration * 0.55, 0.28);

  source.connect(lowpass);
  lowpass.connect(body);
  body.connect(panner);
  panner.connect(gain);
  gain.connect(destination);

  const maxOffset = Math.max(0, breathBuffer.duration - duration);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

  source.start(startAt, offset, duration);
  source.stop(startAt + duration + 0.04);
};

const computeNearbyPresenceSignal = (
  entries: RemotePresenceAudioEntry[],
  ownSessionId: string | null,
  cameraPosition: [number, number, number],
  config: PresenceAudioConfig
): NearbyPresenceSignal => {
  let nearestDistance = Infinity;
  let nearestDz = 0;
  let weightedPan = 0;
  let falloffSum = 0;
  let strongestFalloff = 0;
  let nearbyCount = 0;
  const now = Date.now();
  const maxPeers = Math.max(0, Math.floor(config.maxPeers));
  if (!maxPeers) return { intensity: 0, pan: 0, distance: Infinity, nearbyCount: 0, updatedAt: now };

  const candidates = entries
    .filter((entry) => entry.sessionId !== ownSessionId && !entry.sessionId.startsWith('local_'))
    .filter((entry) => now - entry.lastSeenAt <= config.staleMs)
    .map((entry) => {
      const dx = entry.position.x - cameraPosition[0];
      const dy = (entry.position.y - cameraPosition[1]) * 0.35;
      const dz = entry.position.z - cameraPosition[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return { entry, distance, dz };
    })
    .filter((candidate) => candidate.distance <= config.nearRadius)
    .sort((a, b) => {
      if (a.distance === b.distance) return b.entry.lastSeenAt - a.entry.lastSeenAt;
      return a.distance - b.distance;
    })
    .slice(0, maxPeers);

  candidates.forEach(({ distance, dz }) => {
    const falloff = clamp(
      1 - (distance - config.fullRadius) / Math.max(1, config.nearRadius - config.fullRadius),
      0,
      1
    );
    const shapedFalloff = Math.pow(falloff, 1.18);
    falloffSum += shapedFalloff;
    strongestFalloff = Math.max(strongestFalloff, shapedFalloff);
    weightedPan += clamp(dz / Math.max(distance, 1), -1, 1) * shapedFalloff;
    nearbyCount += 1;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestDz = dz;
    }
  });

  if (!nearbyCount || !Number.isFinite(nearestDistance)) {
    return { intensity: 0, pan: 0, distance: Infinity, nearbyCount: 0, updatedAt: now };
  }

  const crowdBoost = Math.min(1, falloffSum * 0.48);
  const intensity = clamp(Math.max(strongestFalloff, crowdBoost), 0, 1);
  return {
    intensity,
    pan: falloffSum > 0 ? clamp(weightedPan / falloffSum, -1, 1) : clamp(nearestDz / Math.max(nearestDistance, 1), -1, 1),
    distance: nearestDistance,
    nearbyCount,
    updatedAt: now,
  };
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
  const cameraPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const mountainPointsRef = useRef<Array<{ y: number }>>([]);
  const presenceEntriesRef = useRef<RemotePresenceAudioEntry[]>([]);
  const nearbyPresenceRef = useRef<NearbyPresenceSignal>({
    intensity: 0,
    pan: 0,
    distance: Infinity,
    nearbyCount: 0,
    updatedAt: 0,
  });
  const lastPresenceBreathAtRef = useRef(0);
  const lastPresenceCoughAtRef = useRef(0);
  const lastHighAltitudeCueAtRef = useRef(0);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const sessionId = useOxygenStore((state) => state.sessionId);
  const audioMaxPeers = usePerformanceProfileStore((state) => state.profile.audio.maxPeers);
  const audioStaleMs = usePerformanceProfileStore((state) => state.profile.audio.staleMs);
  const audioNearRadius = usePerformanceProfileStore((state) => state.profile.audio.nearRadius);
  const audioFullRadius = usePerformanceProfileStore((state) => state.profile.audio.fullRadius);
  const audioConfig = useMemo<PresenceAudioConfig>(
    () => ({
      maxPeers: audioMaxPeers,
      staleMs: audioStaleMs,
      nearRadius: audioNearRadius,
      fullRadius: audioFullRadius,
    }),
    [audioFullRadius, audioMaxPeers, audioNearRadius, audioStaleMs]
  );

  const cueBuffersRef = useRef<CueBuffers>({});

  useEffect(() => {
    currentDateIndexRef.current = currentDateIndex;
    cameraYRef.current = cameraPosition[1];
    cameraPositionRef.current = cameraPosition;
    mountainPointsRef.current = mountainPoints;
    nearbyPresenceRef.current = computeNearbyPresenceSignal(
      presenceEntriesRef.current,
      sessionId,
      cameraPosition,
      audioConfig
    );
  }, [audioConfig, cameraPosition, currentDateIndex, mountainPoints, sessionId]);

  useEffect(() => {
    const updateFromStore = (entries: RemotePresenceAudioEntry[]) => {
      presenceEntriesRef.current = entries;
      nearbyPresenceRef.current = computeNearbyPresenceSignal(entries, sessionId, cameraPositionRef.current, audioConfig);
    };

    updateFromStore(useRemotePresenceStore.getState().entries);
    return useRemotePresenceStore.subscribe((state) => {
      updateFromStore(state.entries);
    });
  }, [audioConfig, sessionId]);

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
      const breathBuffer = await loadAudioBuffer(context, PRESENCE_SAMPLE_SOURCES.breath).catch(() =>
        createBreathNoiseBuffer(context)
      );
      master.gain.value = 0.56;
      master.connect(context.destination);

      await context.resume();

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
        const coughSample = cueBuffersRef.current.cough;

        if (coughSample) {
          playSpatialCueSample(runtime.context, runtime.master, coughSample, cueIntensity, pan, {
            rateMin: 0.9,
            rateMax: 1.08,
            gain: 0.1,
            maxDuration: 0.42,
          });
        }
      }, 950);

      const presenceBreathTimer = window.setInterval(() => {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        const signal = nearbyPresenceRef.current;
        if (signal.intensity <= 0.02 || Date.now() - signal.updatedAt > 7_500) return;

        const now = runtime.context.currentTime;
        const breathCooldown = lerp(2.9, 0.82, signal.intensity);
        if (now - lastPresenceBreathAtRef.current >= breathCooldown) {
          lastPresenceBreathAtRef.current = now;
          playPresenceBreath(runtime.context, runtime.master, runtime.breathBuffer, signal);
        }

        const coughSample = cueBuffersRef.current.cough;
        if (!coughSample) return;

        const coughCooldown = lerp(8.5, 2.2, signal.intensity);
        const coughChance = lerp(0.08, 0.42, signal.intensity);
        if (now - lastPresenceCoughAtRef.current < coughCooldown || Math.random() > coughChance) return;

        lastPresenceCoughAtRef.current = now;
        playSpatialCueSample(runtime.context, runtime.master, coughSample, signal.intensity, signal.pan, {
          rateMin: 0.86,
          rateMax: 1.1,
          gain: lerp(0.12, 0.32, signal.intensity),
          maxDuration: lerp(0.36, 0.72, signal.intensity),
        });
      }, 180);

      const teardown = () => {
        window.clearInterval(highAltitudeTimer);
        window.clearInterval(presenceBreathTimer);
        void context.close();
        cueBuffersRef.current = {};
      };

      runtimeRef.current = {
        context,
        master,
        highAltitudeTimer,
        presenceBreathTimer,
        breathBuffer,
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
