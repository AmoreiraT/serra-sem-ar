import rockAOTexture from '@/assets/textures/rock/GroundDirtRocky020_AO_2K.jpg';
import pathAOTexture from '@assets/textures/road/old_road_01_ambientOcclusion_1k.png';
import pathDiffuseTexture from '@assets/textures/road/old_road_01_baseColor_1k.png';
import pathNormalTexture from '@assets/textures/road/old_road_01_normal_gl_1k.png';
import pathRoughTexture from '@assets/textures/road/old_road_01_roughness_1k.png';
import rockDiffuseTexture from '@assets/textures/rock/GroundDirtRocky020_COL_2K.jpg';
import rockRoughTexture from '@assets/textures/rock/GroundDirtRocky020_GLOSS_2K.jpg';
import rockNormalTexture from '@assets/textures/rock/GroundDirtRocky020_NRM_2K.jpg';
// import { createNoise2D, createNoise3D } from 'simplex-noise';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import * as THREE from 'three';
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import useTextureLoader from '../hooks/useTextureLoader';
import { useCovidStore, WalkwaySample } from '../stores/covidStore';
import { MountainPoint } from '../types/covid';
import { createTerrainSampler } from '../utils/terrainSampler';

const cyrb128 = (str: string) => {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
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
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
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

const TIME_SEGMENT_MULTIPLIER = 10;
const MIN_TIME_SEGMENTS = 120;
const MAX_TIME_SEGMENTS = 1000;
const LATERAL_SEGMENTS = 620;
const ACTIVE_RADIUS = 105;
const FALLOFF_RADIUS = 55;
const MIN_WALKWAY_BASE = -8.2;
const WALKWAY_THICKNESS = 5.0;
const PLATEAU_THICKNESS = 1.3;
const WALKWAY_SURFACE_OFFSET = 0.012;
const WALKWAY_WIDTH_RATIO = 0.6;
const WALKWAY_BEVEL_INNER = 2.8;
const WALKWAY_BEVEL_OUTER = 4.2;
const WALKWAY_TILE_U = 0.028;
const WALKWAY_TILE_V = 0.7;
const MIN_WALKWAY_HALF = 3.5;
const SEGMENT_APPROACH = 2;
const PROGRESS_EPSILON = 1e-3;
const TARGET_EPSILON = 5e-3;
const easeHeight = (t: number) => {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const WALKWAY_SMOOTH_PASSES = 18;
const WALKWAY_SMOOTH_INFLUENCE = 0.84;
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

interface Mountain3DProps { }
export const Mountain3D = forwardRef<Mesh, Mountain3DProps>((_props: Mountain3DProps, ref) => {
  const meshRef = (ref as React.RefObject<Mesh>) || useRef<Mesh>(null);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const setRevealedX = useCovidStore((state) => state.setRevealedX);
  const setMountainMesh = useCovidStore((state) => state.setMountainMesh);
  const setWalkwayProfile = useCovidStore((state) => state.setWalkwayProfile);
  const setTerrainSampler = useCovidStore((state) => state.setTerrainSampler);
  const cameraX = useCovidStore((state) => state.cameraPosition[0]);
  // Parameters
  const timeSegments = useMemo(() => {
    if (mountainPoints.length === 0) return 0;
    const candidate = mountainPoints.length * TIME_SEGMENT_MULTIPLIER;
    return Math.min(Math.max(candidate, MIN_TIME_SEGMENTS), MAX_TIME_SEGMENTS);
  }, [mountainPoints.length]);
  const zSegments = LATERAL_SEGMENTS; // lateral detail across mountain width
  const maxHalfWidth = 70; // maximum half-width of the mountain in Z
  const maxPeakHeight = 48; // maximum contribution from deaths
  const baseRidgeHeight = 6; // contribution from cases gives baseline rise without flattening valleys

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

    const walkwayHeightsRaw = profiles.map((p) => p.walkwayHeight);
    const walkwaySoft = smoothArray(walkwayHeightsRaw, WALKWAY_SMOOTH_PASSES, WALKWAY_SMOOTH_INFLUENCE);
    const walkwayFinal = smoothArray(walkwaySoft, 3, WALKWAY_SMOOTH_INFLUENCE * 0.6);
    walkwayFinal.forEach((value, idx) => {
      profiles[idx].walkwayHeight = value;
    });

    const ridgeHeights = profiles.map((p) => p.ridgeHeight);
    const ridgeSoft = smoothArray(ridgeHeights, RIDGE_SMOOTH_PASSES, RIDGE_SMOOTH_INFLUENCE);
    const ridgeFinal = smoothArray(ridgeSoft, 3, RIDGE_SMOOTH_INFLUENCE * 0.65);
    profiles.forEach((profile, idx) => {
      profile.smoothedHeight = ridgeFinal[idx];
    });

    const walkwayScale = maxPeakHeight * 0.9 + baseRidgeHeight * 0.25;
    const maxAscent = 6;
    const maxDescent = 5;
    let previousHeight = 0;

    profiles.forEach((profile, index) => {
      const target =
        profile.deathsNorm * walkwayScale +
        profile.casesNorm * (baseRidgeHeight * 0.2);

      if (index === 0) {
        previousHeight = target;
      } else {
        const diff = target - previousHeight;
        const limited = THREE.MathUtils.clamp(diff, -maxDescent, maxAscent);
        const blended = previousHeight + limited;
        previousHeight = THREE.MathUtils.lerp(blended, target, 0.45);
      }

      const pathWiggle = noise2D(profile.point.x * 0.08 + 10, index * 0.02) * 0.6;
      const finalHeight = Math.max(previousHeight + pathWiggle, 0);
      profile.walkwayHeight = finalHeight;
      previousHeight = finalHeight;
    });

    // Nudge ridge heights so they never fall below the walkway
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
        const smoothFalloff = 1 - (outerT * outerT * (3 - 2 * outerT));
        const primaryFold = noise3D(point.x * 0.035, z * 0.045, i * 0.02);
        const secondaryFold = noise3D(point.x * 0.12 + 50, z * 0.12, i * 0.05);

        let y = smoothFalloff * ridgeBlend;

        if (dist <= profile.walkwayHalf) {
          const ripple = noise2D(point.x * 0.1, i * 0.022) * 0.18;
          y = walkwayHeight + ripple;
        } else if (dist <= profile.plateauHalf) {
          const centerT = (dist - profile.walkwayHalf) / profile.plateauRange;
          const plateauEase = 1 - centerT * centerT * 0.18;
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

      walkwayVertices.push(
        x, walkwayOuterHeight, -walkwayOuter,
        x, walkwayOuterHeight, -walkwayHalf,
        x, walkwayInnerHeight, -walkwayInner,
        x, walkwayInnerHeight, walkwayInner,
        x, walkwayOuterHeight, walkwayHalf,
        x, walkwayOuterHeight, walkwayOuter
      );

      const uCoord = (x - segmentXs[0]) * WALKWAY_TILE_U;
      walkwayUVs.push(
        uCoord, 0,
        uCoord, WALKWAY_TILE_V * 0.25,
        uCoord, WALKWAY_TILE_V * 0.55,
        uCoord, WALKWAY_TILE_V * 0.55,
        uCoord, WALKWAY_TILE_V * 0.25,
        uCoord, 0
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
      const aTop = i * row + 0;
      const cTop = (i + 1) * row + 0;
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
      const aTop = 0 * row + j;
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
    const range = Math.max(1e-3, maxX - minX);

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
      range,
      walkwayBaselines: walkwayBaselineArray,
      walkwayGeometry,
      walkwaySamples,
      timeSegments,
      zMin: -maxHalfWidth,
      zMax: maxHalfWidth,
    };
  }, [mountainPoints, timeSegments, zSegments, maxHalfWidth, maxPeakHeight, baseRidgeHeight]);

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
    segmentProgressRef.current = new Float32Array(timeSegments).fill(0);
    segmentTargetRef.current = new Float32Array(timeSegments).fill(0);
    activeSegmentsRef.current.clear();
  }, [originalPositions, walkwayBaselines, timeSegments]);

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
    if (!geometry) return;
    const positions = geometry.getAttribute('position') as Float32BufferAttribute;
    if (!positions) return;
    const positionArray = positions.array as Float32Array;

    for (let i = 0; i < topVertexCount; i++) {
      positionArray[i * 3 + 1] = baselineY;
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [geometry, topVertexCount, baselineY, timeSegments]);

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

      if (delta <= 0) {
        target = 1;
      } else if (delta <= ACTIVE_RADIUS) {
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
  }, [cameraX, geometry, segmentXs, setRevealedX, timeSegments]);

  useFrame((_, delta) => {
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
      if (normalsTimerRef.current >= 0.12) {
        geometry.computeVertexNormals();
        normalsTimerRef.current = 0;
      }
    } else if (normalsTimerRef.current > 0) {
      normalsTimerRef.current = Math.max(normalsTimerRef.current - delta, 0);
    }
  });

  const {
    diffuseMap,
    normalMap,
    aoMap,
    roughnessMap,
    pathDiffuse,
    pathNormal,
    pathAO,
    pathRough
  } = useTextureLoader(
    rockDiffuseTexture,
    rockNormalTexture,
    rockAOTexture,
    rockRoughTexture,
    pathDiffuseTexture,
    pathNormalTexture,
    pathAOTexture,
    pathRoughTexture
  );


  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(6, 3);
  diffuseMap.anisotropy = Math.max(diffuseMap.anisotropy, 8);
  diffuseMap.colorSpace = THREE.SRGBColorSpace;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(6, 3);
  normalMap.anisotropy = Math.max(normalMap.anisotropy, 4);
  aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
  aoMap.repeat.set(6, 3);

  if (roughnessMap) {
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(6, 3);
  }

  if (pathDiffuse) {
    pathDiffuse.wrapS = pathDiffuse.wrapT = THREE.RepeatWrapping;
    pathDiffuse.repeat.set(1, 1);
    pathDiffuse.anisotropy = Math.max(pathDiffuse.anisotropy ?? 0, 12);
    pathDiffuse.colorSpace = THREE.SRGBColorSpace;
  }
  if (pathNormal) {
    pathNormal.wrapS = pathNormal.wrapT = THREE.RepeatWrapping;
    pathNormal.repeat.set(1, 1);
    pathNormal.anisotropy = Math.max(pathNormal.anisotropy ?? 0, 6);
  }
  if (pathAO) {
    pathAO.wrapS = pathAO.wrapT = THREE.RepeatWrapping;
    pathAO.repeat.set(1, 1);
  }
  if (pathRough) {
    pathRough.wrapS = pathRough.wrapT = THREE.RepeatWrapping;
    pathRough.repeat.set(1, 1);
  }

  return (
    <RigidBody type="fixed" colliders="trimesh" name="mountain-body">
      <group>
        <mesh ref={meshRef} geometry={geometry} name="mountain" castShadow receiveShadow>
          <meshStandardMaterial
            map={diffuseMap}
            normalMap={normalMap}
            aoMap={aoMap}
            roughnessMap={roughnessMap}
            side={THREE.DoubleSide}
            roughness={0.92}
            metalness={0.04}
          />
        </mesh>
        {walkwayGeometry && pathDiffuse && (
          <mesh geometry={walkwayGeometry} castShadow receiveShadow renderOrder={1}>
            <meshStandardMaterial
              map={pathDiffuse}
              normalMap={pathNormal ?? undefined}
              aoMap={pathAO ?? undefined}
              roughnessMap={pathRough ?? undefined}
              roughness={0.82}
              metalness={0.03}
            />
          </mesh>
        )}
      </group>
    </RigidBody>
  );
});

Mountain3D.displayName = 'Mountain3D';
