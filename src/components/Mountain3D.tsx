import rockBakedTexture from '@assets/textures/baked/rock_baked_1024.webp';
import pathBakedTexture from '@assets/textures/baked/road_baked_512.webp';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import * as THREE from 'three';
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import { TABLET_OPTIMIZED_TEXTURES } from '../assets/tabletOptimizedAssets';
import useTextureLoader from '../hooks/useTextureLoader';
import { useCovidStore, WalkwaySample } from '../stores/covidStore';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import { MountainPoint } from '../types/covid';
import { createTerrainSampler } from '../utils/terrainSampler';

const cyrb128 = (str: string) => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k: number; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ k, 597399067);
    h2 = Math.imul(h2 ^ k, 2869860233);
    h3 = Math.imul(h3 ^ k, 951274213);
    h4 = Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
};

const sfc32 = (a: number, b: number, c: number, d: number) => {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const result = (t + d) | 0;
    return (result >>> 0) / 4294967296;
  };
};

const makeRng = (seed: string) => {
  const state = cyrb128(seed);
  return sfc32(state[0], state[1], state[2], state[3]);
};

const ACTIVE_RADIUS = 105;
const FALLOFF_RADIUS = 55;
const MIN_WALKWAY_BASE = -8.2;
const WALKWAY_THICKNESS = 5.0;
const PLATEAU_THICKNESS = 1.3;
const WALKWAY_SURFACE_OFFSET = 0.16;
const WALKWAY_WIDTH_RATIO = 0.62;
const WALKWAY_GROOVE_DEPTH = 0.045;
const WALKWAY_BEVEL_INNER = 2.8;
const WALKWAY_BEVEL_OUTER = 4.2;
const WALKWAY_TILE_U = 0.028;
const MIN_WALKWAY_HALF = 3.5;
const SEGMENT_APPROACH = 2;
const PROGRESS_EPSILON = 1e-3;
const TARGET_EPSILON = 5e-3;
const WALKWAY_WIGGLE_STRENGTH = 0.16;
const WALKWAY_MAX_ASCENT = 2.4;
const WALKWAY_MAX_DESCENT = 2.2;
const WALKWAY_MAX_STEP = 1.3;
const WALKWAY_FINAL_SMOOTH_PASSES = 10;
const WALKWAY_FINAL_SMOOTH_INFLUENCE = 0.78;
const WALKWAY_RIPPLE_STRENGTH = 0.07;

const easeHeight = (t: number) => {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const RIDGE_SMOOTH_PASSES = 18;
const RIDGE_SMOOTH_INFLUENCE = 0.76;
const WIDTH_SMOOTH_PASSES = 14;
const WIDTH_SMOOTH_INFLUENCE = 0.7;

const smoothArray = (values: number[], iterations: number, influence: number) => {
  if (values.length < 2) return values.slice();
  let prev = values.slice();
  let next = values.slice();

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < prev.length; i++) {
      const left = prev[Math.max(i - 1, 0)];
      const right = prev[Math.min(i + 1, prev.length - 1)];
      const target = (left + prev[i] * 2 + right) / 4;
      next[i] = THREE.MathUtils.lerp(prev[i], target, influence);
    }
    prev = next.slice();
  }

  return next;
};

type QualityMode = 'desktop' | 'mobile';

type QualitySettings = {
  timeMultiplier: number;
  minTimeSegments: number;
  maxTimeSegments: number;
  lateralSegments: number;
  maxHalfWidth: number;
  maxPeakHeight: number;
  baseRidgeHeight: number;
  normalsInterval: number;
  maxAnisotropy: number;
};

const qualityMap: Record<QualityMode, QualitySettings> = {
  desktop: {
    timeMultiplier: 7,
    minTimeSegments: 96,
    maxTimeSegments: 620,
    lateralSegments: 360,
    maxHalfWidth: 80,
    maxPeakHeight: 48,
    baseRidgeHeight: 6,
    normalsInterval: 0.14,
    maxAnisotropy: 10,
  },
  mobile: {
    timeMultiplier: 4,
    minTimeSegments: 72,
    maxTimeSegments: 320,
    lateralSegments: 180,
    maxHalfWidth: 76,
    maxPeakHeight: 44,
    baseRidgeHeight: 5.4,
    normalsInterval: 0.22,
    maxAnisotropy: 4,
  },
};

const fract = (value: number) => value - Math.floor(value);

const createProceduralGroundTexture = (kind: 'rock' | 'road') => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const base = kind === 'rock' ? [38, 27, 19] : [109, 88, 58];
  const mid = kind === 'rock' ? [56, 42, 30] : [153, 127, 84];
  const speck = kind === 'rock' ? [118, 104, 82] : [197, 172, 122];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const grain = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
      const wideGrain = fract(Math.sin(x * 0.73 + y * 1.37) * 951.1357);
      const pebble = grain > (kind === 'rock' ? 0.9 : 0.94) ? 1 : 0;
      const shade = THREE.MathUtils.clamp(wideGrain * 0.55 + grain * 0.45, 0, 1);
      const color = pebble ? speck : base.map((channel, channelIndex) => THREE.MathUtils.lerp(channel, mid[channelIndex], shade));

      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'rock' ? 6 : 1, kind === 'rock' ? 3 : 1);
  texture.needsUpdate = true;
  return texture;
};

