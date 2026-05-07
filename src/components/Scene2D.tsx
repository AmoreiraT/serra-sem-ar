import { useEffect, useMemo, useRef, useState } from 'react';
import roadMobileTextureUrl from '../assets/textures/baked/road_mobile_192.webp';
import { covidEvents } from '../data/covidEvents';
import {
  getPresenceRoomId,
  getPresenceRoomIdsForDay,
  listenToPresenceRooms,
} from '../services/firebaseRealtime';
import { useCovidStore } from '../stores/covidStore';
import { useOxygenStore } from '../stores/oxygenStore';
import type { MountainPoint, ProcessedCovidData } from '../types/covid';
import type { PresenceRoomEntry } from '../types/realtimePresence';

type Footprint2D = {
  index: number;
  lateral: number;
  createdAt: number;
};

type KeyState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
};

type EventMarker2D = {
  index: number;
};

type DepthSample = {
  t: number;
  dayIndex: number;
  centerX: number;
  y: number;
  roadHalf: number;
  shoulderHalf: number;
  leftWallY: number;
  rightWallY: number;
  heightNorm: number;
  fade: number;
};

type ProjectedPoint = {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  heading: number;
};

const DEFAULT_KEYS: KeyState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
};

const DEPTH_SAMPLE_COUNT = 46;
const MAX_LOCAL_FOOTPRINTS = 36;
const MAX_REMOTE_MARKERS = 18;
const BLOOD_COLORS = ['#5b0509', '#780810', '#98121c', '#3b0206'];
const textureCanvasCache = new Map<string, HTMLCanvasElement>();
let cachedRoadTextureImage: HTMLImageElement | null = null;
let pendingRoadTextureImage: Promise<HTMLImageElement | null> | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (current: number, target: number, lambda: number, delta: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * delta));

const seededFraction = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const getProceduralTexture = (
  key: string,
  size: number,
  baseColor: string,
  fleckColor: string,
  scratchColor: string
): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null;
  const cached = textureCanvasCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * 5; i += 1) {
    const seed = i + size * 19;
    const x = seededFraction(seed) * size;
    const y = seededFraction(seed + 7) * size;
    const radius = 0.35 + seededFraction(seed + 13) * 1.25;
    ctx.fillStyle = fleckColor;
    ctx.globalAlpha = 0.16 + seededFraction(seed + 17) * 0.28;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.8, radius, seededFraction(seed + 23) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = scratchColor;
  ctx.lineCap = 'round';
  for (let i = 0; i < size * 0.7; i += 1) {
    const seed = i + size * 31;
    const x = seededFraction(seed) * size;
    const y = seededFraction(seed + 5) * size;
    ctx.globalAlpha = 0.08 + seededFraction(seed + 11) * 0.14;
    ctx.lineWidth = 0.45 + seededFraction(seed + 17) * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (seededFraction(seed + 29) - 0.5) * 24, y + (seededFraction(seed + 37) - 0.5) * 10);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  textureCanvasCache.set(key, canvas);
  return canvas;
};

const loadRoadTextureImage = (): Promise<HTMLImageElement | null> => {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  if (cachedRoadTextureImage) return Promise.resolve(cachedRoadTextureImage);
  if (pendingRoadTextureImage) return pendingRoadTextureImage;

  pendingRoadTextureImage = new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      cachedRoadTextureImage = image;
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = roadMobileTextureUrl;
  });

  return pendingRoadTextureImage;
};

const createCameraPosition = (
  index: number,
  lateral: number,
  mountainPoints: MountainPoint[]
): [number, number, number] => {
  const fallbackX = index * 0.7;
  const point = mountainPoints[clamp(Math.round(index), 0, Math.max(0, mountainPoints.length - 1))];
  const x = point?.x ?? fallbackX;
  const y = 1.6 + Math.min(3, (point?.y ?? 0) * 0.035);
  const z = lateral * 5.2;
  return [x, y, z];
};

const sampleHeightNorm = (points: MountainPoint[], index: number, maxHeight: number): number => {
  if (!points.length || maxHeight <= 0) return 0;
  const clampedIndex = clamp(index, 0, points.length - 1);
  const lowerIndex = Math.floor(clampedIndex);
  const upperIndex = Math.min(lowerIndex + 1, points.length - 1);
  const t = clampedIndex - lowerIndex;
  const height = lerp(points[lowerIndex]?.y ?? 0, points[upperIndex]?.y ?? 0, t);
  return clamp(height / maxHeight, 0, 1);
};

