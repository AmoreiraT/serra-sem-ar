import { EnvironmentBand } from '../types/environment';

export const ENVIRONMENT_RENDER_ORDER: Record<EnvironmentBand, number> = {
  FAR: -13,
  MID: -12,
  GROUND: -11,
};

export const LAYER_COUNTS: Record<EnvironmentBand, number> = {
  FAR: 8,
  MID: 14,
  GROUND: 10,
};

export const LAYER_OPACITY_RANGE: Record<EnvironmentBand, readonly [number, number]> = {
  FAR: [0.08, 0.12],
  MID: [0.1, 0.2],
  GROUND: [0.08, 0.18],
};

export const LAYER_SCALE_MULTIPLIER: Record<EnvironmentBand, number> = {
  FAR: 1.75,
  MID: 1.1,
  GROUND: 0.6,
};

export const DESATURATION_BY_BAND: Record<EnvironmentBand, number> = {
  FAR: 0.82,
  MID: 0.74,
  GROUND: 0.7,
};

export const CONTRAST_BY_BAND: Record<EnvironmentBand, number> = {
  FAR: 0.78,
  MID: 0.82,
  GROUND: 0.88,
};

export const BRIGHTNESS_BY_BAND: Record<EnvironmentBand, number> = {
  FAR: 0.9,
  MID: 0.92,
  GROUND: 0.94,
};

export const VIDEO_PLANES_MAX = 3;
export const IMAGE_PLANES_MAX = 40;
