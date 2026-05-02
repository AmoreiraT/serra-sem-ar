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
  FAR: [0.68, 0.82],
  MID: [0.72, 0.9],
  GROUND: [0.7, 0.88],
};

export const LAYER_SCALE_MULTIPLIER: Record<EnvironmentBand, number> = {
  FAR: 1.15,
  MID: 0.82,
  GROUND: 0.58,
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
  FAR: 1.08,
  MID: 1.1,
  GROUND: 1.06,
};

export const VIDEO_PLANES_MAX = 3;
export const IMAGE_PLANES_MAX = 40;
