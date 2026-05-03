import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';
import type { MountainPoint } from '../types/covid';

const PEAK_AUDIO_TRACKS = [
    {
        key: 'ambulancia',
        url: '/pandemic-assets/audios/ambulancia.mp3',
        periodCenter: 0.36,
        periodWidth: 0.22,
        altitudePreference: 0.62,
        baseVolume: 0.08,
    },
    {
        key: 'coracao_hospital',
        url: '/pandemic-assets/audios/coracao_hospital.mp3',
        periodCenter: 0.57,
        periodWidth: 0.24,
        altitudePreference: 0.84,
        baseVolume: 0.1,
    },
    {
        key: 'doente',
        url: '/pandemic-assets/audios/doente.mp3',
        periodCenter: 0.2,
        periodWidth: 0.26,
        altitudePreference: 0.48,
        baseVolume: 0.075,
    },
    {
        key: 'fora-bozo',
        url: '/pandemic-assets/audios/fora-bozo.mp3',
        periodCenter: 0.87,
        periodWidth: 0.16,
        altitudePreference: 0.97,
        baseVolume: 0.11,
    },
] as const;

const MAX_PEAK_SOURCES = 4;
const MIN_PEAK_DISTANCE_XZ = 18;
const PROXIMITY_NEAR = 9;
const PROXIMITY_FAR = 165;

type TrackProfile = (typeof PEAK_AUDIO_TRACKS)[number];

type PeakSource = {
    id: string;
    position: [number, number, number];
    pointIndex: number;
    pointY: number;
    altitudeNorm: number;
    periodNorm: number;
    track: TrackProfile;
};

type RuntimeSource = {
    node: THREE.Object3D;
    audio: THREE.PositionalAudio;
    peak: PeakSource;
    phase: number;
    memoryLowpass: BiquadFilterNode;
    memoryHighpass: BiquadFilterNode;
    memoryConvolver: ConvolverNode;
    memoryWetGain: GainNode;
};

type IndexedMountainPoint = {
    point: MountainPoint;
    index: number;
};

const gaussian = (x: number, center: number, width: number) => {
    const safeWidth = Math.max(0.001, width);
    const z = (x - center) / safeWidth;
    return Math.exp(-0.5 * z * z);
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - edge0) / Math.max(0.001, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
};

const getNarrativeWeight = (trackKey: string, dateNorm: number) => {
    // "Montanha comecando a crescer": primeira faixa temporal da jornada.
    const growthStart = 1 - smoothstep(0.08, 0.42, dateNorm);
    // Terco final com entrada em 3 camadas para escalada politica-dramatica.
    const layerOne = smoothstep(0.66, 0.74, dateNorm) * 0.6;
    const layerTwo = smoothstep(0.74, 0.84, dateNorm) * 0.9;
    const layerThree = smoothstep(0.84, 0.96, dateNorm) * 1.2;

    if (trackKey === 'fora-bozo') {
        return 0.45 + layerOne + layerTwo + layerThree;
    }

    if (trackKey === 'ambulancia') {
        return 0.95 + growthStart * 1.35;
    }

    // "doente" funciona como cama de tosse/fragilidade humana no comeco.
    if (trackKey === 'doente') {
        return 0.9 + growthStart * 1.45;
    }

    return 1;
};

// climbNorm only fires on ascent (ascentNorm); on descent it collapses to 0.
const getClimbReactiveWeight = (trackKey: string, ascentNorm: number) => {
    if (trackKey === 'ambulancia') {
        return 1 + ascentNorm * 0.95;
    }

    // "doente" opera como cama de tosse, reagindo bastante quando a subida aperta.
    if (trackKey === 'doente') {
        return 1 + ascentNorm * 1.15;
    }

    // fora-bozo extra dramatico ao subir: presença politica no pico.
    if (trackKey === 'fora-bozo') {
        return 1 + ascentNorm * 0.7;
    }

    return 1;
};

const createImpulseResponse = (context: AudioContext, seconds: number, decay: number) => {
    const sampleRate = context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const impulse = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i += 1) {
            const t = i / length;
            const envelope = Math.pow(1 - t, decay);
            data[i] = (Math.random() * 2 - 1) * envelope;
        }
    }

    return impulse;
};