const createDepthSample = (
  t: number,
  width: number,
  height: number,
  currentIndex: number,
  lateral: number,
  points: MountainPoint[],
  maxHeight: number
): DepthSample => {
  const depth = clamp(t, 0, 1);
  const horizonY = height * 0.3;
  const bottomY = height * 1.18;
  const forwardDays = (1 - depth) * 138 - 30;
  const dayIndex = currentIndex + forwardDays;
  const heightNorm = sampleHeightNorm(points, dayIndex, maxHeight);
  const perspective = Math.pow(depth, 1.72);
  const curve =
    Math.sin((currentIndex + forwardDays) * 0.028) * width * 0.19 * (0.12 + Math.pow(depth, 1.34)) +
    Math.sin(currentIndex * 0.006 + depth * 5.4) * width * 0.045 * depth;
  const centerX = width * 0.5 + curve - lateral * width * 0.27 * Math.pow(depth, 1.42);
  const roadHalf = lerp(width * 0.028, width * 0.47, Math.pow(depth, 1.78)) * (0.9 + heightNorm * 0.18);
  const shoulderHalf = roadHalf + lerp(width * 0.1, width * 0.36, Math.pow(depth, 1.4));
  const elevationLift = heightNorm * height * (0.045 + (1 - depth) * 0.13 + depth * 0.025);
  const y = lerp(horizonY, bottomY, perspective) - elevationLift;
  const wallLift = height * (0.055 + heightNorm * 0.27) * (1.04 - depth * 0.42);
  const sideNoise = Math.sin((currentIndex + forwardDays) * 0.16) * height * 0.012;

  return {
    t: depth,
    dayIndex,
    centerX,
    y,
    roadHalf,
    shoulderHalf,
    leftWallY: y - wallLift + sideNoise,
    rightWallY: y - wallLift * (0.72 + seededFraction(Math.round(dayIndex) + 17) * 0.28) - sideNoise,
    heightNorm,
    fade: clamp(depth * 1.25, 0, 1),
  };
};

const createDepthSamples = (
  width: number,
  height: number,
  currentIndex: number,
  lateral: number,
  points: MountainPoint[],
  maxHeight: number
): DepthSample[] => {
  const samples: DepthSample[] = [];
  for (let i = 0; i <= DEPTH_SAMPLE_COUNT; i += 1) {
    const t = i / DEPTH_SAMPLE_COUNT;
    samples.push(createDepthSample(t, width, height, currentIndex, lateral, points, maxHeight));
  }
  return samples;
};

const sampleForProjectedDay = (
  dayIndex: number,
  currentIndex: number,
  width: number,
  height: number,
  lateral: number,
  points: MountainPoint[],
  maxHeight: number
): DepthSample | null => {
  const delta = dayIndex - currentIndex;
  if (delta < -44 || delta > 122) return null;
  const depth = clamp(1 - (delta + 28) / 150, 0.055, 0.98);
  return createDepthSample(depth, width, height, currentIndex, lateral, points, maxHeight);
};