const markTextureForUpload = (texture: THREE.Texture) => {
  if (!(texture instanceof THREE.CompressedTexture)) {
    texture.needsUpdate = true;
  }
};

interface Mountain3DProps {
  quality?: QualityMode;
  revealMode?: 'progressive' | 'baked';
  bakedRevealX?: number;
  bakedClipStartX?: number;
  bakedClipEndX?: number;
}

export const Mountain3D = forwardRef<Mesh, Mountain3DProps>(
  ({ quality = 'desktop', revealMode = 'progressive', bakedRevealX, bakedClipStartX, bakedClipEndX }, ref) => {
  const meshRef = useRef<Mesh>(null);
  const mountainMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const walkwayMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const assignMeshRef = useCallback(
    (mesh: Mesh | null) => {
      meshRef.current = mesh;

      if (typeof ref === 'function') {
        ref(mesh);
        return;
      }

      if (ref) {
        ref.current = mesh;
      }
    },
    [ref]
  );
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const setRevealedX = useCovidStore((state) => state.setRevealedX);
  const setMountainMesh = useCovidStore((state) => state.setMountainMesh);
  const setWalkwayProfile = useCovidStore((state) => state.setWalkwayProfile);
  const setTerrainSampler = useCovidStore((state) => state.setTerrainSampler);
  const cameraX = useCovidStore((state) => state.cameraPosition[0]);

  const qualityConfig = qualityMap[quality];

  const timeSegments = useMemo(() => {
    if (mountainPoints.length === 0) return 0;
    const candidate = mountainPoints.length * qualityConfig.timeMultiplier;
    return Math.min(Math.max(candidate, qualityConfig.minTimeSegments), qualityConfig.maxTimeSegments);
  }, [mountainPoints.length, qualityConfig.maxTimeSegments, qualityConfig.minTimeSegments, qualityConfig.timeMultiplier]);

  const zSegments = qualityConfig.lateralSegments;
  const maxHalfWidth = qualityConfig.maxHalfWidth;
  const maxPeakHeight = qualityConfig.maxPeakHeight;
  const baseRidgeHeight = qualityConfig.baseRidgeHeight;

  const noise2D = useMemo(() => createNoise2D(makeRng('serra-sem-ar-2d')), []);
  const noise3D = useMemo(() => createNoise3D(makeRng('serra-sem-ar-3d')), []);

  const mountainData = useMemo(() => {
    if (mountainPoints.length === 0) return null;

    const geometry = new BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const walkwayBaselines: number[] = [];
    const walkwayVertices: number[] = [];
    const walkwayUVs: number[] = [];
    const walkwayIndices: number[] = [];
    const walkwaySamples: WalkwaySample[] = [];

    const maxCases = Math.max(1, ...mountainPoints.map((p) => p.cases));
    const maxDeaths = Math.max(1, ...mountainPoints.map((p) => p.deaths));
    const segmentXs: number[] = new Array(timeSegments);

    const firstPoint = mountainPoints[0];
    const lastPoint = mountainPoints[mountainPoints.length - 1] ?? firstPoint;
    const minPointX = firstPoint?.x ?? 0;
    const maxPointX = lastPoint?.x ?? minPointX;
    const xRange = Math.max(1e-5, maxPointX - minPointX);

    type SegmentProfile = {
      point: MountainPoint;
      halfWidth: number;
      walkwayHalf: number;
      plateauHalf: number;
      rampRange: number;
      plateauRange: number;
      ridgeHeight: number;
      smoothedHeight: number;
      walkwayHeight: number;
      casesNorm: number;
      deathsNorm: number;
    };

    const profiles: SegmentProfile[] = new Array(timeSegments);

    for (let i = 0; i < timeSegments; i++) {
      const lerpT = timeSegments <= 1 ? 0 : i / (timeSegments - 1);
      const sourceIndex = Math.floor(lerpT * (mountainPoints.length - 1));
      const point = mountainPoints[sourceIndex];
      const sampleX = minPointX + xRange * lerpT;
      segmentXs[i] = sampleX;

      const casesNorm = maxCases > 0 ? point.cases / maxCases : 0;
      const deathsNorm = maxDeaths > 0 ? point.deaths / maxDeaths : 0;

      const halfWidth = Math.max(24, Math.pow(casesNorm, 0.62) * maxHalfWidth);
      const walkwayHalf = Math.max(10.5, halfWidth * 0.34);
      const plateauHalf = Math.max(walkwayHalf + 8.5, halfWidth * 0.48);
      const rampRange = Math.max(halfWidth - plateauHalf, 0.001);
      const plateauRange = Math.max(plateauHalf - walkwayHalf, 0.001);
      const ridgeHeight = deathsNorm * maxPeakHeight + casesNorm * baseRidgeHeight;

      profiles[i] = {
        point,
        halfWidth,
        walkwayHalf,
        plateauHalf,
        rampRange,
        plateauRange,
        ridgeHeight,
        smoothedHeight: ridgeHeight,
        walkwayHeight: 0,
        casesNorm,
        deathsNorm,
      };
    }

    const walkwayWidthRaw = profiles.map((p) => p.walkwayHalf);
    const walkwayWidthSmooth = smoothArray(walkwayWidthRaw, WIDTH_SMOOTH_PASSES, WIDTH_SMOOTH_INFLUENCE);
    walkwayWidthSmooth.forEach((value, idx) => {
      const profile = profiles[idx];
      profile.walkwayHalf = Math.max(value, 6.2);
      profile.plateauHalf = Math.max(profile.walkwayHalf + 7.5, profile.plateauHalf);
      profile.rampRange = Math.max(profile.halfWidth - profile.plateauHalf, 0.001);
      profile.plateauRange = Math.max(profile.plateauHalf - profile.walkwayHalf, 0.001);
    });

    const ridgeHeights = profiles.map((p) => p.ridgeHeight);
    const ridgeSoft = smoothArray(ridgeHeights, RIDGE_SMOOTH_PASSES, RIDGE_SMOOTH_INFLUENCE);
    const ridgeFinal = smoothArray(ridgeSoft, 3, RIDGE_SMOOTH_INFLUENCE * 0.65);
    profiles.forEach((profile, idx) => {
      profile.smoothedHeight = ridgeFinal[idx];
    });

    const walkwayScale = maxPeakHeight * 0.9 + baseRidgeHeight * 0.25;
    const maxAscent = WALKWAY_MAX_ASCENT;
    const maxDescent = WALKWAY_MAX_DESCENT;
    let previousHeight = 0;

    profiles.forEach((profile, index) => {
      const target = profile.deathsNorm * walkwayScale + profile.casesNorm * (baseRidgeHeight * 0.2);

      if (index === 0) {
        previousHeight = target;
      } else {
        const diff = target - previousHeight;
        const limited = THREE.MathUtils.clamp(diff, -maxDescent, maxAscent);
        const blended = previousHeight + limited;
        previousHeight = THREE.MathUtils.lerp(blended, target, 0.45);
      }

      const pathWiggle = noise2D(profile.point.x * 0.08 + 10, index * 0.02) * WALKWAY_WIGGLE_STRENGTH;
      const finalHeight = Math.max(previousHeight + pathWiggle, 0);
      profile.walkwayHeight = finalHeight;
      previousHeight = finalHeight;
    });

    // Final pass: damp spikes and clamp local slope so the walk path is stable.
    const stabilizedWalkway = smoothArray(
      profiles.map((profile) => profile.walkwayHeight),
      WALKWAY_FINAL_SMOOTH_PASSES,
      WALKWAY_FINAL_SMOOTH_INFLUENCE
    );
    stabilizedWalkway.forEach((value, idx) => {
      profiles[idx].walkwayHeight = Math.max(value, 0);
    });

    for (let i = 1; i < profiles.length; i++) {
      const prev = profiles[i - 1].walkwayHeight;
      profiles[i].walkwayHeight = THREE.MathUtils.clamp(
        profiles[i].walkwayHeight,
        prev - WALKWAY_MAX_STEP,
        prev + WALKWAY_MAX_STEP
      );
    }
    for (let i = profiles.length - 2; i >= 0; i--) {
      const next = profiles[i + 1].walkwayHeight;
      profiles[i].walkwayHeight = THREE.MathUtils.clamp(
        profiles[i].walkwayHeight,
        next - WALKWAY_MAX_STEP,
        next + WALKWAY_MAX_STEP
      );
    }

    profiles.forEach((profile) => {
      profile.smoothedHeight = Math.max(profile.smoothedHeight, profile.walkwayHeight + 0.5);
      profile.ridgeHeight = Math.max(profile.ridgeHeight, profile.walkwayHeight + 0.25);
    });

    const baselineY = -4;
    let cumulativeDistance = 0;

    for (let i = 0; i < timeSegments; i++) {
      const profile = profiles[i];
      const point = profile.point;
      const walkwayHeight = profile.walkwayHeight;
      const ridgeBlend = THREE.MathUtils.lerp(profile.ridgeHeight, profile.smoothedHeight, 0.45);

      for (let j = 0; j <= zSegments; j++) {
        const t = j / zSegments;
        const z = THREE.MathUtils.lerp(-maxHalfWidth, maxHalfWidth, t);
        const dist = Math.abs(z);
        const outerT = THREE.MathUtils.clamp((dist - profile.plateauHalf) / profile.rampRange, 0, 1);
        const smoothFalloff = 1 - outerT * outerT * (3 - 2 * outerT);
        const primaryFold = noise3D(point.x * 0.035, z * 0.045, i * 0.02);
        const secondaryFold = noise3D(point.x * 0.12 + 50, z * 0.12, i * 0.05);

        let y = smoothFalloff * ridgeBlend;

        if (dist <= profile.walkwayHalf) {
          const ripple = noise2D(point.x * 0.1, i * 0.022) * WALKWAY_RIPPLE_STRENGTH;
          y = walkwayHeight - WALKWAY_GROOVE_DEPTH + ripple;
        } else if (dist <= profile.plateauHalf) {
          const centerT = THREE.MathUtils.clamp((dist - profile.walkwayHalf) / profile.plateauRange, 0, 1);
          const plateauEase = centerT * centerT * (3 - 2 * centerT);
          const undulation =
            (Math.sin(point.x * 0.22 + z * 0.06) * 0.22 + Math.cos(point.x * 0.14 + z * 0.18) * 0.16) *
            (1 - centerT);
          const blend = THREE.MathUtils.lerp(walkwayHeight, ridgeBlend, plateauEase);
          const folds = (primaryFold * 2.4 + secondaryFold * 1.1) * (1 - centerT);
          y = blend + undulation + folds;
        } else {
          const shoulder = 1 - THREE.MathUtils.clamp(dist / profile.halfWidth, 0, 1);
          const brokenEdge =
            (Math.sin(point.x * 0.18 + dist * 0.12) + Math.cos(point.x * 0.26 + z * 0.2)) *
            0.22 *
            shoulder *
            (1 - smoothFalloff);
          const folds = (primaryFold * 3.2 + secondaryFold * 1.8) * shoulder * (1 - smoothFalloff);
          y += brokenEdge + folds;
        }

        vertices.push(point.x, y, z);
        uvs.push(i / Math.max(1, timeSegments - 1), j / zSegments);

        let baseY = baselineY;
        if (dist <= profile.walkwayHalf) {
          baseY = walkwayHeight - WALKWAY_THICKNESS;
        } else if (dist <= profile.plateauHalf && profile.plateauRange > 1e-5) {
          const transition = (dist - profile.walkwayHalf) / profile.plateauRange;
          const eased = THREE.MathUtils.clamp(transition, 0, 1);
          const plateauBase = walkwayHeight - PLATEAU_THICKNESS;
          baseY = THREE.MathUtils.lerp(plateauBase, baselineY, eased * eased);
        }

        baseY = Math.min(baseY, walkwayHeight - 0.1);
        baseY = Math.max(baseY, MIN_WALKWAY_BASE);
        walkwayBaselines.push(baseY);
      }

      const walkwayHalf = Math.max(profile.walkwayHalf * WALKWAY_WIDTH_RATIO, MIN_WALKWAY_HALF);
      const x = segmentXs[i];
      const walkwayOuterHeight = profile.walkwayHeight + WALKWAY_SURFACE_OFFSET * 0.35;
      const walkwayInnerHeight = profile.walkwayHeight + WALKWAY_SURFACE_OFFSET;
      const walkwayInner = Math.max(walkwayHalf - WALKWAY_BEVEL_INNER, walkwayHalf * 0.6);
      const walkwayOuter = walkwayHalf + WALKWAY_BEVEL_OUTER;

      const lengthCoord = (x - segmentXs[0]) * WALKWAY_TILE_U;
      const widthRange = Math.max(walkwayOuter * 2, 1e-4);
      const mapWidth = (value: number) => THREE.MathUtils.clamp((value + walkwayOuter) / widthRange, 0, 1);
      const widthCoords = [
        mapWidth(-walkwayOuter),
        mapWidth(-walkwayHalf),
        mapWidth(-walkwayInner),
        mapWidth(walkwayInner),
        mapWidth(walkwayHalf),
        mapWidth(walkwayOuter),
      ];

      walkwayVertices.push(
        x,
        walkwayOuterHeight,
        -walkwayOuter,
        x,
        walkwayOuterHeight,
        -walkwayHalf,
        x,
        walkwayInnerHeight,
        -walkwayInner,
        x,
        walkwayInnerHeight,
        walkwayInner,
        x,
        walkwayOuterHeight,
        walkwayHalf,
        x,
        walkwayOuterHeight,
        walkwayOuter
      );

      walkwayUVs.push(
        widthCoords[0],
        lengthCoord,
        widthCoords[1],
        lengthCoord,
        widthCoords[2],
        lengthCoord,
        widthCoords[3],
        lengthCoord,
        widthCoords[4],
        lengthCoord,
        widthCoords[5],
        lengthCoord
      );

      if (i < timeSegments - 1) {
        const base = i * 6;
        const next = base + 6;
        walkwayIndices.push(base, next, base + 1, base + 1, next, next + 1);
        walkwayIndices.push(base + 1, next + 1, base + 2, base + 2, next + 1, next + 2);
        walkwayIndices.push(base + 2, next + 2, base + 3, base + 3, next + 2, next + 3);
        walkwayIndices.push(base + 3, next + 3, base + 4, base + 4, next + 3, next + 4);
        walkwayIndices.push(base + 4, next + 4, base + 5, base + 5, next + 4, next + 5);
      }

      if (i > 0) {
        cumulativeDistance += Math.abs(segmentXs[i] - segmentXs[i - 1]);
      }

      walkwaySamples.push({
        x,
        y: walkwayInnerHeight,
        baseY: walkwayHeight - WALKWAY_THICKNESS,
        halfWidth: walkwayHalf,
        outerWidth: walkwayOuter,
        distance: cumulativeDistance,
      });
    }

    const row = zSegments + 1;
    const topVertexCount = timeSegments * row;

    for (let i = 0; i < topVertexCount; i++) {
      const vx = vertices[i * 3 + 0];
      const vy = vertices[i * 3 + 1];
      const vz = vertices[i * 3 + 2];
      const by = Math.min(vy, baselineY);
      vertices.push(vx, by, vz);
      uvs.push(uvs[i * 2 + 0], uvs[i * 2 + 1]);
      walkwayBaselines.push(walkwayBaselines[i]);
    }

    for (let i = 0; i < timeSegments - 1; i++) {
      for (let j = 0; j < zSegments; j++) {
        const a = i * row + j;
        const b = a + 1;
        const c = (i + 1) * row + j;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const bottomOffset = topVertexCount;
    for (let i = 0; i < timeSegments - 1; i++) {
      for (let j = 0; j < zSegments; j++) {
        const a = bottomOffset + i * row + j;
        const b = a + 1;
        const c = bottomOffset + (i + 1) * row + j;
        const d = c + 1;
        indices.push(b, c, a);
        indices.push(d, c, b);
      }
    }

    for (let i = 0; i < timeSegments - 1; i++) {
      const aTop = i * row;
      const cTop = (i + 1) * row;
      const aBot = bottomOffset + aTop;
      const cBot = bottomOffset + cTop;
      indices.push(aTop, cTop, cBot);
      indices.push(aTop, cBot, aBot);
    }

    for (let i = 0; i < timeSegments - 1; i++) {
      const aTop = i * row + zSegments;
      const cTop = (i + 1) * row + zSegments;
      const aBot = bottomOffset + aTop;
      const cBot = bottomOffset + cTop;
      indices.push(cTop, aTop, aBot);
      indices.push(cTop, aBot, cBot);
    }

    for (let j = 0; j < zSegments; j++) {
      const aTop = j;
      const bTop = aTop + 1;
      const aBot = bottomOffset + aTop;
      const bBot = bottomOffset + bTop;
      indices.push(bTop, aTop, aBot);
      indices.push(bTop, aBot, bBot);
    }

    for (let j = 0; j < zSegments; j++) {
      const aTop = (timeSegments - 1) * row + j;
      const bTop = aTop + 1;
      const aBot = bottomOffset + aTop;
      const bBot = bottomOffset + bTop;
      indices.push(aTop, bTop, bBot);
      indices.push(aTop, bBot, aBot);
    }

    geometry.setIndex(indices);
    const positionAttr = new Float32BufferAttribute(vertices, 3);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('uv2', new Float32BufferAttribute(uvs.slice(), 2));
    geometry.computeVertexNormals();

    const originalPositions = Float32Array.from(positionAttr.array as Float32Array);
    const walkwayBaselineArray = Float32Array.from(walkwayBaselines);
    const minX = segmentXs[0] ?? minPointX;
    const maxX = segmentXs[segmentXs.length - 1] ?? minX;

    let walkwayGeometry: BufferGeometry | null = null;
    if (walkwayVertices.length >= 4) {
      walkwayGeometry = new BufferGeometry();
      walkwayGeometry.setAttribute('position', new Float32BufferAttribute(walkwayVertices, 3));
      walkwayGeometry.setAttribute('uv', new Float32BufferAttribute(walkwayUVs, 2));
      walkwayGeometry.setAttribute('uv2', new Float32BufferAttribute(walkwayUVs.slice(), 2));
      if (walkwayIndices.length) walkwayGeometry.setIndex(walkwayIndices);
      walkwayGeometry.computeVertexNormals();
    }

    return {
      geometry,
      originalPositions,
      topVertexCount,
      row,
      baselineY,
      segmentXs,
      minX,
      maxX,
      walkwayBaselines: walkwayBaselineArray,
      walkwayGeometry,
      walkwaySamples,
      timeSegments,
      zMin: -maxHalfWidth,
      zMax: maxHalfWidth,
    };
  }, [
    mountainPoints,
    timeSegments,
    zSegments,
    maxHalfWidth,
    maxPeakHeight,
    baseRidgeHeight,
    noise2D,
    noise3D,
  ]);

  if (!mountainData) return null;

  const {
    geometry,
    originalPositions,
    topVertexCount,
    row,
    baselineY,
    segmentXs,
    walkwayBaselines,
    walkwayGeometry,
    walkwaySamples,
    minX,
    maxX,
    zMin,
    zMax,
  } = mountainData;

  const originalPositionsRef = useRef<Float32Array | null>(originalPositions);
  const walkwayBaselinesRef = useRef<Float32Array | null>(walkwayBaselines);
  const segmentProgressRef = useRef<Float32Array>(new Float32Array(0));
  const segmentTargetRef = useRef<Float32Array>(new Float32Array(0));
  const activeSegmentsRef = useRef<Set<number>>(new Set());
  const normalsTimerRef = useRef(0);

  useEffect(() => {
    originalPositionsRef.current = originalPositions;
    walkwayBaselinesRef.current = walkwayBaselines;
    segmentProgressRef.current = new Float32Array(timeSegments).fill(revealMode === 'baked' ? 1 : 0);
    segmentTargetRef.current = new Float32Array(timeSegments).fill(revealMode === 'baked' ? 1 : 0);
    activeSegmentsRef.current.clear();
  }, [originalPositions, revealMode, walkwayBaselines, timeSegments]);

  useEffect(() => {
    if (!mountainData || timeSegments <= 0 || row <= 0) {
      setTerrainSampler(null);
      return;
    }
    const heights = new Float32Array(topVertexCount);
    for (let i = 0; i < topVertexCount; i++) {
      heights[i] = originalPositions[i * 3 + 1];
    }
    const sampler = createTerrainSampler({
      heights,
      columns: timeSegments,
      rows: row,
      minX,
      maxX,
      minZ: zMin,
      maxZ: zMax,
    });
    setTerrainSampler(sampler);
    return () => setTerrainSampler(null);
  }, [mountainData, originalPositions, topVertexCount, timeSegments, row, minX, maxX, zMin, zMax, setTerrainSampler]);

  useEffect(() => {
    if (revealMode === 'baked') return;
    if (!geometry) return;
    const positions = geometry.getAttribute('position') as Float32BufferAttribute;
    if (!positions) return;
    const positionArray = positions.array as Float32Array;

    for (let i = 0; i < topVertexCount; i++) {
      positionArray[i * 3 + 1] = baselineY;
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [geometry, revealMode, topVertexCount, baselineY, timeSegments]);

  useEffect(() => {
    if (revealMode !== 'baked' || !geometry) return;
    const positions = geometry.getAttribute('position') as Float32BufferAttribute;
    if (!positions) return;
    const positionArray = positions.array as Float32Array;
    const clipStartX = bakedClipStartX ?? minX;
    const clipEndX = bakedClipEndX ?? bakedRevealX ?? maxX;
    const clipMinX = Math.min(clipStartX, clipEndX);
    const clipMaxX = Math.max(clipStartX, clipEndX);

    for (let segment = 0; segment < timeSegments; segment += 1) {
      const segmentX = segmentXs[segment] ?? minX;
      const useOriginalHeight = segmentX >= clipMinX && segmentX <= clipMaxX;
      const collapsedX = segmentX < clipMinX ? clipMinX : clipMaxX;
      const baseOffset = segment * row;

      for (let zIndex = 0; zIndex < row; zIndex += 1) {
        const vertexIndex = baseOffset + zIndex;
        const xIndex = vertexIndex * 3;
        const yIndex = xIndex + 1;
        const bottomVertexIndex = topVertexCount + vertexIndex;
        const bottomXIndex = bottomVertexIndex * 3;
        const bottomYIndex = bottomXIndex + 1;

        positionArray[xIndex] = useOriginalHeight ? originalPositions[xIndex] : collapsedX;
        positionArray[yIndex] = useOriginalHeight ? originalPositions[yIndex] : baselineY;
        positionArray[bottomXIndex] = useOriginalHeight ? originalPositions[bottomXIndex] : collapsedX;
        positionArray[bottomYIndex] = useOriginalHeight ? originalPositions[bottomYIndex] : baselineY;
      }
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [
    bakedClipEndX,
    bakedClipStartX,
    bakedRevealX,
    baselineY,
    geometry,
    maxX,
    minX,
    originalPositions,
    revealMode,
    row,
    segmentXs,
    timeSegments,
    topVertexCount,
    walkwayBaselines,
  ]);

  useEffect(() => {
    if (meshRef.current) {
      setMountainMesh(meshRef.current);
      return () => setMountainMesh(null);
    }
    return () => setMountainMesh(null);
  }, [setMountainMesh]);

  useEffect(() => {
    setWalkwayProfile(walkwaySamples);
    return () => setWalkwayProfile([]);
  }, [setWalkwayProfile, walkwaySamples]);

  useEffect(() => {
    if (revealMode === 'baked') {
      setRevealedX(bakedClipEndX ?? bakedRevealX ?? maxX);
      return;
    }

    if (!geometry || !segmentXs.length || timeSegments === 0) return;

    if (segmentTargetRef.current.length !== timeSegments) {
      segmentTargetRef.current = new Float32Array(timeSegments).fill(0);
    }
    if (segmentProgressRef.current.length !== timeSegments) {
      segmentProgressRef.current = new Float32Array(timeSegments).fill(0);
    }

    const active = activeSegmentsRef.current;
    let maxActiveX = -Infinity;

    for (let i = 0; i < timeSegments; i++) {
      const segX = segmentXs[i] ?? 0;
      const delta = segX - cameraX;
      let target = 0;

      if (delta <= 0 || delta <= ACTIVE_RADIUS) {
        target = 1;
      } else if (delta <= ACTIVE_RADIUS + FALLOFF_RADIUS) {
        const t = (delta - ACTIVE_RADIUS) / Math.max(FALLOFF_RADIUS, 1e-3);
        const smooth = 1 - t * t * (3 - 2 * t);
        target = smooth;
      }

      if (Math.abs((segmentTargetRef.current[i] ?? 0) - target) > TARGET_EPSILON) {
        segmentTargetRef.current[i] = target;
        active.add(i);
      }

      if (target > 0) {
        maxActiveX = Math.max(maxActiveX, segX);
      }
    }

    if (maxActiveX > -Infinity) {
      setRevealedX(maxActiveX);
    }
  }, [bakedClipEndX, bakedRevealX, cameraX, geometry, maxX, revealMode, segmentXs, setRevealedX, timeSegments]);

  useFrame((_, delta) => {
    if (revealMode === 'baked') return;
    if (!geometry) return;
    const positions = geometry.getAttribute('position') as Float32BufferAttribute;
    if (!positions) return;

    const original = originalPositionsRef.current;
    const walkwayBase = walkwayBaselinesRef.current;
    const progressArray = segmentProgressRef.current;
    const targetArray = segmentTargetRef.current;
    const active = activeSegmentsRef.current;

    if (!original || !walkwayBase || !progressArray.length || !targetArray.length || active.size === 0) return;

    const positionArray = positions.array as Float32Array;
    let changed = false;
    const completed: number[] = [];

    active.forEach((segment) => {
      const target = targetArray[segment] ?? 0;
      const current = progressArray[segment] ?? 0;
      const next = THREE.MathUtils.damp(current, target, SEGMENT_APPROACH, delta);

      if (Math.abs(next - current) < PROGRESS_EPSILON) {
        progressArray[segment] = target;
      } else {
        progressArray[segment] = next;
      }

      const eased = easeHeight(progressArray[segment]);
      const baseOffset = segment * row;

      for (let j = 0; j < row; j++) {
        const idx = (baseOffset + j) * 3 + 1;
        const targetY = original[idx];
        const baseY = walkwayBase[baseOffset + j] ?? baselineY;
        positionArray[idx] = THREE.MathUtils.lerp(baseY, targetY, eased);
      }

      changed = true;

      if (Math.abs(progressArray[segment] - target) < PROGRESS_EPSILON) {
        progressArray[segment] = target;
        completed.push(segment);
      }
    });

    if (completed.length) {
      completed.forEach((segment) => active.delete(segment));
    }

    if (changed) {
      positions.needsUpdate = true;
      normalsTimerRef.current += delta;
      if (normalsTimerRef.current >= qualityConfig.normalsInterval) {
        geometry.computeVertexNormals();
        normalsTimerRef.current = 0;
      }
    } else if (normalsTimerRef.current > 0) {
      normalsTimerRef.current = Math.max(normalsTimerRef.current - delta, 0);
    }
  });

  const optimizedRockTexture = useMemo(
    () => ({
      ...TABLET_OPTIMIZED_TEXTURES.mountainRock,
      original: rockBakedTexture,
    }),
    []
  );
  const optimizedRoadTexture = useMemo(
    () => ({
      ...TABLET_OPTIMIZED_TEXTURES.road,
      original: pathBakedTexture,
    }),
    []
  );

  const {
    diffuseMap,
    normalMap,
    aoMap,
    roughnessMap,
    pathDiffuse,
    pathNormal,
    pathAO,
    pathRough,
    pathHeight,
    pathMetallic,
  } = useTextureLoader(optimizedRockTexture, undefined, undefined, undefined, optimizedRoadTexture);

  const profileAnisotropyCap = usePerformanceProfileStore((state) => state.profile.render.textureMaxAnisotropy);
  const anisotropyCap = Math.max(1, Math.min(qualityConfig.maxAnisotropy, profileAnisotropyCap));
  const isBakedReveal = revealMode === 'baked';
  const fallbackRockMap = useMemo(() => createProceduralGroundTexture('rock'), []);
  const fallbackRoadMap = useMemo(() => createProceduralGroundTexture('road'), []);
  const visibleDiffuseMap = isBakedReveal ? undefined : diffuseMap ?? fallbackRockMap;
  const visiblePathDiffuse = isBakedReveal ? undefined : pathDiffuse ?? fallbackRoadMap;

  useEffect(
    () => () => {
      fallbackRockMap.dispose();
      fallbackRoadMap.dispose();
    },
    [fallbackRoadMap, fallbackRockMap]
  );

  useEffect(() => {
    if (visibleDiffuseMap) {
      visibleDiffuseMap.wrapS = visibleDiffuseMap.wrapT = THREE.RepeatWrapping;
      visibleDiffuseMap.repeat.set(6, 3);
      visibleDiffuseMap.anisotropy = Math.max(visibleDiffuseMap.anisotropy, anisotropyCap);
      visibleDiffuseMap.colorSpace = THREE.SRGBColorSpace;
      markTextureForUpload(visibleDiffuseMap);
    }

    if (normalMap) {
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
      normalMap.repeat.set(6, 3);
      normalMap.anisotropy = Math.max(normalMap.anisotropy, Math.max(2, anisotropyCap - 3));
    }

    if (aoMap) {
      aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
      aoMap.repeat.set(6, 3);
    }

    if (roughnessMap) {
      roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(6, 3);
    }

    if (visiblePathDiffuse) {
      visiblePathDiffuse.wrapS = visiblePathDiffuse.wrapT = THREE.RepeatWrapping;
      visiblePathDiffuse.repeat.set(1, 1);
      visiblePathDiffuse.anisotropy = Math.max(visiblePathDiffuse.anisotropy ?? 0, anisotropyCap);
      visiblePathDiffuse.colorSpace = THREE.SRGBColorSpace;
      markTextureForUpload(visiblePathDiffuse);
    }

    if (pathNormal) {
      pathNormal.wrapS = pathNormal.wrapT = THREE.RepeatWrapping;
      pathNormal.repeat.set(1, 1);
      pathNormal.anisotropy = Math.max(pathNormal.anisotropy ?? 0, Math.max(2, anisotropyCap - 4));
    }

    if (pathAO) {
      pathAO.wrapS = pathAO.wrapT = THREE.RepeatWrapping;
      pathAO.repeat.set(1, 1);
    }

    if (pathRough) {
      pathRough.wrapS = pathRough.wrapT = THREE.RepeatWrapping;
      pathRough.repeat.set(1, 1);
    }

    if (pathHeight) {
      pathHeight.wrapS = pathHeight.wrapT = THREE.RepeatWrapping;
      pathHeight.repeat.set(1, 1);
    }

    if (pathMetallic) {
      pathMetallic.wrapS = pathMetallic.wrapT = THREE.RepeatWrapping;
      pathMetallic.repeat.set(1, 1);
    }
  }, [
    anisotropyCap,
    visibleDiffuseMap,
    normalMap,
    aoMap,
    roughnessMap,
    visiblePathDiffuse,
    pathNormal,
    pathAO,
    pathRough,
    pathHeight,
    pathMetallic,
  ]);

  useEffect(() => {
    if (mountainMaterialRef.current) mountainMaterialRef.current.needsUpdate = true;
    if (walkwayMaterialRef.current) walkwayMaterialRef.current.needsUpdate = true;
  }, [
    isBakedReveal,
    visibleDiffuseMap?.uuid,
    normalMap?.uuid,
    aoMap?.uuid,
    roughnessMap?.uuid,
    visiblePathDiffuse?.uuid,
    pathNormal?.uuid,
    pathAO?.uuid,
    pathRough?.uuid,
    pathHeight?.uuid,
    pathMetallic?.uuid,
  ]);

  return (
    <RigidBody type="fixed" colliders="trimesh" name="mountain-body">
      <group>
        <mesh ref={assignMeshRef} geometry={geometry} name="mountain" castShadow receiveShadow>
          <meshStandardMaterial
            ref={mountainMaterialRef}
            color={isBakedReveal ? '#8f321c' : undefined}
            emissive={isBakedReveal ? '#1d0502' : undefined}
            emissiveIntensity={isBakedReveal ? 0.18 : 0}
            map={visibleDiffuseMap}
            normalMap={isBakedReveal ? undefined : normalMap}
            aoMap={isBakedReveal ? undefined : aoMap}
            roughnessMap={isBakedReveal ? undefined : roughnessMap}
            side={THREE.DoubleSide}
            roughness={isBakedReveal ? 0.78 : 0.92}
            metalness={0.02}
          />
        </mesh>
        {!isBakedReveal && walkwayGeometry && visiblePathDiffuse && (
          <mesh geometry={walkwayGeometry} castShadow receiveShadow renderOrder={1}>
            <meshStandardMaterial
              ref={walkwayMaterialRef}
              map={visiblePathDiffuse}
              normalMap={pathNormal ?? undefined}
              aoMap={pathAO ?? undefined}
              roughnessMap={pathRough ?? undefined}
              metalnessMap={pathMetallic ?? undefined}
              displacementMap={pathHeight ?? undefined}
              displacementScale={0}
              displacementBias={0}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              roughness={0.82}
              metalness={0.03}
            />
          </mesh>
        )}
      </group>
    </RigidBody>
  );
  }
);

Mountain3D.displayName = 'Mountain3D';
