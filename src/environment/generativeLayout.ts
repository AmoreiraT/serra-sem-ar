import { SpatialLayoutItem } from '../types/environment';

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const generateSpatialLayout = (
  seed: number,
  count: number,
  mountainRadius: number,
  outerRadius: number
): ReadonlyArray<{
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
  readonly opacity: number;
}> => {
  const rng = mulberry32(seed);
  const minRadius = Math.max(1, mountainRadius * 1.2);
  const maxRadius = Math.max(minRadius + 1, outerRadius);

  const items: SpatialLayoutItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radialBias = Math.pow(rng(), 0.32);
    const radius = minRadius + (maxRadius - minRadius) * radialBias;

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = clamp(-5 + rng() * 30, -5, 25);

    const rotationY = angle + (rng() - 0.5) * 0.6;
    const scale = 16 + rng() * 56;
    const opacity = clamp(0.08 + rng() * 0.14, 0.08, 0.22);

    items.push({
      position: [x, y, z],
      rotation: [0, rotationY, 0],
      scale,
      opacity,
    });
  }

  return items;
};