const projectDay = (
  dayIndex: number,
  lateral: number,
  currentIndex: number,
  width: number,
  height: number,
  points: MountainPoint[],
  maxHeight: number
): ProjectedPoint | null => {
  const sample = sampleForProjectedDay(dayIndex, currentIndex, width, height, lateral, points, maxHeight);
  if (!sample) return null;
  const ahead = createDepthSample(
    clamp(sample.t - 0.018, 0.04, 1),
    width,
    height,
    currentIndex,
    lateral,
    points,
    maxHeight
  );
  const dx = ahead.centerX - sample.centerX;
  const dy = ahead.y - sample.y;
  const edgeFade =
    dayIndex - currentIndex < -32
      ? clamp((dayIndex - currentIndex + 44) / 12, 0, 1)
      : dayIndex - currentIndex > 106
        ? clamp((122 - (dayIndex - currentIndex)) / 16, 0, 1)
        : 1;

  return {
    x: sample.centerX + lateral * sample.roadHalf * 0.48,
    y: sample.y,
    scale: lerp(0.12, 1.6, Math.pow(sample.t, 1.48)),
    alpha: edgeFade * sample.fade,
    heading: Math.atan2(dx, -dy || 1),
  };
};

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#061010');
  sky.addColorStop(0.18, '#070504');
  sky.addColorStop(0.48, '#261106');
  sky.addColorStop(1, '#713c1f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const coldHaze = ctx.createRadialGradient(width * 0.52, height * 0.19, 6, width * 0.52, height * 0.24, width * 0.82);
  coldHaze.addColorStop(0, 'rgba(120, 190, 182, 0.1)');
  coldHaze.addColorStop(0.42, 'rgba(80, 70, 48, 0.1)');
  coldHaze.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coldHaze;
  ctx.fillRect(0, 0, width, height);

  const fireHaze = ctx.createRadialGradient(width * 0.55, height * 0.52, 8, width * 0.55, height * 0.58, width);
  fireHaze.addColorStop(0, 'rgba(209, 104, 35, 0.2)');
  fireHaze.addColorStop(0.48, 'rgba(128, 57, 20, 0.16)');
  fireHaze.addColorStop(1, 'rgba(8, 3, 2, 0)');
  ctx.fillStyle = fireHaze;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#f3b36a';
  for (let i = 0; i < 58; i += 1) {
    const x = seededFraction(i + 91) * width;
    const y = seededFraction(i + 193) * height;
    const r = 0.3 + seededFraction(i + 37) * 0.75;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawDistantRidge = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: MountainPoint[],
  currentIndex: number,
  maxHeight: number,
  layer: number
) => {
  const horizonY = height * (0.31 + layer * 0.065);
  const range = 180 + layer * 86;
  const samples = 104;
  const lift = height * (0.16 + layer * 0.045);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, horizonY + height * (0.22 + layer * 0.08));

  for (let i = 0; i <= samples; i += 1) {
    const dayIndex = currentIndex - range * (0.16 + layer * 0.07) + (i / samples) * range;
    const norm = sampleHeightNorm(points, dayIndex, maxHeight);
    const localNoise =
      Math.sin(dayIndex * (0.18 + layer * 0.03)) * (4 + layer * 5) +
      Math.sin(dayIndex * 0.057 + layer) * (9 + layer * 6);
    ctx.lineTo((i / samples) * width, horizonY - norm * lift + localNoise);
  }

  ctx.lineTo(width, horizonY + height * (0.24 + layer * 0.08));
  ctx.closePath();
  const ridge = ctx.createLinearGradient(0, horizonY - lift, 0, horizonY + height * 0.28);
  ridge.addColorStop(0, layer === 0 ? '#040303' : '#090403');
  ridge.addColorStop(0.5, layer === 0 ? '#130806' : layer === 1 ? '#211006' : '#321508');
  ridge.addColorStop(1, layer === 0 ? '#2d1207' : layer === 1 ? '#46200b' : '#5c2b10');
  ctx.fillStyle = ridge;
  ctx.fill();
  ctx.globalAlpha = layer === 0 ? 0.22 : 0.14;
  ctx.strokeStyle = layer === 0 ? '#956237' : '#ba7440';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
};

const drawDistantRidges = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: MountainPoint[],
  currentIndex: number,
  maxHeight: number
) => {
  drawDistantRidge(ctx, width, height, points, currentIndex, maxHeight, 0);
  drawDistantRidge(ctx, width, height, points, currentIndex, maxHeight, 1);
  drawDistantRidge(ctx, width, height, points, currentIndex, maxHeight, 2);
};

const fillQuad = (
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
) => {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fill();
};

const drawTerrainMesh = (ctx: CanvasRenderingContext2D, width: number, height: number, samples: DepthSample[]) => {
  ctx.save();

  for (let i = 0; i < samples.length - 1; i += 1) {
    const far = samples[i];
    const near = samples[i + 1];
    const t = near.t;
    const leftAlpha = 0.42 + t * 0.34;
    const rightAlpha = 0.34 + t * 0.28;

    ctx.fillStyle = `rgba(${Math.round(26 + t * 26)}, ${Math.round(12 + t * 16)}, ${Math.round(5 + t * 9)}, ${leftAlpha})`;
    fillQuad(
      ctx,
      -width * 0.1,
      far.y + height * 0.08,
      far.centerX - far.shoulderHalf,
      far.leftWallY,
      near.centerX - near.shoulderHalf,
      near.leftWallY,
      -width * 0.16,
      near.y + height * 0.2
    );

    ctx.fillStyle = `rgba(${Math.round(22 + t * 22)}, ${Math.round(9 + t * 13)}, ${Math.round(4 + t * 8)}, ${rightAlpha})`;
    fillQuad(
      ctx,
      far.centerX + far.shoulderHalf,
      far.rightWallY,
      width * 1.08,
      far.y + height * 0.08,
      width * 1.16,
      near.y + height * 0.2,
      near.centerX + near.shoulderHalf,
      near.rightWallY
    );

    const shoulderLight = Math.round(58 + t * 58 + near.heightNorm * 18);
    ctx.fillStyle = `rgba(${shoulderLight}, ${Math.round(28 + t * 26)}, ${Math.round(10 + t * 12)}, ${0.5 + t * 0.18})`;
    fillQuad(
      ctx,
      far.centerX - far.shoulderHalf,
      far.leftWallY,
      far.centerX - far.roadHalf,
      far.y,
      near.centerX - near.roadHalf,
      near.y,
      near.centerX - near.shoulderHalf,
      near.leftWallY
    );

    ctx.fillStyle = `rgba(${Math.round(42 + t * 48)}, ${Math.round(18 + t * 24)}, ${Math.round(7 + t * 10)}, ${0.42 + t * 0.14})`;
    fillQuad(
      ctx,
      far.centerX + far.roadHalf,
      far.y,
      far.centerX + far.shoulderHalf,
      far.rightWallY,
      near.centerX + near.shoulderHalf,
      near.rightWallY,
      near.centerX + near.roadHalf,
      near.y
    );
  }

  const terrainTexture = getProceduralTexture(
    'terrain-rust-96',
    96,
    '#3d1b0a',
    'rgba(132, 70, 31, 0.75)',
    'rgba(24, 8, 3, 0.9)'
  );
  if (terrainTexture) {
    const pattern = ctx.createPattern(terrainTexture, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, height * 0.24, width, height * 0.86);
      ctx.restore();
    }
  }

  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#9c5f2e';
  ctx.lineWidth = 1;
  for (let i = 5; i < samples.length; i += 5) {
    const sample = samples[i];
    ctx.beginPath();
    ctx.moveTo(-width * 0.08, sample.y + height * 0.04);
    ctx.quadraticCurveTo(sample.centerX - sample.shoulderHalf * 1.6, sample.leftWallY, sample.centerX - sample.roadHalf, sample.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sample.centerX + sample.roadHalf, sample.y);
    ctx.quadraticCurveTo(sample.centerX + sample.shoulderHalf * 1.6, sample.rightWallY, width * 1.08, sample.y + height * 0.04);
    ctx.stroke();
  }

  ctx.restore();
};

