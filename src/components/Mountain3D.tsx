import rockAOTexture from '@/assets/textures/rock_ao.jpg';
import rockDiffuseTexture from '@assets/textures/rock_diffuse.jpg';
import rockNormalTexture from '@assets/textures/rock_normal.jpg';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import * as THREE from 'three';
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import useTextureLoader from '../hooks/useTextureLoader';
import { useCovidStore } from '../stores/covidStore';
import { MountainPoint } from '../types/covid';

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

interface Mountain3DProps { }
export const Mountain3D = forwardRef<Mesh, Mountain3DProps>((_props: Mountain3DProps, ref) => {
  const meshRef = (ref as React.RefObject<Mesh>) || useRef<Mesh>(null);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const setRevealedX = useCovidStore((state) => state.setRevealedX);
  const cameraX = useCovidStore((state) => state.cameraPosition[0]);
  // Parameters
  const timeSegments = useMemo(() => Math.min(mountainPoints.length * 2, 360), [mountainPoints.length]);
  const zSegments = 160; // lateral detail across mountain width
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

    const maxCases = Math.max(1, ...mountainPoints.map((p) => p.cases));
    const maxDeaths = Math.max(1, ...mountainPoints.map((p) => p.deaths));
    const segmentXs: number[] = new Array(timeSegments);

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
      segmentXs[i] = point.x;

      const casesNorm = maxCases > 0 ? point.cases / maxCases : 0;
      const deathsNorm = maxDeaths > 0 ? point.deaths / maxDeaths : 0;

      const halfWidth = Math.max(14, Math.pow(casesNorm, 0.62) * maxHalfWidth);
      const walkwayHalf = Math.max(4.5, halfWidth * 0.18);
      const plateauHalf = Math.max(walkwayHalf + 4, halfWidth * 0.34);
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

    // Smooth ridge heights to make the walkway friendlier
    const ridgeHeights = profiles.map((p) => p.ridgeHeight);
    const smoothedHeights = ridgeHeights.map((height, idx) => {
      const sample = (offset: number) => ridgeHeights[Math.min(Math.max(idx + offset, 0), ridgeHeights.length - 1)];
      const kernel = sample(-2) + sample(-1) + height + sample(1) + sample(2);
      return kernel / 5;
    });

    profiles.forEach((profile, idx) => {
      const secondary = (
        smoothedHeights[Math.max(idx - 1, 0)] +
        smoothedHeights[idx] +
        smoothedHeights[Math.min(idx + 1, smoothedHeights.length - 1)]
      ) / 3;
      profile.smoothedHeight = (smoothedHeights[idx] + secondary) * 0.5;
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
          const ripple = noise2D(point.x * 0.12, i * 0.03) * 0.35;
          y = walkwayHeight + ripple;
        } else if (dist <= profile.plateauHalf) {
          const centerT = (dist - profile.walkwayHalf) / profile.plateauRange;
          const plateauEase = 1 - centerT * centerT * 0.28;
          const undulation =
            (Math.sin(point.x * 0.28 + z * 0.07) * 0.35 + Math.cos(point.x * 0.16 + z * 0.2) * 0.22) *
            (1 - centerT);
          const blend = THREE.MathUtils.lerp(walkwayHeight, ridgeBlend, plateauEase);
          const folds = (primaryFold * 4 + secondaryFold * 1.6) * (1 - centerT);
          y = blend + undulation + folds;
        } else {
          const shoulder = 1 - THREE.MathUtils.clamp(dist / profile.halfWidth, 0, 1);
          const brokenEdge =
            (Math.sin(point.x * 0.22 + dist * 0.16) + Math.cos(point.x * 0.3 + z * 0.24)) *
            0.35 *
            shoulder *
            (1 - smoothFalloff);
          const folds = (primaryFold * 6 + secondaryFold * 2.5) * shoulder * (1 - smoothFalloff);
          y += brokenEdge + folds;
        }

        vertices.push(point.x, y, z);
        uvs.push(i / Math.max(1, timeSegments - 1), j / zSegments);
      }
    }

    const row = zSegments + 1;
    const topVertexCount = timeSegments * row;
    const baselineY = -4;

    for (let i = 0; i < topVertexCount; i++) {
      const vx = vertices[i * 3 + 0];
      const vy = vertices[i * 3 + 1];
      const vz = vertices[i * 3 + 2];
      const by = Math.min(vy, baselineY);
      vertices.push(vx, by, vz);
      uvs.push(uvs[i * 2 + 0], uvs[i * 2 + 1]);
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
    const minX = segmentXs[0] ?? 0;
    const maxX = segmentXs[segmentXs.length - 1] ?? minX;
    const range = Math.max(1e-3, maxX - minX);

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
    minX,
    range,
  } = mountainData;

  const originalPositionsRef = useRef<Float32Array | null>(originalPositions);
  const growthSegmentsRef = useRef<Map<number, number>>(new Map());
  const revealedSegmentRef = useRef(-1);

  useEffect(() => {
    originalPositionsRef.current = originalPositions;
    growthSegmentsRef.current.clear();
    revealedSegmentRef.current = -1;
  }, [originalPositions]);

  const INITIAL_REVEAL_SEGMENTS = 2;
  const REVEAL_LOOKAHEAD_SEGMENTS = 6;
  const GROWTH_SPEED = 0.8;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const revealUpTo = useCallback(
    (segment: number) => {
      if (!geometry) return;
      const clamped = Math.min(Math.max(segment, 0), timeSegments - 1);
      if (clamped <= revealedSegmentRef.current) return;

      const start = Math.max(revealedSegmentRef.current + 1, 0);
      const growthMap = growthSegmentsRef.current;
      for (let seg = start; seg <= clamped; seg++) {
        if (!growthMap.has(seg)) {
          growthMap.set(seg, 0);
          const xVal = segmentXs[seg] ?? segmentXs[segmentXs.length - 1] ?? 0;
          setRevealedX(xVal);
        }
      }
      revealedSegmentRef.current = clamped;
    },
    [geometry, segmentXs, setRevealedX, timeSegments]
  );

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
    growthSegmentsRef.current.clear();
    revealedSegmentRef.current = -1;
    if (segmentXs.length) {
      setRevealedX(segmentXs[0]);
    }
    revealUpTo(INITIAL_REVEAL_SEGMENTS);
  }, [geometry, topVertexCount, baselineY, segmentXs, setRevealedX, revealUpTo]);

  useEffect(() => {
    if (!geometry) return;
    const normalized = THREE.MathUtils.clamp((cameraX - minX) / range, 0, 1);
    const targetSegment = Math.floor(normalized * Math.max(1, timeSegments - 1)) + REVEAL_LOOKAHEAD_SEGMENTS;
    revealUpTo(targetSegment);
  }, [cameraX, geometry, minX, range, revealUpTo, timeSegments]);

  useFrame((_, delta) => {
    if (!geometry) return;
    const growthMap = growthSegmentsRef.current;
    if (!growthMap.size) return;

    const positions = geometry.getAttribute('position') as Float32BufferAttribute;
    const positionArray = positions.array as Float32Array;
    const original = originalPositionsRef.current;
    if (!original) return;

    let changed = false;
    const entries = Array.from(growthMap.entries());
    for (const [segment, progress] of entries) {
      const next = Math.min(progress + delta * GROWTH_SPEED, 1);
      const eased = easeOutCubic(next);
      const baseOffset = segment * row;

      for (let j = 0; j < row; j++) {
        const idx = (baseOffset + j) * 3 + 1;
        const targetY = original[idx];
        positionArray[idx] = THREE.MathUtils.lerp(baselineY, targetY, eased);
      }

      if (next >= 1) {
        growthMap.delete(segment);
      } else {
        growthMap.set(segment, next);
      }

      if (next !== progress) {
        changed = true;
      }
    }

    if (changed) {
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  });

  const { diffuseMap, normalMap, aoMap } = useTextureLoader(
    rockDiffuseTexture,
    rockNormalTexture,
    rockAOTexture
  );


  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(8, 3);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(8, 3);
  aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
  aoMap.repeat.set(8, 3);
  return (
    <mesh ref={meshRef} geometry={geometry} name="mountain" castShadow receiveShadow>
      <meshStandardMaterial
        map={diffuseMap}
        normalMap={normalMap}
        aoMap={aoMap}
        side={THREE.DoubleSide}
        roughness={0.95}
        metalness={0.05}
      />
    </mesh>
  );
});

Mountain3D.displayName = 'Mountain3D';