const selectHighestPeaks = (points: MountainPoint[]): IndexedMountainPoint[] => {
    if (!points.length) return [];

    const indexed = points.map((point, index) => ({ point, index }));
    const sorted = [...indexed].sort((a, b) => b.point.y - a.point.y);
    const picked: IndexedMountainPoint[] = [];

    for (const candidate of sorted) {
        const farEnough = picked.every((peak) => {
            const dx = peak.point.x - candidate.point.x;
            const dz = peak.point.z - candidate.point.z;
            return Math.hypot(dx, dz) >= MIN_PEAK_DISTANCE_XZ;
        });

        if (farEnough) {
            picked.push(candidate);
            if (picked.length === MAX_PEAK_SOURCES) return picked;
        }
    }

    for (const candidate of sorted) {
        if (picked.length >= MAX_PEAK_SOURCES) break;
        if (!picked.includes(candidate)) picked.push(candidate);
    }

    return picked;
};

const buildPeakSources = (points: MountainPoint[]) => {
    const peaks = selectHighestPeaks(points);
    if (!peaks.length) return [] as PeakSource[];

    const yValues = peaks.map((p) => p.point.y);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const yRange = Math.max(1, maxY - minY);
    const fullLength = Math.max(1, points.length - 1);

    const mappedPeaks = peaks.map((peak) => ({
        ...peak,
        altitudeNorm: (peak.point.y - minY) / yRange,
        periodNorm: peak.index / fullLength,
    }));

    const result: PeakSource[] = [];
    const usedPeaks = new Set<number>();

    PEAK_AUDIO_TRACKS.forEach((track, trackIndex) => {
        let bestIndex = -1;
        let bestScore = -Infinity;

        mappedPeaks.forEach((peak, index) => {
            if (usedPeaks.has(index)) return;

            const altitudeScore = 1 - Math.min(1, Math.abs(peak.altitudeNorm - track.altitudePreference));
            const periodScore = gaussian(peak.periodNorm, track.periodCenter, track.periodWidth);
            const score = altitudeScore * 0.58 + periodScore * 0.42;
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        if (bestIndex < 0) return;
        usedPeaks.add(bestIndex);

        const peak = mappedPeaks[bestIndex];
        result.push({
            id: `peak-audio-${trackIndex}-${track.key}`,
            track,
            pointIndex: peak.index,
            pointY: peak.point.y,
            altitudeNorm: peak.altitudeNorm,
            periodNorm: peak.periodNorm,
            // Lift source to keep clarity above geometry.
            position: [peak.point.x, peak.point.y + 4.5, peak.point.z],
        });
    });

    return result;
};

export const PeakAudio3D = () => {
    const mountainPoints = useCovidStore((state) => state.mountainPoints);
    const { camera, scene } = useThree();
    const runtimeRef = useRef<{ listener: THREE.AudioListener; sources: RuntimeSource[] } | null>(null);
    const elevationRangeRef = useRef<{ min: number; max: number }>({ min: 0, max: 1 });
    // Signed smoothed vertical speed: positive = climbing, negative = descending.
    const climbRef = useRef<{ initialized: boolean; previousY: number; smoothedSignedSpeed: number }>({
        initialized: false,
        previousY: 0,
        smoothedSignedSpeed: 0,
    });

    const peakSources = useMemo<PeakSource[]>(() => buildPeakSources(mountainPoints), [mountainPoints]);

    useEffect(() => {
        if (!mountainPoints.length) return;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const point of mountainPoints) {
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }
        if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;
        elevationRangeRef.current = {
            min: minY,
            max: Math.max(minY + 1, maxY),
        };
    }, [mountainPoints]);

    useEffect(() => {
        if (!peakSources.length) return;

        const listener = new THREE.AudioListener();
        camera.add(listener);

        const loader = new THREE.AudioLoader();
        const impulse = createImpulseResponse(listener.context, 3.3, 2.8);
        const listenerInput = listener.getInput();

        const runtimeSources: RuntimeSource[] = peakSources.map((source, index) => {
            const node = new THREE.Object3D();
            node.name = source.id;
            node.position.set(source.position[0], source.position[1], source.position[2]);

            const audio = new THREE.PositionalAudio(listener);
            audio.setRefDistance(18);
            audio.setRolloffFactor(1.85);
            audio.setDistanceModel('exponential');
            audio.setMaxDistance(250);
            audio.setDirectionalCone(220, 340, 0.62);
            audio.setVolume(0.0001);

            // "Memoria distante": each source has a moving lowpass/highpass + long convolver tail.
            const memoryHighpass = listener.context.createBiquadFilter();
            memoryHighpass.type = 'highpass';
            memoryHighpass.frequency.value = 120;
            memoryHighpass.Q.value = 0.45;

            const memoryLowpass = listener.context.createBiquadFilter();
            memoryLowpass.type = 'lowpass';
            memoryLowpass.frequency.value = 2100;
            memoryLowpass.Q.value = 0.7;

            const memoryConvolver = listener.context.createConvolver();
            memoryConvolver.buffer = impulse;

            const memoryWetGain = listener.context.createGain();
            memoryWetGain.gain.value = 0.12 + source.altitudeNorm * 0.1;

            // Feed only wet signal from positional output into the cinematic memory tail.
            const outputNode = audio.getOutput();
            outputNode.connect(memoryHighpass);
            memoryHighpass.connect(memoryLowpass);
            memoryLowpass.connect(memoryConvolver);
            memoryConvolver.connect(memoryWetGain);
            memoryWetGain.connect(listenerInput);

            node.add(audio);
            scene.add(node);

            return {
                node,
                audio,
                peak: source,
                phase: index * Math.PI * 0.52,
                memoryLowpass,
                memoryHighpass,
                memoryConvolver,
                memoryWetGain,
            };
        });

        runtimeRef.current = { listener, sources: runtimeSources };
        let cancelled = false;

        peakSources.forEach((source, index) => {
            loader.load(
                source.track.url,
                (buffer) => {
                    if (cancelled) return;
                    const target = runtimeSources[index];
                    if (!target) return;

                    target.audio.setBuffer(buffer);
                    target.audio.setLoop(true);
                    target.audio.setVolume(0.0001);

                    if (listener.context.state === 'running' && !target.audio.isPlaying) {
                        target.audio.play();
                    }
                },
                undefined,
                () => undefined
            );
        });

        const unlockAndPlay = () => {
            const runtime = runtimeRef.current;
            if (!runtime) return;

            const context = runtime.listener.context;
            if (context.state !== 'running') {
                void context.resume().catch(() => undefined);
            }

            runtime.sources.forEach((source) => {
                if (source.audio.buffer && !source.audio.isPlaying) {
                    source.audio.play();
                }
            });
        };

        window.addEventListener('pointerdown', unlockAndPlay, { passive: true });
        window.addEventListener('keydown', unlockAndPlay);

        return () => {
            cancelled = true;
            window.removeEventListener('pointerdown', unlockAndPlay);
            window.removeEventListener('keydown', unlockAndPlay);

            runtimeSources.forEach((source) => {
                if (source.audio.isPlaying) source.audio.stop();

                const outputNode = source.audio.getOutput();
                outputNode.disconnect(source.memoryHighpass);
                source.memoryHighpass.disconnect(source.memoryLowpass);
                source.memoryLowpass.disconnect(source.memoryConvolver);
                source.memoryConvolver.disconnect(source.memoryWetGain);
                source.memoryWetGain.disconnect(listenerInput);

                source.audio.disconnect();
                source.node.remove(source.audio);
                scene.remove(source.node);
            });

            camera.remove(listener);
            runtimeRef.current = null;
        };
    }, [camera, peakSources, scene]);

    useFrame(({ clock }, delta) => {
        const runtime = runtimeRef.current;
        if (!runtime) return;

        const state = useCovidStore.getState();
        const cameraPos = state.cameraPosition;
        const maxDateIndex = Math.max(1, state.mountainPoints.length - 1);
        const dateNorm = THREE.MathUtils.clamp(state.currentDateIndex / maxDateIndex, 0, 1);

        const { min: minY, max: maxY } = elevationRangeRef.current;
        const altitudeRange = Math.max(1, maxY - minY);
        const cameraAltitudeNorm = THREE.MathUtils.clamp((cameraPos[1] - minY) / altitudeRange, 0, 1);
        const t = clock.getElapsedTime();

        const climbState = climbRef.current;
        if (!climbState.initialized) {
            climbState.initialized = true;
            climbState.previousY = cameraPos[1];
        }

        // Signed speed: positive when climbing, negative when descending.
        const signedSpeedRaw = (cameraPos[1] - climbState.previousY) / Math.max(0.001, delta);
        climbState.previousY = cameraPos[1];
        // Slower lerp so direction is read as a sustained state, not a spike.
        climbState.smoothedSignedSpeed = THREE.MathUtils.lerp(climbState.smoothedSignedSpeed, signedSpeedRaw, 0.08);

        const v = climbState.smoothedSignedSpeed;
        // Ascending → dramatic mode builds; descending → poetic mode builds.
        const ascentNorm = smoothstep(0.12, 1.4, v);
        const descentNorm = smoothstep(0.12, 1.2, -v);
        const dramaticMode = ascentNorm;
        const poeticMode = descentNorm;

        runtime.sources.forEach((source) => {
            if (!source.audio.buffer) return;

            const sx = source.peak.position[0];
            const sy = source.peak.position[1];
            const sz = source.peak.position[2];
            const dx = cameraPos[0] - sx;
            const dy = cameraPos[1] - sy;
            const dz = cameraPos[2] - sz;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Proximity automation: louder near source, smoothly fading with distance.
            const proximity = 1 - smoothstep(PROXIMITY_NEAR, PROXIMITY_FAR, distance);

            // Historical automation: each source dominates in its own period window.
            const periodWeight = gaussian(dateNorm, source.peak.track.periodCenter, source.peak.track.periodWidth);
            const narrativeWeight = getNarrativeWeight(source.peak.track.key, dateNorm);
            const climbWeight = getClimbReactiveWeight(source.peak.track.key, ascentNorm);

            // Altitude dramaturgy: higher tracks gain presence when the camera climbs.
            const altitudeBlend = 0.6 + 0.4 * (1 - Math.abs(cameraAltitudeNorm - source.peak.altitudeNorm));

            // ── Dramatic/Poetic direction blend ──────────────────────────────────
            // Ascending  → dramatic: louder, more contrast, political presence.
            // Descending → poetic:   quieter, reverb-heavy, foggy memory.
            const directionGain = 1 + dramaticMode * 0.58 - poeticMode * 0.40;

            const pulse = 0.86 + 0.14 * Math.sin(t * 0.32 + source.phase);
            const finalVolume =
                source.peak.track.baseVolume *
                proximity *
                periodWeight *
                narrativeWeight *
                climbWeight *
                altitudeBlend *
                directionGain *
                pulse;
            source.audio.setVolume(Math.max(0.0001, finalVolume));

            // ── Memory timbre ─────────────────────────────────────────────────
            // Dramatic: filter opens bright/wide, dry signal dominates.
            // Poetic:   lowpass closes into muffled fog, reverb tail floods wide.
            const memoryFocus = THREE.MathUtils.clamp((periodWeight * 0.65 + proximity * 0.35) * altitudeBlend, 0, 1);
            const lpBase = 900 + memoryFocus * 3200;
            source.memoryLowpass.frequency.value = lpBase + dramaticMode * 900 - poeticMode * 1200;
            source.memoryHighpass.frequency.value = 95 + (1 - proximity) * 110 + poeticMode * 55;
            const wetBase = (0.06 + (1 - proximity) * 0.16) * (0.72 + (1 - memoryFocus) * 0.5);
            // Poetic descente: memoria inunda o espaco com reverb. Dramatic: seco e presente.
            source.memoryWetGain.gain.value = wetBase * (1 + poeticMode * 2.1 - dramaticMode * 0.42);
        });
    });

    return null;
};

export default PeakAudio3D;