const drawRoadCastShadow = (ctx: CanvasRenderingContext2D, width: number, height: number, samples: DepthSample[]) => {
  const first = samples[0];

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const shadow = ctx.createLinearGradient(0, height * 0.34, 0, height);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
  shadow.addColorStop(0.62, 'rgba(0, 0, 0, 0.26)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.moveTo(first.centerX - first.roadHalf * 1.08, first.y + 4);
  samples.forEach((sample) => {
    const offset = lerp(4, 34, Math.pow(sample.t, 1.35));
    ctx.lineTo(sample.centerX - sample.roadHalf * 1.08 - width * 0.015 * sample.t, sample.y + offset);
  });
  [...samples].reverse().forEach((sample) => {
    const offset = lerp(4, 34, Math.pow(sample.t, 1.35));
    ctx.lineTo(sample.centerX + sample.roadHalf * 1.08 + width * 0.015 * sample.t, sample.y + offset);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawRoadMesh = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: DepthSample[],
  roadTextureImage: CanvasImageSource | null
) => {
  ctx.save();
  drawRoadCastShadow(ctx, width, height, samples);

  for (let i = 0; i < samples.length - 1; i += 1) {
    const far = samples[i];
    const near = samples[i + 1];
    const t = near.t;
    const slopeLight = clamp((near.heightNorm - far.heightNorm) * 4 + 0.5, 0.25, 0.95);
    const warm = Math.round(86 + t * 72 + near.heightNorm * 22 + slopeLight * 14);
    const green = Math.round(42 + t * 40 + slopeLight * 6);
    const blue = Math.round(17 + t * 13);
    ctx.fillStyle = `rgb(${warm}, ${green}, ${blue})`;
    fillQuad(
      ctx,
      far.centerX - far.roadHalf,
      far.y,
      far.centerX + far.roadHalf,
      far.y,
      near.centerX + near.roadHalf,
      near.y,
      near.centerX - near.roadHalf,
      near.y
    );
  }

  const roadShade = ctx.createLinearGradient(0, height * 0.34, 0, height);
  roadShade.addColorStop(0, 'rgba(255, 230, 170, 0.04)');
  roadShade.addColorStop(0.52, 'rgba(0, 0, 0, 0)');
  roadShade.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
  ctx.fillStyle = roadShade;
  const first = samples[0];
  const last = samples[samples.length - 1];
  ctx.beginPath();
  ctx.moveTo(first.centerX - first.roadHalf, first.y);
  samples.forEach((sample) => ctx.lineTo(sample.centerX - sample.roadHalf, sample.y));
  [...samples].reverse().forEach((sample) => ctx.lineTo(sample.centerX + sample.roadHalf, sample.y));
  ctx.closePath();
  ctx.fill();

  const roadTexture =
    roadTextureImage ??
    getProceduralTexture(
      'road-dust-80',
      80,
      '#8b4b20',
      'rgba(195, 124, 56, 0.82)',
      'rgba(41, 15, 5, 0.9)'
    );
  if (roadTexture) {
    const pattern = ctx.createPattern(roadTexture, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = roadTextureImage ? 0.44 : 0.28;
      ctx.globalCompositeOperation = 'multiply';
      const textureScroll = Math.round((last.dayIndex % 64) * 2);
      ctx.translate(0, -textureScroll);
      ctx.fillStyle = pattern;
      ctx.beginPath();
      ctx.moveTo(first.centerX - first.roadHalf, first.y + textureScroll);
      samples.forEach((sample) => ctx.lineTo(sample.centerX - sample.roadHalf, sample.y + textureScroll));
      [...samples]
        .reverse()
        .forEach((sample) => ctx.lineTo(sample.centerX + sample.roadHalf, sample.y + textureScroll));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const centerGlow = ctx.createLinearGradient(0, height * 0.32, 0, height);
  centerGlow.addColorStop(0, 'rgba(255, 219, 137, 0)');
  centerGlow.addColorStop(0.52, 'rgba(255, 197, 95, 0.08)');
  centerGlow.addColorStop(1, 'rgba(255, 178, 72, 0.14)');
  ctx.fillStyle = centerGlow;
  ctx.beginPath();
  samples.forEach((sample, idx) => {
    const x = sample.centerX - sample.roadHalf * 0.18;
    if (idx === 0) ctx.moveTo(x, sample.y);
    else ctx.lineTo(x, sample.y);
  });
  [...samples].reverse().forEach((sample) => ctx.lineTo(sample.centerX + sample.roadHalf * 0.2, sample.y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 3; i < samples.length; i += 3) {
    const sample = samples[i];
    ctx.strokeStyle = `rgba(33, 12, 4, ${0.06 + sample.t * 0.16})`;
    ctx.lineWidth = lerp(0.55, 2.2, sample.t);
    ctx.beginPath();
    ctx.moveTo(sample.centerX - sample.roadHalf * 0.94, sample.y);
    ctx.quadraticCurveTo(sample.centerX, sample.y + lerp(1, 8, sample.t), sample.centerX + sample.roadHalf * 0.94, sample.y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 26; i += 1) {
    const sample = samples[Math.min(samples.length - 1, Math.floor((i / 25) * (samples.length - 1)))];
    const edge = i % 2 === 0 ? -1 : 1;
    ctx.strokeStyle = `rgba(38, 14, 4, ${0.04 + sample.t * 0.08})`;
    ctx.lineWidth = 0.8 + sample.t * 2.1;
    ctx.beginPath();
    ctx.moveTo(sample.centerX + edge * sample.roadHalf * 0.68, sample.y - 3);
    ctx.lineTo(sample.centerX - edge * sample.roadHalf * 0.18, sample.y + 24 + sample.t * 26);
    ctx.stroke();
  }
  ctx.restore();

  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = '#211006';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  samples.forEach((sample, idx) => {
    const x = sample.centerX - sample.roadHalf;
    if (idx === 0) ctx.moveTo(x, sample.y);
    else ctx.lineTo(x, sample.y);
  });
  ctx.stroke();
  ctx.beginPath();
  samples.forEach((sample, idx) => {
    const x = sample.centerX + sample.roadHalf;
    if (idx === 0) ctx.moveTo(x, sample.y);
    else ctx.lineTo(x, sample.y);
  });
  ctx.stroke();
  ctx.globalAlpha = 0.36;
  ctx.strokeStyle = '#f0b66d';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  samples.forEach((sample, idx) => {
    const x = sample.centerX - sample.roadHalf * 0.985;
    if (idx === 0) ctx.moveTo(x, sample.y);
    else ctx.lineTo(x, sample.y);
  });
  ctx.stroke();
  ctx.beginPath();
  samples.forEach((sample, idx) => {
    const x = sample.centerX + sample.roadHalf * 0.985;
    if (idx === 0) ctx.moveTo(x, sample.y);
    else ctx.lineTo(x, sample.y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 128; i += 1) {
    const seed = i + Math.floor(last.dayIndex * 1.3) * 31;
    const depth = seededFraction(seed) ** 0.58;
    const sample = samples[Math.min(samples.length - 1, Math.floor(depth * (samples.length - 1)))];
    const side = seededFraction(seed + 4) * 2 - 1;
    const x = sample.centerX + side * sample.roadHalf * seededFraction(seed + 9) * 0.9;
    const y = sample.y + (seededFraction(seed + 16) - 0.5) * (5 + sample.t * 18);
    const size = lerp(0.35, 3.1, sample.t);
    ctx.fillStyle = `rgba(31, 12, 4, ${0.08 + seededFraction(seed + 20) * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 2.2, size * 0.62, seededFraction(seed + 29) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

const drawSole = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angle: number,
  color: string,
  seed: number
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.bezierCurveTo(12, -27, 16, -17, 14, -8);
  ctx.bezierCurveTo(12, 3, 9, 9, 10, 20);
  ctx.bezierCurveTo(11, 30, 5, 36, 0, 36);
  ctx.bezierCurveTo(-5, 36, -11, 30, -10, 20);
  ctx.bezierCurveTo(-9, 9, -12, 3, -14, -8);
  ctx.bezierCurveTo(-16, -17, -12, -27, 0, -28);
  ctx.closePath();
  ctx.clip();

  for (let i = 0; i < 6; i += 1) {
    const treadX = -12 + i * 4.8;
    ctx.fillRect(treadX, -25, 3.4, 9 - Math.abs(i - 2.5));
  }

  for (let yy = -10; yy <= 10; yy += 9) {
    ctx.fillRect(-13, yy, 6, 3.4);
    ctx.fillRect(7, yy, 6, 3.4);
  }

  for (let yy = -12; yy <= 7; yy += 8) {
    ctx.beginPath();
    ctx.moveTo(-6, yy);
    ctx.lineTo(0, yy + 4.8);
    ctx.lineTo(6, yy);
    ctx.lineTo(4.4, yy + 4.8);
    ctx.lineTo(0, yy + 7.8);
    ctx.lineTo(-4.4, yy + 4.8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillRect(-11, 18, 22, 5);
  ctx.fillRect(-9, 29, 18, 4.2);

  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i += 1) {
    const sx = -12 + seededFraction(seed + i * 3) * 24;
    const sy = -27 + seededFraction(seed + i * 5) * 60;
    ctx.globalAlpha = 0.2 + seededFraction(seed + i * 7) * 0.32;
    ctx.fillRect(sx, sy, 1 + seededFraction(seed + i * 11) * 5, 0.8 + seededFraction(seed + i * 13) * 2);
  }

  ctx.restore();
};

const drawFootprintPair = (
  ctx: CanvasRenderingContext2D,
  point: ProjectedPoint,
  seed: number,
  alpha: number,
  color: string
) => {
  const scale = point.scale * 1.02;
  const footGap = 12 * scale;
  const stepOffset = 12 * scale;
  const forwardX = Math.sin(point.heading);
  const forwardY = -Math.cos(point.heading);
  const rightX = Math.cos(point.heading);
  const rightY = Math.sin(point.heading);

  ctx.save();
  ctx.globalAlpha = clamp(alpha * point.alpha, 0, 0.92);
  ctx.globalCompositeOperation = 'multiply';
  drawSole(
    ctx,
    point.x - rightX * footGap - forwardX * stepOffset,
    point.y - rightY * footGap - forwardY * stepOffset,
    scale,
    point.heading,
    color,
    seed + 1
  );
  drawSole(
    ctx,
    point.x + rightX * footGap + forwardX * stepOffset,
    point.y + rightY * footGap + forwardY * stepOffset,
    scale,
    point.heading,
    color,
    seed + 2
  );
  ctx.restore();
};

const drawEventMarkers = (
  ctx: CanvasRenderingContext2D,
  markers: EventMarker2D[],
  currentIndex: number,
  width: number,
  height: number,
  lateral: number,
  points: MountainPoint[],
  maxHeight: number
) => {
  ctx.save();
  markers.forEach((marker) => {
    const point = projectDay(marker.index, 0, currentIndex, width, height, points, maxHeight);
    if (!point) return;
    const radius = clamp(point.scale * 3.1, 1.2, 5.4);
    ctx.globalAlpha = point.alpha * 0.65;
    const glow = ctx.createRadialGradient(point.x, point.y - radius * 2, 0, point.x, point.y - radius * 2, radius * 5);
    glow.addColorStop(0, 'rgba(246, 178, 72, 0.72)');
    glow.addColorStop(1, 'rgba(246, 178, 72, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y - radius * 2, radius * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3aa45';
    ctx.beginPath();
    ctx.arc(point.x, point.y - radius * 2, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
};

const drawMemoryTrail = (
  ctx: CanvasRenderingContext2D,
  currentIndex: number,
  width: number,
  height: number,
  lateral: number,
  points: MountainPoint[],
  maxHeight: number
) => {
  ctx.save();
  for (let i = 0; i < 14; i += 1) {
    const trailIndex = currentIndex - 4 - i * 4.8;
    const printLateral = lateral * 0.28 + Math.sin((currentIndex - i * 8) * 0.06) * 0.16;
    const point = projectDay(trailIndex, printLateral, currentIndex, width, height, points, maxHeight);
    if (!point) continue;
    const alpha = clamp(0.7 - i * 0.042, 0.17, 0.7);
    drawFootprintPair(ctx, point, 700 + i * 31 + Math.round(currentIndex), alpha, BLOOD_COLORS[i % BLOOD_COLORS.length]);
  }
  ctx.restore();
};

const drawAtmosphere = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const fog = ctx.createLinearGradient(0, height * 0.08, 0, height);
  fog.addColorStop(0, 'rgba(4, 14, 14, 0.22)');
  fog.addColorStop(0.34, 'rgba(142, 92, 46, 0.05)');
  fog.addColorStop(0.72, 'rgba(117, 55, 20, 0.05)');
  fog.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.58, width * 0.18, width * 0.5, height * 0.56, width * 0.84);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.62, 'rgba(0, 0, 0, 0.08)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
};

export const Scene2D = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const sessionId = useOxygenStore((state) => state.sessionId);
  const currentRoomId = getPresenceRoomId(currentDateIndex);
  const [remoteEntries, setRemoteEntries] = useState<PresenceRoomEntry[]>([]);

  const dataRef = useRef<ProcessedCovidData[]>(data);
  const mountainPointsRef = useRef<MountainPoint[]>(mountainPoints);
  const eventMarkersRef = useRef<EventMarker2D[]>([]);
  const remoteEntriesRef = useRef<PresenceRoomEntry[]>(remoteEntries);
  const sessionIdRef = useRef<string | null>(sessionId);
  const maxMountainHeightRef = useRef(1);
  const currentIndexRef = useRef(currentDateIndex);
  const targetIndexRef = useRef(currentDateIndex);
  const lateralRef = useRef(0);
  const targetLateralRef = useRef(0);
  const localFootprintsRef = useRef<Footprint2D[]>([]);
  const keyStateRef = useRef<KeyState>({ ...DEFAULT_KEYS });
  const syncTimerRef = useRef(0);
  const roadTextureRef = useRef<CanvasImageSource | null>(cachedRoadTextureImage);

  const eventMarkers = useMemo<EventMarker2D[]>(() => {
    if (!data.length) return [];
    const indexByDate = new Map(data.map((item, index) => [dateKey(item.date), index]));
    return covidEvents
      .map((event) => indexByDate.get(event.date))
      .filter((index): index is number => typeof index === 'number')
      .map((index) => ({ index }));
  }, [data]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    mountainPointsRef.current = mountainPoints;
    maxMountainHeightRef.current = Math.max(1, ...mountainPoints.map((point) => point.y));
  }, [mountainPoints]);

  useEffect(() => {
    eventMarkersRef.current = eventMarkers;
  }, [eventMarkers]);

  useEffect(() => {
    remoteEntriesRef.current = remoteEntries;
  }, [remoteEntries]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (Math.abs(currentDateIndex - targetIndexRef.current) > 2) {
      currentIndexRef.current = currentDateIndex;
      targetIndexRef.current = currentDateIndex;
      localFootprintsRef.current = [];
    }
  }, [currentDateIndex]);

  useEffect(() => {
    let cancelled = false;
    void loadRoadTextureImage().then((image) => {
      if (!cancelled && image) roadTextureRef.current = image;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const roomIds = getPresenceRoomIdsForDay(currentRoomId * 14);
    return listenToPresenceRooms(roomIds, (entries) => {
      const ownSession = sessionIdRef.current;
      setRemoteEntries(entries.filter((entry) => entry.sessionId !== ownSession).slice(0, MAX_REMOTE_MARKERS));
    });
  }, [currentRoomId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') keyStateRef.current.forward = true;
      if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') keyStateRef.current.backward = true;
      if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') keyStateRef.current.left = true;
      if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') keyStateRef.current.right = true;
      if (event.key === 'Shift') keyStateRef.current.run = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') keyStateRef.current.forward = false;
      if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') keyStateRef.current.backward = false;
      if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') keyStateRef.current.left = false;
      if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') keyStateRef.current.right = false;
      if (event.key === 'Shift') keyStateRef.current.run = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let activePointer: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      activePointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      const maxIndex = Math.max(0, dataRef.current.length - 1);
      targetIndexRef.current = clamp(targetIndexRef.current - dy * 0.16, 0, maxIndex);
      targetLateralRef.current = clamp(targetLateralRef.current + dx * 0.006, -1, 1);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      activePointer = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return undefined;

    let animationFrame = 0;
    let lastTime = performance.now();
    let lastPaint = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frameMs = reducedMotion ? 100 : 48;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(rect.width));
      const nextHeight = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    };

    const addLocalFootprint = (index: number, lateral: number, now: number) => {
      const trail = localFootprintsRef.current;
      const last = trail[trail.length - 1];
      if (!last || Math.abs(index - last.index) >= 2.2 || Math.abs(lateral - last.lateral) > 0.2) {
        localFootprintsRef.current = [...trail, { index, lateral, createdAt: now }].slice(-MAX_LOCAL_FOOTPRINTS);
      }
    };

    const paint = (now: number) => {
      resize();
      const width = canvas.width;
      const height = canvas.height;
      const currentIndex = currentIndexRef.current;
      const lateral = lateralRef.current;
      const points = mountainPointsRef.current;
      const maxHeight = maxMountainHeightRef.current;
      const remote = remoteEntriesRef.current;
      const samples = createDepthSamples(width, height, currentIndex, lateral, points, maxHeight);

      context.clearRect(0, 0, width, height);
      drawBackground(context, width, height);
      drawDistantRidges(context, width, height, points, currentIndex, maxHeight);
      drawTerrainMesh(context, width, height, samples);
      drawRoadMesh(context, width, height, samples, roadTextureRef.current);
      drawEventMarkers(context, eventMarkersRef.current, currentIndex, width, height, lateral, points, maxHeight);
      drawMemoryTrail(context, currentIndex, width, height, lateral, points, maxHeight);

      localFootprintsRef.current.forEach((footprint, idx) => {
        const point = projectDay(footprint.index, footprint.lateral, currentIndex, width, height, points, maxHeight);
        if (!point) return;
        const age = (now - footprint.createdAt) / 1000;
        const recency = (idx + 1) / Math.max(localFootprintsRef.current.length, 1);
        const alpha = clamp(0.18 + recency * 0.72, 0.2, 0.92) * clamp(1 - age / 180, 0.36, 1);
        drawFootprintPair(context, point, idx * 41 + Math.round(footprint.index), alpha, BLOOD_COLORS[idx % BLOOD_COLORS.length]);
      });

      remote.forEach((entry, idx) => {
        const remoteLateral = clamp((entry.position.z ?? 0) / 5.2, -1, 1);
        const point = projectDay(entry.dayIndex, remoteLateral, currentIndex, width, height, points, maxHeight);
        if (!point) return;
        const freshness = clamp(1 - (Date.now() - entry.lastSeenAt) / 60_000, 0, 1);
        drawFootprintPair(context, point, idx * 97 + Math.round(entry.dayIndex), 0.34 + freshness * 0.4, BLOOD_COLORS[(idx + 1) % BLOOD_COLORS.length]);
      });

      drawAtmosphere(context, width, height);
    };

    const tick = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      const state = useCovidStore.getState();
      const maxIndex = Math.max(0, dataRef.current.length - 1);
      const joystickForward = clamp(-(state.mobileMoveInput[1] ?? 0), -1, 1);
      const joystickStrafe = clamp(state.mobileMoveInput[0] ?? 0, -1, 1);
      const keys = keyStateRef.current;
      const keyboardForward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0);
      const keyboardStrafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const forward = clamp(keyboardForward + joystickForward, -1, 1);
      const strafe = clamp(keyboardStrafe + joystickStrafe, -1, 1);
      const speed = keys.run || Math.abs(joystickForward) > 0.92 ? 42 : 26;

      targetIndexRef.current = clamp(targetIndexRef.current + forward * speed * delta, 0, maxIndex);
      targetLateralRef.current = clamp(targetLateralRef.current + strafe * 1.9 * delta, -1, 1);
      currentIndexRef.current = damp(currentIndexRef.current, targetIndexRef.current, 9, delta);
      lateralRef.current = damp(lateralRef.current, targetLateralRef.current, 8, delta);

      if (Math.abs(forward) > 0.025 || Math.abs(strafe) > 0.025) {
        addLocalFootprint(currentIndexRef.current, lateralRef.current, now);
      }

      syncTimerRef.current += delta;
      if (syncTimerRef.current >= 0.16) {
        syncTimerRef.current = 0;
        const committedIndex = clamp(Math.round(currentIndexRef.current), 0, maxIndex);
        const position = createCameraPosition(currentIndexRef.current, lateralRef.current, mountainPointsRef.current);
        const target: [number, number, number] = [position[0] + 0.7, position[1], position[2]];
        state.setCameraPosition(position);
        state.setCameraTarget(target);
        if (committedIndex !== state.currentDateIndex) state.setCurrentDateIndex(committedIndex);
        const point = mountainPointsRef.current[committedIndex];
        if (point) state.setRevealedX(point.x);
      }

      if (now - lastPaint >= frameMs) {
        lastPaint = now;
        paint(now);
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#120805]" data-renderer="2d">
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
};

export default Scene2D;
